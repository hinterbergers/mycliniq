import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MarkdownEditor,
  MarkdownViewer,
} from "@/components/editor/MarkdownEditor";
import { Plus, Search } from "lucide-react";
import type { ProjectInitiative } from "@shared/schema";
import { projectApi, type ProjectDetail } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const CATEGORY_STYLES: Record<string, string> = {
  SOP: "bg-blue-100 text-blue-700 border-blue-200",
  Studie: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Administrativ: "bg-amber-100 text-amber-700 border-amber-200",
  Qualitätsprojekt: "bg-slate-100 text-slate-700 border-slate-200",
};

const PROJECT_CATEGORIES = [
  "SOP",
  "Studie",
  "Administrativ",
  "Qualitätsprojekt",
] as const;

type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

type ProjectEditorForm = {
  title: string;
  category: ProjectCategory;
  description: string;
};

export default function Projects() {
  const { toast } = useToast();
  const { employee } = useAuth();
  const [projects, setProjects] = useState<ProjectInitiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Alle");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailProject, setDetailProject] = useState<ProjectDetail | null>(
    null,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorForm, setEditorForm] = useState<ProjectEditorForm>({
    title: "",
    category: "Administrativ",
    description: "",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await projectApi.getAll({ status: "done" });
        setProjects(data);
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Projekte konnten nicht geladen werden",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [toast]);

  const categories = useMemo(() => {
    const set = new Set(projects.map((project) => project.category));
    return ["Alle", ...Array.from(set)];
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesCategory =
        selectedCategory === "Alle" || project.category === selectedCategory;
      const matchesSearch =
        !term ||
        project.title.toLowerCase().includes(term) ||
        (project.description || "").toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [projects, searchTerm, selectedCategory]);

  const openDetail = async (project: ProjectInitiative) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const detail = await projectApi.getById(project.id);
      setDetailProject(detail);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Projekt konnte nicht geladen werden",
        variant: "destructive",
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const openEditor = () => {
    setEditorForm({
      title: "",
      category: "Administrativ",
      description: "",
    });
    setEditorOpen(true);
  };

  const handleCreate = async () => {
    const title = editorForm.title.trim();
    if (!title) {
      toast({
        title: "Titel fehlt",
        description: "Bitte einen Projekttitel angeben.",
      });
      return;
    }
    if (!employee?.id) {
      toast({
        title: "Fehler",
        description: "Kein Benutzerkontext (createdById) vorhanden.",
        variant: "destructive",
      });
      return;
    }

    setEditorSaving(true);
    try {
      await projectApi.create({
        title,
        description: editorForm.description.trim() || null,
        category: editorForm.category,
        status: "proposed",
        createdById: employee.id,
      });
      toast({
        title: "Projekt vorgeschlagen",
        description: "Der Vorschlag wurde zur Freigabe eingereicht.",
      });
      setEditorOpen(false);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Projekt konnte nicht angelegt werden",
        variant: "destructive",
      });
    } finally {
      setEditorSaving(false);
    }
  };

  return (
    <Layout title="Projekte">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            Abgeschlossene Projekte
          </h2>
          <p className="text-muted-foreground max-w-2xl">
            Freigegebene Projekte und SOP-Umsetzungen zur Information der
            Abteilung.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Projekte durchsuchen..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                size="sm"
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Button>
            ))}
          </div>
          <Button onClick={openEditor}>
            <Plus className="w-4 h-4 mr-2" />
            Projekt vorschlagen
          </Button>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground">Lade Projekte...</p>
        )}

        {!loading && filteredProjects.length === 0 && (
          <Card className="border border-dashed">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Keine abgeschlossenen Projekte gefunden.
            </CardContent>
          </Card>
        )}

        {!loading && filteredProjects.length > 0 && (
          <div className="grid gap-4">
            {filteredProjects.map((project) => (
              <Card
                key={project.id}
                className="border-none kabeg-shadow hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openDetail(project)}
              >
                <CardContent className="p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{project.title}</h3>
                      {project.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      className={
                        CATEGORY_STYLES[project.category] ||
                        "bg-slate-100 text-slate-700 border-slate-200"
                      }
                    >
                      {project.category}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Projekt Details</DialogTitle>
          </DialogHeader>
          {detailLoading && (
            <p className="text-sm text-muted-foreground">Lade...</p>
          )}
          {!detailLoading && detailProject && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{detailProject.title}</h3>
                <Badge
                  className={
                    CATEGORY_STYLES[detailProject.category] ||
                    "bg-slate-100 text-slate-700 border-slate-200"
                  }
                >
                  {detailProject.category}
                </Badge>
              </div>
              <Separator />
              {detailProject.description ? (
                <MarkdownViewer
                  value={detailProject.description}
                  className="text-sm"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Keine Beschreibung hinterlegt.
                </p>
              )}
              {detailProject.members && detailProject.members.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Beteiligte</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailProject.members.map((member) => (
                      <Badge
                        key={`${detailProject.id}-${member.employeeId}`}
                        variant="secondary"
                      >
                        {member.lastName ||
                          member.name ||
                          `#${member.employeeId}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Projekt vorschlagen</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4 pr-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Titel</label>
              <Input
                value={editorForm.title}
                onChange={(event) =>
                  setEditorForm((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                placeholder="Projekt-Titel"
              />
            </div>
            <div className="space-y-2 max-w-sm">
              <label className="text-sm font-medium">Kategorie</label>
              <Select
                value={editorForm.category}
                onValueChange={(value) =>
                  setEditorForm((prev) => ({
                    ...prev,
                    category: value as ProjectCategory,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Beschreibung</label>
              <MarkdownEditor
                value={editorForm.description}
                onChange={(value) =>
                  setEditorForm((prev) => ({ ...prev, description: value }))
                }
                height={420}
                placeholder="Projektbeschreibung..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreate} disabled={editorSaving}>
              {editorSaving ? "Speichern..." : "Vorschlag senden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
