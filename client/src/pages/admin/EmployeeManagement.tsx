import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Filter, UserPlus, Pencil, Loader2, Shield, MapPin, Calendar, Trash2, Award, Building } from "lucide-react";
import { useState, useEffect } from "react";
import { employeeApi } from "@/lib/api";
import type { Employee } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const ROLES = [
  "Primararzt",
  "1. Oberarzt",
  "Oberarzt",
  "Oberärztin",
  "Facharzt",
  "Assistenzarzt",
  "Assistenzärztin",
  "Turnusarzt",
  "Student (KPJ)",
  "Student (Famulant)",
  "Sekretariat"
];

const APP_ROLES = [
  { value: "Admin", label: "Admin", description: "Voller Zugriff auf alle Funktionen" },
  { value: "User", label: "Benutzer", description: "Nur Lesen und eigene Anfragen" }
];

const DEPLOYMENT_AREAS = [
  { value: "GYN-Station", label: "Gynäkologische Bettenstation" },
  { value: "GEB-Station", label: "Geburtshilfliche Bettenstation" },
  { value: "Kreiszimmer", label: "Kreißzimmer" },
  { value: "GYN-Ambulanz", label: "Gynäkologische Ambulanz" },
  { value: "Schwangerenambulanz", label: "Schwangerenambulanz" },
  { value: "OP", label: "Operationsbereich" },
  { value: "Mamma-Zentrum", label: "Mamma-Zentrum" }
];

const COMPETENCIES = [
  "Senior Mamma Surgeon",
  "Endometriose",
  "Gyn-Onkologie",
  "Geburtshilfe",
  "Urogynäkologie",
  "Gynäkologische Chirurgie",
  "ÖGUM I",
  "ÖGUM II",
  "Dysplasie",
  "Allgemeine Gynäkologie",
  "Mamma",
  "Mamma Ambulanz",
  "Kindergynäkologie"
];

const DUMMY_COMPETENCY_DATA = [
  { id: 1, name: "Senior Mamma Surgeon", badge: "SMS", description: "Erfahrener Brustkrebschirurg", rooms: ["OP 1 TCH", "OP 2"], requirements: "10+ Jahre Erfahrung, Mamma-Diplom" },
  { id: 2, name: "ÖGUM I", badge: "Ö1", description: "Ultraschall-Zertifikat Stufe I", rooms: ["Schwangerenambulanz", "Risikoambulanz"], requirements: "ÖGUM Kurs I abgeschlossen" },
  { id: 3, name: "ÖGUM II", badge: "Ö2", description: "Ultraschall-Zertifikat Stufe II", rooms: ["Schwangerenambulanz", "Risikoambulanz"], requirements: "ÖGUM I + 2 Jahre Praxis" },
  { id: 4, name: "Dysplasie", badge: "DYS", description: "Dysplasie-Diagnostik", rooms: ["Dysplasie-Sprechstunde", "GYN-Ambulanz"], requirements: "Dysplasiediplom, Kolposkopie-Kurs" },
  { id: 5, name: "Gyn-Onkologie", badge: "GYO", description: "Gynäkologische Onkologie", rooms: ["OP 1 TCH", "Onko-Station"], requirements: "FA GYN, Onkologie-Zusatzausbildung" },
  { id: 6, name: "Geburtshilfe", badge: "GEB", description: "Geburtshilfliche Versorgung", rooms: ["Kreißzimmer", "Sectio-OP"], requirements: "FA GYN oder in Ausbildung" },
  { id: 7, name: "Urogynäkologie", badge: "URO", description: "Beckenboden & Inkontinenz", rooms: ["Urodynamik", "OP 2"], requirements: "Urogyn-Zusatzausbildung" },
  { id: 8, name: "Kindergynäkologie", badge: "KIG", description: "Kinder- und Jugendgynäkologie", rooms: ["Spezial-Ambulanz"], requirements: "Kindergyn-Zusatzausbildung" },
];

