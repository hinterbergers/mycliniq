import { and, desc, eq } from "drizzle-orm";
import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import { addDays, formatISO, parseISO, getISOWeek } from "date-fns";
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

const SOLVER_ROLES = ["gyn", "kreiszimmer", "turnus"];
const REQUIRED_SERVICE_ROLES = new Set(["gyn", "kreiszimmer"]);

type PlannerEmployeeState = {
  id: string;
  canRoleIds: Set<string>;
  banDates: Set<string>;
  banWeekdays: Set<number>;
  maxSlots: number;
  maxSlotsPerWeek: number;
  maxWeekendSlots: number;
  assignedCount: number;
  assignedPerWeek: Record<number, number>;
  assignedDates: Set<string>;
  assignedWeekends: number;
  preferences: {
    preferDates: Set<string>;
    avoidDates: Set<string>;
    preferServiceTypes: Set<string>;
    avoidServiceTypes: Set<string>;
  };
};

const buildEmployeeStates = (employees: Array<{ id: string; capabilities: { canRoleIds: string[] }; constraints: any }>) => {
  const states = new Map<string, PlannerEmployeeState>();
  for (const employee of employees) {
    const limits = employee.constraints?.limits ?? {};
    const hard = employee.constraints?.hard ?? {};
    const soft = employee.constraints?.soft ?? {};
    const maxSlots = Number.isFinite(limits?.maxSlotsInPeriod ?? NaN)
      ? limits.maxSlotsInPeriod
      : Number.MAX_SAFE_INTEGER;
    const maxSlotsPerWeek = Number.isFinite(limits?.maxSlotsPerIsoWeek ?? NaN)
      ? limits.maxSlotsPerIsoWeek
      : Number.MAX_SAFE_INTEGER;
    const maxWeekendSlots = Number.isFinite(
      limits?.maxWeekendSlotsInPeriod ?? NaN,
    )
      ? limits.maxWeekendSlotsInPeriod
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
    const preferences = {
      preferDates: new Set(normalizeStringArray(soft?.preferDates ?? [])),
      avoidDates: new Set(normalizeStringArray(soft?.avoidDates ?? [])),
      preferServiceTypes: new Set(
        normalizeStringArray(soft?.preferServiceTypes ?? []),
      ),
      avoidServiceTypes: new Set(
        normalizeStringArray(soft?.avoidServiceTypes ?? []),
      ),
    };

    states.set(employee.id, {
      id: employee.id,
      canRoleIds,
      banDates,
      banWeekdays,
      maxSlots: maxSlots > 0 ? maxSlots : Number.MAX_SAFE_INTEGER,
      maxSlotsPerWeek:
        maxSlotsPerWeek > 0 ? maxSlotsPerWeek : Number.MAX_SAFE_INTEGER,
      maxWeekendSlots:
        maxWeekendSlots > 0 ? maxWeekendSlots : Number.MAX_SAFE_INTEGER,
      assignedCount: 0,
      assignedPerWeek: {},
      assignedDates: new Set(),
      assignedWeekends: 0,
      preferences,
    });
  }
  return states;
};

const recordAssignment = (
  state: PlannerEmployeeState,
  slotDate: string,
  isoWeek: number,
  isWeekend: boolean,
) => {
  state.assignedCount += 1;
  state.assignedDates.add(slotDate);
  state.assignedPerWeek[isoWeek] = (state.assignedPerWeek[isoWeek] ?? 0) + 1;
  if (isWeekend) {
    state.assignedWeekends += 1;
  }
};

type PlanningAssignment = {
  slotId: string;
  employeeId: string;
  locked?: boolean;
};

type PlanningUnfilledSlot = {
  slotId: string;
  date: string;
  serviceType: string;
  reasonCodes: string[];
  candidatesBlockedBy: string[];
  blocksPublish: boolean;
};

