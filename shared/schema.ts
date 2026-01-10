import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  serial,
  integer,
  date,
  timestamp,
  boolean,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
  time,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { LongTermWishRule } from "./shiftTypes";
export type { LongTermWishRule } from "./shiftTypes";
import { z } from "zod";

// User App Role Enum (for authentication/authorization)
export const userAppRoleEnum = pgEnum("user_app_role", [
  "User",
  "Admin",
  "Primararzt",
  "1. Oberarzt",
  "Sekretariat",
]);

export const users = pgTable(
  "users",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    username: text("username").notNull().unique(),
    email: text("email").unique(),
    password: text("password").notNull(),
    passwordHash: text("password_hash"),
    appRole: userAppRoleEnum("app_role").notNull().default("User"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Define enums for roster system
export const roleEnum = pgEnum("role", [
  "Primararzt",
  "1. Oberarzt",
  "Funktionsoberarzt",
  "Ausbildungsoberarzt",
  "Oberarzt",
  "Oberärztin",
  "Facharzt",
  "Assistenzarzt",
  "Assistenzärztin",
  "Turnusarzt",
  "Student (KPJ)",
  "Student (Famulant)",
  "Sekretariat",
]);

export const serviceTypeEnum = pgEnum("service_type", [
  "gyn",
  "kreiszimmer",
  "turnus",
  "overduty",
]);

export const absenceReasonEnum = pgEnum("absence_reason", [
  "Urlaub",
  "Krankenstand",
  "Fortbildung",
  "Ruhezeit",
  "Zeitausgleich",
  "Gebührenurlaub",
  "Sonderurlaub",
  "Zusatzurlaub",
  "Pflegeurlaub",
  "Quarantäne",
]);

// App-wide role system (separate from medical roles)
export const appRoleEnum = pgEnum("app_role", ["Admin", "Editor", "User"]);

// System roles for two-tier permission system
export const systemRoleEnum = pgEnum("system_role", [
  "employee",
  "department_admin",
  "clinic_admin",
  "system_admin",
]);

// Deployment areas for employees
export const deploymentAreaEnum = pgEnum("deployment_area", [
  "Kreißsaal",
  "Gynäkologische Station",
  "Gynäkologische Ambulanz",
  "Schwangerenambulanz",
  "OP",
  "Verwaltung",
]);

// Shift swap request status
export const swapRequestStatusEnum = pgEnum("swap_request_status", [
  "Ausstehend",
  "Genehmigt",
  "Abgelehnt",
]);

// Planned absence status enum
export const plannedAbsenceStatusEnum = pgEnum("planned_absence_status", [
  "Geplant",
  "Genehmigt",
  "Abgelehnt",
]);

export const vacationRuleTypeEnum = pgEnum("vacation_rule_type", [
  "role_min",
  "competency_min",
  "total_min",
  "training_priority",
]);

export const vacationRoleGroupEnum = pgEnum("vacation_role_group", [
  "ASS",
  "OA",
  "TA",
]);

// Room category enum
export const roomCategoryEnum = pgEnum("room_category", [
  "Geburtshilfe",
  "Gynäkologie",
  "OP",
  "Ambulanz",
  "Spezialambulanz",
  "Besprechung",
  "Station",
  "Verwaltung",
  "Sonstiges",
]);

export const roomWeekdayRecurrenceEnum = pgEnum("room_weekday_recurrence", [
  "weekly",
  "monthly_first_third",
  "monthly_once",
]);

// Competency relation type enum (for room requirements)
export const competencyRelationTypeEnum = pgEnum("competency_relation_type", [
  "AND",
  "OR",
]);

// Duty plan status enum
export const dutyPlanStatusEnum = pgEnum("duty_plan_status", [
  "Entwurf",
  "Vorläufig",
  "Freigegeben",
]);

// Weekly plan status enum
export const weeklyPlanStatusEnum = pgEnum("weekly_plan_status", [
  "Entwurf",
  "Vorläufig",
  "Freigegeben",
]);

// Duty slot service type enum
export const dutySlotServiceTypeEnum = pgEnum("duty_slot_service_type", [
  "gyn",
  "kreiszimmer",
  "turnus",
  "oa_dienst",
  "fa_dienst",
  "tagdienst",
  "nachtdienst",
]);

// Weekly assignment type enum
export const weeklyAssignmentTypeEnum = pgEnum("weekly_assignment_type", [
  "Plan",
  "Zeitausgleich",
  "Fortbildung",
]);

// Clinics table
export const clinics = pgTable(
  "clinics",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    timezone: text("timezone").notNull().default("Europe/Vienna"),
    country: text("country").notNull().default("AT"),
    state: text("state").notNull().default("AT-2"),
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("clinics_slug_idx").on(table.slug)],
);

export const insertClinicSchema = createInsertSchema(clinics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinics.$inferSelect;

// Departments table
export const departments = pgTable(
  "departments",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id")
      .references(() => clinics.id)
      .notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("departments_clinic_id_idx").on(table.clinicId),
    uniqueIndex("departments_clinic_slug_idx").on(table.clinicId, table.slug),
  ],
);

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

// Service lines (Dienstschienen) table
export const serviceLines = pgTable(
  "service_lines",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id")
      .references(() => clinics.id)
      .notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    roleGroup: text("role_group").notNull().default("ALL"),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    endsNextDay: boolean("ends_next_day").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("service_lines_clinic_id_idx").on(table.clinicId),
    uniqueIndex("service_lines_clinic_key_idx").on(table.clinicId, table.key),
  ],
);

