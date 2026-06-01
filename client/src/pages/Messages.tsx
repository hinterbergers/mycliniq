import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Employee, Notification } from "@shared/schema";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Forward,
  Inbox,
  MailPlus,
  Megaphone,
  MessageCircle,
  MessageSquarePlus,
  Pencil,
  Pin,
  PinOff,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  employeeApi,
  type ForwardMessagePayload,
  messagesApi,
  notificationsApi,
  plannedAbsencesAdminApi,
  shiftSwapApi,
  type MessageThreadListItem,
  type MessageWithSender,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const FAVORITE_GROUP_KEY_PREFIX = "cliniq_messages_favorite_group";
const SYSTEM_THREAD_ID = -1;

type ThreadMessageItem = MessageWithSender & {
  kind?: "system";
  notificationId?: number;
  systemTitle?: string | null;
  link?: string | null;
  isRead?: boolean;
};

type PortalThread = MessageThreadListItem & {
  kind?: "system";
  unreadCount?: number;
};

type ComposeMode = "direct" | "group" | "system";
type InboxPaneMode = "threads" | "notifications";

const isSystemThreadNotification = (note: Notification) => {
  if (note.type !== "system") return false;
  const metadata =
    note.metadata && typeof note.metadata === "object"
      ? (note.metadata as Record<string, unknown>)
      : null;
  return (
    typeof metadata?.createdByEmployeeId === "number" ||
    typeof metadata?.createdByName === "string" ||
    metadata?.kind === "forwarded_system_message"
  );
};

function formatTimestamp(value?: string | Date | null) {
  if (!value) return "";
  try {
    return format(new Date(value), "d. MMM yyyy HH:mm", { locale: de });
  } catch {
    return "";
  }
}

const normalizeWhitespace = (value?: string | null) =>
  (value ?? "").trim().replace(/\s+/g, " ");

const dedupeAdjacentTokens = (value: string) => {
  const tokens = value.split(" ").filter(Boolean);
  const deduped: string[] = [];
  for (const token of tokens) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.toLowerCase() !== token.toLowerCase()) {
      deduped.push(token);
    }
  }
  return deduped.join(" ");
};

function displayMemberName(member: {
  name?: string | null;
  lastName?: string | null;
  firstName?: string | null;
}) {
  const firstName = dedupeAdjacentTokens(normalizeWhitespace(member.firstName));
  const name = dedupeAdjacentTokens(normalizeWhitespace(member.name));
  const lastName = dedupeAdjacentTokens(normalizeWhitespace(member.lastName));
  const primaryName = firstName || name;
  if (primaryName && lastName) {
    const nameLower = primaryName.toLowerCase();
    const lastLower = lastName.toLowerCase();
    if (nameLower === lastLower || nameLower.endsWith(` ${lastLower}`)) {
      return primaryName;
    }
    return `${primaryName} ${lastName}`;
  }
  return primaryName || lastName || "Unbekannt";
}

const getEmployeeName = (employee: Employee) =>
  displayMemberName({
    firstName: employee.firstName,
    name: employee.name,
    lastName: employee.lastName,
  });

const getThreadPreview = (thread: PortalThread) =>
  thread.lastMessage?.content?.trim() || "Noch keine Nachricht";

const getNotificationTone = (type: Notification["type"]) => {
  switch (type) {
    case "message":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "project":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "sop":
      return "bg-violet-50 text-violet-700 border-violet-200";
    default:
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
};

const getNotificationTypeLabel = (type: Notification["type"]) => {
  switch (type) {
    case "message":
      return "Chat";
    case "project":
      return "Projekt";
    case "sop":
      return "SOP";
    default:
      return "System";
  }
};

const getUnreadInboxCardTone = (type: Notification["type"]) => {
  switch (type) {
    case "project":
      return "border-amber-200 bg-[linear-gradient(180deg,_rgba(255,247,237,1),_rgba(255,255,255,1))]";
    case "sop":
      return "border-violet-200 bg-[linear-gradient(180deg,_rgba(245,243,255,1),_rgba(255,255,255,1))]";
    case "system":
      return "border-cyan-200 bg-[linear-gradient(180deg,_rgba(236,254,255,1),_rgba(255,255,255,1))]";
    default:
      return "border-blue-200 bg-[linear-gradient(180deg,_rgba(239,246,255,1),_rgba(255,255,255,1))]";
  }
};

type NotificationActionInfo = {
  label: string;
  details: string | null;
  handledAt: string | null;
};

const getNotificationActionInfo = (
  note: Notification,
): NotificationActionInfo => {
  const metadata =
    note.metadata && typeof note.metadata === "object"
      ? (note.metadata as Record<string, unknown>)
      : null;
  const label =
    typeof metadata?.actionLabel === "string" && metadata.actionLabel.trim()
      ? metadata.actionLabel.trim()
      : note.isRead
        ? "Gelesen"
        : "Neu";
  const details =
    typeof metadata?.actionDetails === "string" && metadata.actionDetails.trim()
      ? metadata.actionDetails.trim()
      : null;
  const handledAt =
    typeof metadata?.handledAt === "string"
      ? metadata.handledAt
      : note.readAt
        ? String(note.readAt)
        : null;

  return { label, details, handledAt };
};

type ZeitausgleichMetadata = {
  kind: "zeitausgleich_request";
  absenceId: number;
  startDate?: string;
  endDate?: string;
};

type ShiftSwapMetadata = {
  kind: "shift_swap_request";
  swapId: number;
};

const getZeitausgleichMetadata = (
  note: Notification,
): ZeitausgleichMetadata | null => {
  if (!note.metadata || typeof note.metadata !== "object") return null;

  const meta = note.metadata as {
    kind?: string;
    absenceId?: unknown;
    startDate?: unknown;
    endDate?: unknown;
  };

  if (meta.kind !== "zeitausgleich_request") return null;
  if (typeof meta.absenceId !== "number") return null;

  return {
    kind: "zeitausgleich_request",
    absenceId: meta.absenceId,
    startDate: typeof meta.startDate === "string" ? meta.startDate : undefined,
    endDate: typeof meta.endDate === "string" ? meta.endDate : undefined,
  };
};

const getShiftSwapMetadata = (note: Notification): ShiftSwapMetadata | null => {
  if (!note.metadata || typeof note.metadata !== "object") return null;
  const meta = note.metadata as Record<string, unknown>;
  if (meta.kind !== "shift_swap_request") return null;

  const parseId = (value: unknown): number | undefined => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
  };

  const swapId = [
    meta.swapId,
    meta.shiftSwapId,
    meta.swap_id,
    meta.shift_swap_id,
    meta.requestId,
    meta.request_id,
  ]
    .map(parseId)
    .find((candidate): candidate is number => candidate !== undefined);

  if (!swapId) return null;
  return { kind: "shift_swap_request", swapId };
};

