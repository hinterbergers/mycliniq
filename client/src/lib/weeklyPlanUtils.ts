import { getISODay, format } from "date-fns";
import type {
  Employee,
  LongTermAbsence,
  RosterShift,
  Resource,
} from "@shared/schema";
import { normalizeServiceLineKey } from "@shared/serviceLineKey";

export type PlannedAbsenceLike = {
  employeeId: number;
  startDate: string;
  endDate: string;
  status?: string | null;
  reason?: string | null;
};

type ShiftPreferencesLike = {
  recurringUnavailableWeekdays?: number[];
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
  "Sonntag",
];

const normalizeValue = (value?: string | null) => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const uniqueValues = (values: string[]) =>
  Array.from(new Set(values.filter(Boolean)));

export const normalizeWeeklyPlanText = (value?: string | null) =>
  normalizeValue(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const getWeeklyPlanRoomShortLabel = (roomName?: string | null) => {
  const normalized = normalizeWeeklyPlanText(roomName);
  if (!normalized) return roomName || "";

  if (
    normalized.includes("geburtshilfe") ||
    normalized.includes("kreisssaal") ||
    normalized.includes("kreis")
  ) {
    return "Geb.";
  }
  if (normalized.includes("gynakologische bettenstation")) return "Gyn";
  if (normalized.includes("risiko ambulanz i")) return "Risiko I";
  if (normalized.includes("risiko ambulanz ii")) return "Risiko II";
  if (normalized.includes("schwangeren sprechstunde")) return "SchwAm";
  if (normalized.includes("chef sprechstunde")) return "Chef";
  if (normalized.includes("vulvaambulanz")) return "Vulva";
  if (
    normalized.includes("bestell und notfallambulanz") ||
    normalized.includes("gynakologische ambulanz")
  ) {
    return "GynAm";
  }
  if (normalized.includes("dysplasie")) return "Dysp";
  if (normalized.includes("onkologische sprechstunde")) return "Onko";
  if (normalized.includes("urodynamik")) return "Uro";
  if (normalized.includes("tumornachsorge")) return "TNS";
  if (normalized.includes("mamma")) return "Mamma";
  if (normalized.includes("teaching")) return "TCH";
  if (normalized.includes("perinatologische")) return "PN";
  if (normalized.includes("tumorboard")) return "TB";
  if (
    normalized.includes("verwaltung organisation") ||
    normalized.includes("organisation")
  ) {
    return "Org";
  }

  return roomName || "";
};

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
  alternative: string[] = [],
): boolean => {
  const keys = getEmployeeRoleKeys(employee.role);
  if (required.length > 0 && !required.every((value) => keys.includes(value))) {
    return false;
  }
  if (
    alternative.length > 0 &&
    !alternative.some((value) => keys.includes(value))
  ) {
    return false;
  }
  return true;
};

export const employeeMatchesCompetencies = (
  employee: Employee,
  requiredCompetencies: WeeklyPlanRoom["requiredCompetencies"] = [],
): boolean => {
  if (!requiredCompetencies || requiredCompetencies.length === 0) return true;

  const employeeCompetencies = (employee.competencies || []).map((comp) =>
    normalizeValue(comp),
  );
  const hasCompetency = (value?: string | null) =>
    employeeCompetencies.includes(normalizeValue(value));

  const andCompetencies = requiredCompetencies.filter(
    (comp) => comp.relationType === "AND",
  );
  const orCompetencies = requiredCompetencies.filter(
    (comp) => comp.relationType === "OR",
  );

  if (andCompetencies.length > 0) {
    const allMatch = andCompetencies.every(
      (comp) =>
        hasCompetency(comp.competencyCode) ||
        hasCompetency(comp.competencyName),
    );
    if (!allMatch) return false;
  }

  if (orCompetencies.length > 0) {
    const anyMatch = orCompetencies.some(
      (comp) =>
        hasCompetency(comp.competencyCode) ||
        hasCompetency(comp.competencyName),
    );
    if (!anyMatch) return false;
  }

  return true;
};

export const isEmployeeEligibleForRoom = (
  employee: Employee,
  room: WeeklyPlanRoom,
): boolean => {
  const roleOk = employeeMatchesRoleRequirements(
    employee,
    room.requiredRoleCompetencies || [],
    room.alternativeRoleCompetencies || [],
  );
  if (!roleOk) return false;
  return employeeMatchesCompetencies(employee, room.requiredCompetencies || []);
};

