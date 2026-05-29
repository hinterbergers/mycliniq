import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WeeklyPlanResponse } from "@/lib/api";
import {
  WEEKDAY_FULL,
  WEEKDAY_LABELS,
  type WeeklyPlanRoom,
  formatRoomTime,
  getRoomSettingForDate,
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
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? window.location.search : "",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSearch(window.location.search);
  }, [location]);

  useEffect(() => {
    if (hasValidWeekParams(search)) return;
    const next = setWeekSearch(new Date());
    setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
    setLocation(next);
  }, [search, setLocation]);

  const currentDate = useMemo(() => {
    return getQueryWeekDate(search);
  }, [search]);

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
    const map = new Map<string, NonNullable<WeeklyPlanResponse["assignments"]>>();
    (weeklyPlan?.assignments || []).forEach((assignment) => {
      const key = `${assignment.roomId}-${assignment.weekday}`;
      const current = map.get(key) ?? [];
      current.push(assignment);
      map.set(key, current);
    });
    return map;
  }, [weeklyPlan]);
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
        });
      map.set(dateKey, entries);
    });
    return map;
  }, [employeesById, rosterShifts, weekDays]);

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0">
        <div className="mb-4 flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Öffentlicher Wochenplan</h1>
            <p className="text-sm text-slate-600">
              KW {weekNumber} / {weekYear} · {format(weekStart, "dd.MM.yyyy", { locale: de })} bis{" "}
              {format(weekEnd, "dd.MM.yyyy", { locale: de })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const next = setWeekSearch(addWeeks(currentDate, -1));
                setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
                setLocation(next);
              }}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Vorwoche
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const next = setWeekSearch(new Date());
                setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
                setLocation(next);
              }}
            >
              Aktuelle Woche
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const next = setWeekSearch(addWeeks(currentDate, 1));
                setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
                setLocation(next);
              }}
            >
              Nächste Woche
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Drucken
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-slate-200 shadow-sm print:border-0 print:shadow-none">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">Wochenplan wird geladen…</div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-red-600">{error}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
	                    <tr className="border-b border-slate-200 bg-slate-100">
	                      <th className="sticky left-0 top-0 z-40 w-56 bg-slate-100 p-3 text-left font-medium shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]">
	                        Arbeitsplatz
	                      </th>
	                      {weekDays.map((day, index) => (
	                        <th
	                          key={day.toISOString()}
	                          className="sticky top-0 z-30 min-w-[120px] bg-slate-100 p-3 text-center font-medium"
	                        >
                          <div className="text-xs text-slate-500">{WEEKDAY_LABELS[index]}</div>
                          <div className="text-sm" title={WEEKDAY_FULL[index]}>
                            {format(day, "dd.MM", { locale: de })}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRooms.map((room) => (
                      <tr
                        key={room.id}
                        className="align-top transition-colors odd:bg-white even:bg-slate-50/60"
                        style={room.rowColor ? { backgroundColor: room.rowColor } : undefined}
                      >
                        <td
                          className="sticky left-0 z-20 border-b border-slate-200 p-3 shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]"
                          style={
                            room.rowColor
                              ? { backgroundColor: room.rowColor }
                              : { backgroundColor: "white" }
                          }
                        >
                          <div className="font-medium text-slate-900">{room.name}</div>
                          {room.physicalRooms && room.physicalRooms.length > 0 && (
                            <div className="text-[11px] text-slate-500">
                              {room.physicalRooms.map((pr) => pr.name).join(", ")}
                            </div>
                          )}
                        </td>
                        {weekDays.map((day, index) => {
                          const weekday = index + 1;
                          const setting = getRoomSettingForDate(room, day);
                          if (!setting) {
                            return (
                              <td
                                key={`${room.id}-${weekday}`}
                                className="border-b border-slate-200 p-3 text-center text-xs text-slate-400"
                              >
                                —
                              </td>
                            );
                          }
                          if (setting.isClosed) {
                            return (
                              <td
                                key={`${room.id}-${weekday}`}
                                className="border-b border-slate-200 p-3 text-center text-xs text-slate-500"
                              >
                                {setting.closedReason ? `Gesperrt: ${setting.closedReason}` : "Gesperrt"}
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
                                "border-b border-slate-200 p-3 align-top",
                                isBlockedCell && "bg-slate-100/80",
                              )}
                            >
                              {!isBlockedCell && (setting.usageLabel || timeLabel) && (
                                <div className="mb-1 text-[10px] text-slate-500">
                                  {[setting.usageLabel, timeLabel].filter(Boolean).join(" · ")}
                                </div>
                              )}
                              {isBlockedCell ? (
                                <div className="inline-flex rounded-full bg-slate-300 px-3 py-1 text-[10px] font-semibold text-slate-800">
                                  Gesperrt
                                </div>
                              ) : employeeAssignments.length === 0 ? (
                                <div className="text-xs text-slate-400">—</div>
                              ) : (
                                <div className="space-y-1">
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
                                          "text-xs text-slate-700",
                                          isAbsentToday && "line-through opacity-70",
                                          isOnDutyToday && "font-semibold text-red-600",
                                        )}
                                      >
                                        {name}
                                        {assignment.assignmentType !== "Plan" && (
                                          <span className="text-[10px] text-slate-500">
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
                      <td className="sticky left-0 z-20 bg-slate-100/80 p-3 text-xs font-medium shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]">
                        Abwesenheiten
                      </td>
                      {weekDays.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const items = absencesByDate.get(key) ?? [];
                        return (
                          <td
                            key={`absences-${key}`}
                            className="p-2 text-[10px] text-slate-600"
                          >
                            {items.length === 0 ? (
                              "—"
                            ) : (
                              <div className="space-y-1">
                                {items.map((absence) => (
                                  <div key={absence.id}>
                                    {resolveAbsenceName(absence)} ({absence.reason})
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="bg-slate-100/80 align-top">
                      <td className="sticky left-0 z-20 bg-slate-100/80 p-3 text-xs font-medium shadow-[4px_0_12px_-10px_rgba(15,23,42,0.35)]">
                        Frei nach Dienst
                      </td>
                      {weekDays.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const items = previousDayDutyByDate.get(key) ?? [];
                        return (
                          <td
                            key={`free-after-duty-${key}`}
                            className="p-2 text-[10px] text-slate-600"
                          >
                            {items.length === 0 ? (
                              "—"
                            ) : (
                              <div className="space-y-1">
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
