import { Router } from "express";
import {
  employees,
  absences,
  plannedAbsences,
} from "@shared/schema";
import { db, and, eq, gte, lte, ne } from "./lib/db";

const app = Router();

app.get(
  "/api/dashboard/absences",
  async (req, res) => {
    const departmentId = Number(req.query.departmentId);
    const from = req.query.from as string;
    const to = req.query.to as string;

    // Planned absences (Urlaub, Zeitausgleich, Ruhezeit, Fortbildung, ...)
    const plannedRows = await db
      .select({
        startDate: plannedAbsences.startDate,
        endDate: plannedAbsences.endDate,
        reason: plannedAbsences.reason,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
      .from(plannedAbsences)
      .innerJoin(employees, eq(plannedAbsences.employeeId, employees.id))
      .where(
        and(
          eq(employees.departmentId, departmentId),
          ne(plannedAbsences.status, "Abgelehnt"),
          gte(plannedAbsences.endDate, from),
          lte(plannedAbsences.startDate, to),
        ),
      );

    // Recorded absences (optional) – e.g. Krankenstand (from `absences`)
    const recordedRows = await db
      .select({
        startDate: absences.startDate,
        endDate: absences.endDate,
        reason: absences.reason,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
      .from(absences)
      .innerJoin(employees, eq(absences.employeeId, employees.id))
      .where(
        and(
          eq(employees.departmentId, departmentId),
          gte(absences.endDate, from),
          lte(absences.startDate, to),
        ),
      );

    const rows = [...plannedRows, ...recordedRows];

    res.json(rows);
  },
);

export default app;
