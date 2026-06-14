import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Employee, Sop } from "@shared/schema";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Printer,
  ExternalLink,
  FileText,
  History,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users2,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { MarkdownEditor, MarkdownViewer } from "@/components/editor/MarkdownEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { employeeApi, sopApi, type SopDetail } from "@/lib/api";

const KNOWLEDGE_USAGE_KEY = "cliniq_knowledge_usage";
const SOP_CATEGORIES = ["SOP", "Dienstanweisung", "Aufklärungen"] as const;
const CATEGORY_STYLES: Record<string, string> = {
  SOP: "bg-blue-100 text-blue-700 border-blue-200",
  Dienstanweisung: "bg-amber-100 text-amber-700 border-amber-200",
  Aufklärungen: "bg-emerald-100 text-emerald-700 border-emerald-200",
};
const STATUS_LABELS: Record<string, string> = {
  proposed: "Vorgeschlagen",
  in_progress: "In Bearbeitung",
  review: "Zur Freigabe",
  published: "Freigegeben",
  archived: "Archiviert",
};
const DEFAULT_WIKI_MARKDOWN = `## Einleitung

Beschreiben Sie hier kurz den Zweck und den Kontext der Seite.

## Inhalt

Schreiben Sie den Hauptinhalt hier. Bilder koennen mit \`![Alt-Text](https://...)\` und Tabellen direkt im Markdown eingebettet werden.

## Hinweise

- Verwenden Sie klare Zwischenueberschriften.
- Tabellen und Listen bleiben in der Wiki-Ansicht erhalten.
- Delegierte Bearbeiter koennen diese Seite direkt aktualisieren und zur Freigabe senden.
`;

const HISTORY_SECTION_HEADING = "## 6. Historie";
const RESPONSIBLE_SECTION_HEADING = "## Verantwortliche";

type ArticleActionDialog =
  | { kind: "publish"; title: string; description: string; confirmLabel: string }
  | { kind: "changes"; title: string; description: string; confirmLabel: string }
  | null;

const normalizeSopCategory = (
  value?: string | null,
): (typeof SOP_CATEGORIES)[number] => {
  if (!value) return "SOP";
  return SOP_CATEGORIES.includes(value as (typeof SOP_CATEGORIES)[number])
    ? (value as (typeof SOP_CATEGORIES)[number])
    : "SOP";
};

const normalizeSopStatus = (value?: string | null) => {
  const status = (value || "").toLowerCase();
  if (["entwurf", "draft", "proposed"].includes(status)) return "proposed";
  if (["in review", "review"].includes(status)) return "review";
  if (["freigegeben", "published"].includes(status)) return "published";
  if (["in bearbeitung", "in_progress"].includes(status)) return "in_progress";
  if (["archiviert", "archived"].includes(status)) return "archived";
  return status || "proposed";
};

const formatDate = (value?: string | Date | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "dd.MM.yyyy", { locale: de });
};

const formatEmployeeName = (name?: string | null, lastName?: string | null) => {
  if (name && lastName) return `${name} ${lastName}`;
  return name || lastName || "Unbekannt";
};

const extractExcerpt = (markdown?: string | null) => {
  const plain = (markdown || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 180) || "Noch kein Inhalt hinterlegt.";
};

const toSafeFilename = (value: string) => {
  const ascii = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 60) || "wiki";
};

const normalizeLineBreaks = (value?: string | null) => (value || "").replace(/\r\n/g, "\n");

const findMarkdownSection = (markdown: string, heading: string) => {
  const lines = normalizeLineBreaks(markdown).split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === heading.trim());
  if (startIndex === -1) return null;

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index].trim())) {
      endIndex = index;
      break;
    }
  }

  return { lines, startIndex, endIndex };
};

const extractMarkdownSectionLines = (markdown: string, heading: string) => {
  const section = findMarkdownSection(markdown, heading);
  if (!section) return [];

  return section.lines
    .slice(section.startIndex + 1, section.endIndex)
    .map((line) => line.trim())
    .filter(Boolean);
};

const upsertMarkdownSection = (
  markdown: string,
  heading: string,
  contentLines: string[],
) => {
  const normalized = normalizeLineBreaks(markdown).trimEnd();
  const block = [heading, "", ...contentLines.filter(Boolean)].join("\n");
  const section = findMarkdownSection(normalized, heading);

  if (!section) {
    return normalized ? `${normalized}\n\n${block}` : block;
  }

  const nextLines = [
    ...section.lines.slice(0, section.startIndex),
    ...block.split("\n"),
    ...section.lines.slice(section.endIndex),
  ];
  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n");
};

const parseKnowledgeLocation = (location: string) => {
  const queryIndex = location.indexOf("?");
  const search = queryIndex >= 0 ? location.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(search);
  const sopId = Number(params.get("sopId"));
  return {
    sopId: Number.isFinite(sopId) ? sopId : null,
    query: params.get("q") ?? "",
  };
};

