import { Router } from "express";
import type { Express } from "express";

// Import auth middleware
import { authenticate } from "./middleware/auth";

// Import route modules
import { registerAdminRoutes } from "./admin";
import { registerEmployeeRoutes } from "./employees";
import { registerCompetencyRoutes } from "./competencies";
import { registerDiplomaRoutes } from "./diplomas";
import { registerPhysicalRoomRoutes } from "./physical-rooms";
import { registerRoomRoutes } from "./rooms";
import { registerServiceLineRoutes } from "./service-lines";
import { registerDutyPlanRoutes } from "./duty-plans";
import { registerWeeklyPlanRoutes } from "./weekly-plans";
import { registerDailyOverrideRoutes } from "./daily-overrides";
import { registerAbsenceRoutes } from "./absences";
import { registerVacationRuleRoutes } from "./vacation-rules";
import { registerProjectRoutes } from "./projects";
import { registerSopRoutes } from "./sops";
import { registerToolRoutes } from "./tools";
import { registerNotificationRoutes } from "./notifications";
import { registerMessageRoutes } from "./messages";
import { registerTaskRoutes } from "./tasks";
import { registerPlanningRoutes } from "./roster/planning";

/**
 * Register all modular API routes
 *
 * This function mounts all API route modules under their respective paths.
 * Each module handles its own CRUD operations and sub-routes.
 *
 * Authentication:
 *   - All routes go through `authenticate` middleware
 *   - In DEV mode, unauthenticated access is allowed with warnings
 *   - In PROD mode, valid token is required (TODO: enable strict mode)
 *
 * Authorization Levels:
 *   - requireAdmin: Employee CRUD, Room CRUD, Plan releases
 *   - requireEditor: Duty plan edit, Weekly plan edit, Daily overrides
 *   - requireOwnerOrAdmin: Own absences, shift wishes, preferences
 */
export function registerModularApiRoutes(app: Express): void {
  // Apply authentication middleware to all /api routes
  // TODO: In production, enable strict authentication
  app.use("/api", authenticate);

  // Register admin routes (includes /api/me)
  registerAdminRoutes(app);

  // Employees API
  // TODO: Add requireAdmin for POST, PUT, DELETE
  const employeesRouter = Router();
  registerEmployeeRoutes(employeesRouter);
  app.use("/api/employees", employeesRouter);

  // Competencies API
  // TODO: Add requireAdmin for POST, PUT, DELETE
  const competenciesRouter = Router();
  registerCompetencyRoutes(competenciesRouter);
  app.use("/api/competencies", competenciesRouter);

  // Diplomas API
  // TODO: Add requireAdmin for POST, PUT, DELETE
  const diplomasRouter = Router();
  registerDiplomaRoutes(diplomasRouter);
  app.use("/api/diplomas", diplomasRouter);

  // Rooms API
  // TODO: Add requireAdmin for POST, PUT, DELETE, close, open
  const roomsRouter = Router();
  registerRoomRoutes(roomsRouter);
  app.use("/api/rooms", roomsRouter);

  // Physical Rooms API
  // TODO: Add requireAdmin for POST, PUT, DELETE
  const physicalRoomsRouter = Router();
  registerPhysicalRoomRoutes(physicalRoomsRouter);
  app.use("/api/physical-rooms", physicalRoomsRouter);

  // Service Lines API (Dienstschienen)
  // TODO: Add requireAdmin for POST, PUT, DELETE
  const serviceLinesRouter = Router();
  registerServiceLineRoutes(serviceLinesRouter);
  app.use("/api/service-lines", serviceLinesRouter);

  const planningRouter = Router();
  registerPlanningRoutes(planningRouter);
  app.use("/api/roster/planning", planningRouter);

  // Duty Plans API (Dienstplan)
  // TODO: Add requireEditor for POST, PUT slots
  // TODO: Add requireAdmin for DELETE, status change to 'Freigegeben'
  const dutyPlansRouter = Router();
  registerDutyPlanRoutes(dutyPlansRouter);
  app.use("/api/duty-plans", dutyPlansRouter);

  // Weekly Plans API (Wochenplan)
  // TODO: Add requireEditor for POST, PUT, assign
  // TODO: Add requireAdmin for DELETE, status change to 'Freigegeben'
  const weeklyPlansRouter = Router();
  registerWeeklyPlanRoutes(weeklyPlansRouter);
  app.use("/api/weekly-plans", weeklyPlansRouter);

  // Daily Overrides API (Tagesplan-Korrekturen)
  // TODO: Add requireEditor for POST, DELETE
  const dailyOverridesRouter = Router();
  registerDailyOverrideRoutes(dailyOverridesRouter);
  app.use("/api/daily-overrides", dailyOverridesRouter);

  // Absences API (Abwesenheiten)
  // TODO: Add requireOwnerOrAdmin for POST, PUT, DELETE (own absences only)
  // TODO: Add requireAdmin for status change to 'Genehmigt'/'Abgelehnt'
  const absencesRouter = Router();
  registerAbsenceRoutes(absencesRouter);
  app.use("/api/absences", absencesRouter);

  // Vacation rules API (Urlaubsregeln)
  const vacationRulesRouter = Router();
  registerVacationRuleRoutes(vacationRulesRouter);
  app.use("/api/vacation-rules", vacationRulesRouter);

  // Projects API (Aufgaben)
  // TODO: Check project membership for access
  // TODO: Add requireAdmin for DELETE
  const projectsRouter = Router();
  registerProjectRoutes(projectsRouter);
  app.use("/api/projects", projectsRouter);

  // SOPs API
  // TODO: Add requireEditor for POST, PUT
  // TODO: Add requireAdmin for DELETE, status change to 'Freigegeben'
  const sopsRouter = Router();
  registerSopRoutes(sopsRouter);
  app.use("/api/sops", sopsRouter);

  // Notifications API
  const notificationsRouter = Router();
  registerNotificationRoutes(notificationsRouter);
  app.use("/api/notifications", notificationsRouter);

  // Messages API
  const messagesRouter = Router();
  registerMessageRoutes(messagesRouter);
  app.use("/api/messages", messagesRouter);

  // Tasks API (Aufgaben)
  const tasksRouter = Router();
  registerTaskRoutes(tasksRouter);
  app.use("/api/tasks", tasksRouter);

  // Tools API
  const toolsRouter = Router();
  registerToolRoutes(toolsRouter);
  app.use("/api/tools", toolsRouter);

  console.log("✓ Modular API routes registered (with authentication)");
}

