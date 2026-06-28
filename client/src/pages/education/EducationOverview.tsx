import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { educationApi } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentedProgress } from "@/components/ui/segmented-progress";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Save,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  formatRequirementTarget,
  getRequirementProgressSummary,
} from "@/lib/education";

const CHECKBOX_EVALUATION_TYPES = new Set([
  "binary_signoff",
  "certificate",
  "course",
  "exam",
]);

const isCheckboxRequirement = (requirement: {
  evaluationType?: string | null;
  targetLevel?: number | null;
}) =>
  CHECKBOX_EVALUATION_TYPES.has(requirement.evaluationType ?? "") &&
  typeof requirement.targetLevel !== "number";

const getOwnRequirementProgressSummary = (
  requirement: {
    requiredCount?: number | null;
    unitLabel?: string | null;
    targetLevel?: number | null;
  },
  progress?: {
    completedCount?: number | null;
    currentLevel?: number | null;
    status?: string | null;
  } | null,
) => {
  const requiredCount = Math.max(0, Number(requirement.requiredCount ?? 0));
  const completedCount = Math.max(0, Number(progress?.completedCount ?? 0));
  const targetLevel =
    typeof requirement.targetLevel === "number" ? requirement.targetLevel : null;
  const currentLevel =
    typeof progress?.currentLevel === "number" ? progress.currentLevel : null;

  let completedParts = 0;
  let targetParts = 0;

  if (requiredCount > 0) {
    targetParts += 1;
    completedParts += Math.min(1, completedCount / requiredCount);
  }
  if (targetLevel !== null && targetLevel > 0) {
    targetParts += 1;
    completedParts += Math.min(1, (currentLevel ?? 0) / targetLevel);
  }
  if (targetParts === 0) {
    targetParts = 1;
    completedParts =
      progress?.status === "bestaetigt" || progress?.status === "ziel_erreicht" ? 1 : 0;
  }

  const detailBits: string[] = [];
  if (requiredCount > 0) {
    detailBits.push(`${completedCount}/${requiredCount} ${requirement.unitLabel ?? "Einträge"}`);
  }
  if (targetLevel !== null) {
    detailBits.push(`Level ${currentLevel ?? 0}/${targetLevel}`);
  }

  const statusLabel =
    progress?.status === "bestaetigt"
      ? "Bestätigt"
      : progress?.status === "ziel_erreicht"
        ? "Erledigt"
        : progress?.status === "begonnen"
          ? "Begonnen"
          : "Offen";

  return {
    percent: Math.round(Math.min(1, completedParts / targetParts) * 100),
    detailLabel: detailBits.join(" · ") || statusLabel,
  };
};

