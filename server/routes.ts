import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  db,
  asc,
  or,
  gte,
  lte,
  ne,
  inArray,
  isNotNull,
  sql,
} from "./lib/db";
import { syncDraftFromFinal } from "./lib/roster";
import { and, eq, isNull } from "drizzle-orm";
import {
  insertEmployeeSchema,
  insertRosterShiftSchema,
  insertAbsenceSchema,
  insertPlannedAbsenceSchema,
  insertResourceSchema,
  insertWeeklyAssignmentSchema,
  insertProjectInitiativeSchema,
  insertProjectTaskSchema,
  insertProjectDocumentSchema,
  insertApprovalSchema,
  insertTaskActivitySchema,
  insertLongTermShiftWishSchema,
  insertLongTermAbsenceSchema,
  plannedAbsences,
  absences,
  departments,
  employees,
  shiftSwapRequests,
  sessions,
  serviceLines,
  dutyPlans,
  rosterShifts as rosterShiftsTable,
  rooms,
  weeklyPlans,
  weeklyPlanAssignments,
  weeklyAssignments,
  dailyOverrides,
  type RosterShift,
  type DutyPlan,
  type ServiceLine,
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  generateRosterPlan,
  buildRosterPromptPayload,
  REQUIRED_SERVICE_GAP_REASON,
} from "./services/rosterGenerator";
import { registerModularApiRoutes } from "./api";
import { employeeDoesShifts, OVERDUTY_KEY } from "@shared/shiftTypes";
import { getEffectiveServiceLineKeys } from "@shared/serviceLineAccess";
import {
  buildNormalizedServiceLineKeySet,
  normalizeServiceLineKey,
} from "@shared/serviceLineKey";
import { requireAuth, hasCapability } from "./api/middleware/auth";
import {
  addDays,
  addWeeks,
  format,
  getWeek,
  getWeekYear,
  parseISO,
  startOfWeek,
  subDays,
} from "date-fns";
import {
  type AbsenceCategory,
  mapAbsenceCategory,
  ABSENCE_CATEGORY_ORDER,
} from "./lib/absence-categories";

const rosterShifts = rosterShiftsTable;
const ALLOWED_CLAIM_STATUSES = new Set<DutyPlan["status"]>([
  "Vorläufig",
  "Freigegeben",
]);
const ALLOWED_UNASSIGNED_STATUSES = new Set<DutyPlan["status"]>([
  "Vorläufig",
  "Freigegeben",
]);

const padTwo = (value: number) => String(value).padStart(2, "0");

type OpenShiftSlotSource = "final" | "draft";

type OpenShiftSlot = {
  id: number | null;
  syntheticId?: string;
  date: string;
  serviceType: string;
  slotIndex?: number;
  isSynthetic: boolean;
  source: OpenShiftSlotSource;
  label?: string | null;
  isDraft?: boolean;
};

type OpenShiftPayload = {
  slots: OpenShiftSlot[];
  requiredDaily: Record<string, number>;
  countsByDay: Record<string, Record<string, number>>;
  missingCounts: Record<string, number>;
};

type ServiceLineFlagLookup = {
  rawKeys: Set<string>;
  normalizedKeys: Set<string>;
};

const buildServiceLineFlagLookup = (
  lines: ServiceLine[],
  flag: "allowsClaim" | "allowsSwap",
): ServiceLineFlagLookup => {
  const rawKeys = new Set(
    lines.filter((line) => line[flag]).map((line) => line.key),
  );
  return {
    rawKeys,
    normalizedKeys: buildNormalizedServiceLineKeySet(rawKeys),
  };
};

const getServiceLineKeysByFlag = (
  lines: ServiceLine[],
  flag: "allowsClaim" | "allowsSwap",
): Set<string> => buildServiceLineFlagLookup(lines, flag).rawKeys;

const filterKeysByFlag = (
  keys: Set<string>,
  lines: ServiceLine[],
  flag: "allowsClaim" | "allowsSwap",
): Set<string> => {
  const { normalizedKeys } = buildServiceLineFlagLookup(lines, flag);
  return new Set(
    [...keys].filter((key) =>
      normalizedKeys.has(normalizeServiceLineKey(key)),
    ),
  );
};

const parseBoolQueryFlag = (value?: string | string[]): boolean => {
  if (!value) return false;
  const normalized =
    Array.isArray(value) ? value[value.length - 1] : value?.toString();
  if (!normalized) return false;
  return ["1", "true", "yes"].includes(normalized.toLowerCase());
};

const buildOpenShiftPayload = async ({
  clinicId,
  startDate,
  endDate,
  includeDraft,
}: {
  clinicId: number;
  startDate: string;
  endDate: string;
  includeDraft?: boolean;
}): Promise<OpenShiftPayload> => {
  const parsedStart = parseISO(startDate);
  const parsedEnd = parseISO(endDate);
  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
    throw new Error("Invalid range");
  }
  let rangeStart = parsedStart;
  let rangeEnd = parsedEnd;
  if (rangeEnd < rangeStart) {
    rangeStart = parsedEnd;
    rangeEnd = parsedStart;
  }
  const monthStart = format(rangeStart, "yyyy-MM-dd");
  const monthEnd = format(rangeEnd, "yyyy-MM-dd");

  const serviceLineRows = await db
    .select()
    .from(serviceLines)
    .where(
      and(
        eq(serviceLines.clinicId, clinicId),
        eq(serviceLines.isActive, true),
      ),
    );

  const claimableServiceLines = serviceLineRows.filter(
    (line) => Boolean(line.allowsClaim) && typeof line.key === "string",
  );
  if (!claimableServiceLines.length) {
    return {
      slots: [],
      requiredDaily: {},
      countsByDay: {},
      missingCounts: {},
    };
  }

  const {
    rawKeys: claimableServiceLineKeys,
    normalizedKeys: claimableServiceLineNormalizedKeys,
  } = buildServiceLineFlagLookup(claimableServiceLines, "allowsClaim");

  const serviceLineLookup = new Map(
    claimableServiceLines.map((line) => [line.key, line]),
  );

  const requiredDailyMap = new Map<string, number>();
  for (const line of claimableServiceLines) {
    if (!line.key) continue;
    const rawValue =
      typeof line.requiredDaily === "number"
        ? line.requiredDaily
        : line.requiredDaily
          ? 1
          : 0;
    const normalized = Math.max(0, Number(rawValue) || 0);
    if (normalized > 0) {
      requiredDailyMap.set(line.key, normalized);
    }
  }

  const requiredKeys = Array.from(requiredDailyMap.keys());
  const countsByDay: Record<string, Record<string, number>> = {};
  if (requiredKeys.length) {
    let currentDate = rangeStart;
    while (currentDate <= rangeEnd) {
      const dateKey = format(currentDate, "yyyy-MM-dd");
      countsByDay[dateKey] = {};
      for (const serviceType of requiredKeys) {
        countsByDay[dateKey][serviceType] = 0;
      }
      currentDate = addDays(currentDate, 1);
    }
  }

  const slots: OpenShiftSlot[] = [];
  const conditions = [
    gte(rosterShifts.date, monthStart),
    lte(rosterShifts.date, monthEnd),
    inArray(rosterShifts.serviceType, Array.from(claimableServiceLineKeys)),
  ];
  conditions.push(eq(rosterShifts.isDraft, false));

  const finalRowCounts: Record<string, number> = {};
  const openSlotTracker: Record<string, number> = {};

  const shiftRows = await db
    .select({
      id: rosterShifts.id,
      date: rosterShifts.date,
      serviceType: rosterShifts.serviceType,
      employeeId: rosterShifts.employeeId,
      assigneeFreeText: rosterShifts.assigneeFreeText,
      isDraft: rosterShifts.isDraft,
    })
    .from(rosterShifts)
    .where(and(...conditions));

  for (const shift of shiftRows) {
    if (!shift.serviceType) continue;
    const normalizedKey = normalizeServiceLineKey(shift.serviceType);
    if (
      !claimableServiceLineKeys.has(shift.serviceType) &&
      !claimableServiceLineNormalizedKeys.has(normalizedKey)
    ) {
      continue;
    }

    const slotKey = `${shift.date}|${shift.serviceType}`;
    finalRowCounts[slotKey] = (finalRowCounts[slotKey] ?? 0) + 1;

    const dayEntry = countsByDay[shift.date];
    if (
      dayEntry &&
      shift.employeeId &&
      dayEntry[shift.serviceType] !== undefined
    ) {
      dayEntry[shift.serviceType] += 1;
    }

    const freeText = (shift.assigneeFreeText ?? "").trim();
    const isOpenFinal = !shift.employeeId && !freeText;
    if (isOpenFinal) {
      const limit = requiredDailyMap.get(shift.serviceType) ?? Infinity;
      if ((openSlotTracker[slotKey] ?? 0) >= limit) continue;
      openSlotTracker[slotKey] = (openSlotTracker[slotKey] ?? 0) + 1;
      slots.push({
        id: shift.id,
        date: shift.date,
        serviceType: shift.serviceType,
        isSynthetic: false,
        source: "final",
        label: serviceLineLookup.get(shift.serviceType)?.label ?? null,
        isDraft: false,
      });
    }
  }

  const missingCounts: Record<string, number> = {};
  const syntheticSlots: OpenShiftSlot[] = [];
  if (requiredKeys.length) {
    let currentDate = rangeStart;
    while (currentDate <= rangeEnd) {
      const date = format(currentDate, "yyyy-MM-dd");
      for (const serviceType of requiredKeys) {
        const dayCount = countsByDay[date]?.[serviceType] ?? 0;
        const required = requiredDailyMap.get(serviceType) ?? 0;
        const missing = Math.max(0, required - dayCount);
        if (missing <= 0) continue;
        const slotKey = `${date}|${serviceType}`;
        const finalCount = finalRowCounts[slotKey] ?? 0;
        if (finalCount >= required) continue;
        missingCounts[serviceType] =
          (missingCounts[serviceType] ?? 0) + missing;
        for (let slotIndex = 1; slotIndex <= missing; slotIndex += 1) {
          syntheticSlots.push({
            id: null,
            syntheticId: `${date}:${serviceType}:slot${slotIndex}`,
            date,
            serviceType,
            slotIndex,
            isSynthetic: true,
            source: "final",
            label: serviceLineLookup.get(serviceType)?.label ?? null,
            isDraft: false,
          });
        }
      }
      currentDate = addDays(currentDate, 1);
    }
  }

  const requiredDailyRecord: Record<string, number> = {};
  requiredDailyMap.forEach((value, key) => {
    requiredDailyRecord[key] = value;
  });

  const sortedSlots = [...slots, ...syntheticSlots].sort((a, b) => {
    const keyA = `${a.date}|${a.serviceType}|${
      a.isSynthetic ? `syn-${a.slotIndex ?? 0}` : `db-${a.id ?? ""}`
    }`;
    const keyB = `${b.date}|${b.serviceType}|${
      b.isSynthetic ? `syn-${b.slotIndex ?? 0}` : `db-${b.id ?? ""}`
    }`;
    return keyA.localeCompare(keyB);
  });

  return {
    slots: sortedSlots,
    requiredDaily: requiredDailyRecord,
    countsByDay,
    missingCounts,
  };
};


async function ensureRequiredDailyShifts({
  clinicId,
  year,
  month,
  isDraftFlag,
}: {
  clinicId: number | null | undefined;
  year: number;
  month: number;
  isDraftFlag: boolean;
}): Promise<number> {
  if (!clinicId) return 0;

  const lastDay = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${padTwo(month)}-01`;
  const monthEnd = `${year}-${padTwo(month)}-${padTwo(lastDay)}`;

  const requiredLines = await db
    .select({ key: serviceLines.key })
    .from(serviceLines)
    .where(
      and(
        eq(serviceLines.clinicId, clinicId),
        eq(serviceLines.requiredDaily, true),
        eq(serviceLines.isActive, true),
      ),
    );

  if (!requiredLines.length) return 0;

  const requiredKeys = requiredLines.map((line) => line.key);
  const existingRows = await db
    .select({
      date: rosterShifts.date,
      serviceType: rosterShifts.serviceType,
    })
    .from(rosterShifts)
    .where(
      and(
        gte(rosterShifts.date, monthStart),
        lte(rosterShifts.date, monthEnd),
        eq(rosterShifts.isDraft, isDraftFlag),
        inArray(rosterShifts.serviceType, requiredKeys),
      ),
    );

  const existingSet = new Set(
    existingRows.map((row) => `${row.date}|${row.serviceType}`),
  );

  const toInsert: Array<{
    date: string;
    serviceType: string;
    employeeId: null;
    isDraft: boolean;
  }> = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const currentDate = `${year}-${padTwo(month)}-${padTwo(day)}`;
    for (const key of requiredKeys) {
      const combination = `${currentDate}|${key}`;
      if (existingSet.has(combination)) continue;
      existingSet.add(combination);
      toInsert.push({
        date: currentDate,
        serviceType: key,
        employeeId: null,
        isDraft: isDraftFlag,
      });
    }
  }

  if (!toInsert.length) return 0;

  await db.insert(rosterShifts).values(toInsert);
  return toInsert.length;
}

const resolveClinicIdFromUser = async (
  user?: Request["user"] | null,
): Promise<number | null> => {
  if (user?.clinicId) {
    return user.clinicId;
  }
  if (user?.departmentId) {
    const [departmentRow] = await db
      .select({ clinicId: departments.clinicId })
      .from(departments)
      .where(eq(departments.id, user.departmentId))
      .limit(1);
    if (departmentRow?.clinicId) {
      return departmentRow.clinicId;
    }
  }
  return null;
};

type HmacAlg = "sha256" | "sha384" | "sha512";
const JWT_HS_TO_HMAC: Record<"HS256" | "HS384" | "HS512", HmacAlg> = {
  HS256: "sha256",
  HS384: "sha384",
  HS512: "sha512",
};

const verifyJwtIgnoreExpiration = (
  token: string,
  secret: string,
): Record<string, unknown> => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Ungültiges Token-Format");
  }

  const algHeader = Buffer.from(parts[0], "base64url").toString("utf-8");
  let alg: string;
  try {
    const parsed = JSON.parse(algHeader);
    alg = typeof parsed.alg === "string" ? parsed.alg : "HS256";
  } catch (error) {
    throw new Error("Ungültiger Token-Header");
  }

  const digest = JWT_HS_TO_HMAC[alg as keyof typeof JWT_HS_TO_HMAC];
  if (!digest) {
    throw new Error("Nicht unterstützter Token-Algorithmus");
  }

  const payloadSegment = parts[1];
  const expectedSignature = crypto
    .createHmac(digest, secret)
    .update(`${parts[0]}.${payloadSegment}`)
    .digest("base64url");

  if (parts[2] !== expectedSignature) {
    throw new Error("Ungültige Token-Signatur");
  }

  const payloadJson = Buffer.from(payloadSegment, "base64url").toString("utf-8");
  return JSON.parse(payloadJson) as Record<string, unknown>;
};

const resolveQueryToken = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        return item;
      }
    }
  }
  return undefined;
};

const getAuthTokenFromRequest = (req: Request): string | null => {
  const queryToken = resolveQueryToken(req.query.token);
  const authHeader =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : undefined;
  const headerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

  return queryToken ?? headerToken ?? null;
};

const getCalendarTokenFromRequest = (req: Request): string | null => {
  const calendarToken = resolveQueryToken(req.query.calendarToken);
  if (calendarToken) {
    return calendarToken;
  }
  return getAuthTokenFromRequest(req);
};

const ensureCalendarTokenForEmployee = async (
  employeeId: number,
  regenerate = false,
): Promise<string> => {
  if (!regenerate) {
    const existing = await storage.getCalendarTokenByEmployee(employeeId);
    if (existing) {
      await storage.touchCalendarToken(existing.token);
      return existing.token;
    }
  }
  const token = crypto.randomBytes(32).toString("hex");
  await storage.upsertCalendarTokenForEmployee(employeeId, token);
  return token;
};

const isMissingCalendarTokensTableError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const maybeErr = error as { code?: string; message?: string };
  if (maybeErr.code === "42P01") return true;
  return maybeErr.message?.toLowerCase().includes("calendar_tokens") ?? false;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value: string) =>
  EMAIL_REGEX.test(value) && !/[^\x00-\x7F]/.test(value);
const DEFAULT_LAST_APPROVED = { year: 2026, month: 1 };
const DEFAULT_SERVICE_LINES = [
  {
    key: "kreiszimmer",
    label: "Kreißzimmer (Ass.)",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 1,
    isActive: true,
  },
  {
    key: "gyn",
    label: "Gynäkologie (OA)",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 2,
    isActive: true,
  },
  {
    key: "turnus",
    label: "Turnus (Ass./TA)",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 3,
    isActive: true,
  },
  {
    key: OVERDUTY_KEY,
    label: "Überdienst",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 4,
    isActive: true,
  },
];

type ServiceLineInfo = {
  key: string;
  label: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  sortOrder: number;
  isActive: boolean;
};

const normalizeTime = (value: unknown, fallback: string): string => {
  if (!value) return fallback;
  if (value instanceof Date) {
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  if (typeof value === "string") {
    const [hours, minutes] = value.split(":");
    if (hours && minutes) {
      return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
    }
  }
  return fallback;
};

const buildDateTime = (date: string, time: string): Date => {
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  const dateTime = new Date(`${date}T00:00:00`);
  dateTime.setHours(
    Number.isNaN(hours) ? 0 : hours,
    Number.isNaN(minutes) ? 0 : minutes,
    0,
    0,
  );
  return dateTime;
};

const toIcsDateTimeLocal = (date: Date) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}00`;
};

const escapeIcs = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

const formatIcsDateOnly = (date: Date) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const buildDisplayName = (
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null,
) => {
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  if (fallback) return fallback;
  return "Unbekannt";
};

const normalizeWorkplaceTitle = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const parts = trimmed
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const toLower = (input: string) => input.toLowerCase();

  if (parts.length === 3 && toLower(parts[0]) === toLower(parts[1])) {
    return `${parts[0]} | ${parts[2]}`;
  }

  if (parts.length === 2) {
    if (toLower(parts[0]) === toLower(parts[1])) {
      return parts[0];
    }
    if (toLower(parts[1]).startsWith(toLower(parts[0]))) {
      return parts[1];
    }
  }

  return trimmed;
};

const loadServiceLines = async (
  clinicId: number,
): Promise<ServiceLineInfo[]> => {
  const rows = await db
    .select()
    .from(serviceLines)
    .where(eq(serviceLines.clinicId, clinicId))
    .orderBy(asc(serviceLines.sortOrder), asc(serviceLines.label));

  if (!rows.length) {
    return DEFAULT_SERVICE_LINES;
  }

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    startTime: normalizeTime(row.startTime, "07:30"),
    endTime: normalizeTime(row.endTime, "08:00"),
    endsNextDay: Boolean(row.endsNextDay),
    sortOrder: row.sortOrder ?? 0,
    isActive: row.isActive !== false,
  }));
};

const compareYearMonth = (
  yearA: number,
  monthA: number,
  yearB: number,
  monthB: number,
) => {
  if (yearA === yearB && monthA === monthB) return 0;
  if (yearA > yearB || (yearA === yearB && monthA > monthB)) return 1;
  return -1;
};

const addMonth = (year: number, month: number, delta = 1) => {
  let nextYear = year;
  let nextMonth = month + delta;
  while (nextMonth > 12) {
    nextMonth -= 12;
    nextYear += 1;
  }
  while (nextMonth < 1) {
    nextMonth += 12;
    nextYear -= 1;
  }
  return { year: nextYear, month: nextMonth };
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value: string) => new Date(`${value}T00:00:00`);

