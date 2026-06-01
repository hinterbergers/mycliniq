import type { Router } from "express";
import { z } from "zod";
import { db, eq, desc, and } from "../lib/db";
import { notifications, employees } from "@shared/schema";
import { ok, notFound, asyncHandler } from "../lib/api-response";
import { validateParams, idParamSchema } from "../lib/validate";
import { requireAuth, requireTechnicalAdmin } from "./middleware/auth";

const markReadSchema = z
  .object({
    actionType: z.string().trim().min(1).max(80).optional(),
    actionLabel: z.string().trim().min(1).max(120).optional(),
    actionDetails: z.string().trim().max(500).nullable().optional(),
  })
  .partial();

const broadcastSchema = z.object({
  title: z.string().trim().min(1, "Titel erforderlich").max(160),
  message: z.string().trim().min(1, "Nachricht erforderlich").max(5000),
  link: z.string().trim().max(500).optional(),
});

export function registerNotificationRoutes(router: Router) {
  router.use(requireAuth);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientId, req.user.employeeId))
        .orderBy(desc(notifications.createdAt));
      return ok(res, rows);
    }),
  );

  router.post(
    "/broadcast",
    requireTechnicalAdmin,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }

      const parsed = broadcastSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return res.status(400).json({
          success: false,
          error: issue?.message || "Ungueltige Eingabe",
        });
      }

      const { title, message, link } = parsed.data;
      const activeEmployees = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.isActive, true));

      if (!activeEmployees.length) {
        return ok(res, { count: 0 });
      }

      const senderName = [req.user.name, req.user.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      await db.insert(notifications).values(
        activeEmployees.map((employee) => ({
          recipientId: employee.id,
          type: "system" as const,
          title,
          message,
          link: link?.trim() || null,
          metadata: {
            kind: "system_broadcast",
            createdByEmployeeId: req.user?.employeeId,
            createdByName: senderName || null,
          },
        })),
      );

      return ok(res, { count: activeEmployees.length });
    }),
  );

  router.post(
    "/:id/read",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const id = Number(req.params.id);
      const parsed = markReadSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return res.status(400).json({
          success: false,
          error: issue?.message || "Ungueltige Eingabe",
        });
      }

      const [existing] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.recipientId, req.user.employeeId),
          ),
        )
        .limit(1);
      if (!existing) {
        return notFound(res, "Benachrichtigung");
      }

      const currentMetadata =
        existing.metadata && typeof existing.metadata === "object"
          ? { ...(existing.metadata as Record<string, unknown>) }
          : {};
      const now = new Date();
      const { actionType, actionLabel, actionDetails } = parsed.data;
      if (actionType) currentMetadata.actionType = actionType;
      if (actionLabel) currentMetadata.actionLabel = actionLabel;
      if (typeof actionDetails !== "undefined") {
        currentMetadata.actionDetails = actionDetails;
      }
      if (actionType || actionLabel || typeof actionDetails !== "undefined") {
        currentMetadata.handledAt = now.toISOString();
      }

      const [updated] = await db
        .update(notifications)
        .set({
          isRead: true,
          readAt: existing.readAt ?? now,
          metadata: currentMetadata,
        })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.recipientId, req.user.employeeId),
          ),
        )
        .returning();
      return ok(res, updated);
    }),
  );

  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const id = Number(req.params.id);
      const [existing] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.recipientId, req.user.employeeId),
          ),
        )
        .limit(1);
      if (!existing) {
        return notFound(res, "Benachrichtigung");
      }
      await db.delete(notifications).where(eq(notifications.id, id));
      return ok(res, { success: true });
    }),
  );
}
