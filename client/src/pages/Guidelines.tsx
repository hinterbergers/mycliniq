import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, ExternalLink } from "lucide-react";
import type { Sop, SopReference } from "@shared/schema";
import { sopApi, type SopDetail } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_ORDER = ["SOP", "Leitlinie", "Checkliste", "Formular"] as const;
const CATEGORY_STYLES: Record<string, string> = {
  SOP: "bg-blue-100 text-blue-700 border-blue-200",
  Leitlinie: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Checkliste: "bg-amber-100 text-amber-700 border-amber-200",
  Formular: "bg-slate-100 text-slate-700 border-slate-200"
};

const NATIONAL_GUIDELINE_KEYS = ["OGGG", "DGGG"];
const INTERNATIONAL_GUIDELINE_KEYS = ["ESGE", "ACOG", "RCOG", "NICE"];

const normalizeReferenceText = (value?: string | null) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const getReferenceRank = (ref: SopReference) => {
  const text = `${normalizeReferenceText(ref.publisher)} ${normalizeReferenceText(ref.title)}`.trim();
  if (ref.type === "awmf" || text.includes("AWMF")) return 0;
  if (ref.type === "guideline") {
    if (NATIONAL_GUIDELINE_KEYS.some((key) => text.includes(key))) return 1;
    if (INTERNATIONAL_GUIDELINE_KEYS.some((key) => text.includes(key))) return 2;
    return 3;
  }
  if (ref.type === "study") return 4;
  return 5;
};

function formatDate(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "dd.MM.yyyy", { locale: de });
}

function sortReferences(references: SopReference[]) {
  return [...references].sort((a, b) => {
    const orderA = getReferenceRank(a);
    const orderB = getReferenceRank(b);
    if (orderA !== orderB) return orderA - orderB;
    return (a.title || "").localeCompare(b.title || "");
  });
}

export default function Guidelines() {
  const { toast } = useToast();
  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Alle");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSop, setDetailSop] = useState<SopDetail | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await sopApi.getAll({ status: "published" });
        setSops(data);
      } catch (error) {
        toast({
          title: "Fehler",
          description: "SOPs konnten nicht geladen werden",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [toast]);

  const categories = useMemo(() => {
    const set = new Set(sops.map((sop) => sop.category));
    const ordered = CATEGORY_ORDER.filter((value) => set.has(value));
    const rest = Array.from(set).filter((value) => !CATEGORY_ORDER.includes(value as any));
    return ["Alle", ...ordered, ...rest];
  }, [sops]);

  const filteredSops = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sops.filter((sop) => {
      const matchesCategory = selectedCategory === "Alle" || sop.category === selectedCategory;
      const matchesSearch = !term ||
        sop.title.toLowerCase().includes(term) ||
        (sop.contentMarkdown || "").toLowerCase().includes(term) ||
        (sop.keywords || []).some((keyword) => keyword.toLowerCase().includes(term));
      return matchesCategory && matchesSearch;
    });
  }, [sops, searchTerm, selectedCategory]);

  const openDetail = async (sop: Sop) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const detail = await sopApi.getById(sop.id);
      setDetailSop(detail);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "SOP konnte nicht geladen werden",
        variant: "destructive"
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Layout title="SOPs & Leitlinien">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">SOPs & Leitlinien</h2>
          <p className="text-muted-foreground max-w-2xl">
            Freigegebene SOPs, Leitlinien und Checklisten der Abteilung.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="SOPs durchsuchen..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-9"
                data-testid="input-search-sops"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Button
                  key={category}
                  size="sm"
                  variant={selectedCategory === category ? "default" : "outline"}
                  onClick={() => setSelectedCategory(category)}
                  data-testid={`button-category-${category.toLowerCase()}`}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {loading && <p className="text-sm text-muted-foreground">Lade SOPs...</p>}

          {!loading && filteredSops.length === 0 && (
            <Card className="border border-dashed">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Keine freigegebenen SOPs gefunden.
              </CardContent>
            </Card>
          )}

          {!loading && filteredSops.length > 0 && (
            <div className="grid gap-4">
              {filteredSops.map((sop) => (
                <Card
                  key={sop.id}
                  className="border-none kabeg-shadow hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => openDetail(sop)}
                >
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{sop.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          Aktualisiert: {formatDate(sop.publishedAt || sop.updatedAt) || "-"}
                        </p>
                      </div>
                      <Badge className={CATEGORY_STYLES[sop.category] || "bg-slate-100 text-slate-700 border-slate-200"}>
                        {sop.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {sop.contentMarkdown || "Kein Kurztext hinterlegt."}
                    </p>
                    {sop.keywords && sop.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {sop.keywords.slice(0, 4).map((keyword) => (
                          <Badge key={keyword} variant="secondary">
                            {keyword}
                          </Badge>
                        ))}
                        {sop.keywords.length > 4 && (
                          <Badge variant="outline">+{sop.keywords.length - 4}</Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>SOP Details</DialogTitle>
          </DialogHeader>
          {detailLoading && <p className="text-sm text-muted-foreground">Lade...</p>}
          {!detailLoading && detailSop && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{detailSop.title}</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge className={CATEGORY_STYLES[detailSop.category] || "bg-slate-100 text-slate-700 border-slate-200"}>
                    {detailSop.category}
                  </Badge>
                  <Badge variant="outline">Version {detailSop.version}</Badge>
                </div>
              </div>

              {detailSop.awmfLink && (
                <a
                  href={detailSop.awmfLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  AWMF Leitlinie
                </a>
              )}

              <Separator />

              <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                {detailSop.contentMarkdown || "Kein Inhalt hinterlegt."}
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Referenzen</h4>
                {detailSop.references && detailSop.references.length > 0 ? (
                  <div className="space-y-2">
                    {sortReferences(detailSop.references.filter((ref) => ref.status === "accepted")).map((ref) => (
                      <div key={ref.id} className="border rounded-lg p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{ref.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {ref.publisher || "Unbekannt"} {ref.yearOrVersion || ""}
                            </p>
                          </div>
                          <Badge variant="outline">{ref.type.toUpperCase()}</Badge>
                        </div>
                        {ref.url && (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary underline"
                          >
                            {ref.url}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Keine Referenzen vorhanden.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
