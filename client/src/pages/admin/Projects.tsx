import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MarkdownEditor,
  MarkdownViewer,
} from "@/components/editor/MarkdownEditor";
import {
  Plus,
  CheckCircle2,
  X,
  Pencil,
  Users,
  FileText,
  Archive,
  RefreshCw,
  Check,
  BookOpen,
  Download,
  History,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Employee, ProjectInitiative, Sop } from "@shared/schema";
import {
  employeeApi,
  projectApi,
  sopApi,
  tasksApi,
  type SopDetail,
  type SopReferenceSuggestion,
  type TaskAttachment,
  type TaskCreatePayload,
  type TaskItem,
  type TaskLifecycleStatus,
  type TaskType,
} from "@/lib/api";
import { SubtaskList } from "@/components/tasks/SubtaskList";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  SOP_TEMPLATE_MARKDOWN,
  SOP_SECTION_DEFINITIONS,
  DEFAULT_SOP_SECTIONS,
  EMPTY_SOP_SECTIONS,
  buildSopMarkdown,
  parseSopSections,
  type SopSections,
} from "@/lib/sopTemplates";

const createErrorToast = (
  toastFn: ReturnType<typeof useToast>["toast"],
  error: any,
  fallback: string,
) => {
  const isForbidden = (error as any)?.status === 403;
  toastFn({
    title: isForbidden ? "Keine Berechtigung" : "Fehler",
    description: error?.message || fallback,
    variant: "destructive",
  });
};

const SOP_CATEGORIES = ["SOP", "Dienstanweisung", "Aufklärungen"] as const;
const ALLOWED_SOP_CATEGORIES = new Set(SOP_CATEGORIES);
const PROJECT_CATEGORIES = [
  { value: "SOP", label: "SOP" },
  { value: "Studie", label: "Studie" },
  { value: "Administrativ", label: "Administrativ" },
  { value: "Qualitätsprojekt", label: "Qualitätsprojekt" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  proposed: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  review: "bg-amber-100 text-amber-700 border-amber-200",
  published: "bg-emerald-100 text-emerald-700 border-emerald-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
  active: "bg-blue-100 text-blue-700 border-blue-200",
  done: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const SOP_LABELS: Record<string, string> = {
  proposed: "Vorgeschlagen",
  in_progress: "Laufend",
  review: "Review",
  published: "Freigegeben",
  archived: "Archiviert",
};

const TASK_STATUS_BADGE_STYLES: Record<TaskLifecycleStatus, string> = {
  NOT_STARTED: "bg-slate-50 text-slate-900 border-slate-200",
  IN_PROGRESS: "bg-amber-50 text-amber-900 border-amber-200",
  SUBMITTED: "bg-blue-50 text-blue-900 border-blue-200",
  DONE: "bg-emerald-50 text-emerald-900 border-emerald-200",
};

const TASK_STATUS_LABELS: Record<TaskLifecycleStatus, string> = {
  NOT_STARTED: "Nicht begonnen",
  IN_PROGRESS: "In Arbeit",
  SUBMITTED: "Zur Freigabe eingereicht",
  DONE: "Abgeschlossen",
};

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  ONE_OFF: "Einmalig",
  RESPONSIBILITY: "Verantwortung",
};

const TASK_TYPE_BADGE_STYLES: Record<TaskType, string> = {
  ONE_OFF: "bg-slate-100 text-slate-700 border-slate-200",
  RESPONSIBILITY: "bg-violet-50 text-violet-900 border-violet-200",
};

function normalizeSopStatus(status?: string | null) {
  const value = (status || "").toLowerCase();
  if (["entwurf", "draft", "proposed"].includes(value)) return "proposed";
  if (["in review", "review"].includes(value)) return "review";
  if (["freigegeben", "published"].includes(value)) return "published";
  if (["in bearbeitung", "in_progress"].includes(value)) return "in_progress";
  if (["archiviert", "archived"].includes(value)) return "archived";
  return value || "proposed";
}

const normalizeSopCategory = (value?: string | null) => {
  if (!value) return "SOP";
  if (ALLOWED_SOP_CATEGORIES.has(value as (typeof SOP_CATEGORIES)[number]))
    return value;
  return "SOP";
};

const hasSopSectionContent = (sections: SopSections) =>
  SOP_SECTION_DEFINITIONS.some((section) => {
    const value = (sections[section.key] || "").trim();
    const placeholder = DEFAULT_SOP_SECTIONS[section.key].trim();
    return value && value !== placeholder;
  });

const sanitizeSopSections = (sections: SopSections): SopSections => {
  const cleaned = { ...EMPTY_SOP_SECTIONS };
  SOP_SECTION_DEFINITIONS.forEach((section) => {
    const value = (sections[section.key] || "").trim();
    const placeholder = DEFAULT_SOP_SECTIONS[section.key].trim();
    cleaned[section.key] = value && value !== placeholder ? value : "";
  });
  return cleaned;
};

function normalizeProjectStatus(status?: string | null) {
  const value = (status || "").toLowerCase();
  if (["entwurf", "proposed"].includes(value)) return "proposed";
  if (["aktiv", "active"].includes(value)) return "active";
  if (["abgeschlossen", "done"].includes(value)) return "done";
  if (["archiviert", "archived"].includes(value)) return "archived";
  return value || "proposed";
}

const NATIONAL_GUIDELINE_KEYS = ["OGGG", "DGGG"];
const INTERNATIONAL_GUIDELINE_KEYS = ["ESGE", "ACOG", "RCOG", "NICE"];

const normalizeReferenceText = (value?: string | null) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

type SopReference = NonNullable<SopDetail["references"]>[number];
const getReferenceRank = (
  ref: Pick<SopReference, "type" | "title" | "publisher">,
) => {
  const text =
    `${normalizeReferenceText(ref.publisher)} ${normalizeReferenceText(ref.title)}`.trim();
  if (ref.type === "awmf" || text.includes("AWMF")) return 0;
  if (ref.type === "guideline") {
    if (NATIONAL_GUIDELINE_KEYS.some((key) => text.includes(key))) return 1;
    if (INTERNATIONAL_GUIDELINE_KEYS.some((key) => text.includes(key)))
      return 2;
    return 3;
  }
  if (ref.type === "study") return 4;
  return 5;
};

function sortReferences(references: SopDetail["references"] = []) {
  return [...references].sort((a, b) => {
    const aRank = getReferenceRank(a);
    const bRank = getReferenceRank(b);
    if (aRank !== bRank) return aRank - bRank;
    return (a.title || "").localeCompare(b.title || "", "de");
  });
}

const formatDate = (value?: string | Date | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE");
};

const toSafeFilename = (value: string) => {
  const ascii = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 60) || "sop";
};

