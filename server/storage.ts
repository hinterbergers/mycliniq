import { db } from "./db";
import { logRosterShiftAuditEvent, logRosterShiftAuditEvents } from "./lib/rosterShiftAudit";
import {
  type User,
  type InsertUser,
  type Employee,
  type InsertEmployee,
  type RosterShift,
  type InsertRosterShift,
  type Absence,
  type InsertAbsence,
  type Resource,
  type InsertResource,
  type DutyPlan,
  type WeeklyAssignment,
  type InsertWeeklyAssignment,
  type ProjectInitiative,
  type InsertProjectInitiative,
  type ProjectTask,
  type InsertProjectTask,
  type ProjectDocument,
  type InsertProjectDocument,
  type Approval,
  type InsertApproval,
  type TaskActivity,
  type InsertTaskActivity,
  type Session,
  type InsertSession,
  type ShiftSwapRequest,
  type InsertShiftSwapRequest,
  type RosterSettings,
  type InsertRosterSettings,
  type ShiftWish,
  type InsertShiftWish,
  type LongTermShiftWish,
  type LongTermWishRule,
  type InsertLongTermShiftWish,
  type LongTermAbsence,
  type InsertLongTermAbsence,
  type PlannedAbsence,
  type InsertPlannedAbsence,
  type CalendarToken,
  users,
  employees,
  rosterShifts,
  absences,
  resources,
  weeklyAssignments,
  projectInitiatives,
  projectTasks,
  projectDocuments,
  approvals,
  taskActivities,
  sessions,
  shiftSwapRequests,
  rosterSettings,
  dutyPlans,
  shiftWishes,
  longTermShiftWishes,
  longTermAbsences,
  plannedAbsences,
  calendarTokens,
} from "@shared/schema";
import { eq, and, gte, lte, desc, gt } from "drizzle-orm";

const normalizeLongTermWishRules = (
  rules: unknown,
): LongTermWishRule[] | null | undefined => {
  if (rules === undefined) return undefined;
  if (rules === null) return null;
  if (!Array.isArray(rules)) return null;

  return rules
    .filter(
      (rule): rule is LongTermWishRule =>
        typeof rule === "object" &&
        rule !== null &&
        typeof (rule as any).weekday === "string" &&
        typeof (rule as any).kind === "string" &&
        typeof (rule as any).strength === "string",
    )
    .map((rule) => {
      const r = rule as any;
      const out: LongTermWishRule = {
        weekday: r.weekday,
        kind: r.kind,
        strength: r.strength,
      };
      if (typeof r.serviceType === "string") {
        (out as any).serviceType = r.serviceType;
      }
    return out;
  });
};

const normalizeFixedPreferredEmployees = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => Number(entry))
    .filter((entry): entry is number => Number.isFinite(entry));
};

type RosterShiftAuditOptions = {
  actorEmployeeId?: number | null;
  actorName?: string | null;
  context?: string | null;
};

