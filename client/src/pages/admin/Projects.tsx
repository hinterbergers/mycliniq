import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { 
  Search, 
  Plus, 
  Filter, 
  FolderOpen, 
  Users, 
  FileText, 
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  MoreHorizontal,
  ArrowRight,
  Briefcase
} from "lucide-react";
import { useState, useEffect } from "react";
import { projectApi, taskApi, documentApi, employeeApi } from "@/lib/api";
import type { ProjectInitiative, ProjectTask, ProjectDocument, Employee } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const PROJECT_STATUS_COLORS: Record<string, string> = {
  'Entwurf': 'bg-gray-100 text-gray-700 border-gray-200',
  'Aktiv': 'bg-blue-100 text-blue-700 border-blue-200',
  'In Prüfung': 'bg-amber-100 text-amber-700 border-amber-200',
  'Abgeschlossen': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Archiviert': 'bg-slate-100 text-slate-500 border-slate-200'
};

const PRIORITIES = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Mittel' },
  { value: 2, label: 'Hoch' },
  { value: 3, label: 'Kritisch' }
];

const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-gray-100 text-gray-600',
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-red-100 text-red-700'
};

const SIMULATED_USER = { id: 1, name: 'Dr. Hinterberger', role: '1. Oberarzt' };

interface ProjectWithStats extends ProjectInitiative {
  taskCount?: number;
  completedTaskCount?: number;
  documentCount?: number;
  creatorName?: string;
}

export default function Projects() {
  const [searchTerm, setSearchTerm] = useState("");
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    status: 'Entwurf' as const,
    priority: 0,
    dueDate: ''
  });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [projectsData, employeesData] = await Promise.all([
        projectApi.getAll(),
        employeeApi.getAll()
      ]);
      
      const projectsWithStats = await Promise.all(
        projectsData.map(async (project) => {
          const [tasks, documents] = await Promise.all([
            taskApi.getByProject(project.id),
            documentApi.getByProject(project.id)
          ]);
          
          const creator = employeesData.find(e => e.id === project.createdById);
          
          return {
            ...project,
            taskCount: tasks.length,
            completedTaskCount: tasks.filter(t => t.status === 'Genehmigt' || t.status === 'Veröffentlicht').length,
            documentCount: documents.length,
            creatorName: creator?.name || 'Unbekannt'
          };
        })
      );
      
      setProjects(projectsWithStats);
      setEmployees(employeesData);
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

  const handleCreateProject = async () => {
    try {
      const projectData = {
        title: newProject.title,
        description: newProject.description || undefined,
        status: newProject.status,
        priority: newProject.priority,
        dueDate: newProject.dueDate || undefined,
        createdById: SIMULATED_USER.id
      };

      await projectApi.create(projectData);
      
      toast({
        title: "Projekt erstellt",
        description: `${newProject.title} wurde erfolgreich angelegt`
      });
      
      setIsDialogOpen(false);
      setNewProject({ title: '', description: '', status: 'Entwurf', priority: 0, dueDate: '' });
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Projekt konnte nicht erstellt werden",
        variant: "destructive"
      });
    }
  };

  const filteredProjects = projects.filter(project =>
    project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.creatorName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProgress = (project: ProjectWithStats) => {
    if (!project.taskCount || project.taskCount === 0) return 0;
    return Math.round((project.completedTaskCount || 0) / project.taskCount * 100);
  };

  return (
    <Layout title="Projektmanagement">
      <div className="space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Projekte suchen..." 
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-projects"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" data-testid="button-filter">
              <Filter className="w-4 h-4" /> Filter
            </Button>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" data-testid="button-new-project">
                  <Plus className="w-4 h-4" /> Neues Projekt
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Neues Projekt anlegen</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Titel *</Label>
                    <Input 
                      id="title"
                      placeholder="z.B. SOP PPROM"
                      value={newProject.title}
                      onChange={(e) => setNewProject(prev => ({ ...prev, title: e.target.value }))}
                      data-testid="input-project-title"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description">Beschreibung</Label>
                    <Textarea 
                      id="description"
                      placeholder="Projektbeschreibung..."
                      rows={3}
                      value={newProject.description}
                      onChange={(e) => setNewProject(prev => ({ ...prev, description: e.target.value }))}
                      data-testid="input-project-description"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Priorität</Label>
                      <Select 
                        value={newProject.priority.toString()}
                        onValueChange={(v) => setNewProject(prev => ({ ...prev, priority: parseInt(v) }))}
                      >
                        <SelectTrigger data-testid="select-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map(p => (
                            <SelectItem key={p.value} value={p.value.toString()}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="dueDate">Fällig bis</Label>
                      <Input 
                        id="dueDate"
                        type="date"
                        value={newProject.dueDate}
                        onChange={(e) => setNewProject(prev => ({ ...prev, dueDate: e.target.value }))}
                        data-testid="input-due-date"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Abbrechen
                  </Button>
                  <Button 
                    onClick={handleCreateProject}
                    disabled={!newProject.title}
                    data-testid="button-create-project"
                  >
                    Projekt erstellen
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Projekte werden geladen...</div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Projekte gefunden</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {searchTerm ? 'Versuchen Sie eine andere Suche.' : 'Erstellen Sie Ihr erstes Projekt.'}
              </p>
              {!searchTerm && (
                <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" /> Neues Projekt
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map(project => (
              <Card 
                key={project.id} 
                className="group hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setLocation(`/admin/projects/${project.id}`)}
                data-testid={`card-project-${project.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold line-clamp-1">
                        {project.title}
                      </CardTitle>
                      {project.description && (
                        <CardDescription className="line-clamp-2 mt-1">
                          {project.description}
                        </CardDescription>
                      )}
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`ml-2 shrink-0 ${PROJECT_STATUS_COLORS[project.status]}`}
                    >
                      {project.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        <span>{project.creatorName}</span>
                      </div>
                      {project.dueDate && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          <span>{format(new Date(project.dueDate), 'dd.MM.yyyy', { locale: de })}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{project.completedTaskCount || 0}/{project.taskCount || 0} Aufgaben</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <FileText className="w-4 h-4" />
                        <span>{project.documentCount || 0} Dokumente</span>
                      </div>
                    </div>
                    
                    {project.taskCount && project.taskCount > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Fortschritt</span>
                          <span>{getProgress(project)}%</span>
                        </div>
                        <Progress value={getProgress(project)} className="h-1.5" />
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  <div className="flex items-center justify-between w-full">
                    {project.priority > 0 && (
                      <Badge variant="secondary" className={PRIORITY_COLORS[project.priority]}>
                        {PRIORITIES.find(p => p.value === project.priority)?.label}
                      </Badge>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="ml-auto gap-1 group-hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation(`/admin/projects/${project.id}`);
                      }}
                      data-testid={`button-open-project-${project.id}`}
                    >
                      Öffnen <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
