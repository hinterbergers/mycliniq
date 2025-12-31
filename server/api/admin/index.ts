import { Router } from "express";
import type { Express } from "express";
import { db, eq, and, inArray } from "../../lib/db";
import { 
  clinics, 
  departments, 
  employees, 
  permissions, 
  userPermissions 
} from "@shared/schema";
import { authenticate, requireTechnicalAdmin, requireClinicAdmin, requireAuth } from "../middleware/auth";
// Note: Using direct response format for consistency with existing API

const DEFAULT_PERMISSION_CATALOG = [
  { key: "users.manage", label: "Kann Benutzer anlegen / verwalten", scope: "department" },
  { key: "dutyplan.edit", label: "Kann Dienstplan bearbeiten", scope: "department" },
  { key: "dutyplan.publish", label: "Kann Dienstplan freigeben", scope: "department" },
  { key: "vacation.lock", label: "Kann Urlaubsplanung bearbeiten (Sperrzeitraum)", scope: "department" },
  { key: "vacation.approve", label: "Kann Urlaub freigeben", scope: "department" },
  { key: "absence.create", label: "Kann Abwesenheiten eintragen", scope: "department" },
  { key: "perm.sop_manage", label: "Kann SOPs verwalten", scope: "department" },
  { key: "perm.sop_publish", label: "Kann SOPs freigeben", scope: "department" },
  { key: "perm.project_manage", label: "Kann Projekte verwalten", scope: "department" },
  { key: "perm.project_delete", label: "Kann Projekte loeschen", scope: "department" },
  { key: "perm.message_group_manage", label: "Kann Gruppen verwalten", scope: "department" },
  { key: "training.edit", label: "Kann Ausbildungsplan bearbeiten", scope: "department" }
];

async function ensurePermissionCatalog(): Promise<void> {
  const existing = await db
    .select({ key: permissions.key, label: permissions.label, scope: permissions.scope })
    .from(permissions);
  const existingByKey = new Map(existing.map((perm) => [perm.key, perm]));
  const missing = DEFAULT_PERMISSION_CATALOG.filter((perm) => !existingByKey.has(perm.key));
  if (missing.length) {
    await db.insert(permissions).values(missing).onConflictDoNothing();
  }
  const updates = DEFAULT_PERMISSION_CATALOG.filter((perm) => {
    const current = existingByKey.get(perm.key);
    return current && (current.label !== perm.label || current.scope !== perm.scope);
  });
  for (const perm of updates) {
    await db.update(permissions)
      .set({ label: perm.label, scope: perm.scope, updatedAt: new Date() })
      .where(eq(permissions.key, perm.key));
  }
}

/**
 * Register admin API routes
 */
