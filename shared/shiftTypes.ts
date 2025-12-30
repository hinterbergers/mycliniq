export type ServiceType = "gyn" | "kreiszimmer" | "turnus" | "overduty";
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
  overduty: []
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
  takesShifts?: boolean | null;
  canOverduty?: boolean | null;
}): ServiceType[] {
  if (input.takesShifts === false) return [];
  const overrides = getServiceTypeOverrides(input.shiftPreferences);
  const baseTypes = overrides.length ? overrides : getServiceTypesForRole(input.role);
  if (input.canOverduty) {
    return Array.from(new Set([...baseTypes, "overduty"]));
  }
  return baseTypes;
}

export function employeeDoesShifts(input: {
  takesShifts?: boolean | null;
  role?: string | null;
  shiftPreferences?: unknown;
  canOverduty?: boolean | null;
}): boolean {
  if (input.takesShifts === false) return false;
  const overrides = getServiceTypeOverrides(input.shiftPreferences);
  if (overrides.length) return true;
  if (input.canOverduty) return true;
  return getServiceTypesForRole(input.role).length > 0;
}
