import type { Router } from "express";
import { z } from "zod";
import { db, eq, and, asc } from "../../lib/db";
import {
  ok,
  created,
  notFound,
  validationError,
  error,
  asyncHandler,
} from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import {
  weeklyPlans,
  weeklyPlanAssignments,
  rooms,
  employees,
} from "@shared/schema";

/**
 * Schema for creating a new weekly plan
 */
const createWeeklyPlanSchema = z.object({
  year: z.number().min(2020).max(2100),
  weekNumber: z.number().min(1).max(53),
  generatedFromDutyPlanId: z.number().positive().optional(),
  createdById: z.number().positive().optional(),
});

/**
 * Schema for status update
 */
const updateStatusSchema = z.object({
  status: z.enum(["Entwurf", "Vorläufig", "Freigegeben"]),
});

/**
 * Schema for creating an assignment
 */
const createAssignmentSchema = z
  .object({
    roomId: z.number().positive(),
    weekday: z.number().min(1).max(7),
    employeeId: z.number().positive().nullable().optional(),
    roleLabel: z.string().nullable().optional(),
    assignmentType: z
      .enum(["Plan", "Zeitausgleich", "Fortbildung"])
      .default("Plan"),
    note: z.string().nullable().optional(),
    isBlocked: z.boolean().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.employeeId) ||
      Boolean(data.note?.trim()) ||
      data.isBlocked === true,
    { message: "Zuweisung benötigt Mitarbeiter, Notiz oder Sperre." },
  );

const updateAssignmentSchema = z
  .object({
    employeeId: z.number().positive().nullable().optional(),
    roleLabel: z.string().nullable().optional(),
    assignmentType: z.enum(["Plan", "Zeitausgleich", "Fortbildung"]).optional(),
    note: z.string().nullable().optional(),
    isBlocked: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Keine Felder zum Aktualisieren angegeben.",
  });

const updateLockedWeekdaysSchema = z.object({
  lockedWeekdays: z.array(z.number().min(1).max(7)).default([]),
});

/**
 * Assignment ID param schema
 */
