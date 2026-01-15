import type { Router, Request } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db, eq, and, isNull, inArray, desc, sql, or } from "../../lib/db";
import {
  ok,
  created,
  notFound,
  asyncHandler,
} from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  validateQuery,
  idParamSchema,
} from "../../lib/validate";
import { tasks, employees, taskAttachments } from "@shared/schema";
import { requireAuth, hasCapability } from "../middleware/auth";

const TASK_STATUS_VALUES = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "DONE"] as const;
const TASK_TYPE_VALUES = ["ONE_OFF", "RESPONSIBILITY"] as const;
const TASK_MANAGE_CAP = "perm.project_manage";
export const uploadsDir =
  process.env.UPLOADS_DIR ??
  path.join(process.cwd(), "uploads", "tasks");

fs.mkdirSync(uploadsDir, { recursive: true });

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

type ParsedAttachment = {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
};

function parseMultipartAttachment(req: Request): Promise<ParsedAttachment> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"];
    if (
      !contentType ||
      typeof contentType !== "string" ||
      !contentType.includes("multipart/form-data")
    ) {
      return reject(new Error("Ungültiger Content-Type"));
    }
    const boundaryMatch = contentType.match(/boundary=(.*)$/);
    if (!boundaryMatch) {
      return reject(new Error("Boundary fehlt im Content-Type"));
    }
    const boundary = boundaryMatch[1];
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const delimiter = Buffer.from(`\r\n--${boundary}`);

    const chunks: Buffer[] = [];
    let totalLength = 0;
    req.on("data", (chunk) => {
      totalLength += chunk.length;
      if (totalLength > MAX_ATTACHMENT_SIZE) {
        reject(new Error("Datei zu groß"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const start = buffer.indexOf(boundaryBuffer);
      if (start === -1) {
        return reject(new Error("Boundary nicht gefunden"));
      }
      const headerStart = start + boundaryBuffer.length + 2;
      const headerEnd = buffer.indexOf("\r\n\r\n", headerStart);
      if (headerEnd === -1) {
        return reject(new Error("Header nicht gefunden"));
      }
      const headerText = buffer
        .slice(headerStart, headerEnd)
        .toString("utf8")
        .split("\r\n");
      const contentDisposition = headerText.find((line) =>
        line.toLowerCase().startsWith("content-disposition"),
      );
      if (!contentDisposition) {
        return reject(new Error("Content-Disposition fehlt"));
      }
      const filenameMatch = contentDisposition.match(
        /filename="([^"]+)"(?:;|$)/,
      );
      const fieldMatch = contentDisposition.match(/name="([^"]+)"/);
      if (!filenameMatch || fieldMatch?.[1] !== "file") {
        return reject(new Error("Ungültiges Feld"));
      }
      const contentTypeHeader = headerText.find((line) =>
        line.toLowerCase().startsWith("content-type"),
      );
      const mimeType =
        contentTypeHeader?.split(":")[1]?.trim() ?? "application/octet-stream";
      const fileStart = headerEnd + 4;
      const boundaryIndex = buffer.indexOf(delimiter, fileStart);
      if (boundaryIndex === -1) {
        return reject(new Error("Dateigrenze nicht gefunden"));
      }
      let fileEnd = boundaryIndex;
      if (buffer[fileEnd - 2] === 13 && buffer[fileEnd - 1] === 10) {
        fileEnd -= 2;
      }
      const fileBuffer = buffer.slice(fileStart, fileEnd);
      if (!allowedMimeTypes.has(mimeType)) {
        return reject(
          new Error("Nur PDF, DOCX, XLSX, PNG und JPG-Dateien sind erlaubt."),
        );
      }
      resolve({
        originalName: filenameMatch[1],
        mimeType,
        buffer: fileBuffer,
      });
    });
    req.on("error", (error) => {
      reject(error);
    });
  });
}

function canManageTasks(req: Request): boolean {
  return hasCapability(req, TASK_MANAGE_CAP);
}

const numericIdString = (label: string) =>
  z.string().regex(/^\d+$/, `${label} muss eine Zahl sein`).transform(Number);

type WhereClause =
  | ReturnType<typeof eq>
  | ReturnType<typeof isNull>
  | ReturnType<typeof sql>
  | ReturnType<typeof or>;

const attachmentIdParamSchema = z.object({
  attachmentId: numericIdString("attachmentId"),
});