/**
 * API Route Overview:
 *
 * /api/employees
 *   GET    /                 - List all employees
 *   GET    /:id              - Get employee by ID
 *   POST   /                 - Create employee
 *   PUT    /:id              - Update employee
 *   DELETE /:id              - Delete employee
 *
 * /api/competencies
 *   GET    /                 - List all competencies
 *   GET    /:id              - Get competency by ID
 *   GET    /employee/:id     - Get competencies for employee
 *   POST   /                 - Create competency
 *   PUT    /:id              - Update competency
 *   DELETE /:id              - Delete competency
 *
 * /api/rooms
 *   GET    /                 - List all rooms
 *   GET    /:id              - Get room by ID
 *   POST   /                 - Create room
 *   PUT    /:id              - Update room
 *   PUT    /:id/block        - Block room for period
 *   DELETE /:id              - Delete room
 *
 * /api/duty-plans
 *   GET    /                 - List duty plans
 *   GET    /:id              - Get duty plan with details
 *   GET    /month/:year/:month - Get plan for specific month
 *   POST   /                 - Create duty plan
 *   PUT    /:id              - Update duty plan
 *   DELETE /:id              - Delete duty plan
 *   POST   /:id/generate     - AI-generate assignments
 *   POST   /:id/release      - Release/approve plan
 *
 * /api/weekly-plans
 *   GET    /                 - List weekly plans
 *   GET    /:id              - Get weekly plan with assignments
 *   GET    /week/:year/:week - Get plan for specific week
 *   POST   /                 - Create weekly plan
 *   PUT    /:id/status       - Update weekly plan status
 *   DELETE /:id              - Delete weekly plan
 *   POST   /:id/assign       - Add assignment
 *   GET    /:id/assignments  - Get assignments
 *   DELETE /assignments/:id  - Remove assignment
 *
 * /api/daily-overrides
 *   GET    /                 - List overrides (filter by date/from/to/roomId)
 *   GET    /:id              - Get override by ID
 *   GET    /date/:date       - Get overrides for specific date
 *   POST   /                 - Create override
 *   DELETE /:id              - Delete override
 *
 * /api/absences
 *   GET    /                 - List absences (filter by date/employee)
 *   GET    /:id              - Get absence by ID
 *   POST   /                 - Create absence
 *   DELETE /:id              - Delete absence
 *   GET    /planned          - Get planned absences
 *   POST   /planned          - Create planned absence
 *   PUT    /planned/:id/approve - Approve planned absence
 *   PUT    /planned/:id/reject  - Reject planned absence
 *
 * /api/projects
 *   GET    /                 - List all projects
 *   GET    /:id              - Get project with details
 *   POST   /                 - Create project
 *   PUT    /:id              - Update project
 *   DELETE /:id              - Delete project
 *   GET    /:id/members      - Get project members
 *   POST   /:id/members      - Add member
 *   DELETE /:id/members/:eid - Remove member
 *   GET    /:id/tasks        - Get project tasks
 *   POST   /:id/tasks        - Create task
 *   PUT    /:id/tasks/:tid   - Update task
 *   DELETE /:id/tasks/:tid   - Delete task
 *   GET    /:id/documents    - Get project documents
 *   POST   /:id/documents    - Create document
 *
 * /api/sops
 *   GET    /                 - List SOPs (filter by category/status)
 *   GET    /:id              - Get SOP by ID
 *   GET    /search           - Search SOPs by keywords
 *   POST   /                 - Create SOP
 *   PUT    /:id              - Update SOP
 *   DELETE /:id              - Delete SOP
 *   POST   /:id/submit-review - Submit for review
 *   POST   /:id/approve      - Approve SOP
 */
