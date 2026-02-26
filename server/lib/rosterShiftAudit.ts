import { db } from "./db";
import { rosterShiftChangeLogs, type RosterShift } from "@shared/schema";

type RosterShiftSnapshotLike = Pick<
  RosterShift,
  "id" | "date" | "serviceType" | "employeeId" | "assigneeFreeText" | "isDraft"
>;

export type RosterShiftAuditActor = {
  actorEmployeeId?: number | null;
  actorName?: string | null;
  context?: string | null;
};

export type RosterShiftAuditEventInput = RosterShiftAuditActor & {
  action: "insert" | "update" | "delete";
  before?: RosterShiftSnapshotLike | null;
  after?: RosterShiftSnapshotLike | null;
};

const isMissingAuditTableError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  if (err.code === "42P01") return true;
  return (
    err.message?.toLowerCase().includes("roster_shift_change_logs") ?? false
  );
};

export async function logRosterShiftAuditEvents(
  events: RosterShiftAuditEventInput[],
): Promise<void> {
  if (!events.length) return;

  const rows = events
    .map((event) => {
      const before = event.before ?? null;
      const after = event.after ?? null;
      const basis = after ?? before;
      if (!basis) return null;
      return {
        rosterShiftId: after?.id ?? before?.id ?? null,
        action: event.action,
        context: event.context ?? null,
        date: basis.date,
        serviceType: basis.serviceType,
        isDraft: Boolean(basis.isDraft),
        beforeEmployeeId: before?.employeeId ?? null,
        afterEmployeeId: after?.employeeId ?? null,
        beforeAssigneeFreeText: before?.assigneeFreeText ?? null,
        afterAssigneeFreeText: after?.assigneeFreeText ?? null,
        actorEmployeeId: event.actorEmployeeId ?? null,
        actorName: event.actorName ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!rows.length) return;

  try {
    await db.insert(rosterShiftChangeLogs).values(rows);
  } catch (error) {
    // Keep roster workflows untouched if audit logging is not yet migrated or fails.
    if (!isMissingAuditTableError(error)) {
      console.error("[RosterShiftAudit] Failed to persist audit rows", error);
    }
  }
}

export async function logRosterShiftAuditEvent(
  event: RosterShiftAuditEventInput,
): Promise<void> {
  await logRosterShiftAuditEvents([event]);
}
