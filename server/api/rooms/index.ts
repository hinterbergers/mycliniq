import type { Router } from "express";
import { z } from "zod";
import { db, eq, and, asc, inArray } from "../../lib/db";
import {
  ok,
  created,
  notFound,
  validationError,
  asyncHandler,
} from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import {
  rooms,
  roomWeekdaySettings,
  roomRequiredCompetencies,
  roomPhysicalRooms,
  physicalRooms,
  competencies,
  insertRoomSchema,
} from "@shared/schema";

/**
 * Schema for updating room base data
 */
const updateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  category: z
    .enum([
      "Geburtshilfe",
      "Gynäkologie",
      "OP",
      "Ambulanz",
      "Spezialambulanz",
      "Besprechung",
      "Station",
      "Verwaltung",
      "Sonstiges",
    ])
    .optional(),
  description: z.string().nullable().optional(),
  useInWeeklyPlan: z.boolean().optional(),
  weeklyPlanSortOrder: z.number().int().optional(),
  isAvailable: z.boolean().optional(),
  blockReason: z.string().nullable().optional(),
  requiredRoleCompetencies: z.array(z.string()).optional(),
  alternativeRoleCompetencies: z.array(z.string()).optional(),
  rowColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
});

/**
 * Schema for weekday settings
 * weekday: 1=Monday ... 7=Sunday
 */
const weekdaySettingSchema = z.object({
  weekday: z.number().min(1).max(7),
  recurrence: z
    .enum(["weekly", "monthly_first_third", "monthly_once"])
    .optional(),
  usageLabel: z.string().nullable().optional(),
  timeFrom: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
  timeTo: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
  isClosed: z.boolean().optional(),
  closedReason: z.string().nullable().optional(),
});

const weekdaySettingsArraySchema = z.object({
  settings: z.array(weekdaySettingSchema),
});

/**
 * Schema for required competencies
 */
const competencyRequirementSchema = z.object({
  competencyId: z.number().positive(),
  relationType: z.enum(["AND", "OR"]).default("AND"),
});

const competenciesArraySchema = z.object({
  competencies: z.array(competencyRequirementSchema),
});

const physicalRoomsArraySchema = z.object({
  physicalRoomIds: z.array(z.number().positive()),
});

/**
 * Schema for closing room on specific days
 */
const closeRoomSchema = z.object({
  weekdays: z.array(z.number().min(1).max(7)),
  reason: z.string().min(1, "Grund für Schließung erforderlich"),
});

/**
 * Room API Routes
 * Base path: /api/rooms
 */
