import type { Router } from "express";
import { z } from "zod";
import { db, eq, and, gte, lte, ne } from "../../lib/db";
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

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value: string) => new Date(`${value}T00:00:00`);

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const countInclusiveDays = (start: Date, end: Date) => {
  const diff = Math.floor((end.getTime() - start.getTime()) / DAY_MS);
  return diff + 1;
};

const splitRangeByYear = (startDate: string, endDate: string) => {
  const start = toDate(startDate);
  const end = toDate(endDate);
  const ranges: Array<{ year: number; start: Date; end: Date; days: number }> = [];
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const rangeStart = start > yearStart ? start : yearStart;
    const rangeEnd = end < yearEnd ? end : yearEnd;
    if (rangeStart <= rangeEnd) {
      ranges.push({
        year,
        start: rangeStart,
        end: rangeEnd,
        days: countInclusiveDays(rangeStart, rangeEnd)
      });
    }
  }

  return ranges;
};

const canApproveVacation = (reqUser: Express.Request["user"]) => {
  if (!reqUser) return false;
  if (reqUser.isAdmin) return true;
  return reqUser.capabilities?.includes("vacation.approve") ?? false;
};

const isOwnerOrAdmin = (reqUser: Express.Request["user"], employeeId: number) => {
  if (!reqUser) return false;
  if (reqUser.isAdmin) return true;
  return reqUser.employeeId === employeeId;
};

const countVacationDaysForYear = async (
  employeeId: number,
  year: number,
  excludeAbsenceId?: number
) => {
  const yearStart = formatDate(new Date(year, 0, 1));
  const yearEnd = formatDate(new Date(year, 11, 31));
  const conditions = [
    eq(plannedAbsences.employeeId, employeeId),
    eq(plannedAbsences.reason, "Urlaub"),
    ne(plannedAbsences.status, "Abgelehnt"),
    lte(plannedAbsences.startDate, yearEnd),
    gte(plannedAbsences.endDate, yearStart)
  ];

  if (excludeAbsenceId) {
    conditions.push(ne(plannedAbsences.id, excludeAbsenceId));
  }

  const rows = await db
    .select({
      startDate: plannedAbsences.startDate,
      endDate: plannedAbsences.endDate
    })
    .from(plannedAbsences)
    .where(and(...conditions));

  return rows.reduce((total, row) => {
    const rangeStart = toDate(String(row.startDate)) > toDate(yearStart) ? toDate(String(row.startDate)) : toDate(yearStart);
    const rangeEnd = toDate(String(row.endDate)) < toDate(yearEnd) ? toDate(String(row.endDate)) : toDate(yearEnd);
    if (rangeStart > rangeEnd) return total;
    return total + countInclusiveDays(rangeStart, rangeEnd);
  }, 0);
};

const ensureVacationEntitlement = async (
  employeeId: number,
  startDate: string,
  endDate: string,
  excludeAbsenceId?: number
) => {
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!employee) {
    return { ok: false, error: "Mitarbeiter nicht gefunden" };
  }

  const entitlement = employee.vacationEntitlement;
  if (entitlement === null || entitlement === undefined) {
    return { ok: true };
  }

  const ranges = splitRangeByYear(startDate, endDate);
  for (const range of ranges) {
    const usedDays = await countVacationDaysForYear(employeeId, range.year, excludeAbsenceId);
    const totalDays = usedDays + range.days;
    if (totalDays > entitlement) {
      return {
        ok: false,
        error: `Urlaubsanspruch ${entitlement} Tage ueberschritten (bereits ${usedDays} Tage, beantragt ${range.days} Tage in ${range.year}).`
      };
    }
  }

  return { ok: true };
};

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
    const { employee_id, employeeId, year, month, status, from, to, startDate, endDate } = req.query;
    const employeeFilter = employee_id ?? employeeId;
    const rangeFrom = from ?? startDate;
    const rangeTo = to ?? endDate;
    
    // Get all absences with employee details
    const conditions = [];
    if (employeeFilter) {
      conditions.push(eq(plannedAbsences.employeeId, Number(employeeFilter)));
    }
    if (year) {
      conditions.push(eq(plannedAbsences.year, Number(year)));
    }
    if (month) {
      conditions.push(eq(plannedAbsences.month, Number(month)));
    }
    if (status) {
      conditions.push(eq(plannedAbsences.status, String(status)));
    }
    if (rangeFrom && rangeTo) {
      conditions.push(
        and(
          lte(plannedAbsences.startDate, String(rangeTo)),
          gte(plannedAbsences.endDate, String(rangeFrom))
        )
      );
    } else if (rangeFrom) {
      conditions.push(gte(plannedAbsences.endDate, String(rangeFrom)));
    } else if (rangeTo) {
      conditions.push(lte(plannedAbsences.startDate, String(rangeTo)));
    }

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
      .leftJoin(employees, eq(plannedAbsences.employeeId, employees.id))
      .where(conditions.length ? and(...conditions) : undefined);
    
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

      if (!req.user) {
        return res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
      }
      if (!isOwnerOrAdmin(req.user, employeeId)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung fuer diese Abwesenheit" });
      }
      
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

      if (reason === "Urlaub") {
        const entitlementCheck = await ensureVacationEntitlement(employeeId, startDate, endDate);
        if (!entitlementCheck.ok) {
          return validationError(res, entitlementCheck.error || "Urlaubsanspruch ueberschritten");
        }
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
          createdById: req.user?.employeeId ?? createdById ?? null
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

      if (!req.user) {
        return res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
      }
      if (!canApproveVacation(req.user)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung zur Freigabe" });
      }
      
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
      
      if (existing.reason === "Urlaub" && status !== "Abgelehnt") {
        const entitlementCheck = await ensureVacationEntitlement(
          existing.employeeId,
          String(existing.startDate),
          String(existing.endDate),
          absenceId
        );
        if (!entitlementCheck.ok) {
          return validationError(res, entitlementCheck.error || "Urlaubsanspruch ueberschritten");
        }
      }

      // Determine isApproved based on status
      let isApproved: boolean | null = null;
      if (status === 'Genehmigt') {
        isApproved = true;
      } else if (status === 'Abgelehnt') {
        isApproved = false;
      }

      const resolvedApprovedById =
        status === "Geplant" ? null : approvedById ?? req.user?.employeeId ?? null;
      
      // Update the absence
      const [updated] = await db
        .update(plannedAbsences)
        .set({
          status,
          isApproved,
          approvedById: resolvedApprovedById,
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

      if (!req.user) {
        return res.status(401).json({ success: false, error: "Anmeldung erforderlich" });
      }
      
      // Verify absence exists
      const [existing] = await db
        .select()
        .from(plannedAbsences)
        .where(eq(plannedAbsences.id, absenceId));
      
      if (!existing) {
        return notFound(res, "Abwesenheit");
      }

      if (!isOwnerOrAdmin(req.user, existing.employeeId)) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung fuer diese Aktion" });
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
