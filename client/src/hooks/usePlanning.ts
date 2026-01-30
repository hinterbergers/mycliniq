import { useCallback, useEffect, useMemo, useState } from "react";
import { planningApi, type PlanningInputV1, type PlanningLock, type PlanningStateResponse } from "@/lib/planningApi";

type PlanningCacheEntry = {
  input?: PlanningInputV1;
  state?: PlanningStateResponse;
  locks?: PlanningLock[];
};

const planningCache = new Map<string, PlanningCacheEntry>();

const buildKey = (year: number, month: number) => `${year}-${month}`;

export function usePlanning(year: number, month: number) {
  const key = useMemo(() => buildKey(year, month), [year, month]);

  const [input, setInput] = useState<PlanningInputV1 | null>(() => {
    return planningCache.get(key)?.input ?? null;
  });
  const [state, setState] = useState<PlanningStateResponse | null>(() => {
    return planningCache.get(key)?.state ?? null;
  });
  const [locks, setLocks] = useState<PlanningLock[]>(() => {
    return planningCache.get(key)?.locks ?? [];
  });
  const [loading, setLoading] = useState(() => !planningCache.has(key));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedState, fetchedInput, fetchedLocks] = await Promise.all([
        planningApi.fetchState(year, month),
        planningApi.fetchInput(year, month),
        planningApi.fetchLocks(year, month),
      ]);
      const entry: PlanningCacheEntry = {
        state: fetchedState,
        input: fetchedInput,
        locks: fetchedLocks,
      };
      planningCache.set(key, entry);
      setState(fetchedState);
      setInput(fetchedInput);
      setLocks(fetchedLocks);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Fehler beim Laden der Planung";
      setError(message);
      console.error("Planning fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [key, year, month]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (planningCache.has(key)) {
        const cached = planningCache.get(key)!;
        setInput(cached.input ?? null);
        setState(cached.state ?? null);
        setLocks(cached.locks ?? []);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [fetchedState, fetchedInput, fetchedLocks] = await Promise.all([
          planningApi.fetchState(year, month),
          planningApi.fetchInput(year, month),
          planningApi.fetchLocks(year, month),
        ]);
        if (cancelled) return;
        const entry: PlanningCacheEntry = {
          state: fetchedState,
          input: fetchedInput,
          locks: fetchedLocks,
        };
        planningCache.set(key, entry);
        setState(fetchedState);
        setInput(fetchedInput);
        setLocks(fetchedLocks);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Fehler beim Laden der Planung";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [key, year, month]);

  return {
    input,
    state,
    locks,
    loading,
    error,
    refresh,
  };
}
