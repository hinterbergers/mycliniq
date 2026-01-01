import type { Router } from "express";
import htmlToDocx from "html-to-docx";
import { marked } from "marked";
import { z } from "zod";
import {
  db,
  and,
  eq,
  inArray,
  or,
  desc,
  isNotNull,
  isNull,
  sql
} from "../../lib/db";
import {
  ok,
  created,
  notFound,
  validationError,
  asyncHandler
} from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import {
  sops,
  sopMembers,
  sopVersions,
  sopReferences,
  employees,
  permissions,
  userPermissions,
  notifications
} from "@shared/schema";
import { requireAuth, hasCapability } from "../middleware/auth";

const SOP_MANAGE_CAP = "perm.sop_manage";
const SOP_PUBLISH_CAP = "perm.sop_publish";

const createSopSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  category: z.enum(["SOP", "Checkliste", "Formular", "Leitlinie"]).default("SOP"),
  contentMarkdown: z.string().nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  awmfLink: z.string().url().nullable().optional(),
  status: z.enum(["proposed", "in_progress", "review", "published"]).optional(),
  assignees: z
    .array(
      z.object({
        employeeId: z.number().positive(),
        role: z.enum(["read", "edit"]).default("read")
      })
    )
    .optional()
});

const updateSopSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.enum(["SOP", "Checkliste", "Formular", "Leitlinie"]).optional(),
  contentMarkdown: z.string().nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  awmfLink: z.string().url().nullable().optional()
});

const assignMembersSchema = z.object({
  members: z.array(
    z.object({
      employeeId: z.number().positive(),
      role: z.enum(["read", "edit"]).default("read")
    })
  )
});

const statusReasonSchema = z.object({
  reason: z.string().min(1, "Begruendung erforderlich")
});

const publishSchema = z.object({
  changeNote: z.string().min(1, "Aenderungsnotiz erforderlich")
});

const referenceSchema = z.object({
  type: z.enum(["awmf", "guideline", "study", "other"]),
  title: z.string().min(1, "Titel erforderlich"),
  url: z.string().url().optional().nullable(),
  publisher: z.string().optional().nullable(),
  yearOrVersion: z.string().optional().nullable(),
  relevanceNote: z.string().optional().nullable(),
  createdByAi: z.boolean().optional()
});

function canManage(req: Parameters<typeof hasCapability>[0]): boolean {
  return hasCapability(req, SOP_MANAGE_CAP) || hasCapability(req, SOP_PUBLISH_CAP);
}

function canPublish(req: Parameters<typeof hasCapability>[0]): boolean {
  return hasCapability(req, SOP_PUBLISH_CAP);
}

function normalizeSopStatus(status: string | null | undefined): string {
  if (!status) return "proposed";
  const lower = status.toLowerCase();
  if (["entwurf", "draft", "proposed"].includes(lower)) return "proposed";
  if (["in review", "review"].includes(lower)) return "review";
  if (["freigegeben", "published"].includes(lower)) return "published";
  if (["in_progress"].includes(lower)) return "in_progress";
  return status;
}

function isPublicSop(record: typeof sops.$inferSelect): boolean {
  const status = normalizeSopStatus(record.status);
  if (status === "published") return true;
  if (["in_progress", "review"].includes(status) && record.currentVersionId) return true;
  return false;
}

const toSafeFilename = (value: string) => {
  const ascii = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 60) || "sop";
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function isMember(sopId: number, employeeId: number): Promise<boolean> {
  const [member] = await db
    .select({ sopId: sopMembers.sopId })
    .from(sopMembers)
    .where(and(eq(sopMembers.sopId, sopId), eq(sopMembers.employeeId, employeeId)))
    .limit(1);
  return Boolean(member);
}

async function getMemberRole(
  sopId: number,
  employeeId: number
): Promise<"read" | "edit" | null> {
  const [member] = await db
    .select({ role: sopMembers.role })
    .from(sopMembers)
    .where(and(eq(sopMembers.sopId, sopId), eq(sopMembers.employeeId, employeeId)))
    .limit(1);
  return member?.role ?? null;
}

