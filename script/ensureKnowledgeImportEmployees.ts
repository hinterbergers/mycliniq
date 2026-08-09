import "dotenv/config";

import { and, eq, isNull, or } from "../server/lib/db";
import { db } from "../server/db";
import { employees } from "../shared/schema";

type EnsureEmployee = {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  role:
    | "Primararzt"
    | "1. Oberarzt"
    | "Funktionsoberarzt"
    | "Ausbildungsoberarzt"
    | "Oberarzt"
    | "Oberärztin"
    | "Facharzt"
    | "Assistenzarzt"
    | "Assistenzärztin"
    | "Turnusarzt"
    | "Student (KPJ)"
    | "Student (Famulant)"
    | "Sekretariat";
  title?: string | null;
  inactiveReason?: string | null;
  isActive?: boolean;
};

const IMPORT_EMPLOYEES: EnsureEmployee[] = [
  {
    name: "Luminita",
    firstName: "Luminita",
    lastName: "Badea",
    title: "Dr.",
    role: "Oberarzt",
    inactiveReason: "Karenz",
    isActive: false,
  },
  {
    name: "Krankenhaus-Hygiene",
    firstName: "Krankenhaus-Hygiene",
    lastName: null,
    role: "Sekretariat",
    inactiveReason: "Importprofil fuer interdisziplinaere Wissensdokumente",
    isActive: false,
  },
  {
    name: "Abteilung Finanzen und Controlling",
    firstName: "Abteilung Finanzen und Controlling",
    lastName: null,
    role: "Sekretariat",
    inactiveReason: "Importprofil fuer Verwaltungs- und Organisationsdokumente",
    isActive: false,
  },
];

async function ensureEmployee(entry: EnsureEmployee) {
  const conditions = [
    eq(employees.name, entry.name),
    entry.lastName
      ? and(eq(employees.name, entry.firstName ?? entry.name), eq(employees.lastName, entry.lastName))
      : and(eq(employees.name, entry.name), isNull(employees.lastName)),
  ].filter(Boolean) as ReturnType<typeof eq>[];

  const [existing] = await db
    .select({
      id: employees.id,
      name: employees.name,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(or(...conditions))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [inserted] = await db
    .insert(employees)
    .values({
      name: entry.name,
      firstName: entry.firstName ?? null,
      lastName: entry.lastName ?? null,
      title: entry.title ?? null,
      role: entry.role,
      isActive: entry.isActive ?? false,
      inactiveReason: entry.inactiveReason ?? null,
      appRole: "User",
      systemRole: "employee",
      takesShifts: false,
      canOverduty: false,
      isAdmin: false,
      trainingEnabled: false,
    })
    .returning({ id: employees.id });

  return inserted.id;
}

async function main() {
  for (const entry of IMPORT_EMPLOYEES) {
    const id = await ensureEmployee(entry);
    console.log(`Employee ensured: ${entry.name}${entry.lastName ? ` ${entry.lastName}` : ""} -> ${id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