type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const getWeekdayIndex = (date: Date): IsoWeekday =>
  getISODay(date) as IsoWeekday;

export const getRecurringUnavailableWeekdays = (
  employee: Pick<Employee, "shiftPreferences">,
): IsoWeekday[] => {
  const prefs =
    employee.shiftPreferences && typeof employee.shiftPreferences === "object"
      ? (employee.shiftPreferences as ShiftPreferencesLike)
      : null;
  if (!Array.isArray(prefs?.recurringUnavailableWeekdays)) return [];
  return Array.from(
    new Set(
      prefs.recurringUnavailableWeekdays.filter(
        (weekday): weekday is IsoWeekday =>
          Number.isInteger(weekday) && weekday >= 1 && weekday <= 7,
      ),
    ),
  );
};

export const getWeekdayOccurrence = (date: Date) =>
  Math.floor((date.getDate() - 1) / 7) + 1;

type WeekdaySetting = NonNullable<WeeklyPlanRoom["weekdaySettings"]>[number];
type WeekdayRecurrence = WeekdaySetting["recurrence"];

export const matchesRecurrence = (
  recurrence: WeekdayRecurrence,
  date: Date,
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
  const setting = room.weekdaySettings?.find(
    (entry) => entry.weekday === weekday,
  );
  if (!setting) return null;
  if (!matchesRecurrence(setting.recurrence, date)) return null;
  return setting;
};

export const isEmployeeAbsentOnDate = (
  employee: Employee,
  date: Date,
  plannedAbsences: PlannedAbsenceLike[],
  longTermAbsences: LongTermAbsence[],
) => {
  const dateStr = format(date, "yyyy-MM-dd");
  if (getRecurringUnavailableWeekdays(employee).includes(getWeekdayIndex(date))) {
    return true;
  }
  const hasLongTerm = longTermAbsences.some(
    (absence) =>
      absence.employeeId === employee.id &&
      absence.status === "Genehmigt" &&
      absence.startDate <= dateStr &&
      absence.endDate >= dateStr,
  );
  if (hasLongTerm) return true;

  const hasPlanned = plannedAbsences.some(
    (absence) =>
      absence.employeeId === employee.id &&
      absence.startDate <= dateStr &&
      absence.endDate >= dateStr &&
      absence.status !== "Abgelehnt",
  );
  if (hasPlanned) return true;

  if (!employee.inactiveFrom && !employee.inactiveUntil) {
    return false;
  }

  const inactiveFrom = employee.inactiveFrom
    ? new Date(employee.inactiveFrom)
    : null;
  const inactiveUntil = employee.inactiveUntil
    ? new Date(employee.inactiveUntil)
    : null;
  if (inactiveFrom && inactiveFrom > date) return false;
  if (inactiveUntil && inactiveUntil < date) return false;
  return Boolean(inactiveFrom || inactiveUntil);
};

export const isEmployeeOnDutyDate = (
  employeeId: number,
  date: Date,
  rosterShifts: RosterShift[],
) => {
  const dateStr = format(date, "yyyy-MM-dd");
  return rosterShifts.some(
    (shift) =>
      shift.employeeId === employeeId &&
      shift.date === dateStr &&
      shift.serviceType !== "overduty",
  );
};

export const getEmployeeDisplayName = (employee: Employee) => {
  if (employee.lastName) return employee.lastName;
  const fallback = employee.name?.split(" ").pop();
  return fallback || employee.name || "";
};

export const formatRoomTime = (
  timeFrom?: string | null,
  timeTo?: string | null,
) => {
  const normalize = (value?: string | null) => {
    if (!value) return "";
    const match = /^(\d{2}:\d{2})(?::\d{2})?$/.exec(value.trim());
    return match ? match[1] : value.trim();
  };

  const from = normalize(timeFrom);
  const to = normalize(timeTo);

  if (from === "07:30" && to === "13:30") return "";
  if (!timeFrom && !timeTo) return "";
  if (from && to) return `${from}–${to}`;
  return from || to || "";
};

