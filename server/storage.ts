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
  users,
  employees,
  rosterShifts,
  absences,
  resources
} from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
