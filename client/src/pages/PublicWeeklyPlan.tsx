import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WeeklyPlanResponse } from "@/lib/api";
import {
  WEEKDAY_FULL,
  WEEKDAY_LABELS,
  type WeeklyPlanRoom,
  buildWeeklyPlanAssignmentsByRoomWeekday,
  formatRoomTime,
  getRoomSettingForDate,
  getWeeklyPlanRoomShortLabel,
  isEmployeeAbsentOnDate,
  isEmployeeOnDutyDate,
} from "@/lib/weeklyPlanUtils";
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  getWeek,
  getYear,
  parseISO,
  startOfWeek,
  subDays,
} from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Minus, Plus, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { Employee, LongTermAbsence, RosterShift, ServiceLine } from "@shared/schema";
import { normalizeServiceLineKey } from "@shared/serviceLineKey";

type PublicPlannedAbsence = {
  id: number;
  employeeId: number;
  employeeName: string | null;
  employeeLastName: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  status: string | null;
  notes?: string | null;
};

type PublicWeeklyPlanPayload = {
  year: number;
  week: number;
  from: string;
  to: string;
  plan: WeeklyPlanResponse | null;
  rooms: WeeklyPlanRoom[];
  employees: Employee[];
  serviceLines: ServiceLine[];
  rosterShifts: RosterShift[];
  plannedAbsences: PublicPlannedAbsence[];
  longTermAbsences: LongTermAbsence[];
};

const PREVIOUS_DAY_DUTY_SERVICE_LINE_ORDER = ["kreiszimmer", "gyn", "turnus"] as const;
const PREVIOUS_DAY_DUTY_SERVICE_LINE_SET: ReadonlySet<string> = new Set(
  PREVIOUS_DAY_DUTY_SERVICE_LINE_ORDER,
);
const PUBLIC_WEEKLY_PLAN_ZOOM_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4] as const;
const getWeeklyPlanFirstColumnWidthRem = (showFullLabels: boolean) =>
  showFullLabels ? 10.5 : 4.75;
const getWeeklyPlanDayColumnWidthRem = (zoomLevel: number) => {
  if (zoomLevel <= 0.6) return 5.1;
  if (zoomLevel <= 0.8) return 5.5;
  if (zoomLevel <= 1) return 6;
  return 6.5;
};

const getQueryWeekDate = (search: string) => {
  const params = new URLSearchParams(search);
  const yearRaw = params.get("year");
  const weekRaw = params.get("week");
  if (!yearRaw || !weekRaw) {
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  }
  const year = Number(yearRaw);
  const week = Number(weekRaw);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  }
  const isoWeekBase = startOfWeek(parseISO(`${year}-01-04`), { weekStartsOn: 1 });
  const resolved = addWeeks(isoWeekBase, week - 1);
  return Number.isNaN(resolved.getTime())
    ? startOfWeek(new Date(), { weekStartsOn: 1 })
    : resolved;
};

const isStandaloneWebApp = () => {
  if (typeof window === "undefined") return false;
  const navigatorStandalone = Boolean((window.navigator as { standalone?: boolean }).standalone);
  return navigatorStandalone || window.matchMedia("(display-mode: standalone)").matches;
};

const setWeekSearch = (date: Date) => {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const year = getYear(weekStart);
  const week = getWeek(weekStart, { weekStartsOn: 1, firstWeekContainsDate: 4 });
  return `/wochenplan-public?year=${year}&week=${week}`;
};

const hasValidWeekParams = (search: string) => {
  const params = new URLSearchParams(search);
  const yearRaw = params.get("year");
  const weekRaw = params.get("week");
  if (!yearRaw || !weekRaw) return false;
  const year = Number(yearRaw);
  const week = Number(weekRaw);
  return Number.isInteger(year) && Number.isInteger(week) && week >= 1 && week <= 53;
};

