import { format } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import type { Employee } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  planningApi,
  PlanningInputSummary,
  PlanningLock,
  PlanningOutputV1,
  PlanningStateResponse,
} from "@/lib/planningApi";
import { Loader2, PlayCircle } from "lucide-react";

type PlanningDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
  employees: Employee[];
  input: PlanningInputSummary | null;
  state: PlanningStateResponse | null;
  locks: PlanningLock[];
  loading?: boolean;
  error?: string | null;
  refresh?: () => void;
};

const formatMonth = (year: number, month: number) =>
  format(new Date(year, month - 1, 1), "MMMM yyyy");

export function PlanningDrawer({
  open,
  onOpenChange,
  year,
  month,
  employees,
  input,
  state,
  locks,
  loading = false,
  error,
  refresh,
}: PlanningDrawerProps) {
  const displayMonth = formatMonth(year, month);
  const employeeLookup = useMemo(() => {
    return new Map(employees.map((emp) => [emp.id, emp]));
  }, [employees]);

  const lockEntries = useMemo(
    () =>
      locks.map((lock) => {
        const employee = lock.employeeId
          ? employeeLookup.get(lock.employeeId) ?? null
          : null;
        return {
          id: lock.id,
          slotId: lock.slotId,
          name: employee ? employee.name : "Slot frei",
          updatedAt: lock.updatedAt,
        };
      }),
    [locks, employeeLookup],
  );

  const [previewResult, setPreviewResult] = useState<PlanningOutputV1 | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const formatApiError = (error: unknown) => {
    const message = error instanceof Error ? error.message : "Fehler beim Berechnen der Vorschau";
    const status = (error as any)?.status;
    return status ? `${message} (Status ${status})` : message;
  };

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await planningApi.runPreview(year, month);
      setPreviewResult(result);
    } catch (error) {
      const message = formatApiError(error);
      setPreviewError(message);
      console.error("Planning preview error", error);
    } finally {
      setPreviewLoading(false);
    }
  }, [year, month]);

  const groupedUnfilled = useMemo(() => {
    const slots = previewResult?.unfilledSlots ?? [];
    if (!slots.length) return [];
    const map = new Map<string, typeof slots>();
    for (const slot of slots) {
      const existing = map.get(slot.date) ?? [];
      existing.push(slot);
      map.set(slot.date, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [previewResult]);

  const inputSummary = useMemo(() => {
    if (!input) return [];
    return [
      { label: "Mitarbeiter", value: input.employees },
      { label: "Slots", value: input.slots },
      { label: "Rollen", value: input.roles },
      { label: "Regeln (hart)", value: input.hardRules },
      { label: "Regeln (weich)", value: input.softRules },
    ];
  }, [input]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPortal>
        <DrawerOverlay className="backdrop-blur" />
        <DrawerContent className="w-full max-w-md">
          <DrawerHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <DrawerTitle>Planung {displayMonth}</DrawerTitle>
                <DrawerDescription>Status & Locks anzeigen</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="sm">
                  Schließen
                </Button>
              </DrawerClose>
            </div>
            <Separator className="my-2" />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {state?.isDirty ? (
                <Badge variant="secondary">Neue Eingänge</Badge>
              ) : (
                <Badge variant="outline">Keine Änderungen</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Eingereicht: {state?.submittedCount ?? "–"}
              </span>
              {state?.missingCount != null && (
                <span className="text-xs text-muted-foreground">
                  Fehlend: {state.missingCount}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handlePreview()}
                disabled={previewLoading}
              >
                {previewLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
                Vorschau berechnen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refresh?.()}
                disabled={loading}
              >
                Akt.
              </Button>
            </div>
            {previewLoading && (
              <p className="text-xs text-muted-foreground px-2">
                Vorschau wird berechnet...
              </p>
            )}
            {previewError && (
              <p className="text-xs text-destructive px-2">{previewError}</p>
            )}
            {previewResult && (
              <div className="space-y-3 px-3 py-2 rounded-lg border border-border bg-background/50">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    variant={previewResult.publishAllowed ? "secondary" : "destructive"}
                    className="text-xs"
                  >
                    {previewResult.publishAllowed
                      ? "Publikation möglich"
                      : "Publikation blockiert"}
                  </Badge>
                  <span className="text-muted-foreground">
                    Score: {previewResult.summary.score.toFixed(2)}
                  </span>
                  <span className="text-muted-foreground">
                    Pflichtdienste {previewResult.summary.coverage.filled}/
                    {previewResult.summary.coverage.required}
                  </span>
                  <span className="text-muted-foreground">
                    Verletzungen: {previewResult.violations.length}
                  </span>
                  <span className="text-muted-foreground">
                    Unfilled: {previewResult.unfilledSlots.length}
                  </span>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Violations (max 30)
                    </p>
                    {previewResult.violations.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Keine Verletzungen.</p>
                    ) : (
                      previewResult.violations.slice(0, 30).map((violation, index) => (
                        <div
                          key={`${violation.code}-${violation.slotId ?? violation.employeeId ?? index}`}
                          className="text-xs text-muted-foreground"
                        >
                          <span className="font-semibold">{violation.code}</span>: {violation.message}
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Unfilled Slots (nach Datum)
                    </p>
                    {groupedUnfilled.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Keine offenen Slots.</p>
                    ) : (
                      groupedUnfilled.map(([date, slots]) => (
                        <div key={date} className="space-y-1 text-xs">
                          <p className="font-semibold text-muted-foreground">{date}</p>
                          {slots.map((slot) => (
                            <div
                              key={slot.slotId}
                              className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1 bg-muted/30"
                            >
                              <span className="font-medium">{slot.serviceType}</span>
                              {slot.blocksPublish && (
                                <Badge variant="destructive" className="text-[10px] px-1">
                                  Pflicht
                                </Badge>
                              )}
                              <span className="text-muted-foreground text-xs">
                                {slot.reasonCodes.join(", ")}
                              </span>
                              {slot.candidatesBlockedBy.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  Gründe: {slot.candidatesBlockedBy.join(", ")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </DrawerHeader>

          <Tabs defaultValue="state" className="px-4 pb-4">
            <TabsList className="mb-2">
              <TabsTrigger value="state">State</TabsTrigger>
              <TabsTrigger value="input">Input Summary</TabsTrigger>
              <TabsTrigger value="locks">Locks</TabsTrigger>
            </TabsList>

            <TabsContent value="state">
              {loading && <p>Lädt...</p>}
              {error && <p className="text-destructive text-sm">{error}</p>}
              {!loading && !error && (
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    Letzter Run:{" "}
                    {state?.lastRunAt
                      ? new Date(state.lastRunAt).toLocaleString("de-DE")
                      : "keiner"}
                  </p>
                  <p>Dirty: {state?.isDirty ? "Ja" : "Nein"}</p>
                  <p>Einträge: {state?.submittedCount ?? "–"}</p>
                  <p>Fehlend: {state?.missingCount ?? "–"}</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="input">
              <ScrollArea className="max-h-64 space-y-2">
                {inputSummary.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between text-sm px-2 py-1 border border-border rounded"
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-semibold">{item.value}</span>
                  </div>
                ))}
                {!input && !loading && (
                  <p className="text-xs text-muted-foreground">
                    Keine Input-Daten verfügbar.
                  </p>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="locks">
              {locks.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Noch keine Locks gesetzt.
                </p>
              )}
              <ScrollArea className="max-h-64 space-y-1">
                {lockEntries.map((lock) => (
                  <div
                    key={lock.id}
                    className="flex items-center justify-between rounded border border-border px-2 py-1 text-sm"
                  >
                    <span className="font-mono truncate">{lock.slotId}</span>
                    <span className="text-xs text-muted-foreground">
                      {lock.name}
                    </span>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  );
}
