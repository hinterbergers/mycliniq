import { and, desc, eq } from "drizzle-orm";
import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import { parseISO, getISOWeek } from "date-fns";
import { db } from "../../../lib/db";
import { storage } from "../../../storage";
import {
  rosterPlanningLocks,
  rosterPlanningRuns,
  type RosterPlanningLock,
  type RosterPlanningRun,
} from "../../../../shared/schema";
import { assertValidPlanningOutput } from "../validation/planningSchemas";
import { buildPlanningInput } from "./buildPlanningInput";
import { hasCapability, isTechnicalAdmin, requireAuth } from "../../middleware/auth";

type JsonValue = Record<string, unknown>;

export async function getLocks(year: number, month: number): Promise<RosterPlanningLock[]> {
  return db
    .select()
    .from(rosterPlanningLocks)
    .where(
      and(
        eq(rosterPlanningLocks.year, year),
        eq(rosterPlanningLocks.month, month),
      ),
    )
    .orderBy(rosterPlanningLocks.slotId);
}

export async function upsertLock(
  year: number,
  month: number,
  slotId: string,
  employeeId: number | null,
  userId: number,
): Promise<RosterPlanningLock | null> {
  const now = new Date();
  const [lock] = await db
    .insert(rosterPlanningLocks)
    .values({
      year,
      month,
      slotId,
      employeeId,
      createdById: userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        rosterPlanningLocks.year,
        rosterPlanningLocks.month,
        rosterPlanningLocks.slotId,
      ],
      set: {
        employeeId,
        updatedAt: now,
      },
    })
    .returning();

  return lock ?? null;
}

export async function deleteLock(
  year: number,
  month: number,
  slotId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(rosterPlanningLocks)
    .where(
      and(
        eq(rosterPlanningLocks.year, year),
        eq(rosterPlanningLocks.month, month),
        eq(rosterPlanningLocks.slotId, slotId),
      ),
    )
    .returning({ id: rosterPlanningLocks.id });

  return deleted.length > 0;
}

type SaveRunArgs = {
  year: number;
  month: number;
  inputHash: string;
  inputJson: JsonValue;
  outputJson: JsonValue;
  engine: string;
  seed?: number | null;
  userId: number;
};

export async function saveRun({
  year,
  month,
  inputHash,
  inputJson,
  outputJson,
  engine,
  seed = null,
  userId,
}: SaveRunArgs): Promise<RosterPlanningRun> {
  const [run] = await db
    .insert(rosterPlanningRuns)
    .values({
      year,
      month,
      inputHash,
      inputJson,
      outputJson,
      engine,
      seed,
      createdById: userId,
      createdAt: new Date(),
    })
    .returning();

  if (!run) {
    throw new Error("failed to persist roster planning run");
  }

  return run;
}

export async function getLatestRun(
  year: number,
  month: number,
): Promise<RosterPlanningRun | null> {
  const runs = await db
    .select()
    .from(rosterPlanningRuns)
    .where(
      and(
        eq(rosterPlanningRuns.year, year),
        eq(rosterPlanningRuns.month, month),
      ),
    )
    .orderBy(desc(rosterPlanningRuns.createdAt))
    .limit(1);

  return runs[0] ?? null;
}

const PLANNING_ENGINE = "local-greedy";
const PLANNING_CAPS = ["dutyplan.edit", "dutyplan.publish"];

const hasPlanningAccess = (req: Request) => {
  if (!req.user) return false;
  if (req.user.isAdmin || req.user.appRole === "Admin") return true;
  if (isTechnicalAdmin(req)) return true;
  return PLANNING_CAPS.some((cap) => hasCapability(req, cap));
};

const normalizeStringArray = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string");
};

const resolveSeedValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

type PlannerEmployeeState = {
  id: string;
  canRoleIds: Set<string>;
  banDates: Set<string>;
  banWeekdays: Set<number>;
  maxSlots: number;
  maxSlotsPerWeek: number;
  assignedCount: number;
  assignedPerWeek: Record<number, number>;
  assignedDates: Set<string>;
};

