import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, date, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Define enums for roster system
export const roleEnum = pgEnum('role', [
  'Primararzt',
  '1. Oberarzt',
  'Oberarzt',
  'Oberärztin',
  'Facharzt',
  'Assistenzarzt',
  'Assistenzärztin',
  'Turnusarzt',
  'Student (KPJ)',
  'Student (Famulant)'
]);

export const serviceTypeEnum = pgEnum('service_type', ['gyn', 'kreiszimmer', 'turnus']);

export const absenceReasonEnum = pgEnum('absence_reason', [
  'Urlaub',
  'Krankenstand',
  'Fortbildung',
  'Ruhezeit',
  'Zeitausgleich',
  'Gebührenurlaub',
  'Sonderurlaub',
  'Zusatzurlaub',
  'Pflegeurlaub',
  'Quarantäne'
]);

// Employees table
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull(),
  competencies: text("competencies").array().notNull().default(sql`ARRAY[]::text[]`),
  email: text("email"),
  isActive: boolean("is_active").notNull().default(true),
  validUntil: date("valid_until"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// Roster shifts table
export const rosterShifts = pgTable("roster_shifts", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  serviceType: serviceTypeEnum("service_type").notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertRosterShiftSchema = createInsertSchema(rosterShifts).omit({
  id: true,
  createdAt: true
});

export type InsertRosterShift = z.infer<typeof insertRosterShiftSchema>;
export type RosterShift = typeof rosterShifts.$inferSelect;

// Absences table
export const absences = pgTable("absences", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: absenceReasonEnum("reason").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertAbsenceSchema = createInsertSchema(absences).omit({
  id: true,
  createdAt: true
});

export type InsertAbsence = z.infer<typeof insertAbsenceSchema>;
export type Absence = typeof absences.$inferSelect;

// Resources/Rooms table
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  blockReason: text("block_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertResourceSchema = createInsertSchema(resources).omit({
  id: true,
  createdAt: true
});

export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resources.$inferSelect;
