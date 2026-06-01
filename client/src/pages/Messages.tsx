import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Employee, Notification } from "@shared/schema";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
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
  messagesApi,
  notificationsApi,
  plannedAbsencesAdminApi,
  shiftSwapApi,
  type MessageThreadListItem,
  type MessageWithSender,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const FAVORITE_GROUP_KEY_PREFIX = "cliniq_messages_favorite_group";

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

const getThreadPreview = (thread: MessageThreadListItem) =>
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
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [processingNotificationIds, setProcessingNotificationIds] = useState<
    number[]
  >([]);

  const [privateRecipientSearch, setPrivateRecipientSearch] = useState("");
  const [privateRecipientId, setPrivateRecipientId] = useState<number | null>(
    null,
  );
  const [privateMessageDraft, setPrivateMessageDraft] = useState("");
  const [isStartingDirectMessage, setIsStartingDirectMessage] = useState(false);

  const [systemTitle, setSystemTitle] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [systemLink, setSystemLink] = useState("");
  const [isSendingSystemMessage, setIsSendingSystemMessage] = useState(false);

  const [groupTitleDraft, setGroupTitleDraft] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<number[]>([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [groupInitialMessage, setGroupInitialMessage] = useState("");
  const [pinCreatedGroup, setPinCreatedGroup] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const [groupEditOpen, setGroupEditOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [editableGroupMemberIds, setEditableGroupMemberIds] = useState<
    number[]
  >([]);

  const [favoriteGroupThreadId, setFavoriteGroupThreadId] = useState<
    number | null
  >(null);

  const currentEmployeeId = employee?.id ?? null;
  const canBroadcastSystemMessage = isAdmin || isTechnicalAdmin;
  const canManageGroups =
    isAdmin || isTechnicalAdmin || can("message_group.manage");

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
    if (selectedThreadId) {
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

  const filteredThreads = useMemo(() => {
    const term = threadSearch.trim().toLowerCase();
    if (!term) return threads;
    return threads.filter((thread) => {
      const title = getThreadTitle(thread).toLowerCase();
      const preview = getThreadPreview(thread).toLowerCase();
      return title.includes(term) || preview.includes(term);
    });
  }, [threadSearch, threads]);

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

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [selectedThreadId, threads],
  );

  const selectedPrivateRecipient = useMemo(
    () =>
      allReachableEmployees.find((entry) => entry.id === privateRecipientId) ||
      null,
    [allReachableEmployees, privateRecipientId],
  );

  const groupThreads = useMemo(
    () => threads.filter((thread) => thread.type === "group"),
    [threads],
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
    selectedThread?.type === "group" && (isGroupOwner || canManageGroups);

  const unreadNotifications = useMemo(
    () => notifications.filter((note) => !note.isRead),
    [notifications],
  );
  const processedNotifications = useMemo(
    () => notifications.filter((note) => note.isRead),
    [notifications],
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
    setSelectedThreadId(threadId);
    setLocation(`/nachrichten?thread=${threadId}`);
    const workspace = document.getElementById("chat-workspace");
    workspace?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const jumpToSection = (id: string) => {
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSendMessage = async () => {
    if (!selectedThreadId || !messageDraft.trim()) return;
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
      setPrivateMessageDraft("");
      setPrivateRecipientSearch("");
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
    if (!groupTitleDraft.trim() || groupMemberIds.length === 0) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte Gruppenname und Mitglieder auswaehlen.",
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
      if (groupInitialMessage.trim()) {
        await messagesApi.sendMessage(thread.id, groupInitialMessage.trim());
      }
      if (pinCreatedGroup) {
        storeFavoriteGroup(thread.id);
      }
      setGroupTitleDraft("");
      setGroupMemberIds([]);
      setGroupMemberSearch("");
      setGroupInitialMessage("");
      setPinCreatedGroup(false);
      await loadThreads();
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

  const handleSendSystemMessage = async () => {
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
      const result = await notificationsApi.broadcast({
        title: systemTitle.trim(),
        message: systemMessage.trim(),
        link: systemLink.trim() || undefined,
      });
      setSystemTitle("");
      setSystemMessage("");
      setSystemLink("");
      toast({
        title: "Systemnachricht versendet",
        description: `${result.count} Benutzer wurden informiert.`,
      });
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
      <div className="mx-auto max-w-7xl space-y-6 pb-8">
        <section className="overflow-hidden rounded-[30px] border border-blue-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.28),_transparent_35%),linear-gradient(135deg,_#155EEF_0%,_#1D4ED8_40%,_#153EAD_100%)] text-white shadow-[0_24px_80px_-32px_rgba(21,94,239,0.8)]">
          <div className="grid gap-6 px-6 py-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:px-8">
            <div className="space-y-4">
              <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">
                Nachrichtenportal
              </Badge>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight">
                  Ein Posteingang fuer Hinweise, Chats und Gruppen
                </h2>
                <p className="max-w-2xl text-sm text-blue-50/90 md:text-base">
                  Mobile zuerst gedacht: oben die wichtigsten Aktionen, darunter neue
                  Nachrichten, bearbeitete Vorgaeenge und ein Chat-Bereich wie bei
                  Messenger- und Mail-Clients.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="border-white/20 bg-white text-blue-700 hover:bg-blue-50"
                  onClick={() => jumpToSection("private-compose")}
                >
                  <MailPlus className="mr-2 h-4 w-4" />
                  Privat schreiben
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/25 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => jumpToSection("group-compose")}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Gruppe anlegen
                </Button>
                {canBroadcastSystemMessage && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/25 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => jumpToSection("system-compose")}
                  >
                    <Megaphone className="mr-2 h-4 w-4" />
                    Systemnachricht
                  </Button>
                )}
                {favoriteGroupThread && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/25 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => openThread(favoriteGroupThread.id)}
                  >
                    <Pin className="mr-2 h-4 w-4" />
                    Nachricht an Gruppe
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-blue-100/90">
                  Neu
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {loadingNotifications ? "..." : unreadNotifications.length}
                </p>
                <p className="mt-1 text-xs text-blue-100/85">
                  offene Hinweise und Eingaenge
                </p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-blue-100/90">
                  Chats
                </p>
                <p className="mt-2 text-3xl font-semibold">
                  {loadingThreads ? "..." : threads.length}
                </p>
                <p className="mt-1 text-xs text-blue-100/85">
                  direkte Dialoge und Gruppen
                </p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-blue-100/90">
                  Favorit
                </p>
                <p className="mt-2 line-clamp-2 text-base font-semibold">
                  {favoriteGroupThread ? getThreadTitle(favoriteGroupThread) : "Keine Gruppe fixiert"}
                </p>
                <p className="mt-1 text-xs text-blue-100/85">
                  oben als Schnellzugriff ablegbar
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-6">
            <Card className="border-blue-100/80 shadow-sm" id="new-inbox">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Inbox className="h-5 w-5 text-blue-600" />
                    Neue Nachrichten
                  </CardTitle>
                  <CardDescription>
                    Alles, was noch offen ist und auch in der Dashboard-Kachel sichtbar bleibt.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadNotifications()}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Aktualisieren
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
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
                  unreadNotifications.map((note) => {
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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn("border", getNotificationTone(note.type))}
                              >
                                {getNotificationTypeLabel(note.type)}
                              </Badge>
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

          <div className="space-y-6">
            <Card className="shadow-sm" id="private-compose">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <MailPlus className="h-5 w-5 text-blue-600" />
                  Private Nachricht
                </CardTitle>
                <CardDescription>
                  Direkt an eine Person schreiben und den Thread sofort im Workspace oeffnen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="private-recipient-search">Empfaenger suchen</Label>
                  <Input
                    id="private-recipient-search"
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
                  <Label htmlFor="private-message">Nachricht</Label>
                  <Textarea
                    id="private-message"
                    placeholder="Kurz und direkt wie in einem Messenger..."
                    value={privateMessageDraft}
                    onChange={(event) =>
                      setPrivateMessageDraft(event.target.value)
                    }
                    className="min-h-[120px]"
                  />
                </div>

                <Button
                  type="button"
                  className="w-full"
                  disabled={isStartingDirectMessage}
                  onClick={() => void handleCreateDirectMessage()}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Direktnachricht starten
                </Button>
              </CardContent>
            </Card>

            {canBroadcastSystemMessage && (
              <Card className="shadow-sm" id="system-compose">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Megaphone className="h-5 w-5 text-blue-600" />
                    Systemnachricht an alle
                  </CardTitle>
                  <CardDescription>
                    Nur fuer Admins. Die Nachricht landet bei allen Benutzern im Eingang.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="system-title">Titel</Label>
                    <Input
                      id="system-title"
                      placeholder="z.B. Wichtige Information fuer heute"
                      value={systemTitle}
                      onChange={(event) => setSystemTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="system-message">Nachricht</Label>
                    <Textarea
                      id="system-message"
                      placeholder="Klar, kurz und mit Handlungsbezug..."
                      value={systemMessage}
                      onChange={(event) => setSystemMessage(event.target.value)}
                      className="min-h-[140px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="system-link">Optionaler Link</Label>
                    <Input
                      id="system-link"
                      placeholder="/admin/urlaubsplan oder /nachrichten?thread=12"
                      value={systemLink}
                      onChange={(event) => setSystemLink(event.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={isSendingSystemMessage}
                    onClick={() => void handleSendSystemMessage()}
                  >
                    <Megaphone className="mr-2 h-4 w-4" />
                    An alle senden
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-sm" id="group-compose">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Users className="h-5 w-5 text-blue-600" />
                  Gruppe erstellen
                </CardTitle>
                <CardDescription>
                  Fuer Teams, Projekte oder Bereitschaften. Jede Person darf Gruppen anlegen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="group-title">Gruppenname</Label>
                  <Input
                    id="group-title"
                    placeholder="z.B. OP Team Mittwoch"
                    value={groupTitleDraft}
                    onChange={(event) => setGroupTitleDraft(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="group-member-search">Mitglieder suchen</Label>
                  <Input
                    id="group-member-search"
                    placeholder="Name filtern..."
                    value={groupMemberSearch}
                    onChange={(event) =>
                      setGroupMemberSearch(event.target.value)
                    }
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
                  <Label htmlFor="group-message">Erste Nachricht</Label>
                  <Textarea
                    id="group-message"
                    placeholder="Optional: Begruessung oder Anlass der Gruppe..."
                    value={groupInitialMessage}
                    onChange={(event) =>
                      setGroupInitialMessage(event.target.value)
                    }
                    className="min-h-[100px]"
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

                <Button
                  type="button"
                  className="w-full"
                  disabled={isCreatingGroup}
                  onClick={() => void handleCreateGroup()}
                >
                  <MessageSquarePlus className="mr-2 h-4 w-4" />
                  Gruppe erstellen
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="shadow-sm" id="chat-workspace">
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
                onClick={() => void loadThreads()}
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
                <Input
                  placeholder="Chats durchsuchen..."
                  value={threadSearch}
                  onChange={(event) => setThreadSearch(event.target.value)}
                />
                <ScrollArea
                  className={cn(
                    "rounded-3xl border bg-slate-50/60 p-3",
                    isMobile ? "h-[300px]" : "h-[560px]",
                  )}
                >
                  {loadingThreads && (
                    <p className="text-sm text-muted-foreground">Lade Chats...</p>
                  )}
                  {!loadingThreads && filteredThreads.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Keine passenden Threads gefunden.
                    </p>
                  )}
                  {!loadingThreads && filteredThreads.length > 0 && (
                    <div className="space-y-2">
                      {filteredThreads.map((thread) => {
                        const isActive = selectedThreadId === thread.id;
                        const isFavoriteGroup =
                          thread.type === "group" &&
                          favoriteGroupThreadId === thread.id;
                        return (
                          <button
                            key={thread.id}
                            type="button"
                            onClick={() => openThread(thread.id)}
                            className={cn(
                              "w-full rounded-3xl border px-4 py-3 text-left transition-all",
                              isActive
                                ? "border-blue-200 bg-blue-50 shadow-sm"
                                : "bg-white hover:border-blue-100 hover:bg-slate-50",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {getThreadTitle(thread)}
                                  </p>
                                  {thread.type === "group" && (
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
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {formatTimestamp(
                                  thread.lastMessage?.createdAt || thread.createdAt,
                                )}
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
                {!selectedThread && (
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

                {selectedThread && (
                  <>
                    <div className="border-b px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-slate-900">
                            {getThreadTitle(selectedThread)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedThread.type === "group"
                              ? `${selectedThread.members?.length || 0} Mitglieder`
                              : "Direktnachricht"}
                          </p>
                        </div>
                        {selectedThread.type === "group" && (
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
                      {!loadingMessages && messages.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Noch keine Nachrichten in diesem Thread.
                        </p>
                      )}
                      {!loadingMessages && messages.length > 0 && (
                        <div className="space-y-3">
                          {messages.map((msg) => {
                            const isOwn = msg.senderId === currentEmployeeId;
                            return (
                              <div
                                key={msg.id}
                                className={cn(
                                  "flex",
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
                                  <p
                                    className={cn(
                                      "mt-1 whitespace-pre-wrap text-sm",
                                      isOwn ? "text-white" : "text-slate-700",
                                    )}
                                  >
                                    {msg.content}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>

                    <Separator />

                    <div className="space-y-3 p-4">
                      <Textarea
                        placeholder="Antwort schreiben..."
                        value={messageDraft}
                        onChange={(event) => setMessageDraft(event.target.value)}
                        className="min-h-[96px] rounded-2xl border-slate-200 bg-white"
                      />
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                          Kurz, klar und mobil gut lesbar.
                        </p>
                        <Button
                          type="button"
                          disabled={!messageDraft.trim()}
                          onClick={() => void handleSendMessage()}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Senden
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
    </Layout>
  );
}
