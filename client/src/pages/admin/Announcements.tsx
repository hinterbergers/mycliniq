import { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { dashboardContentApi, type DashboardAnnouncement } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type AnnouncementDraft = {
  title: string;
  summary: string;
  details: string;
  link: string;
  priority: "normal" | "important";
  status: "draft" | "published" | "archived";
};

const emptyDraft: AnnouncementDraft = {
  title: "",
  summary: "",
  details: "",
  link: "",
  priority: "normal" as const,
  status: "draft" as const,
};

export default function Announcements() {
  const { toast } = useToast();
  const [items, setItems] = useState<DashboardAnnouncement[]>([]);
  const [draft, setDraft] = useState<AnnouncementDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = () => dashboardContentApi.getAdminAnnouncements().then(setItems);
  useEffect(() => { void load(); }, []);

  const save = async (status: "draft" | "published") => {
    if (!draft.title.trim() || !draft.summary.trim()) return;
    setSaving(true);
    try {
      await dashboardContentApi.createAnnouncement({ ...draft, status });
      setDraft(emptyDraft);
      await load();
      toast({ title: status === "published" ? "Neuerung veröffentlicht" : "Entwurf gespeichert" });
    } finally { setSaving(false); }
  };

  const changeStatus = async (item: DashboardAnnouncement, status: "draft" | "published" | "archived") => {
    await dashboardContentApi.updateAnnouncement(item.id, {
      title: item.title,
      summary: item.summary,
      details: item.details ?? null,
      link: item.link ?? null,
      priority: item.priority,
      status,
    });
    await load();
  };

  return (
    <Layout title="Neuerungen">
      <div className="mx-auto max-w-4xl space-y-6 px-3 md:px-0">
        <div>
          <h1 className="text-2xl font-bold">Neuerungen veröffentlichen</h1>
          <p className="text-sm text-muted-foreground">Kompakte Hinweise für das Dashboard erstellen und verwalten.</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Neue Meldung</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Titel</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="z. B. Zeitausgleich verbessert" /></div>
            <div className="space-y-2"><Label>Kurztext</Label><Textarea value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} rows={2} placeholder="Wird kompakt am Dashboard angezeigt." /></div>
            <div className="space-y-2"><Label>Details (optional)</Label><Textarea value={draft.details} onChange={(e) => setDraft({ ...draft, details: e.target.value })} rows={4} /></div>
            <div className="space-y-2"><Label>Link (optional)</Label><Input value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} placeholder="/nachrichten oder https://…" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.priority === "important"} onChange={(e) => setDraft({ ...draft, priority: e.target.checked ? "important" : "normal" })} /> Als wichtig hervorheben</label>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={saving} onClick={() => void save("draft")}>Entwurf speichern</Button><Button disabled={saving} onClick={() => void save("published")}>Jetzt veröffentlichen</Button></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Vorhandene Meldungen</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {items.map((item) => <div key={item.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-medium">{item.title}</p><Badge variant="outline">{item.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{item.summary}</p></div></div>
              <div className="mt-3 flex gap-2">{item.status !== "published" && <Button size="sm" onClick={() => void changeStatus(item, "published")}>Veröffentlichen</Button>}{item.status !== "archived" && <Button size="sm" variant="outline" onClick={() => void changeStatus(item, "archived")}>Archivieren</Button>}</div>
            </div>)}
            {items.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Meldungen vorhanden.</p>}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
