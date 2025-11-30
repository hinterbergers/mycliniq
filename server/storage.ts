import { db } from "./db";
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
  sessions
} from "@shared/schema";
import { eq, and, gte, lte, desc, gt } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Employee methods
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: number): Promise<boolean>;
  
  // Roster methods
  getRosterShiftsByMonth(year: number, month: number): Promise<RosterShift[]>;
  getRosterShiftsByDate(date: string): Promise<RosterShift[]>;
  createRosterShift(shift: InsertRosterShift): Promise<RosterShift>;
  deleteRosterShift(id: number): Promise<boolean>;
  
  // Absence methods
  getAbsencesByDateRange(startDate: string, endDate: string): Promise<Absence[]>;
  getAbsencesByEmployee(employeeId: number): Promise<Absence[]>;
  createAbsence(absence: InsertAbsence): Promise<Absence>;
  deleteAbsence(id: number): Promise<boolean>;
  
  // Resource methods
  getResources(): Promise<Resource[]>;
  updateResource(id: number, resource: Partial<InsertResource>): Promise<Resource | undefined>;
  
  // Weekly assignment methods
  getWeeklyAssignments(weekYear: number, weekNumber: number): Promise<WeeklyAssignment[]>;
  upsertWeeklyAssignment(assignment: InsertWeeklyAssignment): Promise<WeeklyAssignment>;
  deleteWeeklyAssignment(id: number): Promise<boolean>;
  bulkUpsertWeeklyAssignments(assignments: InsertWeeklyAssignment[]): Promise<WeeklyAssignment[]>;
  
  // Project management methods
  getProjectInitiatives(): Promise<ProjectInitiative[]>;
  getProjectInitiative(id: number): Promise<ProjectInitiative | undefined>;
  createProjectInitiative(initiative: InsertProjectInitiative): Promise<ProjectInitiative>;
  updateProjectInitiative(id: number, initiative: Partial<InsertProjectInitiative>): Promise<ProjectInitiative | undefined>;
  deleteProjectInitiative(id: number): Promise<boolean>;
  
  getProjectTasks(initiativeId: number): Promise<ProjectTask[]>;
  getProjectTask(id: number): Promise<ProjectTask | undefined>;
  createProjectTask(task: InsertProjectTask): Promise<ProjectTask>;
  updateProjectTask(id: number, task: Partial<InsertProjectTask>): Promise<ProjectTask | undefined>;
  deleteProjectTask(id: number): Promise<boolean>;
  
  getProjectDocuments(initiativeId: number): Promise<ProjectDocument[]>;
  getProjectDocument(id: number): Promise<ProjectDocument | undefined>;
  createProjectDocument(doc: InsertProjectDocument): Promise<ProjectDocument>;
  updateProjectDocument(id: number, doc: Partial<InsertProjectDocument>): Promise<ProjectDocument | undefined>;
  deleteProjectDocument(id: number): Promise<boolean>;
  
  getApprovals(documentId: number): Promise<Approval[]>;
  createApproval(approval: InsertApproval): Promise<Approval>;
  updateApproval(id: number, approval: Partial<InsertApproval>): Promise<Approval | undefined>;
  
  getTaskActivities(taskId: number): Promise<TaskActivity[]>;
  createTaskActivity(activity: InsertTaskActivity): Promise<TaskActivity>;
  
  getPublishedDocuments(): Promise<ProjectDocument[]>;
  
  // Auth methods
  getEmployeeByEmail(email: string): Promise<Employee | undefined>;
  setEmployeePassword(employeeId: number, passwordHash: string): Promise<Employee | undefined>;
  updateEmployeeLastLogin(employeeId: number): Promise<void>;
  
  // Session methods
  createSession(session: InsertSession): Promise<Session>;
  getSessionByToken(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<boolean>;
  deleteSessionsByEmployee(employeeId: number): Promise<boolean>;
  cleanupExpiredSessions(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  // Employee methods
  async getEmployees(): Promise<Employee[]> {
    return await db.select().from(employees).where(eq(employees.isActive, true));
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const result = await db.select().from(employees).where(eq(employees.id, id));
    return result[0];
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const result = await db.insert(employees).values(employee).returning();
    return result[0];
  }

  async updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const result = await db.update(employees)
      .set(employee)
      .where(eq(employees.id, id))
      .returning();
    return result[0];
  }

  async deleteEmployee(id: number): Promise<boolean> {
    await db.update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, id));
    return true;
  }

  // Roster methods
  async getRosterShiftsByMonth(year: number, month: number): Promise<RosterShift[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    
    return await db.select()
      .from(rosterShifts)
      .where(and(
        gte(rosterShifts.date, startDate),
        lte(rosterShifts.date, endDate)
      ));
  }

  async getRosterShiftsByDate(date: string): Promise<RosterShift[]> {
    return await db.select()
      .from(rosterShifts)
      .where(eq(rosterShifts.date, date));
  }

  async createRosterShift(shift: InsertRosterShift): Promise<RosterShift> {
    const result = await db.insert(rosterShifts).values(shift).returning();
    return result[0];
  }

  async deleteRosterShift(id: number): Promise<boolean> {
    await db.delete(rosterShifts).where(eq(rosterShifts.id, id));
    return true;
  }

  // Absence methods
  async getAbsencesByDateRange(startDate: string, endDate: string): Promise<Absence[]> {
    return await db.select()
      .from(absences)
      .where(and(
        gte(absences.endDate, startDate),
        lte(absences.startDate, endDate)
      ));
  }

  async getAbsencesByEmployee(employeeId: number): Promise<Absence[]> {
    return await db.select()
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

  async updateResource(id: number, resource: Partial<InsertResource>): Promise<Resource | undefined> {
    const result = await db.update(resources)
      .set(resource)
      .where(eq(resources.id, id))
      .returning();
    return result[0];
  }

  // Weekly assignment methods
  async getWeeklyAssignments(weekYear: number, weekNumber: number): Promise<WeeklyAssignment[]> {
    return await db.select()
      .from(weeklyAssignments)
      .where(and(
        eq(weeklyAssignments.weekYear, weekYear),
        eq(weeklyAssignments.weekNumber, weekNumber)
      ));
  }

  async upsertWeeklyAssignment(assignment: InsertWeeklyAssignment): Promise<WeeklyAssignment> {
    const existing = await db.select()
      .from(weeklyAssignments)
      .where(and(
        eq(weeklyAssignments.weekYear, assignment.weekYear),
        eq(weeklyAssignments.weekNumber, assignment.weekNumber),
        eq(weeklyAssignments.dayOfWeek, assignment.dayOfWeek),
        eq(weeklyAssignments.area, assignment.area),
        eq(weeklyAssignments.subArea, assignment.subArea),
        eq(weeklyAssignments.roleSlot, assignment.roleSlot)
      ));

    if (existing.length > 0) {
      const result = await db.update(weeklyAssignments)
        .set({ employeeId: assignment.employeeId, notes: assignment.notes, isClosed: assignment.isClosed })
        .where(eq(weeklyAssignments.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db.insert(weeklyAssignments).values(assignment).returning();
    return result[0];
  }

  async deleteWeeklyAssignment(id: number): Promise<boolean> {
    await db.delete(weeklyAssignments).where(eq(weeklyAssignments.id, id));
    return true;
  }

  async bulkUpsertWeeklyAssignments(assignments: InsertWeeklyAssignment[]): Promise<WeeklyAssignment[]> {
    const results: WeeklyAssignment[] = [];
    for (const assignment of assignments) {
      const isEmpty = assignment.employeeId === null && 
                      (assignment.notes === null || assignment.notes === "") && 
                      !assignment.isClosed;
      
      if (isEmpty) {
        const existing = await db.select()
          .from(weeklyAssignments)
          .where(and(
            eq(weeklyAssignments.weekYear, assignment.weekYear),
            eq(weeklyAssignments.weekNumber, assignment.weekNumber),
            eq(weeklyAssignments.dayOfWeek, assignment.dayOfWeek),
            eq(weeklyAssignments.area, assignment.area),
            eq(weeklyAssignments.subArea, assignment.subArea),
            eq(weeklyAssignments.roleSlot, assignment.roleSlot)
          ));
        
        if (existing.length > 0) {
          await db.delete(weeklyAssignments).where(eq(weeklyAssignments.id, existing[0].id));
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
    return await db.select()
      .from(projectInitiatives)
      .orderBy(desc(projectInitiatives.createdAt));
  }

  async getProjectInitiative(id: number): Promise<ProjectInitiative | undefined> {
    const result = await db.select().from(projectInitiatives).where(eq(projectInitiatives.id, id));
    return result[0];
  }

  async createProjectInitiative(initiative: InsertProjectInitiative): Promise<ProjectInitiative> {
    const result = await db.insert(projectInitiatives).values(initiative).returning();
    return result[0];
  }

  async updateProjectInitiative(id: number, initiative: Partial<InsertProjectInitiative>): Promise<ProjectInitiative | undefined> {
    const result = await db.update(projectInitiatives)
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
    return await db.select()
      .from(projectTasks)
      .where(eq(projectTasks.initiativeId, initiativeId))
      .orderBy(projectTasks.orderIndex);
  }

  async getProjectTask(id: number): Promise<ProjectTask | undefined> {
    const result = await db.select().from(projectTasks).where(eq(projectTasks.id, id));
    return result[0];
  }

  async createProjectTask(task: InsertProjectTask): Promise<ProjectTask> {
    const result = await db.insert(projectTasks).values(task).returning();
    return result[0];
  }

  async updateProjectTask(id: number, task: Partial<InsertProjectTask>): Promise<ProjectTask | undefined> {
    const result = await db.update(projectTasks)
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
    return await db.select()
      .from(projectDocuments)
      .where(eq(projectDocuments.initiativeId, initiativeId))
      .orderBy(desc(projectDocuments.updatedAt));
  }

  async getProjectDocument(id: number): Promise<ProjectDocument | undefined> {
    const result = await db.select().from(projectDocuments).where(eq(projectDocuments.id, id));
    return result[0];
  }

  async createProjectDocument(doc: InsertProjectDocument): Promise<ProjectDocument> {
    const result = await db.insert(projectDocuments).values(doc).returning();
    return result[0];
  }

  async updateProjectDocument(id: number, doc: Partial<InsertProjectDocument>): Promise<ProjectDocument | undefined> {
    const result = await db.update(projectDocuments)
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
    return await db.select()
      .from(approvals)
      .where(eq(approvals.documentId, documentId))
      .orderBy(desc(approvals.requestedAt));
  }

  async createApproval(approval: InsertApproval): Promise<Approval> {
    const result = await db.insert(approvals).values(approval).returning();
    return result[0];
  }

  async updateApproval(id: number, approval: Partial<InsertApproval>): Promise<Approval | undefined> {
    const result = await db.update(approvals)
      .set(approval)
      .where(eq(approvals.id, id))
      .returning();
    return result[0];
  }

  async getTaskActivities(taskId: number): Promise<TaskActivity[]> {
    return await db.select()
      .from(taskActivities)
      .where(eq(taskActivities.taskId, taskId))
      .orderBy(desc(taskActivities.createdAt));
  }

  async createTaskActivity(activity: InsertTaskActivity): Promise<TaskActivity> {
    const result = await db.insert(taskActivities).values(activity).returning();
    return result[0];
  }

  async getPublishedDocuments(): Promise<ProjectDocument[]> {
    return await db.select()
      .from(projectDocuments)
      .where(eq(projectDocuments.isPublished, true))
      .orderBy(desc(projectDocuments.publishedAt));
  }

  // Auth methods
  async getEmployeeByEmail(email: string): Promise<Employee | undefined> {
    const result = await db.select()
      .from(employees)
      .where(and(
        eq(employees.email, email),
        eq(employees.isActive, true)
      ));
    return result[0];
  }

  async setEmployeePassword(employeeId: number, passwordHash: string): Promise<Employee | undefined> {
    const result = await db.update(employees)
      .set({ passwordHash })
      .where(eq(employees.id, employeeId))
      .returning();
    return result[0];
  }

  async updateEmployeeLastLogin(employeeId: number): Promise<void> {
    await db.update(employees)
      .set({ lastLoginAt: new Date() })
      .where(eq(employees.id, employeeId));
  }

  // Session methods
  async createSession(session: InsertSession): Promise<Session> {
    const result = await db.insert(sessions).values(session).returning();
    return result[0];
  }

  async getSessionByToken(token: string): Promise<Session | undefined> {
    const result = await db.select()
      .from(sessions)
      .where(and(
        eq(sessions.token, token),
        gt(sessions.expiresAt, new Date())
      ));
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
    const result = await db.delete(sessions)
      .where(lte(sessions.expiresAt, new Date()))
      .returning();
    return result.length;
  }
}

export const storage = new DatabaseStorage();
