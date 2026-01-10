import type { Router } from "express";
import { z } from "zod";
import { db, and, eq, inArray, desc, sql } from "../lib/db";
import {
  messageThreads,
  messageThreadMembers,
  messageMessages,
  employees,
  notifications,
} from "@shared/schema";
import { ok, created, notFound, asyncHandler } from "../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../lib/validate";
import { requireAuth, hasCapability } from "./middleware/auth";

const GROUP_MANAGE_CAP = "perm.message_group_manage";

const createThreadSchema = z.object({
  type: z.enum(["direct", "group"]).default("direct"),
  title: z.string().min(1).optional(),
  memberIds: z
    .array(z.number().positive())
    .min(1, "Mindestens ein Empfaenger erforderlich"),
});

const renameThreadSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
});

const updateMembersSchema = z.object({
  add: z.array(z.number().positive()).optional(),
  remove: z.array(z.number().positive()).optional(),
});

const createMessageSchema = z.object({
  content: z.string().min(1, "Nachricht erforderlich"),
});

async function isThreadMember(threadId: number, employeeId: number) {
  const [member] = await db
    .select({ threadId: messageThreadMembers.threadId })
    .from(messageThreadMembers)
    .where(
      and(
        eq(messageThreadMembers.threadId, threadId),
        eq(messageThreadMembers.employeeId, employeeId),
      ),
    )
    .limit(1);
  return Boolean(member);
}

async function isThreadOwner(threadId: number, employeeId: number) {
  const [member] = await db
    .select({ role: messageThreadMembers.role })
    .from(messageThreadMembers)
    .where(
      and(
        eq(messageThreadMembers.threadId, threadId),
        eq(messageThreadMembers.employeeId, employeeId),
      ),
    )
    .limit(1);
  return member?.role === "owner";
}

async function createMessageNotifications(
  threadId: number,
  senderId: number,
  content: string,
) {
  const members = await db
    .select({ employeeId: messageThreadMembers.employeeId })
    .from(messageThreadMembers)
    .where(eq(messageThreadMembers.threadId, threadId));
  const recipients = members
    .map((row) => row.employeeId)
    .filter((id) => id !== senderId);
  if (!recipients.length) return;
  const rows = recipients.map((recipientId) => ({
    recipientId,
    type: "message" as const,
    title: "Neue Nachricht",
    message: content,
    link: `/nachrichten?thread=${threadId}`,
  }));
  await db.insert(notifications).values(rows);
}

