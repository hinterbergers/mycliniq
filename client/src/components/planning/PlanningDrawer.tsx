import { format } from "date-fns";
import { useMemo } from "react";
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
  PlanningInputV1,
  PlanningLock,
  PlanningStateResponse,
} from "@/lib/planningApi";

type PlanningDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
  employees: Employee[];
  input: PlanningInputV1 | null;
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

  const inputSummary = useMemo(() => {
    if (!input) return [];
    return [
      { label: "Mitarbeiter", value: input.employees.length },
      { label: "Slots", value: input.slots.length },
      { label: "Rollen", value: input.roles.length },
      {
        label: "Regeln (hart)",
        value: input.rules?.hardRules?.length ?? 0,
      },
      {
        label: "Regeln (weich)",
        value: input.rules?.softRules?.length ?? 0,
      },
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
            <div className="flex items-center gap-2 text-sm">
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
                variant="ghost"
                size="sm"
                onClick={() => refresh?.()}
                disabled={loading}
              >
                Akt.
              </Button>
            </div>
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
