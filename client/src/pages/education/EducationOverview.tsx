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
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  formatRequirementTarget,
  getRequirementProgressSummary,
} from "@/lib/education";

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

  const normalizeRole = (value?: string | null) =>
    (value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const getRoleRank = (value?: string | null) => {
    const role = normalizeRole(value);
    if (!role) return 0;
    if (role.includes("primar")) return 7;
    if (role.includes("ausbildungsober") || role.includes("funktionsober")) return 6;
    if (role.includes("1. ober") || role.includes("oberarzt") || role.includes("oberarztin"))
      return 6;
    if (role.includes("facharzt") || role.includes("facharztin")) return 5;
    if (role.includes("assistenz")) return 4;
    if (role.includes("turnus")) return 3;
    if (role.includes("student") || role.includes("kpj") || role.includes("famul"))
      return 2;
    if (role.includes("sekret")) return 1;
    return 0;
  };

  const parseTargetRoleRanks = (value?: string | null) =>
    (value ?? "")
      .split(/[,/]| und /i)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => getRoleRank(entry))
      .filter((rank) => rank > 0);

  const requiresAdvancedRole = (...values: Array<string | null | undefined>) => {
    const haystack = values.map((value) => normalizeRole(value)).join(" ");
    return /(facharztvoraus|fa voraus|nach facharzt|nur facharzt|nur facharztin|ogum ii)/i.test(
      haystack,
    );
  };

  const progressByRequirement = useMemo(() => {
    const map = new Map<
      number,
      {
        requirementId: number;
        completedCount: number;
        verifiedCount: number;
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

  const canAccessByRole = (
    currentRoleRank: number,
    ...values: Array<string | null | undefined>
  ) => {
    const targetRanks = parseTargetRoleRanks(values.join(" "));
    const minimumRequiredRank =
      targetRanks.length > 0 ? Math.min(...targetRanks) : 0;

    if (minimumRequiredRank > 0 && currentRoleRank < minimumRequiredRank) {
      return false;
    }

    if (
      requiresAdvancedRole(...values) &&
      currentRoleRank < getRoleRank("Facharzt")
    ) {
      return false;
    }

    return true;
  };

  const visibleCatalog = useMemo(() => {
    const currentRoleRank = getRoleRank(data?.employeeRole);

    return (data?.catalog ?? [])
      .map((program) => ({
        ...program,
        modules: program.modules.filter((module) =>
          canAccessByRole(
            currentRoleRank,
            module.targetRole,
            program.targetRole,
            module.title,
            module.description,
          ),
        ),
      }))
      .filter((program) => {
        const programAccessible = canAccessByRole(
          currentRoleRank,
          program.targetRole,
          program.title,
          program.description,
        );
        return programAccessible || program.modules.length > 0;
      });
  }, [data?.catalog, data?.employeeRole]);

  const visibleEvents = useMemo(() => {
    const currentRoleRank = getRoleRank(data?.employeeRole);

    return (data?.events ?? []).filter((event) => {
      return canAccessByRole(
        currentRoleRank,
        event.targetRole,
        event.title,
        event.description,
      );
    });
  }, [data?.employeeRole, data?.events]);

  const visibleSummary = useMemo(() => {
    const requirements = visibleCatalog.flatMap((program) =>
      program.modules.flatMap((module) => module.requirements),
    );

    const summary = requirements.reduce(
      (acc, requirement) => {
        const progress = progressByRequirement.get(requirement.id);
        const rowSummary = getRequirementProgressSummary(requirement, progress);
        const requiredCount = Math.max(0, Number(requirement.requiredCount ?? 0));
        const verifiedCount = Math.max(0, Number(progress?.verifiedCount ?? 0));
        const targetLevel =
          typeof requirement.targetLevel === "number" ? requirement.targetLevel : null;
        const currentLevel =
          typeof progress?.currentLevel === "number" ? progress.currentLevel : null;
        const statusComplete =
          progress?.status === "bestaetigt" || progress?.status === "ziel_erreicht";
        const countComplete = requiredCount > 0 ? verifiedCount >= requiredCount : false;
        const levelComplete =
          targetLevel !== null && targetLevel > 0
            ? (currentLevel ?? 0) >= targetLevel
            : false;
        const requirementComplete =
          requiredCount > 0 || (targetLevel !== null && targetLevel > 0)
            ? countComplete || levelComplete
            : statusComplete;

        acc.totalRequired += 1;
        acc.completed += requirementComplete ? 1 : 0;
        acc.verified += requirementComplete ? 1 : 0;
        acc.percentParts += rowSummary.percent;
        return acc;
      },
      {
        completed: 0,
        verified: 0,
        totalRequired: 0,
        percentParts: 0,
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
            <Progress value={visibleSummary.completionPercent} />
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
                        const target = formatRequirementTarget(requirement);
                        const progressSummary = getRequirementProgressSummary(
                          requirement,
                          progress,
                        );
                        return (
                          <div
                            key={requirement.id}
                            className="flex flex-col gap-2 rounded-lg bg-secondary/20 p-3 md:flex-row md:items-center md:justify-between"
                          >
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
                              <Badge>
                                {progressSummary.percent}%
                              </Badge>
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
