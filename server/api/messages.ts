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

const forwardMessageSchema = z
  .object({
    mode: z.enum(["direct", "group", "system"]),
    recipientEmployeeId: z.number().positive().optional(),
    targetThreadId: z.number().positive().optional(),
    systemTitle: z.string().min(1).optional(),
    link: z.string().trim().optional(),
    comment: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "direct" && !value.recipientEmployeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipientEmployeeId"],
        message: "Empfaenger erforderlich",
      });
    }
    if (value.mode === "group" && !value.targetThreadId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetThreadId"],
        message: "Gruppenchat erforderlich",
      });
    }
    if (value.mode === "system" && !value.systemTitle?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["systemTitle"],
        message: "Titel erforderlich",
      });
    }
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
  if (member) return true;

  const recoveredMembers = await ensureDirectThreadMembershipIntegrity(threadId);
  return recoveredMembers.includes(employeeId);
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

async function getThreadById(threadId: number) {
  const [thread] = await db
    .select({
      id: messageThreads.id,
      type: messageThreads.type,
      title: messageThreads.title,
      createdById: messageThreads.createdById,
      createdAt: messageThreads.createdAt,
    })
    .from(messageThreads)
    .where(eq(messageThreads.id, threadId))
    .limit(1);
  return thread ?? null;
}

async function getMessageById(messageId: number) {
  const [message] = await db
    .select({
      id: messageMessages.id,
      threadId: messageMessages.threadId,
      senderId: messageMessages.senderId,
      content: messageMessages.content,
      createdAt: messageMessages.createdAt,
    })
    .from(messageMessages)
    .where(eq(messageMessages.id, messageId))
    .limit(1);
  return message ?? null;
}