export function registerMessageRoutes(router: Router) {
  router.use(requireAuth);

  router.get(
    "/threads",
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const baseThreads = await db
        .select({
          id: messageThreads.id,
          type: messageThreads.type,
          title: messageThreads.title,
          createdById: messageThreads.createdById,
          createdAt: messageThreads.createdAt,
        })
        .from(messageThreads)
        .innerJoin(
          messageThreadMembers,
          eq(messageThreadMembers.threadId, messageThreads.id),
        )
        .where(eq(messageThreadMembers.employeeId, req.user.employeeId))
        .orderBy(desc(messageThreads.createdAt));

      const threadIds = baseThreads.map((thread) => thread.id);
      const members = threadIds.length
        ? await db
            .select({
              threadId: messageThreadMembers.threadId,
              employeeId: messageThreadMembers.employeeId,
              role: messageThreadMembers.role,
              name: employees.name,
              lastName: employees.lastName,
            })
            .from(messageThreadMembers)
            .leftJoin(
              employees,
              eq(messageThreadMembers.employeeId, employees.id),
            )
            .where(inArray(messageThreadMembers.threadId, threadIds))
        : [];
      const messages = threadIds.length
        ? await db
            .select({
              id: messageMessages.id,
              threadId: messageMessages.threadId,
              content: messageMessages.content,
              createdAt: messageMessages.createdAt,
              senderId: messageMessages.senderId,
            })
            .from(messageMessages)
            .where(inArray(messageMessages.threadId, threadIds))
            .orderBy(desc(messageMessages.createdAt))
        : [];

      const membersByThread = new Map<number, typeof members>();
      members.forEach((member) => {
        const list = membersByThread.get(member.threadId) || [];
        list.push(member);
        membersByThread.set(member.threadId, list);
      });

      const lastMessageByThread = new Map<number, (typeof messages)[number]>();
      messages.forEach((message) => {
        if (!lastMessageByThread.has(message.threadId)) {
          lastMessageByThread.set(message.threadId, message);
        }
      });

      const response = baseThreads.map((thread) => ({
        ...thread,
        members: membersByThread.get(thread.id) || [],
        lastMessage: lastMessageByThread.get(thread.id) || null,
      }));

      return ok(res, response);
    }),
  );

  router.post(
    "/threads",
    validateBody(createThreadSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const { type, title, memberIds } = req.body;
      if (type === "group" && !title) {
        return res
          .status(400)
          .json({ success: false, error: "Gruppenname erforderlich" });
      }
      const uniqueMembers = Array.from(
        new Set(memberIds.filter((id) => id !== req.user?.employeeId)),
      );
      if (!uniqueMembers.length) {
        return res.status(400).json({
          success: false,
          error: "Mindestens ein Empfaenger erforderlich",
        });
      }

      if (type === "direct" && uniqueMembers.length === 1) {
        const counterpartId = uniqueMembers[0];
        const [existingThread] = await db
          .select({
            id: messageThreads.id,
            type: messageThreads.type,
            title: messageThreads.title,
            createdById: messageThreads.createdById,
            createdAt: messageThreads.createdAt,
          })
          .from(messageThreads)
          .innerJoin(
            messageThreadMembers,
            eq(messageThreadMembers.threadId, messageThreads.id),
          )
          .where(eq(messageThreads.type, "direct"))
          .groupBy(
            messageThreads.id,
            messageThreads.type,
            messageThreads.title,
            messageThreads.createdById,
            messageThreads.createdAt,
          )
          .having(
            sql`
            count(*) = 2
            and sum(case when ${messageThreadMembers.employeeId} = ${req.user.employeeId} then 1 else 0 end) = 1
            and sum(case when ${messageThreadMembers.employeeId} = ${counterpartId} then 1 else 0 end) = 1
          `,
          )
          .limit(1);

        if (existingThread) {
          return ok(res, existingThread);
        }
      }

      const [thread] = await db
        .insert(messageThreads)
        .values({
          type,
          title: type === "group" ? title : null,
          createdById: req.user.employeeId,
        })
        .returning();

      const members = [
        {
          threadId: thread.id,
          employeeId: req.user.employeeId,
          role: "owner" as const,
        },
        ...uniqueMembers.map((employeeId) => ({
          threadId: thread.id,
          employeeId,
          role: "member" as const,
        })),
      ];
      await db.insert(messageThreadMembers).values(members);

      return created(res, thread);
    }),
  );

  router.get(
    "/threads/:id/messages",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const threadId = Number(req.params.id);
      const member = await isThreadMember(threadId, req.user.employeeId);
      if (!member) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const messages = await db
        .select({
          id: messageMessages.id,
          threadId: messageMessages.threadId,
          content: messageMessages.content,
          createdAt: messageMessages.createdAt,
          senderId: messageMessages.senderId,
          senderName: employees.name,
          senderLastName: employees.lastName,
        })
        .from(messageMessages)
        .leftJoin(employees, eq(messageMessages.senderId, employees.id))
        .where(eq(messageMessages.threadId, threadId))
        .orderBy(desc(messageMessages.createdAt));

      return ok(res, messages);
    }),
  );

  router.post(
    "/threads/:id/messages",
    validateParams(idParamSchema),
    validateBody(createMessageSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const threadId = Number(req.params.id);
      const member = await isThreadMember(threadId, req.user.employeeId);
      if (!member) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const [message] = await db
        .insert(messageMessages)
        .values({
          threadId,
          senderId: req.user.employeeId,
          content: req.body.content,
        })
        .returning();

      await createMessageNotifications(
        threadId,
        req.user.employeeId,
        req.body.content,
      );
      return created(res, message);
    }),
  );

  router.patch(
    "/threads/:id",
    validateParams(idParamSchema),
    validateBody(renameThreadSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const threadId = Number(req.params.id);
      const member = await isThreadMember(threadId, req.user.employeeId);
      if (!member) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const isOwner = await isThreadOwner(threadId, req.user.employeeId);
      if (!isOwner && !hasCapability(req, GROUP_MANAGE_CAP)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const [updated] = await db
        .update(messageThreads)
        .set({ title: req.body.title })
        .where(eq(messageThreads.id, threadId))
        .returning();
      if (!updated) return notFound(res, "Thread");
      return ok(res, updated);
    }),
  );

  router.post(
    "/threads/:id/members",
    validateParams(idParamSchema),
    validateBody(updateMembersSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const threadId = Number(req.params.id);
      const member = await isThreadMember(threadId, req.user.employeeId);
      if (!member) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const isOwner = await isThreadOwner(threadId, req.user.employeeId);
      if (!isOwner && !hasCapability(req, GROUP_MANAGE_CAP)) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }
      const addIds = req.body.add || [];
      if (addIds.length) {
        await db
          .insert(messageThreadMembers)
          .values(
            addIds.map((employeeId) => ({
              threadId,
              employeeId,
              role: "member" as const,
            })),
          )
          .onConflictDoNothing();
      }
      const removeIds = (req.body.remove || []).filter(
        (id) => id !== req.user?.employeeId,
      );
      if (removeIds.length) {
        await db
          .delete(messageThreadMembers)
          .where(
            and(
              eq(messageThreadMembers.threadId, threadId),
              inArray(messageThreadMembers.employeeId, removeIds),
            ),
          );
      }
      return ok(res, { success: true });
    }),
  );
}