export function registerAdminRoutes(app: Express): void {
  const router = Router();
  
  // All admin routes require authentication
  router.use(authenticate);
  router.use(requireAuth);
  
  // GET /api/me - Get current user with capabilities
  app.get("/api/me", authenticate, requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Nicht authentifiziert" });
      }
      
      // Get employee details
      const [employee] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, req.user.employeeId));
      
      if (!employee) {
        return res.status(404).json({ success: false, error: "Benutzer nicht gefunden" });
      }
      
      // Get department and clinic info
      let department = null;
      let clinic = null;
      
      if (req.user.departmentId) {
        const [dept] = await db
          .select()
          .from(departments)
          .where(eq(departments.id, req.user.departmentId));
        
        if (dept) {
          department = dept;
          const [clinicData] = await db
            .select()
            .from(clinics)
            .where(eq(clinics.id, dept.clinicId));
          
          if (clinicData) {
            clinic = clinicData;
          }
        }
      }
      
      res.json({
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
            isAdmin: req.user.isAdmin
          },
          department: department ? {
            id: department.id,
            name: department.name,
            slug: department.slug
          } : null,
          clinic: clinic ? {
            id: clinic.id,
            name: clinic.name,
            slug: clinic.slug,
            timezone: clinic.timezone,
            country: clinic.country,
            state: clinic.state
          } : null,
          capabilities: req.user.capabilities
        }
      });
    } catch (error) {
      console.error('[API] Error in /api/me:', error);
      res.status(500).json({ success: false, error: "Fehler beim Abrufen der Benutzerdaten" });
    }
  });
  
  // GET /api/admin/clinic - Get clinic settings
  router.get("/clinic", requireClinicAdmin, async (req, res) => {
    try {
      if (!req.user?.clinicId) {
        return res.status(404).json({ success: false, error: "Keine Klinik zugeordnet" });
      }
      
      const [clinic] = await db
        .select()
        .from(clinics)
        .where(eq(clinics.id, req.user.clinicId));
      
      if (!clinic) {
        return res.status(404).json({ success: false, error: "Klinik nicht gefunden" });
      }
      
      res.json({ success: true, data: clinic });
    } catch (error) {
      console.error('[API] Error in GET /api/admin/clinic:', error);
      res.status(500).json({ success: false, error: "Fehler beim Abrufen der Klinik-Einstellungen" });
    }
  });
  
  // PUT /api/admin/clinic - Update clinic settings
  router.put("/clinic", requireClinicAdmin, async (req, res) => {
    try {
      if (!req.user?.clinicId) {
        return res.status(404).json(createApiResponse(null, false, "Keine Klinik zugeordnet"));
      }
      
      const { name, slug, timezone, logoUrl, country, state } = req.body;
      
      if (!name || !slug) {
        return res.status(400).json({ success: false, error: "Name und Slug sind erforderlich" });
      }
      
      const [updated] = await db
        .update(clinics)
        .set({
          name,
          slug,
          timezone: timezone || 'Europe/Vienna',
          country: country || "AT",
          state: state || "AT-2",
          logoUrl: logoUrl || null,
          updatedAt: new Date()
        })
        .where(eq(clinics.id, req.user.clinicId))
        .returning();
      
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('[API] Error in PUT /api/admin/clinic:', error);
      res.status(500).json({ success: false, error: "Fehler beim Aktualisieren der Klinik-Einstellungen" });
    }
  });
  
  // GET /api/admin/users - List all users
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
          departmentName: departments.name
        })
        .from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .where(eq(employees.isActive, true))
        .orderBy(employees.name);
      
      res.json({ success: true, data: users });
    } catch (error) {
      console.error('[API] Error in GET /api/admin/users:', error);
      res.status(500).json({ success: false, error: "Fehler beim Abrufen der Benutzer" });
    }
  });
  
  // GET /api/admin/users/:id/permissions - Get user permissions for department
  router.get("/users/:id/permissions", requireTechnicalAdmin, async (req, res) => {
    try {
      await ensurePermissionCatalog();
      const userId = parseInt(req.params.id);
      const departmentId = req.query.departmentId ? parseInt(req.query.departmentId as string) : undefined;
      
      if (isNaN(userId)) {
        return res.status(400).json({ success: false, error: "Ungültige Benutzer-ID" });
      }
      
      // Get user's department if not provided
      let targetDepartmentId = departmentId;
      if (!targetDepartmentId) {
        const [employee] = await db
          .select({ departmentId: employees.departmentId })
          .from(employees)
          .where(eq(employees.id, userId));
        
        if (!employee?.departmentId) {
          return res.json({
            success: true,
            data: {
              permissions: [],
              availablePermissions: []
            }
          });
        }
        
        targetDepartmentId = employee.departmentId;
      }
      
      // Get all available permissions
      const allPermissions = await db
        .select()
        .from(permissions)
        .orderBy(permissions.key);
      
      // Get user's current permissions for this department
      const userPerms = await db
        .select({
          permissionId: userPermissions.permissionId,
          key: permissions.key,
          label: permissions.label
        })
        .from(userPermissions)
        .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(
          and(
            eq(userPermissions.userId, userId),
            eq(userPermissions.departmentId, targetDepartmentId)
          )
        );
      
      res.json({
        success: true,
        data: {
          permissions: userPerms.map(p => p.key),
          availablePermissions: allPermissions.map(p => ({
            key: p.key,
            label: p.label,
            scope: p.scope
          }))
        }
      });
    } catch (error) {
      console.error('[API] Error in GET /api/admin/users/:id/permissions:', error);
      res.status(500).json({ success: false, error: "Fehler beim Abrufen der Berechtigungen" });
    }
  });
  
  // PUT /api/admin/users/:id/permissions - Update user permissions
  router.put("/users/:id/permissions", requireTechnicalAdmin, async (req, res) => {
    try {
      await ensurePermissionCatalog();
      const userId = parseInt(req.params.id);
      const { departmentId, permissionKeys } = req.body;
      
      if (isNaN(userId)) {
        return res.status(400).json({ success: false, error: "Ungültige Benutzer-ID" });
      }
      
      if (!departmentId) {
        return res.status(400).json({ success: false, error: "Abteilungs-ID ist erforderlich" });
      }
      
      if (!Array.isArray(permissionKeys)) {
        return res.status(400).json({ success: false, error: "permissionKeys muss ein Array sein" });
      }
      
      // Verify user exists and is in the same department (or admin can manage any)
      const [employee] = await db
        .select({ departmentId: employees.departmentId })
        .from(employees)
        .where(eq(employees.id, userId));
      
      if (!employee) {
        return res.status(404).json({ success: false, error: "Benutzer nicht gefunden" });
      }
      
      // Department admins can only manage users in their own department
      if (req.user?.systemRole === 'department_admin' && employee.departmentId !== req.user.departmentId) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung für diese Abteilung" });
      }
      
      // Get permission IDs from keys
      const permissionRecords = await db
        .select()
        .from(permissions)
        .where(inArray(permissions.key, permissionKeys));
      
      const permissionIds = permissionRecords.map(p => p.id);
      
      // Delete existing permissions for this user/department
      await db
        .delete(userPermissions)
        .where(
          and(
            eq(userPermissions.userId, userId),
            eq(userPermissions.departmentId, departmentId)
          )
        );
      
      // Insert new permissions
      if (permissionIds.length > 0) {
        await db.insert(userPermissions).values(
          permissionIds.map(permissionId => ({
            userId,
            departmentId,
            permissionId
          }))
        );
      }
      
      res.json({ success: true, data: { success: true } });
    } catch (error) {
      console.error('[API] Error in PUT /api/admin/users/:id/permissions:', error);
      res.status(500).json({ success: false, error: "Fehler beim Aktualisieren der Berechtigungen" });
    }
  });
  
  // Mount admin router
  app.use("/api/admin", router);
  
  console.log("✓ Admin API routes registered");
}
