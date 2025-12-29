import type { Router } from "express";
import { z } from "zod";
import { db, eq, and } from "../../lib/db";
import { 
  ok, 
  created, 
  notFound, 
  validationError,
  error,
  asyncHandler 
} from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { 
  dutyPlans, 
  dutyDays, 
  dutySlots, 
  dutyAssignments,
  employees,
  rosterSettings
} from "@shared/schema";

/**
 * Schema for creating a new duty plan
 */
const createDutyPlanSchema = z.object({
  year: z.number().min(2020).max(2100),
  month: z.number().min(1).max(12),
  generatedById: z.number().positive().optional()
});

/**
 * Schema for status update
 */
const updateStatusSchema = z.object({
  status: z.enum(['Entwurf', 'Vorläufig', 'Freigegeben']),
  releasedById: z.number().positive().nullable().optional()
});

/**
 * Schema for creating a duty slot
 */
const createSlotSchema = z.object({
  dutyDayId: z.number().positive(),
  serviceType: z.enum(['gyn', 'kreiszimmer', 'turnus', 'oa_dienst', 'fa_dienst', 'tagdienst', 'nachtdienst']),
  label: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Zeit im Format HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Zeit im Format HH:MM")
});

/**
 * Schema for assigning employee to slot
 */
const assignSlotSchema = z.object({
  employeeId: z.number().positive(),
  roleBadge: z.string().nullable().optional(),
  isPrimary: z.boolean().default(true)
});

/**
 * Slot ID param schema
 */
const slotIdParamSchema = z.object({
  slotId: z.string().regex(/^\d+$/).transform(Number)
});

/**
 * Get number of days in a month
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(year: number, month: number, day: number): string {
  const m = month.toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function compareYearMonth(
  year: number,
  month: number,
  otherYear: number,
  otherMonth: number
): number {
  if (year === otherYear) return month - otherMonth;
  return year - otherYear;
}

/**
 * Duty Plan (Dienstplan) API Routes
 * Base path: /api/duty-plans
 */
