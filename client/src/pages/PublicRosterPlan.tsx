import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Employee, LongTermAbsence, RosterShift, ServiceLine } from "@shared/schema";
import { getServiceLineDisplayLabel } from "@shared/shiftTypes";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getWeek,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import { de } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { getAustrianHoliday } from "@/lib/holidays";

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

type PublicRosterMonthPayload = {
  year: number;
  month: number;
  from: string;
  to: string;
  planStatus: "Entwurf" | "Vorläufig" | "Freigegeben" | null;
  employees: Employee[];
  serviceLines: ServiceLine[];
  rosterShifts: RosterShift[];
  plannedAbsences: PublicPlannedAbsence[];
  longTermAbsences: LongTermAbsence[];
};

type RosterAbsenceEntry = {
  employeeId: number;
  name: string;
  reason: string;
  source: "planned";
  absenceId: number | null;
  status?: string | null;
  notes?: string | null;
};

const SERVICE_LINE_PALETTE = [
  {
    cell: "bg-pink-50 text-pink-700 border-pink-200",
  },
  {
    cell: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    cell: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    cell: "bg-violet-50 text-violet-700 border-violet-200",
  },
  {
    cell: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
];

const FALLBACK_SERVICE_LINES = [
  { key: "kreiszimmer", label: "Kreisszimmerdienst", sortOrder: 1, isActive: true },
  { key: "gyn", label: "Hauptdienst", sortOrder: 2, isActive: true },
  { key: "turnus", label: "Turnusdienst", sortOrder: 3, isActive: true },
  { key: "overduty", label: "Überdienst", sortOrder: 4, isActive: true },
];

const PLAN_STATUS_LABELS: Record<NonNullable<PublicRosterMonthPayload["planStatus"]>, string> = {
  Entwurf: "Bearbeitung",
  Vorläufig: "Vorschau",
  Freigegeben: "Freigabe",
};

const buildServiceLineDisplay = (
  lines: ServiceLine[],
  shifts: RosterShift[],
) => {
  const source = lines.length ? lines : FALLBACK_SERVICE_LINES;
  const shiftKeys = new Set(shifts.map((shift) => shift.serviceType));
  const knownKeys = new Set(source.map((line) => line.key));
  const extras = [...shiftKeys]
    .filter((key) => !knownKeys.has(key))
    .map((key) => ({ key, label: key, sortOrder: 999, isActive: true }));
  return [...source, ...extras]
    .filter((line) => line.isActive !== false || shiftKeys.has(line.key))
    .sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (order !== 0) return order;
      return a.label.localeCompare(b.label, "de");
    })
    .map((line, index) => ({
      key: line.key,
      label: getServiceLineDisplayLabel(line.key, line.label) ?? line.label,
      style: SERVICE_LINE_PALETTE[index % SERVICE_LINE_PALETTE.length],
    }));
};

const getQueryMonthDate = (search: string) => {
  const params = new URLSearchParams(search);
  const yearRaw = params.get("year");
  const monthRaw = params.get("month");
  if (!yearRaw || !monthRaw) return startOfMonth(new Date());
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return startOfMonth(new Date());
  }
  const resolved = new Date(year, month - 1, 1);
  return Number.isNaN(resolved.getTime()) ? startOfMonth(new Date()) : resolved;
};

const isStandaloneWebApp = () => {
  if (typeof window === "undefined") return false;
  const navigatorStandalone = Boolean((window.navigator as { standalone?: boolean }).standalone);
  return navigatorStandalone || window.matchMedia("(display-mode: standalone)").matches;
};

const setMonthSearch = (date: Date) => {
  const monthStart = startOfMonth(date);
  return `/dienstplan-public?year=${monthStart.getFullYear()}&month=${monthStart.getMonth() + 1}`;
};

const hasValidMonthParams = (search: string) => {
  const params = new URLSearchParams(search);
  const yearRaw = params.get("year");
  const monthRaw = params.get("month");
  if (!yearRaw || !monthRaw) return false;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
};