const listQuerySchema = z.object({
  view: z.enum(["my", "team", "responsibilities"]).optional(),
  assignedToId: numericIdString("assignedToId").optional(),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  type: z.enum(TASK_TYPE_VALUES).optional(),
  sopId: numericIdString("sopId").optional(),
  parentId: numericIdString("parentId").optional(),
  q: z.string().trim().min(1).optional(),
});

const taskTypeSchema = z.enum(TASK_TYPE_VALUES);
const taskStatusSchema = z.enum(TASK_STATUS_VALUES);

const createTaskSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  description: z.string().nullable().optional(),
  assignedToId: z.number().int().positive().optional().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD")
    .nullable()
    .optional(),
  parentId: z.number().int().positive().optional().nullable(),
  sopId: z.number().int().positive().optional().nullable(),
  type: taskTypeSchema.optional(),
  status: taskStatusSchema.optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
  type: taskTypeSchema.optional(),
  assignedToId: z.number().int().positive().optional().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD")
    .nullable()
    .optional(),
  sopId: z.number().int().positive().optional().nullable(),
});

function mapTaskRow(row: {
  id: number;
  title: string;
  description: string | null;
  status: (typeof TASK_STATUS_VALUES)[number];
  type: (typeof TASK_TYPE_VALUES)[number];
  assignedToId: number | null;
  dueDate: string | null;
  parentId: number | null;
  sopId: number | null;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  assignedName: string | null;
  assignedLastName: string | null;
}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    type: row.type,
    assignedToId: row.assignedToId,
    dueDate: row.dueDate,
    parentId: row.parentId,
    sopId: row.sopId,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    assignedTo: row.assignedToId
      ? {
          id: row.assignedToId,
          name: row.assignedName,
          lastName: row.assignedLastName,
        }
      : null,
  };
}

