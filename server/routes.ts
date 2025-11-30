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
  insertTaskActivitySchema
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

  return httpServer;
}