const createSeededRng = (seed: number) => {
  let state = Math.max(1, Math.floor(seed));
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const shuffleArray = <T>(values: T[], rng: () => number): T[] => {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const buildEmployeeStates = (employees: Array<{ id: string; capabilities: { canRoleIds: string[] }; constraints: any }>) => {
  const states = new Map<string, PlannerEmployeeState>();
  for (const employee of employees) {
    const limits = employee.constraints?.limits ?? {};
    const hard = employee.constraints?.hard ?? {};
    const maxSlots = Number.isFinite(limits?.maxSlotsInPeriod ?? NaN)
      ? limits.maxSlotsInPeriod
      : Number.MAX_SAFE_INTEGER;
    const maxSlotsPerWeek = Number.isFinite(limits?.maxSlotsPerIsoWeek ?? NaN)
      ? limits.maxSlotsPerIsoWeek
      : Number.MAX_SAFE_INTEGER;
    const banDates = new Set<string>(normalizeStringArray(hard?.banDates ?? []));
    const banWeekdays = new Set<number>(
      Array.isArray(hard?.banWeekdays)
        ? hard.banWeekdays
            .map((value: unknown) => Number(value))
            .filter(
              (value: number) =>
                Number.isFinite(value) && value >= 0 && value <= 6,
            )
        : [],
    );
    const canRoleIds = new Set(
      normalizeStringArray(employee.capabilities?.canRoleIds ?? []),
    );
    if (!canRoleIds.size) {
      canRoleIds.add("overduty");
    }

    states.set(employee.id, {
      id: employee.id,
      canRoleIds,
      banDates,
      banWeekdays,
      maxSlots: maxSlots > 0 ? maxSlots : Number.MAX_SAFE_INTEGER,
      maxSlotsPerWeek: maxSlotsPerWeek > 0 ? maxSlotsPerWeek : Number.MAX_SAFE_INTEGER,
      assignedCount: 0,
      assignedPerWeek: {},
      assignedDates: new Set(),
    });
  }
  return states;
};

const recordAssignment = (state: PlannerEmployeeState, slotDate: string) => {
  state.assignedCount += 1;
  state.assignedDates.add(slotDate);
  const isoWeek = getISOWeek(parseISO(slotDate));
  state.assignedPerWeek[isoWeek] = (state.assignedPerWeek[isoWeek] ?? 0) + 1;
};

const createAssignments = (
  input: any,
  locks: RosterPlanningLock[],
  seed: number,
) => {
  const employeeStates = buildEmployeeStates(input.employees);
  const assignments: Array<{ slotId: string; employeeId: string }> = [];
  const violations: Array<{
    code: string;
    hard: boolean;
    message: string;
    slotId?: string;
    employeeId?: string;
  }> = [];
  const unfilledSlots: Array<{ slotId: string; reasons: string[] }> = [];
  const lockMap = new Map(locks.map((lock) => [lock.slotId, lock]));
  for (let index = 0; index < input.slots.length; index += 1) {
    const slot = input.slots[index];
    const slotDate = slot.date;
    const slotDateObj = parseISO(slotDate);
    const weekday = slotDateObj.getDay();
    const isoWeek = getISOWeek(slotDateObj);

    const lock = lockMap.get(slot.id);
    if (lock) {
      if (lock.employeeId === null) {
        unfilledSlots.push({ slotId: slot.id, reasons: ["slot locked empty"] });
      } else {
        const employeeId = String(lock.employeeId);
        const employeeState = employeeStates.get(employeeId);
        if (employeeState) {
          recordAssignment(employeeState, slotDate);
          assignments.push({ slotId: slot.id, employeeId });
        } else {
          violations.push({
            code: "LOCK_INVALID_EMPLOYEE",
            hard: true,
            slotId: slot.id,
            employeeId,
            message: `Lock references missing employee ${employeeId}`,
          });
          unfilledSlots.push({
            slotId: slot.id,
            reasons: ["locked employee not found"],
          });
        }
      }
      continue;
    }

    const rng = createSeededRng(seed + index + 1);
    const candidates = shuffleArray(Array.from(employeeStates.values()), rng);
    const candidate = candidates.find((employee) => {
      if (!employee.canRoleIds.has(slot.roleId)) return false;
      if (employee.banDates.has(slotDate)) return false;
      if (employee.banWeekdays.has(weekday)) return false;
      if (employee.assignedCount >= employee.maxSlots) return false;
      const weekCount = employee.assignedPerWeek[isoWeek] ?? 0;
      if (weekCount >= employee.maxSlotsPerWeek) return false;
      if (employee.assignedDates.has(slotDate)) return false;
      return true;
    });

    if (candidate) {
      recordAssignment(candidate, slotDate);
      assignments.push({ slotId: slot.id, employeeId: candidate.id });
    } else {
      unfilledSlots.push({
        slotId: slot.id,
        reasons: ["no eligible employee available"],
      });
      violations.push({
        code: "NO_CANDIDATE",
        hard: false,
        slotId: slot.id,
        message: "Keine passende Ressource gefunden",
      });
    }
  }

  const summary = {
    score: input.slots.length
      ? assignments.length / input.slots.length
      : 0,
    coverage: {
      filled: assignments.length,
      required: input.slots.length,
    },
  };

  return { assignments, violations, unfilledSlots, summary };
};

const buildPlanningOutput = async (
  input: any,
  locks: RosterPlanningLock[],
  seed?: unknown,
) => {
  const resolvedSeed = resolveSeedValue(seed);
  const runSeed = Number.isFinite(resolvedSeed ?? NaN)
    ? (resolvedSeed as number)
    : Date.now();
  const result = createAssignments(input, locks, runSeed);
  const output = {
    version: "v1",
    meta: {
      createdAt: new Date().toISOString(),
      planningKind: input.meta?.planningKind ?? "MONTHLY_DUTY",
      engine: PLANNING_ENGINE,
      seed: runSeed,
    },
    assignments: result.assignments,
    violations: result.violations,
    unfilledSlots: result.unfilledSlots,
    summary: {
      score: result.summary.score,
      coverage: result.summary.coverage,
    },
  };
  assertValidPlanningOutput(output);
  return { output, seed: runSeed };
};

export function registerPlanningRoutes(router: Router) {
  router.use(requireAuth);
  router.use((req, res, next) => {
    if (!hasPlanningAccess(req)) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    next();
  });

  const parseYearMonth = (req: Request, res: Response) => {
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: "Ungültiges Jahr/Monat" });
      return null;
    }
    return { year, month };
  };

  router.get("/:year/:month/input", async (req, res) => {
    try {
      const parsed = parseYearMonth(req, res);
      if (!parsed) return;
      const input = await buildPlanningInput(parsed.year, parsed.month);
      res.json(input);
    } catch (error) {
      res.status(500).json({ error: "Fehler beim Erzeugen der Input-Daten" });
    }
  });

  router.get("/:year/:month/state", async (req, res) => {
    try {
      const parsed = parseYearMonth(req, res);
      if (!parsed) return;
      const [locks, latestRun, submittedCount, employees] = await Promise.all([
        getLocks(parsed.year, parsed.month),
        getLatestRun(parsed.year, parsed.month),
        storage.getSubmittedWishesCount(parsed.year, parsed.month),
        storage.getEmployees(),
      ]);
      const totalEmployees = employees.filter((employee) => employee.takesShifts !== false).length;
      const missingCount = Math.max(0, totalEmployees - submittedCount);
      const lastRunAt = latestRun?.createdAt
        ? latestRun.createdAt.toISOString()
        : null;
      const isDirty =
        !latestRun ||
        locks.some((lock) =>
          latestRun.createdAt ? new Date(lock.updatedAt) > latestRun.createdAt : true,
        );
      res.json({ submittedCount, missingCount, lastRunAt, isDirty });
    } catch (error) {
      res.status(500).json({ error: "Fehler beim Laden des Planning-Status" });
    }
  });

  router.get("/:year/:month/locks", async (req, res) => {
    try {
      const parsed = parseYearMonth(req, res);
      if (!parsed) return;
      const locks = await getLocks(parsed.year, parsed.month);
      res.json(locks);
    } catch (error) {
      res.status(500).json({ error: "Fehler beim Laden der Locks" });
    }
  });

  router.put("/:year/:month/locks", async (req, res) => {
    try {
      const parsed = parseYearMonth(req, res);
      if (!parsed) return;
      const { slotId, employeeId } = req.body ?? {};
      if (!slotId || typeof slotId !== "string") {
        return res.status(400).json({ error: "SlotId ist erforderlich" });
      }
      const resolvedEmployeeId =
        employeeId === null
          ? null
          : typeof employeeId === "number"
          ? employeeId
          : Number(employeeId);
      if (resolvedEmployeeId !== null && Number.isNaN(resolvedEmployeeId)) {
        return res.status(400).json({ error: "Ungültige employeeId" });
      }
      const userId = req.user?.employeeId;
      if (!userId) {
        return res.status(400).json({ error: "EmployeeId fehlt" });
      }
      const lock = await upsertLock(
        parsed.year,
        parsed.month,
        slotId,
        resolvedEmployeeId,
        userId,
      );
      res.json(lock);
    } catch (error) {
      res.status(500).json({ error: "Fehler beim Speichern des Locks" });
    }
  });

  router.delete("/:year/:month/locks/:slotId", async (req, res) => {
    try {
      const parsed = parseYearMonth(req, res);
      if (!parsed) return;
      await deleteLock(parsed.year, parsed.month, req.params.slotId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Fehler beim Löschen des Locks" });
    }
  });

  router.post("/:year/:month/preview", async (req, res) => {
    try {
      const parsed = parseYearMonth(req, res);
      if (!parsed) return;
      const { seed } = req.body ?? {};
      const [input, locks] = await Promise.all([
        buildPlanningInput(parsed.year, parsed.month),
        getLocks(parsed.year, parsed.month),
      ]);
      const { output } = await buildPlanningOutput(input, locks, seed);
      res.json(output);
    } catch (error) {
      res.status(500).json({ error: "Fehler beim Erstellen der Vorschau" });
    }
  });

  router.post("/:year/:month/run", async (req, res) => {
    try {
      const parsed = parseYearMonth(req, res);
      if (!parsed) return;
      const { seed } = req.body ?? {};
      const [input, locks] = await Promise.all([
        buildPlanningInput(parsed.year, parsed.month),
        getLocks(parsed.year, parsed.month),
      ]);
      const { output, seed: runSeed } = await buildPlanningOutput(input, locks, seed);
      const hash = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      const userId = req.user?.employeeId;
      if (!userId) {
        return res.status(400).json({ error: "EmployeeId fehlt" });
      }
      await saveRun({
        year: parsed.year,
        month: parsed.month,
        inputHash: hash,
        inputJson: input,
        outputJson: output,
        engine: PLANNING_ENGINE,
        seed: runSeed,
        userId,
      });
      res.json(output);
    } catch (error) {
      res.status(500).json({ error: "Fehler beim Ausführen des Planning-Laufs" });
    }
  });
}
