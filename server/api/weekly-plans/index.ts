import type { Router } from "express";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import { validateParams, idParamSchema } from "../../lib/validate";
import { db, eq, and } from "../../lib/db";
import { weeklyPlans, weeklyPlanAssignments } from "@shared/schema";

/**
 * Weekly Plan (Wochenplan) API Routes
 * Base path: /api/weekly-plans
 */
export function registerWeeklyPlanRoutes(router: Router) {

  /**
   * GET /api/weekly-plans
   * Get all weekly plans
   */
  router.get("/", asyncHandler(async (req, res) => {
    const { year, week } = req.query;
    
    // TODO: Implement via storage interface
    let query = db.select().from(weeklyPlans);
    
    if (year && week) {
      query = query.where(
        and(
          eq(weeklyPlans.year, Number(year)),
          eq(weeklyPlans.weekNumber, Number(week))
        )
      ) as any;
    }
    
    const result = await query;
    return ok(res, result);
  }));

  /**
   * GET /api/weekly-plans/:id
   * Get weekly plan by ID with assignments
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface with assignments join
      const [plan] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, Number(id)));
      
      if (!plan) {
        return notFound(res, "Wochenplan");
      }
      
      // TODO: Load assignments
      return ok(res, plan);
    })
  );

  /**
   * GET /api/weekly-plans/week/:year/:week
   * Get weekly plan for specific week
   */
  router.get("/week/:year/:week",
    asyncHandler(async (req, res) => {
      const { year, week } = req.params;
      // TODO: Implement via storage interface
      const [plan] = await db
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.year, Number(year)),
            eq(weeklyPlans.weekNumber, Number(week))
          )
        );
      
      if (!plan) {
        return notFound(res, "Wochenplan");
      }
      
      return ok(res, plan);
    })
  );

  /**
   * POST /api/weekly-plans
   * Create new weekly plan
   */
  router.post("/", asyncHandler(async (req, res) => {
    // TODO: Implement via storage interface
    const [plan] = await db.insert(weeklyPlans).values(req.body).returning();
    return created(res, plan);
  }));

  /**
   * PUT /api/weekly-plans/:id
   * Update weekly plan
   */
  router.put("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const [plan] = await db
        .update(weeklyPlans)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(weeklyPlans.id, Number(id)))
        .returning();
      
      if (!plan) {
        return notFound(res, "Wochenplan");
      }
      
      return ok(res, plan);
    })
  );

  /**
   * DELETE /api/weekly-plans/:id
   * Delete weekly plan
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Cascade delete assignments
      await db.delete(weeklyPlans).where(eq(weeklyPlans.id, Number(id)));
      return ok(res, { deleted: true });
    })
  );

  /**
   * POST /api/weekly-plans/:id/generate-from-duty
   * Generate weekly plan from duty plan
   */
  router.post("/:id/generate-from-duty",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      // TODO: Import assignments from duty plan for the week
      return ok(res, { message: "TODO: Generierung aus Dienstplan nicht implementiert" });
    })
  );

  /**
   * PUT /api/weekly-plans/:id/assignments
   * Bulk update assignments for a weekly plan
   */
  router.put("/:id/assignments",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      // TODO: Upsert multiple assignments
      // Body: { assignments: [{ roomId, weekday, employeeId, roleLabel }] }
      return ok(res, { message: "TODO: Bulk assignment update nicht implementiert" });
    })
  );

  return router;
}
