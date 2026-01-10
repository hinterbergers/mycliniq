import type { Router } from "express";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import { db, eq } from "../../lib/db";
import { diplomas, insertDiplomaSchema } from "@shared/schema";

/**
 * Diploma API Routes
 * Base path: /api/diplomas
 */
export function registerDiplomaRoutes(router: Router) {
  /**
   * GET /api/diplomas
   * Get all diplomas
   */
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const result = await db.select().from(diplomas);
      return ok(res, result);
    }),
  );

  /**
   * GET /api/diplomas/:id
   * Get diploma by ID
   */
  router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const [diploma] = await db
        .select()
        .from(diplomas)
        .where(eq(diplomas.id, Number(id)));

      if (!diploma) {
        return notFound(res, "Diplom");
      }

      return ok(res, diploma);
    }),
  );

  /**
   * POST /api/diplomas
   * Create new diploma
   */
  router.post(
    "/",
    validateBody(insertDiplomaSchema),
    asyncHandler(async (req, res) => {
      const [diploma] = await db.insert(diplomas).values(req.body).returning();
      return created(res, diploma);
    }),
  );

  /**
   * PUT /api/diplomas/:id
   * Update diploma
   */
  router.put(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const [diploma] = await db
        .update(diplomas)
        .set(req.body)
        .where(eq(diplomas.id, Number(id)))
        .returning();

      if (!diploma) {
        return notFound(res, "Diplom");
      }

      return ok(res, diploma);
    }),
  );

  /**
   * DELETE /api/diplomas/:id
   * Delete diploma
   */
  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      await db.delete(diplomas).where(eq(diplomas.id, Number(id)));
      return ok(res, { deleted: true });
    }),
  );

  return router;
}
