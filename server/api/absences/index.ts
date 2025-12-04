import type { Router } from "express";
import { z } from "zod";
import { db, eq, and } from "../../lib/db";
import { 
  ok, 
  created, 
  notFound, 
  validationError,
  asyncHandler 
} from "../../lib/api-response";
import { validateBody, validateParams, idParamSchema } from "../../lib/validate";
import { 
  plannedAbsences,
  employees
} from "@shared/schema";

/**
 * Schema for creating a planned absence
 */
const createAbsenceSchema = z.object({
  employeeId: z.number().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD"),
  reason: z.enum([
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
  ]),
  notes: z.string().nullable().optional(),
  createdById: z.number().positive().optional()
});

/**
 * Schema for updating absence status
 */
const updateStatusSchema = z.object({
  status: z.enum(['Geplant', 'Genehmigt', 'Abgelehnt']),
  approvedById: z.number().positive().optional()
});

/**
 * Extract year and month from date string
 */
function getYearMonth(dateStr: string): { year: number; month: number } {
  const date = new Date(dateStr);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1
  };
}

/**
 * Planned Absence API Routes
 * Base path: /api/absences
 */
export function registerAbsenceRoutes(router: Router) {

  /**
   * GET /api/absences
   * Get planned absences with optional filters
   * Query params:
   *   - employee_id: filter by employee
   *   - year: filter by year
   *   - month: filter by month
   *   - status: filter by status (Geplant/Genehmigt/Abgelehnt)
   *   - from: filter from date (YYYY-MM-DD)
   *   - to: filter to date (YYYY-MM-DD)
   */
  router.get("/", asyncHandler(async (req, res) => {
    const { employee_id, year, month, status, from, to } = req.query;
    
    // Get all absences with employee details
    let absences = await db
      .select({
        id: plannedAbsences.id,
        employeeId: plannedAbsences.employeeId,
        year: plannedAbsences.year,
        month: plannedAbsences.month,
        startDate: plannedAbsences.startDate,
        endDate: plannedAbsences.endDate,
        reason: plannedAbsences.reason,
        notes: plannedAbsences.notes,
        status: plannedAbsences.status,
        isApproved: plannedAbsences.isApproved,
        approvedById: plannedAbsences.approvedById,
        createdById: plannedAbsences.createdById,
        createdAt: plannedAbsences.createdAt,
        updatedAt: plannedAbsences.updatedAt,
        employeeName: employees.name,
        employeeLastName: employees.lastName,
        employeeRole: employees.role
      })
      .from(plannedAbsences)
      .leftJoin(employees, eq(plannedAbsences.employeeId, employees.id));
    
    // Apply filters
    if (employee_id) {
      absences = absences.filter(a => a.employeeId === Number(employee_id));
    }
    
    if (year) {
      absences = absences.filter(a => a.year === Number(year));
    }
    
    if (month) {
      absences = absences.filter(a => a.month === Number(month));
    }
    
    if (status) {
      absences = absences.filter(a => a.status === status);
    }
    
    if (from) {
      absences = absences.filter(a => a.startDate >= String(from));
    }
    
    if (to) {
      absences = absences.filter(a => a.endDate <= String(to));
    }
    
    return ok(res, absences);
  }));

  /**
   * GET /api/absences/:id
   * Get single absence by ID with full details
   */
  router.get("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const absenceId = Number(id);
      
      // Get absence with employee info
      const [absence] = await db
        .select({
          id: plannedAbsences.id,
          employeeId: plannedAbsences.employeeId,
          year: plannedAbsences.year,
          month: plannedAbsences.month,
          startDate: plannedAbsences.startDate,
          endDate: plannedAbsences.endDate,
          reason: plannedAbsences.reason,
          notes: plannedAbsences.notes,
          status: plannedAbsences.status,
          isApproved: plannedAbsences.isApproved,
          approvedById: plannedAbsences.approvedById,
          createdById: plannedAbsences.createdById,
          createdAt: plannedAbsences.createdAt,
          updatedAt: plannedAbsences.updatedAt,
          employeeName: employees.name,
          employeeLastName: employees.lastName,
          employeeRole: employees.role
        })
        .from(plannedAbsences)
        .leftJoin(employees, eq(plannedAbsences.employeeId, employees.id))
        .where(eq(plannedAbsences.id, absenceId));
      
      if (!absence) {
        return notFound(res, "Abwesenheit");
      }
      
      // Get approver info if approved/rejected
      let approvedBy = null;
      if (absence.approvedById) {
        const [approver] = await db
          .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
          .from(employees)
          .where(eq(employees.id, absence.approvedById));
        approvedBy = approver || null;
      }
      
      // Get creator info
      let createdBy = null;
      if (absence.createdById) {
        const [creator] = await db
          .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
          .from(employees)
          .where(eq(employees.id, absence.createdById));
        createdBy = creator || null;
      }
      
      return ok(res, {
        ...absence,
        approvedBy,
        createdBy
      });
    })
  );

  /**
   * POST /api/absences
   * Create new planned absence
   * Body: { employeeId, startDate, endDate, reason, notes?, createdById? }
   */
  router.post("/",
    validateBody(createAbsenceSchema),
    asyncHandler(async (req, res) => {
      const { employeeId, startDate, endDate, reason, notes, createdById } = req.body;
      
      // Verify employee exists
      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
      if (!employee) {
        return notFound(res, "Mitarbeiter");
      }
      
      // Verify createdById if provided
      if (createdById) {
        const [creator] = await db.select().from(employees).where(eq(employees.id, createdById));
        if (!creator) {
          return notFound(res, "Ersteller (Mitarbeiter)");
        }
      }
      
      // Validate date range
      if (new Date(endDate) < new Date(startDate)) {
        return validationError(res, "Enddatum muss nach Startdatum liegen");
      }
      
      // Extract year and month from startDate for filtering
      const { year, month } = getYearMonth(startDate);
      
      // Create the planned absence
      const [absence] = await db
        .insert(plannedAbsences)
        .values({
          employeeId,
          year,
          month,
          startDate,
          endDate,
          reason,
          notes: notes || null,
          status: 'Geplant',
          isApproved: null,
          approvedById: null,
          createdById: createdById || null
        })
        .returning();
      
      return created(res, {
        ...absence,
        employeeName: employee.name,
        employeeLastName: employee.lastName
      });
    })
  );

  /**
   * PUT /api/absences/:id/status
   * Update absence status
   * Body: { status: 'Geplant' | 'Genehmigt' | 'Abgelehnt', approvedById? }
   */
  router.put("/:id/status",
    validateParams(idParamSchema),
    validateBody(updateStatusSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const absenceId = Number(id);
      const { status, approvedById } = req.body;
      
      // Verify absence exists
      const [existing] = await db
        .select()
        .from(plannedAbsences)
        .where(eq(plannedAbsences.id, absenceId));
      
      if (!existing) {
        return notFound(res, "Abwesenheit");
      }
      
      // Verify approvedById if provided
      if (approvedById) {
        const [approver] = await db.select().from(employees).where(eq(employees.id, approvedById));
        if (!approver) {
          return notFound(res, "Genehmiger (Mitarbeiter)");
        }
      }
      
      // Determine isApproved based on status
      let isApproved: boolean | null = null;
      if (status === 'Genehmigt') {
        isApproved = true;
      } else if (status === 'Abgelehnt') {
        isApproved = false;
      }
      
      // Update the absence
      const [updated] = await db
        .update(plannedAbsences)
        .set({
          status,
          isApproved,
          approvedById: approvedById || existing.approvedById,
          updatedAt: new Date()
        })
        .where(eq(plannedAbsences.id, absenceId))
        .returning();
      
      // Get employee info
      const [employee] = await db
        .select({ name: employees.name, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.id, updated.employeeId));
      
      return ok(res, {
        ...updated,
        employeeName: employee?.name,
        employeeLastName: employee?.lastName,
        message: `Status geändert auf '${status}'`
      });
    })
  );

  /**
   * DELETE /api/absences/:id
   * Delete planned absence
   */
  router.delete("/:id",
    validateParams(idParamSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const absenceId = Number(id);
      
      // Verify absence exists
      const [existing] = await db
        .select()
        .from(plannedAbsences)
        .where(eq(plannedAbsences.id, absenceId));
      
      if (!existing) {
        return notFound(res, "Abwesenheit");
      }
      
      // Delete the absence
      await db.delete(plannedAbsences).where(eq(plannedAbsences.id, absenceId));
      
      return ok(res, {
        deleted: true,
        id: absenceId,
        employeeId: existing.employeeId,
        reason: existing.reason,
        message: "Abwesenheit gelöscht"
      });
    })
  );

  /**
   * GET /api/absences/employee/:employeeId
   * Get all absences for a specific employee
   */
  router.get("/employee/:employeeId",
    asyncHandler(async (req, res) => {
      const { employeeId } = req.params;
      const empId = Number(employeeId);
      
      // Verify employee exists
      const [employee] = await db
        .select({ id: employees.id, name: employees.name, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.id, empId));
      
      if (!employee) {
        return notFound(res, "Mitarbeiter");
      }
      
      // Get all absences for this employee
      const absences = await db
        .select()
        .from(plannedAbsences)
        .where(eq(plannedAbsences.employeeId, empId));
      
      // Group by status
      const grouped = {
        geplant: absences.filter(a => a.status === 'Geplant'),
        genehmigt: absences.filter(a => a.status === 'Genehmigt'),
        abgelehnt: absences.filter(a => a.status === 'Abgelehnt')
      };
      
      return ok(res, {
        employee,
        absences,
        grouped,
        summary: {
          total: absences.length,
          geplant: grouped.geplant.length,
          genehmigt: grouped.genehmigt.length,
          abgelehnt: grouped.abgelehnt.length
        }
      });
    })
  );

  /**
   * GET /api/absences/month/:year/:month
   * Get all absences for a specific month
   */
  router.get("/month/:year/:month",
    asyncHandler(async (req, res) => {
      const { year, month } = req.params;
      const y = Number(year);
      const m = Number(month);
      
      // Validate
      if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
        return validationError(res, "Ungültiges Jahr oder Monat");
      }
      
      // Get all absences for this month
      const absences = await db
        .select({
          id: plannedAbsences.id,
          employeeId: plannedAbsences.employeeId,
          startDate: plannedAbsences.startDate,
          endDate: plannedAbsences.endDate,
          reason: plannedAbsences.reason,
          status: plannedAbsences.status,
          notes: plannedAbsences.notes,
          employeeName: employees.name,
          employeeLastName: employees.lastName
        })
        .from(plannedAbsences)
        .leftJoin(employees, eq(plannedAbsences.employeeId, employees.id))
        .where(
          and(
            eq(plannedAbsences.year, y),
            eq(plannedAbsences.month, m)
          )
        );
      
      // Group by reason
      const byReason: Record<string, typeof absences> = {};
      absences.forEach(a => {
        if (!byReason[a.reason]) {
          byReason[a.reason] = [];
        }
        byReason[a.reason].push(a);
      });
      
      return ok(res, {
        year: y,
        month: m,
        absences,
        byReason,
        summary: {
          total: absences.length,
          geplant: absences.filter(a => a.status === 'Geplant').length,
          genehmigt: absences.filter(a => a.status === 'Genehmigt').length,
          abgelehnt: absences.filter(a => a.status === 'Abgelehnt').length
        }
      });
    })
  );

  return router;
}
