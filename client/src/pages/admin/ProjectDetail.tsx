import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { 
  ArrowLeft,
  Plus, 
  Users, 
  FileText, 
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  MoreHorizontal,
  Edit,
  Trash2,
  Send,
  Eye,
  Check,
  X,
  RefreshCw,
  BookOpen,
  MessageSquare
} from "lucide-react";
import { useState, useEffect } from "react";
import { projectApi, taskApi, documentApi, employeeApi, approvalApi } from "@/lib/api";
import type { ProjectInitiative, ProjectTask, ProjectDocument, Employee, Approval } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const STATUS_COLORS: Record<string, string> = {
  'Entwurf': 'bg-gray-100 text-gray-700 border-gray-200',
  'Aktiv': 'bg-blue-100 text-blue-700 border-blue-200',
  'In Prüfung': 'bg-amber-100 text-amber-700 border-amber-200',
  'Abgeschlossen': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Archiviert': 'bg-slate-100 text-slate-500 border-slate-200',
  'Offen': 'bg-gray-100 text-gray-700 border-gray-200',
  'In Bearbeitung': 'bg-blue-100 text-blue-700 border-blue-200',
  'Zur Prüfung': 'bg-amber-100 text-amber-700 border-amber-200',
  'Genehmigt': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Veröffentlicht': 'bg-purple-100 text-purple-700 border-purple-200'
};

const TASK_STATUS_OPTIONS = [
  { value: 'Offen', label: 'Offen', icon: Circle },
  { value: 'In Bearbeitung', label: 'In Bearbeitung', icon: RefreshCw },
  { value: 'Zur Prüfung', label: 'Zur Prüfung', icon: Eye },
  { value: 'Genehmigt', label: 'Genehmigt', icon: Check },
  { value: 'Veröffentlicht', label: 'Veröffentlicht', icon: BookOpen }
];

const DOCUMENT_CATEGORIES = [
  { value: 'SOP', label: 'SOP' },
  { value: 'Leitlinie', label: 'Leitlinie' },
  { value: 'Protokoll', label: 'Protokoll' },
  { value: 'Checkliste', label: 'Checkliste' },
  { value: 'Formular', label: 'Formular' },
  { value: 'Schulung', label: 'Schulung' },
  { value: 'Sonstiges', label: 'Sonstiges' }
];

const SIMULATED_USER = { id: 1, name: 'Dr. Hinterberger', role: '1. Oberarzt' };

