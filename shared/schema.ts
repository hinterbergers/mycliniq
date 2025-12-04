import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, date, timestamp, boolean, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User App Role Enum (for authentication/authorization)
export const userAppRoleEnum = pgEnum('user_app_role', [
  'User',
  'Admin',
  'Primararzt',
  '1. Oberarzt',
  'Sekretariat'
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password: text("password").notNull(),
  passwordHash: text("password_hash"),
  appRole: userAppRoleEnum("app_role").notNull().default('User'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => [
  uniqueIndex("users_email_idx").on(table.email)
]);

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
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
  'Student (Famulant)',
  'Sekretariat'
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

// App-wide role system (separate from medical roles)
export const appRoleEnum = pgEnum('app_role', [
  'Admin',
  'Editor', 
  'User'
]);

// Deployment areas for employees
export const deploymentAreaEnum = pgEnum('deployment_area', [
  'Kreißsaal',
  'Gynäkologische Station',
  'Gynäkologische Ambulanz',
  'Schwangerenambulanz',
  'OP',
  'Verwaltung'
]);

// Shift swap request status
export const swapRequestStatusEnum = pgEnum('swap_request_status', [
  'Ausstehend',
  'Genehmigt',
  'Abgelehnt'
]);

// Employees table
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(),
  title: text("title"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  birthday: date("birthday"),
  role: roleEnum("role").notNull(),
  appRole: appRoleEnum("app_role").notNull().default('User'),
  primaryDeploymentArea: deploymentAreaEnum("primary_deployment_area"),
  mainAssignmentAreaId: integer("main_assignment_area_id"),
  shiftPreferences: jsonb("shift_preferences"),
  competencies: text("competencies").array().notNull().default(sql`ARRAY[]::text[]`),
  email: text("email"),
  emailPrivate: text("email_private"),
  phoneWork: text("phone_work"),
  phonePrivate: text("phone_private"),
  showPrivateContact: boolean("show_private_contact").notNull().default(false),
  diplomas: text("diplomas").array().notNull().default(sql`ARRAY[]::text[]`),
  takesShifts: boolean("takes_shifts").notNull().default(true),
  maxShiftsPerWeek: integer("max_shifts_per_week"),
  employmentFrom: date("employment_from"),
  employmentUntil: date("employment_until"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  validUntil: date("valid_until"),
  passwordHash: text("password_hash"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => [
  index("employees_user_id_idx").on(table.userId),
  index("employees_is_active_idx").on(table.isActive)
]);

// User sessions for "stay logged in" functionality
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  token: text("token").notNull().unique(),
  deviceName: text("device_name"),
  isRemembered: boolean("is_remembered").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// Employee Preferences table - for recurring scheduling preferences
export const employeePreferences = pgTable("employee_preferences", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull().unique(),
  preferredOffDays: jsonb("preferred_off_days").$type<number[]>().default(sql`'[]'::jsonb`),
  notesForPlanning: text("notes_for_planning"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => [
  index("employee_preferences_employee_id_idx").on(table.employeeId)
]);

export const insertEmployeePreferencesSchema = createInsertSchema(employeePreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertEmployeePreferences = z.infer<typeof insertEmployeePreferencesSchema>;
export type EmployeePreferences = typeof employeePreferences.$inferSelect;

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

// Weekly assignments for detailed week planning
export const weeklyAssignments = pgTable("weekly_assignments", {
  id: serial("id").primaryKey(),
  weekYear: integer("week_year").notNull(),
  weekNumber: integer("week_number").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  area: text("area").notNull(),
  subArea: text("sub_area").notNull(),
  roleSlot: text("role_slot").notNull(),
  employeeId: integer("employee_id").references(() => employees.id),
  notes: text("notes"),
  isClosed: boolean("is_closed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertWeeklyAssignmentSchema = createInsertSchema(weeklyAssignments).omit({
  id: true,
  createdAt: true
});

export type InsertWeeklyAssignment = z.infer<typeof insertWeeklyAssignmentSchema>;
export type WeeklyAssignment = typeof weeklyAssignments.$inferSelect;

// Project Management Enums
export const projectStatusEnum = pgEnum('project_status', [
  'Entwurf',
  'Aktiv',
  'In Prüfung',
  'Abgeschlossen',
  'Archiviert'
]);

export const taskStatusEnum = pgEnum('task_status', [
  'Offen',
  'In Bearbeitung',
  'Zur Prüfung',
  'Genehmigt',
  'Veröffentlicht'
]);

export const documentStatusEnum = pgEnum('document_status', [
  'Entwurf',
  'In Bearbeitung',
  'Zur Prüfung',
  'Genehmigt',
  'Veröffentlicht'
]);

export const approvalDecisionEnum = pgEnum('approval_decision', [
  'Ausstehend',
  'Genehmigt',
  'Abgelehnt',
  'Überarbeitung nötig'
]);

export const knowledgeCategoryEnum = pgEnum('knowledge_category', [
  'SOP',
  'Leitlinie',
  'Protokoll',
  'Checkliste',
  'Formular',
  'Schulung',
  'Sonstiges'
]);

// Project Initiatives table
export const projectInitiatives = pgTable("project_initiatives", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: projectStatusEnum("status").notNull().default('Entwurf'),
  createdById: integer("created_by_id").references(() => employees.id).notNull(),
  dueDate: date("due_date"),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const insertProjectInitiativeSchema = createInsertSchema(projectInitiatives).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertProjectInitiative = z.infer<typeof insertProjectInitiativeSchema>;
export type ProjectInitiative = typeof projectInitiatives.$inferSelect;

// Project Tasks table (with hierarchical support via parentTaskId)
export const projectTasks = pgTable("project_tasks", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id").references(() => projectInitiatives.id).notNull(),
  parentTaskId: integer("parent_task_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default('Offen'),
  assignedToId: integer("assigned_to_id").references(() => employees.id),
  createdById: integer("created_by_id").references(() => employees.id).notNull(),
  dueDate: date("due_date"),
  priority: integer("priority").notNull().default(0),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;

// Project Documents table
export const projectDocuments = pgTable("project_documents", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id").references(() => projectInitiatives.id).notNull(),
  taskId: integer("task_id").references(() => projectTasks.id),
  title: text("title").notNull(),
  status: documentStatusEnum("status").notNull().default('Entwurf'),
  content: text("content"),
  version: integer("version").notNull().default(1),
  createdById: integer("created_by_id").references(() => employees.id).notNull(),
  lastEditedById: integer("last_edited_by_id").references(() => employees.id),
  category: knowledgeCategoryEnum("category").notNull().default('SOP'),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const insertProjectDocumentSchema = createInsertSchema(projectDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;
export type ProjectDocument = typeof projectDocuments.$inferSelect;

// Document Version History
export const documentVersions = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => projectDocuments.id).notNull(),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(),
  changeSummary: text("change_summary"),
  authorId: integer("author_id").references(() => employees.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertDocumentVersionSchema = createInsertSchema(documentVersions).omit({
  id: true,
  createdAt: true
});

export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;
export type DocumentVersion = typeof documentVersions.$inferSelect;

// Approvals table
export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => projectDocuments.id).notNull(),
  requestedById: integer("requested_by_id").references(() => employees.id).notNull(),
  approverId: integer("approver_id").references(() => employees.id),
  decision: approvalDecisionEnum("decision").notNull().default('Ausstehend'),
  notes: text("notes"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at")
});

export const insertApprovalSchema = createInsertSchema(approvals).omit({
  id: true,
  requestedAt: true
});

export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvals.$inferSelect;

// Task Activity/Comments
export const taskActivities = pgTable("task_activities", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => projectTasks.id).notNull(),
  authorId: integer("author_id").references(() => employees.id).notNull(),
  message: text("message").notNull(),
  activityType: text("activity_type").notNull().default('comment'),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertTaskActivitySchema = createInsertSchema(taskActivities).omit({
  id: true,
  createdAt: true
});

export type InsertTaskActivity = z.infer<typeof insertTaskActivitySchema>;
export type TaskActivity = typeof taskActivities.$inferSelect;

// Shift Swap Requests table
export const shiftSwapRequests = pgTable("shift_swap_requests", {
  id: serial("id").primaryKey(),
  requesterShiftId: integer("requester_shift_id").references(() => rosterShifts.id).notNull(),
  targetShiftId: integer("target_shift_id").references(() => rosterShifts.id),
  requesterId: integer("requester_id").references(() => employees.id).notNull(),
  targetEmployeeId: integer("target_employee_id").references(() => employees.id),
  status: swapRequestStatusEnum("status").notNull().default('Ausstehend'),
  reason: text("reason"),
  approverId: integer("approver_id").references(() => employees.id),
  approverNotes: text("approver_notes"),
  hasCompetencyConflict: boolean("has_competency_conflict").notNull().default(false),
  competencyConflictDetails: text("competency_conflict_details"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at")
});

export const insertShiftSwapRequestSchema = createInsertSchema(shiftSwapRequests).omit({
  id: true,
  requestedAt: true
});

export type InsertShiftSwapRequest = z.infer<typeof insertShiftSwapRequestSchema>;
export type ShiftSwapRequest = typeof shiftSwapRequests.$inferSelect;

// Roster Settings table - tracks which month is currently approved and open for planning
export const rosterSettings = pgTable("roster_settings", {
  id: serial("id").primaryKey(),
  lastApprovedYear: integer("last_approved_year").notNull(),
  lastApprovedMonth: integer("last_approved_month").notNull(),
  updatedById: integer("updated_by_id").references(() => employees.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const insertRosterSettingsSchema = createInsertSchema(rosterSettings).omit({
  id: true,
  updatedAt: true
});

export type InsertRosterSettings = z.infer<typeof insertRosterSettingsSchema>;
export type RosterSettings = typeof rosterSettings.$inferSelect;

// Shift wish status
export const wishStatusEnum = pgEnum('wish_status', [
  'Entwurf',
  'Eingereicht'
]);

// Shift Wishes table - employee preferences for upcoming roster planning month
export const shiftWishes = pgTable("shift_wishes", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  status: wishStatusEnum("status").notNull().default('Entwurf'),
  preferredShiftDays: jsonb("preferred_shift_days").$type<number[]>(),
  avoidShiftDays: jsonb("avoid_shift_days").$type<number[]>(),
  preferredServiceTypes: jsonb("preferred_service_types").$type<string[]>(),
  avoidServiceTypes: jsonb("avoid_service_types").$type<string[]>(),
  maxShiftsPerWeek: integer("max_shifts_per_week"),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const insertShiftWishSchema = createInsertSchema(shiftWishes).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertShiftWish = z.infer<typeof insertShiftWishSchema>;
export type ShiftWish = typeof shiftWishes.$inferSelect;

// Planned Absences table - for requesting time off for the planning month
export const plannedAbsences = pgTable("planned_absences", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: absenceReasonEnum("reason").notNull(),
  notes: text("notes"),
  isApproved: boolean("is_approved"),
  approvedById: integer("approved_by_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertPlannedAbsenceSchema = createInsertSchema(plannedAbsences).omit({
  id: true,
  createdAt: true
});

export type InsertPlannedAbsence = z.infer<typeof insertPlannedAbsenceSchema>;
export type PlannedAbsence = typeof plannedAbsences.$inferSelect;
