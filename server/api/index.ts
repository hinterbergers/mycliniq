import { Router } from "express";
import type { Express } from "express";

// Import route modules
import { registerEmployeeRoutes } from "./employees";
import { registerCompetencyRoutes } from "./competencies";
import { registerRoomRoutes } from "./rooms";
import { registerDutyPlanRoutes } from "./duty-plans";
import { registerWeeklyPlanRoutes } from "./weekly-plans";
import { registerAbsenceRoutes } from "./absences";
import { registerProjectRoutes } from "./projects";
import { registerSopRoutes } from "./sops";

/**
 * Register all modular API routes
 * 
 * This function mounts all API route modules under their respective paths.
 * Each module handles its own CRUD operations and sub-routes.
 */
export function registerModularApiRoutes(app: Express): void {
  // Employees API
  const employeesRouter = Router();
  registerEmployeeRoutes(employeesRouter);
  app.use("/api/employees", employeesRouter);

  // Competencies API
  const competenciesRouter = Router();
  registerCompetencyRoutes(competenciesRouter);
  app.use("/api/competencies", competenciesRouter);

  // Rooms API
  const roomsRouter = Router();
  registerRoomRoutes(roomsRouter);
  app.use("/api/rooms", roomsRouter);

  // Duty Plans API (Dienstplan)
  const dutyPlansRouter = Router();
  registerDutyPlanRoutes(dutyPlansRouter);
  app.use("/api/duty-plans", dutyPlansRouter);

  // Weekly Plans API (Wochenplan)
  const weeklyPlansRouter = Router();
  registerWeeklyPlanRoutes(weeklyPlansRouter);
  app.use("/api/weekly-plans", weeklyPlansRouter);

  // Absences API (Abwesenheiten)
  const absencesRouter = Router();
  registerAbsenceRoutes(absencesRouter);
  app.use("/api/absences", absencesRouter);

  // Projects API (Projekte)
  const projectsRouter = Router();
  registerProjectRoutes(projectsRouter);
  app.use("/api/projects", projectsRouter);

  // SOPs API
  const sopsRouter = Router();
  registerSopRoutes(sopsRouter);
  app.use("/api/sops", sopsRouter);

  console.log("✓ Modular API routes registered");
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
 *   PUT    /:id              - Update weekly plan
 *   DELETE /:id              - Delete weekly plan
 *   POST   /:id/generate-from-duty - Generate from duty plan
 *   PUT    /:id/assignments  - Bulk update assignments
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
