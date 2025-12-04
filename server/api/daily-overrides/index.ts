import type { Router } from "express";
import { z } from "zod";
import { db, eq } from "../../lib/db";
import { 
  ok, 
  created, 
  notFound, 
  asyncHandler 
} from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { 
  dailyOverrides,
  rooms,
  employees
} from "@shared/schema";

/**
 * Schema for creating a daily override
 */
const createOverrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD"),
  roomId: z.number().positive(),
  originalEmployeeId: z.number().positive().nullable().optional(),
  newEmployeeId: z.number().positive().nullable().optional(),
  reason: z.string().nullable().optional(),
  createdById: z.number().positive()
});

/**
 * Daily Override (Tagesplan-Korrekturen) API Routes
 * Base path: /api/daily-overrides
 */
export function registerDailyOverrideRoutes(router: Router) {

  /**
   * GET /api/daily-overrides
   * Get all overrides, optionally filtered by date
   * Query params:
   *   - date: YYYY-MM-DD - filter by specific date
   *   - from: YYYY-MM-DD - filter from date
   *   - to: YYYY-MM-DD - filter to date
   *   - roomId: number - filter by room
   */
  router.get("/", asyncHandler(async (req, res) => {
    const { date, from, to, roomId } = req.query;
    
    // Get all overrides with related data
    let overrides = await db
      .select({
        id: dailyOverrides.id,
        date: dailyOverrides.date,
        roomId: dailyOverrides.roomId,
        originalEmployeeId: dailyOverrides.originalEmployeeId,
        newEmployeeId: dailyOverrides.newEmployeeId,
        reason: dailyOverrides.reason,
        createdById: dailyOverrides.createdById,
        createdAt: dailyOverrides.createdAt,
        roomName: rooms.name,
        roomCategory: rooms.category
      })
      .from(dailyOverrides)
      .leftJoin(rooms, eq(dailyOverrides.roomId, rooms.id));
    
    // Apply filters
    if (date) {
      overrides = overrides.filter(o => o.date === date);
    }
    
    if (from) {
      overrides = overrides.filter(o => o.date >= String(from));
    }
    
    if (to) {
      overrides = overrides.filter(o => o.date <= String(to));
    }
    
    if (roomId) {
      overrides = overrides.filter(o => o.roomId === Number(roomId));
    }
    
    // Enrich with employee names
    const enrichedOverrides = await Promise.all(
      overrides.map(async (override) => {
        let originalEmployee = null;
        let newEmployee = null;
        let createdBy = null;
        
        if (override.originalEmployeeId) {
          const [emp] = await db
            .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
            .from(employees)
            .where(eq(employees.id, override.originalEmployeeId));
          originalEmployee = emp || null;
        }
        
        if (override.newEmployeeId) {
          const [emp] = await db
            .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
            .from(employees)
            .where(eq(employees.id, override.newEmployeeId));
          newEmployee = emp || null;
        }
        
        if (override.createdById) {
          const [emp] = await db
            .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
            .from(employees)
            .where(eq(employees.id, override.createdById));
          createdBy = emp || null;
        }
        
        return {
          ...override,
          originalEmployee,
          newEmployee,
          createdBy
        };
      })
    );
    
    return ok(res, enrichedOverrides);
  }));

  /**
   * GET /api/daily-overrides/:id
   * Get single override by ID
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const overrideId = Number(id);
      
      // Get override with room info
      const [override] = await db
        .select({
          id: dailyOverrides.id,
          date: dailyOverrides.date,
          roomId: dailyOverrides.roomId,
          originalEmployeeId: dailyOverrides.originalEmployeeId,
          newEmployeeId: dailyOverrides.newEmployeeId,
          reason: dailyOverrides.reason,
          createdById: dailyOverrides.createdById,
          createdAt: dailyOverrides.createdAt,
          roomName: rooms.name,
          roomCategory: rooms.category
        })
        .from(dailyOverrides)
        .leftJoin(rooms, eq(dailyOverrides.roomId, rooms.id))
        .where(eq(dailyOverrides.id, overrideId));
      
      if (!override) {
        return notFound(res, "Tageskorrektur");
      }
      
      // Get employee details
      let originalEmployee = null;
      let newEmployee = null;
      let createdBy = null;
      
      if (override.originalEmployeeId) {
        const [emp] = await db
          .select({ id: employees.id, name: employees.name, lastName: employees.lastName, role: employees.role })
          .from(employees)
          .where(eq(employees.id, override.originalEmployeeId));
        originalEmployee = emp || null;
      }
      
      if (override.newEmployeeId) {
        const [emp] = await db
          .select({ id: employees.id, name: employees.name, lastName: employees.lastName, role: employees.role })
          .from(employees)
          .where(eq(employees.id, override.newEmployeeId));
        newEmployee = emp || null;
      }
      
      if (override.createdById) {
        const [emp] = await db
          .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
          .from(employees)
          .where(eq(employees.id, override.createdById));
        createdBy = emp || null;
      }
      
      return ok(res, {
        ...override,
        originalEmployee,
        newEmployee,
        createdBy
      });
    })
  );

  /**
   * POST /api/daily-overrides
   * Create a new daily override
   * Body: { date, roomId, originalEmployeeId, newEmployeeId, reason, createdById }
   */
  router.post("/",
    validateBody(createOverrideSchema),
    asyncHandler(async (req, res) => {
      const { date, roomId, originalEmployeeId, newEmployeeId, reason, createdById } = req.body;
      
      // Verify room exists
      const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
      if (!room) {
        return notFound(res, "Raum");
      }
      
      // Verify createdById employee exists
      const [creator] = await db.select().from(employees).where(eq(employees.id, createdById));
      if (!creator) {
        return notFound(res, "Ersteller (Mitarbeiter)");
      }
      
      // Verify originalEmployeeId if provided
      let originalEmployee = null;
      if (originalEmployeeId) {
        const [emp] = await db.select().from(employees).where(eq(employees.id, originalEmployeeId));
        if (!emp) {
          return notFound(res, "Original-Mitarbeiter");
        }
        originalEmployee = emp;
      }
      
      // Verify newEmployeeId if provided
      let newEmployee = null;
      if (newEmployeeId) {
        const [emp] = await db.select().from(employees).where(eq(employees.id, newEmployeeId));
        if (!emp) {
          return notFound(res, "Neuer Mitarbeiter");
        }
        newEmployee = emp;
      }
      
      // Create the override
      const [override] = await db
        .insert(dailyOverrides)
        .values({
          date,
          roomId,
          originalEmployeeId: originalEmployeeId || null,
          newEmployeeId: newEmployeeId || null,
          reason: reason || null,
          createdById
        })
        .returning();
      
      return created(res, {
        ...override,
        roomName: room.name,
        roomCategory: room.category,
        originalEmployee: originalEmployee ? {
          id: originalEmployee.id,
          name: originalEmployee.name,
          lastName: originalEmployee.lastName
        } : null,
        newEmployee: newEmployee ? {
          id: newEmployee.id,
          name: newEmployee.name,
          lastName: newEmployee.lastName
        } : null,
        createdBy: {
          id: creator.id,
          name: creator.name,
          lastName: creator.lastName
        }
      });
    })
  );

  /**
   * DELETE /api/daily-overrides/:id
   * Delete a daily override
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const overrideId = Number(id);
      
      // Verify override exists
      const [existing] = await db
        .select()
        .from(dailyOverrides)
        .where(eq(dailyOverrides.id, overrideId));
      
      if (!existing) {
        return notFound(res, "Tageskorrektur");
      }
      
      // Delete the override
      await db.delete(dailyOverrides).where(eq(dailyOverrides.id, overrideId));
      
      return ok(res, {
        deleted: true,
        id: overrideId,
        date: existing.date,
        message: "Tageskorrektur gelöscht"
      });
    })
  );

  /**
   * GET /api/daily-overrides/date/:date
   * Convenience endpoint: Get all overrides for a specific date
   */
  router.get("/date/:date",
    asyncHandler(async (req, res) => {
      const { date } = req.params;
      
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return ok(res, { error: "Datum im Format YYYY-MM-DD erforderlich" });
      }
      
      // Get all overrides for this date
      const overrides = await db
        .select({
          id: dailyOverrides.id,
          date: dailyOverrides.date,
          roomId: dailyOverrides.roomId,
          originalEmployeeId: dailyOverrides.originalEmployeeId,
          newEmployeeId: dailyOverrides.newEmployeeId,
          reason: dailyOverrides.reason,
          createdById: dailyOverrides.createdById,
          createdAt: dailyOverrides.createdAt,
          roomName: rooms.name,
          roomCategory: rooms.category
        })
        .from(dailyOverrides)
        .leftJoin(rooms, eq(dailyOverrides.roomId, rooms.id))
        .where(eq(dailyOverrides.date, date));
      
      // Enrich with employee names
      const enrichedOverrides = await Promise.all(
        overrides.map(async (override) => {
          let originalEmployee = null;
          let newEmployee = null;
          
          if (override.originalEmployeeId) {
            const [emp] = await db
              .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
              .from(employees)
              .where(eq(employees.id, override.originalEmployeeId));
            originalEmployee = emp || null;
          }
          
          if (override.newEmployeeId) {
            const [emp] = await db
              .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
              .from(employees)
              .where(eq(employees.id, override.newEmployeeId));
            newEmployee = emp || null;
          }
          
          return {
            ...override,
            originalEmployee,
            newEmployee
          };
        })
      );
      
      return ok(res, {
        date,
        count: enrichedOverrides.length,
        overrides: enrichedOverrides
      });
    })
  );

  return router;
}
