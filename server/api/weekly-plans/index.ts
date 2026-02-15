import type { Router } from "express";
import { z } from "zod";
import { db, eq, and, asc, inArray, gte, lte, ne } from "../../lib/db";
import { addDays, format, startOfWeek } from "date-fns";
import {
  ok,
  created,
  notFound,
  validationError,
  error,
  asyncHandler,
} from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import {
  weeklyPlans,
  weeklyPlanAssignments,
  rooms,
  employees,
  dutyDays,
  dutySlots,
  dutyAssignments,
  roomWeekdaySettings,
  roomRequiredCompetencies,
  competencies,
  plannedAbsences,
  longTermAbsences,
  rosterShifts,
  rosterSettings,
} from "@shared/schema";

/**
 * Schema for creating a new weekly plan
 */
const createWeeklyPlanSchema = z.object({
  year: z.number().min(2020).max(2100),
  weekNumber: z.number().min(1).max(53),
  generatedFromDutyPlanId: z.number().positive().optional(),
  createdById: z.number().positive().optional(),
});

/**
 * Schema for status update
 */
const updateStatusSchema = z.object({
  status: z.enum(["Entwurf", "Vorläufig", "Freigegeben"]),
});

/**
 * Schema for creating an assignment
 */
const createAssignmentSchema = z
  .object({
    roomId: z.number().positive(),
    weekday: z.number().min(1).max(7),
    employeeId: z.number().positive().nullable().optional(),
    roleLabel: z.string().nullable().optional(),
    assignmentType: z
      .enum(["Plan", "Zeitausgleich", "Fortbildung"])
      .default("Plan"),
    note: z.string().nullable().optional(),
    isBlocked: z.boolean().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.employeeId) ||
      Boolean(data.note?.trim()) ||
      data.isBlocked === true,
    { message: "Zuweisung benötigt Mitarbeiter, Notiz oder Sperre." },
  );

const updateAssignmentSchema = z
  .object({
    employeeId: z.number().positive().nullable().optional(),
    roleLabel: z.string().nullable().optional(),
    assignmentType: z.enum(["Plan", "Zeitausgleich", "Fortbildung"]).optional(),
    note: z.string().nullable().optional(),
    isBlocked: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Keine Felder zum Aktualisieren angegeben.",
  });

const updateLockedWeekdaysSchema = z.object({
  lockedWeekdays: z.array(z.number().min(1).max(7)).default([]),
});

const weeklyPlanningRequestSchema = z.object({
  ruleProfile: z.unknown().optional(),
});

/**
 * Assignment ID param schema
 */
const assignmentIdParamSchema = z.object({
  assignmentId: z.string().regex(/^\d+$/).transform(Number),
});

function toDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function isWithinFullAccessWindow(emp: any, dateIso: string): boolean {
  if (!emp) return false;
  if (!dateIso) return false;
  const target = toDateOnly(dateIso);
  if (!target) return false;
  if (!emp.employmentFrom) return true;
  const start = toDateOnly(emp.employmentFrom);
  if (!start) return false;
  const fullUntil = addMonths(start, 3);
  fullUntil.setHours(0, 0, 0, 0);
  let fullAccessEnd = fullUntil;
  if (emp.employmentUntil) {
    const until = toDateOnly(emp.employmentUntil);
    if (until && until.getTime() < fullAccessEnd.getTime()) {
      fullAccessEnd = until;
    }
  }
  return (
    target.getTime() >= start.getTime() &&
    target.getTime() <= fullAccessEnd.getTime()
  );
}

type WeeklyRuleProfile = {
  version: 1;
  updatedAt: string;
  globalHardRules: {
    afterDutyBlocked: boolean;
    absenceBlocked: boolean;
    longTermAbsenceBlocked: boolean;
    roomClosedBlocked: boolean;
    requireDutyPlanCoverage: boolean;
  };
  employeeRules: Array<{
    employeeId: number;
    priorityAreaIds: number[];
    forbiddenAreaIds: number[];
  }>;
};

type WeeklyPlanningResult = {
  meta: {
    year: number;
    week: number;
    from: string;
    to: string;
  };
  profile: WeeklyRuleProfile;
  stats: {
    generatedAssignments: number;
    existingAssignments: number;
    unfilledSlots: number;
    hardConflicts: number;
    softConflicts: number;
  };
  generatedAssignments: Array<{
    slotId: string;
    date: string;
    weekday: number;
    roomId: number;
    roomName: string;
    employeeId: number;
    employeeName: string;
    score: number;
  }>;
  unfilledSlots: Array<{
    slotId: string;
    date: string;
    weekday: number;
    roomId: number;
    roomName: string;
    reasonCodes: string[];
    candidatesBlockedBy: string[];
    blocksPublish: boolean;
  }>;
  violations: Array<{
    code: string;
    hard: boolean;
    message: string;
    date?: string;
    roomId?: number;
  }>;
  publishAllowed: boolean;
};

const DEFAULT_WEEKLY_RULE_PROFILE: WeeklyRuleProfile = {
  version: 1,
  updatedAt: new Date().toISOString(),
  globalHardRules: {
    afterDutyBlocked: true,
    absenceBlocked: true,
    longTermAbsenceBlocked: true,
    roomClosedBlocked: true,
    requireDutyPlanCoverage: true,
  },
  employeeRules: [],
};

const normalizeIdList = (value: unknown, maxLength?: number): number[] => {
  if (!Array.isArray(value)) return [];
  const out = Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry > 0),
    ),
  );
  return typeof maxLength === "number" ? out.slice(0, maxLength) : out;
};

