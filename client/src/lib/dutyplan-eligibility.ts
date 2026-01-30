type RoleGroup = "OA" | "ASS" | "TA";

type ShiftLike = {
  id: string | number;
  date: string;              // ISO
  kind: string;              // z.B. "geburtshilfe" | "turnus" | "oa" ...
  assignedEmployeeId?: number | null;
};

type EmployeeLike = {
  id: number;
  firstName: string;
  lastName: string;
  roleGroup: RoleGroup;      // bei euch evtl. qualificationGroup o.ä.
};

export function allowedRoleGroupsForShift(shift: ShiftLike): RoleGroup[] {
  const k = shift.kind.toLowerCase();

  // TA/Turnus
  if (k.includes("turnus") || k === "ta" || k.includes("ta")) {
    return ["TA", "ASS"]; // ASS darf TA/Turnus übernehmen
  }

  // Geburtshilfe / Kreißzimmer etc.
  if (k.includes("geburt") || k.includes("kreiss") || k.includes("kreiß")) {
    return ["ASS"];
  }

  // OA
  if (k.includes("oa") || k.includes("oberarzt")) {
    return ["OA"];
  }

  // Fallback: lieber streng oder liberal – ich würde streng starten:
  return [];
}

export function eligibleEmployeesForShift(
  shift: ShiftLike,
  employees: EmployeeLike[]
): EmployeeLike[] {
  const allowed = allowedRoleGroupsForShift(shift);
  if (allowed.length === 0) return [];
  return employees
    .filter((e) => allowed.includes(e.roleGroup))
    .sort((a, b) =>
      (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, "de")
    );
}

export function employeeLabel(e: EmployeeLike) {
  return `${e.firstName} ${e.lastName}`;
}