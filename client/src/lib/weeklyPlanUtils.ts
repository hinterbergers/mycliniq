import { getISODay, format } from "date-fns";
import type { Employee, LongTermAbsence, RosterShift, Resource } from "@shared/schema";

export type PlannedAbsenceLike = {
  employeeId: number;
  startDate: string;
  endDate: string;
  status?: string | null;
  reason?: string | null;
};

export type WeeklyPlanRoom = Resource & {
  weekdaySettings?: Array<{
    id: number;
    roomId: number;
    weekday: number;
    recurrence?: "weekly" | "monthly_first_third" | "monthly_once";
    usageLabel?: string | null;
    timeFrom?: string | null;
    timeTo?: string | null;
    isClosed?: boolean;
    closedReason?: string | null;
  }>;
  requiredCompetencies?: Array<{
    id: number;
    competencyId: number;
    relationType: "AND" | "OR";
    competencyCode?: string | null;
    competencyName?: string | null;
  }>;
  physicalRooms?: Array<{
    id: number;
    name: string;
    isActive?: boolean;
  }>;
};

export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const WEEKDAY_FULL = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag"
];

const normalizeValue = (value?: string | null) => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export const getEmployeeRoleKeys = (role?: string | null): string[] => {
  const normalized = normalizeValue(role);
  if (!normalized) return [];

  const keys: string[] = [];
  if (normalized.includes("primar")) {
    keys.push("primararzt");
  }
  if (
    normalized.includes("oberarzt") ||
    normalized.includes("facharzt") ||
    normalized.includes("funktionsoberarzt") ||
    normalized.includes("ausbildungsoberarzt")
  ) {
    keys.push("facharzt");
  }
  if (
    normalized.includes("assistenz") ||
    normalized.includes("turnus") ||
    normalized.includes("student")
  ) {
    keys.push("assistenzarzt");
  }
  if (normalized.includes("op") && normalized.includes("assist")) {
    keys.push("op_assistenz");
  }
  if (normalized.includes("sekretar") || normalized.includes("sekreta")) {
    keys.push("sekretaerin");
  }

  return uniqueValues(keys);
};

export const employeeMatchesRoleRequirements = (
  employee: Employee,
  required: string[] = [],
  alternative: string[] = []
): boolean => {
  const keys = getEmployeeRoleKeys(employee.role);
  if (required.length > 0 && !required.every((value) => keys.includes(value))) {
    return false;
  }
  if (alternative.length > 0 && !alternative.some((value) => keys.includes(value))) {
    return false;
  }
  return true;
};

export const employeeMatchesCompetencies = (
  employee: Employee,
  requiredCompetencies: WeeklyPlanRoom["requiredCompetencies"] = []
): boolean => {
  if (!requiredCompetencies || requiredCompetencies.length === 0) return true;

  const employeeCompetencies = (employee.competencies || []).map((comp) => normalizeValue(comp));
  const hasCompetency = (value?: string | null) =>
    employeeCompetencies.includes(normalizeValue(value));

  const andCompetencies = requiredCompetencies.filter((comp) => comp.relationType === "AND");
  const orCompetencies = requiredCompetencies.filter((comp) => comp.relationType === "OR");

  if (andCompetencies.length > 0) {
    const allMatch = andCompetencies.every((comp) =>
      hasCompetency(comp.competencyCode) || hasCompetency(comp.competencyName)
    );
    if (!allMatch) return false;
  }

  if (orCompetencies.length > 0) {
    const anyMatch = orCompetencies.some((comp) =>
      hasCompetency(comp.competencyCode) || hasCompetency(comp.competencyName)
    );
    if (!anyMatch) return false;
  }

  return true;
};

export const isEmployeeEligibleForRoom = (employee: Employee, room: WeeklyPlanRoom): boolean => {
  const roleOk = employeeMatchesRoleRequirements(
    employee,
    room.requiredRoleCompetencies || [],
    room.alternativeRoleCompetencies || []
  );
  if (!roleOk) return false;
  return employeeMatchesCompetencies(employee, room.requiredCompetencies || []);
};

export const getWeekdayIndex = (date: Date) => getISODay(date);

export const getWeekdayOccurrence = (date: Date) => Math.floor((date.getDate() - 1) / 7) + 1;

export const matchesRecurrence = (
  recurrence: WeeklyPlanRoom["weekdaySettings"][number]["recurrence"],
  date: Date
) => {
  if (!recurrence || recurrence === "weekly") return true;
  const occurrence = getWeekdayOccurrence(date);
  if (recurrence === "monthly_first_third") {
    return occurrence === 1 || occurrence === 3;
  }
  if (recurrence === "monthly_once") {
    return occurrence === 1;
  }
  return true;
};

export const getRoomSettingForDate = (room: WeeklyPlanRoom, date: Date) => {
  const weekday = getWeekdayIndex(date);
  const setting = room.weekdaySettings?.find((entry) => entry.weekday === weekday);
  if (!setting) return null;
  if (!matchesRecurrence(setting.recurrence, date)) return null;
  return setting;
};

export const isEmployeeAbsentOnDate = (
  employee: Employee,
  date: Date,
  plannedAbsences: PlannedAbsenceLike[],
  longTermAbsences: LongTermAbsence[]
) => {
  const dateStr = format(date, "yyyy-MM-dd");
  const hasLongTerm = longTermAbsences.some(
    (absence) =>
      absence.employeeId === employee.id &&
      absence.status === "Genehmigt" &&
      absence.startDate <= dateStr &&
      absence.endDate >= dateStr
  );
  if (hasLongTerm) return true;

  const hasPlanned = plannedAbsences.some(
    (absence) =>
      absence.employeeId === employee.id &&
      absence.startDate <= dateStr &&
      absence.endDate >= dateStr &&
      absence.status !== "Abgelehnt"
  );
  if (hasPlanned) return true;

  if (!employee.inactiveFrom && !employee.inactiveUntil) {
    return false;
  }

  const inactiveFrom = employee.inactiveFrom ? new Date(employee.inactiveFrom) : null;
  const inactiveUntil = employee.inactiveUntil ? new Date(employee.inactiveUntil) : null;
  if (inactiveFrom && inactiveFrom > date) return false;
  if (inactiveUntil && inactiveUntil < date) return false;
  return Boolean(inactiveFrom || inactiveUntil);
};

export const isEmployeeOnDutyDate = (
  employeeId: number,
  date: Date,
  rosterShifts: RosterShift[]
) => {
  const dateStr = format(date, "yyyy-MM-dd");
  return rosterShifts.some(
    (shift) =>
      shift.employeeId === employeeId &&
      shift.date === dateStr &&
      shift.serviceType !== "overduty"
  );
};

export const getEmployeeDisplayName = (employee: Employee) => {
  if (employee.lastName) return employee.lastName;
  const fallback = employee.name?.split(" ").pop();
  return fallback || employee.name || "";
};

export const formatRoomTime = (timeFrom?: string | null, timeTo?: string | null) => {
  if (!timeFrom && !timeTo) return "";
  if (timeFrom && timeTo) return `${timeFrom}–${timeTo}`;
  return timeFrom || timeTo || "";
};
