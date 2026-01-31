import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTag, setActiveTag] = useState<FilterTag>("all");
  const [selectedVideo, setSelectedVideo] = useState<TrainingVideo | null>(
    null,
  );

  const { data: videos = [], isLoading, error } = useQuery({
    queryKey: ["training", "videos"],
    queryFn: () => trainingApi.getVideos(),
  });

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

  const embedUrl = buildEmbedUrl(selectedVideo);

  return (
    <Layout title="Fortbildung – Videos">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Input
            placeholder="Suchen (Titel oder Schlagwort)"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="flex-1"
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
                key={tag}
                type="button"
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

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {filteredVideos.length} Ergebnis
            {filteredVideos.length !== 1 && "se"}
          </Badge>
          {!filteredVideos.length && !isLoading && (
            <Badge variant="outline">Keine Videos gefunden</Badge>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">
            Videos konnten nicht geladen werden.
          </p>
        )}

        {!isLoading && !filteredVideos.length && !error && (
          <p className="text-sm text-muted-foreground">
            Es sind noch keine Videos hinterlegt.
          </p>
        )}

        <ScrollArea className="w-full">
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredVideos.map((video) => (
              <Card key={video.id} className="relative flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-primary" />
                    {video.title}
                  </CardTitle>
                  <CardDescription className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {video.platform} ·{" "}
                      {video.isActive ? "Aktiv" : "Inaktiv"}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(video.keywords ?? []).map((keyword) => (
                        <Badge key={keyword} variant="secondary">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between gap-3">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {video.url
                      ? video.url
                      : "Keine zusätzlichen Informationen verfügbar."}
                  </p>
                  <Button
                    className="mt-3 self-start"
                    onClick={() => setSelectedVideo(video)}
                  >
                    Öffnen
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      <Dialog
        open={Boolean(selectedVideo)}
        onOpenChange={(open) => {
          if (!open) setSelectedVideo(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedVideo?.title}</DialogTitle>
            <DialogDescription>
              {selectedVideo?.platform}
            </DialogDescription>
          </DialogHeader>
          {embedUrl ? (
            <div className="mt-4 aspect-video rounded-lg border border-border bg-black">
              <iframe
                src={embedUrl}
                title={selectedVideo?.title}
                className="h-full w-full rounded-lg"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">
              Für dieses Video steht derzeit kein Embed zur Verfügung.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {(selectedVideo?.keywords ?? []).map((keyword) => (
              <Badge key={keyword}>{keyword}</Badge>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
