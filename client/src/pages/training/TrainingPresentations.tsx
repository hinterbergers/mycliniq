import { useMemo, useState, useEffect, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, FileText } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { trainingApi } from "@/lib/api";
import type { TrainingPresentation } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Label } from "@/components/ui/label";
import { readAuthToken } from "@/lib/authToken";

type FilterTag = string | "all";

const withAuthToken = (url?: string | null) => {
  if (!url) return undefined;
  const token = readAuthToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
};

export default function TrainingPresentations() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTag, setActiveTag] = useState<FilterTag>("all");
  const [selectedPresentation, setSelectedPresentation] =
    useState<TrainingPresentation | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"interactive" | "pdf">("pdf");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadKeywords, setUploadKeywords] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { employee, isAdmin, isTechnicalAdmin } = useAuth();
  const canManageTraining = Boolean(
    isAdmin ||
      isTechnicalAdmin ||
      employee?.isAdmin ||
      employee?.systemRole === "system_admin" ||
      employee?.appRole === "Admin",
  );

  const { data: presentations = [], isLoading, error } = useQuery({
    queryKey: ["training", "presentations"],
    queryFn: () => trainingApi.getPresentations(),
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const tags = useMemo(() => {
    const set = new Set<string>();
    presentations.forEach((presentation) => {
      (presentation.keywords ?? []).forEach((keyword) => {
        const trimmed = keyword.trim();
        if (trimmed) {
          set.add(trimmed);
        }
      });
    });
    return Array.from(set).sort();
  }, [presentations]);

  const filteredPresentations = useMemo(() => {
    return presentations.filter((presentation) => {
      const matchesTitle =
        presentation.title.toLowerCase().includes(normalizedSearch);
      const matchesKeyword = (presentation.keywords ?? []).some((keyword) =>
        keyword.toLowerCase().includes(normalizedSearch),
      );
      const matchesSearch =
        !normalizedSearch || matchesTitle || matchesKeyword;
      const matchesTag =
        activeTag === "all" ||
        (presentation.keywords ?? []).some(
          (keyword) => keyword.trim() === activeTag,
        );
      return matchesSearch && matchesTag;
    });
  }, [presentations, normalizedSearch, activeTag]);

  const handleUploadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uploadFile) {
      setUploadError("Bitte eine Datei auswählen.");
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadError("Titel ist erforderlich.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("title", uploadTitle.trim());
      formData.append("keywords", uploadKeywords);
      formData.append("file", uploadFile);
      await trainingApi.uploadPresentation(formData);
      toast({
        title: "Hochgeladen",
        description: "Die Präsentation wurde gespeichert.",
      });
      setUploadDialogOpen(false);
      setUploadTitle("");
      setUploadKeywords("");
      setUploadFile(null);
      queryClient.invalidateQueries({
        queryKey: ["training", "presentations"],
      });
    } catch (error: any) {
      setUploadError(error?.message || "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  };

  const isPdf = Boolean(
    selectedPresentation?.mimeType
      ?.toLowerCase()
      .includes("pdf"),
  );
  const interactiveUrl =
    selectedPresentation?.interactiveStorageName
      ? `/api/training/presentations/${selectedPresentation.id}/interactive`
      : undefined;
  const interactiveAvailable = Boolean(interactiveUrl);
  const interactivePreviewUrl = withAuthToken(interactiveUrl);
  const pdfPreviewUrl = withAuthToken(selectedPresentation?.fileUrl);

  useEffect(() => {
    if (!selectedPresentation) return;
    setViewMode(interactiveAvailable ? "interactive" : "pdf");
  }, [interactiveAvailable, selectedPresentation?.id]);

  return (
    <Layout title="Fortbildung – PowerPoint / Vorträge">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <Input
              placeholder="Suche nach Titel oder Schlagwort"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTag("all")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  activeTag === "all"
                    ? "border-primary bg-primary text-white"
                    : "border-border text-muted-foreground hover:border-primary",
                )}
              >
                Alle
              </button>
              {tags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition",
                    activeTag === tag
                      ? "border-primary bg-primary text-white"
                      : "border-border text-muted-foreground hover:border-primary",
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          {canManageTraining && (
            <Button
              variant="outline"
              onClick={() => setUploadDialogOpen(true)}
              className="whitespace-nowrap"
            >
              Präsentation hochladen
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {filteredPresentations.length} Ergebnis
            {filteredPresentations.length !== 1 && "se"}
          </Badge>
          {!filteredPresentations.length && !isLoading && (
            <Badge variant="outline">Keine Präsentationen vorhanden</Badge>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">
            Präsentationen konnten nicht geladen werden.
          </p>
        )}

        <ScrollArea className="w-full">
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredPresentations.map((presentation) => (
              <Card key={presentation.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    {presentation.title}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {presentation.isActive ? "Aktiv" : "Inaktiv"} ·{" "}
                    {presentation.mimeType}
                  </CardDescription>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(presentation.keywords ?? []).map((keyword) => (
                      <Badge key={keyword} variant="secondary">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <Button onClick={() => setSelectedPresentation(presentation)}>
                    Ansicht öffnen
                  </Button>
                  <Button asChild variant="ghost">
                    <a
                      href={withAuthToken(presentation.fileUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="w-4 h-4" />
                      <span className="ml-2">Download</span>
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      <Dialog
        open={Boolean(selectedPresentation)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPresentation(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedPresentation?.title}</DialogTitle>
            <DialogDescription>
              {selectedPresentation?.mimeType}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap gap-2">
            {interactiveAvailable && (
              <Button
                size="sm"
                variant={viewMode === "interactive" ? "secondary" : "outline"}
                onClick={() => setViewMode("interactive")}
              >
                LibreOffice Ansicht
              </Button>
            )}
            {isPdf && (
              <Button
                size="sm"
                variant={viewMode === "pdf" ? "secondary" : "outline"}
                onClick={() => setViewMode("pdf")}
              >
                PDF-Ansicht
              </Button>
            )}
          </div>
          <div className="mt-4">
            {selectedPresentation ? (
              viewMode === "interactive" && interactiveAvailable ? (
                <div className="aspect-[16/9] overflow-hidden rounded-lg border border-border">
                  <iframe
                    src={interactivePreviewUrl}
                    title={`${selectedPresentation.title} – LibreOffice Ansicht`}
                    className="h-full w-full"
                  />
                </div>
              ) : selectedPresentation.fileUrl && isPdf ? (
                <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border">
                  <iframe
                    src={pdfPreviewUrl}
                    title={selectedPresentation.title}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Diese Datei kann inline nicht angezeigt werden. Bitte laden Sie
                  dafür eine PDF-Version hoch.
                </p>
              )
            ) : (
              <p className="mt-4 text-sm text-destructive">
                Die Datei konnte nicht geladen werden.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild>
              <a
                href={pdfPreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </a>
            </Button>
            {interactiveAvailable && interactivePreviewUrl && (
              <Button asChild variant="outline">
                <a
                  href={interactivePreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2"
                >
                  <span>LibreOffice Ansicht öffnen</span>
                </a>
              </Button>
            )}
            {selectedPresentation?.originalMimeType &&
              selectedPresentation.originalMimeType !== "application/pdf" && (
                <p className="text-xs text-muted-foreground">
                  Originaldatei: {selectedPresentation.originalMimeType}. Die
                  Ansicht basiert auf der konvertierten PDF-Datei.
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setUploadDialogOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Präsentation hochladen</DialogTitle>
            <DialogDescription>
              Akzeptierte Formate: PDF, PPT, PPTX. PPTX werden zu PDF
              konvertiert.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Titel eingeben"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Schlagworte (Komma getrennt)</Label>
              <Input
                value={uploadKeywords}
                onChange={(event) => setUploadKeywords(event.target.value)}
                placeholder="z.B. Schulung, SOP"
              />
            </div>
            <div className="space-y-2">
              <Label>Datei (PDF, PPT, PPTX)</Label>
              <Input
                type="file"
                accept=".pdf,.ppt,.pptx"
                onChange={(event) =>
                  setUploadFile(event.target.files?.[0] ?? null)
                }
                required
              />
            </div>
            {uploadError && (
              <p className="text-sm text-destructive">{uploadError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setUploadDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? "Hochladen…" : "Hochladen"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
