// server/api/index.ts
import { Router } from "express";
import { authenticate } from "./middleware/auth";

import { registerAdminRoutes } from "./admin"; // wenn die bisher app: Express erwartet -> siehe unten
import { registerEmployeeRoutes } from "./employees";
import { registerCompetencyRoutes } from "./competencies";
import { registerRoomRoutes } from "./rooms";
import { registerDutyPlanRoutes } from "./duty-plans";
import { registerWeeklyPlanRoutes } from "./weekly-plans";
import { registerDailyOverrideRoutes } from "./daily-overrides";
import { registerAbsenceRoutes } from "./absences";
import { registerProjectRoutes } from "./projects";
import { registerSopRoutes } from "./sops";

export function createApiRouter() {
  const api = Router();

  // 1) auth einmal zentral
  api.use(authenticate);

  // 2) Module mounten
  // Admin: am besten als Router exportieren (siehe Schritt 4)
  api.use("/admin", createAdminRouter()); // <- wenn du umstellst
  api.use("/employees", createEmployeesRouter());
  api.use("/competencies", createCompetenciesRouter());
  api.use("/rooms", createRoomsRouter());
  api.use("/duty-plans", createDutyPlansRouter());
  api.use("/weekly-plans", createWeeklyPlansRouter());
  api.use("/daily-overrides", createDailyOverridesRouter());
  api.use("/absences", createAbsencesRouter());
  api.use("/projects", createProjectsRouter());
  api.use("/sops", createSopsRouter());

  // 3) API 404 genau EINMAL – ganz am Ende
  api.use((_req, res) => {
    res.status(404).json({ success: false, error: "API endpoint not found" });
  });

  return api;
}

// --- kleine Helper, wenn deine registerX aktuell "router reinreichen" ---
function createEmployeesRouter() {
  const r = Router();
  registerEmployeeRoutes(r);
  return r;
}
function createCompetenciesRouter() { const r = Router(); registerCompetencyRoutes(r); return r; }
function createRoomsRouter() { const r = Router(); registerRoomRoutes(r); return r; }
function createDutyPlansRouter() { const r = Router(); registerDutyPlanRoutes(r); return r; }
function createWeeklyPlansRouter() { const r = Router(); registerWeeklyPlanRoutes(r); return r; }
function createDailyOverridesRouter() { const r = Router(); registerDailyOverrideRoutes(r); return r; }
function createAbsencesRouter() { const r = Router(); registerAbsenceRoutes(r); return r; }
function createProjectsRouter() { const r = Router(); registerProjectRoutes(r); return r; }
function createSopsRouter() { const r = Router(); registerSopRoutes(r); return r; }

// Admin separat (siehe Schritt 4)
import { createAdminRouter } from "./admin/router";