const evaluateEmployeeForSlot = (
  state: PlannerEmployeeState,
  slot: { date: string; roleId: string; isWeekend?: boolean },
  slotDateObj: Date,
  isoWeek: number,
) => {
  const reasons = new Set<string>();
  if (!state.canRoleIds.has(slot.roleId)) {
    reasons.add("ROLE_NOT_ALLOWED");
  }
  if (state.banDates.has(slot.date)) {
    reasons.add("BAN_DATE");
  }
  const weekday = slotDateObj.getDay();
  if (state.banWeekdays.has(weekday)) {
    reasons.add("BAN_WEEKDAY");
  }
  if (state.assignedDates.has(slot.date)) {
    reasons.add("ALREADY_ASSIGNED");
  }
  const prevDate = formatISO(addDays(slotDateObj, -1), { representation: "date" });
  if (state.assignedDates.has(prevDate)) {
    reasons.add("CONSECUTIVE_DAY");
  }
  const nextDate = formatISO(addDays(slotDateObj, 1), { representation: "date" });
  if (state.assignedDates.has(nextDate)) {
    reasons.add("CONSECUTIVE_DAY");
  }
  if (state.assignedCount >= state.maxSlots) {
    reasons.add("MAX_SLOTS");
  }
  const weekCount = state.assignedPerWeek[isoWeek] ?? 0;
  if (weekCount >= state.maxSlotsPerWeek) {
    reasons.add("MAX_WEEK_SLOTS");
  }
  const isWeekend = Boolean(slot.isWeekend);
  if (isWeekend && state.assignedWeekends >= state.maxWeekendSlots) {
    reasons.add("MAX_WEEKEND_SLOTS");
  }
  return { ok: reasons.size === 0, reasons: Array.from(reasons) };
};

const scoreCandidateForSlot = (
  state: PlannerEmployeeState,
  slot: { date: string; roleId: string },
) => {
  let score = 0;
  if (state.preferences.preferDates.has(slot.date)) score += 100;
  if (state.preferences.avoidDates.has(slot.date)) score -= 100;
  if (state.preferences.preferServiceTypes.has(slot.roleId)) score += 30;
  if (state.preferences.avoidServiceTypes.has(slot.roleId)) score -= 30;
  score -= state.assignedCount * 0.5;
  return score;
};