const normalizeWeeklyRuleProfile = (
  value: unknown,
): Record<string, unknown> | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Employee methods
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(
    id: number,
    employee: Partial<InsertEmployee>,
  ): Promise<Employee | undefined>;
  deleteEmployee(id: number): Promise<boolean>;

  // Roster methods
  getRosterShiftsByMonth(year: number, month: number): Promise<RosterShift[]>;
  getRosterShiftsByDate(date: string): Promise<RosterShift[]>;
  createRosterShift(
    shift: InsertRosterShift,
    audit?: RosterShiftAuditOptions,
  ): Promise<RosterShift>;
  deleteRosterShift(id: number, audit?: RosterShiftAuditOptions): Promise<boolean>;
  getLatestDutyPlanByStatus(
    status: DutyPlan["status"],
  ): Promise<DutyPlan | undefined>;

  // Absence methods
  getAbsencesByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<Absence[]>;
  getAbsencesByEmployee(employeeId: number): Promise<Absence[]>;
  createAbsence(absence: InsertAbsence): Promise<Absence>;
  deleteAbsence(id: number): Promise<boolean>;

  // Resource methods
  getResources(): Promise<Resource[]>;
  updateResource(
    id: number,
    resource: Partial<InsertResource>,
  ): Promise<Resource | undefined>;

  // Weekly assignment methods
  getWeeklyAssignments(
    weekYear: number,
    weekNumber: number,
  ): Promise<WeeklyAssignment[]>;
  upsertWeeklyAssignment(
    assignment: InsertWeeklyAssignment,
  ): Promise<WeeklyAssignment>;
  deleteWeeklyAssignment(id: number): Promise<boolean>;
  bulkUpsertWeeklyAssignments(
    assignments: InsertWeeklyAssignment[],
  ): Promise<WeeklyAssignment[]>;

  // Project management methods
  getProjectInitiatives(): Promise<ProjectInitiative[]>;
  getProjectInitiative(id: number): Promise<ProjectInitiative | undefined>;
  createProjectInitiative(
    initiative: InsertProjectInitiative,
  ): Promise<ProjectInitiative>;
  updateProjectInitiative(
    id: number,
    initiative: Partial<InsertProjectInitiative>,
  ): Promise<ProjectInitiative | undefined>;
  deleteProjectInitiative(id: number): Promise<boolean>;

  getProjectTasks(initiativeId: number): Promise<ProjectTask[]>;
  getProjectTask(id: number): Promise<ProjectTask | undefined>;
  createProjectTask(task: InsertProjectTask): Promise<ProjectTask>;
  updateProjectTask(
    id: number,
    task: Partial<InsertProjectTask>,
  ): Promise<ProjectTask | undefined>;
  deleteProjectTask(id: number): Promise<boolean>;

  getProjectDocuments(initiativeId: number): Promise<ProjectDocument[]>;
  getProjectDocument(id: number): Promise<ProjectDocument | undefined>;
  createProjectDocument(doc: InsertProjectDocument): Promise<ProjectDocument>;
  updateProjectDocument(
    id: number,
    doc: Partial<InsertProjectDocument>,
  ): Promise<ProjectDocument | undefined>;
  deleteProjectDocument(id: number): Promise<boolean>;

  getApprovals(documentId: number): Promise<Approval[]>;
  createApproval(approval: InsertApproval): Promise<Approval>;
  updateApproval(
    id: number,
    approval: Partial<InsertApproval>,
  ): Promise<Approval | undefined>;

  getTaskActivities(taskId: number): Promise<TaskActivity[]>;
  createTaskActivity(activity: InsertTaskActivity): Promise<TaskActivity>;

  getPublishedDocuments(): Promise<ProjectDocument[]>;

  // Auth methods
  getEmployeeByEmail(email: string): Promise<Employee | undefined>;
  setEmployeePassword(
    employeeId: number,
    passwordHash: string,
  ): Promise<Employee | undefined>;
  updateEmployeeLastLogin(employeeId: number): Promise<void>;

  // Session methods
  createSession(session: InsertSession): Promise<Session>;
  getSessionByToken(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<boolean>;
  deleteSessionsByEmployee(employeeId: number): Promise<boolean>;
  cleanupExpiredSessions(): Promise<number>;
  getCalendarTokenByEmployee(
    employeeId: number,
  ): Promise<CalendarToken | undefined>;
  getCalendarTokenByToken(token: string): Promise<CalendarToken | undefined>;
  upsertCalendarTokenForEmployee(
    employeeId: number,
    token: string,
  ): Promise<CalendarToken>;
  touchCalendarToken(token: string): Promise<void>;

  // Shift swap request methods
  getShiftSwapRequests(): Promise<ShiftSwapRequest[]>;
  getShiftSwapRequestsByEmployee(
    employeeId: number,
  ): Promise<ShiftSwapRequest[]>;
  getShiftSwapRequestsByTargetEmployee(
    employeeId: number,
  ): Promise<ShiftSwapRequest[]>;
  getPendingShiftSwapRequests(): Promise<ShiftSwapRequest[]>;
  getShiftSwapRequest(id: number): Promise<ShiftSwapRequest | undefined>;
  createShiftSwapRequest(
    request: InsertShiftSwapRequest,
  ): Promise<ShiftSwapRequest>;
  updateShiftSwapRequest(
    id: number,
    request: Partial<InsertShiftSwapRequest>,
  ): Promise<ShiftSwapRequest | undefined>;
  deleteShiftSwapRequest(id: number): Promise<boolean>;

  // Roster methods extended
  getRosterShift(id: number): Promise<RosterShift | undefined>;
  updateRosterShift(
    id: number,
    shift: Partial<InsertRosterShift>,
    audit?: RosterShiftAuditOptions,
  ): Promise<RosterShift | undefined>;
  bulkCreateRosterShifts(
    shifts: InsertRosterShift[],
    audit?: RosterShiftAuditOptions,
  ): Promise<RosterShift[]>;
  deleteRosterShiftsByMonth(
    year: number,
    month: number,
    audit?: RosterShiftAuditOptions,
  ): Promise<boolean>;

  // Roster settings methods
  getRosterSettings(): Promise<RosterSettings | undefined>;
  upsertRosterSettings(settings: InsertRosterSettings): Promise<RosterSettings>;

  // Shift wishes methods
  getShiftWishesByMonth(year: number, month: number): Promise<ShiftWish[]>;
  getShiftWishByEmployeeAndMonth(
    employeeId: number,
    year: number,
    month: number,
  ): Promise<ShiftWish | undefined>;
  getShiftWish(id: number): Promise<ShiftWish | undefined>;
  createShiftWish(wish: InsertShiftWish): Promise<ShiftWish>;
  updateShiftWish(
    id: number,
    wish: Partial<InsertShiftWish>,
  ): Promise<ShiftWish | undefined>;
  deleteShiftWish(id: number): Promise<boolean>;
  getSubmittedWishesCount(year: number, month: number): Promise<number>;
  getLongTermShiftWishByEmployee(
    employeeId: number,
  ): Promise<LongTermShiftWish | undefined>;
  getLongTermShiftWish(id: number): Promise<LongTermShiftWish | undefined>;
  upsertLongTermShiftWish(
    wish: InsertLongTermShiftWish,
  ): Promise<LongTermShiftWish>;
  updateLongTermShiftWish(
    id: number,
    wish: Partial<InsertLongTermShiftWish>,
  ): Promise<LongTermShiftWish | undefined>;
  getLongTermShiftWishesByStatus(status: string): Promise<LongTermShiftWish[]>;

  // Long-term absences methods
  getLongTermAbsencesByEmployee(employeeId: number): Promise<LongTermAbsence[]>;
  getLongTermAbsence(id: number): Promise<LongTermAbsence | undefined>;
  createLongTermAbsence(
    absence: InsertLongTermAbsence,
  ): Promise<LongTermAbsence>;
  updateLongTermAbsence(
    id: number,
    absence: Partial<InsertLongTermAbsence>,
  ): Promise<LongTermAbsence | undefined>;
  getLongTermAbsencesByStatus(status: string): Promise<LongTermAbsence[]>;

  // Planned absences methods
  getPlannedAbsencesByMonth(
    year: number,
    month: number,
  ): Promise<PlannedAbsence[]>;
  getPlannedAbsencesByEmployee(
    employeeId: number,
    year: number,
    month: number,
  ): Promise<PlannedAbsence[]>;
  createPlannedAbsence(absence: InsertPlannedAbsence): Promise<PlannedAbsence>;
  updatePlannedAbsence(
    id: number,
    absence: Partial<InsertPlannedAbsence>,
  ): Promise<PlannedAbsence | undefined>;
  deletePlannedAbsence(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  // Employee methods
  async getEmployees(): Promise<Employee[]> {
    return await db
      .select()
      .from(employees)
      .where(eq(employees.isActive, true));
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const result = await db
      .select()
      .from(employees)
      .where(eq(employees.id, id));
    return result[0];
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const result = await db.insert(employees).values(employee).returning();
    return result[0];
  }

  async updateEmployee(
    id: number,
    employee: Partial<InsertEmployee>,
  ): Promise<Employee | undefined> {
    const result = await db
      .update(employees)
      .set(employee)
      .where(eq(employees.id, id))
      .returning();
    return result[0];
  }

  async deleteEmployee(id: number): Promise<boolean> {
    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, id));
    return true;
  }

  // Roster methods
  async getRosterShiftsByMonth(
    year: number,
    month: number,
    opts?: {
      draftOnly?: boolean;
      finalOnly?: boolean;
      includeDraft?: boolean;
      draft?: boolean;
    },
  ): Promise<RosterShift[]> {
    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    let condition = and(
      gte(rosterShifts.date, startDate),
      lte(rosterShifts.date, endDate),
    );

    if (typeof opts?.draft === "boolean") {
      condition = and(condition, eq(rosterShifts.isDraft, opts.draft));
    } else if (!opts?.includeDraft) {
      const finalOnly = opts?.finalOnly ?? !opts?.draftOnly ?? true;
      if (opts?.draftOnly) {
        condition = and(condition, eq(rosterShifts.isDraft, true));
      } else if (finalOnly) {
        condition = and(condition, eq(rosterShifts.isDraft, false));
      }
    }

    return await db
      .select()
      .from(rosterShifts)
      .where(condition);
  }

  async getRosterShiftsByDate(date: string): Promise<RosterShift[]> {
    return await db
      .select()
      .from(rosterShifts)
      .where(eq(rosterShifts.date, date));
  }

  async createRosterShift(
    shift: InsertRosterShift,
    audit?: RosterShiftAuditOptions,
  ): Promise<RosterShift> {
    const result = await db.insert(rosterShifts).values(shift).returning();
    const created = result[0];
    if (created) {
      await logRosterShiftAuditEvent({
        action: "insert",
        after: created,
        actorEmployeeId: audit?.actorEmployeeId ?? null,
        actorName: audit?.actorName ?? null,
        context: audit?.context ?? "storage.createRosterShift",
      });
    }
    return created;
  }

  async deleteRosterShift(
    id: number,
    audit?: RosterShiftAuditOptions,
  ): Promise<boolean> {
    const [before] = await db.select().from(rosterShifts).where(eq(rosterShifts.id, id));
    await db.delete(rosterShifts).where(eq(rosterShifts.id, id));
    if (before) {
      await logRosterShiftAuditEvent({
        action: "delete",
        before,
        actorEmployeeId: audit?.actorEmployeeId ?? null,
        actorName: audit?.actorName ?? null,
        context: audit?.context ?? "storage.deleteRosterShift",
      });
    }
    return true;
  }

  // Absence methods
  async getAbsencesByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<Absence[]> {
    return await db
      .select()
      .from(absences)
      .where(
        and(gte(absences.endDate, startDate), lte(absences.startDate, endDate)),
      );
  }

  async getAbsencesByEmployee(employeeId: number): Promise<Absence[]> {
    return await db
      .select()
      .from(absences)
      .where(eq(absences.employeeId, employeeId));
  }

  async createAbsence(absence: InsertAbsence): Promise<Absence> {
    const result = await db.insert(absences).values(absence).returning();
    return result[0];
  }

  async deleteAbsence(id: number): Promise<boolean> {
    await db.delete(absences).where(eq(absences.id, id));
    return true;
  }

  // Resource methods
  async getResources(): Promise<Resource[]> {
    return await db.select().from(resources);
  }

  async updateResource(
    id: number,
    resource: Partial<InsertResource>,
  ): Promise<Resource | undefined> {
    const result = await db
      .update(resources)
      .set(resource)
      .where(eq(resources.id, id))
      .returning();
    return result[0];
  }

  // Weekly assignment methods
  async getWeeklyAssignments(
    weekYear: number,
    weekNumber: number,
  ): Promise<WeeklyAssignment[]> {
    return await db
      .select()
      .from(weeklyAssignments)
      .where(
        and(
          eq(weeklyAssignments.weekYear, weekYear),
          eq(weeklyAssignments.weekNumber, weekNumber),
        ),
      );
  }

  async upsertWeeklyAssignment(
    assignment: InsertWeeklyAssignment,
  ): Promise<WeeklyAssignment> {
    const existing = await db
      .select()
      .from(weeklyAssignments)
      .where(
        and(
          eq(weeklyAssignments.weekYear, assignment.weekYear),
          eq(weeklyAssignments.weekNumber, assignment.weekNumber),
          eq(weeklyAssignments.dayOfWeek, assignment.dayOfWeek),
          eq(weeklyAssignments.area, assignment.area),
          eq(weeklyAssignments.subArea, assignment.subArea),
          eq(weeklyAssignments.roleSlot, assignment.roleSlot),
        ),
      );

    if (existing.length > 0) {
      const result = await db
        .update(weeklyAssignments)
        .set({
          employeeId: assignment.employeeId,
          notes: assignment.notes,
          isClosed: assignment.isClosed,
        })
        .where(eq(weeklyAssignments.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db
      .insert(weeklyAssignments)
      .values(assignment)
      .returning();
    return result[0];
  }

  async deleteWeeklyAssignment(id: number): Promise<boolean> {
    await db.delete(weeklyAssignments).where(eq(weeklyAssignments.id, id));
    return true;
  }

  async bulkUpsertWeeklyAssignments(
    assignments: InsertWeeklyAssignment[],
  ): Promise<WeeklyAssignment[]> {
    const results: WeeklyAssignment[] = [];
    for (const assignment of assignments) {
      const isEmpty =
        assignment.employeeId === null &&
        (assignment.notes === null || assignment.notes === "") &&
        !assignment.isClosed;

      if (isEmpty) {
        const existing = await db
          .select()
          .from(weeklyAssignments)
          .where(
            and(
              eq(weeklyAssignments.weekYear, assignment.weekYear),
              eq(weeklyAssignments.weekNumber, assignment.weekNumber),
              eq(weeklyAssignments.dayOfWeek, assignment.dayOfWeek),
              eq(weeklyAssignments.area, assignment.area),
              eq(weeklyAssignments.subArea, assignment.subArea),
              eq(weeklyAssignments.roleSlot, assignment.roleSlot),
            ),
          );

        if (existing.length > 0) {
          await db
            .delete(weeklyAssignments)
            .where(eq(weeklyAssignments.id, existing[0].id));
        }
      } else {
        const result = await this.upsertWeeklyAssignment(assignment);
        results.push(result);
      }
    }
    return results;
  }

  // Project management methods
  async getProjectInitiatives(): Promise<ProjectInitiative[]> {
    return await db
      .select()
      .from(projectInitiatives)
      .orderBy(desc(projectInitiatives.createdAt));
  }

  async getProjectInitiative(
    id: number,
  ): Promise<ProjectInitiative | undefined> {
    const result = await db
      .select()
      .from(projectInitiatives)
      .where(eq(projectInitiatives.id, id));
    return result[0];
  }

  async createProjectInitiative(
    initiative: InsertProjectInitiative,
  ): Promise<ProjectInitiative> {
    const result = await db
      .insert(projectInitiatives)
      .values(initiative)
      .returning();
    return result[0];
  }

  async updateProjectInitiative(
    id: number,
    initiative: Partial<InsertProjectInitiative>,
  ): Promise<ProjectInitiative | undefined> {
    const result = await db
      .update(projectInitiatives)
      .set({ ...initiative, updatedAt: new Date() })
      .where(eq(projectInitiatives.id, id))
      .returning();
    return result[0];
  }

  async deleteProjectInitiative(id: number): Promise<boolean> {
    await db.delete(projectInitiatives).where(eq(projectInitiatives.id, id));
    return true;
  }

  async getProjectTasks(initiativeId: number): Promise<ProjectTask[]> {
    return await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.initiativeId, initiativeId))
      .orderBy(projectTasks.orderIndex);
  }

  async getProjectTask(id: number): Promise<ProjectTask | undefined> {
    const result = await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.id, id));
    return result[0];
  }

  async createProjectTask(task: InsertProjectTask): Promise<ProjectTask> {
    const result = await db.insert(projectTasks).values(task).returning();
    return result[0];
  }

  async updateProjectTask(
    id: number,
    task: Partial<InsertProjectTask>,
  ): Promise<ProjectTask | undefined> {
    const result = await db
      .update(projectTasks)
      .set({ ...task, updatedAt: new Date() })
      .where(eq(projectTasks.id, id))
      .returning();
    return result[0];
  }

  async deleteProjectTask(id: number): Promise<boolean> {
    await db.delete(projectTasks).where(eq(projectTasks.id, id));
    return true;
  }

  async getProjectDocuments(initiativeId: number): Promise<ProjectDocument[]> {
    return await db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.initiativeId, initiativeId))
      .orderBy(desc(projectDocuments.updatedAt));
  }

  async getProjectDocument(id: number): Promise<ProjectDocument | undefined> {
    const result = await db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.id, id));
    return result[0];
  }

  async createProjectDocument(
    doc: InsertProjectDocument,
  ): Promise<ProjectDocument> {
    const result = await db.insert(projectDocuments).values(doc).returning();
    return result[0];
  }

  async updateProjectDocument(
    id: number,
    doc: Partial<InsertProjectDocument>,
  ): Promise<ProjectDocument | undefined> {
    const result = await db
      .update(projectDocuments)
      .set({ ...doc, updatedAt: new Date() })
      .where(eq(projectDocuments.id, id))
      .returning();
    return result[0];
  }

  async deleteProjectDocument(id: number): Promise<boolean> {
    await db.delete(projectDocuments).where(eq(projectDocuments.id, id));
    return true;
  }

  async getApprovals(documentId: number): Promise<Approval[]> {
    return await db
      .select()
      .from(approvals)
      .where(eq(approvals.documentId, documentId))
      .orderBy(desc(approvals.requestedAt));
  }

  async createApproval(approval: InsertApproval): Promise<Approval> {
    const result = await db.insert(approvals).values(approval).returning();
    return result[0];
  }

  async updateApproval(
    id: number,
    approval: Partial<InsertApproval>,
  ): Promise<Approval | undefined> {
    const result = await db
      .update(approvals)
      .set(approval)
      .where(eq(approvals.id, id))
      .returning();
    return result[0];
  }

  async getTaskActivities(taskId: number): Promise<TaskActivity[]> {
    return await db
      .select()
      .from(taskActivities)
      .where(eq(taskActivities.taskId, taskId))
      .orderBy(desc(taskActivities.createdAt));
  }

  async createTaskActivity(
    activity: InsertTaskActivity,
  ): Promise<TaskActivity> {
    const result = await db.insert(taskActivities).values(activity).returning();
    return result[0];
  }

  async getPublishedDocuments(): Promise<ProjectDocument[]> {
    return await db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.isPublished, true))
      .orderBy(desc(projectDocuments.publishedAt));
  }

  // Auth methods
  async getEmployeeByEmail(email: string): Promise<Employee | undefined> {
    const result = await db
      .select()
      .from(employees)
      .where(and(eq(employees.email, email), eq(employees.isActive, true)));
    return result[0];
  }

  async setEmployeePassword(
    employeeId: number,
    passwordHash: string,
  ): Promise<Employee | undefined> {
    const result = await db
      .update(employees)
      .set({ passwordHash })
      .where(eq(employees.id, employeeId))
      .returning();
    return result[0];
  }

  async updateEmployeeLastLogin(employeeId: number): Promise<void> {
    await db
      .update(employees)
      .set({ lastLoginAt: new Date() })
      .where(eq(employees.id, employeeId));
  }

  // Session methods
  async createSession(session: InsertSession): Promise<Session> {
    const result = await db.insert(sessions).values(session).returning();
    return result[0];
  }

  async getSessionByToken(token: string): Promise<Session | undefined> {
    const result = await db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())),
      );
    return result[0];
  }

  async deleteSession(token: string): Promise<boolean> {
    await db.delete(sessions).where(eq(sessions.token, token));
    return true;
  }

  async deleteSessionsByEmployee(employeeId: number): Promise<boolean> {
    await db.delete(sessions).where(eq(sessions.employeeId, employeeId));
    return true;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await db
      .delete(sessions)
      .where(lte(sessions.expiresAt, new Date()))
      .returning();
    return result.length;
  }

  async getCalendarTokenByEmployee(
    employeeId: number,
  ): Promise<CalendarToken | undefined> {
    const result = await db
      .select()
      .from(calendarTokens)
      .where(eq(calendarTokens.employeeId, employeeId))
      .limit(1);
    return result[0];
  }

  async getCalendarTokenByToken(
    token: string,
  ): Promise<CalendarToken | undefined> {
    const result = await db
      .select()
      .from(calendarTokens)
      .where(eq(calendarTokens.token, token))
      .limit(1);
    return result[0];
  }

  async upsertCalendarTokenForEmployee(
    employeeId: number,
    token: string,
  ): Promise<CalendarToken> {
    const now = new Date();
    const [existing] = await db
      .select()
      .from(calendarTokens)
      .where(eq(calendarTokens.employeeId, employeeId))
      .limit(1);
    if (existing) {
      const [updated] = await db
        .update(calendarTokens)
        .set({
          token,
          updatedAt: now,
          lastUsedAt: now,
        })
        .where(eq(calendarTokens.employeeId, employeeId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(calendarTokens)
      .values({
        employeeId,
        token,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      })
      .returning();
    return created;
  }

  async touchCalendarToken(token: string): Promise<void> {
    const now = new Date();
    await db
      .update(calendarTokens)
      .set({
        updatedAt: now,
        lastUsedAt: now,
      })
      .where(eq(calendarTokens.token, token));
  }

  // Shift swap request methods
  async getShiftSwapRequests(): Promise<ShiftSwapRequest[]> {
    return await db
      .select()
      .from(shiftSwapRequests)
      .orderBy(desc(shiftSwapRequests.requestedAt));
  }

  async getShiftSwapRequestsByEmployee(
    employeeId: number,
  ): Promise<ShiftSwapRequest[]> {
    return await db
      .select()
      .from(shiftSwapRequests)
      .where(eq(shiftSwapRequests.requesterId, employeeId))
      .orderBy(desc(shiftSwapRequests.requestedAt));
  }

  async getShiftSwapRequestsByTargetEmployee(
    employeeId: number,
  ): Promise<ShiftSwapRequest[]> {
    return await db
      .select()
      .from(shiftSwapRequests)
      .where(eq(shiftSwapRequests.targetEmployeeId, employeeId))
      .orderBy(desc(shiftSwapRequests.requestedAt));
  }

  async getPendingShiftSwapRequests(): Promise<ShiftSwapRequest[]> {
    return await db
      .select()
      .from(shiftSwapRequests)
      .where(eq(shiftSwapRequests.status, "Ausstehend"))
      .orderBy(desc(shiftSwapRequests.requestedAt));
  }

  async getShiftSwapRequest(id: number): Promise<ShiftSwapRequest | undefined> {
    const result = await db
      .select()
      .from(shiftSwapRequests)
      .where(eq(shiftSwapRequests.id, id));
    return result[0];
  }

  async createShiftSwapRequest(
    request: InsertShiftSwapRequest,
  ): Promise<ShiftSwapRequest> {
    const result = await db
      .insert(shiftSwapRequests)
      .values(request)
      .returning();
    return result[0];
  }

  async updateShiftSwapRequest(
    id: number,
    request: Partial<InsertShiftSwapRequest>,
  ): Promise<ShiftSwapRequest | undefined> {
    const result = await db
      .update(shiftSwapRequests)
      .set(request)
      .where(eq(shiftSwapRequests.id, id))
      .returning();
    return result[0];
  }

  async deleteShiftSwapRequest(id: number): Promise<boolean> {
    await db.delete(shiftSwapRequests).where(eq(shiftSwapRequests.id, id));
    return true;
  }

  // Roster methods extended
  async getRosterShift(id: number): Promise<RosterShift | undefined> {
    const result = await db
      .select()
      .from(rosterShifts)
      .where(eq(rosterShifts.id, id));
    return result[0];
  }

  async updateRosterShift(
    id: number,
    shift: Partial<InsertRosterShift>,
    audit?: RosterShiftAuditOptions,
  ): Promise<RosterShift | undefined> {
    const [before] = await db.select().from(rosterShifts).where(eq(rosterShifts.id, id));
    const result = await db
      .update(rosterShifts)
      .set(shift)
      .where(eq(rosterShifts.id, id))
      .returning();
    const updated = result[0];
    if (updated) {
      await logRosterShiftAuditEvent({
        action: "update",
        before: before ?? null,
        after: updated,
        actorEmployeeId: audit?.actorEmployeeId ?? null,
        actorName: audit?.actorName ?? null,
        context: audit?.context ?? "storage.updateRosterShift",
      });
    }
    return updated;
  }

  async bulkCreateRosterShifts(
    shifts: InsertRosterShift[],
    audit?: RosterShiftAuditOptions,
  ): Promise<RosterShift[]> {
    if (shifts.length === 0) return [];
    const result = await db.insert(rosterShifts).values(shifts).returning();
    await logRosterShiftAuditEvents(
      result.map((row) => ({
        action: "insert" as const,
        after: row,
        actorEmployeeId: audit?.actorEmployeeId ?? null,
        actorName: audit?.actorName ?? null,
        context: audit?.context ?? "storage.bulkCreateRosterShifts",
      })),
    );
    return result;
  }

  async deleteRosterShiftsByMonth(
    year: number,
    month: number,
    audit?: RosterShiftAuditOptions,
  ): Promise<boolean> {
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;

    const rows = await db
      .select()
      .from(rosterShifts)
      .where(
        and(gte(rosterShifts.date, startDate), lte(rosterShifts.date, endDate)),
      );

    await db
      .delete(rosterShifts)
      .where(
        and(gte(rosterShifts.date, startDate), lte(rosterShifts.date, endDate)),
      );
    await logRosterShiftAuditEvents(
      rows.map((row) => ({
        action: "delete" as const,
        before: row,
        actorEmployeeId: audit?.actorEmployeeId ?? null,
        actorName: audit?.actorName ?? null,
        context: audit?.context ?? "storage.deleteRosterShiftsByMonth",
      })),
    );
    return true;
  }

  // Roster settings methods
  async getRosterSettings(): Promise<RosterSettings | undefined> {
    const result = await db.select().from(rosterSettings);
    const settings = result[0];
    if (!settings) return undefined;
    const normalizedFixed = normalizeFixedPreferredEmployees(
      settings.fixedPreferredEmployees,
    );
    return {
      ...settings,
      fixedPreferredEmployees: normalizedFixed,
    };
  }

  async getLatestDutyPlanByStatus(
    status: DutyPlan["status"],
  ): Promise<DutyPlan | undefined> {
    const result = await db
      .select()
      .from(dutyPlans)
      .where(eq(dutyPlans.status, status))
      .orderBy(desc(dutyPlans.year), desc(dutyPlans.month))
      .limit(1);
    return result[0];
  }

  async upsertRosterSettings(
    settings: InsertRosterSettings,
  ): Promise<RosterSettings> {
    const existing = await this.getRosterSettings();
    if (existing) {
      const normalizedFixed = normalizeFixedPreferredEmployees(
        settings.fixedPreferredEmployees,
      );
      const normalizedWeeklyRuleProfile = normalizeWeeklyRuleProfile(
        settings.weeklyRuleProfile,
      );
      const payload = {
        ...settings,
        fixedPreferredEmployees: normalizedFixed,
        weeklyRuleProfile: normalizedWeeklyRuleProfile,
        updatedAt: new Date(),
      };
      const result = await db
        .update(rosterSettings)
        .set(payload)
        .where(eq(rosterSettings.id, existing.id))
        .returning();
      return result[0];
    } else {
      const normalizedFixed = normalizeFixedPreferredEmployees(
        settings.fixedPreferredEmployees,
      );
      const normalizedWeeklyRuleProfile = normalizeWeeklyRuleProfile(
        settings.weeklyRuleProfile,
      );
      const payload = {
        ...settings,
        fixedPreferredEmployees: normalizedFixed,
        weeklyRuleProfile: normalizedWeeklyRuleProfile,
      };
      const result = await db
        .insert(rosterSettings)
        .values(payload)
        .returning();
      return result[0];
    }
  }

  // Shift wishes methods
  async getShiftWishesByMonth(
    year: number,
    month: number,
  ): Promise<ShiftWish[]> {
    return await db
      .select()
      .from(shiftWishes)
      .where(and(eq(shiftWishes.year, year), eq(shiftWishes.month, month)));
  }

  async getShiftWishByEmployeeAndMonth(
    employeeId: number,
    year: number,
    month: number,
  ): Promise<ShiftWish | undefined> {
    const result = await db
      .select()
      .from(shiftWishes)
      .where(
        and(
          eq(shiftWishes.employeeId, employeeId),
          eq(shiftWishes.year, year),
          eq(shiftWishes.month, month),
        ),
      );
    return result[0];
  }
  async getShiftWish(id: number) {
    const [wish] = await db
      .select()
      .from(shiftWishes)
      .where(eq(shiftWishes.id, id))
      .limit(1);

    return wish;
  }

  async createShiftWish(wish: InsertShiftWish): Promise<ShiftWish> {
    const wishData = {
      ...wish,
      preferredShiftDays: wish.preferredShiftDays
        ? wish.preferredShiftDays
        : null,
      avoidShiftDays: wish.avoidShiftDays ? wish.avoidShiftDays : null,
      preferredServiceTypes: wish.preferredServiceTypes
        ? wish.preferredServiceTypes
        : null,
      avoidServiceTypes: wish.avoidServiceTypes ? wish.avoidServiceTypes : null,
      avoidWeekdays: wish.avoidWeekdays ? wish.avoidWeekdays : null,
      maxShiftsPerWeek: wish.maxShiftsPerWeek ?? null,
      maxShiftsPerMonth: wish.maxShiftsPerMonth ?? null,
      maxWeekendShifts: wish.maxWeekendShifts ?? null,
    };
    const result = await db
      .insert(shiftWishes)
      .values(wishData as any)
      .returning();
    return result[0];
  }

  async updateShiftWish(
    id: number,
    wish: Partial<InsertShiftWish>,
  ): Promise<ShiftWish | undefined> {
    const updateData: any = { ...wish, updatedAt: new Date() };
    const result = await db
      .update(shiftWishes)
      .set(updateData)
      .where(eq(shiftWishes.id, id))
      .returning();
    return result[0];
  }

  async deleteShiftWish(id: number): Promise<boolean> {
    await db.delete(shiftWishes).where(eq(shiftWishes.id, id));
    return true;
  }

  async getSubmittedWishesCount(year: number, month: number): Promise<number> {
    const result = await db
      .select()
      .from(shiftWishes)
      .where(
        and(
          eq(shiftWishes.year, year),
          eq(shiftWishes.month, month),
          eq(shiftWishes.status, "Eingereicht"),
        ),
      );
    return result.length;
  }
  async reopenShiftWish(id: number) {
    const updated = await db
      .update(shiftWishes)
      .set({
        status: "Entwurf",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(shiftWishes.id, id))
      .returning();

    return updated[0];
  }
  // Long-term shift wishes methods
  async getLongTermShiftWishByEmployee(
    employeeId: number,
  ): Promise<LongTermShiftWish | undefined> {
    const result = await db
      .select()
      .from(longTermShiftWishes)
      .where(eq(longTermShiftWishes.employeeId, employeeId));
    return result[0];
  }

  async getLongTermShiftWish(
    id: number,
  ): Promise<LongTermShiftWish | undefined> {
    const result = await db
      .select()
      .from(longTermShiftWishes)
      .where(eq(longTermShiftWishes.id, id));
    return result[0];
  }

  async upsertLongTermShiftWish(
    wish: InsertLongTermShiftWish,
  ): Promise<LongTermShiftWish> {
    const existing = await this.getLongTermShiftWishByEmployee(wish.employeeId);
    if (existing) {
      const result = await db
        .update(longTermShiftWishes)
        .set({
          ...wish,
          rules: normalizeLongTermWishRules((wish as any).rules) ?? null,
          updatedAt: new Date(),
        })
        .where(eq(longTermShiftWishes.id, existing.id))
        .returning();
      return result[0];
    }

    const result = await db
      .insert(longTermShiftWishes)
      .values(wish as any)
      .returning();
    return result[0];
  }

  async updateLongTermShiftWish(
    id: number,
    wish: Partial<InsertLongTermShiftWish>,
  ): Promise<LongTermShiftWish | undefined> {
    const result = await db
      .update(longTermShiftWishes)
      .set({
        ...wish,
        rules: normalizeLongTermWishRules((wish as any).rules),
        updatedAt: new Date(),
      })
      .where(eq(longTermShiftWishes.id, id))
      .returning();
    return result[0];
  }

  async getLongTermShiftWishesByStatus(
    status: string,
  ): Promise<LongTermShiftWish[]> {
    return await db
      .select()
      .from(longTermShiftWishes)
      .where(eq(longTermShiftWishes.status, status as any));
  }

  // Long-term absences methods
  async getLongTermAbsencesByEmployee(
    employeeId: number,
  ): Promise<LongTermAbsence[]> {
    return await db
      .select()
      .from(longTermAbsences)
      .where(eq(longTermAbsences.employeeId, employeeId));
  }

  async getLongTermAbsence(id: number): Promise<LongTermAbsence | undefined> {
    const result = await db
      .select()
      .from(longTermAbsences)
      .where(eq(longTermAbsences.id, id));
    return result[0];
  }

  async createLongTermAbsence(
    absence: InsertLongTermAbsence,
  ): Promise<LongTermAbsence> {
    const result = await db
      .insert(longTermAbsences)
      .values(absence as any)
      .returning();
    return result[0];
  }

  async updateLongTermAbsence(
    id: number,
    absence: Partial<InsertLongTermAbsence>,
  ): Promise<LongTermAbsence | undefined> {
    const result = await db
      .update(longTermAbsences)
      .set({ ...absence, updatedAt: new Date() })
      .where(eq(longTermAbsences.id, id))
      .returning();
    return result[0];
  }

  async getLongTermAbsencesByStatus(
    status: string,
  ): Promise<LongTermAbsence[]> {
    return await db
      .select()
      .from(longTermAbsences)
      .where(eq(longTermAbsences.status, status as any));
  }

  // Planned absences methods
  async getPlannedAbsencesByMonth(
    year: number,
    month: number,
  ): Promise<PlannedAbsence[]> {
    return await db
      .select()
      .from(plannedAbsences)
      .where(
        and(eq(plannedAbsences.year, year), eq(plannedAbsences.month, month)),
      );
  }

  async getPlannedAbsencesByEmployee(
    employeeId: number,
    year: number,
    month: number,
  ): Promise<PlannedAbsence[]> {
    return await db
      .select()
      .from(plannedAbsences)
      .where(
        and(
          eq(plannedAbsences.employeeId, employeeId),
          eq(plannedAbsences.year, year),
          eq(plannedAbsences.month, month),
        ),
      );
  }

  async createPlannedAbsence(
    absence: InsertPlannedAbsence,
  ): Promise<PlannedAbsence> {
    const result = await db.insert(plannedAbsences).values(absence).returning();
    return result[0];
  }

  async updatePlannedAbsence(
    id: number,
    absence: Partial<InsertPlannedAbsence>,
  ): Promise<PlannedAbsence | undefined> {
    const result = await db
      .update(plannedAbsences)
      .set(absence)
      .where(eq(plannedAbsences.id, id))
      .returning();
    return result[0];
  }

  async deletePlannedAbsence(id: number): Promise<boolean> {
    await db.delete(plannedAbsences).where(eq(plannedAbsences.id, id));
    return true;
  }
}

export const storage = new DatabaseStorage();
