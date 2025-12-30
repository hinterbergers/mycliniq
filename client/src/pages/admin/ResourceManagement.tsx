import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Building, Pencil, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { competencyApi, roomApi, physicalRoomApi } from "@/lib/api";
import type { Competency, Resource, PhysicalRoom } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const ROOM_CATEGORIES = [
  "Geburtshilfe",
  "Gynäkologie",
  "OP",
  "Ambulanz",
  "Spezialambulanz",
  "Besprechung",
  "Station",
  "Verwaltung",
  "Sonstiges",
];

const ROLE_COMPETENCIES = [
  { id: "facharzt", label: "Facharzt/Fachärztin" },
  { id: "assistenzarzt", label: "Assistenzarzt/Assistenzärztin" },
  { id: "primararzt", label: "Primararzt/Primarärztin" },
  { id: "op_assistenz", label: "OP-Assistenz" },
  { id: "sekretaerin", label: "Sekretärin" },
];

const RECURRENCE_OPTIONS: Array<{ value: "weekly" | "monthly_first_third" | "monthly_once"; label: string }> = [
  { value: "weekly", label: "Wöchentlich" },
  { value: "monthly_first_third", label: "1. & 3. im Monat" },
  { value: "monthly_once", label: "1x pro Monat" }
];

interface WeeklySchedule {
  usage: string;
  timeFrom: string;
  timeTo: string;
  blocked: boolean;
  blockReason: string;
  recurrence: "weekly" | "monthly_first_third" | "monthly_once";
}

interface RoomState {
  id: number;
  name: string;
  category: string;
  isAvailable: boolean;
  blockReason: string;
  description: string;
  useInWeeklyPlan: boolean;
  weeklySchedule: WeeklySchedule[];
  requiredRoleCompetencies: string[];
  alternativeRoleCompetencies: string[];
  requiredAdminCompetencyIds: number[];
  alternativeAdminCompetencyIds: number[];
  physicalRoomIds: number[];
  isActive: boolean;
}

const initialWeeklySchedule = (): WeeklySchedule[] => 
  WEEKDAYS.map(() => ({
    usage: "",
    timeFrom: "08:00",
    timeTo: "16:00",
    blocked: false,
    blockReason: "",
    recurrence: "weekly"
  }));

