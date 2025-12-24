import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building, Save, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/auth";

interface Clinic {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  logoUrl?: string;
}

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

  useEffect(() => {
    loadClinic();
  }, []);

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
      </div>
    </Layout>
  );
}