const buildKnowledgeUrl = (options: { sopId?: number | null; query?: string }) => {
  const params = new URLSearchParams();
  if (options.query?.trim()) params.set("q", options.query.trim());
  if (options.sopId) params.set("sopId", String(options.sopId));
  const query = params.toString();
  return query ? `/wissen?${query}` : "/wissen";
};

export default function Guidelines() {
  const { toast } = useToast();
  const { employee, user, isAdmin, isTechnicalAdmin, can } = useAuth();
  const [location, setLocation] = useLocation();
  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSop, setDetailSop] = useState<SopDetail | null>(null);
  const [selectedSopId, setSelectedSopId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Alle");
  const [usageCounts, setUsageCounts] = useState<Record<number, number>>({});
  const [docxDownloading, setDocxDownloading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateSaving, setDelegateSaving] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [delegates, setDelegates] = useState<Record<number, "read" | "edit">>({});
  const [editingInline, setEditingInline] = useState(false);
  const [draftingNew, setDraftingNew] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [isHeroExpanded, setIsHeroExpanded] = useState(true);
  const [editorForm, setEditorForm] = useState({
    title: "",
    version: "1.0",
    category: "SOP",
    contentMarkdown: DEFAULT_WIKI_MARKDOWN,
    keywords: "",
    awmfLink: "",
  });
  const [actionDialog, setActionDialog] = useState<ArticleActionDialog>(null);
  const [actionNote, setActionNote] = useState("");

  const canManageKnowledge =
    isAdmin ||
    isTechnicalAdmin ||
    user?.appRole === "Editor" ||
    user?.appRole === "Admin" ||
    can("sop.manage") ||
    can("sop.publish");
  const canPublishKnowledge =
    isAdmin || isTechnicalAdmin || user?.appRole === "Admin" || can("sop.publish");

  const routeState = useMemo(() => {
    if (typeof window !== "undefined") {
      return parseKnowledgeLocation(
        `${window.location.pathname}${window.location.search}`,
      );
    }
    return parseKnowledgeLocation(location);
  }, [location]);
  const activeSopId = selectedSopId ?? routeState.sopId;

  useEffect(() => {
    setSearchTerm(routeState.query);
  }, [routeState.query]);

  useEffect(() => {
    setSelectedSopId(routeState.sopId);
  }, [routeState.sopId]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KNOWLEDGE_USAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, number>;
      const next: Record<number, number> = {};
      Object.entries(parsed).forEach(([key, value]) => {
        const numericKey = Number(key);
        if (Number.isFinite(numericKey) && typeof value === "number") {
          next[numericKey] = value;
        }
      });
      setUsageCounts(next);
    } catch {
      // ignore invalid local storage
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await sopApi.getAll();
        setSops(data.filter((entry) => normalizeSopStatus(entry.status) !== "archived"));
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Wissensseiten konnten nicht geladen werden.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [toast]);

  useEffect(() => {
    if (!activeSopId) {
      setDetailSop(null);
      setDetailLoading(false);
      setEditingInline(false);
      return;
    }
    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const detail = await sopApi.getById(activeSopId);
        setDetailSop(detail);
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Die Wissensseite konnte nicht geladen werden.",
          variant: "destructive",
        });
        setSelectedSopId(null);
        setLocation(buildKnowledgeUrl({ query: searchTerm }));
      } finally {
        setDetailLoading(false);
      }
    };
    void loadDetail();
  }, [activeSopId, searchTerm, setLocation, toast]);

  useEffect(() => {
    if (!detailSop?.id) return;
    setUsageCounts((current) => {
      const next = { ...current, [detailSop.id]: (current[detailSop.id] || 0) + 1 };
      try {
        window.localStorage.setItem(KNOWLEDGE_USAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, [detailSop?.id]);

  useEffect(() => {
    if (!delegateOpen || !canManageKnowledge || employees.length > 0) return;
    const loadEmployees = async () => {
      try {
        const data = await employeeApi.getAll();
        setEmployees(data);
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Mitarbeiter konnten nicht geladen werden.",
          variant: "destructive",
        });
      }
    };
    void loadEmployees();
  }, [canManageKnowledge, delegateOpen, employees.length, toast]);

  const availableCategories = useMemo(() => {
    const set = new Set(sops.map((entry) => normalizeSopCategory(entry.category)));
    const ordered = SOP_CATEGORIES.filter((entry) => set.has(entry));
    return ["Alle", ...ordered];
  }, [sops]);

  const filteredSops = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sops.filter((entry) => {
      const normalizedCategory = normalizeSopCategory(entry.category);
      const matchesCategory =
        selectedCategory === "Alle" || normalizedCategory === selectedCategory;
      const matchesSearch =
        !term ||
        entry.title.toLowerCase().includes(term) ||
        (entry.contentMarkdown || "").toLowerCase().includes(term) ||
        (entry.keywords || []).some((keyword) => keyword.toLowerCase().includes(term));
      return matchesCategory && matchesSearch;
    });
  }, [searchTerm, selectedCategory, sops]);

  const newestArticles = useMemo(
    () =>
      [...filteredSops]
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime(),
        )
        .slice(0, 6),
    [filteredSops],
  );

  const mostUsedArticles = useMemo(
    () =>
      [...filteredSops]
        .sort((a, b) => (usageCounts[b.id] || 0) - (usageCounts[a.id] || 0))
        .filter((entry) => (usageCounts[entry.id] || 0) > 0)
        .slice(0, 6),
    [filteredSops, usageCounts],
  );

  const sopArticles = useMemo(
    () => filteredSops.filter((entry) => normalizeSopCategory(entry.category) === "SOP"),
    [filteredSops],
  );
  const directiveArticles = useMemo(
    () =>
      filteredSops.filter(
        (entry) => normalizeSopCategory(entry.category) === "Dienstanweisung",
      ),
    [filteredSops],
  );
  const additionalArticles = useMemo(
    () =>
      filteredSops.filter(
        (entry) =>
          !["SOP", "Dienstanweisung"].includes(normalizeSopCategory(entry.category)),
      ),
    [filteredSops],
  );

  const currentStatus = normalizeSopStatus(detailSop?.status);
  const memberRole =
    detailSop?.members?.find((member) => member.employeeId === employee?.id)?.role || null;
  const isOwner = detailSop?.createdById === employee?.id;
  const canWriteArticle =
    Boolean(detailSop) &&
    (canManageKnowledge || isOwner || memberRole === "edit") &&
    currentStatus !== "published";
  const canSubmitForReview =
    Boolean(detailSop) &&
    (canManageKnowledge || isOwner || memberRole === "edit") &&
    ["in_progress", "proposed"].includes(currentStatus);
  const canAcceptProposal = Boolean(detailSop) && canManageKnowledge && currentStatus === "proposed";
  const canAskForChanges = Boolean(detailSop) && canManageKnowledge && currentStatus === "review";
  const canPublishArticle = Boolean(detailSop) && canPublishKnowledge && currentStatus === "review";
  const canStartRevision = Boolean(detailSop) && canManageKnowledge && currentStatus === "published";

  const applyArticleToEditor = (article?: Pick<
    Sop,
    "title" | "version" | "category" | "contentMarkdown" | "keywords" | "awmfLink"
  > | null) => {
    setEditorForm({
      title: article?.title || "",
      version: article?.version || "1.0",
      category: normalizeSopCategory(article?.category),
      contentMarkdown: article?.contentMarkdown || DEFAULT_WIKI_MARKDOWN,
      keywords: (article?.keywords || []).join(", "),
      awmfLink: article?.awmfLink || "",
    });
  };

  const startNewArticle = (category: (typeof SOP_CATEGORIES)[number]) => {
    applyArticleToEditor({
      title: "",
      version: "1.0",
      category: normalizeSopCategory(category),
      contentMarkdown: DEFAULT_WIKI_MARKDOWN,
      keywords: [],
      awmfLink: null,
    });
    setDraftingNew(true);
    setEditingInline(false);
    setSelectedSopId(null);
    setLocation(buildKnowledgeUrl({ query: searchTerm }));
  };

  const startInlineEditing = () => {
    if (!detailSop) return;
    applyArticleToEditor(detailSop);
    setEditingInline(true);
    setDraftingNew(false);
  };

  const stopEditing = () => {
    setEditingInline(false);
    setDraftingNew(false);
    if (detailSop) applyArticleToEditor(detailSop);
  };

  const refreshListAndDetail = async (sopId?: number | null) => {
    const [nextSops, nextDetail] = await Promise.all([
      sopApi.getAll(),
      sopId ? sopApi.getById(sopId) : Promise.resolve(null),
    ]);
    setSops(nextSops.filter((entry) => normalizeSopStatus(entry.status) !== "archived"));
    setDetailSop(nextDetail);
  };

  const saveArticle = async () => {
    if (!editorForm.title.trim()) {
      toast({
        title: "Fehler",
        description: "Titel ist erforderlich.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      title: editorForm.title.trim(),
      version: editorForm.version.trim() || "1.0",
      category: normalizeSopCategory(editorForm.category) as Sop["category"],
      contentMarkdown: editorForm.contentMarkdown.trim() || null,
      keywords: editorForm.keywords
        ? editorForm.keywords
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [],
      awmfLink: editorForm.awmfLink.trim() || null,
    };

    setEditorSaving(true);
    try {
      if (draftingNew) {
        if (!employee?.id) throw new Error("Kein Benutzerkontext vorhanden.");
        const created = await sopApi.create({
          ...payload,
          createdById: employee.id,
          status: canManageKnowledge ? "in_progress" : "proposed",
        });
        await refreshListAndDetail(created.id);
        setSelectedSopId(created.id);
        setLocation(buildKnowledgeUrl({ sopId: created.id, query: searchTerm }));
      } else if (detailSop) {
        await sopApi.update(detailSop.id, payload);
        await refreshListAndDetail(detailSop.id);
      }
      setDraftingNew(false);
      setEditingInline(false);
      toast({
        title: "Gespeichert",
        description: draftingNew
          ? "Die neue Wissensseite wurde angelegt."
          : "Die Wissensseite wurde aktualisiert.",
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error?.message || "Die Wissensseite konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setEditorSaving(false);
    }
  };

  const openDelegateDialog = () => {
    if (!detailSop) return;
    const nextDelegates: Record<number, "read" | "edit"> = {};
    (detailSop.members || []).forEach((member) => {
      nextDelegates[member.employeeId] = member.role;
    });
    setDelegates(nextDelegates);
    setDelegateOpen(true);
  };

  const saveDelegates = async () => {
    if (!detailSop) return;
    setDelegateSaving(true);
    try {
      const members = Object.entries(delegates).map(([employeeId, role]) => ({
        employeeId: Number(employeeId),
        role,
      }));
      await sopApi.assign(detailSop.id, members);
      await refreshListAndDetail(detailSop.id);
      setDelegateOpen(false);
      toast({
        title: "Delegation gespeichert",
        description:
          "Bearbeiter koennen die Seite jetzt direkt aktualisieren und zur Freigabe senden.",
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error?.message || "Die Delegation konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setDelegateSaving(false);
    }
  };

  const requestReview = async () => {
    if (!detailSop) return;
    try {
      await sopApi.requestReview(detailSop.id);
      await refreshListAndDetail(detailSop.id);
      toast({
        title: "Zur Freigabe gesendet",
        description: "Die Seite wurde an die Redaktion zur Freigabe uebergeben.",
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error?.message || "Die Seite konnte nicht zur Freigabe gesendet werden.",
        variant: "destructive",
      });
    }
  };

  const confirmAction = async () => {
    if (!detailSop || !actionDialog) return;
    if (!actionNote.trim()) {
      toast({
        title: "Fehler",
        description: "Ein Kommentar ist erforderlich.",
        variant: "destructive",
      });
      return;
    }
    try {
      if (actionDialog.kind === "publish") {
        await sopApi.publish(detailSop.id, actionNote.trim());
      } else {
        await sopApi.requestChanges(detailSop.id, actionNote.trim());
      }
      await refreshListAndDetail(detailSop.id);
      setActionDialog(null);
      setActionNote("");
      toast({ title: "Aktion ausgefuehrt" });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error?.message || "Die Aktion konnte nicht ausgefuehrt werden.",
        variant: "destructive",
      });
    }
  };

  const acceptProposal = async () => {
    if (!detailSop) return;
    try {
      await sopApi.accept(detailSop.id);
      await refreshListAndDetail(detailSop.id);
      toast({ title: "Seite angenommen" });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error?.message || "Die Seite konnte nicht angenommen werden.",
        variant: "destructive",
      });
    }
  };

  const startRevision = async () => {
    if (!detailSop) return;
    try {
      await sopApi.startRevision(detailSop.id);
      await refreshListAndDetail(detailSop.id);
      toast({
        title: "Revision gestartet",
        description: "Die Seite ist jetzt wieder direkt bearbeitbar.",
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error?.message || "Die Revision konnte nicht gestartet werden.",
        variant: "destructive",
      });
    }
  };

  const downloadDocx = async () => {
    if (!detailSop) return;
    setDocxDownloading(true);
    try {
      const blob = await sopApi.downloadDocx(detailSop.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${toSafeFilename(detailSop.title)}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error?.message || "Der Word-Export ist fehlgeschlagen.",
        variant: "destructive",
      });
    } finally {
      setDocxDownloading(false);
    }
  };

  const printArticle = () => {
    if (typeof window === "undefined") return;
    window.print();
  };

  const renderKnowledgeCard = (entry: Sop) => {
    const category = normalizeSopCategory(entry.category);
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => {
          setSelectedSopId(entry.id);
          setLocation(buildKnowledgeUrl({ sopId: entry.id, query: searchTerm }));
          if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
        className="w-full text-left"
      >
        <Card className="h-full border-border/70 transition-all hover:-translate-y-0.5 hover:shadow-lg">
          <CardHeader className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <Badge
                className={
                  CATEGORY_STYLES[category] || "bg-slate-100 text-slate-700 border-slate-200"
                }
              >
                {category}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDate(entry.updatedAt || entry.createdAt)}
              </span>
            </div>
            <div className="space-y-2">
              <CardTitle className="line-clamp-4 break-words text-lg leading-snug text-primary">
                {entry.title}
              </CardTitle>
              <CardDescription className="line-clamp-3">
                {extractExcerpt(entry.contentMarkdown)}
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </button>
    );
  };

  const historyEntries = useMemo(
    () => extractMarkdownSectionLines(editorForm.contentMarkdown, HISTORY_SECTION_HEADING),
    [editorForm.contentMarkdown],
  );

  const responsibleEntries = useMemo(
    () =>
      extractMarkdownSectionLines(editorForm.contentMarkdown, RESPONSIBLE_SECTION_HEADING).map(
        (line) => line.replace(/^[-*]\s*/, ""),
      ),
    [editorForm.contentMarkdown],
  );

  const responsibleUserOptions = useMemo(
    () =>
      employees
        .map((entry) => ({
          value: formatEmployeeName(entry.name, entry.lastName),
          label: `${formatEmployeeName(entry.name, entry.lastName)}${
            entry.role ? ` (${entry.role})` : ""
          }`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "de")),
    [employees],
  );

  const setHistoryEntries = (entries: string[]) => {
    setEditorForm((current) => ({
      ...current,
      contentMarkdown: upsertMarkdownSection(
        current.contentMarkdown,
        HISTORY_SECTION_HEADING,
        entries,
      ),
    }));
  };

  const setResponsibleEntries = (entries: string[]) => {
    setEditorForm((current) => ({
      ...current,
      contentMarkdown: upsertMarkdownSection(
        current.contentMarkdown,
        RESPONSIBLE_SECTION_HEADING,
        entries.map((entry) => `- ${entry}`),
      ),
    }));
  };

  const importResponsibleUsers = () => {
    const names = [
      detailSop?.createdBy
        ? `${formatEmployeeName(detailSop.createdBy.name, detailSop.createdBy.lastName)} (Autor)`
        : null,
      ...((detailSop?.members || []).map((member) => {
        const roleLabel = member.role === "edit" ? "Bearbeitung" : "Lesen";
        return `${formatEmployeeName(member.name, member.lastName)} (${roleLabel})`;
      }) || []),
    ].filter((entry): entry is string => Boolean(entry));

    if (names.length) {
      setResponsibleEntries(names);
    }
  };

  const renderArticleEditor = () => (
    <Card className="border-primary/20 shadow-lg">
      <CardHeader className="space-y-2">
        <CardTitle>{draftingNew ? "Neue Wiki-Seite" : "Seite bearbeiten"}</CardTitle>
        <CardDescription>
          Bilder koennen per Markdown eingefuegt werden: <code>![Alt](https://...)</code>.
          Tabellen und Listen bleiben in der Vorschau erhalten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Titel</label>
            <Input
              value={editorForm.title}
              onChange={(event) =>
                setEditorForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Version</label>
            <Input
              value={editorForm.version}
              onChange={(event) =>
                setEditorForm((current) => ({ ...current, version: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Kategorie</label>
            <Select
              value={editorForm.category}
              onValueChange={(value) =>
                setEditorForm((current) => ({ ...current, category: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Kategorie waehlen" />
              </SelectTrigger>
              <SelectContent>
                {SOP_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">AWMF-Link</label>
            <Input
              value={editorForm.awmfLink}
              onChange={(event) =>
                setEditorForm((current) => ({ ...current, awmfLink: event.target.value }))
              }
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Schlagwoerter</label>
          <Input
            value={editorForm.keywords}
            onChange={(event) =>
              setEditorForm((current) => ({ ...current, keywords: event.target.value }))
            }
            placeholder="z.B. Geburtshilfe, Hypertonie, Notfall"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Inhalt</label>
          <MarkdownEditor
            value={editorForm.contentMarkdown}
            onChange={(value) =>
              setEditorForm((current) => ({ ...current, contentMarkdown: value }))
            }
            height={560}
            className="rounded-xl border bg-white"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3 rounded-xl border bg-slate-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-primary">Versionsverlauf</h3>
                <p className="text-xs text-muted-foreground">
                  Neue Zeilen koennen direkt ergänzt werden, um alte Versionen zu erwähnen.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setHistoryEntries([...(historyEntries.length ? historyEntries : []), ""])}
              >
                Zeile hinzufügen
              </Button>
            </div>
            <div className="space-y-2">
              {(historyEntries.length ? historyEntries : [""]).map((entry, index) => (
                <div key={`history-${index}`} className="flex items-start gap-2">
                  <Input
                    value={entry}
                    onChange={(event) => {
                      const next = (historyEntries.length ? [...historyEntries] : [""]);
                      next[index] = event.target.value;
                      setHistoryEntries(next);
                    }}
                    placeholder="z.B. 4.0 Dokument aktualisiert durch ..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = (historyEntries.length ? [...historyEntries] : [""]).filter(
                        (_item, itemIndex) => itemIndex !== index,
                      );
                      setHistoryEntries(next);
                    }}
                  >
                    Entfernen
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-slate-50/80 p-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-primary">Verantwortliche</h3>
              <p className="text-xs text-muted-foreground">
                Kleiner Block mit zuständigen Personen für diese Seite.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={importResponsibleUsers}
              >
                Aus Delegation übernehmen
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setResponsibleEntries([
                    ...(responsibleEntries.length ? responsibleEntries : []),
                    "",
                  ])
                }
              >
                Person hinzufügen
              </Button>
            </div>
            <div className="space-y-2">
              {(responsibleEntries.length ? responsibleEntries : [""]).map((entry, index) => (
                <div key={`responsible-${index}`} className="flex items-start gap-2">
                  <Select
                    value={entry}
                    onValueChange={(value) => {
                      const next = responsibleEntries.length
                        ? [...responsibleEntries]
                        : [""];
                      next[index] = value;
                      setResponsibleEntries(next);
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Verantwortliche Person auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {responsibleUserOptions.map((option) => (
                        <SelectItem key={`${option.value}-${index}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = (responsibleEntries.length
                        ? [...responsibleEntries]
                        : [""]).filter((_item, itemIndex) => itemIndex !== index);
                      setResponsibleEntries(next);
                    }}
                  >
                    Entfernen
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border bg-slate-50/80 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            Vorschau
          </div>
          <MarkdownViewer
            value={editorForm.contentMarkdown}
            className="rounded-xl border bg-white p-5"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={stopEditing}>
            Abbrechen
          </Button>
          <Button onClick={saveArticle} disabled={editorSaving}>
            {editorSaving ? "Speichere..." : draftingNew ? "Seite anlegen" : "Aenderungen speichern"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Layout title={detailSop?.title || "Wissensbasis"}>
      <div className="mx-auto max-w-7xl space-y-8">
        {activeSopId ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                className="gap-2 px-0 text-muted-foreground hover:text-primary"
                onClick={() => {
                  setSelectedSopId(null);
                  setLocation(buildKnowledgeUrl({ query: searchTerm }));
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Zurueck zur Wissensbasis
              </Button>
              <div className="flex flex-wrap gap-2">
                {canAcceptProposal && <Button onClick={acceptProposal}>Annehmen</Button>}
                {!editingInline && canWriteArticle && (
                  <Button variant="outline" onClick={startInlineEditing}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Bearbeiten
                  </Button>
                )}
                {!editingInline && detailSop && (
                  <Button variant="outline" onClick={printArticle}>
                    <Printer className="mr-2 h-4 w-4" />
                    Drucken
                  </Button>
                )}
                {canManageKnowledge && detailSop && (
                  <Button variant="outline" onClick={openDelegateDialog}>
                    <Users2 className="mr-2 h-4 w-4" />
                    Delegieren
                  </Button>
                )}
                {canSubmitForReview && detailSop && (
                  <Button variant="outline" onClick={requestReview}>
                    <Send className="mr-2 h-4 w-4" />
                    Zur Freigabe senden
                  </Button>
                )}
                {canPublishArticle && (
                  <Button
                    onClick={() =>
                      setActionDialog({
                        kind: "publish",
                        title: "Seite freigeben",
                        description:
                          "Die Freigabenotiz erscheint in der Versionshistorie der Wissensseite.",
                        confirmLabel: "Freigeben",
                      })
                    }
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Freigeben
                  </Button>
                )}
                {canAskForChanges && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setActionDialog({
                        kind: "changes",
                        title: "Aenderungen anfordern",
                        description:
                          "Der Kommentar wird an die verantwortlichen Bearbeiter gesendet.",
                        confirmLabel: "Zuruecksenden",
                      })
                    }
                  >
                    Aenderungen anfordern
                  </Button>
                )}
                {canStartRevision && <Button variant="outline" onClick={startRevision}>Revision starten</Button>}
                <Button variant="outline" onClick={downloadDocx} disabled={docxDownloading}>
                  <Download className="mr-2 h-4 w-4" />
                  Word
                </Button>
              </div>
            </div>

            {detailLoading && (
              <Card>
                <CardContent className="p-10 text-sm text-muted-foreground">
                  Wissensseite wird geladen...
                </CardContent>
              </Card>
            )}

            {!detailLoading && detailSop && (
              <div className="space-y-6">
                {editingInline ? (
                  renderArticleEditor()
                ) : (
                  <Card className="overflow-hidden border-border/70 shadow-lg">
                    <CardHeader className="space-y-4 bg-gradient-to-br from-white via-white to-blue-50/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={
                            CATEGORY_STYLES[normalizeSopCategory(detailSop.category)] ||
                            "bg-slate-100 text-slate-700 border-slate-200"
                          }
                        >
                          {normalizeSopCategory(detailSop.category)}
                        </Badge>
                        <Badge variant="outline">{STATUS_LABELS[currentStatus] || currentStatus}</Badge>
                        <Badge variant="outline">Version {detailSop.version}</Badge>
                      </div>
                      <div className="space-y-3">
                        <h1 className="font-serif text-4xl leading-tight text-primary">
                          {detailSop.title}
                        </h1>
                        <p className="max-w-4xl text-base text-muted-foreground">
                          {extractExcerpt(detailSop.contentMarkdown)}
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6 p-6 lg:p-8">
                      <MarkdownViewer
                        value={detailSop.contentMarkdown || "_Noch kein Inhalt hinterlegt._"}
                        className="rounded-2xl border bg-white p-6 lg:p-8"
                      />

                      {detailSop.awmfLink && (
                        <a
                          href={detailSop.awmfLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Externe Leitlinie
                        </a>
                      )}
                    </CardContent>
                  </Card>
                )}

                {!editingInline && (
                  <div className="grid gap-4 xl:grid-cols-3">
                  <Card className="border-border/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <BookOpen className="h-4 w-4" />
                        Seiteninfo
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">Erstellt von</span>
                        <span className="text-right">
                          {formatEmployeeName(
                            detailSop.createdBy?.name,
                            detailSop.createdBy?.lastName,
                          )}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">Aktualisiert</span>
                        <span>{formatDate(detailSop.updatedAt)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">Nutzung</span>
                        <span>{usageCounts[detailSop.id] || 0} Aufrufe</span>
                      </div>
                      {(detailSop.keywords || []).length > 0 && (
                        <div className="space-y-2">
                          <span className="text-muted-foreground">Schlagwoerter</span>
                          <div className="flex flex-wrap gap-2">
                            {(detailSop.keywords || []).map((keyword) => (
                              <Badge key={keyword} variant="secondary">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/70">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Users2 className="h-4 w-4" />
                        Redaktion
                      </CardTitle>
                      <CardDescription>
                        Delegierte Bearbeiter koennen direkt auf der Seite schreiben.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(detailSop.members || []).length > 0 ? (
                        (detailSop.members || []).map((member) => (
                          <div
                            key={member.employeeId}
                            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                          >
                            <span>{formatEmployeeName(member.name, member.lastName)}</span>
                            <Badge variant={member.role === "edit" ? "default" : "outline"}>
                              {member.role === "edit" ? "Bearbeiten" : "Lesen"}
                            </Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Noch keine delegierten Bearbeiter hinterlegt.
                        </p>
                      )}
                      </CardContent>
                    </Card>

                    <Card className="border-border/70">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Clock3 className="h-4 w-4" />
                          Versionshistorie
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(detailSop.versions || []).slice(0, 3).map((version) => (
                          <div key={version.id} className="rounded-lg border px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">Version {version.versionNumber}</span>
                              <span className="text-muted-foreground">
                                {formatDate(version.releasedAt)}
                              </span>
                            </div>
                            <p className="mt-1 text-muted-foreground">
                              {version.changeNote || "Keine Freigabenotiz"}
                            </p>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setHistoryOpen(true)}
                          disabled={!detailSop.versions?.length}
                        >
                          <History className="mr-2 h-4 w-4" />
                          Ganze Historie
                        </Button>
                      </CardContent>
                    </Card>

                    {(detailSop.references || []).length > 0 && (
                      <Card className="border-border/70">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <FileText className="h-4 w-4" />
                            Referenzen
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(detailSop.references || [])
                            .filter((reference) => reference.status === "accepted")
                            .slice(0, 5)
                            .map((reference) => (
                              <div key={reference.id} className="rounded-lg border px-3 py-2 text-sm">
                                <div className="font-medium">{reference.title}</div>
                                <div className="text-muted-foreground">
                                  {reference.publisher || "Unbekannt"} {reference.yearOrVersion || ""}
                                </div>
                              </div>
                            ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <Card className="overflow-hidden border-none bg-gradient-to-br from-slate-950 via-[#113f72] to-[#0f5ba7] text-white shadow-xl">
              <CardContent className="p-8 lg:p-10">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <Badge className="w-fit border-white/20 bg-white/10 text-white">
                        Wissensbasis
                      </Badge>
                      <h1 className="max-w-3xl text-xl font-bold leading-tight text-white">
                        SOPs und Dienstanweisungen wie eine interne Wiki-Bibliothek.
                      </h1>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                      onClick={() => setIsHeroExpanded((value) => !value)}
                      aria-expanded={isHeroExpanded}
                      aria-label={isHeroExpanded ? "Hero einklappen" : "Hero erweitern"}
                    >
                      <ChevronDown
                        className={`h-5 w-5 transition-transform duration-200 ${
                          isHeroExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                  </div>

                  {isHeroExpanded && (
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_360px]">
                      <div className="space-y-5">
                        <p className="max-w-xl text-sm text-primary-foreground/80">
                          Die Startseite fokussiert auf haeufig genutzte und neue Seiten.
                          Einzelne Eintraege oeffnen als eigenstaendige Wissensseiten mit
                          direkter Inline-Bearbeitung fuer die Redaktion.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {canManageKnowledge && (
                            <>
                              <Button onClick={() => startNewArticle("SOP")}>
                                <Plus className="mr-2 h-4 w-4" />
                                Neue SOP
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => startNewArticle("Dienstanweisung")}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Neue Dienstanweisung
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
                        <div className="relative">
                          <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/50" />
                          <Input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Wissensseite durchsuchen..."
                            className="border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/50"
                          />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {availableCategories.map((category) => (
                            <Button
                              key={category}
                              size="sm"
                              variant={
                                selectedCategory === category ? "secondary" : "outline"
                              }
                              className={
                                selectedCategory === category
                                  ? ""
                                  : "border-white/20 text-white"
                              }
                              onClick={() => setSelectedCategory(category)}
                            >
                              {category}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {draftingNew && renderArticleEditor()}

            {loading ? (
              <Card>
                <CardContent className="p-8 text-sm text-muted-foreground">
                  Wissensbasis wird geladen...
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-8">
                <div className="grid gap-6 xl:grid-cols-2">
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-semibold text-primary">Haeufig genutzt</h2>
                        <p className="text-sm text-muted-foreground">
                          Oeffnungen werden lokal gezaehlt und priorisiert angezeigt.
                        </p>
                      </div>
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    {mostUsedArticles.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {mostUsedArticles.map(renderKnowledgeCard)}
                      </div>
                    ) : (
                      <Card>
                        <CardContent className="p-6 text-sm text-muted-foreground">
                          Noch keine haeufig genutzten Seiten. Oeffnen Sie eine Seite, um
                          hier Schnellzugriffe aufzubauen.
                        </CardContent>
                      </Card>
                    )}
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-semibold text-primary">Neueste</h2>
                        <p className="text-sm text-muted-foreground">
                          Zuletzt aktualisierte Seiten der Wissensbasis.
                        </p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {newestArticles.map(renderKnowledgeCard)}
                    </div>
                  </section>
                </div>

                <Separator />

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-primary">SOPs</h2>
                      <p className="text-sm text-muted-foreground">
                        Klinische Standards und strukturierte Handlungsleitfaeden.
                      </p>
                    </div>
                    <Badge variant="outline">{sopArticles.length}</Badge>
                  </div>
                  {sopArticles.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {sopArticles.map(renderKnowledgeCard)}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="p-6 text-sm text-muted-foreground">
                        Keine SOPs fuer die aktuelle Suche gefunden.
                      </CardContent>
                    </Card>
                  )}
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-primary">
                        Dienstanweisungen
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Interne Richtlinien und organisatorische Vorgaben.
                      </p>
                    </div>
                    <Badge variant="outline">{directiveArticles.length}</Badge>
                  </div>
                  {directiveArticles.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {directiveArticles.map(renderKnowledgeCard)}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="p-6 text-sm text-muted-foreground">
                        Keine Dienstanweisungen fuer die aktuelle Suche gefunden.
                      </CardContent>
                    </Card>
                  )}
                </section>

                {additionalArticles.length > 0 && (
                  <section className="space-y-4">
                    <div>
                      <h2 className="text-2xl font-semibold text-primary">Weitere Seiten</h2>
                      <p className="text-sm text-muted-foreground">
                        Sonstige Wissenseintraege ausserhalb der beiden Hauptgruppen.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {additionalArticles.map(renderKnowledgeCard)}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Versionshistorie</DialogTitle>
            <DialogDescription>
              Freigegebene Versionen der aktuellen Wissensseite.
            </DialogDescription>
          </DialogHeader>
          {detailSop?.versions?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Freigegeben am</TableHead>
                  <TableHead>Freigegeben von</TableHead>
                  <TableHead>Notiz</TableHead>
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
            <p className="text-sm text-muted-foreground">Keine Versionen vorhanden.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={delegateOpen} onOpenChange={setDelegateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bearbeitung delegieren</DialogTitle>
            <DialogDescription>
              Delegierte Bearbeiter koennen die Seite direkt aktualisieren. Mit
              "Bearbeiten" koennen sie die Seite auch zur Freigabe senden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {employees.map((entry) => {
              const checked = Boolean(delegates[entry.id]);
              return (
                <div
                  key={entry.id}
                  className="grid gap-3 rounded-xl border px-4 py-3 md:grid-cols-[1fr_180px]"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        setDelegates((current) => {
                          const updated = { ...current };
                          if (next) {
                            updated[entry.id] = updated[entry.id] || "edit";
                          } else {
                            delete updated[entry.id];
                          }
                          return updated;
                        });
                      }}
                    />
                    <div>
                      <div className="font-medium">
                        {formatEmployeeName(entry.name, entry.lastName)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.role || "Mitarbeiter"}
                      </div>
                    </div>
                  </div>
                  <Select
                    value={delegates[entry.id] || "edit"}
                    disabled={!checked}
                    onValueChange={(value) =>
                      setDelegates((current) => ({
                        ...current,
                        [entry.id]: value as "read" | "edit",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Rolle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">Lesen</SelectItem>
                      <SelectItem value="edit">Bearbeiten</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelegateOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={saveDelegates} disabled={delegateSaving}>
              {delegateSaving ? "Speichere..." : "Delegation speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(actionDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog(null);
            setActionNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{actionDialog?.title}</DialogTitle>
            <DialogDescription>{actionDialog?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Kommentar</label>
            <Textarea
              value={actionNote}
              onChange={(event) => setActionNote(event.target.value)}
              placeholder="Kommentar eingeben..."
              rows={5}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog(null);
                setActionNote("");
              }}
            >
              Abbrechen
            </Button>
            <Button onClick={confirmAction}>{actionDialog?.confirmLabel || "Bestaetigen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