const createAssignments = (
  input: any,
  locks: RosterPlanningLock[],
  fixedPreferredEmployees: number[],
) => {
  const employeeStates = buildEmployeeStates(input.employees);
  const assignments: PlanningAssignment[] = [];
  const violations: Array<{
    code: string;
    hard: boolean;
    message: string;
    slotId?: string;
    employeeId?: string;
  }> = [];
  const unfilledSlots: PlanningUnfilledSlot[] = [];
  const lockMap = new Map(locks.map((lock) => [lock.slotId, lock]));
  const assignedSlotIds = new Set<string>();

  for (const slot of input.slots) {
    const lock = lockMap.get(slot.id);
    if (!lock) continue;
    if (lock.employeeId === null) {
      assignedSlotIds.add(slot.id);
      unfilledSlots.push({
        slotId: slot.id,
        date: slot.date,
        serviceType: slot.roleId,
        reasonCodes: ["LOCKED_EMPTY"],
        candidatesBlockedBy: ["LOCKED_EMPTY"],
        blocksPublish: REQUIRED_SERVICE_ROLES.has(slot.roleId),
      });
      continue;
    }
    const employeeId = String(lock.employeeId);
    const employeeState = employeeStates.get(employeeId);
    if (!employeeState) {
      violations.push({
        code: "LOCK_INVALID_EMPLOYEE",
        hard: true,
        slotId: slot.id,
        employeeId,
        message: `Lock references missing employee ${employeeId}`,
      });
      unfilledSlots.push({
        slotId: slot.id,
        date: slot.date,
        serviceType: slot.roleId,
        reasonCodes: ["LOCKED_INVALID_EMPLOYEE"],
        candidatesBlockedBy: ["LOCKED_INVALID_EMPLOYEE"],
        blocksPublish: REQUIRED_SERVICE_ROLES.has(slot.roleId),
      });
      continue;
    }
    const slotDateObj = parseISO(slot.date);
    const isoWeek = getISOWeek(slotDateObj);
    recordAssignment(
      employeeState,
      slot.date,
      isoWeek,
      Boolean(slot.isWeekend),
    );
    assignments.push({ slotId: slot.id, employeeId, locked: true });
    assignedSlotIds.add(slot.id);
  }

  const slotsByDate = new Map<string, any[]>();
  for (const slot of input.slots) {
    if (!SOLVER_ROLES.includes(slot.roleId)) continue;
    const existing = slotsByDate.get(slot.date) ?? [];
    existing.push(slot);
    slotsByDate.set(slot.date, existing);
  }

  for (const employeeId of fixedPreferredEmployees ?? []) {
    const state = employeeStates.get(String(employeeId));
    if (!state) continue;
    const preferredDates = Array.from(state.preferences.preferDates).sort();
    for (const date of preferredDates) {
      const daySlots = slotsByDate.get(date);
      if (!daySlots || daySlots.length === 0) continue;
      const fallbackRoles = SOLVER_ROLES.filter((role) =>
        state.canRoleIds.has(role),
      );
      const preferenceRoles =
        state.preferences.preferServiceTypes.size === 1
          ? Array.from(state.preferences.preferServiceTypes)
          : fallbackRoles;
      const candidateRoles = preferenceRoles
        .filter((role) => state.canRoleIds.has(role))
        .sort(
          (a, b) => SOLVER_ROLES.indexOf(a) - SOLVER_ROLES.indexOf(b),
        );
      const normalizedRoles = candidateRoles.length
        ? candidateRoles
        : fallbackRoles;
      if (!normalizedRoles.length) continue;

      let assignedFixed = false;
      const failureReasons = new Set<string>();
      let attemptedSlot: any | null = null;
      for (const role of normalizedRoles) {
        const slotToTry = daySlots.find(
          (slot) => slot.roleId === role && !assignedSlotIds.has(slot.id),
        );
        if (!slotToTry) continue;
        attemptedSlot = slotToTry;
        const slotDateObj = parseISO(slotToTry.date);
        const isoWeek = getISOWeek(slotDateObj);
        const evaluation = evaluateEmployeeForSlot(
          state,
          slotToTry,
          slotDateObj,
          isoWeek,
        );
        if (evaluation.ok) {
          recordAssignment(
            state,
            slotToTry.date,
            isoWeek,
            Boolean(slotToTry.isWeekend),
          );
          assignments.push({
            slotId: slotToTry.id,
            employeeId: state.id,
            locked: true,
          });
          assignedSlotIds.add(slotToTry.id);
          assignedFixed = true;
          break;
        }
        evaluation.reasons.forEach((reason) => failureReasons.add(reason));
      }

      if (!assignedFixed && attemptedSlot) {
        unfilledSlots.push({
          slotId: attemptedSlot.id,
          date,
          serviceType: attemptedSlot.roleId,
          reasonCodes: ["FIX_PREFERRED_CONFLICT"],
          candidatesBlockedBy:
            failureReasons.size > 0
              ? Array.from(failureReasons)
              : ["FIX_PREFERRED_CONFLICT"],
          blocksPublish: REQUIRED_SERVICE_ROLES.has(attemptedSlot.roleId),
        });
      }
    }
  }

  for (const slot of input.slots) {
    if (!SOLVER_ROLES.includes(slot.roleId)) continue;
    if (assignedSlotIds.has(slot.id)) continue;
    const slotDateObj = parseISO(slot.date);
    const isoWeek = getISOWeek(slotDateObj);
    const failureReasons = new Set<string>();
    const candidates: Array<{
      state: PlannerEmployeeState;
      score: number;
    }> = [];

    for (const employeeState of employeeStates.values()) {
      const evaluation = evaluateEmployeeForSlot(
        employeeState,
        slot,
        slotDateObj,
        isoWeek,
      );
      if (!evaluation.ok) {
        evaluation.reasons.forEach((reason) => failureReasons.add(reason));
        continue;
      }
      candidates.push({
        state: employeeState,
        score: scoreCandidateForSlot(employeeState, slot),
      });
    }

    if (!candidates.length) {
      unfilledSlots.push({
        slotId: slot.id,
        date: slot.date,
        serviceType: slot.roleId,
        reasonCodes: ["NO_CANDIDATE"],
        candidatesBlockedBy:
          failureReasons.size > 0
            ? Array.from(failureReasons)
            : ["NO_CANDIDATE"],
        blocksPublish: REQUIRED_SERVICE_ROLES.has(slot.roleId),
      });
      violations.push({
        code: "NO_CANDIDATE",
        hard: false,
        slotId: slot.id,
        message: "Keine passende Ressource gefunden",
      });
      continue;
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.state.assignedCount !== b.state.assignedCount) {
        return a.state.assignedCount - b.state.assignedCount;
      }
      return a.state.id.localeCompare(b.state.id);
    });
    const winner = candidates[0];
    recordAssignment(
      winner.state,
      slot.date,
      isoWeek,
      Boolean(slot.isWeekend),
    );
    assignments.push({ slotId: slot.id, employeeId: winner.state.id });
    assignedSlotIds.add(slot.id);
  }

  const requiredSlotCount = input.slots.filter((slot: any) =>
    REQUIRED_SERVICE_ROLES.has(slot.roleId),
  ).length;
  const filledRequiredCount = assignments.filter((assignment) => {
    const slot = input.slots.find((s: any) => s.id === assignment.slotId);
    return slot && REQUIRED_SERVICE_ROLES.has(slot.roleId);
  }).length;

  const summary = {
    score: requiredSlotCount
      ? filledRequiredCount / requiredSlotCount
      : 1,
    coverage: {
      filled: filledRequiredCount,
      required: requiredSlotCount,
    },
  };

  return { assignments, violations, unfilledSlots, summary };
};