export function registerDutyPlanRoutes(router: Router) {

  /**
   * GET /api/duty-plans
   * Get all duty plans (optionally filtered by year/month/status)
   */
  router.get("/", asyncHandler(async (req, res) => {
    const { year, month, status } = req.query;
    
    let result = await db.select().from(dutyPlans);
    
    // Apply filters
    if (year) {
      result = result.filter(p => p.year === Number(year));
    }
    
    if (month) {
      result = result.filter(p => p.month === Number(month));
    }
    
    if (status) {
      result = result.filter(p => p.status === status);
    }
    
    return ok(res, result);
  }));

  /**
   * GET /api/duty-plans/:id
   * Get complete duty plan with days, slots, and assignments
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      
      // Get base plan
      const [plan] = await db.select().from(dutyPlans).where(eq(dutyPlans.id, planId));
      
      if (!plan) {
        return notFound(res, "Dienstplan");
      }
      
      // Get all days for this plan
      const days = await db
        .select()
        .from(dutyDays)
        .where(eq(dutyDays.dutyPlanId, planId));
      
      // Get all slots for these days
      const dayIds = days.map(d => d.id);
      let slots: any[] = [];
      
      if (dayIds.length > 0) {
        // Get slots for each day
        for (const dayId of dayIds) {
          const daySlots = await db
            .select()
            .from(dutySlots)
            .where(eq(dutySlots.dutyDayId, dayId));
          slots = [...slots, ...daySlots];
        }
      }
      
      // Get all assignments for these slots
      const slotIds = slots.map(s => s.id);
      let assignments: any[] = [];
      
      if (slotIds.length > 0) {
        for (const slotId of slotIds) {
          const slotAssignments = await db
            .select({
              id: dutyAssignments.id,
              dutySlotId: dutyAssignments.dutySlotId,
              employeeId: dutyAssignments.employeeId,
              roleBadge: dutyAssignments.roleBadge,
              isPrimary: dutyAssignments.isPrimary,
              createdAt: dutyAssignments.createdAt,
              employeeName: employees.name,
              employeeLastName: employees.lastName
            })
            .from(dutyAssignments)
            .leftJoin(employees, eq(dutyAssignments.employeeId, employees.id))
            .where(eq(dutyAssignments.dutySlotId, slotId));
          assignments = [...assignments, ...slotAssignments];
        }
      }
      
      // Build structured response
      const daysWithSlots = days.map(day => ({
        ...day,
        slots: slots
          .filter(s => s.dutyDayId === day.id)
          .map(slot => ({
            ...slot,
            assignments: assignments.filter(a => a.dutySlotId === slot.id)
          }))
      }));
      
      return ok(res, {
        ...plan,
        days: daysWithSlots,
        summary: {
          totalDays: days.length,
          totalSlots: slots.length,
          totalAssignments: assignments.length
        }
      });
    })
  );

  /**
   * GET /api/duty-plans/month/:year/:month
   * Get duty plan for specific month
   */
  router.get("/month/:year/:month",
    asyncHandler(async (req, res) => {
      const { year, month } = req.params;
      
      const [plan] = await db
        .select()
        .from(dutyPlans)
        .where(
          and(
            eq(dutyPlans.year, Number(year)),
            eq(dutyPlans.month, Number(month))
          )
        );
      
      if (!plan) {
        return notFound(res, "Dienstplan");
      }
      
      // Redirect to full plan endpoint
      return ok(res, { 
        planId: plan.id, 
        message: "Use GET /api/duty-plans/:id for full data" 
      });
    })
  );

  /**
   * POST /api/duty-plans
   * Create new duty plan with auto-generated days for the month
   */
  router.post("/",
    validateBody(createDutyPlanSchema),
    asyncHandler(async (req, res) => {
      const { year, month, generatedById } = req.body;
      
      // Check if plan already exists for this month
      const [existing] = await db
        .select()
        .from(dutyPlans)
        .where(
          and(
            eq(dutyPlans.year, year),
            eq(dutyPlans.month, month)
          )
        );
      
      if (existing) {
        return error(res, `Dienstplan für ${month}/${year} existiert bereits`, 409);
      }
      
      // Create the duty plan
      const [plan] = await db
        .insert(dutyPlans)
        .values({
          year,
          month,
          status: 'Entwurf',
          generatedById: generatedById || null
        })
        .returning();
      
      // Generate duty_days for all days in the month
      const daysInMonth = getDaysInMonth(year, month);
      const daysToInsert = [];
      
      for (let day = 1; day <= daysInMonth; day++) {
        daysToInsert.push({
          dutyPlanId: plan.id,
          date: formatDate(year, month, day)
        });
      }
      
      await db.insert(dutyDays).values(daysToInsert);
      
      // Fetch created days
      const createdDays = await db
        .select()
        .from(dutyDays)
        .where(eq(dutyDays.dutyPlanId, plan.id));
      
      return created(res, {
        ...plan,
        days: createdDays,
        message: `Dienstplan für ${month}/${year} erstellt mit ${daysInMonth} Tagen`
      });
    })
  );

  /**
   * PUT /api/duty-plans/:id
   * Update duty plan status with validation
   * Allowed transitions:
   *   'Entwurf' -> 'Vorläufig'
   *   'Vorläufig' -> 'Freigegeben'
   */
  router.put("/:id",
    validateParams(idParamSchema),
    validateBody(updateStatusSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      const { status, releasedById } = req.body;
      
      // Get current plan
      const [existing] = await db.select().from(dutyPlans).where(eq(dutyPlans.id, planId));
      
      if (!existing) {
        return notFound(res, "Dienstplan");
      }
      
      // Validate status transitions
      const currentStatus = existing.status;
      const allowedTransitions: Record<string, string[]> = {
        'Entwurf': ['Vorläufig'],
        'Vorläufig': ['Freigegeben', 'Entwurf'],
        'Freigegeben': ['Vorläufig', 'Entwurf']
      };
      
      if (status !== currentStatus && !allowedTransitions[currentStatus]?.includes(status)) {
        return validationError(res, 
          `Statuswechsel von '${currentStatus}' nach '${status}' nicht erlaubt. ` +
          `Erlaubt: ${allowedTransitions[currentStatus]?.join(', ') || 'keine'}`
        );
      }
      
      // Update the plan
      const updateData: Record<string, any> = { status };
      
      if (status === 'Freigegeben' && releasedById) {
        updateData.releasedById = releasedById;
      }
      
      const [plan] = await db
        .update(dutyPlans)
        .set(updateData)
        .where(eq(dutyPlans.id, planId))
        .returning();

      if (status === "Freigegeben") {
        const existingSettings = await db.select().from(rosterSettings);
        const settings = existingSettings[0];
        const shouldUpdate =
          !settings ||
          compareYearMonth(existing.year, existing.month, settings.lastApprovedYear, settings.lastApprovedMonth) >= 0;
        if (shouldUpdate) {
          if (settings) {
            await db
              .update(rosterSettings)
              .set({
                lastApprovedYear: existing.year,
                lastApprovedMonth: existing.month,
                updatedById: releasedById ?? null,
                updatedAt: new Date()
              })
              .where(eq(rosterSettings.id, settings.id));
          } else {
            await db.insert(rosterSettings).values({
              lastApprovedYear: existing.year,
              lastApprovedMonth: existing.month,
              updatedById: releasedById ?? null
            });
          }
        }
      }
      
      return ok(res, plan);
    })
  );

  /**
   * DELETE /api/duty-plans/:id
   * Delete duty plan (only if status is 'Entwurf')
   * Cascades: days -> slots -> assignments
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      
      // Get current plan
      const [existing] = await db.select().from(dutyPlans).where(eq(dutyPlans.id, planId));
      
      if (!existing) {
        return notFound(res, "Dienstplan");
      }
      
      // Only allow deletion of 'Entwurf' plans
      if (existing.status !== 'Entwurf') {
        return validationError(res, "Nur Dienstpläne im Status 'Entwurf' können gelöscht werden");
      }
      
      // Get all days for this plan
      const days = await db.select().from(dutyDays).where(eq(dutyDays.dutyPlanId, planId));
      const dayIds = days.map(d => d.id);
      
      // Delete assignments and slots for each day
      for (const dayId of dayIds) {
        const slots = await db.select().from(dutySlots).where(eq(dutySlots.dutyDayId, dayId));
        
        for (const slot of slots) {
          await db.delete(dutyAssignments).where(eq(dutyAssignments.dutySlotId, slot.id));
        }
        
        await db.delete(dutySlots).where(eq(dutySlots.dutyDayId, dayId));
      }
      
      // Delete days
      await db.delete(dutyDays).where(eq(dutyDays.dutyPlanId, planId));
      
      // Delete plan
      await db.delete(dutyPlans).where(eq(dutyPlans.id, planId));
      
      return ok(res, { 
        deleted: true, 
        id: planId,
        message: "Dienstplan und alle zugehörigen Daten wurden gelöscht"
      });
    })
  );

  /**
   * POST /api/duty-plans/:id/slots
   * Create a new duty slot for a day in this plan
   * Body: { dutyDayId, serviceType, label, startTime, endTime }
   */
  router.post("/:id/slots",
    validateParams(idParamSchema),
    validateBody(createSlotSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      const { dutyDayId, serviceType, label, startTime, endTime } = req.body;
      
      // Verify plan exists
      const [plan] = await db.select().from(dutyPlans).where(eq(dutyPlans.id, planId));
      if (!plan) {
        return notFound(res, "Dienstplan");
      }
      
      // Verify day belongs to this plan
      const [day] = await db
        .select()
        .from(dutyDays)
        .where(
          and(
            eq(dutyDays.id, dutyDayId),
            eq(dutyDays.dutyPlanId, planId)
          )
        );
      
      if (!day) {
        return validationError(res, "Tag gehört nicht zu diesem Dienstplan");
      }
      
      // Create the slot
      const [slot] = await db
        .insert(dutySlots)
        .values({
          dutyDayId,
          serviceType,
          label,
          startTime,
          endTime
        })
        .returning();
      
      return created(res, {
        ...slot,
        date: day.date
      });
    })
  );

  /**
   * GET /api/duty-plans/:id/days
   * Get all days for a duty plan
   */
  router.get("/:id/days",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      
      // Verify plan exists
      const [plan] = await db.select().from(dutyPlans).where(eq(dutyPlans.id, planId));
      if (!plan) {
        return notFound(res, "Dienstplan");
      }
      
      const days = await db
        .select()
        .from(dutyDays)
        .where(eq(dutyDays.dutyPlanId, planId));
      
      return ok(res, days);
    })
  );

  /**
   * PUT /api/duty-plans/slots/:slotId/assign
   * Assign an employee to a slot
   * Body: { employeeId, roleBadge, isPrimary }
   */
  router.put("/slots/:slotId/assign",
    validateParams(slotIdParamSchema),
    validateBody(assignSlotSchema),
    asyncHandler(async (req, res) => {
      const { slotId } = req.params;
      const slotIdNum = Number(slotId);
      const { employeeId, roleBadge, isPrimary } = req.body;
      
      // Verify slot exists
      const [slot] = await db.select().from(dutySlots).where(eq(dutySlots.id, slotIdNum));
      if (!slot) {
        return notFound(res, "Slot");
      }
      
      // Verify employee exists
      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
      if (!employee) {
        return notFound(res, "Mitarbeiter");
      }
      
      // Check if assignment already exists
      const [existingAssignment] = await db
        .select()
        .from(dutyAssignments)
        .where(
          and(
            eq(dutyAssignments.dutySlotId, slotIdNum),
            eq(dutyAssignments.employeeId, employeeId)
          )
        );
      
      if (existingAssignment) {
        // Update existing assignment
        const [updated] = await db
          .update(dutyAssignments)
          .set({ 
            roleBadge: roleBadge || null, 
            isPrimary: isPrimary ?? true 
          })
          .where(eq(dutyAssignments.id, existingAssignment.id))
          .returning();
        
        return ok(res, {
          ...updated,
          employeeName: employee.name,
          employeeLastName: employee.lastName,
          message: "Zuweisung aktualisiert"
        });
      }
      
      // Create new assignment
      const [assignment] = await db
        .insert(dutyAssignments)
        .values({
          dutySlotId: slotIdNum,
          employeeId,
          roleBadge: roleBadge || null,
          isPrimary: isPrimary ?? true
        })
        .returning();
      
      return created(res, {
        ...assignment,
        employeeName: employee.name,
        employeeLastName: employee.lastName
      });
    })
  );

  /**
   * DELETE /api/duty-plans/slots/:slotId/assign/:employeeId
   * Remove an employee assignment from a slot
   */
  router.delete("/slots/:slotId/assign/:employeeId",
    asyncHandler(async (req, res) => {
      const { slotId, employeeId } = req.params;
      const slotIdNum = Number(slotId);
      const employeeIdNum = Number(employeeId);
      
      // Find and delete assignment
      const [assignment] = await db
        .select()
        .from(dutyAssignments)
        .where(
          and(
            eq(dutyAssignments.dutySlotId, slotIdNum),
            eq(dutyAssignments.employeeId, employeeIdNum)
          )
        );
      
      if (!assignment) {
        return notFound(res, "Zuweisung");
      }
      
      await db.delete(dutyAssignments).where(eq(dutyAssignments.id, assignment.id));
      
      return ok(res, { 
        deleted: true,
        message: "Zuweisung entfernt"
      });
    })
  );

  /**
   * DELETE /api/duty-plans/slots/:slotId
   * Delete a duty slot and all its assignments
   */
  router.delete("/slots/:slotId",
    validateParams(slotIdParamSchema),
    asyncHandler(async (req, res) => {
      const { slotId } = req.params;
      const slotIdNum = Number(slotId);
      
      // Verify slot exists
      const [slot] = await db.select().from(dutySlots).where(eq(dutySlots.id, slotIdNum));
      if (!slot) {
        return notFound(res, "Slot");
      }
      
      // Delete all assignments for this slot
      await db.delete(dutyAssignments).where(eq(dutyAssignments.dutySlotId, slotIdNum));
      
      // Delete the slot
      await db.delete(dutySlots).where(eq(dutySlots.id, slotIdNum));
      
      return ok(res, { 
        deleted: true,
        id: slotIdNum,
        message: "Slot und alle Zuweisungen gelöscht"
      });
    })
  );

  /**
   * GET /api/duty-plans/slots/:slotId
   * Get slot details with assignments
   */
  router.get("/slots/:slotId",
    validateParams(slotIdParamSchema),
    asyncHandler(async (req, res) => {
      const { slotId } = req.params;
      const slotIdNum = Number(slotId);
      
      // Get slot
      const [slot] = await db.select().from(dutySlots).where(eq(dutySlots.id, slotIdNum));
      if (!slot) {
        return notFound(res, "Slot");
      }
      
      // Get assignments with employee details
      const assignments = await db
        .select({
          id: dutyAssignments.id,
          employeeId: dutyAssignments.employeeId,
          roleBadge: dutyAssignments.roleBadge,
          isPrimary: dutyAssignments.isPrimary,
          createdAt: dutyAssignments.createdAt,
          employeeName: employees.name,
          employeeLastName: employees.lastName,
          employeeRole: employees.role
        })
        .from(dutyAssignments)
        .leftJoin(employees, eq(dutyAssignments.employeeId, employees.id))
        .where(eq(dutyAssignments.dutySlotId, slotIdNum));
      
      // Get the day info
      const [day] = await db.select().from(dutyDays).where(eq(dutyDays.id, slot.dutyDayId));
      
      return ok(res, {
        ...slot,
        date: day?.date,
        assignments
      });
    })
  );

  /**
   * POST /api/duty-plans/:id/generate
   * Placeholder for AI generation (not implemented)
   */
  router.post("/:id/generate",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      return ok(res, { 
        message: "KI-Generierung noch nicht implementiert",
        hint: "Manuelle Zuweisung über PUT /slots/:slotId/assign verwenden"
      });
    })
  );

  return router;
}
