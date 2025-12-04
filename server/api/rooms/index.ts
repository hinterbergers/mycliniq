import type { Router } from "express";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { db, eq } from "../../lib/db";
import { rooms, insertRoomSchema } from "@shared/schema";

/**
 * Room API Routes
 * Base path: /api/rooms
 */
export function registerRoomRoutes(router: Router) {

  /**
   * GET /api/rooms
   * Get all rooms
   */
  router.get("/", asyncHandler(async (req, res) => {
    // TODO: Implement via storage interface
    const result = await db.select().from(rooms);
    return ok(res, result);
  }));

  /**
   * GET /api/rooms/:id
   * Get room by ID
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const [room] = await db.select().from(rooms).where(eq(rooms.id, Number(id)));
      
      if (!room) {
        return notFound(res, "Raum");
      }
      
      return ok(res, room);
    })
  );

  /**
   * POST /api/rooms
   * Create new room
   */
  router.post("/",
    validateBody(insertRoomSchema),
    asyncHandler(async (req, res) => {
      // TODO: Implement via storage interface
      const [room] = await db.insert(rooms).values(req.body).returning();
      return created(res, room);
    })
  );

  /**
   * PUT /api/rooms/:id
   * Update room
   */
  router.put("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      const [room] = await db
        .update(rooms)
        .set(req.body)
        .where(eq(rooms.id, Number(id)))
        .returning();
      
      if (!room) {
        return notFound(res, "Raum");
      }
      
      return ok(res, room);
    })
  );

  /**
   * DELETE /api/rooms/:id
   * Delete room
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      // TODO: Implement via storage interface
      await db.delete(rooms).where(eq(rooms.id, Number(id)));
      return ok(res, { deleted: true });
    })
  );

  /**
   * PUT /api/rooms/:id/block
   * Block/unblock a room for a specific period
   */
  router.put("/:id/block",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      // TODO: Implement room blocking logic
      // Body should contain: { startDate, endDate, reason }
      return ok(res, { message: "TODO: Room blocking not yet implemented" });
    })
  );

  return router;
}
