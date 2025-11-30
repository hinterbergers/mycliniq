# Overview

This is a hospital department management system (cliniq) built for the Department of Gynecology and Obstetrics at Klinikum Klagenfurt. The application provides roster planning, employee management, vacation tracking, and knowledge management for medical staff. It's a full-stack TypeScript application with a React frontend and Express backend, designed to streamline administrative tasks and improve departmental coordination.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Framework**: React 18 with TypeScript running on Vite for development and production builds.

**UI Component System**: The application uses shadcn/ui components built on Radix UI primitives, providing a comprehensive design system with consistent styling and accessibility. Components follow a modular architecture with reusable patterns for forms, dialogs, tables, and data displays.

**Styling Approach**: TailwindCSS v4 with custom CSS variables for theming. The design follows KABEG (Kärnten hospital network) corporate design guidelines with professional healthcare blue color scheme. Custom utility classes provide elevation effects and animations.

**State Management**: TanStack Query (React Query) handles server state management with automatic caching, refetching, and optimistic updates. No global client state management library is used - component state and React Query suffice.

**Routing**: Wouter provides client-side routing with a lightweight footprint. Routes are defined in App.tsx and include public pages (Dashboard, Personal, Guidelines) and admin pages (Planning Cockpit, Employee Management, Resource Management, Daily Plan Editor, Roster Plan).

**Design Patterns**:
- Component composition using Radix UI's Slot pattern for flexible component APIs
- Custom hooks for shared logic (useIsMobile, useToast)
- Layout components (Layout, Sidebar, Header) provide consistent structure across pages
- API client abstraction in lib/api.ts separates data fetching concerns

## Backend Architecture

**Framework**: Express.js with TypeScript, running on Node.js. The server handles API routes and serves the built React application in production.

**Database Layer**: Drizzle ORM provides type-safe database access with PostgreSQL (via Neon serverless). The schema defines employee records, roster shifts, absences, and resources with proper foreign key relationships.

**Data Storage Pattern**: The storage layer (server/storage.ts) defines an IStorage interface that abstracts database operations. This allows for easier testing and potential future storage backend changes. All database queries use Drizzle's query builder for type safety.

**API Design**: RESTful API endpoints organized by resource:
- `/api/employees` - CRUD operations for medical staff
- `/api/roster-shifts` - Roster planning and shift assignment
- `/api/absences` - Vacation and absence tracking
- `/api/resources` - Department resource management

Each endpoint includes proper error handling, input validation using Zod schemas, and appropriate HTTP status codes.

**Session Management**: The application uses express-session with connect-pg-simple for PostgreSQL-backed session storage. This ensures sessions persist across server restarts.

**Development vs Production**: In development, Vite middleware serves the frontend with HMR. In production, the server serves static files from the dist/public directory. The build script (script/build.ts) uses esbuild to bundle the server code and Vite to build the client.

**Rationale**: Express was chosen for its maturity and extensive middleware ecosystem. Drizzle ORM provides excellent TypeScript integration while remaining lightweight compared to heavier ORMs. The separation of storage interface from implementation allows for future flexibility.

## Database Schema

**Tables**:
- `users` - Authentication credentials (username/password hashing expected but not fully implemented)
- `employees` - Medical staff with roles (Primararzt, Oberarzt, Assistenzarzt, etc.), competencies, contact info, and employment status
- `rosterShifts` - Daily shift assignments linking employees to dates and service types (gyn, kreiszimmer, turnus)
- `absences` - Time-off records with reasons (Urlaub, Krankenstand, Fortbildung, etc.)
- `resources` - Department resources with availability tracking

**Enums**: PostgreSQL enums enforce data integrity for roles, service types, and absence reasons. These match the department's actual organizational structure.

**Schema Validation**: Drizzle-zod automatically generates Zod schemas from Drizzle table definitions, providing runtime validation that matches the database schema. This eliminates schema drift between validation and database structure.

**Migration Strategy**: Drizzle Kit manages schema migrations with the `db:push` command for development. Migrations are stored in the migrations directory for version control and production deployments.

## External Dependencies

**Database**: Neon Serverless PostgreSQL - A cloud-native PostgreSQL platform chosen for its serverless architecture, automatic scaling, and WebSocket support. The `@neondatabase/serverless` package with WebSocket configuration enables connection pooling.

