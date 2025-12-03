# Overview

**MyCliniQ** (MCQ) is a hospital department management system for the Department of Gynecology and Obstetrics at Klinikum Klagenfurt. The application provides roster planning, employee management, vacation tracking, knowledge management, and SOP development for medical staff. It's a full-stack TypeScript application with a React frontend and Express backend, designed for web and mobile (iOS/Android via Capacitor).

# User Preferences

Preferred communication style: Simple, everyday language.

**SYSTEMRULE**: Do NOT modify or replace any existing UI layout, styles, navigation, Tailwind classes, ShadCN components, color schemes, or page structures. Only ADD new functions, ADD logic, FIX bugs, EXTEND modules. Never redesign or restructure existing components. Never remove functionality. Maintain strict backward compatibility.

# Platform Requirements

MyCliniQ supports:
1. Web (React + Vite)
2. iOS App (Capacitor, identifier: at.kabeg.mycliniq)
3. Android App (Capacitor, identifier: at.kabeg.mycliniq)

Mobile uses the SAME codebase. All UI must be mobile-compatible (tap instead of hover). Deep links: mycliniq://

# Module Overview

1. Dashboard
2. Dienstplan (Monatsplan) - Monthly roster
3. Wochenplan - Weekly assignment
4. Tageseinsatzplan - Daily assignment
5. Dienstwünsche - Shift wishes
6. Urlaubsplanung - Vacation planning
7. Verwaltung: Mitarbeiter - Employee management
8. Verwaltung: Kompetenzen - Competency management
9. Verwaltung: Ressourcen & Räume - Room/resource management
10. Schnellerfassung (Krankmeldung, Raum sperren, User anlegen)
11. Projekte (SOP, Studien, Admin)
12. SOP-System
13. Benutzer-Einstellungen
14. Export-System (Excel, ICS)
15. Notifications
16. Audit-Log
17. Zentrale KI-Regeln (Central Rule Engine)

# Central Rule Engine (MANDATORY)

All planning modules (Dienstplan, Wochenplan, Tageseinsatzplan) MUST use the same validation and scoring logic.

## Harte Regeln (must NEVER be violated by automated planning):
- No two services on consecutive days
- Dienst = 25 hours; afterwards minimum 11 hours rest
- Weekend logic:
  - Saturday = 1 weekend
  - Sunday = 1 weekend
  - Friday + Sunday = 1 weekend
  - Sunday alone = 1 weekend
- Fortbildung > Urlaub (priority)
- Raum-Sperre removes personnel automatically
- Users without Dienstberechtigung cannot be assigned
- Competence requirements must be met (UND/ODER combinations)

## Weiche Regeln (scored):
- Dienstwünsche
- Fairness distribution
- Balanced weekends over months
- Ausbildungsschwerpunkte (OP vs Ambulanz)
- "Von Vorteil"-Rule: KI may deviate if system-wide benefit

**Manual overrides are ALWAYS allowed. Show warnings but do NOT block saving.**

# System Architecture

## Frontend Architecture

**Framework**: React 18 with TypeScript running on Vite for development and production builds.

**UI Component System**: shadcn/ui components built on Radix UI primitives with consistent styling and accessibility.

