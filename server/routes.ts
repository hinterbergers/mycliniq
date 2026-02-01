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
};

type OpenShiftPayload = {
  slots: OpenShiftSlot[];
  requiredDaily: Record<string, number>;
  countsByDay: Record<string, Record<string, number>>;
  missingCounts: Record<string, number>;
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
  year,
  month,
  includeDraft,
}: {
  clinicId: number;
  year: number;
  month: number;
  includeDraft?: boolean;
}): Promise<OpenShiftPayload> => {
  const lastDay = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${padTwo(month)}-01`;
  const monthEnd = `${year}-${padTwo(month)}-${padTwo(lastDay)}`;

  const serviceLineRows = await db
    .select()
    .from(serviceLines)
    .where(
      and(
        eq(serviceLines.clinicId, clinicId),
        eq(serviceLines.isActive, true),
      ),
    );

  const requiredDailyMap = new Map<string, number>();
  for (const line of serviceLineRows) {
    const rawValue =
      typeof line.requiredDaily === "number"
        ? line.requiredDaily
        : line.requiredDaily
          ? 1
          : 0;
    const normalized = Math.max(0, Number(rawValue) || 0);
    if (normalized > 0 && line.key) {
      requiredDailyMap.set(line.key, normalized);
    }
  }

  const countsByDay: Record<string, Record<string, number>> = {};
  const serviceKeys = Array.from(requiredDailyMap.keys());
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${year}-${padTwo(month)}-${padTwo(day)}`;
    countsByDay[date] = {};
    for (const serviceType of serviceKeys) {
      countsByDay[date][serviceType] = 0;
    }
  }

  const slots: OpenShiftSlot[] = [];
  if (serviceKeys.length > 0) {
    const conditions = [
      gte(rosterShifts.date, monthStart),
      lte(rosterShifts.date, monthEnd),
    ];
    if (!includeDraft) {
      conditions.push(eq(rosterShifts.isDraft, false));
    }

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
      if (
        !shift.serviceType ||
        countsByDay[shift.date]?.[shift.serviceType] === undefined
      ) {
        continue;
      }
      countsByDay[shift.date][shift.serviceType] += 1;

      const isOpen =
        !shift.employeeId && !(shift.assigneeFreeText ?? "").trim();

      if (isOpen) {
        slots.push({
          id: shift.id,
          date: shift.date,
          serviceType: shift.serviceType,
          isSynthetic: false,
          source: shift.isDraft ? "draft" : "final",
        });
      }
    }
  }

  const missingCounts: Record<string, number> = {};
  const syntheticSlots: OpenShiftSlot[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${year}-${padTwo(month)}-${padTwo(day)}`;
    for (const serviceType of serviceKeys) {
      const dayCount = countsByDay[date]?.[serviceType] ?? 0;
      const required = requiredDailyMap.get(serviceType) ?? 0;
      const missing = Math.max(0, required - dayCount);
      if (missing <= 0) continue;
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
        });
      }
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

const getAuthTokenFromRequest = (req: Request): string | null => {
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
    const rawSettings = await storage.getRosterSettings();

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

    const previewPlan = await storage.getLatestDutyPlanByStatus("Vorläufig");
    const lastApproved = settings
      ? { year: settings.lastApprovedYear, month: settings.lastApprovedMonth }
      : DEFAULT_LAST_APPROVED;
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
    const shouldPersistFinal = storedWish ? false : shouldPersist;

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

      const tryParseIso = (value: string) => {
        if (!value) return null;
        const iso = parseIsoDateParam(value);
        if (!iso) return null;
        const parsed = parseISO(iso);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
      };

      // Fallback to ISO range only when BOTH year and month are missing.
      const fallbackDate = tryParseIso(rawFrom) ?? tryParseIso(rawTo);

      const year = Number.isFinite(yearParam ?? NaN)
        ? (yearParam as number)
        : yearParam === null && monthParam === null && fallbackDate
          ? fallbackDate.getFullYear()
          : now.getFullYear();

      const month = Number.isFinite(monthParam ?? NaN)
        ? (monthParam as number)
        : yearParam === null && monthParam === null && fallbackDate
          ? fallbackDate.getMonth() + 1
          : now.getMonth() + 1;

      if (month < 1 || month > 12) {
        return res
          .status(400)
          .json({ error: "Monat muss zwischen 1 und 12 liegen" });
      }

      const clinicId = await resolveClinicIdFromUser(req.user);
      if (!clinicId) {
        return res.status(400).json({ error: "Klinik-Kontext fehlt" });
      }

      const [planRow] = await db
        .select({ status: dutyPlans.status })
        .from(dutyPlans)
        .where(
          and(
            eq(dutyPlans.year, year),
            eq(dutyPlans.month, month),
          ),
        );
      const planStatus = planRow?.status ?? null;
      const statusAllowed = planStatus
        ? ALLOWED_UNASSIGNED_STATUSES.has(planStatus)
        : false;

      const includeDraft = parseBoolQueryFlag(
        req.query.includeDraft as string | string[],
      );
      const payload = await buildOpenShiftPayload({
        clinicId,
        year,
        month,
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
    "/api/roster/:id/claim",
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
        if (!allowedKeys.has(shift.serviceType)) {
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
          return res
            .status(400)
            .json({ error: "Übernahme nicht erlaubt: Dienst am Vortag vorhanden" });
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

  const openShiftClaimHandler = async (req: Request, res: Response) => {
    try {
      const rawDate =
        typeof req.body.date === "string" ? req.body.date.trim() : "";
      const serviceType =
        typeof req.body.serviceType === "string"
          ? req.body.serviceType.trim()
          : "";
      if (!rawDate) {
        return res.status(400).json({ error: "Datum ist erforderlich" });
      }
      if (!serviceType) {
        return res.status(400).json({ error: "Diensttyp ist erforderlich" });
      }

      const parsedDate = parseISO(rawDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Ungültiges Datum" });
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
      const allowedKeys = getEffectiveServiceLineKeys(employee, serviceLineRows);
      if (!allowedKeys.has(serviceType)) {
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
        return res
          .status(400)
          .json({ error: "Übernahme nicht erlaubt: Dienst am Vortag vorhanden" });
      }

      const payload = await buildOpenShiftPayload({
        clinicId,
        year,
        month,
        includeDraft: false,
      });
      const missing = payload.missingCounts[serviceType] ?? 0;
      const required = payload.requiredDaily[serviceType] ?? 0;
      if (required <= 0) {
        return res
          .status(400)
          .json({ error: "Diensttyp kann nicht automatisch übernommen werden" });
      }
      if (missing <= 0) {
        return res
          .status(409)
          .json({ error: "Kein freier Slot für diesen Dienst verfügbar" });
      }

      const shift = await storage.createRosterShift({
        date: rawDate,
        serviceType,
        employeeId,
        isDraft: false,
      });

      res.status(201).json(shift);
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

      const includeDraftWishes = resolvedMode === "draft" && !wishesLocked;
      const wishStatuses = includeDraftWishes
        ? ["Eingereicht", "Entwurf"]
        : ["Eingereicht"];

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
          )
            return 2;

          // Assistenz
          if (r.includes("assistenz")) return 3;

          // Turnus
          if (r.includes("turnus")) return 4;

          // KPJ / Student / Famulatur
          if (r.includes("kpj") || r.includes("student") || r.includes("famul"))
            return 5;

          // Sekretariat (falls es je drin wäre) ganz nach hinten
          if (r.includes("sekret")) return 98;

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
            const employeeId = assignment.employe<truncated__content/>