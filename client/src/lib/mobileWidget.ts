import type { DashboardDay } from "@/lib/api";

export const WIDGET_TODAY_SNAPSHOT_KEY = "mycliniq_widget_today_v1";

export type WidgetNextDaySnapshot = {
  date: string;
  statusLabel: string | null;
  workplace: string | null;
  dutyLabel: string | null;
  isDuty: boolean;
};

export type WidgetTodaySnapshotV2 = {
  version: 2;
  generatedAt: string;
  date: string | null;
  personName: string | null;
  statusLabel: string | null;
  workplace: string | null;
  absenceReason: string | null;
  dutyLabel: string | null;
  isDuty: boolean;
  teammates: string[];
  nextDays: WidgetNextDaySnapshot[];
};

function getIosBridge() {
  return (globalThis as any)?.webkit?.messageHandlers?.mycliniqWidget;
}

function getCapacitorBridge() {
  return (globalThis as any)?.Capacitor?.Plugins?.MycliniqWidgetBridge;
}

export function buildWidgetTodaySnapshot(input: {
  today: DashboardDay | null;
  personName: string | null;
  teammateNames: string[];
  nextDays: DashboardDay[];
}): WidgetTodaySnapshotV2 {
  const dutyLabel = input.today?.duty?.labelShort ?? input.today?.duty?.serviceType ?? null;
  const nextDays = input.nextDays.map((day) => {
    const nextDutyLabel = day.duty?.labelShort ?? day.duty?.serviceType ?? null;
    return {
      date: day.date,
      statusLabel: day.statusLabel ?? null,
      workplace: day.workplace ?? null,
      dutyLabel: nextDutyLabel,
      isDuty: Boolean(day.duty || nextDutyLabel),
    };
  });
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    date: input.today?.date ?? null,
    personName: input.personName,
    statusLabel: input.today?.statusLabel ?? null,
    workplace: input.today?.workplace ?? null,
    absenceReason: input.today?.absenceReason ?? null,
    dutyLabel,
    isDuty: Boolean(input.today?.duty || dutyLabel),
    teammates: input.teammateNames,
    nextDays,
  };
}

export async function syncWidgetTodaySnapshot(
  snapshot: WidgetTodaySnapshotV2,
): Promise<void> {
  try {
    localStorage.setItem(WIDGET_TODAY_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore local storage issues
  }

  try {
    const capacitorBridge = getCapacitorBridge();
    if (capacitorBridge?.setTodaySnapshot) {
      await capacitorBridge.setTodaySnapshot({
        snapshotJson: JSON.stringify(snapshot),
      });
      return;
    }
  } catch {
    // fall through to iOS message handler
  }

  try {
    const iosBridge = getIosBridge();
    iosBridge?.postMessage(snapshot);
  } catch {
    // ignore
  }
}
