import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";
import { 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Shield, 
  Save,
  AlertCircle,
  GraduationCap,
  Briefcase,
  Calendar as CalendarIcon,
  Tag,
  X
} from "lucide-react";
import { useState, useEffect } from "react";
import { employeeApi, competencyApi, roomApi } from "@/lib/api";
import type { Employee, Competency, Resource } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

function formatBirthday(value: string | Date | null | undefined): string {
  if (!value) return "";
  const toInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return toInput(parsed);
    }
    return "";
  }
  return toInput(value);
}

function formatBirthdayDisplay(value: string | Date | null | undefined): string {
  const iso = formatBirthday(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function parseBirthdayInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let iso = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    iso = trimmed;
  } else {
    const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    iso = `${match[3]}-${match[2]}-${match[1]}`;
  }

  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return iso;
}

export default function Settings() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { employee: currentUser, user, isAdmin } = useAuth();

  const ROLE_OPTIONS: Employee["role"][] = [
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
    "Sekretariat",
  ];
  const APP_ROLE_OPTIONS: Employee["appRole"][] = ["Admin", "Editor", "User"];
  
  const viewingUserId = params.userId
    ? parseInt(params.userId)
    : user?.employeeId || currentUser?.id || 0;
  
  const isViewingOwnProfile = currentUser
    ? viewingUserId === currentUser.id
    : user
    ? viewingUserId === user.employeeId
    : false;
  const canEditBasicInfo = isViewingOwnProfile || isAdmin;
  const canEditPrivateInfo = isAdmin;
  const canEditRoleAndCompetencies = isAdmin;
  
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isBadgeDialogOpen, setIsBadgeDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    firstName: '',
    lastName: '',
    birthday: '',
    email: '',
    emailPrivate: '',
    phoneWork: '',
    phonePrivate: '',
    showPrivateContact: false,
    badge: ''
  });
  const [birthdayInput, setBirthdayInput] = useState("");
  const [roleValue, setRoleValue] = useState<Employee["role"] | "">("");
  const [appRoleValue, setAppRoleValue] = useState<Employee["appRole"] | "">("");
  const [availableCompetencies, setAvailableCompetencies] = useState<Competency[]>([]);
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<number[]>([]);
  const [competencySearch, setCompetencySearch] = useState("");
  const [availableRooms, setAvailableRooms] = useState<Resource[]>([]);
  const [deploymentRoomIds, setDeploymentRoomIds] = useState<number[]>([]);
  const [roomSearch, setRoomSearch] = useState("");
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [newBadge, setNewBadge] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [viewingUserId]);

  const selectedCompetencyLabels = selectedCompetencyIds.map((id) => {
    const match = availableCompetencies.find((comp) => comp.id === id);
    return { id, label: match?.name || `Kompetenz ${id}` };
  });
  const filteredCompetencies = availableCompetencies.filter((comp) => {
    const query = competencySearch.trim().toLowerCase();
    if (!query) return true;
    return (
      comp.name.toLowerCase().includes(query) ||
      (comp.code || "").toLowerCase().includes(query)
    );
  });
  const selectedRoomLabels = deploymentRoomIds.map((id) => {
    const match = availableRooms.find((room) => room.id === id);
    return { id, label: match?.name || `Raum ${id}` };
  });
  const filteredRooms = availableRooms.filter((room) => {
    const query = roomSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      room.name.toLowerCase().includes(query) ||
      (room.category || "").toLowerCase().includes(query)
    );
  });

  const applyEmployeeState = (emp: Employee) => {
    setEmployee(emp);
    const nameParts = emp.name.split(' ');
    const hasTitle = nameParts[0]?.includes('Dr.') || nameParts[0]?.includes('PD') || nameParts[0]?.includes('Prof.');
    const titleValue = emp.title?.trim() || (hasTitle ? nameParts.slice(0, nameParts.length > 2 ? 2 : 1).join(' ') : '');
    const birthdayIso = formatBirthday(emp.birthday);

    setFormData({
      title: titleValue,
      firstName: emp.firstName || '',
      lastName: emp.lastName || (hasTitle ? nameParts.slice(-1)[0] : nameParts.slice(-1)[0]) || '',
      birthday: birthdayIso,
      email: emp.email || '',
      emailPrivate: emp.emailPrivate || '',
      phoneWork: emp.phoneWork || '',
      phonePrivate: emp.phonePrivate || '',
      showPrivateContact: emp.showPrivateContact || false,
      badge: emp.lastName?.substring(0, 2).toUpperCase() || emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || ''
    });
    setBirthdayInput(formatBirthdayDisplay(birthdayIso || emp.birthday));
    setNewBadge(emp.lastName?.substring(0, 2).toUpperCase() || '');
    setRoleValue(emp.role || "");
    setAppRoleValue(emp.appRole || "");
    setSelectedCompetencyIds([]);
    const prefs = (emp.shiftPreferences as { deploymentRoomIds?: number[] } | null) || null;
    setDeploymentRoomIds(Array.isArray(prefs?.deploymentRoomIds) ? prefs.deploymentRoomIds : []);
  };

  const loadData = async () => {
    try {
      const [employees, competencies, rooms] = await Promise.all([
        employeeApi.getAll(),
        competencyApi.getAll(),
        roomApi.getAll({ active: true })
      ]);
      setAllEmployees(employees);
      setAvailableCompetencies(competencies.filter((comp) => comp.isActive !== false));
      setAvailableRooms(rooms.filter((room) => room.isActive !== false));
      
      const emp = employees.find(e => e.id === viewingUserId);
      if (emp) {
        applyEmployeeState(emp);
        try {
          const empCompetencies = await employeeApi.getCompetencies(emp.id);
          const ids = empCompetencies
            .map((comp) => comp.competencyId)
            .filter((id) => typeof id === "number");
          if (ids.length) {
            setSelectedCompetencyIds(ids);
          } else if (Array.isArray(emp.competencies) && competencies.length) {
            const fallbackIds = emp.competencies
              .map((name) => competencies.find((comp) => comp.name === name)?.id)
              .filter((id): id is number => typeof id === "number");
            setSelectedCompetencyIds(fallbackIds);
          }
        } catch {
          if (Array.isArray(emp.competencies) && competencies.length) {
            const fallbackIds = emp.competencies
              .map((name) => competencies.find((comp) => comp.name === name)?.id)
              .filter((id): id is number => typeof id === "number");
            setSelectedCompetencyIds(fallbackIds);
          }
        }
      }
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

  const handleSave = async () => {
    if (!employee || (!canEditBasicInfo && !canEditRoleAndCompetencies)) return;
    
    setSaving(true);
    try {
      const payload: Partial<Omit<Employee, "id" | "createdAt">> = {};
      const parsedBirthday = parseBirthdayInput(birthdayInput);
      if (parsedBirthday === null) {
        toast({
          title: "Fehler",
          description: "Bitte ein gueltiges Geburtsdatum eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      // TODO: Backend schema needs title, birthday, badge fields before full persistence
      // Currently saving only fields supported by the existing API
      if (canEditBasicInfo) {
        Object.assign(payload, {
          title: formData.title || null,
          firstName: formData.firstName,
          lastName: formData.lastName,
          birthday: parsedBirthday || null,
          email: formData.email,
          emailPrivate: formData.emailPrivate,
          phoneWork: formData.phoneWork,
          phonePrivate: formData.phonePrivate,
          showPrivateContact: formData.showPrivateContact,
        });
      }

      if (canEditRoleAndCompetencies) {
        Object.assign(payload, {
          role: (roleValue || employee.role) as Employee["role"],
          appRole: (appRoleValue || employee.appRole) as Employee["appRole"],
          shiftPreferences: {
            ...(employee.shiftPreferences || {}),
            deploymentRoomIds: deploymentRoomIds
          }
        });
      }

      if (Object.keys(payload).length === 0) {
        setSaving(false);
        return;
      }

      const updated = Object.keys(payload).length
        ? await employeeApi.update(employee.id, payload)
        : null;

      if (canEditRoleAndCompetencies) {
        await employeeApi.updateCompetencies(employee.id, selectedCompetencyIds);
      }
      toast({
        title: "Gespeichert",
        description: "Ihre Einstellungen wurden aktualisiert"
      });
      if (updated) {
        applyEmployeeState(updated);
        setAllEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
      }
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Änderungen konnten nicht gespeichert werden",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Fehler",
        description: "Passwörter stimmen nicht überein",
        variant: "destructive"
      });
      return;
    }
    
    toast({
      title: "Passwort geändert",
      description: "Ihr Passwort wurde erfolgreich aktualisiert"
    });
    setIsPasswordDialogOpen(false);
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const handleBadgeChange = () => {
    setFormData(prev => ({ ...prev, badge: newBadge.toUpperCase() }));
    toast({
      title: "Kürzel geändert",
      description: `Ihr neues Kürzel ist "${newBadge.toUpperCase()}"`
    });
    setIsBadgeDialogOpen(false);
  };

  const toggleCompetency = (id: number) => {
    setSelectedCompetencyIds((prev) =>
      prev.includes(id) ? prev.filter((compId) => compId !== id) : [...prev, id]
    );
  };

  const toggleDeploymentRoom = (id: number) => {
    setDeploymentRoomIds((prev) =>
      prev.includes(id) ? prev.filter((roomId) => roomId !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <Layout title="Einstellungen">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Wird geladen...</div>
        </div>
      </Layout>
    );
  }

  if (!employee) {
    return (
      <Layout title="Einstellungen">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Benutzer nicht gefunden</h3>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title={isViewingOwnProfile ? "Einstellungen" : `Profil: ${employee.name}`}>
      <div className="max-w-4xl mx-auto space-y-6">
        
        {isAdmin && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-900">Admin-Ansicht</p>
                    <p className="text-sm text-amber-700">Sie können alle Benutzerprofile bearbeiten</p>
                  </div>
                </div>
                <Select 
                  value={viewingUserId.toString()} 
                  onValueChange={(v) => setLocation(`/einstellungen/${v}`)}
                >
                  <SelectTrigger className="w-64" data-testid="select-user">
                    <SelectValue placeholder="Benutzer wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {allEmployees.filter(e => e.isActive).map(emp => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.name} - {emp.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
            {formData.badge || employee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <h2 className="text-2xl font-bold">{employee.name}</h2>
            <p className="text-muted-foreground flex items-center gap-2">
              <User className="w-4 h-4" /> {employee.role}
            </p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">Profil</TabsTrigger>
            <TabsTrigger value="security">Sicherheit</TabsTrigger>
            <TabsTrigger value="roles">Rollen & Kompetenzen</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Basisdaten</CardTitle>
                <CardDescription>Verwalten Sie Ihre persönlichen Informationen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Titel</Label>
                    <Input 
                      value={formData.title} 
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))} 
                      disabled={!canEditBasicInfo}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vorname</Label>
                    <Input 
                      value={formData.firstName} 
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))} 
                      disabled={!canEditBasicInfo}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nachname</Label>
                    <Input 
                      value={formData.lastName} 
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))} 
                      disabled={!canEditBasicInfo}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Geburtsdatum</Label>
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={!canEditBasicInfo}
                            aria-label="Kalender oeffnen"
                          >
                            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="p-2">
                          <DatePickerCalendar
                            mode="single"
                            captionLayout="dropdown"
                            selected={formData.birthday ? new Date(`${formData.birthday}T00:00:00`) : undefined}
                            onSelect={(date) => {
                              if (!date) return;
                              const iso = formatBirthday(date);
                              setFormData(prev => ({ ...prev, birthday: iso }));
                              setBirthdayInput(formatBirthdayDisplay(iso));
                            }}
                            fromYear={1900}
                            toYear={new Date().getFullYear()}
                          />
                        </PopoverContent>
                      </Popover>
                      <Input 
                        value={birthdayInput}
                        onChange={(e) => setBirthdayInput(e.target.value)}
                        placeholder="TT.MM.JJJJ"
                        disabled={!canEditBasicInfo}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>E-Mail (Dienst)</Label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input 
                        className="pl-10"
                        value={formData.email} 
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} 
                        disabled={!canEditBasicInfo}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>E-Mail (privat)</Label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input 
                        className="pl-10"
                        value={formData.emailPrivate} 
                        onChange={(e) => setFormData(prev => ({ ...prev, emailPrivate: e.target.value }))} 
                        disabled={!canEditPrivateInfo}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telefon (Dienst)</Label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input 
                        className="pl-10"
                        value={formData.phoneWork} 
                        onChange={(e) => setFormData(prev => ({ ...prev, phoneWork: e.target.value }))} 
                        disabled={!canEditBasicInfo}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Telefon (privat)</Label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input 
                        className="pl-10"
                        value={formData.phonePrivate} 
                        onChange={(e) => setFormData(prev => ({ ...prev, phonePrivate: e.target.value }))} 
                        disabled={!canEditPrivateInfo}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Private Kontaktdaten sichtbar</p>
                      <p className="text-sm text-muted-foreground">Erlaubt das Anzeigen privater Telefonnummer/E-Mail</p>
                    </div>
                  </div>
                  <Switch 
                    checked={formData.showPrivateContact}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showPrivateContact: checked }))}
                    disabled={!canEditPrivateInfo}
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={!canEditBasicInfo || saving}>
                    <Save className="w-4 h-4 mr-2" />
                    Speichern
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Sicherheit</CardTitle>
                <CardDescription>Passwort ändern</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Aktuelles Passwort</Label>
                    <Input 
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Neues Passwort</Label>
                    <Input 
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Neues Passwort bestätigen</Label>
                    <Input 
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    />
                  </div>
                </div>

                <Button onClick={handlePasswordChange}>
                  <Lock className="w-4 h-4 mr-2" />
                  Passwort ändern
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Rollen & Kompetenzen</CardTitle>
                <CardDescription>Verwalten Sie Ihre fachlichen Einstellungen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rolle</Label>
                    <div className="relative">
                      <Briefcase className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      {canEditRoleAndCompetencies ? (
                        <Select
                          value={roleValue}
                          onValueChange={(value) => setRoleValue(value as Employee["role"])}
                        >
                          <SelectTrigger className="pl-10">
                            <SelectValue placeholder="Rolle auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={employee.role} disabled />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>App-Rolle</Label>
                    <div className="relative">
                      <Shield className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      {canEditRoleAndCompetencies ? (
                        <Select
                          value={appRoleValue}
                          onValueChange={(value) => setAppRoleValue(value as Employee["appRole"])}
                        >
                          <SelectTrigger className="pl-10">
                            <SelectValue placeholder="App-Rolle auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {APP_ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={employee.appRole} disabled />
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Kompetenzen</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedCompetencyLabels.length ? (
                      selectedCompetencyLabels.map((comp) => (
                        <Badge key={comp.id} variant="secondary" className="flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" />
                          <span>{comp.label}</span>
                          {canEditRoleAndCompetencies && (
                            <button
                              type="button"
                              onClick={() => toggleCompetency(comp.id)}
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              aria-label={`Kompetenz entfernen: ${comp.label}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine Kompetenzen hinterlegt</p>
                    )}
                  </div>
                  {canEditRoleAndCompetencies && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline">
                          Kompetenzen auswählen
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-80">
                        <div className="space-y-2">
                          <Input
                            value={competencySearch}
                            onChange={(e) => setCompetencySearch(e.target.value)}
                            placeholder="Kompetenz suchen..."
                          />
                          <div className="max-h-56 overflow-y-auto space-y-2">
                            {filteredCompetencies.map((comp) => {
                              const checked = selectedCompetencyIds.includes(comp.id);
                              return (
                                <div key={comp.id} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`competency-${comp.id}`}
                                    checked={checked}
                                    onCheckedChange={() => toggleCompetency(comp.id)}
                                  />
                                  <Label htmlFor={`competency-${comp.id}`} className="text-sm font-normal cursor-pointer">
                                    {comp.code ? `${comp.code} - ${comp.name}` : comp.name}
                                  </Label>
                                </div>
                              );
                            })}
                            {!filteredCompetencies.length && (
                              <p className="text-sm text-muted-foreground">Keine Kompetenzen gefunden</p>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Einsatzbereiche (Ressourcen/Räume)</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedRoomLabels.length ? (
                      selectedRoomLabels.map((room) => (
                        <Badge key={room.id} variant="secondary" className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          <span>{room.label}</span>
                          {canEditRoleAndCompetencies && (
                            <button
                              type="button"
                              onClick={() => toggleDeploymentRoom(room.id)}
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              aria-label={`Einsatzbereich entfernen: ${room.label}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine Einsatzbereiche hinterlegt</p>
                    )}
                  </div>
                  {canEditRoleAndCompetencies && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline">
                          Einsatzbereiche auswählen
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-80">
                        <div className="space-y-2">
                          <Input
                            value={roomSearch}
                            onChange={(e) => setRoomSearch(e.target.value)}
                            placeholder="Räume/Ressourcen suchen..."
                          />
                          <div className="max-h-56 overflow-y-auto space-y-2">
                            {filteredRooms.map((room) => {
                              const checked = deploymentRoomIds.includes(room.id);
                              return (
                                <div key={room.id} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`room-${room.id}`}
                                    checked={checked}
                                    onCheckedChange={() => toggleDeploymentRoom(room.id)}
                                  />
                                  <Label htmlFor={`room-${room.id}`} className="text-sm font-normal cursor-pointer">
                                    {room.category ? `${room.name} (${room.category})` : room.name}
                                  </Label>
                                </div>
                              );
                            })}
                            {!filteredRooms.length && (
                              <p className="text-sm text-muted-foreground">Keine Räume gefunden</p>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={!canEditRoleAndCompetencies || saving}>
                    <Save className="w-4 h-4 mr-2" />
                    Speichern
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
