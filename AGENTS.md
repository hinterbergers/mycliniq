# AGENTS.md

## Project Summary
- Name: mycliniq (Vite + React + wouter frontend, Express backend)
- Deploy path: /opt/mycliniq on Hetzner Ubuntu
- Reverse proxy: Nginx -> Node/Express on localhost
- Process manager: pm2 (app name: mycliniq)
- Build: `npm run build` runs `script/build.ts` (vite build + esbuild to dist/index.cjs)

## Runtime / Infra
- Nginx proxy_pass: http://127.0.0.1:3000
- Add `client_max_body_size 20m;` (or higher if needed) to the nginx server block so large PowerPoint uploads reach Node before nginx rejects them.
- Node listens on PORT env var, else 5000 (ensure PORT and Nginx match)
- PM2 config: `ecosystem.config.js` uses `dist/index.cjs`
- Production serves static assets via server/static in `dist`
- Online users API: `GET /api/online-users` (admin-only; uses sessions lastSeen within 5 min)

## Auth
- Token-based auth in localStorage key: `cliniq_auth_token`
- Admin can simulate user view via localStorage key `cliniq_view_as_user` (hides admin capabilities in UI)
- API requests must send `Authorization: Bearer <token>`
- Login: `POST /api/auth/login` -> `{ token, employee, expiresAt }`
- Login payload accepts `identifier` (email or username); legacy `email` still works
- `employees.username` is optional and unique (case-insensitive) when set
- Primary me endpoint: `GET /api/me` -> `{ success: true, data: { user, department, clinic, capabilities } }`
- Legacy me endpoint: `GET /api/auth/me` can return:
  - `{ success: true, user: {...} }` (observed in logs)
  - `{ employee: {...} }` (server/routes.ts legacy)
- Auth state should be `isAuthenticated` when token + user are set; AuthProvider loads token, calls `/api/me`, then falls back to `/api/auth/me`
- Auth middleware also accepts `token` query param (used for calendar subscription)

## Roles & Permissions
- System roles (technical, admin level; low -> high):
  - employee: normal user, no admin access
  - department_admin: admin at department level (planning, employees, resources)
  - clinic_admin: admin at clinic level (multiple departments, clinic settings)
  - system_admin: full access (system/setup)
- Medical roles (employee.role): Primararzt, 1. Oberarzt, Funktionsoberarzt, Ausbildungsoberarzt, Oberarzt, Facharzt, Assistenzarzt, Turnusarzt, Student (KPJ/Famulant), Sekretariat
  - UI labels use gender-neutral forms (e.g., Oberarzt:in); legacy values like Oberaerztin/Assistenzaerztin may still exist
- App roles (workflow):
  - User: read + own inputs (e.g. shift wishes)
  - Editor: edit/plan, no final approval
  - Admin: approve/finalize
- Capabilities (fine-grained): e.g. `roster.generate`, `roster.approve`, `projects.create`
- Permissions admin endpoints (`/api/admin/users/:id/permissions`) require technical admin (systemRole != employee)
- Duty service overrides: set `shiftPreferences.serviceTypeOverrides` to limit duty types (gyn/kreiszimmer/turnus); empty = role default
- Overduty (Überdienst): `employees.canOverduty` gates assignment to roster serviceType `overduty` (admin only)
- Shift wishes:
  - Planning month = month after latest duty plan in `Vorlaeufig` (if any), else month after `rosterSettings.lastApproved*`
  - `roster_settings.wishYear/wishMonth` store the current wish month and never move backwards
  - Manual override: `POST /api/roster-settings/wishes` (requires dutyplan.edit/admin) sets wish month
  - Only employees who do shifts (takesShifts=true or serviceTypeOverrides set) are counted
- Service lines (Dienstschienen) live in `service_lines` with `key`, `label`, role group, and start/end times
  - Defaults seed `gyn`, `kreiszimmer`, `turnus`, `overduty`
  - Updating a key migrates `roster_shifts.service_type`, `shift_wishes` preferred/avoid, `long_term_shift_wishes.rules.serviceType`, and `employees.shift_preferences.serviceTypeOverrides`
  - Wish fields now include avoidWeekdays, maxShiftsPerMonth, maxWeekendShifts; weekend wishes use preferredShiftDays