async function createNotification(
  employeeIds: number[],
  payload: { type?: "system" | "sop" | "project" | "message"; title: string; message: string; link?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  if (!employeeIds.length) return;
  const rows = employeeIds.map((recipientId) => ({
    recipientId,
    type: payload.type || "system",
    title: payload.title,
    message: payload.message,
    link: payload.link || null,
    metadata: payload.metadata || null
  }));
  await db.insert(notifications).values(rows);
}

async function notifyPermissionGroup(
  departmentId: number | undefined,
  permissionKey: string,
  payload: { title: string; message: string; link?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  if (!departmentId) return;
  const recipients = await db
    .select({ userId: userPermissions.userId })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(and(eq(userPermissions.departmentId, departmentId), eq(permissions.key, permissionKey)));
  await createNotification(recipients.map((row) => row.userId), {
    type: "sop",
    title: payload.title,
    message: payload.message,
    link: payload.link,
    metadata: payload.metadata
  });
}

async function notifySopOwners(
  sopId: number,
  payload: { title: string; message: string; link?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const owner = await db
    .select({ ownerId: sops.createdById })
    .from(sops)
    .where(eq(sops.id, sopId))
    .limit(1);
  const members = await db
    .select({ memberId: sopMembers.employeeId })
    .from(sopMembers)
    .where(eq(sopMembers.sopId, sopId));
  const recipientIds = new Set<number>();
  if (owner.length) recipientIds.add(owner[0].ownerId);
  members.forEach((row) => recipientIds.add(row.memberId));
  await createNotification([...recipientIds], {
    type: "sop",
    title: payload.title,
    message: payload.message,
    link: payload.link,
    metadata: payload.metadata
  });
}

async function createVersion(sopId: number, releasedById: number, changeNote: string) {
  const [sop] = await db.select().from(sops).where(eq(sops.id, sopId));
  if (!sop) throw new Error("SOP nicht gefunden");
  const [{ maxVersion } = { maxVersion: 0 }] = await db
    .select({ maxVersion: sql<number>`coalesce(max(${sopVersions.versionNumber}), 0)` })
    .from(sopVersions)
    .where(eq(sopVersions.sopId, sopId));
  const nextVersion = (maxVersion || 0) + 1;
  const [version] = await db
    .insert(sopVersions)
    .values({
      sopId,
      versionNumber: nextVersion,
      title: sop.title,
      contentMarkdown: sop.contentMarkdown || "",
      changeNote,
      releasedById
    })
    .returning();
  await db
    .update(sops)
    .set({
      currentVersionId: version.id,
      version: String(nextVersion),
      publishedAt: new Date(),
      approvedById: releasedById
    })
    .where(eq(sops.id, sopId));
  return version;
}

export function registerSopRoutes(router: Router) {
  router.use(requireAuth);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const { category, status, search } = req.query;
      const baseQuery = db
        .select({
          id: sops.id,
          title: sops.title,
          category: sops.category,
          version: sops.version,
          status: sops.status,
          contentMarkdown: sops.contentMarkdown,
          keywords: sops.keywords,
          awmfLink: sops.awmfLink,
          currentVersionId: sops.currentVersionId,
          basedOnVersionId: sops.basedOnVersionId,
          createdById: sops.createdById,
          approvedById: sops.approvedById,
          publishedAt: sops.publishedAt,
          archivedAt: sops.archivedAt,
          createdAt: sops.createdAt,
          updatedAt: sops.updatedAt,
          creatorName: employees.name,
          creatorLastName: employees.lastName
        })
        .from(sops)
        .leftJoin(employees, eq(sops.createdById, employees.id));

      let sopsResult: typeof sops.$inferSelect[] = [] as any;
      let memberSopIds = new Set<number>();

      if (canManage(req)) {
        sopsResult = (await baseQuery) as any;
      } else {
        const publicSops = await baseQuery
          .where(
            and(
              isNull(sops.archivedAt),
              or(
                eq(sops.status, "published"),
                and(isNotNull(sops.currentVersionId), inArray(sops.status, ["in_progress", "review"]))
              )
            )
          )
          .then((rows) => rows as any);
        const memberSops = await baseQuery
          .leftJoin(sopMembers, eq(sopMembers.sopId, sops.id))
          .where(
            or(
              eq(sops.createdById, req.user.employeeId),
              eq(sopMembers.employeeId, req.user.employeeId)
            )
          )
          .then((rows) => rows as any);

        memberSopIds = new Set(memberSops.map((row: any) => row.id));
        const merged = new Map<number, any>();
        publicSops.forEach((row: any) => merged.set(row.id, row));
        memberSops.forEach((row: any) => merged.set(row.id, row));
        sopsResult = [...merged.values()];
      }

      let filtered = sopsResult;
      if (category) {
        filtered = filtered.filter((sop) => sop.category === category);
      }
      if (status) {
        const statusValue = normalizeSopStatus(String(status));
        if (statusValue === "published") {
          filtered = filtered.filter((sop) => isPublicSop(sop as typeof sops.$inferSelect));
        } else {
          filtered = filtered.filter((sop) => normalizeSopStatus(sop.status) === statusValue);
        }
      }
      if (search) {
        const term = String(search).toLowerCase();
        filtered = filtered.filter(
          (sop) =>
            sop.title.toLowerCase().includes(term) ||
            (sop.keywords && sop.keywords.some((k: string) => k.toLowerCase().includes(term)))
        );
      }

      if (!canManage(req)) {
        const versionIds = filtered
          .filter((sop) => {
            const normalized = normalizeSopStatus(sop.status);
            return (
              !memberSopIds.has(sop.id) &&
              Boolean(sop.currentVersionId) &&
              ["in_progress", "review"].includes(normalized)
            );
          })
          .map((sop) => sop.currentVersionId as number);
        if (versionIds.length) {
          const versions = await db
            .select()
            .from(sopVersions)
            .where(inArray(sopVersions.id, versionIds));
          const versionById = new Map(versions.map((version) => [version.id, version]));
          filtered = filtered.map((sop) => {
            if (!sop.currentVersionId || memberSopIds.has(sop.id)) return sop;
            const normalized = normalizeSopStatus(sop.status);
            if (!["in_progress", "review"].includes(normalized)) return sop;
            const version = versionById.get(sop.currentVersionId);
            if (!version) return sop;
            return {
              ...sop,
              title: version.title,
              version: String(version.versionNumber),
              contentMarkdown: version.contentMarkdown,
              publishedAt: version.releasedAt
            };
          });
        }
      }

      return ok(res, filtered);
    })
  );

  router.get(
    "/:id/export/docx",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [sop] = await db
        .select({
          id: sops.id,
          title: sops.title,
          status: sops.status,
          contentMarkdown: sops.contentMarkdown,
          currentVersionId: sops.currentVersionId,
          createdById: sops.createdById
        })
        .from(sops)
        .where(eq(sops.id, sopId));

      if (!sop) {
        return notFound(res, "SOP");
      }

      const memberRole = await getMemberRole(sopId, req.user.employeeId);
      const owner = sop.createdById === req.user.employeeId;
      const allowed = canManage(req) || owner || Boolean(memberRole) || isPublicSop(sop as any);
      if (!allowed) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }

      let exportTitle = sop.title;
      let contentMarkdown = sop.contentMarkdown || "";
      if (!canManage(req) && !owner && !memberRole) {
        const normalized = normalizeSopStatus(sop.status);
        if (["in_progress", "review"].includes(normalized) && sop.currentVersionId) {
          const [version] = await db
            .select({
              title: sopVersions.title,
              contentMarkdown: sopVersions.contentMarkdown
            })
            .from(sopVersions)
            .where(eq(sopVersions.id, sop.currentVersionId));
          if (version) {
            exportTitle = version.title;
            contentMarkdown = version.contentMarkdown || "";
          }
        }
      }

      const htmlBody = await marked.parse(contentMarkdown || "");
      const html = `<h1>${escapeHtml(exportTitle)}</h1>${htmlBody}`;
      const buffer = await htmlToDocx(html);
      const filename = `${toSafeFilename(exportTitle)}.docx`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.status(200).send(buffer);
    })
  );

  router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [sop] = await db
        .select({
          id: sops.id,
          title: sops.title,
          category: sops.category,
          version: sops.version,
          status: sops.status,
          contentMarkdown: sops.contentMarkdown,
          keywords: sops.keywords,
          awmfLink: sops.awmfLink,
          currentVersionId: sops.currentVersionId,
          basedOnVersionId: sops.basedOnVersionId,
          createdById: sops.createdById,
          approvedById: sops.approvedById,
          publishedAt: sops.publishedAt,
          archivedAt: sops.archivedAt,
          createdAt: sops.createdAt,
          updatedAt: sops.updatedAt,
          creatorName: employees.name,
          creatorLastName: employees.lastName
        })
        .from(sops)
        .leftJoin(employees, eq(sops.createdById, employees.id))
        .where(eq(sops.id, sopId));

      if (!sop) {
        return notFound(res, "SOP");
      }

      const memberRole = await getMemberRole(sopId, req.user.employeeId);
      const member = Boolean(memberRole);
      const owner = sop.createdById === req.user.employeeId;
      const allowed = canManage(req) || owner || member || isPublicSop(sop as any);
      if (!allowed) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }

      let resolvedSop = sop;
      if (!canManage(req) && !owner && !member) {
        const normalized = normalizeSopStatus(sop.status);
        if (["in_progress", "review"].includes(normalized) && sop.currentVersionId) {
          const [version] = await db
            .select()
            .from(sopVersions)
            .where(eq(sopVersions.id, sop.currentVersionId));
          if (version) {
            resolvedSop = {
              ...sop,
              title: version.title,
              version: String(version.versionNumber),
              contentMarkdown: version.contentMarkdown,
              publishedAt: version.releasedAt
            };
          }
        }
      }

      const members = await db
        .select({
          employeeId: sopMembers.employeeId,
          role: sopMembers.role,
          name: employees.name,
          lastName: employees.lastName
        })
        .from(sopMembers)
        .leftJoin(employees, eq(sopMembers.employeeId, employees.id))
        .where(eq(sopMembers.sopId, sopId));

      let references = await db
        .select()
        .from(sopReferences)
        .where(eq(sopReferences.sopId, sopId))
        .orderBy(desc(sopReferences.createdAt));

      if (!canManage(req) && !owner && !member) {
        references = references.filter((ref) => ref.status === "accepted");
      }

      const versions = await db
        .select({
          id: sopVersions.id,
          sopId: sopVersions.sopId,
          versionNumber: sopVersions.versionNumber,
          title: sopVersions.title,
          contentMarkdown: sopVersions.contentMarkdown,
          changeNote: sopVersions.changeNote,
          releasedById: sopVersions.releasedById,
          releasedAt: sopVersions.releasedAt,
          createdAt: sopVersions.createdAt,
          updatedAt: sopVersions.updatedAt,
          releasedByName: employees.name,
          releasedByLastName: employees.lastName
        })
        .from(sopVersions)
        .leftJoin(employees, eq(sopVersions.releasedById, employees.id))
        .where(eq(sopVersions.sopId, sopId))
        .orderBy(desc(sopVersions.versionNumber));

      return ok(res, {
        ...resolvedSop,
        createdBy: {
          id: sop.createdById,
          name: sop.creatorName,
          lastName: sop.creatorLastName
        },
        members,
        references,
        versions
      });
    })
  );

  router.post(
    "/",
    validateBody(createSopSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const { title, category, contentMarkdown, keywords, awmfLink, status, assignees } = req.body;
      const requestedStatus = status || "proposed";
      const allowManage = canManage(req);
      const allowPublish = canPublish(req);
      let finalStatus = requestedStatus;
      if (!allowManage) {
        finalStatus = "proposed";
      } else if (requestedStatus === "published" && !allowPublish) {
        finalStatus = "in_progress";
      }

      const [sop] = await db
        .insert(sops)
        .values({
          title,
          category: category || "SOP",
          contentMarkdown: contentMarkdown || null,
          keywords: keywords || null,
          awmfLink: awmfLink || null,
          status: finalStatus,
          createdById: req.user.employeeId
        })
        .returning();

      if (assignees?.length) {
        const rows = assignees.map((member: { employeeId: number; role: "read" | "edit" }) => ({
          sopId: sop.id,
          employeeId: member.employeeId,
          role: member.role
        }));
        await db.insert(sopMembers).values(rows).onConflictDoNothing();
      }

      if (finalStatus === "published") {
        await createVersion(sop.id, req.user.employeeId, "Initiale Freigabe");
      }

      if (finalStatus === "proposed") {
        await notifyPermissionGroup(req.user.departmentId, SOP_MANAGE_CAP, {
          title: "Neue SOP vorgeschlagen",
          message: `${req.user.name} ${req.user.lastName} hat "${title}" vorgeschlagen.`,
          link: `/admin/projects?sop=${sop.id}`,
          metadata: { sopId: sop.id }
        });
        await notifyPermissionGroup(req.user.departmentId, SOP_PUBLISH_CAP, {
          title: "Neue SOP vorgeschlagen",
          message: `${req.user.name} ${req.user.lastName} hat "${title}" vorgeschlagen.`,
          link: `/admin/projects?sop=${sop.id}`,
          metadata: { sopId: sop.id }
        });
      }

      return created(res, sop);
    })
  );

  router.patch(
    "/:id",
    validateParams(idParamSchema),
    validateBody(updateSopSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) {
        return notFound(res, "SOP");
      }
      const memberRole = await getMemberRole(sopId, req.user.employeeId);
      const owner = existing.createdById === req.user.employeeId;
      if (!canManage(req) && !owner && memberRole !== "edit") {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }

      const [updated] = await db
        .update(sops)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(sops.id, sopId))
        .returning();

      return ok(res, updated);
    })
  );

  router.post(
    "/:id/assign",
    validateParams(idParamSchema),
    validateBody(assignMembersSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      if (!canManage(req)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) {
        return notFound(res, "SOP");
      }
      await db.delete(sopMembers).where(eq(sopMembers.sopId, sopId));
      if (req.body.members.length) {
        await db.insert(sopMembers).values(
          req.body.members.map((member) => ({
            sopId,
            employeeId: member.employeeId,
            role: member.role
          }))
        );
      }
      return ok(res, { success: true });
    })
  );

  router.post(
    "/:id/accept",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");
      const [updated] = await db
        .update(sops)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(sops.id, sopId))
        .returning();
      await notifySopOwners(sopId, {
        title: "SOP angenommen",
        message: `"${existing.title}" wurde zur Bearbeitung angenommen.`,
        link: `/admin/projects?sop=${sopId}`
      });
      return ok(res, updated);
    })
  );

  router.post(
    "/:id/reject",
    validateParams(idParamSchema),
    validateBody(statusReasonSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");
      const [updated] = await db
        .update(sops)
        .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(sops.id, sopId))
        .returning();
      await notifySopOwners(sopId, {
        title: "SOP abgelehnt",
        message: `"${existing.title}" wurde abgelehnt: ${req.body.reason}`,
        link: `/admin/projects?sop=${sopId}`
      });
      return ok(res, updated);
    })
  );

  router.post(
    "/:id/request-review",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");
      const [updated] = await db
        .update(sops)
        .set({ status: "review", updatedAt: new Date() })
        .where(eq(sops.id, sopId))
        .returning();
      await notifyPermissionGroup(req.user?.departmentId, SOP_MANAGE_CAP, {
        title: "SOP in Review",
        message: `"${existing.title}" ist bereit fuer die Freigabe.`,
        link: `/admin/projects?sop=${sopId}`
      });
      await notifyPermissionGroup(req.user?.departmentId, SOP_PUBLISH_CAP, {
        title: "SOP in Review",
        message: `"${existing.title}" ist bereit fuer die Freigabe.`,
        link: `/admin/projects?sop=${sopId}`
      });
      return ok(res, updated);
    })
  );

  router.post(
    "/:id/review/request-changes",
    validateParams(idParamSchema),
    validateBody(statusReasonSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");
      const [updated] = await db
        .update(sops)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(sops.id, sopId))
        .returning();
      await notifySopOwners(sopId, {
        title: "SOP Ueberarbeitung",
        message: `"${existing.title}" braucht Anpassungen: ${req.body.reason}`,
        link: `/admin/projects?sop=${sopId}`
      });
      return ok(res, updated);
    })
  );

  router.post(
    "/:id/review/publish",
    validateParams(idParamSchema),
    validateBody(publishSchema),
    asyncHandler(async (req, res) => {
      if (!canPublish(req)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");

      await createVersion(sopId, req.user.employeeId, req.body.changeNote);
      const [updated] = await db
        .update(sops)
        .set({ status: "published", updatedAt: new Date() })
        .where(eq(sops.id, sopId))
        .returning();

      await notifySopOwners(sopId, {
        title: "SOP freigegeben",
        message: `"${existing.title}" wurde freigegeben.`,
        link: `/wissen`
      });

      return ok(res, updated);
    })
  );

  router.post(
    "/:id/archive",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");
      const [updated] = await db
        .update(sops)
        .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(sops.id, sopId))
        .returning();
      return ok(res, updated);
    })
  );

  router.post(
    "/:id/start-revision",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!canManage(req)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");

      const [updated] = await db
        .update(sops)
        .set({
          status: "in_progress",
          basedOnVersionId: existing.currentVersionId || null,
          updatedAt: new Date()
        })
        .where(eq(sops.id, sopId))
        .returning();
      return ok(res, updated);
    })
  );

  router.get(
    "/:id/versions",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [sop] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!sop) return notFound(res, "SOP");
      const memberRole = await getMemberRole(sopId, req.user.employeeId);
      const owner = sop.createdById === req.user.employeeId;
      const allowed = canManage(req) || owner || Boolean(memberRole) || isPublicSop(sop as any);
      if (!allowed) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const versions = await db
        .select({
          id: sopVersions.id,
          sopId: sopVersions.sopId,
          versionNumber: sopVersions.versionNumber,
          title: sopVersions.title,
          contentMarkdown: sopVersions.contentMarkdown,
          changeNote: sopVersions.changeNote,
          releasedById: sopVersions.releasedById,
          releasedAt: sopVersions.releasedAt,
          createdAt: sopVersions.createdAt,
          updatedAt: sopVersions.updatedAt,
          releasedByName: employees.name,
          releasedByLastName: employees.lastName
        })
        .from(sopVersions)
        .leftJoin(employees, eq(sopVersions.releasedById, employees.id))
        .where(eq(sopVersions.sopId, sopId))
        .orderBy(desc(sopVersions.versionNumber));
      return ok(res, versions);
    })
  );

  router.get(
    "/:id/references",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [sop] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!sop) return notFound(res, "SOP");
      const memberRole = await getMemberRole(sopId, req.user.employeeId);
      const owner = sop.createdById === req.user.employeeId;
      const allowed = canManage(req) || owner || Boolean(memberRole) || isPublicSop(sop as any);
      if (!allowed) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }

      let refs = await db
        .select()
        .from(sopReferences)
        .where(eq(sopReferences.sopId, sopId))
        .orderBy(desc(sopReferences.createdAt));
      if (!canManage(req) && !owner && !memberRole) {
        refs = refs.filter((ref) => ref.status === "accepted");
      }
      return ok(res, refs);
    })
  );

  router.post(
    "/:id/references",
    validateParams(idParamSchema),
    validateBody(referenceSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");
      const memberRole = await getMemberRole(sopId, req.user.employeeId);
      const owner = existing.createdById === req.user.employeeId;
      if (!canManage(req) && !owner && memberRole !== "edit") {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }

      const [ref] = await db
        .insert(sopReferences)
        .values({
          sopId,
          type: req.body.type,
          status: "accepted",
          title: req.body.title,
          url: req.body.url || null,
          publisher: req.body.publisher || null,
          yearOrVersion: req.body.yearOrVersion || null,
          relevanceNote: req.body.relevanceNote || null,
          createdById: req.user.employeeId,
          createdByAi: Boolean(req.body.createdByAi),
          verifiedById: req.user.employeeId,
          verifiedAt: new Date()
        })
        .returning();
      return created(res, ref);
    })
  );

  router.post(
    "/:id/references/:refId/accept",
    validateParams(z.object({ id: z.string(), refId: z.string() })),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");
      const memberRole = await getMemberRole(sopId, req.user.employeeId);
      const owner = existing.createdById === req.user.employeeId;
      if (!canManage(req) && !owner && memberRole !== "edit") {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const refId = Number(req.params.refId);
      const [updated] = await db
        .update(sopReferences)
        .set({ status: "accepted", verifiedById: req.user.employeeId, verifiedAt: new Date() })
        .where(eq(sopReferences.id, refId))
        .returning();
      return ok(res, updated);
    })
  );

  router.post(
    "/:id/references/:refId/reject",
    validateParams(z.object({ id: z.string(), refId: z.string() })),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");
      const memberRole = await getMemberRole(sopId, req.user.employeeId);
      const owner = existing.createdById === req.user.employeeId;
      if (!canManage(req) && !owner && memberRole !== "edit") {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }
      const refId = Number(req.params.refId);
      const [updated] = await db
        .update(sopReferences)
        .set({ status: "rejected", verifiedAt: new Date() })
        .where(eq(sopReferences.id, refId))
        .returning();
      return ok(res, updated);
    })
  );

  router.post(
    "/:id/ai/suggest-references",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      const sopId = Number(req.params.id);
      const [existing] = await db.select().from(sops).where(eq(sops.id, sopId));
      if (!existing) return notFound(res, "SOP");
      const memberRole = await getMemberRole(sopId, req.user.employeeId);
      const owner = existing.createdById === req.user.employeeId;
      if (!canManage(req) && !owner && memberRole !== "edit") {
        return res.status(403).json({ success: false, error: "Keine Berechtigung" });
      }

      const suggestions = [
        {
          type: "awmf" as const,
          title: "AWMF-Leitlinie (nicht gefunden)",
          url: null,
          publisher: "AWMF",
          yearOrVersion: null,
          relevanceNote: "Quelle bitte manuell recherchieren und verifizieren.",
          createdByAi: true,
          status: "suggested" as const
        },
        {
          type: "guideline" as const,
          title: "Leitlinie nationale Fachgesellschaft (nicht gefunden)",
          url: null,
          publisher: null,
          yearOrVersion: null,
          relevanceNote: "Bitte OeGGG/DGGG/ESGE/RCOG/NICE pruefen.",
          createdByAi: true,
          status: "suggested" as const
        },
        {
          type: "study" as const,
          title: "Aktuelle Studie (nicht gefunden)",
          url: null,
          publisher: null,
          yearOrVersion: null,
          relevanceNote: "Bitte PubMed oder Leitlinien-Referenzen pruefen.",
          createdByAi: true,
          status: "suggested" as const
        }
      ];

      return ok(res, suggestions);
    })
  );
}
