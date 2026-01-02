export type ServiceType = string;
export type WeekdayShort = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export type LongTermRuleKind = "ALWAYS_OFF" | "PREFER_ON" | "AVOID_ON";
export type LongTermRuleStrength = "SOFT" | "HARD";
export type LongTermWishRule = {
  kind: LongTermRuleKind;
  weekday: WeekdayShort;
  strength: LongTermRuleStrength;
  serviceType?: ServiceType | "any";
};

export const DEFAULT_SERVICE_TYPES: ServiceType[] = ["gyn", "kreiszimmer", "turnus"];
export const SERVICE_TYPES = DEFAULT_SERVICE_TYPES;
export const OVERDUTY_KEY: ServiceType = "overduty";

export type ServiceLineMeta = {
  key: string;
  roleGroup?: string | null;
  label?: string | null;
};

const ROLE_NORMALIZATION: Record<string, string> = {
  "Oberärztin": "Oberarzt",
  "Assistenzärztin": "Assistenzarzt",
  "Fachärztin": "Facharzt",
  "Turnusärztin": "Turnusarzt",
  "Studentin (KPJ)": "Student (KPJ)",
  "Studentin (Famulant)": "Student (Famulant)"
};

const DEFAULT_SERVICE_CAPABILITIES: Record<string, string[]> = {
  gyn: ["Primararzt", "1. Oberarzt", "Funktionsoberarzt", "Ausbildungsoberarzt", "Oberarzt", "Facharzt"],
  kreiszimmer: ["Assistenzarzt"],
  turnus: ["Assistenzarzt", "Turnusarzt"],
  overduty: []
};

const ROLE_GROUPS: Record<string, string[]> = {
  OA: [
    "Primararzt",
    "1. Oberarzt",
    "Funktionsoberarzt",
    "Ausbildungsoberarzt",
    "Oberarzt",
    "Facharzt"
  ],
  ASS: ["Assistenzarzt"],
  TURNUS: ["Assistenzarzt", "Turnusarzt"],
  STUDENT: ["Student (KPJ)", "Student (Famulant)"],
  SEK: ["Sekretariat"]
};

export function normalizeRoleValue(role?: string | null): string {
  if (!role) return "";
  return ROLE_NORMALIZATION[role] ?? role;
}

export function getServiceTypeOverrides(shiftPreferences?: unknown): ServiceType[] {
  if (!shiftPreferences || typeof shiftPreferences !== "object") return [];
  const overrides = (shiftPreferences as { serviceTypeOverrides?: unknown }).serviceTypeOverrides;
  if (!Array.isArray(overrides)) return [];
  return overrides
    .filter((value): value is ServiceType => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

function roleMatchesGroup(role: string, group?: string | null): boolean {
  if (!group || group === "ALL") return true;
  const list = ROLE_GROUPS[group];
  if (!list) return true;
  return list.includes(role);
}

export function getServiceTypesForRole(
  role?: string | null,
  serviceLines?: ServiceLineMeta[]
): ServiceType[] {
  const normalized = normalizeRoleValue(role);
  if (Array.isArray(serviceLines) && serviceLines.length > 0) {
    return serviceLines
      .filter((line) => roleMatchesGroup(normalized, line.roleGroup))
      .map((line) => line.key)
      .filter((type) => type !== OVERDUTY_KEY);
  }
  return DEFAULT_SERVICE_TYPES.filter((service) =>
    (DEFAULT_SERVICE_CAPABILITIES[service] || []).includes(normalized)
  );
}

export function getServiceTypesForEmployee(input: {
  role?: string | null;
  shiftPreferences?: unknown;
  takesShifts?: boolean | null;
  canOverduty?: boolean | null;
}, serviceLines?: ServiceLineMeta[]): ServiceType[] {
  if (input.takesShifts === false) return [];
  const overrides = getServiceTypeOverrides(input.shiftPreferences);
  const baseTypes = overrides.length ? overrides : getServiceTypesForRole(input.role, serviceLines);
  const filtered = input.canOverduty ? baseTypes : baseTypes.filter((type) => type !== OVERDUTY_KEY);
  return input.canOverduty ? Array.from(new Set([...filtered, OVERDUTY_KEY])) : filtered;
}

export function employeeDoesShifts(input: {
  takesShifts?: boolean | null;
  role?: string | null;
  shiftPreferences?: unknown;
  canOverduty?: boolean | null;
}, serviceLines?: ServiceLineMeta[]): boolean {
  if (input.takesShifts === false) return false;
  return getServiceTypesForEmployee(input, serviceLines).length > 0;
}
