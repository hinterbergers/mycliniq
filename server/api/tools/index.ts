import type { Router } from "express";
import { z } from "zod";
import { asc, db, eq } from "../../lib/db";
import { ok, error, asyncHandler } from "../../lib/api-response";
import { validateBody } from "../../lib/validate";
import { toolVisibility } from "@shared/schema";
import { requireAdmin, requireAuth } from "../middleware/auth";

const TOOL_KEYS = [
  "pregnancy_weeks",
  "pul_calculator",
  "body_surface_area",
  "bishop_score",
  "bmi_calculator",
] as const;
const toolKeySchema = z.enum(TOOL_KEYS);

const updateToolVisibilitySchema = z.object({
  tools: z
    .array(
      z.object({
        toolKey: toolKeySchema,
        isEnabled: z.boolean(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .min(1),
});

type ToolKey = (typeof TOOL_KEYS)[number];
type ToolSetting = { toolKey: ToolKey; isEnabled: boolean; sortOrder: number };

function buildToolSettings(
  rows: Array<{ toolKey: string; isEnabled: boolean; sortOrder: number }>,
): ToolSetting[] {
  const map = new Map(rows.map((row) => [row.toolKey, row]));
  return TOOL_KEYS.map((toolKey, index) => ({
    toolKey,
    isEnabled: map.get(toolKey)?.isEnabled ?? true,
    sortOrder: map.get(toolKey)?.sortOrder ?? index,
  })).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Tools API Routes
 * Base path: /api/tools
 */
export function registerToolRoutes(router: Router) {
  /**
   * GET /api/tools
   * Get tool visibility for current user's department
   */
  router.get(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const departmentId = req.user?.departmentId;
      if (!departmentId) {
        return ok(res, buildToolSettings([]));
      }

      const rows = await db
        .select({
          toolKey: toolVisibility.toolKey,
          isEnabled: toolVisibility.isEnabled,
          sortOrder: toolVisibility.sortOrder,
        })
        .from(toolVisibility)
        .where(eq(toolVisibility.departmentId, departmentId))
        .orderBy(asc(toolVisibility.sortOrder), asc(toolVisibility.toolKey));

      return ok(res, buildToolSettings(rows));
    }),
  );

  /**
   * PUT /api/tools/visibility
   * Update tool visibility for current user's department (admin only)
   */
  router.put(
    "/visibility",
    requireAuth,
    requireAdmin,
    validateBody(updateToolVisibilitySchema),
    asyncHandler(async (req, res) => {
      const departmentId = req.user?.departmentId;
      if (!departmentId) {
        return error(res, "Keine Abteilung zugeordnet", 400);
      }

      const tools = req.body.tools as ToolSetting[];
      const now = new Date();

      await db.transaction(async (tx) => {
        for (const [index, tool] of tools.entries()) {
          const sortOrder = tool.sortOrder ?? index;
          await tx
            .insert(toolVisibility)
            .values({
              departmentId,
              toolKey: tool.toolKey,
              isEnabled: tool.isEnabled,
              sortOrder,
              updatedById: req.user?.employeeId,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [toolVisibility.departmentId, toolVisibility.toolKey],
              set: {
                isEnabled: tool.isEnabled,
                sortOrder,
                updatedById: req.user?.employeeId,
                updatedAt: now,
              },
            });
        }
      });

      const rows = await db
        .select({
          toolKey: toolVisibility.toolKey,
          isEnabled: toolVisibility.isEnabled,
          sortOrder: toolVisibility.sortOrder,
        })
        .from(toolVisibility)
        .where(eq(toolVisibility.departmentId, departmentId))
        .orderBy(asc(toolVisibility.sortOrder), asc(toolVisibility.toolKey));

      return ok(res, buildToolSettings(rows));
    }),
  );

  return router;
}