const assignmentIdParamSchema = z.object({
  assignmentId: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * Weekly Plan (Wochenplan) API Routes
 * Base path: /api/weekly-plans
 */
export function registerWeeklyPlanRoutes(router: Router) {
  async function buildWeeklyPlanResponse(planId: number) {
    const [plan] = await db
      .select()
      .from(weeklyPlans)
      .where(eq(weeklyPlans.id, planId));

    if (!plan) {
      return null;
    }

    const assignments = await db
      .select({
        id: weeklyPlanAssignments.id,
        weeklyPlanId: weeklyPlanAssignments.weeklyPlanId,
        roomId: weeklyPlanAssignments.roomId,
        weekday: weeklyPlanAssignments.weekday,
        employeeId: weeklyPlanAssignments.employeeId,
        roleLabel: weeklyPlanAssignments.roleLabel,
        assignmentType: weeklyPlanAssignments.assignmentType,
        note: weeklyPlanAssignments.note,
        isBlocked: weeklyPlanAssignments.isBlocked,
        createdAt: weeklyPlanAssignments.createdAt,
        updatedAt: weeklyPlanAssignments.updatedAt,
        roomName: rooms.name,
        roomCategory: rooms.category,
        employeeName: employees.name,
        employeeLastName: employees.lastName,
        employeeRole: employees.role,
      })
      .from(weeklyPlanAssignments)
      .leftJoin(rooms, eq(weeklyPlanAssignments.roomId, rooms.id))
      .leftJoin(employees, eq(weeklyPlanAssignments.employeeId, employees.id))
      .where(eq(weeklyPlanAssignments.weeklyPlanId, planId))
      .orderBy(
        asc(weeklyPlanAssignments.weekday),
        asc(weeklyPlanAssignments.roomId),
        asc(weeklyPlanAssignments.id),
      );

    const assignmentsByWeekday: Record<number, typeof assignments> = {};
    for (let day = 1; day <= 7; day++) {
      assignmentsByWeekday[day] = assignments.filter((a) => a.weekday === day);
    }

    return {
      ...plan,
      assignments,
      assignmentsByWeekday,
      summary: {
        totalAssignments: assignments.length,
        monday: assignmentsByWeekday[1]?.length || 0,
        tuesday: assignmentsByWeekday[2]?.length || 0,
        wednesday: assignmentsByWeekday[3]?.length || 0,
        thursday: assignmentsByWeekday[4]?.length || 0,
        friday: assignmentsByWeekday[5]?.length || 0,
        saturday: assignmentsByWeekday[6]?.length || 0,
        sunday: assignmentsByWeekday[7]?.length || 0,
      },
    };
  }

  /**
   * GET /api/weekly-plans
   * Get all weekly plans (optionally filtered by year/week/status)
   */
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { year, week, status } = req.query;

      let result = await db.select().from(weeklyPlans);

      // Apply filters
      if (year) {
        result = result.filter((p) => p.year === Number(year));
      }

      if (week) {
        result = result.filter((p) => p.weekNumber === Number(week));
      }

      if (status) {
        result = result.filter((p) => p.status === status);
      }

      return ok(res, result);
    }),
  );

  /**
   * GET /api/weekly-plans/:id
   * Get weekly plan with all assignments
   */
  router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);

      const planData = await buildWeeklyPlanResponse(planId);
      if (!planData) {
        return notFound(res, "Wochenplan");
      }

      return ok(res, planData);
    }),
  );

  /**
   * GET /api/weekly-plans/week/:year/:week
   * Get weekly plan for specific week
   */
  router.get(
    "/week/:year/:week",
    asyncHandler(async (req, res) => {
      const { year, week } = req.params;
      const createIfMissing = req.query.createIfMissing === "true";
      const yearNumber = Number(year);
      const weekNumber = Number(week);

      let [plan] = await db
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.year, yearNumber),
            eq(weeklyPlans.weekNumber, weekNumber),
          ),
        );

      if (!plan) {
        if (!createIfMissing) {
          return notFound(res, "Wochenplan");
        }

        const [createdPlan] = await db
          .insert(weeklyPlans)
          .values({
            year: yearNumber,
            weekNumber,
            status: "Entwurf",
            createdById: req.user?.employeeId ?? null,
          })
          .returning();

        plan = createdPlan;
      }

      const planData = await buildWeeklyPlanResponse(plan.id);
      if (!planData) {
        return notFound(res, "Wochenplan");
      }

      return ok(res, planData);
    }),
  );

  /**
   * POST /api/weekly-plans
   * Create new weekly plan
   */
  router.post(
    "/",
    validateBody(createWeeklyPlanSchema),
    asyncHandler(async (req, res) => {
      const { year, weekNumber, generatedFromDutyPlanId, createdById } =
        req.body;

      // Check if plan already exists for this week
      const [existing] = await db
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.year, year),
            eq(weeklyPlans.weekNumber, weekNumber),
          ),
        );

      if (existing) {
        return error(
          res,
          `Wochenplan für KW ${weekNumber}/${year} existiert bereits`,
          409,
        );
      }

      // Create the weekly plan
      const [plan] = await db
        .insert(weeklyPlans)
        .values({
          year,
          weekNumber,
          status: "Entwurf",
          generatedFromDutyPlanId: generatedFromDutyPlanId || null,
          createdById: createdById || null,
        })
        .returning();

      return created(res, {
        ...plan,
        message: `Wochenplan für KW ${weekNumber}/${year} erstellt`,
      });
    }),
  );

  /**
   * POST /api/weekly-plans/:id/assign
   * Add a new assignment to the weekly plan
   * Body: { roomId, weekday, employeeId, roleLabel, assignmentType }
   */
  router.post(
    "/:id/assign",
    validateParams(idParamSchema),
    validateBody(createAssignmentSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      const {
        roomId,
        weekday,
        employeeId,
        roleLabel,
        assignmentType,
        note,
        isBlocked,
      } = req.body;

      // Verify plan exists
      const [plan] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));
      if (!plan) {
        return notFound(res, "Wochenplan");
      }

      // Verify room exists
      const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
      if (!room) {
        return notFound(res, "Raum");
      }

      let employee = null;
      if (employeeId) {
        [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, employeeId));
        if (!employee) {
          return notFound(res, "Mitarbeiter");
        }
      }

      // Create new assignment (duplicates allowed)
      const [assignment] = await db
        .insert(weeklyPlanAssignments)
        .values({
          weeklyPlanId: planId,
          roomId,
          weekday,
          employeeId: employeeId ?? null,
          roleLabel: roleLabel || null,
          assignmentType: assignmentType || "Plan",
          note: note?.trim() || null,
          isBlocked: Boolean(isBlocked),
        })
        .returning();

      return created(res, {
        ...assignment,
        roomName: room.name,
        roomCategory: room.category,
        employeeName: employee?.name ?? null,
        employeeLastName: employee?.lastName ?? null,
      });
    }),
  );

  /**
   * PATCH /api/weekly-plans/assignments/:assignmentId
   * Update an assignment (note/block/employee)
   */
  router.patch(
    "/assignments/:assignmentId",
    validateParams(assignmentIdParamSchema),
    validateBody(updateAssignmentSchema),
    asyncHandler(async (req, res) => {
      const { assignmentId } = req.params;
      const assignmentIdNum = Number(assignmentId);
      const { employeeId, roleLabel, assignmentType, note, isBlocked } =
        req.body;

      const [existing] = await db
        .select()
        .from(weeklyPlanAssignments)
        .where(eq(weeklyPlanAssignments.id, assignmentIdNum));

      if (!existing) {
        return notFound(res, "Zuweisung");
      }

      let employee = null;
      if (employeeId !== undefined && employeeId !== null) {
        [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, employeeId));
        if (!employee) {
          return notFound(res, "Mitarbeiter");
        }
      }

      const nextEmployeeId =
        employeeId === undefined ? existing.employeeId : employeeId;
      const nextNote =
        note === undefined ? existing.note : note?.trim() || null;
      const nextIsBlocked = isBlocked ?? existing.isBlocked;

      if (!nextEmployeeId && !nextNote && !nextIsBlocked) {
        return validationError(
          res,
          "Leere Zuweisung ist nicht erlaubt. Bitte löschen statt leeren.",
        );
      }

      const [updated] = await db
        .update(weeklyPlanAssignments)
        .set({
          employeeId: nextEmployeeId,
          roleLabel: roleLabel ?? existing.roleLabel,
          assignmentType: assignmentType ?? existing.assignmentType,
          note: nextNote,
          isBlocked: nextIsBlocked,
          updatedAt: new Date(),
        })
        .where(eq(weeklyPlanAssignments.id, assignmentIdNum))
        .returning();

      return ok(res, {
        ...updated,
        employeeName: employee?.name ?? null,
        employeeLastName: employee?.lastName ?? null,
      });
    }),
  );

  /**
   * PUT /api/weekly-plans/:id/status
   * Update weekly plan status with validation
   * Allowed transitions:
   *   'Entwurf' -> 'Vorläufig'
   *   'Entwurf' -> 'Freigegeben'
   *   'Vorläufig' -> 'Freigegeben'
   *   'Vorläufig' -> 'Entwurf' (Rücksetzen)
   *   'Freigegeben' -> 'Entwurf' (erneute Bearbeitung)
   */
  router.put(
    "/:id/status",
    validateParams(idParamSchema),
    validateBody(updateStatusSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      const { status } = req.body;

      // Get current plan
      const [existing] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));

      if (!existing) {
        return notFound(res, "Wochenplan");
      }

      // Validate status transitions
      const currentStatus = existing.status;
      const allowedTransitions: Record<string, string[]> = {
        Entwurf: ["Vorläufig", "Freigegeben"],
        Vorläufig: ["Freigegeben", "Entwurf"],
        Freigegeben: ["Entwurf"],
      };

      if (
        status !== currentStatus &&
        !allowedTransitions[currentStatus]?.includes(status)
      ) {
        return validationError(
          res,
          `Statuswechsel von '${currentStatus}' nach '${status}' nicht erlaubt. ` +
            `Erlaubt: ${allowedTransitions[currentStatus]?.join(", ") || "keine"}`,
        );
      }

      // Update the plan
      const [plan] = await db
        .update(weeklyPlans)
        .set({ status, updatedAt: new Date() })
        .where(eq(weeklyPlans.id, planId))
        .returning();

      return ok(res, plan);
    }),
  );

  /**
   * PUT /api/weekly-plans/:id/locked-weekdays
   * Set locked weekdays for a plan (1-7)
   */
  router.put(
    "/:id/locked-weekdays",
    validateParams(idParamSchema),
    validateBody(updateLockedWeekdaysSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      // Ensure proper runtime validation + correct TypeScript type (number[])
      const { lockedWeekdays } = updateLockedWeekdaysSchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));
      if (!existing) {
        return notFound(res, "Wochenplan");
      }

      const uniqueLocked = Array.from(new Set(lockedWeekdays)).sort(
        (a, b) => a - b,
      );
      const [updated] = await db
        .update(weeklyPlans)
        .set({ lockedWeekdays: uniqueLocked, updatedAt: new Date() })
        .where(eq(weeklyPlans.id, planId))
        .returning();

      return ok(res, updated);
    }),
  );

  /**
   * DELETE /api/weekly-plans/assignments/:assignmentId
   * Remove an assignment from a weekly plan
   */
  router.delete(
    "/assignments/:assignmentId",
    validateParams(assignmentIdParamSchema),
    asyncHandler(async (req, res) => {
      const { assignmentId } = req.params;
      const assignmentIdNum = Number(assignmentId);

      // Verify assignment exists
      const [assignment] = await db
        .select()
        .from(weeklyPlanAssignments)
        .where(eq(weeklyPlanAssignments.id, assignmentIdNum));

      if (!assignment) {
        return notFound(res, "Zuweisung");
      }

      // Delete assignment
      await db
        .delete(weeklyPlanAssignments)
        .where(eq(weeklyPlanAssignments.id, assignmentIdNum));

      return ok(res, {
        deleted: true,
        id: assignmentIdNum,
        message: "Zuweisung entfernt",
      });
    }),
  );

  /**
   * GET /api/weekly-plans/:id/assignments
   * Get all assignments for a weekly plan
   */
  router.get(
    "/:id/assignments",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      const { weekday, roomId } = req.query;

      // Verify plan exists
      const [plan] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));
      if (!plan) {
        return notFound(res, "Wochenplan");
      }

      // Get assignments with filters
      let assignments = await db
        .select({
          id: weeklyPlanAssignments.id,
          weeklyPlanId: weeklyPlanAssignments.weeklyPlanId,
          roomId: weeklyPlanAssignments.roomId,
          weekday: weeklyPlanAssignments.weekday,
          employeeId: weeklyPlanAssignments.employeeId,
          roleLabel: weeklyPlanAssignments.roleLabel,
          assignmentType: weeklyPlanAssignments.assignmentType,
          note: weeklyPlanAssignments.note,
          isBlocked: weeklyPlanAssignments.isBlocked,
          createdAt: weeklyPlanAssignments.createdAt,
          roomName: rooms.name,
          roomCategory: rooms.category,
          employeeName: employees.name,
          employeeLastName: employees.lastName,
        })
        .from(weeklyPlanAssignments)
        .leftJoin(rooms, eq(weeklyPlanAssignments.roomId, rooms.id))
        .leftJoin(employees, eq(weeklyPlanAssignments.employeeId, employees.id))
        .where(eq(weeklyPlanAssignments.weeklyPlanId, planId));

      // Apply filters
      if (weekday) {
        assignments = assignments.filter((a) => a.weekday === Number(weekday));
      }

      if (roomId) {
        assignments = assignments.filter((a) => a.roomId === Number(roomId));
      }

      return ok(res, assignments);
    }),
  );

  /**
   * DELETE /api/weekly-plans/:id
   * Delete weekly plan (only if status is 'Entwurf')
   * Cascades: deletes all assignments
   */
  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);

      // Get current plan
      const [existing] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));

      if (!existing) {
        return notFound(res, "Wochenplan");
      }

      // Only allow deletion of 'Entwurf' plans
      if (existing.status !== "Entwurf") {
        return validationError(
          res,
          "Nur Wochenpläne im Status 'Entwurf' können gelöscht werden",
        );
      }

      // Delete all assignments
      await db
        .delete(weeklyPlanAssignments)
        .where(eq(weeklyPlanAssignments.weeklyPlanId, planId));

      // Delete plan
      await db.delete(weeklyPlans).where(eq(weeklyPlans.id, planId));

      return ok(res, {
        deleted: true,
        id: planId,
        message: "Wochenplan und alle Zuweisungen wurden gelöscht",
      });
    }),
  );

  /**
   * POST /api/weekly-plans/:id/generate-from-duty
   * Placeholder for generating from duty plan (not implemented)
   */
  router.post(
    "/:id/generate-from-duty",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      return ok(res, {
        message: "Generierung aus Dienstplan noch nicht implementiert",
        hint: "Manuelle Zuweisung über POST /:id/assign verwenden",
      });
    }),
  );

  return router;
}