export default function Messages() {
  const { toast } = useToast();
  const { employee, isAdmin, isTechnicalAdmin, can } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [threads, setThreads] = useState<MessageThreadListItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [inboxPaneMode, setInboxPaneMode] = useState<InboxPaneMode>("threads");
  const [selectedPortalNotificationId, setSelectedPortalNotificationId] = useState<
    number | null
  >(null);
  const [messages, setMessages] = useState<ThreadMessageItem[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [notificationFilter, setNotificationFilter] = useState<
    Notification["type"] | "all"
  >("all");
  const [showReadNotifications, setShowReadNotifications] = useState(false);
  const [processingNotificationIds, setProcessingNotificationIds] = useState<
    number[]
  >([]);

  const [privateRecipientSearch, setPrivateRecipientSearch] = useState("");
  const [privateRecipientId, setPrivateRecipientId] = useState<number | null>(
    null,
  );
  const [privateMessageDraft, setPrivateMessageDraft] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>("direct");
  const [isStartingDirectMessage, setIsStartingDirectMessage] = useState(false);

  const [systemTitle, setSystemTitle] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [systemLink, setSystemLink] = useState("");
  const [isSendingSystemMessage, setIsSendingSystemMessage] = useState(false);
  const [systemThreadTitleDraft, setSystemThreadTitleDraft] = useState("");

  const [groupTitleDraft, setGroupTitleDraft] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<number[]>([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [groupInitialMessage, setGroupInitialMessage] = useState("");
  const [pinCreatedGroup, setPinCreatedGroup] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [deletingThreadId, setDeletingThreadId] = useState<number | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [forwardingMessageId, setForwardingMessageId] = useState<number | null>(null);

  const [groupEditOpen, setGroupEditOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [editableGroupMemberIds, setEditableGroupMemberIds] = useState<
    number[]
  >([]);

  const [favoriteGroupThreadId, setFavoriteGroupThreadId] = useState<
    number | null
  >(null);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [messageToForward, setMessageToForward] = useState<ThreadMessageItem | null>(
    null,
  );
  const [forwardMode, setForwardMode] = useState<"direct" | "group" | "system">(
    "direct",
  );
  const [forwardRecipientSearch, setForwardRecipientSearch] = useState("");
  const [forwardRecipientId, setForwardRecipientId] = useState<number | null>(null);
  const [forwardTargetThreadId, setForwardTargetThreadId] = useState<number | null>(
    null,
  );
  const [forwardSystemTitle, setForwardSystemTitle] = useState("");
  const [forwardLink, setForwardLink] = useState("");
  const [forwardComment, setForwardComment] = useState("");

  const currentEmployeeId = employee?.id ?? null;
  const canBroadcastSystemMessage = isAdmin || isTechnicalAdmin;
  const canManageGroups =
    isAdmin || isTechnicalAdmin || can("message_group.manage");

  const resetComposeDialog = () => {
    setPrivateRecipientSearch("");
    setPrivateRecipientId(null);
    setPrivateMessageDraft("");
    setGroupTitleDraft("");
    setGroupMemberIds([]);
    setGroupMemberSearch("");
    setGroupInitialMessage("");
    setPinCreatedGroup(false);
    setSystemTitle("");
    setSystemMessage("");
    setSystemLink("");
    setComposeMode("direct");
  };

  const resetForwardDialog = () => {
    setMessageToForward(null);
    setForwardMode("direct");
    setForwardRecipientSearch("");
    setForwardRecipientId(null);
    setForwardTargetThreadId(null);
    setForwardSystemTitle("");
    setForwardLink("");
    setForwardComment("");
  };

  useEffect(() => {
    void loadNotifications();
    void loadThreads();
    void loadEmployees();
  }, []);

  useEffect(() => {
    const searchIndex = location.indexOf("?");
    const search = searchIndex >= 0 ? location.slice(searchIndex) : "";
    const params = new URLSearchParams(search);
    const threadParam = params.get("thread");
    if (!threadParam) return;
    const parsed = Number(threadParam);
    if (!Number.isNaN(parsed)) {
      setSelectedThreadId(parsed);
    }
  }, [location]);

  useEffect(() => {
    if (selectedThreadId === SYSTEM_THREAD_ID) {
      setMessages([]);
      setLoadingMessages(false);
    } else if (selectedThreadId) {
      void loadMessages(selectedThreadId);
    } else {
      setMessages([]);
    }
  }, [selectedThreadId]);

  useEffect(() => {
    if (!currentEmployeeId) {
      setFavoriteGroupThreadId(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(
        `${FAVORITE_GROUP_KEY_PREFIX}_${currentEmployeeId}`,
      );
      if (!raw) {
        setFavoriteGroupThreadId(null);
        return;
      }
      const parsed = Number(raw);
      setFavoriteGroupThreadId(Number.isNaN(parsed) ? null : parsed);
    } catch {
      setFavoriteGroupThreadId(null);
    }
  }, [currentEmployeeId]);

  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const data = await notificationsApi.getAll();
      setNotifications(data);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachrichten konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoadingNotifications(false);
    }
  };

  const loadThreads = async () => {
    setLoadingThreads(true);
    try {
      const data = await messagesApi.getThreads();
      setThreads(data);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Chats konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoadingThreads(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await employeeApi.getAll();
      setEmployees(data.filter((entry) => entry.isActive !== false));
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Mitarbeiter konnten nicht geladen werden",
        variant: "destructive",
      });
    }
  };

  const loadMessages = async (threadId: number) => {
    setLoadingMessages(true);
    try {
      const data = await messagesApi.getMessages(threadId);
      setMessages([...data].reverse());
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachrichtenverlauf konnte nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoadingMessages(false);
    }
  };

  const getThreadTitle = (thread: MessageThreadListItem) => {
    if ((thread as PortalThread).kind === "system") {
      return thread.title || "Systemnachrichten";
    }
    if (thread.type === "group") return thread.title || "Gruppe";
    const members =
      thread.members?.filter(
        (member) => member.employeeId !== currentEmployeeId,
      ) || [];
    if (members.length) {
      return members.map(displayMemberName).join(", ");
    }
    return thread.title || "Direktnachricht";
  };

  const systemNotifications = useMemo(
    () => notifications.filter((note) => isSystemThreadNotification(note)),
    [notifications],
  );

  const portalNotifications = useMemo(
    () =>
      notifications.filter(
        (note) => note.type !== "message" && !isSystemThreadNotification(note),
      ),
    [notifications],
  );

  const systemThread = useMemo<PortalThread>(() => {
    const latest = systemNotifications[0] ?? null;
    const preview = latest
      ? [latest.title, latest.message].filter(Boolean).join(" - ")
      : "";
    return {
      id: SYSTEM_THREAD_ID,
      kind: "system",
      type: "group",
      title: "Systemnachrichten",
      createdById: latest
        ? (((latest.metadata as Record<string, unknown> | null)?.createdByEmployeeId as number | null) ?? null)
        : null,
      createdAt: latest?.createdAt ?? new Date().toISOString(),
      members: [],
      unreadCount: systemNotifications.filter((note) => !note.isRead).length,
      lastMessage: latest
        ? ({
            id: latest.id,
            threadId: SYSTEM_THREAD_ID,
            senderId:
              (((latest.metadata as Record<string, unknown> | null)
                ?.createdByEmployeeId as number | null) ?? 0),
            content: preview || latest.title || "Neue Systemnachricht",
            createdAt: latest.createdAt,
          } as MessageThreadListItem["lastMessage"])
        : null,
    };
  }, [systemNotifications]);

  const portalThreads = useMemo<PortalThread[]>(
    () => [systemThread, ...threads],
    [systemThread, threads],
  );

  const filteredThreads = useMemo(() => {
    const term = threadSearch.trim().toLowerCase();
    if (!term) return portalThreads;
    return portalThreads.filter((thread) => {
      const title = getThreadTitle(thread).toLowerCase();
      const preview = getThreadPreview(thread).toLowerCase();
      return title.includes(term) || preview.includes(term);
    });
  }, [portalThreads, threadSearch]);

  const allReachableEmployees = useMemo(
    () => employees.filter((entry) => entry.id !== currentEmployeeId),
    [currentEmployeeId, employees],
  );

  const filteredPrivateRecipients = useMemo(() => {
    const term = privateRecipientSearch.trim().toLowerCase();
    return allReachableEmployees.filter((emp) => {
      if (!term) return true;
      return getEmployeeName(emp).toLowerCase().includes(term);
    });
  }, [allReachableEmployees, privateRecipientSearch]);

  const filteredGroupCandidates = useMemo(() => {
    const term = groupMemberSearch.trim().toLowerCase();
    return allReachableEmployees.filter((emp) => {
      if (!term) return true;
      return getEmployeeName(emp).toLowerCase().includes(term);
    });
  }, [allReachableEmployees, groupMemberSearch]);

  const filteredEditableGroupCandidates = useMemo(() => {
    const term = groupSearch.trim().toLowerCase();
    return allReachableEmployees.filter((emp) => {
      if (!term) return true;
      return getEmployeeName(emp).toLowerCase().includes(term);
    });
  }, [allReachableEmployees, groupSearch]);

  const filteredForwardRecipients = useMemo(() => {
    const term = forwardRecipientSearch.trim().toLowerCase();
    return allReachableEmployees.filter((emp) => {
      if (!term) return true;
      return getEmployeeName(emp).toLowerCase().includes(term);
    });
  }, [allReachableEmployees, forwardRecipientSearch]);

  const selectedThread = useMemo(
    () => portalThreads.find((thread) => thread.id === selectedThreadId) || null,
    [portalThreads, selectedThreadId],
  );

  const selectedPrivateRecipient = useMemo(
    () =>
      allReachableEmployees.find((entry) => entry.id === privateRecipientId) ||
      null,
    [allReachableEmployees, privateRecipientId],
  );

  const groupThreads = useMemo(
    () =>
      portalThreads.filter(
        (thread) => thread.type === "group" && thread.id !== SYSTEM_THREAD_ID,
      ),
    [portalThreads],
  );

  const availableForwardGroupThreads = useMemo(
    () =>
      groupThreads.filter(
        (thread) => selectedThreadId == null || thread.id !== selectedThreadId,
      ),
    [groupThreads, selectedThreadId],
  );

  const favoriteGroupThread = useMemo(
    () =>
      groupThreads.find((thread) => thread.id === favoriteGroupThreadId) ||
      null,
    [favoriteGroupThreadId, groupThreads],
  );

  const isGroupOwner = useMemo(() => {
    if (!selectedThread || !currentEmployeeId) return false;
    return (
      selectedThread.members?.some(
        (member) =>
          member.employeeId === currentEmployeeId && member.role === "owner",
      ) ?? false
    );
  }, [currentEmployeeId, selectedThread]);

  const canEditGroup =
    selectedThread?.type === "group" &&
    selectedThread.id !== SYSTEM_THREAD_ID &&
    (isGroupOwner || canManageGroups);

  const unreadNotifications = useMemo(
    () =>
      portalNotifications
        .filter((note) => !note.isRead)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [portalNotifications],
  );
  const processedNotifications = useMemo(
    () =>
      portalNotifications
        .filter((note) => note.isRead)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [portalNotifications],
  );
  const filteredPortalNotifications = useMemo(() => {
    return portalNotifications.filter((note) => {
      if (!showReadNotifications && note.isRead) return false;
      if (notificationFilter !== "all" && note.type !== notificationFilter) {
        return false;
      }
      return true;
    });
  }, [notificationFilter, portalNotifications, showReadNotifications]);
  const selectedPortalNotification = useMemo(
    () =>
      filteredPortalNotifications.find(
        (note) => note.id === selectedPortalNotificationId,
      ) ||
      filteredPortalNotifications[0] ||
      null,
    [filteredPortalNotifications, selectedPortalNotificationId],
  );
  useEffect(() => {
    if (!filteredPortalNotifications.length) {
      setSelectedPortalNotificationId(null);
      return;
    }
    if (
      selectedPortalNotificationId == null ||
      !filteredPortalNotifications.some(
        (note) => note.id === selectedPortalNotificationId,
      )
    ) {
      setSelectedPortalNotificationId(filteredPortalNotifications[0].id);
    }
  }, [filteredPortalNotifications, selectedPortalNotificationId]);
  const systemThreadMessages = useMemo<ThreadMessageItem[]>(
    () =>
      [...systemNotifications]
        .reverse()
        .map((note) => {
          const metadata =
            note.metadata && typeof note.metadata === "object"
              ? (note.metadata as Record<string, unknown>)
              : null;
          return {
            id: note.id,
            threadId: SYSTEM_THREAD_ID,
            senderId:
              typeof metadata?.createdByEmployeeId === "number"
                ? metadata.createdByEmployeeId
                : 0,
            senderName:
              typeof metadata?.createdByName === "string" &&
              metadata.createdByName.trim()
                ? metadata.createdByName
                : "System",
            senderLastName: null,
            content: note.message ?? "",
            createdAt: note.createdAt,
            kind: "system",
            notificationId: note.id,
            systemTitle: note.title,
            link: note.link,
            isRead: note.isRead,
          };
        }),
    [systemNotifications],
  );
  const activeMessages =
    selectedThreadId === SYSTEM_THREAD_ID ? systemThreadMessages : messages;
  const isSubmittingCompose =
    isStartingDirectMessage || isCreatingGroup || isSendingSystemMessage;
  const canDeleteSelectedDirectThread = Boolean(
    selectedThread &&
      selectedThread.id !== SYSTEM_THREAD_ID &&
      selectedThread.type === "direct",
  );

  const storeFavoriteGroup = (threadId: number | null) => {
    setFavoriteGroupThreadId(threadId);
    if (!currentEmployeeId) return;
    try {
      if (threadId == null) {
        window.localStorage.removeItem(
          `${FAVORITE_GROUP_KEY_PREFIX}_${currentEmployeeId}`,
        );
        return;
      }
      window.localStorage.setItem(
        `${FAVORITE_GROUP_KEY_PREFIX}_${currentEmployeeId}`,
        String(threadId),
      );
    } catch {
      // ignore localStorage issues
    }
  };

  const upsertNotification = (updated: Notification) => {
    setNotifications((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  };

  const markNotificationRead = async (
    note: Notification,
    options?: {
      actionType?: string;
      actionLabel?: string;
      actionDetails?: string | null;
    },
  ) => {
    const updated = await notificationsApi.markRead(note.id, options);
    upsertNotification(updated);
    return updated;
  };

  const openThread = (threadId: number) => {
    setInboxPaneMode("threads");
    setSelectedThreadId(threadId);
    setLocation(`/nachrichten?thread=${threadId}`);
    if (threadId === SYSTEM_THREAD_ID) {
      const unreadSystem = systemNotifications.filter((note) => !note.isRead);
      if (unreadSystem.length) {
        void Promise.all(
          unreadSystem.map((note) =>
            markNotificationRead(note, {
              actionType: "thread_read",
              actionLabel: "Im Thread gelesen",
            }),
          ),
        );
      }
    }
    const workspace = document.getElementById("chat-workspace");
    workspace?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectPortalNotification = (note: Notification) => {
    setInboxPaneMode("notifications");
    setSelectedPortalNotificationId(note.id);
    const workspace = document.getElementById("chat-workspace");
    workspace?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSendMessage = async () => {
    if (!selectedThreadId || !messageDraft.trim()) return;
    if (selectedThreadId === SYSTEM_THREAD_ID) {
      if (!canBroadcastSystemMessage) return;
      if (!systemThreadTitleDraft.trim()) {
        toast({
          title: "Fehlende Angaben",
          description: "Bitte einen Titel fuer die Systemnachricht eingeben.",
          variant: "destructive",
        });
        return;
      }
      setIsSendingSystemMessage(true);
      try {
        await notificationsApi.broadcast({
          title: systemThreadTitleDraft.trim(),
          message: messageDraft.trim(),
          link: systemLink.trim() || undefined,
        });
        setSystemThreadTitleDraft("");
        setMessageDraft("");
        setSystemLink("");
        await loadNotifications();
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Systemnachricht konnte nicht versendet werden",
          variant: "destructive",
        });
      } finally {
        setIsSendingSystemMessage(false);
      }
      return;
    }
    try {
      await messagesApi.sendMessage(selectedThreadId, messageDraft.trim());
      setMessageDraft("");
      await Promise.all([loadMessages(selectedThreadId), loadThreads()]);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachricht konnte nicht gesendet werden",
        variant: "destructive",
      });
    }
  };

  const toggleMemberSelection = (
    list: number[],
    setter: (value: number[]) => void,
    employeeId: number,
  ) => {
    if (list.includes(employeeId)) {
      setter(list.filter((entry) => entry !== employeeId));
      return;
    }
    setter([...list, employeeId]);
  };

  const handleCreateDirectMessage = async () => {
    if (!privateRecipientId || !privateMessageDraft.trim()) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte Empfaenger und Nachricht ausfuellen.",
        variant: "destructive",
      });
      return;
    }

    setIsStartingDirectMessage(true);
    try {
      const thread = await messagesApi.createThread({
        type: "direct",
        memberIds: [privateRecipientId],
      });
      await messagesApi.sendMessage(thread.id, privateMessageDraft.trim());
      setComposeOpen(false);
      resetComposeDialog();
      await loadThreads();
      openThread(thread.id);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Direktnachricht konnte nicht gestartet werden",
        variant: "destructive",
      });
    } finally {
      setIsStartingDirectMessage(false);
    }
  };

  const handleCreateGroup = async () => {
    if (
      !groupTitleDraft.trim() ||
      groupMemberIds.length === 0 ||
      !groupInitialMessage.trim()
    ) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte Gruppenname, Mitglieder und erste Nachricht eingeben.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingGroup(true);
    try {
      const thread = await messagesApi.createThread({
        type: "group",
        title: groupTitleDraft.trim(),
        memberIds: groupMemberIds,
      });
      await messagesApi.sendMessage(thread.id, groupInitialMessage.trim());
      if (pinCreatedGroup) {
        storeFavoriteGroup(thread.id);
      }
      resetComposeDialog();
      await loadThreads();
      setComposeOpen(false);
      openThread(thread.id);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Gruppe konnte nicht erstellt werden",
        variant: "destructive",
      });
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleCreateSystemThreadMessage = async () => {
    if (!systemTitle.trim() || !systemMessage.trim()) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte Titel und Nachricht ausfuellen.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingSystemMessage(true);
    try {
      await notificationsApi.broadcast({
        title: systemTitle.trim(),
        message: systemMessage.trim(),
        link: systemLink.trim() || undefined,
      });
      setComposeOpen(false);
      resetComposeDialog();
      await loadNotifications();
      openThread(SYSTEM_THREAD_ID);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Systemnachricht konnte nicht versendet werden",
        variant: "destructive",
      });
    } finally {
      setIsSendingSystemMessage(false);
    }
  };

  const handleSubmitCompose = async () => {
    if (composeMode === "direct") {
      await handleCreateDirectMessage();
      return;
    }
    if (composeMode === "group") {
      await handleCreateGroup();
      return;
    }
    await handleCreateSystemThreadMessage();
  };

  const handleDeleteDirectThread = async (thread: PortalThread) => {
    if (thread.id === SYSTEM_THREAD_ID || thread.type !== "direct") return;
    const confirmed = window.confirm(
      "Private Nachricht fuer beide Benutzer dauerhaft loeschen?",
    );
    if (!confirmed) return;

    setDeletingThreadId(thread.id);
    try {
      await messagesApi.deleteThread(thread.id);
      if (selectedThreadId === thread.id) {
        setSelectedThreadId(null);
        setLocation("/nachrichten");
        setMessages([]);
      }
      await loadThreads();
      await loadNotifications();
      toast({
        title: "Private Nachricht geloescht",
        description: "Der Verlauf wurde fuer beide Benutzer entfernt.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Private Nachricht konnte nicht geloescht werden",
        variant: "destructive",
      });
    } finally {
      setDeletingThreadId(null);
    }
  };

  const handleDeleteMessage = async (msg: ThreadMessageItem) => {
    if (msg.kind === "system") {
      if (msg.notificationId == null) return;
      const confirmed = window.confirm(
        "Diese Systemnachricht fuer alle Empfaenger entfernen?",
      );
      if (!confirmed) return;
      setDeletingMessageId(msg.id);
      try {
        await notificationsApi.delete(msg.notificationId);
        await loadNotifications();
        toast({
          title: "Nachricht geloescht",
          description: "Die Systemnachricht wurde entfernt.",
        });
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Nachricht konnte nicht geloescht werden",
          variant: "destructive",
        });
      } finally {
        setDeletingMessageId(null);
      }
      return;
    }

    const confirmed = window.confirm(
      "Diese Nachricht fuer alle Teilnehmer dauerhaft loeschen?",
    );
    if (!confirmed) return;

    setDeletingMessageId(msg.id);
    try {
      await messagesApi.deleteMessage(msg.id);
      if (selectedThreadId && selectedThreadId !== SYSTEM_THREAD_ID) {
        await Promise.all([loadMessages(selectedThreadId), loadThreads()]);
      }
      toast({
        title: "Nachricht geloescht",
        description: "Die Nachricht wurde aus dem Thread entfernt.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachricht konnte nicht geloescht werden",
        variant: "destructive",
      });
    } finally {
      setDeletingMessageId(null);
    }
  };

  const openForwardDialog = (msg: ThreadMessageItem) => {
    setMessageToForward(msg);
    setForwardMode("direct");
    setForwardRecipientSearch("");
    setForwardRecipientId(null);
    setForwardTargetThreadId(availableForwardGroupThreads[0]?.id ?? null);
    setForwardSystemTitle(msg.kind === "system" ? msg.systemTitle || "" : "");
    setForwardLink(msg.kind === "system" ? msg.link || "" : "");
    setForwardComment("");
    setForwardDialogOpen(true);
  };

  const handleForwardMessage = async () => {
    if (!messageToForward) return;

    const payload: ForwardMessagePayload = {
      mode: forwardMode,
      comment: forwardComment.trim() || undefined,
    };

    if (forwardMode === "direct") {
      if (!forwardRecipientId) {
        toast({
          title: "Fehlende Angaben",
          description: "Bitte einen Empfaenger waehlen.",
          variant: "destructive",
        });
        return;
      }
      payload.recipientEmployeeId = forwardRecipientId;
    } else if (forwardMode === "group") {
      if (!forwardTargetThreadId) {
        toast({
          title: "Fehlende Angaben",
          description: "Bitte einen Gruppenchat waehlen.",
          variant: "destructive",
        });
        return;
      }
      payload.targetThreadId = forwardTargetThreadId;
    } else {
      if (!forwardSystemTitle.trim()) {
        toast({
          title: "Fehlende Angaben",
          description: "Bitte einen Titel fuer die Systemnachricht eingeben.",
          variant: "destructive",
        });
        return;
      }
      payload.systemTitle = forwardSystemTitle.trim();
      payload.link = forwardLink.trim() || undefined;
    }

    setForwardingMessageId(messageToForward.id);
    try {
      await messagesApi.forwardMessage(messageToForward.id, payload);
      setForwardDialogOpen(false);
      resetForwardDialog();
      await Promise.all([loadThreads(), loadNotifications()]);
      toast({
        title: "Nachricht weitergeleitet",
        description: "Die Nachricht wurde an das gewaehlte Ziel gesendet.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachricht konnte nicht weitergeleitet werden",
        variant: "destructive",
      });
    } finally {
      setForwardingMessageId(null);
    }
  };

  const openGroupEditor = () => {
    if (!selectedThread) return;
    setGroupTitle(selectedThread.title || "");
    setEditableGroupMemberIds(
      (selectedThread.members || []).map((member) => member.employeeId),
    );
    setGroupSearch("");
    setGroupEditOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!selectedThread) return;
    if (!groupTitle.trim() || editableGroupMemberIds.length === 0) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte Gruppenname und Mitglieder pruetzen.",
        variant: "destructive",
      });
      return;
    }

    try {
      const currentMemberIds = new Set(
        (selectedThread.members || []).map((member) => member.employeeId),
      );
      const desiredIds = new Set(editableGroupMemberIds);
      const add = [...desiredIds].filter((id) => !currentMemberIds.has(id));
      const remove = [...currentMemberIds].filter(
        (id) => !desiredIds.has(id) && id !== currentEmployeeId,
      );

      if ((selectedThread.title || "") !== groupTitle.trim()) {
        await messagesApi.renameThread(selectedThread.id, groupTitle.trim());
      }
      if (add.length || remove.length) {
        await messagesApi.updateMembers(selectedThread.id, { add, remove });
      }

      setGroupEditOpen(false);
      await loadThreads();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Gruppe konnte nicht aktualisiert werden",
        variant: "destructive",
      });
    }
  };

  const handleDeleteNotification = async (notificationId: number) => {
    try {
      await notificationsApi.delete(notificationId);
      setNotifications((current) =>
        current.filter((item) => item.id !== notificationId),
      );
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachricht konnte nicht entfernt werden",
        variant: "destructive",
      });
    }
  };

  const handleOpenNotification = async (note: Notification) => {
    try {
      if (!note.isRead) {
        await markNotificationRead(note, {
          actionType: "opened",
          actionLabel: "Geoeffnet",
          actionDetails: note.link || null,
        });
      }
      if (note.link) {
        setLocation(note.link);
      }
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachricht konnte nicht geoeffnet werden",
        variant: "destructive",
      });
    }
  };

  const handleMarkRead = async (note: Notification) => {
    if (note.isRead) return;
    try {
      await markNotificationRead(note, {
        actionType: "read",
        actionLabel: "Gelesen",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachricht konnte nicht aktualisiert werden",
        variant: "destructive",
      });
    }
  };

  const handleZeitausgleichResponse = async (
    note: Notification,
    action: "accept" | "decline",
  ) => {
    const meta = getZeitausgleichMetadata(note);
    if (!meta) return;

    setProcessingNotificationIds((current) => [...current, note.id]);
    try {
      await plannedAbsencesAdminApi.respond(meta.absenceId, action);
      await markNotificationRead(note, {
        actionType: action,
        actionLabel:
          action === "accept" ? "Bestaetigt" : "Abgelehnt",
        actionDetails: meta.startDate
          ? `Zeitausgleich ${meta.startDate}`
          : "Zeitausgleich beantwortet",
      });
      toast({
        title:
          action === "accept"
            ? "Zeitausgleich bestaetigt"
            : "Zeitausgleich abgelehnt",
        description: "Die Rueckmeldung wurde gespeichert.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Antwort konnte nicht gespeichert werden",
        variant: "destructive",
      });
    } finally {
      setProcessingNotificationIds((current) =>
        current.filter((id) => id !== note.id),
      );
    }
  };

  const handleShiftSwapResponse = async (
    note: Notification,
    action: "accept" | "reject",
  ) => {
    const meta = getShiftSwapMetadata(note);
    if (!meta) return;

    setProcessingNotificationIds((current) => [...current, note.id]);
    try {
      if (action === "accept") {
        await shiftSwapApi.acceptRequest(meta.swapId);
      } else {
        await shiftSwapApi.rejectRequest(meta.swapId);
      }
      await markNotificationRead(note, {
        actionType: action,
        actionLabel: action === "accept" ? "Angenommen" : "Abgelehnt",
        actionDetails: "Diensttausch beantwortet",
      });
      toast({
        title:
          action === "accept"
            ? "Diensttausch angenommen"
            : "Diensttausch abgelehnt",
        description: "Die Anfrage wurde verarbeitet.",
      });
      await loadNotifications();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Die Anfrage konnte nicht verarbeitet werden",
        variant: "destructive",
      });
    } finally {
      setProcessingNotificationIds((current) =>
        current.filter((id) => id !== note.id),
      );
    }
  };

  return (
    <Layout title="Nachrichten">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 pb-8">
        <Card className="overflow-hidden border-none bg-gradient-to-br from-slate-950 via-[#113f72] to-[#0f5ba7] text-white shadow-xl">
          <CardContent className="grid gap-8 p-8 lg:grid-cols-[minmax(0,1.1fr)_360px] lg:p-10">
            <div className="space-y-5">
              <Badge className="w-fit border-white/20 bg-white/10 text-white hover:bg-white/10">
                Nachrichtenportal
              </Badge>
              <div className="space-y-3">
                <h2 className="max-w-3xl text-xl font-bold leading-tight text-white">
                  Ein Posteingang fuer Hinweise, Chats und Gruppen.
                </h2>
                <p className="max-w-xl text-sm text-primary-foreground/80">
                  Die Startseite fokussiert auf offene Hinweise, bearbeitete
                  Vorgaenge und schnelle Kommunikation. Chats, Gruppen und
                  Systemmeldungen liegen in einer mobilen Portalstruktur.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="border-white/20 bg-white text-blue-700 hover:bg-blue-50"
                  onClick={() => setComposeOpen(true)}
                >
                  <MailPlus className="mr-2 h-4 w-4" />
                  Neue Nachricht
                </Button>
                {favoriteGroupThread && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                    onClick={() => openThread(favoriteGroupThread.id)}
                  >
                    <Pin className="mr-2 h-4 w-4" />
                    Nachricht an Gruppe
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/70">
                Portalstatus und Schnellzugriffe
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-white text-blue-700 hover:bg-white">
                  Neu {loadingNotifications ? "..." : unreadNotifications.length}
                </Badge>
                <Badge variant="outline" className="border-white/20 text-white">
                  Chats {loadingThreads ? "..." : threads.length}
                </Badge>
                <Badge variant="outline" className="border-white/20 text-white">
                  Gruppen {groupThreads.length}
                </Badge>
              </div>
              <div className="mt-5 space-y-3 text-sm text-white/90">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">
                    Favorit
                  </p>
                  <p className="mt-2 font-medium text-white">
                    {favoriteGroupThread
                      ? getThreadTitle(favoriteGroupThread)
                      : "Keine Gruppe fixiert"}
                  </p>
                  <p className="mt-1 text-xs text-white/65">
                    Als persoenlicher Header-Shortcut hinterlegbar
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">
                    Fokus
                  </p>
                  <p className="mt-2 font-medium text-white">
                    {unreadNotifications.length > 0
                      ? "Offene Hinweise zuerst bearbeiten"
                      : "Eingang ist leer, Chats bleiben aktiv"}
                  </p>
                  <p className="mt-1 text-xs text-white/65">
                    Dashboard und Nachrichten nutzen dieselbe Eingangslogik
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="order-3 space-y-6">
            <Card className="border-blue-100/80 shadow-sm" id="new-inbox">
              <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-blue-100/80 bg-slate-50/80">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Inbox className="h-5 w-5 text-blue-600" />
                    Neue Nachrichten
                  </CardTitle>
                  <CardDescription>
                    Offene Hinweise bleiben hier als farbige Eingangskacheln, bis sie gelesen sind.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-blue-100 text-blue-700 hover:bg-blue-100"
                  >
                    {loadingNotifications ? "..." : unreadNotifications.length} offen
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadNotifications()}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Aktualisieren
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                {loadingNotifications && (
                  <p className="text-sm text-muted-foreground">
                    Lade neue Nachrichten...
                  </p>
                )}
                {!loadingNotifications && unreadNotifications.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-5 text-sm text-muted-foreground">
                    Kein offener Eingang. Neue Hinweise erscheinen hier zuerst.
                  </div>
                )}
                {!loadingNotifications &&
                  unreadNotifications.map((note, index) => {
                    const shiftSwapMeta = getShiftSwapMetadata(note);
                    const zeitausgleichMeta = getZeitausgleichMetadata(note);
                    const isProcessing = processingNotificationIds.includes(
                      note.id,
                    );

                    return (
                      <div
                        key={note.id}
                        className="rounded-3xl border border-blue-100 bg-[linear-gradient(180deg,_rgba(239,246,255,0.9),_rgba(255,255,255,1))] p-4 shadow-sm"
                      >
                        <div
                          className={cn(
                            "rounded-3xl border p-4 shadow-sm transition-colors",
                            getUnreadInboxCardTone(note.type),
                            index === 0 && "ring-2 ring-blue-200/70",
                          )}
                        >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn("border", getNotificationTone(note.type))}
                              >
                                {getNotificationTypeLabel(note.type)}
                              </Badge>
                              {index === 0 && (
                                <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                                  Neueste
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(note.createdAt)}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {note.title}
                              </p>
                              {note.message && (
                                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                                  {note.message}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => void handleMarkRead(note)}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Gelesen
                            </Button>
                            {note.link && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void handleOpenNotification(note)}
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Oeffnen
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => void handleDeleteNotification(note.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {zeitausgleichMeta && (
                          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-white/70 p-3">
                            <span className="text-xs font-medium text-slate-700">
                              Zeitausgleich beantworten
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isProcessing}
                              onClick={() =>
                                void handleZeitausgleichResponse(note, "accept")
                              }
                            >
                              Bestaetigen
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isProcessing}
                              onClick={() =>
                                void handleZeitausgleichResponse(note, "decline")
                              }
                            >
                              Ablehnen
                            </Button>
                          </div>
                        )}

                        {shiftSwapMeta && (
                          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-white/70 p-3">
                            <span className="text-xs font-medium text-slate-700">
                              Diensttausch beantworten
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isProcessing}
                              onClick={() =>
                                void handleShiftSwapResponse(note, "accept")
                              }
                            >
                              Annehmen
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isProcessing}
                              onClick={() =>
                                void handleShiftSwapResponse(note, "reject")
                              }
                            >
                              Ablehnen
                            </Button>
                          </div>
                        )}
                        </div>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Clock3 className="h-5 w-5 text-slate-500" />
                  Bereits bearbeitet
                </CardTitle>
                <CardDescription>
                  Gelesene Nachrichten mit Hinweis, wie sie abgearbeitet wurden.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!loadingNotifications && processedNotifications.length === 0 && (
                  <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                    Noch keine bearbeiteten Nachrichten vorhanden.
                  </div>
                )}
                {processedNotifications.map((note) => {
                  const actionInfo = getNotificationActionInfo(note);
                  return (
                    <div
                      key={note.id}
                      className="rounded-3xl border bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn("border", getNotificationTone(note.type))}
                            >
                              {getNotificationTypeLabel(note.type)}
                            </Badge>
                            <Badge variant="secondary">{actionInfo.label}</Badge>
                            {actionInfo.handledAt && (
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(actionInfo.handledAt)}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {note.title}
                            </p>
                            {note.message && (
                              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                                {note.message}
                              </p>
                            )}
                            {actionInfo.details && (
                              <p className="mt-2 text-xs text-slate-500">
                                Bearbeitung: {actionInfo.details}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {note.link && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleOpenNotification(note)}
                            >
                              Nochmal oeffnen
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => void handleDeleteNotification(note.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
        </div>

        <Card className="order-2 shadow-sm" id="chat-workspace">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MessageCircle className="h-5 w-5 text-blue-600" />
                Dialoge und Gruppen
              </CardTitle>
              <CardDescription>
                Messenger-Ansicht fuer laufende Unterhaltungen, optimiert fuer Desktop und Handheld.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void (inboxPaneMode === "threads"
                    ? loadThreads()
                    : loadNotifications())
                }
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Aktualisieren
              </Button>
              {selectedThread?.type === "group" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    favoriteGroupThreadId === selectedThread.id
                      ? storeFavoriteGroup(null)
                      : storeFavoriteGroup(selectedThread.id)
                  }
                >
                  {favoriteGroupThreadId === selectedThread.id ? (
                    <>
                      <PinOff className="mr-2 h-4 w-4" />
                      Favorit loesen
                    </>
                  ) : (
                    <>
                      <Pin className="mr-2 h-4 w-4" />
                      Als Header-Button
                    </>
                  )}
                </Button>
              )}
              {selectedThread?.id === SYSTEM_THREAD_ID && (
                <Badge
                  variant="outline"
                  className="border-blue-200 bg-blue-50 text-blue-700"
                >
                  Broadcast-Thread
                </Badge>
              )}
              {canDeleteSelectedDirectThread && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={deletingThreadId === selectedThread?.id}
                  onClick={() =>
                    selectedThread && void handleDeleteDirectThread(selectedThread)
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Privatnachricht loeschen
                </Button>
              )}
              {selectedThread && canEditGroup && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={openGroupEditor}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Gruppe bearbeiten
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className={cn("grid gap-4", !isMobile && "lg:grid-cols-[320px_minmax(0,1fr)]")}>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={inboxPaneMode === "threads" ? "default" : "outline"}
                    onClick={() => setInboxPaneMode("threads")}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Chats
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      inboxPaneMode === "notifications" ? "default" : "outline"
                    }
                    onClick={() => setInboxPaneMode("notifications")}
                  >
                    <Inbox className="mr-2 h-4 w-4" />
                    Hinweise
                  </Button>
                </div>
                {inboxPaneMode === "threads" ? (
                  <Input
                    placeholder="Chats durchsuchen..."
                    value={threadSearch}
                    onChange={(event) => setThreadSearch(event.target.value)}
                  />
                ) : (
                  <div className="space-y-3 rounded-3xl border bg-slate-50/60 p-3">
                    <div className="flex flex-wrap gap-2">
                      {(["all", "system", "project", "sop"] as const).map((type) => (
                        <Button
                          key={type}
                          type="button"
                          size="sm"
                          variant={
                            notificationFilter === type ? "default" : "outline"
                          }
                          onClick={() => setNotificationFilter(type)}
                        >
                          {type === "all"
                            ? "Alle"
                            : getNotificationTypeLabel(type as Notification["type"])}
                        </Button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <Checkbox
                        checked={showReadNotifications}
                        onCheckedChange={(checked) =>
                          setShowReadNotifications(Boolean(checked))
                        }
                      />
                      Gelesene einblenden
                    </label>
                  </div>
                )}
                <ScrollArea
                  className={cn(
                    "rounded-3xl border bg-slate-50/60 p-3",
                    isMobile ? "h-[300px]" : "h-[560px]",
                  )}
                >
                  {inboxPaneMode === "threads" && loadingThreads && (
                    <p className="text-sm text-muted-foreground">Lade Chats...</p>
                  )}
                  {inboxPaneMode === "threads" &&
                    !loadingThreads &&
                    filteredThreads.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Keine passenden Threads gefunden.
                    </p>
                  )}
                  {inboxPaneMode === "threads" &&
                    !loadingThreads &&
                    filteredThreads.length > 0 && (
                    <div className="space-y-2">
                      {filteredThreads.map((thread) => {
                        const isActive = selectedThreadId === thread.id;
                        const isFavoriteGroup =
                          thread.type === "group" &&
                          favoriteGroupThreadId === thread.id &&
                          thread.id !== SYSTEM_THREAD_ID;
                        const canDeleteThread =
                          thread.id !== SYSTEM_THREAD_ID && thread.type === "direct";
                        return (
                          <div
                            key={thread.id}
                            className={cn(
                              "rounded-3xl border transition-all",
                              isActive
                                ? "border-blue-200 bg-blue-50 shadow-sm"
                                : "bg-white hover:border-blue-100 hover:bg-slate-50",
                            )}
                          >
                            <div className="flex items-start gap-2 p-1">
                              <button
                                type="button"
                                onClick={() => openThread(thread.id)}
                                className="min-w-0 flex-1 rounded-[22px] px-3 py-2 text-left"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="truncate text-sm font-semibold text-slate-900">
                                        {getThreadTitle(thread)}
                                      </p>
                                      {thread.id === SYSTEM_THREAD_ID && (
                                        <Badge
                                          variant="outline"
                                          className="border-blue-200 text-blue-700"
                                        >
                                          <Megaphone className="mr-1 h-3 w-3" />
                                          System
                                        </Badge>
                                      )}
                                      {thread.type === "group" &&
                                        thread.id !== SYSTEM_THREAD_ID && (
                                        <Badge variant="secondary">Gruppe</Badge>
                                      )}
                                      {isFavoriteGroup && (
                                        <Badge
                                          variant="outline"
                                          className="border-blue-200 text-blue-700"
                                        >
                                          <Pin className="mr-1 h-3 w-3" />
                                          Favorit
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                      {getThreadPreview(thread)}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className="text-[11px] text-muted-foreground">
                                      {formatTimestamp(
                                        thread.lastMessage?.createdAt || thread.createdAt,
                                      )}
                                    </span>
                                    {thread.id === SYSTEM_THREAD_ID &&
                                      (thread.unreadCount ?? 0) > 0 && (
                                        <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                                          {thread.unreadCount}
                                        </Badge>
                                      )}
                                  </div>
                                </div>
                              </button>
                              {canDeleteThread && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="mt-1 shrink-0 text-slate-500 hover:text-red-600"
                                  disabled={deletingThreadId === thread.id}
                                  onClick={() => void handleDeleteDirectThread(thread)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {inboxPaneMode === "notifications" && loadingNotifications && (
                    <p className="text-sm text-muted-foreground">
                      Lade Hinweise...
                    </p>
                  )}
                  {inboxPaneMode === "notifications" &&
                    !loadingNotifications &&
                    filteredPortalNotifications.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Keine passenden Hinweise vorhanden.
                      </p>
                    )}
                  {inboxPaneMode === "notifications" &&
                    !loadingNotifications &&
                    filteredPortalNotifications.length > 0 && (
                      <div className="space-y-2">
                        {filteredPortalNotifications.map((note) => {
                          const isActive = selectedPortalNotification?.id === note.id;
                          return (
                            <button
                              key={note.id}
                              type="button"
                              onClick={() => selectPortalNotification(note)}
                              className={cn(
                                "w-full rounded-3xl border p-3 text-left transition-all",
                                isActive
                                  ? "border-blue-200 bg-blue-50 shadow-sm"
                                  : "bg-white hover:border-blue-100 hover:bg-slate-50",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "border",
                                        getNotificationTone(note.type),
                                      )}
                                    >
                                      {getNotificationTypeLabel(note.type)}
                                    </Badge>
                                    {note.isRead && (
                                      <Badge variant="secondary">Gelesen</Badge>
                                    )}
                                  </div>
                                  <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                                    {note.title}
                                  </p>
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                    {note.message || "Keine Zusatzinformation"}
                                  </p>
                                </div>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {formatTimestamp(note.createdAt)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                </ScrollArea>
              </div>

              <div className="flex min-h-[420px] flex-col rounded-[28px] border bg-[linear-gradient(180deg,_rgba(248,250,252,0.95),_rgba(255,255,255,1))]">
                {inboxPaneMode === "threads" && !selectedThread && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="rounded-full bg-blue-50 p-4 text-blue-600">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        Einen Thread auswaehlen
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Waehle links einen Chat oder starte oben eine neue Nachricht.
                      </p>
                    </div>
                  </div>
                )}

                {inboxPaneMode === "threads" && selectedThread && (
                  <>
                    <div className="border-b px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-slate-900">
                            {getThreadTitle(selectedThread)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedThread.id === SYSTEM_THREAD_ID
                              ? "Von Admins an alle Benutzer gesendet"
                              : selectedThread.type === "group"
                              ? `${selectedThread.members?.length || 0} Mitglieder`
                              : "Direktnachricht"}
                          </p>
                        </div>
                        {selectedThread.type === "group" &&
                          selectedThread.id !== SYSTEM_THREAD_ID && (
                          <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-blue-700"
                          >
                            Gruppenchat
                          </Badge>
                          )}
                      </div>
                    </div>

                    <ScrollArea
                      className={cn(
                        "flex-1 px-4 py-4",
                        isMobile ? "h-[320px]" : "h-[480px]",
                      )}
                    >
                      {loadingMessages && (
                        <p className="text-sm text-muted-foreground">
                          Lade Verlauf...
                        </p>
                      )}
                      {!loadingMessages && activeMessages.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Noch keine Nachrichten in diesem Thread.
                        </p>
                      )}
                      {!loadingMessages && activeMessages.length > 0 && (
                        <div className="space-y-3">
                          {activeMessages.map((msg) => {
                            const isOwn = msg.senderId === currentEmployeeId;
                            const canDeleteMessage =
                              msg.kind === "system"
                                ? canBroadcastSystemMessage
                                : selectedThreadId !== SYSTEM_THREAD_ID;
                            return (
                              <div
                                key={msg.id}
                                className={cn(
                                  "flex flex-col gap-2",
                                  isOwn ? "justify-end" : "justify-start",
                                )}
                              >
                                <div
                                  className={cn(
                                    "max-w-[88%] rounded-[24px] border px-4 py-3 shadow-sm sm:max-w-[78%]",
                                    isOwn
                                      ? "border-blue-200 bg-blue-600 text-white"
                                      : "bg-white text-slate-900",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <p
                                      className={cn(
                                        "text-xs font-semibold",
                                        isOwn ? "text-blue-50" : "text-slate-700",
                                      )}
                                    >
                                      {msg.senderName || msg.senderLastName
                                        ? displayMemberName({
                                            name: msg.senderName,
                                            lastName: msg.senderLastName,
                                          })
                                        : "Unbekannt"}
                                    </p>
                                    <span
                                      className={cn(
                                        "text-[11px]",
                                        isOwn ? "text-blue-100/85" : "text-muted-foreground",
                                      )}
                                    >
                                      {formatTimestamp(msg.createdAt)}
                                    </span>
                                  </div>
                                  {msg.kind === "system" && msg.systemTitle && (
                                    <p className="mt-1 text-sm font-semibold text-slate-900">
                                      {msg.systemTitle}
                                    </p>
                                  )}
                                  <p
                                    className={cn(
                                      "mt-1 whitespace-pre-wrap text-sm",
                                      isOwn && msg.kind !== "system"
                                        ? "text-white"
                                        : "text-slate-700",
                                    )}
                                  >
                                    {msg.content}
                                  </p>
                                  {msg.kind === "system" && msg.link && (
                                    <div className="mt-3">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setLocation(msg.link || "/nachrichten")}
                                      >
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Link oeffnen
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                <div
                                  className={cn(
                                    "flex gap-2 px-1",
                                    isOwn ? "justify-end" : "justify-start",
                                  )}
                                >
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 rounded-full px-3 text-xs text-slate-500 hover:text-blue-700"
                                    disabled={forwardingMessageId === msg.id}
                                    onClick={() => openForwardDialog(msg)}
                                  >
                                    <Forward className="mr-1 h-3.5 w-3.5" />
                                    Weiterleiten
                                  </Button>
                                  {canDeleteMessage && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 rounded-full px-3 text-xs text-slate-500 hover:text-red-600"
                                      disabled={deletingMessageId === msg.id}
                                      onClick={() => void handleDeleteMessage(msg)}
                                    >
                                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                                      Loeschen
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>

                    <Separator />

                    <div className="space-y-3 p-4">
                      {selectedThread.id === SYSTEM_THREAD_ID &&
                        canBroadcastSystemMessage && (
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                            <Input
                              placeholder="Titel der Systemnachricht..."
                              value={systemThreadTitleDraft}
                              onChange={(event) =>
                                setSystemThreadTitleDraft(event.target.value)
                              }
                            />
                            <Input
                              placeholder="Optionaler Link"
                              value={systemLink}
                              onChange={(event) => setSystemLink(event.target.value)}
                            />
                          </div>
                        )}
                      <Textarea
                        placeholder={
                          selectedThread.id === SYSTEM_THREAD_ID
                            ? canBroadcastSystemMessage
                              ? "Systemnachricht an alle schreiben..."
                              : "Systemnachrichten koennen nur von Admins geschrieben werden."
                            : "Antwort schreiben..."
                        }
                        value={messageDraft}
                        onChange={(event) => setMessageDraft(event.target.value)}
                        className="min-h-[96px] rounded-2xl border-slate-200 bg-white"
                        disabled={
                          selectedThread.id === SYSTEM_THREAD_ID &&
                          !canBroadcastSystemMessage
                        }
                      />
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                          {selectedThread.id === SYSTEM_THREAD_ID
                            ? canBroadcastSystemMessage
                              ? "Diese Nachricht wird als System-Thread an alle Benutzer verteilt."
                              : "Lesbar fuer alle, schreibbar nur fuer Admins."
                            : "Kurz, klar und mobil gut lesbar."}
                        </p>
                        <Button
                          type="button"
                          disabled={
                            !messageDraft.trim() ||
                            (selectedThread.id === SYSTEM_THREAD_ID &&
                              (!canBroadcastSystemMessage ||
                                !systemThreadTitleDraft.trim())) ||
                            isSendingSystemMessage
                          }
                          onClick={() => void handleSendMessage()}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {selectedThread.id === SYSTEM_THREAD_ID
                            ? "An alle senden"
                            : "Senden"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {inboxPaneMode === "notifications" && !selectedPortalNotification && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="rounded-full bg-blue-50 p-4 text-blue-600">
                      <Inbox className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        Einen Hinweis auswaehlen
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Links erscheinen alle nicht-chatbasierten Notifications mit Filter.
                      </p>
                    </div>
                  </div>
                )}

                {inboxPaneMode === "notifications" && selectedPortalNotification && (
                  <>
                    <div className="border-b px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "border",
                                getNotificationTone(selectedPortalNotification.type),
                              )}
                            >
                              {getNotificationTypeLabel(selectedPortalNotification.type)}
                            </Badge>
                            {selectedPortalNotification.isRead && (
                              <Badge variant="secondary">Gelesen</Badge>
                            )}
                          </div>
                          <p className="mt-3 text-lg font-semibold text-slate-900">
                            {selectedPortalNotification.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTimestamp(selectedPortalNotification.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-4 overflow-auto px-5 py-5">
                      <div className="rounded-[24px] border bg-white p-4 shadow-sm">
                        {selectedPortalNotification.message ? (
                          <p className="whitespace-pre-wrap text-sm text-slate-700">
                            {selectedPortalNotification.message}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Keine Zusatzinformation vorhanden.
                          </p>
                        )}
                        {selectedPortalNotification.isRead && (
                          (() => {
                            const actionInfo = getNotificationActionInfo(
                              selectedPortalNotification,
                            );
                            return actionInfo.details ? (
                              <p className="mt-3 text-xs text-slate-500">
                                Bearbeitung: {actionInfo.details}
                              </p>
                            ) : null;
                          })()
                        )}
                      </div>

                      {getZeitausgleichMetadata(selectedPortalNotification) && (
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-white p-4">
                          <span className="text-xs font-medium text-slate-700">
                            Zeitausgleich beantworten
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            disabled={processingNotificationIds.includes(
                              selectedPortalNotification.id,
                            )}
                            onClick={() =>
                              void handleZeitausgleichResponse(
                                selectedPortalNotification,
                                "accept",
                              )
                            }
                          >
                            Bestaetigen
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={processingNotificationIds.includes(
                              selectedPortalNotification.id,
                            )}
                            onClick={() =>
                              void handleZeitausgleichResponse(
                                selectedPortalNotification,
                                "decline",
                              )
                            }
                          >
                            Ablehnen
                          </Button>
                        </div>
                      )}

                      {getShiftSwapMetadata(selectedPortalNotification) && (
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-white p-4">
                          <span className="text-xs font-medium text-slate-700">
                            Diensttausch beantworten
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            disabled={processingNotificationIds.includes(
                              selectedPortalNotification.id,
                            )}
                            onClick={() =>
                              void handleShiftSwapResponse(
                                selectedPortalNotification,
                                "accept",
                              )
                            }
                          >
                            Annehmen
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={processingNotificationIds.includes(
                              selectedPortalNotification.id,
                            )}
                            onClick={() =>
                              void handleShiftSwapResponse(
                                selectedPortalNotification,
                                "reject",
                              )
                            }
                          >
                            Ablehnen
                          </Button>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                      <div className="flex flex-wrap gap-2">
                        {!selectedPortalNotification.isRead && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              void handleMarkRead(selectedPortalNotification)
                            }
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Gelesen
                          </Button>
                        )}
                        {selectedPortalNotification.link && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void handleOpenNotification(selectedPortalNotification)
                            }
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Oeffnen
                          </Button>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void handleDeleteNotification(selectedPortalNotification.id)
                        }
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Entfernen
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={composeOpen}
        onOpenChange={(open) => {
          setComposeOpen(open);
          if (!open) resetComposeDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Neue Nachricht</DialogTitle>
            <DialogDescription>
              Nachrichtentyp waehlen, Empfaenger festlegen und erste Nachricht senden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={composeMode === "direct" ? "default" : "outline"}
                onClick={() => setComposeMode("direct")}
              >
                <MailPlus className="mr-2 h-4 w-4" />
                Private Nachricht
              </Button>
              <Button
                type="button"
                variant={composeMode === "group" ? "default" : "outline"}
                onClick={() => setComposeMode("group")}
              >
                <Users className="mr-2 h-4 w-4" />
                Gruppennachricht
              </Button>
              {canBroadcastSystemMessage && (
                <Button
                  type="button"
                  variant={composeMode === "system" ? "default" : "outline"}
                  onClick={() => setComposeMode("system")}
                >
                  <Megaphone className="mr-2 h-4 w-4" />
                  Systemnachricht
                </Button>
              )}
            </div>

            {composeMode === "direct" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="compose-private-recipient-search">
                    Empfaenger suchen
                  </Label>
                  <Input
                    id="compose-private-recipient-search"
                    placeholder="Name eingeben..."
                    value={privateRecipientSearch}
                    onChange={(event) =>
                      setPrivateRecipientSearch(event.target.value)
                    }
                  />
                </div>
                <ScrollArea className="h-52 rounded-2xl border bg-slate-50/60 p-2">
                  <div className="space-y-1">
                    {filteredPrivateRecipients.map((entry) => {
                      const isSelected = entry.id === privateRecipientId;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition-colors",
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "hover:bg-white",
                          )}
                          onClick={() => setPrivateRecipientId(entry.id)}
                        >
                          <span className="font-medium">{getEmployeeName(entry)}</span>
                          {isSelected && <CheckCircle2 className="h-4 w-4" />}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
                <div className="rounded-2xl border border-dashed bg-slate-50/70 p-3 text-sm">
                  <span className="text-muted-foreground">Ausgewaehlt: </span>
                  <span className="font-medium text-slate-900">
                    {selectedPrivateRecipient
                      ? getEmployeeName(selectedPrivateRecipient)
                      : "noch niemand"}
                  </span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="compose-private-message">Nachricht</Label>
                  <Textarea
                    id="compose-private-message"
                    placeholder="Erste Nachricht schreiben..."
                    value={privateMessageDraft}
                    onChange={(event) =>
                      setPrivateMessageDraft(event.target.value)
                    }
                    className="min-h-[120px]"
                  />
                </div>
              </div>
            )}

            {composeMode === "group" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="compose-group-title">Gruppenname</Label>
                  <Input
                    id="compose-group-title"
                    placeholder="z.B. OP Team Mittwoch"
                    value={groupTitleDraft}
                    onChange={(event) => setGroupTitleDraft(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="compose-group-member-search">
                    Mitglieder suchen
                  </Label>
                  <Input
                    id="compose-group-member-search"
                    placeholder="Name filtern..."
                    value={groupMemberSearch}
                    onChange={(event) => setGroupMemberSearch(event.target.value)}
                  />
                </div>
                <ScrollArea className="h-52 rounded-2xl border bg-slate-50/60 p-2">
                  <div className="space-y-2">
                    {filteredGroupCandidates.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{getEmployeeName(entry)}</span>
                        <Checkbox
                          checked={groupMemberIds.includes(entry.id)}
                          onCheckedChange={() =>
                            toggleMemberSelection(
                              groupMemberIds,
                              setGroupMemberIds,
                              entry.id,
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </ScrollArea>
                <div className="space-y-2">
                  <Label htmlFor="compose-group-message">Erste Nachricht</Label>
                  <Textarea
                    id="compose-group-message"
                    placeholder="Erste Nachricht an die Gruppe..."
                    value={groupInitialMessage}
                    onChange={(event) =>
                      setGroupInitialMessage(event.target.value)
                    }
                    className="min-h-[110px]"
                  />
                </div>
                <label className="flex items-center gap-3 rounded-2xl border bg-slate-50/70 px-3 py-3 text-sm">
                  <Checkbox
                    checked={pinCreatedGroup}
                    onCheckedChange={(checked) => setPinCreatedGroup(Boolean(checked))}
                  />
                  <span>
                    Als persoenlichen Header-Button "Nachricht an Gruppe" hinterlegen
                  </span>
                </label>
              </div>
            )}

            {composeMode === "system" && canBroadcastSystemMessage && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="compose-system-title">Titel</Label>
                  <Input
                    id="compose-system-title"
                    placeholder="z.B. Wichtige Information fuer heute"
                    value={systemTitle}
                    onChange={(event) => setSystemTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="compose-system-message">Nachricht</Label>
                  <Textarea
                    id="compose-system-message"
                    placeholder="Systemnachricht an alle Benutzer..."
                    value={systemMessage}
                    onChange={(event) => setSystemMessage(event.target.value)}
                    className="min-h-[140px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="compose-system-link">Optionaler Link</Label>
                  <Input
                    id="compose-system-link"
                    placeholder="/admin/urlaubsplan oder /nachrichten?thread=12"
                    value={systemLink}
                    onChange={(event) => setSystemLink(event.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setComposeOpen(false);
                resetComposeDialog();
              }}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={isSubmittingCompose}
              onClick={() => void handleSubmitCompose()}
            >
              <Send className="mr-2 h-4 w-4" />
              Nachricht anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupEditOpen} onOpenChange={setGroupEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Gruppe bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-edit-title">Gruppenname</Label>
              <Input
                id="group-edit-title"
                value={groupTitle}
                onChange={(event) => setGroupTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-edit-search">Mitglieder suchen</Label>
              <Input
                id="group-edit-search"
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                placeholder="Name filtern..."
              />
            </div>
            <ScrollArea className="h-64 rounded-2xl border bg-slate-50/60 p-2">
              <div className="space-y-2">
                {filteredEditableGroupCandidates.map((entry) => (
                  <label
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{getEmployeeName(entry)}</span>
                    <Checkbox
                      checked={editableGroupMemberIds.includes(entry.id)}
                      onCheckedChange={() =>
                        toggleMemberSelection(
                          editableGroupMemberIds,
                          setEditableGroupMemberIds,
                          entry.id,
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setGroupEditOpen(false)}
            >
              Abbrechen
            </Button>
            <Button type="button" onClick={() => void handleSaveGroup()}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={forwardDialogOpen}
        onOpenChange={(open) => {
          setForwardDialogOpen(open);
          if (!open) resetForwardDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nachricht weiterleiten</DialogTitle>
            <DialogDescription>
              Ziel waehlen und die Nachricht mit optionalem Kommentar weiterleiten.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {messageToForward && (
              <div className="rounded-2xl border bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Vorschau
                </p>
                {messageToForward.kind === "system" && messageToForward.systemTitle && (
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {messageToForward.systemTitle}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {messageToForward.content}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={forwardMode === "direct" ? "default" : "outline"}
                onClick={() => setForwardMode("direct")}
              >
                <MailPlus className="mr-2 h-4 w-4" />
                Privat
              </Button>
              <Button
                type="button"
                variant={forwardMode === "group" ? "default" : "outline"}
                onClick={() => setForwardMode("group")}
              >
                <Users className="mr-2 h-4 w-4" />
                Gruppe
              </Button>
              {canBroadcastSystemMessage && (
                <Button
                  type="button"
                  variant={forwardMode === "system" ? "default" : "outline"}
                  onClick={() => setForwardMode("system")}
                >
                  <Megaphone className="mr-2 h-4 w-4" />
                  System
                </Button>
              )}
            </div>

            {forwardMode === "direct" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forward-recipient-search">Empfaenger suchen</Label>
                  <Input
                    id="forward-recipient-search"
                    placeholder="Name eingeben..."
                    value={forwardRecipientSearch}
                    onChange={(event) =>
                      setForwardRecipientSearch(event.target.value)
                    }
                  />
                </div>
                <ScrollArea className="h-52 rounded-2xl border bg-slate-50/60 p-2">
                  <div className="space-y-1">
                    {filteredForwardRecipients.map((entry) => {
                      const isSelected = entry.id === forwardRecipientId;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition-colors",
                            isSelected ? "bg-blue-600 text-white" : "hover:bg-white",
                          )}
                          onClick={() => setForwardRecipientId(entry.id)}
                        >
                          <span className="font-medium">{getEmployeeName(entry)}</span>
                          {isSelected && <CheckCircle2 className="h-4 w-4" />}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            {forwardMode === "group" && (
              <div className="space-y-2">
                <Label>Zielgruppe</Label>
                <div className="space-y-2">
                  {availableForwardGroupThreads.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Keine Gruppen verfuegbar.
                    </p>
                  )}
                  {availableForwardGroupThreads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition-colors",
                        forwardTargetThreadId === thread.id
                          ? "border-blue-200 bg-blue-50"
                          : "hover:border-slate-300 hover:bg-slate-50",
                      )}
                      onClick={() => setForwardTargetThreadId(thread.id)}
                    >
                      <span className="font-medium text-slate-900">
                        {getThreadTitle(thread)}
                      </span>
                      {forwardTargetThreadId === thread.id && (
                        <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {forwardMode === "system" && canBroadcastSystemMessage && (
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="forward-system-title">Titel</Label>
                  <Input
                    id="forward-system-title"
                    placeholder="Titel der Systemnachricht..."
                    value={forwardSystemTitle}
                    onChange={(event) => setForwardSystemTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forward-system-link">Optionaler Link</Label>
                  <Input
                    id="forward-system-link"
                    placeholder="/nachrichten?thread=12"
                    value={forwardLink}
                    onChange={(event) => setForwardLink(event.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="forward-comment">Kommentar optional</Label>
              <Textarea
                id="forward-comment"
                placeholder="Optionaler Einleitungstext..."
                value={forwardComment}
                onChange={(event) => setForwardComment(event.target.value)}
                className="min-h-[96px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setForwardDialogOpen(false);
                resetForwardDialog();
              }}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={!messageToForward || forwardingMessageId === messageToForward?.id}
              onClick={() => void handleForwardMessage()}
            >
              <Forward className="mr-2 h-4 w-4" />
              Weiterleiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
