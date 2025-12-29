export type ServiceType = "gyn" | "kreiszimmer" | "turnus";
export type WeekdayShort = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export type LongTermRuleKind = "ALWAYS_OFF" | "PREFER_ON" | "AVOID_ON";
export type LongTermRuleStrength = "SOFT" | "HARD";
export type LongTermWishRule = {
  kind: LongTermRuleKind;
  weekday: WeekdayShort;
  strength: LongTermRuleStrength;
  serviceType?: ServiceType | "any";
};

export const SERVICE_TYPES: ServiceType[] = ["gyn", "kreiszimmer", "turnus"];

const ROLE_NORMALIZATION: Record<string, string> = {
  "Oberärztin": "Oberarzt",
  "Assistenzärztin": "Assistenzarzt",
};

const SERVICE_CAPABILITIES: Record<ServiceType, string[]> = {
  gyn: ["Primararzt", "1. Oberarzt", "Funktionsoberarzt", "Ausbildungsoberarzt", "Oberarzt"],
  kreiszimmer: ["Assistenzarzt"],
  turnus: ["Assistenzarzt", "Turnusarzt"],
};

export function normalizeRoleValue(role?: string | null): string {
  if (!role) return "";
  return ROLE_NORMALIZATION[role] ?? role;
}

export function getServiceTypeOverrides(shiftPreferences?: unknown): ServiceType[] {
  if (!shiftPreferences || typeof shiftPreferences !== "object") return [];
  const overrides = (shiftPreferences as { serviceTypeOverrides?: unknown }).serviceTypeOverrides;
  if (!Array.isArray(overrides)) return [];
  return overrides.filter((value): value is ServiceType => SERVICE_TYPES.includes(value as ServiceType));
}

export function getServiceTypesForRole(role?: string | null): ServiceType[] {
  const normalized = normalizeRoleValue(role);
  return SERVICE_TYPES.filter((service) => SERVICE_CAPABILITIES[service].includes(normalized));
}

export function getServiceTypesForEmployee(input: {
  role?: string | null;
  shiftPreferences?: unknown;
}): ServiceType[] {
  const overrides = getServiceTypeOverrides(input.shiftPreferences);
  if (overrides.length) return overrides;
  return getServiceTypesForRole(input.role);
}

export function employeeDoesShifts(input: {
  takesShifts?: boolean | null;
  role?: string | null;
  shiftPreferences?: unknown;
}): boolean {
  const overrides = getServiceTypeOverrides(input.shiftPreferences);
  return input.takesShifts !== false || overrides.length > 0;
}
