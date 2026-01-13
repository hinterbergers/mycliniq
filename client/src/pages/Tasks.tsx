import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { MarkdownViewer } from "@/components/editor/MarkdownEditor";
import {
  tasksApi,
  TaskItem,
  TaskLifecycleStatus,
  TaskType,
  TaskUpdatePayload,
  employeeApi,
} from "@/lib/api";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, ListCheck, CheckCircle } from "lucide-react";
import type { Employee } from "@shared/schema";

const VIEW_OPTIONS: Array<{
  value: "my" | "team" | "responsibilities";
  label: string;
}> = [
  { value: "my", label: "Meine Aufgaben" },
  { value: "team", label: "Team" },
  { value: "responsibilities", label: "Daueraufgaben" },
];

const STATUS_BADGE_STYLES: Record<TaskLifecycleStatus, string> = {
  NOT_STARTED: "bg-slate-50 text-slate-900 border-slate-200",
  IN_PROGRESS: "bg-amber-50 text-amber-900 border-amber-200",
  SUBMITTED: "bg-blue-50 text-blue-900 border-blue-200",
  DONE: "bg-emerald-50 text-emerald-900 border-emerald-200",
};

const STATUS_LABELS: Record<TaskLifecycleStatus, string> = {
  NOT_STARTED: "Nicht begonnen",
  IN_PROGRESS: "In Arbeit",
  SUBMITTED: "Zur Freigabe eingereicht",
  DONE: "Abgeschlossen",
};

const TYPE_LABELS: Record<TaskType, string> = {
  ONE_OFF: "Einmalig",
  RESPONSIBILITY: "Verantwortung",
};

const TYPE_BADGE_STYLES: Record<TaskType, string> = {
  ONE_OFF: "bg-slate-100 text-slate-700 border-slate-200",
  RESPONSIBILITY: "bg-violet-50 text-violet-900 border-violet-200",
};

