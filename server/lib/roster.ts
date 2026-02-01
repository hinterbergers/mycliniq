import { db, and, eq, gte, lte } from "./db";
import { rosterShifts } from "@shared/schema";

const padTwo = (value: number) => String(value).padStart(2, "0");

export async function syncDraftFromFinal(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${padTwo(month)}-01`;
  const monthEnd = `${year}-${padTwo(month)}-${padTwo(lastDay)}`;

  await db
    .delete(rosterShifts)
    .where(
      and(
        eq(rosterShifts.isDraft, true),
        gte(rosterShifts.date, monthStart),
        lte(rosterShifts.date, monthEnd),
      ),
    );

  const finalRows = await db
    .select({
      date: rosterShifts.date,
      serviceType: rosterShifts.serviceType,
      employeeId: rosterShifts.employeeId,
      assigneeFreeText: rosterShifts.assigneeFreeText,
      notes: rosterShifts.notes,
    })
    .from(rosterShifts)
    .where(
      and(
        eq(rosterShifts.isDraft, false),
        gte(rosterShifts.date, monthStart),
        lte(rosterShifts.date, monthEnd),
      ),
    );

  if (!finalRows.length) return;

  const inserts = finalRows.map((row) => ({
    date: row.date,
    serviceType: row.serviceType,
    employeeId: row.employeeId ?? null,
    assigneeFreeText: row.assigneeFreeText ?? null,
    notes: row.notes ?? null,
    isDraft: true,
  }));

  await db.insert(rosterShifts).values(inserts);
}
