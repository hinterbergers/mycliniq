import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
  BookOpen
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Employee, ProjectInitiative, Sop } from "@shared/schema";
import { employeeApi, projectApi, sopApi, type SopDetail, type SopReferenceSuggestion } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const SOP_CATEGORIES = ["SOP", "Leitlinie", "Checkliste", "Formular"] as const;
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
  done: "bg-emerald-100 text-emerald-700 border-emerald-200"
};

const SOP_LABELS: Record<string, string> = {
  proposed: "Vorgeschlagen",
  in_progress: "Laufend",
  review: "Review",
  published: "Freigegeben",
  archived: "Archiviert"
};

const PROJECT_LABELS: Record<string, string> = {
  proposed: "Vorgeschlagen",
  active: "Laufend",
  done: "Abgeschlossen",
  archived: "Archiviert"
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

const getReferenceRank = (ref: Pick<SopDetail["references"][number], "type" | "title" | "publisher">) => {
  const text = `${normalizeReferenceText(ref.publisher)} ${normalizeReferenceText(ref.title)}`.trim();
  if (ref.type === "awmf" || text.includes("AWMF")) return 0;
  if (ref.type === "guideline") {
    if (NATIONAL_GUIDELINE_KEYS.some((key) => text.includes(key))) return 1;
    if (INTERNATIONAL_GUIDELINE_KEYS.some((key) => text.includes(key))) return 2;
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

export default function AdminProjects() {
  const { toast } = useToast();
  const { employee, isAdmin, isTechnicalAdmin, capabilities } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sops, setSops] = useState<Sop[]>([]);
  const [projects, setProjects] = useState<ProjectInitiative[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sopSearch, setSopSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");

  const [sopEditorOpen, setSopEditorOpen] = useState(false);
  const [editingSop, setEditingSop] = useState<Sop | null>(null);
  const [sopForm, setSopForm] = useState({
    title: "",
    category: "SOP",
    contentMarkdown: "",
    keywords: "",
    awmfLink: ""
  });
  const [publishOnCreate, setPublishOnCreate] = useState(false);
  const [publishNote, setPublishNote] = useState("");

  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectInitiative | null>(null);
  const [projectForm, setProjectForm] = useState({
    title: "",
    category: "SOP",
    description: "",
    ownerId: "",
    dueDate: ""
  });

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberTarget, setMemberTarget] = useState<{ type: "sop" | "project"; id: number } | null>(null);
  const [memberSelection, setMemberSelection] = useState<Record<number, "read" | "edit">>({});
  const [memberLoading, setMemberLoading] = useState(false);

  const [reasonDialog, setReasonDialog] = useState<{ type: "sop" | "project"; id: number; action: "reject" | "changes" } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [publishDialog, setPublishDialog] = useState<{ id: number } | null>(null);
  const [changeNote, setChangeNote] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSop, setDetailSop] = useState<SopDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [suggestedRefs, setSuggestedRefs] = useState<SopReferenceSuggestion[] | null>(null);
  const [manualRefOpen, setManualRefOpen] = useState(false);
  const [manualRefForm, setManualRefForm] = useState({
    type: "guideline",
    title: "",
    url: "",
    publisher: "",
    yearOrVersion: "",
    relevanceNote: ""
  });

  const canManageSops = isAdmin || isTechnicalAdmin || capabilities.includes("perm.sop_manage") || capabilities.includes("perm.sop_publish");
  const canPublishSops = isAdmin || isTechnicalAdmin || capabilities.includes("perm.sop_publish");
  const canManageProjects = isAdmin || isTechnicalAdmin || capabilities.includes("perm.project_manage");
  const canDeleteProjects = isAdmin || isTechnicalAdmin || capabilities.includes("perm.project_delete");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sopData, projectData, employeeData] = await Promise.all([
        sopApi.getAll(),
        projectApi.getAll(),
        employeeApi.getAll()
      ]);
      setSops(sopData);
      setProjects(projectData);
      setEmployees(employeeData);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Daten konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const employeeLookup = useMemo(() => new Map(employees.map((emp) => [emp.id, emp])), [employees]);

  const filteredSops = useMemo(() => {
    if (!sopSearch.trim()) return sops;
    const term = sopSearch.toLowerCase();
    return sops.filter((sop) =>
      sop.title.toLowerCase().includes(term) ||
      (sop.keywords || []).some((keyword) => keyword.toLowerCase().includes(term))
    );
  }, [sops, sopSearch]);

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const term = projectSearch.toLowerCase();
    return projects.filter((project) =>
      project.title.toLowerCase().includes(term) ||
      (project.description || "").toLowerCase().includes(term)
    );
  }, [projects, projectSearch]);

  const sopSections = [
    { key: "proposed", title: "Vorgeschlagen" },
    { key: "in_progress", title: "Laufend" },
    { key: "review", title: "Review" },
    { key: "published", title: "Freigegeben" }
  ];

  const projectSections = [
    { key: "proposed", title: "Vorgeschlagen" },
    { key: "active", title: "Laufend" },
    { key: "done", title: "Abgeschlossen" }
  ];

  const openSopEditor = (sop?: Sop) => {
    if (sop) {
      setEditingSop(sop);
      setSopForm({
        title: sop.title,
        category: sop.category,
        contentMarkdown: sop.contentMarkdown || "",
        keywords: (sop.keywords || []).join(", "),
        awmfLink: sop.awmfLink || ""
      });
    } else {
      setEditingSop(null);
      setSopForm({ title: "", category: "SOP", contentMarkdown: "", keywords: "", awmfLink: "" });
    }
    setPublishOnCreate(false);
    setPublishNote("");
    setSopEditorOpen(true);
  };

  const openProjectEditor = (project?: ProjectInitiative) => {
    if (project) {
      setEditingProject(project);
      setProjectForm({
        title: project.title,
        category: project.category,
        description: project.description || "",
        ownerId: project.ownerId ? String(project.ownerId) : "",
        dueDate: project.dueDate || ""
      });
    } else {
      setEditingProject(null);
      setProjectForm({ title: "", category: "SOP", description: "", ownerId: "", dueDate: "" });
    }
    setProjectEditorOpen(true);
  };

  const handleSaveSop = async () => {
    if (!sopForm.title.trim()) {
      toast({ title: "Fehler", description: "Titel ist erforderlich", variant: "destructive" });
      return;
    }
    try {
      if (editingSop) {
        await sopApi.update(editingSop.id, {
          title: sopForm.title.trim(),
          category: sopForm.category as Sop["category"],
          contentMarkdown: sopForm.contentMarkdown || null,
          keywords: sopForm.keywords
            ? sopForm.keywords.split(",").map((word) => word.trim()).filter(Boolean)
            : [],
          awmfLink: sopForm.awmfLink || null
        });
      } else {
        const created = await sopApi.create({
          title: sopForm.title.trim(),
          category: sopForm.category as Sop["category"],
          contentMarkdown: sopForm.contentMarkdown || null,
          keywords: sopForm.keywords
            ? sopForm.keywords.split(",").map((word) => word.trim()).filter(Boolean)
            : [],
          awmfLink: sopForm.awmfLink || null,
          status: "proposed"
        });
        if (publishOnCreate && canPublishSops) {
          if (!publishNote.trim()) {
            toast({ title: "Fehler", description: "Aenderungsnotiz erforderlich", variant: "destructive" });
            return;
          }
          await sopApi.publish(created.id, publishNote.trim());
        }
      }
      toast({ title: "Gespeichert" });
      setSopEditorOpen(false);
      await loadData();
    } catch (error) {
      toast({ title: "Fehler", description: "SOP konnte nicht gespeichert werden", variant: "destructive" });
    }
  };

  const handleSaveProject = async () => {
    if (!projectForm.title.trim()) {
      toast({ title: "Fehler", description: "Titel ist erforderlich", variant: "destructive" });
      return;
    }
    try {
      const payload = {
        title: projectForm.title.trim(),
        category: projectForm.category as ProjectInitiative["category"],
        description: projectForm.description || null,
        ownerId: projectForm.ownerId ? Number(projectForm.ownerId) : null,
        dueDate: projectForm.dueDate || null,
        status: "proposed"
      };
      if (editingProject) {
        await projectApi.update(editingProject.id, payload);
      } else {
        await projectApi.create(payload);
      }
      toast({ title: "Gespeichert" });
      setProjectEditorOpen(false);
      await loadData();
    } catch (error) {
      toast({ title: "Fehler", description: "Projekt konnte nicht gespeichert werden", variant: "destructive" });
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
      toast({ title: "Fehler", description: "Mitglieder konnten nicht geladen werden", variant: "destructive" });
    } finally {
      setMemberLoading(false);
    }
  };

  const saveMembers = async () => {
    if (!memberTarget) return;
    const members = Object.entries(memberSelection).map(([id, role]) => ({
      employeeId: Number(id),
      role
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
      toast({ title: "Fehler", description: "Mitglieder konnten nicht gespeichert werden", variant: "destructive" });
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
      toast({ title: "Fehler", description: "SOP konnte nicht geladen werden", variant: "destructive" });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSopAction = async (id: number, action: "accept" | "request_review" | "start_revision" | "archive") => {
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
      toast({ title: "Fehler", description: "Aktion fehlgeschlagen", variant: "destructive" });
    }
  };

  const handleProjectAction = async (id: number, action: "accept" | "complete") => {
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
      toast({ title: "Fehler", description: "Aktion fehlgeschlagen", variant: "destructive" });
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
      toast({ title: "Fehler", description: "Aktion fehlgeschlagen", variant: "destructive" });
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
      toast({ title: "Fehler", description: "Freigabe fehlgeschlagen", variant: "destructive" });
    }
  };

  const handleSuggestRefs = async () => {
    if (!detailSop) return;
    try {
      const suggestions = await sopApi.suggestReferences(detailSop.id);
      setSuggestedRefs(suggestions);
    } catch (error) {
      toast({ title: "Fehler", description: "KI-Vorschlaege konnten nicht geladen werden", variant: "destructive" });
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
        createdByAi: true
      } as any);
      toast({ title: "Referenz uebernommen" });
      await openSopDetail(detailSop.id);
      setSuggestedRefs((prev) => prev?.filter((item) => item.title !== ref.title) || null);
    } catch (error) {
      toast({ title: "Fehler", description: "Referenz konnte nicht uebernommen werden", variant: "destructive" });
    }
  };

  const rejectSuggestedRef = (ref: SopReferenceSuggestion) => {
    setSuggestedRefs((prev) => prev?.filter((item) => item.title !== ref.title) || null);
  };

  const openManualRefDialog = () => {
    setManualRefForm({
      type: "guideline",
      title: "",
      url: "",
      publisher: "",
      yearOrVersion: "",
      relevanceNote: ""
    });
    setManualRefOpen(true);
  };

  const saveManualReference = async () => {
    if (!detailSop) return;
    if (!manualRefForm.title.trim()) {
      toast({ title: "Fehler", description: "Titel ist erforderlich", variant: "destructive" });
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
        createdByAi: false
      } as any);
      toast({ title: "Referenz hinzugefuegt" });
      await openSopDetail(detailSop.id);
      setManualRefOpen(false);
    } catch (error) {
      toast({ title: "Fehler", description: "Referenz konnte nicht gespeichert werden", variant: "destructive" });
    }
  };

  const deleteProject = async (id: number) => {
    try {
      await projectApi.delete(id);
      toast({ title: "Projekt geloescht" });
      await loadData();
    } catch (error) {
      toast({ title: "Fehler", description: "Projekt konnte nicht geloescht werden", variant: "destructive" });
    }
  };

  const renderSopItem = (sop: Sop) => {
    const statusKey = normalizeSopStatus(sop.status);
    return (
      <Card key={sop.id} className="border-none kabeg-shadow hover:shadow-md transition-shadow">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h4 className="font-semibold">{sop.title}</h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-muted-foreground">{sop.category}</Badge>
                <Badge className={STATUS_STYLES[statusKey] || "bg-slate-100 text-slate-600 border-slate-200"}>
                  {SOP_LABELS[statusKey] || statusKey}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => openSopDetail(sop.id)}>
                Details
              </Button>
              {canManageSops && (
                <>
                  <Button size="sm" variant="outline" onClick={() => openMemberDialog("sop", sop.id)}>
                    <Users className="w-4 h-4 mr-1" />Mitglieder
                  </Button>
                  {statusKey === "proposed" && (
                    <>
                      <Button size="sm" onClick={() => handleSopAction(sop.id, "accept")}>
                        Annehmen
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setReasonDialog({ type: "sop", id: sop.id, action: "reject" })}>
                        Ablehnen
                      </Button>
                    </>
                  )}
                  {statusKey === "in_progress" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openSopEditor(sop)}>
                        <Pencil className="w-4 h-4 mr-1" />Bearbeiten
                      </Button>
                      <Button size="sm" onClick={() => handleSopAction(sop.id, "request_review")}>
                        Review anfordern
                      </Button>
                    </>
                  )}
                  {statusKey === "review" && (
                    <>
                      {canPublishSops && (
                        <Button size="sm" onClick={() => setPublishDialog({ id: sop.id })}>
                          Freigeben
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setReasonDialog({ type: "sop", id: sop.id, action: "changes" })}>
                        Aenderungen
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setReasonDialog({ type: "sop", id: sop.id, action: "reject" })}>
                        Ablehnen
                      </Button>
                    </>
                  )}
                  {statusKey === "published" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleSopAction(sop.id, "start_revision")}>
                        Revision
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSopAction(sop.id, "archive")}>
                        Archivieren
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          {sop.contentMarkdown && (
            <p className="text-sm text-muted-foreground line-clamp-2">{sop.contentMarkdown}</p>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderProjectItem = (project: ProjectInitiative) => {
    const statusKey = normalizeProjectStatus(project.status);
    const owner = project.ownerId ? employeeLookup.get(project.ownerId) : null;
    return (
      <Card key={project.id} className="border-none kabeg-shadow hover:shadow-md transition-shadow">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h4 className="font-semibold">{project.title}</h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-muted-foreground">{project.category}</Badge>
                <Badge className={STATUS_STYLES[statusKey] || "bg-slate-100 text-slate-600 border-slate-200"}>
                  {PROJECT_LABELS[statusKey] || statusKey}
                </Badge>
                {owner && (
                  <Badge variant="secondary">{owner.lastName || owner.name}</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {canManageProjects && (
                <>
                  {statusKey === "proposed" && (
                    <>
                      <Button size="sm" onClick={() => handleProjectAction(project.id, "accept")}>
                        Annehmen
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setReasonDialog({ type: "project", id: project.id, action: "reject" })}>
                        Ablehnen
                      </Button>
                    </>
                  )}
                  {statusKey === "active" && (
                    <Button size="sm" onClick={() => handleProjectAction(project.id, "complete")}>
                      Abschliessen
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openProjectEditor(project)}>
                    <Pencil className="w-4 h-4 mr-1" />Bearbeiten
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openMemberDialog("project", project.id)}>
                    <Users className="w-4 h-4 mr-1" />Mitglieder
                  </Button>
                  {canDeleteProjects && (
                    <Button size="sm" variant="destructive" onClick={() => deleteProject(project.id)}>
                      Loeschen
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout title="SOPs & Projekte verwalten">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">SOPs & Projekte verwalten</h2>
          <p className="text-muted-foreground text-sm">
            Vorschlaege pruefen, Mitarbeitende zuordnen und Freigaben steuern.
          </p>
        </div>

        <Tabs defaultValue="sops">
          <TabsList>
            <TabsTrigger value="sops">SOPs</TabsTrigger>
            <TabsTrigger value="projects">Projekte</TabsTrigger>
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
                  <Plus className="w-4 h-4 mr-2" />Neue SOP
                </Button>
              )}
            </div>

            {loading && <p className="text-sm text-muted-foreground">Lade SOPs...</p>}
            {!loading && sopSections.map((section) => {
              const items = filteredSops.filter((sop) => normalizeSopStatus(sop.status) === section.key);
              if (!items.length) return null;
              return (
                <div key={section.key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {items.map(renderSopItem)}
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="projects" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Input
                placeholder="Projekt suchen..."
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                className="max-w-sm"
              />
              {canManageProjects && (
                <Button onClick={() => openProjectEditor()}>
                  <Plus className="w-4 h-4 mr-2" />Neues Projekt
                </Button>
              )}
            </div>

            {loading && <p className="text-sm text-muted-foreground">Lade Projekte...</p>}
            {!loading && projectSections.map((section) => {
              const items = filteredProjects.filter((project) => normalizeProjectStatus(project.status) === section.key);
              if (!items.length) return null;
              return (
                <div key={section.key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {items.map(renderProjectItem)}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={sopEditorOpen} onOpenChange={setSopEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingSop ? "SOP bearbeiten" : "Neue SOP"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Titel</label>
              <Input value={sopForm.title} onChange={(event) => setSopForm({ ...sopForm, title: event.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Kategorie</label>
              <Select value={sopForm.category} onValueChange={(value) => setSopForm({ ...sopForm, category: value })}>
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
            <div>
              <label className="text-sm font-medium">Inhalt</label>
              <Textarea
                value={sopForm.contentMarkdown}
                onChange={(event) => setSopForm({ ...sopForm, contentMarkdown: event.target.value })}
                rows={6}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Schlagwoerter (Komma getrennt)</label>
              <Input
                value={sopForm.keywords}
                onChange={(event) => setSopForm({ ...sopForm, keywords: event.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">AWMF-Link</label>
              <Input
                value={sopForm.awmfLink}
                onChange={(event) => setSopForm({ ...sopForm, awmfLink: event.target.value })}
              />
            </div>
            {!editingSop && canPublishSops && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={publishOnCreate}
                    onCheckedChange={(checked) => setPublishOnCreate(Boolean(checked))}
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
            <Button variant="outline" onClick={() => setSopEditorOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSaveSop}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={projectEditorOpen} onOpenChange={setProjectEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Projekt bearbeiten" : "Neues Projekt"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Titel</label>
              <Input value={projectForm.title} onChange={(event) => setProjectForm({ ...projectForm, title: event.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Kategorie</label>
              <Select value={projectForm.category} onValueChange={(value) => setProjectForm({ ...projectForm, category: value })}>
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
              <Textarea
                value={projectForm.description}
                onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
                rows={5}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Owner</label>
              <Select value={projectForm.ownerId} onValueChange={(value) => setProjectForm({ ...projectForm, ownerId: value })}>
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
                onChange={(event) => setProjectForm({ ...projectForm, dueDate: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectEditorOpen(false)}>Abbrechen</Button>
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
            {memberLoading && <p className="text-sm text-muted-foreground">Lade Mitglieder...</p>}
            {!memberLoading && (
              <div className="grid gap-2 max-h-80 overflow-auto pr-2">
                {employees.map((emp) => {
                  const selected = Boolean(memberSelection[emp.id]);
                  return (
                    <div key={emp.id} className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2">
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
                        <span className="text-sm font-medium">{emp.lastName || emp.name}</span>
                      </div>
                      <Select
                        value={memberSelection[emp.id] || "read"}
                        onValueChange={(value) => {
                          if (!selected) return;
                          setMemberSelection({ ...memberSelection, [emp.id]: value as "read" | "edit" });
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
            <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={saveMembers}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reasonDialog)} onOpenChange={(open) => !open && setReasonDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reasonDialog?.action === "changes" ? "Aenderungen anfordern" : "Ablehnen"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Begruendung"
            value={reasonText}
            onChange={(event) => setReasonText(event.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialog(null)}>Abbrechen</Button>
            <Button onClick={submitReason}>Senden</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(publishDialog)} onOpenChange={(open) => !open && setPublishDialog(null)}>
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
            <Button variant="outline" onClick={() => setPublishDialog(null)}>Abbrechen</Button>
            <Button onClick={submitPublish}>Freigeben</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>SOP Details</DialogTitle>
          </DialogHeader>
          {detailLoading && <p className="text-sm text-muted-foreground">Lade...</p>}
          {!detailLoading && detailSop && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{detailSop.title}</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{detailSop.category}</Badge>
                  <Badge className={STATUS_STYLES[normalizeSopStatus(detailSop.status)]}>
                    {SOP_LABELS[normalizeSopStatus(detailSop.status)]}
                  </Badge>
                </div>
              </div>
              {detailSop.awmfLink && (
                <a href={detailSop.awmfLink} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                  {detailSop.awmfLink}
                </a>
              )}
              <Separator />
              <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                {detailSop.contentMarkdown || "Kein Inhalt hinterlegt."}
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Referenzen</h4>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleSuggestRefs}>
                      KI-Vorschlaege
                    </Button>
                    {canManageSops && (
                      <Button size="sm" variant="outline" onClick={openManualRefDialog}>
                        Referenz hinzufuegen
                      </Button>
                    )}
                  </div>
                </div>
                {detailSop.references?.length ? (
                  <div className="space-y-2">
                    {sortReferences(detailSop.references).map((ref) => (
                      <div key={ref.id} className="border rounded-lg p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{ref.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {ref.publisher || "Unbekannt"} {ref.yearOrVersion || ""}
                            </p>
                          </div>
                          <Badge variant="outline">{ref.status}</Badge>
                        </div>
                        {ref.url && (
                          <a href={ref.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                            {ref.url}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Keine Referenzen vorhanden.</p>
                )}
                {suggestedRefs && suggestedRefs.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs uppercase tracking-wide text-muted-foreground">KI-Vorschlaege</h5>
                    {suggestedRefs.map((ref) => (
                      <div key={ref.title} className="border rounded-lg p-3 text-sm">
                        <p className="font-medium">{ref.title}</p>
                        <p className="text-xs text-muted-foreground">{ref.relevanceNote}</p>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => acceptSuggestedRef(ref)}>
                            Uebernehmen
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => rejectSuggestedRef(ref)}>
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
                onValueChange={(value) => setManualRefForm((prev) => ({ ...prev, type: value }))}
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
                onChange={(event) => setManualRefForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">URL</label>
              <Input
                value={manualRefForm.url}
                onChange={(event) => setManualRefForm((prev) => ({ ...prev, url: event.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Herausgeber</label>
                <Input
                  value={manualRefForm.publisher}
                  onChange={(event) => setManualRefForm((prev) => ({ ...prev, publisher: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Jahr/Version</label>
                <Input
                  value={manualRefForm.yearOrVersion}
                  onChange={(event) => setManualRefForm((prev) => ({ ...prev, yearOrVersion: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Relevanzhinweis</label>
              <Textarea
                value={manualRefForm.relevanceNote}
                onChange={(event) => setManualRefForm((prev) => ({ ...prev, relevanceNote: event.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualRefOpen(false)}>Abbrechen</Button>
            <Button onClick={saveManualReference}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