export function registerRoomRoutes(router: Router) {
  /**
   * GET /api/rooms
   * Get all rooms
   * Query params:
   *   - active: "true" | "false" - filter by isActive
   *   - category: string - filter by category
   *   - inWeeklyPlan: "true" | "false" - filter by useInWeeklyPlan
   */
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { active, category, inWeeklyPlan } = req.query;

      let result = await db.select().from(rooms);

      // Apply filters
      if (active !== undefined) {
        const isActive = active === "true";
        result = result.filter((r) => r.isActive === isActive);
      }

      if (category) {
        result = result.filter((r) => r.category === category);
      }

      if (inWeeklyPlan !== undefined) {
        const useInWeeklyPlan = inWeeklyPlan === "true";
        result = result.filter((r) => r.useInWeeklyPlan === useInWeeklyPlan);
      }

      return ok(res, result);
    }),
  );

  /**
   * GET /api/rooms/weekly-plan
   * Get rooms prepared for weekly plan editor (settings, competencies, physical rooms)
   */
  router.get(
    "/weekly-plan",
    asyncHandler(async (req, res) => {
      const { active } = req.query;
      const isActive = active === undefined ? true : active === "true";

      let roomsQuery = db
        .select()
        .from(rooms)
        .where(
          and(eq(rooms.useInWeeklyPlan, true), eq(rooms.isActive, isActive)),
        )
        .orderBy(asc(rooms.weeklyPlanSortOrder), asc(rooms.name));

      const roomsList = await roomsQuery;
      const roomIds = roomsList.map((room) => room.id);

      if (roomIds.length === 0) {
        return ok(res, []);
      }

      const weekdaySettings = await db
        .select()
        .from(roomWeekdaySettings)
        .where(inArray(roomWeekdaySettings.roomId, roomIds));

      const requiredCompetencies = await db
        .select({
          id: roomRequiredCompetencies.id,
          roomId: roomRequiredCompetencies.roomId,
          competencyId: roomRequiredCompetencies.competencyId,
          relationType: roomRequiredCompetencies.relationType,
          competencyCode: competencies.code,
          competencyName: competencies.name,
        })
        .from(roomRequiredCompetencies)
        .leftJoin(
          competencies,
          eq(roomRequiredCompetencies.competencyId, competencies.id),
        )
        .where(inArray(roomRequiredCompetencies.roomId, roomIds));

      const physicalRoomLinks = await db
        .select({
          roomId: roomPhysicalRooms.roomId,
          id: physicalRooms.id,
          name: physicalRooms.name,
          isActive: physicalRooms.isActive,
        })
        .from(roomPhysicalRooms)
        .leftJoin(
          physicalRooms,
          eq(roomPhysicalRooms.physicalRoomId, physicalRooms.id),
        )
        .where(inArray(roomPhysicalRooms.roomId, roomIds));

      const settingsByRoom = new Map<number, typeof weekdaySettings>();
      for (const setting of weekdaySettings) {
        const existing = settingsByRoom.get(setting.roomId);
        if (existing) {
          existing.push(setting);
        } else {
          settingsByRoom.set(setting.roomId, [setting]);
        }
      }

      const competenciesByRoom = new Map<number, typeof requiredCompetencies>();
      for (const competency of requiredCompetencies) {
        const existing = competenciesByRoom.get(competency.roomId);
        if (existing) {
          existing.push(competency);
        } else {
          competenciesByRoom.set(competency.roomId, [competency]);
        }
      }

      const physicalRoomsByRoom = new Map<number, typeof physicalRoomLinks>();
      for (const room of physicalRoomLinks) {
        const existing = physicalRoomsByRoom.get(room.roomId);
        if (existing) {
          existing.push(room);
        } else {
          physicalRoomsByRoom.set(room.roomId, [room]);
        }
      }

      const payload = roomsList.map((room) => ({
        ...room,
        weekdaySettings: settingsByRoom.get(room.id) ?? [],
        requiredCompetencies: competenciesByRoom.get(room.id) ?? [],
        physicalRooms: physicalRoomsByRoom.get(room.id) ?? [],
      }));

      return ok(res, payload);
    }),
  );

  /**
   * GET /api/rooms/:id
   * Get room with weekday settings and required competencies
   */
  router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);

      // Get base room data
      const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));

      if (!room) {
        return notFound(res, "Raum");
      }

      // Get weekday settings
      const weekdaySettings = await db
        .select()
        .from(roomWeekdaySettings)
        .where(eq(roomWeekdaySettings.roomId, roomId));

      // Get required competencies with competency details
      const requiredCompetencies = await db
        .select({
          id: roomRequiredCompetencies.id,
          competencyId: roomRequiredCompetencies.competencyId,
          relationType: roomRequiredCompetencies.relationType,
          competencyCode: competencies.code,
          competencyName: competencies.name,
        })
        .from(roomRequiredCompetencies)
        .leftJoin(
          competencies,
          eq(roomRequiredCompetencies.competencyId, competencies.id),
        )
        .where(eq(roomRequiredCompetencies.roomId, roomId));

      const assignedPhysicalRooms = await db
        .select({
          id: physicalRooms.id,
          name: physicalRooms.name,
          isActive: physicalRooms.isActive,
        })
        .from(roomPhysicalRooms)
        .leftJoin(
          physicalRooms,
          eq(roomPhysicalRooms.physicalRoomId, physicalRooms.id),
        )
        .where(eq(roomPhysicalRooms.roomId, roomId));

      return ok(res, {
        ...room,
        weekdaySettings,
        requiredCompetencies,
        physicalRooms: assignedPhysicalRooms,
      });
    }),
  );

  /**
   * POST /api/rooms
   * Create new room
   */
  router.post(
    "/",
    validateBody(insertRoomSchema),
    asyncHandler(async (req, res) => {
      const [room] = await db.insert(rooms).values(req.body).returning();
      return created(res, room);
    }),
  );

  /**
   * PUT /api/rooms/:id
   * Update room base data (name, category, description, useInWeeklyPlan)
   */
  router.put(
    "/:id",
    validateParams(idParamSchema),
    validateBody(updateRoomSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);

      // Check if room exists
      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      // Update only allowed fields
      const {
        name,
        category,
        description,
        useInWeeklyPlan,
        weeklyPlanSortOrder,
        isAvailable,
        blockReason,
        requiredRoleCompetencies,
        alternativeRoleCompetencies,
        rowColor,
      } = req.body;
      const updateData: Record<string, any> = {};

      if (name !== undefined) updateData.name = name;
      if (category !== undefined) updateData.category = category;
      if (description !== undefined) updateData.description = description;
      if (useInWeeklyPlan !== undefined)
        updateData.useInWeeklyPlan = useInWeeklyPlan;
      if (weeklyPlanSortOrder !== undefined)
        updateData.weeklyPlanSortOrder = weeklyPlanSortOrder;
      if (isAvailable !== undefined) updateData.isAvailable = isAvailable;
      if (blockReason !== undefined) updateData.blockReason = blockReason;
      if (requiredRoleCompetencies !== undefined)
        updateData.requiredRoleCompetencies = requiredRoleCompetencies;
      if (alternativeRoleCompetencies !== undefined)
        updateData.alternativeRoleCompetencies = alternativeRoleCompetencies;
      if (rowColor !== undefined) updateData.rowColor = rowColor;

      const [room] = await db
        .update(rooms)
        .set(updateData)
        .where(eq(rooms.id, roomId))
        .returning();

      return ok(res, room);
    }),
  );

  /**
   * PUT /api/rooms/:id/weekday-settings
   * Replace or update weekday settings for a room
   * Body: { settings: [{ weekday, usageLabel, timeFrom, timeTo, isClosed, closedReason }] }
   */
  router.put(
    "/:id/weekday-settings",
    validateParams(idParamSchema),
    validateBody(weekdaySettingsArraySchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);
      const { settings } = req.body;

      // Check if room exists
      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      // Delete existing settings for this room
      await db
        .delete(roomWeekdaySettings)
        .where(eq(roomWeekdaySettings.roomId, roomId));

      // Insert new settings
      if (settings.length > 0) {
        const newSettings = settings.map(
          (setting: z.infer<typeof weekdaySettingSchema>) => ({
            roomId,
            weekday: setting.weekday,
            recurrence: setting.recurrence || "weekly",
            usageLabel: setting.usageLabel || null,
            timeFrom: setting.timeFrom || null,
            timeTo: setting.timeTo || null,
            isClosed: setting.isClosed || false,
            closedReason: setting.closedReason || null,
          }),
        );

        await db.insert(roomWeekdaySettings).values(newSettings);
      }

      // Fetch updated settings
      const updatedSettings = await db
        .select()
        .from(roomWeekdaySettings)
        .where(eq(roomWeekdaySettings.roomId, roomId));

      return ok(res, {
        roomId,
        weekdaySettings: updatedSettings,
        count: updatedSettings.length,
      });
    }),
  );

  /**
   * PUT /api/rooms/:id/competencies
   * Replace required competencies for a room
   * Body: { competencies: [{ competencyId, relationType }] }
   */
  router.put(
    "/:id/competencies",
    validateParams(idParamSchema),
    validateBody(competenciesArraySchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);
      const { competencies: competencyList } = req.body;

      // Check if room exists
      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      // Delete existing competency requirements
      await db
        .delete(roomRequiredCompetencies)
        .where(eq(roomRequiredCompetencies.roomId, roomId));

      // Insert new competency requirements
      if (competencyList.length > 0) {
        const newRequirements = competencyList.map(
          (req: z.infer<typeof competencyRequirementSchema>) => ({
            roomId,
            competencyId: req.competencyId,
            relationType: req.relationType,
          }),
        );

        await db.insert(roomRequiredCompetencies).values(newRequirements);
      }

      // Fetch updated requirements with competency details
      const updatedRequirements = await db
        .select({
          id: roomRequiredCompetencies.id,
          competencyId: roomRequiredCompetencies.competencyId,
          relationType: roomRequiredCompetencies.relationType,
          competencyCode: competencies.code,
          competencyName: competencies.name,
        })
        .from(roomRequiredCompetencies)
        .leftJoin(
          competencies,
          eq(roomRequiredCompetencies.competencyId, competencies.id),
        )
        .where(eq(roomRequiredCompetencies.roomId, roomId));

      return ok(res, {
        roomId,
        requiredCompetencies: updatedRequirements,
        count: updatedRequirements.length,
      });
    }),
  );

  /**
   * PUT /api/rooms/:id/physical-rooms
   * Replace physical room assignments for a workplace
   * Body: { physicalRoomIds: number[] }
   */
  router.put(
    "/:id/physical-rooms",
    validateParams(idParamSchema),
    validateBody(physicalRoomsArraySchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);
      const { physicalRoomIds } = req.body;

      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      await db
        .delete(roomPhysicalRooms)
        .where(eq(roomPhysicalRooms.roomId, roomId));

      if (physicalRoomIds.length > 0) {
        const newAssignments = physicalRoomIds.map(
          (physicalRoomId: number) => ({
            roomId,
            physicalRoomId,
          }),
        );
        await db.insert(roomPhysicalRooms).values(newAssignments);
      }

      const updatedAssignments = await db
        .select({
          id: physicalRooms.id,
          name: physicalRooms.name,
          isActive: physicalRooms.isActive,
        })
        .from(roomPhysicalRooms)
        .leftJoin(
          physicalRooms,
          eq(roomPhysicalRooms.physicalRoomId, physicalRooms.id),
        )
        .where(eq(roomPhysicalRooms.roomId, roomId));

      return ok(res, {
        roomId,
        physicalRooms: updatedAssignments,
        count: updatedAssignments.length,
      });
    }),
  );

  /**
   * PUT /api/rooms/:id/close
   * Close room for specific weekdays
   * Body: { weekdays: [1, 2, 3], reason: "Renovierung" }
   */
  router.put(
    "/:id/close",
    validateParams(idParamSchema),
    validateBody(closeRoomSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);
      const { weekdays, reason } = req.body;

      // Check if room exists
      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      // Update or insert weekday settings for closed days
      for (const weekday of weekdays) {
        // Check if setting exists for this weekday
        const [existingSetting] = await db
          .select()
          .from(roomWeekdaySettings)
          .where(
            and(
              eq(roomWeekdaySettings.roomId, roomId),
              eq(roomWeekdaySettings.weekday, weekday),
            ),
          );

        if (existingSetting) {
          // Update existing
          await db
            .update(roomWeekdaySettings)
            .set({ isClosed: true, closedReason: reason })
            .where(eq(roomWeekdaySettings.id, existingSetting.id));
        } else {
          // Insert new
          await db.insert(roomWeekdaySettings).values({
            roomId,
            weekday,
            isClosed: true,
            closedReason: reason,
          });
        }
      }

      // Also update room-level availability flag
      await db
        .update(rooms)
        .set({ blockReason: reason })
        .where(eq(rooms.id, roomId));

      // Fetch updated settings
      const updatedSettings = await db
        .select()
        .from(roomWeekdaySettings)
        .where(eq(roomWeekdaySettings.roomId, roomId));

      return ok(res, {
        roomId,
        closedWeekdays: weekdays,
        reason,
        weekdaySettings: updatedSettings,
      });
    }),
  );

  /**
   * PUT /api/rooms/:id/open
   * Reopen room for specific weekdays (remove closure)
   * Body: { weekdays: [1, 2, 3] }
   */
  router.put(
    "/:id/open",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);
      const { weekdays } = req.body;

      if (!weekdays || !Array.isArray(weekdays)) {
        return validationError(res, "weekdays Array erforderlich");
      }

      // Check if room exists
      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      // Update weekday settings to open
      for (const weekday of weekdays) {
        await db
          .update(roomWeekdaySettings)
          .set({ isClosed: false, closedReason: null })
          .where(
            and(
              eq(roomWeekdaySettings.roomId, roomId),
              eq(roomWeekdaySettings.weekday, weekday),
            ),
          );
      }

      // Clear room-level block reason if all days are open
      const closedDays = await db
        .select()
        .from(roomWeekdaySettings)
        .where(
          and(
            eq(roomWeekdaySettings.roomId, roomId),
            eq(roomWeekdaySettings.isClosed, true),
          ),
        );

      if (closedDays.length === 0) {
        await db
          .update(rooms)
          .set({ blockReason: null })
          .where(eq(rooms.id, roomId));
      }

      return ok(res, {
        roomId,
        openedWeekdays: weekdays,
        message: "Raum wurde für die angegebenen Tage geöffnet",
      });
    }),
  );

  /**
   * DELETE /api/rooms/:id
   * Soft delete - sets isActive = false
   */
  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);

      // Check if room exists
      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      // Soft delete
      await db
        .update(rooms)
        .set({ isActive: false })
        .where(eq(rooms.id, roomId));

      return ok(res, {
        deactivated: true,
        id: roomId,
        message: "Raum wurde deaktiviert",
      });
    }),
  );

  /**
   * PUT /api/rooms/:id/reactivate
   * Reactivate a deactivated room
   */
  router.put(
    "/:id/reactivate",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);

      // Check if room exists
      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      if (existing.isActive) {
        return ok(res, { message: "Raum ist bereits aktiv" });
      }

      // Reactivate
      await db
        .update(rooms)
        .set({ isActive: true })
        .where(eq(rooms.id, roomId));

      return ok(res, {
        reactivated: true,
        id: roomId,
        message: "Raum wurde reaktiviert",
      });
    }),
  );

  /**
   * GET /api/rooms/:id/weekday-settings
   * Get all weekday settings for a room
   */
  router.get(
    "/:id/weekday-settings",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);

      // Check if room exists
      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      const settings = await db
        .select()
        .from(roomWeekdaySettings)
        .where(eq(roomWeekdaySettings.roomId, roomId));

      return ok(res, settings);
    }),
  );

  /**
   * GET /api/rooms/:id/competencies
   * Get all required competencies for a room
   */
  router.get(
    "/:id/competencies",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const roomId = Number(id);

      // Check if room exists
      const [existing] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId));
      if (!existing) {
        return notFound(res, "Raum");
      }

      const requirements = await db
        .select({
          id: roomRequiredCompetencies.id,
          competencyId: roomRequiredCompetencies.competencyId,
          relationType: roomRequiredCompetencies.relationType,
          competencyCode: competencies.code,
          competencyName: competencies.name,
          competencyDescription: competencies.description,
        })
        .from(roomRequiredCompetencies)
        .leftJoin(
          competencies,
          eq(roomRequiredCompetencies.competencyId, competencies.id),
        )
        .where(eq(roomRequiredCompetencies.roomId, roomId));

      return ok(res, requirements);
    }),
  );

  return router;
}
