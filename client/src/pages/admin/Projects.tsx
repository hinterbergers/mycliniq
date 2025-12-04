import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
  Briefcase,
  Trash2,
  Edit,
  User,
  Info,
  RefreshCw
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";
import { projectApi, taskApi, documentApi, employeeApi } from "@/lib/api";
import type { ProjectInitiative, ProjectTask, ProjectDocument, Employee } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/lib/auth";

const PROJECT_STATUS_OPTIONS = ['Offen', 'In Arbeit', 'In Review', 'Abgeschlossen'];
const PROJECT_STATUS_COLORS: Record<string, string> = {
  'Offen': 'bg-gray-100 text-gray-700 border-gray-200',
  'In Arbeit': 'bg-blue-100 text-blue-700 border-blue-200',
  'In Review': 'bg-amber-100 text-amber-700 border-amber-200',
  'Abgeschlossen': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Entwurf': 'bg-gray-100 text-gray-700 border-gray-200',
  'Aktiv': 'bg-blue-100 text-blue-700 border-blue-200',
  'In Prüfung': 'bg-amber-100 text-amber-700 border-amber-200',
  'Archiviert': 'bg-slate-100 text-slate-500 border-slate-200'
};

const PROJECT_CATEGORIES = [
  { value: 'SOP', label: 'SOP' },
  { value: 'Studie', label: 'Studie' },
  { value: 'Administrativ', label: 'Administrativ' },
  { value: 'Qualitätsprojekt', label: 'Qualitätsprojekt' }
];

