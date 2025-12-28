import { Router } from "express";
import type { Express } from "express";
import { db } from "../../lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { clinics, departments, employees, permissions, userPermissions } from "@shared/schema";
import { authenticate, requireAuth, requireClinicAdmin, requireTechnicalAdmin } from "../middleware/auth";

/**
 * Register admin API routes
 */
export function registerAdminRoutes(app: Express): void {
  const router = Router();

  // All admin routes require authentication
  router.use(authenticate);
  router.use(requireAuth);

  /**
   * GET /api/me - current user + capabilities (+ clinic/department info)
   * NOTE: stays on app-level route for backwards compatibility
   */
  app.get("/api/me", authenticate, requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }

      // Employee details
      const [employee] = await db.select().from(employees).where(eq(employees.id, req.user.employeeId));
      if (!employee) {
        return res.status(404).json({ success: false, error: "Benutzer nicht gefunden" });
      }

      // Department + clinic info
      let department: any = null;
      let clinic: any = null;

      if (req.user.departmentId) {
        const [dept] = await db.select().from(departments).where(eq(departments.id, req.user.departmentId));
        if (dept) {
          department = dept;

          const [clinicData] = await db.select().from(clinics).where(eq(clinics.id, dept.clinicId));
          if (clinicData) clinic = clinicData;
        }
      }

      return res.json({
        success: true,
        data: {
          user: {
            id: req.user.id,
            employeeId: req.user.employeeId,
            name: req.user.name,
            lastName: req.user.lastName,
            email: employee.email,
            systemRole: req.user.systemRole,
            appRole: req.user.appRole,
            isAdmin: req.user.isAdmin,
          },
          department: department
            ? { id: department.id, name: department.name, slug: department.slug }
            : null,
          clinic: clinic
            ? { id: clinic.id, name: clinic.name, slug: clinic.slug, timezone: clinic.timezone }
            : null,
          capabilities: Array.isArray(req.user.capabilities) ? req.user.capabilities : [],
        },
      });
    } catch (error) {
      console.error("[API] Error in /api/me:", error);
      return res.status(500).json({ success: false, error: "Fehler beim Abrufen der Benutzerdaten" });
    }
  });

  // GET /api/admin/clinic - Get clinic settings
  router.get("/clinic", requireClinicAdmin, async (req, res) => {
    try {
      if (!req.user?.clinicId) {
        return res.status(404).json({ success: false, error: "Keine Klinik zugeordnet" });
      }

      const [clinic] = await db.select().from(clinics).where(eq(clinics.id, req.user.clinicId));
      if (!clinic) {
        return res.status(404).json({ success: false, error: "Klinik nicht gefunden" });
      }

      return res.json({ success: true, data: clinic });
    } catch (error) {
      console.error("[API] Error in GET /api/admin/clinic:", error);
      return res.status(500).json({ success: false, error: "Fehler beim Abrufen der Klinik-Einstellungen" });
    }
  });

  // PUT /api/admin/clinic - Update clinic settings
  router.put("/clinic", requireClinicAdmin, async (req, res) => {
    try {
      if (!req.user?.clinicId) {
        return res.status(404).json({ success: false, error: "Keine Klinik zugeordnet" });
      }

      const { name, slug, timezone, logoUrl } = req.body ?? {};
      if (!name || !slug) {
        return res.status(400).json({ success: false, error: "Name und Slug sind erforderlich" });
      }

      const [updated] = await db
        .update(clinics)
        .set({
          name,
          slug,
          timezone: timezone || "Europe/Vienna",
          logoUrl: logoUrl || null,
          updatedAt: new Date(),
        })
        .where(eq(clinics.id, req.user.clinicId))
        .returning();

      return res.json({ success: true, data: updated });
    } catch (error) {
      console.error("[API] Error in PUT /api/admin/clinic:", error);
      return res.status(500).json({ success: false, error: "Fehler beim Aktualisieren der Klinik-Einstellungen" });
    }
  });

  // GET /api/admin/users - List users
  router.get("/users", requireTechnicalAdmin, async (req, res) => {
    try {
      const users = await db
        .select({
          id: employees.id,
          name: employees.name,
          lastName: employees.lastName,
          email: employees.email,
          systemRole: employees.systemRole,
          appRole: employees.appRole,
          isActive: employees.isActive,
          departmentId: employees.departmentId,
          departmentName: departments.name,
        })
        .from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .where(eq(employees.isActive, true))
        .orderBy(employees.name);

      return res.json({ success: true, data: users });
    } catch (error) {
      console.error("[API] Error in GET /api/admin/users:", error);
      return res.status(500).json({ success: false, error: "Fehler beim Abrufen der Benutzer" });
    }
  });

    // Alias: GET /api/admin/employees -> same as /api/admin/users
    router.get("/employees", requireTechnicalAdmin, async (req, res) => {
      try {
        const users = await db
          .select({
            id: employees.id,
            name: employees.name,
            lastName: employees.lastName,
            email: employees.email,
            systemRole: employees.systemRole,
            appRole: employees.appRole,
            isActive: employees.isActive,
            departmentId: employees.departmentId,
            departmentName: departments.name,
          })
          .from(employees)
          .leftJoin(departments, eq(employees.departmentId, departments.id))
          .where(eq(employees.isActive, true))
          .orderBy(employees.name);
  
        return res.json({ success: true, data: users });
      } catch (error) {
        console.error("[API] Error in GET /api/admin/employees:", error);
        return res.status(500).json({ success: false, error: "Fehler beim Abrufen der Benutzer" });
      }
    });

  // GET /api/admin/users/:id/permissions
  router.get("/users/:id/permissions", requireTechnicalAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

      if (!Number.isFinite(userId)) {
        return res.status(400).json({ success: false, error: "Ungültige Benutzer-ID" });
      }

      // Determine target department
      let targetDepartmentId = departmentId;
      if (!targetDepartmentId) {
        const [employee] = await db
          .select({ departmentId: employees.departmentId })
          .from(employees)
          .where(eq(employees.id, userId));

        if (!employee?.departmentId) {
          return res.json({ success: true, data: { permissions: [], availablePermissions: [] } });
        }

        targetDepartmentId = employee.departmentId;
      }

      const allPermissions = await db.select().from(permissions).orderBy(permissions.key);

      const userPerms = await db
        .select({
          permissionId: userPermissions.permissionId,
          key: permissions.key,
          label: permissions.label,
        })
        .from(userPermissions)
        .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(and(eq(userPermissions.userId, userId), eq(userPermissions.departmentId, targetDepartmentId)));

      return res.json({
        success: true,
        data: {
          permissions: userPerms.map((p) => p.key),
          availablePermissions: allPermissions.map((p) => ({
            key: p.key,
            label: p.label,
            scope: p.scope,
          })),
        },
      });
    } catch (error) {
      console.error("[API] Error in GET /api/admin/users/:id/permissions:", error);
      return res.status(500).json({ success: false, error: "Fehler beim Abrufen der Berechtigungen" });
    }
  });

  // PUT /api/admin/users/:id/permissions
  router.put("/users/:id/permissions", requireTechnicalAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { departmentId, permissionKeys } = req.body ?? {};

      if (!Number.isFinite(userId)) {
        return res.status(400).json({ success: false, error: "Ungültige Benutzer-ID" });
      }
      if (!departmentId) {
        return res.status(400).json({ success: false, error: "Abteilungs-ID ist erforderlich" });
      }
      if (!Array.isArray(permissionKeys)) {
        return res.status(400).json({ success: false, error: "permissionKeys muss ein Array sein" });
      }

      const [employee] = await db
        .select({ departmentId: employees.departmentId })
        .from(employees)
        .where(eq(employees.id, userId));

      if (!employee) {
        return res.status(404).json({ success: false, error: "Benutzer nicht gefunden" });
      }

      // Department admins: only own department
      if (req.user?.systemRole === "department_admin" && employee.departmentId !== req.user.departmentId) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung für diese Abteilung" });
      }

      const permissionRecords = permissionKeys.length
        ? await db.select().from(permissions).where(inArray(permissions.key, permissionKeys))
        : [];

      const permissionIds = permissionRecords.map((p) => p.id);

      await db
        .delete(userPermissions)
        .where(and(eq(userPermissions.userId, userId), eq(userPermissions.departmentId, departmentId)));

      if (permissionIds.length > 0) {
        await db.insert(userPermissions).values(
          permissionIds.map((permissionId) => ({
            userId,
            departmentId,
            permissionId,
          })),
        );
      }

      return res.json({ success: true, data: { success: true } });
    } catch (error) {
      console.error("[API] Error in PUT /api/admin/users/:id/permissions:", error);
      return res.status(500).json({ success: false, error: "Fehler beim Aktualisieren der Berechtigungen" });
    }
  });

  // Mount admin router
  app.use("/api/admin", router);
  console.log("✓ Admin API routes registered");
}