export default function PublicWeeklyPlan() {
  const [location, setLocation] = useLocation();
  const [payload, setPayload] = useState<PublicWeeklyPlanPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullLabels, setShowFullLabels] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<(typeof PUBLIC_WEEKLY_PLAN_ZOOM_STEPS)[number]>(1);
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? window.location.search : "",
  );
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef<"header" | "body" | null>(null);

  const syncHorizontalScroll = (source: "header" | "body") => {
    const sourceElement =
      source === "header" ? headerScrollRef.current : bodyScrollRef.current;
    const targetElement =
      source === "header" ? bodyScrollRef.current : headerScrollRef.current;

    if (!sourceElement || !targetElement) return;
    if (syncingScrollRef.current && syncingScrollRef.current !== source) return;

    syncingScrollRef.current = source;
    targetElement.scrollLeft = sourceElement.scrollLeft;

    requestAnimationFrame(() => {
      if (syncingScrollRef.current === source) {
        syncingScrollRef.current = null;
      }
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSearch(window.location.search);
  }, [location]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) return;

    const previousContent = viewportMeta.getAttribute("content");
    viewportMeta.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, maximum-scale=5, user-scalable=yes, viewport-fit=cover",
    );

    return () => {
      if (previousContent) {
        viewportMeta.setAttribute("content", previousContent);
      } else {
        viewportMeta.removeAttribute("content");
      }
    };
  }, []);

  useEffect(() => {
    if (isStandaloneWebApp()) return;
    if (hasValidWeekParams(search)) return;
    const next = setWeekSearch(new Date());
    setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
    setLocation(next);
  }, [search, setLocation]);

  const currentDate = useMemo(() => getQueryWeekDate(search), [search]);

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekEnd = useMemo(
    () => endOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekNumber = useMemo(
    () => getWeek(currentDate, { weekStartsOn: 1, firstWeekContainsDate: 4 }),
    [currentDate],
  );
  const weekYear = useMemo(() => getYear(weekStart), [weekStart]);
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/public-api/weekly-plan/week/${weekYear}/${weekNumber}`,
        );
        const envelope = (await response.json()) as {
          success: boolean;
          data?: PublicWeeklyPlanPayload;
          error?: string;
        };
        if (!response.ok || !envelope.success || !envelope.data) {
          throw new Error(envelope.error || "Wochenplan konnte nicht geladen werden");
        }
        if (!active) return;
        setPayload(envelope.data);
      } catch (fetchError: any) {
        if (!active) return;
        setError(fetchError?.message || "Wochenplan konnte nicht geladen werden");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [weekNumber, weekYear]);

  const roomsSorted = useMemo(() => payload?.rooms ?? [], [payload]);
  const visibleRooms = useMemo(
    () =>
      roomsSorted.filter((room) => {
        const title = (room.name ?? "").toLowerCase();
        return (
          !title.includes("diensthabende") &&
          !title.includes("raum verwaltung") &&
          !title.includes("diensthabende am wochenende")
        );
      }),
    [roomsSorted],
  );
  const employees = payload?.employees ?? [];
  const rosterShifts = payload?.rosterShifts ?? [];
  const plannedAbsences = payload?.plannedAbsences ?? [];
  const longTermAbsences = payload?.longTermAbsences ?? [];
  const weeklyPlan = payload?.plan ?? null;

  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const assignmentsByRoomWeekday = useMemo(() => {
    return buildWeeklyPlanAssignmentsByRoomWeekday(
      weeklyPlan?.assignments || [],
      visibleRooms,
      rosterShifts,
      weekDays,
      employeesById,
    );
  }, [employeesById, rosterShifts, visibleRooms, weekDays, weeklyPlan]);
  const absencesByDate = useMemo(() => {
    const map = new Map<string, PublicPlannedAbsence[]>();
    plannedAbsences.forEach((absence) => {
      const start = parseISO(absence.startDate);
      const end = parseISO(absence.endDate);
      eachDayOfInterval({ start, end }).forEach((date) => {
        const key = format(date, "yyyy-MM-dd");
        const current = map.get(key) ?? [];
        current.push(absence);
        map.set(key, current);
      });
    });
    return map;
  }, [plannedAbsences]);

  const resolveEmployeeLastName = (
    employeeId: number | null,
    fallback?: string | null,
    fallbackLast?: string | null,
  ) => {
    if (employeeId) {
      const employee = employeesById.get(employeeId);
      if (employee?.lastName) return employee.lastName;
      if (employee?.name) {
        const parts = employee.name.trim().split(/\s+/);
        return parts[parts.length - 1] || employee.name;
      }
    }
    if (fallbackLast) return fallbackLast;
    if (fallback) {
      const parts = fallback.trim().split(/\s+/);
      return parts[parts.length - 1] || fallback;
    }
    return "Unbekannt";
  };

  const resolveAbsenceName = (absence: PublicPlannedAbsence) => {
    if (absence.employeeLastName) return absence.employeeLastName;
    if (absence.employeeId) {
      const employee = employeesById.get(absence.employeeId);
      return employee?.lastName || employee?.name || "Unbekannt";
    }
    return absence.employeeName || "Unbekannt";
  };

  const previousDayDutyByDate = useMemo(() => {
    const map = new Map<
      string,
      Array<{ serviceType: string; assignee: string }>
    >();
    weekDays.forEach((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const previousDateKey = format(subDays(day, 1), "yyyy-MM-dd");
      const entries = rosterShifts
        .filter((shift) => shift.date === previousDateKey)
        .map((shift) => {
          const normalizedServiceType = normalizeServiceLineKey(shift.serviceType);
          if (!PREVIOUS_DAY_DUTY_SERVICE_LINE_SET.has(normalizedServiceType)) {
            return null;
          }
          return {
            serviceType: normalizedServiceType,
            assignee: resolveEmployeeLastName(
              shift.employeeId ?? null,
              shift.assigneeFreeText ?? null,
              null,
            ),
          };
        })
        .filter(
          (
            entry,
          ): entry is { serviceType: string; assignee: string } => Boolean(entry),
        )
        .sort((a, b) => {
          const orderA = PREVIOUS_DAY_DUTY_SERVICE_LINE_ORDER.findIndex(
            (key) => key === a.serviceType,
          );
          const orderB = PREVIOUS_DAY_DUTY_SERVICE_LINE_ORDER.findIndex(
            (key) => key === b.serviceType,
          );
          if (orderA !== orderB) return orderA - orderB;
          return a.assignee.localeCompare(b.assignee, "de");
        })
        .filter((entry, index, items) => {
          return items.findIndex((candidate) => candidate.assignee === entry.assignee) === index;
        });
      map.set(dateKey, entries);
    });
    return map;
  }, [employeesById, rosterShifts, weekDays]);

  const zoomIndex = PUBLIC_WEEKLY_PLAN_ZOOM_STEPS.indexOf(zoomLevel);
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < PUBLIC_WEEKLY_PLAN_ZOOM_STEPS.length - 1;
  const firstColumnWidthRem = getWeeklyPlanFirstColumnWidthRem(showFullLabels);
  const dayColumnWidthRem = getWeeklyPlanDayColumnWidthRem(zoomLevel);
  const firstColumnWidth = `${firstColumnWidthRem}rem`;
  const dayColumnWidth = `${dayColumnWidthRem}rem`;
  const weeklyPlanMinWidth = `${firstColumnWidthRem + weekDays.length * dayColumnWidthRem}rem`;

  const handleZoomOut = () => {
    if (!canZoomOut) return;
    setZoomLevel(PUBLIC_WEEKLY_PLAN_ZOOM_STEPS[zoomIndex - 1]);
  };

  const handleZoomIn = () => {
    if (!canZoomIn) return;
    setZoomLevel(PUBLIC_WEEKLY_PLAN_ZOOM_STEPS[zoomIndex + 1]);
  };

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 print:max-w-none print:px-0 print:py-0">
        <div className="sticky top-0 z-40 mb-2 bg-white pb-2 print:static">
          <div className="flex flex-col gap-2 print:hidden sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 sm:text-2xl">Wochenplan</h1>
              <p className="text-[11px] leading-tight text-slate-600 sm:text-sm">
                KW {weekNumber} / {weekYear} · {format(weekStart, "dd.MM.yyyy", { locale: de })} bis{" "}
                {format(weekEnd, "dd.MM.yyyy", { locale: de })}
              </p>
            </div>
            <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem_2.25rem] gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const next = setWeekSearch(addWeeks(currentDate, -1));
                  setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
                  setLocation(next);
                }}
                className="h-9 w-9 px-0 text-xs sm:h-10 sm:w-auto sm:px-4 sm:text-sm"
                aria-label="Vorwoche"
                title="Vorwoche"
              >
                <ChevronLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Vorwoche</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const next = setWeekSearch(new Date());
                  setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
                  setLocation(next);
                }}
                className="h-9 min-w-0 px-2 text-xs sm:h-10 sm:px-4 sm:text-sm"
              >
                <span className="sm:hidden">Heute</span>
                <span className="hidden sm:inline">Aktuelle Woche</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const next = setWeekSearch(addWeeks(currentDate, 1));
                  setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
                  setLocation(next);
                }}
                className="h-9 w-9 px-0 text-xs sm:h-10 sm:w-auto sm:px-4 sm:text-sm"
                aria-label="Nächste Woche"
                title="Nächste Woche"
              >
                <span className="hidden sm:inline">Nächste Woche</span>
                <ChevronRight className="h-4 w-4 sm:ml-1" />
              </Button>
              <Button
                onClick={() => window.print()}
                className="h-9 w-9 px-0 text-xs sm:h-10 sm:w-auto sm:px-4 sm:text-sm"
                aria-label="Drucken"
                title="Drucken"
              >
                <Printer className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Drucken</span>
              </Button>
              <div className="col-span-4 flex items-center justify-center rounded-md border border-slate-300 bg-white sm:col-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={!canZoomOut}
                  className="h-9 w-9 rounded-r-none border-r border-slate-300 sm:h-10 sm:w-10"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="min-w-[4rem] px-2 text-center text-xs font-medium text-slate-700 sm:min-w-[4.5rem] sm:px-3 sm:text-sm">
                  {Math.round(zoomLevel * 100)}%
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={!canZoomIn}
                  className="h-9 w-9 rounded-l-none border-l border-slate-300 sm:h-10 sm:w-10"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <div
            ref={headerScrollRef}
            onScroll={() => syncHorizontalScroll("header")}
            className="mt-3 overflow-x-auto overscroll-x-contain touch-auto [-webkit-overflow-scrolling:touch]"
          >
            <div
              className="grid border-t border-slate-200 border-b border-slate-300 bg-slate-100"
              style={{
                zoom: zoomLevel,
                minWidth: weeklyPlanMinWidth,
                gridTemplateColumns: `${firstColumnWidth} repeat(7, minmax(${dayColumnWidth}, 1fr))`,
              }}
            >
              <div
                className="sticky left-0 z-40 flex flex-col items-start gap-1.5 border-b border-slate-300 bg-slate-100 px-2 py-1.5 text-left font-medium shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]"
                style={{ width: firstColumnWidth }}
              >
                <span className="text-[11px] leading-tight sm:text-xs">
                  {showFullLabels ? "Arbeitsplatz" : "AP"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFullLabels((value) => !value)}
                  className="h-5 px-1.5 text-[9px] leading-none sm:h-6 sm:px-2 sm:text-[10px]"
                >
                  {showFullLabels ? "Kurz" : "Lang"}
                </Button>
              </div>
              {weekDays.map((day, index) => (
                <div
                  key={day.toISOString()}
                  className="bg-slate-100 px-1.5 py-2 text-center font-medium"
                >
                  <div className="text-[10px] text-slate-500 sm:text-[11px]">
                    {WEEKDAY_LABELS[index]}
                  </div>
                  <div className="text-xs sm:text-sm" title={WEEKDAY_FULL[index]}>
                    {format(day, "dd.MM", { locale: de })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border-slate-200 shadow-sm print:border-0 print:shadow-none">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">Wochenplan wird geladen…</div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-red-600">{error}</div>
            ) : (
              <div
                ref={bodyScrollRef}
                onScroll={() => syncHorizontalScroll("body")}
                className="overflow-x-auto overscroll-x-contain touch-auto [-webkit-overflow-scrolling:touch]"
              >
                <table
                  className="w-full table-fixed text-xs print:text-[10px] sm:text-sm"
                  style={{ zoom: zoomLevel, minWidth: weeklyPlanMinWidth }}
                >
                  <colgroup>
                    <col style={{ width: firstColumnWidth }} />
                    {weekDays.map((day) => (
                      <col key={`public-col-${day.toISOString()}`} style={{ width: dayColumnWidth }} />
                    ))}
                  </colgroup>
                  <tbody>
                    {visibleRooms.map((room) => (
                      <tr
                        key={room.id}
                        className="align-top transition-colors odd:bg-white even:bg-slate-50/60"
                        style={room.rowColor ? { backgroundColor: room.rowColor } : undefined}
                      >
                        <td
                          className="sticky left-0 z-20 border-b border-slate-300 px-2 py-1.5 align-middle shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]"
                          style={
                            room.rowColor
                              ? { backgroundColor: room.rowColor }
                              : { backgroundColor: "white" }
                          }
                        >
                          <div
                            className="text-[11px] font-semibold leading-tight text-slate-900 sm:text-xs"
                            title={room.name}
                            aria-label={room.name}
                          >
                            {showFullLabels ? room.name : getWeeklyPlanRoomShortLabel(room.name)}
                          </div>
                        </td>
                        {weekDays.map((day, index) => {
                          const weekday = index + 1;
                          const setting = getRoomSettingForDate(room, day);
                          if (!setting) {
                            return (
                              <td
                                key={`${room.id}-${weekday}`}
                                className="border-b border-slate-300 px-2 py-1 text-center text-[11px] text-slate-400"
                              >
                                —
                              </td>
                            );
                          }
                          if (setting.isClosed) {
                            return (
                              <td
                                key={`${room.id}-${weekday}`}
                                className="border-b border-slate-300 bg-slate-100/80 px-2 py-1 text-center text-[11px] text-slate-500"
                              >
                                {"\u00A0"}
                              </td>
                            );
                          }

                          const assignments =
                            assignmentsByRoomWeekday.get(`${room.id}-${weekday}`) ?? [];
                          const employeeAssignments = assignments.filter((assignment) =>
                            Boolean(assignment.employeeId),
                          );
                          const blockedEntries = assignments.filter(
                            (assignment) => assignment.isBlocked,
                          );
                          const isBlockedCell = blockedEntries.length > 0;
                          const timeLabel = formatRoomTime(setting.timeFrom, setting.timeTo);

                          return (
                            <td
                              key={`${room.id}-${weekday}`}
                              className={cn(
                                "border-b border-slate-300 px-2 py-1.5 align-middle",
                                isBlockedCell && "bg-slate-100/80",
                              )}
                            >
                              {!isBlockedCell && (setting.usageLabel || timeLabel) && (
                                <div className="mb-0.5 text-[9px] text-slate-500 sm:text-[10px]">
                                  {[setting.usageLabel, timeLabel].filter(Boolean).join(" · ")}
                                </div>
                              )}
                              {isBlockedCell ? (
                                <div className="min-h-[36px] w-full bg-slate-100/80 sm:min-h-[44px]" />
                              ) : employeeAssignments.length === 0 ? (
                                <div className="text-[11px] text-slate-400">—</div>
                              ) : (
                                <div className="space-y-0.5">
                                  {employeeAssignments.map((assignment) => {
                                    const name = resolveEmployeeLastName(
                                      assignment.employeeId,
                                      assignment.employeeName,
                                      assignment.employeeLastName,
                                    );
                                    const assignedEmployee = assignment.employeeId
                                      ? employeesById.get(assignment.employeeId) ?? null
                                      : null;
                                    const isOnDutyToday = assignment.employeeId
                                      ? isEmployeeOnDutyDate(
                                          assignment.employeeId,
                                          day,
                                          rosterShifts,
                                        )
                                      : false;
                                    const isAbsentToday = assignment.employeeId && assignedEmployee
                                      ? isEmployeeAbsentOnDate(
                                          assignedEmployee,
                                          day,
                                          plannedAbsences,
                                          longTermAbsences,
                                        )
                                      : false;
                                    return (
                                      <div
                                        key={assignment.id}
                                        className={cn(
                                          "text-[11px] leading-tight text-slate-700 sm:text-xs",
                                          isAbsentToday && "line-through opacity-70",
                                          isOnDutyToday && "font-semibold text-red-600",
                                        )}
                                      >
                                        {name}
                                        {assignment.assignmentType !== "Plan" && (
                                          <span className="text-[9px] text-slate-500 sm:text-[10px]">
                                            {" "}
                                            ({assignment.assignmentType})
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="bg-slate-100/80 align-top">
                      <td className="sticky left-0 z-20 bg-slate-100/80 px-2 py-1.5 text-[11px] font-medium shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)] sm:text-xs">
                        {showFullLabels ? "Abwesenheiten" : "Abw."}
                      </td>
                      {weekDays.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const items = absencesByDate.get(key) ?? [];
                        const groupedItems = items.reduce<
                          Array<{ reason: string; names: string[] }>
                        >((groups, absence) => {
                          const reason = absence.reason || "Abwesenheit";
                          const existing = groups.find((group) => group.reason === reason);
                          const name = resolveAbsenceName(absence);
                          if (existing) {
                            existing.names.push(name);
                          } else {
                            groups.push({ reason, names: [name] });
                          }
                          return groups;
                        }, []);
                        return (
                          <td
                            key={`absences-${key}`}
                            className="px-1.5 py-1 text-[9px] text-slate-600 sm:text-[10px]"
                          >
                            {items.length === 0 ? (
                              "—"
                            ) : (
                              <div className="space-y-1.5">
                                {groupedItems.map((group) => (
                                  <div key={`${key}-${group.reason}`} className="space-y-0.5">
                                    <div className="font-medium underline underline-offset-2">
                                      {group.reason}
                                    </div>
                                    <div className="space-y-0.5">
                                      {group.names.map((name, index) => (
                                        <div key={`${key}-${group.reason}-${index}`}>{name}</div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="bg-slate-100/80 align-top">
                      <td className="sticky left-0 z-20 bg-slate-100/80 px-2 py-1.5 text-[11px] font-medium shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)] sm:text-xs">
                        {showFullLabels ? "Frei nach Dienst" : "ND"}
                      </td>
                      {weekDays.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const items = previousDayDutyByDate.get(key) ?? [];
                        return (
                          <td
                            key={`free-after-duty-${key}`}
                          className="px-1.5 py-1 text-[9px] text-slate-600 sm:text-[10px]"
                          >
                            {items.length === 0 ? (
                              "—"
                            ) : (
                            <div className="space-y-0.5">
                                {items.map((item) => (
                                  <div key={`${key}-${item.serviceType}`}>{item.assignee}</div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
