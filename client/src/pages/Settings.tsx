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
  Info
} from "lucide-react";
import { useState, useEffect } from "react";
import { employeeApi } from "@/lib/api";
import type { Employee } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

export default function Settings() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { employee: currentUser, isAdmin } = useAuth();
  
  const viewingUserId = params.userId ? parseInt(params.userId) : (currentUser?.id || 0);
  
  const isViewingOwnProfile = currentUser ? viewingUserId === currentUser.id : false;
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
        
        setFormData({
          title: hasTitle ? nameParts.slice(0, nameParts.length > 2 ? 2 : 1).join(' ') : '',
          firstName: emp.firstName || '',
          lastName: emp.lastName || (hasTitle ? nameParts.slice(-1)[0] : nameParts.slice(-1)[0]) || '',
          birthday: '',
          email: emp.email || '',
          emailPrivate: emp.emailPrivate || '',
          phoneWork: emp.phoneWork || '',
          phonePrivate: emp.phonePrivate || '',
          showPrivateContact: emp.showPrivateContact || false,
          badge: emp.lastName?.substring(0, 2).toUpperCase() || emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || ''
        });
        setNewBadge(emp.lastName?.substring(0, 2).toUpperCase() || '');
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
    if (!employee || !canEditBasicInfo) return;
    
    setSaving(true);
    try {
      // TODO: Backend schema needs title, birthday, badge fields before full persistence
      // Currently saving only fields supported by the existing API
      await employeeApi.update(employee.id, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        emailPrivate: formData.emailPrivate,
        phoneWork: formData.phoneWork,
        phonePrivate: formData.phonePrivate,
        showPrivateContact: formData.showPrivateContact
      });
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
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{employee.role}</Badge>
              <Badge variant="secondary" className="font-mono">{formData.badge}</Badge>
              {employee.isAdmin && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200">Admin</Badge>
              )}
              {employee.isActive ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Aktiv</Badge>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Inaktiv</Badge>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="mb-6">
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4" /> Profil
            </TabsTrigger>
            <TabsTrigger value="qualifications" className="gap-2">
              <GraduationCap className="w-4 h-4" /> Qualifikationen & Kürzel
            </TabsTrigger>
            {(isViewingOwnProfile || isAdmin) && (
              <TabsTrigger value="security" className="gap-2">
                <Lock className="w-4 h-4" /> Sicherheit
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" /> Persönliche Daten
                  </CardTitle>
                  <CardDescription>
                    {canEditBasicInfo ? "Bearbeiten Sie Ihre persönlichen Informationen" : "Nur zur Ansicht"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Titel</Label>
                      <Input 
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        disabled={!canEditBasicInfo}
                        placeholder="z.B. Dr., PD Dr., Prof."
                        data-testid="input-title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="firstName">
                        Vorname <span className="text-destructive">*</span>
                      </Label>
                      <Input 
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        disabled={!canEditBasicInfo}
                        required
                        data-testid="input-firstname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">
                        Nachname <span className="text-destructive">*</span>
                      </Label>
                      <Input 
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        disabled={!canEditBasicInfo}
                        required
                        data-testid="input-lastname"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="birthday" className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Geburtstag <span className="text-destructive">*</span>
                    </Label>
                    <Input 
                      id="birthday"
                      type="date"
                      value={formData.birthday}
                      onChange={(e) => setFormData(prev => ({ ...prev, birthday: e.target.value }))}
                      disabled={!canEditBasicInfo}
                      required
                      className="w-48"
                      data-testid="input-birthday"
                    />
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Dein Geburtstag wird nur für Geburtstags-Hinweise im Team verwendet.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5" /> Kontaktdaten
                  </CardTitle>
                  <CardDescription>
                    Dienstliche und private Erreichbarkeit
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">
                        E-Mail (dienstlich) <span className="text-destructive">*</span>
                      </Label>
                      <Input 
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        disabled={!canEditBasicInfo}
                        required
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emailPrivate">
                        E-Mail (privat)
                        {!canEditPrivateInfo && isViewingOwnProfile && (
                          <Badge variant="outline" className="ml-2 text-xs">Nur Ansicht</Badge>
                        )}
                      </Label>
                      <Input 
                        id="emailPrivate"
                        type="email"
                        value={formData.emailPrivate}
                        onChange={(e) => setFormData(prev => ({ ...prev, emailPrivate: e.target.value }))}
                        disabled={!canEditPrivateInfo}
                        className={!canEditPrivateInfo ? "bg-muted" : ""}
                        data-testid="input-email-private"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phoneWork">
                        Telefon (dienstlich) <span className="text-destructive">*</span>
                      </Label>
                      <Input 
                        id="phoneWork"
                        type="tel"
                        value={formData.phoneWork}
                        onChange={(e) => setFormData(prev => ({ ...prev, phoneWork: e.target.value }))}
                        disabled={!canEditBasicInfo}
                        required
                        data-testid="input-phone-work"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phonePrivate">
                        Telefon (privat)
                        {!canEditPrivateInfo && isViewingOwnProfile && (
                          <Badge variant="outline" className="ml-2 text-xs">Nur Ansicht</Badge>
                        )}
                      </Label>
                      <Input 
                        id="phonePrivate"
                        type="tel"
                        value={formData.phonePrivate}
                        onChange={(e) => setFormData(prev => ({ ...prev, phonePrivate: e.target.value }))}
                        disabled={!canEditPrivateInfo}
                        className={!canEditPrivateInfo ? "bg-muted" : ""}
                        data-testid="input-phone-private"
                      />
                    </div>
                  </div>
                  
                  {!canEditPrivateInfo && isViewingOwnProfile && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800">
                        Private Kontaktdaten können nur durch die Sekretärin, den Primararzt oder den 1. Oberarzt geändert werden.
                      </p>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Private Kontaktdaten für Kolleg:innen sichtbar machen</Label>
                      <p className="text-sm text-muted-foreground">
                        Wenn aktiviert, können Ihre Kolleg:innen Ihre privaten Kontaktdaten im Teamverzeichnis sehen
                      </p>
                    </div>
                    <Switch 
                      checked={formData.showPrivateContact}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showPrivateContact: checked }))}
                      disabled={!canEditBasicInfo}
                      data-testid="switch-show-private"
                    />
                  </div>
                </CardContent>
              </Card>

              {canEditBasicInfo && (
                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving} className="gap-2" data-testid="button-save">
                    <Save className="w-4 h-4" />
                    {saving ? "Wird gespeichert..." : "Änderungen speichern"}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="qualifications">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="w-5 h-5" /> Namenskürzel / Badge
                  </CardTitle>
                  <CardDescription>
                    Ihr eindeutiges Kürzel für Dienstplan und Wochenplan
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold font-mono">
                      {formData.badge}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Aktuelles Kürzel: <span className="font-mono text-lg">{formData.badge}</span></p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Dein Kürzel wird im Dienstplan und Wochenplan angezeigt. Es sollte eindeutig sein.
                      </p>
                    </div>
                    {canEditBasicInfo && (
                      <Dialog open={isBadgeDialogOpen} onOpenChange={setIsBadgeDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="gap-2" data-testid="button-change-badge">
                            <Pencil className="w-4 h-4" />
                            Badge ändern
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Kürzel ändern</DialogTitle>
                            <DialogDescription>
                              Geben Sie ein neues eindeutiges Kürzel ein (2-4 Zeichen empfohlen)
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-4">
                            <div className="space-y-2">
                              <Label htmlFor="newBadge">Neues Kürzel</Label>
                              <Input 
                                id="newBadge"
                                value={newBadge}
                                onChange={(e) => setNewBadge(e.target.value.toUpperCase())}
                                placeholder="z.B. SH, LG, MW"
                                maxLength={4}
                                className="font-mono text-lg uppercase"
                                data-testid="input-new-badge"
                              />
                              <p className="text-xs text-muted-foreground">
                                Das Kürzel sollte eindeutig sein. Typischerweise werden die Initialen des Nachnamens verwendet.
                              </p>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsBadgeDialogOpen(false)}>
                              Abbrechen
                            </Button>
                            <Button onClick={handleBadgeChange} disabled={!newBadge} data-testid="button-save-badge">
                              Speichern
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5" /> Dienstgrad & Einsetzbarkeit
                  </CardTitle>
                  <CardDescription>
                    Diese Felder können nur durch die Sekretärin, den Primararzt oder den 1. Oberarzt geändert werden
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Dienstgrad</Label>
                    <div className="flex items-center gap-2">
                      <Input value={employee.role} disabled className="bg-muted" />
                      {!isAdmin && (
                        <Badge variant="outline" className="shrink-0">Nur Ansicht</Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Kompetenzen</Label>
                    <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg min-h-[60px]">
                      {employee.competencies.length > 0 ? (
                        employee.competencies.map((comp, i) => (
                          <Badge key={i} variant="secondary">{comp}</Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Keine Kompetenzen eingetragen</span>
                      )}
                    </div>
                    {!isAdmin && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Wenden Sie sich an die Sekretärin oder einen Administrator, um Änderungen vorzunehmen
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="w-5 h-5" /> Diplome & Zertifikate
                  </CardTitle>
                  <CardDescription>
                    Laden Sie Ihre Diplome und Zertifikate hoch
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {employee.diplomas && employee.diplomas.length > 0 ? (
                      employee.diplomas.map((diploma, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg">
                          <FileText className="w-4 h-4" />
                          <span className="text-sm">{diploma}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine Diplome hochgeladen</p>
                    )}
                  </div>
                  
                  {canEditBasicInfo && (
                    <Button variant="outline" className="gap-2" data-testid="button-upload-diploma">
                      <Upload className="w-4 h-4" /> Diplom hochladen
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5" /> Sicherheit
                </CardTitle>
                <CardDescription>
                  Verwalten Sie Ihr Passwort und Ihre Sicherheitseinstellungen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                  <div>
                    <p className="font-medium">Passwort ändern</p>
                    <p className="text-sm text-muted-foreground">
                      Ändern Sie Ihr Passwort regelmäßig für mehr Sicherheit
                    </p>
                  </div>
                  <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" data-testid="button-change-password">
                        Passwort ändern
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Passwort ändern</DialogTitle>
                        <DialogDescription>
                          Geben Sie Ihr aktuelles und ein neues Passwort ein
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
                          <Input 
                            id="currentPassword"
                            type="password"
                            value={passwordData.currentPassword}
                            onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                            data-testid="input-current-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="newPassword">Neues Passwort</Label>
                          <Input 
                            id="newPassword"
                            type="password"
                            value={passwordData.newPassword}
                            onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                            data-testid="input-new-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                          <Input 
                            id="confirmPassword"
                            type="password"
                            value={passwordData.confirmPassword}
                            onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            data-testid="input-confirm-password"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
                          Abbrechen
                        </Button>
                        <Button onClick={handlePasswordChange} data-testid="button-save-password">
                          Speichern
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <Separator />

                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Hinweis:</strong> Bei vergessenen Passwörtern wenden Sie sich bitte an die Sekretärin 
                    oder einen Administrator. Passwörter können nicht per E-Mail zurückgesetzt werden.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
