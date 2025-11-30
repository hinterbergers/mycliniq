import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Filter, MoreHorizontal, UserPlus, Pencil, Loader2, Shield, MapPin, Calendar } from "lucide-react";
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
  { value: "Editor", label: "Editor", description: "Kann Dienstpläne bearbeiten" },
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
        shiftPreferences: editingEmployee.shiftPreferences
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
  
  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.competencies.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()))
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
      case 'Editor':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><Pencil className="w-3 h-3" />Editor</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Benutzer</Badge>;
    }
  };

  return (
    <Layout title="Mitarbeiter & Kompetenzen">
      <div className="space-y-6">
        
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Mitarbeiter suchen..." 
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" /> Filter
            </Button>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2">
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
                  <TableHead>Einsatzbereich</TableHead>
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
                        <div className="flex gap-1">
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

        {/* Edit Employee Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
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
                      <p className="text-xs text-muted-foreground">
                        Bestimmt die Zugriffsrechte im System
                      </p>
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
                      <p className="text-xs text-muted-foreground">
                        Wird für die automatische Dienstplan-Generierung verwendet
                      </p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="preferences" className="space-y-4 py-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Bevorzugte freie Tage
                      </Label>
                      <div className="grid grid-cols-4 gap-2">
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
                        value={String((editingEmployee.shiftPreferences as ShiftPreferences)?.maxShiftsPerWeek || 5)}
                        onValueChange={(v) => updateShiftPreference('maxShiftsPerWeek', parseInt(v))}
                      >
                        <SelectTrigger data-testid="select-max-shifts">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[3, 4, 5, 6, 7].map(n => (
                            <SelectItem key={n} value={String(n)}>{n} Dienste</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label>Notizen für die Planung</Label>
                      <Input 
                        placeholder="z.B. Keine Nachtdienste am Wochenende"
                        value={(editingEmployee.shiftPreferences as ShiftPreferences)?.notes || ""}
                        onChange={(e) => updateShiftPreference('notes', e.target.value)}
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
      </div>
    </Layout>
  );
}
