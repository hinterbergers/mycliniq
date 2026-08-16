import { getISODay, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { rooms, weeklyPlanAssignments, weeklyPlans } from "@shared/schema";

export const DECLINED_ZEITAUSGLEICH_NOTE = "kein Zeitausgleich gewünscht";
const ORGANISATION_ROOM_NAME = "Verwaltung / Organisation";

export async function ensureDeclinedZeitausgleichAssignment(input: {
  employeeId: number;
  date: string;
  actorId: number;
}) {
  const date = parseISO(input.date);
  const year = getISOWeekYear(date);
  const weekNumber = getISOWeek(date);
  const weekday = getISODay(date);

  const [room] = await db
    .select()
    .from(rooms)
    .where(
      and(eq(rooms.name, ORGANISATION_ROOM_NAME), eq(rooms.isActive, true)),
    )
    .limit(1);

  if (!room) {
    throw new Error(`Arbeitsplatz '${ORGANISATION_ROOM_NAME}' nicht gefunden`);
  }

  let [plan] = await db
    .select()
    .from(weeklyPlans)
    .where(
      and(eq(weeklyPlans.year, year), eq(weeklyPlans.weekNumber, weekNumber)),
    )
    .limit(1);

  if (!plan) {
    [plan] = await db
      .insert(weeklyPlans)
      .values({
        year,
        weekNumber,
        status: "Entwurf",
        createdById: input.actorId,
      })
      .returning();
  }

  const [existing] = await db
    .select()
    .from(weeklyPlanAssignments)
    .where(
      and(
        eq(weeklyPlanAssignments.weeklyPlanId, plan.id),
        eq(weeklyPlanAssignments.roomId, room.id),
        eq(weeklyPlanAssignments.weekday, weekday),
        eq(weeklyPlanAssignments.employeeId, input.employeeId),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.note === DECLINED_ZEITAUSGLEICH_NOTE) return existing;
    const [updated] = await db
      .update(weeklyPlanAssignments)
      .set({
        note: DECLINED_ZEITAUSGLEICH_NOTE,
        updatedById: input.actorId,
        updatedAt: new Date(),
      })
      .where(eq(weeklyPlanAssignments.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(weeklyPlanAssignments)
    .values({
      weeklyPlanId: plan.id,
      roomId: room.id,
      weekday,
      employeeId: input.employeeId,
      assignmentType: "Plan",
      note: DECLINED_ZEITAUSGLEICH_NOTE,
      createdById: input.actorId,
      updatedById: input.actorId,
    })
    .returning();

  return created;
}