export default function ProjectDetail() {
  const params = useParams();
  const projectId = parseInt(params.id || '0');
  const [, setLocation] = useLocation();
  
  const [project, setProject] = useState<ProjectInitiative | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isDocDialogOpen, setIsDocDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ProjectDocument | null>(null);
  
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedToId: null as number | null,
    dueDate: ''
  });
  
  const [newDocument, setNewDocument] = useState({
    title: '',
    content: '',
    category: 'SOP' as const
  });
  
  const { toast } = useToast();

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    try {
      const [projectData, tasksData, documentsData, employeesData] = await Promise.all([
        projectApi.getById(projectId),
        taskApi.getByProject(projectId),
        documentApi.getByProject(projectId),
        employeeApi.getAll()
      ]);
      
      setProject(projectData);
      setTasks(tasksData);
      setDocuments(documentsData);
      setEmployees(employeesData);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Projektdaten konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async () => {
    try {
      await taskApi.create(projectId, {
        title: newTask.title,
        description: newTask.description || undefined,
        assignedToId: newTask.assignedToId || undefined,
        dueDate: newTask.dueDate || undefined,
        createdById: SIMULATED_USER.id
      });
      
      toast({ title: "Aufgabe erstellt" });
      setIsTaskDialogOpen(false);
      setNewTask({ title: '', description: '', assignedToId: null, dueDate: '' });
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Aufgabe konnte nicht erstellt werden",
        variant: "destructive"
      });
    }
  };

  const handleUpdateTaskStatus = async (taskId: number, status: string) => {
    try {
      await taskApi.update(taskId, { status: status as any });
      toast({ title: "Status aktualisiert" });
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Status konnte nicht aktualisiert werden",
        variant: "destructive"
      });
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      await taskApi.delete(taskId);
      toast({ title: "Aufgabe gelöscht" });
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Aufgabe konnte nicht gelöscht werden",
        variant: "destructive"
      });
    }
  };

  const handleCreateDocument = async () => {
    try {
      await documentApi.create(projectId, {
        title: newDocument.title,
        content: newDocument.content || undefined,
        category: newDocument.category,
        createdById: SIMULATED_USER.id
      });
      
      toast({ title: "Dokument erstellt" });
      setIsDocDialogOpen(false);
      setNewDocument({ title: '', content: '', category: 'SOP' });
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Dokument konnte nicht erstellt werden",
        variant: "destructive"
      });
    }
  };

  const handleSaveDocument = async () => {
    if (!editingDocument) return;
    
    try {
      await documentApi.update(editingDocument.id, {
        content: editingDocument.content,
        lastEditedById: SIMULATED_USER.id,
        status: 'In Bearbeitung'
      });
      
      toast({ title: "Dokument gespeichert" });
      setEditingDocument(null);
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Dokument konnte nicht gespeichert werden",
        variant: "destructive"
      });
    }
  };

  const handleRequestApproval = async (documentId: number) => {
    try {
      await documentApi.requestApproval(documentId, {
        requestedById: SIMULATED_USER.id,
        decision: 'Ausstehend'
      });
      
      toast({ title: "Freigabe angefordert" });
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Freigabe konnte nicht angefordert werden",
        variant: "destructive"
      });
    }
  };

  const handlePublishDocument = async (documentId: number) => {
    try {
      await documentApi.publish(documentId);
      toast({ 
        title: "Veröffentlicht",
        description: "Das Dokument ist jetzt im Wissensbereich verfügbar"
      });
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Dokument konnte nicht veröffentlicht werden",
        variant: "destructive"
      });
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    try {
      await documentApi.delete(documentId);
      toast({ title: "Dokument gelöscht" });
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Dokument konnte nicht gelöscht werden",
        variant: "destructive"
      });
    }
  };

  const getEmployeeName = (id: number | null) => {
    if (!id) return 'Nicht zugewiesen';
    const emp = employees.find(e => e.id === id);
    return emp?.name || 'Unbekannt';
  };

  if (loading) {
    return (
      <Layout title="Projekt">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Wird geladen...</div>
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout title="Projekt nicht gefunden">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Projekt nicht gefunden</h3>
            <Button onClick={() => setLocation('/projekte')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Zurück zur Übersicht
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title={project.title}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation('/projekte')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Zurück
          </Button>
          <Badge variant="outline" className={STATUS_COLORS[project.status]}>
            {project.status}
          </Badge>
          {project.dueDate && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Fällig: {format(new Date(project.dueDate), 'dd.MM.yyyy', { locale: de })}</span>
            </div>
          )}
        </div>

        {project.description && (
          <p className="text-muted-foreground">{project.description}</p>
        )}

        <Tabs defaultValue="tasks">
          <TabsList>
            <TabsTrigger value="tasks" className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Aufgaben ({tasks.length})
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="w-4 h-4" />
              Dokumente ({documents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Aufgaben</h3>
                <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2" data-testid="button-new-task">
                      <Plus className="w-4 h-4" /> Neue Aufgabe
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Neue Aufgabe</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label>Titel *</Label>
                        <Input 
                          placeholder="Aufgabentitel"
                          value={newTask.title}
                          onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                          data-testid="input-task-title"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Beschreibung</Label>
                        <Textarea 
                          placeholder="Details zur Aufgabe..."
                          value={newTask.description}
                          onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                          data-testid="input-task-description"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Zuweisen an</Label>
                          <Select 
                            value={newTask.assignedToId?.toString() || ''}
                            onValueChange={(v) => setNewTask(prev => ({ ...prev, assignedToId: v ? parseInt(v) : null }))}
                          >
                            <SelectTrigger data-testid="select-assignee">
                              <SelectValue placeholder="Mitarbeiter wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              {employees.filter(e => e.isActive).map(emp => (
                                <SelectItem key={emp.id} value={emp.id.toString()}>
                                  {emp.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Fällig bis</Label>
                          <Input 
                            type="date"
                            value={newTask.dueDate}
                            onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                            data-testid="input-task-due-date"
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsTaskDialogOpen(false)}>Abbrechen</Button>
                      <Button onClick={handleCreateTask} disabled={!newTask.title} data-testid="button-create-task">
                        Erstellen
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {tasks.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <CheckCircle2 className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">Keine Aufgaben vorhanden</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {tasks.map(task => {
                    const StatusIcon = TASK_STATUS_OPTIONS.find(s => s.value === task.status)?.icon || Circle;
                    return (
                      <Card key={task.id} data-testid={`card-task-${task.id}`}>
                        <CardContent className="flex items-center gap-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{task.title}</span>
                              <Badge variant="outline" className={`text-xs ${STATUS_COLORS[task.status]}`}>
                                {task.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />
                                {getEmployeeName(task.assignedToId)}
                              </span>
                              {task.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {format(new Date(task.dueDate), 'dd.MM.', { locale: de })}
                                </span>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-task-menu-${task.id}`}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {TASK_STATUS_OPTIONS.map(status => (
                                <DropdownMenuItem 
                                  key={status.value}
                                  onClick={() => handleUpdateTaskStatus(task.id, status.value)}
                                  className="gap-2"
                                >
                                  <status.icon className="w-4 h-4" />
                                  {status.label}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteTask(task.id)}
                                className="text-destructive gap-2"
                              >
                                <Trash2 className="w-4 h-4" /> Löschen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Dokumente</h3>
                <Dialog open={isDocDialogOpen} onOpenChange={setIsDocDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2" data-testid="button-new-document">
                      <Plus className="w-4 h-4" /> Neues Dokument
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Neues Dokument</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label>Titel *</Label>
                        <Input 
                          placeholder="Dokumenttitel"
                          value={newDocument.title}
                          onChange={(e) => setNewDocument(prev => ({ ...prev, title: e.target.value }))}
                          data-testid="input-doc-title"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Kategorie</Label>
                        <Select 
                          value={newDocument.category}
                          onValueChange={(v) => setNewDocument(prev => ({ ...prev, category: v as any }))}
                        >
                          <SelectTrigger data-testid="select-doc-category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DOCUMENT_CATEGORIES.map(cat => (
                              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsDocDialogOpen(false)}>Abbrechen</Button>
                      <Button onClick={handleCreateDocument} disabled={!newDocument.title} data-testid="button-create-doc">
                        Erstellen
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {documents.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">Keine Dokumente vorhanden</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {documents.map(doc => (
                    <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{doc.title}</CardTitle>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">{doc.category}</Badge>
                              <Badge variant="outline" className={`text-xs ${STATUS_COLORS[doc.status]}`}>
                                {doc.status}
                              </Badge>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-doc-menu-${doc.id}`}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => setEditingDocument(doc)}
                                className="gap-2"
                              >
                                <Edit className="w-4 h-4" /> Bearbeiten
                              </DropdownMenuItem>
                              {doc.status === 'In Bearbeitung' && (
                                <DropdownMenuItem 
                                  onClick={() => handleRequestApproval(doc.id)}
                                  className="gap-2"
                                >
                                  <Send className="w-4 h-4" /> Zur Freigabe
                                </DropdownMenuItem>
                              )}
                              {doc.status === 'Genehmigt' && !doc.isPublished && (
                                <DropdownMenuItem 
                                  onClick={() => handlePublishDocument(doc.id)}
                                  className="gap-2"
                                >
                                  <BookOpen className="w-4 h-4" /> Veröffentlichen
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteDocument(doc.id)}
                                className="text-destructive gap-2"
                              >
                                <Trash2 className="w-4 h-4" /> Löschen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            <span>Erstellt von {getEmployeeName(doc.createdById)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Version {doc.version}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {editingDocument && (
          <Dialog open={!!editingDocument} onOpenChange={() => setEditingDocument(null)}>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>{editingDocument.title}</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Textarea 
                  placeholder="Dokumentinhalt hier eingeben..."
                  className="min-h-[400px] font-mono text-sm"
                  value={editingDocument.content || ''}
                  onChange={(e) => setEditingDocument(prev => prev ? { ...prev, content: e.target.value } : null)}
                  data-testid="textarea-doc-content"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingDocument(null)}>Abbrechen</Button>
                <Button onClick={handleSaveDocument} data-testid="button-save-doc">
                  Speichern
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Layout>
  );
}
