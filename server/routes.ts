// server/routes.ts
import type { Express, Request, Response } from "express";
import type { Server } from "http";

import { storage } from "./storage";
import { registerModularApiRoutes } from "./api";
import { authenticate, requireAuth } from "./api/middleware/auth";

import { generateRosterPlan } from "./services/rosterGenerator";
import { insertRosterShiftSchema } from "@shared/schema";

import { fromZodError } from "zod-validation-error";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * WICHTIG:
 * - Alles, was in registerModularApiRoutes(app) existiert (z.B. /api/me, /api/employees, /api/admin, ...)
 *   NICHT nochmal hier definieren -> sonst Konflikte/Überschreiben.
 * - routes.ts hält nur:
 *   - auth/login/logout/set-password/init-password
 *   - roster legacy (bis du es modularisiert hast)
 */
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // 1) Modular API (source of truth)
  registerModularApiRoutes(app);

  /**
   * =========================
   * 2) AUTH (Session Token)
   * =========================
   */

  // Login -> erstellt Session Token
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, rememberMe } = req.body ?? {};

      if (!email || !password) {
        return res.status(400).json({ error: "E-Mail und Passwort sind erforderlich" });
      }

      const employee = await storage.getEmployeeByEmail(String(email).toLowerCase());
      if (!employee) {
        return res.status(401).json({ error: "Ungültige Anmeldedaten" });
      }

      if (!employee.passwordHash) {
        return res
          .status(401)
          .json({ error: "Kein Passwort gesetzt. Bitte kontaktieren Sie das Sekretariat." });
      }

      const ok = await bcrypt.compare(String(password), employee.passwordHash);
      if (!ok) {
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
        deviceName: (req.headers["user-agent"] as string) || "Unknown",
      });

      await storage.updateEmployeeLastLogin(employee.id);

      const { passwordHash, ...safeEmployee } = employee as any;

      return res.json({
        token,
        employee: safeEmployee,
        expiresAt,
      });
    } catch (err) {
      console.error("[routes] Login error:", err);
      return res.status(500).json({ error: "Anmeldung fehlgeschlagen" });
    }
  });

  // Logout -> löscht Session Token (wenn vorhanden)
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        await storage.deleteSession(token);
      }
      return res.json({ success: true });
    } catch (err) {
      console.error("[routes] Logout error:", err);
      return res.status(500).json({ error: "Abmeldung fehlgeschlagen" });
    }
  });

  // Passwort setzen/ändern (self oder admin)
  app.post("/api/auth/set-password", authenticate, requireAuth, async (req: Request, res: Response) => {
    try {
      // req.user ist gesetzt durch authenticate+requireAuth
      const sessionToken = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.substring(7)
        : null;

      if (!sessionToken) {
        return res.status(401).json({ error: "Nicht authentifiziert" });
      }

      const session = await storage.getSessionByToken(sessionToken);
      if (!session) {
        return res.status(401).json({ error: "Sitzung abgelaufen" });
      }

      const currentEmployee = await storage.getEmployee(session.employeeId);
      if (!currentEmployee) {
        return res.status(401).json({ error: "Benutzer nicht gefunden" });
      }

      const { employeeId, newPassword, currentPassword } = req.body ?? {};
      const targetEmployeeId = employeeId ? Number(employeeId) : session.employeeId;

      const isAdmin =
        currentEmployee.isAdmin ||
        ["Primararzt", "1. Oberarzt", "Sekretariat"].includes(currentEmployee.role as any);

      // Self-only, außer Admin
      if (targetEmployeeId !== session.employeeId && !isAdmin) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      // Wenn man sein eigenes Passwort ändert und schon eins existiert: currentPassword prüfen
      if (targetEmployeeId === session.employeeId && currentEmployee.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ error: "Aktuelles Passwort erforderlich" });
        }
        const ok = await bcrypt.compare(String(currentPassword), currentEmployee.passwordHash);
        if (!ok) {
          return res.status(401).json({ error: "Aktuelles Passwort ist falsch" });
        }
      }

      if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ error: "Passwort muss mindestens 6 Zeichen haben" });
      }

      const passwordHash = await bcrypt.hash(String(newPassword), 10);
      await storage.setEmployeePassword(targetEmployeeId, passwordHash);

      return res.json({ success: true });
    } catch (err) {
      console.error("[routes] Set password error:", err);
      return res.status(500).json({ error: "Passwort konnte nicht gesetzt werden" });
    }
  });

  // Initial-Passwort setzen (nur wenn noch keines gesetzt ist)
  app.post("/api/auth/init-password", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};

      if (!email || !password) {
        return res.status(400).json({ error: "E-Mail und Passwort erforderlich" });
      }

      const employee = await storage.getEmployeeByEmail(String(email).toLowerCase());
      if (!employee) {
        return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
      }

      if (employee.passwordHash) {
        return res.status(400).json({ error: "Passwort bereits gesetzt" });
      }

      if (String(password).length < 6) {
        return res.status(400).json({ error: "Passwort muss mindestens 6 Zeichen haben" });
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      await storage.setEmployeePassword(employee.id, passwordHash);

      return res.json({ success: true });
    } catch (err) {
      console.error("[routes] Init password error:", err);
      return res.status(500).json({ error: "Passwort konnte nicht initialisiert werden" });
    }
  });

  /**
   * =========================
   * 3) ROSTER (legacy)
   * =========================
   * (Wenn du diese Endpunkte später modular machst, dann hier raus!)
   */

  app.get("/api/roster/:year/:month", async (req: Request, res: Response) => {
    try {
      const year = Number(req.params.year);
      const month = Number(req.params.month);
      const shifts = await storage.getRosterShiftsByMonth(year, month);
      return res.json(shifts);
    } catch (err) {
      console.error("[routes] roster month error:", err);
      return res.status(500).json({ error: "Failed to fetch roster" });
    }
  });

  app.get("/api/roster/date/:date", async (req: Request, res: Response) => {
    try {
      const shifts = await storage.getRosterShiftsByDate(req.params.date);
      return res.json(shifts);
    } catch (err) {
      console.error("[routes] roster date error:", err);
      return res.status(500).json({ error: "Failed to fetch roster for date" });
    }
  });

  app.get("/api/roster/shift/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const shift = await storage.getRosterShift(id);
      if (!shift) return res.status(404).json({ error: "Shift not found" });
      return res.json(shift);
    } catch (err) {
      console.error("[routes] roster shift error:", err);
      return res.status(500).json({ error: "Failed to fetch shift" });
    }
  });

  app.post("/api/roster", async (req: Request, res: Response) => {
    try {
      const validated = insertRosterShiftSchema.parse(req.body);
      const shift = await storage.createRosterShift(validated);
      return res.status(201).json(shift);
    } catch (err: any) {
      if (err?.name === "ZodError") {
        const validationError = fromZodError(err);
        return res.status(400).json({ error: validationError.message });
      }
      console.error("[routes] roster create error:", err);
      return res.status(500).json({ error: "Failed to create roster shift" });
    }
  });

  app.patch("/api/roster/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const shift = await storage.updateRosterShift(id, req.body);
      if (!shift) return res.status(404).json({ error: "Shift not found" });
      return res.json(shift);
    } catch (err) {
      console.error("[routes] roster patch error:", err);
      return res.status(500).json({ error: "Failed to update shift" });
    }
  });

  app.delete("/api/roster/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteRosterShift(id);
      return res.status(204).send();
    } catch (err) {
      console.error("[routes] roster delete error:", err);
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
    } catch (err) {
      console.error("[routes] roster bulk error:", err);
      return res.status(500).json({ error: "Failed to create roster shifts" });
    }
  });

  app.delete("/api/roster/month/:year/:month", async (req: Request, res: Response) => {
    try {
      const year = Number(req.params.year);
      const month = Number(req.params.month);
      await storage.deleteRosterShiftsByMonth(year, month);
      return res.status(204).send();
    } catch (err) {
      console.error("[routes] roster delete month error:", err);
      return res.status(500).json({ error: "Failed to delete roster shifts" });
    }
  });

  // AI roster generation
  app.post("/api/roster/generate", async (req: Request, res: Response) => {
    try {
      const { year, month } = req.body ?? {};
      if (!year || !month) {
        return res.status(400).json({ error: "Jahr und Monat sind erforderlich" });
      }

      const employees = await storage.getEmployees();
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const absences = await storage.getAbsencesByDateRange(startDate, endDate);

      const result = await generateRosterPlan(employees, absences, Number(year), Number(month));

      return res.json({
        success: true,
        generatedShifts: result.shifts.length,
        reasoning: result.reasoning,
        warnings: result.warnings,
        shifts: result.shifts,
      });
    } catch (err: any) {
      console.error("[routes] roster generate error:", err);
      return res.status(500).json({
        error: "Dienstplan-Generierung fehlgeschlagen",
        details: err?.message,
      });
    }
  });

  // apply generated roster
  app.post("/api/roster/apply-generated", async (req: Request, res: Response) => {
    try {
      const { year, month, shifts, replaceExisting } = req.body ?? {};

      if (!Array.isArray(shifts) || shifts.length === 0) {
        return res.status(400).json({ error: "Keine Dienste zum Speichern" });
      }

      if (replaceExisting) {
        await storage.deleteRosterShiftsByMonth(Number(year), Number(month));
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
    } catch (err: any) {
      console.error("[routes] roster apply-generated error:", err);
      return res.status(500).json({
        error: "Speichern fehlgeschlagen",
        details: err?.message,
      });
    }
  });

  return httpServer;
}