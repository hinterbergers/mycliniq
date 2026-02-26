import { db, and, eq, gte, lte, inArray, or } from "./db";
import { rosterShifts, shiftSwapRequests } from "@shared/schema";
import { logRosterShiftAuditEvents } from "./rosterShiftAudit";

const padTwo = (value: number) => String(value).padStart(2, "0");

const getMonthRange = (year: number, month: number) => {
  const lastDay = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${padTwo(month)}-01`;
  const monthEnd = `${year}-${padTwo(month)}-${padTwo(lastDay)}`;
  return { monthStart, monthEnd };
};

const buildShiftKey = (row: {
  date: string;
  serviceType: string;
}) => `${row.date}|${row.serviceType}`;

const assignmentChanged = (
  before?: { employeeId: number | null; assigneeFreeText?: string | null } | null,
  after?: { employeeId: number | null; assigneeFreeText?: string | null } | null,
) =>
  (before?.employeeId ?? null) !== (after?.employeeId ?? null) ||
  (before?.assigneeFreeText ?? null) !== (after?.assigneeFreeText ?? null);

export async function syncDraftFromFinal(year: number, month: number) {
  const { monthStart, monthEnd } = getMonthRange(year, month);

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

export async function syncFinalFromDraft(year: number, month: number) {
  const { monthStart, monthEnd } = getMonthRange(year, month);

  const finalShiftRows = await db
    .select({ id: rosterShifts.id })
    .from(rosterShifts)
    .where(
      and(
        eq(rosterShifts.isDraft, false),
        gte(rosterShifts.date, monthStart),
        lte(rosterShifts.date, monthEnd),
      ),
    );
  const finalShiftIds = finalShiftRows.map((row) => row.id);

  if (finalShiftIds.length > 0) {
    // Drop stale swap requests referencing final month shifts before replacing rows.
    await db
      .delete(shiftSwapRequests)
      .where(
        or(
          inArray(shiftSwapRequests.requesterShiftId, finalShiftIds),
          inArray(shiftSwapRequests.targetShiftId, finalShiftIds),
        ),
      );
  }

  const existingFinalRows = await db
    .select()
    .from(rosterShifts)
    .where(
      and(
        eq(rosterShifts.isDraft, false),
        gte(rosterShifts.date, monthStart),
        lte(rosterShifts.date, monthEnd),
      ),
    );
  await db
    .delete(rosterShifts)
    .where(
      and(
        eq(rosterShifts.isDraft, false),
        gte(rosterShifts.date, monthStart),
        lte(rosterShifts.date, monthEnd),
      ),
    );
  const draftRows = await db
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
        eq(rosterShifts.isDraft, true),
        gte(rosterShifts.date, monthStart),
        lte(rosterShifts.date, monthEnd),
      ),
    );

  if (!draftRows.length) return;

  const inserts = draftRows.map((row) => ({
    date: row.date,
    serviceType: row.serviceType,
    employeeId: row.employeeId ?? null,
    assigneeFreeText: row.assigneeFreeText ?? null,
    notes: row.notes ?? null,
    isDraft: false,
  }));

  const insertedRows = await db.insert(rosterShifts).values(inserts).returning();

  // Log only real final-plan deltas; the replace-copy mechanics should not spam the dashboard.
  const beforeByKey = new Map(existingFinalRows.map((row) => [buildShiftKey(row), row]));
  const afterByKey = new Map(insertedRows.map((row) => [buildShiftKey(row), row]));
  const allKeys = new Set<string>([...beforeByKey.keys(), ...afterByKey.keys()]);

  const deltaEvents = Array.from(allKeys)
    .map((key) => {
      const before = beforeByKey.get(key) ?? null;
      const after = afterByKey.get(key) ?? null;
      if (before && after) {
        if (!assignmentChanged(before, after)) return null;
        return {
          action: "update" as const,
          before,
          after,
          context: "syncFinalFromDraft.delta",
        };
      }
      if (!before && after) {
        return {
          action: "insert" as const,
          after,
          context: "syncFinalFromDraft.delta",
        };
      }
      if (before && !after) {
        return {
          action: "delete" as const,
          before,
          context: "syncFinalFromDraft.delta",
        };
      }
      return null;
    })
    .filter((event): event is NonNullable<typeof event> => Boolean(event));

  await logRosterShiftAuditEvents(deltaEvents);
}
