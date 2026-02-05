import type { ServiceLine } from "./schema";

const SERVICE_LINE_FIELDS = [
  "serviceLineKeys",
  "serviceLines",
  "allowedServiceLines",
  "dutyServiceLines",
  "rosterServiceLines",
  "serviceLineAccess",
  "serviceLinePermissions",
  "serviceTypes",
  "dienstschienen",
  "serviceLineIds",
  "serviceLineIdsCsv",
] as const;

type ServiceLineMaps = {
  byId: Map<number, string>;
  byLabel: Map<string, string>;
};

const normalizeLabelForLookup = (value: string): string => {
  const cleaned = value.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return cleaned.toLowerCase();
};

const buildServiceLineMaps = (serviceLines?: ServiceLine[]): ServiceLineMaps => {
  const byId = new Map<number, string>();
  const byLabel = new Map<string, string>();
  (serviceLines ?? []).forEach((line) => {
    if (typeof line?.key !== "string") return;
    const key = line.key;
    if (typeof line?.id === "number") {
      byId.set(line.id, key);
    }
    const label = typeof line?.label === "string" ? line.label : undefined;
    if (label) {
      const normalized = normalizeLabelForLookup(label);
      if (normalized) {
        byLabel.set(normalized, key);
      }
    }
  });
  return { byId, byLabel };
};

const extractCandidate = (employee: any): unknown => {
  if (!employee) return null;
  for (const field of SERVICE_LINE_FIELDS) {
    if (field in employee) {
      const value = employee[field as keyof typeof employee];
      if (value != null) return value;
    }
  }
  const shiftPrefCandidate = getShiftPreferenceCandidate(employee);
  if (shiftPrefCandidate != null) return shiftPrefCandidate;
  return null;
};

const getShiftPreferenceCandidate = (employee: any): unknown => {
  if (!employee) return null;
  const shiftPreferences = employee.shiftPreferences ?? employee.shift_preferences ?? null;
  if (!shiftPreferences) return null;

  if (Array.isArray(shiftPreferences.serviceTypeOverrides)) {
    if (shiftPreferences.serviceTypeOverrides.length > 0) {
      return shiftPreferences.serviceTypeOverrides;
    }
  } else if (typeof shiftPreferences.serviceTypeOverrides === "string") {
    return shiftPreferences.serviceTypeOverrides;
  }

  if (Array.isArray(shiftPreferences.serviceLines)) {
    if (shiftPreferences.serviceLines.length > 0) {
      return shiftPreferences.serviceLines;
    }
  } else if (typeof shiftPreferences.serviceLines === "string") {
    return shiftPreferences.serviceLines;
  }

  if (Array.isArray(shiftPreferences.serviceLineKeys)) {
    if (shiftPreferences.serviceLineKeys.length > 0) {
      return shiftPreferences.serviceLineKeys;
    }
  } else if (typeof shiftPreferences.serviceLineKeys === "string") {
    return shiftPreferences.serviceLineKeys;
  }

  return null;
};

const mapLabelToken = (token: string, maps: ServiceLineMaps): string => {
  const cleaned = token.trim();
  if (!cleaned) return "";
  const normalized = normalizeLabelForLookup(cleaned);
  return maps.byLabel.get(normalized) ?? cleaned;
};

const getLabelKeyFromObject = (
  obj: Record<string, unknown>,
  maps: ServiceLineMaps,
): string => {
  const label = typeof obj.label === "string" ? obj.label : undefined;
  if (!label) return "";
  const normalized = normalizeLabelForLookup(label);
  return maps.byLabel.get(normalized) ?? label.trim();
};