const toDateOnly = (value: string | null | undefined) => {
  if (!value) return null;
  const date = toDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const makeMonthStart = (year: number, month: number) => {
  const date = new Date(year, month - 1, 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const makeMonthEnd = (year: number, month: number) => {
  const lastDay = new Date(year, month, 0);
  lastDay.setHours(0, 0, 0, 0);
  return lastDay;
};

const monthRange = (year: number, month: number) => {
  const start = new Date(year, month - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month, 0);
  end.setHours(0, 0, 0, 0);
  return { start, end };
};

const overlaps = (
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date,
) => {
  const start = aStart ?? new Date("1970-01-01");
  const end = aEnd ?? new Date("2999-12-31");
  return start.getTime() <= bEnd.getTime() && end.getTime() >= bStart.getTime();
};

const isEligibleForWishMonth = (
  emp: {
    employmentFrom?: string | null;
    employmentUntil?: string | null;
    inactiveFrom?: string | null;
    inactiveUntil?: string | null;
  },
  year: number,
  month: number,
) => {
  const { start, end } = monthRange(year, month);

  const employmentFrom = toDateOnly(emp.employmentFrom);
  const employmentUntil = toDateOnly(emp.employmentUntil);
  if (!overlaps(employmentFrom, employmentUntil, start, end)) {
    return false;
  }

  const inactiveFrom = toDateOnly(emp.inactiveFrom);
  const inactiveUntil = toDateOnly(emp.inactiveUntil);
  if (inactiveFrom || inactiveUntil) {
    if (overlaps(inactiveFrom, inactiveUntil, start, end)) {
      return false;
    }
  }

  return true;
};

const overlapsMonth = (
  employee: { employmentFrom?: string | null; employmentUntil?: string | null },
  monthStart: Date,
  monthEnd: Date,
) => {
  const employmentFrom = toDateOnly(employee.employmentFrom ?? null);
  const employmentUntil = toDateOnly(employee.employmentUntil ?? null);
  const startOk = !employmentFrom || employmentFrom <= monthEnd;
  const endOk = !employmentUntil || employmentUntil >= monthStart;
  return startOk && endOk;
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDisplayName = (firstName?: string | null, lastName?: string | null) => {
  const parts = [firstName, lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.join(" ").trim();
};

const addDaysToIso = (iso: string, delta: number) => {
  const base = parseIsoDateUtc(iso);
  base.setUTCDate(base.getUTCDate() + delta);
  return formatDateUtc(base);
};

const parseIsoDateParam = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
};

const countInclusiveDays = (start: Date, end: Date) => {
  const diff = Math.floor((end.getTime() - start.getTime()) / DAY_MS);
  return diff + 1;
};

const buildWeeklyPlanWorkplaceLabel = (assignment: {
  roomName?: string | null;
  roleLabel?: string | null;
}) => {
  const room = assignment.roomName?.trim();
  const label = assignment.roleLabel?.trim();
  const candidate = room || label || "";
  if (!candidate) return null;
  if (candidate.toLowerCase() === "diensthabende") return null;
  return candidate;
};

const VIENNA_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Vienna",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const WEEK_OPTIONS = {
  weekStartsOn: 1 as const,
  firstWeekContainsDate: 4 as const,
};
const DASHBOARD_PREVIEW_DAYS = 7;

const parseIsoDateUtc = (value: string) => {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateUtc = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildPreviewDateRange = (startIso: string, days: number) => {
  const base = parseIsoDateUtc(startIso);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(base);
    day.setUTCDate(day.getUTCDate() + index);
    return formatDateUtc(day);
  });
};

const DEFAULT_SERVICE_LINE_LABELS = new Map(
  DEFAULT_SERVICE_LINES.map((line) => [line.key, line.label]),
);

const loadServiceLineLabels = async (
  clinicId?: number,
): Promise<Map<string, string>> => {
  const labelMap = new Map(DEFAULT_SERVICE_LINE_LABELS);
  if (!clinicId) {
    return labelMap;
  }
  const clinicLines = await db
    .select({
      key: serviceLines.key,
      label: serviceLines.label,
    })
    .from(serviceLines)
    .where(eq(serviceLines.clinicId, clinicId));

  clinicLines.forEach((line) => {
    if (line.key && line.label) {
      labelMap.set(line.key, line.label);
    }
  });

  return labelMap;
};

const splitRangeByYear = (startDate: string, endDate: string) => {
  const start = toDate(startDate);
  const end = toDate(endDate);
  const ranges: Array<{ year: number; start: Date; end: Date; days: number }> =
    [];
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const rangeStart = start > yearStart ? start : yearStart;
    const rangeEnd = end < yearEnd ? end : yearEnd;
    if (rangeStart <= rangeEnd) {
      ranges.push({
        year,
        start: rangeStart,
        end: rangeEnd,
        days: countInclusiveDays(rangeStart, rangeEnd),
      });
    }
  }

  return ranges;
};

const countPlannedVacationDaysForYear = async (
  employeeId: number,
  year: number,
  excludeAbsenceId?: number,
) => {
  const yearStart = formatDate(new Date(year, 0, 1));
  const yearEnd = formatDate(new Date(year, 11, 31));
  const conditions = [
    eq(plannedAbsences.employeeId, employeeId),
    eq(plannedAbsences.reason, "Urlaub"),
    ne(plannedAbsences.status, "Abgelehnt"),
    lte(plannedAbsences.startDate, yearEnd),
    gte(plannedAbsences.endDate, yearStart),
  ];

  if (excludeAbsenceId) {
    conditions.push(ne(plannedAbsences.id, excludeAbsenceId));
  }

  const rows = await db
    .select({
      startDate: plannedAbsences.startDate,
      endDate: plannedAbsences.endDate,
    })
    .from(plannedAbsences)
    .where(and(...conditions));

  return rows.reduce((total, row) => {
    const rangeStart =
      toDate(String(row.startDate)) > toDate(yearStart)
        ? toDate(String(row.startDate))
        : toDate(yearStart);
    const rangeEnd =
      toDate(String(row.endDate)) < toDate(yearEnd)
        ? toDate(String(row.endDate))
        : toDate(yearEnd);
    if (rangeStart > rangeEnd) return total;
    return total + countInclusiveDays(rangeStart, rangeEnd);
  }, 0);
};

const ensurePlannedVacationEntitlement = async (
  employeeId: number,
  startDate: string,
  endDate: string,
  excludeAbsenceId?: number,
) => {
  const employee = await storage.getEmployee(employeeId);
  if (!employee) {
    return { ok: false, error: "Mitarbeiter nicht gefunden" };
  }

  const entitlement = employee.vacationEntitlement;
  if (entitlement === null || entitlement === undefined) {
    return { ok: true };
  }

  const ranges = splitRangeByYear(startDate, endDate);
  for (const range of ranges) {
    const usedDays = await countPlannedVacationDaysForYear(
      employeeId,
      range.year,
      excludeAbsenceId,
    );
    const totalDays = usedDays + range.days;
    if (totalDays > entitlement) {
      return {
        ok: false,
        error: `Urlaubsanspruch ${entitlement} Tage ueberschritten (bereits ${usedDays} Tage, beantragt ${range.days} Tage in ${range.year}).`,
      };
    }
  }

  return { ok: true };
};

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Register modular API routes (employees, competencies, rooms, duty-plans, etc.)
  registerModularApiRoutes(app);

  const canApproveLongTermWishes = async (req: Request): Promise<boolean> => {
    if (!req.user) return false;
    if (req.user.isAdmin || req.user.appRole === "Admin") return true;
    const approver = await storage.getEmployee(req.user.employeeId);
    return approver?.role === "Primararzt" || approver?.role === "1. Oberarzt";
  };

  const canViewPlanningData = (req: Request): boolean => {
    if (!req.user) return false;
    if (
      req.user.isAdmin ||
      req.user.appRole === "Admin" ||
      req.user.appRole === "Editor"
    )
      return true;
    return req.user.capabilities?.includes("dutyplan.edit") ?? false;
  };

  const overlapsMonth = (
    employee: { employmentFrom?: string | null; employmentUntil?: string | null },
    monthStart: Date,
    monthEnd: Date,
  ) => {
    const employmentFrom = toDateOnly(employee.employmentFrom ?? null);
    const employmentUntil = toDateOnly(employee.employmentUntil ?? null);
    const startOk = !employmentFrom || employmentFrom <= monthEnd;
    const endOk = !employmentUntil || employmentUntil >= monthStart;
    return startOk && endOk;
  };

  const resolvePlanningMonth = async () => {
    let rawSettings: Awaited<ReturnType<typeof storage.getRosterSettings>> | null =
      null;
    let settingsReadFailed = false;
    try {
      rawSettings = await storage.getRosterSettings();
    } catch (error) {
      settingsReadFailed = true;
      console.error("resolvePlanningMonth: failed to read roster settings", error);
    }

    const toIntOrNull = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const num = Number(trimmed);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    const wishYear = rawSettings
      ? toIntOrNull(
          (rawSettings as any).wishYear ?? (rawSettings as any).wish_year,
        )
      : null;

    const wishMonth = rawSettings
      ? toIntOrNull(
          (rawSettings as any).wishMonth ?? (rawSettings as any).wish_month,
        )
      : null;

    const settings = rawSettings
      ? {
          ...rawSettings,
          wishYear,
          wishMonth,
        }
      : null;

    const [previewPlan, releasedPlan] = await Promise.all([
      storage.getLatestDutyPlanByStatus("Vorläufig"),
      storage.getLatestDutyPlanByStatus("Freigegeben"),
    ]);

    let lastApproved = settings
      ? { year: settings.lastApprovedYear, month: settings.lastApprovedMonth }
      : DEFAULT_LAST_APPROVED;
    if (
      releasedPlan &&
      compareYearMonth(
        releasedPlan.year,
        releasedPlan.month,
        lastApproved.year,
        lastApproved.month,
      ) > 0
    ) {
      lastApproved = { year: releasedPlan.year, month: releasedPlan.month };
    }
    const base = previewPlan
      ? { year: previewPlan.year, month: previewPlan.month }
      : lastApproved;
    const auto = addMonth(base.year, base.month);
    const storedWish =
      settings?.wishYear && settings?.wishMonth
        ? { year: settings.wishYear, month: settings.wishMonth }
        : null;
    const current =
      storedWish &&
      compareYearMonth(
        storedWish.year,
        storedWish.month,
        auto.year,
        auto.month,
      ) >= 0
        ? storedWish
        : auto;
    const shouldPersist =
      !settings ||
      !storedWish ||
        compareYearMonth(
          auto.year,
          auto.month,
          storedWish.year,
          storedWish.month,
        ) > 0;
    const shouldPersistFinal =
      settingsReadFailed || storedWish ? false : shouldPersist;

    return {
      settings,
      lastApproved,
      auto,
      current,
      shouldPersist: shouldPersistFinal,
    };
  };

  // Auth routes
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, rememberMe } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "E-Mail und Passwort sind erforderlich" });
      }

      const employee = await storage.getEmployeeByEmail(email);
      if (!employee) {
        return res.status(401).json({ error: "Ungültige Anmeldedaten" });
      }

      if (!employee.passwordHash) {
        return res.status(401).json({
          error:
            "Kein Passwort gesetzt. Bitte kontaktieren Sie das Sekretariat.",
        });
      }

      const isValidPassword = await bcrypt.compare(
        password,
        employee.passwordHash,
      );
      if (!isValidPassword) {
        return res.status(401).json({ error: "Ungültige Anmeldedaten" });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const employmentFrom = toDateOnly(employee.employmentFrom);
      const employmentUntil = toDateOnly(employee.employmentUntil);

      let shiftPrefs: { externalDutyOnly?: boolean } | null = null;
      if (employee.shiftPreferences) {
        if (typeof employee.shiftPreferences === "string") {
          try {
            shiftPrefs = JSON.parse(employee.shiftPreferences);
          } catch {
            shiftPrefs = null;
          }
        } else if (typeof employee.shiftPreferences === "object") {
          shiftPrefs = employee.shiftPreferences as {
            externalDutyOnly?: boolean;
          };
        }
      }
      const externalDutyOnly = Boolean(shiftPrefs?.externalDutyOnly);

      if (employmentFrom) {
        const fullUntil = addMonths(employmentFrom, 3);
        fullUntil.setHours(0, 0, 0, 0);
        let fullAccessEnd = fullUntil;
        if (employmentUntil && employmentUntil.getTime() < fullAccessEnd.getTime()) {
          fullAccessEnd = employmentUntil;
        }
        if (today.getTime() > fullAccessEnd.getTime() && !externalDutyOnly) {
          return res.status(403).json({
            success: false,
            error: "Befristung abgelaufen.",
          });
        }
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      if (rememberMe) {
        expiresAt.setDate(expiresAt.getDate() + 30);
      } else {
        expiresAt.setHours(expiresAt.getHours() + 8);
      }

      await storage.createSession({
        employeeId: employee.id,
        token,
        isRemembered: !!rememberMe,
        expiresAt,
        deviceName: req.headers["user-agent"] || "Unknown",
      });

      await storage.updateEmployeeLastLogin(employee.id);

      const { passwordHash, ...safeEmployee } = employee;

      res.json({
        token,
        employee: safeEmployee,
        expiresAt,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Anmeldung fehlgeschlagen" });
    }
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Anmeldung erforderlich" });
      }
      if (!req.user.capabilities?.includes("auth.logout")) {
        return res
          .status(403)
          .json({ success: false, error: "Eingeschränkter Zugriff" });
      }
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        await storage.deleteSession(token);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Abmeldung fehlgeschlagen" });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Nicht authentifiziert" });
      }

      const token = authHeader.substring(7);
      const session = await storage.getSessionByToken(token);

      if (!session) {
        return res.status(401).json({ error: "Sitzung abgelaufen" });
      }

      const employee = await storage.getEmployee(session.employeeId);
      if (!employee) {
        return res.status(401).json({ error: "Benutzer nicht gefunden" });
      }

      const { passwordHash, ...safeEmployee } = employee;
      res.json({ employee: safeEmployee });
    } catch (error) {
      res.status(500).json({ error: "Fehler beim Abrufen des Benutzers" });
    }
  });

  app.post("/api/auth/set-password", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Nicht authentifiziert" });
      }

      const token = authHeader.substring(7);
      const session = await storage.getSessionByToken(token);
      if (!session) {
        return res.status(401).json({ error: "Sitzung abgelaufen" });
      }

      const currentEmployee = await storage.getEmployee(session.employeeId);
      if (!currentEmployee) {
        return res.status(401).json({ error: "Benutzer nicht gefunden" });
      }

      const { employeeId, newPassword, currentPassword } = req.body;
      const targetEmployeeId = employeeId || session.employeeId;

      const isAdmin =
        currentEmployee.isAdmin ||
        ["Primararzt", "1. Oberarzt", "Sekretariat"].includes(
          currentEmployee.role,
        );

      if (targetEmployeeId !== session.employeeId && !isAdmin) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      if (
        targetEmployeeId === session.employeeId &&
        currentEmployee.passwordHash
      ) {
        if (!currentPassword) {
          return res
            .status(400)
            .json({ error: "Aktuelles Passwort erforderlich" });
        }
        const isValid = await bcrypt.compare(
          currentPassword,
          currentEmployee.passwordHash,
        );
        if (!isValid) {
          return res
            .status(401)
            .json({ error: "Aktuelles Passwort ist falsch" });
        }
      }

      if (!newPassword || newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: "Passwort muss mindestens 6 Zeichen haben" });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.setEmployeePassword(targetEmployeeId, passwordHash);

      res.json({ success: true });
    } catch (error) {
      console.error("Set password error:", error);
      res.status(500).json({ error: "Passwort konnte nicht gesetzt werden" });
    }
  });

  app.post("/api/auth/init-password", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "E-Mail und Passwort erforderlich" });
      }

      const employee = await storage.getEmployeeByEmail(email);
      if (!employee) {
        return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
      }

      if (employee.passwordHash) {
        return res.status(400).json({ error: "Passwort bereits gesetzt" });
      }

      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: "Passwort muss mindestens 6 Zeichen haben" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await storage.setEmployeePassword(employee.id, passwordHash);

      res.json({ success: true });
    } catch (error) {
      console.error("Init password error:", error);
      res
        .status(500)
        .json({ error: "Passwort konnte nicht initialisiert werden" });
    }
  });

  // Employee routes
  app.get("/api/employees", async (req: Request, res: Response) => {
    try {
      const employeeList = await storage.getEmployees();
      res.json(employeeList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  app.get("/api/employees/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const employee = await storage.getEmployee(id);
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }
      res.json(employee);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employee" });
    }
  });

  app.post("/api/employees", async (req: Request, res: Response) => {
    try {
      const validatedData = insertEmployeeSchema.parse(req.body);
      const employee = await storage.createEmployee(validatedData);
      res.status(201).json(employee);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create employee" });
    }
  });

  app.patch("/api/employees/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (typeof req.body?.email === "string") {
        const emailValue = req.body.email.trim();
        if (!emailValue || !isValidEmail(emailValue)) {
          return res.status(400).json({
            error: "Bitte eine gueltige E-Mail-Adresse ohne Umlaute eingeben.",
          });
        }
        req.body.email = emailValue;
      }
      if (typeof req.body?.emailPrivate === "string") {
        const emailPrivateValue = req.body.emailPrivate.trim();
        if (emailPrivateValue && !isValidEmail(emailPrivateValue)) {
          return res.status(400).json({
            error:
              "Bitte eine gueltige private E-Mail-Adresse ohne Umlaute eingeben.",
          });
        }
        req.body.emailPrivate = emailPrivateValue || null;
      }
      const employee = await storage.updateEmployee(id, req.body);
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }
      res.json(employee);
    } catch (error) {
      res.status(500).json({ error: "Failed to update employee" });
    }
  });

  app.delete("/api/employees/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteEmployee(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete employee" });
    }
  });

  // Roster routes
  app.get("/api/roster/:year/:month", async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Anmeldung erforderlich" });
      }
      if (
        req.user.accessScope === "external_duty" &&
        !hasCapability(req, "duty_plan.read")
      ) {
        return res
          .status(403)
          .json({ success: false, error: "Eingeschränkter Zugriff" });
      }
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const parseFlag = (value?: string) => {
        if (!value) return false;
        const normalized = value.toLowerCase();
        return normalized === "1" || normalized === "true" || normalized === "yes";
      };
      const draftQuery = parseFlag(req.query.draft as string | undefined);
      const includeDraft = parseFlag(
        req.query.includeDraft as string | undefined,
      );
      const draftAllowed = Boolean(
        req.user?.isAdmin ||
          req.user?.appRole === "Admin" ||
          req.user?.appRole === "Editor",
      );
      if ((draftQuery || includeDraft) && !draftAllowed) {
        return res
          .status(403)
          .json({ success: false, error: "Draft-Zugriff nur für Admins" });
      }
      // Draft results stay admin-only
      const shifts = await storage.getRosterShiftsByMonth(year, month, {
        includeDraft,
        draft: draftQuery,
      });
      res.json(shifts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch roster" });
    }
  });

  const openShiftHandler = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Anmeldung erforderlich" });
      }

      const now = new Date();
      const parseNumberParam = (value: unknown) => {
        if (typeof value === "string") {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };

      const yearParam = parseNumberParam(req.query.year);
      const monthParam = parseNumberParam(req.query.month);

      const rawFrom = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const rawTo = typeof req.query.to === "string" ? req.query.to.trim() : "";

      const startIso = rawFrom || null;
      const endIso = rawTo || null;

      const hasYearMonth =
        typeof yearParam === "number" && typeof monthParam === "number";
      if (hasYearMonth && (monthParam < 1 || monthParam > 12)) {
        return res
          .status(400)
          .json({ error: "Monat muss zwischen 1 und 12 liegen" });
      }

      let computedStart = startIso;
      let computedEnd = endIso;
      if (!computedStart && hasYearMonth) {
        computedStart = `${yearParam}-${padTwo(monthParam)}-01`;
      }
      if (!computedEnd && hasYearMonth) {
        const lastDay = new Date(yearParam, monthParam, 0).getDate();
        computedEnd = `${yearParam}-${padTwo(monthParam)}-${padTwo(lastDay)}`;
      }

      const ensureDateString = (value: string | null, fallback: string) =>
        value || fallback;
      const fallbackStart = `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-01`;
      let finalStart = ensureDateString(computedStart, fallbackStart);
      if (!computedEnd) {
        const parsedStart = parseISO(finalStart);
        if (Number.isNaN(parsedStart.getTime())) {
          return res.status(400).json({ error: "Ungültiges Startdatum" });
        }
        const lastDay = new Date(
          parsedStart.getFullYear(),
          parsedStart.getMonth() + 1,
          0,
        ).getDate();
        computedEnd = `${parsedStart.getFullYear()}-${padTwo(
          parsedStart.getMonth() + 1,
        )}-${padTwo(lastDay)}`;
      }
      let finalEnd = ensureDateString(computedEnd, finalStart);

      const parsedStartDate = parseISO(finalStart);
      const parsedEndDate = parseISO(finalEnd);
      if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: "Ungültige Datumsangabe" });
      }
      if (parsedEndDate < parsedStartDate) {
        const swappedStart = parsedEndDate;
        const swappedEnd = parsedStartDate;
        finalStart = format(swappedStart, "yyyy-MM-dd");
        finalEnd = format(swappedEnd, "yyyy-MM-dd");
      } else {
        finalStart = format(parsedStartDate, "yyyy-MM-dd");
        finalEnd = format(parsedEndDate, "yyyy-MM-dd");
      }

      const planYear = parseISO(finalStart).getFullYear();
      const planMonth = parseISO(finalStart).getMonth() + 1;

      const clinicId = await resolveClinicIdFromUser(req.user);
      if (!clinicId) {
        return res.status(400).json({ error: "Klinik-Kontext fehlt" });
      }

      const [planRow] = await db
        .select({ status: dutyPlans.status })
        .from(dutyPlans)
        .where(
          and(
            eq(dutyPlans.year, planYear),
            eq(dutyPlans.month, planMonth),
          ),
        );
      const planStatus = planRow?.status ?? null;
      const statusAllowed = planStatus
        ? ALLOWED_UNASSIGNED_STATUSES.has(planStatus)
        : false;

      const includeDraftParam = parseBoolQueryFlag(
        req.query.includeDraft as string | string[],
      );
      const allowDraftFromStatus = planStatus && planStatus !== "Freigegeben";
      const includeDraft = includeDraftParam || allowDraftFromStatus;
      const payload = await buildOpenShiftPayload({
        clinicId,
        startDate: finalStart,
        endDate: finalEnd,
        includeDraft,
      });

      res.json({
        ...payload,
        planStatus,
        statusAllowed,
      });
    } catch (error) {
      console.error("Open shifts error:", error);
      res
        .status(500)
        .json({ error: "Fehler beim Laden unbesetzter Dienste" });
    }
  };

  app.get("/api/roster/open-shifts", requireAuth, openShiftHandler);
  app.get("/api/roster/unassigned", requireAuth, openShiftHandler);

  app.get("/api/roster/date/:date", async (req: Request, res: Response) => {
    try {
      const date = req.params.date;
      const shifts = await storage.getRosterShiftsByDate(date);
      res.json(shifts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch roster for date" });
    }
  });

  app.post("/api/roster", async (req: Request, res: Response) => {
    try {
      const validatedData = insertRosterShiftSchema.parse(req.body);
      const rawEmployeeId = validatedData.employeeId;
      const rawFreeText =
        typeof validatedData.assigneeFreeText === "string"
          ? validatedData.assigneeFreeText.trim()
          : "";
      if (!rawEmployeeId && !rawFreeText) {
        return res
          .status(400)
          .json({ error: "Mitarbeiter oder Freitext ist erforderlich" });
      }
      const overrideIsDraftQuery = String(req.query.draft) === "1";
      const bodyIsDraft =
        typeof req.body.isDraft === "boolean" ? req.body.isDraft : undefined;
      const isDraftFlag =
        overrideIsDraftQuery || bodyIsDraft === true ? true : false;

      const payload = {
        ...validatedData,
        employeeId: rawEmployeeId || null,
        assigneeFreeText: rawEmployeeId ? null : rawFreeText || null,
        isDraft: isDraftFlag,
      };
      const shift = await storage.createRosterShift(payload);
      res.status(201).json(shift);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create roster shift" });
    }
  });

  app.delete("/api/roster/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteRosterShift(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete roster shift" });
    }
  });

  app.get("/api/roster/shift/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const shift = await storage.getRosterShift(id);
      if (!shift) {
        return res.status(404).json({ error: "Shift not found" });
      }
      res.json(shift);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift" });
    }
  });

  app.patch("/api/roster/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const overrideIsDraftQuery = String(req.query.draft) === "1";
      const bodyIsDraft =
        typeof req.body?.isDraft === "boolean" ? req.body.isDraft : undefined;
      const isDraftFlag =
        overrideIsDraftQuery || bodyIsDraft === true ? true : undefined;
      const updateData = { ...req.body };
      if (typeof isDraftFlag === "boolean") {
        updateData.isDraft = isDraftFlag;
      }
      if (
        Object.prototype.hasOwnProperty.call(updateData, "assigneeFreeText")
      ) {
        updateData.assigneeFreeText =
          typeof updateData.assigneeFreeText === "string"
            ? updateData.assigneeFreeText.trim()
            : updateData.assigneeFreeText;
        if (updateData.assigneeFreeText === "") {
          updateData.assigneeFreeText = null;
        }
      }
      if (Object.prototype.hasOwnProperty.call(updateData, "employeeId")) {
        if (updateData.employeeId) {
          updateData.assigneeFreeText = null;
        }
      }
      if (
        Object.prototype.hasOwnProperty.call(updateData, "assigneeFreeText")
      ) {
        if (updateData.assigneeFreeText) {
          updateData.employeeId = null;
        }
      }
      if (
        !updateData.employeeId &&
        !updateData.assigneeFreeText &&
        !updateData.notes
      ) {
        return res
          .status(400)
          .json({ error: "Mitarbeiter oder Freitext ist erforderlich" });
      }
      const shift = await storage.updateRosterShift(id, updateData);
      if (!shift) {
        return res.status(404).json({ error: "Shift not found" });
      }
      res.json(shift);
    } catch (error) {
      res.status(500).json({ error: "Failed to update shift" });
    }
  });

  app.post(
    "/api/roster/:id(\\d+)/claim",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const shiftId = Number(req.params.id);
        if (!Number.isFinite(shiftId)) {
          return res.status(400).json({ error: "Ungültige Shift-ID" });
        }
        const shift = await storage.getRosterShift(shiftId);
        if (!shift) {
          return res.status(404).json({ error: "Shift nicht gefunden" });
        }
        if (shift.employeeId) {
          return res.status(400).json({ error: "Shift bereits besetzt" });
        }
        if ((shift.assigneeFreeText ?? "").trim()) {
          return res.status(400).json({ error: "Shift ist einem Freitext zugeordnet" });
        }
        if (shift.isDraft) {
          return res.status(400).json({ error: "Claim für Draft-Shifts nicht erlaubt" });
        }
        const employeeId = req.user?.employeeId;
        if (!employeeId) {
          return res.status(400).json({ error: "EmployeeId fehlt" });
        }
        if (!shift.date) {
          return res.status(400).json({ error: "Shift-Datum fehlt" });
        }
        const parsedDate = parseISO(shift.date);
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: "Ungültiges Shift-Datum" });
        }
        const year = parsedDate.getFullYear();
        const month = parsedDate.getMonth() + 1;
        const [planRow] = await db
          .select({ status: dutyPlans.status })
          .from(dutyPlans)
          .where(
            and(
              eq(dutyPlans.year, year),
              eq(dutyPlans.month, month),
            ),
          );
        if (!planRow || !ALLOWED_CLAIM_STATUSES.has(planRow.status)) {
          return res.status(400).json({ error: "Dienstplan noch nicht freigegeben" });
        }
        const clinicId = req.user?.clinicId;
        if (!clinicId) {
          return res.status(400).json({ error: "Klinik-Kontext fehlt" });
        }
        const [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, employeeId));
        if (!employee) {
          return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
        }

        const serviceLineRows = await db
          .select()
          .from(serviceLines)
          .where(
            and(eq(serviceLines.clinicId, clinicId), eq(serviceLines.isActive, true)),
          );
        const allowedKeys = getEffectiveServiceLineKeys(
          employee,
          serviceLineRows,
        );
        const allowedClaimKeys = filterKeysByFlag(
          allowedKeys,
          serviceLineRows,
          "allowsClaim",
        );
        if (!allowedClaimKeys.has(shift.serviceType)) {
          return res.status(403).json({ error: "Diensttyp nicht erlaubt" });
        }

        const prevDate = format(subDays(parsedDate, 1), "yyyy-MM-dd");
        const [prevShift] = await db
          .select({
            id: rosterShifts.id,
            serviceType: rosterShifts.serviceType,
            employeeId: rosterShifts.employeeId,
          })
          .from(rosterShifts)
          .where(
            and(
              eq(rosterShifts.date, prevDate),
              eq(rosterShifts.employeeId, employeeId),
            ),
          )
          .limit(1);
        if (prevShift) {
          if (
            prevShift.serviceType &&
            normalizeServiceLineKey(prevShift.serviceType) ===
              normalizeServiceLineKey(OVERDUTY_KEY)
          ) {
            // Überdienste dürfen den folgenden Tag nicht blockieren
          } else {
            return res
              .status(400)
              .json({ error: "Übernahme nicht erlaubt: Dienst am Vortag vorhanden" });
          }
        }

        const [updated] = await db
          .update(rosterShifts)
          .set({
            employeeId,
            assigneeFreeText: null,
          })
          .where(
            and(
              eq(rosterShifts.id, shiftId),
              isNull(rosterShifts.employeeId),
            ),
          )
          .returning();
        if (!updated) {
          return res.status(409).json({ error: "Shift konnte nicht übernommen werden" });
        }
        res.json(updated);
      } catch (error) {
        console.error("Claim shift error:", error);
        res.status(500).json({ error: "Shift konnte nicht übernommen werden" });
      }
    },
  );

  // Smoke check (curl example):
  // curl -X POST https://mycliniq.info/api/roster/open-shifts/claim \
  //   -H "Authorization: Bearer <token>" \
  //   -H "Content-Type: application/json" \
  //   -d '{"date":"2026-03-24","serviceType":"kreiszimmer"}'
  const openShiftClaimHandler = async (req: Request, res: Response) => {
    // TODO: remove this logging flag once claim flow is stable.
    const claimDebug = process.env.CLAIM_DEBUG === "1";
    try {
      const forceDraftFlag = Boolean(req.body?.forceDraft);
      const slotIdRaw = req.body?.slotId;
      const parsedSlotId =
        typeof slotIdRaw === "number"
          ? slotIdRaw
          : typeof slotIdRaw === "string"
            ? Number(slotIdRaw)
            : Number.NaN;
      const slotId = Number.isFinite(parsedSlotId) ? parsedSlotId : null;
      let effectiveDate =
        typeof req.body.date === "string" ? req.body.date.trim() : "";
      let effectiveServiceType =
        typeof req.body.serviceType === "string"
          ? req.body.serviceType.trim()
          : "";
      let slotRow:
        | {
            id: number;
            date: string | null;
            serviceType: string | null;
            isDraft: boolean | null;
            employeeId: number | null;
          }
        | null = null;

      if (slotId) {
        const [fetched] = await db
          .select({
            id: rosterShifts.id,
            date: rosterShifts.date,
            serviceType: rosterShifts.serviceType,
            isDraft: rosterShifts.isDraft,
            employeeId: rosterShifts.employeeId,
          })
          .from(rosterShifts)
          .where(eq(rosterShifts.id, slotId))
          .limit(1);
        if (!fetched) {
          return res
            .status(404)
            .json({ error: "Kein offener Dienst für dieses Datum/Diensttyp vorhanden" });
        }
        if (fetched.employeeId) {
          return res
            .status(404)
            .json({ error: "Kein offener Dienst für dieses Datum/Diensttyp vorhanden" });
        }
        slotRow = fetched;
        effectiveDate = fetched.date ?? effectiveDate;
        effectiveServiceType = fetched.serviceType ?? effectiveServiceType;
      }

      if (!effectiveDate || !effectiveServiceType) {
        return res
          .status(400)
          .json({ error: "date/serviceType erforderlich" });
      }

      const parsedDate = parseISO(effectiveDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Ungültiges Datum" });
      }

      if (claimDebug) {
        console.log(
          "[claim-debug] request",
          {
            slotId,
            date: effectiveDate,
            serviceType: effectiveServiceType,
            slotIndex: req.body?.slotIndex,
            syntheticId: req.body?.syntheticId,
            forceDraftFlag,
          },
        );
      }

      const planYear = parsedDate.getFullYear();
      const planMonth = parsedDate.getMonth() + 1;
      const [planRow] = await db
        .select({ status: dutyPlans.status })
        .from(dutyPlans)
        .where(
          and(
            eq(dutyPlans.year, planYear),
            eq(dutyPlans.month, planMonth),
          ),
        );
      if (!planRow || !ALLOWED_CLAIM_STATUSES.has(planRow.status)) {
        return res.status(400).json({ error: "Dienstplan noch nicht freigegeben" });
      }
      const allowDraftFromStatus = planRow.status !== "Freigegeben";
      const hasDraftPermissions = Boolean(
        req.user?.isAdmin ||
          req.user?.appRole === "Admin" ||
          req.user?.appRole === "Editor" ||
          req.user?.capabilities?.includes("dutyplan.edit"),
      );
      const targetIsDraft =
        forceDraftFlag && allowDraftFromStatus && hasDraftPermissions;

      if (claimDebug) {
        console.log(
          "[claim-debug] plan",
          {
            planStatus: planRow.status,
            allowDraftFromStatus,
            hasDraftPermissions,
            targetIsDraft,
          },
        );
      }

      const clinicId = await resolveClinicIdFromUser(req.user);
      if (!clinicId) {
        return res.status(400).json({ error: "Klinik-Kontext fehlt" });
      }

      const employeeId = req.user?.employeeId;
      if (!employeeId) {
        return res.status(400).json({ error: "EmployeeId fehlt" });
      }

      const [employee] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, employeeId));
      if (!employee) {
        return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
      }

      const serviceLineRows = await db
        .select()
        .from(serviceLines)
        .where(
          and(
            eq(serviceLines.clinicId, clinicId),
            eq(serviceLines.isActive, true),
          ),
        );

      const requestedNormalizedKey = normalizeServiceLineKey(effectiveServiceType);
      const matchedServiceLine = serviceLineRows.find(
        (line) =>
          normalizeServiceLineKey(line.key) === requestedNormalizedKey,
      );
      if (!matchedServiceLine || !matchedServiceLine.allowsClaim) {
        return res.status(403).json({ error: "Diensttyp nicht erlaubt" });
      }
      const finalServiceTypeKey = matchedServiceLine.key;

      const allowedKeys = getEffectiveServiceLineKeys(employee, serviceLineRows);
      const allowedClaimKeys = filterKeysByFlag(
        allowedKeys,
        serviceLineRows,
        "allowsClaim",
      );
      if (!allowedClaimKeys.has(finalServiceTypeKey)) {
        return res.status(403).json({ error: "Diensttyp nicht erlaubt" });
      }

      const prevDate = format(subDays(parsedDate, 1), "yyyy-MM-dd");
      const [prevShift] = await db
        .select()
        .from(rosterShifts)
        .where(
          and(
            eq(rosterShifts.date, prevDate),
            eq(rosterShifts.employeeId, employeeId),
          ),
        )
        .limit(1);
      if (prevShift) {
        if (
          prevShift.serviceType &&
          normalizeServiceLineKey(prevShift.serviceType) ===
            normalizeServiceLineKey(OVERDUTY_KEY)
        ) {
          // Überdienste dürfen den folgenden Tag nicht blockieren
        } else {
          return res
            .status(400)
            .json({ error: "Übernahme nicht erlaubt: Dienst am Vortag vorhanden" });
        }
      }

      let targetShiftId: number | null = null;
      if (slotRow && slotRow.isDraft === targetIsDraft) {
        targetShiftId = slotRow.id;
      }

      if (!targetShiftId) {
        const dateConditions = [
          eq(rosterShifts.date, effectiveDate),
          eq(rosterShifts.serviceType, finalServiceTypeKey),
          eq(rosterShifts.isDraft, targetIsDraft),
          isNull(rosterShifts.employeeId),
        ];
        const [found] = await db
          .select({
            id: rosterShifts.id,
          })
          .from(rosterShifts)
          .where(and(...dateConditions))
          .orderBy(rosterShifts.id)
          .limit(1);
        targetShiftId = found?.id ?? null;
        if (claimDebug) {
          console.log(
            "[claim-debug] matched existing shift",
            { foundId: found?.id ?? null, targetIsDraft },
          );
        }
      }

      if (!targetShiftId) {
        if (claimDebug) {
          console.log(
            "[claim-debug] no open row, creating",
            {
              date: effectiveDate,
              serviceType: finalServiceTypeKey,
              targetIsDraft,
            },
          );
        }
        const created = await storage.createRosterShift({
          date: effectiveDate,
          serviceType: finalServiceTypeKey,
          employeeId: null,
          isDraft: targetIsDraft,
        });
        targetShiftId = created.id;
      }

      const [updated] = await db
        .update(rosterShifts)
        .set({
          employeeId,
          assigneeFreeText: null,
        })
        .where(
          and(
            eq(rosterShifts.id, targetShiftId),
            isNull(rosterShifts.employeeId),
          ),
        )
        .returning();
      if (!updated) {
        return res
          .status(409)
          .json({ error: "Shift konnte nicht übernommen werden" });
      }

      res.status(201).json(updated);
    } catch (error) {
      console.error("Claim open shift error:", error);
      res.status(500).json({ error: "Dienst konnte nicht übernommen werden" });
    }
  };

  app.post(
    "/api/roster/open-shifts/claim",
    requireAuth,
    openShiftClaimHandler,
  );
  app.post(
    "/api/roster/unassigned/claim",
    requireAuth,
    openShiftClaimHandler,
  );

  app.post("/api/roster/bulk", async (req: Request, res: Response) => {
    try {
      const shifts = req.body.shifts;
      if (!Array.isArray(shifts)) {
        return res.status(400).json({ error: "Shifts must be an array" });
      }
      const invalid = shifts.find(
        (shift) => !shift.employeeId && !shift.assigneeFreeText,
      );
      if (invalid) {
        return res
          .status(400)
          .json({ error: "Mitarbeiter oder Freitext ist erforderlich" });
      }
      const overrideIsDraftQuery = String(req.query.draft) === "1";
      const normalizedShifts = shifts.map((shift: any) => {
        const bodyIsDraft =
          typeof shift?.isDraft === "boolean" ? shift.isDraft : undefined;
        const isDraftFlag = overrideIsDraftQuery || bodyIsDraft === true;
        return { ...shift, isDraft: isDraftFlag };
      });
      const results = await storage.bulkCreateRosterShifts(normalizedShifts);
      res.status(201).json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to create roster shifts" });
    }
  });

  app.delete(
    "/api/roster/month/:year/:month",
    async (req: Request, res: Response) => {
      try {
        const year = parseInt(req.params.year);
        const month = parseInt(req.params.month);
        const includeDraft = String(req.query.includeDraft) === "1";
        const draftOnly = includeDraft ? false : String(req.query.draft) === "1";
        const finalOnly = includeDraft ? false : !draftOnly;

        const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
        const monthEndDate = new Date(year, month, 0);
        const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

        const conditions = [
          gte(rosterShifts.date, monthStart),
          lte(rosterShifts.date, monthEnd),
        ];

        if (!includeDraft) {
          conditions.push(eq(rosterShifts.isDraft, draftOnly));
        }

        await db.delete(rosterShifts).where(and(...conditions));
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: "Failed to delete roster shifts" });
      }
    },
  );

  // AI Roster Generation

  app.post("/api/roster/generate", async (req: Request, res: Response) => {
    try {
      const { year, month, rules, mode } = req.body;
      const preview =
        String(req.query.preview) === "1" || req.body?.preview === true;
      const promptOverride =
        typeof req.body?.promptOverride === "string"
          ? req.body.promptOverride
          : undefined;
      const wishesLocked =
        req.body?.wishesLocked === true || req.body?.wishesLocked === "true";
      const resolvedMode =
        typeof mode === "string" && mode === "final" ? "final" : "draft";

      if (!year || !month) {
        return res
          .status(400)
          .json({ error: "Jahr und Monat sind erforderlich" });
      }

      const employeeList = await storage.getEmployees();
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(
        lastDayOfMonth,
      ).padStart(2, "0")}`;

      const generalAbsences = await storage.getAbsencesByDateRange(
        monthStart,
        monthEnd,
      );
      const plannedAbsences = await storage.getPlannedAbsencesByMonth(
        year,
        month,
      );
      const toIsoDateString = (value: string | Date | null | undefined): string =>
        typeof value === "string"
          ? value.slice(0, 10)
          : value instanceof Date
          ? value.toISOString().slice(0, 10)
          : "";
      const filteredPlannedAbsences = plannedAbsences.filter((absence) => {
        if (absence.status === "Abgelehnt") return false;
        const start = toIsoDateString(absence.startDate);
        const end = toIsoDateString(absence.endDate);
        return start <= monthEnd && end >= monthStart;
      });
      const plannedAsAbsences = filteredPlannedAbsences.map((absence) => ({
        id: absence.id,
        employeeId: absence.employeeId,
        startDate: toIsoDateString(absence.startDate),
        endDate: toIsoDateString(absence.endDate),
        reason: absence.reason,
        notes: absence.notes ?? null,
        createdAt: absence.createdAt,
      }));
      const existingAbsences = [...generalAbsences, ...plannedAsAbsences];

      const wishStatuses = ["Eingereicht"];

      const wishes = await storage.getShiftWishesByMonth(year, month);
      const shiftWishes = wishes.filter((wish) =>
        wishStatuses.includes(wish.status),
      );
      const submittedWishesCount = await storage.getSubmittedWishesCount(
        year,
        month,
      );

      const clinicId = (req as any).user?.clinicId;
      const serviceLineMeta = clinicId
        ? await db
            .select({
              key: serviceLines.key,
              roleGroup: serviceLines.roleGroup,
              label: serviceLines.label,
            })
            .from(serviceLines)
            .where(eq(serviceLines.clinicId, clinicId))
            .orderBy(asc(serviceLines.sortOrder), asc(serviceLines.label))
        : [];

      const eligibleEmployeesCount = employeeList.filter(
        (employee: any) =>
          employee.isActive && employeeDoesShifts(employee, serviceLineMeta),
      ).length;

      const longTermWishes = await storage.getLongTermShiftWishesByStatus(
        "Genehmigt",
      );
      const longTermAbsences = await storage.getLongTermAbsencesByStatus(
        "Genehmigt",
      );

      const promptPayload = buildRosterPromptPayload({
        employees: employeeList,
        absences: existingAbsences,
        shiftWishes,
        longTermWishes,
        longTermAbsences,
        year,
        month,
        serviceLines: serviceLineMeta,
        rules,
        promptOverride,
      });

      if (preview) {
        const isAdmin = Boolean(
          req.user?.isAdmin || req.user?.appRole === "Admin",
        );
        if (process.env.ROSTER_PROMPT_PREVIEW !== "1" || !isAdmin) {
          return res.status(404).json({ success: false, error: "Not found" });
        }
        return res.json({
          success: true,
          model: promptPayload.model,
          maxOutputTokens: promptPayload.maxOutputTokens,
          system: promptPayload.system,
          prompt: promptPayload.prompt,
          promptCharCount: promptPayload.promptCharCount,
          approxTokenHint: promptPayload.approxTokenHint,
          requestPayload: promptPayload.requestPayload,
        });
      }

      const result = await generateRosterPlan(
        employeeList,
        existingAbsences,
        year,
        month,
        shiftWishes,
        longTermWishes,
        longTermAbsences,
        serviceLineMeta,
        rules,
        { promptOverride },
      );

      const debugCounts = {
        aiShiftCount: result.aiShiftCount,
        normalizedShiftCount: result.normalizedShiftCount,
        validatedShiftCount: result.validatedShiftCount,
        requiredFilledByAI: result.requiredFilledByAI,
        requiredFilledByFallback: result.requiredFilledByFallback,
        turnusFilledByAI: result.turnusFilledByAI,
        turnusFilledByFallback: result.turnusFilledByFallback,
        createdCount: result.shifts.length,
        absencesLoadedCount: existingAbsences.length,
        shiftWishesLoadedCount: shiftWishes.length,
        submittedWishesCount,
        eligibleEmployeesCount,
      };
      const requiredGaps = result.unfilled.filter(
        (item) => item.reason === REQUIRED_SERVICE_GAP_REASON,
      );
      const hasRequiredGaps = requiredGaps.length > 0;

      const isAdmin = Boolean(
        req.user?.isAdmin || req.user?.appRole === "Admin",
      );
      if (result.validatedShiftCount === 0) {
        return res.status(422).json({
          success: false,
          ...debugCounts,
          unfilled: result.unfilled,
          outputPreview: isAdmin
            ? (result.outputText ?? "").slice(0, 300)
            : undefined,
          firstBadShiftReason: preview ? result.firstBadShiftReason : undefined,
          error: "Keine gültigen Schichten generiert",
        });
      }

      if (resolvedMode === "final" && hasRequiredGaps) {
        return res.status(400).json({
          success: false,
          mode: resolvedMode,
          ...debugCounts,
          unfilled: result.unfilled,
          error:
            "Erforderliche Dienstschienen fehlen in mindestens einem Tag für einen finalen Plan",
        });
      }

      const draftMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const draftMonthEnd = `${year}-${String(month).padStart(2, "0")}-${String(
        new Date(year, month, 0).getDate(),
      ).padStart(2, "0")}`;
      // remove existing draft shifts for this month before inserting new preview rows
      await db
        .delete(rosterShifts)
        .where(
          and(
            eq(rosterShifts.isDraft, true),
            gte(rosterShifts.date, draftMonthStart),
            lte(rosterShifts.date, draftMonthEnd),
          ),
        );
      let createdCount = 0;
      for (const shift of result.shifts) {
        await storage.createRosterShift({
          date: shift.date,
          serviceType: shift.serviceType,
          employeeId: shift.employeeId,
          isDraft: true,
        });
        createdCount += 1;
      }

      let draftShiftsResponse: Array<{
        date: string;
        serviceType: string;
        employeeId: number | null;
        employeeName: string | null;
      }> = [];
      if (resolvedMode === "draft") {
        const draftShiftsRows = await db
          .select({
            date: rosterShifts.date,
            serviceType: rosterShifts.serviceType,
            employeeId: rosterShifts.employeeId,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
          .from(rosterShifts)
          .leftJoin(employees, eq(rosterShifts.employeeId, employees.id))
          .where(
            and(
              eq(rosterShifts.isDraft, true),
              gte(rosterShifts.date, draftMonthStart),
              lte(rosterShifts.date, draftMonthEnd),
            ),
          )
          .orderBy(asc(rosterShifts.date), asc(rosterShifts.serviceType))
          .limit(200);

        draftShiftsResponse = draftShiftsRows.map((row) => ({
          date: row.date,
          serviceType: row.serviceType,
          employeeId: row.employeeId ?? null,
          employeeName: [row.firstName, row.lastName]
            .filter((part): part is string => Boolean(part?.trim()))
            .join(" ")
            .trim() || null,
        }));
      }

      res.json({
        success: true,
        mode: resolvedMode,
        ...debugCounts,
        createdCount,
        shifts: resolvedMode === "draft" ? draftShiftsResponse : [],
        unfilled: result.unfilled,
      });
    } catch (error: any) {
      console.error("Roster generation error:", error);
      res.status(500).json({
        error: "Dienstplan-Generierung fehlgeschlagen",
        details: error.message,
      });
    }
  });

  // Apply generated roster (save to database)
  app.post(
    "/api/roster/apply-generated",
    async (req: Request, res: Response) => {
      try {
        const { year, month, shifts, replaceExisting, isDraft } = req.body;

        if (!shifts || !Array.isArray(shifts)) {
          return res.status(400).json({ error: "Keine Dienste zum Speichern" });
        }

        const overrideIsDraftQuery = String(req.query.draft) === "1";
        const isDraftFlag = overrideIsDraftQuery || isDraft === true;

        const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
        const monthEndDate = new Date(year, month, 0);
        const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

        if (replaceExisting) {
          await db
            .delete(rosterShifts)
            .where(
              and(
                gte(rosterShifts.date, monthStart),
                lte(rosterShifts.date, monthEnd),
                eq(rosterShifts.isDraft, isDraftFlag),
              ),
            );
        }

        const shiftData = shifts.map((s: any) => ({
          employeeId: s.employeeId,
          date: s.date,
          serviceType: s.serviceType,
          isDraft: isDraftFlag,
        }));

        const results = await storage.bulkCreateRosterShifts(shiftData);
        const clinicId = (req as any).user?.clinicId ?? null;
        const requiredInserted = await ensureRequiredDailyShifts({
          clinicId,
          year,
          month,
          isDraftFlag,
        });
        const savedCount = results.length + requiredInserted;
        const message = requiredInserted
          ? `${savedCount} Dienste gespeichert (${requiredInserted} Pflichtdienste ohne Zuordnung hinzugefügt)`
          : `${results.length} Dienste erfolgreich gespeichert`;
        res.json({
          success: true,
          savedShifts: savedCount,
          message,
        });
      } catch (error: any) {
        console.error("Apply generated roster error:", error);
        res.status(500).json({
          error: "Speichern fehlgeschlagen",
          details: error.message,
        });
      }
    },
  );

    app.get(
      "/api/dashboard",
      requireAuth,
      async (req: Request, res: Response) => {
      try {
        const user = req.user!;
        const todayVienna = formatDate(new Date()); // YYYY-MM-DD
        const previewDates = buildPreviewDateRange(
          todayVienna,
          DASHBOARD_PREVIEW_DAYS,
        );
        const startDate = previewDates[0];
        const endDate = previewDates[previewDates.length - 1];

        const serviceLineLabels = await loadServiceLineLabels(user.clinicId);

        const shiftRows = await db
          .select({
            id: rosterShifts.id,
            date: rosterShifts.date,
            serviceType: rosterShifts.serviceType,
            employeeId: rosterShifts.employeeId,
            assigneeFreeText: rosterShifts.assigneeFreeText,
            primaryDeploymentArea: employees.primaryDeploymentArea,
            firstName: employees.firstName,
            lastName: employees.lastName,
            isActive: employees.isActive,
          })
          .from(rosterShifts)
          .leftJoin(employees, eq(rosterShifts.employeeId, employees.id))
          .where(
            and(
              gte(rosterShifts.date, startDate),
              lte(rosterShifts.date, endDate),
              // final-only filter keeps dashboard data consistent and avoids draft spill-over
              eq(rosterShifts.isDraft, false),
            ),
          );

        const dutyEmployeeIdsByDate = new Map<string, Set<number>>();
        shiftRows.forEach((shift) => {
          if (!shift.date || !shift.employeeId) return;
          if (shift.serviceType === OVERDUTY_KEY) return;
          const set = dutyEmployeeIdsByDate.get(shift.date) ?? new Set<number>();
          set.add(shift.employeeId);
          dutyEmployeeIdsByDate.set(shift.date, set);
        });

        const dutyEmployeeIdsForDate = (date: string) =>
          dutyEmployeeIdsByDate.get(date) ?? new Set<number>();

        const userShifts = new Map<string, (typeof shiftRows)[0]>();
        shiftRows.forEach((shift) => {
          if (shift.employeeId === user.employeeId) {
            userShifts.set(shift.date, shift);
          }
        });

        const getServiceLabel = (serviceType?: string | null) => {
          if (!serviceType) return null;
          return serviceLineLabels.get(serviceType) ?? serviceType;
        };

        const normalize = (value?: string | null) =>
          typeof value === "string" ? value.trim() : "";
        const normalizeName = (value?: string | null) => {
          const trimmed = normalize(value);
          return trimmed || null;
        };

        const toIsoDay = (value: Date) => ((value.getUTCDay() + 6) % 7) + 1;

        const previewMeta = previewDates.map((date) => {
          const isoDate = new Date(`${date}T00:00:00`);
          const weekYear = getWeekYear(isoDate, WEEK_OPTIONS);
          const weekNumber = getWeek(isoDate, WEEK_OPTIONS);
          const isoDay = toIsoDay(isoDate);
          const weekKey = `${weekYear}-${weekNumber}`;
          return { date, weekYear, weekNumber, isoDay, weekKey };
        });

        const weekKeySet = new Set(previewMeta.map((meta) => meta.weekKey));
        const weeklyPlanByKey = new Map<string, number | null>();
        await Promise.all(
          Array.from(weekKeySet).map(async (key) => {
            const [weekYearStr, weekNumberStr] = key.split("-");
            const weekYear = Number(weekYearStr);
            const weekNumber = Number(weekNumberStr);
            const [planRow] = await db
              .select({ id: weeklyPlans.id })
              .from(weeklyPlans)
              .where(
                and(
                  eq(weeklyPlans.year, weekYear),
                  eq(weeklyPlans.weekNumber, weekNumber),
                ),
              )
              .limit(1);
            weeklyPlanByKey.set(key, planRow?.id ?? null);
          }),
        );

        const assignmentsByDayKey = new Map<
          string,
          Array<{
            roomId: number;
            roomName: string | null;
            roleLabel: string | null;
            employeeId: number | null;
            firstName: string | null;
            lastName: string | null;
            weekday: number;
          }>
        >();
        const referencedEmployeeIds = new Set<number>();

        await Promise.all(
          Array.from(weeklyPlanByKey.entries()).map(async ([key, planId]) => {
            if (!planId) return;
            const rows = await db
              .select({
                roomId: weeklyPlanAssignments.roomId,
                roomName: rooms.name,
                roleLabel: weeklyPlanAssignments.roleLabel,
                employeeId: weeklyPlanAssignments.employeeId,
                weekday: weeklyPlanAssignments.weekday,
                firstName: employees.firstName,
                lastName: employees.lastName,
              })
              .from(weeklyPlanAssignments)
              .leftJoin(rooms, eq(weeklyPlanAssignments.roomId, rooms.id))
              .leftJoin(
                employees,
                eq(weeklyPlanAssignments.employeeId, employees.id),
              )
              .where(eq(weeklyPlanAssignments.weeklyPlanId, planId));
            rows.forEach((assignment) => {
              const dayKey = `${key}-${assignment.weekday}`;
              const existing = assignmentsByDayKey.get(dayKey) ?? [];
              existing.push(assignment);
              assignmentsByDayKey.set(dayKey, existing);
              if (assignment.employeeId) {
                referencedEmployeeIds.add(assignment.employeeId);
              }
            });
          }),
        );

        const overrides = await db
          .select({
            date: dailyOverrides.date,
            roomId: dailyOverrides.roomId,
            originalEmployeeId: dailyOverrides.originalEmployeeId,
            newEmployeeId: dailyOverrides.newEmployeeId,
          })
          .from(dailyOverrides)
          .where(
            and(
              gte(dailyOverrides.date, startDate),
              lte(dailyOverrides.date, endDate),
            ),
          );

        const overridesByDate = new Map<
          string,
          Array<{
            roomId: number;
            originalEmployeeId: number | null;
            newEmployeeId: number | null;
          }>
        >();
        overrides.forEach((override) => {
          const key = override.date;
          if (!overridesByDate.has(key)) {
            overridesByDate.set(key, []);
          }
          overridesByDate.get(key)!.push({
            roomId: override.roomId,
            originalEmployeeId: override.originalEmployeeId,
            newEmployeeId: override.newEmployeeId,
          });
          if (override.newEmployeeId) {
            referencedEmployeeIds.add(override.newEmployeeId);
          }
        });

        const employeeMetaMap = new Map<
          number,
          { firstName: string | null; lastName: string | null; role: string | null }
           >();

        if (referencedEmployeeIds.size) {
          const employeeRows = await db
            .select({
              id: employees.id,
              firstName: employees.firstName,
              lastName: employees.lastName,
              role: employees.role,
            })
            .from(employees)
            .where(inArray(employees.id, Array.from(referencedEmployeeIds)));
          employeeRows.forEach((employeeRow) => {
              employeeMetaMap.set(employeeRow.id, {
              firstName: normalizeName(employeeRow.firstName),
              lastName: normalizeName(employeeRow.lastName),
              role: employeeRow.role ?? null,
            });
          });
        }

        const plannedAbsenceRows = user.employeeId
          ? await db
              .select({
                startDate: plannedAbsences.startDate,
                endDate: plannedAbsences.endDate,
                reason: plannedAbsences.reason,
                status: plannedAbsences.status,
              })
              .from(plannedAbsences)
              .where(
                and(
                  eq(plannedAbsences.employeeId, user.employeeId),
                  ne(plannedAbsences.status, "Abgelehnt"),
                  lte(plannedAbsences.startDate, endDate),
                  gte(plannedAbsences.endDate, startDate),
                ),
              )
          : [];

        const absenceReasonForDate = (date: string): string | null => {
          for (const a of plannedAbsenceRows) {
            if (a.startDate <= date && a.endDate >= date)
              return a.reason ?? null;
          }
          return null;
        };
        const plannedAbsenceRowsForPreview = await db
          .select({
            employeeId: plannedAbsences.employeeId,
            startDate: plannedAbsences.startDate,
            endDate: plannedAbsences.endDate,
            reason: plannedAbsences.reason,
            status: plannedAbsences.status,
          })
          .from(plannedAbsences)
          .where(
            and(
              ne(plannedAbsences.status, "Abgelehnt"),
              lte(plannedAbsences.startDate, endDate),
              gte(plannedAbsences.endDate, startDate),
            ),
          );

        const absentEmployeeIdsForDate = (date: string) => {
          const set = new Set<number>();
          plannedAbsenceRowsForPreview.forEach((row) => {
            const employeeId = row.employeeId;
            if (!employeeId) return;
            const rowStart = String(row.startDate);
            const rowEnd = String(row.endDate);
            if (rowStart <= date && rowEnd >= date) set.add(employeeId);
          });
          return set;
        };

        type AttendanceMember = {
          employeeId: number;
          firstName: string | null;
          lastName: string | null;
          workplace: string | null;
          role: string | null;
          isDuty: boolean;
        };

        const buildEffectiveAssignmentsForMeta = (meta: {
          date: string;
          weekKey: string;
          isoDay: number;
        }) => {
          const dayKey = `${meta.weekKey}-${meta.isoDay}`;
          const assignmentsForDay = assignmentsByDayKey.get(dayKey) ?? [];
          const overridesForDay = overridesByDate.get(meta.date) ?? [];

          return assignmentsForDay.map((assignment) => {
            const matchingOverride = overridesForDay.find(
              (override) =>
                override.roomId === assignment.roomId &&
                override.originalEmployeeId === assignment.employeeId,
            );

            return {
              ...assignment,
              employeeId: matchingOverride
                ? (matchingOverride.newEmployeeId ?? null)
                : assignment.employeeId,
            };
          });
        };

        const getRoleRank = (role?: string | null) => {
          const r = (role ?? "").toLowerCase();
          if (!r) return 99;

          // Top: Primar/Primaria
          if (r.includes("primar")) return 0;

          // 1. OA
          if (r.includes("1.") && r.includes("ober")) return 1;
          if (r.includes("erster") && r.includes("ober")) return 1;

          // OA / Facharzt (gemeinsamer Block)
          if (
            r.includes("oberarzt") ||
            r.includes("oberärzt") ||
            r.includes("facharzt") ||
            r.includes("fachärzt") ||
            r.includes("funktionsober") ||
            r.includes("ausbildungsober")
          ) {
            return 2;
          }

          // Assistenz
          if (r.includes("assistenz")) return 3;

          // Turnus
          if (r.includes("turnus")) return 4;

          // Sekretariat / Pflege / Sonstige
          if (r.includes("sekret")) return 10;
          if (r.includes("pflege")) return 20;

          return 90;
        };

const buildAttendanceMembers = (
          meta: { date: string; weekKey: string; isoDay: number },
          absentIds: Set<number>,
        ): AttendanceMember[] => {
          const effectiveAssignments = buildEffectiveAssignmentsForMeta(meta);
          const dutyIdsForDay = dutyEmployeeIdsForDate(meta.date);

          const seen = new Set<number>();
          const members: AttendanceMember[] = [];

          for (const assignment of effectiveAssignments) {
            const employeeId = assignment.employeeId ?? null;
            if (!employeeId) continue;
            if (absentIds.has(employeeId)) continue;
            if (seen.has(employeeId)) continue;
            seen.add(employeeId);

            const employeeData = employeeMetaMap.get(employeeId);
            const firstName =
              employeeData?.firstName ?? normalizeName(assignment.firstName) ?? null;
            const lastName =
              employeeData?.lastName ?? normalizeName(assignment.lastName) ?? null;
            if (!firstName && !lastName) continue;

            const role = employeeData?.role ?? null;

            const isDuty = dutyIdsForDay.has(employeeId);

            const workplace = buildWeeklyPlanWorkplaceLabel({
              roomName: assignment.roomName,
              roleLabel: assignment.roleLabel,
            });

            members.push({ employeeId, firstName, lastName, workplace, role, isDuty });
          }

          // Sortierung: zuerst Hierarchie, dann alphabetisch (wenn Rang gleich)
          members.sort((a, b) => {
            const aRank = getRoleRank(a.role);
            const bRank = getRoleRank(b.role);
            if (aRank !== bRank) return aRank - bRank;

            const aLast = a.lastName ?? "";
            const bLast = b.lastName ?? "";
            const lastCmp = aLast.localeCompare(bLast, "de");
            if (lastCmp !== 0) return lastCmp;

            const aFirst = a.firstName ?? "";
            const bFirst = b.firstName ?? "";
            const firstCmp = aFirst.localeCompare(bFirst, "de");
            if (firstCmp !== 0) return firstCmp;

            // (optional stabil) Arbeitsplatz als letzter Tie-Breaker
            const aWork = a.workplace ?? "";
            const bWork = b.workplace ?? "";
            return aWork.localeCompare(bWork, "de");
          });

          return members;
        };

        const weekPreview = previewMeta.map(({ date, weekKey, isoDay }) => {
          const absenceReason = absenceReasonForDate(date);

          const dayKey = `${weekKey}-${isoDay}`;
          const assignmentsForDay = assignmentsByDayKey.get(dayKey) ?? [];
          const overridesForDay = overridesByDate.get(date) ?? [];
          const effectiveAssignments = assignmentsForDay.map((assignment) => {
            const matchingOverride = overridesForDay.find(
              (override) =>
                override.roomId === assignment.roomId &&
                override.originalEmployeeId === assignment.employeeId,
            );

            return {
              ...assignment,
              employeeId: matchingOverride
                ? (matchingOverride.newEmployeeId ?? null)
                : assignment.employeeId,
            };
          });

          const userAssignment = user.employeeId
            ? effectiveAssignments.find(
                (assignment) => assignment.employeeId === user.employeeId,
              )
            : undefined;

          let workplace: string | null = null;
          const teammates: Array<{
            firstName: string | null;
            lastName: string | null;
          }> = [];

          if (userAssignment) {
            const roomName = normalizeName(userAssignment.roomName);
            workplace =
              roomName && roomName !== "Diensthabende" ? roomName : null;

            if (userAssignment.roomId) {
              const seen = new Set<number>();
              for (const assignment of effectiveAssignments) {
                if (
                  !assignment.employeeId ||
                  assignment.employeeId === user.employeeId
                )
                  continue;
                if (assignment.roomId !== userAssignment.roomId) continue;
                if (seen.has(assignment.employeeId)) continue;
                seen.add(assignment.employeeId);

                const employeeData = employeeMetaMap.get(assignment.employeeId);
                const firstName = employeeData?.firstName ?? null;
                const lastName = employeeData?.lastName ?? null;
                if (!firstName && !lastName) continue;

                teammates.push({ firstName, lastName });
              }

              teammates.sort((a, b) => {
                const aLast = a.lastName ?? "";
                const bLast = b.lastName ?? "";
                const lastCompare = aLast.localeCompare(bLast);
                if (lastCompare !== 0) return lastCompare;
                const aFirst = a.firstName ?? "";
                const bFirst = b.firstName ?? "";
                return aFirst.localeCompare(bFirst);
              });
            }
          }

          const shift = userShifts.get(date);
          const statusLabel = shift ? getServiceLabel(shift.serviceType) : null;

          return {
            date,
            statusLabel,
            workplace,
            teammates,
            absenceReason,
          };
        });

        const todayWeekEntry = weekPreview[0] ?? null;
        const todayDutyShift = userShifts.get(todayVienna);

        const buildDutyTeammate = (
          shift: (typeof shiftRows)[0],
        ): { firstName: string | null; lastName: string | null } | null => {
          const firstName = normalizeName(shift.firstName);
          const lastName = normalizeName(shift.lastName);
          if (firstName || lastName) {
            return { firstName, lastName };
          }
          const fallback = normalize(shift.assigneeFreeText);
          if (fallback) {
            return { firstName: null, lastName: fallback };
          }
          return null;
        };

        const todayOthersOnDuty: Array<{
          firstName: string | null;
          lastName: string | null;
        }> = [];
        const seenDutyIdentities = new Set<string>();
        shiftRows.forEach((shift) => {
          if (
            shift.date !== todayVienna ||
            shift.employeeId === user.employeeId ||
            !shift.serviceType ||
            shift.serviceType === OVERDUTY_KEY
          ) {
            return;
          }
          const teammate = buildDutyTeammate(shift);
          if (!teammate) {
            return;
          }
          const identityKey = shift.employeeId
            ? `employee-${shift.employeeId}`
            : `text-${teammate.lastName ?? ""}-${teammate.firstName ?? ""}`;
          if (seenDutyIdentities.has(identityKey)) {
            return;
          }
          seenDutyIdentities.add(identityKey);
          todayOthersOnDuty.push(teammate);
        });
        todayOthersOnDuty.sort((a, b) => {
          const lastCompare = (a.lastName ?? "").localeCompare(
            b.lastName ?? "",
            "de",
          );
          if (lastCompare !== 0) return lastCompare;
          return (a.firstName ?? "").localeCompare(b.firstName ?? "", "de");
        });

        const todayDutyLabel = todayDutyShift
          ? getServiceLabel(todayDutyShift.serviceType)
          : null;
        const todayDuty = todayDutyShift
          ? {
              serviceType: todayDutyShift.serviceType ?? null,
              labelShort: todayDutyLabel,
              othersOnDuty: todayOthersOnDuty,
            }
          : null;

        const todayPayloadBase = {
          date: todayVienna,
          statusLabel: todayDutyLabel,
          workplace: todayWeekEntry?.workplace ?? null,
          teammates: todayWeekEntry?.teammates ?? [],
          absenceReason: todayWeekEntry?.absenceReason ?? null,
          duty: todayDuty,
          ze: null,
        };
        // --- Attendance widget (Heute / Morgen) -----------------------------------
        const todayMeta = previewMeta[0];
        const tomorrowMeta = previewMeta[1];

        // For the dashboard we only treat *approved* absences as “absent”,
        // otherwise the widget can become empty if many requests are still planned.
        const approvedAbsentEmployeeIdsForDate = (date: string) => {
          const set = new Set<number>();
          plannedAbsenceRowsForPreview.forEach((row) => {
            if (row.status !== "Genehmigt") return;
            const employeeId = row.employeeId;
            if (!employeeId) return;
            const rowStart = String(row.startDate);
            const rowEnd = String(row.endDate);
            if (rowStart <= date && rowEnd >= date) set.add(employeeId);
          });
          return set;
        };

        const todayAbsentIds = todayMeta
          ? approvedAbsentEmployeeIdsForDate(todayMeta.date)
          : new Set<number>();

        const tomorrowAbsentIds = tomorrowMeta
          ? approvedAbsentEmployeeIdsForDate(tomorrowMeta.date)
          : new Set<number>();

        const attendanceWidget =
          todayMeta && tomorrowMeta
            ? {
                today: {
                  members: buildAttendanceMembers(todayMeta, todayAbsentIds),
                  absentCount: todayAbsentIds.size,
                },
                tomorrow: {
                  members: buildAttendanceMembers(
                    tomorrowMeta,
                    tomorrowAbsentIds,
                  ),
                  absentCount: tomorrowAbsentIds.size,
                },
              }
            : null;
        let todayZe: { id: number; possible: true; accepted: boolean } | null =
          null;
        if (user.employeeId) {
          const [zeEntry] = await db
            .select({
              id: plannedAbsences.id,
              accepted: plannedAbsences.accepted,
            })
            .from(plannedAbsences)
            .where(
              and(
                eq(plannedAbsences.employeeId, user.employeeId),
                eq(plannedAbsences.reason, "Zeitausgleich"),
                lte(plannedAbsences.startDate, todayVienna),
                gte(plannedAbsences.endDate, todayVienna),
                ne(plannedAbsences.status, "Abgelehnt"),
              ),
            )
            .limit(1);
          if (zeEntry) {
            todayZe = {
              id: zeEntry.id,
              possible: true,
              accepted: Boolean(zeEntry.accepted),
            };
          }
        }
        const targetDate = parseIsoDateUtc(todayVienna);
        const birthdayCandidates = await db
          .select({
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
          .from(employees)
          .where(
            and(
              eq(employees.isActive, true),
              ne(employees.role, "Sekretariat"),
              isNotNull(employees.birthday),
              sql`EXTRACT(MONTH FROM ${employees.birthday}) = ${targetDate.getUTCMonth() + 1}`,
              sql`EXTRACT(DAY FROM ${employees.birthday}) = ${targetDate.getUTCDate()}`,
            ),
          )
          .orderBy(asc(employees.lastName))
          .limit(1);

        const birthdayPerson = birthdayCandidates[0];
        const birthday = birthdayPerson
          ? {
              firstName: normalize(birthdayPerson.firstName),
              lastName: normalize(birthdayPerson.lastName),
            }
          : null;

        const todayPayload = { ...todayPayloadBase, ze: todayZe };

        res.json({
          today: todayPayload,
          birthday,
          weekPreview,
          attendanceWidget,
        });
        } catch (error) {
          console.error("[Dashboard] Error:", error);
          res.status(500).json({ error: "Fehler beim Laden des Dashboards" });
        }
      },
    );

    app.get(
      "/api/dashboard/absences",
      requireAuth,
      async (req: Request, res: Response) => {
        try {
          const user = req.user!;
          const todayVienna = VIENNA_DATE_FORMAT.format(new Date());
          const fromParam = parseIsoDateParam(req.query.from);
          const toParam = parseIsoDateParam(req.query.to);
          const from = fromParam ?? todayVienna;
          const to =
            toParam ?? addDaysToIso(todayVienna, DASHBOARD_PREVIEW_DAYS - 1);
          const departmentId = user.departmentId;

          if (!departmentId) {
            return res.json({
              success: true,
              data: { from, to, days: [] },
            });
          }

          // Planned absences (Urlaub, Zeitausgleich, Ruhezeit, Fortbildung, ...)
          const plannedRows = await db
            .select({
              startDate: plannedAbsences.startDate,
              endDate: plannedAbsences.endDate,
              reason: plannedAbsences.reason,
              firstName: employees.firstName,
              lastName: employees.lastName,
            })
            .from(plannedAbsences)
            .innerJoin(employees, eq(plannedAbsences.employeeId, employees.id))
            .where(
              and(
                eq(employees.departmentId, departmentId),
                ne(plannedAbsences.status, "Abgelehnt"),
                gte(plannedAbsences.endDate, from),
                lte(plannedAbsences.startDate, to),
              ),
            );

          // Recorded absences (optional) – e.g. Krankenstand
          const recordedRows = await db
            .select({
              startDate: absences.startDate,
              endDate: absences.endDate,
              reason: absences.reason,
              firstName: employees.firstName,
              lastName: employees.lastName,
            })
            .from(absences)
            .innerJoin(employees, eq(absences.employeeId, employees.id))
            .where(
              and(
                eq(employees.departmentId, departmentId),
                gte(absences.endDate, from),
                lte(absences.startDate, to),
              ),
            );

          const rows = [...plannedRows, ...recordedRows];

          const fromDateObj = parseIsoDateUtc(from);
          const toDateObj = parseIsoDateUtc(to);
          const rangeEndDate =
            toDateObj < fromDateObj ? fromDateObj : toDateObj;
          const adjustedTo = toDateObj < fromDateObj ? from : to;
          const totalDays =
            Math.floor(
              (rangeEndDate.getTime() - fromDateObj.getTime()) / DAY_MS,
            ) + 1;
          const dayCount = Math.max(totalDays, 1);
          const dayRange = buildPreviewDateRange(from, dayCount);

          const dayMap = new Map<
            string,
            Map<AbsenceCategory, Set<string>>
          >();

          rows.forEach((row) => {
            const name = formatDisplayName(row.firstName, row.lastName);
            if (!name) return;

            const type = mapAbsenceCategory(row.reason);
            const entryStart = parseIsoDateUtc(
              typeof row.startDate === "string"
                ? row.startDate
                : formatDate(row.startDate),
            );
            const entryEnd = parseIsoDateUtc(
              typeof row.endDate === "string"
                ? row.endDate
                : formatDate(row.endDate),
            );

            if (entryEnd < fromDateObj || entryStart > rangeEndDate) {
              return;
            }

            const iterationStart =
              entryStart < fromDateObj
                ? new Date(fromDateObj)
                : new Date(entryStart);
            const iterationEnd =
              entryEnd > rangeEndDate
                ? new Date(rangeEndDate)
                : new Date(entryEnd);

            const cursor = new Date(iterationStart);
            while (cursor <= iterationEnd) {
              const dateKey = formatDateUtc(cursor);
              const typeMap = dayMap.get(dateKey) ?? new Map();
              const nameSet = typeMap.get(type) ?? new Set<string>();
              nameSet.add(name);
              typeMap.set(type, nameSet);
              dayMap.set(dateKey, typeMap);
              cursor.setUTCDate(cursor.getUTCDate() + 1);
            }
          });

          const days = dayRange.map((date) => {
            const typeMap = dayMap.get(date);
            if (!typeMap) {
              return { date, types: [] };
            }

            const types = Array.from(typeMap.entries())
              .map(([type, names]) => ({
                type,
                names: Array.from(names).sort((a, b) =>
                  a.localeCompare(b, "de"),
                ),
              }))
              .sort((a, b) => {
                const rankA = ABSENCE_CATEGORY_ORDER.indexOf(
                  a.type as AbsenceCategory,
                );
                const rankB = ABSENCE_CATEGORY_ORDER.indexOf(
                  b.type as AbsenceCategory,
                );
                const orderA =
                  rankA >= 0 ? rankA : ABSENCE_CATEGORY_ORDER.length;
                const orderB =
                  rankB >= 0 ? rankB : ABSENCE_CATEGORY_ORDER.length;
                return orderA - orderB;
              });

            return { date, types };
          });

          res.json({
            success: true,
            data: { from, to: adjustedTo, days },
          });
        } catch (error) {
          console.error("[Dashboard] Absences error:", error);
          res.status(500).json({
            success: false,
            error: "Fehler beim Laden der Abwesenheiten",
          });
        }
      },
    );

  app.post(
    "/api/zeitausgleich/:id/accept",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const zeId = Number(req.params.id);
        if (Number.isNaN(zeId)) {
          return res
            .status(400)
            .json({ success: false, error: "Ungültige Zeitausgleich-ID" });
        }

        const [entry] = await db
          .select()
          .from(plannedAbsences)
          .where(eq(plannedAbsences.id, zeId));

        if (!entry) {
          return res
            .status(404)
            .json({ success: false, error: "Zeitausgleich nicht gefunden" });
        }

        if (entry.reason !== "Zeitausgleich") {
          return res.status(400).json({
            success: false,
            error: "Nur Zeitausgleich-Einträge können akzeptiert werden",
          });
        }

        const currentEmployeeId = req.user?.employeeId;
        if (!currentEmployeeId || entry.employeeId !== currentEmployeeId) {
          return res.status(403).json({
            success: false,
            error: "Keine Berechtigung für diesen Zeitausgleich",
          });
        }

        if (entry.status === "Abgelehnt") {
          return res.status(400).json({
            success: false,
            error: "Dieser Zeitausgleich wurde bereits abgelehnt",
          });
        }

        const [updated] = await db
          .update(plannedAbsences)
          .set({
            accepted: true,
            acceptedAt: new Date(),
            acceptedById: currentEmployeeId,
            updatedAt: new Date(),
          })
          .where(eq(plannedAbsences.id, zeId))
          .returning();

        return res.json({
          success: true,
          data: {
            id: updated.id,
            accepted: Boolean(updated.accepted),
            acceptedAt: updated.acceptedAt,
            acceptedById: updated.acceptedById,
          },
        });
      } catch (error) {
        console.error("[Zeitausgleich] Accept error:", error);
        res.status(500).json({
          success: false,
          error: "Zeitausgleich konnte nicht akzeptiert werden",
        });
      }
    },
  );

  app.get(
    "/api/calendar-token",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          return res
            .status(401)
            .json({ success: false, error: "Anmeldung erforderlich" });
        }

        const regenerateParam = resolveQueryToken(req.query.regenerate);
        const regenerate =
          regenerateParam === "1" ||
          regenerateParam === "true" ||
          regenerateParam?.toLowerCase() === "true";
        let token: string;
        try {
          token = await ensureCalendarTokenForEmployee(
            req.user.employeeId,
            regenerate,
          );
        } catch (error) {
          if (isMissingCalendarTokensTableError(error)) {
            const fallbackToken = getAuthTokenFromRequest(req);
            if (fallbackToken) {
              return res.json({
                success: true,
                data: { token: fallbackToken },
              });
            }
          }
          throw error;
        }

        res.json({
          success: true,
          data: {
            token,
          },
        });
      } catch (error) {
        console.error("[Calendar Token] Error:", error);
        res
          .status(500)
          .json({ success: false, error: "Kalender-Token konnte nicht erstellt werden" });
      }
    },
  );

  app.get("/api/roster/calendar", async (req: Request, res: Response) => {
    try {
      const token = getCalendarTokenFromRequest(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          error: "Ungültiges oder abgelaufenes Token",
        });
      }

      let employeeId: number | undefined;
      const calendarRow = await storage.getCalendarTokenByToken(token);
      if (calendarRow) {
        employeeId = calendarRow.employeeId;
        await storage.touchCalendarToken(token);
      }

      if (!employeeId) {
        const [sessionRow] = await db
          .select({ employeeId: sessions.employeeId })
          .from(sessions)
          .where(eq(sessions.token, token))
          .limit(1);
        if (sessionRow) {
          employeeId = sessionRow.employeeId;
        } else {
          const jwtSecret = process.env.JWT_SECRET;
          if (!jwtSecret) {
            console.error("JWT_SECRET fehlt für Kalender-Token");
            return res.status(500).json({
              success: false,
              error: "Serverkonfiguration fehlerhaft",
            });
          }
          let payload: Record<string, unknown>;
          try {
            payload = verifyJwtIgnoreExpiration(token, jwtSecret);
          } catch (error) {
            return res.status(401).json({
              success: false,
              error: "Ungültiges oder abgelaufenes Token",
            });
          }
          const candidate =
            (typeof payload.employeeId === "number" && payload.employeeId) ||
            (typeof payload.userId === "number" && payload.userId) ||
            (typeof payload.id === "number" && payload.id) ||
            (typeof payload.sub === "number" && payload.sub) ||
            (typeof payload.employeeId === "string" &&
              Number(payload.employeeId)) ||
            (typeof payload.userId === "string" && Number(payload.userId)) ||
            (typeof payload.id === "string" && Number(payload.id)) ||
            (typeof payload.sub === "string" && Number(payload.sub));
          if (Number.isFinite(candidate)) {
            employeeId = Number(candidate);
          }
        }

        if (!employeeId) {
          return res.status(401).json({
            success: false,
            error: "Ungültiges oder abgelaufenes Token",
          });
        }
      }

      const sessionEmployee = await storage.getEmployee(employeeId);
      if (!sessionEmployee) {
        return res.status(401).json({
          success: false,
          error: "Ungültiges oder abgelaufenes Token",
        });
      }

      const monthsParam = Number(
        typeof req.query.months === "string" ? req.query.months : undefined,
      );
        const months = Number.isFinite(monthsParam)
          ? Math.min(Math.max(monthsParam, 1), 12)
          : 6;
        const startParam =
          typeof req.query.start === "string"
            ? new Date(req.query.start)
            : null;
        const startDate =
          startParam && !Number.isNaN(startParam.getTime())
            ? new Date(startParam.getFullYear(), startParam.getMonth(), 1)
            : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

        const monthStarts: Array<{ year: number; month: number }> = [];
        for (let i = 0; i < months; i += 1) {
          const date = new Date(
            startDate.getFullYear(),
            startDate.getMonth() + i,
            1,
          );
          monthStarts.push({
            year: date.getFullYear(),
            month: date.getMonth() + 1,
          });
        }

        const allShifts: RosterShift[] = [];
        for (const { year, month } of monthStarts) {
          const monthShifts = await storage.getRosterShiftsByMonth(year, month);
          allShifts.push(...monthShifts);
        }

        const [empClinic] = await db
          .select({ clinicId: departments.clinicId })
          .from(employees)
          .leftJoin(
            departments,
            eq(departments.id, employees.departmentId),
          )
          .where(eq(employees.id, employeeId ?? sessionEmployee.id))
          .limit(1);
        const clinicId = empClinic?.clinicId ?? null;
        if (!clinicId) {
          return res.status(400).json({ error: "Klinik-ID fehlt" });
        }

        const serviceLineRows = await loadServiceLines(clinicId);
        const serviceLineByKey = new Map(
          serviceLineRows.map((line) => [line.key, line]),
        );

        const employeeRows = await storage.getEmployees();
        const employeesById = new Map(
          employeeRows.map((emp) => [
            emp.id,
            {
              displayName: buildDisplayName(
                emp.firstName,
                emp.lastName,
                emp.name ?? emp.lastName,
              ),
              phonePrivate: emp.phonePrivate || null,
            },
          ]),
        );

        type ShiftsByDate = Record<string, RosterShift[]>;
const shiftsByDate: ShiftsByDate = allShifts.reduce<ShiftsByDate>(
  (acc, shift) => {
    if (!acc[shift.date]) acc[shift.date] = [];
    acc[shift.date].push(shift);
    return acc;
  },
  {},
);

        const currentEmployeeId = sessionEmployee.id;

        const dtStamp =
          new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

          const rosterSummaryForServiceType = (serviceType: string) => {
            const key = (serviceType || "").toLowerCase();
            if (key.includes("kreis") || key.includes("geb")) return "Nachtdienst (Geburtshilfe)";
            if (key === "gyn" || key.includes("gyn")) return "Nachtdienst (Gyn)";
            if (key.includes("turnus")) return "Turnusdienst";
            if (key.includes("over") || key.includes("ueber") || key.includes("über") || key === OVERDUTY_KEY.toLowerCase())
              return "Überdienst";
            if (key.includes("long")) return "LongDay";
            return serviceType;
          };

        const events = allShifts
          .filter((shift) => shift.employeeId === currentEmployeeId)
          .map((shift) => {
            const line = serviceLineByKey.get(shift.serviceType) || {
              key: shift.serviceType,
              label: shift.serviceType,
              startTime: "07:30",
              endTime: "08:00",
              endsNextDay: true,
              sortOrder: 0,
              isActive: true,
            };
            const startDateTime = buildDateTime(shift.date, line.startTime);
            const endDateTime = buildDateTime(shift.date, line.endTime);
            if (line.endsNextDay) {
              endDateTime.setDate(endDateTime.getDate() + 1);
            }
              const serviceLabel = rosterSummaryForServiceType(shift.serviceType);

            const others = (shiftsByDate[shift.date] || [])
              .filter((other) => other.employeeId !== currentEmployeeId)
              .map((other) => {
                const otherEmployee = other.employeeId
                  ? employeesById.get(other.employeeId)
                  : null;
                const name =
                  otherEmployee?.displayName ||
                  other.assigneeFreeText ||
                  "Unbekannt";
                if (
                  other.serviceType === OVERDUTY_KEY &&
                  otherEmployee?.phonePrivate
                ) {
                  return `${name} (${otherEmployee.phonePrivate})`;
                }
                return name;
              });

            const description = others.length
              ? others.join("\n")
              : "Keine weiteren Dienste";

            return [
              "BEGIN:VEVENT",
              `UID:roster-${shift.id}-${currentEmployeeId}@mycliniq`,
              `DTSTAMP:${dtStamp}`,
              `DTSTART:${toIcsDateTimeLocal(startDateTime)}`,
              `DTEND:${toIcsDateTimeLocal(endDateTime)}`,
              `SUMMARY:${escapeIcs(serviceLabel)}`,
              `DESCRIPTION:${escapeIcs(description)}`,
              "END:VEVENT",
            ].join("\r\n");
          });

        const calendar = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "X-PUBLISHED-TTL:PT1H",
          "PRODID:-//MyCliniQ//Roster//DE",
          "CALSCALE:GREGORIAN",
          "METHOD:PUBLISH",
          ...events,
          "END:VCALENDAR",
        ].join("\r\n");

        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          'inline; filename="dienstplan.ics"',
        );
        res.send(calendar);
      } catch (error: any) {
        console.error("Roster calendar export error:", error);
        res
          .status(500)
          .json({ error: "Kalender konnte nicht erstellt werden" });
      }
    },
  );

  app.get("/api/weekly/calendar", async (req: Request, res: Response) => {
    try {
      const token = getCalendarTokenFromRequest(req);
      if (!token) {
        return res.status(401).json({
          success: false,
          error: "Ungültiges oder abgelaufenes Token",
        });
      }

      let employeeId: number | undefined;
      const calendarRow = await storage.getCalendarTokenByToken(token);
      if (calendarRow) {
        employeeId = calendarRow.employeeId;
        await storage.touchCalendarToken(token);
      }

      if (!employeeId) {
        const [sessionRow] = await db
          .select({ employeeId: sessions.employeeId })
          .from(sessions)
          .where(eq(sessions.token, token))
          .limit(1);
        if (sessionRow) {
          employeeId = sessionRow.employeeId;
        } else {
          const jwtSecret = process.env.JWT_SECRET;
          if (!jwtSecret) {
            console.error("JWT_SECRET fehlt für Kalender-Token");
            return res.status(500).json({
              success: false,
              error: "Serverkonfiguration fehlerhaft",
            });
          }
          let payload: Record<string, unknown>;
          try {
            payload = verifyJwtIgnoreExpiration(token, jwtSecret);
          } catch (error) {
            return res.status(401).json({
              success: false,
              error: "Ungültiges oder abgelaufenes Token",
            });
          }
          const candidate =
            (typeof payload.employeeId === "number" && payload.employeeId) ||
            (typeof payload.userId === "number" && payload.userId) ||
            (typeof payload.id === "number" && payload.id) ||
            (typeof payload.sub === "number" && payload.sub) ||
            (typeof payload.employeeId === "string" &&
              Number(payload.employeeId)) ||
            (typeof payload.userId === "string" && Number(payload.userId)) ||
            (typeof payload.id === "string" && Number(payload.id)) ||
            (typeof payload.sub === "string" && Number(payload.sub));
          if (Number.isFinite(candidate)) {
            employeeId = Number(candidate);
          }
        }
      }

      if (!employeeId) {
        return res.status(401).json({
          success: false,
          error: "Ungültiges oder abgelaufenes Token",
        });
      }

      const sessionEmployee = await storage.getEmployee(employeeId);
      if (!sessionEmployee) {
        return res.status(401).json({
          success: false,
          error: "Ungültiges oder abgelaufenes Token",
        });
      }

      const [empClinic] = await db
        .select({ clinicId: departments.clinicId })
        .from(employees)
        .leftJoin(
          departments,
          eq(departments.id, employees.departmentId),
        )
        .where(eq(employees.id, employeeId))
        .limit(1);
      const clinicId = empClinic?.clinicId ?? null;
      if (!clinicId) {
        return res.status(400).json({ error: "Klinik-ID fehlt" });
      }

      const weeksParamValue =
        typeof req.query.weeks === "string"
          ? req.query.weeks
          : Array.isArray(req.query.weeks)
          ? req.query.weeks[0]
          : undefined;
      const weeksParam = Number(weeksParamValue);
      const weeks = Number.isFinite(weeksParam)
        ? Math.min(Math.max(Math.floor(weeksParam), 1), 26)
        : 8;

      const today = new Date();
      const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekOptions = {
        weekStartsOn: 1 as const,
        firstWeekContainsDate: 4 as const,
      };
      const weeksInfo: Array<{
        weekYear: number;
        weekNumber: number;
        startDate: Date;
      }> = [];
      for (let i = 0; i < weeks; i += 1) {
        const weekStart = addWeeks(currentWeekStart, i);
        weeksInfo.push({
          weekYear: getWeekYear(weekStart),
          weekNumber: getWeek(weekStart, weekOptions),
          startDate: weekStart,
        });
      }

      const weekStartByKey = new Map(
        weeksInfo.map((info) => [
          `${info.weekYear}-${info.weekNumber}`,
          info.startDate,
        ]),
      );

      const planKeyById = new Map<number, string>();
      await Promise.all(
        Array.from(weekStartByKey.keys()).map(async (weekKey) => {
          const [weekYearStr, weekNumberStr] = weekKey.split("-");
          const weekYear = Number(weekYearStr);
          const weekNumber = Number(weekNumberStr);
          const [planRow] = await db
            .select({
              id: weeklyPlans.id,
              year: weeklyPlans.year,
              weekNumber: weeklyPlans.weekNumber,
            })
            .from(weeklyPlans)
            .where(
              and(
                eq(weeklyPlans.year, weekYear),
                eq(weeklyPlans.weekNumber, weekNumber),
              ),
            )
            .limit(1);
          if (planRow?.id) {
            planKeyById.set(planRow.id, weekKey);
          }
        }),
      );

      const planIds = Array.from(planKeyById.keys());

      const assignments =
        planIds.length > 0
          ? await db
              .select({
                weeklyPlanId: weeklyPlanAssignments.weeklyPlanId,
                weekday: weeklyPlanAssignments.weekday,
                roomId: weeklyPlanAssignments.roomId,
                roomName: rooms.name,
                roomCategory: rooms.category,
                employeeId: weeklyPlanAssignments.employeeId,
                firstName: employees.firstName,
                lastName: employees.lastName,
                employeeName: employees.name,
                roleLabel: weeklyPlanAssignments.roleLabel,
              })
              .from(weeklyPlanAssignments)
              .leftJoin(rooms, eq(weeklyPlanAssignments.roomId, rooms.id))
              .leftJoin(
                employees,
                eq(weeklyPlanAssignments.employeeId, employees.id),
              )
              .where(inArray(weeklyPlanAssignments.weeklyPlanId, planIds))
          : [];

      type AssignmentEntry = {
        areaTitle: string;
        areaKey: string;
        isLongDay: boolean;
        date: string;
        employees: Array<{ id: number | null; name: string }>;
      };

      const containsLong = (value?: string | null) =>
        typeof value === "string" && value.toLowerCase().includes("long");

      const buildAreaTitle = (category?: string | null, name?: string | null) => {
        const parts: string[] = [];
        if (category) {
          const trimmed = category.trim();
          if (trimmed) parts.push(trimmed);
        }
        if (name) {
          const trimmed = name.trim();
          if (trimmed) parts.push(trimmed);
        }
        if (parts.length) {
          return parts.join(" | ");
        }
        return name || category || "Wochenplan";
      };

      const assignmentsByDateArea = new Map<string, AssignmentEntry>();

      assignments.forEach((assignment) => {
        if (
          !assignment.weeklyPlanId ||
          !assignment.weekday ||
          !planKeyById.has(assignment.weeklyPlanId)
        ) {
          return;
        }
        const weekKey = planKeyById.get(assignment.weeklyPlanId);
        if (!weekKey) return;
        const weekStart = weekStartByKey.get(weekKey);
        if (!weekStart) return;

        const eventDate = addDays(weekStart, assignment.weekday - 1);
        const dateKey = format(eventDate, "yyyy-MM-dd");
        const areaTitle = buildAreaTitle(
          assignment.roomCategory,
          assignment.roomName,
        );
        const areaIdKey = assignment.roomId
          ? `room-${assignment.roomId}`
          : `area-${areaTitle}`;
        const mapKey = `${dateKey}|${areaIdKey}`;
        const existing = assignmentsByDateArea.get(mapKey);
        const isLongDay =
          containsLong(areaTitle) ||
          containsLong(assignment.roleLabel) ||
          containsLong(assignment.roomCategory) ||
          containsLong(assignment.roomName);
        const entry: AssignmentEntry =
          existing ?? {
            areaTitle,
            areaKey: areaIdKey,
            isLongDay,
            date: dateKey,
            employees: [],
          };
        if (!existing) {
          assignmentsByDateArea.set(mapKey, entry);
        }

        if (assignment.employeeId) {
          entry.employees.push({
            id: assignment.employeeId,
            name: buildDisplayName(
              assignment.firstName,
              assignment.lastName,
              assignment.employeeName,
            ),
          });
        }
      });

      const events: string[] = [];
      const dtStamp =
        new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

      assignmentsByDateArea.forEach((entry) => {
        const hasCurrent = entry.employees.some((emp) => emp.id === employeeId);
        if (!hasCurrent) return;

        const coworkers = entry.employees
          .filter((emp) => emp.id && emp.id !== employeeId)
          .map((emp) => emp.name)
          .filter(
            (value, index, array) =>
              Boolean(value) && array.indexOf(value) === index,
          );
        const description = coworkers.length
          ? coworkers.join("\n")
          : "Keine weiteren Personen";
        const startTime = entry.isLongDay ? "13:30" : "07:30";
        const endTime = entry.isLongDay ? "18:00" : "13:30";
        const startDateTime = buildDateTime(entry.date, startTime);
        const endDateTime = buildDateTime(entry.date, endTime);

        const normalizedTitle = normalizeWorkplaceTitle(entry.areaTitle);
        events.push(
          [
            "BEGIN:VEVENT",
            `UID:weekly-${entry.date}-${entry.areaKey}-${employeeId}@mycliniq`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART:${toIcsDateTimeLocal(startDateTime)}`,
            `DTEND:${toIcsDateTimeLocal(endDateTime)}`,
            `SUMMARY:${escapeIcs(normalizedTitle)}`,
            `DESCRIPTION:${escapeIcs(description)}`,
            "END:VEVENT",
          ].join("\r\n"),
        );
      });

      const calendar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "X-PUBLISHED-TTL:PT1H",
        "PRODID:-//MyCliniQ//WeeklyPlan//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        ...events,
        "END:VCALENDAR",
      ].join("\r\n");

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'inline; filename="wochenplan.ics"',
      );
      res.send(calendar);
    } catch (error: any) {
      console.error("Weekly calendar export error:", error);
      res.status(500).json({ error: "Kalender konnte nicht erstellt werden" });
    }
  });

  app.get(
    "/api/roster/export",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const year = Number(req.query.year) || new Date().getFullYear();
        const month = Number(req.query.month) || new Date().getMonth() + 1;

        const shifts = await storage.getRosterShiftsByMonth(year, month);
        const employeeRows = await storage.getEmployees();
        const employeesById = new Map(
          employeeRows.map((emp) => [emp.id, emp.name]),
        );
        const clinicId = req.user?.clinicId;
        if (!clinicId) {
          return res.status(400).json({ error: "Klinik-ID fehlt" });
        }

        const serviceLineRows = await loadServiceLines(clinicId);
        const serviceLineMap = new Map(
          serviceLineRows.map((line) => [line.key, line]),
        );
        const keysWithShifts = new Set(
          shifts.map((shift) => shift.serviceType),
        );
        const extraKeys = Array.from(keysWithShifts).filter(
          (key) => !serviceLineMap.has(key),
        );
        const extraLines = extraKeys
          .sort((a, b) => a.localeCompare(b))
          .map((key) => ({
            key,
            label: key,
            startTime: "07:30",
            endTime: "08:00",
            endsNextDay: true,
            sortOrder: 999,
            isActive: true,
          }));
        const allLines = [...serviceLineRows, ...extraLines].filter(
          (line) => line.isActive || keysWithShifts.has(line.key),
        );

        const shiftsByDate = shifts.reduce<
          Record<string, Record<string, RosterShift>>
        >((acc, shift) => {
          if (!acc[shift.date]) {
            acc[shift.date] = {};
          }
          acc[shift.date][shift.serviceType] = shift;
          return acc;
        }, {});

        const toLabel = (shift?: RosterShift) => {
          if (!shift) return "-";
          if (shift.employeeId) {
            return employeesById.get(shift.employeeId) || "-";
          }
          return shift.assigneeFreeText || "-";
        };

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const rows = [
          ["Datum", "KW", "Tag", ...allLines.map((line) => line.label)],
        ];

        for (
          let date = new Date(startDate);
          date <= endDate;
          date.setDate(date.getDate() + 1)
        ) {
          const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
            date.getDate(),
          ).padStart(2, "0")}`;
          const weekNumber = getWeek(date, {
            weekStartsOn: 1,
            firstWeekContainsDate: 4,
          });
          const weekday = date
            .toLocaleDateString("de-DE", { weekday: "short" })
            .replace(".", "");
          const dayShifts = shiftsByDate[dateKey] || {};
          rows.push([
            date.toLocaleDateString("de-DE"),
            String(weekNumber),
            weekday,
            ...allLines.map((line) => toLabel(dayShifts[line.key])),
          ]);
        }

        const escapeCsv = (value: string) => {
          if (
            value.includes(";") ||
            value.includes('"') ||
            value.includes("\n")
          ) {
            return `"${value.replace(/\"/g, '""')}"`;
          }
          return value;
        };

        const csv =
          "\uFEFF" +
          rows.map((row) => row.map(escapeCsv).join(";")).join("\r\n");
        res.setHeader(
          "Content-Type",
          "application/vnd.ms-excel; charset=utf-8",
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="dienstplan-${year}-${String(month).padStart(2, "0")}.xls"`,
        );
        res.send(csv);
      } catch (error: any) {
        console.error("Roster export error:", error);
        res.status(500).json({ error: "Export fehlgeschlagen" });
      }
    },
  );

  // Shift swap request routes
  app.get("/api/shift-swaps", async (req: Request, res: Response) => {
    try {
      const { status, employeeId, targetEmployeeId } = req.query;

      if (status === "Ausstehend") {
        const requests = await storage.getPendingShiftSwapRequests();
        return res.json(requests);
      }

      if (employeeId) {
        const requests = await storage.getShiftSwapRequestsByEmployee(
          parseInt(employeeId as string),
        );
        return res.json(requests);
      }

      if (targetEmployeeId) {
        const requests = await storage.getShiftSwapRequestsByTargetEmployee(
          parseInt(targetEmployeeId as string),
        );
        return res.json(requests);
      }

      const requests = await storage.getShiftSwapRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift swap requests" });
    }
  });

  app.get("/api/shift-swaps/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const request = await storage.getShiftSwapRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Shift swap request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift swap request" });
    }
  });

  app.post("/api/shift-swaps", async (req: Request, res: Response) => {
    try {
      const {
        requesterShiftId,
        targetShiftId,
        requesterId,
        targetEmployeeId,
      } = req.body;
      if (
        !requesterShiftId ||
        !targetShiftId ||
        !requesterId ||
        !targetEmployeeId
      ) {
        return res
          .status(400)
          .json({ error: "Requester/Target shift and employees are required" });
      }

      const [requesterShift, targetShift] = await Promise.all([
        storage.getRosterShift(requesterShiftId),
        storage.getRosterShift(targetShiftId),
      ]);
      if (!requesterShift || !targetShift) {
        return res.status(404).json({ error: "Dienst nicht gefunden" });
      }
      if (requesterShift.employeeId !== requesterId) {
        return res
          .status(400)
          .json({ error: "RequesterShift fehlt oder falsch zugeordnet" });
      }
      if (targetShift.employeeId !== targetEmployeeId) {
        return res
          .status(400)
          .json({ error: "TargetShift stimmt nicht mit Zielperson überein" });
      }

      const currentEmployeeId = req.user?.employeeId;
      if (currentEmployeeId !== requesterShift.employeeId) {
        return res
          .status(403)
          .json({ error: "Nur eigene Dienste können getauscht werden" });
      }

      const requesterShiftEmployeeId = requesterShift.employeeId;
      const targetShiftEmployeeId = targetShift.employeeId;
      if (!requesterShiftEmployeeId || !targetShiftEmployeeId) {
        return res
          .status(400)
          .json({ error: "Dienst ohne zugeordnete Person" });
      }

      const clinicId = await resolveClinicIdFromUser(req.user);
      if (!clinicId) {
        return res
          .status(400)
          .json({ error: "Klinik-Kontext fehlt" });
      }

      const serviceLineRows = await db
        .select()
        .from(serviceLines)
        .where(
          and(
            eq(serviceLines.clinicId, clinicId),
            eq(serviceLines.isActive, true),
          ),
        );
      const swapLookup = buildServiceLineFlagLookup(serviceLineRows, "allowsSwap");
      const swapableKeys = swapLookup.rawKeys;
      const swapableNormalizedKeys = swapLookup.normalizedKeys;
      const matchesSwapableServiceType = (value?: string | null) =>
        Boolean(
          value &&
            (swapableKeys.has(value) ||
              swapableNormalizedKeys.has(normalizeServiceLineKey(value))),
        );

      if (
        !matchesSwapableServiceType(requesterShift.serviceType)
      ) {
        return res
          .status(403)
          .json({ error: "RequesterShift erlaubt keinen Tausch" });
      }
      if (!matchesSwapableServiceType(targetShift.serviceType)) {
        return res
          .status(403)
          .json({ error: "TargetShift erlaubt keinen Tausch" });
      }

      const [requesterEmployee] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, requesterShiftEmployeeId));
      const [targetEmployee] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, targetShiftEmployeeId));

      if (!requesterEmployee || !targetEmployee) {
        return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
      }

      const allowedRequesterSwapKeys = filterKeysByFlag(
        getEffectiveServiceLineKeys(requesterEmployee, serviceLineRows),
        serviceLineRows,
        "allowsSwap",
      );
      const allowedRequesterSwapNormalized = buildNormalizedServiceLineKeySet(
        allowedRequesterSwapKeys,
      );
      if (
        !allowedRequesterSwapNormalized.has(
          normalizeServiceLineKey(requesterShift.serviceType),
        )
      ) {
        return res
          .status(403)
          .json({
            error: "Sie dürfen diesen Diensttyp nicht tauschen",
          });
      }

      const allowedTargetSwapKeys = filterKeysByFlag(
        getEffectiveServiceLineKeys(targetEmployee, serviceLineRows),
        serviceLineRows,
        "allowsSwap",
      );
      const allowedTargetSwapNormalized = buildNormalizedServiceLineKeySet(
        allowedTargetSwapKeys,
      );
      if (
        !allowedTargetSwapNormalized.has(
          normalizeServiceLineKey(targetShift.serviceType),
        )
      ) {
        return res
          .status(403)
          .json({
            error: "Zielperson darf diesen Diensttyp nicht tauschen",
          });
      }

      const request = await storage.createShiftSwapRequest(req.body);
      res.status(201).json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to create shift swap request" });
    }
  });

  app.patch("/api/shift-swaps/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const request = await storage.updateShiftSwapRequest(id, req.body);
      if (!request) {
        return res.status(404).json({ error: "Shift swap request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to update shift swap request" });
    }
  });

  app.post(
    "/api/shift-swaps/:id/approve",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const { approverId, notes } = req.body;

        const request = await storage.updateShiftSwapRequest(id, {
          status: "Genehmigt",
          approverId,
          approverNotes: notes,
          decidedAt: new Date(),
        });

        if (!request) {
          return res
            .status(404)
            .json({ error: "Shift swap request not found" });
        }

        // If approved, swap the employees in the shifts
        if (request.targetShiftId && request.targetEmployeeId) {
          const requesterShift = await storage.getRosterShift(
            request.requesterShiftId,
          );
          const targetShift = await storage.getRosterShift(
            request.targetShiftId,
          );

          if (requesterShift && targetShift) {
            await storage.updateRosterShift(request.requesterShiftId, {
              employeeId: request.targetEmployeeId,
            });
            await storage.updateRosterShift(request.targetShiftId, {
              employeeId: request.requesterId,
            });
          }
        }

        await db
          .update(shiftSwapRequests)
          .set({
            status: "Abgelehnt",
            approverId: approverId ?? null,
            approverNotes:
              "Automatisch abgelehnt (anderer Tausch wurde angenommen).",
            decidedAt: new Date(),
          })
          .where(
            and(
              eq(shiftSwapRequests.requesterShiftId, request.requesterShiftId),
              eq(shiftSwapRequests.status, "Ausstehend"),
              ne(shiftSwapRequests.id, request.id),
            ),
          );

        res.json(request);
      } catch (error) {
        res.status(500).json({ error: "Failed to approve shift swap request" });
      }
    },
  );

  app.post(
    "/api/shift-swaps/:id/reject",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const { approverId, notes } = req.body;

        const request = await storage.updateShiftSwapRequest(id, {
          status: "Abgelehnt",
          approverId,
          approverNotes: notes,
          decidedAt: new Date(),
        });

        if (!request) {
          return res
            .status(404)
            .json({ error: "Shift swap request not found" });
        }

        res.json(request);
      } catch (error) {
        res.status(500).json({ error: "Failed to reject shift swap request" });
      }
    },
  );

  app.delete("/api/shift-swaps/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteShiftSwapRequest(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete shift swap request" });
    }
  });

  // Absence routes
  app.get("/api/absences", async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, employeeId } = req.query;

      if (employeeId) {
        const absences = await storage.getAbsencesByEmployee(
          parseInt(employeeId as string),
        );
        return res.json(absences);
      }

      if (startDate && endDate) {
        const absences = await storage.getAbsencesByDateRange(
          startDate as string,
          endDate as string,
        );
        return res.json(absences);
      }

      res.status(400).json({ error: "Missing required query parameters" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch absences" });
    }
  });

  app.post("/api/absences", async (req: Request, res: Response) => {
    try {
      const validatedData = insertAbsenceSchema.parse(req.body);
      const absence = await storage.createAbsence(validatedData);
      res.status(201).json(absence);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create absence" });
    }
  });

  app.delete("/api/absences/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAbsence(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete absence" });
    }
  });

  // Resource routes
  app.get("/api/resources", async (req: Request, res: Response) => {
    try {
      const resources = await storage.getResources();
      res.json(resources);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  app.patch("/api/resources/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const resource = await storage.updateResource(id, req.body);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      res.json(resource);
    } catch (error) {
      res.status(500).json({ error: "Failed to update resource" });
    }
  });

  // Weekly assignment routes
  app.get(
    "/api/weekly-assignments/:year/:week",
    async (req: Request, res: Response) => {
      try {
        const year = parseInt(req.params.year);
        const week = parseInt(req.params.week);
        const assignments = await storage.getWeeklyAssignments(year, week);
        res.json(assignments);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch weekly assignments" });
      }
    },
  );

  app.post("/api/weekly-assignments", async (req: Request, res: Response) => {
    try {
      const validatedData = insertWeeklyAssignmentSchema.parse(req.body);
      const assignment = await storage.upsertWeeklyAssignment(validatedData);
      res.status(201).json(assignment);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create weekly assignment" });
    }
  });

  app.post(
    "/api/weekly-assignments/bulk",
    async (req: Request, res: Response) => {
      try {
        const assignments = req.body.assignments;
        if (!Array.isArray(assignments)) {
          return res
            .status(400)
            .json({ error: "Assignments must be an array" });
        }
        const results = await storage.bulkUpsertWeeklyAssignments(assignments);
        res.status(201).json(results);
      } catch (error) {
        res.status(500).json({ error: "Failed to save weekly assignments" });
      }
    },
  );

  app.delete(
    "/api/weekly-assignments/:id",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        await storage.deleteWeeklyAssignment(id);
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: "Failed to delete weekly assignment" });
      }
    },
  );

  // Project Initiative routes
  app.get("/api/projects", async (req: Request, res: Response) => {
    try {
      const projects = await storage.getProjectInitiatives();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getProjectInitiative(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", async (req: Request, res: Response) => {
    try {
      const validatedData = insertProjectInitiativeSchema.parse(req.body);
      const project = await storage.createProjectInitiative(validatedData);
      res.status(201).json(project);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.updateProjectInitiative(id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectInitiative(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Project Tasks routes
  app.get(
    "/api/projects/:projectId/tasks",
    async (req: Request, res: Response) => {
      try {
        const projectId = parseInt(req.params.projectId);
        const tasks = await storage.getProjectTasks(projectId);
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks" });
      }
    },
  );

  app.get("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.getProjectTask(id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task" });
    }
  });

  app.post(
    "/api/projects/:projectId/tasks",
    async (req: Request, res: Response) => {
      try {
        const projectId = parseInt(req.params.projectId);
        const validatedData = insertProjectTaskSchema.parse({
          ...req.body,
          initiativeId: projectId,
        });
        const task = await storage.createProjectTask(validatedData);
        res.status(201).json(task);
      } catch (error: any) {
        if (error.name === "ZodError") {
          const validationError = fromZodError(error);
          return res.status(400).json({ error: validationError.message });
        }
        res.status(500).json({ error: "Failed to create task" });
      }
    },
  );

  app.patch("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.updateProjectTask(id, req.body);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectTask(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // Task Activities routes
  app.get(
    "/api/tasks/:taskId/activities",
    async (req: Request, res: Response) => {
      try {
        const taskId = parseInt(req.params.taskId);
        const activities = await storage.getTaskActivities(taskId);
        res.json(activities);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch activities" });
      }
    },
  );

  app.post(
    "/api/tasks/:taskId/activities",
    async (req: Request, res: Response) => {
      try {
        const taskId = parseInt(req.params.taskId);
        const validatedData = insertTaskActivitySchema.parse({
          ...req.body,
          taskId,
        });
        const activity = await storage.createTaskActivity(validatedData);
        res.status(201).json(activity);
      } catch (error: any) {
        if (error.name === "ZodError") {
          const validationError = fromZodError(error);
          return res.status(400).json({ error: validationError.message });
        }
        res.status(500).json({ error: "Failed to create activity" });
      }
    },
  );

  // Project Documents routes
  app.get(
    "/api/projects/:projectId/documents",
    async (req: Request, res: Response) => {
      try {
        const projectId = parseInt(req.params.projectId);
        const documents = await storage.getProjectDocuments(projectId);
        res.json(documents);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch documents" });
      }
    },
  );

  app.get("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getProjectDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post(
    "/api/projects/:projectId/documents",
    async (req: Request, res: Response) => {
      try {
        const projectId = parseInt(req.params.projectId);
        const validatedData = insertProjectDocumentSchema.parse({
          ...req.body,
          initiativeId: projectId,
        });
        const document = await storage.createProjectDocument(validatedData);
        res.status(201).json(document);
      } catch (error: any) {
        if (error.name === "ZodError") {
          const validationError = fromZodError(error);
          return res.status(400).json({ error: validationError.message });
        }
        res.status(500).json({ error: "Failed to create document" });
      }
    },
  );

  app.patch("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.updateProjectDocument(id, req.body);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectDocument(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Document publish to knowledge base
  app.post(
    "/api/documents/:id/publish",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const document = await storage.updateProjectDocument(id, {
          isPublished: true,
          publishedAt: new Date(),
          status: "Veröffentlicht",
        });
        if (!document) {
          return res.status(404).json({ error: "Document not found" });
        }
        res.json(document);
      } catch (error) {
        res.status(500).json({ error: "Failed to publish document" });
      }
    },
  );

  // Approvals routes
  app.get(
    "/api/documents/:documentId/approvals",
    async (req: Request, res: Response) => {
      try {
        const documentId = parseInt(req.params.documentId);
        const approvalList = await storage.getApprovals(documentId);
        res.json(approvalList);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch approvals" });
      }
    },
  );

  app.post(
    "/api/documents/:documentId/approvals",
    async (req: Request, res: Response) => {
      try {
        const documentId = parseInt(req.params.documentId);
        const validatedData = insertApprovalSchema.parse({
          ...req.body,
          documentId,
        });
        const approval = await storage.createApproval(validatedData);

        // Update document status to "Zur Prüfung"
        await storage.updateProjectDocument(documentId, {
          status: "Zur Prüfung",
        });

        res.status(201).json(approval);
      } catch (error: any) {
        if (error.name === "ZodError") {
          const validationError = fromZodError(error);
          return res.status(400).json({ error: validationError.message });
        }
        res.status(500).json({ error: "Failed to create approval request" });
      }
    },
  );

  app.patch("/api/approvals/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const approval = await storage.updateApproval(id, {
        ...req.body,
        decidedAt: new Date(),
      });
      if (!approval) {
        return res.status(404).json({ error: "Approval not found" });
      }

      // Update document status based on decision
      if (approval.decision === "Genehmigt") {
        await storage.updateProjectDocument(approval.documentId, {
          status: "Genehmigt",
        });
      } else if (
        approval.decision === "Abgelehnt" ||
        approval.decision === "Überarbeitung nötig"
      ) {
        await storage.updateProjectDocument(approval.documentId, {
          status: "In Bearbeitung",
        });
      }

      res.json(approval);
    } catch (error) {
      res.status(500).json({ error: "Failed to update approval" });
    }
  });

  // Published documents for knowledge base
  app.get("/api/knowledge/documents", async (req: Request, res: Response) => {
    try {
      const documents = await storage.getPublishedDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch published documents" });
    }
  });

  // Roster Settings routes
  app.get("/api/roster-settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getRosterSettings();
      if (!settings) {
        // Default: January 2026 as last approved month
      return res.json({
        lastApprovedYear: 2026,
        lastApprovedMonth: 1,
        wishYear: null,
        wishMonth: null,
        vacationLockFrom: null,
        vacationLockUntil: null,
        fixedPreferredEmployees: [],
      });
    }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch roster settings" });
    }
  });

  app.post("/api/roster-settings", async (req: Request, res: Response) => {
    try {
      const {
        lastApprovedYear,
        lastApprovedMonth,
        updatedById,
        vacationLockFrom,
        vacationLockUntil,
        fixedPreferredEmployees,
      } = req.body;
      const settings = await storage.upsertRosterSettings({
        lastApprovedYear,
        lastApprovedMonth,
        updatedById,
        vacationLockFrom,
        vacationLockUntil,
        fixedPreferredEmployees,
      });
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update roster settings" });
    }
  });

  app.get(
    "/api/online-users",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!req.user?.isAdmin) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }

        const now = new Date();
        const windowStart = new Date(now.getTime() - 5 * 60 * 1000);
        const activeSessions = await db
          .select({
            employeeId: sessions.employeeId,
            lastSeenAt: sessions.lastSeenAt,
          })
          .from(sessions)
          .where(
            and(
              gte(sessions.lastSeenAt, windowStart),
              gte(sessions.expiresAt, now),
            ),
          );

        const latestByEmployee = new Map<number, Date>();
        for (const session of activeSessions) {
          const lastSeen = session.lastSeenAt
            ? new Date(session.lastSeenAt)
            : null;
          if (!lastSeen) continue;
          const current = latestByEmployee.get(session.employeeId);
          if (!current || lastSeen > current) {
            latestByEmployee.set(session.employeeId, lastSeen);
          }
        }

        const employeeIds = [...latestByEmployee.keys()];
        if (employeeIds.length === 0) {
          return res.json({ count: 0, users: [] });
        }

        const rows = await db
          .select({
            id: employees.id,
            name: employees.name,
            lastName: employees.lastName,
            isActive: employees.isActive,
          })
          .from(employees)
          .where(inArray(employees.id, employeeIds));

        const users = rows
          .filter((row) => row.isActive)
          .map((row) => ({
            id: row.id,
            name: row.name,
            lastName: row.lastName || "",
            lastSeenAt: latestByEmployee.get(row.id)?.toISOString() ?? null,
          }))
          .sort((a, b) => {
            const lastNameCmp = a.lastName.localeCompare(b.lastName);
            if (lastNameCmp !== 0) return lastNameCmp;
            return a.name.localeCompare(b.name);
          });

        return res.json({ count: users.length, users });
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch online users" });
      }
    },
  );

  // Get the next planning month (month after last approved)
  app.get(
    "/api/roster-settings/next-planning-month",
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          return res
            .status(401)
            .json({ success: false, error: "Anmeldung erforderlich" });
        }
        if (
          req.user.accessScope === "external_duty" &&
          !hasCapability(req, "duty_plan.read")
        ) {
          return res
            .status(403)
            .json({ success: false, error: "Eingeschränkter Zugriff" });
        }
        const { settings, lastApproved, auto, shouldPersist } =
          await resolvePlanningMonth();
        const year = auto.year;
        const month = auto.month;

        if (shouldPersist) {
          try {
            await storage.upsertRosterSettings({
              lastApprovedYear: lastApproved.year,
              lastApprovedMonth: lastApproved.month,
              wishYear: auto.year,
              wishMonth: auto.month,
              fixedPreferredEmployees: settings?.fixedPreferredEmployees ?? [],
              updatedById: req.user?.employeeId ?? settings?.updatedById ?? null,
            });
          } catch (error) {
            console.error(
              "next planning month: failed to persist roster settings",
              error,
            );
          }
        }

        let totalEmployees = 0;
        let submittedCount = 0;
        let allSubmitted = false;
        let draftShiftCount = 0;
        let eligibleEmployeeIds: number[] = [];
        try {
          const employeeRows = await storage.getEmployees();
          const eligibleEmployees = employeeRows
            .filter((employee) => employeeDoesShifts(employee))
            .filter((employee) => isEligibleForWishMonth(employee, year, month));
          const eligibleIdSet = new Set(eligibleEmployees.map((emp) => emp.id));
          const wishes = await storage.getShiftWishesByMonth(year, month);
          submittedCount = wishes.filter(
            (wish) =>
              wish.status === "Eingereicht" &&
              eligibleIdSet.has(wish.employeeId),
          ).length;
          totalEmployees = eligibleEmployees.length;
          allSubmitted = totalEmployees > 0 && submittedCount >= totalEmployees;
          eligibleEmployeeIds = eligibleEmployees.map((emp) => emp.id);
        } catch (error) {
          console.error(
            "next planning month: failed to calculate wish submission stats",
            error,
          );
        }

        try {
          const rosterShifts = await storage.getRosterShiftsByMonth(year, month);
          draftShiftCount = rosterShifts.length;
        } catch (error) {
          console.error("next planning month: failed to load roster shifts", error);
        }

        return res.json({
          year,
          month,
          totalEmployees,
          submittedCount,
          allSubmitted,
          draftShiftCount,
          hasDraft: draftShiftCount > 0,
          eligibleEmployeeIds,
        });
      } catch (error) {
        console.error("next planning month error", error);
        res.status(500).json({ error: "Failed to get next planning month" });
      }
    },
  );

  app.post(
    "/api/roster-settings/wishes",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!canViewPlanningData(req)) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }

        const { year, month } = req.body;
        if (
          !Number.isInteger(year) ||
          !Number.isInteger(month) ||
          month < 1 ||
          month > 12
        ) {
          return res.status(400).json({ error: "Ungültiger Monat" });
        }

        const { settings, lastApproved } = await resolvePlanningMonth();
        const minAllowed = addMonth(lastApproved.year, lastApproved.month);
        if (compareYearMonth(year, month, minAllowed.year, minAllowed.month) < 0) {
          return res.status(400).json({
            error: "Wunschmonat darf nicht vor dem Monat nach dem letzten freigegebenen Plan liegen",
          });
        }

        const updated = await storage.upsertRosterSettings({
          lastApprovedYear: lastApproved.year,
          lastApprovedMonth: lastApproved.month,
          wishYear: year,
          wishMonth: month,
          updatedById: req.user?.employeeId ?? settings?.updatedById ?? null,
        });

        res.json(updated);
      } catch (error) {
        res.status(500).json({ error: "Failed to update wish month" });
      }
    },
  );

  // Shift Wishes routes
    app.get("/api/shift-wishes", requireAuth, async (req: Request, res: Response) => {
      try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Anmeldung erforderlich" });
      }
      if (
        req.user.accessScope === "external_duty" &&
        !hasCapability(req, "shift_wishes.read")
      ) {
        return res
          .status(403)
          .json({ success: false, error: "Eingeschränkter Zugriff" });
      }

      const { year, month, employeeId } = req.query;

      if (employeeId && year && month) {
        const targetId = parseInt(employeeId as string);
        if (!req.user?.isAdmin && req.user?.appRole !== "Admin" && req.user?.employeeId !== targetId) {
          return res.status(403).json({ error: "Zugriff nur auf eigene Daten erlaubt" });
        }
        const wish = await storage.getShiftWishByEmployeeAndMonth(
          targetId,
          parseInt(year as string),
          parseInt(month as string),
        );
        return res.json(wish || null);
      }

      if (year && month) {
        if (!canViewPlanningData(req)) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }
        const wishes = await storage.getShiftWishesByMonth(
          parseInt(year as string),
          parseInt(month as string),
        );
        return res.json(wishes);
      }

      res.status(400).json({ error: "Jahr und Monat sind erforderlich" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift wishes" });
    }
  });

  app.post("/api/shift-wishes", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Anmeldung erforderlich" });
      }
      if (
        req.user.accessScope === "external_duty" &&
        !hasCapability(req, "shift_wishes.write")
      ) {
        return res
          .status(403)
          .json({ success: false, error: "Eingeschränkter Zugriff" });
      }

      const payload = req.body as any;
      const currentEmployeeId = req.user?.employeeId;
      const isAdmin = Boolean(req.user?.isAdmin || req.user?.appRole === "Admin");

      if (!isAdmin && currentEmployeeId && payload?.employeeId !== currentEmployeeId) {
        return res.status(403).json({ error: "Zugriff nur auf eigene Daten erlaubt" });
      }

      const targetEmployeeId = Number(payload?.employeeId ?? currentEmployeeId);
      if (!targetEmployeeId) {
        return res.status(400).json({ error: "EmployeeId fehlt" });
      }
      const employee = await storage.getEmployee(targetEmployeeId);
      if (!employee) {
        return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
      }
      const year = Number(payload?.year);
      const month = Number(payload?.month);
      if (!year || !month) {
        return res.status(400).json({ error: "Jahr und Monat sind erforderlich" });
      }
      if (!isEligibleForWishMonth(employee, year, month)) {
        return res.status(400).json({
          error:
            "Wunschmonat liegt außerhalb Beschäftigungszeit / Langzeit-Deaktivierung.",
        });
      }

      // New flow: a persisted wish is treated as submitted.
      const wish = await storage.createShiftWish({
        ...payload,
        status: "Eingereicht",
        submittedAt: new Date(),
      });

      res.status(201).json(wish);
    } catch (error) {
      res.status(500).json({ error: "Failed to create shift wish" });
    }
  });

  app.patch("/api/shift-wishes/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Anmeldung erforderlich" });
      }
      if (
        req.user.accessScope === "external_duty" &&
        !hasCapability(req, "shift_wishes.write")
      ) {
        return res
          .status(403)
          .json({ success: false, error: "Eingeschränkter Zugriff" });
      }

      const id = parseInt(req.params.id);
      const existing = await storage.getShiftWish(id);
      if (!existing) {
        return res.status(404).json({ error: "Shift wish not found" });
      }

      const currentEmployeeId = req.user?.employeeId;
      const isAdmin = Boolean(req.user?.isAdmin || req.user?.appRole === "Admin");
      if (!isAdmin && existing.employeeId !== currentEmployeeId) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      const payload = { ...(req.body as any) };
      delete payload.status;
      delete payload.submittedAt;
      delete payload.employeeId;

      const wish = await storage.updateShiftWish(id, {
        ...payload,
        status: "Eingereicht",
        submittedAt: new Date(),
      });
      if (!wish) {
        return res.status(404).json({ error: "Shift wish not found" });
      }

      res.json(wish);
    } catch (error) {
      res.status(500).json({ error: "Failed to update shift wish" });
    }
  });

  app.post(
    "/api/shift-wishes/:id/submit",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          return res
            .status(401)
            .json({ success: false, error: "Anmeldung erforderlich" });
        }
        if (
          req.user.accessScope === "external_duty" &&
          !hasCapability(req, "shift_wishes.write")
        ) {
          return res
            .status(403)
            .json({ success: false, error: "Eingeschränkter Zugriff" });
        }

        const id = parseInt(req.params.id);
        const existing = await storage.getShiftWish(id);
        if (!existing) {
          return res.status(404).json({ error: "Shift wish not found" });
        }

        const currentEmployeeId = req.user?.employeeId;
        const isAdmin = Boolean(req.user?.isAdmin || req.user?.appRole === "Admin");
        if (!isAdmin && existing.employeeId !== currentEmployeeId) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }

        const employee = await storage.getEmployee(existing.employeeId);
        if (!employee) {
          return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
        }
        if (!isEligibleForWishMonth(employee, existing.year, existing.month)) {
          return res.status(400).json({
            error:
              "Wunschmonat liegt außerhalb Beschäftigungszeit / Langzeit-Deaktivierung.",
          });
        }

        const wish = await storage.updateShiftWish(id, {
          status: "Eingereicht",
          submittedAt: new Date(),
        });
        if (!wish) {
          return res.status(404).json({ error: "Shift wish not found" });
        }
        res.json(wish);
      } catch (error) {
        res.status(500).json({ error: "Failed to submit shift wish" });
      }
    },
  );
  app.post(
    "/api/shift-wishes/:id/reopen",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        return res.status(410).json({
          error:
            "Reopen ist deaktiviert. Wünsche bleiben im Status Eingereicht und sind direkt bearbeitbar.",
        });
      } catch (error) {
        console.error("Reopen shift wish error:", error);
        res.status(500).json({ error: "Bearbeiten fehlgeschlagen" });
      }
    },
  );
  app.delete("/api/shift-wishes/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Anmeldung erforderlich" });
      }
      if (
        req.user.accessScope === "external_duty" &&
        !hasCapability(req, "shift_wishes.write")
      ) {
        return res
          .status(403)
          .json({ success: false, error: "Eingeschränkter Zugriff" });
      }

      const id = parseInt(req.params.id);
      const existing = await storage.getShiftWish(id);
      if (!existing) {
        return res.status(404).json({ error: "Shift wish not found" });
      }

      const currentEmployeeId = req.user?.employeeId;
      const isAdmin = Boolean(req.user?.isAdmin || req.user?.appRole === "Admin");
      if (!isAdmin && existing.employeeId !== currentEmployeeId) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      if (existing.status === "Eingereicht") {
        return res.status(400).json({ error: "Eingereichte Wünsche können nicht gelöscht werden" });
      }
      await storage.deleteShiftWish(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete shift wish" });
    }
  });

  // Long-term shift wishes routes
  app.get("/api/long-term-wishes", async (req: Request, res: Response) => {
    try {
      const { employeeId, status } = req.query;

      if (employeeId) {
        const targetId = parseInt(employeeId as string);
        if (req.user && !req.user.isAdmin && req.user.employeeId !== targetId) {
          return res
            .status(403)
            .json({ error: "Zugriff nur auf eigene Daten erlaubt" });
        }
        const wish = await storage.getLongTermShiftWishByEmployee(targetId);
        return res.json(wish || null);
      }

      if (status) {
        const allowed = await canApproveLongTermWishes(req);
        if (!allowed) {
          return res
            .status(403)
            .json({ error: "Keine Berechtigung für diese Aktion" });
        }
        const wishes = await storage.getLongTermShiftWishesByStatus(
          status as string,
        );
        return res.json(wishes);
      }

      res
        .status(400)
        .json({ error: "employeeId oder status ist erforderlich" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch long-term wishes" });
    }
  });

  app.post("/api/long-term-wishes", async (req: Request, res: Response) => {
    try {
      const payload = insertLongTermShiftWishSchema.parse(req.body);
      if (
        req.user &&
        !req.user.isAdmin &&
        req.user.employeeId !== payload.employeeId
      ) {
        return res
          .status(403)
          .json({ error: "Zugriff nur auf eigene Daten erlaubt" });
      }
      const wish = await storage.upsertLongTermShiftWish(payload);
      res.json(wish);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to save long-term wish" });
    }
  });

  app.post(
    "/api/long-term-wishes/:id/submit",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const existing = await storage.getLongTermShiftWish(id);
        if (!existing) {
          return res.status(404).json({ error: "Long-term wish not found" });
        }
        if (
          req.user &&
          !req.user.isAdmin &&
          req.user.employeeId !== existing.employeeId
        ) {
          return res
            .status(403)
            .json({ error: "Zugriff nur auf eigene Daten erlaubt" });
        }
        const wish = await storage.updateLongTermShiftWish(id, {
          status: "Eingereicht",
          submittedAt: new Date(),
        });
        res.json(wish);
      } catch (error) {
        res.status(500).json({ error: "Failed to submit long-term wish" });
      }
    },
  );

  app.post(
    "/api/long-term-wishes/:id/approve",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const allowed = await canApproveLongTermWishes(req);
        if (!allowed) {
          return res
            .status(403)
            .json({ error: "Keine Berechtigung für diese Aktion" });
        }
        const existing = await storage.getLongTermShiftWish(id);
        if (!existing) {
          return res.status(404).json({ error: "Long-term wish not found" });
        }
        const wish = await storage.updateLongTermShiftWish(id, {
          status: "Genehmigt",
          approvedAt: new Date(),
          approvedById: req.user?.employeeId,
          approvalNotes: req.body?.notes || null,
        });
        res.json(wish);
      } catch (error) {
        res.status(500).json({ error: "Failed to approve long-term wish" });
      }
    },
  );

  app.post(
    "/api/long-term-wishes/:id/reject",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const allowed = await canApproveLongTermWishes(req);
        if (!allowed) {
          return res
            .status(403)
            .json({ error: "Keine Berechtigung für diese Aktion" });
        }
        const existing = await storage.getLongTermShiftWish(id);
        if (!existing) {
          return res.status(404).json({ error: "Long-term wish not found" });
        }
        const wish = await storage.updateLongTermShiftWish(id, {
          status: "Abgelehnt",
          approvedAt: new Date(),
          approvedById: req.user?.employeeId,
          approvalNotes: req.body?.notes || null,
        });
        res.json(wish);
      } catch (error) {
        res.status(500).json({ error: "Failed to reject long-term wish" });
      }
    },
  );

  // Long-term absences routes
  app.get("/api/long-term-absences", requireAuth, async (req: Request, res: Response) => {
    try {
      const { employeeId, status, from, to } = req.query;

      if (employeeId) {
        const targetId = parseInt(employeeId as string);
        if (req.user && !req.user.isAdmin && req.user.employeeId !== targetId) {
          return res
            .status(403)
            .json({ error: "Zugriff nur auf eigene Daten erlaubt" });
        }
        const absences = await storage.getLongTermAbsencesByEmployee(targetId);
        return res.json(absences);
      }

      if (status) {
        let absences = await storage.getLongTermAbsencesByStatus(
          status as string,
        );
        if (from || to) {
          const fromDate = from ? String(from) : null;
          const toDate = to ? String(to) : null;
          absences = absences.filter((absence) => {
            if (fromDate && absence.endDate < fromDate) return false;
            if (toDate && absence.startDate > toDate) return false;
            return true;
          });
        }
        return res.json(absences);
      }

      res
        .status(400)
        .json({ error: "employeeId oder status ist erforderlich" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch long-term absences" });
    }
  });

  app.post("/api/long-term-absences", async (req: Request, res: Response) => {
    try {
      const payload = insertLongTermAbsenceSchema.parse(req.body);
      if (
        req.user &&
        !req.user.isAdmin &&
        req.user.employeeId !== payload.employeeId
      ) {
        return res
          .status(403)
          .json({ error: "Zugriff nur auf eigene Daten erlaubt" });
      }
      if (payload.startDate > payload.endDate) {
        return res
          .status(400)
          .json({ error: "Enddatum muss nach dem Startdatum liegen" });
      }
      const reason = payload.reason?.trim();
      if (!reason) {
        return res.status(400).json({ error: "Begruendung ist erforderlich" });
      }
      const absence = await storage.createLongTermAbsence({
        ...payload,
        reason,
        status: "Entwurf",
        submittedAt: null,
        approvedAt: null,
        approvedById: null,
        approvalNotes: null,
      });
      res.json(absence);
    } catch (error: any) {
      if (error.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to save long-term absence" });
    }
  });

  app.patch(
    "/api/long-term-absences/:id",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const existing = await storage.getLongTermAbsence(id);
        if (!existing) {
          return res.status(404).json({ error: "Long-term absence not found" });
        }
        if (
          req.user &&
          !req.user.isAdmin &&
          req.user.employeeId !== existing.employeeId
        ) {
          return res
            .status(403)
            .json({ error: "Zugriff nur auf eigene Daten erlaubt" });
        }
        if (
          existing.status === "Eingereicht" ||
          existing.status === "Genehmigt"
        ) {
          return res.status(400).json({
            error: "Einreichungen koennen nicht mehr bearbeitet werden",
          });
        }
        const payload = insertLongTermAbsenceSchema.partial().parse(req.body);
        delete (payload as { status?: unknown }).status;
        delete (payload as { submittedAt?: unknown }).submittedAt;
        delete (payload as { approvedAt?: unknown }).approvedAt;
        delete (payload as { approvedById?: unknown }).approvedById;
        delete (payload as { approvalNotes?: unknown }).approvalNotes;
        delete (payload as { employeeId?: unknown }).employeeId;
        if (typeof payload.reason === "string") {
          payload.reason = payload.reason.trim();
        }
        if (payload.reason === "") {
          return res
            .status(400)
            .json({ error: "Begruendung ist erforderlich" });
        }
        if (
          payload.startDate &&
          payload.endDate &&
          payload.startDate > payload.endDate
        ) {
          return res
            .status(400)
            .json({ error: "Enddatum muss nach dem Startdatum liegen" });
        }
        const updated = await storage.updateLongTermAbsence(id, payload);
        res.json(updated);
      } catch (error: any) {
        if (error.name === "ZodError") {
          const validationError = fromZodError(error);
          return res.status(400).json({ error: validationError.message });
        }
        res.status(500).json({ error: "Failed to update long-term absence" });
      }
    },
  );

  app.post(
    "/api/long-term-absences/:id/submit",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const existing = await storage.getLongTermAbsence(id);
        if (!existing) {
          return res.status(404).json({ error: "Long-term absence not found" });
        }
        if (
          req.user &&
          !req.user.isAdmin &&
          req.user.employeeId !== existing.employeeId
        ) {
          return res
            .status(403)
            .json({ error: "Zugriff nur auf eigene Daten erlaubt" });
        }
        const updated = await storage.updateLongTermAbsence(id, {
          status: "Eingereicht",
          submittedAt: new Date(),
        });
        res.json(updated);
      } catch (error) {
        res.status(500).json({ error: "Failed to submit long-term absence" });
      }
    },
  );

  app.post(
    "/api/long-term-absences/:id/approve",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const allowed = await canApproveLongTermWishes(req);
        if (!allowed) {
          return res
            .status(403)
            .json({ error: "Keine Berechtigung für diese Aktion" });
        }
        const existing = await storage.getLongTermAbsence(id);
        if (!existing) {
          return res.status(404).json({ error: "Long-term absence not found" });
        }
        const updated = await storage.updateLongTermAbsence(id, {
          status: "Genehmigt",
          approvedAt: new Date(),
          approvedById: req.user?.employeeId,
          approvalNotes: req.body?.notes || null,
        });
        res.json(updated);
      } catch (error) {
        res.status(500).json({ error: "Failed to approve long-term absence" });
      }
    },
  );

  app.post(
    "/api/long-term-absences/:id/reject",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const allowed = await canApproveLongTermWishes(req);
        if (!allowed) {
          return res
            .status(403)
            .json({ error: "Keine Berechtigung für diese Aktion" });
        }
        const existing = await storage.getLongTermAbsence(id);
        if (!existing) {
          return res.status(404).json({ error: "Long-term absence not found" });
        }
        const updated = await storage.updateLongTermAbsence(id, {
          status: "Abgelehnt",
          approvedAt: new Date(),
          approvedById: req.user?.employeeId,
          approvalNotes: req.body?.notes || null,
        });
        res.json(updated);
      } catch (error) {
        res.status(500).json({ error: "Failed to reject long-term absence" });
      }
    },
  );

  // Planned Absences routes
  app.get("/api/planned-absences", async (req: Request, res: Response) => {
    try {
      const { year, month, employeeId } = req.query;

      if (!req.user) {
        return res.status(401).json({ error: "Anmeldung erforderlich" });
      }

      const canViewAll =
        req.user.isAdmin ||
        (req.user.capabilities?.includes("vacation.approve") ?? false) ||
        (req.user.capabilities?.includes("vacation.lock") ?? false);

      if (employeeId && year && month) {
        if (
          !canViewAll &&
          req.user.employeeId !== parseInt(employeeId as string)
        ) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }
        const absences = await storage.getPlannedAbsencesByEmployee(
          parseInt(employeeId as string),
          parseInt(year as string),
          parseInt(month as string),
        );
        return res.json(absences);
      }

      if (year && month) {
        if (!canViewAll) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }
        const absences = await storage.getPlannedAbsencesByMonth(
          parseInt(year as string),
          parseInt(month as string),
        );
        return res.json(absences);
      }

      res.status(400).json({ error: "Jahr und Monat sind erforderlich" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch planned absences" });
    }
  });

  app.post("/api/planned-absences", async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Anmeldung erforderlich" });
      }

      const validatedData = insertPlannedAbsenceSchema.parse(req.body);
      if (
        !req.user.isAdmin &&
        req.user.employeeId !== validatedData.employeeId
      ) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      if (validatedData.reason === "Urlaub") {
        const entitlementCheck = await ensurePlannedVacationEntitlement(
          validatedData.employeeId,
          String(validatedData.startDate),
          String(validatedData.endDate),
        );
        if (!entitlementCheck.ok) {
          return res.status(400).json({
            error: entitlementCheck.error || "Urlaubsanspruch ueberschritten",
          });
        }
      }

      const absence = await storage.createPlannedAbsence({
        ...validatedData,
        createdById: req.user.employeeId,
      });
      res.status(201).json(absence);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        const validationError = fromZodError(error as any);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create planned absence" });
    }
  });

  app.patch(
    "/api/planned-absences/:id",
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: "Anmeldung erforderlich" });
        }

        const id = parseInt(req.params.id);
        const existing = await db
          .select()
          .from(plannedAbsences)
          .where(eq(plannedAbsences.id, id));

        if (!existing.length) {
          return res.status(404).json({ error: "Planned absence not found" });
        }

        const current = existing[0];
        if (!req.user.isAdmin && req.user.employeeId !== current.employeeId) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }

        const next = {
          ...current,
          ...req.body,
        } as any;

        if (next.reason === "Urlaub" && next.status !== "Abgelehnt") {
          const entitlementCheck = await ensurePlannedVacationEntitlement(
            current.employeeId,
            String(next.startDate),
            String(next.endDate),
            id,
          );
          if (!entitlementCheck.ok) {
            return res.status(400).json({
              error: entitlementCheck.error || "Urlaubsanspruch ueberschritten",
            });
          }
        }

        const absence = await storage.updatePlannedAbsence(id, req.body);
        if (!absence) {
          return res.status(404).json({ error: "Planned absence not found" });
        }
        res.json(absence);
      } catch (error) {
        res.status(500).json({ error: "Failed to update planned absence" });
      }
    },
  );

  app.delete(
    "/api/planned-absences/:id",
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: "Anmeldung erforderlich" });
        }

        const id = parseInt(req.params.id);
        const existing = await db
          .select()
          .from(plannedAbsences)
          .where(eq(plannedAbsences.id, id));

        if (!existing.length) {
          return res.status(404).json({ error: "Planned absence not found" });
        }

        if (
          !req.user.isAdmin &&
          req.user.employeeId !== existing[0].employeeId
        ) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }

        await storage.deletePlannedAbsence(id);
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: "Failed to delete planned absence" });
      }
    },
  );

  return httpServer;
}