const buildPlanningOutput = async (
  input: any,
  locks: RosterPlanningLock[],
  fixedPreferredEmployees: number[],
  seed?: unknown,
) => {
  const resolvedSeed = resolveSeedValue(seed);
  const runSeed = Number.isFinite(resolvedSeed ?? NaN)
    ? (resolvedSeed as number)
    : Date.now();
  const result = createAssignments(
    input,
    locks,
    fixedPreferredEmployees ?? [],
  );
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
    publishAllowed: !result.unfilledSlots.some((slot) => slot.blocksPublish),
  };
  assertValidPlanningOutput(output);
  return { output, seed: runSeed };
};

export {
  evaluateEmployeeForSlot,
  scoreCandidateForSlot,
  createAssignments,
};
export type { PlannerEmployeeState };

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
      const [locks, latestRun, submittedCount, employees, rosterSettings] =
        await Promise.all([
          getLocks(parsed.year, parsed.month),
          getLatestRun(parsed.year, parsed.month),
          storage.getSubmittedWishesCount(parsed.year, parsed.month),
          storage.getEmployees(),
          storage.getRosterSettings(),
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
      res.json({
        submittedCount,
        missingCount,
        lastRunAt,
        isDirty,
        fixedPreferredEmployees: rosterSettings?.fixedPreferredEmployees ?? [],
      });
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
    const [input, locks, settings] = await Promise.all([
      buildPlanningInput(parsed.year, parsed.month),
      getLocks(parsed.year, parsed.month),
      storage.getRosterSettings(),
    ]);
    const fixedPreferredEmployees = settings?.fixedPreferredEmployees ?? [];
    const { output } = await buildPlanningOutput(
      input,
      locks,
      fixedPreferredEmployees,
      seed,
    );
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
    const [input, locks, settings] = await Promise.all([
      buildPlanningInput(parsed.year, parsed.month),
      getLocks(parsed.year, parsed.month),
      storage.getRosterSettings(),
    ]);
    const fixedPreferredEmployees = settings?.fixedPreferredEmployees ?? [];
    const { output, seed: runSeed } = await buildPlanningOutput(
      input,
      locks,
      fixedPreferredEmployees,
      seed,
    );
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
