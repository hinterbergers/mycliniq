import type { Router, Request } from "express";
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
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import multer from "multer";

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

const newYouTubeVideoSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  youtubeUrlOrId: z.string().min(1, "YouTube-Link oder ID erforderlich"),
  keywords: z.array(z.string()).optional(),
});

const ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const extractYoutubeId = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const normalizedUrl = trimmed.includes("://")
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(normalizedUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes("youtube.com")) {
      const vParam = url.searchParams.get("v");
      if (vParam && ID_REGEX.test(vParam)) {
        return vParam;
      }
      const pathMatch = url.pathname.match(/\/(embed|shorts)\/([A-Za-z0-9_-]{11})/);
      if (pathMatch && pathMatch[2]) {
        return pathMatch[2];
      }
    }

    if (hostname === "youtu.be") {
      const pathId = url.pathname.replace(/^\//, "");
      if (ID_REGEX.test(pathId)) {
        return pathId;
      }
    }
  } catch {
    // fall through to regex fallback
  }

  const directMatch = trimmed.match(ID_REGEX);
  if (directMatch) {
    return directMatch[0];
  }

  return null;
};

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
  storageName: trainingPresentations.storageName,
  originalStorageName: trainingPresentations.originalStorageName,
  originalMimeType: trainingPresentations.originalMimeType,
  createdAt: trainingPresentations.createdAt,
  updatedAt: trainingPresentations.updatedAt,
};

const upload = multer({ storage: multer.memoryStorage() });

const trainingUploadsDir = path.join(process.cwd(), "uploads", "training");
fs.mkdirSync(trainingUploadsDir, { recursive: true });

const ALLOWED_PRESENTATION_MIMES = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const buildDownloadUrl = (id: number) =>
  `/api/training/presentations/${id}/download`;

function normalizeKeywords(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }
  const text = String(value);
  return text
    .split(/[;,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}


async function convertPresentationToPdf(inputPath: string): Promise<string> {
  const outputDir = path.dirname(inputPath);
  const basename = path.basename(inputPath, path.extname(inputPath));
  const pdfName = `${basename}.pdf`;
  const pdfPath = path.join(outputDir, pdfName);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "soffice",
      [
        "--headless",
        "--nologo",
        "--convert-to",
        "pdf",
        "--outdir",
        outputDir,
        inputPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        if (!fs.existsSync(pdfPath)) {
          reject(new Error("PDF nach der Konvertierung nicht gefunden"));
          return;
        }
        resolve(pdfPath);
        return;
      }
      const message = stderr || `LibreOffice-Konvertierung fehlgeschlagen (code ${code})`;
      reject(new Error(message));
    });
  });
}
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

  router.post(
    "/videos/youtube",
    requireAuth,
    requireTrainingEnabled,
    requireAdmin,
    validateBody(newYouTubeVideoSchema),
    asyncHandler(async (req, res) => {
      const { title, youtubeUrlOrId, keywords } = req.body;
      const videoId = extractYoutubeId(youtubeUrlOrId);
      if (!videoId) {
        return validationError(
          res,
          "Keine gültige YouTube-ID oder URL (https://youtu.be/<ID> oder https://www.youtube.com/watch?v=<ID>).",
        );
      }

      const payload = buildVideoPayload({
        title,
        keywords,
        platform: "YouTube",
        videoId,
        url: youtubeUrlOrId,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
        isActive: true,
      });

      const [createdVideo] = await db
        .insert(trainingVideos)
        .values(payload)
        .returning();

      if (!createdVideo) {
        return res
          .status(500)
          .json({ success: false, error: "Video konnte nicht gespeichert werden" });
      }

      console.info(
        "[training] created video",
        createdVideo.id,
        createdVideo.title,
        createdVideo.platform,
      );

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
    "/presentations/upload",
    requireAuth,
    requireTrainingEnabled,
    requireAdmin,
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) {
        return validationError(res, "Datei erforderlich");
      }

      const mime = (file.mimetype ?? "application/octet-stream").toLowerCase();
      if (!ALLOWED_PRESENTATION_MIMES.has(mime)) {
        res
          .status(415)
          .json({ success: false, error: "Nur PDF oder PowerPoint-Dateien sind erlaubt" });
        return;
      }

      const title = (req.body.title ?? "").trim();
      if (!title) {
        return validationError(res, "Titel erforderlich");
      }

      const keywords = normalizeKeywords(req.body.keywords);
      const extension =
        path.extname(file.originalname || "").toLowerCase() ||
        (mime === "application/pdf" ? ".pdf" : "");
      const originalStorageName = `${crypto.randomUUID()}${extension || ".bin"}`;
      const originalPath = path.join(trainingUploadsDir, originalStorageName);
      fs.writeFileSync(originalPath, file.buffer);

      let finalStorageName = originalStorageName;
      let finalMimeType = mime;
      let originalMimeType: string | null = null;
      let originalStoredName: string | null = null;

      if ([".ppt", ".pptx"].includes(extension)) {
        originalMimeType = file.mimetype;
        originalStoredName = originalStorageName;
        try {
          const convertedPath = await convertPresentationToPdf(originalPath);
          finalStorageName = path.basename(convertedPath);
          finalMimeType = "application/pdf";
        } catch (error: any) {
          if (error.code === "ENOENT") {
            return validationError(
              res,
              "LibreOffice ist auf dem Server nicht installiert.",
            );
          }
          const message =
            error?.message || "Konvertierung der PowerPoint-Datei fehlgeschlagen.";
          res.status(500).json({ success: false, error: message });
          return;
        }
      }

      const [inserted] = await db
        .insert(trainingPresentations)
        .values({
          title,
          keywords,
          mimeType: finalMimeType,
          fileUrl: "",
          isActive: true,
          storageName: finalStorageName,
          originalStorageName: originalStoredName,
          originalMimeType,
        })
        .returning();

      const downloadUrl = buildDownloadUrl(inserted.id);
      await db
        .update(trainingPresentations)
        .set({ fileUrl: downloadUrl })
        .where(eq(trainingPresentations.id, inserted.id));

      const [result] = await db
        .select(selectPresentationFields)
        .from(trainingPresentations)
        .where(eq(trainingPresentations.id, inserted.id));

      return created(res, {
        ...result,
        fileUrl: downloadUrl,
      });
    }),
  );

  router.get(
    "/presentations/:id/download",
    requireAuth,
    requireTrainingEnabled,
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const [presentation] = await db
        .select({
          id: trainingPresentations.id,
          title: trainingPresentations.title,
          storageName: trainingPresentations.storageName,
          mimeType: trainingPresentations.mimeType,
        })
        .from(trainingPresentations)
        .where(eq(trainingPresentations.id, id))
        .limit(1);

      if (!presentation || !presentation.storageName) {
        return notFound(res, "Vortrag");
      }

      const filePath = path.join(trainingUploadsDir, presentation.storageName);
      if (!fs.existsSync(filePath)) {
        return notFound(res, "Datei");
      }

      res.setHeader("Content-Type", presentation.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${presentation.title
          .replace(/"/g, '\\"')
          .replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf"`,
      );
      res.sendFile(filePath);
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
