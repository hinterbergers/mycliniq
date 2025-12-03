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
import { AlertCircle, Building, Pencil, Info } from "lucide-react";
import { useState } from "react";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const COMPETENCIES = [
  { id: "fa_gyn", label: "FA Gynäkologie" },
  { id: "ass_gyn", label: "Assistenzarzt Gyn" },
  { id: "fa_geb", label: "FA Geburtshilfe" },
  { id: "ass_geb", label: "Assistenzarzt Geb" },
  { id: "hebamme", label: "Hebamme" },
  { id: "op_assist", label: "OP-Assistenz" },
  { id: "ultraschall", label: "Ultraschall-Zertifikat" },
  { id: "praenatal", label: "Pränataldiagnostik" },
  { id: "onkologie", label: "Gyn. Onkologie" },
  { id: "mamma", label: "Mamma-Spezialist" },
];

interface WeeklySchedule {
  usage: string;
  timeFrom: string;
  timeTo: string;
  blocked: boolean;
  blockReason: string;
}

interface Room {
  id: number;
  name: string;
  type: string;
  status: "open" | "closed";
  message: string;
  description: string;
  useInWeeklyPlan: boolean;
  weeklySchedule: WeeklySchedule[];
  requiredCompetencies: string[];
  alternativeCompetencies: string[];
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
  const [rooms, setRooms] = useState<Room[]>([
    { id: 1, name: "Kreißsaal 1", type: "Geburtshilfe", status: "open", message: "", description: "Hauptgebärsaal mit CTG-Überwachung", useInWeeklyPlan: true, weeklySchedule: initialWeeklySchedule(), requiredCompetencies: ["hebamme"], alternativeCompetencies: ["fa_geb", "ass_geb"] },
    { id: 2, name: "Kreißsaal 2 (Wanne)", type: "Geburtshilfe", status: "open", message: "", description: "Gebärsaal mit Wassergeburtsmöglichkeit", useInWeeklyPlan: true, weeklySchedule: initialWeeklySchedule(), requiredCompetencies: ["hebamme"], alternativeCompetencies: ["fa_geb", "ass_geb"] },
    { id: 3, name: "Sectio-OP", type: "OP", status: "open", message: "", description: "Operationssaal für Kaiserschnitte", useInWeeklyPlan: true, weeklySchedule: initialWeeklySchedule(), requiredCompetencies: ["fa_geb", "op_assist"], alternativeCompetencies: [] },
    { id: 4, name: "Gyn-OP 1", type: "OP", status: "closed", message: "Reinigung bis 15.12.", description: "Gynäkologischer Operationssaal", useInWeeklyPlan: true, weeklySchedule: initialWeeklySchedule(), requiredCompetencies: ["fa_gyn", "op_assist"], alternativeCompetencies: [] },
    { id: 5, name: "Ambulanz Raum 1", type: "Ambulanz", status: "open", message: "", description: "Allgemeine gynäkologische Sprechstunde", useInWeeklyPlan: true, weeklySchedule: initialWeeklySchedule(), requiredCompetencies: [], alternativeCompetencies: ["fa_gyn", "ass_gyn"] },
    { id: 6, name: "Schwangeren-Amb.", type: "Ambulanz", status: "open", message: "", description: "Schwangerenvorsorge und -betreuung", useInWeeklyPlan: true, weeklySchedule: initialWeeklySchedule(), requiredCompetencies: ["ultraschall"], alternativeCompetencies: ["fa_geb", "ass_geb"] },
    { id: 7, name: "Pränatal-Diagnostik", type: "Spezialambulanz", status: "open", message: "", description: "Spezialisierte Pränataldiagnostik", useInWeeklyPlan: true, weeklySchedule: initialWeeklySchedule(), requiredCompetencies: ["praenatal", "ultraschall"], alternativeCompetencies: [] },
    { id: 8, name: "Mamma-Sprechstunde", type: "Spezialambulanz", status: "open", message: "", description: "Brustsprechstunde und Nachsorge", useInWeeklyPlan: true, weeklySchedule: initialWeeklySchedule(), requiredCompetencies: ["mamma"], alternativeCompetencies: ["fa_gyn", "onkologie"] },
  ]);

  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const toggleRoom = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRooms(rooms.map(r => 
      r.id === id 
        ? { ...r, status: r.status === 'open' ? 'closed' : 'open', message: r.status === 'open' ? 'Gesperrt durch Sekretariat' : '' } 
        : r
    ));
  };

  const openEditDialog = (room: Room) => {
    setEditingRoom({ ...room, weeklySchedule: room.weeklySchedule.map(s => ({ ...s })) });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (editingRoom) {
      setRooms(rooms.map(r => r.id === editingRoom.id ? editingRoom : r));
      console.log("Gespeichert:", editingRoom);
    }
    setIsDialogOpen(false);
    setEditingRoom(null);
  };

  const updateEditingRoom = (updates: Partial<Room>) => {
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

  const toggleCompetency = (list: "requiredCompetencies" | "alternativeCompetencies", competencyId: string) => {
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

        <div className="grid gap-6">
          {["Geburtshilfe", "OP", "Ambulanz", "Spezialambulanz"].map((category) => (
            <div key={category} className="space-y-3">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Building className="w-4 h-4 text-muted-foreground" />
                {category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rooms.filter(r => r.type === category).map(room => (
                  <Card 
                    key={room.id} 
                    className={`border-none shadow-sm transition-all cursor-pointer hover:shadow-md ${room.status === 'closed' ? 'bg-secondary/50 opacity-80' : 'bg-card'}`}
                    onClick={() => openEditDialog(room)}
                    data-testid={`card-room-${room.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{room.name}</span>
                            <Badge 
                              variant={room.status === 'open' ? 'default' : 'secondary'}
                              className={`text-[10px] h-5 ${room.status === 'open' ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}`}
                            >
                              {room.status === 'open' ? 'Aktiv' : 'Inaktiv'}
                            </Badge>
                            {room.status === 'closed' && (
                              <Badge variant="destructive" className="text-[10px] h-5">Gesperrt</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {room.status === 'closed' 
                              ? `Gesperrt: ${room.message || 'Kein Grund angegeben'}` 
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
                              checked={room.status === 'open'}
                              onCheckedChange={() => {}}
                              onClick={(e) => toggleRoom(room.id, e)}
                              data-testid={`switch-room-${room.id}`}
                            />
                            <Label htmlFor={`room-${room.id}`} className="text-[10px] text-muted-foreground">
                              {room.status === 'open' ? 'Aktiv' : 'Inaktiv'}
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

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Regelmäßige Events (z.B. Chefvisite, Besprechungen) werden im Wochenplan-Editor konfiguriert und hier nur angezeigt.
          </p>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Raum bearbeiten: {editingRoom?.name}</DialogTitle>
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
                    data-testid="input-room-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="room-category">Kategorie</Label>
                  <Select 
                    value={editingRoom.type} 
                    onValueChange={(value) => updateEditingRoom({ type: value })}
                  >
                    <SelectTrigger id="room-category" data-testid="select-room-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Geburtshilfe">Geburtshilfe</SelectItem>
                      <SelectItem value="OP">OP</SelectItem>
                      <SelectItem value="Ambulanz">Ambulanz</SelectItem>
                      <SelectItem value="Spezialambulanz">Spezialambulanz</SelectItem>
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
                    data-testid="input-room-description"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="use-in-weekly"
                    checked={editingRoom.useInWeeklyPlan}
                    onCheckedChange={(checked) => updateEditingRoom({ useInWeeklyPlan: checked === true })}
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
                                disabled={editingRoom.weeklySchedule[index].blocked}
                                data-testid={`input-usage-${day}`}
                              />
                              <div className="flex items-center gap-1">
                                <Input
                                  type="time"
                                  value={editingRoom.weeklySchedule[index].timeFrom}
                                  onChange={(e) => updateWeeklySchedule(index, { timeFrom: e.target.value })}
                                  className="h-8 text-sm"
                                  disabled={editingRoom.weeklySchedule[index].blocked}
                                  data-testid={`input-time-from-${day}`}
                                />
                                <span className="text-muted-foreground">–</span>
                                <Input
                                  type="time"
                                  value={editingRoom.weeklySchedule[index].timeTo}
                                  onChange={(e) => updateWeeklySchedule(index, { timeTo: e.target.value })}
                                  className="h-8 text-sm"
                                  disabled={editingRoom.weeklySchedule[index].blocked}
                                  data-testid={`input-time-to-${day}`}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={editingRoom.weeklySchedule[index].blocked}
                                  onCheckedChange={(checked) => updateWeeklySchedule(index, { blocked: checked === true, blockReason: checked ? editingRoom.weeklySchedule[index].blockReason : '' })}
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
                      value={editingRoom.message}
                      onChange={(e) => updateEditingRoom({ message: e.target.value })}
                      placeholder="z.B. Renovierung bis 15.12., Wartung..."
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
                      <Label className="text-base font-medium">Benötigte Kompetenzen (AND)</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Alle ausgewählten Kompetenzen müssen erfüllt sein.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {COMPETENCIES.map((comp) => (
                        <div key={comp.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`req-${comp.id}`}
                            checked={editingRoom.requiredCompetencies.includes(comp.id)}
                            onCheckedChange={() => toggleCompetency("requiredCompetencies", comp.id)}
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
                      <Label className="text-base font-medium">Alternativ-Kompetenzen (ODER)</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Mindestens eine der ausgewählten Kompetenzen muss erfüllt sein.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {COMPETENCIES.map((comp) => (
                        <div key={comp.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`alt-${comp.id}`}
                            checked={editingRoom.alternativeCompetencies.includes(comp.id)}
                            onCheckedChange={() => toggleCompetency("alternativeCompetencies", comp.id)}
                            data-testid={`checkbox-alternative-${comp.id}`}
                          />
                          <Label htmlFor={`alt-${comp.id}`} className="text-sm cursor-pointer">
                            {comp.label}
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
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
              Abbrechen
            </Button>
            <Button onClick={handleSave} data-testid="button-save">
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