- Long-term wishes:
  - Stored in `long_term_shift_wishes` with status Entwurf/Eingereicht/Genehmigt/Abgelehnt
  - Approvers: Primararzt or 1. Oberarzt (admins allowed)
  - Applied in roster generation as hard blocks for HARD rules
- Long-term absences:
  - Stored in `long_term_absences` with status Entwurf/Eingereicht/Genehmigt/Abgelehnt
  - Requires approval (Primararzt/1. Oberarzt/Admin); approved absences block roster/weekly plans
  - Legacy `employees.inactiveFrom/inactiveUntil` still respected
- Planning guidance:
  - View plan: authenticated
  - Edit plan: appRole >= Editor or department_admin+
  - Approve plan: appRole == Admin or clinic_admin+
  - Generate plan (AI): system_admin or capability
- Mnemonic:
  - System role = where can I enter?
  - App role = what can I do?
  - Capabilities = can I do exactly THAT?

## API Response Envelope
- Modular API routes use `{ success: true, data: ... }`
- Example: `/api/employees` now returns `{ success: true, data: Employee[] }`
- Client must unwrap `data` or it will see wrong types (e.g. lists not rendering)
 - Employees include long-term deactivation fields `inactiveFrom`/`inactiveUntil` used to exclude from duty/weekly plans

## Roster Workflow
- Header notifications:
  - 8-week reminder before planning month for users who do shifts
  - "All wishes submitted" for users with `dutyplan.edit`
  - "Draft ready to publish" for users with `dutyplan.publish`
- Personal Dienstpläne uses live roster data (no dummy plan) with status badge only (preview/freigabe)
- Roster views highlight weekends + Austrian holidays; published plan shows last names and greys other employees
- Roster calendar feed: `GET /api/roster/calendar?token=...&months=6` returns ICS for current user (description uses newline-separated staff; summary is the service line label)
  - Supports history window: `pastMonths` (default 24) and forward window `months` (default 6)
- Roster export: `GET /api/roster/export?year=YYYY&month=MM` returns Excel-friendly CSV (`.xls`)
- Weekly calendar feed: `GET /api/weekly/calendar?token=...&weeks=8` supports `pastWeeks` (default 52) and `startWeek`
- Shift swaps: approving one request auto-rejects other pending requests for the same requester shift (first acceptance wins)
- Shift swap notifications: header bell shows pending swap requests targeted at current user
- `/api/roster-settings/next-planning-month` includes `hasDraft` and `draftShiftCount`
- Weekly rule profile persistence:
  - `GET /api/roster-settings/weekly-rule-profile` returns `{ weeklyRuleProfile }`
  - `POST /api/roster-settings/weekly-rule-profile` updates server-side Wochenplan rule profile JSON
- Weekly planning engine endpoints:
  - `POST /api/weekly-plans/week/:year/:week/preview` returns server-side Wochenplan Vorschau (generated assignments, unfilled slots, violations, publishAllowed)
  - `POST /api/weekly-plans/week/:year/:week/run` applies generated assignments to the week plan and returns `{ plan, result, appliedAssignments }`
- Room groups:
  - `room_groups` store named workplace groups for the Wochenplan-Editor
  - `rooms.room_group_id` assigns a workplace to a group
  - grouped workplaces render in the weekly editor in rows of up to 3 cards; ungrouped workplaces fill a full row
- `takesShifts === false` excludes employees from auto-generation and manual selection
- Manual roster entries support free-text assignees:
  - `roster_shifts.employee_id` is nullable; `assignee_free_text` stores manual names
  - Manual inputs filter employees by service line eligibility; unmatched input is stored as free-text