const toKeys = (value: any, maps: ServiceLineMaps): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          const s = entry.trim();
          if (!s) return "";
          return mapLabelToken(s, maps);
        }
        if (typeof entry === "number") {
          return maps.byId.get(entry) ?? "";
        }
        if (typeof entry === "object" && entry) {
          if (typeof (entry as any).key === "string") {
            return (entry as any).key;
          }
          if (typeof (entry as any).serviceType === "string") {
            return (entry as any).serviceType;
          }
          if (typeof (entry as any).serviceLineKey === "string") {
            return (entry as any).serviceLineKey;
          }
          const labelKey = getLabelKeyFromObject(
            entry as Record<string, unknown>,
            maps,
          );
          if (labelKey) return labelKey;
          if (typeof (entry as any).id === "number") {
            return maps.byId.get((entry as any).id) ?? "";
          }
        }
        return "";
      })
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return toKeys(parsed, maps);
    } catch {
      const parts = trimmed
        .split(/[;,\n]+/)
        .map((p) => p.trim())
        .filter(Boolean);

      return parts
        .flatMap((part) => {
          const normalized = part.toLowerCase();
          const mapped = maps.byLabel.get(normalized);
          if (mapped) return [mapped];

          if (!part.includes(" ")) {
            return [part];
          }

          return part
            .split(/\s+/)
            .map((token) => {
              const tt = token.trim();
              if (!tt) return "";
              const normalizedToken = tt.toLowerCase();
              return maps.byLabel.get(normalizedToken) ?? tt;
            })
            .filter(Boolean);
        })
        .filter(Boolean);
    }
  }

  if (typeof value === "number") {
    const key = maps.byId.get(value);
    return key ? [key] : [];
  }

  return [];
};

export function getEmployeeServiceLineCandidate(employee: any): unknown {
  return extractCandidate(employee);
}

export function getEmployeeServiceLineKeys(
  employee: any,
  serviceLines?: ServiceLine[],
): Set<string> {
  const candidate = extractCandidate(employee);
  if (candidate == null) return new Set();
  const maps = buildServiceLineMaps(serviceLines);
  const keys = toKeys(candidate, maps);
  return new Set(keys);
}

export type DutyRoleGroup = "OA" | "ASS" | "TA";

const getDutyRoleGroup = (employee: any): DutyRoleGroup | null => {
  const raw = String(
    employee?.qualificationGroup ??
      employee?.roleGroup ??
      employee?.group ??
      employee?.dutyRole ??
      employee?.qualification ??
      employee?.positionGroup ??
      employee?.jobGroup ??
      employee?.jobTitle ??
      employee?.title ??
      employee?.role ??
      employee?.position ??
      "",
  )
    .trim()
    .toUpperCase();

  if (!raw) return null;
  if (raw.includes("OA") || raw.includes("OBER")) return "OA";
  if (raw.includes("ASS") || raw.includes("ASSIST")) return "ASS";
  if (raw.includes("TA") || raw.includes("TURNUS")) return "TA";
  return null;
};

const getRoleFallbackAllowedKeys = (
  employee: any,
  serviceLines?: ServiceLine[],
): Set<string> => {
  const group = getDutyRoleGroup(employee);
  if (!group) return new Set();
  return new Set(
    (serviceLines ?? [])
      .filter(
        (line) =>
          String((line.roleGroup ?? "").toUpperCase()) === group,
      )
      .map((line) => line.key),
  );
};

const getLabelFallbackAllowedKeys = (
  employee: any,
  serviceLines?: ServiceLine[],
): Set<string> => {
  const group = getDutyRoleGroup(employee);
  if (!group) return new Set();

  const rx =
    group === "OA"
      ? /gyn/i
      : group === "ASS"
        ? /(krei|kreiß|kreis|geb|geburt)/i
        : /turnus/i;

  return new Set(
    (serviceLines ?? [])
      .filter((line) => rx.test(`${line.label ?? ""} ${line.key}`))
      .map((line) => line.key),
  );
};

export function getEffectiveServiceLineKeys(
  employee: any,
  serviceLines?: ServiceLine[],
): Set<string> {
  const explicitKeys = getEmployeeServiceLineKeys(employee, serviceLines);
  if (explicitKeys.size > 0) return explicitKeys;

  const roleFallback = getRoleFallbackAllowedKeys(employee, serviceLines);
  if (roleFallback.size > 0) return roleFallback;

  const labelFallback = getLabelFallbackAllowedKeys(employee, serviceLines);
  if (labelFallback.size > 0) return labelFallback;

  return explicitKeys;
}

export function isEmployeeAllowedForServiceLine(
  employee: any,
  serviceTypeKey: string,
  serviceLines?: ServiceLine[],
): boolean | null {
  const keys = getEffectiveServiceLineKeys(employee, serviceLines);
  if (keys.size === 0) return null;
  return keys.has(serviceTypeKey);
}
