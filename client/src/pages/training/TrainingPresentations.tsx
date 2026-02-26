import { useMemo, useState, useEffect, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
type PresentationViewMode = "mp4" | "interactive" | "pdf" | "download";
type PresentationStatus = "konvertiert" | "nicht_konvertierbar" | "nur_download";

const withAuthToken = (url?: string | null) => {
  if (!url) return undefined;
  const token = readAuthToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
};

const getNormalizedMime = (value?: string | null) => (value ?? "").toLowerCase();

const isPdfMime = (value?: string | null) => getNormalizedMime(value).includes("pdf");

const isMp4Mime = (value?: string | null) => {
  const mime = getNormalizedMime(value);
  return mime.includes("video/mp4") || mime.includes("application/mp4");
};

const isPowerPointMime = (value?: string | null) => {
  const mime = getNormalizedMime(value);
  return mime.includes("powerpoint") || mime.includes("presentationml");
};

function getPresentationMeta(presentation: TrainingPresentation | null) {
  const fileUrl = presentation?.fileUrl ?? null;
  const hasMp4 = Boolean(fileUrl && isMp4Mime(presentation?.mimeType));
  const hasInteractive = Boolean(presentation?.interactiveStorageName);
  const hasPdf = Boolean(fileUrl && isPdfMime(presentation?.mimeType));
  const canInline = hasMp4 || hasInteractive || hasPdf;
  const sourceIsPpt = Boolean(
    isPowerPointMime(presentation?.originalMimeType) ||
      (!presentation?.originalMimeType && isPowerPointMime(presentation?.mimeType)),
  );

  let status: PresentationStatus = "nur_download";
  if (sourceIsPpt && canInline) status = "konvertiert";
  else if (sourceIsPpt && !canInline) status = "nicht_konvertierbar";
  else if (canInline) status = "konvertiert";

  const preferredView: PresentationViewMode = hasMp4
    ? "mp4"
    : hasInteractive
      ? "interactive"
      : hasPdf
        ? "pdf"
        : "download";

  return {
    fileUrl,
    hasMp4,
    hasInteractive,
    hasPdf,
    canInline,
    sourceIsPpt,
    status,
    preferredView,
  };
}

function getStatusBadgeVariant(status: PresentationStatus): "secondary" | "destructive" | "outline" {
  if (status === "nicht_konvertierbar") return "destructive";
  if (status === "nur_download") return "outline";
  return "secondary";
}

function getStatusLabel(status: PresentationStatus): string {
  if (status === "konvertiert") return "Konvertiert";
  if (status === "nicht_konvertierbar") return "Nicht konvertierbar";
  return "Nur Download";
}

export default function TrainingPresentations() {
  const [searchTerm, setSearchTerm] = useState("");
  const [location] = useLocation();
  const [activeTag, setActiveTag] = useState<FilterTag>("all");
  const [selectedPresentation, setSelectedPresentation] =
    useState<TrainingPresentation | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<PresentationViewMode>("download");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadKeywords, setUploadKeywords] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TrainingPresentation | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingPresentation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { employee, isAdmin, isTechnicalAdmin } = useAuth();
  const canManageTraining = Boolean(
    isAdmin ||
      isTechnicalAdmin ||
      employee?.isAdmin ||
      employee?.systemRole === "system_admin" ||
      employee?.appRole === "Admin" ||
      employee?.appRole === "Editor",
  );

  const { data: presentations = [], isLoading, error } = useQuery({
    queryKey: ["training", "presentations"],
    queryFn: () => trainingApi.getPresentations(),
  });

  useEffect(() => {
    const queryIndex = location.indexOf("?");
    const search = queryIndex >= 0 ? location.slice(queryIndex) : "";
    const params = new URLSearchParams(search);
    const nextQ = params.get("q") ?? "";
    setSearchTerm((prev) => (prev === nextQ ? prev : nextQ));
  }, [location]);

  useEffect(() => {
    if (!presentations.length) return;
    const queryIndex = location.indexOf("?");
    const search = queryIndex >= 0 ? location.slice(queryIndex) : "";
    const params = new URLSearchParams(search);
    const presentationId = Number(params.get("presentationId"));
    if (!Number.isFinite(presentationId)) return;
    const target = presentations.find(
      (presentation) => presentation.id === presentationId,
    );
    if (target) {
      setSelectedPresentation(target);
    }
  }, [location, presentations]);

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

  const openEditDialog = (presentation: TrainingPresentation) => {
    setEditTarget(presentation);
    setEditTitle(presentation.title ?? "");
    setEditKeywords((presentation.keywords ?? []).join(", "));
    setEditError(null);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) return;
    const title = editTitle.trim();
    if (!title) {
      setEditError("Titel ist erforderlich.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const keywords = editKeywords
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const updated = await trainingApi.updatePresentation(editTarget.id, {
        title,
        keywords,
      });
      queryClient.invalidateQueries({ queryKey: ["training", "presentations"] });
      setSelectedPresentation((prev) => (prev?.id === updated.id ? updated : prev));
      setEditDialogOpen(false);
      setEditTarget(null);
      toast({
        title: "Aktualisiert",
        description: "Die Präsentation wurde gespeichert.",
      });
    } catch (error: any) {
      setEditError(error?.message || "Bearbeiten fehlgeschlagen.");
    } finally {
      setEditSaving(false);
    }
  };

  const requestDeletePresentation = (presentation: TrainingPresentation) => {
    setDeleteTarget(presentation);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const deletedId = deleteTarget.id;
      await trainingApi.deletePresentation(deletedId);
      queryClient.invalidateQueries({ queryKey: ["training", "presentations"] });
      setSelectedPresentation((prev) => (prev?.id === deletedId ? null : prev));
      setDeleteTarget(null);
      toast({
        title: "Gelöscht",
        description: "Die Präsentation wurde gelöscht.",
      });
    } catch (error: any) {
      setDeleteError(error?.message || "Löschen fehlgeschlagen.");
    } finally {
      setDeleting(false);
    }
  };

  const selectedMeta = getPresentationMeta(selectedPresentation);
  const interactiveUrl =
    selectedPresentation?.interactiveStorageName
      ? `/api/training/presentations/${selectedPresentation.id}/interactive`
      : undefined;
  const interactiveAvailable = selectedMeta.hasInteractive;
  const interactivePreviewUrl = withAuthToken(interactiveUrl);
  const filePreviewUrl = withAuthToken(selectedMeta.fileUrl);

  useEffect(() => {
    if (!selectedPresentation) return;
    setViewMode(getPresentationMeta(selectedPresentation).preferredView);
  }, [selectedPresentation]);

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
            {filteredPresentations.map((presentation) => {
              const meta = getPresentationMeta(presentation);
              return (
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
                    <Badge variant={getStatusBadgeVariant(meta.status)}>
                      {getStatusLabel(meta.status)}
                    </Badge>
                    {meta.hasMp4 && <Badge variant="outline">MP4</Badge>}
                    {!meta.hasMp4 && meta.hasInteractive && (
                      <Badge variant="outline">LibreOffice HTML</Badge>
                    )}
                    {!meta.hasMp4 && !meta.hasInteractive && meta.hasPdf && (
                      <Badge variant="outline">PDF</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(presentation.keywords ?? []).map((keyword) => (
                      <Badge key={keyword} variant="secondary">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setSelectedPresentation(presentation)}>
                      Ansicht öffnen
                    </Button>
                    {canManageTraining && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openEditDialog(presentation)}
                      >
                        Bearbeiten
                      </Button>
                    )}
                    {canManageTraining && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => requestDeletePresentation(presentation)}
                      >
                        Löschen
                      </Button>
                    )}
                  </div>
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
              );
            })}
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
          {selectedPresentation && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={getStatusBadgeVariant(selectedMeta.status)}>
                {getStatusLabel(selectedMeta.status)}
              </Badge>
              {selectedMeta.hasMp4 && <Badge variant="outline">Anzeige: MP4</Badge>}
              {!selectedMeta.hasMp4 && selectedMeta.hasInteractive && (
                <Badge variant="outline">Anzeige: LibreOffice HTML</Badge>
              )}
              {!selectedMeta.hasMp4 &&
                !selectedMeta.hasInteractive &&
                selectedMeta.hasPdf && <Badge variant="outline">Anzeige: PDF</Badge>}
              {!selectedMeta.canInline && (
                <Badge variant="outline">Anzeige: Download</Badge>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedMeta.hasMp4 && (
              <Button
                size="sm"
                variant={viewMode === "mp4" ? "secondary" : "outline"}
                onClick={() => setViewMode("mp4")}
              >
                MP4-Wiedergabe
              </Button>
            )}
            {canManageTraining && selectedPresentation && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEditDialog(selectedPresentation)}
              >
                Bearbeiten
              </Button>
            )}
            {canManageTraining && selectedPresentation && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => requestDeletePresentation(selectedPresentation)}
              >
                Löschen
              </Button>
            )}
            {interactiveAvailable && (
              <Button
                size="sm"
                variant={viewMode === "interactive" ? "secondary" : "outline"}
                onClick={() => setViewMode("interactive")}
              >
                LibreOffice Ansicht
              </Button>
            )}
            {selectedMeta.hasPdf && (
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
              viewMode === "mp4" && selectedMeta.hasMp4 ? (
                <div className="aspect-video overflow-hidden rounded-lg border border-border bg-black">
                  <video
                    src={filePreviewUrl}
                    controls
                    playsInline
                    className="h-full w-full"
                  >
                    Ihr Browser unterstützt keine MP4-Wiedergabe.
                  </video>
                </div>
              ) : viewMode === "interactive" && interactiveAvailable ? (
                <div className="aspect-[16/9] overflow-hidden rounded-lg border border-border">
                  <iframe
                    src={interactivePreviewUrl}
                    title={`${selectedPresentation.title} – LibreOffice Ansicht`}
                    className="h-full w-full"
                  />
                </div>
              ) : selectedMeta.fileUrl && selectedMeta.hasPdf ? (
                <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border">
                  <iframe
                    src={filePreviewUrl}
                    title={selectedPresentation.title}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Diese Datei kann inline nicht angezeigt werden. Verfuegbar ist
                  nur der Download.
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
                href={filePreviewUrl}
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
              selectedPresentation.originalMimeType !== "application/pdf" &&
              selectedMeta.hasPdf && (
                <p className="text-xs text-muted-foreground">
                  Originaldatei: {selectedPresentation.originalMimeType}. Die
                  Ansicht basiert auf der konvertierten PDF-Datei.
                </p>
              )}
            {selectedMeta.hasMp4 && (
              <p className="text-xs text-muted-foreground">
                MP4 wird bevorzugt angezeigt (Animationen bleiben dabei in der
                Regel erhalten).
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditTarget(null);
            setEditError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Präsentation bearbeiten</DialogTitle>
            <DialogDescription>
              Titel und Schlagworte der Präsentation aktualisieren.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                placeholder="Titel eingeben"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Schlagworte (Komma getrennt)</Label>
              <Input
                value={editKeywords}
                onChange={(event) => setEditKeywords(event.target.value)}
                placeholder="z.B. Schulung, SOP"
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setEditDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving ? "Speichern…" : "Speichern"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Präsentation löschen?</DialogTitle>
            <DialogDescription>
              Soll die Präsentation "{deleteTarget?.title ?? ""}" gelöscht werden?
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Löschen…" : "Ja, löschen"}
            </Button>
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
                Akzeptierte Formate: PDF, PPT, PPTX, MP4. Anzeige-Prioritaet:
                MP4 &gt; LibreOffice HTML &gt; PDF &gt; Download.
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
              <Label>Datei (PDF, PPT, PPTX, MP4)</Label>
              <Input
                type="file"
                accept=".pdf,.ppt,.pptx,.mp4,video/mp4"
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
