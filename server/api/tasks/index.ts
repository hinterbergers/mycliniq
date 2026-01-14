import type { Router } from "express";
import { z } from "zod";
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
import { tasks, employees } from "@shared/schema";
import { requireAuth } from "../middleware/auth";

const TASK_STATUS_VALUES = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "DONE"] as const;
const TASK_TYPE_VALUES = ["ONE_OFF", "RESPONSIBILITY"] as const;

const numericIdString = (label: string) =>
  z.string().regex(/^\d+$/, `${label} muss eine Zahl sein`).transform(Number);

type WhereClause =
  | ReturnType<typeof eq>
  | ReturnType<typeof isNull>
  | ReturnType<typeof sql>
  | ReturnType<typeof or>;

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
      const view = query.view;
      const assignedToId = query.assignedToId;
      const status = query.status;
      const type = query.type;
      const sopId = query.sopId;
      const parentId = query.parentId;
      const q = query.q;

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
      res.set("Cache-Control", "no-store");

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

  router.post(
    "/",
    validateBody(createTaskSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createTaskSchema>;
      if (!req.user) {
        return notFound(res, "Aufgabe");
      }
      const [createdTask] = await db
        .insert(tasks)
        .values({
          title: body.title,
          description: body.description ?? null,
          assignedToId: body.assignedToId ?? null,
          dueDate: body.dueDate ?? null,
          parentId: body.parentId ?? null,
          sopId: body.sopId ?? null,
          type: body.type ?? "ONE_OFF",
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

      if (body.title) {
        updatePayload.title = body.title;
      }
      if (Object.prototype.hasOwnProperty.call(body, "description")) {
        updatePayload.description = body.description ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "assignedToId")) {
        updatePayload.assignedToId = body.assignedToId ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "dueDate")) {
        updatePayload.dueDate = body.dueDate ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "sopId")) {
        updatePayload.sopId = body.sopId ?? null;
      }
      if (body.status) {
        updatePayload.status = body.status;
        if (body.status === "DONE") {
          updatePayload.completedAt = new Date();
        } else {
          updatePayload.completedAt = null;
        }
      }
      if (body.type) {
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
