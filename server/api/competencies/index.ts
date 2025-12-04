import type { Router } from "express";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { db, eq } from "../../lib/db";
import { competencies, employeeCompetencies, insertCompetencySchema } from "@shared/schema";

/**
 * Competency API Routes
 * Base path: /api/competencies
 */
export function registerCompetencyRoutes(router: Router) {

  /**
   * GET /api/competencies
   * Get all competencies
   */
  router.get("/", asyncHandler(async (req, res) => {
    // TODO: Implement via storage interface
    const result = await db.select().from(competencies);
    return ok(res, result);
  }));

  /**
   * GET /api/competencies/:id
   * Get competency by ID
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const [competency] = await db.select().from(competencies).where(eq(competencies.id, Number(id)));
      
      if (!competency) {
        return notFound(res, "Kompetenz");
      }
      
      return ok(res, competency);
    })
  );

  /**
   * POST /api/competencies
   * Create new competency
   */
  router.post("/",
    validateBody(insertCompetencySchema),
    asyncHandler(async (req, res) => {
      // TODO: Implement via storage interface
      const [competency] = await db.insert(competencies).values(req.body).returning();
      return created(res, competency);
    })
  );

  /**
   * PUT /api/competencies/:id
   * Update competency
   */
  router.put("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const [competency] = await db
        .update(competencies)
        .set(req.body)
        .where(eq(competencies.id, Number(id)))
        .returning();
      
      if (!competency) {
        return notFound(res, "Kompetenz");
      }
      
      return ok(res, competency);
    })
  );

  /**
   * DELETE /api/competencies/:id
   * Delete competency
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const result = await db.delete(competencies).where(eq(competencies.id, Number(id)));
      return ok(res, { deleted: true });
    })
  );

  /**
   * GET /api/competencies/employee/:employeeId
   * Get competencies for a specific employee
   */
  router.get("/employee/:employeeId",
    asyncHandler(async (req, res) => {
      const { employeeId } = req.params;
      // TODO: Implement via storage interface - join employee_competencies with competencies
      const result = await db
        .select()
        .from(employeeCompetencies)
        .where(eq(employeeCompetencies.employeeId, Number(employeeId)));
      return ok(res, result);
    })
  );

  return router;
}