- Room weekday settings include recurrence: `weekly`, `monthly_first_third`, `monthly_once` (default weekly)
- Run `npm run db:push` after pulling to apply schema changes. The script is a repo-local idempotent SQL patch runner (not drizzle CLI push) and currently covers recent manual migrations including `rooms.row_color`, `roster_settings.weekly_rule_profile`, `roster_shift_change_logs`, `employees.username`, `room_groups`, and `rooms.room_group_id`.

## Vacation Planning
- Admin UI: `/admin/urlaubsplan` shows a year/quarter grid with absences, conflicts, and status actions
- Admin API: `GET /api/absences?from=YYYY-MM-DD&to=YYYY-MM-DD` + `PUT /api/absences/:id/status`
- Vacation rules: `vacation_rules` with types `role_min`, `competency_min`, `total_min`, `training_priority`
- Entitlement: `employees.vacationEntitlement` limits `Urlaub` days per year (server enforced)
- Visibility filter: `employees.shiftPreferences.vacationVisibilityRoleGroups` (OA/ASS/TA/SEK) limits which roles a user can see in the vacation plan; UI filter still allows narrowing by role/competency
- Embedded view: Dienstplaene -> Urlaubsplanung uses embedded vacation plan view (approval/status + conflict rules hidden)
- School holidays config lives in `client/src/lib/schoolHolidays.ts` and is selected by `clinics.country` + `clinics.state`
- Personal shift wishes still use legacy `/api/planned-absences`
- Tageseinsatzplan UI removed (daily overrides API remains)

## SOPs, Projects, Messages
- Admin hub: `/admin/sops-projects` (tile in Planning Cockpit) with SOP/Project tabs
- SOP statuses: proposed, in_progress, review, published, archived; versioning in `sop_versions`
- Draft visibility: owner/assignees or `perm.sop_manage`/`perm.sop_publish`; published visible to all
- SOP references in `sop_references`, `createdByAi` marks AI suggestions; AI only returns placeholders (no links)
- Projects: proposed, active, done; delete is soft via `deleted_at`
- Permissions: `perm.sop_manage`, `perm.sop_publish`, `perm.project_manage`, `perm.project_delete`, `perm.message_group_manage`
- Messages: `GET /api/notifications` for system inbox, `/api/messages` for threads (direct/group)
- Direct threads are de-duplicated: starting a 1:1 with the same user returns the existing thread

## Client API Helpers (current approach)
- `client/src/lib/authToken.ts` centralizes token read/write/clear
- `client/src/lib/api.ts`:
  - `apiFetch` adds Authorization + Accept headers
  - `handleResponse` unwraps `{ success, data }` envelopes
- `client/src/lib/queryClient.ts` reads token via helper for react-query
- `client/src/lib/auth.tsx` supports both /api/me and /api/auth/me response shapes

## Known Issues / Fixes
- Build failure in `client/src/lib/auth.tsx` due to stray brace; fixed in commit 2bd1cbf
- Training presentations (Fortbildung / PPT):
  - Interactive LibreOffice HTML preview now rewrites relative asset URLs with `?token=...` so iframe-loaded PPT previews can load protected CSS/images/scripts.
  - Presentation upload accepts PPT/PPTX/PDF more robustly by file extension when browsers send generic MIME types (e.g. `application/octet-stream`).
- 502 Bad Gateway occurs when Node is not listening on Nginx upstream port
  - Usually due to failed build or PORT mismatch
  - Nginx error shows `connect() failed (111: Connection refused)`

## Deploy Checklist
1) `cd /opt/mycliniq`
2) `git pull origin main`
3) `npm install`
4) `npm run build`
5) `pm2 restart mycliniq --update-env`
6) `ss -ltnp | rg 'node|3000|5000'`
7) `curl -I http://127.0.0.1:3000/`
8) If needed: `nginx -T | rg "mycliniq|proxy_pass"`

## Update Policy
- Update this file after auth/api changes, deploy issues, or infra changes
- Keep content ASCII-only where possible
- After each change, commit and push unless the user says otherwise; provide the pull command (`git pull origin main`)

---

(client/src/pages/Dashboard.tsx)

import { Separator } from "@/components/ui/separator";

...

const attendanceWidget = dashboardData?.attendanceWidget ?? null;