const SERVICE_CAPABILITIES = {
  gyn: ["Primararzt", "1. Oberarzt", "Oberarzt", "Oberärztin"],
  kreiszimmer: ["Assistenzarzt", "Assistenzärztin"],
  turnus: ["Assistenzarzt", "Assistenzärztin", "Turnusarzt"]
};

const WEEKDAYS = [
  { value: "monday", label: "Montag" },
  { value: "tuesday", label: "Dienstag" },
  { value: "wednesday", label: "Mittwoch" },
  { value: "thursday", label: "Donnerstag" },
  { value: "friday", label: "Freitag" },
  { value: "saturday", label: "Samstag" },
  { value: "sunday", label: "Sonntag" }
];

interface ShiftPreferences {
  preferredDaysOff?: string[];
  maxShiftsPerWeek?: number;
  preferredAreas?: string[];
  notes?: string;
  participatesInShifts?: boolean;
  possibleDeploymentAreas?: string[];
  validFrom?: string;
  validUntil?: string;
}

interface CompetencyData {
  id: number;
  name: string;
  badge: string;
  description: string;
  rooms: string[];
  requirements: string;
}

export default function EmployeeManagement() {
  const { employee: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { toast } = useToast();
  
  const [competencies, setCompetencies] = useState<CompetencyData[]>(DUMMY_COMPETENCY_DATA);
  const [competencyDialogOpen, setCompetencyDialogOpen] = useState(false);
  const [editingCompetency, setEditingCompetency] = useState<CompetencyData | null>(null);
  const [competencySearchTerm, setCompetencySearchTerm] = useState("");
  
  const canManageEmployees = currentUser?.appRole === 'Admin' || 
    currentUser?.role === 'Primararzt' || 
    currentUser?.role === '1. Oberarzt';
  
  useEffect(() => {
    loadEmployees();
  }, []);
  
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
    } finally {
      setLoading(false);
    }
  };
  
  const handleEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditDialogOpen(true);
  };
  
  const handleSaveEmployee = async () => {
    if (!editingEmployee) return;
    
    setSaving(true);
    try {
      const updated = await employeeApi.update(editingEmployee.id, {
        appRole: editingEmployee.appRole,
        primaryDeploymentArea: editingEmployee.primaryDeploymentArea,
        shiftPreferences: editingEmployee.shiftPreferences,
        competencies: editingEmployee.competencies
      });
      
      setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
      setEditDialogOpen(false);
      toast({ title: "Gespeichert", description: "Mitarbeiterdaten wurden aktualisiert" });
    } catch (error) {
      toast({ title: "Fehler", description: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  
  const updateEditingEmployee = (field: keyof Employee, value: any) => {
    if (!editingEmployee) return;
    setEditingEmployee({ ...editingEmployee, [field]: value });
  };
  
  const updateShiftPreference = (key: keyof ShiftPreferences, value: any) => {
    if (!editingEmployee) return;
    const currentPrefs = (editingEmployee.shiftPreferences as ShiftPreferences) || {};
    setEditingEmployee({
      ...editingEmployee,
      shiftPreferences: { ...currentPrefs, [key]: value }
    });
  };
  
  const toggleCompetency = (comp: string) => {
    if (!editingEmployee) return;
    const currentComps = editingEmployee.competencies || [];
    const newComps = currentComps.includes(comp)
      ? currentComps.filter(c => c !== comp)
      : [...currentComps, comp];
    updateEditingEmployee('competencies', newComps);
  };
  
  const toggleDeploymentArea = (area: string) => {
    if (!editingEmployee) return;
    const prefs = (editingEmployee.shiftPreferences as ShiftPreferences) || {};
    const currentAreas = prefs.possibleDeploymentAreas || [];
    const newAreas = currentAreas.includes(area)
      ? currentAreas.filter(a => a !== area)
      : [...currentAreas, area];
    updateShiftPreference('possibleDeploymentAreas', newAreas);
  };
  
  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.competencies.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredCompetencies = competencies.filter(comp =>
    comp.name.toLowerCase().includes(competencySearchTerm.toLowerCase()) ||
    comp.badge.toLowerCase().includes(competencySearchTerm.toLowerCase())
  );

  const getCapabilities = (role: string) => {
    const caps = [];
    if (SERVICE_CAPABILITIES.gyn.includes(role)) caps.push({ label: "Gyn-Dienst", color: "bg-blue-100 text-blue-700 border-blue-200" });
    if (SERVICE_CAPABILITIES.kreiszimmer.includes(role)) caps.push({ label: "Kreißzimmer", color: "bg-pink-100 text-pink-700 border-pink-200" });
    if (SERVICE_CAPABILITIES.turnus.includes(role)) caps.push({ label: "Turnus", color: "bg-emerald-100 text-emerald-700 border-emerald-200" });
    return caps;
  };
  
  const getAppRoleBadge = (appRole: string) => {
    switch (appRole) {
      case 'Admin':
        return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1"><Shield className="w-3 h-3" />Admin</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Benutzer</Badge>;
    }
  };

  const handleNewCompetency = () => {
    setEditingCompetency({ id: Date.now(), name: "", badge: "", description: "", rooms: [], requirements: "" });
    setCompetencyDialogOpen(true);
  };

  const handleEditCompetency = (comp: CompetencyData) => {
    setEditingCompetency({ ...comp });
    setCompetencyDialogOpen(true);
  };

  const handleSaveCompetency = () => {
    if (!editingCompetency) return;
    
    if (editingCompetency.id && competencies.some(c => c.id === editingCompetency.id)) {
      setCompetencies(prev => prev.map(c => c.id === editingCompetency.id ? editingCompetency : c));
    } else {
      setCompetencies(prev => [...prev, editingCompetency]);
    }
    
    setCompetencyDialogOpen(false);
    toast({ title: "Gespeichert", description: "Kompetenz wurde gespeichert" });
  };

  const handleDeleteCompetency = (id: number) => {
    setCompetencies(prev => prev.filter(c => c.id !== id));
    toast({ title: "Gelöscht", description: "Kompetenz wurde entfernt" });
  };

  return (
    <Layout title="Mitarbeiter & Kompetenzen">
      <div className="space-y-6">
        <Tabs defaultValue="employees" className="space-y-6">
          <TabsList className="bg-background border border-border p-1 h-12 rounded-xl shadow-sm">
            <TabsTrigger value="employees" className="rounded-lg px-6 h-10" data-testid="tab-employees">
              Mitarbeiter
            </TabsTrigger>
            <TabsTrigger value="competencies" className="rounded-lg px-6 h-10" data-testid="tab-competencies">
              Kompetenzen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Mitarbeiter suchen..." 
                  className="pl-9 bg-background"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-employees"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4" /> Filter
                </Button>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2" data-testid="button-new-employee">
                      <UserPlus className="w-4 h-4" /> Neuer Mitarbeiter
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Neuen Mitarbeiter anlegen</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Titel</Label>
                          <Input placeholder="Dr. med." />
                        </div>
                        <div className="space-y-2">
                          <Label>Vorname</Label>
                          <Input placeholder="Max" />
                        </div>
                        <div className="space-y-2">
                          <Label>Nachname</Label>
                          <Input placeholder="Mustermann" />
                        </div>
                        <div className="space-y-2">
                          <Label>Rolle / Funktion</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Rolle wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map(role => (
                                <SelectItem key={role} value={role}>{role}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label>Kompetenzen & Fähigkeiten</Label>
                        <div className="grid grid-cols-2 gap-3 p-4 border border-border rounded-lg bg-muted/10 h-64 overflow-y-auto">
                          {COMPETENCIES.map(comp => (
                            <div key={comp} className="flex items-center space-x-2">
                              <Checkbox id={comp} />
                              <Label htmlFor={comp} className="text-sm font-normal cursor-pointer">{comp}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Befristeter Zugang (Optional)</Label>
                        <Input type="date" />
                        <p className="text-xs text-muted-foreground">Für Studenten und Gastärzte</p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline">Abbrechen</Button>
                      <Button>Speichern</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Card className="border-none shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Name</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>App-Rolle</TableHead>
                      <TableHead>Haupteinsatzbereich</TableHead>
                      <TableHead>Einsetzbar für</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((emp) => {
                      const capabilities = getCapabilities(emp.role);
                      const deploymentArea = DEPLOYMENT_AREAS.find(a => a.value === emp.primaryDeploymentArea);
                      return (
                        <TableRow key={emp.id} data-testid={`row-employee-${emp.id}`}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{emp.name}</span>
                              {emp.competencies.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {emp.competencies.slice(0, 2).join(", ")}
                                  {emp.competencies.length > 2 && ` +${emp.competencies.length - 2}`}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal">{emp.role}</Badge>
                          </TableCell>
                          <TableCell>
                            {getAppRoleBadge(emp.appRole)}
                          </TableCell>
                          <TableCell>
                            {deploymentArea ? (
                              <Badge variant="outline" className="gap-1 font-normal">
                                <MapPin className="w-3 h-3" />
                                {deploymentArea.label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {capabilities.map((cap, i) => (
                                <Badge key={i} variant="outline" className={`text-xs font-medium border ${cap.color}`}>
                                  {cap.label}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {canManageEmployees && (
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleEditEmployee(emp)}
                                data-testid={`button-edit-employee-${emp.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="competencies" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Kompetenz suchen..." 
                  className="pl-9 bg-background"
                  value={competencySearchTerm}
                  onChange={(e) => setCompetencySearchTerm(e.target.value)}
                  data-testid="input-search-competencies"
                />
              </div>
              <Button className="gap-2" onClick={handleNewCompetency} data-testid="button-new-competency">
                <Plus className="w-4 h-4" /> Neue Kompetenz
              </Button>
            </div>

            <Card className="border-none shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Kompetenzname</TableHead>
                      <TableHead className="w-[100px]">Badge-Kürzel</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Zugeordnete Räume/Bereiche</TableHead>
                      <TableHead>Voraussetzungen</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompetencies.map((comp) => (
                      <TableRow key={comp.id} data-testid={`row-competency-${comp.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-primary" />
                            {comp.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono">{comp.badge}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                          {comp.description}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {comp.rooms.slice(0, 2).map((room, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                <Building className="w-3 h-3 mr-1" />
                                {room}
                              </Badge>
                            ))}
                            {comp.rooms.length > 2 && (
                              <Badge variant="outline" className="text-xs">+{comp.rooms.length - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                          {comp.requirements}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleEditCompetency(comp)}
                              data-testid={`button-edit-competency-${comp.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteCompetency(comp.id)}
                              data-testid={`button-delete-competency-${comp.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Mitarbeiter bearbeiten: {editingEmployee?.name}</DialogTitle>
            </DialogHeader>
            
            {editingEmployee && (
              <Tabs defaultValue="permissions" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="permissions">Berechtigungen</TabsTrigger>
                  <TabsTrigger value="preferences">Präferenzen</TabsTrigger>
                </TabsList>
                
                <TabsContent value="permissions" className="space-y-4 py-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Shield className="w-4 h-4" /> App-Rolle
                      </Label>
                      <Select 
                        value={editingEmployee.appRole} 
                        onValueChange={(v) => updateEditingEmployee('appRole', v)}
                      >
                        <SelectTrigger data-testid="select-app-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APP_ROLES.map(role => (
                            <SelectItem key={role.value} value={role.value}>
                              <div className="flex flex-col">
                                <span>{role.label}</span>
                                <span className="text-xs text-muted-foreground">{role.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Haupteinsatzbereich
                      </Label>
                      <Select 
                        value={editingEmployee.primaryDeploymentArea || ""} 
                        onValueChange={(v) => updateEditingEmployee('primaryDeploymentArea', v || null)}
                      >
                        <SelectTrigger data-testid="select-deployment-area">
                          <SelectValue placeholder="Bereich wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEPLOYMENT_AREAS.map(area => (
                            <SelectItem key={area.value} value={area.value}>
                              {area.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="participates-shifts"
                        checked={(editingEmployee.shiftPreferences as ShiftPreferences)?.participatesInShifts !== false}
                        onCheckedChange={(checked) => updateShiftPreference('participatesInShifts', checked)}
                        data-testid="checkbox-participates-shifts"
                      />
                      <Label htmlFor="participates-shifts" className="cursor-pointer">
                        Nimmt an Diensten teil
                      </Label>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Award className="w-4 h-4" /> Kompetenzen
                      </Label>
                      <div className="grid grid-cols-2 gap-2 p-3 border border-border rounded-lg bg-muted/10 max-h-40 overflow-y-auto">
                        {COMPETENCIES.map(comp => (
                          <div key={comp} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`comp-${comp}`}
                              checked={editingEmployee.competencies.includes(comp)}
                              onCheckedChange={() => toggleCompetency(comp)}
                            />
                            <Label htmlFor={`comp-${comp}`} className="text-sm font-normal cursor-pointer">
                              {comp}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Building className="w-4 h-4" /> Mögliche Einsatzbereiche
                      </Label>
                      <div className="grid grid-cols-2 gap-2 p-3 border border-border rounded-lg bg-muted/10">
                        {DEPLOYMENT_AREAS.map(area => {
                          const prefs = (editingEmployee.shiftPreferences as ShiftPreferences) || {};
                          const isSelected = prefs.possibleDeploymentAreas?.includes(area.value) || false;
                          return (
                            <div key={area.value} className="flex items-center space-x-2">
                              <Checkbox 
                                id={`area-${area.value}`}
                                checked={isSelected}
                                onCheckedChange={() => toggleDeploymentArea(area.value)}
                              />
                              <Label htmlFor={`area-${area.value}`} className="text-sm font-normal cursor-pointer">
                                {area.label}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label>Befristung</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Von</Label>
                          <Input 
                            type="date"
                            value={(editingEmployee.shiftPreferences as ShiftPreferences)?.validFrom || ""}
                            onChange={(e) => updateShiftPreference('validFrom', e.target.value)}
                            data-testid="input-valid-from"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Bis</Label>
                          <Input 
                            type="date"
                            value={(editingEmployee.shiftPreferences as ShiftPreferences)?.validUntil || ""}
                            onChange={(e) => updateShiftPreference('validUntil', e.target.value)}
                            data-testid="input-valid-until"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Für Studenten und Gastärzte</p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="preferences" className="space-y-4 py-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Bevorzugte freie Wochentage
                      </Label>
                      <div className="grid grid-cols-4 gap-2 p-3 border border-border rounded-lg bg-muted/10">
                        {WEEKDAYS.map(day => {
                          const prefs = (editingEmployee.shiftPreferences as ShiftPreferences) || {};
                          const isSelected = prefs.preferredDaysOff?.includes(day.value) || false;
                          return (
                            <div key={day.value} className="flex items-center space-x-2">
                              <Checkbox 
                                id={`day-${day.value}`}
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  const currentDays = prefs.preferredDaysOff || [];
                                  const newDays = checked 
                                    ? [...currentDays, day.value]
                                    : currentDays.filter(d => d !== day.value);
                                  updateShiftPreference('preferredDaysOff', newDays);
                                }}
                              />
                              <Label htmlFor={`day-${day.value}`} className="text-sm cursor-pointer">
                                {day.label}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label>Max. Dienste pro Woche</Label>
                      <Select 
                        value={String((editingEmployee.shiftPreferences as ShiftPreferences)?.maxShiftsPerWeek ?? 5)}
                        onValueChange={(v) => updateShiftPreference('maxShiftsPerWeek', parseInt(v))}
                      >
                        <SelectTrigger data-testid="select-max-shifts">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 (kein Dienstwunsch)</SelectItem>
                          {[1, 2, 3, 4, 5, 6, 7].map(n => (
                            <SelectItem key={n} value={String(n)}>{n} Dienste</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">0 = nimmt nicht an Diensten teil</p>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label>Notizen für die Planung</Label>
                      <Textarea 
                        placeholder="z.B. Keine Nachtdienste am Wochenende, Teilzeit ab März..."
                        value={(editingEmployee.shiftPreferences as ShiftPreferences)?.notes || ""}
                        onChange={(e) => updateShiftPreference('notes', e.target.value)}
                        rows={3}
                        data-testid="input-planning-notes"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
            
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Abbrechen</Button>
              </DialogClose>
              <Button onClick={handleSaveEmployee} disabled={saving} data-testid="button-save-employee">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={competencyDialogOpen} onOpenChange={setCompetencyDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingCompetency?.name ? 'Kompetenz bearbeiten' : 'Neue Kompetenz'}
              </DialogTitle>
            </DialogHeader>
            
            {editingCompetency && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Kompetenzname *</Label>
                  <Input 
                    value={editingCompetency.name}
                    onChange={(e) => setEditingCompetency({ ...editingCompetency, name: e.target.value })}
                    placeholder="z.B. Senior Mamma Surgeon"
                    data-testid="input-competency-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Badge-Kürzel * (einzigartig)</Label>
                  <Input 
                    value={editingCompetency.badge}
                    onChange={(e) => setEditingCompetency({ ...editingCompetency, badge: e.target.value.toUpperCase() })}
                    placeholder="z.B. SMS"
                    maxLength={4}
                    className="font-mono uppercase"
                    data-testid="input-competency-badge"
                  />
                  <p className="text-xs text-muted-foreground">Max. 4 Zeichen</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Beschreibung</Label>
                  <Textarea 
                    value={editingCompetency.description}
                    onChange={(e) => setEditingCompetency({ ...editingCompetency, description: e.target.value })}
                    placeholder="Kurze Beschreibung der Kompetenz..."
                    rows={2}
                    data-testid="input-competency-description"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Zugeordnete Räume/Bereiche</Label>
                  <div className="grid grid-cols-2 gap-2 p-3 border border-border rounded-lg bg-muted/10 max-h-32 overflow-y-auto">
                    {DEPLOYMENT_AREAS.map(area => (
                      <div key={area.value} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`room-${area.value}`}
                          checked={editingCompetency.rooms.includes(area.label)}
                          onCheckedChange={(checked) => {
                            const newRooms = checked
                              ? [...editingCompetency.rooms, area.label]
                              : editingCompetency.rooms.filter(r => r !== area.label);
                            setEditingCompetency({ ...editingCompetency, rooms: newRooms });
                          }}
                        />
                        <Label htmlFor={`room-${area.value}`} className="text-sm font-normal cursor-pointer">
                          {area.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Voraussetzungen</Label>
                  <Textarea 
                    value={editingCompetency.requirements}
                    onChange={(e) => setEditingCompetency({ ...editingCompetency, requirements: e.target.value })}
                    placeholder="z.B. 10+ Jahre Erfahrung, Dysplasiediplom..."
                    rows={2}
                    data-testid="input-competency-requirements"
                  />
                </div>
              </div>
            )}
            
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Abbrechen</Button>
              </DialogClose>
              <Button onClick={handleSaveCompetency} data-testid="button-save-competency">
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
