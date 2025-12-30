import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar as CalendarIcon, 
  Send, 
  Save, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Plus,
  Trash2,
  Loader2,
  Info
} from "lucide-react";
import { useState, useEffect } from "react";
import { shiftWishesApi, plannedAbsencesApi, rosterSettingsApi, employeeApi, type NextPlanningMonth } from "@/lib/api";
import type { ShiftWish, PlannedAbsence, Employee } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { format, getDaysInMonth, startOfMonth, getDay, isWeekend } from "date-fns";
import { de } from "date-fns/locale";
import { employeeDoesShifts } from "@shared/shiftTypes";

const ABSENCE_REASONS = [
  { value: "Urlaub", label: "Urlaub" },
  { value: "Fortbildung", label: "Fortbildung" }
];

const MONTH_NAMES = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export default function ShiftWishes() {
  const { employee: currentUser, capabilities, isAdmin, isTechnicalAdmin } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planningMonth, setPlanningMonth] = useState<NextPlanningMonth | null>(null);
  const [wish, setWish] = useState<ShiftWish | null>(null);
  const [absences, setAbsences] = useState<PlannedAbsence[]>([]);
  const [allWishes, setAllWishes] = useState<ShiftWish[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  const [weekendWishDays, setWeekendWishDays] = useState<number[]>([]);
  const [avoidDays, setAvoidDays] = useState<number[]>([]);
  const [avoidWeekdays, setAvoidWeekdays] = useState<number[]>([]);
  const [maxShiftsPerWeek, setMaxShiftsPerWeek] = useState<number | undefined>();
  const [maxShiftsPerMonth, setMaxShiftsPerMonth] = useState<number | undefined>();
  const [maxWeekendShifts, setMaxWeekendShifts] = useState<number | undefined>();
  const [notes, setNotes] = useState("");
  
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [newAbsenceStart, setNewAbsenceStart] = useState<Date | undefined>();
  const [newAbsenceEnd, setNewAbsenceEnd] = useState<Date | undefined>();
  const [newAbsenceReason, setNewAbsenceReason] = useState<string>("Urlaub");
  const [newAbsenceNotes, setNewAbsenceNotes] = useState("");
  
  const canViewAll = isAdmin || isTechnicalAdmin || capabilities.includes("dutyplan.edit");
  const doesShifts = currentUser ? employeeDoesShifts(currentUser) : false;
  const isSubmitted = wish?.status === 'Eingereicht';
  
  useEffect(() => {
    loadData();
  }, [currentUser, canViewAll]);
  
  const loadData = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      
      const [monthData, emps] = await Promise.all([
        rosterSettingsApi.getNextPlanningMonth(),
        canViewAll ? employeeApi.getAll() : Promise.resolve([])
      ]);
      
      setPlanningMonth(monthData);
      setEmployees(emps);
      
      if (monthData) {
        const [wishData, absenceData] = await Promise.all([
          shiftWishesApi.getByEmployeeAndMonth(currentUser.id, monthData.year, monthData.month),
          plannedAbsencesApi.getByEmployeeAndMonth(currentUser.id, monthData.year, monthData.month)
        ]);
        
        if (wishData) {
          const weekendOnly = (wishData.preferredShiftDays || []).filter((day) => {
            const date = new Date(monthData.year, monthData.month - 1, day);
            return isWeekend(date);
          });
          setWish(wishData);
          setWeekendWishDays(weekendOnly);
          setAvoidDays(wishData.avoidShiftDays || []);
          setAvoidWeekdays(wishData.avoidWeekdays || []);
          setMaxShiftsPerWeek(wishData.maxShiftsPerWeek || undefined);
          setMaxShiftsPerMonth(wishData.maxShiftsPerMonth || undefined);
          setMaxWeekendShifts(wishData.maxWeekendShifts || undefined);
          setNotes(wishData.notes || "");
        }
        
        setAbsences(absenceData);
        
        if (canViewAll) {
          const allWishData = await shiftWishesApi.getByMonth(monthData.year, monthData.month);
          setAllWishes(allWishData);
        }
      }
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Daten konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleSave = async () => {
    if (!currentUser || !planningMonth) return;
    
    try {
      setSaving(true);
      const wishData = {
        employeeId: currentUser.id,
        year: planningMonth.year,
        month: planningMonth.month,
        preferredShiftDays: weekendWishDays,
        avoidShiftDays: avoidDays,
        avoidWeekdays: avoidWeekdays,
        maxShiftsPerWeek: typeof maxShiftsPerWeek === "number" ? maxShiftsPerWeek : null,
        maxShiftsPerMonth: typeof maxShiftsPerMonth === "number" ? maxShiftsPerMonth : null,
        maxWeekendShifts: typeof maxWeekendShifts === "number" ? maxWeekendShifts : null,
        notes: notes || null
      };
      
      if (wish) {
        const updated = await shiftWishesApi.update(wish.id, wishData);
        setWish(updated);
      } else {
        const created = await shiftWishesApi.create(wishData);
        setWish(created);
      }
      
      toast({
        title: "Gespeichert",
        description: "Ihre Wünsche wurden gespeichert"
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Speichern fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  
  const handleSubmit = async () => {
    if (!wish) {
      await handleSave();
    }
    
    if (!wish?.id) return;
    
    try {
      setSaving(true);
      const updated = await shiftWishesApi.submit(wish.id);
      setWish(updated);
      
      toast({
        title: "Eingereicht",
        description: "Ihre Wünsche wurden erfolgreich eingereicht"
      });
      
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Einreichen fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  
  const handleAddAbsence = async () => {
    if (!currentUser || !planningMonth || !newAbsenceStart || !newAbsenceEnd) return;
    
    try {
      setSaving(true);
      
      await plannedAbsencesApi.create({
        employeeId: currentUser.id,
        year: planningMonth.year,
        month: planningMonth.month,
        startDate: format(newAbsenceStart, 'yyyy-MM-dd'),
        endDate: format(newAbsenceEnd, 'yyyy-MM-dd'),
        reason: newAbsenceReason as any,
        notes: newAbsenceNotes || null
      });
      
      setAbsenceDialogOpen(false);
      setNewAbsenceStart(undefined);
      setNewAbsenceEnd(undefined);
      setNewAbsenceReason("Urlaub");
      setNewAbsenceNotes("");
      
      const absenceData = await plannedAbsencesApi.getByEmployeeAndMonth(
        currentUser.id, 
        planningMonth.year, 
        planningMonth.month
      );
      setAbsences(absenceData);
      
      toast({
        title: "Hinzugefügt",
        description: "Abwesenheit wurde eingetragen"
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Abwesenheit konnte nicht eingetragen werden",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  
  const handleDeleteAbsence = async (id: number) => {
    try {
      await plannedAbsencesApi.delete(id);
      setAbsences(prev => prev.filter(a => a.id !== id));
      
      toast({
        title: "Gelöscht",
        description: "Abwesenheit wurde entfernt"
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Löschen fehlgeschlagen",
        variant: "destructive"
      });
    }
  };
  
  const toggleAvoidDay = (day: number) => {
    if (isSubmitted) return;
    if (avoidDays.includes(day)) {
      setAvoidDays(avoidDays.filter(d => d !== day));
      return;
    }
    setAvoidDays([...avoidDays, day]);
    if (weekendWishDays.includes(day)) {
      setWeekendWishDays(weekendWishDays.filter(d => d !== day));
    }
  };

  const toggleWeekendWishDay = (day: number) => {
    if (isSubmitted) return;
    if (!planningMonth) return;
    const date = new Date(planningMonth.year, planningMonth.month - 1, day);
    if (!isWeekend(date)) return;
    if (weekendWishDays.includes(day)) {
      setWeekendWishDays(weekendWishDays.filter(d => d !== day));
      return;
    }
    setWeekendWishDays([...weekendWishDays, day]);
    if (avoidDays.includes(day)) {
      setAvoidDays(avoidDays.filter(d => d !== day));
    }
  };

  const toggleWeekday = (weekday: number) => {
    if (isSubmitted) return;
    if (avoidWeekdays.includes(weekday)) {
      setAvoidWeekdays(avoidWeekdays.filter(d => d !== weekday));
    } else {
      setAvoidWeekdays([...avoidWeekdays, weekday]);
    }
  };
  
  const renderCalendarDays = (
    selectedDays: number[],
    onToggle: (day: number) => void,
    options: { selectedClass: string; weekendOnly?: boolean; testIdPrefix: string }
  ) => {
    if (!planningMonth) return null;
    
    const year = planningMonth.year;
    const month = planningMonth.month - 1;
    const daysInMonth = getDaysInMonth(new Date(year, month));
    const firstDayOfMonth = startOfMonth(new Date(year, month));
    const startDayOfWeek = getDay(firstDayOfMonth);
    
    const days = [];
    
    const weekdayHeaders = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={`header-${i}`} className="text-center font-medium text-sm text-muted-foreground py-2">
          {weekdayHeaders[i]}
        </div>
      );
    }
    
    const offset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    for (let i = 0; i < offset; i++) {
      days.push(<div key={`empty-${i}`} className="p-2" />);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isWeekendDay = getDay(date) === 0 || getDay(date) === 6;
      const isSelectable = options.weekendOnly ? isWeekendDay : true;
      const isSelected = selectedDays.includes(day);

      days.push(
        <div
          key={day}
          data-testid={`${options.testIdPrefix}-day-${day}`}
          className={`
            p-2 text-center rounded-md border transition-colors
            ${isSelected ? options.selectedClass : 'border-gray-200 hover:bg-gray-100'}
            ${isWeekendDay ? 'font-semibold' : ''}
            ${!isSelectable ? 'text-muted-foreground opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            ${isSubmitted ? 'cursor-not-allowed opacity-75' : ''}
          `}
          onClick={() => {
            if (isSubmitted || !isSelectable) return;
            onToggle(day);
          }}
        >
          {day}
        </div>
      );
    }
    
    return days;
  };
  
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#0F5BA7]" />
        </div>
      </Layout>
    );
  }
  
  if (!planningMonth) {
    return (
      <Layout>
        <div className="p-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Planungsmonat konnte nicht ermittelt werden.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }
  
  if (!doesShifts) {
    return (
      <Layout>
        <div className="p-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Für Ihr Profil sind derzeit keine Dienstwünsche erforderlich.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  const monthName = MONTH_NAMES[planningMonth.month - 1];
  
  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Dienstwünsche</h1>
            <p className="text-muted-foreground mt-1">
              Wünsche für {monthName} {planningMonth.year}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {isSubmitted ? (
              <Badge variant="default" className="gap-1 bg-green-600">
                <CheckCircle className="w-3 h-3" />
                Eingereicht
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Clock className="w-3 h-3" />
                Entwurf
              </Badge>
            )}
          </div>
        </div>
        
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Planungszeitraum:</strong> Wünsche für {monthName} {planningMonth.year} sind aktuell freigeschaltet.
          </AlertDescription>
        </Alert>
        
        <Tabs defaultValue="wishes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="wishes" data-testid="tab-wishes">Dienstwünsche</TabsTrigger>
            <TabsTrigger value="absences" data-testid="tab-absences">Urlaub/Fortbildung</TabsTrigger>
            {canViewAll && (
              <TabsTrigger value="overview" data-testid="tab-overview">Übersicht</TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="wishes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  Nicht mögliche Tage
                </CardTitle>
                <CardDescription>
                  Klicken Sie auf Tage, an denen Sie keinen Dienst machen können.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1">
                  {renderCalendarDays(avoidDays, toggleAvoidDay, {
                    selectedClass: "bg-red-100 border-red-500 text-red-800",
                    testIdPrefix: "avoid"
                  })}
                </div>
                
                <div className="flex gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-red-100 border border-red-500" />
                    <span>Nicht möglich</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-white border border-gray-200" />
                    <span>Neutral</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Wochenendwünsche</CardTitle>
                <CardDescription>
                  Wählen Sie gewünschte Wochenenddienste (nur Sa/So).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1">
                  {renderCalendarDays(weekendWishDays, toggleWeekendWishDay, {
                    selectedClass: "bg-blue-100 border-blue-500 text-blue-800",
                    weekendOnly: true,
                    testIdPrefix: "weekend"
                  })}
                </div>
                <div className="flex gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-blue-100 border border-blue-500" />
                    <span>Gewünscht</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-white border border-gray-200" />
                    <span>Neutral</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Weitere Einstellungen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Nicht mögliche Wochentage</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 1, label: "Mo" },
                      { value: 2, label: "Di" },
                      { value: 3, label: "Mi" },
                      { value: 4, label: "Do" },
                      { value: 5, label: "Fr" },
                      { value: 6, label: "Sa" },
                      { value: 7, label: "So" }
                    ].map((day) => (
                      <Button
                        key={day.value}
                        variant={avoidWeekdays.includes(day.value) ? "destructive" : "outline"}
                        size="sm"
                        disabled={isSubmitted}
                        onClick={() => toggleWeekday(day.value)}
                        data-testid={`avoid-weekday-${day.value}`}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="maxShifts">Maximale Dienste pro Woche</Label>
                  <Select
                    value={maxShiftsPerWeek?.toString() || ""}
                    onValueChange={(v) => setMaxShiftsPerWeek(v ? parseInt(v) : undefined)}
                    disabled={isSubmitted}
                  >
                    <SelectTrigger className="w-48" data-testid="select-max-shifts">
                      <SelectValue placeholder="Keine Einschränkung" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Keine Einschränkung</SelectItem>
                      <SelectItem value="1">1 Dienst</SelectItem>
                      <SelectItem value="2">2 Dienste</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="maxShiftsPerMonth">Gesamtdienste im Monat</Label>
                    <Input
                      id="maxShiftsPerMonth"
                      type="number"
                      min={0}
                      value={typeof maxShiftsPerMonth === "number" ? maxShiftsPerMonth : ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMaxShiftsPerMonth(value ? parseInt(value, 10) : undefined);
                      }}
                      disabled={isSubmitted}
                      data-testid="input-max-shifts-month"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxWeekendShifts">WE-Limit</Label>
                    <Select
                      value={maxWeekendShifts?.toString() || ""}
                      onValueChange={(v) => setMaxWeekendShifts(v ? parseInt(v) : undefined)}
                      disabled={isSubmitted}
                    >
                      <SelectTrigger className="w-48" data-testid="select-max-weekend-shifts">
                        <SelectValue placeholder="Keine Einschränkung" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Keine Einschränkung</SelectItem>
                        <SelectItem value="0">0 Wochenenden</SelectItem>
                        <SelectItem value="1">1 Wochenende</SelectItem>
                        <SelectItem value="2">2 Wochenenden</SelectItem>
                        <SelectItem value="3">3 Wochenenden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="notes">Besondere Hinweise</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Besondere Wünsche oder Hinweise..."
                    rows={3}
                    disabled={isSubmitted}
                    data-testid="input-notes"
                  />
                </div>
              </CardContent>
            </Card>
            
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving || isSubmitted}
                data-testid="button-save"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Speichern
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving || isSubmitted}
                data-testid="button-submit"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Einreichen
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="absences" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Urlaub / Fortbildung</CardTitle>
                  <CardDescription>
                    Zeitraum für Urlaub oder Fortbildung im {monthName} {planningMonth.year}
                  </CardDescription>
                </div>
                
                <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-absence">
                      <Plus className="w-4 h-4 mr-2" />
                      Urlaub/Fortbildung hinzufügen
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Urlaub/Fortbildung eintragen</DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Grund</Label>
                        <Select value={newAbsenceReason} onValueChange={setNewAbsenceReason}>
                          <SelectTrigger data-testid="select-absence-reason">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ABSENCE_REASONS.map(reason => (
                              <SelectItem key={reason.value} value={reason.value}>
                                {reason.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Von</Label>
                          <Calendar
                            mode="single"
                            selected={newAbsenceStart}
                            onSelect={setNewAbsenceStart}
                            locale={de}
                            className="rounded-md border mt-1"
                          />
                        </div>
                        <div>
                          <Label>Bis</Label>
                          <Calendar
                            mode="single"
                            selected={newAbsenceEnd}
                            onSelect={setNewAbsenceEnd}
                            locale={de}
                            className="rounded-md border mt-1"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Label>Anmerkungen</Label>
                        <Textarea
                          value={newAbsenceNotes}
                          onChange={(e) => setNewAbsenceNotes(e.target.value)}
                          placeholder="Optional..."
                          data-testid="input-absence-notes"
                        />
                      </div>
                    </div>
                    
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Abbrechen</Button>
                      </DialogClose>
                      <Button 
                        onClick={handleAddAbsence}
                        disabled={!newAbsenceStart || !newAbsenceEnd || saving}
                        data-testid="button-save-absence"
                      >
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Speichern
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              
              <CardContent>
                {absences.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Keine Abwesenheiten eingetragen
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Zeitraum</TableHead>
                        <TableHead>Grund</TableHead>
                        <TableHead>Anmerkungen</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {absences.map(absence => (
                        <TableRow key={absence.id} data-testid={`absence-row-${absence.id}`}>
                          <TableCell>
                            {format(new Date(absence.startDate), 'dd.MM.yyyy', { locale: de })} - {format(new Date(absence.endDate), 'dd.MM.yyyy', { locale: de })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{absence.reason}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {absence.notes || "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAbsence(absence.id)}
                              data-testid={`button-delete-absence-${absence.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {canViewAll && (
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Einreichungsübersicht</CardTitle>
                  <CardDescription>
                    {planningMonth.submittedCount} von {planningMonth.totalEmployees} Mitarbeitern haben eingereicht
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 flex-1 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all"
                          style={{ 
                            width: `${(planningMonth.submittedCount / planningMonth.totalEmployees) * 100}%` 
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {Math.round((planningMonth.submittedCount / planningMonth.totalEmployees) * 100)}%
                      </span>
                    </div>
                    
                    {planningMonth.allSubmitted && (
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">
                          Alle Mitarbeiter haben ihre Wünsche eingereicht. Der Dienstplan kann erstellt werden.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mitarbeiter</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Wochenendwünsche</TableHead>
                        <TableHead>Nicht mögliche Tage</TableHead>
                        <TableHead>Eingereicht am</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.filter(employeeDoesShifts).map(emp => {
                        const empWish = allWishes.find(w => w.employeeId === emp.id);
                        
                        return (
                          <TableRow key={emp.id}>
                            <TableCell className="font-medium">{emp.name}</TableCell>
                            <TableCell>
                              {empWish?.status === 'Eingereicht' ? (
                                <Badge className="bg-green-600">Eingereicht</Badge>
                              ) : empWish ? (
                                <Badge variant="secondary">Entwurf</Badge>
                              ) : (
                                <Badge variant="outline">Ausstehend</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {empWish?.preferredShiftDays?.length || 0}
                            </TableCell>
                            <TableCell>
                              {empWish?.avoidShiftDays?.length || 0}
                            </TableCell>
                            <TableCell>
                              {empWish?.submittedAt 
                                ? format(new Date(empWish.submittedAt), 'dd.MM.yyyy HH:mm', { locale: de })
                                : "-"
                              }
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}