type WeeklyPlanAssignmentLike = {
  id: number;
  weeklyPlanId?: number;
  roomId: number;
  weekday: number;
  employeeId: number | null;
  roleLabel?: string | null;
  assignmentType: "Plan" | "Zeitausgleich" | "Fortbildung";
  note?: string | null;
  isBlocked?: boolean;
  createdAt?: string;
  updatedAt?: string;
  roomName?: string | null;
  roomCategory?: string | null;
  employeeName?: string | null;
  employeeLastName?: string | null;
  employeeRole?: string | null;
};

const findWeekendTargetRoomIds = (rooms: WeeklyPlanRoom[]) => {
  let kreisssaalRoomId: number | null = null;
  let bettenstationRoomId: number | null = null;

  rooms.forEach((room) => {
    const normalized = normalizeWeeklyPlanText(room.name);
    if (
      kreisssaalRoomId == null &&
      (normalized.includes("geburtshilfe") || normalized.includes("kreisssaal"))
    ) {
      kreisssaalRoomId = room.id;
    }
    if (
      bettenstationRoomId == null &&
      (normalized.includes("gynakologische bettenstation") ||
        normalized.includes("bettenstation"))
    ) {
      bettenstationRoomId = room.id;
    }
  });

  return { kreisssaalRoomId, bettenstationRoomId };
};

export const buildWeeklyPlanAssignmentsByRoomWeekday = <
  T extends WeeklyPlanAssignmentLike,
>(
  assignments: T[],
  rooms: WeeklyPlanRoom[],
  rosterShifts: RosterShift[],
  weekDays: Date[],
  employeesById: Map<number, Employee>,
) => {
  const { kreisssaalRoomId, bettenstationRoomId } = findWeekendTargetRoomIds(rooms);
  const map = new Map<string, T[]>();
  assignments.forEach((assignment) => {
    const isWeekend = assignment.weekday === 6 || assignment.weekday === 7;
    const isWeekendDutyTarget =
      isWeekend &&
      (assignment.roomId === kreisssaalRoomId || assignment.roomId === bettenstationRoomId);
    if (isWeekendDutyTarget) {
      return;
    }

    const key = `${assignment.roomId}-${assignment.weekday}`;
    const current = map.get(key) ?? [];
    current.push(assignment);
    map.set(key, current);
  });

  if (kreisssaalRoomId == null || bettenstationRoomId == null) return map;

  let syntheticId = -1;

  weekDays.forEach((day) => {
    const weekday = getWeekdayIndex(day);
    if (weekday !== 6 && weekday !== 7) return;

    const dateKey = format(day, "yyyy-MM-dd");
    rosterShifts
      .filter((shift) => shift.date === dateKey)
      .forEach((shift) => {
        const serviceType = normalizeServiceLineKey(shift.serviceType);
        const targetRoomId =
          serviceType === "kreiszimmer"
            ? kreisssaalRoomId
            : serviceType === "gyn" || serviceType === "turnus"
              ? bettenstationRoomId
              : null;
        if (targetRoomId == null) return;

        const key = `${targetRoomId}-${weekday}`;
        const current = map.get(key) ?? [];
        const employee = shift.employeeId ? employeesById.get(shift.employeeId) ?? null : null;
        const fallbackName = shift.assigneeFreeText?.trim() ?? null;
        const fallbackLastName = fallbackName
          ? fallbackName.split(/\s+/).filter(Boolean).slice(-1)[0] ?? fallbackName
          : null;

        const duplicate = current.some((assignment) => {
          if (shift.employeeId && assignment.employeeId === shift.employeeId) return true;
          if (!fallbackLastName) return false;
          return (
            normalizeWeeklyPlanText(
              assignment.employeeLastName ?? assignment.employeeName ?? null,
            ) === normalizeWeeklyPlanText(fallbackLastName)
          );
        });
        if (duplicate) return;

        const syntheticAssignment: WeeklyPlanAssignmentLike = {
          id: syntheticId--,
          weeklyPlanId: assignments[0]?.weeklyPlanId,
          roomId: targetRoomId,
          weekday,
          employeeId: shift.employeeId ?? null,
          roleLabel: null,
          assignmentType: "Plan",
          note: null,
          isBlocked: false,
          roomName: rooms.find((room) => room.id === targetRoomId)?.name ?? null,
          roomCategory: null,
          employeeName: employee?.name ?? fallbackName,
          employeeLastName: employee?.lastName ?? fallbackLastName,
          employeeRole: employee?.role ?? null,
        };
        current.push(syntheticAssignment as unknown as T);
        map.set(key, current);
      });
  });

  return map;
};
