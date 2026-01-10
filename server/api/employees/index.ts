import type { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { db, eq, and } from "../../lib/db";
import {
  ok,
  created,
  notFound,
  validationError,
  asyncHandler,
} from "../../lib/api-response";
import {
  validateBody,
  validateParams,
  idParamSchema,
} from "../../lib/validate";
import {
  employees,
  users,
  employeeCompetencies,
  competencies,
  diplomas,
  employeeDiplomas,
  insertEmployeeSchema,
} from "@shared/schema";

/**
 * Extended validation schema for employee creation
 * Requires: firstName, lastName, email, birthday
 */
const emailSchema = z
  .string()
  .email("Bitte eine gueltige E-Mail-Adresse ohne Umlaute eingeben.")
  .refine(
    (value) => !/[^\x00-\x7F]/.test(value),
    "Bitte eine gueltige E-Mail-Adresse ohne Umlaute eingeben.",
  );

const createEmployeeSchema = insertEmployeeSchema.extend({
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  email: emailSchema,
  emailPrivate: z.union([emailSchema, z.null()]).optional(),
  birthday: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Geburtsdatum im Format YYYY-MM-DD erforderlich",
    ),
});

/**
 * Schema for updating preferences
 */
const preferencesSchema = z.object({
  preferredOffDays: z.array(z.number().min(1).max(31)).optional(),
  maxShiftsPerWeek: z.number().min(0).max(7).nullable().optional(),
  notesForPlanning: z.string().nullable().optional(),
});

/**
 * Schema for updating competencies
 */
const competenciesUpdateSchema = z.object({
  competencyIds: z.array(z.number().positive("Kompetenz-ID muss positiv sein")),
});

/**
 * Schema for updating diplomas
 */
const diplomasUpdateSchema = z.object({
  diplomaIds: z.array(z.number().positive("Diplom-ID muss positiv sein")),
});

/**
 * Employee API Routes
 * Base path: /api/employees
 */
