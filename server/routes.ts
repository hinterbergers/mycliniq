import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, eq, asc, and, gte, lte, ne, inArray, isNotNull, sql } from "./lib/db";
import { 
  insertEmployeeSchema, 
  insertRosterShiftSchema, 
  insertAbsenceSchema, 
  insertPlannedAbsenceSchema,
  insertResourceSchema, 
  insertWeeklyAssignmentSchema,
  insertProjectInitiativeSchema,
  insertProjectTaskSchema,
  insertProjectDocumentSchema,
  insertApprovalSchema,
  insertTaskActivitySchema,
  insertLongTermShiftWishSchema,
  insertLongTermAbsenceSchema,
  plannedAbsences,
  employees,
  shiftSwapRequests,
  sessions,
  serviceLines,
  rosterShifts as rosterShiftsTable,
  rooms,
  weeklyPlans,
  weeklyPlanAssignments,
  dailyOverrides,
  type RosterShift
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateRosterPlan } from "./services/rosterGenerator";
import { registerModularApiRoutes } from "./api";
import { employeeDoesShifts, OVERDUTY_KEY } from "@shared/shiftTypes";
import { requireAuth } from "./api/middleware/auth";
import { getWeek, getWeekYear } from "date-fns";

const rosterShifts = rosterShiftsTable;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value: string) =>
  EMAIL_REGEX.test(value) && !/[^\x00-\x7F]/.test(value);
const DEFAULT_LAST_APPROVED = { year: 2026, month: 1 };
const DEFAULT_SERVICE_LINES = [
  {
    key: "kreiszimmer",
    label: "Kreißzimmer (Ass.)",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 1,
    isActive: true
  },
  {
    key: "gyn",
    label: "Gynäkologie (OA)",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 2,
    isActive: true
  },
  {
    key: "turnus",
    label: "Turnus (Ass./TA)",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 3,
    isActive: true
  },
  {
    key: OVERDUTY_KEY,
    label: "Überdienst",
    startTime: "07:30",
    endTime: "08:00",
    endsNextDay: true,
    sortOrder: 4,
    isActive: true
  }
];

type ServiceLineInfo = {
  key: string;
  label: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  sortOrder: number;
  isActive: boolean;
};

