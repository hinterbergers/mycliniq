import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search } from "lucide-react";
import type { ProjectInitiative } from "@shared/schema";
import { projectApi, type ProjectDetail } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_STYLES: Record<string, string> = {
  SOP: "bg-blue-100 text-blue-700 border-blue-200",
  Studie: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Administrativ: "bg-amber-100 text-amber-700 border-amber-200",
  "Qualitätsprojekt": "bg-slate-100 text-slate-700 border-slate-200"
};

export default function Projects() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectInitiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Alle");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailProject, setDetailProject] = useState<ProjectDetail | null>(null);

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
          variant: "destructive"
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
      const matchesCategory = selectedCategory === "Alle" || project.category === selectedCategory;
      const matchesSearch = !term ||
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
        variant: "destructive"
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Layout title="Projekte">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Abgeschlossene Projekte</h2>
          <p className="text-muted-foreground max-w-2xl">
            Freigegebene Projekte und SOP-Umsetzungen zur Information der Abteilung.
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
        </div>

        {loading && <p className="text-sm text-muted-foreground">Lade Projekte...</p>}

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
                    <Badge className={CATEGORY_STYLES[project.category] || "bg-slate-100 text-slate-700 border-slate-200"}>
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
          {detailLoading && <p className="text-sm text-muted-foreground">Lade...</p>}
          {!detailLoading && detailProject && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{detailProject.title}</h3>
                <Badge className={CATEGORY_STYLES[detailProject.category] || "bg-slate-100 text-slate-700 border-slate-200"}>
                  {detailProject.category}
                </Badge>
              </div>
              <Separator />
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                {detailProject.description || "Keine Beschreibung hinterlegt."}
              </div>
              {detailProject.members && detailProject.members.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Beteiligte</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailProject.members.map((member) => (
                      <Badge key={`${detailProject.id}-${member.employeeId}`} variant="secondary">
                        {member.lastName || member.name || `#${member.employeeId}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
