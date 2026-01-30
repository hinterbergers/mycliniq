import { formatISO, startOfMonth, endOfMonth, eachDayOfInterval, addDays, parseISO, getISOWeek } from "date-fns";
import { storage } from "../../../storage";
import { assertValidPlanningInput } from "../validation/planningSchemas";
import { type ShiftWish } from "@shared/schema";

const ROLE_GROUPS = ["OA", "ASS", "TA", "PRIM", "OTHER"] as const;
type RoleGroup = (typeof ROLE_GROUPS)[number];

type ServiceRole = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  tags?: string[];
};

const SERVICE_ROLES: ServiceRole[] = [
  { id: "kreiszimmer", label: "Kreißzimmer (Ass.)", startTime: "07:30", endTime: "15:30", tags: ["ASS"] },
  { id: "gyn", label: "Gynäkologie (OA)", startTime: "07:30", endTime: "15:30", tags: ["OA"] },
  { id: "turnus", label: "Turnus (Ass./TA)", startTime: "07:30", endTime: "15:30", tags: ["TA"] },
  { id: "overduty", label: "Überdienst", startTime: "18:00", endTime: "07:00", tags: ["OA", "ASS", "TA"] },
];

const GROUP_ROLE_MAP: Record<RoleGroup, string[]> = {
  PRIM: ["overduty"],
  OA: ["gyn", "kreiszimmer", "overduty"],
  ASS: ["turnus", "kreiszimmer", "overduty"],
  TA: ["turnus", "overduty"],
  OTHER: ["overduty"],
};

const DEFAULT_RULES = {
  hardRules: [
    { id: "no-consecutive-days", type: "NO_CONSECUTIVE_DAYS", hard: true, params: {} },
    { id: "max-per-period", type: "MAX_PER_PERIOD", hard: true, params: { limit: 6 } },
    { id: "max-per-iso-week", type: "MAX_PER_ISO_WEEK", hard: true, params: { limit: 2 } },
  ],
  softRules: [],
  weights: {
    prefer: 1,
    avoid: 1,
    weekendFairness: 1,
    avoidWeekendStreak: 1,
    continuity: 1,
  },
};

const timezone =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Vienna";

const expandRangeToDates = (start: string, end: string): string[] => {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(formatISO(current, { representation: "date" }));
    current = addDays(current, 1);
  }
  return dates;
};

const mapRoleToGroup = (role?: string | null): RoleGroup => {
  if (!role) return "OTHER";
  const normalized = role.toLowerCase();
  if (normalized.includes("primar")) return "PRIM";
  if (
    normalized.includes("1. ober") ||
    normalized.includes("oberarzt") ||
    normalized.includes("oberärzt") ||
    normalized.includes("facharzt") ||
    normalized.includes("funktionsober") ||
    normalized.includes("ausbildungsober")
  ) {
    return "OA";
  }
  if (normalized.includes("assistenz")) return "ASS";
  if (normalized.includes("turnus")) return "TA";
  if (normalized.includes("student") || normalized.includes("sekret")) return "OTHER";
  return "OTHER";
};

const normalizeStringArray = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim()),
    ),
  );
};

const normalizeWeekdays = (values: unknown): number[] => {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 6),
    ),
  );
};

const createSlotsForPeriod = (year: number, month: number) => {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  const days = eachDayOfInterval({ start, end });
  const slots = [];
  for (const date of days) {
    const dateString = formatISO(date, { representation: "date" });
    const isoWeek = getISOWeek(date);
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    for (const role of SERVICE_ROLES) {
      slots.push({
        id: `${year}-${String(month).padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}-${role.id}`,
        date: dateString,
        startTime: role.startTime,
        endTime: role.endTime,
        roleId: role.id,
        required: 1,
        isoWeek,
        isWeekend,
        tags: role.tags,
      });
    }
  }
  return slots;
};

const normalizeShiftWish = (wish?: ShiftWish) => {
  if (!wish) return null;
  return {
    avoidDates: normalizeStringArray(wish.avoidShiftDays),
    preferDates: normalizeStringArray(wish.preferredShiftDays),
    avoidWeekdays: normalizeWeekdays(wish.avoidWeekdays ?? []),
    preferredServiceTypes: normalizeStringArray(wish.preferredServiceTypes),
    avoidServiceTypes: normalizeStringArray(wish.avoidServiceTypes),
    maxShiftsPerMonth: Number.isFinite(wish.maxShiftsPerMonth ?? NaN)
      ? wish.maxShiftsPerMonth
      : undefined,
    maxShiftsPerWeek: Number.isFinite(wish.maxShiftsPerWeek ?? NaN)
      ? wish.maxShiftsPerWeek
      : undefined,
  };
};

