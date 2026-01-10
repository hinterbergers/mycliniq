import type { Router } from "express";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import { db, eq } from "../../lib/db";
import { physicalRooms, insertPhysicalRoomSchema } from "@shared/schema";

/**
 * Physical Room API Routes
 * Base path: /api/physical-rooms
 */
export function registerPhysicalRoomRoutes(router: Router) {
  const updatePhysicalRoomSchema = insertPhysicalRoomSchema.partial();

  /**
   * GET /api/physical-rooms
   * Get all physical rooms
   */
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const result = await db.select().from(physicalRooms);
      return ok(res, result);
    }),
  );

  /**
   * GET /api/physical-rooms/:id
   * Get physical room by ID
   */
  router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const [room] = await db
        .select()
        .from(physicalRooms)
        .where(eq(physicalRooms.id, Number(id)));

      if (!room) {
        return notFound(res, "Raum");
      }

      return ok(res, room);
    }),
  );

  /**
   * POST /api/physical-rooms
   * Create new physical room
   */
  router.post(
    "/",
    validateBody(insertPhysicalRoomSchema),
    asyncHandler(async (req, res) => {
      const [room] = await db
        .insert(physicalRooms)
        .values(req.body)
        .returning();
      return created(res, room);
    }),
  );

  /**
   * PUT /api/physical-rooms/:id
   * Update physical room
   */
  router.put(
    "/:id",
    validateParams(idParamSchema),
    validateBody(updatePhysicalRoomSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const [room] = await db
        .update(physicalRooms)
        .set(req.body)
        .where(eq(physicalRooms.id, Number(id)))
        .returning();

      if (!room) {
        return notFound(res, "Raum");
      }

      return ok(res, room);
    }),
  );

  /**
   * DELETE /api/physical-rooms/:id
   * Deactivate physical room
   */
  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const [room] = await db
        .update(physicalRooms)
        .set({ isActive: false })
        .where(eq(physicalRooms.id, Number(id)))
        .returning();

      if (!room) {
        return notFound(res, "Raum");
      }

      return ok(res, { id: room.id, deactivated: true });
    }),
  );

  return router;
}
