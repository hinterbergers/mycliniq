import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek, getYear, eachDayOfInterval, addDays } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  GripVertical,
  User,
  Plus,
  Info,
  Lock,
  Unlock,
  StickyNote
} from "lucide-react";

import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  employeeApi,
  longTermAbsencesApi,
  plannedAbsencesAdminApi,
  roomApi,
  rosterApi,
  weeklyPlanApi,
  type PlannedAbsenceAdmin,
  type WeeklyPlanAssignmentResponse,
  type WeeklyPlanResponse
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Employee, LongTermAbsence, RosterShift } from "@shared/schema";
import {
  WEEKDAY_LABELS,
  WEEKDAY_FULL,
  type PlannedAbsenceLike,
  type WeeklyPlanRoom,
  formatRoomTime,
  getEmployeeDisplayName,
  getRoomSettingForDate,
  isEmployeeAbsentOnDate,
  isEmployeeEligibleForRoom,
  isEmployeeOnDutyDate
} from "@/lib/weeklyPlanUtils";

const ROLE_COLORS: Record<string, string> = {
  Primararzt: "bg-purple-100 text-purple-800 border-purple-200",
  "1. Oberarzt": "bg-blue-100 text-blue-800 border-blue-200",
  Funktionsoberarzt: "bg-blue-100 text-blue-800 border-blue-200",
  Ausbildungsoberarzt: "bg-blue-100 text-blue-800 border-blue-200",
  Oberarzt: "bg-blue-100 text-blue-800 border-blue-200",
  Oberaerztin: "bg-blue-100 text-blue-800 border-blue-200",
  Facharzt: "bg-cyan-100 text-cyan-800 border-cyan-200",
  Assistenzarzt: "bg-green-100 text-green-800 border-green-200",
  Assistenzaerztin: "bg-green-100 text-green-800 border-green-200",
  Turnusarzt: "bg-amber-100 text-amber-800 border-amber-200",
  "Student (KPJ)": "bg-orange-100 text-orange-800 border-orange-200",
  "Student (Famulant)": "bg-orange-100 text-orange-800 border-orange-200",
  Sekretariat: "bg-slate-100 text-slate-700 border-slate-200"
};

const ROLE_BADGES: Record<string, string> = {
  Primararzt: "Prim",
  "1. Oberarzt": "1.OA",
  Funktionsoberarzt: "FOA",
  Ausbildungsoberarzt: "AOA",
  Oberarzt: "OA",
  Oberaerztin: "OA",
  Facharzt: "FA",
  Assistenzarzt: "AA",
  Assistenzaerztin: "AA",
  Turnusarzt: "TA",
  "Student (KPJ)": "KPJ",
  "Student (Famulant)": "FAM",
  Sekretariat: "SEK"
};

const ROLE_GROUP_ORDER: Record<string, number> = {
  primar: 1,
  erster_oa: 2,
  funktions_oa: 3,
  ausbildungs_oa: 4,
  oberarzt: 5,
  facharzt: 6,
  assistenzarzt: 7,
  turnus: 8,
  student: 9,
  sonstige: 90,
  sekretariat: 99
};

const normalizeRole = (role?: string | null) => {
  if (!role) return "";
  return role
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const getRoleGroupKey = (role?: string | null) => {
  const normalized = normalizeRole(role);
  if (!normalized) return "sonstige";
  const compact = normalized.replace(/\s+/g, "");
  if (normalized.includes("sekretariat")) return "sekretariat";
  if (compact.includes("primar") || compact.includes("primaer")) return "primar";
  if (
    normalized.includes("1 oberarzt") ||
    normalized.includes("1 oberaerzt") ||
    normalized.includes("erster oberarzt") ||
    normalized.includes("erster oberaerzt") ||
    normalized.includes("erste oberarzt") ||
    normalized.includes("erste oberaerzt")
  )
    return "erster_oa";
  if (compact.includes("funktionsoberarzt") || compact.includes("funktionsoberaerzt")) return "funktions_oa";
  if (compact.includes("ausbildungsoberarzt") || compact.includes("ausbildungsoberaerzt")) return "ausbildungs_oa";
  if (compact.includes("oberarzt") || compact.includes("oberaerzt")) return "oberarzt";
  if (compact.includes("facharzt") || compact.includes("fachaerzt")) return "facharzt";
  if (compact.includes("assistenzarzt") || compact.includes("assistenzaerzt")) return "assistenzarzt";
  if (compact.includes("turnusarzt") || compact.includes("turnusaerzt") || normalized.includes("turnus"))
    return "turnus";
  if (normalized.includes("student") || normalized.includes("kpj") || normalized.includes("famul")) return "student";
  return "sonstige";
};

const compareAvailabilityEmployees = (a: Employee, b: Employee) => {
  const groupA = ROLE_GROUP_ORDER[getRoleGroupKey(a.role)] ?? ROLE_GROUP_ORDER.sonstige;
  const groupB = ROLE_GROUP_ORDER[getRoleGroupKey(b.role)] ?? ROLE_GROUP_ORDER.sonstige;
  if (groupA !== groupB) return groupA - groupB;
  const lastA = (a.lastName || a.name || "").toLocaleLowerCase("de");
  const lastB = (b.lastName || b.name || "").toLocaleLowerCase("de");
  if (lastA !== lastB) return lastA.localeCompare(lastB, "de");
  const firstA = (a.firstName || "").toLocaleLowerCase("de");
  const firstB = (b.firstName || "").toLocaleLowerCase("de");
  if (firstA !== firstB) return firstA.localeCompare(firstB, "de");
  return getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b), "de");
};

const statusBadgeStyles: Record<WeeklyPlanResponse["status"], string> = {
  Entwurf: "bg-amber-50 text-amber-700 border-amber-200",
  Vorläufig: "bg-sky-50 text-sky-700 border-sky-200",
  Freigegeben: "bg-green-50 text-green-700 border-green-200"
};

const ZEITAUSGLEICH_STATUS_STYLES: Record<string, string> = {
  Geplant: "bg-amber-50 text-amber-700 border-amber-200",
  Genehmigt: "bg-green-50 text-green-700 border-green-200",
  Abgelehnt: "bg-rose-50 text-rose-700 border-rose-200"
};

const getWeekKey = (date: Date) => ({
  year: getYear(startOfWeek(date, { weekStartsOn: 1 })),
  week: getWeek(date, { weekStartsOn: 1 })
});