export const insertServiceLineSchema = createInsertSchema(serviceLines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertServiceLine = z.infer<typeof insertServiceLineSchema>;
export type ServiceLine = typeof serviceLines.$inferSelect;

// Employees table
export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").references(() => users.id),
    departmentId: integer("department_id").references(() => departments.id),
    systemRole: systemRoleEnum("system_role").notNull().default("employee"),
    name: text("name").notNull(),
    title: text("title"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    birthday: date("birthday"),
    role: roleEnum("role").notNull(),
    appRole: appRoleEnum("app_role").notNull().default("User"),
    primaryDeploymentArea: deploymentAreaEnum("primary_deployment_area"),
    mainAssignmentAreaId: integer("main_assignment_area_id"),
    shiftPreferences: jsonb("shift_preferences"),
    competencies: text("competencies")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    email: text("email"),
    emailPrivate: text("email_private"),
    phoneWork: text("phone_work"),
    phonePrivate: text("phone_private"),
    showPrivateContact: boolean("show_private_contact")
      .notNull()
      .default(false),
    diplomas: text("diplomas")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    takesShifts: boolean("takes_shifts").notNull().default(true),
    canOverduty: boolean("can_overduty").notNull().default(false),
    vacationEntitlement: integer("vacation_entitlement"),
    maxShiftsPerWeek: integer("max_shifts_per_week"),
    employmentFrom: date("employment_from"),
    employmentUntil: date("employment_until"),
    isAdmin: boolean("is_admin").notNull().default(false),
    inactiveFrom: date("inactive_from"),
    inactiveUntil: date("inactive_until"),
    inactiveReason: text("inactive_reason"),
    isActive: boolean("is_active").notNull().default(true),
    validUntil: date("valid_until"),
    passwordHash: text("password_hash"),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("employees_user_id_idx").on(table.userId),
    index("employees_department_id_idx").on(table.departmentId),
    index("employees_is_active_idx").on(table.isActive),
  ],
);

// Permissions table
export const permissions = pgTable(
  "permissions",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    scope: text("scope").notNull().default("department"), // 'department' or 'clinic'
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("permissions_key_idx").on(table.key)],
);

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

// User permissions junction table (many-to-many with department context)
export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: integer("user_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    departmentId: integer("department_id")
      .references(() => departments.id, { onDelete: "cascade" })
      .notNull(),
    permissionId: integer("permission_id")
      .references(() => permissions.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.departmentId, table.permissionId],
    }),
    index("user_permissions_user_id_idx").on(table.userId),
    index("user_permissions_department_id_idx").on(table.departmentId),
    index("user_permissions_permission_id_idx").on(table.permissionId),
  ],
);

export const insertUserPermissionSchema = createInsertSchema(
  userPermissions,
).omit({
  createdAt: true,
});

export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;

// User sessions for "stay logged in" functionality
export const sessions = pgTable("sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  employeeId: integer("employee_id")
    .references(() => employees.id)
    .notNull(),
  token: text("token").notNull().unique(),
  deviceName: text("device_name"),
  isRemembered: boolean("is_remembered").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// Employee Preferences table - for recurring scheduling preferences
export const employeePreferences = pgTable(
  "employee_preferences",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .references(() => employees.id)
      .notNull()
      .unique(),
    preferredOffDays: jsonb("preferred_off_days")
      .$type<number[]>()
      .default(sql`'[]'::jsonb`),
    notesForPlanning: text("notes_for_planning"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("employee_preferences_employee_id_idx").on(table.employeeId),
  ],
);

export const insertEmployeePreferencesSchema = createInsertSchema(
  employeePreferences,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeePreferences = z.infer<
  typeof insertEmployeePreferencesSchema
>;
export type EmployeePreferences = typeof employeePreferences.$inferSelect;

// Competencies table - medical qualifications and certifications
export const competencies = pgTable(
  "competencies",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    prerequisites: text("prerequisites"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("competencies_code_idx").on(table.code)],
);

export const insertCompetencySchema = createInsertSchema(competencies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCompetency = z.infer<typeof insertCompetencySchema>;
export type Competency = typeof competencies.$inferSelect;

// Diplomas table - formal certifications (e.g. ÖGUM II)
export const diplomas = pgTable(
  "diplomas",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("diplomas_name_idx").on(table.name)],
);

export const insertDiplomaSchema = createInsertSchema(diplomas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiploma = z.infer<typeof insertDiplomaSchema>;
export type Diploma = typeof diplomas.$inferSelect;

// Employee Competencies junction table (many-to-many)
export const employeeCompetencies = pgTable(
  "employee_competencies",
  {
    employeeId: integer("employee_id")
      .references(() => employees.id)
      .notNull(),
    competencyId: integer("competency_id")
      .references(() => competencies.id)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.employeeId, table.competencyId] }),
    index("employee_competencies_employee_id_idx").on(table.employeeId),
    index("employee_competencies_competency_id_idx").on(table.competencyId),
  ],
);

export const insertEmployeeCompetencySchema =
  createInsertSchema(employeeCompetencies);

export type InsertEmployeeCompetency = z.infer<
  typeof insertEmployeeCompetencySchema
