import type { Router } from "express";
import { z } from "zod";
import { db, eq, and, inArray, desc, isNull, or } from "../../lib/db";
import { ok, created, notFound, asyncHandler } from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import {
  projectInitiatives,
  projectMembers,
  employees,
  permissions,
  userPermissions,
  notifications,
} from "@shared/schema";
import { requireAuth, hasCapability } from "../middleware/auth";

const PROJECT_MANAGE_CAP = "perm.project_manage";
const PROJECT_DELETE_CAP = "perm.project_delete";

const projectCategorySchema = z.enum([
  "SOP",
  "Studie",
  "Administrativ",
  "Qualitaetsprojekt",
  "Qualitätsprojekt",
]);

const createProjectSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  description: z.string().nullable().optional(),
  category: projectCategorySchema.optional(),
  status: z.enum(["proposed", "active", "done", "archived"]).optional(),
  ownerId: z.number().positive().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  priority: z.number().min(0).max(10).optional(),
  assignees: z
    .array(
      z.object({
        employeeId: z.number().positive(),
        role: z.enum(["read", "edit"]).default("read"),
      }),
    )
    .optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: projectCategorySchema.optional(),
  status: z.enum(["proposed", "active", "done", "archived"]).optional(),
  ownerId: z.number().positive().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  priority: z.number().min(0).max(10).optional(),
});

const assignMembersSchema = z.object({
  members: z.array(
    z.object({
      employeeId: z.number().positive(),
      role: z.enum(["read", "edit"]).default("read"),
    }),
  ),
});

type AssignProjectMemberInput = z.infer<
  typeof assignMembersSchema
>["members"][number];

const statusReasonSchema = z.object({
  reason: z.string().min(1, "Begruendung erforderlich"),
});

function canManage(req: Parameters<typeof hasCapability>[0]): boolean {
  return hasCapability(req, PROJECT_MANAGE_CAP);
}

function canDelete(req: Parameters<typeof hasCapability>[0]): boolean {
  return hasCapability(req, PROJECT_DELETE_CAP);
}

function normalizeProjectStatus(status: string | null | undefined): string {
  if (!status) return "proposed";
  const lower = status.toLowerCase();
  if (["entwurf", "proposed"].includes(lower)) return "proposed";
  if (["aktiv", "active"].includes(lower)) return "active";
  if (["abgeschlossen", "done"].includes(lower)) return "done";
  if (["archiviert", "archived"].includes(lower)) return "archived";
  return status;
}

type ProjectInitiativeInsert = typeof projectInitiatives.$inferInsert;
type ProjectCategory = NonNullable<ProjectInitiativeInsert["category"]>;

const PROJECT_CATEGORIES: readonly ProjectCategory[] = [
  "SOP",
  "Studie",
  "Administrativ",
  "Qualitätsprojekt",
];

function normalizeProjectCategory(
  category?: string | null,
): ProjectCategory | undefined {
  if (!category) return undefined;
  if (category === "Qualitaetsprojekt") return "Qualitätsprojekt";
  if (PROJECT_CATEGORIES.includes(category as ProjectCategory)) {
    return category as ProjectCategory;
  }
  return undefined;
}

async function isMember(
  projectId: number,
  employeeId: number,
): Promise<boolean> {
  const [member] = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.employeeId, employeeId),
      ),
    )
    .limit(1);
  return Boolean(member);
}

async function getMemberRole(
  projectId: number,
  employeeId: number,
): Promise<"read" | "edit" | null> {
  const [member] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.employeeId, employeeId),
      ),
    )
    .limit(1);
  if (!member) return null;
  return member.role === "read" ? "read" : "edit";
}

async function createNotification(
  employeeIds: number[],
  payload: {
    type?: "system" | "sop" | "project" | "message";
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!employeeIds.length) return;
  const rows = employeeIds.map((recipientId) => ({
    recipientId,
    type: payload.type || "system",
    title: payload.title,
    message: payload.message,
    link: payload.link || null,
    metadata: payload.metadata || null,
  }));
  await db.insert(notifications).values(rows);
}

async function notifyPermissionGroup(
  departmentId: number | undefined,
  permissionKey: string,
  payload: {
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!departmentId) return;
  const recipients = await db
    .select({ userId: userPermissions.userId })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(
      and(
        eq(userPermissions.departmentId, departmentId),
        eq(permissions.key, permissionKey),
      ),
    );
  await createNotification(
    recipients.map((row) => row.userId),
    {
      type: "project",
      title: payload.title,
      message: payload.message,
      link: payload.link,
      metadata: payload.metadata,
    },
  );
}