export default function ResourceManagement() {
  const { isAdmin, isTechnicalAdmin } = useAuth();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<RoomState[]>([]);
  const [availableCompetencies, setAvailableCompetencies] = useState<Competency[]>([]);
  const [physicalRooms, setPhysicalRooms] = useState<PhysicalRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomState | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [physicalRoomSearch, setPhysicalRoomSearch] = useState("");
  const [editingPhysicalRoom, setEditingPhysicalRoom] = useState<PhysicalRoom | null>(null);
  const [isPhysicalDialogOpen, setIsPhysicalDialogOpen] = useState(false);
  const [isCreatingPhysicalRoom, setIsCreatingPhysicalRoom] = useState(false);

  const canEdit = isAdmin || isTechnicalAdmin;
  const activePhysicalRooms = physicalRooms.filter((room) => room.isActive !== false);
  const filteredPhysicalRooms = activePhysicalRooms.filter((room) => {
    const query = physicalRoomSearch.trim().toLowerCase();
    if (!query) return true;
    return room.name.toLowerCase().includes(query);
  });

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    setLoading(true);
    try {
      const [roomList, competencies, physicalRoomList] = await Promise.all([
        roomApi.getAll({ active: true }),
        competencyApi.getAll(),
        physicalRoomApi.getAll()
      ]);

      setAvailableCompetencies(competencies.filter((comp) => comp.isActive !== false));
      setPhysicalRooms(physicalRoomList);

      const detailedRooms = await Promise.all(
        roomList.map(async (room) => {
          const detail = await roomApi.getById(room.id);
          return mapRoomState(room, detail);
        })
      );

      setRooms(detailedRooms);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Arbeitsplätze und Räume konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const mapRoomState = (
    room: Resource,
    detail: Resource & {
      weekdaySettings?: Array<{
        weekday: number;
        recurrence?: "weekly" | "monthly_first_third" | "monthly_once";
        usageLabel?: string | null;
        timeFrom?: string | null;
        timeTo?: string | null;
        isClosed?: boolean;
        closedReason?: string | null;
      }>;
      requiredCompetencies?: Array<{
        competencyId: number;
        relationType: "AND" | "OR";
      }>;
      physicalRooms?: Array<{
        id: number;
        name: string;
        isActive?: boolean;
      }>;
    }
  ): RoomState => {
    const schedule = initialWeeklySchedule();
    if (detail.weekdaySettings?.length) {
      detail.weekdaySettings.forEach((setting) => {
        const index = Math.max(0, Math.min(6, setting.weekday - 1));
        schedule[index] = {
          usage: setting.usageLabel || "",
          timeFrom: setting.timeFrom || schedule[index].timeFrom,
          timeTo: setting.timeTo || schedule[index].timeTo,
          blocked: Boolean(setting.isClosed),
          blockReason: setting.closedReason || "",
          recurrence: setting.recurrence || "weekly"
        };
      });
    }

    const requiredAdminCompetencyIds = (detail.requiredCompetencies || [])
      .filter((req) => req.relationType === "AND")
      .map((req) => req.competencyId);
    const alternativeAdminCompetencyIds = (detail.requiredCompetencies || [])
      .filter((req) => req.relationType === "OR")
      .map((req) => req.competencyId);
    const physicalRoomIds = (detail.physicalRooms || [])
      .map((room) => room.id)
      .filter((id): id is number => typeof id === "number");

    return {
      id: room.id,
      name: room.name,
      category: room.category,
      isAvailable: room.isAvailable,
      blockReason: room.blockReason || "",
      description: room.description || "",
      useInWeeklyPlan: room.useInWeeklyPlan,
      weeklySchedule: schedule,
      requiredRoleCompetencies: room.requiredRoleCompetencies || [],
      alternativeRoleCompetencies: room.alternativeRoleCompetencies || [],
      requiredAdminCompetencyIds,
      alternativeAdminCompetencyIds,
      physicalRoomIds,
      isActive: room.isActive
    };
  };

  const buildEmptyRoom = (): RoomState => ({
    id: 0,
    name: "",
    category: ROOM_CATEGORIES[0] || "Sonstiges",
    isAvailable: true,
    blockReason: "",
    description: "",
    useInWeeklyPlan: true,
    weeklySchedule: initialWeeklySchedule(),
    requiredRoleCompetencies: [],
    alternativeRoleCompetencies: [],
    requiredAdminCompetencyIds: [],
    alternativeAdminCompetencyIds: [],
    physicalRoomIds: [],
    isActive: true
  });

  const toggleRoom = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const target = rooms.find((room) => room.id === id);
    if (!target) return;

    const nextAvailable = !target.isAvailable;
    const nextReason = nextAvailable ? "" : target.blockReason || "Gesperrt durch Sekretariat";
    const updatedRooms = rooms.map((room) =>
      room.id === id
        ? { ...room, isAvailable: nextAvailable, blockReason: nextReason }
        : room
    );
    setRooms(updatedRooms);

    try {
      await roomApi.update(id, {
        isAvailable: nextAvailable,
        blockReason: nextAvailable ? null : nextReason
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Status konnte nicht gespeichert werden",
        variant: "destructive"
      });
      setRooms(rooms);
    }
  };

  const openEditDialog = (room: RoomState) => {
    setIsCreatingRoom(false);
    setEditingRoom({ ...room, weeklySchedule: room.weeklySchedule.map(s => ({ ...s })) });
    setPhysicalRoomSearch("");
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    if (!canEdit) return;
    setIsCreatingRoom(true);
    setEditingRoom(buildEmptyRoom());
    setPhysicalRoomSearch("");
    setIsDialogOpen(true);
  };

  const openPhysicalRoomEditDialog = (room: PhysicalRoom) => {
    setIsCreatingPhysicalRoom(false);
    setEditingPhysicalRoom(room);
    setIsPhysicalDialogOpen(true);
  };

  const openPhysicalRoomCreateDialog = () => {
    if (!canEdit) return;
    setIsCreatingPhysicalRoom(true);
    setEditingPhysicalRoom({
      id: 0,
      name: "",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    setIsPhysicalDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingRoom(null);
      setIsCreatingRoom(false);
    }
  };

  const handlePhysicalDialogChange = (open: boolean) => {
    setIsPhysicalDialogOpen(open);
    if (!open) {
      setEditingPhysicalRoom(null);
      setIsCreatingPhysicalRoom(false);
    }
  };

  const handleSave = async () => {
    if (!editingRoom) return;
    if (!canEdit) {
      handleDialogChange(false);
      return;
    }
    if (!editingRoom.name.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte einen Arbeitsplatznamen eingeben",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const isCreating = isCreatingRoom || editingRoom.id === 0;
      const basePayload = {
        name: editingRoom.name.trim(),
        category: editingRoom.category as Resource["category"],
        description: editingRoom.description || null,
        useInWeeklyPlan: editingRoom.useInWeeklyPlan,
        isAvailable: editingRoom.isAvailable,
        blockReason: editingRoom.blockReason || null,
        requiredRoleCompetencies: editingRoom.requiredRoleCompetencies,
        alternativeRoleCompetencies: editingRoom.alternativeRoleCompetencies
      };

      const persistedRoom = isCreating
        ? await roomApi.create(basePayload)
        : await roomApi.update(editingRoom.id, basePayload);

      const roomId = persistedRoom.id;

      const nextRoom: RoomState = {
        ...editingRoom,
        id: roomId,
        isActive: persistedRoom.isActive
      };

      setRooms((prev) =>
        isCreating
          ? [...prev, nextRoom]
          : prev.map((room) => (room.id === editingRoom.id ? nextRoom : room))
      );

      const warnings: string[] = [];
      const weekdaySettings = editingRoom.weeklySchedule.map((entry, index) => ({
        weekday: index + 1,
        recurrence: entry.recurrence,
        usageLabel: entry.usage || null,
        timeFrom: entry.timeFrom || null,
        timeTo: entry.timeTo || null,
        isClosed: entry.blocked,
        closedReason: entry.blockReason || null
      }));
      try {
        await roomApi.updateWeekdaySettings(roomId, weekdaySettings);
      } catch (error) {
        console.warn("[Rooms] weekday settings save failed", error);
        warnings.push("Wochenplan");
      }

      const adminCompetencies = [
        ...editingRoom.requiredAdminCompetencyIds.map((id) => ({ competencyId: id, relationType: "AND" as const })),
        ...editingRoom.alternativeAdminCompetencyIds.map((id) => ({ competencyId: id, relationType: "OR" as const }))
      ];
      try {
        await roomApi.updateCompetencies(roomId, adminCompetencies);
      } catch (error) {
        console.warn("[Rooms] competencies save failed", error);
        warnings.push("Kompetenzen");
      }

      try {
        await roomApi.updatePhysicalRooms(roomId, editingRoom.physicalRoomIds);
      } catch (error) {
        console.warn("[Rooms] physical rooms save failed", error);
        warnings.push("Räume");
      }

      if (warnings.length) {
        toast({
          title: "Teilweise gespeichert",
          description: `Arbeitsplatz gespeichert, aber ${warnings.join(" & ")} konnten nicht gespeichert werden.`
        });
      } else {
        toast({
          title: "Gespeichert",
          description: isCreating ? "Arbeitsplatz wurde angelegt" : "Arbeitsplatz wurde aktualisiert"
        });
      }
    } catch (error) {
      toast({ title: "Fehler", description: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setSaving(false);
      handleDialogChange(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!editingRoom || isCreatingRoom || !canEdit) return;
    const confirmed = window.confirm("Diesen Arbeitsplatz wirklich löschen? Er wird deaktiviert.");
    if (!confirmed) return;

    setSaving(true);
    try {
      await roomApi.delete(editingRoom.id);
      setRooms((prev) => prev.filter((room) => room.id !== editingRoom.id));
      toast({ title: "Gelöscht", description: "Arbeitsplatz wurde deaktiviert" });
      handleDialogChange(false);
    } catch (error) {
      toast({ title: "Fehler", description: "Arbeitsplatz konnte nicht gelöscht werden", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePhysicalRoom = async () => {
    if (!editingPhysicalRoom) return;
    if (!canEdit) {
      handlePhysicalDialogChange(false);
      return;
    }
    if (!editingPhysicalRoom.name.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte einen Raumnamen eingeben",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: editingPhysicalRoom.name.trim(),
        isActive: editingPhysicalRoom.isActive ?? true
      };

      if (isCreatingPhysicalRoom || editingPhysicalRoom.id === 0) {
        const created = await physicalRoomApi.create(payload);
        setPhysicalRooms((prev) => [...prev, created]);
        toast({ title: "Gespeichert", description: "Raum wurde angelegt" });
      } else {
        const updated = await physicalRoomApi.update(editingPhysicalRoom.id, payload);
        setPhysicalRooms((prev) => prev.map((room) => (room.id === updated.id ? updated : room)));
        toast({ title: "Gespeichert", description: "Raum wurde aktualisiert" });
      }
      handlePhysicalDialogChange(false);
    } catch (error) {
      toast({ title: "Fehler", description: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhysicalRoom = async () => {
    if (!editingPhysicalRoom || isCreatingPhysicalRoom || !canEdit) return;
    const confirmed = window.confirm("Diesen Raum wirklich löschen? Er wird deaktiviert.");
    if (!confirmed) return;

    setSaving(true);
    try {
      await physicalRoomApi.delete(editingPhysicalRoom.id);
      setPhysicalRooms((prev) => prev.filter((room) => room.id !== editingPhysicalRoom.id));
      toast({ title: "Gelöscht", description: "Raum wurde deaktiviert" });
      handlePhysicalDialogChange(false);
    } catch (error) {
      toast({ title: "Fehler", description: "Raum konnte nicht gelöscht werden", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateEditingRoom = (updates: Partial<RoomState>) => {
    if (editingRoom) {
      setEditingRoom({ ...editingRoom, ...updates });
    }
  };

  const updateWeeklySchedule = (dayIndex: number, updates: Partial<WeeklySchedule>) => {
    if (editingRoom) {
      const newSchedule = [...editingRoom.weeklySchedule];
      newSchedule[dayIndex] = { ...newSchedule[dayIndex], ...updates };
      setEditingRoom({ ...editingRoom, weeklySchedule: newSchedule });
    }
  };

  const toggleRoleCompetency = (
    list: "requiredRoleCompetencies" | "alternativeRoleCompetencies",
    competencyId: string
  ) => {
    if (editingRoom) {
      const current = editingRoom[list];
      const updated = current.includes(competencyId)
        ? current.filter(c => c !== competencyId)
        : [...current, competencyId];
      updateEditingRoom({ [list]: updated });
    }
  };

  const toggleAdminCompetency = (
    list: "requiredAdminCompetencyIds" | "alternativeAdminCompetencyIds",
    competencyId: number
  ) => {
    if (editingRoom) {
      const current = editingRoom[list];
      const updated = current.includes(competencyId)
        ? current.filter(c => c !== competencyId)
        : [...current, competencyId];
      updateEditingRoom({ [list]: updated });
    }
  };

  const togglePhysicalRoomAssignment = (physicalRoomId: number) => {
    if (editingRoom) {
      const current = editingRoom.physicalRoomIds;
      const updated = current.includes(physicalRoomId)
        ? current.filter((id) => id !== physicalRoomId)
        : [...current, physicalRoomId];
      updateEditingRoom({ physicalRoomIds: updated });
    }
  };

  const togglePhysicalRoomActive = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const target = physicalRooms.find((room) => room.id === id);
    if (!target) return;

    const nextActive = !target.isActive;
    const updatedRooms = physicalRooms.map((room) =>
      room.id === id ? { ...room, isActive: nextActive } : room
    );
    setPhysicalRooms(updatedRooms);

    try {
      await physicalRoomApi.update(id, { isActive: nextActive });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Status konnte nicht gespeichert werden",
        variant: "destructive"
      });
      setPhysicalRooms(physicalRooms);
    }
  };

  const getPhysicalRoomLabel = (id: number) =>
    physicalRooms.find((room) => room.id === id)?.name || `Raum ${id}`;

  const selectedPhysicalRoomLabels = editingRoom?.physicalRoomIds.map((id) => ({
    id,
    label: getPhysicalRoomLabel(id)
  })) || [];

  return (
    <Layout title="Arbeitsplätze & Räume">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Arbeitsplätze & Räume</h1>
          <p className="text-muted-foreground">
            Arbeitsplätze steuern den Wochenplan; Räume sind die physischen Standorte vor Ort.
          </p>
        </div>

        <Tabs defaultValue="workplaces" className="space-y-6">
          <TabsList className="bg-background border border-border p-1 h-12 rounded-xl shadow-sm">
            <TabsTrigger value="workplaces" className="rounded-lg px-6 h-10">
              Arbeitsplätze
            </TabsTrigger>
            <TabsTrigger value="physical-rooms" className="rounded-lg px-6 h-10">
              Räume
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workplaces" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {canEdit && (
              <div className="flex justify-end">
                <Button onClick={openCreateDialog} data-testid="button-new-room">
                  Neuen Arbeitsplatz anlegen
                </Button>
              </div>
            )}

            <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-orange-800">Hinweis für die Planung</h4>
                <p className="text-sm text-orange-700 mt-1">
                  Gesperrte Arbeitsplätze werden im Wochen- und Tageseinsatzplan automatisch als „nicht verfügbar" markiert.
                  Bitte bei längeren Sperren einen Grund angeben.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Arbeitsplätze werden geladen...
              </div>
            ) : (
              <div className="grid gap-6">
                {ROOM_CATEGORIES.filter((category) => rooms.some((room) => room.category === category)).map((category) => (
                <div key={category} className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Building className="w-4 h-4 text-muted-foreground" />
                    {category}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rooms.filter(r => r.category === category).map(room => (
                      <Card 
                        key={room.id} 
                        className={`border-none shadow-sm transition-all cursor-pointer hover:shadow-md ${!room.isAvailable ? 'bg-secondary/50 opacity-80' : 'bg-card'}`}
                        onClick={() => openEditDialog(room)}
                        data-testid={`card-room-${room.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{room.name}</span>
                                <Badge 
                                  variant={room.isAvailable ? 'default' : 'secondary'}
                                  className={`text-[10px] h-5 ${room.isAvailable ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}`}
                                >
                                  {room.isAvailable ? 'Aktiv' : 'Inaktiv'}
                                </Badge>
                                {!room.isAvailable && (
                                  <Badge variant="destructive" className="text-[10px] h-5">Gesperrt</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {!room.isAvailable
                                  ? `Gesperrt: ${room.blockReason || 'Kein Grund angegeben'}` 
                                  : 'Verfügbar'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 ml-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditDialog(room);
                                }}
                                data-testid={`button-edit-room-${room.id}`}
                              >
                                <Pencil className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <div className="flex flex-col items-center gap-1">
                                <Switch 
                                  id={`room-${room.id}`}
                                  checked={room.isAvailable}
                                  disabled={!canEdit}
                                  onCheckedChange={() => {}}
                                  onClick={(e) => toggleRoom(room.id, e)}
                                  data-testid={`switch-room-${room.id}`}
                                />
                                <Label htmlFor={`room-${room.id}`} className="text-[10px] text-muted-foreground">
                                  {room.isAvailable ? 'Aktiv' : 'Inaktiv'}
                                </Label>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                Regelmäßige Events (z.B. Chefvisite, Besprechungen) werden im Wochenplan-Editor konfiguriert und hier nur angezeigt.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="physical-rooms" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {canEdit && (
              <div className="flex justify-end">
                <Button onClick={openPhysicalRoomCreateDialog} data-testid="button-new-physical-room">
                  Neuen Raum anlegen
                </Button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Räume werden geladen...
              </div>
            ) : (
              <div className="grid gap-4">
                {physicalRooms.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {physicalRooms.map((room) => (
                      <Card
                        key={room.id}
                        className={`border-none shadow-sm transition-all cursor-pointer hover:shadow-md ${!room.isActive ? 'bg-secondary/50 opacity-80' : 'bg-card'}`}
                        onClick={() => openPhysicalRoomEditDialog(room)}
                        data-testid={`card-physical-room-${room.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{room.name}</span>
                                <Badge
                                  variant={room.isActive ? 'default' : 'secondary'}
                                  className={`text-[10px] h-5 ${room.isActive ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}`}
                                >
                                  {room.isActive ? 'Aktiv' : 'Inaktiv'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {room.isActive ? 'Verfügbar' : 'Deaktiviert'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 ml-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPhysicalRoomEditDialog(room);
                                }}
                                data-testid={`button-edit-physical-room-${room.id}`}
                              >
                                <Pencil className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <div className="flex flex-col items-center gap-1">
                                <Switch
                                  id={`physical-room-${room.id}`}
                                  checked={room.isActive}
                                  disabled={!canEdit}
                                  onCheckedChange={() => {}}
                                  onClick={(e) => togglePhysicalRoomActive(room.id, e)}
                                  data-testid={`switch-physical-room-${room.id}`}
                                />
                                <Label htmlFor={`physical-room-${room.id}`} className="text-[10px] text-muted-foreground">
                                  {room.isActive ? 'Aktiv' : 'Inaktiv'}
                                </Label>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Keine Räume angelegt</p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreatingRoom ? "Neuen Arbeitsplatz anlegen" : `Arbeitsplatz bearbeiten: ${editingRoom?.name}`}
            </DialogTitle>
          </DialogHeader>

          {editingRoom && (
            <Tabs defaultValue="general" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general" data-testid="tab-general">Allgemein</TabsTrigger>
                <TabsTrigger value="weekly" data-testid="tab-weekly">Wochenplan</TabsTrigger>
                <TabsTrigger value="competencies" data-testid="tab-competencies">Kompetenzen</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="room-name">Name</Label>
                  <Input
                    id="room-name"
                    value={editingRoom.name}
                    onChange={(e) => updateEditingRoom({ name: e.target.value })}
                    disabled={!canEdit}
                    data-testid="input-room-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="room-category">Kategorie</Label>
                  <Select 
                    value={editingRoom.category} 
                    onValueChange={(value) => updateEditingRoom({ category: value })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger id="room-category" data-testid="select-room-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOM_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="room-description">Beschreibung</Label>
                  <Textarea
                    id="room-description"
                    value={editingRoom.description}
                    onChange={(e) => updateEditingRoom({ description: e.target.value })}
                    placeholder="Kurze Beschreibung des Arbeitsplatzes..."
                    rows={3}
                    disabled={!canEdit}
                    data-testid="input-room-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Räume (physisch)</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedPhysicalRoomLabels.length ? (
                      selectedPhysicalRoomLabels.map((room) => (
                        <Badge key={room.id} variant="secondary">
                          {room.label}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine Räume zugeordnet</p>
                    )}
                  </div>
                  {activePhysicalRooms.length ? (
                    <div className="space-y-2">
                      <Input
                        value={physicalRoomSearch}
                        onChange={(e) => setPhysicalRoomSearch(e.target.value)}
                        placeholder="Raum suchen..."
                        disabled={!canEdit}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        {filteredPhysicalRooms.map((room) => (
                          <div key={room.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`physical-room-select-${room.id}`}
                              checked={editingRoom.physicalRoomIds.includes(room.id)}
                              onCheckedChange={() => togglePhysicalRoomAssignment(room.id)}
                              disabled={!canEdit}
                            />
                            <Label htmlFor={`physical-room-select-${room.id}`} className="text-sm cursor-pointer">
                              {room.name}
                            </Label>
                          </div>
                        ))}
                        {!filteredPhysicalRooms.length && (
                          <p className="text-sm text-muted-foreground">Keine Räume gefunden</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Keine Räume angelegt</p>
                  )}
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="use-in-weekly"
                    checked={editingRoom.useInWeeklyPlan}
                    onCheckedChange={(checked) => updateEditingRoom({ useInWeeklyPlan: checked === true })}
                    disabled={!canEdit}
                    data-testid="checkbox-use-weekly"
                  />
                  <Label htmlFor="use-in-weekly" className="cursor-pointer">
                    Im Wochenplan verwenden
                  </Label>
                </div>
              </TabsContent>

              <TabsContent value="weekly" className="mt-4">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Definieren Sie die wöchentliche Nutzung und Verfügbarkeit des Arbeitsplatzes.
                  </p>
                  
                  <div className="overflow-x-auto">
                    <div className="space-y-3">
                      {WEEKDAYS.map((day, index) => (
                        <div key={day} className={`p-3 rounded-lg border ${editingRoom.weeklySchedule[index].blocked ? 'bg-red-50 border-red-200' : 'bg-card'}`}>
                          <div className="flex items-center gap-4">
                            <span className="font-medium w-8">{day}</span>
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                              <Input
                                value={editingRoom.weeklySchedule[index].usage}
                                onChange={(e) => updateWeeklySchedule(index, { usage: e.target.value })}
                                placeholder="Nutzung (z.B. Chefsprechstunde)"
                                className="h-8 text-sm md:col-span-2"
                                disabled={!canEdit || editingRoom.weeklySchedule[index].blocked}
                                data-testid={`input-usage-${day}`}
                              />
                              <div className="flex items-center gap-1">
                                <Input
                                  type="time"
                                  value={editingRoom.weeklySchedule[index].timeFrom}
                                  onChange={(e) => updateWeeklySchedule(index, { timeFrom: e.target.value })}
                                  className="h-8 text-sm"
                                  disabled={!canEdit || editingRoom.weeklySchedule[index].blocked}
                                  data-testid={`input-time-from-${day}`}
                                />
                                <span className="text-muted-foreground">–</span>
                                <Input
                                  type="time"
                                  value={editingRoom.weeklySchedule[index].timeTo}
                                  onChange={(e) => updateWeeklySchedule(index, { timeTo: e.target.value })}
                                  className="h-8 text-sm"
                                  disabled={!canEdit || editingRoom.weeklySchedule[index].blocked}
                                  data-testid={`input-time-to-${day}`}
                                />
                              </div>
                              <Select
                                value={editingRoom.weeklySchedule[index].recurrence}
                                onValueChange={(value) =>
                                  updateWeeklySchedule(index, {
                                    recurrence: value as WeeklySchedule["recurrence"]
                                  })
                                }
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Wiederholung" />
                                </SelectTrigger>
                                <SelectContent>
                                  {RECURRENCE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={editingRoom.weeklySchedule[index].blocked}
                                  onCheckedChange={(checked) => updateWeeklySchedule(index, { blocked: checked === true, blockReason: checked ? editingRoom.weeklySchedule[index].blockReason : '' })}
                                  disabled={!canEdit}
                                  data-testid={`checkbox-blocked-${day}`}
                                />
                                <Label className="text-sm text-muted-foreground">Gesperrt</Label>
                              </div>
                            </div>
                          </div>
                          {editingRoom.weeklySchedule[index].blocked && (
                            <div className="mt-2 ml-12">
                              <Input
                                value={editingRoom.weeklySchedule[index].blockReason}
                                onChange={(e) => updateWeeklySchedule(index, { blockReason: e.target.value })}
                                placeholder="Grund für Sperre an diesem Tag..."
                                className="h-8 text-sm"
                                disabled={!canEdit}
                                data-testid={`input-block-reason-${day}`}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <Label>Globaler Sperrgrund (Arbeitsplatz komplett gesperrt)</Label>
                    <Input
                      value={editingRoom.blockReason}
                      onChange={(e) => updateEditingRoom({ blockReason: e.target.value })}
                      placeholder="z.B. Renovierung bis 15.12., Wartung..."
                      disabled={!canEdit}
                      data-testid="input-block-reason"
                    />
                    <p className="text-xs text-muted-foreground">
                      Wird angezeigt, wenn der Arbeitsplatz über den Toggle deaktiviert wurde.
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="competencies" className="mt-4">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-base font-medium">Basis-Kompetenzen (AND)</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Alle ausgewählten Kompetenzen müssen erfüllt sein.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {ROLE_COMPETENCIES.map((comp) => (
                        <div key={comp.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`req-${comp.id}`}
                            checked={editingRoom.requiredRoleCompetencies.includes(comp.id)}
                            onCheckedChange={() => toggleRoleCompetency("requiredRoleCompetencies", comp.id)}
                            disabled={!canEdit}
                            data-testid={`checkbox-required-${comp.id}`}
                          />
                          <Label htmlFor={`req-${comp.id}`} className="text-sm cursor-pointer">
                            {comp.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-base font-medium">Basis-Kompetenzen (ODER)</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Mindestens eine der ausgewählten Kompetenzen muss erfüllt sein.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {ROLE_COMPETENCIES.map((comp) => (
                        <div key={comp.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`alt-${comp.id}`}
                            checked={editingRoom.alternativeRoleCompetencies.includes(comp.id)}
                            onCheckedChange={() => toggleRoleCompetency("alternativeRoleCompetencies", comp.id)}
                            disabled={!canEdit}
                            data-testid={`checkbox-alternative-${comp.id}`}
                          />
                          <Label htmlFor={`alt-${comp.id}`} className="text-sm cursor-pointer">
                            {comp.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-base font-medium">Kompetenzen aus Verwaltung (AND)</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Auswahl aus Verwaltung &gt; Mitarbeiter & Kompetenzen &gt; Kompetenzen.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {availableCompetencies.map((comp) => (
                        <div key={comp.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`admin-req-${comp.id}`}
                            checked={editingRoom.requiredAdminCompetencyIds.includes(comp.id)}
                            onCheckedChange={() => toggleAdminCompetency("requiredAdminCompetencyIds", comp.id)}
                            disabled={!canEdit}
                          />
                          <Label htmlFor={`admin-req-${comp.id}`} className="text-sm cursor-pointer">
                            {comp.code ? `${comp.code} - ${comp.name}` : comp.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-base font-medium">Kompetenzen aus Verwaltung (ODER)</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Mindestens eine Kompetenz aus dieser Liste ist ausreichend.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {availableCompetencies.map((comp) => (
                        <div key={comp.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`admin-alt-${comp.id}`}
                            checked={editingRoom.alternativeAdminCompetencyIds.includes(comp.id)}
                            onCheckedChange={() => toggleAdminCompetency("alternativeAdminCompetencyIds", comp.id)}
                            disabled={!canEdit}
                          />
                          <Label htmlFor={`admin-alt-${comp.id}`} className="text-sm cursor-pointer">
                            {comp.code ? `${comp.code} - ${comp.name}` : comp.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700">
                      Die Kombination aus AND/OR wird später von der KI bei der Wochen- und Tageseinsatzplanung berücksichtigt.
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-6">
            {canEdit && !isCreatingRoom && (
              <Button
                variant="destructive"
                onClick={handleDeleteRoom}
                disabled={saving}
                className="mr-auto"
                data-testid="button-delete-room"
              >
                Löschen
              </Button>
            )}
            <Button variant="outline" onClick={() => handleDialogChange(false)} data-testid="button-cancel">
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || saving} data-testid="button-save">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPhysicalDialogOpen} onOpenChange={handlePhysicalDialogChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isCreatingPhysicalRoom ? "Neuen Raum anlegen" : `Raum bearbeiten: ${editingPhysicalRoom?.name}`}
            </DialogTitle>
          </DialogHeader>

          {editingPhysicalRoom && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="physical-room-name">Name</Label>
                <Input
                  id="physical-room-name"
                  value={editingPhysicalRoom.name}
                  onChange={(e) => setEditingPhysicalRoom({ ...editingPhysicalRoom, name: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="physical-room-active"
                  checked={editingPhysicalRoom.isActive ?? true}
                  onCheckedChange={(checked) =>
                    setEditingPhysicalRoom({ ...editingPhysicalRoom, isActive: checked === true })
                  }
                  disabled={!canEdit}
                />
                <Label htmlFor="physical-room-active" className="cursor-pointer">
                  Aktiv
                </Label>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            {canEdit && !isCreatingPhysicalRoom && (
              <Button
                variant="destructive"
                onClick={handleDeletePhysicalRoom}
                disabled={saving}
                className="mr-auto"
              >
                Löschen
              </Button>
            )}
            <Button variant="outline" onClick={() => handlePhysicalDialogChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSavePhysicalRoom} disabled={!canEdit || saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