export async function buildPlanningInput(year: number, month: number) {
  const slots = createSlotsForPeriod(year, month);
  const start = slots.length ? slots[0].date : formatISO(startOfMonth(new Date(year, month - 1, 1)), { representation: "date" });
  const end = slots.length
    ? slots[slots.length - 1].date
    : formatISO(endOfMonth(new Date(year, month - 1, 1)), { representation: "date" });

  const shiftWishes = await storage.getShiftWishesByMonth(year, month);
  const absences = await storage.getAbsencesByDateRange(start, end);
  const plannedAbsences = await storage.getPlannedAbsencesByMonth(year, month);
  const absenceDatesByEmployee = new Map<number, Set<string>>();

  const accumulateAbsences = (recordDates: string[], employeeId: number) => {
    if (!recordDates.length) return;
    const target = absenceDatesByEmployee.get(employeeId) ?? new Set<string>();
    for (const date of recordDates) {
      target.add(date);
    }
    absenceDatesByEmployee.set(employeeId, target);
  };

  for (const absence of absences) {
    accumulateAbsences(expandRangeToDates(absence.startDate, absence.endDate), absence.employeeId);
  }
  for (const absence of plannedAbsences) {
    accumulateAbsences(expandRangeToDates(absence.startDate, absence.endDate), absence.employeeId);
  }

  const wishesByEmployee = new Map<number, ShiftWish>();
  for (const wish of shiftWishes) {
    wishesByEmployee.set(wish.employeeId, wish);
  }

  const allEmployees = await storage.getEmployees();
  const activeEmployees = allEmployees.filter(
    (employee) => employee.takesShifts !== false,
  );

  const employees = activeEmployees.map((employee) => {
    const normalizedWish = normalizeShiftWish(wishesByEmployee.get(employee.id));
    const absenceSet = absenceDatesByEmployee.get(employee.id) ?? new Set();

    const baseGroup = mapRoleToGroup(employee.role);
    const overrideRoles = normalizeStringArray(
      (employee.shiftPreferences as any)?.serviceTypeOverrides,
    );
    const roleIds = Array.from(
      new Set([...GROUP_ROLE_MAP[baseGroup], ...overrideRoles]),
    );

    const maxSlotsInPeriod =
      typeof normalizedWish?.maxShiftsPerMonth === "number"
        ? normalizedWish.maxShiftsPerMonth
        : 6;
    const maxSlotsPerWeek =
      typeof normalizedWish?.maxShiftsPerWeek === "number"
        ? normalizedWish.maxShiftsPerWeek
        : 2;

    return {
      id: String(employee.id),
      name:
        (employee.name && employee.name.trim()) ||
        [employee.lastName, employee.firstName].filter(Boolean).join(" ").trim() ||
        `Mitarbeiter ${employee.id}`,
      group: baseGroup,
      capabilities: {
        canRoleIds: roleIds.length ? roleIds : GROUP_ROLE_MAP.OTHER,
        skillTags: normalizeStringArray(employee.competencies ?? []),
      },
      constraints: {
        limits: {
          maxSlotsInPeriod,
          minSlotsInPeriod: 0,
          maxSlotsPerIsoWeek: maxSlotsPerWeek,
        },
        hard: {
          banDates: Array.from(absenceSet),
          banWeekdays: normalizedWish?.avoidWeekdays ?? [],
          banSlotIds: [],
        },
        soft: {
          preferDates: normalizedWish?.preferDates ?? [],
          avoidDates: normalizedWish?.avoidDates ?? [],
        },
      },
    };
  });

  const input = {
    version: "v1",
    meta: {
      timezone,
      createdAt: new Date().toISOString(),
      planningKind: "MONTHLY_DUTY",
      source: "mycliniq",
    },
    period: {
      startDate: start,
      endDate: end,
      year,
      month,
    },
    roles: SERVICE_ROLES.map((role) => ({
      id: role.id,
      label: role.label,
      tags: role.tags,
    })),
    slots,
    employees,
    rules: DEFAULT_RULES,
  };

  assertValidPlanningInput(input);
  return input;
}