export default function PublicRosterPlan() {
  const [location, setLocation] = useLocation();
  const [payload, setPayload] = useState<PublicRosterMonthPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? window.location.search : "",
  );
  const [showAbsenceColumn, setShowAbsenceColumn] = useState(false);

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
    if (hasValidMonthParams(search)) return;
    const next = setMonthSearch(new Date());
    setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
    setLocation(next);
  }, [search, setLocation]);

  const currentDate = useMemo(() => {
    if (isStandaloneWebApp()) return startOfMonth(new Date());
    return getQueryMonthDate(search);
  }, [search]);
  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/public-api/roster/month/${year}/${month}`);
        const envelope = (await response.json()) as {
          success: boolean;
          data?: PublicRosterMonthPayload;
          error?: string;
        };
        if (!response.ok || !envelope.success || !envelope.data) {
          throw new Error(envelope.error || "Monatsdienstplan konnte nicht geladen werden");
        }
        if (!active) return;
        setPayload(envelope.data);
      } catch (fetchError: any) {
        if (!active) return;
        setError(fetchError?.message || "Monatsdienstplan konnte nicht geladen werden");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [month, year]);

  const employees = payload?.employees ?? [];
  const shifts = payload?.rosterShifts ?? [];
  const plannedAbsences = payload?.plannedAbsences ?? [];
  const serviceLines = payload?.serviceLines ?? [];
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: monthStart,
        end: monthEnd,
      }),
    [monthEnd, monthStart],
  );
  const serviceLineDisplay = useMemo(
    () => buildServiceLineDisplay(serviceLines, shifts),
    [serviceLines, shifts],
  );
  const rosterColumnCount = 3 + serviceLineDisplay.length + 1;
  const employeesById = useMemo(
    () => new Map(employees.map((emp) => [emp.id, emp])),
    [employees],
  );
  const shiftsByDate = useMemo(
    () =>
      shifts.reduce<Record<string, Record<string, RosterShift>>>((acc, shift) => {
        if (!acc[shift.date]) acc[shift.date] = {};
        acc[shift.date][shift.serviceType] = shift;
        return acc;
      }, {}),
    [shifts],
  );

  const getLastName = (value: string) => {
    const parts = value.trim().split(/\s+/);
    return parts[parts.length - 1] || value;
  };

  const resolveEmployeeLastName = (
    employeeId: number,
    fallbackName?: string | null,
    fallbackLastName?: string | null,
  ) => {
    const employee = employeesById.get(employeeId);
    if (employee?.lastName) return employee.lastName;
    if (employee?.name) return getLastName(employee.name);
    if (fallbackLastName) return getLastName(fallbackLastName);
    if (fallbackName) return getLastName(fallbackName);
    return "Unbekannt";
  };

  const getShiftLabel = (shift?: RosterShift) => {
    if (!shift) return "-";
    if (shift.employeeId) {
      return employeesById.get(shift.employeeId)?.name ?? "—";
    }
    return shift.assigneeFreeText?.trim() || "-";
  };

  const getShiftDisplay = (shift?: RosterShift) => {
    const label = getShiftLabel(shift);
    if (label === "-") return "-";
    return getLastName(label);
  };

  const getAbsencesForDate = (date: Date): RosterAbsenceEntry[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return plannedAbsences
      .filter((absence) => absence.startDate <= dateStr && absence.endDate >= dateStr)
      .map(
        (absence): RosterAbsenceEntry => ({
          employeeId: absence.employeeId,
          name: resolveEmployeeLastName(
            absence.employeeId,
            absence.employeeName,
            absence.employeeLastName,
          ),
          reason: absence.reason,
          source: "planned",
          absenceId: absence.id,
          status: absence.status,
          notes: absence.notes ?? null,
        }),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  };

  const statusLabel = payload?.planStatus
    ? PLAN_STATUS_LABELS[payload.planStatus]
    : "Vorschau";

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0">
        <div className="sticky top-0 z-40 mb-4 bg-slate-50 pb-4 print:static print:bg-white">
          <div className="flex flex-col gap-3 print:hidden md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Monatsdienstplan</h1>
              <p className="text-sm text-slate-600">
                {format(monthStart, "MMMM yyyy", { locale: de })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const next = setMonthSearch(subMonths(currentDate, 1));
                  setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
                  setLocation(next);
                }}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Vormonat
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const next = setMonthSearch(new Date());
                  setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
                  setLocation(next);
                }}
              >
                Aktueller Monat
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const next = setMonthSearch(addMonths(currentDate, 1));
                  setSearch(next.split("?")[1] ? `?${next.split("?")[1]}` : "");
                  setLocation(next);
                }}
              >
                Nächster Monat
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Drucken
              </Button>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border-slate-200 shadow-sm print:border-0 print:shadow-none">
          <div className="border-b border-border bg-card p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                  {format(currentDate, "MMMM yyyy", { locale: de })}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    payload?.planStatus === "Freigegeben"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : payload?.planStatus === "Vorläufig"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                  }
                >
                  Status: {statusLabel}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAbsenceColumn((value) => !value)}
                >
                  Abwesenheiten {showAbsenceColumn ? "aus" : "ein"}
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">Monatsdienstplan wird geladen…</div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-red-600">{error}</div>
            ) : (
              <>
                <div className="space-y-3 p-4 md:hidden">
                  {days.map((day, i) => {
                    const weekNumber = getWeek(day, {
                      weekStartsOn: 1,
                      firstWeekContainsDate: 4,
                    });
                    const prevWeekNumber =
                      i > 0
                        ? getWeek(days[i - 1], {
                            weekStartsOn: 1,
                            firstWeekContainsDate: 4,
                          })
                        : null;
                    const showKW = i === 0 || weekNumber !== prevWeekNumber;
                    const dateKey = format(day, "yyyy-MM-dd");
                    const dayLabel = format(day, "EEE", { locale: de }).replace(".", "");
                    const dateLabel = format(day, "dd.MM", { locale: de });
                    const holiday = getAustrianHoliday(day);
                    const isHoliday = Boolean(holiday);
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    const highlightRow = isWeekend || isHoliday;
                    const dayShifts = shiftsByDate[dateKey] || {};
                    const dayAbsences = getAbsencesForDate(day);

                    return (
                      <div
                        key={`public-mobile-${dateKey}`}
                        className={cn(
                          "rounded-xl border border-border bg-background p-4 shadow-sm",
                          highlightRow && "border-amber-200 bg-amber-50/50",
                        )}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <div
                              className={cn(
                                "text-base font-semibold",
                                highlightRow && "text-rose-600",
                              )}
                            >
                              {dayLabel}, {dateLabel}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              KW {weekNumber}
                              {showKW ? " • Wochenstart" : ""}
                              {holiday ? ` • ${holiday.name}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {serviceLineDisplay.map((line) => {
                            const shift = dayShifts[line.key];
                            const label = getShiftDisplay(shift);
                            return (
                              <div
                                key={`${dateKey}-${line.key}`}
                                className="flex items-start justify-between gap-3 text-sm"
                              >
                                <span className="min-w-0 text-muted-foreground">
                                  {line.label}
                                </span>
                                <span
                                  className={cn(
                                    "text-right font-medium",
                                    label === "-" && "text-muted-foreground",
                                  )}
                                >
                                  {label}
                                </span>
                              </div>
                            );
                          })}
                          {showAbsenceColumn && (
                            <div className="border-t border-border pt-2 text-sm">
                              <div className="mb-1 text-muted-foreground">Abwesenheiten</div>
                              {dayAbsences.length === 0 ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {dayAbsences.map((absence) => (
                                    <span
                                      key={`public-mobile-absence-${absence.employeeId}-${absence.absenceId ?? absence.reason}`}
                                      className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                                    >
                                      {absence.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[800px] text-sm">
                    <thead>
                      <tr className="bg-primary text-white">
                        <th className="w-16 px-2 py-2 text-left font-medium">KW</th>
                        <th className="w-12 px-2 py-2 text-left font-medium">Tag</th>
                        <th className="w-24 px-2 py-2 text-left font-medium">Datum</th>
                        {serviceLineDisplay.map((line) => (
                          <th key={line.key} className="px-2 py-2 text-left font-medium">
                            {line.label}
                          </th>
                        ))}
                        <th className={cn("px-2 py-2 text-left font-medium", !showAbsenceColumn && "hidden")}>
                          Abwesenheiten
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((day, i) => {
                        const weekNumber = getWeek(day, {
                          weekStartsOn: 1,
                          firstWeekContainsDate: 4,
                        });
                        const prevWeekNumber =
                          i > 0
                            ? getWeek(days[i - 1], {
                                weekStartsOn: 1,
                                firstWeekContainsDate: 4,
                              })
                            : null;
                        const showKW = i === 0 || weekNumber !== prevWeekNumber;
                        const dayLabel = format(day, "EEE", { locale: de }).replace(".", "");
                        const dateLabel = format(day, "dd.MM", { locale: de });
                        const dateKey = format(day, "yyyy-MM-dd");
                        const dayShifts = shiftsByDate[dateKey] || {};
                        const holiday = getAustrianHoliday(day);
                        const isHoliday = Boolean(holiday);
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        const highlightRow = isWeekend || isHoliday;
                        const dayAbsences = getAbsencesForDate(day);

                        return (
                          <tr
                            key={dateKey}
                            className={cn(
                              "border-b border-border transition-colors hover:bg-muted/30",
                              highlightRow && "bg-amber-50/60",
                            )}
                          >
                            <td className="px-2 py-1.5 font-medium text-primary">
                              {showKW ? weekNumber : ""}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1.5 font-medium",
                                highlightRow && "text-rose-600",
                              )}
                            >
                              {dayLabel}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1.5 text-muted-foreground",
                                highlightRow && "text-rose-600",
                              )}
                            >
                              {dateLabel}
                            </td>
                            {serviceLineDisplay.map((line) => {
                              const shift = dayShifts[line.key];
                              const label = getShiftDisplay(shift);
                              return (
                                <td key={line.key} className="px-2 py-1.5">
                                  {label !== "-" ? (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        line.style.cell,
                                        "px-2 py-0.5 text-sm leading-5",
                                      )}
                                    >
                                      {label}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className={cn("px-2 py-1.5 text-xs text-muted-foreground", !showAbsenceColumn && "hidden")}>
                              {showAbsenceColumn &&
                                (dayAbsences.length === 0 ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {dayAbsences.map((absence) => (
                                      <span
                                        key={`public-desktop-absence-${absence.employeeId}-${absence.absenceId ?? absence.reason}`}
                                        className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                                      >
                                        {absence.name}
                                      </span>
                                    ))}
                                  </div>
                                ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
