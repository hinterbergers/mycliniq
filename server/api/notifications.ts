import type { Router } from "express";
import { db, eq, desc, and } from "../lib/db";
import { notifications } from "@shared/schema";
import { ok, notFound, asyncHandler } from "../lib/api-response";
import { validateParams, idParamSchema } from "../lib/validate";
import { requireAuth } from "./middleware/auth";

export function registerNotificationRoutes(router: Router) {
  router.use(requireAuth);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientId, req.user.employeeId))
        .orderBy(desc(notifications.createdAt));
      return ok(res, rows);
    })
  );

  router.post(
    "/:id/read",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const id = Number(req.params.id);
      const [updated] = await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.recipientId, req.user.employeeId)))
        .returning();
      if (!updated) {
        return notFound(res, "Benachrichtigung");
      }
      return ok(res, updated);
    })
  );

  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const id = Number(req.params.id);
      const [existing] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.id, id), eq(notifications.recipientId, req.user.employeeId)))
        .limit(1);
      if (!existing) {
        return notFound(res, "Benachrichtigung");
      }
      await db.delete(notifications).where(eq(notifications.id, id));
      return ok(res, { success: true });
    })
  );
}
