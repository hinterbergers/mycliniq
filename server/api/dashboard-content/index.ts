import type { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { asyncHandler, created, forbidden, notFound, ok } from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import {
  contentViews,
  dashboardAnnouncementReads,
  dashboardAnnouncements,
  sops,
  trainingPresentations,
  trainingVideos,
} from "@shared/schema";

const announcementSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  details: z.string().trim().nullable().optional(),
  link: z.string().trim().nullable().optional(),
  priority: z.enum(["normal", "important"]).default("normal"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

const viewSchema = z.object({
  contentType: z.enum(["sop", "video", "presentation"]),
  contentId: z.number().int().positive(),
});

const canManage = (user: any) =>
  Boolean(user?.isAdmin || user?.systemRole === "system_admin");

export function registerDashboardContentRoutes(router: Router) {
  router.get(
    "/announcements",
    asyncHandler(async (req, res) => {
      const employeeId = req.user?.employeeId;
      const rows = await db
        .select({
          id: dashboardAnnouncements.id,
          title: dashboardAnnouncements.title,
          summary: dashboardAnnouncements.summary,
          details: dashboardAnnouncements.details,
          link: dashboardAnnouncements.link,
          priority: dashboardAnnouncements.priority,
          status: dashboardAnnouncements.status,
          publishedAt: dashboardAnnouncements.publishedAt,
          createdAt: dashboardAnnouncements.createdAt,
          readId: dashboardAnnouncementReads.id,
        })
        .from(dashboardAnnouncements)
        .leftJoin(
          dashboardAnnouncementReads,
          and(
            eq(dashboardAnnouncementReads.announcementId, dashboardAnnouncements.id),
            eq(dashboardAnnouncementReads.employeeId, employeeId),
          ),
        )
        .where(eq(dashboardAnnouncements.status, "published"))
        .orderBy(desc(dashboardAnnouncements.publishedAt));
      return ok(res, rows.map(({ readId, ...row }) => ({ ...row, isRead: Boolean(readId) })));
    }),
  );

  router.get(
    "/announcements/admin",
    asyncHandler(async (req, res) => {
      if (!canManage(req.user)) return forbidden(res);
      return ok(
        res,
        await db.select().from(dashboardAnnouncements).orderBy(desc(dashboardAnnouncements.createdAt)),
      );
    }),
  );

  router.post(
    "/announcements",
    validateBody(announcementSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req.user)) return forbidden(res);
      const status = req.body.status;
      const [row] = await db.insert(dashboardAnnouncements).values({
        ...req.body,
        details: req.body.details || null,
        link: req.body.link || null,
        publishedAt: status === "published" ? new Date() : null,
        createdById: req.user.employeeId,
      }).returning();
      return created(res, row);
    }),
  );

  router.put(
    "/announcements/:id",
    validateParams(idParamSchema),
    validateBody(announcementSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req.user)) return forbidden(res);
      const id = Number(req.params.id);
      const [existing] = await db.select().from(dashboardAnnouncements).where(eq(dashboardAnnouncements.id, id));
      if (!existing) return notFound(res, "Neuerung");
      const [row] = await db.update(dashboardAnnouncements).set({
        ...req.body,
        details: req.body.details || null,
        link: req.body.link || null,
        publishedAt:
          req.body.status === "published"
            ? existing.publishedAt ?? new Date()
            : null,
        updatedAt: new Date(),
      }).where(eq(dashboardAnnouncements.id, id)).returning();
      return ok(res, row);
    }),
  );

  router.post(
    "/announcements/:id/read",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      await db.insert(dashboardAnnouncementReads).values({
        announcementId: Number(req.params.id),
        employeeId: req.user.employeeId,
      }).onConflictDoNothing();
      return ok(res, { read: true });
    }),
  );

  router.post(
    "/views",
    validateBody(viewSchema),
    asyncHandler(async (req, res) => {
      const viewedOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date());
      await db.insert(contentViews).values({
        employeeId: req.user.employeeId,
        contentType: req.body.contentType,
        contentId: req.body.contentId,
        viewedOn,
      }).onConflictDoNothing();
      return ok(res, { recorded: true });
    }),
  );

  router.get(
    "/content",
    asyncHandler(async (_req, res) => {
      const [newSops, newVideos, newPresentations] = await Promise.all([
        db.select({ id: sops.id, title: sops.title, category: sops.category, publishedAt: sops.publishedAt }).from(sops).where(eq(sops.status, "published")).orderBy(desc(sops.publishedAt)).limit(5),
        db.select({ id: trainingVideos.id, title: trainingVideos.title, category: trainingVideos.platform, publishedAt: trainingVideos.createdAt }).from(trainingVideos).where(eq(trainingVideos.isActive, true)).orderBy(desc(trainingVideos.createdAt)).limit(5),
        db.select({ id: trainingPresentations.id, title: trainingPresentations.title, publishedAt: trainingPresentations.createdAt }).from(trainingPresentations).where(eq(trainingPresentations.isActive, true)).orderBy(desc(trainingPresentations.createdAt)).limit(5),
      ]);
      const newest = [
        ...newSops.map((x) => ({ ...x, type: "sop", url: `/wissen?sopId=${x.id}` })),
        ...newVideos.map((x) => ({ ...x, type: "video", url: `/fortbildung/videos?videoId=${x.id}` })),
        ...newPresentations.map((x) => ({ ...x, type: "presentation", category: "Präsentation", url: `/fortbildung/presentations?presentationId=${x.id}` })),
      ]
        .sort(
          (a, b) =>
            new Date(b.publishedAt ?? 0).getTime() -
            new Date(a.publishedAt ?? 0).getTime(),
        )
        .slice(0, 3);

      const since = new Date();
      since.setDate(since.getDate() - 30);
      const counts = await db.select({
        contentType: contentViews.contentType,
        contentId: contentViews.contentId,
        views: sql<number>`count(*)::int`,
      }).from(contentViews).where(gte(contentViews.viewedOn, since.toISOString().slice(0, 10))).groupBy(contentViews.contentType, contentViews.contentId).orderBy(desc(sql`count(*)`)).limit(12);

      const popular: any[] = [];
      for (const item of counts) {
        if (item.contentType === "sop") {
          const [row] = await db.select({ id: sops.id, title: sops.title, category: sops.category }).from(sops).where(eq(sops.id, item.contentId));
          if (row) popular.push({ ...row, type: "sop", views: item.views, url: `/wissen?sopId=${row.id}` });
        } else if (item.contentType === "video") {
          const [row] = await db.select({ id: trainingVideos.id, title: trainingVideos.title, category: trainingVideos.platform }).from(trainingVideos).where(eq(trainingVideos.id, item.contentId));
          if (row) popular.push({ ...row, type: "video", views: item.views, url: `/fortbildung/videos?videoId=${row.id}` });
        } else {
          const [row] = await db.select({ id: trainingPresentations.id, title: trainingPresentations.title }).from(trainingPresentations).where(eq(trainingPresentations.id, item.contentId));
          if (row) popular.push({ ...row, type: "presentation", category: "Präsentation", views: item.views, url: `/fortbildung/presentations?presentationId=${row.id}` });
        }
      }
      return ok(res, { newest, popular: popular.slice(0, 3) });
    }),
  );
}
