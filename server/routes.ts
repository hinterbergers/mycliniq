// server/routes.ts
import type { Express, Request, Response } from "express";
import type { Server } from "http";

import { storage } from "./storage";
import { registerModularApiRoutes } from "./api";

import { generateRosterPlan } from "./services/rosterGenerator";

import { insertRosterShiftSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * WICHTIG:
 * - Alles was schon in registerModularApiRoutes(app) definiert ist (z.B. /api/me, /api/employees, /api/admin, ...)
 *   NICHT nochmal hier definieren -> sonst Konflikte/Überschreiben.
 * - routes.ts hält nur "legacy" + auth + roster-legacy Endpunkte.
 * - /api/auth/me ist entfernt. Frontend muss /api/me verwenden.
 */
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // 1) Modular API (source of truth)
  registerModularApiRoutes(app);

  /**
   * =========================
   * 2) AUTH (Session Token)
   * =========================
   */

  // LOGIN
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, rememberMe } = req.body ?? {};

      if (!email || !password) {
        return res.status(400).json({ error: "E-Mail und Passwort sind erforderlich" });
      }

      const employee = await storage.getEmployeeByEmail(email);
      if (!employee) {
        return res.status(401).json({ error: "Ungültige Anmeldedaten" });
      }

      if (!employee.passwordHash) {
        return res
          .status(401)
          .json({ error: "Kein Passwort gesetzt. Bitte kontaktieren Sie das Sekretariat." });
      }

      const isValidPassword = await bcrypt.compare(password, employee.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Ungültige Anmeldedaten" });
      }

      const token = crypto.randomBytes(32).toString("hex");

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
        deviceName: req.headers["user-agent"] || "Unknown",
      });

      await storage.updateEmployeeLastLogin(employee.id);

      // don't leak hash
      const { passwordHash, ...safeEmployee } = employee as any;

      return res.json({
        token,
        employee: safeEmployee,
        expiresAt,
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Anmeldung fehlgeschlagen" });
    }
  });

  // LOGOUT
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        await storage.deleteSession(token);
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      return res.status(500).json({ error: "Abmeldung fehlgeschlagen" });
    }
  });

  /**
   * /api/auth/me ist ABSICHTLICH ENTFERNT.
   * Verwende /api/me (kommt aus registerModularApiRoutes).
   */

  // SET PASSWORD (admin or self)
  app.post("/api/auth/set-password", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
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

      const { employeeId, newPassword, currentPassword } = req.body ?? {};
      const targetEmployeeId = employeeId || session.employeeId;

      const isAdmin =
        currentEmployee.isAdmin ||
        ["Primararzt", "1. Oberarzt", "Sekretariat"].includes(currentEmployee.role);

      if (targetEmployeeId !== session.employeeId && !isAdmin) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      // self-change: require current password if already set
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

      return res.json({ success: true });
    } catch (error) {
      console.error("Set password error:", error);
      return res.status(500).json({ error: "Passwort konnte nicht gesetzt werden" });
    }
  });

  // INIT PASSWORD (first time)
  app.post("/api/auth/init-password", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};

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

      return res.json({ success: true });
    } catch (error) {
      console.error("Init password error:", error);
      return res.status(500).json({ error: "Passwort konnte nicht initialisiert werden" });
    }
  });

  /**
   * =========================
   * 3) ROSTER (legacy)
   * =========================
   * (Wenn du diese Endpunkte später auch modular machst, dann hier raus!)
   */

  app.get("/api/roster/:year/:month", async (req: Request, res: Response) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const shifts = await storage.getRosterShiftsByMonth(year, month);
      return res.json(shifts);
    } catch (error) {
      console.error("Fetch roster error:", error);
      return res.status(500).json({ error: "Failed to fetch roster" });
    }
  });

  app.get("/api/roster/date/:date", async (req: Request, res: Response) => {
    try {
      const date = req.params.date;
      const shifts = await storage.getRosterShiftsByDate(date);
      return res.json(shifts);
    } catch (error) {
      console.error("Fetch roster date error:", error);
      return res.status(500).json({ error: "Failed to fetch roster for date" });
    }
  });

  app.get("/api/roster/shift/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const shift = await storage.getRosterShift(id);
      if (!shift) return res.status(404).json({ error: "Shift not found" });
      return res.json(shift);
    } catch (error) {
      console.error("Fetch shift error:", error);
      return res.status(500).json({ error: "Failed to fetch shift" });
    }
  });

  app.post("/api/roster", async (req: Request, res: Response) => {
    try {
      const validatedData = insertRosterShiftSchema.parse(req.body);
      const shift = await storage.createRosterShift(validatedData);
      return res.status(201).json(shift);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      console.error("Create roster shift error:", error);
      return res.status(500).json({ error: "Failed to create roster shift" });
    }
  });

  app.patch("/api/roster/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const shift = await storage.updateRosterShift(id, req.body);
      if (!shift) return res.status(404).json({ error: "Shift not found" });
      return res.json(shift);
    } catch (error) {
      console.error("Update roster shift error:", error);
      return res.status(500).json({ error: "Failed to update shift" });
    }
  });

  app.delete("/api/roster/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteRosterShift(id);
      return res.status(204).send();
    } catch (error) {
      console.error("Delete roster shift error:", error);
      return res.status(500).json({ error: "Failed to delete roster shift" });
    }
  });

  app.post("/api/roster/bulk", async (req: Request, res: Response) => {
    try {
      const shifts = req.body?.shifts;
      if (!Array.isArray(shifts)) {
        return res.status(400).json({ error: "Shifts must be an array" });
      }
      const results = await storage.bulkCreateRosterShifts(shifts);
      return res.status(201).json(results);
    } catch (error) {
      console.error("Bulk create roster shifts error:", error);
      return res.status(500).json({ error: "Failed to create roster shifts" });
    }
  });

  app.delete("/api/roster/month/:year/:month", async (req: Request, res: Response) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      await storage.deleteRosterShiftsByMonth(year, month);
      return res.status(204).send();
    } catch (error) {
      console.error("Delete roster month error:", error);
      return res.status(500).json({ error: "Failed to delete roster shifts" });
    }
  });

  // AI Roster Generation
  app.post("/api/roster/generate", async (req: Request, res: Response) => {
    try {
      const { year, month } = req.body ?? {};
      if (!year || !month) {
        return res.status(400).json({ error: "Jahr und Monat sind erforderlich" });
      }

      const employees = await storage.getEmployees();
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
      const absences = await storage.getAbsencesByDateRange(startDate, endDate);

      const result = await generateRosterPlan(employees, absences, year, month);

      return res.json({
        success: true,
        generatedShifts: result.shifts.length,
        reasoning: result.reasoning,
        warnings: result.warnings,
        shifts: result.shifts,
      });
    } catch (error: any) {
      console.error("Roster generation error:", error);
      return res.status(500).json({
        error: "Dienstplan-Generierung fehlgeschlagen",
        details: error?.message,
      });
    }
  });

  // Apply generated roster (save to database)
  app.post("/api/roster/apply-generated", async (req: Request, res: Response) => {
    try {
      const { year, month, shifts, replaceExisting } = req.body ?? {};

      if (!shifts || !Array.isArray(shifts)) {
        return res.status(400).json({ error: "Keine Dienste zum Speichern" });
      }

      if (replaceExisting) {
        await storage.deleteRosterShiftsByMonth(year, month);
      }

      const shiftData = shifts.map((s: any) => ({
        employeeId: s.employeeId,
        date: s.date,
        serviceType: s.serviceType,
      }));

      const results = await storage.bulkCreateRosterShifts(shiftData);

      return res.json({
        success: true,
        savedShifts: results.length,
        message: `${results.length} Dienste erfolgreich gespeichert`,
      });
    } catch (error: any) {
      console.error("Apply generated roster error:", error);
      return res.status(500).json({
        error: "Speichern fehlgeschlagen",
        details: error?.message,
      });
    }
  });

  return httpServer;
}