async function findExistingDirectThread(
  employeeId: number,
  counterpartId: number,
) {
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
        and sum(case when ${messageThreadMembers.employeeId} = ${employeeId} then 1 else 0 end) = 1
        and sum(case when ${messageThreadMembers.employeeId} = ${counterpartId} then 1 else 0 end) = 1
      `,
    )
    .limit(1);

  return existingThread ?? null;
}

async function createDirectThreadIfMissing(
  employeeId: number,
  counterpartId: number,
) {
  const existingThread = await findExistingDirectThread(employeeId, counterpartId);
  if (existingThread) return existingThread;

  const [thread] = await db
    .insert(messageThreads)
    .values({
      type: "direct",
      title: null,
      createdById: employeeId,
    })
    .returning();

  await db.insert(messageThreadMembers).values([
    {
      threadId: thread.id,
      employeeId,
      role: "owner",
    },
    {
      threadId: thread.id,
      employeeId: counterpartId,
      role: "member",
    },
  ]);

  return thread;
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

async function ensureDirectThreadMembershipIntegrity(threadId: number) {
  const thread = await getThreadById(threadId);
  if (!thread || thread.type !== "direct") {
    return [] as number[];
  }

  const existingMembers = await db
    .select({
      employeeId: messageThreadMembers.employeeId,
    })
    .from(messageThreadMembers)
    .where(eq(messageThreadMembers.threadId, threadId));

  const existingMemberIds = Array.from(
    new Set(
      existingMembers
        .map((member) => Number(member.employeeId))
        .filter((employeeId) => Number.isFinite(employeeId)),
    ),
  );

  if (existingMemberIds.length >= 2) {
    return existingMemberIds;
  }

  const sentMessages = await db
    .selectDistinct({
      employeeId: messageMessages.senderId,
    })
    .from(messageMessages)
    .where(eq(messageMessages.threadId, threadId));

  const threadLink = `/nachrichten?thread=${threadId}`;
  const notifiedRecipients = await db
    .selectDistinct({
      employeeId: notifications.recipientId,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, "message"),
        eq(notifications.link, threadLink),
      ),
    );

  const recoveredMemberIds = Array.from(
    new Set(
      [
        ...existingMemberIds,
        Number(thread.createdById),
        ...sentMessages.map((row) => Number(row.employeeId)),
        ...notifiedRecipients.map((row) => Number(row.employeeId)),
      ].filter((employeeId) => Number.isFinite(employeeId) && employeeId > 0),
    ),
  );

  if (recoveredMemberIds.length !== 2) {
    return existingMemberIds;
  }

  const missingMembers = recoveredMemberIds.filter(
    (employeeId) => !existingMemberIds.includes(employeeId),
  );

  if (missingMembers.length) {
    await db
      .insert(messageThreadMembers)
      .values(
        missingMembers.map((employeeId) => ({
          threadId,
          employeeId,
          role: thread.createdById === employeeId ? "owner" : "member",
        })),
      )
      .onConflictDoNothing();
  }

  return recoveredMemberIds;
}

async function getAccessibleThreadIds(employeeId: number) {
  const directThreadLinkPrefix = "/nachrichten?thread=";

  const memberRows = await db
    .selectDistinct({
      threadId: messageThreadMembers.threadId,
    })
    .from(messageThreadMembers)
    .where(eq(messageThreadMembers.employeeId, employeeId));

  const senderRows = await db
    .selectDistinct({
      threadId: messageMessages.threadId,
    })
    .from(messageMessages)
    .innerJoin(
      messageThreads,
      eq(messageMessages.threadId, messageThreads.id),
    )
    .where(
      and(
        eq(messageMessages.senderId, employeeId),
        eq(messageThreads.type, "direct"),
      ),
    );

  const notifiedRows = await db
    .selectDistinct({
      threadId: messageThreads.id,
    })
    .from(notifications)
    .innerJoin(
      messageThreads,
      eq(
        notifications.link,
        sql<string>`${directThreadLinkPrefix} || ${messageThreads.id}::text`,
      ),
    )
    .where(
      and(
        eq(notifications.recipientId, employeeId),
        eq(notifications.type, "message"),
        eq(messageThreads.type, "direct"),
      ),
    );

  const candidateIds = Array.from(
    new Set(
      [...memberRows, ...senderRows, ...notifiedRows]
        .map((row) => Number(row.threadId))
        .filter((threadId) => Number.isFinite(threadId)),
    ),
  );

  if (!candidateIds.length) {
    return [] as number[];
  }

  const accessibleIds: number[] = [];
  for (const threadId of candidateIds) {
    const recoveredMembers = await ensureDirectThreadMembershipIntegrity(threadId);
    if (
      recoveredMembers.includes(employeeId) ||
      memberRows.some((row) => row.threadId === threadId)
    ) {
      accessibleIds.push(threadId);
    }
  }

  return accessibleIds;
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
      const accessibleThreadIds = await getAccessibleThreadIds(req.user.employeeId);
      if (!accessibleThreadIds.length) {
        return ok(res, []);
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
        .where(inArray(messageThreads.id, accessibleThreadIds))
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

      const response = baseThreads
        .map((thread) => ({
          ...thread,
          members: membersByThread.get(thread.id) || [],
          lastMessage: lastMessageByThread.get(thread.id) || null,
        }))
        .sort((a, b) => {
          const aTime = new Date(
            a.lastMessage?.createdAt ?? a.createdAt,
          ).getTime();
          const bTime = new Date(
            b.lastMessage?.createdAt ?? b.createdAt,
          ).getTime();
          return bTime - aTime;
        });

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
      const { type, title, memberIds } = req.body as z.infer<
        typeof createThreadSchema
      >;
      if (type === "group" && !title) {
        return res
          .status(400)
          .json({ success: false, error: "Gruppenname erforderlich" });
      }
      const uniqueMembers = Array.from(
        new Set(memberIds.filter((id: number) => id !== req.user.employeeId)),
      );
      if (!uniqueMembers.length) {
        return res.status(400).json({
          success: false,
          error: "Mindestens ein Empfaenger erforderlich",
        });
      }

      if (type === "direct" && uniqueMembers.length === 1) {
        const counterpartId = uniqueMembers[0];
        const existingThread = await findExistingDirectThread(
          req.user.employeeId,
          counterpartId,
        );

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

      const members: Array<{
        threadId: number;
        employeeId: number;
        role: "owner" | "member";
      }> = [
        {
          threadId: thread.id,
          employeeId: req.user.employeeId,
          role: "owner",
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

  router.delete(
    "/messages/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const messageId = Number(req.params.id);
      const message = await getMessageById(messageId);
      if (!message) return notFound(res, "Nachricht");

      const member = await isThreadMember(message.threadId, req.user.employeeId);
      if (!member) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }

      await db.delete(messageMessages).where(eq(messageMessages.id, messageId));
      return ok(res, { success: true });
    }),
  );

  router.post(
    "/messages/:id/forward",
    validateParams(idParamSchema),
    validateBody(forwardMessageSchema),
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, error: "Nicht authentifiziert" });
      }
      const messageId = Number(req.params.id);
      const sourceMessage = await getMessageById(messageId);
      if (!sourceMessage) return notFound(res, "Nachricht");

      const member = await isThreadMember(
        sourceMessage.threadId,
        req.user.employeeId,
      );
      if (!member) {
        return res
          .status(403)
          .json({ success: false, error: "Keine Berechtigung" });
      }

      const payload = req.body as z.infer<typeof forwardMessageSchema>;
      const forwardedContent = [
        payload.comment?.trim() || "",
        `Weitergeleitet am ${new Date().toLocaleString("de-AT")}`,
        sourceMessage.content,
      ]
        .filter(Boolean)
        .join("\n\n");

      if (payload.mode === "system") {
        const isElevatedAdmin =
          req.user.isAdmin || req.user.systemRole !== "employee";
        if (!isElevatedAdmin) {
          return res
            .status(403)
            .json({ success: false, error: "Keine Berechtigung" });
        }

        const recipients = await db
          .select({ employeeId: employees.id })
          .from(employees)
          .where(eq(employees.isActive, true));
        const rows = recipients
          .filter((entry) => entry.employeeId !== req.user.employeeId)
          .map((entry) => ({
            recipientId: entry.employeeId,
            type: "system" as const,
            title: payload.systemTitle!.trim(),
            message: forwardedContent,
            link: payload.link?.trim() || null,
            metadata: {
              kind: "forwarded_system_message",
              createdByEmployeeId: req.user.employeeId,
              createdByName: req.user.name,
            },
          }));

        if (rows.length) {
          await db.insert(notifications).values(rows);
        }
        return ok(res, { success: true });
      }

      if (payload.mode === "group") {
        const targetThreadId = Number(payload.targetThreadId);
        const thread = await getThreadById(targetThreadId);
        if (!thread) return notFound(res, "Thread");
        if (thread.type !== "group") {
          return res.status(400).json({
            success: false,
            error: "Ziel muss ein Gruppenchat sein",
          });
        }
        const targetMember = await isThreadMember(targetThreadId, req.user.employeeId);
        if (!targetMember) {
          return res
            .status(403)
            .json({ success: false, error: "Keine Berechtigung" });
        }

        const [forwarded] = await db
          .insert(messageMessages)
          .values({
            threadId: targetThreadId,
            senderId: req.user.employeeId,
            content: forwardedContent,
          })
          .returning();
        await createMessageNotifications(
          targetThreadId,
          req.user.employeeId,
          forwardedContent,
        );
        return created(res, forwarded);
      }

      const counterpartId = Number(payload.recipientEmployeeId);
      if (counterpartId === req.user.employeeId) {
        return res.status(400).json({
          success: false,
          error: "Bitte einen anderen Empfaenger waehlen",
        });
      }

      const thread = await createDirectThreadIfMissing(
        req.user.employeeId,
        counterpartId,
      );
      const [forwarded] = await db
        .insert(messageMessages)
        .values({
          threadId: thread.id,
          senderId: req.user.employeeId,
          content: forwardedContent,
        })
        .returning();
      await createMessageNotifications(
        thread.id,
        req.user.employeeId,
        forwardedContent,
      );
      return created(res, forwarded);
    }),
  );

  router.delete(
    "/threads/:id",
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

      const thread = await getThreadById(threadId);
      if (!thread) return notFound(res, "Thread");
      if (thread.type !== "direct") {
        return res.status(400).json({
          success: false,
          error: "Nur private Nachrichten koennen vollstaendig geloescht werden",
        });
      }

      const threadLink = `/nachrichten?thread=${threadId}`;
      await db.delete(notifications).where(eq(notifications.link, threadLink));
      await db.delete(messageThreads).where(eq(messageThreads.id, threadId));

      return ok(res, { success: true });
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
      const { add = [], remove = [] } = req.body as z.infer<
        typeof updateMembersSchema
      >;
      const addIds: number[] = add;
      const removeIds: number[] = remove;

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
      const filteredRemoveIds = removeIds.filter(
        (id: number) => id !== req.user.employeeId,
      );

      if (filteredRemoveIds.length) {
        await db
          .delete(messageThreadMembers)
          .where(
            and(
              eq(messageThreadMembers.threadId, threadId),
              inArray(messageThreadMembers.employeeId, filteredRemoveIds),
            ),
          );
      }
      return ok(res, { success: true });
    }),
  );
}