const formatEmployeeName = (name?: string | null, lastName?: string | null) => {
  if (name && lastName) return `${name} ${lastName}`;
  return name || lastName || "Unbekannt";
};

export default function AdminProjects() {
  const { toast } = useToast();
  const { employee, isAdmin, isTechnicalAdmin, capabilities, can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sops, setSops] = useState<Sop[]>([]);
  const [projects, setProjects] = useState<ProjectInitiative[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sopSearch, setSopSearch] = useState("");

  const [sopEditorOpen, setSopEditorOpen] = useState(false);
  const [editingSop, setEditingSop] = useState<Sop | null>(null);
  const [sopForm, setSopForm] = useState({
    title: "",
    category: "SOP",
    contentMarkdown: "",
    keywords: "",
    awmfLink: "",
  });
  const [sopContentSections, setSopContentSections] =
    useState<SopSections>(DEFAULT_SOP_SECTIONS);
  const [publishOnCreate, setPublishOnCreate] = useState(false);
  const [publishNote, setPublishNote] = useState("");

  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [editingProject, setEditingProject] =
    useState<ProjectInitiative | null>(null);
  const [projectForm, setProjectForm] = useState({
    title: "",
    category: "SOP",
    description: "",
    ownerId: "",
    dueDate: "",
  });

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberTarget, setMemberTarget] = useState<{
    type: "sop" | "project";
    id: number;
  } | null>(null);
  const [memberSelection, setMemberSelection] = useState<
    Record<number, "read" | "edit">
  >({});
  const [memberLoading, setMemberLoading] = useState(false);

  const [reasonDialog, setReasonDialog] = useState<{
    type: "sop" | "project";
    id: number;
    action: "reject" | "changes";
  } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [publishDialog, setPublishDialog] = useState<{ id: number } | null>(
    null,
  );
  const [changeNote, setChangeNote] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSop, setDetailSop] = useState<SopDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [docxDownloading, setDocxDownloading] = useState(false);
  const [suggestedRefs, setSuggestedRefs] = useState<
    SopReferenceSuggestion[] | null
  >(null);
  const [manualRefOpen, setManualRefOpen] = useState(false);
  const [manualRefForm, setManualRefForm] = useState({
    type: "guideline",
    title: "",
    url: "",
    publisher: "",
    yearOrVersion: "",
    relevanceNote: "",
  });
  const [activeTab, setActiveTab] = useState<"sops" | "projects">("sops");
  const [adminTasks, setAdminTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [selectedSubtasks, setSelectedSubtasks] = useState<TaskItem[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [taskSubtasksLoading, setTaskSubtasksLoading] = useState(false);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const [taskAttachmentsLoading, setTaskAttachmentsLoading] = useState(false);
  const [taskAttachmentsError, setTaskAttachmentsError] = useState<string | null>(
    null,
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    assignedToId: "unassigned",
  });
  const [creatingTask, setCreatingTask] = useState(false);

  const canManageSops =
    isAdmin ||
    isTechnicalAdmin ||
    capabilities.includes("perm.sop_manage") ||
    capabilities.includes("perm.sop_publish");
  const canPublishSops =
    isAdmin || isTechnicalAdmin || capabilities.includes("perm.sop_publish");
  const canManageProjects =
    isAdmin || isTechnicalAdmin || capabilities.includes("perm.project_manage");
  const canDeleteProjects =
    isAdmin || isTechnicalAdmin || capabilities.includes("perm.project_delete");
  const canManageTasks = can("perm.project_manage");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sopData, projectData, employeeData] = await Promise.all([
        sopApi.getAll(),
        projectApi.getAll(),
        employeeApi.getAll(),
      ]);
      setSops(sopData);
      setProjects(projectData);
      setEmployees(employeeData);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Daten konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const employeeLookup = useMemo(
    () => new Map(employees.map((emp) => [emp.id, emp])),
    [employees],
  );

  const resolveEmployeeName = (employeeId?: number | null) => {
    if (!employeeId) return "Unbekannt";
    const employee = employeeLookup.get(employeeId);
    return employee
      ? formatEmployeeName(employee.name, employee.lastName)
      : `ID ${employeeId}`;
  };

  const assignedOptions = useMemo(() => {
    return employees.map((emp) => ({
      value: String(emp.id),
      label: formatEmployeeName(emp.name, emp.lastName),
    }));
  }, [employees]);

  const fetchAdminTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const data = await tasksApi.list({ view: "team", status: "SUBMITTED" });
      setAdminTasks(data);
      setSelectedTaskId((current) => {
        if (current && data.some((task) => task.id === current)) return current;
        return data[0]?.id ?? null;
      });
    } catch (error: any) {
      setTasksError(
        error?.message || "Aufgaben konnten nicht geladen werden.",
      );
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const handleAdminAttachmentChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!selectedTaskId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await tasksApi.uploadAttachment(selectedTaskId, file);
      toast({
        title: "Anhang hochgeladen",
        description: "Der Anhang wurde gespeichert.",
      });
      await loadTaskAttachments(selectedTaskId);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message || "Anhang konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const loadTaskDetail = useCallback(async (taskId: number) => {
    setTaskDetailLoading(true);
    try {
      const detail = await tasksApi.getById(taskId);
      setSelectedTask(detail);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message || "Aufgabe konnte nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setTaskDetailLoading(false);
    }
  }, [toast]);

  const loadTaskSubtasks = useCallback(async (taskId: number) => {
    setTaskSubtasksLoading(true);
    try {
      const subtasks = await tasksApi.getSubtasks(taskId);
      setSelectedSubtasks(subtasks);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description:
          error?.message || "Unteraufgaben konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setTaskSubtasksLoading(false);
    }
  }, [toast]);

  const loadTaskAttachments = useCallback(
    async (taskId: number) => {
      setTaskAttachmentsLoading(true);
      setTaskAttachmentsError(null);
      try {
        const data = await tasksApi.getAttachments(taskId);
        setTaskAttachments(data);
      } catch (error: any) {
        setTaskAttachments([]);
        setTaskAttachmentsError(
          error?.message || "Anhänge konnten nicht geladen werden.",
        );
      } finally {
        setTaskAttachmentsLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (activeTab !== "projects") return;
    fetchAdminTasks();
  }, [activeTab, fetchAdminTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      setSelectedSubtasks([]);
      return;
    }
    loadTaskDetail(selectedTaskId);
    loadTaskSubtasks(selectedTaskId);
  }, [selectedTaskId, loadTaskDetail, loadTaskSubtasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskAttachments([]);
      return;
    }
    loadTaskAttachments(selectedTaskId);
  }, [selectedTaskId, loadTaskAttachments]);

  const handleAdminTaskAction = async (
    status: TaskLifecycleStatus,
    description: string,
  ) => {
    if (!selectedTask) return;
    setWorkflowLoading(true);
    try {
      await tasksApi.update(selectedTask.id, { status });
      toast({
        title: "Erfolgreich",
        description,
      });
      await fetchAdminTasks();
      await loadTaskDetail(selectedTask.id);
      await loadTaskSubtasks(selectedTask.id);
    } catch (error: any) {
      createErrorToast(
        toast,
        error,
        "Status konnte nicht geändert werden.",
      );
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleAssignmentChange = async (id: number | null) => {
    if (!selectedTask || !canManageTasks) return;
    setWorkflowLoading(true);
    try {
      await tasksApi.update(selectedTask.id, { assignedToId: id });
      toast({
        title: "Erfolgreich",
        description: "Zuständigkeit wurde aktualisiert.",
      });
      await fetchAdminTasks();
      await loadTaskDetail(selectedTask.id);
      await loadTaskSubtasks(selectedTask.id);
    } catch (error: any) {
      createErrorToast(
        toast,
        error,
        "Zuständigkeit konnte nicht geändert werden.",
      );
    } finally {
      setWorkflowLoading(false);
    }
  };

  const resetCreateForm = () => {
      setCreateForm({
        title: "",
        description: "",
        dueDate: "",
        assignedToId: "unassigned",
      });
  };

  const handleCreateTask = async () => {
    if (!createForm.title.trim()) {
      toast({
        title: "Titel fehlt",
        description: "Bitte gib einen Titel für die Aufgabe ein.",
        variant: "destructive",
      });
      return;
    }
    setCreatingTask(true);
    try {
      const assigneeId =
        canManageTasks && createForm.assignedToId !== "unassigned"
          ? Number(createForm.assignedToId)
          : null;
      const payload: TaskCreatePayload = {
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
        dueDate: createForm.dueDate || null,
        status: "SUBMITTED" as TaskLifecycleStatus,
        ...(canManageTasks
          ? {
              assignedToId: assigneeId,
            }
          : {}),
      };
      const created = await tasksApi.create(payload);
      toast({
        title: "Aufgabe erstellt",
        description: "Die neue Aufgabe ist nun in der Queue.",
      });
      resetCreateForm();
      setCreateDialogOpen(false);
      await fetchAdminTasks();
      setSelectedTaskId(created.id);
    } catch (error: any) {
      createErrorToast(
        toast,
        error,
        "Aufgabe konnte nicht erstellt werden.",
      );
    } finally {
      setCreatingTask(false);
    }
  };

  const filteredSops = useMemo(() => {
    if (!sopSearch.trim()) return sops;
    const term = sopSearch.toLowerCase();
    return sops.filter(
      (sop) =>
        sop.title.toLowerCase().includes(term) ||
        (sop.keywords || []).some((keyword) =>
          keyword.toLowerCase().includes(term),
        ),
    );
  }, [sops, sopSearch]);

  const sopStatusSections = [
    { key: "proposed", title: "Vorgeschlagen" },
    { key: "in_progress", title: "Laufend" },
    { key: "review", title: "Review" },
    { key: "published", title: "Freigegeben" },
  ];

  const openSopEditor = (sop?: Sop) => {
    if (sop) {
      const normalizedCategory = normalizeSopCategory(sop.category);
      const contentMarkdown = sop.contentMarkdown || "";
      setEditingSop(sop);
      setSopForm({
        title: sop.title,
        category: normalizedCategory,
        contentMarkdown,
        keywords: (sop.keywords || []).join(", "),
        awmfLink: sop.awmfLink || "",
      });
      if (normalizedCategory === "SOP") {
        setSopContentSections(
          contentMarkdown
            ? parseSopSections(contentMarkdown)
            : DEFAULT_SOP_SECTIONS,
        );
      } else {
        setSopContentSections(EMPTY_SOP_SECTIONS);
      }
    } else {
      setEditingSop(null);
      setSopForm({
        title: "",
        category: "SOP",
        contentMarkdown: SOP_TEMPLATE_MARKDOWN,
        keywords: "",
        awmfLink: "",
      });
      setSopContentSections(DEFAULT_SOP_SECTIONS);
    }
    setPublishOnCreate(false);
    setPublishNote("");
    setSopEditorOpen(true);
  };

  const handleSopCategoryChange = (value: string) => {
    const normalizedCategory = normalizeSopCategory(value);
    const currentCategory = normalizeSopCategory(sopForm.category);
    if (normalizedCategory === currentCategory) return;

    if (currentCategory !== "SOP" && normalizedCategory !== "SOP") {
      setSopForm({ ...sopForm, category: normalizedCategory });
      return;
    }

    if (normalizedCategory === "SOP") {
      const nextSections = sopForm.contentMarkdown?.trim()
        ? parseSopSections(sopForm.contentMarkdown)
        : DEFAULT_SOP_SECTIONS;
      setSopContentSections(nextSections);
      setSopForm({ ...sopForm, category: normalizedCategory });
      return;
    }

    const nextMarkdown = hasSopSectionContent(sopContentSections)
      ? buildSopMarkdown(sanitizeSopSections(sopContentSections))
      : "";
    setSopContentSections(EMPTY_SOP_SECTIONS);
    setSopForm({
      ...sopForm,
      category: normalizedCategory,
      contentMarkdown: nextMarkdown,
    });
  };

  const openProjectEditor = (project?: ProjectInitiative) => {
    if (project) {
      setEditingProject(project);
      setProjectForm({
        title: project.title,
        category: project.category,
        description: project.description || "",
        ownerId: project.ownerId ? String(project.ownerId) : "",
        dueDate: project.dueDate || "",
      });
    } else {
      setEditingProject(null);
      setProjectForm({
        title: "",
        category: "SOP",
        description: "",
        ownerId: "",
        dueDate: "",
      });
    }
    setProjectEditorOpen(true);
  };

  const handleSaveSop = async () => {
    if (!sopForm.title.trim()) {
      toast({
        title: "Fehler",
        description: "Titel ist erforderlich",
        variant: "destructive",
      });
      return;
    }
    const normalizedCategory = normalizeSopCategory(sopForm.category);
    const contentMarkdown =
      normalizedCategory === "SOP"
        ? hasSopSectionContent(sopContentSections)
          ? buildSopMarkdown(sanitizeSopSections(sopContentSections))
          : null
        : sopForm.contentMarkdown?.trim()
          ? sopForm.contentMarkdown
          : null;
    try {
      if (editingSop) {
        await sopApi.update(editingSop.id, {
          title: sopForm.title.trim(),
          category: normalizedCategory as Sop["category"],
          contentMarkdown,
          keywords: sopForm.keywords
            ? sopForm.keywords
                .split(",")
                .map((word) => word.trim())
                .filter(Boolean)
            : [],
          awmfLink: sopForm.awmfLink || null,
        });
      } else {
        if (!employee?.id) {
          toast({
            title: "Fehler",
            description: "Kein Benutzerkontext (createdById) vorhanden.",
            variant: "destructive",
          });
          return;
        }

        const created = await sopApi.create({
          title: sopForm.title.trim(),
          category: normalizedCategory as Sop["category"],
          contentMarkdown,
          keywords: sopForm.keywords
            ? sopForm.keywords
                .split(",")
                .map((word) => word.trim())
                .filter(Boolean)
            : [],
          awmfLink: sopForm.awmfLink || null,
          status: "proposed",
          createdById: employee.id,
        });

        if (publishOnCreate && canPublishSops) {
          if (!publishNote.trim()) {
            toast({
              title: "Fehler",
              description: "Aenderungsnotiz erforderlich",
              variant: "destructive",
            });
            return;
          }
          await sopApi.publish(created.id, publishNote.trim());
        }
      }
      toast({ title: "Gespeichert" });
      setSopEditorOpen(false);
      await loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "SOP konnte nicht gespeichert werden",
        variant: "destructive",
      });
    }
  };

  const handleSaveProject = async () => {
    if (!projectForm.title.trim()) {
      toast({
        title: "Fehler",
        description: "Titel ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    try {
      const basePayload = {
        title: projectForm.title.trim(),
        category: projectForm.category as ProjectInitiative["category"],
        description: projectForm.description || null,
        ownerId: projectForm.ownerId ? Number(projectForm.ownerId) : null,
        dueDate: projectForm.dueDate || null,
      };

      if (editingProject) {
        // Beim Update keinen Status/createdById mitschicken.
        await projectApi.update(editingProject.id, basePayload);
      } else {
        if (!employee?.id) {
          toast({
            title: "Fehler",
            description: "Kein Benutzerkontext (createdById) vorhanden.",
            variant: "destructive",
          });
          return;
        }

        await projectApi.create({
          ...basePayload,
          status: "proposed" as const,
          createdById: employee.id,
        });
      }

      toast({ title: "Gespeichert" });
      setProjectEditorOpen(false);
      await loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Aufgabe konnte nicht gespeichert werden",
        variant: "destructive",
      });
    }
  };

  const openMemberDialog = async (type: "sop" | "project", id: number) => {
    setMemberLoading(true);
    setMemberTarget({ type, id });
    try {
      if (type === "sop") {
        const detail = await sopApi.getById(id);
        const selection: Record<number, "read" | "edit"> = {};
        detail.members?.forEach((member) => {
          selection[member.employeeId] = member.role;
        });
        setMemberSelection(selection);
      } else {
        const detail = await projectApi.getById(id);
        const selection: Record<number, "read" | "edit"> = {};
        (detail.members || []).forEach((member) => {
          selection[member.employeeId] = member.role as "read" | "edit";
        });
        setMemberSelection(selection);
      }
      setMemberDialogOpen(true);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Mitglieder konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setMemberLoading(false);
    }
  };

  const saveMembers = async () => {
    if (!memberTarget) return;
    const members = Object.entries(memberSelection).map(([id, role]) => ({
      employeeId: Number(id),
      role,
    }));
    try {
      if (memberTarget.type === "sop") {
        await sopApi.assign(memberTarget.id, members);
      } else {
        await projectApi.assign(memberTarget.id, members);
      }
      toast({ title: "Mitglieder aktualisiert" });
      setMemberDialogOpen(false);
      await loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Mitglieder konnten nicht gespeichert werden",
        variant: "destructive",
      });
    }
  };

  const openSopDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setSuggestedRefs(null);
    try {
      const detail = await sopApi.getById(id);
      setDetailSop(detail);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "SOP konnte nicht geladen werden",
        variant: "destructive",
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadDocx = async (sop: SopDetail) => {
    try {
      setDocxDownloading(true);
      const blob = await sopApi.downloadDocx(sop.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${toSafeFilename(sop.title)}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Word-Export fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setDocxDownloading(false);
    }
  };

  const handleSopAction = async (
    id: number,
    action: "accept" | "request_review" | "start_revision" | "archive",
  ) => {
    try {
      if (action === "accept") {
        await sopApi.accept(id);
      }
      if (action === "request_review") {
        await sopApi.requestReview(id);
      }
      if (action === "start_revision") {
        await sopApi.startRevision(id);
      }
      if (action === "archive") {
        await sopApi.archive(id);
      }
      toast({ title: "Status aktualisiert" });
      await loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Aktion fehlgeschlagen",
        variant: "destructive",
      });
    }
  };

  const handleProjectAction = async (
    id: number,
    action: "accept" | "complete",
  ) => {
    try {
      if (action === "accept") {
        await projectApi.accept(id);
      }
      if (action === "complete") {
        await projectApi.complete(id);
      }
      toast({ title: "Status aktualisiert" });
      await loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Aktion fehlgeschlagen",
        variant: "destructive",
      });
    }
  };

  const submitReason = async () => {
    if (!reasonDialog || !reasonText.trim()) return;
    try {
      if (reasonDialog.type === "sop" && reasonDialog.action === "reject") {
        await sopApi.reject(reasonDialog.id, reasonText.trim());
      }
      if (reasonDialog.type === "sop" && reasonDialog.action === "changes") {
        await sopApi.requestChanges(reasonDialog.id, reasonText.trim());
      }
      if (reasonDialog.type === "project") {
        await projectApi.reject(reasonDialog.id, reasonText.trim());
      }
      toast({ title: "Aktion gespeichert" });
      setReasonDialog(null);
      setReasonText("");
      await loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Aktion fehlgeschlagen",
        variant: "destructive",
      });
    }
  };

  const submitPublish = async () => {
    if (!publishDialog || !changeNote.trim()) return;
    try {
      await sopApi.publish(publishDialog.id, changeNote.trim());
      toast({ title: "SOP freigegeben" });
      setPublishDialog(null);
      setChangeNote("");
      await loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Freigabe fehlgeschlagen",
        variant: "destructive",
      });
    }
  };

  const handleSuggestRefs = async () => {
    if (!detailSop) return;
    try {
      const suggestions = await sopApi.suggestReferences(detailSop.id);
      setSuggestedRefs(suggestions);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "KI-Vorschlaege konnten nicht geladen werden",
        variant: "destructive",
      });
    }
  };

  const acceptSuggestedRef = async (ref: SopReferenceSuggestion) => {
    if (!detailSop) return;
    try {
      await sopApi.addReference(detailSop.id, {
        type: ref.type,
        title: ref.title,
        url: ref.url || null,
        publisher: ref.publisher || null,
        yearOrVersion: ref.yearOrVersion || null,
        relevanceNote: ref.relevanceNote || null,
        createdByAi: true,
      } as any);
      toast({ title: "Referenz uebernommen" });
      await openSopDetail(detailSop.id);
      setSuggestedRefs(
        (prev) => prev?.filter((item) => item.title !== ref.title) || null,
      );
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Referenz konnte nicht uebernommen werden",
        variant: "destructive",
      });
    }
  };

  const rejectSuggestedRef = (ref: SopReferenceSuggestion) => {
    setSuggestedRefs(
      (prev) => prev?.filter((item) => item.title !== ref.title) || null,
    );
  };

  const openManualRefDialog = () => {
    setManualRefForm({
      type: "guideline",
      title: "",
      url: "",
      publisher: "",
      yearOrVersion: "",
      relevanceNote: "",
    });
    setManualRefOpen(true);
  };

  const saveManualReference = async () => {
    if (!detailSop) return;
    if (!manualRefForm.title.trim()) {
      toast({
        title: "Fehler",
        description: "Titel ist erforderlich",
        variant: "destructive",
      });
      return;
    }
    try {
      await sopApi.addReference(detailSop.id, {
        type: manualRefForm.type as SopReferenceSuggestion["type"],
        title: manualRefForm.title.trim(),
        url: manualRefForm.url.trim() || null,
        publisher: manualRefForm.publisher.trim() || null,
        yearOrVersion: manualRefForm.yearOrVersion.trim() || null,
        relevanceNote: manualRefForm.relevanceNote.trim() || null,
        createdByAi: false,
      } as any);
      toast({ title: "Referenz hinzugefuegt" });
      await openSopDetail(detailSop.id);
      setManualRefOpen(false);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Referenz konnte nicht gespeichert werden",
        variant: "destructive",
      });
    }
  };

  const deleteProject = async (id: number) => {
    try {
      await projectApi.delete(id);
      toast({ title: "Aufgabe geloescht" });
      await loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Aufgabe konnte nicht geloescht werden",
        variant: "destructive",
      });
    }
  };

  const renderSopItem = (sop: Sop) => {
    const statusKey = normalizeSopStatus(sop.status);
    const categoryLabel = normalizeSopCategory(sop.category);
    return (
      <Card
        key={sop.id}
        className="border-none kabeg-shadow hover:shadow-md transition-shadow"
      >
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h4 className="font-semibold">{sop.title}</h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-muted-foreground">
                  {categoryLabel}
                </Badge>
                <Badge
                  className={
                    STATUS_STYLES[statusKey] ||
                    "bg-slate-100 text-slate-600 border-slate-200"
                  }
                >
                  {SOP_LABELS[statusKey] || statusKey}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openSopDetail(sop.id)}
              >
                Details
              </Button>
              {canManageSops && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openMemberDialog("sop", sop.id)}
                  >
                    <Users className="w-4 h-4 mr-1" />
                    Mitglieder
                  </Button>
                  {statusKey === "proposed" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleSopAction(sop.id, "accept")}
                      >
                        Annehmen
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setReasonDialog({
                            type: "sop",
                            id: sop.id,
                            action: "reject",
                          })
                        }
                      >
                        Ablehnen
                      </Button>
                    </>
                  )}
                  {statusKey === "in_progress" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSopEditor(sop)}
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        Bearbeiten
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          handleSopAction(sop.id, "request_review")
                        }
                      >
                        Review anfordern
                      </Button>
                    </>
                  )}
                  {statusKey === "review" && (
                    <>
                      {canPublishSops && (
                        <Button
                          size="sm"
                          onClick={() => setPublishDialog({ id: sop.id })}
                        >
                          Freigeben
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setReasonDialog({
                            type: "sop",
                            id: sop.id,
                            action: "changes",
                          })
                        }
                      >
                        Aenderungen
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setReasonDialog({
                            type: "sop",
                            id: sop.id,
                            action: "reject",
                          })
                        }
                      >
                        Ablehnen
                      </Button>
                    </>
                  )}
                  {statusKey === "published" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleSopAction(sop.id, "start_revision")
                        }
                      >
                        Revision
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSopAction(sop.id, "archive")}
                      >
                        Archivieren
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          {sop.contentMarkdown && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {sop.contentMarkdown}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  const detailCategory = detailSop
    ? normalizeSopCategory(detailSop.category)
    : null;
  const detailSections =
    detailCategory === "SOP"
      ? parseSopSections(detailSop?.contentMarkdown)
      : EMPTY_SOP_SECTIONS;

  return (
    <Layout title="SOPs & Aufgaben verwalten">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            SOPs & Aufgaben verwalten
          </h2>
          <p className="text-muted-foreground text-sm">
            Vorschlaege pruefen, Mitarbeitende zuordnen und Freigaben steuern.
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "sops" | "projects")}
        >
          <TabsList>
            <TabsTrigger value="sops">SOPs</TabsTrigger>
            <TabsTrigger value="projects">Aufgaben</TabsTrigger>
          </TabsList>

          <TabsContent value="sops" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Input
                placeholder="SOP suchen..."
                value={sopSearch}
                onChange={(event) => setSopSearch(event.target.value)}
                className="max-w-sm"
              />
              {canManageSops && (
                <Button onClick={() => openSopEditor()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Neue SOP
                </Button>
              )}
            </div>

            {loading && (
              <p className="text-sm text-muted-foreground">Lade SOPs...</p>
            )}
            {!loading &&
              sopStatusSections.map((section) => {
                const items = filteredSops.filter(
                  (sop) => normalizeSopStatus(sop.status) === section.key,
                );
                if (!items.length) return null;
                return (
                  <div key={section.key} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {section.title}
                      </h3>
                    </div>
                    <div className="space-y-3">{items.map(renderSopItem)}</div>
                  </div>
                );
              })}
          </TabsContent>

          <TabsContent value="projects" className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Aufgaben-Queue</p>
              <p className="text-xs text-muted-foreground">
                Sicht: Team · Status: Eingereichte Aufgaben
              </p>
            </div>
            {canManageTasks && (
              <Button
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
                className="gap-1"
              >
                <Plus className="w-3 h-3" />
                Aufgabe erstellen
              </Button>
            )}
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  <span>{adminTasks.length}</span> Aufgaben
                </p>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
              <Card className="h-full">
                <CardContent className="space-y-2 p-0">
              {tasksLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : tasksError ? (
                <p className="p-4 text-sm text-destructive">{tasksError}</p>
              ) : adminTasks.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Keine eingereichten Aufgaben vorhanden.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Zugewiesen an</TableHead>
                      <TableHead>Erstellt von</TableHead>
                      <TableHead>Erstellt am</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminTasks.map((task) => {
                      const isActive = selectedTaskId === task.id;
                      const creatorName = resolveEmployeeName(task.createdById);
                      return (
                          <TableRow
                            key={task.id}
                            className={`hover:cursor-pointer ${
                              isActive ? "bg-primary/10" : ""
                            }`}
                            onClick={() => setSelectedTaskId(task.id)}
                          >
                            <TableCell className="w-[40%]">
                              <span className="font-medium">{task.title}</span>
                            </TableCell>
                            <TableCell>
                              <Badge className={TASK_STATUS_BADGE_STYLES[task.status]}>
                                {TASK_STATUS_LABELS[task.status]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={TASK_TYPE_BADGE_STYLES[task.type]}>
                                {TASK_TYPE_LABELS[task.type]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {task.assignedTo
                                ? `${task.assignedTo.name} ${task.assignedTo.lastName}`.trim()
                                : "—"}
                            </TableCell>
                            <TableCell>{creatorName}</TableCell>
                            <TableCell>{formatDate(task.createdAt)}</TableCell>
                          </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Detailansicht
                    </p>
                    <h3 className="text-xl font-semibold">
                      {selectedTask ? selectedTask.title : "Keine Aufgabe gewählt"}
                    </h3>
                    {selectedTask && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={TASK_STATUS_BADGE_STYLES[selectedTask.status]}>
                          {TASK_STATUS_LABELS[selectedTask.status]}
                        </Badge>
                        <Badge className={TASK_TYPE_BADGE_STYLES[selectedTask.type]}>
                          {TASK_TYPE_LABELS[selectedTask.type]}
                        </Badge>
                      </div>
                    )}
                  </div>
                  {selectedTask && (
                    <div className="flex flex-wrap items-center gap-2">
                      {canManageTasks && selectedTask.status === "SUBMITTED" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleAdminTaskAction(
                                "IN_PROGRESS",
                                "Aufgabe wurde zurück in Arbeit gestellt.",
                              )
                            }
                            disabled={workflowLoading}
                          >
                            Zurück in Arbeit
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              handleAdminTaskAction(
                                "DONE",
                                "Aufgabe wurde als erledigt markiert.",
                              )
                            }
                            disabled={workflowLoading}
                          >
                            Annehmen
                          </Button>
                        </>
                      )}
                      {!canManageTasks && selectedTask.status === "SUBMITTED" && (
                        <p className="text-xs text-muted-foreground">
                          Status: {TASK_STATUS_LABELS[selectedTask.status]}
                        </p>
                      )}
                      {selectedTask.status !== "SUBMITTED" && (
                        <p className="text-xs text-muted-foreground">
                          Status: {TASK_STATUS_LABELS[selectedTask.status]}
                        </p>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {taskDetailLoading ? (
                    <div className="flex h-48 items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : !selectedTask ? (
                    <p className="text-sm text-muted-foreground">
                      Wähle eine Aufgabe aus der Liste.
                    </p>
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
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Verantwortlich
                          </p>
                          {canManageTasks ? (
                            <Select
                              value={
                                selectedTask.assignedToId
                                  ? String(selectedTask.assignedToId)
                                  : "unassigned"
                              }
                              onValueChange={(value) =>
                                handleAssignmentChange(
                                  value === "unassigned" ? null : Number(value),
                                )
                              }
                              disabled={workflowLoading}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Unassigned" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">
                                  Unassigned
                                </SelectItem>
                                {assignedOptions.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p>
                              {selectedTask.assignedTo
                                ? `${selectedTask.assignedTo.name} ${selectedTask.assignedTo.lastName}`
                                : "Unassigned"}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Fällig
                          </p>
                          <p>{formatDate(selectedTask.dueDate)}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Erstellt von
                        </p>
                        <p>{resolveEmployeeName(selectedTask.createdById)}</p>
                      </div>
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Unteraufgaben
                      </p>
                      <SubtaskList
                        subtasks={selectedSubtasks}
                        loading={taskSubtasksLoading}
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Anhänge
                        </p>
                        <label className="flex items-center gap-1 text-sm text-primary">
                          <input
                            type="file"
                            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                            className="hidden"
                            onChange={handleAdminAttachmentChange}
                            disabled={!selectedTaskId}
                          />
                          <span className="cursor-pointer">Hochladen</span>
                        </label>
                      </div>
                      {taskAttachmentsLoading ? (
                        <div className="flex h-10 items-center justify-center text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      ) : taskAttachmentsError ? (
                        <p className="text-sm text-destructive">
                          {taskAttachmentsError}
                        </p>
                      ) : taskAttachments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Keine Anhänge vorhanden.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {taskAttachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                            >
                              <div className="space-y-1">
                                <p className="font-medium">
                                  {attachment.originalName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatBytes(attachment.size)} ·{" "}
                                  {new Date(
                                    attachment.createdAt,
                                  ).toLocaleString("de-DE")}
                                </p>
                              </div>
                              <a
                                className="text-sm text-primary underline"
                                href={tasksApi.getAttachmentDownloadUrl(
                                  attachment.id,
                                )}
                              >
                                Download
                              </a>
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
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (!open) resetCreateForm();
        setCreateDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Aufgabe erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Titel
              </p>
              <Input
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                placeholder="Titel der Aufgabe"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Beschreibung
              </p>
              <Textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                rows={4}
                placeholder="Optional: Markdown"
              />
            </div>
            {canManageTasks && (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Zuständig
                </p>
              <Select
                value={createForm.assignedToId}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    assignedToId: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {assignedOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Fälligkeitsdatum
              </p>
              <Input
                type="date"
                value={createForm.dueDate}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    dueDate: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                resetCreateForm();
                setCreateDialogOpen(false);
              }}
              disabled={creatingTask}
            >
              Abbrechen
            </Button>
            <Button type="button" onClick={handleCreateTask} disabled={creatingTask}>
              {creatingTask ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Aufgabe erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sopEditorOpen} onOpenChange={setSopEditorOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingSop ? "SOP bearbeiten" : "Neue SOP"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            <div>
              <label className="text-sm font-medium">Titel</label>
              <Input
                value={sopForm.title}
                onChange={(event) =>
                  setSopForm({ ...sopForm, title: event.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Kategorie</label>
              <Select
                value={sopForm.category}
                onValueChange={handleSopCategoryChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  {SOP_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {normalizeSopCategory(sopForm.category) === "SOP" ? (
              <div className="space-y-4">
                {SOP_SECTION_DEFINITIONS.map((section) => {
                  const height = section.key === "content" ? 320 : 200;
                  return (
                    <div key={section.key} className="space-y-1">
                      <label className="text-sm font-medium">
                        {section.title}
                      </label>
                      <MarkdownEditor
                        value={sopContentSections[section.key] || ""}
                        onChange={(value) =>
                          setSopContentSections((prev) => ({
                            ...prev,
                            [section.key]: value,
                          }))
                        }
                        height={height}
                        className="border rounded-md"
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium">Inhalt</label>
                <MarkdownEditor
                  value={sopForm.contentMarkdown}
                  onChange={(value) =>
                    setSopForm({ ...sopForm, contentMarkdown: value })
                  }
                  height={360}
                  className="border rounded-md"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">
                Schlagwoerter (Komma getrennt)
              </label>
              <Input
                value={sopForm.keywords}
                onChange={(event) =>
                  setSopForm({ ...sopForm, keywords: event.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">AWMF-Link</label>
              <Input
                value={sopForm.awmfLink}
                onChange={(event) =>
                  setSopForm({ ...sopForm, awmfLink: event.target.value })
                }
              />
            </div>
            {!editingSop && canPublishSops && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={publishOnCreate}
                    onCheckedChange={(checked) =>
                      setPublishOnCreate(Boolean(checked))
                    }
                  />
                  <span className="text-sm">Sofort freigeben</span>
                </div>
                {publishOnCreate && (
                  <Input
                    placeholder="Aenderungsnotiz"
                    value={publishNote}
                    onChange={(event) => setPublishNote(event.target.value)}
                  />
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSopEditorOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveSop}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={projectEditorOpen} onOpenChange={setProjectEditorOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingProject ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            <div>
              <label className="text-sm font-medium">Titel</label>
              <Input
                value={projectForm.title}
                onChange={(event) =>
                  setProjectForm({ ...projectForm, title: event.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Kategorie</label>
              <Select
                value={projectForm.category}
                onValueChange={(value) =>
                  setProjectForm({ ...projectForm, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Beschreibung</label>
              <MarkdownEditor
                value={projectForm.description}
                onChange={(value) =>
                  setProjectForm({ ...projectForm, description: value })
                }
                height={320}
                className="border rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Owner</label>
              <Select
                value={projectForm.ownerId}
                onValueChange={(value) =>
                  setProjectForm({ ...projectForm, ownerId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Owner waehlen" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.lastName || emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Faelligkeit</label>
              <Input
                type="date"
                value={projectForm.dueDate}
                onChange={(event) =>
                  setProjectForm({
                    ...projectForm,
                    dueDate: event.target.value,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProjectEditorOpen(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSaveProject}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mitglieder zuordnen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {memberLoading && (
              <p className="text-sm text-muted-foreground">
                Lade Mitglieder...
              </p>
            )}
            {!memberLoading && (
              <div className="grid gap-2 max-h-80 overflow-auto pr-2">
                {employees.map((emp) => {
                  const selected = Boolean(memberSelection[emp.id]);
                  return (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            const next = { ...memberSelection };
                            if (checked) {
                              next[emp.id] = next[emp.id] || "read";
                            } else {
                              delete next[emp.id];
                            }
                            setMemberSelection(next);
                          }}
                        />
                        <span className="text-sm font-medium">
                          {emp.lastName || emp.name}
                        </span>
                      </div>
                      <Select
                        value={memberSelection[emp.id] || "read"}
                        onValueChange={(value) => {
                          if (!selected) return;
                          setMemberSelection({
                            ...memberSelection,
                            [emp.id]: value as "read" | "edit",
                          });
                        }}
                        disabled={!selected}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">read</SelectItem>
                          <SelectItem value="edit">edit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMemberDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={saveMembers}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reasonDialog)}
        onOpenChange={(open) => !open && setReasonDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reasonDialog?.action === "changes"
                ? "Aenderungen anfordern"
                : "Ablehnen"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Begruendung"
            value={reasonText}
            onChange={(event) => setReasonText(event.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialog(null)}>
              Abbrechen
            </Button>
            <Button onClick={submitReason}>Senden</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(publishDialog)}
        onOpenChange={(open) => !open && setPublishDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SOP freigeben</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Aenderungsnotiz"
            value={changeNote}
            onChange={(event) => setChangeNote(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialog(null)}>
              Abbrechen
            </Button>
            <Button onClick={submitPublish}>Freigeben</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>SOP Details</DialogTitle>
          </DialogHeader>
          {detailLoading && (
            <p className="text-sm text-muted-foreground">Lade...</p>
          )}
          {!detailLoading && detailSop && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{detailSop.title}</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {detailCategory || detailSop.category}
                  </Badge>
                  <Badge
                    className={
                      STATUS_STYLES[normalizeSopStatus(detailSop.status)]
                    }
                  >
                    {SOP_LABELS[normalizeSopStatus(detailSop.status)]}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManageSops &&
                  normalizeSopStatus(detailSop.status) === "in_progress" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDetailOpen(false);
                        openSopEditor(detailSop);
                      }}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Bearbeiten
                    </Button>
                  )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadDocx(detailSop)}
                  disabled={docxDownloading}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Word
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHistoryOpen(true)}
                  disabled={
                    !detailSop.versions || detailSop.versions.length === 0
                  }
                >
                  <History className="w-4 h-4 mr-1" />
                  Historie
                </Button>
              </div>
              {detailSop.awmfLink && (
                <a
                  href={detailSop.awmfLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline"
                >
                  {detailSop.awmfLink}
                </a>
              )}
              <Separator />
              {detailCategory === "SOP" ? (
                <div className="space-y-4">
                  {SOP_SECTION_DEFINITIONS.map((section, index) => {
                    const value = (detailSections[section.key] || "").trim();
                    return (
                      <div key={section.key} className="space-y-2">
                        <h4 className="text-sm font-semibold">
                          {index + 1}. {section.title}
                        </h4>
                        <MarkdownViewer
                          value={value || "Kein Inhalt hinterlegt."}
                          className="rounded-md border p-3 bg-white"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <MarkdownViewer
                  value={detailSop.contentMarkdown || "Kein Inhalt hinterlegt."}
                  className="rounded-md border p-3 bg-white"
                />
              )}
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Referenzen</h4>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSuggestRefs}
                    >
                      KI-Vorschlaege
                    </Button>
                    {canManageSops && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={openManualRefDialog}
                      >
                        Referenz hinzufuegen
                      </Button>
                    )}
                  </div>
                </div>
                {detailSop.references?.length ? (
                  <div className="space-y-2">
                    {sortReferences(detailSop.references).map((ref) => (
                      <div
                        key={ref.id}
                        className="border rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{ref.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {ref.publisher || "Unbekannt"}{" "}
                              {ref.yearOrVersion || ""}
                            </p>
                          </div>
                          <Badge variant="outline">{ref.status}</Badge>
                        </div>
                        {ref.url && (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary underline"
                          >
                            {ref.url}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Keine Referenzen vorhanden.
                  </p>
                )}
                {suggestedRefs && suggestedRefs.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs uppercase tracking-wide text-muted-foreground">
                      KI-Vorschlaege
                    </h5>
                    {suggestedRefs.map((ref) => (
                      <div
                        key={ref.title}
                        className="border rounded-lg p-3 text-sm"
                      >
                        <p className="font-medium">{ref.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {ref.relevanceNote}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => acceptSuggestedRef(ref)}
                          >
                            Uebernehmen
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectSuggestedRef(ref)}
                          >
                            Ablehnen
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={manualRefOpen} onOpenChange={setManualRefOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Referenz hinzufuegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Typ</label>
              <Select
                value={manualRefForm.type}
                onValueChange={(value) =>
                  setManualRefForm((prev) => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Typ waehlen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="awmf">AWMF</SelectItem>
                  <SelectItem value="guideline">Leitlinie</SelectItem>
                  <SelectItem value="study">Studie</SelectItem>
                  <SelectItem value="other">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Titel</label>
              <Input
                value={manualRefForm.title}
                onChange={(event) =>
                  setManualRefForm((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">URL</label>
              <Input
                value={manualRefForm.url}
                onChange={(event) =>
                  setManualRefForm((prev) => ({
                    ...prev,
                    url: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Herausgeber</label>
                <Input
                  value={manualRefForm.publisher}
                  onChange={(event) =>
                    setManualRefForm((prev) => ({
                      ...prev,
                      publisher: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Jahr/Version</label>
                <Input
                  value={manualRefForm.yearOrVersion}
                  onChange={(event) =>
                    setManualRefForm((prev) => ({
                      ...prev,
                      yearOrVersion: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Relevanzhinweis</label>
              <Textarea
                value={manualRefForm.relevanceNote}
                onChange={(event) =>
                  setManualRefForm((prev) => ({
                    ...prev,
                    relevanceNote: event.target.value,
                  }))
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualRefOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={saveManualReference}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>SOP Historie</DialogTitle>
          </DialogHeader>
          {detailSop?.versions && detailSop.versions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Freigegeben am</TableHead>
                  <TableHead>Besitzer</TableHead>
                  <TableHead>Kommentar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailSop.versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell>{version.versionNumber}</TableCell>
                    <TableCell>{formatDate(version.releasedAt)}</TableCell>
                    <TableCell>
                      {formatEmployeeName(
                        version.releasedByName,
                        version.releasedByLastName,
                      )}
                    </TableCell>
                    <TableCell>{version.changeNote || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Keine Historie vorhanden.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
