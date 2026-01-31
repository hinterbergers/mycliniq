import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

type FilterTag = string | "all";

export default function TrainingPresentations() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTag, setActiveTag] = useState<FilterTag>("all");
  const [selectedPresentation, setSelectedPresentation] =
    useState<TrainingPresentation | null>(null);

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

  const isPdf = Boolean(
    selectedPresentation?.mimeType
      ?.toLowerCase()
      .includes("pdf"),
  );

  return (
    <Layout title="Fortbildung – PowerPoint / Vorträge">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Input
            placeholder="Suche nach Titel oder Schlagwort"
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
                      href={presentation.fileUrl}
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
          {selectedPresentation?.fileUrl ? (
            isPdf ? (
              <div className="mt-4 aspect-[4/3] overflow-hidden rounded-lg border border-border">
                <iframe
                  src={selectedPresentation.fileUrl}
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
          <div className="mt-4 flex items-center gap-2">
            <Button asChild>
              <a
                href={selectedPresentation?.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </a>
            </Button>
            {!isPdf && (
              <p className="text-xs text-muted-foreground">
                Für Inline-Ansicht bitte als PDF hochladen.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
