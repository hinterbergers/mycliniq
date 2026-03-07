import type { DashboardDay } from "@/lib/api";

export const WIDGET_TODAY_SNAPSHOT_KEY = "mycliniq_widget_today_v1";

export type WidgetTodaySnapshotV1 = {
  version: 1;
  generatedAt: string;
  date: string | null;
  personName: string | null;
  statusLabel: string | null;
  workplace: string | null;
  absenceReason: string | null;
  dutyLabel: string | null;
  isDuty: boolean;
  teammates: string[];
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
}): WidgetTodaySnapshotV1 {
  const dutyLabel = input.today?.duty?.labelShort ?? input.today?.duty?.serviceType ?? null;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    date: input.today?.date ?? null,
    personName: input.personName,
    statusLabel: input.today?.statusLabel ?? null,
    workplace: input.today?.workplace ?? null,
    absenceReason: input.today?.absenceReason ?? null,
    dutyLabel,
    isDuty: Boolean(input.today?.duty || dutyLabel),
    teammates: input.teammateNames,
  };
}

export async function syncWidgetTodaySnapshot(
  snapshot: WidgetTodaySnapshotV1,
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
