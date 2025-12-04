import type { Router } from "express";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import { validateBody, validateParams, validateQuery, idParamSchema, yearMonthSchema } from "../../lib/validate";
import { db, eq, and } from "../../lib/db";
import { dutyPlans, dutyDays, dutySlots, dutyAssignments } from "@shared/schema";

/**
 * Duty Plan (Dienstplan) API Routes
 * Base path: /api/duty-plans
 */
export function registerDutyPlanRoutes(router: Router) {

  /**
   * GET /api/duty-plans
   * Get all duty plans (optionally filtered by year/month)
   */
  router.get("/", asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    
    // TODO: Implement via storage interface with optional filters
    let query = db.select().from(dutyPlans);
    
    if (year && month) {
      query = query.where(
        and(
          eq(dutyPlans.year, Number(year)),
          eq(dutyPlans.month, Number(month))
        )
      ) as any;
    }
    
    const result = await query;
    return ok(res, result);
  }));

  /**
   * GET /api/duty-plans/:id
   * Get duty plan by ID with all related data
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface with joins
      const [plan] = await db.select().from(dutyPlans).where(eq(dutyPlans.id, Number(id)));
      
      if (!plan) {
        return notFound(res, "Dienstplan");
      }
      
      // TODO: Load related days, slots, and assignments
      return ok(res, plan);
    })
  );

  /**
   * GET /api/duty-plans/month/:year/:month
   * Get duty plan for specific month
   */
  router.get("/month/:year/:month",
    asyncHandler(async (req, res) => {
      const { year, month } = req.params;
      // TODO: Implement via storage interface
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
      
      return ok(res, plan);
    })
  );

  /**
   * POST /api/duty-plans
   * Create new duty plan
   */
  router.post("/", asyncHandler(async (req, res) => {
    // TODO: Implement via storage interface
    // Should create plan with empty days structure for the month
    const [plan] = await db.insert(dutyPlans).values(req.body).returning();
    return created(res, plan);
  }));

  /**
   * PUT /api/duty-plans/:id
   * Update duty plan (status, assignments)
   */
  router.put("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const [plan] = await db
        .update(dutyPlans)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(dutyPlans.id, Number(id)))
        .returning();
      
      if (!plan) {
        return notFound(res, "Dienstplan");
      }
      
      return ok(res, plan);
    })
  );

  /**
   * DELETE /api/duty-plans/:id
   * Delete duty plan (only if status is 'Entwurf')
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Check status before delete, cascade delete days/slots/assignments
      await db.delete(dutyPlans).where(eq(dutyPlans.id, Number(id)));
      return ok(res, { deleted: true });
    })
  );

  /**
   * POST /api/duty-plans/:id/generate
   * AI-generate duty plan assignments
   */
  router.post("/:id/generate",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      // TODO: Implement AI generation logic
      // Should consider: shift wishes, competencies, hard/soft rules
      return ok(res, { message: "TODO: KI-Generierung nicht implementiert" });
    })
  );

  /**
   * POST /api/duty-plans/:id/release
   * Release/approve duty plan
   */
  router.post("/:id/release",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Update status to 'Freigegeben', set releasedById
      const [plan] = await db
        .update(dutyPlans)
        .set({ status: 'Freigegeben', updatedAt: new Date() })
        .where(eq(dutyPlans.id, Number(id)))
        .returning();
      
      return ok(res, plan);
    })
  );

  return router;
}
