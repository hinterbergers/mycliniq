import type { Router } from "express";
import { z } from "zod";
import { db, asc, eq, inArray } from "../../lib/db";
import {
  ok,
  created,
  notFound,
  asyncHandler,
} from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import { roomGroups, rooms, insertRoomGroupSchema } from "@shared/schema";

const updateRoomGroupSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

const replaceRoomGroupRoomsSchema = z.object({
  roomIds: z.array(z.number().int().positive()),
});

export function registerRoomGroupRoutes(router: Router) {
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const groups = await db
        .select()
        .from(roomGroups)
        .orderBy(asc(roomGroups.sortOrder), asc(roomGroups.name));
      return ok(res, groups);
    }),
  );

  router.post(
    "/",
    validateBody(insertRoomGroupSchema),
    asyncHandler(async (req, res) => {
      const [group] = await db.insert(roomGroups).values(req.body).returning();
      return created(res, group);
    }),
  );

  router.put(
    "/:id",
    validateParams(idParamSchema),
    validateBody(updateRoomGroupSchema),
    asyncHandler(async (req, res) => {
      const groupId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(roomGroups)
        .where(eq(roomGroups.id, groupId));
      if (!existing) return notFound(res, "Gruppe");

      const updateData: Record<string, unknown> = {};
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.sortOrder !== undefined)
        updateData.sortOrder = req.body.sortOrder;

      const [group] = await db
        .update(roomGroups)
        .set(updateData)
        .where(eq(roomGroups.id, groupId))
        .returning();

      return ok(res, group);
    }),
  );

  router.put(
    "/:id/rooms",
    validateParams(idParamSchema),
    validateBody(replaceRoomGroupRoomsSchema),
    asyncHandler(async (req, res) => {
      const groupId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(roomGroups)
        .where(eq(roomGroups.id, groupId));
      if (!existing) return notFound(res, "Gruppe");

      const roomIds = [...new Set<number>(req.body.roomIds as number[])];

      await db
        .update(rooms)
        .set({ roomGroupId: null })
        .where(eq(rooms.roomGroupId, groupId));

      if (roomIds.length > 0) {
        await db
          .update(rooms)
          .set({ roomGroupId: groupId })
          .where(inArray(rooms.id, roomIds));
      }

      const groupedRooms = await db
        .select()
        .from(rooms)
        .where(eq(rooms.roomGroupId, groupId))
        .orderBy(asc(rooms.weeklyPlanSortOrder), asc(rooms.name));

      return ok(res, { groupId, roomIds: groupedRooms.map((room) => room.id) });
    }),
  );

  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const groupId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(roomGroups)
        .where(eq(roomGroups.id, groupId));
      if (!existing) return notFound(res, "Gruppe");

      await db
        .update(rooms)
        .set({ roomGroupId: null })
        .where(eq(rooms.roomGroupId, groupId));

      await db.delete(roomGroups).where(eq(roomGroups.id, groupId));
      return ok(res, { id: groupId, deleted: true });
    }),
  );
}