const normalizeWeeklyRuleProfile = (value: unknown): WeeklyRuleProfile => {
  if (!value || typeof value !== "object") return DEFAULT_WEEKLY_RULE_PROFILE;
  const raw = value as Partial<WeeklyRuleProfile>;
  const hard = raw.globalHardRules ?? DEFAULT_WEEKLY_RULE_PROFILE.globalHardRules;
  return {
    version: 1,
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    globalHardRules: {
      afterDutyBlocked:
        hard.afterDutyBlocked ??
        DEFAULT_WEEKLY_RULE_PROFILE.globalHardRules.afterDutyBlocked,
      absenceBlocked:
        hard.absenceBlocked ??
        DEFAULT_WEEKLY_RULE_PROFILE.globalHardRules.absenceBlocked,
      longTermAbsenceBlocked:
        hard.longTermAbsenceBlocked ??
        DEFAULT_WEEKLY_RULE_PROFILE.globalHardRules.longTermAbsenceBlocked,
      roomClosedBlocked:
        hard.roomClosedBlocked ??
        DEFAULT_WEEKLY_RULE_PROFILE.globalHardRules.roomClosedBlocked,
      requireDutyPlanCoverage:
        hard.requireDutyPlanCoverage ??
        DEFAULT_WEEKLY_RULE_PROFILE.globalHardRules.requireDutyPlanCoverage,
    },
    employeeRules: Array.isArray(raw.employeeRules)
      ? raw.employeeRules
          .map((rule) => ({
            employeeId: Number(rule.employeeId),
            priorityAreaIds: normalizeIdList(rule.priorityAreaIds, 3),
            forbiddenAreaIds: normalizeIdList(rule.forbiddenAreaIds),
          }))
          .filter((rule) => Number.isInteger(rule.employeeId) && rule.employeeId > 0)
      : [],
  };
};

const getWeekRangeFromUi = (year: number, week: number) => {
  const seed = new Date(year, 0, 1 + (week - 1) * 7);
  const start = startOfWeek(seed, { weekStartsOn: 1 });
  const end = addDays(start, 6);
  return {
    start,
    end,
    from: format(start, "yyyy-MM-dd"),
    to: format(end, "yyyy-MM-dd"),
  };
};

const normalizeText = (value?: string | null) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const getEmployeeRoleKeys = (role?: string | null): string[] => {
  const normalized = normalizeText(role);
  if (!normalized) return [];
  const keys: string[] = [];
  if (normalized.includes("primar")) keys.push("primararzt");
  if (
    normalized.includes("oberarzt") ||
    normalized.includes("facharzt") ||
    normalized.includes("funktionsoberarzt") ||
    normalized.includes("ausbildungsoberarzt")
  ) {
    keys.push("facharzt");
  }
  if (
    normalized.includes("assistenz") ||
    normalized.includes("turnus") ||
    normalized.includes("student")
  ) {
    keys.push("assistenzarzt");
  }
  if (normalized.includes("sekretar") || normalized.includes("sekreta")) {
    keys.push("sekretaerin");
  }
  return Array.from(new Set(keys));
};

const employeeMatchesRoleRules = (
  role?: string | null,
  required: string[] = [],
  alternative: string[] = [],
) => {
  const keys = getEmployeeRoleKeys(role);
  if (required.length > 0 && !required.every((value) => keys.includes(value))) {
    return false;
  }
  if (alternative.length > 0 && !alternative.some((value) => keys.includes(value))) {
    return false;
  }
  return true;
};

const weekdayOccurrence = (date: Date) => Math.floor((date.getDate() - 1) / 7) + 1;

const matchesRecurrence = (
  recurrence: "weekly" | "monthly_first_third" | "monthly_once" | null | undefined,
  date: Date,
) => {
  if (!recurrence || recurrence === "weekly") return true;
  const occurrence = weekdayOccurrence(date);
  if (recurrence === "monthly_first_third") return occurrence === 1 || occurrence === 3;
  if (recurrence === "monthly_once") return occurrence === 1;
  return true;
};

const weeklyYearWeekParamSchema = z.object({
  year: z.string().regex(/^\d+$/).transform(Number),
  week: z.string().regex(/^\d+$/).transform(Number),
});

const isMissingWeeklyRuleProfileColumnError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const maybeErr = error as { code?: string; message?: string };
  if (maybeErr.code === "42703") {
    return (maybeErr.message ?? "").toLowerCase().includes("weekly_rule_profile");
  }
  return (maybeErr.message ?? "").toLowerCase().includes("weekly_rule_profile");
};

/**
 * Weekly Plan (Wochenplan) API Routes
 * Base path: /api/weekly-plans
 */
