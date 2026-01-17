import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Minus,
  Trash2,
  Loader2,
  Info,
  Pencil,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  shiftWishesApi,
  plannedAbsencesApi,
  rosterSettingsApi,
  employeeApi,
  serviceLinesApi,
  dutyPlansApi,
  type NextPlanningMonth,
} from "@/lib/api";
import type {
  ShiftWish,
  PlannedAbsence,
  Employee,
  ServiceLine,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  eachDayOfInterval,
  format,
  isSameMonth,
  isWeekend,
  startOfMonth,
  startOfDay,
  isBefore,
  isAfter,
  addDays,
  isSameDay,
  endOfMonth,
} from "date-fns";
import { de } from "date-fns/locale";
import { employeeDoesShifts } from "@shared/shiftTypes";

const ABSENCE_REASONS = [
  { value: "Urlaub", label: "Urlaub" },
  { value: "Fortbildung", label: "Fortbildung" },
];

const MONTH_NAMES = [
  "Jänner",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const getPlanMonthDate = (year: number, month: number) =>
  startOfMonth(new Date(year, month - 1, 1));

const getMinSelectableMonth = (user: Employee | null) => {
  const todayMonth = startOfMonth(new Date());
  if (!user?.employmentFrom) return todayMonth;
  const employmentFromMonth = startOfMonth(new Date(user.employmentFrom));
  return isAfter(employmentFromMonth, todayMonth)
    ? employmentFromMonth
    : todayMonth;
};

const findInitialMonth = (user: Employee | null, planMonths: Date[]) => {
  const minMonth = getMinSelectableMonth(user);
  const sorted = [...planMonths].sort((a, b) => a.getTime() - b.getTime());
  const candidate = sorted.find((month) => !isBefore(month, minMonth));
  return candidate ?? minMonth;
};

// --- Austrian holiday helpers ---
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

// Anonymous Gregorian algorithm
const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

const austrianHolidayKeys = (year: number) => {
  const keys = new Set<string>();
  const add = (d: Date) => keys.add(dayKey(d));
  const fixed = (m: number, dd: number) => add(new Date(year, m - 1, dd));

  // Fixed-date public holidays (AT)
  fixed(1, 1); // Neujahr
  fixed(1, 6); // Heilige Drei Könige
  fixed(5, 1); // Staatsfeiertag
  fixed(8, 15); // Mariä Himmelfahrt
  fixed(10, 26); // Nationalfeiertag
  fixed(11, 1); // Allerheiligen
  fixed(12, 8); // Mariä Empfängnis
  fixed(12, 25); // Christtag
  fixed(12, 26); // Stefanitag

  // Movable holidays based on Easter
  const easter = easterSunday(year);
  add(addDays(easter, 1)); // Ostermontag
  add(addDays(easter, 39)); // Christi Himmelfahrt
  add(addDays(easter, 50)); // Pfingstmontag
  add(addDays(easter, 60)); // Fronleichnam

  return keys;
};

export default function ShiftWishes() {
  const {
    employee: currentUser,
    capabilities,
    isAdmin,
    isTechnicalAdmin,
  } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planningMonth, setPlanningMonth] = useState<NextPlanningMonth | null>(
    null,
  );
  const [wish, setWish] = useState<ShiftWish | null>(null);
  const [absences, setAbsences] = useState<PlannedAbsence[]>([]);
  const [allWishes, setAllWishes] = useState<ShiftWish[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [preferredShiftDays, setPreferredShiftDays] = useState<string[]>([]);
  const [avoidShiftDays, setAvoidShiftDays] = useState<string[]>([]);
  const [avoidWeekdays, setAvoidWeekdays] = useState<number[]>([]);
  const [maxShiftsPerWeek, setMaxShiftsPerWeek] = useState<
    number | undefined
  >();
  const [maxShiftsPerMonth, setMaxShiftsPerMonth] = useState<
    number | undefined
  >();
  const [maxWeekendShifts, setMaxWeekendShifts] = useState<
    number | undefined
  >();
  const [notes, setNotes] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<Date>(
    () => startOfMonth(new Date()),
  );

  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [deleteAbsenceOpen, setDeleteAbsenceOpen] = useState(false);
  const [deleteAbsenceId, setDeleteAbsenceId] = useState<number | null>(null);

  const absenceToDelete = useMemo(
    () => absences.find((a) => a.id === deleteAbsenceId) ?? null,
    [absences, deleteAbsenceId],
  );
  const [newAbsenceStart, setNewAbsenceStart] = useState<Date | undefined>();
  const [newAbsenceEnd, setNewAbsenceEnd] = useState<Date | undefined>();
  const [newAbsenceReason, setNewAbsenceReason] = useState<string>("Urlaub");
  const [newAbsenceNotes, setNewAbsenceNotes] = useState("");

  const canViewAll =
    isAdmin || isTechnicalAdmin || capabilities.includes("dutyplan.edit");
  const serviceLineMeta = useMemo(
    () =>
      serviceLines.map((line) => ({
        key: line.key,
        roleGroup: line.roleGroup,
        label: line.label,
      })),
    [serviceLines],
  );
  const doesShifts = currentUser
    ? employeeDoesShifts(currentUser, serviceLineMeta)
    : false;
  const isSubmitted = wish?.status === "Eingereicht";


  const normalizeDayKeys = (
    values: unknown,
    year: number,
    month: number,
  ) => {
    if (!Array.isArray(values)) return [];
    const keys = values
      .map((value) => {
        if (typeof value === "string") return value;
        if (typeof value === "number" && Number.isInteger(value)) {
          return format(new Date(year, month - 1, value), "yyyy-MM-dd");
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));
    return Array.from(new Set(keys));
  };

  const applyWishDayStates = (
    wishData: ShiftWish | null,
    year: number,
    month: number,
  ) => {
    if (!wishData) {
      setPreferredShiftDays([]);
      setAvoidShiftDays([]);
      return;
    }

    setPreferredShiftDays(
      normalizeDayKeys(wishData.preferredShiftDays, year, month),
    );
    setAvoidShiftDays(
      normalizeDayKeys(wishData.avoidShiftDays, year, month),
    );
  };

  const keyFromDate = (date: Date) => format(date, "yyyy-MM-dd");

  const toValidDate = (value: unknown) => {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const monthAnchor = useMemo(
    () => (selectedMonth ? startOfMonth(selectedMonth) : null),
    [selectedMonth],
  );

  const holidaySet = useMemo(
    () => (selectedMonth ? austrianHolidayKeys(selectedMonth.getFullYear()) : new Set<string>()),
    [selectedMonth],
  );

  const absenceKeySet = useMemo(() => {
    const set = new Set<string>();
    if (!monthAnchor) return set;
  
    absences.forEach((absence) => {
      const start = toValidDate(absence.startDate);
      const end = toValidDate(absence.endDate);
      if (!start || !end) return;
  
      const interval =
        start.getTime() <= end.getTime()
          ? { start, end }
          : { start: end, end: start };
  
      eachDayOfInterval(interval).forEach((day) => {
        if (!isSameMonth(day, monthAnchor)) return;
        set.add(keyFromDate(day));
      });
    });
  
    return set;
  }, [absences, monthAnchor]);

  const effectiveBlockedKeySet = useMemo(() => {
    const set = new Set<string>(avoidShiftDays);
    absenceKeySet.forEach((key) => {
      if (!preferredShiftDays.includes(key)) {
        set.add(key);
      }
    });
    return set;
  }, [absenceKeySet, avoidShiftDays, preferredShiftDays]);

  const getState = (key: string) => {
    const isWish = preferredShiftDays.includes(key);
    const isAvoid = avoidShiftDays.includes(key);
    const isBlockedByAbsence = absenceKeySet.has(key) && !isWish;
    if (isAvoid || isBlockedByAbsence) return "blocked";
    if (isWish) return "wish";
    return "neutral";
  };

  const setDayState = (
    key: string,
    nextState: "wish" | "blocked" | "neutral",
  ) => {
    const wishSet = new Set(preferredShiftDays);
    const avoidSet = new Set(avoidShiftDays);

    if (nextState === "wish") {
      wishSet.add(key);
      avoidSet.delete(key);
    } else if (nextState === "blocked") {
      avoidSet.add(key);
      wishSet.delete(key);
    } else {
      wishSet.delete(key);
      avoidSet.delete(key);
    }

    avoidSet.forEach((blockKey) => {
      if (wishSet.has(blockKey)) {
        wishSet.delete(blockKey);
      }
    });

    setPreferredShiftDays(Array.from(wishSet));
    setAvoidShiftDays(Array.from(avoidSet));
  };

  const toggleWish = (key: string) => {
    if (isSubmitted || saving) return;
    const current = getState(key);
    const nextState = current === "wish" ? "neutral" : "wish";
    setDayState(key, nextState);
  };

  const toggleBlocked = (key: string) => {
    if (isSubmitted || saving) return;
    const current = getState(key);
    const nextState = current === "blocked" ? "neutral" : "blocked";
    setDayState(key, nextState);
  };

  const monthWeeks = useMemo(() => {
    if (!monthAnchor) return [];
    const start = monthAnchor;
    const end = endOfMonth(monthAnchor);
    const days = eachDayOfInterval({ start, end });
    const weeks: Array<(Date | null)[]> = [];
    let currentWeek = Array(7).fill(null);

    days.forEach((day) => {
      const index = (day.getDay() + 6) % 7;
      currentWeek[index] = day;
      if (index === 6) {
        weeks.push(currentWeek);
        currentWeek = Array(7).fill(null);
      }
    });

    if (currentWeek.some((value) => value !== null)) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [monthAnchor]);

  // --- Absence interruption helpers ---
  const splitIntoRanges = (dates: Date[]) => {
    if (!dates.length) return [] as Array<{ start: Date; end: Date }>;
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const ranges: Array<{ start: Date; end: Date }> = [];

    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      if (isSameDay(cur, addDays(prev, 1))) {
        prev = cur;
        continue;
      }
      ranges.push({ start, end: prev });
      start = cur;
      prev = cur;
    }

    ranges.push({ start, end: prev });
    return ranges;
  };

  const interruptAbsencesForWishDays = async (wishDayKeys: string[]) => {
    if (!currentUser || !monthAnchor || !selectedMonth) return;
    if (!wishDayKeys.length) return;

    const overrideSet = new Set(wishDayKeys);

    for (const absence of absences) {
      const start = toValidDate(absence.startDate);
      const end = toValidDate(absence.endDate);
      if (!start || !end) continue;

      const interval = start.getTime() <= end.getTime()
        ? { start, end }
        : { start: end, end: start };

      const allDays = eachDayOfInterval(interval).filter((d) =>
        isSameMonth(d, monthAnchor),
      );

      const affected = allDays.some((d) => overrideSet.has(keyFromDate(d)));
      if (!affected) continue;

      const remainingDays = allDays.filter((d) => !overrideSet.has(keyFromDate(d)));

      // delete original
      await plannedAbsencesApi.delete(absence.id);

      // recreate remaining segments
      const segments = splitIntoRanges(remainingDays);
      for (const seg of segments) {
          await plannedAbsencesApi.create({
            employeeId: currentUser.id,
            year: selectedMonth.getFullYear(),
            month: selectedMonth.getMonth() + 1,
            startDate: format(seg.start, "yyyy-MM-dd"),
            endDate: format(seg.end, "yyyy-MM-dd"),
            reason: absence.reason as any,
            notes: (absence as any).notes ?? null,
          });
        }
      }

    const absenceData = await plannedAbsencesApi.getByEmployeeAndMonth(
      currentUser.id,
      selectedMonth.getFullYear(),
      selectedMonth.getMonth() + 1,
    );
    setAbsences(absenceData);
  };

  const isWeekendKey = (key: string) => {
    const date = new Date(key);
    if (Number.isNaN(date.getTime())) return false;
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const getAbsenceStatus = (absence: PlannedAbsence) => {
    const today = startOfDay(new Date());
    const start = startOfDay(new Date(absence.startDate));
    const end = startOfDay(new Date(absence.endDate));

    if (isBefore(end, today)) {
      return { label: "Vergangen", variant: "outline" as const };
    }

    if (isAfter(start, today)) {
      return { label: "Geplant", variant: "secondary" as const };
    }

    return { label: "Läuft", variant: "default" as const };
  };

  const weekendWishCount = preferredShiftDays.filter(isWeekendKey).length;
  const weekendBlockedCount =
    Array.from(effectiveBlockedKeySet).filter(isWeekendKey).length;
  const effectiveBlockedCount = effectiveBlockedKeySet.size;

  useEffect(() => {
    if (!currentUser) return;
    loadData();
  }, [currentUser?.id, canViewAll]);

  const loadMonthSpecificData = async (monthDate: Date) => {
    if (!currentUser) return;
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;

    const [wishData, absenceData] = await Promise.all([
      shiftWishesApi.getByEmployeeAndMonth(currentUser.id, year, month),
      plannedAbsencesApi.getByEmployeeAndMonth(currentUser.id, year, month),
    ]);

    setWish(wishData);
    if (wishData) {
      applyWishDayStates(wishData, year, month);
      setAvoidWeekdays(wishData.avoidWeekdays || []);
      setMaxShiftsPerWeek(wishData.maxShiftsPerWeek || undefined);
      setMaxShiftsPerMonth(wishData.maxShiftsPerMonth || undefined);
      setMaxWeekendShifts(wishData.maxWeekendShifts || undefined);
      setNotes(wishData.notes || "");
    } else {
      setPreferredShiftDays([]);
      setAvoidShiftDays([]);
      setAvoidWeekdays([]);
      setMaxShiftsPerWeek(undefined);
      setMaxShiftsPerMonth(undefined);
      setMaxWeekendShifts(undefined);
      setNotes("");
    }

    setAbsences(absenceData);

    if (canViewAll) {
      const allWishData = await shiftWishesApi.getByMonth(year, month);
      setAllWishes(allWishData);
    } else {
      setAllWishes([]);
    }
  };

  const loadData = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);

      const [
        monthData,
        emps,
        serviceLineData,
        dutyPlanList,
      ] = await Promise.all([
        rosterSettingsApi.getNextPlanningMonth(),
        canViewAll ? employeeApi.getAll() : Promise.resolve([]),
        serviceLinesApi.getAll().catch(() => []),
        dutyPlansApi.getAll().catch(() => []),
      ]);

      setPlanningMonth(monthData);
      setEmployees(emps);
      setServiceLines(serviceLineData);

      const planMonths = dutyPlanList
        .map((plan) => getPlanMonthDate(plan.year, plan.month))
        .sort((a, b) => a.getTime() - b.getTime());

      const initialMonth = findInitialMonth(currentUser, planMonths);
      setSelectedMonth(initialMonth);

      await loadMonthSpecificData(initialMonth);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Daten konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser || !selectedMonth) return;

    try {
      setSaving(true);
      const normalizedAvoidShiftDays = Array.from(new Set(avoidShiftDays));
      const avoidSet = new Set(normalizedAvoidShiftDays);
      const normalizedPreferredShiftDays = Array.from(
        new Set(
          preferredShiftDays.filter((key) => !avoidSet.has(key)),
        ),
      );
      setAvoidShiftDays(normalizedAvoidShiftDays);
      setPreferredShiftDays(normalizedPreferredShiftDays);

      const wishData = {
        employeeId: currentUser.id,
        year: selectedMonth.getFullYear(),
        month: selectedMonth.getMonth() + 1,
        preferredShiftDays: normalizedPreferredShiftDays,
        avoidShiftDays: normalizedAvoidShiftDays,
        avoidWeekdays: avoidWeekdays,
        maxShiftsPerWeek:
          typeof maxShiftsPerWeek === "number" ? maxShiftsPerWeek : null,
        maxShiftsPerMonth:
          typeof maxShiftsPerMonth === "number" ? maxShiftsPerMonth : null,
        maxWeekendShifts:
          typeof maxWeekendShifts === "number" ? maxWeekendShifts : null,
        notes: notes || null,
      };

      if (wish) {
        const updated = await shiftWishesApi.update(wish.id, wishData);
        setWish(updated);
        applyWishDayStates(
          updated,
          selectedMonth.getFullYear(),
          selectedMonth.getMonth() + 1,
        );
      } else {
        const created = await shiftWishesApi.create(wishData);
        setWish(created);
        applyWishDayStates(
          created,
          selectedMonth.getFullYear(),
          selectedMonth.getMonth() + 1,
        );
      }

      // --- Interrupt absences for wish days overlapping ---
      const overriddenAbsenceDays = normalizedPreferredShiftDays.filter((k) => absenceKeySet.has(k));
      if (overriddenAbsenceDays.length) {
        try {
          await interruptAbsencesForWishDays(overriddenAbsenceDays);
        } catch (e) {
          toast({
            title: "Hinweis",
            description: "Wunsch gespeichert, aber Abwesenheit konnte nicht automatisch unterbrochen werden",
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Gespeichert",
        description: "Ihre Wünsche wurden gespeichert",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Speichern fehlgeschlagen",
        variant: "destructive",
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
        description: "Ihre Wünsche wurden erfolgreich eingereicht",
      });

      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Einreichen fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    if (!wish?.id) return;

    try {
      setSaving(true);
      const updated = await shiftWishesApi.reopen(wish.id);
      setWish(updated);

      toast({
        title: "Bearbeitung aktiviert",
        description: "Ihr Wunsch ist wieder im Entwurfsstatus und kann bearbeitet werden",
      });

      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Bearbeiten fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddAbsence = async () => {
    if (!currentUser || !selectedMonth || !newAbsenceStart || !newAbsenceEnd)
      return;

    try {
      setSaving(true);

      await plannedAbsencesApi.create({
        employeeId: currentUser.id,
        year: selectedMonth.getFullYear(),
        month: selectedMonth.getMonth() + 1,
        startDate: format(newAbsenceStart, "yyyy-MM-dd"),
        endDate: format(newAbsenceEnd, "yyyy-MM-dd"),
        reason: newAbsenceReason as any,
        notes: newAbsenceNotes || null,
      });

      setAbsenceDialogOpen(false);
      setNewAbsenceStart(undefined);
      setNewAbsenceEnd(undefined);
      setNewAbsenceReason("Urlaub");
      setNewAbsenceNotes("");

      const absenceData = await plannedAbsencesApi.getByEmployeeAndMonth(
        currentUser.id,
        selectedMonth.getFullYear(),
        selectedMonth.getMonth() + 1,
      );
      setAbsences(absenceData);

      toast({
        title: "Hinzugefügt",
        description: "Abwesenheit wurde eingetragen",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Abwesenheit konnte nicht eingetragen werden",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAbsence = async (id: number) => {
    try {
      setSaving(true);
      await plannedAbsencesApi.delete(id);
      setAbsences((prev) => prev.filter((a) => a.id !== id));

      toast({
        title: "Gelöscht",
        description: "Abwesenheit wurde entfernt",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Löschen fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleWeekday = (weekday: number) => {
    if (isSubmitted) return;
    if (avoidWeekdays.includes(weekday)) {
      setAvoidWeekdays(avoidWeekdays.filter((d) => d !== weekday));
    } else {
      setAvoidWeekdays([...avoidWeekdays, weekday]);
    }
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

  if (!doesShifts && !canViewAll) {
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

  const monthName = MONTH_NAMES[selectedMonth.getMonth()];

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Dienstwünsche
            </h1>
            <p className="text-muted-foreground mt-1">
              Wünsche für {monthName} {selectedMonth.getFullYear()}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {isSubmitted ? (
              <>
                <Badge variant="default" className="gap-1 bg-green-600">
                  <CheckCircle className="w-3 h-3" />
                  Eingereicht
                </Badge>
                <Button
                  variant="outline"
                  onClick={handleReopen}
                  disabled={saving}
                  data-testid="button-reopen"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Pencil className="w-4 h-4 mr-2" />
                  )}
                  Bearbeiten
                </Button>
              </>
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
            <strong>Planungszeitraum:</strong> Wünsche für {monthName}{" "}
            {selectedMonth.getFullYear()} sind aktuell freigeschaltet.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="wishes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="wishes" data-testid="tab-wishes">
              Dienstwünsche
            </TabsTrigger>
            <TabsTrigger value="absences" data-testid="tab-absences">
              Urlaub/Fortbildung
            </TabsTrigger>
            {canViewAll && (
              <TabsTrigger value="overview" data-testid="tab-overview">
                Übersicht
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="wishes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  Dienstwünsche &amp; Sperren
                </CardTitle>
                <CardDescription>
                  Markieren Sie einzelne Tage im aktuellen Monat als Wunsch (+)
                  oder Nicht möglich (–). Abwesenheiten werden automatisch
                  gesperrt, Wünsche übersteuern sie.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {monthAnchor ? (
                  <>
                    <div className="grid grid-cols-7 gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {WEEKDAY_LABELS.map((label) => (
                        <div key={label} className="text-center">
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {monthWeeks.map((week, weekIndex) =>
                        week.map((day, dayIndex) => {
                          const slotKey = `${weekIndex}-${dayIndex}`;
                          if (!day) {
                            return (
                              <div
                                key={`empty-${slotKey}`}
                                className="h-20 rounded-md border border-transparent"
                                aria-hidden
                              />
                            );
                          }
                          const key = keyFromDate(day);
                          const state = getState(key);
                          const weekendOrHoliday =
                            isWeekend(day) || holidaySet.has(key);
                          const highlightWeekend =
                            state === "neutral" && weekendOrHoliday;
                          let stateClasses =
                            "bg-white border border-border text-muted-foreground";
                          if (state === "wish") {
                            stateClasses =
                              "bg-blue-50 border-blue-200 text-blue-900";
                          } else if (state === "blocked") {
                            stateClasses =
                              "bg-red-50 border-red-200 text-red-900";
                          } else if (highlightWeekend) {
                            stateClasses =
                              "bg-yellow-50 border-yellow-300 text-yellow-900";
                          }
                          const formattedDate = format(day, "dd.MM.yyyy", {
                            locale: de,
                          });

                          return (
                            <div
                              key={key}
                              className={`relative flex min-h-[80px] flex-col items-center justify-center rounded-md border px-1 pb-10 pt-3 text-center text-sm font-semibold transition ${stateClasses}`}
                            >
                              <div className="text-lg font-semibold">
                                {day.getDate()}
                              </div>
                              <div className="absolute inset-x-2 bottom-1 flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => toggleWish(key)}
                                  disabled={isSubmitted || saving}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 bg-white/80 text-[10px] text-blue-500 transition disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label={`Wunsch für ${formattedDate}`}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleBlocked(key)}
                                  disabled={isSubmitted || saving}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white/80 text-[10px] text-red-500 transition disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label={`Nicht möglich für ${formattedDate}`}
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        }),
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Kalender steht erst nach Auswahl eines Planungsmonats zur
                    Verfügung.
                  </p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-muted-foreground">
                  <span>Wünsche: {preferredShiftDays.length}</span>
                  <span>Nicht möglich: {effectiveBlockedCount}</span>
                  <span>Wochenend-Wünsche: {weekendWishCount}w</span>
                  <span>Wochenend-Sperren: {weekendBlockedCount}w</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weitere Einstellungen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    Nicht mögliche Wochentage
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 1, label: "Mo" },
                      { value: 2, label: "Di" },
                      { value: 3, label: "Mi" },
                      { value: 4, label: "Do" },
                      { value: 5, label: "Fr" },
                      { value: 6, label: "Sa" },
                      { value: 7, label: "So" },
                    ].map((day) => (
                      <Button
                        key={day.value}
                        variant={
                          avoidWeekdays.includes(day.value)
                            ? "destructive"
                            : "outline"
                        }
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
                  <Label>
                    Max. Dienste pro Woche (1–3)
                  </Label>
                  <Select
                    value={
                      typeof maxShiftsPerWeek === "number"
                        ? maxShiftsPerWeek.toString()
                        : "none"
                    }
                    onValueChange={(v) =>
                      setMaxShiftsPerWeek(
                        v === "none" ? undefined : parseInt(v, 10),
                      )
                    }
                    disabled={isSubmitted}
                  >
                    <SelectTrigger
                      className="w-48"
                      data-testid="select-max-shifts"
                    >
                      <SelectValue placeholder="Keine Angabe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine Angabe</SelectItem>
                      <SelectItem value="1">1 Dienst</SelectItem>
                      <SelectItem value="2">2 Dienste</SelectItem>
                      <SelectItem value="3">3 Dienste</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="maxShiftsPerMonth">
                      Gesamtdienste im Monat
                    </Label>
                    <Input
                      id="maxShiftsPerMonth"
                      type="number"
                      min={0}
                      value={
                        typeof maxShiftsPerMonth === "number"
                          ? maxShiftsPerMonth
                          : ""
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setMaxShiftsPerMonth(
                          value ? parseInt(value, 10) : undefined,
                        );
                      }}
                      disabled={isSubmitted}
                      data-testid="input-max-shifts-month"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxWeekendShifts">WE-Limit</Label>
                    <Select
                      value={
                        typeof maxWeekendShifts === "number"
                          ? maxWeekendShifts.toString()
                          : "none"
                      }
                      onValueChange={(v) =>
                        setMaxWeekendShifts(
                          v === "none" ? undefined : parseInt(v, 10),
                        )
                      }
                      disabled={isSubmitted}
                    >
                      <SelectTrigger
                        className="w-48"
                        data-testid="select-max-weekend-shifts"
                      >
                        <SelectValue placeholder="Keine Einschränkung" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Keine Einschränkung
                        </SelectItem>
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
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Speichern
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving || isSubmitted}
                data-testid="button-submit"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
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
                    Zeitraum für Urlaub oder Fortbildung im {monthName}{" "}
                    {selectedMonth.getFullYear()}
                  </CardDescription>
                </div>

                <Dialog
                  open={absenceDialogOpen}
                  onOpenChange={setAbsenceDialogOpen}
                >
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
                        <Select
                          value={newAbsenceReason}
                          onValueChange={setNewAbsenceReason}
                        >
                          <SelectTrigger data-testid="select-absence-reason">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ABSENCE_REASONS.map((reason) => (
                              <SelectItem
                                key={reason.value}
                                value={reason.value}
                              >
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
                        {saving ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
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
                        <TableHead>Status</TableHead>
                        <TableHead>Anmerkungen</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {absences.map((absence) => (
                        <TableRow
                          key={absence.id}
                          data-testid={`absence-row-${absence.id}`}
                        >
                          <TableCell>
                            {format(new Date(absence.startDate), "dd.MM.yyyy", {
                              locale: de,
                            })}{" "}
                            -{" "}
                            {format(new Date(absence.endDate), "dd.MM.yyyy", {
                              locale: de,
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{absence.reason}</Badge>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const s = getAbsenceStatus(absence);
                              return <Badge variant={s.variant}>{s.label}</Badge>;
                            })()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {absence.notes || "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeleteAbsenceId(absence.id);
                                setDeleteAbsenceOpen(true);
                              }}
                              data-testid={`button-delete-absence-${absence.id}`}
                              aria-label="Abwesenheit löschen"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <Dialog open={deleteAbsenceOpen} onOpenChange={setDeleteAbsenceOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Abwesenheit wirklich löschen?</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-2 text-sm">
                      <p>Diese Aktion kann nicht rückgängig gemacht werden.</p>
                      {absenceToDelete ? (
                        <div className="rounded-md border p-3 bg-muted/30">
                          <div>
                            <span className="font-medium">Zeitraum:</span>{" "}
                            {format(new Date(absenceToDelete.startDate), "dd.MM.yyyy", { locale: de })} - {format(new Date(absenceToDelete.endDate), "dd.MM.yyyy", { locale: de })}
                          </div>
                          <div>
                            <span className="font-medium">Grund:</span> {absenceToDelete.reason}
                          </div>
                          {absenceToDelete.notes ? (
                            <div>
                              <span className="font-medium">Notiz:</span> {absenceToDelete.notes}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" disabled={saving}>
                          Abbrechen
                        </Button>
                      </DialogClose>
                      <Button
                        variant="destructive"
                        disabled={saving || !deleteAbsenceId}
                        onClick={async () => {
                          if (!deleteAbsenceId) return;
                          await handleDeleteAbsence(deleteAbsenceId);
                          setDeleteAbsenceOpen(false);
                          setDeleteAbsenceId(null);
                        }}
                        data-testid="button-confirm-delete-absence"
                      >
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Wirklich löschen
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </TabsContent>

          {canViewAll && (
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Einreichungsübersicht</CardTitle>
                  <CardDescription>
                    {planningMonth.submittedCount} von{" "}
                    {planningMonth.totalEmployees} Mitarbeitern haben
                    eingereicht
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 flex-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{
                            width: `${(planningMonth.submittedCount / planningMonth.totalEmployees) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {Math.round(
                          (planningMonth.submittedCount /
                            planningMonth.totalEmployees) *
                            100,
                        )}
                        %
                      </span>
                    </div>

                    {planningMonth.allSubmitted && (
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">
                          Alle Mitarbeiter haben ihre Wünsche eingereicht. Der
                          Dienstplan kann erstellt werden.
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
                        <TableHead>Dienstwünsche</TableHead>
                        <TableHead>Nicht mögliche Tage</TableHead>
                        <TableHead>Eingereicht am</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees
                        .filter((employee) =>
                          employeeDoesShifts(employee, serviceLineMeta),
                        )
                        .map((emp) => {
                          const empWish = allWishes.find(
                            (w) => w.employeeId === emp.id,
                          );

                          return (
                            <TableRow key={emp.id}>
                              <TableCell className="font-medium">
                                {emp.name}
                              </TableCell>
                              <TableCell>
                                {empWish?.status === "Eingereicht" ? (
                                  <Badge className="bg-green-600">
                                    Eingereicht
                                  </Badge>
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
                                  ? format(
                                      new Date(empWish.submittedAt),
                                      "dd.MM.yyyy HH:mm",
                                      { locale: de },
                                    )
                                  : "-"}
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
