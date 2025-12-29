import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertEmployeeSchema, 
  insertRosterShiftSchema, 
  insertAbsenceSchema, 
  insertResourceSchema, 
  insertWeeklyAssignmentSchema,
  insertProjectInitiativeSchema,
  insertProjectTaskSchema,
  insertProjectDocumentSchema,
  insertApprovalSchema,
  insertTaskActivitySchema,
  insertLongTermShiftWishSchema
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateRosterPlan } from "./services/rosterGenerator";
import { registerModularApiRoutes } from "./api";
import { employeeDoesShifts } from "@shared/shiftTypes";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value: string) =>
  EMAIL_REGEX.test(value) && !/[^\x00-\x7F]/.test(value);

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
      const shift = await storage.createRosterShift(validatedData);
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
      const shift = await storage.updateRosterShift(id, req.body);
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

      const result = await generateRosterPlan(employees, absences, year, month, wishes, longTermWishes);

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

  // Shift swap request routes
  app.get("/api/shift-swaps", async (req: Request, res: Response) => {
    try {
      const { status, employeeId } = req.query;
      
      if (status === 'Ausstehend') {
        const requests = await storage.getPendingShiftSwapRequests();
        return res.json(requests);
      }
      
      if (employeeId) {
        const requests = await storage.getShiftSwapRequestsByEmployee(parseInt(employeeId as string));
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
        return res.json({ lastApprovedYear: 2026, lastApprovedMonth: 1 });
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch roster settings" });
    }
  });

  app.post("/api/roster-settings", async (req: Request, res: Response) => {
    try {
      const { lastApprovedYear, lastApprovedMonth, updatedById } = req.body;
      const settings = await storage.upsertRosterSettings({
        lastApprovedYear,
        lastApprovedMonth,
        updatedById
      });
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update roster settings" });
    }
  });

  // Get the next planning month (month after last approved)
  app.get("/api/roster-settings/next-planning-month", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getRosterSettings();
      let year = 2026;
      let month = 2; // February 2026 default

      if (settings) {
        month = settings.lastApprovedMonth + 1;
        year = settings.lastApprovedYear;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }

      // Get eligible employees and submitted wishes count
      const employees = await storage.getEmployees();
      const eligibleEmployees = employees.filter(employeeDoesShifts);
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

  // Planned Absences routes
  app.get("/api/planned-absences", async (req: Request, res: Response) => {
    try {
      const { year, month, employeeId } = req.query;
      
      if (employeeId && year && month) {
        const absences = await storage.getPlannedAbsencesByEmployee(
          parseInt(employeeId as string),
          parseInt(year as string),
          parseInt(month as string)
        );
        return res.json(absences);
      }
      
      if (year && month) {
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
      const absence = await storage.createPlannedAbsence(req.body);
      res.status(201).json(absence);
    } catch (error) {
      res.status(500).json({ error: "Failed to create planned absence" });
    }
  });

  app.patch("/api/planned-absences/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
      await storage.deletePlannedAbsence(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete planned absence" });
    }
  });

  return httpServer;
}
