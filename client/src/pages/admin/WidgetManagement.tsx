import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useMemo, useState } from "react";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard-widgets";

type AdminUser = {
  id: number;
  name: string;
  lastName: string | null;
  email: string | null;
};

export default function WidgetManagement() {
  const { can, isSuperuser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [enabledWidgets, setEnabledWidgets] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingWidgets, setLoadingWidgets] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasAccess = isSuperuser || can("widgets.manage");

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) throw new Error("Fehler beim Laden der Benutzer");
        const body = await res.json();
        setUsers(
          (body.data ?? [])
            .map((user: any) => ({
              id: user.id,
              name: user.name,
              lastName: user.lastName,
              email: user.email,
            }))
            .sort((a: AdminUser, b: AdminUser) =>
              `${a.name} ${a.lastName ?? ""}`.localeCompare(
                `${b.name} ${b.lastName ?? ""}`,
                "de",
              ),
            ),
        );
      } catch (error) {
        toast({
          title: "Benutzer konnten nicht geladen werden",
          description: (error as Error).message,
          variant: "destructive",
        });
      } finally {
        setLoadingUsers(false);
      }
    };
    void loadUsers();
  }, [toast]);

  const fetchWidgetsForUser = useMemo(
    () => async (userId: number) => {
      setLoadingWidgets(true);
      try {
        const res = await fetch(`/api/admin/users/${userId}/widgets`);
        if (!res.ok) {
          if (res.status === 404) {
            toast({
              title: "Endpoint fehlt",
              description:
                "Das Backend liefert noch keine Widget-Daten zurück. /api/admin/users/:id/widgets",
              variant: "destructive",
            });
            setEnabledWidgets([]);
            return;
          }
          throw new Error("Fehler beim Laden der Widget-Konfiguration");
        }
        const body = await res.json();
        setEnabledWidgets(body.data?.enabledWidgets ?? []);
      } catch (error) {
        toast({
          title: "Widget-Liste konnte nicht geladen werden",
          description: (error as Error).message,
          variant: "destructive",
        });
        setEnabledWidgets([]);
      } finally {
        setLoadingWidgets(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (selectedUserId) {
      void fetchWidgetsForUser(selectedUserId);
    }
  }, [selectedUserId, fetchWidgetsForUser]);

  const handleToggleWidget = (key: string) => {
    setEnabledWidgets((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}/widgets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledWidgets }),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      toast({
        title: "Widget-Konfiguration gespeichert",
      });
    } catch (error) {
      toast({
        title: "Widget-Konfiguration konnte nicht gespeichert werden",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEnabledWidgets([]);
  };

  if (!hasAccess) {
    return (
      <Layout title="Widgets bearbeiten">
        <Card className="border-none kabeg-shadow">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Keine Berechtigung zum Verwalten von Dashboard-Widgets.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="Widgets bearbeiten">
      <div className="max-w-5xl mx-auto space-y-6">
        <Card className="border-none kabeg-shadow">
          <CardHeader>
            <CardTitle>Widget-Konfiguration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-select">Benutzer</Label>
              <select
                id="user-select"
                className="w-full border border-border rounded-md px-3 py-2 bg-background"
                value={selectedUserId ?? ""}
                onChange={(event) =>
                  setSelectedUserId(
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">Auswählen</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} {user.lastName ?? ""} ({user.email ?? "–"})
                  </option>
                ))}
              </select>
            </div>

            <Separator />

            {loadingWidgets ? (
              <p className="text-sm text-muted-foreground">
                Widget-Konfiguration wird geladen…
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DASHBOARD_WIDGETS.map((widget) => (
                  <label
                    key={widget.key}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={enabledWidgets.includes(widget.key)}
                      onCheckedChange={() => handleToggleWidget(widget.key)}
                      disabled={!selectedUserId}
                    />
                    <div>
                      <p className="text-sm font-medium">{widget.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {widget.key}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={!selectedUserId || saving}
                className="px-4"
              >
                Speichern
              </Button>
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={!selectedUserId || saving}
              >
                Rücksetzen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
