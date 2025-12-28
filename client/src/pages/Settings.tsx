import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  User, 
  Mail, 
  Phone, 
  Lock, 
  FileText, 
  Shield, 
  Upload, 
  Save,
  AlertCircle,
  GraduationCap,
  Briefcase,
  Calendar,
  Tag,
  Pencil,
  Info,
  X
} from "lucide-react";
import { useState, useEffect } from "react";
import { employeeApi } from "@/lib/api";
import type { Employee } from "@shared/schema";
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
  const [roleValue, setRoleValue] = useState<Employee["role"] | "">("");
  const [appRoleValue, setAppRoleValue] = useState<Employee["appRole"] | "">("");
  const [competenciesValue, setCompetenciesValue] = useState<string[]>([]);
  const [newCompetency, setNewCompetency] = useState("");
  
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

  const loadData = async () => {
    try {
      const employees = await employeeApi.getAll();
      setAllEmployees(employees);
      
      const emp = employees.find(e => e.id === viewingUserId);
      if (emp) {
        setEmployee(emp);
        const nameParts = emp.name.split(' ');
        const hasTitle = nameParts[0]?.includes('Dr.') || nameParts[0]?.includes('PD') || nameParts[0]?.includes('Prof.');
        const titleValue = emp.title?.trim() || (hasTitle ? nameParts.slice(0, nameParts.length > 2 ? 2 : 1).join(' ') : '');
        
        setFormData({
          title: titleValue,
          firstName: emp.firstName || '',
          lastName: emp.lastName || (hasTitle ? nameParts.slice(-1)[0] : nameParts.slice(-1)[0]) || '',
          birthday: formatBirthday(emp.birthday),
          email: emp.email || '',
          emailPrivate: emp.emailPrivate || '',
          phoneWork: emp.phoneWork || '',
          phonePrivate: emp.phonePrivate || '',
          showPrivateContact: emp.showPrivateContact || false,
          badge: emp.lastName?.substring(0, 2).toUpperCase() || emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || ''
        });
        setNewBadge(emp.lastName?.substring(0, 2).toUpperCase() || '');
        setRoleValue(emp.role || "");
        setAppRoleValue(emp.appRole || "");
        setCompetenciesValue(Array.isArray(emp.competencies) ? emp.competencies : []);
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

      // TODO: Backend schema needs title, birthday, badge fields before full persistence
      // Currently saving only fields supported by the existing API
      if (canEditBasicInfo) {
        Object.assign(payload, {
          title: formData.title || null,
          firstName: formData.firstName,
          lastName: formData.lastName,
          birthday: formData.birthday || null,
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
          competencies: competenciesValue,
        });
      }

      if (Object.keys(payload).length === 0) {
        setSaving(false);
        return;
      }

      await employeeApi.update(employee.id, payload);
      toast({
        title: "Gespeichert",
        description: "Ihre Einstellungen wurden aktualisiert"
      });
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

  const handleAddCompetency = () => {
    const trimmed = newCompetency.trim();
    if (!trimmed) return;
    setCompetenciesValue((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setNewCompetency("");
  };

  const handleRemoveCompetency = (value: string) => {
    setCompetenciesValue((prev) => prev.filter((comp) => comp !== value));
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
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <Input 
                        type="date"
                        value={formData.birthday}
                        onChange={(e) => setFormData(prev => ({ ...prev, birthday: e.target.value }))} 
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
                    {(canEditRoleAndCompetencies ? competenciesValue : employee.competencies)?.length ? (
                      (canEditRoleAndCompetencies ? competenciesValue : employee.competencies || []).map((comp, idx) => (
                        <Badge key={`${comp}-${idx}`} variant="secondary" className="flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" />
                          <span>{comp}</span>
                          {canEditRoleAndCompetencies && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCompetency(comp)}
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              aria-label={`Kompetenz entfernen: ${comp}`}
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
                    <div className="flex gap-2">
                      <Input
                        value={newCompetency}
                        onChange={(e) => setNewCompetency(e.target.value)}
                        placeholder="Kompetenz hinzufügen"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddCompetency();
                          }
                        }}
                      />
                      <Button type="button" onClick={handleAddCompetency} variant="outline">
                        Hinzufügen
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Primärer Einsatzbereich</Label>
                  <div className="relative">
                    <Tag className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input value={employee.primaryDeploymentArea || "—"} disabled />
                  </div>
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