...

type AttendancePerson = {
  employeeId: number;
  firstName: string | null;
  lastName: string | null;
  workplace: string | null;
  role: string | null;
  roleRank: number;
  isDuty: boolean;
};

const getMedicalRoleRank = (role?: string | null) => {
  const r = (role ?? "").toLowerCase();
  if (!r) return 99;

  if (r.includes("primar")) return 0;
  if (r.includes("1. ober") || r.includes("erster ober")) return 1;

  // OA + Facharzt in denselben Block
  if (
    r.includes("funktionsober") ||
    r.includes("ausbildungsober") ||
    r.includes("oberarzt") ||
    r.includes("oberärzt") ||
    r.includes("facharzt") ||
    r.includes("fachärzt")
  )
    return 2;

  if (r.includes("assistenz")) return 3;
  if (r.includes("turnus")) return 4;
  if (r.includes("kpj") || r.includes("student") || r.includes("famul")) return 5;
  if (r.includes("sekret")) return 98;

  return 90;
};

const mapAttendancePeople = (members: any[] | undefined): AttendancePerson[] => {
  return (members ?? [])
    .map((p) => {
      const role = (p.role ?? null) as string | null;
      const roleRank =
        typeof p.roleRank === "number" ? (p.roleRank as number) : getMedicalRoleRank(role);

      return {
        employeeId: Number(p.employeeId),
        firstName: (p.firstName ?? null) as string | null,
        lastName: (p.lastName ?? null) as string | null,
        workplace: (p.workplace ?? null) as string | null,
        role,
        roleRank,
        isDuty: Boolean(p.isDuty),
      };
    })
    .filter((p) => Number.isFinite(p.employeeId))
    .sort((a, b) => {
      if (a.roleRank !== b.roleRank) return a.roleRank - b.roleRank;
      const lastCmp = (a.lastName ?? "").localeCompare(b.lastName ?? "", "de");
      if (lastCmp !== 0) return lastCmp;
      return (a.firstName ?? "").localeCompare(b.firstName ?? "", "de");
    });
};

...

const presentToday = useMemo(() => {
  return mapAttendancePeople(attendanceWidget?.today?.members as any[] | undefined);
}, [attendanceWidget]);

const presentTomorrow = useMemo(() => {
  return mapAttendancePeople(attendanceWidget?.tomorrow?.members as any[] | undefined);
}, [attendanceWidget]);

...

{/* In JSX rendering for presentToday */}
{presentToday.map((p, i) => {
  const prev = i > 0 ? presentToday[i - 1] : null;
  const showSep = Boolean(prev && prev.roleRank !== p.roleRank);
  const dutyClass = p.isDuty ? "text-red-600" : "";

  return (
    <div key={p.employeeId}>
      {showSep && <Separator className="my-2" />}
      <div className={`flex items-center justify-between gap-3 text-xs ${dutyClass}`}>
        <span className="truncate font-medium">
          {(p.lastName ?? "").trim()} {(p.firstName ?? "").trim()}
        </span>
        <span className="truncate text-right">{p.workplace ?? ""}</span>
      </div>
    </div>
  );
})}

{/* In JSX rendering for presentTomorrow */}
{presentTomorrow.map((p, i) => {
  const prev = i > 0 ? presentTomorrow[i - 1] : null;
  const showSep = Boolean(prev && prev.roleRank !== p.roleRank);
  const dutyClass = p.isDuty ? "text-red-600" : "";

  return (
    <div key={p.employeeId}>
      {showSep && <Separator className="my-2" />}
      <div className={`flex items-center justify-between gap-3 text-xs ${dutyClass}`}>
        <span className="truncate font-medium">
          {(p.lastName ?? "").trim()} {(p.firstName ?? "").trim()}
        </span>
        <span className="truncate text-right">{p.workplace ?? ""}</span>
      </div>
    </div>
  );
})}

---

(client/src/lib/api.ts)

...

// In the type/interface for attendance widget members add these optional fields:

role?: string | null;
roleRank?: number;
isDuty?: boolean;

...