export function registerWeeklyPlanRoutes(router: Router) {
  async function buildWeeklyPlanResponse(planId: number) {
    const [plan] = await db
      .select()
      .from(weeklyPlans)
      .where(eq(weeklyPlans.id, planId));

    if (!plan) {
      return null;
    }

    const assignments = await db
      .select({
        id: weeklyPlanAssignments.id,
        weeklyPlanId: weeklyPlanAssignments.weeklyPlanId,
        roomId: weeklyPlanAssignments.roomId,
        weekday: weeklyPlanAssignments.weekday,
        employeeId: weeklyPlanAssignments.employeeId,
        roleLabel: weeklyPlanAssignments.roleLabel,
        assignmentType: weeklyPlanAssignments.assignmentType,
        note: weeklyPlanAssignments.note,
        isBlocked: weeklyPlanAssignments.isBlocked,
        createdAt: weeklyPlanAssignments.createdAt,
        updatedAt: weeklyPlanAssignments.updatedAt,
        roomName: rooms.name,
        roomCategory: rooms.category,
        employeeName: employees.name,
        employeeLastName: employees.lastName,
        employeeRole: employees.role,
      })
      .from(weeklyPlanAssignments)
      .leftJoin(rooms, eq(weeklyPlanAssignments.roomId, rooms.id))
      .leftJoin(employees, eq(weeklyPlanAssignments.employeeId, employees.id))
      .where(eq(weeklyPlanAssignments.weeklyPlanId, planId))
      .orderBy(
        asc(weeklyPlanAssignments.weekday),
        asc(weeklyPlanAssignments.roomId),
        asc(weeklyPlanAssignments.id),
      );

    const assignmentsByWeekday: Record<number, typeof assignments> = {};
    for (let day = 1; day <= 7; day++) {
      assignmentsByWeekday[day] = assignments.filter((a) => a.weekday === day);
    }

    return {
      ...plan,
      assignments,
      assignmentsByWeekday,
      summary: {
        totalAssignments: assignments.length,
        monday: assignmentsByWeekday[1]?.length || 0,
        tuesday: assignmentsByWeekday[2]?.length || 0,
        wednesday: assignmentsByWeekday[3]?.length || 0,
        thursday: assignmentsByWeekday[4]?.length || 0,
        friday: assignmentsByWeekday[5]?.length || 0,
        saturday: assignmentsByWeekday[6]?.length || 0,
        sunday: assignmentsByWeekday[7]?.length || 0,
      },
    };
  }

  const computeWeeklyPlanningResult = async (
    yearNumber: number,
    weekNumber: number,
    options?: { ruleProfile?: unknown },
  ): Promise<WeeklyPlanningResult> => {
    const { from, to, start } = getWeekRangeFromUi(yearNumber, weekNumber);
    let settingsWeeklyRuleProfile: unknown = null;
    try {
      const [settings] = await db.select().from(rosterSettings).limit(1);
      settingsWeeklyRuleProfile = settings?.weeklyRuleProfile ?? null;
    } catch (loadError) {
      if (!isMissingWeeklyRuleProfileColumnError(loadError)) {
        throw loadError;
      }
    }
    const profile = normalizeWeeklyRuleProfile(
      options?.ruleProfile ?? settingsWeeklyRuleProfile ?? null,
    );

    const roomsList = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.useInWeeklyPlan, true), eq(rooms.isActive, true)))
      .orderBy(asc(rooms.weeklyPlanSortOrder), asc(rooms.name));
    const roomIds = roomsList.map((room) => room.id);

    const [plan] = await db
      .select()
      .from(weeklyPlans)
      .where(
        and(
          eq(weeklyPlans.year, yearNumber),
          eq(weeklyPlans.weekNumber, weekNumber),
        ),
      );

    const existingAssignments =
      plan && roomIds.length > 0
        ? await db
            .select()
            .from(weeklyPlanAssignments)
            .where(eq(weeklyPlanAssignments.weeklyPlanId, plan.id))
        : [];

    const weekdaySettings =
      roomIds.length > 0
        ? await db
            .select()
            .from(roomWeekdaySettings)
            .where(inArray(roomWeekdaySettings.roomId, roomIds))
        : [];

    const requiredCompetencyRows =
      roomIds.length > 0
        ? await db
            .select({
              roomId: roomRequiredCompetencies.roomId,
              relationType: roomRequiredCompetencies.relationType,
              competencyCode: competencies.code,
              competencyName: competencies.name,
            })
            .from(roomRequiredCompetencies)
            .leftJoin(
              competencies,
              eq(roomRequiredCompetencies.competencyId, competencies.id),
            )
            .where(inArray(roomRequiredCompetencies.roomId, roomIds))
        : [];

    const employeeRows = await db
      .select()
      .from(employees)
      .where(eq(employees.isActive, true));

    const plannedAbsenceRows = await db
      .select()
      .from(plannedAbsences)
      .where(
        and(
          lte(plannedAbsences.startDate, to),
          gte(plannedAbsences.endDate, from),
          ne(plannedAbsences.status, "Abgelehnt"),
        ),
      );

    const longTermAbsenceRows = await db
      .select()
      .from(longTermAbsences)
      .where(
        and(
          lte(longTermAbsences.startDate, to),
          gte(longTermAbsences.endDate, from),
          eq(longTermAbsences.status, "Genehmigt"),
        ),
      );

    const rosterRows = await db
      .select()
      .from(rosterShifts)
      .where(and(gte(rosterShifts.date, from), lte(rosterShifts.date, to)));

    const violations: WeeklyPlanningResult["violations"] = [];
    if (
      profile.globalHardRules.requireDutyPlanCoverage &&
      !rosterRows.some((row) => row.serviceType !== "overduty")
    ) {
      violations.push({
        code: "NO_DUTY_PLAN_IN_PERIOD",
        hard: true,
        message: "Kein Dienstplan im gewählten Zeitraum vorhanden.",
      });
    }

    const settingsByRoom = new Map<number, (typeof weekdaySettings)>();
    weekdaySettings.forEach((setting) => {
      const list = settingsByRoom.get(setting.roomId) ?? [];
      list.push(setting);
      settingsByRoom.set(setting.roomId, list);
    });

    const competenciesByRoom = new Map<number, (typeof requiredCompetencyRows)>();
    requiredCompetencyRows.forEach((entry) => {
      const list = competenciesByRoom.get(entry.roomId) ?? [];
      list.push(entry);
      competenciesByRoom.set(entry.roomId, list);
    });

    const existingBySlot = new Map<string, (typeof existingAssignments)>();
    existingAssignments.forEach((assignment) => {
      const key = `${assignment.weekday}-${assignment.roomId}`;
      const list = existingBySlot.get(key) ?? [];
      list.push(assignment);
      existingBySlot.set(key, list);
    });

    const existingCountByEmployee = new Map<number, number>();
    existingAssignments.forEach((assignment) => {
      if (!assignment.employeeId) return;
      existingCountByEmployee.set(
        assignment.employeeId,
        (existingCountByEmployee.get(assignment.employeeId) ?? 0) + 1,
      );
    });
    const existingWeekdaysByEmployee = new Map<number, Set<number>>();
    existingAssignments.forEach((assignment) => {
      if (!assignment.employeeId) return;
      const weekdays = existingWeekdaysByEmployee.get(assignment.employeeId) ?? new Set<number>();
      weekdays.add(assignment.weekday);
      existingWeekdaysByEmployee.set(assignment.employeeId, weekdays);
    });

    const employeeRulesById = new Map(
      profile.employeeRules.map((rule) => [rule.employeeId, rule]),
    );

    const plannedAbsencesByEmployee = new Map<number, (typeof plannedAbsenceRows)>();
    plannedAbsenceRows.forEach((absence) => {
      const list = plannedAbsencesByEmployee.get(absence.employeeId) ?? [];
      list.push(absence);
      plannedAbsencesByEmployee.set(absence.employeeId, list);
    });

    const longTermAbsencesByEmployee = new Map<number, (typeof longTermAbsenceRows)>();
    longTermAbsenceRows.forEach((absence) => {
      const list = longTermAbsencesByEmployee.get(absence.employeeId) ?? [];
      list.push(absence);
      longTermAbsencesByEmployee.set(absence.employeeId, list);
    });

    const rosterByEmployee = new Map<number, (typeof rosterRows)>();
    rosterRows.forEach((shift) => {
      if (!shift.employeeId) return;
      const list = rosterByEmployee.get(shift.employeeId) ?? [];
      list.push(shift);
      rosterByEmployee.set(shift.employeeId, list);
    });

    const activeEmployees = employeeRows.filter((employee) => {
      const roleNorm = normalizeText(employee.role);
      return !roleNorm.includes("sekret");
    });

    const unfilledSlots: WeeklyPlanningResult["unfilledSlots"] = [];
    const generatedAssignments: WeeklyPlanningResult["generatedAssignments"] = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const day = addDays(start, offset);
      const dayDate = format(day, "yyyy-MM-dd");
      const weekday = day.getDay() === 0 ? 7 : day.getDay();
      const previousDate = format(addDays(day, -1), "yyyy-MM-dd");

      if (plan?.lockedWeekdays?.includes(weekday)) continue;

      const dayRooms = roomsList
        .map((room) => {
          const setting =
            settingsByRoom
              .get(room.id)
              ?.find(
                (entry) =>
                  entry.weekday === weekday &&
                  matchesRecurrence(entry.recurrence, day),
              ) ?? null;
          return { room, setting };
        })
        .filter((entry) => Boolean(entry.setting));

      for (const { room, setting } of dayRooms) {
        if (!setting) continue;
        if (setting.isClosed && profile.globalHardRules.roomClosedBlocked) continue;

        const slotId = `${dayDate}-${room.id}`;
        const slotKey = `${weekday}-${room.id}`;
        const existing = existingBySlot.get(slotKey) ?? [];
        const hasBlocked = existing.some(
          (assignment) => assignment.isBlocked && !assignment.employeeId,
        );
        const hasEmployee = existing.some((assignment) => Boolean(assignment.employeeId));
        if (hasBlocked) {
          unfilledSlots.push({
            slotId,
            date: dayDate,
            weekday,
            roomId: room.id,
            roomName: room.name,
            reasonCodes: ["LOCKED_EMPTY"],
            candidatesBlockedBy: ["LOCKED_EMPTY"],
            blocksPublish: false,
          });
          continue;
        }
        if (hasEmployee) continue;

        const requiredCompetencies = competenciesByRoom.get(room.id) ?? [];
        const reasonPool = new Set<string>();

        const candidates = activeEmployees
          .map((employee) => {
            const reasons = new Set<string>();
            const rule = employeeRulesById.get(employee.id);
            if (rule?.forbiddenAreaIds.includes(room.id)) {
              reasons.add("FORBIDDEN_AREA");
            }

            if (
              existingWeekdaysByEmployee.get(employee.id)?.has(weekday) ||
              generatedAssignments.some(
                (entry) =>
                  entry.employeeId === employee.id && entry.weekday === weekday,
              )
            ) {
              reasons.add("ALREADY_ASSIGNED_SAME_TIME");
            }

            if (
              profile.globalHardRules.absenceBlocked &&
              (plannedAbsencesByEmployee.get(employee.id) ?? []).some(
                (absence) => absence.startDate <= dayDate && absence.endDate >= dayDate,
              )
            ) {
              reasons.add("ABSENCE_BLOCKED");
            }

            if (
              profile.globalHardRules.longTermAbsenceBlocked &&
              (longTermAbsencesByEmployee.get(employee.id) ?? []).some(
                (absence) => absence.startDate <= dayDate && absence.endDate >= dayDate,
              )
            ) {
              reasons.add("LONG_TERM_ABSENCE_BLOCKED");
            }

            if (
              profile.globalHardRules.afterDutyBlocked &&
              (rosterByEmployee.get(employee.id) ?? []).some(
                (shift) =>
                  shift.date === previousDate && shift.serviceType !== "overduty",
              )
            ) {
              reasons.add("AFTER_DUTY_BLOCKED");
            }

            if (
              !employeeMatchesRoleRules(
                employee.role,
                room.requiredRoleCompetencies ?? [],
                room.alternativeRoleCompetencies ?? [],
              )
            ) {
              reasons.add("MISSING_REQUIRED_ROLE");
            }

            if (requiredCompetencies.length > 0) {
              const employeeSkills = (employee.competencies ?? []).map((value) =>
                normalizeText(value),
              );
              const hasSkill = (value?: string | null) =>
                value ? employeeSkills.includes(normalizeText(value)) : false;

              const andRules = requiredCompetencies.filter(
                (entry) => entry.relationType === "AND",
              );
              const orRules = requiredCompetencies.filter(
                (entry) => entry.relationType === "OR",
              );
              if (
                andRules.some(
                  (entry) =>
                    !hasSkill(entry.competencyCode) &&
                    !hasSkill(entry.competencyName),
                )
              ) {
                reasons.add("MISSING_REQUIRED_SKILL");
              }
              if (
                orRules.length > 0 &&
                !orRules.some(
                  (entry) =>
                    hasSkill(entry.competencyCode) || hasSkill(entry.competencyName),
                )
              ) {
                reasons.add("MISSING_REQUIRED_SKILL");
              }
            }

            if (
              employee.inactiveFrom &&
              employee.inactiveFrom <= dayDate &&
              (!employee.inactiveUntil || employee.inactiveUntil >= dayDate)
            ) {
              reasons.add("EMPLOYEE_INACTIVE");
            }

            if (reasons.size > 0) {
              reasons.forEach((reason) => reasonPool.add(reason));
              return null;
            }

            const priorityIds = rule?.priorityAreaIds ?? [];
            const priorityIndex = priorityIds.indexOf(room.id);
            const priorityScore =
              priorityIndex === 0 ? 300 : priorityIndex === 1 ? 200 : priorityIndex === 2 ? 100 : 10;
            const assignedCount =
              (existingCountByEmployee.get(employee.id) ?? 0) +
              generatedAssignments.filter((entry) => entry.employeeId === employee.id).length;
            const score = priorityScore - assignedCount * 15;
            return { employee, score, priorityScore };
          })
          .filter((entry): entry is { employee: (typeof activeEmployees)[number]; score: number; priorityScore: number } => Boolean(entry));

        if (!candidates.length) {
          unfilledSlots.push({
            slotId,
            date: dayDate,
            weekday,
            roomId: room.id,
            roomName: room.name,
            reasonCodes: ["NO_ELIGIBLE_CANDIDATE"],
            candidatesBlockedBy:
              reasonPool.size > 0 ? Array.from(reasonPool) : ["NO_ELIGIBLE_CANDIDATE"],
            blocksPublish: true,
          });
          continue;
        }

        candidates.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const aName = `${a.employee.lastName ?? ""} ${a.employee.firstName ?? ""}`;
          const bName = `${b.employee.lastName ?? ""} ${b.employee.firstName ?? ""}`;
          return aName.localeCompare(bName, "de");
        });
        const winner = candidates[0];
        if (winner.priorityScore <= 10) {
          violations.push({
            code: "LOW_PRIORITY_AREA_MATCH",
            hard: false,
            message: `${winner.employee.lastName ?? winner.employee.name} wurde außerhalb Top-3 zugeteilt`,
            date: dayDate,
            roomId: room.id,
          });
        }
        generatedAssignments.push({
          slotId,
          date: dayDate,
          weekday,
          roomId: room.id,
          roomName: room.name,
          employeeId: winner.employee.id,
          employeeName:
            winner.employee.lastName ||
            winner.employee.name ||
            `Mitarbeiter ${winner.employee.id}`,
          score: winner.score,
        });
      }
    }

    const hardConflicts =
      unfilledSlots.filter((slot) => slot.blocksPublish).length +
      violations.filter((violation) => violation.hard).length;
    const softConflicts = violations.filter((violation) => !violation.hard).length;

    return {
      meta: {
        year: yearNumber,
        week: weekNumber,
        from,
        to,
      },
      profile,
      stats: {
        generatedAssignments: generatedAssignments.length,
        existingAssignments: existingAssignments.filter((entry) => entry.employeeId).length,
        unfilledSlots: unfilledSlots.length,
        hardConflicts,
        softConflicts,
      },
      generatedAssignments,
      unfilledSlots,
      violations,
      publishAllowed: hardConflicts === 0,
    };
  };

  /**
   * GET /api/weekly-plans
   * Get all weekly plans (optionally filtered by year/week/status)
   */
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { year, week, status } = req.query;

      let result = await db.select().from(weeklyPlans);

      // Apply filters
      if (year) {
        result = result.filter((p) => p.year === Number(year));
      }

      if (week) {
        result = result.filter((p) => p.weekNumber === Number(week));
      }

      if (status) {
        result = result.filter((p) => p.status === status);
      }

      return ok(res, result);
    }),
  );

  /**
   * GET /api/weekly-plans/:id
   * Get weekly plan with all assignments
   */
  router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);

      const planData = await buildWeeklyPlanResponse(planId);
      if (!planData) {
        return notFound(res, "Wochenplan");
      }

      return ok(res, planData);
    }),
  );

  /**
   * GET /api/weekly-plans/week/:year/:week
   * Get weekly plan for specific week
   */
  router.get(
    "/week/:year/:week",
    asyncHandler(async (req, res) => {
      const { year, week } = req.params;
      const createIfMissing = req.query.createIfMissing === "true";
      const yearNumber = Number(year);
      const weekNumber = Number(week);

      let [plan] = await db
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.year, yearNumber),
            eq(weeklyPlans.weekNumber, weekNumber),
          ),
        );

      if (!plan) {
        if (!createIfMissing) {
          return notFound(res, "Wochenplan");
        }

        const [createdPlan] = await db
          .insert(weeklyPlans)
          .values({
            year: yearNumber,
            weekNumber,
            status: "Entwurf",
            createdById: req.user?.employeeId ?? null,
          })
          .returning();

        plan = createdPlan;
      }

      const planData = await buildWeeklyPlanResponse(plan.id);
      if (!planData) {
        return notFound(res, "Wochenplan");
      }

      return ok(res, planData);
    }),
  );

  /**
   * POST /api/weekly-plans/week/:year/:week/preview
   * Build weekly planning suggestion without persisting assignments
   */
  router.post(
    "/week/:year/:week/preview",
    validateParams(weeklyYearWeekParamSchema),
    validateBody(weeklyPlanningRequestSchema),
    asyncHandler(async (req, res) => {
      const { year, week } = req.params;
      const yearNumber = Number(year);
      const weekNumber = Number(week);

      const result = await computeWeeklyPlanningResult(yearNumber, weekNumber, {
        ruleProfile: req.body?.ruleProfile,
      });

      return ok(res, result);
    }),
  );

  /**
   * POST /api/weekly-plans/week/:year/:week/run
   * Build and apply weekly planning suggestion
   */
  router.post(
    "/week/:year/:week/run",
    validateParams(weeklyYearWeekParamSchema),
    validateBody(weeklyPlanningRequestSchema),
    asyncHandler(async (req, res) => {
      const { year, week } = req.params;
      const yearNumber = Number(year);
      const weekNumber = Number(week);

      let [plan] = await db
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.year, yearNumber),
            eq(weeklyPlans.weekNumber, weekNumber),
          ),
        );

      if (!plan) {
        const [createdPlan] = await db
          .insert(weeklyPlans)
          .values({
            year: yearNumber,
            weekNumber,
            status: "Entwurf",
            createdById: req.user?.employeeId ?? null,
          })
          .returning();
        plan = createdPlan;
      }

      if (plan.status === "Freigegeben") {
        return validationError(
          res,
          "Freigegebener Wochenplan kann nicht automatisch überschrieben werden.",
        );
      }

      const result = await computeWeeklyPlanningResult(yearNumber, weekNumber, {
        ruleProfile: req.body?.ruleProfile,
      });

      const existingAssignments = await db
        .select()
        .from(weeklyPlanAssignments)
        .where(eq(weeklyPlanAssignments.weeklyPlanId, plan.id));
      const existingSlotKeys = new Set(
        existingAssignments
          .filter((assignment) => assignment.employeeId || assignment.isBlocked)
          .map((assignment) => `${assignment.weekday}-${assignment.roomId}`),
      );

      const rowsToInsert = result.generatedAssignments
        .filter(
          (assignment) =>
            !existingSlotKeys.has(`${assignment.weekday}-${assignment.roomId}`),
        )
        .map((assignment) => ({
          weeklyPlanId: plan.id,
          roomId: assignment.roomId,
          weekday: assignment.weekday,
          employeeId: assignment.employeeId,
          assignmentType: "Plan" as const,
          roleLabel: null,
          note: null,
          isBlocked: false,
        }));

      if (rowsToInsert.length > 0) {
        await db.insert(weeklyPlanAssignments).values(rowsToInsert);
      }

      const planData = await buildWeeklyPlanResponse(plan.id);
      if (!planData) {
        return notFound(res, "Wochenplan");
      }

      return ok(res, {
        plan: planData,
        result,
        appliedAssignments: rowsToInsert.length,
      });
    }),
  );

  /**
   * POST /api/weekly-plans
   * Create new weekly plan
   */
  router.post(
    "/",
    validateBody(createWeeklyPlanSchema),
    asyncHandler(async (req, res) => {
      const { year, weekNumber, generatedFromDutyPlanId, createdById } =
        req.body;

      // Check if plan already exists for this week
      const [existing] = await db
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.year, year),
            eq(weeklyPlans.weekNumber, weekNumber),
          ),
        );

      if (existing) {
        return error(
          res,
          `Wochenplan für KW ${weekNumber}/${year} existiert bereits`,
          409,
        );
      }

      // Create the weekly plan
      const [plan] = await db
        .insert(weeklyPlans)
        .values({
          year,
          weekNumber,
          status: "Entwurf",
          generatedFromDutyPlanId: generatedFromDutyPlanId || null,
          createdById: createdById || null,
        })
        .returning();

      return created(res, {
        ...plan,
        message: `Wochenplan für KW ${weekNumber}/${year} erstellt`,
      });
    }),
  );

  /**
   * POST /api/weekly-plans/:id/assign
   * Add a new assignment to the weekly plan
   * Body: { roomId, weekday, employeeId, roleLabel, assignmentType }
   */
  router.post(
    "/:id/assign",
    validateParams(idParamSchema),
    validateBody(createAssignmentSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      const {
        roomId,
        weekday,
        employeeId,
        roleLabel,
        assignmentType,
        note,
        isBlocked,
      } = req.body;

      // Verify plan exists
      const [plan] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));
      if (!plan) {
        return notFound(res, "Wochenplan");
      }

      // Verify room exists
      const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
      if (!room) {
        return notFound(res, "Raum");
      }

      let employee = null;
      if (employeeId) {
        [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, employeeId));
        if (!employee) {
          return notFound(res, "Mitarbeiter");
        }
      }

      // Create new assignment (duplicates allowed)
      const [assignment] = await db
        .insert(weeklyPlanAssignments)
        .values({
          weeklyPlanId: planId,
          roomId,
          weekday,
          employeeId: employeeId ?? null,
          roleLabel: roleLabel || null,
          assignmentType: assignmentType || "Plan",
          note: note?.trim() || null,
          isBlocked: Boolean(isBlocked),
        })
        .returning();

      return created(res, {
        ...assignment,
        roomName: room.name,
        roomCategory: room.category,
        employeeName: employee?.name ?? null,
        employeeLastName: employee?.lastName ?? null,
      });
    }),
  );

  /**
   * PATCH /api/weekly-plans/assignments/:assignmentId
   * Update an assignment (note/block/employee)
   */
  router.patch(
    "/assignments/:assignmentId",
    validateParams(assignmentIdParamSchema),
    validateBody(updateAssignmentSchema),
    asyncHandler(async (req, res) => {
      const { assignmentId } = req.params;
      const assignmentIdNum = Number(assignmentId);
      const { employeeId, roleLabel, assignmentType, note, isBlocked } =
        req.body;

      const [existing] = await db
        .select()
        .from(weeklyPlanAssignments)
        .where(eq(weeklyPlanAssignments.id, assignmentIdNum));

      if (!existing) {
        return notFound(res, "Zuweisung");
      }

      let employee = null;
      if (employeeId !== undefined && employeeId !== null) {
        [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, employeeId));
        if (!employee) {
          return notFound(res, "Mitarbeiter");
        }
      }

      const nextEmployeeId =
        employeeId === undefined ? existing.employeeId : employeeId;
      const nextNote =
        note === undefined ? existing.note : note?.trim() || null;
      const nextIsBlocked = isBlocked ?? existing.isBlocked;

      if (!nextEmployeeId && !nextNote && !nextIsBlocked) {
        return validationError(
          res,
          "Leere Zuweisung ist nicht erlaubt. Bitte löschen statt leeren.",
        );
      }

      const [updated] = await db
        .update(weeklyPlanAssignments)
        .set({
          employeeId: nextEmployeeId,
          roleLabel: roleLabel ?? existing.roleLabel,
          assignmentType: assignmentType ?? existing.assignmentType,
          note: nextNote,
          isBlocked: nextIsBlocked,
          updatedAt: new Date(),
        })
        .where(eq(weeklyPlanAssignments.id, assignmentIdNum))
        .returning();

      return ok(res, {
        ...updated,
        employeeName: employee?.name ?? null,
        employeeLastName: employee?.lastName ?? null,
      });
    }),
  );

  /**
   * PUT /api/weekly-plans/:id/status
   * Update weekly plan status with validation
   * Allowed transitions:
   *   'Entwurf' -> 'Vorläufig'
   *   'Entwurf' -> 'Freigegeben'
   *   'Vorläufig' -> 'Freigegeben'
   *   'Vorläufig' -> 'Entwurf' (Rücksetzen)
   *   'Freigegeben' -> 'Entwurf' (erneute Bearbeitung)
   */
  router.put(
    "/:id/status",
    validateParams(idParamSchema),
    validateBody(updateStatusSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      const { status } = req.body;

      // Get current plan
      const [existing] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));

      if (!existing) {
        return notFound(res, "Wochenplan");
      }

      // Validate status transitions
      const currentStatus = existing.status;
      const allowedTransitions: Record<string, string[]> = {
        Entwurf: ["Vorläufig", "Freigegeben"],
        Vorläufig: ["Freigegeben", "Entwurf"],
        Freigegeben: ["Entwurf"],
      };

      if (
        status !== currentStatus &&
        !allowedTransitions[currentStatus]?.includes(status)
      ) {
        return validationError(
          res,
          `Statuswechsel von '${currentStatus}' nach '${status}' nicht erlaubt. ` +
            `Erlaubt: ${allowedTransitions[currentStatus]?.join(", ") || "keine"}`,
        );
      }

      // Update the plan
      const [plan] = await db
        .update(weeklyPlans)
        .set({ status, updatedAt: new Date() })
        .where(eq(weeklyPlans.id, planId))
        .returning();

      return ok(res, plan);
    }),
  );

  /**
   * PUT /api/weekly-plans/:id/locked-weekdays
   * Set locked weekdays for a plan (1-7)
   */
  router.put(
    "/:id/locked-weekdays",
    validateParams(idParamSchema),
    validateBody(updateLockedWeekdaysSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      // Ensure proper runtime validation + correct TypeScript type (number[])
      const { lockedWeekdays } = updateLockedWeekdaysSchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));
      if (!existing) {
        return notFound(res, "Wochenplan");
      }

      const uniqueLocked = Array.from(new Set(lockedWeekdays)).sort(
        (a, b) => a - b,
      );
      const [updated] = await db
        .update(weeklyPlans)
        .set({ lockedWeekdays: uniqueLocked, updatedAt: new Date() })
        .where(eq(weeklyPlans.id, planId))
        .returning();

      return ok(res, updated);
    }),
  );

  /**
   * DELETE /api/weekly-plans/assignments/:assignmentId
   * Remove an assignment from a weekly plan
   */
  router.delete(
    "/assignments/:assignmentId",
    validateParams(assignmentIdParamSchema),
    asyncHandler(async (req, res) => {
      const { assignmentId } = req.params;
      const assignmentIdNum = Number(assignmentId);

      // Verify assignment exists
      const [assignment] = await db
        .select()
        .from(weeklyPlanAssignments)
        .where(eq(weeklyPlanAssignments.id, assignmentIdNum));

      if (!assignment) {
        return notFound(res, "Zuweisung");
      }

      // Delete assignment
      await db
        .delete(weeklyPlanAssignments)
        .where(eq(weeklyPlanAssignments.id, assignmentIdNum));

      return ok(res, {
        deleted: true,
        id: assignmentIdNum,
        message: "Zuweisung entfernt",
      });
    }),
  );

  /**
   * GET /api/weekly-plans/:id/assignments
   * Get all assignments for a weekly plan
   */
  router.get(
    "/:id/assignments",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      const { weekday, roomId } = req.query;

      // Verify plan exists
      const [plan] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));
      if (!plan) {
        return notFound(res, "Wochenplan");
      }

      // Get assignments with filters
      let assignments = await db
        .select({
          id: weeklyPlanAssignments.id,
          weeklyPlanId: weeklyPlanAssignments.weeklyPlanId,
          roomId: weeklyPlanAssignments.roomId,
          weekday: weeklyPlanAssignments.weekday,
          employeeId: weeklyPlanAssignments.employeeId,
          roleLabel: weeklyPlanAssignments.roleLabel,
          assignmentType: weeklyPlanAssignments.assignmentType,
          note: weeklyPlanAssignments.note,
          isBlocked: weeklyPlanAssignments.isBlocked,
          createdAt: weeklyPlanAssignments.createdAt,
          roomName: rooms.name,
          roomCategory: rooms.category,
          employeeName: employees.name,
          employeeLastName: employees.lastName,
        })
        .from(weeklyPlanAssignments)
        .leftJoin(rooms, eq(weeklyPlanAssignments.roomId, rooms.id))
        .leftJoin(employees, eq(weeklyPlanAssignments.employeeId, employees.id))
        .where(eq(weeklyPlanAssignments.weeklyPlanId, planId));

      // Apply filters
      if (weekday) {
        assignments = assignments.filter((a) => a.weekday === Number(weekday));
      }

      if (roomId) {
        assignments = assignments.filter((a) => a.roomId === Number(roomId));
      }

      return ok(res, assignments);
    }),
  );

  /**
   * DELETE /api/weekly-plans/:id
   * Delete weekly plan (only if status is 'Entwurf')
   * Cascades: deletes all assignments
   */
  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);

      // Get current plan
      const [existing] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));

      if (!existing) {
        return notFound(res, "Wochenplan");
      }

      // Only allow deletion of 'Entwurf' plans
      if (existing.status !== "Entwurf") {
        return validationError(
          res,
          "Nur Wochenpläne im Status 'Entwurf' können gelöscht werden",
        );
      }

      // Delete all assignments
      await db
        .delete(weeklyPlanAssignments)
        .where(eq(weeklyPlanAssignments.weeklyPlanId, planId));

      // Delete plan
      await db.delete(weeklyPlans).where(eq(weeklyPlans.id, planId));

      return ok(res, {
        deleted: true,
        id: planId,
        message: "Wochenplan und alle Zuweisungen wurden gelöscht",
      });
    }),
  );

  /**
   * POST /api/weekly-plans/:id/generate-from-duty
   * Placeholder for generating from duty plan (not implemented)
   */
  router.post(
    "/:id/generate-from-duty",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const planId = Number(id);
      const [plan] = await db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId));

      if (!plan) {
        return notFound(res, "Wochenplan");
      }

      const dutyPlanId = plan.generatedFromDutyPlanId;
      if (!dutyPlanId) {
        return validationError(
          res,
          "Der Wochenplan ist nicht mit einem Dienstplan verknüpft",
        );
      }

      const dutyAssignmentsRows = await db
        .select({
          employeeId: dutyAssignments.employeeId,
          employmentFrom: employees.employmentFrom,
          employmentUntil: employees.employmentUntil,
          shiftPreferences: employees.shiftPreferences,
          date: dutyDays.date,
        })
        .from(dutyAssignments)
        .innerJoin(dutySlots, eq(dutyAssignments.dutySlotId, dutySlots.id))
        .innerJoin(dutyDays, eq(dutySlots.dutyDayId, dutyDays.id))
        .leftJoin(employees, eq(dutyAssignments.employeeId, employees.id))
        .where(eq(dutyDays.dutyPlanId, dutyPlanId));

      let skippedLimitedPresenceAssignments = 0;
      dutyAssignmentsRows.forEach((row) => {
        if (!row.employeeId) return;
        if (!isWithinFullAccessWindow(row, row.date ?? "")) {
          skippedLimitedPresenceAssignments += 1;
        }
      });

      return ok(res, {
        message: "Generierung aus Dienstplan noch nicht implementiert",
        hint: "Manuelle Zuweisung über POST /:id/assign verwenden",
        skippedLimitedPresenceAssignments,
      });
    }),
  );

  return router;
}
