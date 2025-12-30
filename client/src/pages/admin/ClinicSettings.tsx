import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Building, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/auth";
import { serviceLinesApi } from "@/lib/api";
import type { ServiceLine } from "@shared/schema";

interface Clinic {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  logoUrl?: string;
}

type ServiceLineForm = Pick<
  ServiceLine,
  "id" | "key" | "label" | "roleGroup" | "startTime" | "endTime" | "endsNextDay" | "sortOrder" | "isActive"
>;

const normalizeTime = (value?: string | null) => {
  if (!value) return "";
  const [hours, minutes] = value.split(":");
  if (!hours || !minutes) return value;
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
};

export default function ClinicSettings() {
  const { toast } = useToast();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    timezone: "Europe/Vienna",
    logoUrl: ""
  });
  const [serviceLines, setServiceLines] = useState<ServiceLineForm[]>([]);
  const [serviceLinesLoading, setServiceLinesLoading] = useState(true);
  const [serviceLineSavingId, setServiceLineSavingId] = useState<number | null>(null);
  const [serviceLineDeletingId, setServiceLineDeletingId] = useState<number | null>(null);
  const [newServiceLine, setNewServiceLine] = useState<Omit<ServiceLineForm, "id">>({
    key: "",
    label: "",
    roleGroup: "ALL",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 0,
    isActive: true
  });

  useEffect(() => {
    loadClinic();
    loadServiceLines();
  }, []);

  const loadServiceLines = async () => {
    setServiceLinesLoading(true);
    try {
      const lines = await serviceLinesApi.getAll();
      const normalized = lines.map((line) => ({
        id: line.id,
        key: line.key,
        label: line.label,
        roleGroup: line.roleGroup || "ALL",
        startTime: normalizeTime(line.startTime),
        endTime: normalizeTime(line.endTime),
        endsNextDay: Boolean(line.endsNextDay),
        sortOrder: line.sortOrder ?? 0,
        isActive: line.isActive !== false
      }));
      setServiceLines(normalized);
    } catch (error) {
      console.error("Error loading service lines:", error);
      toast({
        title: "Fehler",
        description: "Dienstschienen konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setServiceLinesLoading(false);
    }
  };

  const loadClinic = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch("/api/admin/clinic", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error("Fehler beim Laden der Klinik-Einstellungen");
      }

      const result = await response.json();
      if (result.success && result.data) {
        setClinic(result.data);
        setFormData({
          name: result.data.name || "",
          slug: result.data.slug || "",
          timezone: result.data.timezone || "Europe/Vienna",
          logoUrl: result.data.logoUrl || ""
        });
      }
    } catch (error) {
      console.error("Error loading clinic:", error);
      toast({
        title: "Fehler",
        description: "Klinik-Einstellungen konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getAuthToken();
      const response = await fetch("/api/admin/clinic", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      const result = await response.json();
      if (result.success) {
        setClinic(result.data);
        toast({
          title: "Erfolgreich",
          description: "Klinik-Einstellungen wurden gespeichert"
        });
      }
    } catch (error: any) {
      console.error("Error saving clinic:", error);
      toast({
        title: "Fehler",
        description: error.message || "Klinik-Einstellungen konnten nicht gespeichert werden",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const updateServiceLineField = (
    id: number,
    field: keyof ServiceLineForm,
    value: ServiceLineForm[keyof ServiceLineForm]
  ) => {
    setServiceLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, [field]: value } : line))
    );
  };

  const handleSaveServiceLine = async (id: number) => {
    const line = serviceLines.find((item) => item.id === id);
    if (!line) return;
    setServiceLineSavingId(id);
    try {
      await serviceLinesApi.update(id, {
        key: line.key,
        label: line.label,
        roleGroup: line.roleGroup || "ALL",
        startTime: line.startTime,
        endTime: line.endTime,
        endsNextDay: line.endsNextDay,
        sortOrder: Number(line.sortOrder) || 0,
        isActive: line.isActive
      });
      toast({
        title: "Gespeichert",
        description: "Dienstschiene wurde aktualisiert"
      });
    } catch (error: any) {
      console.error("Error saving service line:", error);
      toast({
        title: "Fehler",
        description: error.message || "Dienstschiene konnte nicht gespeichert werden",
        variant: "destructive"
      });
    } finally {
      setServiceLineSavingId(null);
    }
  };

  const handleDeleteServiceLine = async (id: number) => {
    setServiceLineDeletingId(id);
    try {
      await serviceLinesApi.delete(id);
      setServiceLines((prev) => prev.filter((line) => line.id !== id));
      toast({
        title: "Gelöscht",
        description: "Dienstschiene wurde entfernt"
      });
    } catch (error: any) {
      console.error("Error deleting service line:", error);
      toast({
        title: "Fehler",
        description: error.message || "Dienstschiene konnte nicht gelöscht werden",
        variant: "destructive"
      });
    } finally {
      setServiceLineDeletingId(null);
    }
  };

  const handleAddServiceLine = async () => {
    if (!newServiceLine.key.trim() || !newServiceLine.label.trim()) {
      toast({
        title: "Fehler",
        description: "Key und Bezeichnung sind erforderlich",
        variant: "destructive"
      });
      return;
    }

    try {
      const created = await serviceLinesApi.create({
        key: newServiceLine.key.trim(),
        label: newServiceLine.label.trim(),
        roleGroup: newServiceLine.roleGroup || "ALL",
        startTime: newServiceLine.startTime,
        endTime: newServiceLine.endTime,
        endsNextDay: newServiceLine.endsNextDay,
        sortOrder: Number(newServiceLine.sortOrder) || 0,
        isActive: newServiceLine.isActive
      });
      setServiceLines((prev) => [
        ...prev,
        {
          id: created.id,
          key: created.key,
          label: created.label,
          roleGroup: created.roleGroup || "ALL",
          startTime: normalizeTime(created.startTime),
          endTime: normalizeTime(created.endTime),
          endsNextDay: Boolean(created.endsNextDay),
          sortOrder: created.sortOrder ?? 0,
          isActive: created.isActive !== false
        }
      ]);
      setNewServiceLine({
        key: "",
        label: "",
        roleGroup: "ALL",
        startTime: "07:30",
        endTime: "08:00",
        endsNextDay: true,
        sortOrder: serviceLines.length + 1,
        isActive: true
      });
      toast({
        title: "Erstellt",
        description: "Dienstschiene wurde hinzugefügt"
      });
    } catch (error: any) {
      console.error("Error creating service line:", error);
      toast({
        title: "Fehler",
        description: error.message || "Dienstschiene konnte nicht erstellt werden",
        variant: "destructive"
      });
    }
  };

  const orderedServiceLines = [...serviceLines].sort((a, b) => {
    const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (order !== 0) return order;
    return a.label.localeCompare(b.label);
  });

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#0F5BA7]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Klinik-Einstellungen</h1>
          <p className="text-gray-600 mt-1">Verwalten Sie die Einstellungen Ihrer Klinik</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Klinik-Informationen
            </CardTitle>
            <CardDescription>
              Grundlegende Informationen über Ihre Klinik
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Klinikname *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Klinikum Klagenfurt"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Kurzname/Slug *</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                placeholder="z.B. klinikum-klagenfurt"
              />
              <p className="text-sm text-gray-500">
                Wird für URLs verwendet. Nur Kleinbuchstaben, Zahlen und Bindestriche.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Zeitzone</Label>
              <Input
                id="timezone"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                placeholder="Europe/Vienna"
              />
              <p className="text-sm text-gray-500">
                IANA-Zeitzone (z.B. Europe/Vienna, Europe/Berlin)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL (optional)</Label>
              <Input
                id="logoUrl"
                value={formData.logoUrl}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving || !formData.name || !formData.slug}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Speichern
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dienstschienen</CardTitle>
            <CardDescription>
              Bezeichnungen, Gruppen und Dienstzeiten für Kalender und Dienstpläne
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {serviceLinesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Dienstschienen werden geladen...
              </div>
            ) : (
              <div className="space-y-6">
                {orderedServiceLines.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Noch keine Dienstschienen definiert.
                  </p>
                ) : (
                  orderedServiceLines.map((line) => (
                    <div key={line.id} className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <div className="grid gap-3 md:grid-cols-[1.2fr,1fr,0.7fr,0.7fr,0.6fr,0.6fr,0.6fr] items-end">
                        <div className="space-y-2">
                          <Label>Bezeichnung</Label>
                          <Input
                            value={line.label}
                            onChange={(e) => updateServiceLineField(line.id, "label", e.target.value)}
                            placeholder="z.B. Kreißzimmer (Ass.)"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Key</Label>
                          <Input
                            value={line.key}
                            onChange={(e) => updateServiceLineField(line.id, "key", e.target.value)}
                            placeholder="z.B. kreiszimmer"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Gruppe</Label>
                          <Input
                            value={line.roleGroup || ""}
                            onChange={(e) => updateServiceLineField(line.id, "roleGroup", e.target.value)}
                            placeholder="OA / ASS / TURNUS / ALL"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Start</Label>
                          <Input
                            type="time"
                            value={line.startTime}
                            onChange={(e) => updateServiceLineField(line.id, "startTime", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Ende</Label>
                          <Input
                            type="time"
                            value={line.endTime}
                            onChange={(e) => updateServiceLineField(line.id, "endTime", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>+1 Tag</Label>
                          <div className="flex items-center gap-2 h-10">
                            <Checkbox
                              checked={line.endsNextDay}
                              onCheckedChange={(checked) =>
                                updateServiceLineField(line.id, "endsNextDay", Boolean(checked))
                              }
                            />
                            <span className="text-sm text-gray-500">Folgetag</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Reihenfolge</Label>
                          <Input
                            type="number"
                            value={line.sortOrder ?? 0}
                            onChange={(e) =>
                              updateServiceLineField(line.id, "sortOrder", Number(e.target.value))
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={line.isActive}
                            onCheckedChange={(checked) =>
                              updateServiceLineField(line.id, "isActive", Boolean(checked))
                            }
                          />
                          <span className="text-sm text-gray-600">Aktiv</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleDeleteServiceLine(line.id)}
                            disabled={serviceLineDeletingId === line.id}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Löschen
                          </Button>
                          <Button
                            onClick={() => handleSaveServiceLine(line.id)}
                            disabled={serviceLineSavingId === line.id}
                          >
                            {serviceLineSavingId === line.id ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Speichern...
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4 mr-2" />
                                Speichern
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <div className="rounded-lg border border-dashed border-gray-300 p-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-[1.2fr,1fr,0.7fr,0.7fr,0.7fr,0.6fr,0.6fr] items-end">
                    <div className="space-y-2">
                      <Label>Neue Bezeichnung</Label>
                      <Input
                        value={newServiceLine.label}
                        onChange={(e) =>
                          setNewServiceLine((prev) => ({ ...prev, label: e.target.value }))
                        }
                        placeholder="z.B. Long Day"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Key</Label>
                      <Input
                        value={newServiceLine.key}
                        onChange={(e) =>
                          setNewServiceLine((prev) => ({ ...prev, key: e.target.value }))
                        }
                        placeholder="z.B. long_day"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Gruppe</Label>
                      <Input
                        value={newServiceLine.roleGroup || ""}
                        onChange={(e) =>
                          setNewServiceLine((prev) => ({ ...prev, roleGroup: e.target.value }))
                        }
                        placeholder="OA / ASS / TURNUS / ALL"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Start</Label>
                      <Input
                        type="time"
                        value={newServiceLine.startTime}
                        onChange={(e) =>
                          setNewServiceLine((prev) => ({ ...prev, startTime: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ende</Label>
                      <Input
                        type="time"
                        value={newServiceLine.endTime}
                        onChange={(e) =>
                          setNewServiceLine((prev) => ({ ...prev, endTime: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>+1 Tag</Label>
                      <div className="flex items-center gap-2 h-10">
                        <Checkbox
                          checked={newServiceLine.endsNextDay}
                          onCheckedChange={(checked) =>
                            setNewServiceLine((prev) => ({ ...prev, endsNextDay: Boolean(checked) }))
                          }
                        />
                        <span className="text-sm text-gray-500">Folgetag</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Reihenfolge</Label>
                      <Input
                        type="number"
                        value={newServiceLine.sortOrder}
                        onChange={(e) =>
                          setNewServiceLine((prev) => ({
                            ...prev,
                            sortOrder: Number(e.target.value)
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={newServiceLine.isActive}
                        onCheckedChange={(checked) =>
                          setNewServiceLine((prev) => ({ ...prev, isActive: Boolean(checked) }))
                        }
                      />
                      <span className="text-sm text-gray-600">Aktiv</span>
                    </div>
                    <Button onClick={handleAddServiceLine}>
                      <Plus className="w-4 h-4 mr-2" />
                      Dienstschiene hinzufügen
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
