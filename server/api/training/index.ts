import type { Router } from "express";
import { z } from "zod";
import { db, eq, desc } from "../../lib/db";
import {
  ok,
  created,
  notFound,
  okMessage,
  validationError,
  asyncHandler,
} from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import {
  trainingVideos,
  trainingPresentations,
  type InsertTrainingVideo,
  type InsertTrainingPresentation,
} from "@shared/schema";
import {
  requireAuth,
  requireAdmin,
  requireTrainingEnabled,
} from "../middleware/auth";

const videoBaseShape = {
  title: z.string().min(1, "Titel erforderlich"),
  keywords: z.array(z.string()).optional(),
  platform: z.string().min(1, "Plattform erforderlich"),
  videoId: z.string().optional(),
  url: z.string().optional(),
  embedUrl: z.string().optional(),
  isActive: z.boolean().optional(),
};

const videoBaseSchema = z
  .object(videoBaseShape)
  .refine(
    (value) => Boolean(value.videoId || value.url || value.embedUrl),
    {
      message:
        "Mindestens eine Video-ID, URL oder Embed-URL muss angegeben werden",
    },
  );

const videoUpdateSchema = z.object(videoBaseShape).partial();

const presentationBaseSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  keywords: z.array(z.string()).optional(),
  fileUrl: z.string().min(1, "Dateipfad erforderlich"),
  mimeType: z.string().min(1, "MIME-Type erforderlich"),
  isActive: z.boolean().optional(),
});

const presentationUpdateSchema = z.object({
  title: z.string().min(1, "Titel erforderlich").optional(),
  keywords: z.array(z.string()).optional(),
  fileUrl: z.string().min(1, "Dateipfad erforderlich").optional(),
  mimeType: z.string().min(1, "MIME-Type erforderlich").optional(),
  isActive: z.boolean().optional(),
});

const buildVideoPayload = (
  value: z.infer<typeof videoBaseSchema>,
): InsertTrainingVideo => ({
  title: value.title,
  platform: value.platform,
  videoId: value.videoId ?? null,
  url: value.url ?? null,
  embedUrl: value.embedUrl ?? null,
  isActive: value.isActive ?? true,
  keywords: value.keywords ?? [],
});

const buildPresentationPayload = (
  value: z.infer<typeof presentationBaseSchema>,
): InsertTrainingPresentation => ({
  title: value.title,
  fileUrl: value.fileUrl,
  mimeType: value.mimeType,
  isActive: value.isActive ?? true,
  keywords: value.keywords ?? [],
});

const selectVideoFields = {
  id: trainingVideos.id,
  title: trainingVideos.title,
  platform: trainingVideos.platform,
  videoId: trainingVideos.videoId,
  url: trainingVideos.url,
  embedUrl: trainingVideos.embedUrl,
  keywords: trainingVideos.keywords,
  isActive: trainingVideos.isActive,
  createdAt: trainingVideos.createdAt,
  updatedAt: trainingVideos.updatedAt,
};

const selectPresentationFields = {
  id: trainingPresentations.id,
  title: trainingPresentations.title,
  fileUrl: trainingPresentations.fileUrl,
  mimeType: trainingPresentations.mimeType,
  keywords: trainingPresentations.keywords,
  isActive: trainingPresentations.isActive,
  createdAt: trainingPresentations.createdAt,
  updatedAt: trainingPresentations.updatedAt,
};

