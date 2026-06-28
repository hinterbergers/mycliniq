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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  formatRequirementTarget,
  getRequirementProgressSummary,
  educationProgressStatusOptions,
} from "@/lib/education";

type DraftRow = {
  completedCount: string;
  verifiedCount: string;
  lastEntryLabel: string;
  currentLevel: string;
  status: "offen" | "begonnen" | "ziel_erreicht" | "bestaetigt" | "abgelaufen";
  lastEntryRole: string;
  lastEntryDate: string;
};

type ProfileDraft = {
  activeProgramId: string;
  moduleIds: number[];
  trainingStartDate: string;
  basicTrainingCompleted: boolean;
  expectedTrainingEndDate: string;
  examDate: string;
  examPassed: boolean;
  notes: string;
};

type TraineeRoleFilter = "all" | "assistenz" | "facharzt" | "turnus";

const roleMatchesFilter = (role: string | null | undefined, filter: TraineeRoleFilter) => {
  const normalized = String(role ?? "").toLowerCase();
  if (filter === "all") return true;
  if (filter === "assistenz") return normalized.includes("assistenz");
  if (filter === "facharzt") return normalized.includes("facharzt");
  if (filter === "turnus")
    return (
      normalized.includes("turnus") ||
      normalized.includes("kpj") ||
      normalized.includes("famul")
    );
  return true;
};

const isAssistenzRole = (role: string | null | undefined) =>
  String(role ?? "").toLowerCase().includes("assistenz");

