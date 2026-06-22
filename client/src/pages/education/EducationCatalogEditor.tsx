import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import {
  educationApi,
  type EducationCatalogProgram,
  type EducationEvent,
  type EducationProfileOverview,
} from "@/lib/api";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, Loader2, Pencil, Plus, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type EditableProgram = {
  title: string;
  description: string;
  targetRole: string;
};

type EditableModule = {
  programId: string;
  title: string;
  description: string;
};

type EditableRequirement = {
  moduleId: string;
  title: string;
  category: string;
  requiredCount: string;
  unitLabel: string;
  description: string;
  matchingHints: string;
};

type EditableEvent = {
  title: string;
  eventType: string;
  location: string;
  externalUrl: string;
  description: string;
  targetRole: string;
  startsAt: string;
  endsAt: string;
  maxApprovals: string;
  status: "draft" | "published" | "archived";
};

type EditableProfile = {
  trainingStartDate: string;
  basicTrainingCompleted: boolean;
  expectedTrainingEndDate: string;
  examDate: string;
  examPassed: boolean;
  notes: string;
};

const buildProgramDraft = (
  program: EducationCatalogProgram,
): EditableProgram => ({
  title: program.title ?? "",
  description: program.description ?? "",
  targetRole: program.targetRole ?? "",
});

const buildModuleDraft = (
  programId: number,
  module: EducationCatalogProgram["modules"][number],
): EditableModule => ({
  programId: String(programId),
  title: module.title ?? "",
  description: module.description ?? "",
});

const buildRequirementDraft = (
  moduleId: number,
  requirement: EducationCatalogProgram["modules"][number]["requirements"][number],
): EditableRequirement => ({
  moduleId: String(moduleId),
  title: requirement.title ?? "",
  category: requirement.category ?? "",
  requiredCount: String(requirement.requiredCount ?? 0),
  unitLabel: requirement.unitLabel ?? "Anzahl",
  description: requirement.description ?? "",
  matchingHints: (requirement.matchingHints ?? []).join("\n"),
});

const buildEventDraft = (event: EducationEvent): EditableEvent => ({
  title: event.title ?? "",
  eventType: event.eventType ?? "Fortbildung",
  location: event.location ?? "",
  externalUrl: event.externalUrl ?? "",
  description: event.description ?? "",
  targetRole: event.targetRole ?? "",
  startsAt: String(event.startsAt ?? ""),
  endsAt: String(event.endsAt ?? ""),
  maxApprovals:
    typeof event.maxApprovals === "number" ? String(event.maxApprovals) : "",
  status: (event.status as EditableEvent["status"]) ?? "published",
});

const buildProfileDraft = (
  profileEntry: EducationProfileOverview | null | undefined,
): EditableProfile => ({
  trainingStartDate: String(profileEntry?.profile?.trainingStartDate ?? ""),
  basicTrainingCompleted: Boolean(
    profileEntry?.profile?.basicTrainingCompleted ?? false,
  ),
  expectedTrainingEndDate: String(
    profileEntry?.profile?.expectedTrainingEndDate ?? "",
  ),
  examDate: String(profileEntry?.profile?.examDate ?? ""),
  examPassed: Boolean(profileEntry?.profile?.examPassed ?? false),
  notes: String(profileEntry?.profile?.notes ?? ""),
});