const CATEGORY_COLORS: Record<string, string> = {
  'SOP': 'bg-purple-100 text-purple-700 border-purple-200',
  'Studie': 'bg-blue-100 text-blue-700 border-blue-200',
  'Administrativ': 'bg-slate-100 text-slate-700 border-slate-200',
  'Qualitätsprojekt': 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

interface MockProject {
  id: number;
  title: string;
  description?: string;
  category: string;
  status: string;
  ownerId: number;
  ownerName: string;
  participants: { id: number; name: string; initials: string }[];
  dueDate?: string;
  taskCount: number;
  completedTaskCount: number;
}

const MOCK_PROJECTS: MockProject[] = [
  {
    id: 1001,
    title: "SOP PPROM",
    description: "Standardarbeitsanweisung für vorzeitigen Blasensprung erstellen",
    category: "SOP",
    status: "In Arbeit",
    ownerId: 2,
    ownerName: "Dr. Hinterberger",
    participants: [
      { id: 9, name: "Dr. Barbara Markota", initials: "BM" },
      { id: 11, name: "Dr. Lucia Gerhold", initials: "LG" }
    ],
    dueDate: "2025-01-15",
    taskCount: 5,
    completedTaskCount: 2
  },
  {
    id: 1002,
    title: "Qualitätszirkel Sectio-Rate",
    description: "Analyse und Optimierung der Kaiserschnitt-Indikationen",
    category: "Qualitätsprojekt",
    status: "In Arbeit",
    ownerId: 1,
    ownerName: "PD Dr. Lermann",
    participants: [
      { id: 2, name: "Dr. Stefan Hinterberger", initials: "SH" },
      { id: 4, name: "Dr. Andreja Gornjec", initials: "AG" },
      { id: 5, name: "Dr. Christoph Herbst", initials: "CH" }
    ],
    dueDate: "2025-02-28",
    taskCount: 8,
    completedTaskCount: 3
  },
  {
    id: 1003,
    title: "Endometriose-Studie ENDO-2025",
    description: "Multizentrische Beobachtungsstudie zu Endometriose-Behandlungsergebnissen",
    category: "Studie",
    status: "Offen",
    ownerId: 4,
    ownerName: "Dr. Gornjec",
    participants: [
      { id: 7, name: "Dr. Martina Krenn", initials: "MK" }
    ],
    dueDate: "2025-06-30",
    taskCount: 12,
    completedTaskCount: 0
  },
  {
    id: 1004,
    title: "Dienstplan-Optimierung",
    description: "Überarbeitung der Dienstplan-Regularien und Fairness-Kriterien",
    category: "Administrativ",
    status: "In Review",
    ownerId: 2,
    ownerName: "Dr. Hinterberger",
    participants: [
      { id: 1, name: "PD Dr. Johannes Lermann", initials: "JL" }
    ],
    dueDate: "2024-12-20",
    taskCount: 4,
    completedTaskCount: 4
  },
  {
    id: 1005,
    title: "SOP Postpartale Hämorrhagie",
    description: "Aktualisierung der PPH-Leitlinie nach neuesten AWMF-Standards",
    category: "SOP",
    status: "Abgeschlossen",
    ownerId: 9,
    ownerName: "Dr. Markota",
    participants: [
      { id: 2, name: "Dr. Stefan Hinterberger", initials: "SH" },
      { id: 5, name: "Dr. Christoph Herbst", initials: "CH" }
    ],
    dueDate: "2024-11-30",
    taskCount: 6,
    completedTaskCount: 6
  }
];

const MOCK_EMPLOYEES = [
  { id: 1, name: "PD Dr. Johannes Lermann", initials: "JL" },
  { id: 2, name: "Dr. Stefan Hinterberger", initials: "SH" },
  { id: 3, name: "Dr. Janos Gellen", initials: "JG" },
  { id: 4, name: "Dr. Andreja Gornjec", initials: "AG" },
  { id: 5, name: "Dr. Christoph Herbst", initials: "CH" },
  { id: 7, name: "Dr. Martina Krenn", initials: "MK" },
  { id: 9, name: "Dr. Barbara Markota", initials: "BM" },
  { id: 11, name: "Dr. Lucia Gerhold", initials: "LG" }
];

export default function Projects() {
  const { employee: currentUser, isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [projects, setProjects] = useState<MockProject[]>(MOCK_PROJECTS);
  const [selectedCategory, setSelectedCategory] = useState<string>("Alle");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<MockProject | null>(null);
  const [newProject, setNewProject] = useState({
    title: '',
    category: '',
    client: '',
    description: '',
    participants: [] as number[],
    dueDate: ''
  });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleCreateProject = () => {
    if (!newProject.title || !newProject.category) {
      toast({
        title: "Fehler",
        description: "Projektname und Kategorie sind Pflichtfelder",
        variant: "destructive"
      });
      return;
    }

    const newId = Math.max(...projects.map(p => p.id)) + 1;
    const newProjectData: MockProject = {
      id: newId,
      title: newProject.title,
      description: newProject.description,
      category: newProject.category,
      status: 'Offen',
      ownerId: currentUser?.id || 2,
      ownerName: currentUser?.name || 'Dr. Hinterberger',
      participants: newProject.participants.map(id => {
        const emp = MOCK_EMPLOYEES.find(e => e.id === id);
        return emp ? { id: emp.id, name: emp.name, initials: emp.initials } : { id, name: 'Unbekannt', initials: '??' };
      }),
      dueDate: newProject.dueDate || undefined,
      taskCount: 0,
      completedTaskCount: 0
    };

    setProjects(prev => [newProjectData, ...prev]);
    setIsDialogOpen(false);
    setNewProject({ title: '', category: '', client: '', description: '', participants: [], dueDate: '' });
    toast({ title: "Projekt erstellt", description: `${newProject.title} wurde angelegt` });
  };

  const handleOpenDetail = (project: MockProject) => {
    setSelectedProject(project);
    setDetailDialogOpen(true);
  };

  const handleUpdateStatus = (projectId: number, newStatus: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, status: newStatus } : p
    ));
    toast({ title: "Status aktualisiert" });
  };

  const handleDeleteProject = (projectId: number) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    toast({ title: "Projekt gelöscht" });
  };

  const toggleParticipant = (empId: number) => {
    setNewProject(prev => ({
      ...prev,
      participants: prev.participants.includes(empId)
        ? prev.participants.filter(id => id !== empId)
        : [...prev.participants, empId]
    }));
  };

  const filteredProjects = projects.filter(project => {
    const matchesSearch = searchTerm === '' ||
      project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.ownerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Alle' || project.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getProgress = (project: MockProject) => {
    if (project.taskCount === 0) return 0;
    return Math.round((project.completedTaskCount / project.taskCount) * 100);
  };

  return (
    <Layout title="Projekte">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projekte</h1>
          <p className="text-muted-foreground">Aufgaben, SOP-Erstellungen, Studien und administrative Projekte.</p>
        </div>

        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex gap-2 flex-1">
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
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Alle">Alle Kategorien</SelectItem>
                {PROJECT_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-new-project">
                <Plus className="w-4 h-4" /> Neues Projekt
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Neues Projekt anlegen</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Projektname *</Label>
                  <Input 
                    id="title"
                    placeholder="z.B. SOP PPROM"
                    value={newProject.title}
                    onChange={(e) => setNewProject(prev => ({ ...prev, title: e.target.value }))}
                    data-testid="input-project-title"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Kategorie *</Label>
                  <Select 
                    value={newProject.category}
                    onValueChange={(v) => setNewProject(prev => ({ ...prev, category: v }))}
                  >
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="Kategorie wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client">Auftraggeber</Label>
                  <Input 
                    id="client"
                    placeholder="z.B. Primararzt, OA, QM"
                    value={newProject.client}
                    onChange={(e) => setNewProject(prev => ({ ...prev, client: e.target.value }))}
                    data-testid="input-project-client"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Beschreibung / Auftragstext</Label>
                  <Textarea 
                    id="description"
                    placeholder="Projektbeschreibung..."
                    rows={3}
                    value={newProject.description}
                    onChange={(e) => setNewProject(prev => ({ ...prev, description: e.target.value }))}
                    data-testid="input-project-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Beteiligte Mitarbeitende</Label>
                  <div className="grid grid-cols-2 gap-2 p-3 border border-border rounded-lg bg-muted/10 max-h-40 overflow-y-auto">
                    {MOCK_EMPLOYEES.map(emp => (
                      <div key={emp.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`emp-${emp.id}`}
                          checked={newProject.participants.includes(emp.id)}
                          onCheckedChange={() => toggleParticipant(emp.id)}
                        />
                        <Label htmlFor={`emp-${emp.id}`} className="text-sm font-normal cursor-pointer">
                          {emp.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Fälligkeitsdatum</Label>
                  <Input 
                    id="dueDate"
                    type="date"
                    value={newProject.dueDate}
                    onChange={(e) => setNewProject(prev => ({ ...prev, dueDate: e.target.value }))}
                    data-testid="input-due-date"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button 
                  onClick={handleCreateProject}
                  disabled={!newProject.title || !newProject.category}
                  data-testid="button-create-project"
                >
                  Projekt erstellen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {filteredProjects.length === 0 ? (
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
                onClick={() => handleOpenDetail(project)}
                data-testid={`card-project-${project.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={CATEGORY_COLORS[project.category]}>
                          {project.category}
                        </Badge>
                        <Badge variant="outline" className={PROJECT_STATUS_COLORS[project.status]}>
                          {project.status}
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-semibold line-clamp-1">
                        {project.title}
                      </CardTitle>
                      {project.description && (
                        <CardDescription className="line-clamp-2 mt-1">
                          {project.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Verantwortlich:</span>
                      <span className="font-medium">{project.ownerName}</span>
                    </div>
                    
                    {project.participants.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <div className="flex gap-1 flex-wrap">
                          {project.participants.slice(0, 3).map(p => (
                            <Badge key={p.id} variant="secondary" className="text-xs">
                              {p.initials}
                            </Badge>
                          ))}
                          {project.participants.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{project.participants.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {project.dueDate && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>Fällig: {format(new Date(project.dueDate), 'dd.MM.yyyy', { locale: de })}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{project.completedTaskCount}/{project.taskCount} Aufgaben</span>
                    </div>
                    
                    {project.taskCount > 0 && (
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`button-menu-project-${project.id}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => handleOpenDetail(project)}>
                          <Edit className="w-4 h-4 mr-2" /> Details anzeigen
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {PROJECT_STATUS_OPTIONS.map(status => (
                          <DropdownMenuItem 
                            key={status}
                            onClick={() => handleUpdateStatus(project.id, status)}
                            className={project.status === status ? 'bg-accent' : ''}
                          >
                            {status}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteProject(project.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-1 group-hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetail(project);
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

      <ProjectDetailDialog 
        project={selectedProject}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onStatusChange={(status) => {
          if (selectedProject) {
            handleUpdateStatus(selectedProject.id, status);
            setSelectedProject({ ...selectedProject, status });
          }
        }}
      />
    </Layout>
  );
}

interface SubTask {
  id: number;
  title: string;
  assignee: string;
  status: 'Offen' | 'In Arbeit' | 'Erledigt';
}

function ProjectDetailDialog({ 
  project, 
  open, 
  onOpenChange,
  onStatusChange
}: { 
  project: MockProject | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onStatusChange: (status: string) => void;
}) {
  const [subtasks, setSubtasks] = useState<SubTask[]>([
    { id: 1, title: "Literaturrecherche AWMF", assignee: "Dr. Markota", status: "Erledigt" },
    { id: 2, title: "Entwurf Ablaufdiagramm", assignee: "Dr. Hinterberger", status: "In Arbeit" },
    { id: 3, title: "Review durch OA", assignee: "Dr. Gerhold", status: "Offen" },
    { id: 4, title: "Primar-Freigabe einholen", assignee: "PD Dr. Lermann", status: "Offen" }
  ]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const { toast } = useToast();

  const handleAddSubtask = () => {
    if (!newTaskTitle) return;
    const newTask: SubTask = {
      id: Date.now(),
      title: newTaskTitle,
      assignee: newTaskAssignee || "Nicht zugewiesen",
      status: "Offen"
    };
    setSubtasks(prev => [...prev, newTask]);
    setNewTaskTitle("");
    setNewTaskAssignee("");
    setShowAddTask(false);
    toast({ title: "Unteraufgabe hinzugefügt" });
  };

  const handleToggleTaskStatus = (taskId: number) => {
    setSubtasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const nextStatus: Record<string, 'Offen' | 'In Arbeit' | 'Erledigt'> = {
          'Offen': 'In Arbeit',
          'In Arbeit': 'Erledigt',
          'Erledigt': 'Offen'
        };
        return { ...t, status: nextStatus[t.status] };
      }
      return t;
    }));
  };

  const getTaskStatusIcon = (status: string) => {
    switch (status) {
      case 'Erledigt':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'In Arbeit':
        return <RefreshCw className="w-4 h-4 text-blue-600" />;
      default:
        return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className={CATEGORY_COLORS[project.category]}>
              {project.category}
            </Badge>
            <Select value={project.status} onValueChange={onStatusChange}>
              <SelectTrigger className="w-auto h-6 text-xs px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogTitle className="text-xl">{project.title}</DialogTitle>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Verantwortlich</p>
              <p className="font-medium">{project.ownerName}</p>
            </div>
            {project.dueDate && (
              <div>
                <p className="text-muted-foreground">Fälligkeitsdatum</p>
                <p className="font-medium">{format(new Date(project.dueDate), 'dd.MM.yyyy', { locale: de })}</p>
              </div>
            )}
          </div>

          {project.participants.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Beteiligte</p>
              <div className="flex gap-2 flex-wrap">
                {project.participants.map(p => (
                  <Badge key={p.id} variant="secondary">{p.name}</Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Unteraufgaben</h4>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1"
                onClick={() => setShowAddTask(true)}
              >
                <Plus className="w-4 h-4" /> Unteraufgabe hinzufügen
              </Button>
            </div>

            {showAddTask && (
              <div className="p-3 border border-border rounded-lg bg-muted/30 mb-3 space-y-2">
                <Input 
                  placeholder="Aufgabentitel"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  data-testid="input-subtask-title"
                />
                <div className="flex gap-2">
                  <Input 
                    placeholder="Verantwortliche:r"
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleAddSubtask} disabled={!newTaskTitle}>
                    Hinzufügen
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddTask(false)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {subtasks.map(task => (
                <div 
                  key={task.id} 
                  className="flex items-center gap-3 p-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                  onClick={() => handleToggleTaskStatus(task.id)}
                >
                  {getTaskStatusIcon(task.status)}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === 'Erledigt' ? 'line-through text-muted-foreground' : ''}`}>
                      {task.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{task.assignee}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${
                    task.status === 'Erledigt' ? 'bg-emerald-50 text-emerald-700' :
                    task.status === 'In Arbeit' ? 'bg-blue-50 text-blue-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {task.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {project.status === 'Abgeschlossen' && project.category === 'SOP' && (
            <>
              <Separator />
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg flex gap-3">
                <Info className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-700">
                  SOP-Projekte werden nach Freigabe automatisch in den SOP-Bereich übernommen 
                  und stehen allen Mitarbeitenden zur Verfügung.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