const normalizeTime = (value: unknown, fallback: string): string => {
  if (!value) return fallback;
  if (value instanceof Date) {
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  if (typeof value === "string") {
    const [hours, minutes] = value.split(":");
    if (hours && minutes) {
      return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
    }
  }
  return fallback;
};

const buildDateTime = (date: string, time: string): Date => {
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  const dateTime = new Date(`${date}T00:00:00`);
  dateTime.setHours(Number.isNaN(hours) ? 0 : hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
  return dateTime;
};

const toIcsDateTimeLocal = (date: Date) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}00`;
};

const loadServiceLines = async (clinicId: number): Promise<ServiceLineInfo[]> => {
  const rows = await db
    .select()
    .from(serviceLines)
    .where(eq(serviceLines.clinicId, clinicId))
    .orderBy(asc(serviceLines.sortOrder), asc(serviceLines.label));

  if (!rows.length) {
    return DEFAULT_SERVICE_LINES;
  }

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    startTime: normalizeTime(row.startTime, "07:30"),
    endTime: normalizeTime(row.endTime, "08:00"),
    endsNextDay: Boolean(row.endsNextDay),
    sortOrder: row.sortOrder ?? 0,
    isActive: row.isActive !== false
  }));
};

const compareYearMonth = (
  yearA: number,
  monthA: number,
  yearB: number,
  monthB: number
) => {
  if (yearA === yearB && monthA === monthB) return 0;
  if (yearA > yearB || (yearA === yearB && monthA > monthB)) return 1;
  return -1;
};

const addMonth = (year: number, month: number, delta = 1) => {
  let nextYear = year;
  let nextMonth = month + delta;
  while (nextMonth > 12) {
    nextMonth -= 12;
    nextYear += 1;
  }
  while (nextMonth < 1) {
    nextMonth += 12;
    nextYear -= 1;
  }
  return { year: nextYear, month: nextMonth };
};

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

const buildWeeklyPlanWorkplaceLabel = (assignment: {
  roomName?: string | null;
  roleLabel?: string | null;
}) => {
  const room = assignment.roomName?.trim();
  const label = assignment.roleLabel?.trim();
  const candidate = room || label || "";
  if (!candidate) return null;
  if (candidate.toLowerCase() === "diensthabende") return null;
  return candidate;
};

const VIENNA_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Vienna",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const WEEK_OPTIONS = { weekStartsOn: 1 as const, firstWeekContainsDate: 4 as const };
const DASHBOARD_PREVIEW_DAYS = 7;

const parseIsoDateUtc = (value: string) => {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateUtc = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildPreviewDateRange = (startIso: string, days: number) => {
  const base = parseIsoDateUtc(startIso);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(base);
    day.setUTCDate(day.getUTCDate() + index);
    return formatDateUtc(day);
  });
};

const DEFAULT_SERVICE_LINE_LABELS = new Map(
  DEFAULT_SERVICE_LINES.map((line) => [line.key, line.label])
);

const loadServiceLineLabels = async (clinicId?: number): Promise<Map<string, string>> => {
  const labelMap = new Map(DEFAULT_SERVICE_LINE_LABELS);
  if (!clinicId) {
    return labelMap;
  }
  const clinicLines = await db
    .select({
      key: serviceLines.key,
      label: serviceLines.label
    })
    .from(serviceLines)
    .where(eq(serviceLines.clinicId, clinicId));

  clinicLines.forEach((line) => {
    if (line.key && line.label) {
      labelMap.set(line.key, line.label);
    }
  });

  return labelMap;
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

const countPlannedVacationDaysForYear = async (
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

const ensurePlannedVacationEntitlement = async (
  employeeId: number,
  startDate: string,
  endDate: string,
  excludeAbsenceId?: number
) => {
  const employee = await storage.getEmployee(employeeId);
  if (!employee) {
    return { ok: false, error: "Mitarbeiter nicht gefunden" };
  }

  const entitlement = employee.vacationEntitlement;
  if (entitlement === null || entitlement === undefined) {
    return { ok: true };
  }

  const ranges = splitRangeByYear(startDate, endDate);
  for (const range of ranges) {
    const usedDays = await countPlannedVacationDaysForYear(employeeId, range.year, excludeAbsenceId);
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Register modular API routes (employees, competencies, rooms, duty-plans, etc.)
  registerModularApiRoutes(app);

  const canApproveLongTermWishes = async (req: Request): Promise<boolean> => {
    if (!req.user) return false;
    if (req.user.isAdmin || req.user.appRole === "Admin") return true;
    const approver = await storage.getEmployee(req.user.employeeId);
    return approver?.role === "Primararzt" || approver?.role === "1. Oberarzt";
  };

  const canViewPlanningData = (req: Request): boolean => {
    if (!req.user) return false;
    if (req.user.isAdmin || req.user.appRole === "Admin" || req.user.appRole === "Editor") return true;
    return req.user.capabilities?.includes("dutyplan.edit") ?? false;
  };

  const resolvePlanningMonth = async () => {
    const settings = await storage.getRosterSettings();
    const previewPlan = await storage.getLatestDutyPlanByStatus("Vorläufig");
    const lastApproved = settings
      ? { year: settings.lastApprovedYear, month: settings.lastApprovedMonth }
      : DEFAULT_LAST_APPROVED;
    const base = previewPlan
      ? { year: previewPlan.year, month: previewPlan.month }
      : lastApproved;
    const auto = addMonth(base.year, base.month);
    const storedWish =
      settings?.wishYear && settings?.wishMonth
        ? { year: settings.wishYear, month: settings.wishMonth }
        : null;
    const current =
      storedWish && compareYearMonth(storedWish.year, storedWish.month, auto.year, auto.month) >= 0
        ? storedWish
        : auto;
    const shouldPersist =
      !settings ||
      !storedWish ||
      compareYearMonth(auto.year, auto.month, storedWish.year, storedWish.month) > 0;

    return { settings, lastApproved, auto, current, shouldPersist };
  };
  
  // Auth routes
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, rememberMe } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "E-Mail und Passwort sind erforderlich" });
      }
      
      const employee = await storage.getEmployeeByEmail(email);
      if (!employee) {
        return res.status(401).json({ error: "Ungültige Anmeldedaten" });
      }
      
      if (!employee.passwordHash) {
        return res.status(401).json({ error: "Kein Passwort gesetzt. Bitte kontaktieren Sie das Sekretariat." });
      }
      
      const isValidPassword = await bcrypt.compare(password, employee.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Ungültige Anmeldedaten" });
      }
      
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      if (rememberMe) {
        expiresAt.setDate(expiresAt.getDate() + 30);
      } else {
        expiresAt.setHours(expiresAt.getHours() + 8);
      }
      
      await storage.createSession({
        employeeId: employee.id,
        token,
        isRemembered: !!rememberMe,
        expiresAt,
        deviceName: req.headers['user-agent'] || 'Unknown'
      });
      
      await storage.updateEmployeeLastLogin(employee.id);
      
      const { passwordHash, ...safeEmployee } = employee;
      
      res.json({
        token,
        employee: safeEmployee,
        expiresAt
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Anmeldung fehlgeschlagen" });
    }
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        await storage.deleteSession(token);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Abmeldung fehlgeschlagen" });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Nicht authentifiziert" });
      }
      
      const token = authHeader.substring(7);
      const session = await storage.getSessionByToken(token);
      
      if (!session) {
        return res.status(401).json({ error: "Sitzung abgelaufen" });
      }
      
      const employee = await storage.getEmployee(session.employeeId);
      if (!employee) {
        return res.status(401).json({ error: "Benutzer nicht gefunden" });
      }
      
      const { passwordHash, ...safeEmployee } = employee;
      res.json({ employee: safeEmployee });
    } catch (error) {
      res.status(500).json({ error: "Fehler beim Abrufen des Benutzers" });
    }
  });

  app.post("/api/auth/set-password", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Nicht authentifiziert" });
      }
      
      const token = authHeader.substring(7);
      const session = await storage.getSessionByToken(token);
      if (!session) {
        return res.status(401).json({ error: "Sitzung abgelaufen" });
      }
      
      const currentEmployee = await storage.getEmployee(session.employeeId);
      if (!currentEmployee) {
        return res.status(401).json({ error: "Benutzer nicht gefunden" });
      }
      
      const { employeeId, newPassword, currentPassword } = req.body;
      const targetEmployeeId = employeeId || session.employeeId;
      
      const isAdmin = currentEmployee.isAdmin || 
        ['Primararzt', '1. Oberarzt', 'Sekretariat'].includes(currentEmployee.role);
      
      if (targetEmployeeId !== session.employeeId && !isAdmin) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }
      
      if (targetEmployeeId === session.employeeId && currentEmployee.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ error: "Aktuelles Passwort erforderlich" });
        }
        const isValid = await bcrypt.compare(currentPassword, currentEmployee.passwordHash);
        if (!isValid) {
          return res.status(401).json({ error: "Aktuelles Passwort ist falsch" });
        }
      }
      
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Passwort muss mindestens 6 Zeichen haben" });
      }
      
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.setEmployeePassword(targetEmployeeId, passwordHash);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Set password error:', error);
      res.status(500).json({ error: "Passwort konnte nicht gesetzt werden" });
    }
  });

  app.post("/api/auth/init-password", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "E-Mail und Passwort erforderlich" });
      }
      
      const employee = await storage.getEmployeeByEmail(email);
      if (!employee) {
        return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
      }
      
      if (employee.passwordHash) {
        return res.status(400).json({ error: "Passwort bereits gesetzt" });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ error: "Passwort muss mindestens 6 Zeichen haben" });
      }
      
      const passwordHash = await bcrypt.hash(password, 10);
      await storage.setEmployeePassword(employee.id, passwordHash);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Init password error:', error);
      res.status(500).json({ error: "Passwort konnte nicht initialisiert werden" });
    }
  });

  // Employee routes
  app.get("/api/employees", async (req: Request, res: Response) => {
    try {
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  app.get("/api/employees/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const employee = await storage.getEmployee(id);
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }
      res.json(employee);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employee" });
    }
  });

  app.post("/api/employees", async (req: Request, res: Response) => {
    try {
      const validatedData = insertEmployeeSchema.parse(req.body);
      const employee = await storage.createEmployee(validatedData);
      res.status(201).json(employee);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create employee" });
    }
  });

  app.patch("/api/employees/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (typeof req.body?.email === "string") {
        const emailValue = req.body.email.trim();
        if (!emailValue || !isValidEmail(emailValue)) {
          return res.status(400).json({ error: "Bitte eine gueltige E-Mail-Adresse ohne Umlaute eingeben." });
        }
        req.body.email = emailValue;
      }
      if (typeof req.body?.emailPrivate === "string") {
        const emailPrivateValue = req.body.emailPrivate.trim();
        if (emailPrivateValue && !isValidEmail(emailPrivateValue)) {
          return res.status(400).json({ error: "Bitte eine gueltige private E-Mail-Adresse ohne Umlaute eingeben." });
        }
        req.body.emailPrivate = emailPrivateValue || null;
      }
      const employee = await storage.updateEmployee(id, req.body);
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }
      res.json(employee);
    } catch (error) {
      res.status(500).json({ error: "Failed to update employee" });
    }
  });

  app.delete("/api/employees/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteEmployee(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete employee" });
    }
  });

  // Roster routes
  app.get("/api/roster/:year/:month", async (req: Request, res: Response) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const shifts = await storage.getRosterShiftsByMonth(year, month);
      res.json(shifts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch roster" });
    }
  });

  app.get("/api/roster/date/:date", async (req: Request, res: Response) => {
    try {
      const date = req.params.date;
      const shifts = await storage.getRosterShiftsByDate(date);
      res.json(shifts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch roster for date" });
    }
  });

  app.post("/api/roster", async (req: Request, res: Response) => {
    try {
      const validatedData = insertRosterShiftSchema.parse(req.body);
      const rawEmployeeId = validatedData.employeeId;
      const rawFreeText = typeof validatedData.assigneeFreeText === "string"
        ? validatedData.assigneeFreeText.trim()
        : "";
      if (!rawEmployeeId && !rawFreeText) {
        return res.status(400).json({ error: "Mitarbeiter oder Freitext ist erforderlich" });
      }
      const payload = {
        ...validatedData,
        employeeId: rawEmployeeId || null,
        assigneeFreeText: rawEmployeeId ? null : rawFreeText || null
      };
      const shift = await storage.createRosterShift(payload);
      res.status(201).json(shift);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create roster shift" });
    }
  });

  app.delete("/api/roster/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteRosterShift(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete roster shift" });
    }
  });

  app.get("/api/roster/shift/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const shift = await storage.getRosterShift(id);
      if (!shift) {
        return res.status(404).json({ error: "Shift not found" });
      }
      res.json(shift);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift" });
    }
  });

  app.patch("/api/roster/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = { ...req.body };
      if (Object.prototype.hasOwnProperty.call(updateData, "assigneeFreeText")) {
        updateData.assigneeFreeText = typeof updateData.assigneeFreeText === "string"
          ? updateData.assigneeFreeText.trim()
          : updateData.assigneeFreeText;
        if (updateData.assigneeFreeText === "") {
          updateData.assigneeFreeText = null;
        }
      }
      if (Object.prototype.hasOwnProperty.call(updateData, "employeeId")) {
        if (updateData.employeeId) {
          updateData.assigneeFreeText = null;
        }
      }
      if (Object.prototype.hasOwnProperty.call(updateData, "assigneeFreeText")) {
        if (updateData.assigneeFreeText) {
          updateData.employeeId = null;
        }
      }
      if (!updateData.employeeId && !updateData.assigneeFreeText && !updateData.notes) {
        return res.status(400).json({ error: "Mitarbeiter oder Freitext ist erforderlich" });
      }
      const shift = await storage.updateRosterShift(id, updateData);
      if (!shift) {
        return res.status(404).json({ error: "Shift not found" });
      }
      res.json(shift);
    } catch (error) {
      res.status(500).json({ error: "Failed to update shift" });
    }
  });

  app.post("/api/roster/bulk", async (req: Request, res: Response) => {
    try {
      const shifts = req.body.shifts;
      if (!Array.isArray(shifts)) {
        return res.status(400).json({ error: "Shifts must be an array" });
      }
      const invalid = shifts.find((shift) => !shift.employeeId && !shift.assigneeFreeText);
      if (invalid) {
        return res.status(400).json({ error: "Mitarbeiter oder Freitext ist erforderlich" });
      }
      const results = await storage.bulkCreateRosterShifts(shifts);
      res.status(201).json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to create roster shifts" });
    }
  });

  app.delete("/api/roster/month/:year/:month", async (req: Request, res: Response) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      await storage.deleteRosterShiftsByMonth(year, month);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete roster shifts" });
    }
  });

  // AI Roster Generation
  app.post("/api/roster/generate", async (req: Request, res: Response) => {
    try {
      const { year, month } = req.body;
      
      if (!year || !month) {
        return res.status(400).json({ error: "Jahr und Monat sind erforderlich" });
      }

      const employees = await storage.getEmployees();
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
      const absences = await storage.getAbsencesByDateRange(startDate, endDate);
      const wishes = await storage.getShiftWishesByMonth(year, month);
      const longTermWishes = await storage.getLongTermShiftWishesByStatus("Genehmigt");
      const longTermAbsences = await storage.getLongTermAbsencesByStatus("Genehmigt");
      const clinicId = (req as any).user?.clinicId;
      const serviceLineMeta = clinicId
        ? await db
            .select({
              key: serviceLines.key,
              roleGroup: serviceLines.roleGroup,
              label: serviceLines.label
            })
            .from(serviceLines)
            .where(eq(serviceLines.clinicId, clinicId))
            .orderBy(asc(serviceLines.sortOrder), asc(serviceLines.label))
        : [];

      const result = await generateRosterPlan(
        employees,
        absences,
        year,
        month,
        wishes,
        longTermWishes,
        longTermAbsences,
        serviceLineMeta
      );

      res.json({
        success: true,
        generatedShifts: result.shifts.length,
        reasoning: result.reasoning,
        warnings: result.warnings,
        shifts: result.shifts
      });
    } catch (error: any) {
      console.error("Roster generation error:", error);
      res.status(500).json({ 
        error: "Dienstplan-Generierung fehlgeschlagen", 
        details: error.message 
      });
    }
  });

  // Apply generated roster (save to database)
  app.post("/api/roster/apply-generated", async (req: Request, res: Response) => {
    try {
      const { year, month, shifts, replaceExisting } = req.body;

      if (!shifts || !Array.isArray(shifts)) {
        return res.status(400).json({ error: "Keine Dienste zum Speichern" });
      }

      if (replaceExisting) {
        await storage.deleteRosterShiftsByMonth(year, month);
      }

      const shiftData = shifts.map((s: any) => ({
        employeeId: s.employeeId,
        date: s.date,
        serviceType: s.serviceType
      }));

      const results = await storage.bulkCreateRosterShifts(shiftData);

      res.json({
        success: true,
        savedShifts: results.length,
        message: `${results.length} Dienste erfolgreich gespeichert`
      });
    } catch (error: any) {
      console.error("Apply generated roster error:", error);
      res.status(500).json({ 
        error: "Speichern fehlgeschlagen", 
        details: error.message 
      });
    }
  });

  app.get("/api/dashboard", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const todayVienna = VIENNA_DATE_FORMAT.format(new Date());
      const previewDates = buildPreviewDateRange(todayVienna, DASHBOARD_PREVIEW_DAYS);
      const startDate = previewDates[0];
      const endDate = previewDates[previewDates.length - 1];

      const serviceLineLabels = await loadServiceLineLabels(user.clinicId);
      const shiftRows = await db
      const shiftRows = await db
      .select({
        id: rosterShifts.id,
        date: rosterShifts.date,
        serviceType: rosterShifts.serviceType,
        employeeId: rosterShifts.employeeId,
        assigneeFreeText: rosterShifts.assigneeFreeText,
        primaryDeploymentArea: employees.primaryDeploymentArea,
        firstName: employees.firstName,
        lastName: employees.lastName,
        isActive: employees.isActive
      })
      .from(rosterShifts)
      .leftJoin(employees, eq(rosterShifts.employeeId, employees.id))
      .where(
        and(
          gte(rosterShifts.date, startDate),
          lte(rosterShifts.date, endDate)
        )
      );

      .from(rosterShifts)
      .leftJoin(employees, eq(rosterShifts.employeeId, employees.id))
      .where(
          and(
            gte(rosterShifts.date, startDate),
            lte(rosterShifts.date, endDate)
          )
        );

      const userShifts = new Map<string, typeof shiftRows[0]>();
      shiftRows.forEach((shift) => {
        if (shift.employeeId === user.employeeId) {
          userShifts.set(shift.date, shift);
        }
      });

      const getServiceLabel = (serviceType?: string | null) => {
        if (!serviceType) return null;
        return serviceLineLabels.get(serviceType) ?? serviceType;
      };

      const normalize = (value?: string | null) => (typeof value === "string" ? value.trim() : "");
      const normalizeName = (value?: string | null) => {
        const trimmed = normalize(value);
        return trimmed || null;
      };

      const toIsoDay = (value: Date) => ((value.getUTCDay() + 6) % 7) + 1;

      const previewMeta = previewDates.map((date) => {
        const isoDate = new Date(`${date}T00:00:00`);
        const weekYear = getWeekYear(isoDate, WEEK_OPTIONS);
        const weekNumber = getWeek(isoDate, WEEK_OPTIONS);
        const isoDay = toIsoDay(isoDate);
        const weekKey = `${weekYear}-${weekNumber}`;
        return { date, weekYear, weekNumber, isoDay, weekKey };
      });

      const weekKeySet = new Set(previewMeta.map((meta) => meta.weekKey));
      const weeklyPlanByKey = new Map<string, number | null>();
      await Promise.all(
        Array.from(weekKeySet).map(async (key) => {
          const [weekYearStr, weekNumberStr] = key.split("-");
          const weekYear = Number(weekYearStr);
          const weekNumber = Number(weekNumberStr);
          const [planRow] = await db
            .select({ id: weeklyPlans.id })
            .from(weeklyPlans)
            .where(
              and(
                eq(weeklyPlans.year, weekYear),
                eq(weeklyPlans.weekNumber, weekNumber)
              )
            )
            .limit(1);
          weeklyPlanByKey.set(key, planRow?.id ?? null);
        })
      );

      const assignmentsByDayKey = new Map<string, Array<{
        roomId: number;
        roomName: string | null;
        roleLabel: string | null;
        employeeId: number | null;
        firstName: string | null;
        lastName: string | null;
        weekday: number;
      }>>();
      const referencedEmployeeIds = new Set<number>();

      await Promise.all(
        Array.from(weeklyPlanByKey.entries()).map(async ([key, planId]) => {
          if (!planId) return;
          const rows = await db
            .select({
              roomId: weeklyPlanAssignments.roomId,
              roomName: rooms.name,
              roleLabel: weeklyPlanAssignments.roleLabel,
              employeeId: weeklyPlanAssignments.employeeId,
              weekday: weeklyPlanAssignments.weekday,
              firstName: employees.firstName,
              lastName: employees.lastName
            })
            .from(weeklyPlanAssignments)
            .leftJoin(rooms, eq(weeklyPlanAssignments.roomId, rooms.id))
            .leftJoin(employees, eq(weeklyPlanAssignments.employeeId, employees.id))
            .where(eq(weeklyPlanAssignments.weeklyPlanId, planId));
          rows.forEach((assignment) => {
            const dayKey = `${key}-${assignment.weekday}`;
            const existing = assignmentsByDayKey.get(dayKey) ?? [];
            existing.push(assignment);
            assignmentsByDayKey.set(dayKey, existing);
            if (assignment.employeeId) {
              referencedEmployeeIds.add(assignment.employeeId);
            }
          });
        })
      );

      const overrides = await db
        .select({
          date: dailyOverrides.date,
          roomId: dailyOverrides.roomId,
          originalEmployeeId: dailyOverrides.originalEmployeeId,
          newEmployeeId: dailyOverrides.newEmployeeId
        })
        .from(dailyOverrides)
        .where(
          and(
            gte(dailyOverrides.date, startDate),
            lte(dailyOverrides.date, endDate)
          )
        );

      const overridesByDate = new Map<string, Array<{
        roomId: number;
        originalEmployeeId: number | null;
        newEmployeeId: number | null;
      }>>();
      overrides.forEach((override) => {
        const key = override.date;
        if (!overridesByDate.has(key)) {
          overridesByDate.set(key, []);
        }
        overridesByDate.get(key)!.push({
          roomId: override.roomId,
          originalEmployeeId: override.originalEmployeeId,
          newEmployeeId: override.newEmployeeId
        });
        if (override.newEmployeeId) {
          referencedEmployeeIds.add(override.newEmployeeId);
        }
      });

      const employeeNameMap = new Map<number, { firstName: string | null; lastName: string | null }>();
      if (referencedEmployeeIds.size) {
        const employeeRows = await db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName
          })
          .from(employees)
          .where(inArray(employees.id, Array.from(referencedEmployeeIds)));
        employeeRows.forEach((employeeRow) => {
          employeeNameMap.set(employeeRow.id, {
            firstName: normalizeName(employeeRow.firstName),
            lastName: normalizeName(employeeRow.lastName)
          });
        });
      }

      const weekPreview = previewMeta.map(({ date, weekKey, isoDay }) => {
        const dayKey = `${weekKey}-${isoDay}`;
        const assignmentsForDay = assignmentsByDayKey.get(dayKey) ?? [];
        const overridesForDay = overridesByDate.get(date) ?? [];
        const effectiveAssignments = assignmentsForDay.map((assignment) => {
          const matchingOverride = overridesForDay.find(
            (override) =>
              override.roomId === assignment.roomId &&
              override.originalEmployeeId === assignment.employeeId
          );
          return {
            ...assignment,
            employeeId: matchingOverride
              ? matchingOverride.newEmployeeId ?? null
              : assignment.employeeId
          };
        });
        const userAssignment = user.employeeId
          ? effectiveAssignments.find((assignment) => assignment.employeeId === user.employeeId)
          : undefined;
        let workplace: string | null = null;
        const teammates: Array<{ firstName: string | null; lastName: string | null }> = [];
        if (userAssignment) {
          const roomName = normalizeName(userAssignment.roomName);
          workplace = roomName && roomName !== "Diensthabende" ? roomName : null;
        
          if (userAssignment.roomId) {
            const seen = new Set<number>();
            for (const assignment of effectiveAssignments) {
              if (!assignment.employeeId || assignment.employeeId === user.employeeId) continue;
              if (assignment.roomId !== userAssignment.roomId) continue;
              if (seen.has(assignment.employeeId)) continue;
              seen.add(assignment.employeeId);
        
              const employeeData = employeeNameMap.get(assignment.employeeId);
              // nur echte Namen reinlassen
              const firstName = employeeData?.firstName ?? null;
              const lastName = employeeData?.lastName ?? null;
              if (!firstName && !lastName) continue;
        
              teammates.push({ firstName, lastName });
            }
        
            teammates.sort((a, b) => {
              const aLast = a.lastName ?? "";
              const bLast = b.lastName ?? "";
              const lastCompare = aLast.localeCompare(bLast);
              if (lastCompare !== 0) return lastCompare;
              const aFirst = a.firstName ?? "";
              const bFirst = b.firstName ?? "";
              return aFirst.localeCompare(bFirst);
            });
          }
        }
        const shift = userShifts.get(date);
        const statusLabel = shift ? getServiceLabel(shift.serviceType) : null;
        return {
          date,
          statusLabel,
          workplace,
          teammates
        };
      });

      const todayEntry = weekPreview[0];
      let todayZe: { id: number; possible: true; accepted: boolean } | null = null;
      if (user.employeeId) {
        const [zeEntry] = await db
          .select({
            id: plannedAbsences.id,
            accepted: plannedAbsences.accepted
          })
          .from(plannedAbsences)
          .where(
            and(
              eq(plannedAbsences.employeeId, user.employeeId),
              eq(plannedAbsences.reason, "Zeitausgleich"),
              lte(plannedAbsences.startDate, todayVienna),
              gte(plannedAbsences.endDate, todayVienna),
              ne(plannedAbsences.status, "Abgelehnt")
            )
          )
          .limit(1);
        if (zeEntry) {
          todayZe = {
            id: zeEntry.id,
            possible: true,
            accepted: Boolean(zeEntry.accepted)
          };
        }
      }
      const targetDate = parseIsoDateUtc(todayVienna);
      const birthdayCandidates = await db
        .select({
          firstName: employees.firstName,
          lastName: employees.lastName
        })
        .from(employees)
        .where(
          and(
            eq(employees.isActive, true),
            ne(employees.role, "Sekretariat"),
            isNotNull(employees.birthday),
            sql`EXTRACT(MONTH FROM ${employees.birthday}) = ${targetDate.getUTCMonth() + 1}`,
            sql`EXTRACT(DAY FROM ${employees.birthday}) = ${targetDate.getUTCDate()}`
          )
        )
        .orderBy(asc(employees.lastName))
        .limit(1);

      const birthdayPerson = birthdayCandidates[0];
      const birthday = birthdayPerson
        ? {
            firstName: normalize(birthdayPerson.firstName),
            lastName: normalize(birthdayPerson.lastName)
          }
        : null;

      res.json({
        today: {
          date: todayEntry.date,
          statusLabel: todayEntry.statusLabel,
          workplace: todayEntry.workplace,
          teammates: todayEntry.teammates,
          ze: todayZe
        },
        birthday,
        weekPreview
      });
    } catch (error) {
      console.error("[Dashboard] Error:", error);
      res.status(500).json({ error: "Fehler beim Laden des Dashboards" });
    }
  });

  app.post("/api/zeitausgleich/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const zeId = Number(req.params.id);
      if (Number.isNaN(zeId)) {
        return res.status(400).json({ success: false, error: "Ungültige Zeitausgleich-ID" });
      }

      const [entry] = await db
        .select()
        .from(plannedAbsences)
        .where(eq(plannedAbsences.id, zeId));

      if (!entry) {
        return res.status(404).json({ success: false, error: "Zeitausgleich nicht gefunden" });
      }

      if (entry.reason !== "Zeitausgleich") {
        return res.status(400).json({
          success: false,
          error: "Nur Zeitausgleich-Einträge können akzeptiert werden"
        });
      }

      const currentEmployeeId = req.user?.employeeId;
      if (!currentEmployeeId || entry.employeeId !== currentEmployeeId) {
        return res.status(403).json({ success: false, error: "Keine Berechtigung für diesen Zeitausgleich" });
      }

      if (entry.status === "Abgelehnt") {
        return res.status(400).json({
          success: false,
          error: "Dieser Zeitausgleich wurde bereits abgelehnt"
        });
      }

      const [updated] = await db
        .update(plannedAbsences)
        .set({
          accepted: true,
          acceptedAt: new Date(),
          acceptedById: currentEmployeeId,
          updatedAt: new Date()
        })
        .where(eq(plannedAbsences.id, zeId))
        .returning();

      return res.json({
        success: true,
        data: {
          id: updated.id,
          accepted: Boolean(updated.accepted),
          acceptedAt: updated.acceptedAt,
          acceptedById: updated.acceptedById
        }
      });
    } catch (error) {
      console.error("[Zeitausgleich] Accept error:", error);
      res.status(500).json({ success: false, error: "Zeitausgleich konnte nicht akzeptiert werden" });
    }
  });

  app.get("/api/roster/calendar", requireAuth, async (req: Request, res: Response) => {
    try {
      const monthsParam = Number(req.query.months);
      const months = Number.isFinite(monthsParam) ? Math.min(Math.max(monthsParam, 1), 12) : 6;
      const startParam = typeof req.query.start === "string" ? new Date(req.query.start) : null;
      const startDate = startParam && !Number.isNaN(startParam.getTime())
        ? new Date(startParam.getFullYear(), startParam.getMonth(), 1)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const monthStarts: Array<{ year: number; month: number }> = [];
      for (let i = 0; i < months; i += 1) {
        const date = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
        monthStarts.push({ year: date.getFullYear(), month: date.getMonth() + 1 });
      }

      const allShifts: RosterShift[] = [];
      for (const { year, month } of monthStarts) {
        const monthShifts = await storage.getRosterShiftsByMonth(year, month);
        allShifts.push(...monthShifts);
      }

      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: "Klinik-ID fehlt" });
      }

      const serviceLineRows = await loadServiceLines(clinicId);
      const serviceLineByKey = new Map(serviceLineRows.map((line) => [line.key, line]));

      const employees = await storage.getEmployees();
      const employeesById = new Map(
        employees.map((emp) => {
          const displayName =
            [emp.firstName, emp.lastName].filter(Boolean).join(" ").trim() ||
            emp.name ||
            emp.lastName ||
            "Unbekannt";
          return [
            emp.id,
            {
              displayName,
              phonePrivate: emp.phonePrivate || null
            }
          ];
        })
      );

      const shiftsByDate = allShifts.reduce<Record<string, typeof allShifts>>((acc, shift) => {
        if (!acc[shift.date]) {
          acc[shift.date] = [];
        }
        acc[shift.date].push(shift);
        return acc;
      }, {});

      const currentEmployeeId = req.user?.employeeId;
      if (!currentEmployeeId) {
        return res.status(401).json({ error: "Anmeldung erforderlich" });
      }

      const escapeIcs = (value: string) =>
        value
          .replace(/\\/g, "\\\\")
          .replace(/;/g, "\\;")
          .replace(/,/g, "\\,")
          .replace(/\n/g, "\\n");

      const dtStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

      const events = allShifts
        .filter((shift) => shift.employeeId === currentEmployeeId)
        .map((shift) => {
          const line = serviceLineByKey.get(shift.serviceType) || {
            key: shift.serviceType,
            label: shift.serviceType,
            startTime: "07:30",
            endTime: "08:00",
            endsNextDay: true,
            sortOrder: 0,
            isActive: true
          };
          const startDateTime = buildDateTime(shift.date, line.startTime);
          const endDateTime = buildDateTime(shift.date, line.endTime);
          if (line.endsNextDay) {
            endDateTime.setDate(endDateTime.getDate() + 1);
          }
          const serviceLabel = line.label || shift.serviceType;

          const others = (shiftsByDate[shift.date] || [])
            .filter((other) => other.employeeId !== currentEmployeeId)
            .map((other) => {
              const otherEmployee = other.employeeId ? employeesById.get(other.employeeId) : null;
              const name = otherEmployee?.displayName || other.assigneeFreeText || "Unbekannt";
              if (other.serviceType === OVERDUTY_KEY && otherEmployee?.phonePrivate) {
                return `${name} (${otherEmployee.phonePrivate})`;
              }
              return name;
            });

          const description = others.length ? others.join("\n") : "Keine weiteren Dienste";

          return [
            "BEGIN:VEVENT",
            `UID:roster-${shift.id}-${currentEmployeeId}@mycliniq`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART:${toIcsDateTimeLocal(startDateTime)}`,
            `DTEND:${toIcsDateTimeLocal(endDateTime)}`,
            `SUMMARY:${escapeIcs(serviceLabel)}`,
            `DESCRIPTION:${escapeIcs(description)}`,
            "END:VEVENT"
          ].join("\r\n");
        });

      const calendar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//MyCliniQ//Roster//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        ...events,
        "END:VCALENDAR"
      ].join("\r\n");

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", "inline; filename=\"dienstplan.ics\"");
      res.send(calendar);
    } catch (error: any) {
      console.error("Roster calendar export error:", error);
      res.status(500).json({ error: "Kalender konnte nicht erstellt werden" });
    }
  });

  app.get("/api/roster/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const month = Number(req.query.month) || new Date().getMonth() + 1;

      const shifts = await storage.getRosterShiftsByMonth(year, month);
      const employees = await storage.getEmployees();
      const employeesById = new Map(employees.map((emp) => [emp.id, emp.name]));
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        return res.status(400).json({ error: "Klinik-ID fehlt" });
      }

      const serviceLineRows = await loadServiceLines(clinicId);
      const serviceLineMap = new Map(serviceLineRows.map((line) => [line.key, line]));
      const keysWithShifts = new Set(shifts.map((shift) => shift.serviceType));
      const extraKeys = Array.from(keysWithShifts).filter((key) => !serviceLineMap.has(key));
      const extraLines = extraKeys
        .sort((a, b) => a.localeCompare(b))
        .map((key) => ({
          key,
          label: key,
          startTime: "07:30",
          endTime: "08:00",
          endsNextDay: true,
          sortOrder: 999,
          isActive: true
        }));
      const allLines = [...serviceLineRows, ...extraLines].filter(
        (line) => line.isActive || keysWithShifts.has(line.key)
      );

      const shiftsByDate = shifts.reduce<Record<string, Record<string, RosterShift>>>(
        (acc, shift) => {
          if (!acc[shift.date]) {
            acc[shift.date] = {};
          }
          acc[shift.date][shift.serviceType] = shift;
          return acc;
        },
        {}
      );

      const toLabel = (shift?: RosterShift) => {
        if (!shift) return "-";
        if (shift.employeeId) {
          return employeesById.get(shift.employeeId) || "-";
        }
        return shift.assigneeFreeText || "-";
      };

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const rows = [
        ["Datum", "KW", "Tag", ...allLines.map((line) => line.label)]
      ];

      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
          date.getDate()
        ).padStart(2, "0")}`;
        const weekNumber = getWeek(date, { weekStartsOn: 1, firstWeekContainsDate: 4 });
        const weekday = date.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
        const dayShifts = shiftsByDate[dateKey] || {};
        rows.push([
          date.toLocaleDateString("de-DE"),
          String(weekNumber),
          weekday,
          ...allLines.map((line) => toLabel(dayShifts[line.key]))
        ]);
      }

      const escapeCsv = (value: string) => {
        if (value.includes(";") || value.includes("\"") || value.includes("\n")) {
          return `"${value.replace(/\"/g, "\"\"")}"`;
        }
        return value;
      };

      const csv = "\uFEFF" + rows.map((row) => row.map(escapeCsv).join(";")).join("\r\n");
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dienstplan-${year}-${String(month).padStart(2, "0")}.xls"`
      );
      res.send(csv);
    } catch (error: any) {
      console.error("Roster export error:", error);
      res.status(500).json({ error: "Export fehlgeschlagen" });
    }
  });

  // Shift swap request routes
  app.get("/api/shift-swaps", async (req: Request, res: Response) => {
    try {
      const { status, employeeId, targetEmployeeId } = req.query;
      
      if (status === 'Ausstehend') {
        const requests = await storage.getPendingShiftSwapRequests();
        return res.json(requests);
      }
      
      if (employeeId) {
        const requests = await storage.getShiftSwapRequestsByEmployee(parseInt(employeeId as string));
        return res.json(requests);
      }

      if (targetEmployeeId) {
        const requests = await storage.getShiftSwapRequestsByTargetEmployee(parseInt(targetEmployeeId as string));
        return res.json(requests);
      }
      
      const requests = await storage.getShiftSwapRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift swap requests" });
    }
  });

  app.get("/api/shift-swaps/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const request = await storage.getShiftSwapRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Shift swap request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift swap request" });
    }
  });

  app.post("/api/shift-swaps", async (req: Request, res: Response) => {
    try {
      const request = await storage.createShiftSwapRequest(req.body);
      res.status(201).json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to create shift swap request" });
    }
  });

  app.patch("/api/shift-swaps/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const request = await storage.updateShiftSwapRequest(id, req.body);
      if (!request) {
        return res.status(404).json({ error: "Shift swap request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to update shift swap request" });
    }
  });

  app.post("/api/shift-swaps/:id/approve", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { approverId, notes } = req.body;
      
      const request = await storage.updateShiftSwapRequest(id, {
        status: 'Genehmigt',
        approverId,
        approverNotes: notes,
        decidedAt: new Date()
      });
      
      if (!request) {
        return res.status(404).json({ error: "Shift swap request not found" });
      }
      
      // If approved, swap the employees in the shifts
      if (request.targetShiftId && request.targetEmployeeId) {
        const requesterShift = await storage.getRosterShift(request.requesterShiftId);
        const targetShift = await storage.getRosterShift(request.targetShiftId);
        
        if (requesterShift && targetShift) {
          await storage.updateRosterShift(request.requesterShiftId, { employeeId: request.targetEmployeeId });
          await storage.updateRosterShift(request.targetShiftId, { employeeId: request.requesterId });
        }
      }

      await db
        .update(shiftSwapRequests)
        .set({
          status: "Abgelehnt",
          approverId: approverId ?? null,
          approverNotes: "Automatisch abgelehnt (anderer Tausch wurde angenommen).",
          decidedAt: new Date()
        })
        .where(
          and(
            eq(shiftSwapRequests.requesterShiftId, request.requesterShiftId),
            eq(shiftSwapRequests.status, "Ausstehend"),
            ne(shiftSwapRequests.id, request.id)
          )
        );
      
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve shift swap request" });
    }
  });

  app.post("/api/shift-swaps/:id/reject", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { approverId, notes } = req.body;
      
      const request = await storage.updateShiftSwapRequest(id, {
        status: 'Abgelehnt',
        approverId,
        approverNotes: notes,
        decidedAt: new Date()
      });
      
      if (!request) {
        return res.status(404).json({ error: "Shift swap request not found" });
      }
      
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject shift swap request" });
    }
  });

  app.delete("/api/shift-swaps/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteShiftSwapRequest(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete shift swap request" });
    }
  });

  // Absence routes
  app.get("/api/absences", async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, employeeId } = req.query;
      
      if (employeeId) {
        const absences = await storage.getAbsencesByEmployee(parseInt(employeeId as string));
        return res.json(absences);
      }
      
      if (startDate && endDate) {
        const absences = await storage.getAbsencesByDateRange(startDate as string, endDate as string);
        return res.json(absences);
      }
      
      res.status(400).json({ error: "Missing required query parameters" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch absences" });
    }
  });

  app.post("/api/absences", async (req: Request, res: Response) => {
    try {
      const validatedData = insertAbsenceSchema.parse(req.body);
      const absence = await storage.createAbsence(validatedData);
      res.status(201).json(absence);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create absence" });
    }
  });

  app.delete("/api/absences/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAbsence(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete absence" });
    }
  });

  // Resource routes
  app.get("/api/resources", async (req: Request, res: Response) => {
    try {
      const resources = await storage.getResources();
      res.json(resources);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  app.patch("/api/resources/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const resource = await storage.updateResource(id, req.body);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      res.json(resource);
    } catch (error) {
      res.status(500).json({ error: "Failed to update resource" });
    }
  });

  // Weekly assignment routes
  app.get("/api/weekly-assignments/:year/:week", async (req: Request, res: Response) => {
    try {
      const year = parseInt(req.params.year);
      const week = parseInt(req.params.week);
      const assignments = await storage.getWeeklyAssignments(year, week);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch weekly assignments" });
    }
  });

  app.post("/api/weekly-assignments", async (req: Request, res: Response) => {
    try {
      const validatedData = insertWeeklyAssignmentSchema.parse(req.body);
      const assignment = await storage.upsertWeeklyAssignment(validatedData);
      res.status(201).json(assignment);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create weekly assignment" });
    }
  });

  app.post("/api/weekly-assignments/bulk", async (req: Request, res: Response) => {
    try {
      const assignments = req.body.assignments;
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ error: "Assignments must be an array" });
      }
      const results = await storage.bulkUpsertWeeklyAssignments(assignments);
      res.status(201).json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to save weekly assignments" });
    }
  });

  app.delete("/api/weekly-assignments/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteWeeklyAssignment(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete weekly assignment" });
    }
  });

  // Project Initiative routes
  app.get("/api/projects", async (req: Request, res: Response) => {
    try {
      const projects = await storage.getProjectInitiatives();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getProjectInitiative(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", async (req: Request, res: Response) => {
    try {
      const validatedData = insertProjectInitiativeSchema.parse(req.body);
      const project = await storage.createProjectInitiative(validatedData);
      res.status(201).json(project);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.updateProjectInitiative(id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectInitiative(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Project Tasks routes
  app.get("/api/projects/:projectId/tasks", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const tasks = await storage.getProjectTasks(projectId);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.get("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.getProjectTask(id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task" });
    }
  });

  app.post("/api/projects/:projectId/tasks", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const validatedData = insertProjectTaskSchema.parse({ ...req.body, initiativeId: projectId });
      const task = await storage.createProjectTask(validatedData);
      res.status(201).json(task);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.updateProjectTask(id, req.body);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectTask(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // Task Activities routes
  app.get("/api/tasks/:taskId/activities", async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId);
      const activities = await storage.getTaskActivities(taskId);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  app.post("/api/tasks/:taskId/activities", async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId);
      const validatedData = insertTaskActivitySchema.parse({ ...req.body, taskId });
      const activity = await storage.createTaskActivity(validatedData);
      res.status(201).json(activity);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create activity" });
    }
  });

  // Project Documents routes
  app.get("/api/projects/:projectId/documents", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const documents = await storage.getProjectDocuments(projectId);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getProjectDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/projects/:projectId/documents", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const validatedData = insertProjectDocumentSchema.parse({ ...req.body, initiativeId: projectId });
      const document = await storage.createProjectDocument(validatedData);
      res.status(201).json(document);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.patch("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.updateProjectDocument(id, req.body);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectDocument(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Document publish to knowledge base
  app.post("/api/documents/:id/publish", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.updateProjectDocument(id, {
        isPublished: true,
        publishedAt: new Date(),
        status: 'Veröffentlicht'
      });
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to publish document" });
    }
  });

  // Approvals routes
  app.get("/api/documents/:documentId/approvals", async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const approvalList = await storage.getApprovals(documentId);
      res.json(approvalList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch approvals" });
    }
  });

  app.post("/api/documents/:documentId/approvals", async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const validatedData = insertApprovalSchema.parse({ ...req.body, documentId });
      const approval = await storage.createApproval(validatedData);
      
      // Update document status to "Zur Prüfung"
      await storage.updateProjectDocument(documentId, { status: 'Zur Prüfung' });
      
      res.status(201).json(approval);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create approval request" });
    }
  });

  app.patch("/api/approvals/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const approval = await storage.updateApproval(id, {
        ...req.body,
        decidedAt: new Date()
      });
      if (!approval) {
        return res.status(404).json({ error: "Approval not found" });
      }
      
      // Update document status based on decision
      if (approval.decision === 'Genehmigt') {
        await storage.updateProjectDocument(approval.documentId, { status: 'Genehmigt' });
      } else if (approval.decision === 'Abgelehnt' || approval.decision === 'Überarbeitung nötig') {
        await storage.updateProjectDocument(approval.documentId, { status: 'In Bearbeitung' });
      }
      
      res.json(approval);
    } catch (error) {
      res.status(500).json({ error: "Failed to update approval" });
    }
  });

  // Published documents for knowledge base
  app.get("/api/knowledge/documents", async (req: Request, res: Response) => {
    try {
      const documents = await storage.getPublishedDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch published documents" });
    }
  });

  // Roster Settings routes
  app.get("/api/roster-settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getRosterSettings();
      if (!settings) {
        // Default: January 2026 as last approved month
        return res.json({
          lastApprovedYear: 2026,
          lastApprovedMonth: 1,
          wishYear: null,
          wishMonth: null,
          vacationLockFrom: null,
          vacationLockUntil: null
        });
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch roster settings" });
    }
  });

  app.post("/api/roster-settings", async (req: Request, res: Response) => {
    try {
      const { lastApprovedYear, lastApprovedMonth, updatedById, vacationLockFrom, vacationLockUntil } = req.body;
      const settings = await storage.upsertRosterSettings({
        lastApprovedYear,
        lastApprovedMonth,
        updatedById,
        vacationLockFrom,
        vacationLockUntil
      });
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update roster settings" });
    }
  });

  app.get("/api/online-users", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      const now = new Date();
      const windowStart = new Date(now.getTime() - 5 * 60 * 1000);
      const activeSessions = await db
        .select({
          employeeId: sessions.employeeId,
          lastSeenAt: sessions.lastSeenAt
        })
        .from(sessions)
        .where(and(gte(sessions.lastSeenAt, windowStart), gte(sessions.expiresAt, now)));

      const latestByEmployee = new Map<number, Date>();
      for (const session of activeSessions) {
        const lastSeen = session.lastSeenAt ? new Date(session.lastSeenAt) : null;
        if (!lastSeen) continue;
        const current = latestByEmployee.get(session.employeeId);
        if (!current || lastSeen > current) {
          latestByEmployee.set(session.employeeId, lastSeen);
        }
      }

      const employeeIds = [...latestByEmployee.keys()];
      if (employeeIds.length === 0) {
        return res.json({ count: 0, users: [] });
      }

      const rows = await db
        .select({
          id: employees.id,
          name: employees.name,
          lastName: employees.lastName,
          isActive: employees.isActive
        })
        .from(employees)
        .where(inArray(employees.id, employeeIds));

      const users = rows
        .filter((row) => row.isActive)
        .map((row) => ({
          id: row.id,
          name: row.name,
          lastName: row.lastName || "",
          lastSeenAt: latestByEmployee.get(row.id)?.toISOString() ?? null
        }))
        .sort((a, b) => {
          const lastNameCmp = a.lastName.localeCompare(b.lastName);
          if (lastNameCmp !== 0) return lastNameCmp;
          return a.name.localeCompare(b.name);
        });

      return res.json({ count: users.length, users });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch online users" });
    }
  });

  // Get the next planning month (month after last approved)
  app.get("/api/roster-settings/next-planning-month", async (req: Request, res: Response) => {
    try {
      const { settings, lastApproved, auto, current, shouldPersist } = await resolvePlanningMonth();
      const year = current.year;
      const month = current.month;

      if (shouldPersist) {
        await storage.upsertRosterSettings({
          lastApprovedYear: lastApproved.year,
          lastApprovedMonth: lastApproved.month,
          wishYear: auto.year,
          wishMonth: auto.month,
          updatedById: settings?.updatedById ?? null
        });
      }

      // Get eligible employees and submitted wishes count
      const employees = await storage.getEmployees();
      const clinicId = (req as any).user?.clinicId;
      const serviceLineMeta = clinicId
        ? await db
            .select({
              key: serviceLines.key,
              roleGroup: serviceLines.roleGroup,
              label: serviceLines.label
            })
            .from(serviceLines)
            .where(eq(serviceLines.clinicId, clinicId))
            .orderBy(asc(serviceLines.sortOrder), asc(serviceLines.label))
        : [];
      const eligibleEmployees = employees.filter((employee) => employeeDoesShifts(employee, serviceLineMeta));
      const eligibleEmployeeIds = new Set(eligibleEmployees.map((emp) => emp.id));
      const wishes = await storage.getShiftWishesByMonth(year, month);
      const submittedCount = wishes.filter(
        (wish) => wish.status === "Eingereicht" && eligibleEmployeeIds.has(wish.employeeId)
      ).length;
      const totalEmployees = eligibleEmployees.length;
      const allSubmitted = totalEmployees > 0 && submittedCount >= totalEmployees;
      const rosterShifts = await storage.getRosterShiftsByMonth(year, month);
      const draftShiftCount = rosterShifts.length;

      res.json({
        year,
        month,
        totalEmployees,
        submittedCount,
        allSubmitted,
        draftShiftCount,
        hasDraft: draftShiftCount > 0
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get next planning month" });
    }
  });

  app.post("/api/roster-settings/wishes", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!canViewPlanningData(req)) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      const { year, month } = req.body;
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Ungültiger Monat" });
      }

      const { settings, lastApproved, current } = await resolvePlanningMonth();
      if (compareYearMonth(year, month, current.year, current.month) < 0) {
        return res.status(400).json({ error: "Wunschmonat darf nicht in die Vergangenheit gesetzt werden" });
      }

      const updated = await storage.upsertRosterSettings({
        lastApprovedYear: lastApproved.year,
        lastApprovedMonth: lastApproved.month,
        wishYear: year,
        wishMonth: month,
        updatedById: req.user?.employeeId ?? settings?.updatedById ?? null
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update wish month" });
    }
  });

  // Shift Wishes routes
  app.get("/api/shift-wishes", async (req: Request, res: Response) => {
    try {
      const { year, month, employeeId } = req.query;
      
      if (employeeId && year && month) {
        const wish = await storage.getShiftWishByEmployeeAndMonth(
          parseInt(employeeId as string),
          parseInt(year as string),
          parseInt(month as string)
        );
        return res.json(wish || null);
      }
      
      if (year && month) {
        const wishes = await storage.getShiftWishesByMonth(
          parseInt(year as string),
          parseInt(month as string)
        );
        return res.json(wishes);
      }
      
      res.status(400).json({ error: "Jahr und Monat sind erforderlich" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift wishes" });
    }
  });

  app.post("/api/shift-wishes", async (req: Request, res: Response) => {
    try {
      const wish = await storage.createShiftWish(req.body);
      res.status(201).json(wish);
    } catch (error) {
      res.status(500).json({ error: "Failed to create shift wish" });
    }
  });

  app.patch("/api/shift-wishes/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const wish = await storage.updateShiftWish(id, req.body);
      if (!wish) {
        return res.status(404).json({ error: "Shift wish not found" });
      }
      res.json(wish);
    } catch (error) {
      res.status(500).json({ error: "Failed to update shift wish" });
    }
  });

  app.post("/api/shift-wishes/:id/submit", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const wish = await storage.updateShiftWish(id, {
        status: 'Eingereicht',
        submittedAt: new Date()
      });
      if (!wish) {
        return res.status(404).json({ error: "Shift wish not found" });
      }
      res.json(wish);
    } catch (error) {
      res.status(500).json({ error: "Failed to submit shift wish" });
    }
  });

  app.delete("/api/shift-wishes/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteShiftWish(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete shift wish" });
    }
  });

  // Long-term shift wishes routes
  app.get("/api/long-term-wishes", async (req: Request, res: Response) => {
    try {
      const { employeeId, status } = req.query;

      if (employeeId) {
        const targetId = parseInt(employeeId as string);
        if (req.user && !req.user.isAdmin && req.user.employeeId !== targetId) {
          return res.status(403).json({ error: "Zugriff nur auf eigene Daten erlaubt" });
        }
        const wish = await storage.getLongTermShiftWishByEmployee(targetId);
        return res.json(wish || null);
      }

      if (status) {
        const allowed = await canApproveLongTermWishes(req);
        if (!allowed) {
          return res.status(403).json({ error: "Keine Berechtigung für diese Aktion" });
        }
        const wishes = await storage.getLongTermShiftWishesByStatus(status as string);
        return res.json(wishes);
      }

      res.status(400).json({ error: "employeeId oder status ist erforderlich" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch long-term wishes" });
    }
  });

  app.post("/api/long-term-wishes", async (req: Request, res: Response) => {
    try {
      const payload = insertLongTermShiftWishSchema.parse(req.body);
      if (req.user && !req.user.isAdmin && req.user.employeeId !== payload.employeeId) {
        return res.status(403).json({ error: "Zugriff nur auf eigene Daten erlaubt" });
      }
      const wish = await storage.upsertLongTermShiftWish(payload);
      res.json(wish);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to save long-term wish" });
    }
  });

  app.post("/api/long-term-wishes/:id/submit", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getLongTermShiftWish(id);
      if (!existing) {
        return res.status(404).json({ error: "Long-term wish not found" });
      }
      if (req.user && !req.user.isAdmin && req.user.employeeId !== existing.employeeId) {
        return res.status(403).json({ error: "Zugriff nur auf eigene Daten erlaubt" });
      }
      const wish = await storage.updateLongTermShiftWish(id, {
        status: "Eingereicht",
        submittedAt: new Date()
      });
      res.json(wish);
    } catch (error) {
      res.status(500).json({ error: "Failed to submit long-term wish" });
    }
  });

  app.post("/api/long-term-wishes/:id/approve", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const allowed = await canApproveLongTermWishes(req);
      if (!allowed) {
        return res.status(403).json({ error: "Keine Berechtigung für diese Aktion" });
      }
      const existing = await storage.getLongTermShiftWish(id);
      if (!existing) {
        return res.status(404).json({ error: "Long-term wish not found" });
      }
      const wish = await storage.updateLongTermShiftWish(id, {
        status: "Genehmigt",
        approvedAt: new Date(),
        approvedById: req.user?.employeeId,
        approvalNotes: req.body?.notes || null
      });
      res.json(wish);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve long-term wish" });
    }
  });

  app.post("/api/long-term-wishes/:id/reject", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const allowed = await canApproveLongTermWishes(req);
      if (!allowed) {
        return res.status(403).json({ error: "Keine Berechtigung für diese Aktion" });
      }
      const existing = await storage.getLongTermShiftWish(id);
      if (!existing) {
        return res.status(404).json({ error: "Long-term wish not found" });
      }
      const wish = await storage.updateLongTermShiftWish(id, {
        status: "Abgelehnt",
        approvedAt: new Date(),
        approvedById: req.user?.employeeId,
        approvalNotes: req.body?.notes || null
      });
      res.json(wish);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject long-term wish" });
    }
  });

  // Long-term absences routes
  app.get("/api/long-term-absences", async (req: Request, res: Response) => {
    try {
      const { employeeId, status, from, to } = req.query;

      if (employeeId) {
        const targetId = parseInt(employeeId as string);
        if (req.user && !req.user.isAdmin && req.user.employeeId !== targetId) {
          return res.status(403).json({ error: "Zugriff nur auf eigene Daten erlaubt" });
        }
        const absences = await storage.getLongTermAbsencesByEmployee(targetId);
        return res.json(absences);
      }

      if (status) {
        if (!canViewPlanningData(req)) {
          return res.status(403).json({ error: "Keine Berechtigung für diese Aktion" });
        }
        let absences = await storage.getLongTermAbsencesByStatus(status as string);
        if (from || to) {
          const fromDate = from ? String(from) : null;
          const toDate = to ? String(to) : null;
          absences = absences.filter((absence) => {
            if (fromDate && absence.endDate < fromDate) return false;
            if (toDate && absence.startDate > toDate) return false;
            return true;
          });
        }
        return res.json(absences);
      }

      res.status(400).json({ error: "employeeId oder status ist erforderlich" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch long-term absences" });
    }
  });

  app.post("/api/long-term-absences", async (req: Request, res: Response) => {
    try {
      const payload = insertLongTermAbsenceSchema.parse(req.body);
      if (req.user && !req.user.isAdmin && req.user.employeeId !== payload.employeeId) {
        return res.status(403).json({ error: "Zugriff nur auf eigene Daten erlaubt" });
      }
      if (payload.startDate > payload.endDate) {
        return res.status(400).json({ error: "Enddatum muss nach dem Startdatum liegen" });
      }
      const reason = payload.reason?.trim();
      if (!reason) {
        return res.status(400).json({ error: "Begruendung ist erforderlich" });
      }
      const absence = await storage.createLongTermAbsence({
        ...payload,
        reason,
        status: "Entwurf",
        submittedAt: null,
        approvedAt: null,
        approvedById: null,
        approvalNotes: null
      });
      res.json(absence);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to save long-term absence" });
    }
  });

  app.patch("/api/long-term-absences/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getLongTermAbsence(id);
      if (!existing) {
        return res.status(404).json({ error: "Long-term absence not found" });
      }
      if (req.user && !req.user.isAdmin && req.user.employeeId !== existing.employeeId) {
        return res.status(403).json({ error: "Zugriff nur auf eigene Daten erlaubt" });
      }
      if (existing.status === "Eingereicht" || existing.status === "Genehmigt") {
        return res.status(400).json({ error: "Einreichungen koennen nicht mehr bearbeitet werden" });
      }
      const payload = insertLongTermAbsenceSchema.partial().parse(req.body);
      delete (payload as { status?: unknown }).status;
      delete (payload as { submittedAt?: unknown }).submittedAt;
      delete (payload as { approvedAt?: unknown }).approvedAt;
      delete (payload as { approvedById?: unknown }).approvedById;
      delete (payload as { approvalNotes?: unknown }).approvalNotes;
      delete (payload as { employeeId?: unknown }).employeeId;
      if (typeof payload.reason === "string") {
        payload.reason = payload.reason.trim();
      }
      if (payload.reason === "") {
        return res.status(400).json({ error: "Begruendung ist erforderlich" });
      }
      if (payload.startDate && payload.endDate && payload.startDate > payload.endDate) {
        return res.status(400).json({ error: "Enddatum muss nach dem Startdatum liegen" });
      }
      const updated = await storage.updateLongTermAbsence(id, payload);
      res.json(updated);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to update long-term absence" });
    }
  });

  app.post("/api/long-term-absences/:id/submit", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getLongTermAbsence(id);
      if (!existing) {
        return res.status(404).json({ error: "Long-term absence not found" });
      }
      if (req.user && !req.user.isAdmin && req.user.employeeId !== existing.employeeId) {
        return res.status(403).json({ error: "Zugriff nur auf eigene Daten erlaubt" });
      }
      const updated = await storage.updateLongTermAbsence(id, {
        status: "Eingereicht",
        submittedAt: new Date()
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to submit long-term absence" });
    }
  });

  app.post("/api/long-term-absences/:id/approve", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const allowed = await canApproveLongTermWishes(req);
      if (!allowed) {
        return res.status(403).json({ error: "Keine Berechtigung für diese Aktion" });
      }
      const existing = await storage.getLongTermAbsence(id);
      if (!existing) {
        return res.status(404).json({ error: "Long-term absence not found" });
      }
      const updated = await storage.updateLongTermAbsence(id, {
        status: "Genehmigt",
        approvedAt: new Date(),
        approvedById: req.user?.employeeId,
        approvalNotes: req.body?.notes || null
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve long-term absence" });
    }
  });

  app.post("/api/long-term-absences/:id/reject", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const allowed = await canApproveLongTermWishes(req);
      if (!allowed) {
        return res.status(403).json({ error: "Keine Berechtigung für diese Aktion" });
      }
      const existing = await storage.getLongTermAbsence(id);
      if (!existing) {
        return res.status(404).json({ error: "Long-term absence not found" });
      }
      const updated = await storage.updateLongTermAbsence(id, {
        status: "Abgelehnt",
        approvedAt: new Date(),
        approvedById: req.user?.employeeId,
        approvalNotes: req.body?.notes || null
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject long-term absence" });
    }
  });

  // Planned Absences routes
  app.get("/api/planned-absences", async (req: Request, res: Response) => {
    try {
      const { year, month, employeeId } = req.query;

      if (!req.user) {
        return res.status(401).json({ error: "Anmeldung erforderlich" });
      }

      const canViewAll =
        req.user.isAdmin ||
        (req.user.capabilities?.includes("vacation.approve") ?? false) ||
        (req.user.capabilities?.includes("vacation.lock") ?? false);
      
      if (employeeId && year && month) {
        if (!canViewAll && req.user.employeeId !== parseInt(employeeId as string)) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }
        const absences = await storage.getPlannedAbsencesByEmployee(
          parseInt(employeeId as string),
          parseInt(year as string),
          parseInt(month as string)
        );
        return res.json(absences);
      }
      
      if (year && month) {
        if (!canViewAll) {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }
        const absences = await storage.getPlannedAbsencesByMonth(
          parseInt(year as string),
          parseInt(month as string)
        );
        return res.json(absences);
      }
      
      res.status(400).json({ error: "Jahr und Monat sind erforderlich" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch planned absences" });
    }
  });

  app.post("/api/planned-absences", async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Anmeldung erforderlich" });
      }

      const validatedData = insertPlannedAbsenceSchema.parse(req.body);
      if (!req.user.isAdmin && req.user.employeeId !== validatedData.employeeId) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      if (validatedData.reason === "Urlaub") {
        const entitlementCheck = await ensurePlannedVacationEntitlement(
          validatedData.employeeId,
          String(validatedData.startDate),
          String(validatedData.endDate)
        );
        if (!entitlementCheck.ok) {
          return res.status(400).json({ error: entitlementCheck.error || "Urlaubsanspruch ueberschritten" });
        }
      }

      const absence = await storage.createPlannedAbsence({
        ...validatedData,
        createdById: req.user.employeeId
      });
      res.status(201).json(absence);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        const validationError = fromZodError(error as any);
        return res.status(400).json({ error: validationError.message });
      }
      res.status(500).json({ error: "Failed to create planned absence" });
    }
  });

  app.patch("/api/planned-absences/:id", async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Anmeldung erforderlich" });
      }

      const id = parseInt(req.params.id);
      const existing = await db
        .select()
        .from(plannedAbsences)
        .where(eq(plannedAbsences.id, id));

      if (!existing.length) {
        return res.status(404).json({ error: "Planned absence not found" });
      }

      const current = existing[0];
      if (!req.user.isAdmin && req.user.employeeId !== current.employeeId) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      const next = {
        ...current,
        ...req.body
      } as any;

      if (next.reason === "Urlaub" && next.status !== "Abgelehnt") {
        const entitlementCheck = await ensurePlannedVacationEntitlement(
          current.employeeId,
          String(next.startDate),
          String(next.endDate),
          id
        );
        if (!entitlementCheck.ok) {
          return res.status(400).json({ error: entitlementCheck.error || "Urlaubsanspruch ueberschritten" });
        }
      }

      const absence = await storage.updatePlannedAbsence(id, req.body);
      if (!absence) {
        return res.status(404).json({ error: "Planned absence not found" });
      }
      res.json(absence);
    } catch (error) {
      res.status(500).json({ error: "Failed to update planned absence" });
    }
  });

  app.delete("/api/planned-absences/:id", async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Anmeldung erforderlich" });
      }

      const id = parseInt(req.params.id);
      const existing = await db
        .select()
        .from(plannedAbsences)
        .where(eq(plannedAbsences.id, id));

      if (!existing.length) {
        return res.status(404).json({ error: "Planned absence not found" });
      }

      if (!req.user.isAdmin && req.user.employeeId !== existing[0].employeeId) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      await storage.deletePlannedAbsence(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete planned absence" });
    }
  });

  return httpServer;
}
