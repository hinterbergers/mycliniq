import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play, Plus } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { trainingApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TrainingVideo } from "@shared/schema";

type FilterTag = string | "all";

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
  const { isAdmin, isTechnicalAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTag, setActiveTag] = useState<FilterTag>("all");
  const [selectedVideo, setSelectedVideo] = useState<TrainingVideo | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newVideoForm, setNewVideoForm] = useState({
    title: "",
    youtubeUrlOrId: "",
    keywords: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  const { data: videos = [], isLoading, error, refetch } = useQuery({
    queryKey: ["training", "videos"],
    queryFn: () => trainingApi.getVideos(),
  });

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

  const canManageTraining = isAdmin || isTechnicalAdmin;

  const handleDialogClose = () => {
    setDialogOpen(false);
    setCreationError(null);
    setNewVideoForm({
      title: "",
      youtubeUrlOrId: "",
      keywords: "",
    });
  };

  const handleCreateVideo = async () => {
    const title = newVideoForm.title.trim();
    const youtube = newVideoForm.youtubeUrlOrId.trim();
    if (!title || !youtube) {
      setCreationError("Titel und YouTube-Link oder ID sind erforderlich.");
      return;
    }

    setIsSubmitting(true);
    setCreationError(null);

    const keywords = newVideoForm.keywords
      .split(/[;,]+/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    try {
      const created = await trainingApi.createYouTubeVideo({
        title,
        youtubeUrlOrId: youtube,
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
              <ScrollArea className="max-h-[70vh]">
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
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Play className="w-4 h-4 text-primary" />
                          {video.title}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                          {video.platform} ·{" "}
                          {video.isActive ? "Aktiv" : "Inaktiv"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-1">
                          {(video.keywords ?? []).map((keyword) => (
                            <Badge key={keyword} variant="secondary">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                        {video.url && (
                          <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                            {video.url}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
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
                    <Badge key={keyword}>{keyword}</Badge>
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
              <Label>YouTube-Link oder ID</Label>
              <Input
                value={newVideoForm.youtubeUrlOrId}
                onChange={(event) =>
                  setNewVideoForm((prev) => ({
                    ...prev,
                    youtubeUrlOrId: event.target.value,
                  }))
                }
              />
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
                !newVideoForm.youtubeUrlOrId.trim()
              }
            >
              {isSubmitting ? "Speichert…" : "Speichern"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