>;
export type EmployeeCompetency = typeof employeeCompetencies.$inferSelect;

// Vacation rules for absence planning (per department)
export const vacationRules = pgTable(
  "vacation_rules",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .references(() => departments.id)
      .notNull(),
    ruleType: vacationRuleTypeEnum("rule_type").notNull(),
    minCount: integer("min_count").notNull().default(0),
    roleGroup: vacationRoleGroupEnum("role_group"),
    competencyId: integer("competency_id").references(() => competencies.id),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdById: integer("created_by_id").references(() => employees.id),
    updatedById: integer("updated_by_id").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("vacation_rules_department_idx").on(table.departmentId),
    index("vacation_rules_competency_idx").on(table.competencyId),
  ],
);

export const insertVacationRuleSchema = createInsertSchema(vacationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVacationRule = z.infer<typeof insertVacationRuleSchema>;
export type VacationRule = typeof vacationRules.$inferSelect;

// Employee Diplomas junction table (many-to-many)
export const employeeDiplomas = pgTable(
  "employee_diplomas",
  {
    employeeId: integer("employee_id")
      .references(() => employees.id)
      .notNull(),
    diplomaId: integer("diploma_id")
      .references(() => diplomas.id)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.employeeId, table.diplomaId] }),
    index("employee_diplomas_employee_id_idx").on(table.employeeId),
    index("employee_diplomas_diploma_id_idx").on(table.diplomaId),
  ],
);

export const insertEmployeeDiplomaSchema = createInsertSchema(employeeDiplomas);

export type InsertEmployeeDiploma = z.infer<typeof insertEmployeeDiplomaSchema>;
export type EmployeeDiploma = typeof employeeDiplomas.$inferSelect;

// Competency Diplomas junction table (many-to-many prerequisites)
export const competencyDiplomas = pgTable(
  "competency_diplomas",
  {
    competencyId: integer("competency_id")
      .references(() => competencies.id)
      .notNull(),
    diplomaId: integer("diploma_id")
      .references(() => diplomas.id)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.competencyId, table.diplomaId] }),
    index("competency_diplomas_competency_id_idx").on(table.competencyId),
    index("competency_diplomas_diploma_id_idx").on(table.diplomaId),
  ],
);

export const insertCompetencyDiplomaSchema =
  createInsertSchema(competencyDiplomas);

export type InsertCompetencyDiploma = z.infer<
  typeof insertCompetencyDiplomaSchema
>;
export type CompetencyDiploma = typeof competencyDiplomas.$inferSelect;

// Roster shifts table
export const rosterShifts = pgTable("roster_shifts", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  serviceType: text("service_type").notNull(),
  employeeId: integer("employee_id").references(() => employees.id),
  assigneeFreeText: text("assignee_free_text"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRosterShiftSchema = createInsertSchema(rosterShifts)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    employeeId: z.number().nullable().optional(),
    assigneeFreeText: z.string().nullable().optional(),
  });

export type InsertRosterShift = z.infer<typeof insertRosterShiftSchema>;
export type RosterShift = typeof rosterShifts.$inferSelect;

// Absences table
export const absences = pgTable("absences", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .references(() => employees.id)
    .notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: absenceReasonEnum("reason").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAbsenceSchema = createInsertSchema(absences).omit({
  id: true,
  createdAt: true,
});

export type InsertAbsence = z.infer<typeof insertAbsenceSchema>;
export type Absence = typeof absences.$inferSelect;

// Rooms table (extended resources)
export const rooms = pgTable(
  "rooms",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    category: roomCategoryEnum("category").notNull().default("Sonstiges"),
    description: text("description"),
    useInWeeklyPlan: boolean("use_in_weekly_plan").notNull().default(true),
    weeklyPlanSortOrder: integer("weekly_plan_sort_order").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    blockReason: text("block_reason"),
    requiredRoleCompetencies: text("required_role_competencies")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    alternativeRoleCompetencies: text("alternative_role_competencies")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("rooms_category_idx").on(table.category),
    index("rooms_is_active_idx").on(table.isActive),
  ],
);

export const insertRoomSchema = createInsertSchema(rooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;

// Legacy alias for backward compatibility
export const resources = rooms;
export const insertResourceSchema = insertRoomSchema;
export type InsertResource = InsertRoom;
export type Resource = Room;

// Physical rooms table (actual spaces like Ultraschall 1, Ambulanz 1)
export const physicalRooms = pgTable(
  "physical_rooms",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("physical_rooms_name_idx").on(table.name),
    index("physical_rooms_is_active_idx").on(table.isActive),
  ],
);

export const insertPhysicalRoomSchema = createInsertSchema(physicalRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPhysicalRoom = z.infer<typeof insertPhysicalRoomSchema>;
export type PhysicalRoom = typeof physicalRooms.$inferSelect;

// Workplaces (rooms) to physical rooms mapping (many-to-many)
export const roomPhysicalRooms = pgTable(
  "room_physical_rooms",
  {
    roomId: integer("room_id")
      .references(() => rooms.id)
      .notNull(),
    physicalRoomId: integer("physical_room_id")
      .references(() => physicalRooms.id)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.physicalRoomId] }),
    index("room_physical_rooms_room_id_idx").on(table.roomId),
    index("room_physical_rooms_physical_room_id_idx").on(table.physicalRoomId),
  ],
);