export default function Tasks() {
  const { toast } = useToast();
  const [view, setView] = useState<"my" | "team" | "responsibilities">("my");
  const [statusFilter, setStatusFilter] = useState<TaskLifecycleStatus | "all">(
    "all",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    status: "NOT_STARTED" as TaskLifecycleStatus,
    type: "ONE_OFF" as TaskType,
    dueDate: "",
  });
  const [saving, setSaving] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtasks, setSubtasks] = useState<TaskItem[]>([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [updatingSubtaskId, setUpdatingSubtaskId] = useState<number | null>(
    null,
  );
  const [parentCompleting, setParentCompleting] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await tasksApi.list({ view });
      setTasks(data);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message ||
          "Aufgaben konnten nicht geladen werden. Bitte neu laden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTaskDetail = async (taskId: number) => {
    setDetailLoading(true);
    try {
      const detail = await tasksApi.getById(taskId);
      setSelectedTask(detail);
      setIsEditing(false);
      setSubtaskTitle("");
      setAddingSubtask(false);
      await fetchSubtasks(detail.id);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message ||
          "Aufgabe konnte nicht geladen werden. Bitte neu auswählen.",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchSubtasks = async (parentId: number) => {
    setSubtasksLoading(true);
    try {
      const data = await tasksApi.getSubtasks(parentId);
      setSubtasks(data);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message || "Unteraufgaben konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setSubtasksLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [view]);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const result = await employeeApi.getAll();
        setEmployees(result);
      } catch (error: any) {
        toast({
          title: "Fehler",
          description:
            error?.message || "Mitarbeiter konnten nicht geladen werden.",
          variant: "destructive",
        });
      }
    };
    fetchEmployees();
  }, [toast]);

  useEffect(() => {
    if (!selectedTask) return;
    setEditForm({
      title: selectedTask.title,
      description: selectedTask.description ?? "",
      status: selectedTask.status,
      type: selectedTask.type,
      dueDate: selectedTask.dueDate ?? "",
    });
  }, [selectedTask]);

  const filteredTasks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return tasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }
      if (term) {
        const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
        return haystack.includes(term);
      }
      return true;
    });
  }, [searchTerm, tasks, statusFilter]);

  const assigneeOptions = useMemo(() => {
    return [...employees]
      .sort((a, b) => {
        const nameA = (a.lastName || a.name || "").toLowerCase();
        const nameB = (b.lastName || b.name || "").toLowerCase();
        if (nameA === nameB) return 0;
        return nameA.localeCompare(nameB);
      })
      .map((emp) => ({
        value: String(emp.id),
        label: `${emp.name}${emp.lastName ? ` ${emp.lastName}` : ""}`.trim(),
      }));
  }, [employees]);

  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter((subtask) => subtask.status === "DONE")
    .length;
  const progressPercent = totalSubtasks
    ? Math.min(100, Math.round((completedSubtasks / totalSubtasks) * 100))
    : 0;
  const showParentComplete =
    Boolean(selectedTask) &&
    totalSubtasks > 0 &&
    completedSubtasks === totalSubtasks &&
    selectedTask?.status !== "DONE";

  const handleSelect = (task: TaskItem) => {
    loadTaskDetail(task.id);
  };

  const handleSave = async () => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      await tasksApi.update(selectedTask.id, {
        title: editForm.title.trim(),
        description: editForm.description || null,
        dueDate: editForm.dueDate || null,
        status: editForm.status,
        type: editForm.type,
      });
      await loadTaskDetail(selectedTask.id);
      await loadTasks();
      toast({
        title: "Erfolgreich",
        description: "Aufgabe wurde aktualisiert.",
      });
      setIsEditing(false);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message || "Aufgabe konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubtask = async () => {
    if (!selectedTask) return;
    if (!subtaskTitle.trim()) {
      toast({
        title: "Titel fehlt",
        description: "Bitte einen Titel für die Unteraufgabe eingeben.",
      });
      return;
    }
    setAddingSubtask(true);
    try {
      await tasksApi.createSubtask(selectedTask.id, {
        title: subtaskTitle.trim(),
        type: "ONE_OFF",
      });
      setSubtaskTitle("");
      await loadTaskDetail(selectedTask.id);
      toast({
        title: "Unteraufgabe",
        description: "Unteraufgabe wurde hinzugefügt.",
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message || "Unteraufgabe konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleCreateWorkSubtask = async () => {
    if (!selectedTask || selectedTask.type !== "RESPONSIBILITY") return;
    const now = new Date();
    const dueDate = now.toISOString().slice(0, 10);
    const title = `${selectedTask.title} – Check ${format(now, "dd.MM.yyyy")}`;
    setAddingSubtask(true);
    try {
      await tasksApi.createSubtask(selectedTask.id, {
        title,
        dueDate,
        type: "ONE_OFF",
      });
      setSubtaskTitle("");
      await loadTaskDetail(selectedTask.id);
      toast({
        title: "Arbeits-Unteraufgabe",
        description: "Neue Unteraufgabe wurde angelegt.",
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message || "Arbeits-Unteraufgabe konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleSubtaskUpdate = async (
    subtaskId: number,
    payload: TaskUpdatePayload,
  ) => {
    setUpdatingSubtaskId(subtaskId);
    try {
      await tasksApi.update(subtaskId, payload);
      if (selectedTask) {
        await loadTaskDetail(selectedTask.id);
      }
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message || "Unteraufgabe konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    } finally {
      setUpdatingSubtaskId(null);
    }
  };

  const handleSubtaskKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddSubtask();
    }
  };

  const handleCompleteParent = async () => {
    if (!selectedTask) return;
    setParentCompleting(true);
    try {
      await tasksApi.update(selectedTask.id, { status: "DONE" });
      await loadTaskDetail(selectedTask.id);
      await loadTasks();
      toast({
        title: "Elternaufgabe",
        description: "Elternaufgabe wurde als DONE markiert.",
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message ||
          "Elternaufgabe konnte nicht als abgeschlossen markiert werden.",
        variant: "destructive",
      });
    } finally {
      setParentCompleting(false);
    }
  };

  const updateStatus = async (
    status: TaskLifecycleStatus,
    toastMessage: string,
  ) => {
    if (!selectedTask) return;
    setWorkflowLoading(true);
    try {
      await tasksApi.update(selectedTask.id, { status });
      await loadTaskDetail(selectedTask.id);
      await loadTasks();
      toast({
        title: "Erfolgreich",
        description: toastMessage,
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message || "Status konnte nicht geändert werden.",
        variant: "destructive",
      });
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleSubmitForApproval = () =>
    updateStatus(
      "SUBMITTED",
      "Aufgabe wurde zur Freigabe eingereicht.",
    );

  const handleRevertToInProgress = () =>
    updateStatus("IN_PROGRESS", "Aufgabe wurde zurück in Arbeit gestellt.");

  const handleMarkDone = () =>
    updateStatus("DONE", "Aufgabe wurde als abgeschlossen markiert.");

  const formatDate = (value?: string | null) => {
    if (!value) return "Keine Frist";
    try {
      return format(new Date(value), "dd.MM.yyyy");
    } catch {
      return value;
    }
  };

  return (
    <Layout title="Aufgaben">
      <div className="grid gap-4 md:grid-cols-[220px_2fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Filter</CardTitle>
            <CardDescription>Wähle deine Ansicht</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              {VIEW_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={view === option.value ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setView(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <div className="flex flex-wrap gap-2">
                {["all", "NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "DONE"].map(
                  (value) => {
                    const statusValue = value as TaskLifecycleStatus | "all";
                    const label =
                      statusValue === "all"
                        ? "Alle"
                        : STATUS_LABELS[statusValue];
                    return (
                      <Button
                        key={value}
                        size="sm"
                        variant={
                          statusFilter === statusValue ? "default" : "outline"
                        }
                        onClick={() => setStatusFilter(statusValue)}
                      >
                        {label}
                      </Button>
                    );
                  },
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <CardTitle>Aufgabenliste</CardTitle>
              <div className="flex items-center gap-2">
                <ListCheck className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {filteredTasks.length} Aufgaben
                </span>
              </div>
            </div>
            <CardDescription>
              Suche &amp; wähle eine Aufgabe, um Details zu sehen.
            </CardDescription>
            <Input
              placeholder="Suche in Aufgaben..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-sm text-muted-foreground">
                Keine Aufgaben in dieser Ansicht.
              </div>
            ) : (
              <div className="divide-y divide-border max-h-[700px] overflow-y-auto">
                {filteredTasks.map((task) => {
                  const isActive = selectedTask?.id === task.id;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => handleSelect(task)}
                      className={`w-full text-left px-4 py-3 transition ${
                        isActive
                          ? "bg-primary/10"
                          : "hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{task.title}</span>
                          <div className="flex items-center gap-2">
                            <Badge className={STATUS_BADGE_STYLES[task.status]}>
                              {STATUS_LABELS[task.status]}
                            </Badge>
                            {task.type === "RESPONSIBILITY" && (
                              <Badge className={TYPE_BADGE_STYLES[task.type]}>
                                Daueraufgabe
                              </Badge>
                            )}
                          </div>
                        </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {task.assignedTo ? (
                          <span>
                            {task.assignedTo.name} {task.assignedTo.lastName}
                          </span>
                        ) : (
                          <span>Unassigned</span>
                        )}
                        <span>Typ: {TYPE_LABELS[task.type]}</span>
                        <span>Fällig: {formatDate(task.dueDate)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Detailansicht</CardTitle>
                <CardDescription>Lesen oder bearbeiten</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing((prev) => !prev)}
                  disabled={!selectedTask || workflowLoading}
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  {isEditing ? "Abbrechen" : "Bearbeiten"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    selectedTask && setAddingSubtask((prev) => !prev)
                  }
                  disabled={!selectedTask || workflowLoading}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Unteraufgabe hinzufügen
                </Button>
              </div>
            </div>
            {selectedTask && !isEditing && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedTask.status !== "SUBMITTED" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSubmitForApproval}
                    disabled={workflowLoading}
                  >
                    Zur Freigabe einreichen
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRevertToInProgress}
                      disabled={workflowLoading}
                    >
                      Zurück zu In Arbeit
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleMarkDone}
                      disabled={workflowLoading}
                    >
                      Als erledigt markieren
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : !selectedTask ? (
              <div className="flex h-60 flex-col items-center justify-center text-muted-foreground">
                Wähle eine Aufgabe, um Details zu sehen.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Titel</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-semibold">
                        {selectedTask.title}
                      </p>
                      {selectedTask.type === "RESPONSIBILITY" && (
                        <Badge className={TYPE_BADGE_STYLES[selectedTask.type]}>
                          Daueraufgabe
                        </Badge>
                      )}
                    </div>
                    <Badge className={STATUS_BADGE_STYLES[selectedTask.status]}>
                      {STATUS_LABELS[selectedTask.status]}
                    </Badge>
                  </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>Typ: {TYPE_LABELS[selectedTask.type]}</p>
                      <p>Fällig: {formatDate(selectedTask.dueDate)}</p>
                      <p>
                        Unteraufgaben: {completedSubtasks}/{totalSubtasks}
                      </p>
                    </div>
                </div>
                <Separator />
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Titel
                      </p>
                      <Input
                        value={editForm.title}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            title: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </p>
                        <Select
                          value={editForm.status}
                          onValueChange={(value) =>
                            setEditForm((prev) => ({
                              ...prev,
                              status: value as TaskLifecycleStatus,
                            }))
                          }
                          disabled={saving}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_LABELS).map(([status, label]) => (
                              <SelectItem key={status} value={status}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Typ
                        </p>
                        <Select
                          value={editForm.type}
                          onValueChange={(value) =>
                            setEditForm((prev) => ({
                              ...prev,
                              type: value as TaskType,
                            }))
                          }
                          disabled={saving}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(TYPE_LABELS).map(([type, label]) => (
                              <SelectItem key={type} value={type}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Fälligkeitsdatum
                      </p>
                      <Input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            dueDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Beschreibung
                      </p>
                      <Textarea
                        value={editForm.description}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                        rows={6}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="gap-2"
                      >
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        Speichern
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setIsEditing(false)}
                        disabled={saving}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Beschreibung
                      </p>
                      <MarkdownViewer
                        value={selectedTask.description ?? ""}
                        className="rounded-md bg-muted/20 p-3"
                      />
                    </div>
                  </div>
                )}
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Unteraufgaben
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {completedSubtasks}/{totalSubtasks} erledigt
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedTask.type === "RESPONSIBILITY" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCreateWorkSubtask}
                          disabled={addingSubtask}
                        >
                          Neue Arbeits-Unteraufgabe
                        </Button>
                      )}
                      {showParentComplete && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCompleteParent}
                          disabled={parentCompleting}
                        >
                          Elternaufgabe abschließen
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  {addingSubtask && (
                    <div className="space-y-2">
                      <Input
                        placeholder="Titel der Unteraufgabe"
                        value={subtaskTitle}
                        onChange={(event) =>
                          setSubtaskTitle(event.target.value)
                        }
                        onKeyDown={handleSubtaskKeyDown}
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleAddSubtask}
                          disabled={addingSubtask}
                        >
                          Unteraufgabe anlegen
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setAddingSubtask(false)}
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  )}
                  {subtasksLoading ? (
                    <div className="flex h-32 items-center justify-center text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : subtasks.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Keine Unteraufgaben vorhanden.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="rounded-lg border border-border bg-background p-3 shadow-sm"
                        >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{subtask.title}</p>
                          <div className="flex items-center gap-2">
                            <Badge className={STATUS_BADGE_STYLES[subtask.status]}>
                              {STATUS_LABELS[subtask.status]}
                            </Badge>
                            {subtask.type === "RESPONSIBILITY" && (
                              <Badge className={TYPE_BADGE_STYLES[subtask.type]}>
                                Daueraufgabe
                              </Badge>
                            )}
                          </div>
                        </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-3">
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Status
                              </p>
                              <Select
                                value={subtask.status}
                                onValueChange={(value) =>
                                  handleSubtaskUpdate(subtask.id, {
                                    status: value as TaskLifecycleStatus,
                                  })
                                }
                                disabled={updatingSubtaskId === subtask.id}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(STATUS_LABELS).map(
                                    ([status, label]) => (
                                      <SelectItem key={status} value={status}>
                                        {label}
                                      </SelectItem>
                                    ),
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Verantwortlich
                              </p>
                              <Select
                                value={
                                  subtask.assignedToId
                                    ? String(subtask.assignedToId)
                                    : ""
                                }
                                onValueChange={(value) =>
                                  handleSubtaskUpdate(subtask.id, {
                                    assignedToId: value ? Number(value) : null,
                                  })
                                }
                                disabled={updatingSubtaskId === subtask.id}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Unassigned" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">
                                    Unassigned
                                  </SelectItem>
                                  {assigneeOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Frist
                              </p>
                              <Input
                                type="date"
                                value={subtask.dueDate ?? ""}
                                onChange={(event) =>
                                  handleSubtaskUpdate(subtask.id, {
                                    dueDate: event.target.value || null,
                                  })
                                }
                                disabled={updatingSubtaskId === subtask.id}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