export function registerTrainingRoutes(router: Router) {
  router.get(
    "/videos",
    requireAuth,
    requireTrainingEnabled,
    asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === "1";
      const query = db
        .select(selectVideoFields)
        .from(trainingVideos)
        .orderBy(desc(trainingVideos.createdAt));
      if (!includeInactive) {
        query.where(eq(trainingVideos.isActive, true));
      }
      const data = await query;
      return ok(res, data);
    }),
  );

  router.get(
    "/videos/:id",
    requireAuth,
    requireTrainingEnabled,
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const [video] = await db
        .select(selectVideoFields)
        .from(trainingVideos)
        .where(eq(trainingVideos.id, id));
      if (!video) {
        return notFound(res, "Video");
      }
      return ok(res, video);
    }),
  );

  router.post(
    "/videos",
    requireAuth,
    requireAdmin,
    validateBody(videoBaseSchema),
    asyncHandler(async (req, res) => {
      const payload = buildVideoPayload(req.body);
      const [createdVideo] = await db
        .insert(trainingVideos)
        .values(payload)
        .returning();
      return created(res, createdVideo);
    }),
  );

  router.patch(
    "/videos/:id",
    requireAuth,
    requireAdmin,
    validateParams(idParamSchema),
    validateBody(videoUpdateSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const updateData: Partial<InsertTrainingVideo> = {};
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.platform !== undefined)
        updateData.platform = req.body.platform;
      if (req.body.videoId !== undefined) updateData.videoId = req.body.videoId;
      if (req.body.url !== undefined) updateData.url = req.body.url;
      if (req.body.embedUrl !== undefined)
        updateData.embedUrl = req.body.embedUrl;
      if (req.body.isActive !== undefined)
        updateData.isActive = req.body.isActive;
      if (req.body.keywords !== undefined)
        updateData.keywords = req.body.keywords ?? [];

      if (Object.keys(updateData).length === 0) {
        return validationError(res, "Keine Felder zum Aktualisieren übergeben");
      }

      const [updated] = await db
        .update(trainingVideos)
        .set(updateData)
        .where(eq(trainingVideos.id, id))
        .returning();

      if (!updated) {
        return notFound(res, "Video");
      }

      return ok(res, updated);
    }),
  );

  router.delete(
    "/videos/:id",
    requireAuth,
    requireAdmin,
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const deleted = await db
        .delete(trainingVideos)
        .where(eq(trainingVideos.id, id));

      if (!deleted) {
        return notFound(res, "Video");
      }

      return okMessage(res, "Video gelöscht");
    }),
  );

  router.get(
    "/presentations",
    requireAuth,
    requireTrainingEnabled,
    asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === "1";
      const query = db
        .select(selectPresentationFields)
        .from(trainingPresentations)
        .orderBy(desc(trainingPresentations.createdAt));
      if (!includeInactive) {
        query.where(eq(trainingPresentations.isActive, true));
      }
      const data = await query;
      return ok(res, data);
    }),
  );

  router.get(
    "/presentations/:id",
    requireAuth,
    requireTrainingEnabled,
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const [presentation] = await db
        .select(selectPresentationFields)
        .from(trainingPresentations)
        .where(eq(trainingPresentations.id, id));
      if (!presentation) {
        return notFound(res, "Vortrag");
      }
      return ok(res, presentation);
    }),
  );

  router.post(
    "/presentations",
    requireAuth,
    requireAdmin,
    validateBody(presentationBaseSchema),
    asyncHandler(async (req, res) => {
      const payload = buildPresentationPayload(req.body);
      const [createdPresentation] = await db
        .insert(trainingPresentations)
        .values(payload)
        .returning();
      return created(res, createdPresentation);
    }),
  );

  router.patch(
    "/presentations/:id",
    requireAuth,
    requireAdmin,
    validateParams(idParamSchema),
    validateBody(presentationUpdateSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const updateData: Partial<InsertTrainingPresentation> = {};
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.fileUrl !== undefined) updateData.fileUrl = req.body.fileUrl;
      if (req.body.mimeType !== undefined)
        updateData.mimeType = req.body.mimeType;
      if (req.body.isActive !== undefined)
        updateData.isActive = req.body.isActive;
      if (req.body.keywords !== undefined)
        updateData.keywords = req.body.keywords ?? [];

      if (Object.keys(updateData).length === 0) {
        return validationError(res, "Keine Felder zum Aktualisieren übergeben");
      }

      const [updated] = await db
        .update(trainingPresentations)
        .set(updateData)
        .where(eq(trainingPresentations.id, id))
        .returning();

      if (!updated) {
        return notFound(res, "Vortrag");
      }

      return ok(res, updated);
    }),
  );

  router.delete(
    "/presentations/:id",
    requireAuth,
    requireAdmin,
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const deleted = await db
        .delete(trainingPresentations)
        .where(eq(trainingPresentations.id, id));

      if (!deleted) {
        return notFound(res, "Vortrag");
      }

      return okMessage(res, "Vortrag gelöscht");
    }),
  );
}