**UI Component Library**: shadcn/ui components built on Radix UI provide accessible, unstyled primitives. Lucide React supplies the icon system. The components.json config defines import aliases and styling conventions.

**Form Handling**: React Hook Form with @hookform/resolvers integrates Zod validation schemas for type-safe form management.

**Date Handling**: date-fns provides locale-aware date formatting and manipulation (German locale for Austrian hospital context).

**Build Tools**: 
- Vite for frontend bundling with React plugin and TailwindCSS integration
- esbuild for server-side bundling with selective dependency bundling (allowlist in build.ts reduces cold start times)
- TypeScript compiler for type checking

**Development Tools**:
- @replit/vite-plugin-* packages integrate Replit-specific features (cartographer for code intelligence, dev banner, runtime error modal)
- Custom vite-plugin-meta-images.ts updates OpenGraph meta tags for deployment URLs

**Production Considerations**: The build process bundles frequently-used dependencies into the server bundle to reduce filesystem calls (openat syscalls), improving cold start performance. Less-used dependencies remain external to keep bundle size reasonable.

## Einsatzplanung (Weekly Assignment Planning)

The Einsatzplanung module (`/admin/weekly`) provides a detailed weekly assignment view based on the department's planning template. Key features:

**Structure**: Organized by areas matching the department layout:
- Stationen (Geburtshilfl. Bettenstation, Gynäkologische Bettenstation)
- Schwangerenambulanz (Risikoambulanz 1 & 2, Schwangerensprechstunde)
- Gynäkologische Ambulanz (GYN 1-3, TU/KPJ, Mamma)
- OP (OP 1 TCH, OP 2)
- Verwaltung / Organisation (Teamleitung, OP-Koordination, QM)
- Abwesenheiten (Urlaub, RZ, ZA, Fortbildung)
- Dienstfrei (Frei nach Dienst)

**Edit Permissions** (UI-prepared, requires authentication for enforcement):
- Primararzt
- 1. Oberarzt
- Sekretariat

The permission system currently uses a simulated user context. Full role-based enforcement requires implementing user authentication with passport.js (existing session infrastructure supports this). When auth is added:
1. Replace CURRENT_USER constant with real user context from auth
2. Add backend middleware to verify user role on write operations
3. Consider adding audit logging for plan changes

## Projektmanagement (Project Management)

The Projektmanagement module (`/admin/projects`) enables collaborative creation, review, and publication of clinical documents (SOPs, guidelines, protocols, etc.). Key features:

**Workflow**:
1. Create a project/initiative (e.g., "SOP PPROM")
2. Add tasks and delegate to team members
3. Create and edit documents collaboratively
4. Request approval from senior physicians
5. Publish approved documents to the Wissen (knowledge) section

**Database Tables**:
- `projectInitiatives` - Main project container with status tracking
- `projectTasks` - Tasks with hierarchy support (parentTaskId), assignment, and status
- `projectDocuments` - Documents with version tracking and category (SOP, Leitlinie, Protokoll, etc.)
- `approvals` - Approval requests with decision workflow
- `taskActivities` - Comments and activity log for tasks

**Status Workflow**:
- Projects: Entwurf → Aktiv → In Prüfung → Abgeschlossen → Archiviert
- Tasks: Offen → In Bearbeitung → Zur Prüfung → Genehmigt → Veröffentlicht
- Documents: Entwurf → In Bearbeitung → Zur Prüfung → Genehmigt → Veröffentlicht

**API Endpoints**:
- `/api/projects` - CRUD for project initiatives
- `/api/projects/:id/tasks` - Tasks within a project
- `/api/projects/:id/documents` - Documents within a project
- `/api/documents/:id/approvals` - Approval requests for documents
- `/api/documents/:id/publish` - Publish approved documents to knowledge base
- `/api/knowledge/documents` - Published documents for Wissen section

**Integration with Wissen**:
Published documents appear in the Wissen (Guidelines) page alongside static guidelines, marked with "Intern" badge. The Wissen page filters by category (SOP, Leitlinie, Protokoll, etc.) and supports search.

**Edit Permissions** (same as Einsatzplanung - simulated user context):
- Primararzt
- 1. Oberarzt
- Sekretariat