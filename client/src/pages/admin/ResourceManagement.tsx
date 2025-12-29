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
import { competencyApi, roomApi } from "@/lib/api";
import type { Competency, Resource } from "@shared/schema";
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
  { id: "op_assistenz", label: "OP-Assistenz" },
  { id: "sekretaerin", label: "Sekretärin" },
];

interface WeeklySchedule {
  usage: string;
  timeFrom: string;
  timeTo: string;
  blocked: boolean;
  blockReason: string;
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
  isActive: boolean;
}

const initialWeeklySchedule = (): WeeklySchedule[] => 
  WEEKDAYS.map(() => ({
    usage: "",
    timeFrom: "08:00",
    timeTo: "16:00",
    blocked: false,
    blockReason: ""
  }));

export default function ResourceManagement() {
  const { isAdmin, isTechnicalAdmin } = useAuth();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<RoomState[]>([]);
  const [availableCompetencies, setAvailableCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomState | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const canEdit = isAdmin || isTechnicalAdmin;

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    setLoading(true);
    try {
      const [roomList, competencies] = await Promise.all([
        roomApi.getAll({ active: true }),
        competencyApi.getAll()
      ]);

      setAvailableCompetencies(competencies.filter((comp) => comp.isActive !== false));

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
        description: "Räume konnten nicht geladen werden",
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
          blockReason: setting.closedReason || ""
        };
      });
    }

    const requiredAdminCompetencyIds = (detail.requiredCompetencies || [])
      .filter((req) => req.relationType === "AND")
      .map((req) => req.competencyId);
    const alternativeAdminCompetencyIds = (detail.requiredCompetencies || [])
      .filter((req) => req.relationType === "OR")
      .map((req) => req.competencyId);

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
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    if (!canEdit) return;
    setIsCreatingRoom(true);
    setEditingRoom(buildEmptyRoom());
    setIsDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingRoom(null);
      setIsCreatingRoom(false);
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
        description: "Bitte einen Raumnamen eingeben",
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

      const weekdaySettings = editingRoom.weeklySchedule.map((entry, index) => ({
        weekday: index + 1,
        usageLabel: entry.usage || null,
        timeFrom: entry.timeFrom || null,
        timeTo: entry.timeTo || null,
        isClosed: entry.blocked,
        closedReason: entry.blockReason || null
      }));
      await roomApi.updateWeekdaySettings(editingRoom.id, weekdaySettings);

      const adminCompetencies = [
        ...editingRoom.requiredAdminCompetencyIds.map((id) => ({ competencyId: id, relationType: "AND" as const })),
        ...editingRoom.alternativeAdminCompetencyIds.map((id) => ({ competencyId: id, relationType: "OR" as const }))
      ];
      await roomApi.updateCompetencies(roomId, adminCompetencies);

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
      toast({
        title: "Gespeichert",
        description: isCreating ? "Raum wurde angelegt" : "Raum wurde aktualisiert"
      });
    } catch (error) {
      toast({ title: "Fehler", description: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setSaving(false);
      handleDialogChange(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!editingRoom || isCreatingRoom || !canEdit) return;
    const confirmed = window.confirm("Diesen Raum wirklich löschen? Er wird deaktiviert.");
    if (!confirmed) return;

    setSaving(true);
    try {
      await roomApi.delete(editingRoom.id);
      setRooms((prev) => prev.filter((room) => room.id !== editingRoom.id));
      toast({ title: "Gelöscht", description: "Raum wurde deaktiviert" });
      handleDialogChange(false);
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

  return (
    <Layout title="Ressourcen & Räume">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Ressourcen & Räume</h1>
          <p className="text-muted-foreground">
            Bereiche des Wochenplans, Verfügbarkeiten und Kompetenzanforderungen verwalten.
          </p>
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={openCreateDialog} data-testid="button-new-room">
              Neuen Raum anlegen
            </Button>
          </div>
        )}

        <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-orange-800">Hinweis für die Planung</h4>
            <p className="text-sm text-orange-700 mt-1">
              Gesperrte Räume werden im Wochen- und Tageseinsatzplan automatisch als „nicht verfügbar" markiert. 
              Bitte bei längeren Sperren einen Grund angeben.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Räume werden geladen...
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
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreatingRoom ? "Neuen Raum anlegen" : `Raum bearbeiten: ${editingRoom?.name}`}
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
                    placeholder="Kurze Beschreibung des Raums..."
                    rows={3}
                    disabled={!canEdit}
                    data-testid="input-room-description"
                  />
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
                    Definieren Sie die wöchentliche Nutzung und Verfügbarkeit des Raums.
                  </p>
                  
                  <div className="overflow-x-auto">
                    <div className="space-y-3">
                      {WEEKDAYS.map((day, index) => (
                        <div key={day} className={`p-3 rounded-lg border ${editingRoom.weeklySchedule[index].blocked ? 'bg-red-50 border-red-200' : 'bg-card'}`}>
                          <div className="flex items-center gap-4">
                            <span className="font-medium w-8">{day}</span>
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
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
                    <Label>Globaler Sperrgrund (Raum komplett gesperrt)</Label>
                    <Input
                      value={editingRoom.blockReason}
                      onChange={(e) => updateEditingRoom({ blockReason: e.target.value })}
                      placeholder="z.B. Renovierung bis 15.12., Wartung..."
                      disabled={!canEdit}
                      data-testid="input-block-reason"
                    />
                    <p className="text-xs text-muted-foreground">
                      Wird angezeigt, wenn der Raum über den Toggle deaktiviert wurde.
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
    </Layout>
  );
}