export function registerTaskRoutes(router: Router) {
  router.use(requireAuth);

  router.get(
    "/",
    validateQuery(listQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.query as z.infer<typeof listQuerySchema>;
      const view = query.view ?? "my";
      const assignedToId = query.assignedToId;
      const status = query.status;
      const type = query.type;
      const sopId = query.sopId;
      const parentId = query.parentId;
      const q = query.q;

      // Prevent ETag/304 caching for this API endpoint (Safari devtools + rapid UI testing)
      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      // Ensure Express does not generate an ETag which can trigger 304 responses
      res.set("ETag", "");

      if (!req.user) {
        return notFound(res, "Aufgabe");
      }

      const currentEmployeeId = req.user.employeeId;

      const whereClauses: WhereClause[] = [isNull(tasks.deletedAt)];

      if (assignedToId) {
        whereClauses.push(eq(tasks.assignedToId, assignedToId));
      }

      if (status) {
        whereClauses.push(eq(tasks.status, status));
      }

      if (type) {
        whereClauses.push(eq(tasks.type, type));
      }

      if (sopId) {
        whereClauses.push(eq(tasks.sopId, sopId));
      }

      if (parentId) {
        whereClauses.push(eq(tasks.parentId, parentId));
      }

      if (q) {
        const searchTerm = `%${q}%`;
        whereClauses.push(
          sql`(${tasks.title} ILIKE ${searchTerm} OR ${tasks.description} ILIKE ${searchTerm})`,
        );
      }

      const isMyView = view === "my";
      if (isMyView) {
        whereClauses.push(
          or(
            eq(tasks.assignedToId, currentEmployeeId),
            eq(tasks.createdById, currentEmployeeId),
          ),
        );
      }

      if (view === "responsibilities") {
        whereClauses.push(eq(tasks.type, "RESPONSIBILITY"));
      }

      if (view === "team" && req.user.departmentId) {
        const teammates = await db
          .select({ employeeId: employees.id })
          .from(employees)
          .where(
            and(
              eq(employees.departmentId, req.user.departmentId),
              eq(employees.isActive, true),
            ),
          );
        const teammateIds = teammates.map((row) => row.employeeId);
        if (teammateIds.length) {
          whereClauses.push(
            or(
              inArray(tasks.assignedToId, teammateIds),
              inArray(tasks.createdById, teammateIds),
            ),
          );
        }
      }

      const queryBuilder = db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          type: tasks.type,
          assignedToId: tasks.assignedToId,
          dueDate: tasks.dueDate,
          parentId: tasks.parentId,
          sopId: tasks.sopId,
          createdById: tasks.createdById,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          completedAt: tasks.completedAt,
          assignedName: employees.name,
          assignedLastName: employees.lastName,
        })
        .from(tasks)
        .leftJoin(employees, eq(tasks.assignedToId, employees.id));

      const finalQuery = whereClauses.length
        ? queryBuilder.where(and(...whereClauses))
        : queryBuilder;

      const rows = await finalQuery.orderBy(desc(tasks.createdAt));

      const result = rows.map((row) => mapTaskRow(row));
      return ok(res, result);
    }),
  );

  router.get(
    "/:id/subtasks",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      const subtasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          type: tasks.type,
          assignedToId: tasks.assignedToId,
          dueDate: tasks.dueDate,
          parentId: tasks.parentId,
          sopId: tasks.sopId,
          createdById: tasks.createdById,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          completedAt: tasks.completedAt,
          assignedName: employees.name,
          assignedLastName: employees.lastName,
        })
        .from(tasks)
        .leftJoin(employees, eq(tasks.assignedToId, employees.id))
        .where(and(eq(tasks.parentId, id), isNull(tasks.deletedAt)))
        .orderBy(desc(tasks.createdAt));

      return ok(
        res,
        subtasks.map((row) => mapTaskRow(row)),
      );
    }),
  );

  router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      const [taskRow] = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          type: tasks.type,
          assignedToId: tasks.assignedToId,
          dueDate: tasks.dueDate,
          parentId: tasks.parentId,
          sopId: tasks.sopId,
          createdById: tasks.createdById,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          completedAt: tasks.completedAt,
          assignedName: employees.name,
          assignedLastName: employees.lastName,
        })
        .from(tasks)
        .leftJoin(employees, eq(tasks.assignedToId, employees.id))
        .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
        .limit(1);

      if (!taskRow) {
        return notFound(res, "Aufgabe");
      }

      const subtaskRows = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(and(eq(tasks.parentId, id), isNull(tasks.deletedAt)));

      const subtaskTotal = subtaskRows.length;
      const subtaskDone = subtaskRows.filter(
        (item) => item.status === "DONE",
      ).length;

      return ok(res, {
        ...mapTaskRow(taskRow),
        subtaskTotal,
        subtaskDone,
      });
    }),
  );

  router.get(
    "/:id/attachments",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      if (!req.user) {
        return notFound(res, "Aufgabe");
      }

      const attachments = await db
        .select({
          id: taskAttachments.id,
          taskId: taskAttachments.taskId,
          uploadedById: taskAttachments.uploadedById,
          originalName: taskAttachments.originalName,
          storedName: taskAttachments.storedName,
          mimeType: taskAttachments.mimeType,
          size: taskAttachments.size,
          createdAt: taskAttachments.createdAt,
        })
        .from(taskAttachments)
        .where(eq(taskAttachments.taskId, id))
        .orderBy(desc(taskAttachments.createdAt));

      return ok(res, attachments);
    }),
  );

  router.post(
    "/:id/attachments",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      if (!req.user) {
        return notFound(res, "Aufgabe");
      }
      let parsed: ParsedAttachment;
      try {
        parsed = await parseMultipartAttachment(req);
      } catch (error: any) {
        return res.status(400).json({
          success: false,
          error: error?.message || "Datei konnte nicht verarbeitet werden.",
        });
      }

      const storedName = `${crypto.randomUUID()}${path.extname(
        parsed.originalName,
      )}`;
      const storedPath = path.join(uploadsDir, storedName);
      fs.writeFileSync(storedPath, parsed.buffer);

      const [createdAttachment] = await db
        .insert(taskAttachments)
        .values({
          taskId: id,
          uploadedById: req.user.employeeId,
          originalName: parsed.originalName,
          storedName,
          mimeType: parsed.mimeType,
          size: parsed.buffer.length,
        })
        .returning();

      return created(res, createdAttachment);
    }),
  );

  router.get(
    "/attachments/:attachmentId/download",
    validateParams(attachmentIdParamSchema),
    asyncHandler(async (req, res) => {
      const attachmentId = req.params.attachmentId;
      if (!req.user) {
        return notFound(res, "Anhang");
      }

      const [attachment] = await db
        .select({
          id: taskAttachments.id,
          storedName: taskAttachments.storedName,
          originalName: taskAttachments.originalName,
          mimeType: taskAttachments.mimeType,
        })
        .from(taskAttachments)
        .where(eq(taskAttachments.id, attachmentId))
        .limit(1);

      if (!attachment) {
        return notFound(res, "Anhang");
      }

      const filePath = path.join(uploadsDir, attachment.storedName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: "Datei nicht gefunden.",
        });
      }

      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${attachment.originalName.replace(/"/g, '\\"')}"`,
      );
      res.sendFile(filePath);
    }),
  );

  router.post(
    "/",
    validateBody(createTaskSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createTaskSchema>;
      const canManage = canManageTasks(req);
      if (!req.user) {
        return notFound(res, "Aufgabe");
      }
      if (!canManage) {
        if (Object.prototype.hasOwnProperty.call(body, "assignedToId")) {
          return res.status(403).json({
            success: false,
            error:
              "Keine Berechtigung: Aufgaben dürfen nur von Berechtigten delegiert werden.",
          });
        }
        if (Object.prototype.hasOwnProperty.call(body, "type")) {
          return res.status(403).json({
            success: false,
            error:
              "Keine Berechtigung: Aufgaben dürfen nur von Berechtigten typisiert werden.",
          });
        }
        if (
          Object.prototype.hasOwnProperty.call(body, "status") &&
          body.status !== "SUBMITTED"
        ) {
          return res.status(403).json({
            success: false,
            error:
              "Keine Berechtigung: Aufgaben dürfen nur von Berechtigten im Status verändert werden.",
          });
        }
      }
      const [createdTask] = await db
        .insert(tasks)
        .values({
          title: body.title,
          description: body.description ?? null,
          assignedToId: canManage ? body.assignedToId ?? null : null,
          dueDate: body.dueDate ?? null,
          parentId: body.parentId ?? null,
          sopId: body.sopId ?? null,
          type: canManage ? body.type ?? "ONE_OFF" : "ONE_OFF",
          status: canManage ? body.status ?? "NOT_STARTED" : "SUBMITTED",
          createdById: req.user.employeeId,
          updatedById: req.user.employeeId,
        })
        .returning();

      return created(res, createdTask);
    }),
  );

  router.post(
    "/:id/subtasks",
    validateParams(idParamSchema),
    validateBody(createTaskSchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      const exists = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
        .limit(1);
      if (!exists.length) {
        return notFound(res, "Aufgabe");
      }
      if (!req.user) {
        return notFound(res, "Aufgabe");
      }
      const body = req.body as z.infer<typeof createTaskSchema>;

      const [createdTask] = await db
        .insert(tasks)
        .values({
          title: body.title,
          description: body.description ?? null,
          assignedToId: body.assignedToId ?? null,
          dueDate: body.dueDate ?? null,
          parentId: id,
          sopId: body.sopId ?? null,
          type: body.type ?? "ONE_OFF",
          createdById: req.user.employeeId,
          updatedById: req.user.employeeId,
        })
        .returning();

      return created(res, createdTask);
    }),
  );

  router.patch(
    "/:id",
    validateParams(idParamSchema),
    validateBody(updateTaskSchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      const body = req.body as z.infer<typeof updateTaskSchema>;
      const canManage = canManageTasks(req);
      if (!req.user) {
        return notFound(res, "Aufgabe");
      }

      const [existing] = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
        .limit(1);

      if (!existing) {
        return notFound(res, "Aufgabe");
      }

      const updatePayload: Record<string, unknown> = {
        updatedById: req.user.employeeId,
        updatedAt: new Date(),
      };
      if (
        !canManage &&
        (Object.prototype.hasOwnProperty.call(body, "assignedToId") ||
          Object.prototype.hasOwnProperty.call(body, "status") ||
          Object.prototype.hasOwnProperty.call(body, "type"))
      ) {
        return res.status(403).json({
          success: false,
          error:
            "Keine Berechtigung: Aufgaben dürfen nur von Berechtigten zugewiesen oder im Status geändert werden.",
        });
      }

      if (body.title) {
        updatePayload.title = body.title;
      }
      if (Object.prototype.hasOwnProperty.call(body, "description")) {
        updatePayload.description = body.description ?? null;
      }
      if (canManage && Object.prototype.hasOwnProperty.call(body, "assignedToId")) {
        updatePayload.assignedToId = body.assignedToId ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "dueDate")) {
        updatePayload.dueDate = body.dueDate ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "sopId")) {
        updatePayload.sopId = body.sopId ?? null;
      }
      if (body.status && canManage) {
        updatePayload.status = body.status;
        if (body.status === "DONE") {
          updatePayload.completedAt = new Date();
        } else {
          updatePayload.completedAt = null;
        }
      }
      if (body.type && canManage) {
        updatePayload.type = body.type;
      }

      const [updated] = await db
        .update(tasks)
        .set(updatePayload)
        .where(eq(tasks.id, id))
        .returning();

      return ok(res, updated);
    }),
  );
}
