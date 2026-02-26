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

export async function syncDraftFromFinal(year: number, month: number) {
  const { monthStart, monthEnd } = getMonthRange(year, month);

  const existingDraftRows = await db
    .select()
    .from(rosterShifts)
    .where(
      and(
        eq(rosterShifts.isDraft, true),
        gte(rosterShifts.date, monthStart),
        lte(rosterShifts.date, monthEnd),
      ),
    );
  await db
    .delete(rosterShifts)
    .where(
      and(
        eq(rosterShifts.isDraft, true),
        gte(rosterShifts.date, monthStart),
        lte(rosterShifts.date, monthEnd),
      ),
    );
  await logRosterShiftAuditEvents(
    existingDraftRows.map((row) => ({
      action: "delete" as const,
      before: row,
      context: "syncDraftFromFinal.clearDraftMonth",
    })),
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

  const insertedRows = await db.insert(rosterShifts).values(inserts).returning();
  await logRosterShiftAuditEvents(
    insertedRows.map((row) => ({
      action: "insert" as const,
      after: row,
      context: "syncDraftFromFinal.copyFinalToDraft",
    })),
  );
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
  await logRosterShiftAuditEvents(
    existingFinalRows.map((row) => ({
      action: "delete" as const,
      before: row,
      context: "syncFinalFromDraft.replaceFinalMonth.clearFinal",
    })),
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
  await logRosterShiftAuditEvents(
    insertedRows.map((row) => ({
      action: "insert" as const,
      after: row,
      context: "syncFinalFromDraft.copyDraftToFinal",
    })),
  );
}