const formatDateRange = (start: Date, end: Date) =>
  `${format(start, "dd.MM.", { locale: de })} – ${format(end, "dd.MM.yyyy", { locale: de })}`;

type NoteDialogState = {
  roomId: number;
  weekday: number;
  note: string;
  isBlocked: boolean;
  assignmentId?: number | null;
};

export default function WeeklyPlan() {
  const { employee: currentUser } = useAuth();
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedWeekday, setSelectedWeekday] = useState(1);
  const [rooms, setRooms] = useState<WeeklyPlanRoom[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [plannedAbsences, setPlannedAbsences] = useState<PlannedAbsenceAdmin[]>([]);
  const [longTermAbsences, setLongTermAbsences] = useState<LongTermAbsence[]>([]);
  const [rosterShifts, setRosterShifts] = useState<RosterShift[]>([]);
  const [noteDialog, setNoteDialog] = useState<NoteDialogState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [roomOrderIds, setRoomOrderIds] = useState<number[]>([]);
  const [rightPaneOffset, setRightPaneOffset] = useState(96);
  const draggedRoomIdRef = useRef<number | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    let frame = 0;
    const updateOffset = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = toolbar.getBoundingClientRect().height;
        const nextOffset = Math.max(72, Math.round(height + 12));
        setRightPaneOffset((prev) => (prev === nextOffset ? prev : nextOffset));
      });
    };
    updateOffset();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateOffset);
      observer.observe(toolbar);
    }
    window.addEventListener("resize", updateOffset);
    return () => {
      window.removeEventListener("resize", updateOffset);
      if (observer) observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekNumber = useMemo(() => getWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekYear = useMemo(() => getYear(weekStart), [weekStart]);

  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }),
    [weekStart]
  );

  const selectedDayDate = days[selectedWeekday - 1] ?? days[0];
  const selectedDateKey = selectedDayDate ? format(selectedDayDate, "yyyy-MM-dd") : "";

  const weekOptions = useMemo(() => {
    return Array.from({ length: 16 }, (_, i) => {
      const date = addWeeks(new Date(), i - 6);
      const { week, year } = getWeekKey(date);
      return { week, year, date };
    });
  }, []);

  const assignments = weeklyPlan?.assignments ?? [];
  const lockedWeekdays = weeklyPlan?.lockedWeekdays ?? [];
  const isPlanReleased = weeklyPlan?.status === "Freigegeben";

  const employeesById = useMemo(() => {
    return new Map(employees.map((employee) => [employee.id, employee]));
  }, [employees]);

  const assignmentsByDayRoom = useMemo(() => {
    const map = new Map<string, WeeklyPlanAssignmentResponse[]>();
    assignments.forEach((assignment) => {
      const key = `${assignment.weekday}-${assignment.roomId}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(assignment);
    });
    return map;
  }, [assignments]);

  const assignmentsByWeekday = useMemo(() => {
    const map = new Map<number, WeeklyPlanAssignmentResponse[]>();
    assignments.forEach((assignment) => {
      if (!map.has(assignment.weekday)) {
        map.set(assignment.weekday, []);
      }
      map.get(assignment.weekday)?.push(assignment);
    });
    return map;
  }, [assignments]);

  const duplicateEmployeeIdsByWeekday = useMemo(() => {
    const map = new Map<number, Set<number>>();
    assignmentsByWeekday.forEach((dayAssignments, weekday) => {
      const counts = new Map<number, number>();
      dayAssignments.forEach((assignment) => {
        if (!assignment.employeeId) return;
        counts.set(assignment.employeeId, (counts.get(assignment.employeeId) ?? 0) + 1);
      });
      const duplicates = new Set<number>();
      counts.forEach((count, employeeId) => {
        if (count > 1) duplicates.add(employeeId);
      });
      map.set(weekday, duplicates);
    });
    return map;
  }, [assignmentsByWeekday]);

  const availabilityByWeekday = useMemo(() => {
    const map = new Map<number, Employee[]>();
    days.forEach((day) => {
      const weekday = day.getDay() === 0 ? 7 : day.getDay();
      const previousDay = addDays(day, -1);
      const available = employees
        .filter((employee) => employee.isActive)
        .filter((employee) => !isEmployeeAbsentOnDate(employee, day, plannedAbsences, longTermAbsences))
        .filter((employee) => !isEmployeeOnDutyDate(employee.id, day, rosterShifts))
        .filter((employee) => !isEmployeeOnDutyDate(employee.id, previousDay, rosterShifts))
        .filter((employee) => getRoleGroupKey(employee.role) !== "sekretariat")
        .sort(compareAvailabilityEmployees);
      map.set(weekday, available);
    });
    return map;
  }, [days, employees, plannedAbsences, longTermAbsences, rosterShifts]);

  const unassignedAvailableByWeekday = useMemo(() => {
    const map = new Map<number, Employee[]>();
    availabilityByWeekday.forEach((available, weekday) => {
      const assignedIds = new Set(
        (assignmentsByWeekday.get(weekday) ?? [])
          .map((assignment) => assignment.employeeId)
          .filter((id): id is number => typeof id === "number")
      );
      map.set(
        weekday,
        available.filter((employee) => !assignedIds.has(employee.id))
      );
    });
    return map;
  }, [availabilityByWeekday, assignmentsByWeekday]);

  const absencesByDate = useMemo(() => {
    const map = new Map<string, PlannedAbsenceLike[]>();
    plannedAbsences.forEach((absence) => {
      if (absence.status === "Abgelehnt") return;
      const start = new Date(`${absence.startDate}T00:00:00`);
      const end = new Date(`${absence.endDate}T00:00:00`);
      for (let day = start; day <= end; day = addDays(day, 1)) {
        const key = format(day, "yyyy-MM-dd");
        if (!map.has(key)) map.set(key, []);
        map.get(key)?.push(absence);
      }
    });
    return map;
  }, [plannedAbsences]);

  const zeitausgleichAbsencesForSelectedDay = useMemo(() => {
    if (!selectedDateKey) return [];
    return plannedAbsences.filter(
      (absence) =>
        absence.reason === "Zeitausgleich" &&
        absence.startDate <= selectedDateKey &&
        absence.endDate >= selectedDateKey
    );
  }, [plannedAbsences, selectedDateKey]);

  const declinedZeitausgleichIds = useMemo(() => {
    if (!selectedDateKey) return new Set<number>();
    const ids = plannedAbsences
      .filter(
        (absence) =>
          absence.reason === "Zeitausgleich" &&
          absence.status === "Abgelehnt" &&
          absence.startDate <= selectedDateKey &&
          absence.endDate >= selectedDateKey
      )
      .map((absence) => absence.employeeId);
    return new Set(ids);
  }, [plannedAbsences, selectedDateKey]);

  const activeRoomsByDay = useMemo(() => {
    const map = new Map<number, Array<{ room: WeeklyPlanRoom; setting: ReturnType<typeof getRoomSettingForDate> }>>();
    days.forEach((day) => {
      const weekday = day.getDay() === 0 ? 7 : day.getDay();
      const dayRooms = rooms
        .map((room) => ({ room, setting: getRoomSettingForDate(room, day) }))
        .filter((item) => Boolean(item.setting) && !item.setting?.isClosed)
        .sort((a, b) => {
          const orderDiff = (a.room.weeklyPlanSortOrder ?? 0) - (b.room.weeklyPlanSortOrder ?? 0);
          if (orderDiff !== 0) return orderDiff;
          return a.room.name.localeCompare(b.room.name);
        });
      map.set(weekday, dayRooms as Array<{ room: WeeklyPlanRoom; setting: ReturnType<typeof getRoomSettingForDate> }>);
    });
    return map;
  }, [days, rooms]);

  const loadWeekData = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = format(weekStart, "yyyy-MM-dd");
      const to = format(weekEnd, "yyyy-MM-dd");
      const dayBeforeWeekStart = addDays(weekStart, -1);
      const monthStart = { year: weekStart.getFullYear(), month: weekStart.getMonth() + 1 };
      const monthEnd = { year: weekEnd.getFullYear(), month: weekEnd.getMonth() + 1 };
      const monthBefore = { year: dayBeforeWeekStart.getFullYear(), month: dayBeforeWeekStart.getMonth() + 1 };
      const monthKeys = [monthStart];
      if (monthStart.year !== monthEnd.year || monthStart.month !== monthEnd.month) {
        monthKeys.push(monthEnd);
      }
      if (!monthKeys.some((key) => key.year === monthBefore.year && key.month === monthBefore.month)) {
        monthKeys.push(monthBefore);
      }

      const [roomsData, planData, employeesData, longTermData, plannedData, rosterData] =
        await Promise.all([
          roomApi.getWeeklyPlan(),
          weeklyPlanApi.getByWeek(weekYear, weekNumber, true),
          employeeApi.getAll(),
          longTermAbsencesApi.getByStatus("Genehmigt", from, to),
          plannedAbsencesAdminApi.getRange({ from, to }),
          Promise.all(monthKeys.map((key) => rosterApi.getByMonth(key.year, key.month)))
        ]);

      setRooms(roomsData);
      setWeeklyPlan(planData);
      setEmployees(employeesData);
      setLongTermAbsences(longTermData);
      setPlannedAbsences(plannedData);
      setRosterShifts(rosterData.flat());
    } catch (error) {
      console.error("Failed to load weekly plan data", error);
      toast({
        title: "Fehler",
        description: "Wochenplan-Daten konnten nicht geladen werden.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, weekEnd, weekStart, weekNumber, weekYear]);

  useEffect(() => {
    loadWeekData();
  }, [loadWeekData]);

  useEffect(() => {
    if (selectedWeekday < 1 || selectedWeekday > 7) {
      setSelectedWeekday(1);
    }
  }, [selectedWeekday]);

  useEffect(() => {
    setIsReorderMode(false);
    setRoomOrderIds([]);
  }, [selectedWeekday, weekNumber, weekYear]);

  const handleAssignEmployee = async (roomId: number, weekday: number, employeeId: number) => {
    if (!weeklyPlan) return;
    if (isPlanReleased || lockedWeekdays.includes(weekday)) return;

    setIsSaving(true);
    try {
      const assignment = await weeklyPlanApi.assign(weeklyPlan.id, {
        roomId,
        weekday,
        employeeId,
        assignmentType: "Plan"
      });
      setWeeklyPlan((prev) =>
        prev ? { ...prev, assignments: [...prev.assignments, assignment] } : prev
      );
    } catch (error) {
      console.error("Failed to assign employee", error);
      toast({
        title: "Zuweisung fehlgeschlagen",
        description: "Der Mitarbeiter konnte nicht zugewiesen werden.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: number) => {
    if (!weeklyPlan) return;
    if (isPlanReleased) return;

    setIsSaving(true);
    try {
      await weeklyPlanApi.deleteAssignment(assignmentId);
      setWeeklyPlan((prev) =>
        prev ? { ...prev, assignments: prev.assignments.filter((item) => item.id !== assignmentId) } : prev
      );
    } catch (error) {
      console.error("Failed to delete assignment", error);
      toast({
        title: "Entfernen fehlgeschlagen",
        description: "Der Eintrag konnte nicht entfernt werden.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateAssignment = async (roomId: number, weekday: number, employeeId: number) => {
    await handleAssignEmployee(roomId, weekday, employeeId);
  };

  const handleMoveAssignment = async (assignmentId: number, roomId: number, weekday: number) => {
    if (!weeklyPlan) return;
    if (isPlanReleased || lockedWeekdays.includes(weekday)) return;

    setIsSaving(true);
    try {
      const updated = await weeklyPlanApi.updateAssignment(assignmentId, { roomId, weekday });
      setWeeklyPlan((prev) =>
        prev
          ? {
              ...prev,
              assignments: prev.assignments.map((item) => (item.id === updated.id ? updated : item))
            }
          : prev
      );
    } catch (error) {
      console.error("Failed to move assignment", error);
      toast({
        title: "Verschieben fehlgeschlagen",
        description: "Die Zuweisung konnte nicht verschoben werden.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenNoteDialog = (roomId: number, weekday: number) => {
    const existing = assignmentsByDayRoom
      .get(`${weekday}-${roomId}`)
      ?.find((assignment) => !assignment.employeeId && (assignment.note || assignment.isBlocked));

    setNoteDialog({
      roomId,
      weekday,
      note: existing?.note ?? "",
      isBlocked: existing?.isBlocked ?? false,
      assignmentId: existing?.id ?? null
    });
  };

  const handleSaveNote = async () => {
    if (!noteDialog || !weeklyPlan) return;

    setIsSaving(true);
    try {
      const payload = {
        roomId: noteDialog.roomId,
        weekday: noteDialog.weekday,
        note: noteDialog.note.trim() ? noteDialog.note.trim() : null,
        isBlocked: noteDialog.isBlocked
      };

      if (noteDialog.assignmentId) {
        if (!payload.note && !payload.isBlocked) {
          await weeklyPlanApi.deleteAssignment(noteDialog.assignmentId);
          setWeeklyPlan((prev) =>
            prev
              ? {
                  ...prev,
                  assignments: prev.assignments.filter((item) => item.id !== noteDialog.assignmentId)
                }
              : prev
          );
        } else {
          const updated = await weeklyPlanApi.updateAssignment(noteDialog.assignmentId, payload);
          setWeeklyPlan((prev) =>
            prev
              ? {
                  ...prev,
                  assignments: prev.assignments.map((item) =>
                    item.id === updated.id ? updated : item
                  )
                }
              : prev
          );
        }
      } else if (payload.note || payload.isBlocked) {
        const created = await weeklyPlanApi.assign(weeklyPlan.id, payload);
        setWeeklyPlan((prev) => (prev ? { ...prev, assignments: [...prev.assignments, created] } : prev));
      }
      setNoteDialog(null);
    } catch (error) {
      console.error("Failed to save note", error);
      toast({
        title: "Hinweis speichern fehlgeschlagen",
        description: "Die Sperre oder Notiz konnte nicht gespeichert werden.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddZeitausgleich = async (employeeId: number) => {
    if (!selectedDateKey) return;
    if (isPlanReleased || lockedWeekdays.includes(selectedWeekday)) return;

    const alreadyRequested = zeitausgleichAbsencesForSelectedDay.some(
      (absence) => absence.employeeId === employeeId
    );
    if (alreadyRequested) {
      toast({
        title: "Bereits angefragt",
        description: "Fuer diese Person besteht bereits ein Zeitausgleich-Eintrag.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const created = await plannedAbsencesAdminApi.create({
        employeeId,
        startDate: selectedDateKey,
        endDate: selectedDateKey,
        reason: "Zeitausgleich"
      });
      setPlannedAbsences((prev) => [...prev, created]);
      toast({
        title: "Zeitausgleich angefragt",
        description: "Die Anfrage wurde erstellt und als Abwesenheit vorgemerkt."
      });
    } catch (error) {
      console.error("Failed to request zeitausgleich", error);
      toast({
        title: "Zeitausgleich fehlgeschlagen",
        description: "Die Anfrage konnte nicht erstellt werden.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveAssignmentToZeitausgleich = async (assignmentId: number, employeeId: number) => {
    if (!selectedDateKey) return;
    if (isPlanReleased || lockedWeekdays.includes(selectedWeekday)) return;

    const alreadyRequested = zeitausgleichAbsencesForSelectedDay.some(
      (absence) => absence.employeeId === employeeId
    );

    setIsSaving(true);
    try {
      await weeklyPlanApi.deleteAssignment(assignmentId);
      setWeeklyPlan((prev) =>
        prev ? { ...prev, assignments: prev.assignments.filter((item) => item.id !== assignmentId) } : prev
      );

      if (!alreadyRequested) {
        const created = await plannedAbsencesAdminApi.create({
          employeeId,
          startDate: selectedDateKey,
          endDate: selectedDateKey,
          reason: "Zeitausgleich"
        });
        setPlannedAbsences((prev) => [...prev, created]);
      }
    } catch (error) {
      console.error("Failed to move to zeitausgleich", error);
      toast({
        title: "Zeitausgleich fehlgeschlagen",
        description: "Der Eintrag konnte nicht in Zeitausgleich verschoben werden.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveZeitausgleichToAssignment = async (
    absenceId: number,
    employeeId: number,
    roomId: number,
    weekday: number
  ) => {
    if (!selectedDateKey || !weeklyPlan) return;
    if (isPlanReleased || lockedWeekdays.includes(weekday)) return;

    setIsSaving(true);
    try {
      await plannedAbsencesAdminApi.delete(absenceId);
      setPlannedAbsences((prev) => prev.filter((item) => item.id !== absenceId));
      const assignment = await weeklyPlanApi.assign(weeklyPlan.id, {
        roomId,
        weekday,
        employeeId,
        assignmentType: "Plan"
      });
      setWeeklyPlan((prev) =>
        prev ? { ...prev, assignments: [...prev.assignments, assignment] } : prev
      );
    } catch (error) {
      console.error("Failed to move from zeitausgleich", error);
      toast({
        title: "Verschieben fehlgeschlagen",
        description: "Der Zeitausgleich konnte nicht in eine Zuweisung umgewandelt werden.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAbsence = async (absenceId?: number | null) => {
    if (!absenceId) return;
    if (isPlanReleased || lockedWeekdays.includes(selectedWeekday)) return;

    setIsSaving(true);
    try {
      await plannedAbsencesAdminApi.delete(absenceId);
      setPlannedAbsences((prev) => prev.filter((item) => item.id !== absenceId));
    } catch (error) {
      console.error("Failed to delete absence", error);
      toast({
        title: "Eintrag entfernen fehlgeschlagen",
        description: "Der Zeitausgleich konnte nicht entfernt werden.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDayLock = async (weekday: number) => {
    if (!weeklyPlan) return;
    const isLocked = lockedWeekdays.includes(weekday);
    const updated = isLocked
      ? lockedWeekdays.filter((day) => day !== weekday)
      : [...lockedWeekdays, weekday];

    try {
      const updatedPlan = await weeklyPlanApi.updateLockedWeekdays(weeklyPlan.id, updated);
      setWeeklyPlan((prev) => (prev ? { ...prev, lockedWeekdays: updatedPlan.lockedWeekdays ?? updated } : prev));
    } catch (error) {
      console.error("Failed to update locked weekdays", error);
      toast({
        title: "Sperre aktualisieren fehlgeschlagen",
        description: "Die Tages-Sperre konnte nicht gespeichert werden.",
        variant: "destructive"
      });
    }
  };

  const handleUpdateStatus = async (status: WeeklyPlanResponse["status"]) => {
    if (!weeklyPlan) return;
    try {
      const updated = await weeklyPlanApi.updateStatus(weeklyPlan.id, status);
      setWeeklyPlan(updated);
    } catch (error) {
      console.error("Failed to update status", error);
      toast({
        title: "Status-Update fehlgeschlagen",
        description: "Der Status konnte nicht aktualisiert werden.",
        variant: "destructive"
      });
    }
  };

  const handleGenerateAI = async () => {
    if (!weeklyPlan) return;
    if (isPlanReleased) {
      toast({
        title: "Plan ist freigegeben",
        description: "Bitte zuerst den Status auf Entwurf setzen, um die KI zu nutzen.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    const newAssignments: WeeklyPlanAssignmentResponse[] = [];

    try {
      for (const day of days) {
        const weekday = day.getDay() === 0 ? 7 : day.getDay();
        if (lockedWeekdays.includes(weekday)) continue;

        const available = availabilityByWeekday.get(weekday) ?? [];
        const assignedIds = new Set(
          (assignmentsByWeekday.get(weekday) ?? [])
            .map((assignment) => assignment.employeeId)
            .filter((id): id is number => typeof id === "number")
        );

        const roomsForDay = activeRoomsByDay.get(weekday) ?? [];
        for (const { room, setting } of roomsForDay) {
          if (!setting || setting.isClosed) continue;

          const existing = assignmentsByDayRoom.get(`${weekday}-${room.id}`) ?? [];
          const hasBlocked = existing.some((assignment) => assignment.isBlocked);
          const hasEmployee = existing.some((assignment) => assignment.employeeId);
          if (hasBlocked || hasEmployee) continue;

          const eligible = available.filter(
            (employee) =>
              !assignedIds.has(employee.id) &&
              isEmployeeEligibleForRoom(employee, room)
          );

          if (eligible.length === 0) continue;

          const candidate = eligible[0];
          const assignment = await weeklyPlanApi.assign(weeklyPlan.id, {
            roomId: room.id,
            weekday,
            employeeId: candidate.id,
            assignmentType: "Plan"
          });
          newAssignments.push(assignment);
          assignedIds.add(candidate.id);
        }
      }

      setWeeklyPlan((prev) =>
        prev ? { ...prev, assignments: [...prev.assignments, ...newAssignments] } : prev
      );

      toast({
        title: "KI-Vorschlag",
        description: "Die passenden Mitarbeitenden wurden vorgeschlagen."
      });
    } catch (error) {
      console.error("Failed to generate AI weekly plan", error);
      toast({
        title: "KI-Vorschlag fehlgeschlagen",
        description: "Die automatische Zuteilung konnte nicht erstellt werden.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedRooms = activeRoomsByDay.get(selectedWeekday) ?? [];
  const availableEmployees = unassignedAvailableByWeekday.get(selectedWeekday) ?? [];
  const selectedAbsences = absencesByDate.get(selectedDateKey) ?? [];

  const displayRooms = useMemo(() => {
    if (!isReorderMode || roomOrderIds.length === 0) {
      return selectedRooms;
    }
    const roomMap = new Map(selectedRooms.map((item) => [item.room.id, item]));
    return roomOrderIds.map((id) => roomMap.get(id)).filter(Boolean) as typeof selectedRooms;
  }, [isReorderMode, roomOrderIds, selectedRooms]);

  const handleToggleReorderMode = async () => {
    if (isReorderMode) {
      const sortedRooms = [...rooms].sort((a, b) => {
        const diff = (a.weeklyPlanSortOrder ?? 0) - (b.weeklyPlanSortOrder ?? 0);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });
      const orderedRoomMap = new Map(rooms.map((room) => [room.id, room]));
      const activeSet = new Set(roomOrderIds);
      const reorderedActive = roomOrderIds
        .map((id) => orderedRoomMap.get(id))
        .filter(Boolean) as WeeklyPlanRoom[];

      let activeIndex = 0;
      const newOrder = sortedRooms.map((room) =>
        activeSet.has(room.id) ? reorderedActive[activeIndex++] : room
      );

      const updates = newOrder
        .map((room, order) => ({
          room,
          order
        }))
        .filter(
          ({ room, order }) => room.weeklyPlanSortOrder == null || room.weeklyPlanSortOrder !== order
        );

      if (updates.length === 0) {
        setIsReorderMode(false);
        setRoomOrderIds([]);
        return;
      }

      setIsSaving(true);
      try {
        await Promise.all(
          updates.map(({ room, order }) => roomApi.update(room.id, { weeklyPlanSortOrder: order }))
        );
        const updateMap = new Map(updates.map(({ room, order }) => [room.id, order]));
        setRooms((prev) =>
          prev.map((room) => {
            const updatedOrder = updateMap.get(room.id);
            if (updatedOrder === undefined) return room;
            return { ...room, weeklyPlanSortOrder: updatedOrder };
          })
        );
        setIsReorderMode(false);
        setRoomOrderIds([]);
      } catch (error) {
        console.error("Failed to update room order", error);
        toast({
          title: "Reihenfolge speichern fehlgeschlagen",
          description: "Die Reihenfolge konnte nicht gespeichert werden.",
          variant: "destructive"
        });
      } finally {
        setIsSaving(false);
      }
    } else {
      setRoomOrderIds(selectedRooms.map(({ room }) => room.id));
      setIsReorderMode(true);
    }
  };

  return (
    <Layout title="Wochenplan-Editor" disableMotion>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Wochenplan-Editor</h1>
          <p className="text-muted-foreground">
            Wocheneinsatzpläne nach Arbeitsplätzen erstellen und anpassen.
          </p>
        </div>

        <div ref={toolbarRef} className="sticky top-0 z-30 -mx-6 bg-background/95 backdrop-blur pb-2">
          <div className="px-6 pt-2 space-y-2">
            <Card className="border-none kabeg-shadow">
              <CardContent className="p-2">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </Button>
                      <Select
                        value={`${weekNumber}-${weekYear}`}
                        onValueChange={(value) => {
                          const [week, year] = value.split("-").map(Number);
                          const date = new Date(year, 0, 1 + (week - 1) * 7);
                          setCurrentDate(date);
                          setSelectedWeekday(1);
                        }}
                      >
                        <SelectTrigger className="w-32 h-7 border-0 bg-transparent text-[11px]">
                          <SelectValue>
                            <span className="font-semibold">KW {weekNumber} / {weekYear}</span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {weekOptions.map((option) => (
                            <SelectItem key={`${option.week}-${option.year}`} value={`${option.week}-${option.year}`}>
                              KW {option.week} / {option.year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="text-[11px] text-muted-foreground">
                      {formatDateRange(weekStart, weekEnd)}
                    </div>

                    {weeklyPlan && (
                      <Badge variant="outline" className={cn("text-xs", statusBadgeStyles[weeklyPlan.status])}>
                        {weeklyPlan.status}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleGenerateAI}
                      disabled={isSaving || isReorderMode}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      KI-Vorschlag
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleToggleReorderMode}
                      disabled={isSaving || selectedRooms.length === 0}
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                      {isReorderMode ? "Reihenfolge speichern" : "Reihenfolge ändern"}
                    </Button>
                    {weeklyPlan?.status === "Freigegeben" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => handleUpdateStatus("Entwurf")}
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        Bearbeitung freischalten
                      </Button>
                    ) : (
                      <Button size="sm" className="gap-2" onClick={() => handleUpdateStatus("Freigegeben")}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Freigeben
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={selectedWeekday.toString()} onValueChange={(value) => setSelectedWeekday(Number(value))}>
              <TabsList className="w-full justify-start bg-card border kabeg-shadow h-10">
                {days.map((day, index) => {
                  const weekday = index + 1;
                  const isLocked = lockedWeekdays.includes(weekday);
                  return (
                    <TabsTrigger
                      key={weekday}
                      value={weekday.toString()}
                      className="flex-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-white"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-semibold">{WEEKDAY_LABELS[index]}</span>
                        <span className="text-[11px] opacity-70">{format(day, "dd.MM.", { locale: de })}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleDayLock(weekday);
                          }}
                          className={cn(
                            "text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full border",
                            isLocked
                              ? "border-amber-200 text-amber-700 bg-amber-50"
                              : "border-emerald-200 text-emerald-700 bg-emerald-50"
                          )}
                        >
                          {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          {isLocked ? "Fix" : "Offen"}
                        </button>
                      </div>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-4">
            {displayRooms.length === 0 && !isLoading ? (
              <Card className="border-none kabeg-shadow">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Für diesen Tag sind keine Arbeitsplätze im Wochenplan aktiv.
                </CardContent>
              </Card>
            ) : (
              displayRooms.map(({ room, setting }) => {
                const key = `${selectedWeekday}-${room.id}`;
                const roomAssignments = assignmentsByDayRoom.get(key) ?? [];
                const noteAssignment = roomAssignments.find(
                  (assignment) => !assignment.employeeId && (assignment.note || assignment.isBlocked)
                );
                const employeeAssignments = roomAssignments.filter((assignment) => assignment.employeeId);
                const assignedEmployeeIds = new Set(
                  employeeAssignments
                    .map((assignment) => assignment.employeeId)
                    .filter((id): id is number => typeof id === "number")
                );

                const availableForRoom = (availabilityByWeekday.get(selectedWeekday) ?? []).filter((employee) =>
                  isEmployeeEligibleForRoom(employee, room)
                );
                const remainingEligible = availableForRoom.filter((employee) => !assignedEmployeeIds.has(employee.id));

                const hasEligibleAssignment = employeeAssignments.some((assignment) => {
                  if (!assignment.employeeId) return false;
                  const employee = employeesById.get(assignment.employeeId);
                  return employee ? isEmployeeEligibleForRoom(employee, room) : false;
                });

                const competencyStatus = employeeAssignments.length === 0
                  ? "missing"
                  : hasEligibleAssignment
                  ? "fulfilled"
                  : "partial";

                const isClosed = setting?.isClosed;
                const isBlocked = noteAssignment?.isBlocked;
                const isLocked = lockedWeekdays.includes(selectedWeekday);
                const disableEditing = Boolean(isClosed || isBlocked || isLocked || isPlanReleased || isReorderMode);
                const showNoAvailableWarning = !disableEditing && employeeAssignments.length === 0 && remainingEligible.length === 0;

                return (
                  <Card
                    key={room.id}
                    className={cn(
                      "border-none kabeg-shadow",
                      isReorderMode && "cursor-grab active:cursor-grabbing"
                    )}
                    draggable={isReorderMode}
                    onDragStart={(event) => {
                      if (!isReorderMode) return;
                      draggedRoomIdRef.current = room.id;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", room.id.toString());
                      event.dataTransfer.setData("dragType", "room-order");
                      event.dataTransfer.setData("roomId", room.id.toString());
                    }}
                    onDragEnd={() => {
                      draggedRoomIdRef.current = null;
                    }}
                    onDragOver={(event) => {
                      if (!isReorderMode) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      if (!isReorderMode) return;
                      event.preventDefault();
                      const draggedId = draggedRoomIdRef.current
                        ?? Number(event.dataTransfer.getData("text/plain") || event.dataTransfer.getData("roomId"));
                      if (!draggedId || draggedId === room.id) return;
                      setRoomOrderIds((prev) => {
                        const next = [...prev];
                        const fromIndex = next.indexOf(draggedId);
                        const toIndex = next.indexOf(room.id);
                        if (fromIndex === -1 || toIndex === -1) return prev;
                        next.splice(fromIndex, 1);
                        next.splice(toIndex, 0, draggedId);
                        return next;
                      });
                    }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-base font-semibold flex items-center gap-2">
                            {room.name}
                            {!isReorderMode && showNoAvailableWarning && (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            )}
                            {isReorderMode && <GripVertical className="w-4 h-4 text-muted-foreground" />}
                          </CardTitle>
                          {!isReorderMode && (
                            <div className="text-xs text-muted-foreground">
                              {setting?.usageLabel ? `${setting.usageLabel} · ` : ""}
                              {formatRoomTime(setting?.timeFrom, setting?.timeTo)}
                            </div>
                          )}
                        </div>
                        {isReorderMode ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2 text-xs"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                            Verschieben
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                competencyStatus === "fulfilled" && "bg-green-50 text-green-700 border-green-200",
                                competencyStatus === "partial" && "bg-amber-50 text-amber-700 border-amber-200",
                                competencyStatus === "missing" && "bg-red-50 text-red-700 border-red-200"
                              )}
                            >
                              {competencyStatus === "fulfilled"
                                ? "Vollständig"
                                : competencyStatus === "partial"
                                ? "Optional fehlt"
                                : "Pflicht fehlt"}
                            </Badge>
                          </div>
                        )}
                      </div>
                      {!isReorderMode && (
                        <>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {room.physicalRooms?.length ? (
                              room.physicalRooms.map((physical) => (
                                <Badge key={physical.id} variant="secondary" className="text-[10px]">
                                  {physical.name}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Kein Raum</Badge>
                            )}
                            {room.requiredCompetencies?.map((comp) => (
                              <Badge key={comp.id} variant="outline" className="text-[10px]">
                                {comp.competencyCode || comp.competencyName}
                              </Badge>
                            ))}
                            {room.requiredRoleCompetencies?.length ? (
                              <Badge variant="outline" className="text-[10px]">
                                Rollen: {room.requiredRoleCompetencies.join(", ")}
                              </Badge>
                            ) : null}
                          </div>
                          {isClosed && (
                            <div className="text-xs text-red-600 mt-2">
                              {setting?.closedReason || "Arbeitsplatz geschlossen"}
                            </div>
                          )}
                          {noteAssignment?.note && (
                            <div className="text-xs text-slate-600 mt-2 whitespace-pre-line">
                              {noteAssignment.note}
                            </div>
                          )}
                        </>
                      )}
                    </CardHeader>
                    {!isReorderMode && (
                      <CardContent className="space-y-2">
                        <div
                          className={cn(
                            "space-y-2 border-2 border-dashed rounded-xl p-3",
                            disableEditing ? "bg-muted/30 border-muted-foreground/20" : "border-primary/20"
                          )}
                          onDragOver={(event) => {
                            if (disableEditing) return;
                            event.preventDefault();
                          }}
                          onDrop={async (event) => {
                            if (disableEditing) return;
                            event.preventDefault();
                            const employeeId = Number(event.dataTransfer.getData("employeeId"));
                            if (!employeeId) return;
                            const dragType = event.dataTransfer.getData("dragType");
                            const assignmentId = Number(event.dataTransfer.getData("assignmentId"));
                            const absenceId = Number(event.dataTransfer.getData("absenceId"));
                            const sourceRoomId = Number(event.dataTransfer.getData("sourceRoomId"));
                            const sourceWeekday = Number(event.dataTransfer.getData("sourceWeekday"));

                            if (dragType === "assignment" && assignmentId) {
                              if (sourceRoomId === room.id && sourceWeekday === selectedWeekday) return;
                              await handleMoveAssignment(assignmentId, room.id, selectedWeekday);
                              return;
                            }

                            if (dragType === "zeitausgleich" && absenceId) {
                              await handleMoveZeitausgleichToAssignment(absenceId, employeeId, room.id, selectedWeekday);
                              return;
                            }

                            await handleAssignEmployee(room.id, selectedWeekday, employeeId);
                          }}
                        >
                          {employeeAssignments.length === 0 && (
                            <div className="text-xs text-muted-foreground">+ Zuweisung</div>
                          )}
                          {employeeAssignments.map((assignment) => {
                            const employee = assignment.employeeId
                              ? employeesById.get(assignment.employeeId)
                              : null;
                            const displayName = assignment.employeeLastName || employee?.lastName || assignment.employeeName;
                            const isDuplicate = assignment.employeeId
                              ? duplicateEmployeeIdsByWeekday
                                  .get(selectedWeekday)
                                  ?.has(assignment.employeeId)
                              : false;

                            return (
                              <div
                                key={assignment.id}
                                className={cn(
                                  "flex items-center justify-between rounded-lg border px-2 py-1",
                                  isDuplicate && "border-rose-300 bg-rose-50",
                                  assignment.assignmentType !== "Plan" && "border-blue-200 bg-blue-50"
                                )}
                                draggable={!disableEditing}
                                onDragStart={(event) => {
                                  if (disableEditing || !assignment.employeeId) return;
                                  event.dataTransfer.setData("dragType", "assignment");
                                  event.dataTransfer.setData("employeeId", assignment.employeeId.toString());
                                  event.dataTransfer.setData("assignmentId", assignment.id.toString());
                                  event.dataTransfer.setData("sourceRoomId", room.id.toString());
                                  event.dataTransfer.setData("sourceWeekday", selectedWeekday.toString());
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{displayName || "Unbekannt"}</span>
                                  {assignment.assignmentType !== "Plan" && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {assignment.assignmentType}
                                    </Badge>
                                  )}
                                  {isDuplicate && (
                                    <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-700 border-rose-200">
                                      Doppelt
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => assignment.employeeId && handleDuplicateAssignment(room.id, selectedWeekday, assignment.employeeId)}
                                    disabled={disableEditing}
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-600"
                                    onClick={() => handleDeleteAssignment(assignment.id)}
                                    disabled={disableEditing}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => handleOpenNoteDialog(room.id, selectedWeekday)}
                            disabled={disableEditing}
                          >
                            <StickyNote className="w-4 h-4" />
                            Kommentar / Sperre
                          </Button>
                          {showNoAvailableWarning && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                              Keine passenden Mitarbeiter mehr verfügbar
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </div>

          <div className="lg:col-span-1 overflow-visible">
            <div
              className="lg:sticky lg:self-start lg:z-20"
              style={{ top: rightPaneOffset, height: `calc(100vh - ${rightPaneOffset}px - 16px)` }}
            >
              <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
                <Card className="border-none kabeg-shadow flex flex-col min-h-0 flex-[2]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Verfügbares Personal
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {WEEKDAY_FULL[selectedWeekday - 1]}, {selectedDayDate ? format(selectedDayDate, "dd.MM.yyyy", { locale: de }) : ""}
                    </p>
                  </CardHeader>
                  <CardContent className="flex-1 min-h-0 overflow-y-auto">
                    <div
                      className={cn(
                        "space-y-2 rounded-xl p-1",
                        isPlanReleased || lockedWeekdays.includes(selectedWeekday) || isReorderMode
                          ? ""
                          : "border border-dashed border-transparent"
                      )}
                      onDragOver={(event) => {
                        if (isPlanReleased || lockedWeekdays.includes(selectedWeekday) || isReorderMode) return;
                        if (!event.dataTransfer.getData("dragType")) return;
                        event.preventDefault();
                      }}
                      onDrop={async (event) => {
                        if (isPlanReleased || lockedWeekdays.includes(selectedWeekday) || isReorderMode) return;
                        event.preventDefault();
                        const dragType = event.dataTransfer.getData("dragType");
                        const assignmentId = Number(event.dataTransfer.getData("assignmentId"));
                        const absenceId = Number(event.dataTransfer.getData("absenceId"));
                        if (dragType === "assignment" && assignmentId) {
                          await handleDeleteAssignment(assignmentId);
                        }
                        if (dragType === "zeitausgleich" && absenceId) {
                          await handleDeleteAbsence(absenceId);
                        }
                      }}
                    >
                      {isLoading ? (
                        <div className="text-sm text-muted-foreground text-center py-4">Laden...</div>
                      ) : availableEmployees.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-4">Keine Verfügbarkeit</div>
                      ) : (
                        availableEmployees.map((employee) => (
                          <div
                            key={employee.id}
                            className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-all hover:shadow-sm group"
                            draggable={!isPlanReleased && !lockedWeekdays.includes(selectedWeekday) && !isReorderMode}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("dragType", "available");
                              event.dataTransfer.setData("employeeId", employee.id.toString());
                            }}
                          >
                            <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{getEmployeeDisplayName(employee)}</span>
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] px-1.5 py-0 h-5 shrink-0", ROLE_COLORS[employee.role] || "bg-gray-100")}
                                >
                                  {ROLE_BADGES[employee.role] || employee.role?.substring(0, 2)}
                                </Badge>
                                {declinedZeitausgleichIds.has(employee.id) && (
                                  <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                                    ZA abgelehnt
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground whitespace-normal leading-snug">
                                {employee.competencies?.join(", ") || "Keine Kompetenzen"}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none kabeg-shadow flex flex-col min-h-0 flex-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Zeitausgleich moeglich</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Ziehen Sie Mitarbeitende hierher, um eine Anfrage zu senden.
                    </p>
                  </CardHeader>
                  <CardContent className="flex-1 min-h-0 overflow-y-auto space-y-2">
                    <div
                      className={cn(
                        "space-y-2 border-2 border-dashed rounded-xl p-3 min-h-[96px]",
                        isPlanReleased || lockedWeekdays.includes(selectedWeekday)
                          ? "bg-muted/30 border-muted-foreground/20"
                          : "border-primary/20"
                      )}
                      onDragOver={(event) => {
                        if (isPlanReleased || lockedWeekdays.includes(selectedWeekday) || isReorderMode) return;
                        event.preventDefault();
                      }}
                      onDrop={async (event) => {
                        if (isPlanReleased || lockedWeekdays.includes(selectedWeekday) || isReorderMode) return;
                        event.preventDefault();
                        const dragType = event.dataTransfer.getData("dragType");
                        const employeeId = Number(event.dataTransfer.getData("employeeId"));
                        const assignmentId = Number(event.dataTransfer.getData("assignmentId"));
                        const absenceId = Number(event.dataTransfer.getData("absenceId"));
                        if (dragType === "assignment" && assignmentId && employeeId) {
                          await handleMoveAssignmentToZeitausgleich(assignmentId, employeeId);
                          return;
                        }
                        if (!employeeId || dragType === "zeitausgleich") return;
                        await handleAddZeitausgleich(employeeId);
                      }}
                    >
                      {zeitausgleichAbsencesForSelectedDay.length === 0 && (
                        <div className="text-xs text-muted-foreground">+ Person hinzufuegen</div>
                      )}
                      {zeitausgleichAbsencesForSelectedDay.map((absence) => {
                        const employee = employeesById.get(absence.employeeId);
                        const displayName = absence.employeeLastName || employee?.lastName || employee?.name || "Unbekannt";
                        const statusLabel = absence.status || "Geplant";
                        return (
                          <div
                            key={absence.id ?? `${absence.employeeId}-${absence.startDate}`}
                            className="flex items-center justify-between rounded-lg border px-2 py-1"
                            draggable={!isPlanReleased && !lockedWeekdays.includes(selectedWeekday) && !isReorderMode}
                            onDragStart={(event) => {
                              if (!absence.id) return;
                              event.dataTransfer.setData("dragType", "zeitausgleich");
                              event.dataTransfer.setData("employeeId", absence.employeeId.toString());
                              event.dataTransfer.setData("absenceId", absence.id.toString());
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{displayName}</span>
                              <Badge
                                variant="outline"
                                className={cn("text-[10px]", ZEITAUSGLEICH_STATUS_STYLES[statusLabel] || "bg-slate-50 text-slate-700 border-slate-200")}
                              >
                                {statusLabel}
                              </Badge>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-600"
                              onClick={() => handleDeleteAbsence(absence.id)}
                              disabled={isPlanReleased || lockedWeekdays.includes(selectedWeekday)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none kabeg-shadow flex flex-col min-h-0 flex-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Abwesenheiten des Tages</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {selectedDayDate ? format(selectedDayDate, "dd.MM.yyyy", { locale: de }) : ""}
                    </p>
                  </CardHeader>
                  <CardContent className="flex-1 min-h-0 overflow-y-auto space-y-2">
                    {selectedAbsences.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Keine Abwesenheiten</div>
                    ) : (
                      selectedAbsences.map((absence, index) => {
                        const employee = employeesById.get(absence.employeeId);
                        return (
                          <div key={`${absence.employeeId}-${index}`} className="text-xs">
                            <span className="font-medium">{employee?.lastName || employee?.name || "Unbekannt"}</span>
                            <span className="text-muted-foreground"> · {absence.reason}</span>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Die KI belegt nur offene Tage ohne Sperre. Gesperrte Tage werden nicht ueberschrieben.
          </p>
        </div>
      </div>

      <Dialog open={Boolean(noteDialog)} onOpenChange={(open) => !open && setNoteDialog(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Kommentar / Sperre</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Kommentar</label>
              <Textarea
                value={noteDialog?.note ?? ""}
                onChange={(event) =>
                  setNoteDialog((prev) => (prev ? { ...prev, note: event.target.value } : prev))
                }
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Arbeitsplatz sperren</p>
                <p className="text-xs text-muted-foreground">Keine Zuweisung moeglich, solange gesperrt.</p>
              </div>
              <Switch
                checked={noteDialog?.isBlocked ?? false}
                onCheckedChange={(checked) =>
                  setNoteDialog((prev) => (prev ? { ...prev, isBlocked: checked } : prev))
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNoteDialog(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveNote} disabled={isSaving}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
