import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  MessageSquare,
  Users,
  Trash2,
  Send,
  Plus,
  CheckCircle,
  Pencil
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import {
  notificationsApi,
  messagesApi,
  employeeApi,
  type MessageThreadListItem,
  type MessageWithSender
} from "@/lib/api";
import type { Employee, Notification } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

function formatTimestamp(value?: string | Date | null) {
  if (!value) return "";
  try {
    return format(new Date(value), "d. MMM yyyy HH:mm", { locale: de });
  } catch {
    return "";
  }
}

const normalizeWhitespace = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, " ");

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

function displayMemberName(member: { name?: string | null; lastName?: string | null }) {
  const name = dedupeAdjacentTokens(normalizeWhitespace(member.name));
  const lastName = dedupeAdjacentTokens(normalizeWhitespace(member.lastName));
  if (name && lastName) {
    const nameLower = name.toLowerCase();
    const lastLower = lastName.toLowerCase();
    if (nameLower === lastLower || nameLower.endsWith(` ${lastLower}`)) {
      return name;
    }
    return `${name} ${lastName}`;
  }
  return name || lastName || "Unbekannt";
}

export default function Messages() {
  const { toast } = useToast();
  const { employee, isAdmin, isTechnicalAdmin, capabilities } = useAuth();
  const [location, setLocation] = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [threads, setThreads] = useState<MessageThreadListItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [threadSearch, setThreadSearch] = useState("");
  const [messageDraft, setMessageDraft] = useState("");

  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [newThreadType, setNewThreadType] = useState<"direct" | "group">("direct");
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newThreadMemberIds, setNewThreadMemberIds] = useState<number[]>([]);
  const [newThreadSearch, setNewThreadSearch] = useState("");

  const [groupEditOpen, setGroupEditOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<number[]>([]);
  const [groupSearch, setGroupSearch] = useState("");

  const currentEmployeeId = employee?.id;
  const canManageGroups =
    isAdmin ||
    isTechnicalAdmin ||
    capabilities.includes("perm.message_group_manage");

  useEffect(() => {
    loadNotifications();
    loadThreads();
    loadEmployees();
  }, []);

  useEffect(() => {
    const searchIndex = location.indexOf("?");
    const search = searchIndex >= 0 ? location.slice(searchIndex) : "";
    const params = new URLSearchParams(search);
    const threadParam = params.get("thread");
    if (threadParam) {
      const parsed = Number(threadParam);
      if (!Number.isNaN(parsed)) {
        setSelectedThreadId(parsed);
      }
    }
  }, [location]);

  useEffect(() => {
    if (selectedThreadId) {
      loadMessages(selectedThreadId);
    } else {
      setMessages([]);
    }
  }, [selectedThreadId]);

  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const data = await notificationsApi.getAll();
      setNotifications(data);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Systemnachrichten konnten nicht geladen werden",
        variant: "destructive"
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
        description: "Nachrichten konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoadingThreads(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await employeeApi.getAll();
      setEmployees(data);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Mitarbeiter konnten nicht geladen werden",
        variant: "destructive"
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
        description: "Nachrichten konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoadingMessages(false);
    }
  };

  const filteredThreads = useMemo(() => {
    if (!threadSearch.trim()) return threads;
    const term = threadSearch.toLowerCase();
    return threads.filter((thread) => {
      const title = getThreadTitle(thread).toLowerCase();
      const preview = thread.lastMessage?.content?.toLowerCase() || "";
      return title.includes(term) || preview.includes(term);
    });
  }, [threads, threadSearch]);

  const filteredEmployees = useMemo(() => {
    const term = newThreadSearch.trim().toLowerCase();
    return employees.filter((emp) => {
      if (emp.id === currentEmployeeId) return false;
      const name = `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.toLowerCase();
      return !term || name.includes(term);
    });
  }, [employees, newThreadSearch, currentEmployeeId]);

  const filteredGroupEmployees = useMemo(() => {
    const term = groupSearch.trim().toLowerCase();
    return employees.filter((emp) => {
      if (emp.id === currentEmployeeId) return false;
      const name = `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.toLowerCase();
      return !term || name.includes(term);
    });
  }, [employees, groupSearch, currentEmployeeId]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const isGroupOwner = useMemo(() => {
    if (!selectedThread || !currentEmployeeId) return false;
    return selectedThread.members?.some(
      (member) => member.employeeId === currentEmployeeId && member.role === "owner"
    ) ?? false;
  }, [selectedThread, currentEmployeeId]);

  const canEditGroup = selectedThread?.type === "group" && (isGroupOwner || canManageGroups);

  const unreadNotifications = notifications.filter((note) => !note.isRead).length;

  const getThreadTitle = (thread: MessageThreadListItem) => {
    if (thread.type === "group") return thread.title || "Gruppe";
    const members = thread.members?.filter((member) => member.employeeId !== currentEmployeeId) || [];
    if (members.length) {
      return members.map(displayMemberName).join(", ");
    }
    return thread.title || "Direktnachricht";
  };

  const openThread = (threadId: number) => {
    setSelectedThreadId(threadId);
    setLocation(`/nachrichten?thread=${threadId}`);
  };

  const handleSendMessage = async () => {
    if (!selectedThreadId || !messageDraft.trim()) return;
    try {
      await messagesApi.sendMessage(selectedThreadId, messageDraft.trim());
      setMessageDraft("");
      loadMessages(selectedThreadId);
      loadThreads();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachricht konnte nicht gesendet werden",
        variant: "destructive"
      });
    }
  };

  const toggleMemberSelection = (
    list: number[],
    setter: (ids: number[]) => void,
    id: number
  ) => {
    if (list.includes(id)) {
      setter(list.filter((memberId) => memberId !== id));
    } else {
      setter([...list, id]);
    }
  };

  const handleCreateThread = async () => {
    if (!currentEmployeeId) return;
    if (!newThreadMemberIds.length) {
      toast({
        title: "Fehler",
        description: "Bitte mindestens einen Empfaenger waehlen",
        variant: "destructive"
      });
      return;
    }
    if (newThreadType === "group" && !newThreadTitle.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte einen Gruppennamen eingeben",
        variant: "destructive"
      });
      return;
    }

    try {
      const thread = await messagesApi.createThread({
        type: newThreadType,
        title: newThreadType === "group" ? newThreadTitle.trim() : undefined,
        memberIds: newThreadMemberIds
      });
      setNewThreadOpen(false);
      setNewThreadMemberIds([]);
      setNewThreadTitle("");
      setNewThreadSearch("");
      await loadThreads();
      openThread(thread.id);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Nachricht konnte nicht erstellt werden",
        variant: "destructive"
      });
    }
  };

  const openGroupEditor = () => {
    if (!selectedThread) return;
    setGroupTitle(selectedThread.title || "");
    setGroupMemberIds((selectedThread.members || []).map((member) => member.employeeId));
    setGroupSearch("");
    setGroupEditOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!selectedThread) return;
    if (!groupMemberIds.length) {
      toast({
        title: "Fehler",
        description: "Mindestens ein Mitglied muss vorhanden sein",
        variant: "destructive"
      });
      return;
    }

    try {
      const currentMemberIds = new Set((selectedThread.members || []).map((member) => member.employeeId));
      const desiredIds = new Set(groupMemberIds);
      const add = [...desiredIds].filter((id) => !currentMemberIds.has(id));
      const remove = [...currentMemberIds].filter((id) => !desiredIds.has(id) && id !== currentEmployeeId);

      if (selectedThread.title !== groupTitle.trim()) {
        await messagesApi.renameThread(selectedThread.id, groupTitle.trim());
      }
      if (add.length || remove.length) {
        await messagesApi.updateMembers(selectedThread.id, { add, remove });
      }

      setGroupEditOpen(false);
      loadThreads();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Gruppe konnte nicht aktualisiert werden",
        variant: "destructive"
      });
    }
  };

  const handleMarkRead = async (note: Notification) => {
    if (note.isRead) return;
    try {
      const updated = await notificationsApi.markRead(note.id);
      setNotifications((prev) => prev.map((item) => (item.id === note.id ? updated : item)));
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Benachrichtigung konnte nicht aktualisiert werden",
        variant: "destructive"
      });
    }
  };

  const handleDeleteNotification = async (noteId: number) => {
    try {
      await notificationsApi.delete(noteId);
      setNotifications((prev) => prev.filter((note) => note.id !== noteId));
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Benachrichtigung konnte nicht geloescht werden",
        variant: "destructive"
      });
    }
  };

  return (
    <Layout title="Nachrichten">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Nachrichten</h2>
          <p className="text-muted-foreground">
            Systemmeldungen und direkte Kommunikation innerhalb der Klinik.
          </p>
        </div>

        <Tabs defaultValue="system" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="system" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              System
              {unreadNotifications > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {unreadNotifications}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="chats" className="gap-2">
              <Users className="w-4 h-4" />
              Chats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="system" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Systemnachrichten</CardTitle>
                <Button size="sm" variant="outline" onClick={loadNotifications}>
                  Aktualisieren
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingNotifications && (
                  <p className="text-sm text-muted-foreground">Lade Systemnachrichten...</p>
                )}
                {!loadingNotifications && notifications.length === 0 && (
                  <p className="text-sm text-muted-foreground">Keine Systemnachrichten vorhanden.</p>
                )}
                {!loadingNotifications && notifications.length > 0 && (
                  <div className="space-y-3">
                    {notifications.map((note) => (
                      <div
                        key={note.id}
                        className={`rounded-lg border p-4 space-y-2 ${
                          note.isRead ? "bg-white" : "bg-blue-50/40"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{note.title}</p>
                            <p className="text-xs text-muted-foreground">{formatTimestamp(note.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!note.isRead && (
                              <Button size="sm" variant="secondary" onClick={() => handleMarkRead(note)}>
                                Gelesen
                              </Button>
                            )}
                            {note.link && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  handleMarkRead(note);
                                  setLocation(note.link || "/nachrichten");
                                }}
                              >
                                Oeffnen
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteNotification(note.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        {note.message && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {note.message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chats" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
              <Card className="h-[680px] flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Threads</CardTitle>
                  <Button size="sm" onClick={() => setNewThreadOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Neu
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  <Input
                    placeholder="Threads durchsuchen..."
                    value={threadSearch}
                    onChange={(event) => setThreadSearch(event.target.value)}
                  />
                  <ScrollArea className="flex-1 pr-2">
                    {loadingThreads && (
                      <p className="text-sm text-muted-foreground">Lade Threads...</p>
                    )}
                    {!loadingThreads && filteredThreads.length === 0 && (
                      <p className="text-sm text-muted-foreground">Keine Threads gefunden.</p>
                    )}
                    {!loadingThreads && filteredThreads.length > 0 && (
                      <div className="space-y-2">
                        {filteredThreads.map((thread) => {
                          const isActive = thread.id === selectedThreadId;
                          return (
                            <button
                              key={thread.id}
                              type="button"
                              onClick={() => openThread(thread.id)}
                              className={`w-full text-left border rounded-lg p-3 transition-colors ${
                                isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold line-clamp-1">
                                  {getThreadTitle(thread)}
                                </p>
                                {thread.type === "group" && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Gruppe
                                  </Badge>
                                )}
                              </div>
                              {thread.lastMessage && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                  {thread.lastMessage.content}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="h-[680px] flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {selectedThread ? getThreadTitle(selectedThread) : "Thread auswaehlen"}
                    </CardTitle>
                    {selectedThread && (
                      <p className="text-xs text-muted-foreground">
                        {selectedThread.type === "group" ? "Gruppe" : "Direktnachricht"}
                      </p>
                    )}
                  </div>
                  {selectedThread && canEditGroup && (
                    <Button size="sm" variant="outline" onClick={openGroupEditor}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Gruppe bearbeiten
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  {!selectedThread && (
                    <div className="text-sm text-muted-foreground">
                      Bitte einen Thread auswaehlen, um Nachrichten zu sehen.
                    </div>
                  )}
                  {selectedThread && (
                    <>
                      <ScrollArea className="flex-1 pr-2">
                        {loadingMessages && (
                          <p className="text-sm text-muted-foreground">Lade Nachrichten...</p>
                        )}
                        {!loadingMessages && messages.length === 0 && (
                          <p className="text-sm text-muted-foreground">Noch keine Nachrichten.</p>
                        )}
                        {!loadingMessages && messages.length > 0 && (
                          <div className="space-y-3">
                            {messages.map((msg) => {
                              const isOwn = msg.senderId === currentEmployeeId;
                              return (
                                <div
                                  key={msg.id}
                                  className={`rounded-lg p-3 border ${
                                    isOwn ? "bg-primary/5 border-primary/20" : "bg-white"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">
                                      {msg.senderName || msg.senderLastName
                                        ? displayMemberName({
                                            name: msg.senderName,
                                            lastName: msg.senderLastName
                                          })
                                        : "Unbekannt"}
                                    </p>
                                    <span className="text-xs text-muted-foreground">
                                      {formatTimestamp(msg.createdAt)}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                                    {msg.content}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </ScrollArea>
                      <Separator />
                      <div className="flex items-end gap-2">
                        <Textarea
                          placeholder="Nachricht schreiben..."
                          value={messageDraft}
                          onChange={(event) => setMessageDraft(event.target.value)}
                          className="min-h-[80px]"
                        />
                        <Button onClick={handleSendMessage} disabled={!messageDraft.trim()}>
                          <Send className="w-4 h-4 mr-1" />
                          Senden
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={newThreadOpen} onOpenChange={setNewThreadOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Neue Nachricht</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={newThreadType === "direct" ? "default" : "outline"}
                onClick={() => setNewThreadType("direct")}
              >
                Direkt
              </Button>
              <Button
                type="button"
                variant={newThreadType === "group" ? "default" : "outline"}
                onClick={() => setNewThreadType("group")}
              >
                Gruppe
              </Button>
            </div>
            {newThreadType === "group" && (
              <Input
                placeholder="Gruppenname"
                value={newThreadTitle}
                onChange={(event) => setNewThreadTitle(event.target.value)}
              />
            )}
            <Input
              placeholder="Mitarbeiter suchen..."
              value={newThreadSearch}
              onChange={(event) => setNewThreadSearch(event.target.value)}
            />
            <ScrollArea className="max-h-60 pr-2">
              <div className="space-y-2">
                {filteredEmployees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={newThreadMemberIds.includes(emp.id)}
                      onCheckedChange={() =>
                        toggleMemberSelection(newThreadMemberIds, setNewThreadMemberIds, emp.id)
                      }
                    />
                    <span>{emp.firstName} {emp.lastName}</span>
                    <span className="text-xs text-muted-foreground">{emp.role}</span>
                  </label>
                ))}
                {filteredEmployees.length === 0 && (
                  <p className="text-sm text-muted-foreground">Keine Mitarbeiter gefunden.</p>
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setNewThreadOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreateThread}>
              <CheckCircle className="w-4 h-4 mr-1" />
              Erstellen
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
            <Input
              placeholder="Gruppenname"
              value={groupTitle}
              onChange={(event) => setGroupTitle(event.target.value)}
            />
            <Input
              placeholder="Mitglieder suchen..."
              value={groupSearch}
              onChange={(event) => setGroupSearch(event.target.value)}
            />
            <ScrollArea className="max-h-60 pr-2">
              <div className="space-y-2">
                {filteredGroupEmployees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={groupMemberIds.includes(emp.id)}
                      onCheckedChange={() =>
                        toggleMemberSelection(groupMemberIds, setGroupMemberIds, emp.id)
                      }
                    />
                    <span>{emp.firstName} {emp.lastName}</span>
                    <span className="text-xs text-muted-foreground">{emp.role}</span>
                  </label>
                ))}
                {filteredGroupEmployees.length === 0 && (
                  <p className="text-sm text-muted-foreground">Keine Mitarbeiter gefunden.</p>
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setGroupEditOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveGroup}>
              <CheckCircle className="w-4 h-4 mr-1" />
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
