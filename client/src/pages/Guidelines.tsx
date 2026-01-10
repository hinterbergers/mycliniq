import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MarkdownEditor,
  MarkdownViewer,
} from "@/components/editor/MarkdownEditor";
import { Search, ExternalLink, Download, History, Plus } from "lucide-react";
import type { Sop, SopReference } from "@shared/schema";
import { sopApi, type SopDetail } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  SOP_SECTION_DEFINITIONS,
  DEFAULT_SOP_SECTIONS,
  EMPTY_SOP_SECTIONS,
  SOP_TEMPLATE_MARKDOWN,
  buildSopMarkdown,
  parseSopSections,
  type SopSections,
} from "@/lib/sopTemplates";

const SOP_CATEGORIES = ["SOP", "Dienstanweisung", "Aufklärungen"] as const;
const ALLOWED_SOP_CATEGORIES = new Set(SOP_CATEGORIES);
const CATEGORY_ORDER = [...SOP_CATEGORIES] as const;
const CATEGORY_STYLES: Record<string, string> = {
  SOP: "bg-blue-100 text-blue-700 border-blue-200",
  Dienstanweisung: "bg-amber-100 text-amber-700 border-amber-200",
  Aufklärungen: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const normalizeSopCategory = (value?: string | null) => {
  if (!value) return "SOP";
  if (ALLOWED_SOP_CATEGORIES.has(value as (typeof SOP_CATEGORIES)[number]))
    return value;
  return "SOP";
};

const hasSopSectionContent = (sections: SopSections) =>
  SOP_SECTION_DEFINITIONS.some((section) => {
    const value = (sections[section.key] || "").trim();
    const placeholder = DEFAULT_SOP_SECTIONS[section.key].trim();
    return value && value !== placeholder;
  });

const sanitizeSopSections = (sections: SopSections): SopSections => {
  const cleaned = { ...EMPTY_SOP_SECTIONS };
  SOP_SECTION_DEFINITIONS.forEach((section) => {
    const value = (sections[section.key] || "").trim();
    const placeholder = DEFAULT_SOP_SECTIONS[section.key].trim();
    cleaned[section.key] = value && value !== placeholder ? value : "";
  });
  return cleaned;
};

const NATIONAL_GUIDELINE_KEYS = ["OGGG", "DGGG"];
const INTERNATIONAL_GUIDELINE_KEYS = ["ESGE", "ACOG", "RCOG", "NICE"];

const normalizeReferenceText = (value?: string | null) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const getReferenceRank = (ref: SopReference) => {
  const text =
    `${normalizeReferenceText(ref.publisher)} ${normalizeReferenceText(ref.title)}`.trim();
  if (ref.type === "awmf" || text.includes("AWMF")) return 0;
  if (ref.type === "guideline") {
    if (NATIONAL_GUIDELINE_KEYS.some((key) => text.includes(key))) return 1;
    if (INTERNATIONAL_GUIDELINE_KEYS.some((key) => text.includes(key)))
      return 2;
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

const toSafeFilename = (value: string) => {
  const ascii = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 60) || "sop";
};

const formatEmployeeName = (name?: string | null, lastName?: string | null) => {
  if (name && lastName) return `${name} ${lastName}`;
  return name || lastName || "Unbekannt";
};

export default function Guidelines() {
  const { toast } = useToast();
  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Alle");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSop, setDetailSop] = useState<SopDetail | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [docxDownloading, setDocxDownloading] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorForm, setEditorForm] = useState({
    title: "",
    category: "SOP",
    contentMarkdown: SOP_TEMPLATE_MARKDOWN,
    keywords: "",
    awmfLink: "",
  });
  const [editorSections, setEditorSections] =
    useState<SopSections>(DEFAULT_SOP_SECTIONS);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await sopApi.getAll({ status: "published" });
        setSops(data);
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Dokumente konnten nicht geladen werden",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [toast]);

  const categories = useMemo(() => {
    const set = new Set(sops.map((sop) => normalizeSopCategory(sop.category)));
    const ordered = CATEGORY_ORDER.filter((value) => set.has(value));
    const rest = Array.from(set).filter(
      (value) => !CATEGORY_ORDER.includes(value as any),
    );
    return ["Alle", ...ordered, ...rest];
  }, [sops]);

  const filteredSops = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sops.filter((sop) => {
      const normalizedCategory = normalizeSopCategory(sop.category);
      const matchesCategory =
        selectedCategory === "Alle" || normalizedCategory === selectedCategory;
      const matchesSearch =
        !term ||
        sop.title.toLowerCase().includes(term) ||
        (sop.contentMarkdown || "").toLowerCase().includes(term) ||
        (sop.keywords || []).some((keyword) =>
          keyword.toLowerCase().includes(term),
        );
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
        description: "Dokument konnte nicht geladen werden",
        variant: "destructive",
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const openEditor = () => {
    setEditorForm({
      title: "",
      category: "SOP",
      contentMarkdown: SOP_TEMPLATE_MARKDOWN,
      keywords: "",
      awmfLink: "",
    });
    setEditorSections(DEFAULT_SOP_SECTIONS);
    setEditorOpen(true);
  };

  const handleEditorCategoryChange = (value: string) => {
    const normalizedCategory = normalizeSopCategory(value);
    const currentCategory = normalizeSopCategory(editorForm.category);
    if (normalizedCategory === currentCategory) return;

    if (currentCategory !== "SOP" && normalizedCategory !== "SOP") {
      setEditorForm((prev) => ({ ...prev, category: normalizedCategory }));
      return;
    }

    if (normalizedCategory === "SOP") {
      const parsed = editorForm.contentMarkdown?.trim()
        ? parseSopSections(editorForm.contentMarkdown)
        : DEFAULT_SOP_SECTIONS;
      setEditorSections(parsed);
      setEditorForm((prev) => ({
        ...prev,
        category: normalizedCategory,
        contentMarkdown: SOP_TEMPLATE_MARKDOWN,
      }));
      return;
    }

    const nextMarkdown = hasSopSectionContent(editorSections)
      ? buildSopMarkdown(sanitizeSopSections(editorSections))
      : "";
    setEditorSections(EMPTY_SOP_SECTIONS);
    setEditorForm((prev) => ({
      ...prev,
      category: normalizedCategory,
      contentMarkdown: nextMarkdown,
    }));
  };

  const handleCreate = async () => {
    if (!editorForm.title.trim()) {
      toast({
        title: "Fehler",
        description: "Titel ist erforderlich",
        variant: "destructive",
      });
      return;
    }
    const normalizedCategory = normalizeSopCategory(editorForm.category);
    const contentMarkdown =
      normalizedCategory === "SOP"
        ? hasSopSectionContent(editorSections)
          ? buildSopMarkdown(sanitizeSopSections(editorSections))
          : null
        : editorForm.contentMarkdown?.trim()
          ? editorForm.contentMarkdown.trim()
          : null;
    setEditorSaving(true);
    try {
      await sopApi.create({
        title: editorForm.title.trim(),
        category: normalizedCategory as Sop["category"],
        contentMarkdown,
        keywords: editorForm.keywords
          ? editorForm.keywords
              .split(",")
              .map((word) => word.trim())
              .filter(Boolean)
          : [],
        awmfLink: editorForm.awmfLink.trim() || null,
        status: "proposed",
      });
      toast({ title: "Dokument vorgeschlagen" });
      setEditorOpen(false);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Dokument konnte nicht vorgeschlagen werden",
        variant: "destructive",
      });
    } finally {
      setEditorSaving(false);
    }
  };

  const downloadDocx = async (sop: SopDetail) => {
    try {
      setDocxDownloading(true);
      const blob = await sopApi.downloadDocx(sop.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${toSafeFilename(sop.title)}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Word-Export fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setDocxDownloading(false);
    }
  };

  const editorCategory = normalizeSopCategory(editorForm.category);
  const detailCategory = detailSop
    ? normalizeSopCategory(detailSop.category)
    : null;
  const detailSections =
    detailCategory === "SOP"
      ? parseSopSections(detailSop?.contentMarkdown)
      : EMPTY_SOP_SECTIONS;

  return (
    <Layout title="SOPs & Dokumente">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            SOPs & Dokumente
          </h2>
          <p className="text-muted-foreground max-w-2xl">
            Freigegebene SOPs und Dokumente der Abteilung.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Dokumente durchsuchen..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-9"
                data-testid="input-search-sops"
              />
            </div>
            <Button onClick={openEditor}>
              <Plus className="w-4 h-4 mr-2" />
              Dokument vorschlagen
            </Button>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Button
                  key={category}
                  size="sm"
                  variant={
                    selectedCategory === category ? "default" : "outline"
                  }
                  onClick={() => setSelectedCategory(category)}
                  data-testid={`button-category-${category.toLowerCase()}`}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {loading && (
            <p className="text-sm text-muted-foreground">Lade Dokumente...</p>
          )}

          {!loading && filteredSops.length === 0 && (
            <Card className="border border-dashed">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Keine freigegebenen Dokumente gefunden.
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
                          Aktualisiert:{" "}
                          {formatDate(sop.publishedAt || sop.updatedAt) || "-"}
                        </p>
                      </div>
                      <Badge
                        className={
                          CATEGORY_STYLES[normalizeSopCategory(sop.category)] ||
                          "bg-slate-100 text-slate-700 border-slate-200"
                        }
                      >
                        {normalizeSopCategory(sop.category)}
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
                          <Badge variant="outline">
                            +{sop.keywords.length - 4}
                          </Badge>
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
            <DialogTitle>Dokument Details</DialogTitle>
          </DialogHeader>
          {detailLoading && (
            <p className="text-sm text-muted-foreground">Lade...</p>
          )}
          {!detailLoading && detailSop && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{detailSop.title}</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={
                      CATEGORY_STYLES[detailCategory || "SOP"] ||
                      "bg-slate-100 text-slate-700 border-slate-200"
                    }
                  >
                    {detailCategory || detailSop.category}
                  </Badge>
                  <Badge variant="outline">Version {detailSop.version}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadDocx(detailSop)}
                  disabled={docxDownloading}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Word
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHistoryOpen(true)}
                  disabled={
                    !detailSop.versions || detailSop.versions.length === 0
                  }
                >
                  <History className="w-4 h-4 mr-1" />
                  Historie
                </Button>
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

              {detailCategory === "SOP" ? (
                <div className="space-y-4">
                  {SOP_SECTION_DEFINITIONS.map((section, index) => {
                    const value = (detailSections[section.key] || "").trim();
                    return (
                      <div key={section.key} className="space-y-2">
                        <h4 className="text-sm font-semibold">
                          {index + 1}. {section.title}
                        </h4>
                        <MarkdownViewer
                          value={value || "Kein Inhalt hinterlegt."}
                          className="rounded-md border p-3 bg-white"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <MarkdownViewer
                  value={detailSop.contentMarkdown || "Kein Inhalt hinterlegt."}
                  className="rounded-md border p-3 bg-white"
                />
              )}

              <Separator />

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Referenzen</h4>
                {detailSop.references && detailSop.references.length > 0 ? (
                  <div className="space-y-2">
                    {sortReferences(
                      detailSop.references.filter(
                        (ref) => ref.status === "accepted",
                      ),
                    ).map((ref) => (
                      <div
                        key={ref.id}
                        className="border rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{ref.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {ref.publisher || "Unbekannt"}{" "}
                              {ref.yearOrVersion || ""}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {ref.type.toUpperCase()}
                          </Badge>
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
                  <p className="text-sm text-muted-foreground">
                    Keine Referenzen vorhanden.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Neues Dokument vorschlagen</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            <div>
              <label className="text-sm font-medium">Titel</label>
              <Input
                value={editorForm.title}
                onChange={(event) =>
                  setEditorForm({ ...editorForm, title: event.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Kategorie</label>
              <Select
                value={editorForm.category}
                onValueChange={handleEditorCategoryChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editorCategory === "SOP" ? (
              <div className="space-y-4">
                {SOP_SECTION_DEFINITIONS.map((section) => (
                  <div key={section.key}>
                    <label className="text-sm font-medium">
                      {section.title}
                    </label>
                    <MarkdownEditor
                      value={editorSections[section.key] || ""}
                      onChange={(value) =>
                        setEditorSections((prev) => ({
                          ...prev,
                          [section.key]: value,
                        }))
                      }
                      height={section.key === "content" ? 320 : 200}
                      className="border rounded-md"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium">Inhalt</label>
                <MarkdownEditor
                  value={editorForm.contentMarkdown}
                  onChange={(value) =>
                    setEditorForm({ ...editorForm, contentMarkdown: value })
                  }
                  height={360}
                  className="border rounded-md"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">
                Schlagwoerter (Komma getrennt)
              </label>
              <Input
                value={editorForm.keywords}
                onChange={(event) =>
                  setEditorForm({ ...editorForm, keywords: event.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">AWMF-Link</label>
              <Input
                value={editorForm.awmfLink}
                onChange={(event) =>
                  setEditorForm({ ...editorForm, awmfLink: event.target.value })
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreate} disabled={editorSaving}>
              {editorSaving ? "Speichere..." : "Vorschlagen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Dokument Historie</DialogTitle>
          </DialogHeader>
          {detailSop?.versions && detailSop.versions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Freigegeben am</TableHead>
                  <TableHead>Besitzer</TableHead>
                  <TableHead>Kommentar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailSop.versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell>{version.versionNumber}</TableCell>
                    <TableCell>{formatDate(version.releasedAt)}</TableCell>
                    <TableCell>
                      {formatEmployeeName(
                        version.releasedByName,
                        version.releasedByLastName,
                      )}
                    </TableCell>
                    <TableCell>{version.changeNote || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Keine Historie vorhanden.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
