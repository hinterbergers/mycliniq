// server/api/admin/router.ts
import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import { clinics, departments, employees, permissions, userPermissions } from "@shared/schema";
import { requireAuth, requireClinicAdmin, requireTechnicalAdmin } from "../middleware/auth";

export function createAdminRouter() {
  const router = Router();

  // alles hier ist schon unter /api und läuft durch authenticate (global)
  router.use(requireAuth);

  // GET /api/admin/clinic
  router.get("/clinic", requireClinicAdmin, async (req, res) => {
    // ... unverändert
  });

  // PUT /api/admin/clinic
  router.put("/clinic", requireClinicAdmin, async (req, res) => {
    // ... unverändert
  });

  // GET /api/admin/users
  router.get("/users", requireTechnicalAdmin, async (_req, res) => {
    // ... unverändert
  });

  // usw...
  return router;
}