export default function EducationCatalogEditor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ["education", "catalog"],
    queryFn: () => educationApi.getCatalog(),
  });
  const { data: events = [] } = useQuery({
    queryKey: ["education", "events"],
    queryFn: () => educationApi.getEvents(),
  });
  const { data: eventRequests = [] } = useQuery({
    queryKey: ["education", "event-requests"],
    queryFn: () => educationApi.getEventRequests(),
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["education", "profiles"],
    queryFn: () => educationApi.getProfiles(),
  });

  const [programTitle, setProgramTitle] = useState("");
  const [programDescription, setProgramDescription] = useState("");
  const [programTargetRole, setProgramTargetRole] = useState("Assistenzarzt");
  const [moduleProgramId, setModuleProgramId] = useState<string>("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [requirementModuleId, setRequirementModuleId] = useState<string>("");
  const [requirementTitle, setRequirementTitle] = useState("");
  const [requirementCategory, setRequirementCategory] = useState("");
  const [requirementCount, setRequirementCount] = useState("1");
  const [requirementHints, setRequirementHints] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType] = useState("Fortbildung");
  const [eventLocation, setEventLocation] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventTargetRole, setEventTargetRole] = useState("Assistenzarzt");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [eventMaxApprovals, setEventMaxApprovals] = useState("");
  const [saving, setSaving] = useState<
    null | "program" | "module" | "requirement" | "event"
  >(null);

  const [editingProgramId, setEditingProgramId] = useState<number | null>(null);
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [editingRequirementId, setEditingRequirementId] = useState<number | null>(
    null,
  );
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [programDraft, setProgramDraft] = useState<EditableProgram | null>(null);
  const [moduleDraft, setModuleDraft] = useState<EditableModule | null>(null);
  const [requirementDraft, setRequirementDraft] =
    useState<EditableRequirement | null>(null);
  const [eventDraft, setEventDraft] = useState<EditableEvent | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [decidingRequestId, setDecidingRequestId] = useState<number | null>(null);
  const [requestDecisionNotes, setRequestDecisionNotes] = useState<
    Record<number, string>
  >({});
  const [requestCostCoverage, setRequestCostCoverage] = useState<
    Record<number, boolean>
  >({});
  const [selectedProfileEmployeeId, setSelectedProfileEmployeeId] = useState<string>("");
  const [profileDraft, setProfileDraft] = useState<EditableProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const moduleOptions = useMemo(
    () =>
      catalog.flatMap((program) =>
        program.modules.map((module) => ({
          value: String(module.id),
          label: `${program.title} / ${module.title}`,
        })),
      ),
    [catalog],
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["education", "catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["education", "events"] }),
      queryClient.invalidateQueries({ queryKey: ["education", "event-requests"] }),
      queryClient.invalidateQueries({ queryKey: ["education", "profiles"] }),
      queryClient.invalidateQueries({ queryKey: ["education", "me"] }),
    ]);
  };

  const selectedProfileEntry = useMemo(
    () =>
      profiles.find(
        (entry) => String(entry.employee.id) === String(selectedProfileEmployeeId),
      ) ?? null,
    [profiles, selectedProfileEmployeeId],
  );

  const examDateIsPast = useMemo(() => {
    if (!profileDraft?.examDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(profileDraft.examDate) < today;
  }, [profileDraft?.examDate]);

  const profileSummary = useMemo(
    () =>
      profiles.filter((entry) => entry.profile).map((entry) => ({
        id: entry.employee.id,
        name: [entry.employee.lastName, entry.employee.firstName]
          .filter(Boolean)
          .join(" "),
        role: entry.employee.role,
        profile: entry.profile,
      })),
    [profiles],
  );

  useEffect(() => {
    if (!selectedProfileEmployeeId && profiles.length > 0) {
      setSelectedProfileEmployeeId(String(profiles[0]!.employee.id));
    }
  }, [profiles, selectedProfileEmployeeId]);

  useEffect(() => {
    if (!selectedProfileEntry) {
      setProfileDraft(null);
      return;
    }
    setProfileDraft(buildProfileDraft(selectedProfileEntry));
  }, [selectedProfileEntry]);

  const handleCreateProgram = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!programTitle.trim()) return;
    setSaving("program");
    try {
      await educationApi.createProgram({
        title: programTitle.trim(),
        description: programDescription.trim() || undefined,
        targetRole: programTargetRole.trim() || undefined,
      });
      setProgramTitle("");
      setProgramDescription("");
      await refresh();
      toast({ title: "Programm angelegt" });
    } finally {
      setSaving(null);
    }
  };

  const handleCreateModule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!moduleProgramId || !moduleTitle.trim()) return;
    setSaving("module");
    try {
      await educationApi.createModule({
        programId: Number(moduleProgramId),
        title: moduleTitle.trim(),
        description: moduleDescription.trim() || undefined,
      });
      setModuleTitle("");
      setModuleDescription("");
      await refresh();
      toast({ title: "Modul angelegt" });
    } finally {
      setSaving(null);
    }
  };

  const handleCreateRequirement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requirementModuleId || !requirementTitle.trim()) return;
    setSaving("requirement");
    try {
      await educationApi.createRequirement({
        moduleId: Number(requirementModuleId),
        title: requirementTitle.trim(),
        category: requirementCategory.trim() || undefined,
        requiredCount: Number(requirementCount) || 0,
        matchingHints: requirementHints
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setRequirementTitle("");
      setRequirementCategory("");
      setRequirementCount("1");
      setRequirementHints("");
      await refresh();
      toast({ title: "Anforderung angelegt" });
    } finally {
      setSaving(null);
    }
  };

  const handleCreateEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventTitle.trim() || !eventStartsAt || !eventEndsAt) return;
    setSaving("event");
    try {
      await educationApi.createEvent({
        title: eventTitle.trim(),
        eventType: eventType.trim() || "Fortbildung",
        location: eventLocation.trim() || undefined,
        externalUrl: eventUrl.trim() || undefined,
        description: eventDescription.trim() || undefined,
        targetRole: eventTargetRole.trim() || undefined,
        startsAt: eventStartsAt,
        endsAt: eventEndsAt,
        maxApprovals: eventMaxApprovals ? Number(eventMaxApprovals) : null,
        status: "published",
      });
      setEventTitle("");
      setEventType("Fortbildung");
      setEventLocation("");
      setEventUrl("");
      setEventDescription("");
      setEventTargetRole("Assistenzarzt");
      setEventStartsAt("");
      setEventEndsAt("");
      setEventMaxApprovals("");
      await refresh();
      toast({ title: "Fortbildung angelegt" });
    } finally {
      setSaving(null);
    }
  };

  const startProgramEdit = (program: EducationCatalogProgram) => {
    setEditingProgramId(program.id);
    setEditingModuleId(null);
    setEditingRequirementId(null);
    setProgramDraft(buildProgramDraft(program));
  };

  const startModuleEdit = (
    program: EducationCatalogProgram,
    module: EducationCatalogProgram["modules"][number],
  ) => {
    setEditingProgramId(null);
    setEditingModuleId(module.id);
    setEditingRequirementId(null);
    setModuleDraft(buildModuleDraft(program.id, module));
  };

  const startRequirementEdit = (
    moduleId: number,
    requirement: EducationCatalogProgram["modules"][number]["requirements"][number],
  ) => {
    setEditingProgramId(null);
    setEditingModuleId(null);
    setEditingRequirementId(requirement.id);
    setRequirementDraft(buildRequirementDraft(moduleId, requirement));
  };

  const cancelEdit = () => {
    setEditingProgramId(null);
    setEditingModuleId(null);
    setEditingRequirementId(null);
    setEditingEventId(null);
    setProgramDraft(null);
    setModuleDraft(null);
    setRequirementDraft(null);
    setEventDraft(null);
    setUpdatingId(null);
  };

  const startEventEdit = (event: EducationEvent) => {
    setEditingProgramId(null);
    setEditingModuleId(null);
    setEditingRequirementId(null);
    setEditingEventId(event.id);
    setEventDraft(buildEventDraft(event));
  };

  const saveProgramEdit = async (programId: number) => {
    if (!programDraft || !programDraft.title.trim()) return;
    setUpdatingId(programId);
    try {
      await educationApi.updateProgram(programId, {
        title: programDraft.title.trim(),
        description: programDraft.description.trim() || "",
        targetRole: programDraft.targetRole.trim() || "",
      });
      await refresh();
      cancelEdit();
      toast({ title: "Programm aktualisiert" });
    } finally {
      setUpdatingId(null);
    }
  };

  const saveModuleEdit = async (moduleId: number) => {
    if (!moduleDraft || !moduleDraft.title.trim() || !moduleDraft.programId) return;
    setUpdatingId(moduleId);
    try {
      await educationApi.updateModule(moduleId, {
        programId: Number(moduleDraft.programId),
        title: moduleDraft.title.trim(),
        description: moduleDraft.description.trim() || "",
      });
      await refresh();
      cancelEdit();
      toast({ title: "Modul aktualisiert" });
    } finally {
      setUpdatingId(null);
    }
  };

  const saveRequirementEdit = async (requirementId: number) => {
    if (!requirementDraft || !requirementDraft.title.trim() || !requirementDraft.moduleId)
      return;
    setUpdatingId(requirementId);
    try {
      await educationApi.updateRequirement(requirementId, {
        moduleId: Number(requirementDraft.moduleId),
        title: requirementDraft.title.trim(),
        category: requirementDraft.category.trim() || "",
        description: requirementDraft.description.trim() || "",
        requiredCount: Number(requirementDraft.requiredCount) || 0,
        unitLabel: requirementDraft.unitLabel.trim() || "Anzahl",
        matchingHints: requirementDraft.matchingHints
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      await refresh();
      cancelEdit();
      toast({ title: "Soll-Leistung aktualisiert" });
    } finally {
      setUpdatingId(null);
    }
  };

  const saveEventEdit = async (eventId: number) => {
    if (!eventDraft || !eventDraft.title.trim() || !eventDraft.startsAt || !eventDraft.endsAt)
      return;
    setUpdatingId(eventId);
    try {
      await educationApi.updateEvent(eventId, {
        title: eventDraft.title.trim(),
        eventType: eventDraft.eventType.trim() || "Fortbildung",
        location: eventDraft.location.trim() || "",
        externalUrl: eventDraft.externalUrl.trim() || "",
        description: eventDraft.description.trim() || "",
        targetRole: eventDraft.targetRole.trim() || "",
        startsAt: eventDraft.startsAt,
        endsAt: eventDraft.endsAt,
        maxApprovals: eventDraft.maxApprovals
          ? Number(eventDraft.maxApprovals)
          : null,
        status: eventDraft.status,
      });
      await refresh();
      cancelEdit();
      toast({ title: "Fortbildung aktualisiert" });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDecision = async (
    requestId: number,
    status: "approved" | "rejected",
  ) => {
    setDecidingRequestId(requestId);
    try {
      await educationApi.decideEventRequest(requestId, {
        status,
        decisionNote: requestDecisionNotes[requestId]?.trim() || undefined,
        costCoveredByDepartment:
          status === "approved" ? Boolean(requestCostCoverage[requestId]) : false,
      });
      await refresh();
      toast({
        title:
          status === "approved"
            ? "Fortbildungsanfrage genehmigt"
            : "Fortbildungsanfrage abgelehnt",
      });
    } finally {
      setDecidingRequestId(null);
    }
  };

  const handleSaveProfile = async () => {
    if (!selectedProfileEntry || !profileDraft) return;
    setSavingProfile(true);
    try {
      await educationApi.upsertProfile({
        employeeId: selectedProfileEntry.employee.id,
        trainingStartDate: profileDraft.trainingStartDate || null,
        basicTrainingCompleted: profileDraft.basicTrainingCompleted,
        expectedTrainingEndDate: profileDraft.expectedTrainingEndDate || null,
        examDate: profileDraft.examDate || null,
        examPassed: examDateIsPast ? profileDraft.examPassed : false,
        notes: profileDraft.notes.trim() || "",
      });
      await refresh();
      toast({ title: "Ausbildungsprofil gespeichert" });
    } finally {
      setSavingProfile(false);
    }
  };

  if (isLoading) {
    return (
      <Layout title="Ausbildungs-Editor">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Ausbildungs-Editor">
      <Tabs defaultValue="events" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="events">Fortbildungen und Kongresse</TabsTrigger>
          <TabsTrigger value="profiles">Ausbildungsprofil</TabsTrigger>
          <TabsTrigger value="structure">Struktur</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-6">
          <Card className="border-none kabeg-shadow">
          <CardHeader>
            <CardTitle>Fortbildungen und Kongresse</CardTitle>
            <CardDescription>
              Ausschreibungen fuer Fortbildungen, Kongresse und externe
              Weiterbildungen. Interessensanfragen erscheinen darunter zur
              Freigabe inklusive Abwesenheitskontext und Fortbildungsurlaub.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <form onSubmit={handleCreateEvent} className="space-y-3">
                <Input
                  placeholder="Name der Fortbildung"
                  value={eventTitle}
                  onChange={(event) => setEventTitle(event.target.value)}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Typ, z. B. Kongress"
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value)}
                  />
                  <Input
                    placeholder="Ort"
                    value={eventLocation}
                    onChange={(event) => setEventLocation(event.target.value)}
                  />
                </div>
                <Input
                  placeholder="Link zur Fortbildung"
                  value={eventUrl}
                  onChange={(event) => setEventUrl(event.target.value)}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Zielrolle"
                    value={eventTargetRole}
                    onChange={(event) => setEventTargetRole(event.target.value)}
                  />
                  <Input
                    type="number"
                    min="1"
                    placeholder="Max. Genehmigungen"
                    value={eventMaxApprovals}
                    onChange={(event) => setEventMaxApprovals(event.target.value)}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    type="date"
                    value={eventStartsAt}
                    onChange={(event) => setEventStartsAt(event.target.value)}
                  />
                  <Input
                    type="date"
                    value={eventEndsAt}
                    onChange={(event) => setEventEndsAt(event.target.value)}
                  />
                </div>
                <Textarea
                  placeholder="Beschreibung"
                  value={eventDescription}
                  onChange={(event) => setEventDescription(event.target.value)}
                />
                <Button type="submit" disabled={saving !== null}>
                  <Plus className="mr-2 h-4 w-4" />
                  Fortbildung anlegen
                </Button>
              </form>

              <div className="space-y-3">
                <div className="font-semibold">Anfragen</div>
                {eventRequests.map((request) => {
                  const isPending = request.status === "interested";
                  const requestName = [
                    request.employee?.lastName,
                    request.employee?.firstName,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div key={request.id} className="rounded-xl border p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{request.event.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {requestName || "Unbekannt"} ·{" "}
                            {request.employee?.role ?? "ohne Rolle"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {request.event.startsAt} bis {request.event.endsAt}
                          </div>
                        </div>
                        <Badge variant="outline">{request.status}</Badge>
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div>
                          Fortbildungsurlaub konsumiert:{" "}
                          {request.metrics.consumedFortbildungDays} Tage
                        </div>
                        <div>
                          Bereits abwesend im Zeitraum:{" "}
                          {request.metrics.absentInPeriodCount}
                        </div>
                        <div>
                          Bereits genehmigt fuer diese Fortbildung:{" "}
                          {request.metrics.approvedCount}
                          {typeof request.event.maxApprovals === "number"
                            ? ` / ${request.event.maxApprovals}`
                            : ""}
                        </div>
                      </div>
                      <Textarea
                        placeholder="Entscheidungsnotiz"
                        value={requestDecisionNotes[request.id] ?? request.decisionNote ?? ""}
                        onChange={(event) =>
                          setRequestDecisionNotes((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                      />
                      <label className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={
                            requestCostCoverage[request.id] ??
                            request.costCoveredByDepartment
                          }
                          onCheckedChange={(checked) =>
                            setRequestCostCoverage((current) => ({
                              ...current,
                              [request.id]: checked === true,
                            }))
                          }
                          disabled={!isPending}
                        />
                        Kosten werden von der Abteilung uebernommen
                      </label>
                      {request.interestNote && (
                        <div className="rounded-lg bg-secondary/30 p-3 text-sm text-muted-foreground">
                          Anfrage: {request.interestNote}
                        </div>
                      )}
                      {isPending ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleDecision(request.id, "approved")}
                            disabled={decidingRequestId === request.id}
                          >
                            {decidingRequestId === request.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Genehmigen"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDecision(request.id, "rejected")}
                            disabled={decidingRequestId === request.id}
                          >
                            Ablehnen
                          </Button>
                        </div>
                      ) : request.decisionNote ? (
                        <div className="text-sm text-muted-foreground">
                          Entscheidung: {request.decisionNote}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {eventRequests.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Noch keine Interessensanfragen vorhanden.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-semibold">Ausgeschriebene Fortbildungen</div>
              {events.map((event) => (
                <div key={event.id} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    {editingEventId === event.id && eventDraft ? (
                      <div className="w-full space-y-3">
                        <Input
                          value={eventDraft.title}
                          onChange={(editEvent) =>
                            setEventDraft((current) =>
                              current
                                ? { ...current, title: editEvent.target.value }
                                : current,
                            )
                          }
                        />
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            value={eventDraft.eventType}
                            onChange={(editEvent) =>
                              setEventDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      eventType: editEvent.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                          <Input
                            value={eventDraft.location}
                            onChange={(editEvent) =>
                              setEventDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      location: editEvent.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                        </div>
                        <Input
                          value={eventDraft.externalUrl}
                          onChange={(editEvent) =>
                            setEventDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    externalUrl: editEvent.target.value,
                                  }
                                : current,
                            )
                          }
                        />
                        <div className="grid gap-3 md:grid-cols-3">
                          <Input
                            value={eventDraft.targetRole}
                            onChange={(editEvent) =>
                              setEventDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      targetRole: editEvent.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                          <Input
                            type="number"
                            min="1"
                            value={eventDraft.maxApprovals}
                            onChange={(editEvent) =>
                              setEventDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      maxApprovals: editEvent.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                          <Select
                            value={eventDraft.status}
                            onValueChange={(value) =>
                              setEventDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      status: value as EditableEvent["status"],
                                    }
                                  : current,
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Entwurf</SelectItem>
                              <SelectItem value="published">Freigegeben</SelectItem>
                              <SelectItem value="archived">Archiviert</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            type="date"
                            value={eventDraft.startsAt}
                            onChange={(editEvent) =>
                              setEventDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      startsAt: editEvent.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                          <Input
                            type="date"
                            value={eventDraft.endsAt}
                            onChange={(editEvent) =>
                              setEventDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      endsAt: editEvent.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                        </div>
                        <Textarea
                          value={eventDraft.description}
                          onChange={(editEvent) =>
                            setEventDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    description: editEvent.target.value,
                                  }
                                : current,
                            )
                          }
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold">{event.title}</div>
                          <Badge variant="outline">{event.status}</Badge>
                          <Badge variant="secondary">
                            {event.eventType || "Fortbildung"}
                          </Badge>
                          {event.targetRole ? (
                            <Badge variant="secondary">{event.targetRole}</Badge>
                          ) : null}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {[event.location, `${event.startsAt} bis ${event.endsAt}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        {typeof event.maxApprovals === "number" ? (
                          <div className="text-sm text-muted-foreground">
                            Max. Genehmigungen: {event.maxApprovals}
                          </div>
                        ) : null}
                        {event.description ? (
                          <div className="text-sm text-muted-foreground">
                            {event.description}
                          </div>
                        ) : null}
                        {event.externalUrl ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={event.externalUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Link oeffnen
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {editingEventId === event.id ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void saveEventEdit(event.id)}
                            disabled={updatingId === event.id}
                          >
                            {updatingId === event.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEventEdit(event)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Noch keine Fortbildungen oder Kongresse angelegt.
                </p>
              )}
            </div>
          </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profiles" className="space-y-6">
          <Card className="border-none kabeg-shadow">
            <CardHeader>
              <CardTitle>Ausbildungsprofil pro Person</CardTitle>
            <CardDescription>
              Personenbezogene Eckdaten fuer die Ausbildung: Beginn,
              Basisausbildung, voraussichtliches Ende und Pruefung.
            </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="font-semibold">Mitarbeitende</div>
              <Select
                value={selectedProfileEmployeeId}
                onValueChange={setSelectedProfileEmployeeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Person waehlen" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((entry) => (
                    <SelectItem
                      key={entry.employee.id}
                      value={String(entry.employee.id)}
                    >
                      {[entry.employee.lastName, entry.employee.firstName]
                        .filter(Boolean)
                        .join(" ")}
                      {entry.employee.role ? ` · ${entry.employee.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-2">
                {profileSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Noch keine Ausbildungsprofile hinterlegt.
                  </p>
                ) : (
                  profileSummary.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      onClick={() => setSelectedProfileEmployeeId(String(entry.id))}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        String(entry.id) === selectedProfileEmployeeId
                          ? "border-primary bg-primary/5"
                          : "hover:bg-secondary/30"
                      }`}
                    >
                      <div className="font-medium">{entry.name || "Unbekannt"}</div>
                      <div className="text-sm text-muted-foreground">
                        {entry.role || "ohne Rolle"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.profile?.trainingStartDate ? (
                          <Badge variant="secondary">
                            Start {entry.profile.trainingStartDate}
                          </Badge>
                        ) : null}
                        {entry.profile?.basicTrainingCompleted ? (
                          <Badge variant="secondary">Basisausbildung Ja</Badge>
                        ) : null}
                        {entry.profile?.examPassed ? (
                          <Badge variant="secondary">Pruefung bestanden</Badge>
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4">
              {selectedProfileEntry && profileDraft ? (
                <>
                  <div>
                    <div className="text-lg font-semibold">
                      {[selectedProfileEntry.employee.lastName, selectedProfileEntry.employee.firstName]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {selectedProfileEntry.employee.role || "ohne Rolle"}
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
                              ? {
                                  ...current,
                                  trainingStartDate: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </div>
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
                  </div>

                  <label className="flex items-center gap-3 text-sm">
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
                    Basisausbildung abgeschlossen
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
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
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Pruefungsstatus</div>
                      {examDateIsPast ? (
                        <label className="flex min-h-10 items-center gap-3 rounded-md border px-3">
                          <Checkbox
                            checked={profileDraft.examPassed}
                            onCheckedChange={(checked) =>
                              setProfileDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      examPassed: checked === true,
                                    }
                                  : current,
                              )
                            }
                          />
                          Bestanden
                        </label>
                      ) : null}
                    </div>
                  </div>

                  <Textarea
                    placeholder="Notizen zur Ausbildung"
                    value={profileDraft.notes}
                    onChange={(event) =>
                      setProfileDraft((current) =>
                        current
                          ? {
                              ...current,
                              notes: event.target.value,
                            }
                          : current,
                      )
                    }
                  />

                  <Button onClick={() => void handleSaveProfile()} disabled={savingProfile}>
                    {savingProfile ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Profil speichern
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Keine Person fuer das Ausbildungsprofil ausgewaehlt.
                </p>
              )}
            </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="structure" className="space-y-6">
          <Card className="border-none kabeg-shadow">
            <CardHeader>
              <CardTitle>Struktur anlegen</CardTitle>
              <CardDescription>
                Hier wird nur die Ausbildungsstruktur vorbereitet: Programme,
                Module und Soll-Leistungen. Inhalte aus den Unterlagen werden
                bewusst nicht automatisch uebernommen.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-3">
              <form onSubmit={handleCreateProgram} className="space-y-3">
                <div className="font-semibold">1. Programm</div>
                <Input
                  placeholder="z. B. Facharztausbildung Gyn"
                  value={programTitle}
                  onChange={(event) => setProgramTitle(event.target.value)}
                />
                <Input
                  placeholder="Zielrolle"
                  value={programTargetRole}
                  onChange={(event) => setProgramTargetRole(event.target.value)}
                />
                <Textarea
                  placeholder="Beschreibung"
                  value={programDescription}
                  onChange={(event) => setProgramDescription(event.target.value)}
                />
                <Button type="submit" disabled={saving !== null}>
                  <Plus className="mr-2 h-4 w-4" />
                  Programm anlegen
                </Button>
              </form>

              <form onSubmit={handleCreateModule} className="space-y-3">
                <div className="font-semibold">2. Modul</div>
                <Select value={moduleProgramId} onValueChange={setModuleProgramId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Programm waehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((program) => (
                      <SelectItem key={program.id} value={String(program.id)}>
                        {program.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="z. B. Operatives Modul 1"
                  value={moduleTitle}
                  onChange={(event) => setModuleTitle(event.target.value)}
                />
                <Textarea
                  placeholder="Modulbeschreibung"
                  value={moduleDescription}
                  onChange={(event) => setModuleDescription(event.target.value)}
                />
                <Button type="submit" disabled={saving !== null || !moduleProgramId}>
                  <Plus className="mr-2 h-4 w-4" />
                  Modul anlegen
                </Button>
              </form>

              <form onSubmit={handleCreateRequirement} className="space-y-3">
                <div className="font-semibold">3. Soll-Leistung</div>
                <Select
                  value={requirementModuleId}
                  onValueChange={setRequirementModuleId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Modul waehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    {moduleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="z. B. Sectio caesarea"
                  value={requirementTitle}
                  onChange={(event) => setRequirementTitle(event.target.value)}
                />
                <Input
                  placeholder="Kategorie"
                  value={requirementCategory}
                  onChange={(event) => setRequirementCategory(event.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="Anzahl"
                  value={requirementCount}
                  onChange={(event) => setRequirementCount(event.target.value)}
                />
                <Textarea
                  placeholder="Alternative Bezeichnungen, je Zeile eine"
                  value={requirementHints}
                  onChange={(event) => setRequirementHints(event.target.value)}
                />
                <Button
                  type="submit"
                  disabled={saving !== null || !requirementModuleId}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Leistung anlegen
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {catalog.map((program) => (
              <Card key={program.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  {editingProgramId === program.id && programDraft ? (
                    <div className="w-full space-y-3">
                      <Input
                        value={programDraft.title}
                        onChange={(event) =>
                          setProgramDraft((current) =>
                            current
                              ? { ...current, title: event.target.value }
                              : current,
                          )
                        }
                      />
                      <Input
                        value={programDraft.targetRole}
                        onChange={(event) =>
                          setProgramDraft((current) =>
                            current
                              ? { ...current, targetRole: event.target.value }
                              : current,
                          )
                        }
                      />
                      <Textarea
                        value={programDraft.description}
                        onChange={(event) =>
                          setProgramDraft((current) =>
                            current
                              ? { ...current, description: event.target.value }
                              : current,
                          )
                        }
                      />
                    </div>
                  ) : (
                    <div>
                      <CardTitle>{program.title}</CardTitle>
                      <CardDescription>
                        {program.description || "Noch keine Beschreibung."}
                      </CardDescription>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {editingProgramId === program.id ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void saveProgramEdit(program.id)}
                          disabled={updatingId === program.id}
                        >
                          {updatingId === program.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline">
                          {program.targetRole || "offen"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startProgramEdit(program)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {program.modules.map((module) => (
                  <div key={module.id} className="rounded-xl border p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      {editingModuleId === module.id && moduleDraft ? (
                        <div className="w-full space-y-3">
                          <Select
                            value={moduleDraft.programId}
                            onValueChange={(value) =>
                              setModuleDraft((current) =>
                                current ? { ...current, programId: value } : current,
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Programm waehlen" />
                            </SelectTrigger>
                            <SelectContent>
                              {catalog.map((optionProgram) => (
                                <SelectItem
                                  key={optionProgram.id}
                                  value={String(optionProgram.id)}
                                >
                                  {optionProgram.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={moduleDraft.title}
                            onChange={(event) =>
                              setModuleDraft((current) =>
                                current
                                  ? { ...current, title: event.target.value }
                                  : current,
                              )
                            }
                          />
                          <Textarea
                            value={moduleDraft.description}
                            onChange={(event) =>
                              setModuleDraft((current) =>
                                current
                                  ? { ...current, description: event.target.value }
                                  : current,
                              )
                            }
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold">{module.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {module.description || "Noch keine Modulbeschreibung."}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {editingModuleId === module.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => void saveModuleEdit(module.id)}
                              disabled={updatingId === module.id}
                            >
                              {updatingId === module.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startModuleEdit(program, module)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {module.requirements.map((requirement) => (
                        <div
                          key={requirement.id}
                          className="rounded-lg bg-secondary/20 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            {editingRequirementId === requirement.id &&
                            requirementDraft ? (
                              <div className="w-full space-y-3">
                                <Select
                                  value={requirementDraft.moduleId}
                                  onValueChange={(value) =>
                                    setRequirementDraft((current) =>
                                      current
                                        ? { ...current, moduleId: value }
                                        : current,
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Modul waehlen" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {moduleOptions.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={requirementDraft.title}
                                  onChange={(event) =>
                                    setRequirementDraft((current) =>
                                      current
                                        ? { ...current, title: event.target.value }
                                        : current,
                                    )
                                  }
                                />
                                <Input
                                  value={requirementDraft.category}
                                  onChange={(event) =>
                                    setRequirementDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            category: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                />
                                <div className="grid gap-3 md:grid-cols-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={requirementDraft.requiredCount}
                                    onChange={(event) =>
                                      setRequirementDraft((current) =>
                                        current
                                          ? {
                                              ...current,
                                              requiredCount: event.target.value,
                                            }
                                          : current,
                                      )
                                    }
                                  />
                                  <Input
                                    value={requirementDraft.unitLabel}
                                    onChange={(event) =>
                                      setRequirementDraft((current) =>
                                        current
                                          ? {
                                              ...current,
                                              unitLabel: event.target.value,
                                            }
                                          : current,
                                      )
                                    }
                                  />
                                </div>
                                <Textarea
                                  value={requirementDraft.description}
                                  onChange={(event) =>
                                    setRequirementDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            description: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                  placeholder="Beschreibung"
                                />
                                <Textarea
                                  value={requirementDraft.matchingHints}
                                  onChange={(event) =>
                                    setRequirementDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            matchingHints: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                  placeholder="Alternative Bezeichnungen, je Zeile eine"
                                />
                              </div>
                            ) : (
                              <div>
                                <div className="font-medium">{requirement.title}</div>
                                <div className="text-sm text-muted-foreground">
                                  {(requirement.category || "Leistung")} · Soll{" "}
                                  {requirement.requiredCount} {requirement.unitLabel}
                                </div>
                                {requirement.description && (
                                  <div className="mt-1 text-sm text-muted-foreground">
                                    {requirement.description}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              {editingRequirementId === requirement.id ? (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      void saveRequirementEdit(requirement.id)
                                    }
                                    disabled={updatingId === requirement.id}
                                  >
                                    {updatingId === requirement.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelEdit}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    startRequirementEdit(module.id, requirement)
                                  }
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {editingRequirementId !== requirement.id &&
                            (requirement.matchingHints ?? []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {requirement.matchingHints.map((hint) => (
                                  <Badge key={hint} variant="secondary">
                                    {hint}
                                  </Badge>
                                ))}
                              </div>
                            )}
                        </div>
                      ))}
                      {module.requirements.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Noch keine Anforderungen in diesem Modul.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