export default function EducationOverview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["education", "me"],
    queryFn: () => educationApi.getMyOverview(),
  });
  const [requestingEventId, setRequestingEventId] = useState<number | null>(null);
  const [collapsedPrograms, setCollapsedPrograms] = useState<Record<number, boolean>>(
    {},
  );
  const [collapsedModules, setCollapsedModules] = useState<Record<number, boolean>>(
    {},
  );
  const [drafts, setDrafts] = useState<
    Record<
      number,
      {
        completedCount: string;
        currentLevel: string;
        status: "offen" | "begonnen" | "ziel_erreicht" | "abgelaufen";
        lastEntryLabel: string;
      }
    >
  >({});
  const [savingRequirementId, setSavingRequirementId] = useState<number | null>(null);

  const normalizeRole = (value?: string | null) =>
    (value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const getCanonicalRoleKey = (value?: string | null) => {
    const role = normalizeRole(value);
    if (!role) return "";
    if (role.includes("ausbildungsober")) return "ausbildungsoberarzt";
    if (role.includes("funktionsober")) return "funktionsoberarzt";
    if (role.includes("1. ober") || role.includes("erster ober")) return "1. oberarzt";
    if (role.includes("primar")) return "primararzt";
    if (role.includes("oberarzt")) return "oberarzt";
    if (role.includes("facharzt")) return "facharzt";
    if (role.includes("assistenz")) return "assistenzarzt";
    if (role.includes("turnus")) return "turnusarzt";
    if (role.includes("student") || role.includes("kpj") || role.includes("famul")) {
      return "student";
    }
    if (role.includes("sekret")) return "sekretariat";
    return role;
  };

  const parseTargetRoleKeys = (value?: string | null) =>
    (value ?? "")
      .split(/[,/]| und /i)
      .map((entry) => getCanonicalRoleKey(entry))
      .filter(Boolean);

  const progressByRequirement = useMemo(() => {
    const map = new Map<
      number,
      {
        requirementId: number;
        completedCount: number;
        verifiedCount: number;
        currentLevel?: number | null;
        status?: string | null;
        lastEntryLabel?: string | null;
      }
    >();
    (data?.progress ?? []).forEach((row) => {
      map.set(row.requirementId, row);
    });
    return map;
  }, [data?.progress]);

  const requestByEventId = useMemo(() => {
    const map = new Map<number, (typeof data.eventRequests)[number]>();
    (data?.eventRequests ?? []).forEach((request) => {
      map.set(request.eventId, request);
    });
    return map;
  }, [data?.eventRequests]);

  const visibleCatalog = useMemo(() => data?.catalog ?? [], [data?.catalog]);
  const visibleEvents = useMemo(() => {
    const currentRoleKey = getCanonicalRoleKey(data?.employeeRole);
    return (data?.events ?? []).filter((event) => {
      const targetRoleKeys = parseTargetRoleKeys(event.targetRole);
      return targetRoleKeys.length === 0 || targetRoleKeys.includes(currentRoleKey);
    });
  }, [data?.employeeRole, data?.events]);

  const visibleSummary = useMemo(() => {
    const requirements = visibleCatalog.flatMap((program) =>
      program.modules.flatMap((module) => module.requirements),
    );

    const summary = requirements.reduce(
      (acc, requirement) => {
        const progress = progressByRequirement.get(requirement.id);
        const rowSummary = getOwnRequirementProgressSummary(requirement, progress);
        const requiredCount = Math.max(0, Number(requirement.requiredCount ?? 0));
        const completedCount = Math.max(0, Number(progress?.completedCount ?? 0));
        const verifiedCount = Math.max(0, Number(progress?.verifiedCount ?? 0));
        const targetLevel =
          typeof requirement.targetLevel === "number" ? requirement.targetLevel : null;
        const currentLevel =
          typeof progress?.currentLevel === "number" ? progress.currentLevel : null;
        const ownStatusComplete =
          progress?.status === "bestaetigt" || progress?.status === "ziel_erreicht";
        const ownCountComplete = requiredCount > 0 ? completedCount >= requiredCount : false;
        const verifiedCountComplete = requiredCount > 0 ? verifiedCount >= requiredCount : false;
        const levelComplete =
          targetLevel !== null && targetLevel > 0
            ? (currentLevel ?? 0) >= targetLevel
            : false;
        const ownRequirementComplete =
          requiredCount > 0 || (targetLevel !== null && targetLevel > 0)
            ? ownCountComplete || levelComplete
            : ownStatusComplete;
        const verifiedRequirementComplete =
          requiredCount > 0 || (targetLevel !== null && targetLevel > 0)
            ? verifiedCountComplete || levelComplete
            : progress?.status === "bestaetigt";

        acc.totalRequired += 1;
        acc.completed += ownRequirementComplete ? 1 : 0;
        acc.verified += verifiedRequirementComplete ? 1 : 0;
        acc.percentParts += rowSummary.percent;
        acc.verifiedPercentParts += getRequirementProgressSummary(requirement, progress).percent;
        return acc;
      },
      {
        completed: 0,
        verified: 0,
        totalRequired: 0,
        percentParts: 0,
        verifiedPercentParts: 0,
      },
    );

    return {
      completed: summary.completed,
      verified: summary.verified,
      totalRequired: summary.totalRequired,
      completionPercent:
        summary.totalRequired > 0
          ? Math.round(summary.percentParts / summary.totalRequired)
          : 0,
      verifiedPercent:
        summary.totalRequired > 0
          ? Math.round(summary.verifiedPercentParts / summary.totalRequired)
          : 0,
    };
  }, [progressByRequirement, visibleCatalog]);

  useEffect(() => {
    setCollapsedPrograms((current) => {
      let changed = false;
      const next = { ...current };
      for (const program of visibleCatalog) {
        if (typeof next[program.id] === "undefined") {
          next[program.id] = false;
          changed = true;
        }
      }
      return changed ? next : current;
    });

    setCollapsedModules((current) => {
      let changed = false;
      const next = { ...current };
      for (const program of visibleCatalog) {
        for (const module of program.modules) {
          if (typeof next[module.id] === "undefined") {
            next[module.id] = true;
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [visibleCatalog]);

  const handleRequestInterest = async (eventId: number) => {
    setRequestingEventId(eventId);
    try {
      await educationApi.requestEventInterest(eventId);
      await queryClient.invalidateQueries({ queryKey: ["education", "me"] });
      toast({ title: "Interesse vorgemerkt" });
    } finally {
      setRequestingEventId(null);
    }
  };

  const setDraftField = (
    requirementId: number,
    field: "completedCount" | "currentLevel" | "status" | "lastEntryLabel",
    value: string,
  ) => {
    const currentProgress = progressByRequirement.get(requirementId);
    setDrafts((current) => ({
      ...current,
      [requirementId]: {
        completedCount:
          current[requirementId]?.completedCount ??
          String(currentProgress?.completedCount ?? 0),
        currentLevel:
          current[requirementId]?.currentLevel ??
          String(currentProgress?.currentLevel ?? ""),
        status:
          current[requirementId]?.status ??
          ((currentProgress?.status as
            | "offen"
            | "begonnen"
            | "ziel_erreicht"
            | "abgelaufen"
            | undefined) ?? "offen"),
        lastEntryLabel:
          current[requirementId]?.lastEntryLabel ?? currentProgress?.lastEntryLabel ?? "",
        [field]: value,
      },
    }));
  };

  const saveOwnProgress = async (
    requirement: (typeof visibleCatalog)[number]["modules"][number]["requirements"][number],
  ) => {
    const draft = drafts[requirement.id];
    const completedCount = Number(
      draft?.completedCount ??
        progressByRequirement.get(requirement.id)?.completedCount ??
        0,
    );
    const currentLevelValue =
      draft?.currentLevel ??
      String(progressByRequirement.get(requirement.id)?.currentLevel ?? "");
    const currentLevel = currentLevelValue === "" ? null : Number(currentLevelValue);
    const checkboxRequirement = isCheckboxRequirement(requirement);
    const hasTargetOnlyStatus =
      checkboxRequirement ||
      ((requirement.requiredCount ?? 0) === 0 &&
        typeof requirement.targetLevel !== "number");

    setSavingRequirementId(requirement.id);
    try {
      await educationApi.upsertSelfProgress({
        requirementId: requirement.id,
        completedCount,
        currentLevel,
        status:
          draft?.status ??
          (hasTargetOnlyStatus
            ? completedCount > 0 || (currentLevel ?? 0) > 0
              ? "ziel_erreicht"
              : "offen"
            : completedCount > 0 || (currentLevel ?? 0) > 0
              ? "begonnen"
              : "offen"),
        lastEntryLabel: draft?.lastEntryLabel ?? "",
      });
      await queryClient.invalidateQueries({ queryKey: ["education", "me"] });
      toast({ title: "Leistung gespeichert" });
    } finally {
      setSavingRequirementId(null);
    }
  };

  if (isLoading) {
    return (
      <Layout title="Ausbildung">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Ausbildung">
      <div className="space-y-6">
        <Card className="border-none kabeg-shadow">
          <CardHeader>
            <CardTitle>Aktueller Ausbildungsstand</CardTitle>
            <CardDescription>
              Diese Ansicht zeigt den strukturellen Fortschritt gegen den aktuell
              hinterlegten Ausbildungskatalog.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-secondary/40 p-4">
                <div className="text-xs uppercase text-muted-foreground">
                  Module erfüllt
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {visibleSummary.completed}
                </div>
              </div>
              <div className="rounded-xl bg-secondary/40 p-4">
                <div className="text-xs uppercase text-muted-foreground">
                  Bestaetigt
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {visibleSummary.verified}
                </div>
              </div>
              <div className="rounded-xl bg-secondary/40 p-4">
                <div className="text-xs uppercase text-muted-foreground">
                  Soll-Leistungen
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {visibleSummary.totalRequired}
                </div>
              </div>
              <div className="rounded-xl bg-primary/10 p-4">
                <div className="text-xs uppercase text-muted-foreground">
                  Fortschritt
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {visibleSummary.completionPercent}%
                </div>
              </div>
            </div>
            <SegmentedProgress
              completedValue={visibleSummary.completionPercent}
              verifiedValue={visibleSummary.verifiedPercent}
            />
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary/35" />
                Eingetragen
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Bestätigt
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none kabeg-shadow">
          <CardHeader>
            <CardTitle>Fortbildungen und Kongresse</CardTitle>
            <CardDescription>
              Verfügbare Fortbildungen können hier vorgemerkt werden. Die
              Entscheidung erfolgt anschließend im Fortbildungs-Editor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleEvents.map((event) => {
              const request = requestByEventId.get(event.id);
              return (
                <div
                  key={event.id}
                  className="rounded-xl border p-4 flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold">{event.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {[event.eventType, event.location].filter(Boolean).join(" · ")}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {event.startsAt} bis {event.endsAt}
                      </div>
                      {event.description && (
                        <div className="mt-1 text-sm text-muted-foreground">
                          {event.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {request ? (
                        <Badge variant="secondary">{request.status}</Badge>
                      ) : (
                        <Button
                          onClick={() => void handleRequestInterest(event.id)}
                          disabled={requestingEventId === event.id}
                        >
                          {requestingEventId === event.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Interesse anmelden"
                          )}
                        </Button>
                      )}
                      {event.externalUrl && (
                        <Button asChild variant="outline">
                          <a href={event.externalUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Link
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {visibleEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aktuell sind keine Fortbildungen oder Kongresse ausgeschrieben.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Importplatzhalter
            </CardTitle>
            <CardDescription>
              Der spaetere Tabellenimport fuer OPs, Ultraschall und andere
              Leistungen ist vorbereitet, aber absichtlich noch nicht automatisiert.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.uploads ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Importlaeufe vorhanden. Der naechste Ausbauschritt ist
                die Zuordnung externer Bezeichnungen auf Katalogeintraege.
              </p>
            ) : (
              <div className="space-y-2">
                {data?.uploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div>
                      <div className="font-medium">{upload.fileName}</div>
                      <div className="text-muted-foreground">
                        Zeilen: {upload.rowCount} · Treffer: {upload.matchedCount} ·
                        Offen: {upload.unmatchedCount}
                      </div>
                    </div>
                    <Badge variant="outline">{upload.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {visibleCatalog.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>Noch keine Ausbildung zugeordnet</CardTitle>
                <CardDescription>
                  Im Ausbildungscockpit koennen Programm und naechste Module pro Person
                  hinterlegt werden. Danach erscheinen sie hier in deinem Bereich.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          {visibleCatalog.map((program) => (
            <Card key={program.id}>
              <CardHeader>
                <button
                  type="button"
                  className="flex min-w-0 items-start gap-3 text-left"
                  onClick={() =>
                    setCollapsedPrograms((current) => ({
                      ...current,
                      [program.id]: !current[program.id],
                    }))
                  }
                >
                  {collapsedPrograms[program.id] ? (
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div>
                    <CardTitle>{program.title}</CardTitle>
                    <CardDescription>
                      {program.description || "Noch keine Beschreibung hinterlegt."}
                    </CardDescription>
                  </div>
                </button>
              </CardHeader>
              {!collapsedPrograms[program.id] && (
              <CardContent className="space-y-4">
                {program.modules.map((module) => (
                  <div key={module.id} className="rounded-xl border p-4">
                    <button
                      type="button"
                      className="mb-3 flex min-w-0 items-start gap-3 text-left"
                      onClick={() =>
                        setCollapsedModules((current) => ({
                          ...current,
                          [module.id]: !current[module.id],
                        }))
                      }
                    >
                      {collapsedModules[module.id] ? (
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <div className="font-semibold">{module.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {module.description || "Noch keine Modulbeschreibung."}
                        </div>
                      </div>
                    </button>
                    {!collapsedModules[module.id] && (
                    <div className="space-y-2">
                      {module.requirements.map((requirement) => {
                        const progress = progressByRequirement.get(requirement.id);
                        const draft = drafts[requirement.id];
                        const target = formatRequirementTarget(requirement);
                        const progressSummary = getOwnRequirementProgressSummary(
                          requirement,
                          progress,
                        );
                        const verificationSummary = getRequirementProgressSummary(
                          requirement,
                          progress,
                        );
                        const isBinaryOnly = isCheckboxRequirement(requirement);
                        return (
                          <div
                            key={requirement.id}
                            className="rounded-lg bg-secondary/20 p-3"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="font-medium">{requirement.title}</div>
                                <div className="text-sm text-muted-foreground">
                                  {(requirement.category || "Leistung")} ·{" "}
                                  {target.typeLabel} · {target.targetLabel}
                                </div>
                              </div>
                              <div className="flex gap-2 text-sm">
                                <Badge variant="secondary">
                                  {progressSummary.detailLabel}
                                </Badge>
                                {verificationSummary.detailLabel !== progressSummary.detailLabel ? (
                                  <Badge variant="outline">
                                    Bestätigt: {verificationSummary.detailLabel}
                                  </Badge>
                                ) : null}
                                <Badge>{progressSummary.percent}%</Badge>
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                              <div className="space-y-2">
                                <div className="text-xs uppercase text-muted-foreground">
                                  Mein Eintrag
                                </div>
                                {isBinaryOnly ? (
                                  <label className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
                                    <Checkbox
                                      checked={
                                        (draft?.status ?? progress?.status ?? "offen") !== "offen"
                                      }
                                      onCheckedChange={(checked) => {
                                        setDraftField(
                                          requirement.id,
                                          "status",
                                          checked === true ? "ziel_erreicht" : "offen",
                                        );
                                        setDraftField(
                                          requirement.id,
                                          "completedCount",
                                          checked === true ? "1" : "0",
                                        );
                                      }}
                                    />
                                    <span className="text-sm">Erledigt</span>
                                  </label>
                                ) : (
                                  <Input
                                    type="number"
                                    min="0"
                                    value={
                                      draft?.completedCount ??
                                      String(progress?.completedCount ?? 0)
                                    }
                                    onChange={(event) =>
                                      setDraftField(
                                        requirement.id,
                                        "completedCount",
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Aktueller Stand"
                                  />
                                )}
                              </div>

                              <div className="space-y-2">
                                <div className="text-xs uppercase text-muted-foreground">
                                  Zusatz
                                </div>
                                {typeof requirement.targetLevel === "number" ? (
                                  <Input
                                    type="number"
                                    min="0"
                                    value={
                                      draft?.currentLevel ??
                                      String(progress?.currentLevel ?? "")
                                    }
                                    onChange={(event) =>
                                      setDraftField(
                                        requirement.id,
                                        "currentLevel",
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Level"
                                  />
                                ) : (
                                  <Input
                                    value={draft?.lastEntryLabel ?? progress?.lastEntryLabel ?? ""}
                                    onChange={(event) =>
                                      setDraftField(
                                        requirement.id,
                                        "lastEntryLabel",
                                        event.target.value,
                                      )
                                    }
                                    placeholder="z. B. aktueller OP-Stand"
                                  />
                                )}
                              </div>

                              <div className="space-y-2">
                                <div className="text-xs uppercase text-muted-foreground">
                                  Validierung
                                </div>
                                <Button
                                  onClick={() => void saveOwnProgress(requirement)}
                                  disabled={savingRequirementId === requirement.id}
                                >
                                  {savingRequirementId === requirement.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                  )}
                                  Speichern
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {module.requirements.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          In diesem Modul wurden noch keine Anforderungen angelegt.
                        </p>
                      )}
                    </div>
                    )}
                  </div>
                ))}
                {program.modules.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Dieses Programm enthaelt noch keine Module.
                  </p>
                )}
              </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
