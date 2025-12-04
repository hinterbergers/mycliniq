import type { Router } from "express";
import { storage } from "../../storage";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import { validateBody, validateParams, validateQuery, idParamSchema, dateRangeSchema } from "../../lib/validate";
import { db, eq, and, gte, lte } from "../../lib/db";
import { absences, plannedAbsences, insertAbsenceSchema, insertPlannedAbsenceSchema } from "@shared/schema";

/**
 * Absence API Routes
 * Base path: /api/absences
 */
export function registerAbsenceRoutes(router: Router) {

  /**
   * GET /api/absences
   * Get absences (optionally filtered by date range or employee)
   */
  router.get("/", asyncHandler(async (req, res) => {
    const { startDate, endDate, employeeId } = req.query;
    
    if (startDate && endDate) {
      const result = await storage.getAbsencesByDateRange(
        startDate as string, 
        endDate as string
      );
      return ok(res, result);
    }
    
    if (employeeId) {
      const result = await storage.getAbsencesByEmployee(Number(employeeId));
      return ok(res, result);
    }
    
    // TODO: Add getAbsences() to storage interface for all absences
    const result = await db.select().from(absences);
    return ok(res, result);
  }));

  /**
   * GET /api/absences/:id
   * Get absence by ID
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Add getAbsence(id) to storage interface
      const [absence] = await db.select().from(absences).where(eq(absences.id, Number(id)));
      
      if (!absence) {
        return notFound(res, "Abwesenheit");
      }
      
      return ok(res, absence);
    })
  );

  /**
   * POST /api/absences
   * Create new absence record
   */
  router.post("/",
    validateBody(insertAbsenceSchema),
    asyncHandler(async (req, res) => {
      const absence = await storage.createAbsence(req.body);
      return created(res, absence);
    })
  );

  /**
   * DELETE /api/absences/:id
   * Delete absence
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const deleted = await storage.deleteAbsence(Number(id));
      
      if (!deleted) {
        return notFound(res, "Abwesenheit");
      }
      
      return ok(res, { deleted: true });
    })
  );

  // === PLANNED ABSENCES (for planning month) ===

  /**
   * GET /api/absences/planned
   * Get planned absences for planning
   */
  router.get("/planned", asyncHandler(async (req, res) => {
    const { year, month, employeeId } = req.query;
    
    // TODO: Implement via storage interface
    let query = db.select().from(plannedAbsences);
    
    if (year && month) {
      query = query.where(
        and(
          eq(plannedAbsences.year, Number(year)),
          eq(plannedAbsences.month, Number(month))
        )
      ) as any;
    }
    
    const result = await query;
    return ok(res, result);
  }));

  /**
   * POST /api/absences/planned
   * Create planned absence request
   */
  router.post("/planned",
    validateBody(insertPlannedAbsenceSchema),
    asyncHandler(async (req, res) => {
      // TODO: Implement via storage interface
      const [planned] = await db.insert(plannedAbsences).values(req.body).returning();
      return created(res, planned);
    })
  );

  /**
   * PUT /api/absences/planned/:id/approve
   * Approve planned absence
   */
  router.put("/planned/:id/approve",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { approvedById } = req.body;
      
      // TODO: Implement via storage interface
      const [planned] = await db
        .update(plannedAbsences)
        .set({ 
          status: 'Genehmigt', 
          isApproved: true,
          approvedById,
          updatedAt: new Date() 
        })
        .where(eq(plannedAbsences.id, Number(id)))
        .returning();
      
      return ok(res, planned);
    })
  );

  /**
   * PUT /api/absences/planned/:id/reject
   * Reject planned absence
   */
  router.put("/planned/:id/reject",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { approvedById } = req.body;
      
      // TODO: Implement via storage interface
      const [planned] = await db
        .update(plannedAbsences)
        .set({ 
          status: 'Abgelehnt', 
          isApproved: false,
          approvedById,
          updatedAt: new Date() 
        })
        .where(eq(plannedAbsences.id, Number(id)))
        .returning();
      
      return ok(res, planned);
    })
  );

  return router;
}
