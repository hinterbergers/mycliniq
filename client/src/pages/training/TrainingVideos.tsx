import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play, Plus, Trash2, Edit3, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { trainingApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { TrainingVideo } from "@shared/schema";

type FilterTag = string | "all";

const splitKeywords = (value?: string | null): string[] =>
  (value ?? "")
    .split(/[;,]+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

const buildEmbedUrl = (video: TrainingVideo | null): string => {
  if (!video) return "";
  if (video.embedUrl) return video.embedUrl;
  if (video.platform?.toLowerCase().includes("youtube") && video.videoId) {
    return `https://www.youtube-nocookie.com/embed/${video.videoId}`;
  }
  if (video.url) return video.url;
  return "";
};

export default function TrainingVideos() {
  const {
    employee,
    isAdmin: authIsAdmin,
    isTechnicalAdmin: authIsTechAdmin,
  } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [location] = useLocation();
  const [activeTag, setActiveTag] = useState<FilterTag>("all");
  const [selectedVideo, setSelectedVideo] = useState<TrainingVideo | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newVideoForm, setNewVideoForm] = useState({
    title: "",
    videoUrlOrId: "",
    keywords: "",
    platform: "youtube",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingVideo, setEditingVideo] = useState<TrainingVideo | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    youtubeUrlOrId: "",
    isActive: true,
  });
  const [editKeywords, setEditKeywords] = useState<string[]>([]);
  const [tagInputValue, setTagInputValue] = useState("");

  const addEditKeyword = (value: string) => {
    const keywordsToAdd = splitKeywords(value);
    if (!keywordsToAdd.length) return;
    setEditKeywords((prev) => {
      const next = [...prev];
      keywordsToAdd.forEach((keyword) => {
        if (!next.includes(keyword)) {
          next.push(keyword);
        }
      });
      return next;
    });
  };

  const removeEditKeyword = (keywordToRemove: string) => {
    setEditKeywords((prev) =>
      prev.filter((keyword) => keyword !== keywordToRemove),
    );
  };

  const handleTagInputKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    const shouldAdd =
      event.key === "Enter" || event.key === "," || event.key === ";";
    if (!shouldAdd) return;
    event.preventDefault();
    addEditKeyword(tagInputValue);
    setTagInputValue("");
  };
  const { toast } = useToast();

  const { data: videos = [], isLoading, error, refetch } = useQuery({
    queryKey: ["training", "videos"],
    queryFn: () => trainingApi.getVideos(),
  });

  useEffect(() => {
    const queryIndex = location.indexOf("?");
    const search = queryIndex >= 0 ? location.slice(queryIndex) : "";
    const params = new URLSearchParams(search);
    const nextQ = params.get("q") ?? "";
    setSearchTerm((prev) => (prev === nextQ ? prev : nextQ));
  }, [location]);

  useEffect(() => {
    if (!videos.length) {
      setSelectedVideo(null);
      return;
    }

    if (!selectedVideo) {
      setSelectedVideo(videos[0]);
      return;
    }

    if (!videos.find((video) => video.id === selectedVideo.id)) {
      setSelectedVideo(videos[0]);
    }
  }, [videos, selectedVideo]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((video) => {
      (video.keywords ?? []).forEach((keyword) => {
        const trimmed = keyword.trim();
        if (trimmed) {
          set.add(trimmed);
        }
      });
    });
    return Array.from(set).sort();
  }, [videos]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      const titleMatches = video.title
        .toLowerCase()
        .includes(normalizedSearch);
      const keywordMatches = (video.keywords ?? []).some((keyword) =>
        keyword.toLowerCase().includes(normalizedSearch),
      );
      const matchesSearch =
        !normalizedSearch || titleMatches || keywordMatches;
      const matchesTag =
        activeTag === "all" ||
        (video.keywords ?? []).some(
          (keyword) => keyword.trim() === activeTag,
        );
      return matchesSearch && matchesTag;
    });
  }, [videos, normalizedSearch, activeTag]);

  const embedUrl = useMemo(() => buildEmbedUrl(selectedVideo), [selectedVideo]);
  const queryErrorMessage =
    error instanceof Error ? error.message : "Videos konnten nicht geladen werden.";

  const canManageTraining = Boolean(
    authIsAdmin ||
      authIsTechAdmin ||
      employee?.isAdmin ||
      employee?.systemRole === "system_admin" ||
      employee?.appRole === "Admin",
  );

  const handleDialogClose = () => {
    setDialogOpen(false);
    setCreationError(null);
    setNewVideoForm({
      title: "",
      videoUrlOrId: "",
      keywords: "",
      platform: "youtube",
    });
  };

  const handleCreateVideo = async () => {
    const title = newVideoForm.title.trim();
    const reference = newVideoForm.videoUrlOrId.trim();
    if (!title || !reference) {
      setCreationError("Titel und Link oder ID sind erforderlich.");
      return;
    }

    setIsSubmitting(true);
    setCreationError(null);

    const keywords = splitKeywords(newVideoForm.keywords);

    try {
      const created = await trainingApi.createEmbedVideo({
        title,
        platform: newVideoForm.platform as "youtube" | "vimeo",
        videoUrlOrId: reference,
        keywords: keywords.length ? keywords : undefined,
      });
      await refetch();
      setSelectedVideo(created);
      handleDialogClose();
    } catch (submissionError) {
      setCreationError(
        submissionError instanceof Error
          ? submissionError.message
          : "Video konnte nicht gespeichert werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteVideo = async (video: TrainingVideo) => {
    if (!canManageTraining) return;
    const message = `Video "${video.title}" wirklich löschen?`;
    if (!window.confirm(message)) return;

    setDeletingId(video.id);
    try {
      await trainingApi.deleteVideo(video.id);
      toast({
        title: "Video gelöscht",
        description: `"${video.title}" wurde entfernt.`,
      });
      setSelectedVideo((current) =>
        current?.id === video.id ? null : current,
      );
      void refetch();
    } catch (submissionError) {
      toast({
        title: "Löschen fehlgeschlagen",
        description:
          submissionError instanceof Error
            ? submissionError.message
            : "Das Video konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!editingVideo) return;
    setEditForm({
      title: editingVideo.title,
      youtubeUrlOrId: editingVideo.videoId ?? "",
      isActive: editingVideo.isActive,
    });
    setEditKeywords(
      (editingVideo.keywords ?? [])
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    );
    setTagInputValue("");
  }, [editingVideo]);

  const openEditDialog = (video: TrainingVideo) => {
    setEditingVideo(video);
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setEditingVideo(null);
    setEditForm({
      title: "",
      youtubeUrlOrId: "",
      isActive: true,
    });
    setEditKeywords([]);
    setTagInputValue("");
  };

  const handleSaveEdit = async () => {
    if (!editingVideo) return;
    const body: Parameters<typeof trainingApi.updateVideo>[1] = {
      title: editForm.title.trim(),
      keywords: editKeywords.length ? editKeywords : undefined,
      isActive: editForm.isActive,
    };
    if (editingVideo.platform?.toLowerCase().includes("youtube")) {
      const youtubeId = editForm.youtubeUrlOrId.trim();
      body.videoId = youtubeId || null;
    }

    try {
      const updated = await trainingApi.updateVideo(editingVideo.id, body);
      toast({
        title: "Video aktualisiert",
        description: `"${updated.title}" wurde gespeichert.`,
      });
      await refetch();
      setSelectedVideo(updated);
      closeEditDialog();
    } catch (updateError) {
      toast({
        title: "Aktualisierung fehlgeschlagen",
        description:
          updateError instanceof Error
            ? updateError.message
            : "Das Video konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout title="Fortbildung – Videos">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 space-y-3">
            <Input
              placeholder="Titel oder Schlagwort suchen"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full"
            />
            <div className="flex flex-wrap gap-2">
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
              className="gap-2 self-start"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
              Video hinzufügen
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {filteredVideos.length} Ergebnis
            {filteredVideos.length !== 1 && "se"}
          </Badge>
          {!isLoading && !filteredVideos.length && (
            <Badge variant="outline">Keine Treffer</Badge>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-3">
          {error && (
            <Card>
              <CardContent>
                <p className="text-sm text-destructive">{queryErrorMessage}</p>
              </CardContent>
            </Card>
          )}
          <div className="rounded-2xl border border-border bg-background">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="max-h-[65vh] overflow-y-auto">
                <div className="space-y-2 p-3">
                  {!filteredVideos.length && (
                    <p className="text-sm text-muted-foreground">
                      Keine Videos verfügbar.
                    </p>
                  )}
                  {filteredVideos.map((video) => (
                    <Card
                      key={video.id}
                      onClick={() => setSelectedVideo(video)}
                      className={cn(
                        "cursor-pointer border transition hover:border-primary",
                        selectedVideo?.id === video.id
                          ? "border-primary bg-primary/5 shadow-lg"
                          : "border-border",
                      )}
                    >
                      <CardHeader className="space-y-1 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="flex items-center gap-2 text-sm">
                              <Play className="w-4 h-4 text-primary" />
                              {video.title}
                            </CardTitle>
                            <CardDescription className="text-[0.7rem] text-muted-foreground">
                              {video.platform} ·{" "}
                              {video.isActive ? "Aktiv" : "Inaktiv"}
                            </CardDescription>
                          </div>
                          {canManageTraining && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditDialog(video);
                                }}
                              >
                                <Edit3 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="text-destructive"
                                disabled={deletingId === video.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteVideo(video);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(video.keywords ?? []).map((keyword) => (
                            <Badge
                              key={keyword}
                              variant="secondary"
                              className="whitespace-normal"
                            >
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">
                  {selectedVideo ? selectedVideo.title : "Video auswählen"}
                </CardTitle>
                {selectedVideo && (
                  <Badge
                    variant={selectedVideo.isActive ? "secondary" : "outline"}
                  >
                    {selectedVideo.isActive ? "Aktiv" : "Inaktiv"}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-sm text-muted-foreground">
                {selectedVideo
                  ? selectedVideo.platform
                  : "Wählen Sie ein Video aus der Liste aus, um es hier anzusehen."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedVideo ? (
                embedUrl ? (
                  <div className="mt-4 aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
                    <iframe
                      title={selectedVideo.title}
                      src={embedUrl}
                      className="h-full w-full rounded-2xl"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Für dieses Video steht derzeit kein Embed zur Verfügung.
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  Keine Videos ausgewählt.
                </p>
              )}
              {selectedVideo?.keywords?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedVideo.keywords.map((keyword) => (
                    <Badge key={keyword} className="whitespace-normal">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleDialogClose();
            return;
          }
          setDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Video hinzufügen</DialogTitle>
            <DialogDescription>
              Hinterlegen Sie einen YouTube-Link oder eine Video-ID. Schlagworte
              helfen anderen, das Video zu finden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Titel</Label>
              <Input
                value={newVideoForm.title}
                onChange={(event) =>
                  setNewVideoForm((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Plattform</Label>
              <Select
                value={newVideoForm.platform}
                onValueChange={(value) =>
                  setNewVideoForm((prev) => ({ ...prev, platform: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Plattform wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="vimeo">Vimeo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Link oder ID</Label>
              <Input
                value={newVideoForm.videoUrlOrId}
                onChange={(event) =>
                  setNewVideoForm((prev) => ({
                    ...prev,
                    videoUrlOrId: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Für YouTube verwenden Sie den normalen Link oder die ID, für Vimeo die
                normale URL oder die Zahlen-ID.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Schlagworte (kommagetrennt)</Label>
              <Input
                value={newVideoForm.keywords}
                onChange={(event) =>
                  setNewVideoForm((prev) => ({
                    ...prev,
                    keywords: event.target.value,
                  }))
                }
              />
            </div>
            {creationError && (
              <p className="text-sm text-destructive">{creationError}</p>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleDialogClose}
              disabled={isSubmitting}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleCreateVideo}
              disabled={
                isSubmitting ||
                !newVideoForm.title.trim() ||
                !newVideoForm.videoUrlOrId.trim()
              }
            >
              {isSubmitting ? "Speichert…" : "Speichern"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeEditDialog();
            return;
          }
          setEditDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingVideo ? `Bearbeite ${editingVideo.title}` : "Video bearbeiten"}
            </DialogTitle>
            <DialogDescription>
              Aktualisieren Sie Titel, Schlagworte oder Aktivitätsstatus.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Titel</Label>
              <Input
                value={editForm.title}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, title: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Schlagworte</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  placeholder="Schlagwort hinzufügen"
                  value={tagInputValue}
                  onChange={(event) => setTagInputValue(event.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                />
                <Button
                  variant="outline"
                  className="self-end sm:self-auto"
                  onClick={() => {
                    addEditKeyword(tagInputValue);
                    setTagInputValue("");
                  }}
                  disabled={!tagInputValue.trim()}
                >
                  Hinzufügen
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Trennen Sie mehrere Schlagworte mit Komma oder Enter.
              </p>
              <div className="flex flex-wrap gap-2">
                {editKeywords.map((keyword) => (
                  <Badge
                    key={keyword}
                    variant="secondary"
                    className="flex items-center gap-1 whitespace-normal"
                  >
                    <span>{keyword}</span>
                    <button
                      type="button"
                      className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => removeEditKeyword(keyword)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
            {editingVideo?.platform?.toLowerCase().includes("youtube") && (
              <div className="space-y-1">
                <Label>Video-ID</Label>
                <Input
                  value={editForm.youtubeUrlOrId}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      youtubeUrlOrId: event.target.value,
                    }))
                  }
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label>Aktiv</Label>
                <p className="text-xs text-muted-foreground">
                  Deaktivierte Videos werden in der Liste ausgegraut.
                </p>
              </div>
              <Switch
                checked={editForm.isActive}
                onCheckedChange={(checked) =>
                  setEditForm((prev) => ({ ...prev, isActive: Boolean(checked) }))
                }
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={closeEditDialog}>
              Abbrechen
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editForm.title.trim()}
            >
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