export default function EducationTrainerCockpit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["education", "trainer"],
    queryFn: () => educationApi.getTrainerOverview(),
  });

  const [selectedTraineeId, setSelectedTraineeId] = useState<number | null>(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<number, DraftRow>>({});
  const [savingRequirementId, setSavingRequirementId] = useState<number | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [roleFilter, setRoleFilter] = useState<TraineeRoleFilter>("all");
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);

  const filteredTrainees = useMemo(
    () =>
      (data?.trainees ?? []).filter((trainee) =>
        roleMatchesFilter(trainee.role, roleFilter),
      ),
    [data?.trainees, roleFilter],
  );

  useEffect(() => {
    if (!selectedTraineeId && filteredTrainees.length > 0) {
      setSelectedTraineeId(filteredTrainees[0]?.id ?? null);
    }
  }, [filteredTrainees, selectedTraineeId]);

  useEffect(() => {
    if (
      selectedTraineeId &&
      !filteredTrainees.some((trainee) => trainee.id === selectedTraineeId)
    ) {
      setSelectedTraineeId(filteredTrainees[0]?.id ?? null);
    }
  }, [filteredTrainees, selectedTraineeId]);

  const selectedTrainee = useMemo(
    () =>
      filteredTrainees.find((trainee) => trainee.id === selectedTraineeId) ??
      null,
    [filteredTrainees, selectedTraineeId],
  );

  const selectedAssignment = useMemo(
    () =>
      (data?.assignments ?? []).find(
        (assignment) => assignment.traineeEmployeeId === selectedTraineeId,
      ) ?? null,
    [data?.assignments, selectedTraineeId],
  );

  useEffect(() => {
    setSelectedTrainerId(
      selectedAssignment ? String(selectedAssignment.trainerEmployeeId) : "",
    );
  }, [selectedAssignment]);

  useEffect(() => {
    const profile = selectedTrainee?.profile;
    setProfileDraft(
      selectedTrainee
        ? {
            activeProgramId: profile?.activeProgramId ? String(profile.activeProgramId) : "",
            moduleIds: Array.isArray(profile?.activeModuleIds)
              ? profile.activeModuleIds
              : [],
            trainingStartDate: String(profile?.trainingStartDate ?? ""),
            basicTrainingCompleted: Boolean(profile?.basicTrainingCompleted ?? false),
            expectedTrainingEndDate: String(profile?.expectedTrainingEndDate ?? ""),
            examDate: String(profile?.examDate ?? ""),
            examPassed: Boolean(profile?.examPassed ?? false),
            notes: String(profile?.notes ?? ""),
          }
        : null,
    );
  }, [selectedTrainee]);

  const activeProgramId = Number(profileDraft?.activeProgramId ?? 0);
  const assignedModuleIds = profileDraft?.moduleIds ?? [];

  const requirementRows = useMemo(() => {
    const progressMap = new Map(
      (data?.progress ?? [])
        .filter((row) => row.employeeId === selectedTraineeId)
        .map((row) => [row.requirementId, row]),
    );

    return (data?.catalog ?? [])
      .filter((program) => (activeProgramId > 0 ? program.id === activeProgramId : false))
      .flatMap((program) =>
        program.modules
          .filter((module) => assignedModuleIds.includes(module.id))
          .flatMap((module) =>
            module.requirements.map((requirement) => ({
              programTitle: program.title,
              moduleTitle: module.title,
              requirement,
              progress: progressMap.get(requirement.id) ?? null,
            })),
          ),
      );
  }, [activeProgramId, assignedModuleIds, data?.catalog, data?.progress, selectedTraineeId]);

  const modulesForSelectedProgram = useMemo(() => {
    const program = (data?.catalog ?? []).find((entry) => entry.id === activeProgramId);
    return program?.modules ?? [];
  }, [activeProgramId, data?.catalog]);

  const examDateIsPast = useMemo(() => {
    if (!profileDraft?.examDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(profileDraft.examDate) < today;
  }, [profileDraft?.examDate]);

  const setDraftField = (
    requirementId: number,
    field: keyof DraftRow,
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [requirementId]: {
        completedCount:
          current[requirementId]?.completedCount ??
          String(
            requirementRows.find((row) => row.requirement.id === requirementId)?.progress
              ?.completedCount ?? 0,
          ),
        verifiedCount:
          current[requirementId]?.verifiedCount ??
          String(
            requirementRows.find((row) => row.requirement.id === requirementId)?.progress
              ?.verifiedCount ?? 0,
          ),
        lastEntryLabel:
          current[requirementId]?.lastEntryLabel ??
          (requirementRows.find((row) => row.requirement.id === requirementId)?.progress
            ?.lastEntryLabel ??
            ""),
        currentLevel:
          current[requirementId]?.currentLevel ??
          String(
            requirementRows.find((row) => row.requirement.id === requirementId)?.progress
              ?.currentLevel ?? "",
          ),
        status:
          current[requirementId]?.status ??
          ((requirementRows.find((row) => row.requirement.id === requirementId)?.progress
            ?.status as DraftRow["status"] | undefined) ?? "offen"),
        lastEntryRole:
          current[requirementId]?.lastEntryRole ??
          (requirementRows.find((row) => row.requirement.id === requirementId)?.progress
            ?.lastEntryRole ??
            ""),
        lastEntryDate:
          current[requirementId]?.lastEntryDate ??
          (requirementRows.find((row) => row.requirement.id === requirementId)?.progress
            ?.lastEntryDate ??
            ""),
        [field]: value,
      },
    }));
  };

  const saveAssignment = async () => {
    if (!selectedTraineeId || !selectedTrainerId) return;
    await educationApi.upsertMentorAssignment({
      traineeEmployeeId: selectedTraineeId,
      trainerEmployeeId: Number(selectedTrainerId),
    });
    await queryClient.invalidateQueries({ queryKey: ["education", "trainer"] });
    toast({ title: "Ausbilder zugeordnet" });
  };

  const toggleAssignedModule = (moduleId: number, checked: boolean) => {
    setProfileDraft((current) =>
      current
        ? {
            ...current,
            moduleIds: checked
              ? Array.from(new Set([...current.moduleIds, moduleId]))
              : current.moduleIds.filter((id) => id !== moduleId),
          }
        : current,
    );
  };

  const saveProfile = async () => {
    if (!selectedTraineeId || !profileDraft) return;
    setSavingProfile(true);
    try {
      await educationApi.upsertProfile({
        employeeId: selectedTraineeId,
        activeProgramId: profileDraft.activeProgramId
          ? Number(profileDraft.activeProgramId)
          : null,
        moduleIds: profileDraft.moduleIds,
        trainingStartDate: profileDraft.trainingStartDate || null,
        basicTrainingCompleted: profileDraft.basicTrainingCompleted,
        expectedTrainingEndDate: isAssistenzRole(selectedTrainee?.role)
          ? profileDraft.expectedTrainingEndDate || null
          : null,
        examDate: isAssistenzRole(selectedTrainee?.role)
          ? profileDraft.examDate || null
          : null,
        examPassed:
          isAssistenzRole(selectedTrainee?.role) && examDateIsPast
            ? profileDraft.examPassed
            : false,
        notes: profileDraft.notes || "",
      });
      await queryClient.invalidateQueries({ queryKey: ["education", "trainer"] });
      await queryClient.invalidateQueries({ queryKey: ["education", "me"] });
      toast({ title: "Ausbildungsprofil gespeichert" });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveProgress = async (requirementId: number) => {
    if (!selectedTraineeId) return;
    const row = requirementRows.find((item) => item.requirement.id === requirementId);
    if (!row) return;
    const draft = drafts[requirementId];
    setSavingRequirementId(requirementId);
    try {
      await educationApi.upsertProgress({
        employeeId: selectedTraineeId,
        requirementId,
        completedCount: Number(draft?.completedCount ?? row.progress?.completedCount ?? 0),
        verifiedCount: Number(draft?.verifiedCount ?? row.progress?.verifiedCount ?? 0),
        lastEntryLabel: draft?.lastEntryLabel ?? row.progress?.lastEntryLabel ?? "",
        currentLevel: draft?.currentLevel ? Number(draft.currentLevel) : null,
        status:
          draft?.status ??
          ((row.progress?.status as DraftRow["status"] | undefined) ?? "offen"),
        lastEntryRole: draft?.lastEntryRole ?? row.progress?.lastEntryRole ?? "",
        lastEntryDate: draft?.lastEntryDate ?? row.progress?.lastEntryDate ?? "",
      });
      await queryClient.invalidateQueries({ queryKey: ["education", "trainer"] });
      toast({ title: "Fortschritt gespeichert" });
    } finally {
      setSavingRequirementId(null);
    }
  };

  if (isLoading) {
    return (
      <Layout title="Ausbilder-Cockpit">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Ausbilder-Cockpit">
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="border-none kabeg-shadow">
            <CardHeader>
              <CardTitle>Ausbildungsprofile</CardTitle>
              <CardDescription>
                Fortschritt ueber alle aktuell angelegten Soll-Leistungen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={roleFilter === "all" ? "default" : "outline"}
                  onClick={() => setRoleFilter("all")}
                >
                  Alle
                </Button>
                <Button
                  size="sm"
                  variant={roleFilter === "assistenz" ? "default" : "outline"}
                  onClick={() => setRoleFilter("assistenz")}
                >
                  Assistenz
                </Button>
                <Button
                  size="sm"
                  variant={roleFilter === "facharzt" ? "default" : "outline"}
                  onClick={() => setRoleFilter("facharzt")}
                >
                  Facharzt
                </Button>
                <Button
                  size="sm"
                  variant={roleFilter === "turnus" ? "default" : "outline"}
                  onClick={() => setRoleFilter("turnus")}
                >
                  Turnus
                </Button>
              </div>

              {filteredTrainees.map((trainee) => (
                <button
                  type="button"
                  key={trainee.id}
                  onClick={() => setSelectedTraineeId(trainee.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    trainee.id === selectedTraineeId
                      ? "border-primary bg-primary/5"
                      : "hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        {[trainee.lastName, trainee.firstName].filter(Boolean).join(" ")}
                      </div>
                      <div className="text-sm text-muted-foreground">{trainee.role}</div>
                    </div>
                    <Badge>{trainee.summary.completionPercent}%</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Progress value={trainee.summary.completionPercent} />
                    <div className="text-xs text-muted-foreground">
                      Bestaetigt {trainee.summary.verified} von{" "}
                      {trainee.summary.totalRequired}
                    </div>
                  </div>
                </button>
              ))}
              {filteredTrainees.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Keine Profile fuer den gewaelten Filter gefunden.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {selectedTrainee
                  ? `Detailstand: ${[selectedTrainee.lastName, selectedTrainee.firstName]
                      .filter(Boolean)
                      .join(" ")}`
                  : "Detailstand"}
              </CardTitle>
              <CardDescription>
                Einzelne Soll-Leistungen koennen hier manuell gepflegt und
                bestaetigt werden.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="w-full max-w-sm">
                  <div className="mb-2 text-sm font-medium">Zugeordneter Ausbilder</div>
                  <Select
                    value={selectedTrainerId}
                    onValueChange={setSelectedTrainerId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ausbilder waehlen" />
                    </SelectTrigger>
                    <SelectContent>
                      {(data?.trainers ?? []).map((trainer) => (
                        <SelectItem key={trainer.id} value={String(trainer.id)}>
                          {[trainer.lastName, trainer.firstName]
                            .filter(Boolean)
                            .join(" ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={saveAssignment}
                  disabled={!selectedTraineeId || !selectedTrainerId}
                >
                  Zuordnung speichern
                </Button>
              </div>

              {selectedTrainee && profileDraft ? (
                <div className="rounded-xl border p-4 space-y-4">
                  <div>
                    <div className="text-base font-semibold">Mitarbeitergespraech</div>
                    <div className="text-sm text-muted-foreground">
                      Aktuelle Fakten und naechste Ausbildungsschritte pro Person festlegen.
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Ausbildungsbeginn</div>
                      <Input
                        type="date"
                        value={profileDraft.trainingStartDate}
                        onChange={(event) =>
                          setProfileDraft((current) =>
                            current
                              ? { ...current, trainingStartDate: event.target.value }
                              : current,
                          )
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Programm</div>
                      <Select
                        value={profileDraft.activeProgramId || "__none__"}
                        onValueChange={(value) =>
                          setProfileDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  activeProgramId: value === "__none__" ? "" : value,
                                  moduleIds: [],
                                }
                              : current,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Programm waehlen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Noch kein Programm</SelectItem>
                          {(data?.catalog ?? []).map((program) => (
                            <SelectItem key={program.id} value={String(program.id)}>
                              {program.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {isAssistenzRole(selectedTrainee.role) ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">
                          Voraussichtliches Ausbildungsende
                        </div>
                        <Input
                          type="date"
                          value={profileDraft.expectedTrainingEndDate}
                          onChange={(event) =>
                            setProfileDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    expectedTrainingEndDate: event.target.value,
                                  }
                                : current,
                            )
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Pruefung</div>
                        <Input
                          type="date"
                          value={profileDraft.examDate}
                          onChange={(event) =>
                            setProfileDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    examDate: event.target.value,
                                    examPassed:
                                      event.target.value && examDateIsPast
                                        ? current.examPassed
                                        : false,
                                  }
                                : current,
                            )
                          }
                        />
                      </div>

                      <label className="flex items-center gap-3 rounded-lg border p-3">
                        <Checkbox
                          checked={profileDraft.basicTrainingCompleted}
                          onCheckedChange={(checked) =>
                            setProfileDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    basicTrainingCompleted: checked === true,
                                  }
                                : current,
                            )
                          }
                        />
                        <span className="text-sm font-medium">
                          Basisausbildung abgeschlossen
                        </span>
                      </label>

                      {examDateIsPast ? (
                        <label className="flex items-center gap-3 rounded-lg border p-3">
                          <Checkbox
                            checked={profileDraft.examPassed}
                            onCheckedChange={(checked) =>
                              setProfileDraft((current) =>
                                current
                                  ? { ...current, examPassed: checked === true }
                                  : current,
                              )
                            }
                          />
                          <span className="text-sm font-medium">Pruefung bestanden</span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Naechste Module</div>
                    {modulesForSelectedProgram.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {modulesForSelectedProgram.map((module) => (
                          <label
                            key={module.id}
                            className="flex items-start gap-3 rounded-lg border p-3"
                          >
                            <Checkbox
                              checked={profileDraft.moduleIds.includes(module.id)}
                              onCheckedChange={(checked) =>
                                toggleAssignedModule(module.id, checked === true)
                              }
                            />
                            <div>
                              <div className="font-medium">{module.title}</div>
                              <div className="text-sm text-muted-foreground">
                                {module.description || "Noch keine Modulbeschreibung."}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                        Zuerst ein Programm waehlen, dann koennen ein oder mehrere Module
                        zugeordnet werden.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Notizen</div>
                    <Textarea
                      value={profileDraft.notes}
                      onChange={(event) =>
                        setProfileDraft((current) =>
                          current ? { ...current, notes: event.target.value } : current,
                        )
                      }
                      placeholder="Ziele, Gespraechsnotizen oder naechste Schritte"
                    />
                  </div>

                  <Button onClick={saveProfile} disabled={savingProfile}>
                    {savingProfile ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Ausbildungsprofil speichern
                  </Button>
                </div>
              ) : null}

              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Katalogpunkt</TableHead>
                      <TableHead>Soll</TableHead>
                      <TableHead>Erfasst</TableHead>
                      <TableHead>Bestaetigt</TableHead>
                      <TableHead>Level / Status</TableHead>
                      <TableHead>Letzter Eintrag</TableHead>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requirementRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-sm text-muted-foreground">
                          Fuer diese Person sind noch keine Module im aktuellen Programm
                          zugeordnet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {requirementRows.map((row) => {
                      const draft = drafts[row.requirement.id];
                      const target = formatRequirementTarget(row.requirement);
                      const progressSummary = getRequirementProgressSummary(
                        row.requirement,
                        row.progress,
                      );
                      return (
                        <TableRow key={row.requirement.id}>
                          <TableCell>
                            <div className="font-medium">{row.requirement.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.programTitle} / {row.moduleTitle}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>{target.targetLabel}</div>
                            <div className="text-xs text-muted-foreground">
                              {target.typeLabel}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={
                                draft?.completedCount ??
                                String(row.progress?.completedCount ?? 0)
                              }
                              onChange={(event) =>
                                setDraftField(
                                  row.requirement.id,
                                  "completedCount",
                                  event.target.value,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={
                                draft?.verifiedCount ??
                                String(row.progress?.verifiedCount ?? 0)
                              }
                              onChange={(event) =>
                                setDraftField(
                                  row.requirement.id,
                                  "verifiedCount",
                                  event.target.value,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <div className="grid gap-2">
                              {typeof row.requirement.targetLevel === "number" ? (
                                <Input
                                  type="number"
                                  min="0"
                                  max="5"
                                  value={
                                    draft?.currentLevel ??
                                    String(row.progress?.currentLevel ?? "")
                                  }
                                  onChange={(event) =>
                                    setDraftField(
                                      row.requirement.id,
                                      "currentLevel",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Level"
                                />
                              ) : null}
                              <Select
                                value={
                                  draft?.status ??
                                  ((row.progress?.status as DraftRow["status"] | undefined) ??
                                    "offen")
                                }
                                onValueChange={(value) =>
                                  setDraftField(
                                    row.requirement.id,
                                    "status",
                                    value,
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  {educationProgressStatusOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="grid gap-2">
                            <Input
                              value={
                                draft?.lastEntryLabel ??
                                row.progress?.lastEntryLabel ??
                                ""
                              }
                              onChange={(event) =>
                                setDraftField(
                                  row.requirement.id,
                                  "lastEntryLabel",
                                  event.target.value,
                                )
                              }
                              placeholder="z. B. OP-Liste Mai"
                            />
                              <div className="grid gap-2 md:grid-cols-2">
                                <Input
                                  value={
                                    draft?.lastEntryRole ??
                                    row.progress?.lastEntryRole ??
                                    ""
                                  }
                                  onChange={(event) =>
                                    setDraftField(
                                      row.requirement.id,
                                      "lastEntryRole",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Rolle, z. B. 1. Assistenz"
                                />
                                <Input
                                  type="date"
                                  value={
                                    draft?.lastEntryDate ??
                                    row.progress?.lastEntryDate ??
                                    ""
                                  }
                                  onChange={(event) =>
                                    setDraftField(
                                      row.requirement.id,
                                      "lastEntryDate",
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {progressSummary.detailLabel}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => saveProgress(row.requirement.id)}
                              disabled={!selectedTraineeId}
                            >
                              {savingRequirementId === row.requirement.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {requirementRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-muted-foreground">
                          Noch keine Katalogeintraege vorhanden.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