async function notifyProjectOwners(
  projectId: number,
  payload: {
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const ownerRows = await db
    .select({
      ownerId: projectInitiatives.ownerId,
      createdById: projectInitiatives.createdById,
    })
    .from(projectInitiatives)
    .where(eq(projectInitiatives.id, projectId))
    .limit(1);
  const members = await db
    .select({ memberId: projectMembers.employeeId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  const recipientIds = new Set<number>();
  if (ownerRows.length) {
    const owner = ownerRows[0].ownerId || ownerRows[0].createdById;
    if (owner) recipientIds.add(owner);
  }
  members.forEach((row) => recipientIds.add(row.memberId));
  await createNotification([...recipientIds], {
    type: "project",
    title: payload.title,
    message: payload.message,
    link: payload.link,
    metadata: payload.metadata,
  });
}

export function registerProjectRoutes(router: Router) {
  router.use(requireAuth);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const { status, category } = req.query;
      const baseRows = await db
        .select({
          id: projectInitiatives.id,
          title: projectInitiatives.title,
          description: projectInitiatives.description,
          category: projectInitiatives.category,
          status: projectInitiatives.status,
          ownerId: projectInitiatives.ownerId,
          createdById: projectInitiatives.createdById,
          dueDate: projectInitiatives.dueDate,
          priority: projectInitiatives.priority,
          deletedAt: projectInitiatives.deletedAt,
          createdAt: projectInitiatives.createdAt,
          updatedAt: projectInitiatives.updatedAt,
          ownerName: employees.name,
          ownerLastName: employees.lastName,
        })
        .from(projectInitiatives)
        .leftJoin(employees, eq(projectInitiatives.ownerId, employees.id))
        .where(isNull(projectInitiatives.deletedAt))
        .orderBy(desc(projectInitiatives.createdAt));

      let rows = baseRows;

      if (!canManage(req)) {
        const memberRows = await db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(eq(projectMembers.employeeId, req.user.employeeId));
        const memberIds = new Set(memberRows.map((row) => row.projectId));
        rows = rows.filter((project) => {
          const normalized = normalizeProjectStatus(project.status);
          if (normalized === "done") return true;
          const ownerId = project.ownerId || project.createdById;
          return ownerId === req.user?.employeeId || memberIds.has(project.id);
        });
      }

      if (status) {
        const statusValue = String(status);
        rows = rows.filter(
          (project) =>
            normalizeProjectStatus(project.status) ===
            normalizeProjectStatus(statusValue),
        );
      }
      if (category) {
        rows = rows.filter((project) => project.category === category);
      }

      return ok(res, rows);
    }),
  );

  router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const projectId = Number(req.params.id);
      const [project] = await db
        .select({
          id: projectInitiatives.id,
          title: projectInitiatives.title,
          description: projectInitiatives.description,
          category: projectInitiatives.category,
          status: projectInitiatives.status,
          ownerId: projectInitiatives.ownerId,
          createdById: projectInitiatives.createdById,
          dueDate: projectInitiatives.dueDate,
          priority: projectInitiatives.priority,
          deletedAt: projectInitiatives.deletedAt,
          createdAt: projectInitiatives.createdAt,
          updatedAt: projectInitiatives.updatedAt,
          ownerName: employees.name,
          ownerLastName: employees.lastName,
        })
        .from(projectInitiatives)
        .leftJoin(employees, eq(projectInitiatives.ownerId, employees.id))
        .where(eq(projectInitiatives.id, projectId));

      if (!project || project.deletedAt) {
        return notFound(res, "Aufgabe");
      }

      const member = await isMember(projectId, req.user.employeeId);
      const ownerId = project.ownerId || project.createdById;
      const normalized = normalizeProjectStatus(project.status);
      const allowed =
        canManage(req) ||
        ownerId === req.user.employeeId ||
        member ||
        normalized === "done";

      if (!allowed) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }

      const members = await db
        .select({
          employeeId: projectMembers.employeeId,
          role: projectMembers.role,
          name: employees.name,
          lastName: employees.lastName,
        })
        .from(projectMembers)
        .leftJoin(employees, eq(projectMembers.employeeId, employees.id))
        .where(eq(projectMembers.projectId, projectId));

      return ok(res, {
        ...project,
        owner: ownerId
          ? {
              id: ownerId,
              name: project.ownerName,
              lastName: project.ownerLastName,
            }
          : null,
        members,
      });
    }),
  );

  router.post(
    "/",
    validateBody(createProjectSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const {
        title,
        description,
        category,
        status,
        ownerId,
        dueDate,
        priority,
        assignees,
      } = req.body;

      const normalizedCategory: ProjectCategory =
        normalizeProjectCategory(category) ?? "Administrativ";

      let finalStatus = status || "proposed";
      if (!canManage(req) && finalStatus !== "proposed") {
        finalStatus = "proposed";
      }

      const [project] = await db
        .insert(projectInitiatives)
        .values({
          title,
          description: description || null,
          category: normalizedCategory,
          status: finalStatus,
          ownerId: ownerId || req.user.employeeId,
          createdById: req.user.employeeId,
          dueDate: dueDate || null,
          priority: priority ?? 0,
        })
        .returning();

      const members = new Map<number, "read" | "edit">();
      members.set(req.user.employeeId, "edit");
      (assignees || []).forEach(
        (member: { employeeId: number; role: "read" | "edit" }) => {
          members.set(member.employeeId, member.role || "read");
        },
      );

      if (members.size) {
        await db.insert(projectMembers).values(
          Array.from(members.entries()).map(([employeeId, role]) => ({
            projectId: project.id,
            employeeId,
            role,
          })),
        );
      }

      if (finalStatus === "proposed") {
        await notifyPermissionGroup(req.user.departmentId, PROJECT_MANAGE_CAP, {
          title: "Neue Aufgabe vorgeschlagen",
          message: `${req.user.name} ${req.user.lastName} hat \"${title}\" vorgeschlagen.`,
          link: `/admin/projects?project=${project.id}`,
          metadata: { projectId: project.id },
        });
      }

      return created(res, project);
    }),
  );

  router.patch(
    "/:id",
    validateParams(idParamSchema),
    validateBody(updateProjectSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const projectId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(projectInitiatives)
        .where(eq(projectInitiatives.id, projectId));
      if (!existing || existing.deletedAt) {
        return notFound(res, "Aufgabe");
      }
      const memberRole = await getMemberRole(projectId, req.user.employeeId);
      const ownerId = existing.ownerId || existing.createdById;
      if (
        !canManage(req) &&
        ownerId !== req.user.employeeId &&
        memberRole !== "edit"
      ) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }

      const updates = {
        ...req.body,
        updatedAt: new Date(),
      } as typeof req.body & { updatedAt: Date };
      if (updates.category) {
        const normalized = normalizeProjectCategory(updates.category);
        if (normalized) {
          (updates as { category?: ProjectCategory }).category = normalized;
        }
      }

      const [updated] = await db
        .update(projectInitiatives)
        .set(updates)
        .where(eq(projectInitiatives.id, projectId))
        .returning();

      return ok(res, updated);
    }),
  );

  router.post(
    "/:id/assign",
    validateParams(idParamSchema),
    validateBody(assignMembersSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      if (!canManage(req)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const projectId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(projectInitiatives)
        .where(eq(projectInitiatives.id, projectId));
      if (!existing || existing.deletedAt) {
        return notFound(res, "Aufgabe");
      }
      await db
        .delete(projectMembers)
        .where(eq(projectMembers.projectId, projectId));
      if (req.body.members.length) {
        await db.insert(projectMembers).values(
          req.body.members.map((member: AssignProjectMemberInput) => ({
            projectId,
            employeeId: member.employeeId,
            role: member.role,
          })),
        );
      }
      return ok(res, { success: true });
    }),
  );

  router.post(
    "/:id/accept",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const projectId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(projectInitiatives)
        .where(eq(projectInitiatives.id, projectId));
      if (!existing || existing.deletedAt) return notFound(res, "Aufgabe");
      const [updated] = await db
        .update(projectInitiatives)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(projectInitiatives.id, projectId))
        .returning();
      await notifyProjectOwners(projectId, {
        title: "Aufgabe angenommen",
        message: `\"${existing.title}\" wurde zur Bearbeitung angenommen.`,
        link: `/admin/projects?project=${projectId}`,
      });
      return ok(res, updated);
    }),
  );

  router.post(
    "/:id/reject",
    validateParams(idParamSchema),
    validateBody(statusReasonSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const projectId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(projectInitiatives)
        .where(eq(projectInitiatives.id, projectId));
      if (!existing || existing.deletedAt) return notFound(res, "Aufgabe");

      const [updated] = await db
        .update(projectInitiatives)
        .set({
          deletedAt: new Date(),
          deletedById: req.user.employeeId,
          updatedAt: new Date(),
        })
        .where(eq(projectInitiatives.id, projectId))
        .returning();

      await notifyProjectOwners(projectId, {
        title: "Aufgabe abgelehnt",
        message: `\"${existing.title}\" wurde abgelehnt: ${req.body.reason}`,
        link: `/admin/projects`,
      });

      return ok(res, updated);
    }),
  );

  router.post(
    "/:id/complete",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const projectId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(projectInitiatives)
        .where(eq(projectInitiatives.id, projectId));
      if (!existing || existing.deletedAt) return notFound(res, "Aufgabe");
      const [updated] = await db
        .update(projectInitiatives)
        .set({ status: "done", updatedAt: new Date() })
        .where(eq(projectInitiatives.id, projectId))
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
      if (!canDelete(req)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const projectId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(projectInitiatives)
        .where(eq(projectInitiatives.id, projectId));
      if (!existing || existing.deletedAt) return notFound(res, "Aufgabe");

      const [updated] = await db
        .update(projectInitiatives)
        .set({
          deletedAt: new Date(),
          deletedById: req.user.employeeId,
          updatedAt: new Date(),
        })
        .where(eq(projectInitiatives.id, projectId))
        .returning();

      return ok(res, updated);
    }),
  );
}