export function registerEmployeeRoutes(router: Router) {
  /**
   * GET /api/employees
   * Get all employees with optional user data join
   * Query params:
   *   - active: "true" | "false" - filter by isActive status
   *   - role: string - filter by role
   */
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { active, role } = req.query;

      // Get employees from storage
      let allEmployees = await storage.getEmployees();

      // Apply filters
      if (active !== undefined) {
        const isActive = active === "true";
        allEmployees = allEmployees.filter((e) => e.isActive === isActive);
      }

      if (role) {
        allEmployees = allEmployees.filter((e) => e.role === role);
      }

      // Map to include display name format: "Nachname (badge)"
      const result = allEmployees.map((emp) => ({
        ...emp,
        displayName: `${emp.lastName || emp.name}`,
        passwordHash: undefined, // Never expose password hash
      }));

      return ok(res, result);
    }),
  );

  /**
   * GET /api/employees/:id
   * Get complete employee profile including:
   * - Basic employee data
   * - Competencies (from employee_competencies junction)
   * - User data (if linked)
   */
  router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employeeId = Number(id);

      // Get base employee data
      const employee = await storage.getEmployee(employeeId);

      if (!employee) {
        return notFound(res, "Mitarbeiter");
      }

      // Get competencies from junction table
      const empCompetencies = await db
        .select({
          competencyId: employeeCompetencies.competencyId,
          code: competencies.code,
          name: competencies.name,
          description: competencies.description,
        })
        .from(employeeCompetencies)
        .leftJoin(
          competencies,
          eq(employeeCompetencies.competencyId, competencies.id),
        )
        .where(eq(employeeCompetencies.employeeId, employeeId));

      // Get linked user data if exists
      let userData = null;
      if (employee.userId) {
        const [user] = await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
            appRole: users.appRole,
          })
          .from(users)
          .where(eq(users.id, employee.userId));
        userData = user || null;
      }

      // Build complete profile
      const profile = {
        ...employee,
        passwordHash: undefined, // Never expose
        linkedUser: userData,
        employeeCompetencies: empCompetencies,
        // Parse shift preferences if stored as JSON
        shiftPreferences: employee.shiftPreferences || {
          preferredOffDays: [],
          maxShiftsPerWeek: employee.maxShiftsPerWeek,
          notesForPlanning: null,
        },
      };

      return ok(res, profile);
    }),
  );

  /**
   * POST /api/employees
   * Create new employee
   * Required fields: firstName, lastName, email, birthday
   */
  router.post(
    "/",
    validateBody(createEmployeeSchema),
    asyncHandler(async (req, res) => {
      const data = req.body;

      // Auto-generate name from firstName + lastName
      const name = `${data.firstName} ${data.lastName}`;

      // Check if email already exists
      const existingEmployee = await storage.getEmployeeByEmail(data.email);
      if (existingEmployee) {
        return validationError(
          res,
          "Ein Mitarbeiter mit dieser E-Mail existiert bereits",
        );
      }

      const employee = await storage.createEmployee({
        ...data,
        name,
        isActive: true,
      });

      return created(res, {
        ...employee,
        passwordHash: undefined,
      });
    }),
  );

  /**
   * PUT /api/employees/:id
   * Update employee base data
   * Can update: name, firstName, lastName, role, email, phone, etc.
   */
  router.put(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employeeId = Number(id);
      const data = req.body;

      // Check if employee exists
      const existing = await storage.getEmployee(employeeId);
      if (!existing) {
        return notFound(res, "Mitarbeiter");
      }

      // If firstName/lastName provided, update name
      let updateData = { ...data };
      if (data.firstName || data.lastName) {
        const firstName = data.firstName || existing.firstName || "";
        const lastName = data.lastName || existing.lastName || "";
        updateData.name = `${firstName} ${lastName}`.trim();
      }

      // Remove competencyIds if present (handled via separate endpoint)
      delete updateData.competencyIds;

      const employee = await storage.updateEmployee(employeeId, updateData);

      if (!employee) {
        return notFound(res, "Mitarbeiter");
      }

      return ok(res, {
        ...employee,
        passwordHash: undefined,
      });
    }),
  );

  /**
   * DELETE /api/employees/:id
   * Soft delete - sets isActive = false
   * Does NOT actually delete the record
   */
  router.delete(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employeeId = Number(id);

      // Check if employee exists
      const existing = await storage.getEmployee(employeeId);
      if (!existing) {
        return notFound(res, "Mitarbeiter");
      }

      // Soft delete by setting isActive = false
      await storage.updateEmployee(employeeId, {
        isActive: false,
      });

      return ok(res, {
        deactivated: true,
        id: employeeId,
        message: "Mitarbeiter wurde deaktiviert",
      });
    }),
  );

  /**
   * PUT /api/employees/:id/preferences
   * Update employee shift/planning preferences
   * Body: { preferredOffDays, maxShiftsPerWeek, notesForPlanning }
   */
  router.put(
    "/:id/preferences",
    validateParams(idParamSchema),
    validateBody(preferencesSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employeeId = Number(id);
      const { preferredOffDays, maxShiftsPerWeek, notesForPlanning } = req.body;

      // Check if employee exists
      const existing = await storage.getEmployee(employeeId);
      if (!existing) {
        return notFound(res, "Mitarbeiter");
      }

      // Build preferences object
      const shiftPreferences = {
        ...((existing.shiftPreferences as object) || {}),
        preferredOffDays:
          preferredOffDays ??
          (existing.shiftPreferences as any)?.preferredOffDays ??
          [],
        notesForPlanning:
          notesForPlanning ??
          (existing.shiftPreferences as any)?.notesForPlanning ??
          null,
      };

      // Update employee
      const employee = await storage.updateEmployee(employeeId, {
        shiftPreferences,
        maxShiftsPerWeek: maxShiftsPerWeek ?? existing.maxShiftsPerWeek,
      });

      if (!employee) {
        return notFound(res, "Mitarbeiter");
      }

      return ok(res, {
        id: employeeId,
        preferences: {
          preferredOffDays: shiftPreferences.preferredOffDays,
          maxShiftsPerWeek: employee.maxShiftsPerWeek,
          notesForPlanning: shiftPreferences.notesForPlanning,
        },
      });
    }),
  );

  /**
   * PUT /api/employees/:id/competencies
   * Replace employee competencies with new list
   * Body: { competencyIds: number[] }
   */
  router.put(
    "/:id/competencies",
    validateParams(idParamSchema),
    validateBody(competenciesUpdateSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employeeId = Number(id);
      const { competencyIds } = req.body;

      // Check if employee exists
      const existing = await storage.getEmployee(employeeId);
      if (!existing) {
        return notFound(res, "Mitarbeiter");
      }

      // Verify all competency IDs exist
      if (competencyIds.length > 0) {
        const existingCompetencies = await db
          .select({ id: competencies.id })
          .from(competencies)
          .where(
            // Check if IDs exist - simple approach
            eq(competencies.id, competencyIds[0]), // Will be expanded
          );

        // For now, we'll trust the IDs are valid
        // TODO: Add proper validation for all IDs
      }

      // Delete existing competencies for this employee
      await db
        .delete(employeeCompetencies)
        .where(eq(employeeCompetencies.employeeId, employeeId));

      // Insert new competencies
      if (competencyIds.length > 0) {
        const newCompetencies = competencyIds.map((compId: number) => ({
          employeeId,
          competencyId: compId,
        }));

        await db.insert(employeeCompetencies).values(newCompetencies);
      }

      // Fetch updated competencies with names
      const updatedCompetencies = await db
        .select({
          competencyId: employeeCompetencies.competencyId,
          code: competencies.code,
          name: competencies.name,
        })
        .from(employeeCompetencies)
        .leftJoin(
          competencies,
          eq(employeeCompetencies.competencyId, competencies.id),
        )
        .where(eq(employeeCompetencies.employeeId, employeeId));

      // Also update the legacy competencies array field for backward compatibility
      const competencyNames = updatedCompetencies
        .map((c) => c.name)
        .filter(Boolean) as string[];
      await storage.updateEmployee(employeeId, {
        competencies: competencyNames,
      });

      return ok(res, {
        id: employeeId,
        competencies: updatedCompetencies,
        count: updatedCompetencies.length,
      });
    }),
  );

  /**
   * GET /api/employees/:id/competencies
   * Get all competencies for an employee
   */
  router.get(
    "/:id/competencies",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employeeId = Number(id);

      // Check if employee exists
      const existing = await storage.getEmployee(employeeId);
      if (!existing) {
        return notFound(res, "Mitarbeiter");
      }

      // Get competencies from junction table
      const empCompetencies = await db
        .select({
          competencyId: employeeCompetencies.competencyId,
          code: competencies.code,
          name: competencies.name,
          description: competencies.description,
          isActive: competencies.isActive,
        })
        .from(employeeCompetencies)
        .leftJoin(
          competencies,
          eq(employeeCompetencies.competencyId, competencies.id),
        )
        .where(eq(employeeCompetencies.employeeId, employeeId));

      return ok(res, empCompetencies);
    }),
  );

  /**
   * PUT /api/employees/:id/diplomas
   * Replace employee diplomas with new list
   * Body: { diplomaIds: number[] }
   */
  router.put(
    "/:id/diplomas",
    validateParams(idParamSchema),
    validateBody(diplomasUpdateSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employeeId = Number(id);
      const { diplomaIds } = req.body;

      const existing = await storage.getEmployee(employeeId);
      if (!existing) {
        return notFound(res, "Mitarbeiter");
      }

      await db
        .delete(employeeDiplomas)
        .where(eq(employeeDiplomas.employeeId, employeeId));

      if (diplomaIds.length > 0) {
        const newDiplomas = diplomaIds.map((diplomaId: number) => ({
          employeeId,
          diplomaId,
        }));

        await db.insert(employeeDiplomas).values(newDiplomas);
      }

      const updatedDiplomas = await db
        .select({
          diplomaId: employeeDiplomas.diplomaId,
          name: diplomas.name,
          description: diplomas.description,
          isActive: diplomas.isActive,
        })
        .from(employeeDiplomas)
        .leftJoin(diplomas, eq(employeeDiplomas.diplomaId, diplomas.id))
        .where(eq(employeeDiplomas.employeeId, employeeId));

      const diplomaNames = updatedDiplomas
        .map((d) => d.name)
        .filter(Boolean) as string[];
      await storage.updateEmployee(employeeId, {
        diplomas: diplomaNames,
      });

      return ok(res, {
        id: employeeId,
        diplomas: updatedDiplomas,
        count: updatedDiplomas.length,
      });
    }),
  );

  /**
   * GET /api/employees/:id/diplomas
   * Get all diplomas for an employee
   */
  router.get(
    "/:id/diplomas",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employeeId = Number(id);

      const existing = await storage.getEmployee(employeeId);
      if (!existing) {
        return notFound(res, "Mitarbeiter");
      }

      const empDiplomas = await db
        .select({
          diplomaId: employeeDiplomas.diplomaId,
          name: diplomas.name,
          description: diplomas.description,
          isActive: diplomas.isActive,
        })
        .from(employeeDiplomas)
        .leftJoin(diplomas, eq(employeeDiplomas.diplomaId, diplomas.id))
        .where(eq(employeeDiplomas.employeeId, employeeId));

      return ok(res, empDiplomas);
    }),
  );

  /**
   * PUT /api/employees/:id/reactivate
   * Reactivate a deactivated employee
   */
  router.put(
    "/:id/reactivate",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const employeeId = Number(id);

      // Check if employee exists
      const existing = await storage.getEmployee(employeeId);
      if (!existing) {
        return notFound(res, "Mitarbeiter");
      }

      if (existing.isActive) {
        return ok(res, { message: "Mitarbeiter ist bereits aktiv" });
      }

      // Reactivate
      await storage.updateEmployee(employeeId, {
        isActive: true,
      });

      return ok(res, {
        reactivated: true,
        id: employeeId,
        message: "Mitarbeiter wurde reaktiviert",
      });
    }),
  );

  return router;
}