**Styling Approach**: TailwindCSS v4 with custom CSS variables. KABEG corporate design with blue color scheme (#0F5BA7).

**State Management**: TanStack Query (React Query) for server state with automatic caching and optimistic updates.

**Routing**: Wouter for client-side routing.

**Display Format**: Names ALWAYS as "Nachname (badge)" - e.g., "Müller (gyn)", "Schmidt (geb)"

## Backend Architecture

**Framework**: Express.js with TypeScript on Node.js.

**Database Layer**: Drizzle ORM with PostgreSQL (Neon serverless).

**Data Storage Pattern**: IStorage interface in server/storage.ts abstracts database operations.

**API Design**: RESTful endpoints organized by resource:
- `/api/employees` - CRUD for medical staff
- `/api/roster-shifts` - Roster planning and shift assignment
- `/api/absences` - Vacation and absence tracking
- `/api/resources` - Department resource management
- `/api/roster-settings` - Last approved month tracking
- `/api/shift-wishes` - Employee shift preferences
- `/api/planned-absences` - Requested time off
- `/api/projects` - Project management
- `/api/knowledge/documents` - Published SOPs

**Session Management**: express-session with connect-pg-simple for PostgreSQL-backed sessions.

## Database Schema

**Core Tables**:
- `users` - Authentication credentials
- `employees` - Medical staff with roles, competencies, contact info
- `rosterShifts` - Daily shift assignments
- `absences` - Time-off records
- `resources` - Department resources

**Planning Tables**:
- `rosterSettings` - Last approved month tracking
- `shiftWishes` - Employee preferences per month
- `plannedAbsences` - Requested absences for planning

**Project Tables**:
- `projectInitiatives` - Project container with status tracking
- `projectTasks` - Tasks with hierarchy and assignment
- `projectDocuments` - Documents with versioning
- `approvals` - Approval workflow
- `taskActivities` - Comments and activity log

**Enums**: PostgreSQL enums for roles, service types, absence reasons (Urlaub, ZA, RZ, FB, GU, SU, ZU, PU, Krankenstand, Quarantäne, Info).

## Dienstwünsche (Shift Wishes)

Employees submit wishes for the month after the last approved roster:

**Input Fields**:
- Preferred days (calendar selection)
- Avoid days (calendar selection)
- Preferred service types (gyn, kreiszimmer, turnus)
- Max services per week
- Notes

**Absences**:
- RZ (Ruhezeit)
- ZA (Zeitausgleich)
- GU (Gebührenurlaub)
- SU (Sonderurlaub)
- ZU (Zusatzurlaub)
- FB (Fortbildung)
- Krank (Krankenstand)
- PU (Pflegeurlaub)
- Qu (Quarantäne)

**Status**: Draft / Submitted

**Admin View**: Shows submission overview of all employees. Header notification appears when all wishes are submitted.

## Einsatzplanung (Weekly Assignment Planning)

The Einsatzplanung module (`/admin/weekly`) provides detailed weekly assignment view:

**Structure** (matching department layout):
- Stationen (Geburtshilfl. Bettenstation, Gynäkologische Bettenstation)
- Schwangerenambulanz (Risikoambulanz 1 & 2, Schwangerensprechstunde)
- Gynäkologische Ambulanz (GYN 1-3, TU/KPJ, Mamma)
- OP (OP 1 TCH, OP 2)
- Verwaltung / Organisation (Teamleitung, OP-Koordination, QM)
- Abwesenheiten (Urlaub, RZ, ZA, Fortbildung)
- Dienstfrei (Frei nach Dienst)

**Edit Permissions**:
- Primararzt
- 1. Oberarzt
- Sekretariat

## Projektmanagement (Project Management)

**Workflow**:
1. Create project/initiative (e.g., "SOP PPROM")
2. Add tasks and delegate to team members
3. Create and edit documents collaboratively
4. Request approval from senior physicians
5. Publish approved documents to Wissen section

**SOP Workflow**: Draft → OA Review → Primar Approval → Auto-publish to SOP-System

**Status Workflow**:
- Projects: Entwurf → Aktiv → In Prüfung → Abgeschlossen → Archiviert
- Tasks: Offen → In Bearbeitung → Zur Prüfung → Genehmigt → Veröffentlicht
- Documents: Entwurf → In Bearbeitung → Zur Prüfung → Genehmigt → Veröffentlicht

## Export System (MANDATORY)

All modules MUST export to .xlsx:
- Dienstplan (month)
- Wochenplan
- Tagesplan
- Urlaubsliste
- Mitarbeiterliste
- Räume
- Kompetenzen
- SOP metadata
- Projektliste

## ICS Calendar Subscriptions (MANDATORY)

Token-protected ICS feeds per user:
- Dienstplan
- Wochenplan
- Combined

Must sync with iOS, Google Calendar, Outlook, Android.

## Badge Management

Badges must be unique. Display format: Nachname (badge)

## External Dependencies

**Database**: Neon Serverless PostgreSQL
**UI**: shadcn/ui + Radix UI + Lucide icons
**Forms**: React Hook Form + Zod
**Dates**: date-fns (German locale)
**Build**: Vite + esbuild + TypeScript