export const insertRoomPhysicalRoomSchema =
  createInsertSchema(roomPhysicalRooms);

export type InsertRoomPhysicalRoom = z.infer<
  typeof insertRoomPhysicalRoomSchema
>;
export type RoomPhysicalRoom = typeof roomPhysicalRooms.$inferSelect;

// Room weekday settings - recurring schedules per room
export const roomWeekdaySettings = pgTable(
  "room_weekday_settings",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .references(() => rooms.id)
      .notNull(),
    weekday: integer("weekday").notNull(),
    recurrence: roomWeekdayRecurrenceEnum("recurrence")
      .notNull()
      .default("weekly"),
    usageLabel: text("usage_label"),
    timeFrom: time("time_from"),
    timeTo: time("time_to"),
    isClosed: boolean("is_closed").notNull().default(false),
    closedReason: text("closed_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("room_weekday_settings_room_id_idx").on(table.roomId),
    index("room_weekday_settings_weekday_idx").on(table.weekday),
  ],
);

export const insertRoomWeekdaySettingSchema = createInsertSchema(
  roomWeekdaySettings,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRoomWeekdaySetting = z.infer<
  typeof insertRoomWeekdaySettingSchema
>;
export type RoomWeekdaySetting = typeof roomWeekdaySettings.$inferSelect;

// Room required competencies - which competencies are needed for a room
export const roomRequiredCompetencies = pgTable(
  "room_required_competencies",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .references(() => rooms.id)
      .notNull(),
    competencyId: integer("competency_id")
      .references(() => competencies.id)
      .notNull(),
    relationType: competencyRelationTypeEnum("relation_type")
      .notNull()
      .default("AND"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("room_required_competencies_room_id_idx").on(table.roomId),
    index("room_required_competencies_competency_id_idx").on(
      table.competencyId,
    ),
  ],
);

export const insertRoomRequiredCompetencySchema = createInsertSchema(
  roomRequiredCompetencies,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRoomRequiredCompetency = z.infer<
  typeof insertRoomRequiredCompetencySchema
>;
export type RoomRequiredCompetency =
  typeof roomRequiredCompetencies.$inferSelect;

// ============================================================================
// DUTY PLANNING TABLES (Dienstplan)
// ============================================================================

// Monthly duty plans container
export const dutyPlans = pgTable(
  "duty_plans",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: dutyPlanStatusEnum("status").notNull().default("Entwurf"),
    generatedById: integer("generated_by_id").references(() => employees.id),
    releasedById: integer("released_by_id").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("duty_plans_year_month_idx").on(table.year, table.month),
    index("duty_plans_status_idx").on(table.status),
  ],
);

export const insertDutyPlanSchema = createInsertSchema(dutyPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDutyPlan = z.infer<typeof insertDutyPlanSchema>;
export type DutyPlan = typeof dutyPlans.$inferSelect;

// Days within a duty plan
export const dutyDays = pgTable(
  "duty_days",
  {
    id: serial("id").primaryKey(),
    dutyPlanId: integer("duty_plan_id")
      .references(() => dutyPlans.id)
      .notNull(),
    date: date("date").notNull(),
  },
  (table) => [
    uniqueIndex("duty_days_plan_date_idx").on(table.dutyPlanId, table.date),
    index("duty_days_date_idx").on(table.date),
  ],
);

export const insertDutyDaySchema = createInsertSchema(dutyDays).omit({
  id: true,
});

export type InsertDutyDay = z.infer<typeof insertDutyDaySchema>;
export type DutyDay = typeof dutyDays.$inferSelect;

// Time slots within duty days
export const dutySlots = pgTable(
  "duty_slots",
  {
    id: serial("id").primaryKey(),
    dutyDayId: integer("duty_day_id")
      .references(() => dutyDays.id)
      .notNull(),
    serviceType: dutySlotServiceTypeEnum("service_type").notNull(),
    label: text("label").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (table) => [
    index("duty_slots_duty_day_id_idx").on(table.dutyDayId),
    index("duty_slots_service_type_idx").on(table.serviceType),
  ],
);

export const insertDutySlotSchema = createInsertSchema(dutySlots).omit({
  id: true,
});

export type InsertDutySlot = z.infer<typeof insertDutySlotSchema>;
export type DutySlot = typeof dutySlots.$inferSelect;

// Employee assignments to duty slots
export const dutyAssignments = pgTable(
  "duty_assignments",
  {
    id: serial("id").primaryKey(),
    dutySlotId: integer("duty_slot_id")
      .references(() => dutySlots.id)
      .notNull(),
    employeeId: integer("employee_id")
      .references(() => employees.id)
      .notNull(),
    roleBadge: text("role_badge"),
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("duty_assignments_slot_id_idx").on(table.dutySlotId),
    index("duty_assignments_employee_id_idx").on(table.employeeId),
  ],
);

export const insertDutyAssignmentSchema = createInsertSchema(
  dutyAssignments,
).omit({
  id: true,
  createdAt: true,
});

export type InsertDutyAssignment = z.infer<typeof insertDutyAssignmentSchema>;
export type DutyAssignment = typeof dutyAssignments.$inferSelect;

// ============================================================================
// WEEKLY PLANNING TABLES (Wochenplan)
// ============================================================================

// Weekly plans container
export const weeklyPlans = pgTable(
  "weekly_plans",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    weekNumber: integer("week_number").notNull(),
    status: weeklyPlanStatusEnum("status").notNull().default("Entwurf"),
    lockedWeekdays: integer("locked_weekdays")
      .array()
      .notNull()
      .default(sql`ARRAY[]::int[]`),
    generatedFromDutyPlanId: integer("generated_from_duty_plan_id").references(
      () => dutyPlans.id,
    ),
    createdById: integer("created_by_id").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("weekly_plans_year_week_idx").on(table.year, table.weekNumber),
    index("weekly_plans_status_idx").on(table.status),
  ],
);

export const insertWeeklyPlanSchema = createInsertSchema(weeklyPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWeeklyPlan = z.infer<typeof insertWeeklyPlanSchema>;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;

// Weekly plan assignments (new structured version)
export const weeklyPlanAssignments = pgTable(
  "weekly_plan_assignments",
  {
    id: serial("id").primaryKey(),
    weeklyPlanId: integer("weekly_plan_id")
      .references(() => weeklyPlans.id)
      .notNull(),
    roomId: integer("room_id")
      .references(() => rooms.id)
      .notNull(),
    weekday: integer("weekday").notNull(),
    employeeId: integer("employee_id").references(() => employees.id),
    roleLabel: text("role_label"),
    assignmentType: weeklyAssignmentTypeEnum("assignment_type")
      .notNull()
      .default("Plan"),
    note: text("note"),
    isBlocked: boolean("is_blocked").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("weekly_plan_assignments_plan_id_idx").on(table.weeklyPlanId),
    index("weekly_plan_assignments_room_id_idx").on(table.roomId),
    index("weekly_plan_assignments_employee_id_idx").on(table.employeeId),
    index("weekly_plan_assignments_weekday_idx").on(table.weekday),
  ],
);

export const insertWeeklyPlanAssignmentSchema = createInsertSchema(
  weeklyPlanAssignments,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWeeklyPlanAssignment = z.infer<
  typeof insertWeeklyPlanAssignmentSchema
>;
export type WeeklyPlanAssignment = typeof weeklyPlanAssignments.$inferSelect;

// ============================================================================
// DAILY OVERRIDES (Tages-Overrides)
// ============================================================================

// Daily overrides for ad-hoc changes
export const dailyOverrides = pgTable(
  "daily_overrides",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    roomId: integer("room_id")
      .references(() => rooms.id)
      .notNull(),
    originalEmployeeId: integer("original_employee_id").references(
      () => employees.id,
    ),
    newEmployeeId: integer("new_employee_id").references(() => employees.id),
    reason: text("reason"),
    createdById: integer("created_by_id")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("daily_overrides_date_idx").on(table.date),
    index("daily_overrides_room_id_idx").on(table.roomId),
    index("daily_overrides_original_employee_idx").on(table.originalEmployeeId),
    index("daily_overrides_new_employee_idx").on(table.newEmployeeId),
  ],
);

export const insertDailyOverrideSchema = createInsertSchema(
  dailyOverrides,
).omit({
  id: true,
  createdAt: true,
});

export type InsertDailyOverride = z.infer<typeof insertDailyOverrideSchema>;
export type DailyOverride = typeof dailyOverrides.$inferSelect;

// Legacy weekly assignments for detailed week planning (kept for backward compatibility)
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWeeklyAssignmentSchema = createInsertSchema(
  weeklyAssignments,
).omit({
  id: true,
  createdAt: true,
});

export type InsertWeeklyAssignment = z.infer<
  typeof insertWeeklyAssignmentSchema
>;
export type WeeklyAssignment = typeof weeklyAssignments.$inferSelect;

// Project Management Enums
export const projectStatusEnum = pgEnum("project_status", [
  "Entwurf",
  "Aktiv",
  "In Prüfung",
  "Abgeschlossen",
  "Archiviert",
  "proposed",
  "active",
  "done",
  "archived",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "Offen",
  "In Bearbeitung",
  "Zur Prüfung",
  "Genehmigt",
  "Veröffentlicht",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "Entwurf",
  "In Bearbeitung",
  "Zur Prüfung",
  "Genehmigt",
  "Veröffentlicht",
]);

export const approvalDecisionEnum = pgEnum("approval_decision", [
  "Ausstehend",
  "Genehmigt",
  "Abgelehnt",
  "Überarbeitung nötig",
]);

export const knowledgeCategoryEnum = pgEnum("knowledge_category", [
  "SOP",
  "Leitlinie",
  "Protokoll",
  "Checkliste",
  "Formular",
  "Schulung",
  "Sonstiges",
]);

// SOP-specific enums
export const sopCategoryEnum = pgEnum("sop_category", [
  "SOP",
  "Dienstanweisung",
  "Aufklärungen",
  "Checkliste",
  "Formular",
  "Leitlinie",
]);

export const sopStatusEnum = pgEnum("sop_status", [
  "Entwurf",
  "In Review",
  "Freigegeben",
  "proposed",
  "in_progress",
  "review",
  "published",
  "archived",
]);

export const sopMemberRoleEnum = pgEnum("sop_member_role", ["read", "edit"]);

export const sopReferenceTypeEnum = pgEnum("sop_reference_type", [
  "awmf",
  "guideline",
  "study",
  "other",
]);

export const sopReferenceStatusEnum = pgEnum("sop_reference_status", [
  "suggested",
  "accepted",
  "rejected",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "system",
  "sop",
  "project",
  "message",
]);

export const messageThreadTypeEnum = pgEnum("message_thread_type", [
  "direct",
  "group",
]);

export const messageThreadRoleEnum = pgEnum("message_thread_role", [
  "owner",
  "member",
]);

// Project category enum
export const projectCategoryEnum = pgEnum("project_category", [
  "SOP",
  "Studie",
  "Administrativ",
  "Qualitätsprojekt",
]);

// Project member role enum
export const projectMemberRoleEnum = pgEnum("project_member_role", [
  "Mitarbeit",
  "Review",
  "Leitung",
  "read",
  "edit",
]);

// SOPs table - standalone SOPs and clinical documents
export const sops = pgTable("sops", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: sopCategoryEnum("category").notNull().default("SOP"),
  version: text("version").notNull().default("1.0"),
  status: sopStatusEnum("status").notNull().default("proposed"),
  contentMarkdown: text("content_markdown"),
  keywords: jsonb("keywords").$type<string[]>(),
  awmfLink: text("awmf_link"),
  currentVersionId: integer("current_version_id"),
  basedOnVersionId: integer("based_on_version_id"),
  createdById: integer("created_by_id")
    .references(() => employees.id)
    .notNull(),
  approvedById: integer("approved_by_id").references(() => employees.id),
  publishedAt: timestamp("published_at"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSopSchema = createInsertSchema(sops).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSop = z.infer<typeof insertSopSchema>;
export type Sop = typeof sops.$inferSelect;

// SOP members table
export const sopMembers = pgTable(
  "sop_members",
  {
    sopId: integer("sop_id")
      .references(() => sops.id, { onDelete: "cascade" })
      .notNull(),
    employeeId: integer("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    role: sopMemberRoleEnum("role").notNull().default("read"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.sopId, table.employeeId] })],
);

export const insertSopMemberSchema = createInsertSchema(sopMembers).omit({
  joinedAt: true,
});

export type InsertSopMember = z.infer<typeof insertSopMemberSchema>;
export type SopMember = typeof sopMembers.$inferSelect;

// SOP version history
export const sopVersions = pgTable("sop_versions", {
  id: serial("id").primaryKey(),
  sopId: integer("sop_id")
    .references(() => sops.id, { onDelete: "cascade" })
    .notNull(),
  versionNumber: integer("version_number").notNull(),
  title: text("title").notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  changeNote: text("change_note"),
  releasedById: integer("released_by_id")
    .references(() => employees.id)
    .notNull(),
  releasedAt: timestamp("released_at").defaultNow().notNull(),
});

export const insertSopVersionSchema = createInsertSchema(sopVersions).omit({
  id: true,
  releasedAt: true,
});

export type InsertSopVersion = z.infer<typeof insertSopVersionSchema>;
export type SopVersion = typeof sopVersions.$inferSelect;

// SOP references
export const sopReferences = pgTable("sop_references", {
  id: serial("id").primaryKey(),
  sopId: integer("sop_id")
    .references(() => sops.id, { onDelete: "cascade" })
    .notNull(),
  type: sopReferenceTypeEnum("type").notNull(),
  status: sopReferenceStatusEnum("status").notNull().default("suggested"),
  title: text("title").notNull(),
  url: text("url"),
  publisher: text("publisher"),
  yearOrVersion: text("year_or_version"),
  relevanceNote: text("relevance_note"),
  createdById: integer("created_by_id").references(() => employees.id),
  createdByAi: boolean("created_by_ai").notNull().default(false),
  verifiedById: integer("verified_by_id").references(() => employees.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSopReferenceSchema = createInsertSchema(sopReferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  verifiedAt: true,
});

export type InsertSopReference = z.infer<typeof insertSopReferenceSchema>;
export type SopReference = typeof sopReferences.$inferSelect;

// Project Initiatives table (extended with category and owner)
export const projectInitiatives = pgTable("project_initiatives", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: projectCategoryEnum("category").notNull().default("SOP"),
  status: projectStatusEnum("status").notNull().default("proposed"),
  ownerId: integer("owner_id").references(() => employees.id),
  createdById: integer("created_by_id")
    .references(() => employees.id)
    .notNull(),
  dueDate: date("due_date"),
  priority: integer("priority").notNull().default(0),
  deletedAt: timestamp("deleted_at"),
  deletedById: integer("deleted_by_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectInitiativeSchema = createInsertSchema(
  projectInitiatives,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectInitiative = z.infer<
  typeof insertProjectInitiativeSchema
>;
export type ProjectInitiative = typeof projectInitiatives.$inferSelect;

// Project Members junction table
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: integer("project_id")
      .references(() => projectInitiatives.id, { onDelete: "cascade" })
      .notNull(),
    employeeId: integer("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    role: projectMemberRoleEnum("role").notNull().default("read"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.employeeId] })],
);

export const insertProjectMemberSchema = createInsertSchema(
  projectMembers,
).omit({
  joinedAt: true,
});

export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type ProjectMember = typeof projectMembers.$inferSelect;

// Project Tasks table (with hierarchical support via parentTaskId)
export const projectTasks = pgTable("project_tasks", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id")
    .references(() => projectInitiatives.id)
    .notNull(),
  parentTaskId: integer("parent_task_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("Offen"),
  assignedToId: integer("assigned_to_id").references(() => employees.id),
  createdById: integer("created_by_id")
    .references(() => employees.id)
    .notNull(),
  dueDate: date("due_date"),
  priority: integer("priority").notNull().default(0),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;

// Project Documents table
export const projectDocuments = pgTable("project_documents", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id")
    .references(() => projectInitiatives.id)
    .notNull(),
  taskId: integer("task_id").references(() => projectTasks.id),
  title: text("title").notNull(),
  status: documentStatusEnum("status").notNull().default("Entwurf"),
  content: text("content"),
  version: integer("version").notNull().default(1),
  createdById: integer("created_by_id")
    .references(() => employees.id)
    .notNull(),
  lastEditedById: integer("last_edited_by_id").references(() => employees.id),
  category: knowledgeCategoryEnum("category").notNull().default("SOP"),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectDocumentSchema = createInsertSchema(
  projectDocuments,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;
export type ProjectDocument = typeof projectDocuments.$inferSelect;

// Document Version History
export const documentVersions = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .references(() => projectDocuments.id)
    .notNull(),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(),
  changeSummary: text("change_summary"),
  authorId: integer("author_id")
    .references(() => employees.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocumentVersionSchema = createInsertSchema(
  documentVersions,
).omit({
  id: true,
  createdAt: true,
});

export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;
export type DocumentVersion = typeof documentVersions.$inferSelect;

// Approvals table
export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .references(() => projectDocuments.id)
    .notNull(),
  requestedById: integer("requested_by_id")
    .references(() => employees.id)
    .notNull(),
  approverId: integer("approver_id").references(() => employees.id),
  decision: approvalDecisionEnum("decision").notNull().default("Ausstehend"),
  notes: text("notes"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
});

export const insertApprovalSchema = createInsertSchema(approvals).omit({
  id: true,
  requestedAt: true,
});

export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvals.$inferSelect;

// Task Activity/Comments
export const taskActivities = pgTable("task_activities", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .references(() => projectTasks.id)
    .notNull(),
  authorId: integer("author_id")
    .references(() => employees.id)
    .notNull(),
  message: text("message").notNull(),
  activityType: text("activity_type").notNull().default("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTaskActivitySchema = createInsertSchema(taskActivities).omit(
  {
    id: true,
    createdAt: true,
  },
);

export type InsertTaskActivity = z.infer<typeof insertTaskActivitySchema>;
export type TaskActivity = typeof taskActivities.$inferSelect;

// System notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  recipientId: integer("recipient_id")
    .references(() => employees.id)
    .notNull(),
  type: notificationTypeEnum("type").notNull().default("system"),
  title: text("title").notNull(),
  message: text("message"),
  link: text("link"),
  metadata: jsonb("metadata"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Messaging threads
export const messageThreads = pgTable("message_threads", {
  id: serial("id").primaryKey(),
  type: messageThreadTypeEnum("type").notNull().default("direct"),
  title: text("title"),
  createdById: integer("created_by_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageThreadSchema = createInsertSchema(
  messageThreads,
).omit({
  id: true,
  createdAt: true,
});

export type InsertMessageThread = z.infer<typeof insertMessageThreadSchema>;
export type MessageThread = typeof messageThreads.$inferSelect;

export const messageThreadMembers = pgTable(
  "message_thread_members",
  {
    threadId: integer("thread_id")
      .references(() => messageThreads.id, { onDelete: "cascade" })
      .notNull(),
    employeeId: integer("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    role: messageThreadRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.employeeId] })],
);

export const insertMessageThreadMemberSchema = createInsertSchema(
  messageThreadMembers,
).omit({
  joinedAt: true,
});

export type InsertMessageThreadMember = z.infer<
  typeof insertMessageThreadMemberSchema
>;
export type MessageThreadMember = typeof messageThreadMembers.$inferSelect;

export const messageMessages = pgTable("message_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .references(() => messageThreads.id, { onDelete: "cascade" })
    .notNull(),
  senderId: integer("sender_id")
    .references(() => employees.id)
    .notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messageMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messageMessages.$inferSelect;

// Shift Swap Requests table
export const shiftSwapRequests = pgTable("shift_swap_requests", {
  id: serial("id").primaryKey(),
  requesterShiftId: integer("requester_shift_id")
    .references(() => rosterShifts.id)
    .notNull(),
  targetShiftId: integer("target_shift_id").references(() => rosterShifts.id),
  requesterId: integer("requester_id")
    .references(() => employees.id)
    .notNull(),
  targetEmployeeId: integer("target_employee_id").references(
    () => employees.id,
  ),
  status: swapRequestStatusEnum("status").notNull().default("Ausstehend"),
  reason: text("reason"),
  approverId: integer("approver_id").references(() => employees.id),
  approverNotes: text("approver_notes"),
  hasCompetencyConflict: boolean("has_competency_conflict")
    .notNull()
    .default(false),
  competencyConflictDetails: text("competency_conflict_details"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
});

export const insertShiftSwapRequestSchema = createInsertSchema(
  shiftSwapRequests,
).omit({
  id: true,
  requestedAt: true,
});

export type InsertShiftSwapRequest = z.infer<
  typeof insertShiftSwapRequestSchema
>;
export type ShiftSwapRequest = typeof shiftSwapRequests.$inferSelect;

// Roster Settings table - tracks which month is currently approved and open for planning
export const rosterSettings = pgTable("roster_settings", {
  id: serial("id").primaryKey(),
  lastApprovedYear: integer("last_approved_year").notNull(),
  lastApprovedMonth: integer("last_approved_month").notNull(),
  wishYear: integer("wish_year"),
  wishMonth: integer("wish_month"),
  vacationLockFrom: date("vacation_lock_from"),
  vacationLockUntil: date("vacation_lock_until"),
  updatedById: integer("updated_by_id").references(() => employees.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRosterSettingsSchema = createInsertSchema(
  rosterSettings,
).omit({
  id: true,
  updatedAt: true,
});

export type InsertRosterSettings = z.infer<typeof insertRosterSettingsSchema>;
export type RosterSettings = typeof rosterSettings.$inferSelect;

// Tool visibility settings (per department)
export const toolVisibility = pgTable(
  "tool_visibility",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .references(() => departments.id)
      .notNull(),
    toolKey: text("tool_key").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    updatedById: integer("updated_by_id").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tool_visibility_department_idx").on(table.departmentId),
    uniqueIndex("tool_visibility_department_tool_idx").on(
      table.departmentId,
      table.toolKey,
    ),
  ],
);

export const insertToolVisibilitySchema = createInsertSchema(
  toolVisibility,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertToolVisibility = z.infer<typeof insertToolVisibilitySchema>;
export type ToolVisibility = typeof toolVisibility.$inferSelect;

// Shift wish status
export const wishStatusEnum = pgEnum("wish_status", ["Entwurf", "Eingereicht"]);

export const longTermWishStatusEnum = pgEnum("long_term_wish_status", [
  "Entwurf",
  "Eingereicht",
  "Genehmigt",
  "Abgelehnt",
]);

export const longTermAbsenceStatusEnum = pgEnum("long_term_absence_status", [
  "Entwurf",
  "Eingereicht",
  "Genehmigt",
  "Abgelehnt",
]);

// Shift Wishes table - employee preferences for upcoming roster planning month
export const shiftWishes = pgTable("shift_wishes", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .references(() => employees.id)
    .notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  status: wishStatusEnum("status").notNull().default("Entwurf"),
  preferredShiftDays: jsonb("preferred_shift_days").$type<number[]>(),
  avoidShiftDays: jsonb("avoid_shift_days").$type<number[]>(),
  preferredServiceTypes: jsonb("preferred_service_types").$type<string[]>(),
  avoidServiceTypes: jsonb("avoid_service_types").$type<string[]>(),
  avoidWeekdays: jsonb("avoid_weekdays").$type<number[]>(),
  maxShiftsPerWeek: integer("max_shifts_per_week"),
  maxShiftsPerMonth: integer("max_shifts_per_month"),
  maxWeekendShifts: integer("max_weekend_shifts"),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertShiftWishSchema = createInsertSchema(shiftWishes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftWish = z.infer<typeof insertShiftWishSchema>;
export type ShiftWish = typeof shiftWishes.$inferSelect;

// Long-term shift wishes - per employee rules that require approval
export const longTermShiftWishes = pgTable(
  "long_term_shift_wishes",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .references(() => employees.id)
      .notNull(),
    status: longTermWishStatusEnum("status").notNull().default("Entwurf"),
    rules: jsonb("rules").$type<LongTermWishRule[]>(),
    notes: text("notes"),
    submittedAt: timestamp("submitted_at"),
    approvedAt: timestamp("approved_at"),
    approvedById: integer("approved_by_id").references(() => employees.id),
    approvalNotes: text("approval_notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("long_term_shift_wishes_employee_idx").on(table.employeeId),
  ],
);

export const insertLongTermShiftWishSchema = createInsertSchema(
  longTermShiftWishes,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLongTermShiftWish = z.infer<
  typeof insertLongTermShiftWishSchema
>;
export type LongTermShiftWish = typeof longTermShiftWishes.$inferSelect;

export const longTermAbsences = pgTable("long_term_absences", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .references(() => employees.id)
    .notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason").notNull(),
  status: longTermAbsenceStatusEnum("status").notNull().default("Entwurf"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  approvedById: integer("approved_by_id").references(() => employees.id),
  approvalNotes: text("approval_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLongTermAbsenceSchema = createInsertSchema(
  longTermAbsences,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLongTermAbsence = z.infer<typeof insertLongTermAbsenceSchema>;
export type LongTermAbsence = typeof longTermAbsences.$inferSelect;

// Planned Absences table - for requesting time off for the planning month
export const plannedAbsences = pgTable("planned_absences", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .references(() => employees.id)
    .notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: absenceReasonEnum("reason").notNull(),
  notes: text("notes"),
  status: plannedAbsenceStatusEnum("status").notNull().default("Geplant"),
  isApproved: boolean("is_approved"),
  approvedById: integer("approved_by_id").references(() => employees.id),
  createdById: integer("created_by_id").references(() => employees.id),
  accepted: boolean("accepted").notNull().default(false),
  acceptedAt: timestamp("accepted_at"),
  acceptedById: integer("accepted_by_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlannedAbsenceSchema = createInsertSchema(
  plannedAbsences,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  accepted: true,
  acceptedAt: true,
  acceptedById: true,
});

export type InsertPlannedAbsence = z.infer<typeof insertPlannedAbsenceSchema>;
export type PlannedAbsence = typeof plannedAbsences.$inferSelect;
