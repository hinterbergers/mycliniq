import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";
import {
  Search,
  Plus,
  Filter,
  UserPlus,
  Pencil,
  Loader2,
  Shield,
  MapPin,
  Calendar as CalendarIcon,
  Award,
  Building,
  Trash2,
  X,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  employeeApi,
  competencyApi,
  roomApi,
  diplomaApi,
  serviceLinesApi,
} from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import type {
  Employee,
  Competency,
  Resource,
  Diploma,
  ServiceLine,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { OVERDUTY_KEY, getServiceTypesForEmployee } from "@shared/shiftTypes";

const ROLE_LABELS: Record<string, string> = {
  Primararzt: "Primararzt:in",
  "1. Oberarzt": "1. Oberarzt:in",
  Funktionsoberarzt: "Funktionsoberarzt:in",
  Ausbildungsoberarzt: "Ausbildungsoberarzt:in",
  Oberarzt: "Oberarzt:in",
  Oberärztin: "Oberarzt:in",
  Facharzt: "Facharzt:in",
  Assistenzarzt: "Assistenzarzt:in",
  Assistenzärztin: "Assistenzarzt:in",
  Turnusarzt: "Turnusarzt:in",
  "Student (KPJ)": "Student:in (KPJ)",
  "Student (Famulant)": "Student:in (Famulant)",
  Sekretariat: "Sekretariat",
};

const ROLE_OPTIONS: Array<{ value: Employee["role"]; label: string }> = [
  { value: "Primararzt", label: ROLE_LABELS["Primararzt"] },
  { value: "1. Oberarzt", label: ROLE_LABELS["1. Oberarzt"] },
  { value: "Funktionsoberarzt", label: ROLE_LABELS["Funktionsoberarzt"] },
  { value: "Ausbildungsoberarzt", label: ROLE_LABELS["Ausbildungsoberarzt"] },
  { value: "Oberarzt", label: ROLE_LABELS["Oberarzt"] },
  { value: "Facharzt", label: ROLE_LABELS["Facharzt"] },
  { value: "Assistenzarzt", label: ROLE_LABELS["Assistenzarzt"] },
  { value: "Turnusarzt", label: ROLE_LABELS["Turnusarzt"] },
  { value: "Student (KPJ)", label: ROLE_LABELS["Student (KPJ)"] },
  { value: "Student (Famulant)", label: ROLE_LABELS["Student (Famulant)"] },
  { value: "Sekretariat", label: ROLE_LABELS["Sekretariat"] },
];

const ROLE_SORT_ORDER: Record<string, number> = {
  Primararzt: 1,
  "1. Oberarzt": 2,
  Funktionsoberarzt: 3,
  Ausbildungsoberarzt: 4,
  Oberarzt: 5,
  Oberärztin: 5,
  Facharzt: 6,
  Assistenzarzt: 7,
  Assistenzärztin: 7,
  Turnusarzt: 8,
  "Student (KPJ)": 9,
  "Student (Famulant)": 9,
  Sekretariat: 10,
};

const normalizeRoleValue = (role?: string | null): Employee["role"] | "" => {
  if (!role) return "";
  if (role === "Oberärztin") return "Oberarzt";
  if (role === "Assistenzärztin") return "Assistenzarzt";
  return role as Employee["role"];
};

const APP_ROLE_OPTIONS: Employee["appRole"][] = ["Admin", "Editor", "User"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value: string) =>
  EMAIL_REGEX.test(value) && !/[^\x00-\x7F]/.test(value);

type ServiceType = string;

const SERVICE_LINE_PALETTE = [
  { badge: "bg-pink-100 text-pink-700 border-pink-200" },
  { badge: "bg-blue-100 text-blue-700 border-blue-200" },
  { badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { badge: "bg-amber-100 text-amber-700 border-amber-200" },
  { badge: "bg-violet-100 text-violet-700 border-violet-200" },
];

const FALLBACK_SERVICE_LINES: Array<
  Pick<ServiceLine, "key" | "label" | "roleGroup" | "sortOrder" | "isActive">
> = [
  {
    key: "kreiszimmer",
    label: "Kreißzimmer",
    roleGroup: "ASS",
    sortOrder: 1,
    isActive: true,
  },
  {
    key: "gyn",
    label: "Gyn-Dienst",
    roleGroup: "OA",
    sortOrder: 2,
    isActive: true,
  },
  {
    key: "turnus",
    label: "Turnus",
    roleGroup: "TURNUS",
    sortOrder: 3,
    isActive: true,
  },
  {
    key: "overduty",
    label: "Überdienst",
    roleGroup: "OA",
    sortOrder: 4,
    isActive: true,
  },
];

const buildServiceLineDisplay = (
  lines: ServiceLine[],
  includeKeys: Set<string>,
) => {
  const source = lines.length ? lines : FALLBACK_SERVICE_LINES;
  const knownKeys = new Set(source.map((line) => line.key));
  const extras = [...includeKeys]
    .filter((key) => !knownKeys.has(key))
    .map((key) => ({
      key,
      label: key,
      roleGroup: "ALL",
      sortOrder: 999,
      isActive: true,
    }));
  const allLines = [...source, ...extras];
  return allLines
    .filter((line) => line.isActive !== false || includeKeys.has(line.key))
    .sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (order !== 0) return order;
      return a.label.localeCompare(b.label);
    })
    .map((line, index) => ({
      key: line.key,
      label: line.label,
      roleGroup: line.roleGroup || "ALL",
      isActive: line.isActive !== false,
      style: SERVICE_LINE_PALETTE[index % SERVICE_LINE_PALETTE.length],
    }));
};

type VacationVisibilityGroup = "OA" | "ASS" | "TA" | "SEK";

const DEFAULT_VISIBILITY_GROUPS: VacationVisibilityGroup[] = [
  "OA",
  "ASS",
  "TA",
  "SEK",
];

const VISIBILITY_GROUP_LABELS: Record<VacationVisibilityGroup, string> = {
  OA: "Oberaerzte & Fachaerzte",
  ASS: "Assistenz",
  TA: "Turnus & Studierende",
  SEK: "Sekretariat",
};

interface ShiftPreferences {
  deploymentRoomIds?: number[];
  serviceTypeOverrides?: ServiceType[];
  vacationVisibilityRoleGroups?: VacationVisibilityGroup[];
}

interface CompetencyAssignment {
  roomName: string;
  weekdays: string[];
}

function formatBirthday(value: string | Date | null | undefined): string {
  if (!value) return "";
  const toInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return toInput(parsed);
    }
    return "";
  }
  return toInput(value);
}

function formatBirthdayDisplay(
  value: string | Date | null | undefined,
): string {
  const iso = formatBirthday(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function parseBirthdayInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let iso = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    iso = trimmed;
  } else {
    const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    iso = `${match[3]}-${match[2]}-${match[1]}`;
  }

  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return iso;
}

function parseInactiveDate(value: string): string | null {
  if (!value.trim()) return "";
  return parseBirthdayInput(value);
}

function parseVacationEntitlementInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

const PERMISSION_FALLBACK = [
  { key: "users.manage", label: "Kann Benutzer anlegen / verwalten" },
  { key: "dutyplan.edit", label: "Kann Dienstplan bearbeiten" },
  { key: "dutyplan.publish", label: "Kann Dienstplan freigeben" },
  {
    key: "vacation.lock",
    label: "Kann Urlaubsplanung bearbeiten (Sperrzeitraum)",
  },
  { key: "vacation.approve", label: "Kann Urlaub freigeben" },
  { key: "absence.create", label: "Kann Abwesenheiten eintragen" },
  { key: "perm.sop_manage", label: "Kann SOPs verwalten" },
  { key: "perm.sop_publish", label: "Kann SOPs freigeben" },
  { key: "perm.project_manage", label: "Kann Aufgaben verwalten" },
  { key: "perm.project_delete", label: "Kann Aufgaben loeschen" },
  { key: "perm.message_group_manage", label: "Kann Gruppen verwalten" },
  { key: "training.edit", label: "Kann Ausbildungsplan bearbeiten" },
];

export default function EmployeeManagement() {
  const { employee: currentUser, isAdmin, isTechnicalAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newEmployeeDialogOpen, setNewEmployeeDialogOpen] = useState(false);
  const [availablePermissions, setAvailablePermissions] = useState<
    Array<{ key: string; label: string; scope?: string }>
  >([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const { toast } = useToast();

  const [competencyList, setCompetencyList] = useState<Competency[]>([]);
  const [competencyDialogOpen, setCompetencyDialogOpen] = useState(false);
  const [editingCompetency, setEditingCompetency] =
    useState<Partial<Competency> | null>(null);
  const [competencySearchTerm, setCompetencySearchTerm] = useState("");
  const [competencyAssignments, setCompetencyAssignments] = useState<
    Record<number, CompetencyAssignment[]>
  >({});
  const [competencyDiplomaIds, setCompetencyDiplomaIds] = useState<number[]>(
    [],
  );
  const [competencyDiplomaSearch, setCompetencyDiplomaSearch] = useState("");

  const [diplomaList, setDiplomaList] = useState<Diploma[]>([]);
  const [diplomaDialogOpen, setDiplomaDialogOpen] = useState(false);
  const [editingDiploma, setEditingDiploma] = useState<Partial<Diploma> | null>(
    null,
  );
  const [diplomaSearchTerm, setDiplomaSearchTerm] = useState("");
  const [diplomaEmployeeIds, setDiplomaEmployeeIds] = useState<number[]>([]);
  const [diplomaEmployeeSearch, setDiplomaEmployeeSearch] = useState("");

  const [availableCompetencies, setAvailableCompetencies] = useState<
    Competency[]
  >([]);
  const [availableDiplomas, setAvailableDiplomas] = useState<Diploma[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Resource[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [competencySearch, setCompetencySearch] = useState("");
  const [diplomaSearch, setDiplomaSearch] = useState("");
  const [roomSearch, setRoomSearch] = useState("");

  const emptyForm = {
    title: "",
    firstName: "",
    lastName: "",
    birthday: "",
    email: "",
    emailPrivate: "",
    phoneWork: "",
    phonePrivate: "",
    showPrivateContact: false,
    vacationEntitlement: "",
  };

  const [editFormData, setEditFormData] = useState({ ...emptyForm });
  const [editBirthdayInput, setEditBirthdayInput] = useState("");
  const [editRoleValue, setEditRoleValue] = useState<Employee["role"] | "">("");
  const [editAppRoleValue, setEditAppRoleValue] = useState<
    Employee["appRole"] | ""
  >("");
  const [editCompetencyIds, setEditCompetencyIds] = useState<number[]>([]);
  const [editDiplomaIds, setEditDiplomaIds] = useState<number[]>([]);
  const [editDeploymentRoomIds, setEditDeploymentRoomIds] = useState<number[]>(
    [],
  );
  const [editServiceTypeOverrides, setEditServiceTypeOverrides] = useState<
    ServiceType[]
  >([]);
  const [editTakesShifts, setEditTakesShifts] = useState(true);
  const [editCanOverduty, setEditCanOverduty] = useState(false);
  const [editVacationVisibilityGroups, setEditVacationVisibilityGroups] =
    useState<VacationVisibilityGroup[]>(DEFAULT_VISIBILITY_GROUPS);
  const [editInactiveFrom, setEditInactiveFrom] = useState("");
  const [editInactiveUntil, setEditInactiveUntil] = useState("");
  const [editInactiveReason, setEditInactiveReason] = useState("");
  const [editInactiveEnabled, setEditInactiveEnabled] = useState(false);
  const [editLimitedPresenceEnabled, setEditLimitedPresenceEnabled] = useState(false);
  const [editEmploymentFrom, setEditEmploymentFrom] = useState("");
  const [editEmploymentUntil, setEditEmploymentUntil] = useState("");
  const [resetPasswordData, setResetPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const [newFormData, setNewFormData] = useState({ ...emptyForm });
  const [newBirthdayInput, setNewBirthdayInput] = useState("");
  const [newRoleValue, setNewRoleValue] = useState<Employee["role"] | "">("");
  const [newAppRoleValue, setNewAppRoleValue] = useState<
    Employee["appRole"] | ""
  >("User");
  const [newCompetencyIds, setNewCompetencyIds] = useState<number[]>([]);
  const [newDiplomaIds, setNewDiplomaIds] = useState<number[]>([]);
  const [newDeploymentRoomIds, setNewDeploymentRoomIds] = useState<number[]>(
    [],
  );
  const [newServiceTypeOverrides, setNewServiceTypeOverrides] = useState<
    ServiceType[]
  >([]);
  const [newTakesShifts, setNewTakesShifts] = useState(true);
  const [newCanOverduty, setNewCanOverduty] = useState(false);
  const [newVacationVisibilityGroups, setNewVacationVisibilityGroups] =
    useState<VacationVisibilityGroup[]>(DEFAULT_VISIBILITY_GROUPS);
  const [newInactiveFrom, setNewInactiveFrom] = useState("");
  const [newInactiveUntil, setNewInactiveUntil] = useState("");
  const [newInactiveReason, setNewInactiveReason] = useState("");
  const [newInactiveEnabled, setNewInactiveEnabled] = useState(false);
  const [newLimitedPresenceEnabled, setNewLimitedPresenceEnabled] = useState(false);
  const [newEmploymentFrom, setNewEmploymentFrom] = useState("");
  const [newEmploymentUntil, setNewEmploymentUntil] = useState("");

  const canManageEmployees = isAdmin || isTechnicalAdmin;

  const serviceTypeOverrideKeys = useMemo(() => {
    const keys = new Set<string>();
    employees.forEach((emp) => {
      const prefs = (emp.shiftPreferences as ShiftPreferences | null) || null;
      if (!Array.isArray(prefs?.serviceTypeOverrides)) return;
      prefs.serviceTypeOverrides.forEach((value) => {
        if (typeof value === "string") keys.add(value);
      });
    });
    return keys;
  }, [employees]);

  const serviceLineDisplay = useMemo(
    () => buildServiceLineDisplay(serviceLines, serviceTypeOverrideKeys),
    [serviceLines, serviceTypeOverrideKeys],
  );
  const serviceLineLookup = useMemo(
    () => new Map(serviceLineDisplay.map((line) => [line.key, line])),
    [serviceLineDisplay],
  );
  const serviceLineKeySet = useMemo(
    () => new Set(serviceLineDisplay.map((line) => line.key)),
    [serviceLineDisplay],
  );
  const selectableServiceLines = useMemo(
    () => serviceLineDisplay.filter((line) => line.key !== OVERDUTY_KEY),
    [serviceLineDisplay],
  );
  const serviceLineMeta = useMemo(
    () =>
      serviceLineDisplay.map((line) => ({
        key: line.key,
        roleGroup: line.roleGroup,
        label: line.label,
      })),
    [serviceLineDisplay],
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        employeeData,
        competencyData,
        roomData,
        diplomaData,
        serviceLineData,
      ] = await Promise.all([
        employeeApi.getAll(),
        competencyApi.getAll(),
        roomApi.getAll(),
        diplomaApi.getAll(),
        serviceLinesApi.getAll().catch(() => []),
      ]);
      setEmployees(employeeData);
      setCompetencyList(competencyData);
      setDiplomaList(diplomaData);
      setServiceLines(serviceLineData);
      setAvailableCompetencies(
        competencyData.filter((comp) => comp.isActive !== false),
      );
      setAvailableDiplomas(
        diplomaData.filter((diploma) => diploma.isActive !== false),
      );
      setAvailableRooms(roomData);

      const roomDetails = await Promise.all(
        roomData.map((room) => roomApi.getById(room.id)),
      );
      const assignmentMap: Record<number, CompetencyAssignment[]> = {};
      roomDetails.forEach((room) => {
        const weekdayLabels = getActiveWeekdays(room.weekdaySettings);
        (room.requiredCompetencies || []).forEach((req) => {
          if (!assignmentMap[req.competencyId]) {
            assignmentMap[req.competencyId] = [];
          }
          assignmentMap[req.competencyId].push({
            roomName: room.name,
            weekdays: weekdayLabels,
          });
        });
      });
      setCompetencyAssignments(assignmentMap);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Daten konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getActiveWeekdays = (
    weekdaySettings?: Array<{
      weekday: number;
      isClosed?: boolean;
    }>,
  ): string[] => {
    const labels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    if (!weekdaySettings || !weekdaySettings.length) {
      return labels;
    }
    const closed = new Set(
      weekdaySettings.filter((day) => day.isClosed).map((day) => day.weekday),
    );
    return labels.filter((_, index) => !closed.has(index + 1));
  };

  const resetNewEmployeeForm = () => {
    setNewFormData({ ...emptyForm });
    setNewBirthdayInput("");
    setNewRoleValue("");
    setNewAppRoleValue("User");
    setNewCompetencyIds([]);
    setNewDiplomaIds([]);
    setNewDeploymentRoomIds([]);
    setNewServiceTypeOverrides([]);
    setNewTakesShifts(true);
    setNewCanOverduty(false);
    setNewVacationVisibilityGroups(DEFAULT_VISIBILITY_GROUPS);
    setNewInactiveFrom("");
    setNewInactiveUntil("");
    setNewInactiveReason("");
    setCompetencySearch("");
    setDiplomaSearch("");
    setRoomSearch("");
    setNewLimitedPresenceEnabled(false);
    setNewEmploymentFrom("");
    setNewEmploymentUntil("");
    setNewInactiveEnabled(false);
  };

  const hydrateEditForm = (emp: Employee) => {
    const nameParts = emp.name?.split(" ") ?? [];
    const hasTitle =
      nameParts[0]?.includes("Dr.") ||
      nameParts[0]?.includes("PD") ||
      nameParts[0]?.includes("Prof.");
    const titleValue =
      emp.title?.trim() ||
      (hasTitle
        ? nameParts.slice(0, nameParts.length > 2 ? 2 : 1).join(" ")
        : "");
    const birthdayIso = formatBirthday(emp.birthday);
    setEditFormData({
      ...emptyForm,
      title: titleValue,
      firstName: emp.firstName || "",
      lastName:
        emp.lastName ||
        (nameParts.length ? nameParts[nameParts.length - 1] : ""),
      birthday: birthdayIso,
      email: emp.email || "",
      emailPrivate: emp.emailPrivate || "",
      phoneWork: emp.phoneWork || "",
      phonePrivate: emp.phonePrivate || "",
      showPrivateContact: emp.showPrivateContact || false,
      vacationEntitlement:
        emp.vacationEntitlement !== null &&
        emp.vacationEntitlement !== undefined
          ? String(emp.vacationEntitlement)
          : "",
    });
    setEditBirthdayInput(formatBirthdayDisplay(birthdayIso || emp.birthday));
    setEditRoleValue(normalizeRoleValue(emp.role));
    setEditAppRoleValue(emp.appRole || "");
    setEditTakesShifts(emp.takesShifts ?? true);
    setEditCanOverduty(emp.canOverduty ?? false);
    setEditInactiveFrom(formatBirthday(emp.inactiveFrom));
    setEditInactiveUntil(formatBirthday(emp.inactiveUntil));
    setEditInactiveReason(emp.inactiveReason?.trim() || "");
    setEditInactiveEnabled(
      Boolean(
        emp.inactiveFrom ||
          emp.inactiveUntil ||
          (emp.inactiveReason?.trim() || ""),
      ),
    );
    const empWithWindow = emp as Employee & {
      employmentFrom?: string | null;
      employmentUntil?: string | null;
    };
    setEditLimitedPresenceEnabled(Boolean(empWithWindow.employmentFrom || empWithWindow.employmentUntil));
    setEditEmploymentFrom(formatBirthday(empWithWindow.employmentFrom));
    setEditEmploymentUntil(formatBirthday(empWithWindow.employmentUntil));
    const prefs = (emp.shiftPreferences as ShiftPreferences | null) || null;
    setEditDeploymentRoomIds(
      Array.isArray(prefs?.deploymentRoomIds) ? prefs.deploymentRoomIds : [],
    );
    setEditServiceTypeOverrides(
      Array.isArray(prefs?.serviceTypeOverrides)
        ? prefs.serviceTypeOverrides.filter(
            (value): value is ServiceType =>
              typeof value === "string" && serviceLineKeySet.has(value),
          )
        : [],
    );
    const visibilityGroups = Array.isArray(prefs?.vacationVisibilityRoleGroups)
      ? prefs.vacationVisibilityRoleGroups.filter(
          (group): group is VacationVisibilityGroup =>
            DEFAULT_VISIBILITY_GROUPS.includes(group),
        )
      : [];
    setEditVacationVisibilityGroups(
      visibilityGroups.length ? visibilityGroups : DEFAULT_VISIBILITY_GROUPS,
    );
    setEditCompetencyIds([]);
    setEditDiplomaIds([]);
    setResetPasswordData({ newPassword: "", confirmPassword: "" });
  };

  useEffect(() => {
    if (!editingEmployee) return;
    loadEmployeeCompetencies(editingEmployee);
    loadEmployeeDiplomas(editingEmployee);
  }, [editingEmployee, availableCompetencies, availableDiplomas]);

  useEffect(() => {
    if (!editingEmployee) return;
    setUserPermissions([]);
    if (isTechnicalAdmin) {
      const departmentId =
        editingEmployee.departmentId ?? currentUser?.departmentId ?? undefined;
      loadPermissions(editingEmployee.id, departmentId);
    } else {
      setAvailablePermissions([]);
      setLoadingPermissions(false);
    }
  }, [editingEmployee, isTechnicalAdmin, currentUser?.departmentId]);

  const loadEmployeeCompetencies = async (emp: Employee) => {
    try {
      const empCompetencies = await employeeApi.getCompetencies(emp.id);
      const ids = empCompetencies
        .map((comp) => comp.competencyId)
        .filter((id): id is number => typeof id === "number");
      if (ids.length) {
        setEditCompetencyIds(ids);
        return;
      }
    } catch {
      // ignore
    }

    if (Array.isArray(emp.competencies) && availableCompetencies.length) {
      const fallbackIds = emp.competencies
        .map(
          (name) =>
            availableCompetencies.find((comp) => comp.name === name)?.id,
        )
        .filter((id): id is number => typeof id === "number");
      setEditCompetencyIds(fallbackIds);
    }
  };

  const loadEmployeeDiplomas = async (emp: Employee) => {
    try {
      const empDiplomas = await employeeApi.getDiplomas(emp.id);
      const ids = empDiplomas
        .map((diploma) => diploma.diplomaId)
        .filter((id): id is number => typeof id === "number");
      if (ids.length) {
        setEditDiplomaIds(ids);
        return;
      }
    } catch {
      // ignore
    }

    if (Array.isArray(emp.diplomas) && availableDiplomas.length) {
      const fallbackIds = emp.diplomas
        .map(
          (name) =>
            availableDiplomas.find((diploma) => diploma.name === name)?.id,
        )
        .filter((id): id is number => typeof id === "number");
      setEditDiplomaIds(fallbackIds);
    }
  };

  useEffect(() => {
    if (!editingCompetency?.id) {
      setCompetencyDiplomaIds([]);
      return;
    }
    loadCompetencyDiplomas(editingCompetency.id);
  }, [editingCompetency, availableDiplomas]);

  const loadCompetencyDiplomas = async (competencyId: number) => {
    try {
      const result = await competencyApi.getDiplomas(competencyId);
      const ids = result
        .map((diploma) => diploma.diplomaId)
        .filter((id): id is number => typeof id === "number");
      setCompetencyDiplomaIds(ids);
    } catch {
      setCompetencyDiplomaIds([]);
    }
  };

  const handleEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditDialogOpen(true);
    setCompetencySearch("");
    setDiplomaSearch("");
    setRoomSearch("");
    hydrateEditForm(emp);
  };

  const handleEditDialogChange = (open: boolean) => {
    setEditDialogOpen(open);
    if (!open) {
      setEditingEmployee(null);
      setResetPasswordData({ newPassword: "", confirmPassword: "" });
      setAvailablePermissions([]);
      setUserPermissions([]);
      setEditCompetencyIds([]);
      setEditDiplomaIds([]);
      setEditServiceTypeOverrides([]);
      setEditLimitedPresenceEnabled(false);
      setEditEmploymentFrom("");
      setEditEmploymentUntil("");
      setEditInactiveEnabled(false);
    }
  };

  const handleCompetencyDialogChange = (open: boolean) => {
    setCompetencyDialogOpen(open);
    if (!open) {
      setEditingCompetency(null);
      setCompetencyDiplomaIds([]);
      setCompetencyDiplomaSearch("");
    }
  };

  const handleDiplomaDialogChange = (open: boolean) => {
    setDiplomaDialogOpen(open);
    if (!open) {
      setEditingDiploma(null);
      setDiplomaEmployeeIds([]);
      setDiplomaEmployeeSearch("");
    }
  };

  const handleNewEmployeeDialogChange = (open: boolean) => {
    setNewEmployeeDialogOpen(open);
    if (open) {
      resetNewEmployeeForm();
    }
  };

  const savePermissions = async (employee: Employee) => {
    if (!isTechnicalAdmin) return;
    const token = localStorage.getItem("cliniq_auth_token");
    const departmentId = employee.departmentId || currentUser?.departmentId;
    if (!departmentId) {
      throw new Error("Keine Abteilung zugeordnet");
    }

    const response = await fetch(
      `/api/admin/users/${employee.id}/permissions`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          departmentId,
          permissionKeys: userPermissions,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Fehler beim Speichern");
    }
  };

  const handleSaveEmployee = async () => {
    if (!editingEmployee) return;

    const parsedBirthday = parseBirthdayInput(editBirthdayInput);
    if (parsedBirthday === null) {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gültiges Geburtsdatum eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    if (!editFormData.firstName.trim() || !editFormData.lastName.trim()) {
      toast({
        title: "Fehler",
        description: "Vor- und Nachname sind erforderlich",
        variant: "destructive",
      });
      return;
    }

    const emailValue = editFormData.email.trim();
    if (!emailValue || !isValidEmail(emailValue)) {
      toast({
        title: "Fehler",
        description:
          "Bitte eine gueltige E-Mail-Adresse ohne Umlaute eingeben.",
        variant: "destructive",
      });
      return;
    }

    const emailPrivateValue = editFormData.emailPrivate.trim();
    if (emailPrivateValue && !isValidEmail(emailPrivateValue)) {
      toast({
        title: "Fehler",
        description:
          "Bitte eine gueltige private E-Mail-Adresse ohne Umlaute eingeben.",
        variant: "destructive",
      });
      return;
    }

    const parsedInactiveFrom = editInactiveEnabled
      ? parseInactiveDate(editInactiveFrom)
      : "";
    if (editInactiveEnabled && parsedInactiveFrom === null) {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gueltiges Startdatum fuer die Deaktivierung eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    const parsedInactiveUntil = editInactiveEnabled
      ? parseInactiveDate(editInactiveUntil)
      : "";
    if (editInactiveEnabled && parsedInactiveUntil === null) {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gueltiges Enddatum fuer die Deaktivierung eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    if (
      editInactiveEnabled &&
      parsedInactiveFrom &&
      parsedInactiveUntil &&
      parsedInactiveFrom > parsedInactiveUntil
    ) {
      toast({
        title: "Fehler",
        description:
          "Das Enddatum der Deaktivierung muss nach dem Startdatum liegen.",
        variant: "destructive",
      });
      return;
    }
    const parsedEmploymentFrom = editLimitedPresenceEnabled
      ? parseInactiveDate(editEmploymentFrom)
      : "";
    if (parsedEmploymentFrom === null) {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gueltiges Startdatum fuer die befristete Anwesenheit eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    const parsedEmploymentUntil = editLimitedPresenceEnabled
      ? parseInactiveDate(editEmploymentUntil)
      : "";
    if (parsedEmploymentUntil === null) {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gueltiges Enddatum fuer die befristete Anwesenheit eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    if (
      parsedEmploymentFrom &&
      parsedEmploymentUntil &&
      parsedEmploymentFrom > parsedEmploymentUntil
    ) {
      toast({
        title: "Fehler",
        description:
          "Das Enddatum der befristeten Anwesenheit muss nach dem Startdatum liegen.",
        variant: "destructive",
      });
      return;
    }

    const parsedVacationEntitlementValue = parseVacationEntitlementInput(
      editFormData.vacationEntitlement,
    );
    if (
      editFormData.vacationEntitlement.trim() &&
      parsedVacationEntitlementValue === null
    ) {
      toast({
        title: "Fehler",
        description: "Bitte einen gueltigen Urlaubsanspruch (Tage) eingeben.",
        variant: "destructive",
      });
      return;
    }

    const inactiveReasonValue = editInactiveEnabled
      ? editInactiveReason.trim()
      : "";
    setSaving(true);
    try {
      const baseShiftPreferences =
        editingEmployee.shiftPreferences &&
        typeof editingEmployee.shiftPreferences === "object"
          ? (editingEmployee.shiftPreferences as ShiftPreferences)
          : {};
      const nextShiftPreferences: ShiftPreferences = {
        ...baseShiftPreferences,
        deploymentRoomIds: editDeploymentRoomIds,
      };
      if (editServiceTypeOverrides.length) {
        nextShiftPreferences.serviceTypeOverrides = editServiceTypeOverrides;
      } else {
        delete (
          nextShiftPreferences as { serviceTypeOverrides?: ServiceType[] }
        ).serviceTypeOverrides;
      }
      const normalizedVisibilityGroups = normalizeVisibilityGroups(
        editVacationVisibilityGroups,
      );
      if (isDefaultVisibilityGroups(normalizedVisibilityGroups)) {
        delete (
          nextShiftPreferences as {
            vacationVisibilityRoleGroups?: VacationVisibilityGroup[];
          }
        ).vacationVisibilityRoleGroups;
      } else {
        nextShiftPreferences.vacationVisibilityRoleGroups =
          normalizedVisibilityGroups;
      }

      const payload: Partial<Omit<Employee, "id" | "createdAt">> = {
        title: editFormData.title || null,
        firstName: editFormData.firstName.trim(),
        lastName: editFormData.lastName.trim(),
        name: `${editFormData.firstName} ${editFormData.lastName}`.trim(),
        birthday: parsedBirthday || null,
        email: emailValue,
        emailPrivate: emailPrivateValue || null,
        phoneWork: editFormData.phoneWork.trim() || null,
        phonePrivate: editFormData.phonePrivate.trim() || null,
        showPrivateContact: editFormData.showPrivateContact,
        role: (editRoleValue || editingEmployee.role) as Employee["role"],
        appRole: (editAppRoleValue ||
          editingEmployee.appRole) as Employee["appRole"],
        takesShifts: editTakesShifts,
        canOverduty: editCanOverduty,
        inactiveFrom: parsedInactiveFrom || null,
        inactiveUntil: parsedInactiveUntil || null,
        inactiveReason: inactiveReasonValue || null,
        vacationEntitlement: parsedVacationEntitlementValue,
        shiftPreferences: nextShiftPreferences,
        employmentFrom: parsedEmploymentFrom || null,
        employmentUntil: parsedEmploymentUntil || null,
      };

      const updated = await employeeApi.update(editingEmployee.id, payload);
      await employeeApi.updateCompetencies(
        editingEmployee.id,
        editCompetencyIds,
      );
      await employeeApi.updateDiplomas(editingEmployee.id, editDiplomaIds);

      const updatedCompetencies = editCompetencyIds
        .map((id) => availableCompetencies.find((comp) => comp.id === id)?.name)
        .filter((name): name is string => Boolean(name));

      const updatedDiplomas = editDiplomaIds
        .map(
          (id) => availableDiplomas.find((diploma) => diploma.id === id)?.name,
        )
        .filter((name): name is string => Boolean(name));

      setEmployees((prev) =>
        prev.map((e) =>
          e.id === updated.id
            ? {
                ...updated,
                competencies: updatedCompetencies.length
                  ? updatedCompetencies
                  : updated.competencies,
                diplomas: updatedDiplomas.length
                  ? updatedDiplomas
                  : updated.diplomas,
                shiftPreferences:
                  payload.shiftPreferences ?? updated.shiftPreferences,
              }
            : e,
        ),
      );

      let permissionsFailed = false;
      if (isTechnicalAdmin) {
        try {
          await savePermissions(editingEmployee);
        } catch (error: any) {
          permissionsFailed = true;
          toast({
            title: "Berechtigungen nicht gespeichert",
            description:
              error.message ||
              "Berechtigungen konnten nicht gespeichert werden",
            variant: "destructive",
          });
        }
      }

      if (permissionsFailed) {
        return;
      }

      setEditDialogOpen(false);
      setEditingEmployee(null);
      toast({
        title: "Gespeichert",
        description: "Mitarbeiterdaten wurden aktualisiert",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Speichern fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateEmployee = async () => {
    const parsedBirthday = parseBirthdayInput(newBirthdayInput);
    if (parsedBirthday === null || parsedBirthday === "") {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gültiges Geburtsdatum eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    const emailValue = newFormData.email.trim();
    if (
      !newFormData.firstName.trim() ||
      !newFormData.lastName.trim() ||
      !emailValue
    ) {
      toast({
        title: "Fehler",
        description: "Vorname, Nachname und E-Mail sind erforderlich",
        variant: "destructive",
      });
      return;
    }

    if (!isValidEmail(emailValue)) {
      toast({
        title: "Fehler",
        description:
          "Bitte eine gueltige E-Mail-Adresse ohne Umlaute eingeben.",
        variant: "destructive",
      });
      return;
    }

    const emailPrivateValue = newFormData.emailPrivate.trim();
    if (emailPrivateValue && !isValidEmail(emailPrivateValue)) {
      toast({
        title: "Fehler",
        description:
          "Bitte eine gueltige private E-Mail-Adresse ohne Umlaute eingeben.",
        variant: "destructive",
      });
      return;
    }

    if (!newRoleValue) {
      toast({
        title: "Fehler",
        description: "Bitte eine Rolle auswählen",
        variant: "destructive",
      });
      return;
    }

    const parsedInactiveFrom = newInactiveEnabled
      ? parseInactiveDate(newInactiveFrom)
      : "";
    if (newInactiveEnabled && parsedInactiveFrom === null) {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gueltiges Startdatum fuer die Deaktivierung eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    const parsedInactiveUntil = newInactiveEnabled
      ? parseInactiveDate(newInactiveUntil)
      : "";
    if (newInactiveEnabled && parsedInactiveUntil === null) {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gueltiges Enddatum fuer die Deaktivierung eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    if (
      newInactiveEnabled &&
      parsedInactiveFrom &&
      parsedInactiveUntil &&
      parsedInactiveFrom > parsedInactiveUntil
    ) {
      toast({
        title: "Fehler",
        description:
          "Das Enddatum der Deaktivierung muss nach dem Startdatum liegen.",
        variant: "destructive",
      });
      return;
    }
    const parsedEmploymentFrom = newLimitedPresenceEnabled
      ? parseInactiveDate(newEmploymentFrom)
      : "";
    if (parsedEmploymentFrom === null) {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gueltiges Startdatum fuer die befristete Anwesenheit eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    const parsedEmploymentUntil = newLimitedPresenceEnabled
      ? parseInactiveDate(newEmploymentUntil)
      : "";
    if (parsedEmploymentUntil === null) {
      toast({
        title: "Fehler",
        description:
          "Bitte ein gueltiges Enddatum fuer die befristete Anwesenheit eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive",
      });
      return;
    }

    if (
      parsedEmploymentFrom &&
      parsedEmploymentUntil &&
      parsedEmploymentFrom > parsedEmploymentUntil
    ) {
      toast({
        title: "Fehler",
        description:
          "Das Enddatum der befristeten Anwesenheit muss nach dem Startdatum liegen.",
        variant: "destructive",
      });
      return;
    }

    const parsedVacationEntitlementNew = parseVacationEntitlementInput(
      newFormData.vacationEntitlement,
    );
    if (
      newFormData.vacationEntitlement.trim() &&
      parsedVacationEntitlementNew === null
    ) {
      toast({
        title: "Fehler",
        description: "Bitte einen gueltigen Urlaubsanspruch (Tage) eingeben.",
        variant: "destructive",
      });
      return;
    }

    const inactiveReasonValue = newInactiveEnabled
      ? newInactiveReason.trim()
      : "";
    setCreating(true);
    try {
      const nextShiftPreferences: ShiftPreferences = {
        deploymentRoomIds: newDeploymentRoomIds,
      };
      if (newServiceTypeOverrides.length) {
        nextShiftPreferences.serviceTypeOverrides = newServiceTypeOverrides;
      }
      const normalizedVisibilityGroups = normalizeVisibilityGroups(
        newVacationVisibilityGroups,
      );
      if (!isDefaultVisibilityGroups(normalizedVisibilityGroups)) {
        nextShiftPreferences.vacationVisibilityRoleGroups =
          normalizedVisibilityGroups;
      }

      const payload: any = {
        title: newFormData.title || null,
        firstName: newFormData.firstName.trim(),
        lastName: newFormData.lastName.trim(),
        name: `${newFormData.firstName} ${newFormData.lastName}`.trim(),
        birthday: parsedBirthday,
        email: emailValue,
        emailPrivate: emailPrivateValue || null,
        phoneWork: newFormData.phoneWork.trim() || null,
        phonePrivate: newFormData.phonePrivate.trim() || null,
        showPrivateContact: newFormData.showPrivateContact,
        role: newRoleValue as Employee["role"],
        appRole: (newAppRoleValue || "User") as Employee["appRole"],
        systemRole: "employee",
        takesShifts: newTakesShifts,
        canOverduty: newCanOverduty,
        inactiveFrom: parsedInactiveFrom || null,
        inactiveUntil: parsedInactiveUntil || null,
        inactiveReason: inactiveReasonValue || null,
        vacationEntitlement: parsedVacationEntitlementNew,
        shiftPreferences: nextShiftPreferences,
        employmentFrom: parsedEmploymentFrom || null,
        employmentUntil: parsedEmploymentUntil || null,
      };
      if (currentUser?.departmentId) {
        payload.departmentId = currentUser.departmentId;
      }

      const created = await employeeApi.create(payload);
      if (newCompetencyIds.length) {
        await employeeApi.updateCompetencies(created.id, newCompetencyIds);
      }
      if (newDiplomaIds.length) {
        await employeeApi.updateDiplomas(created.id, newDiplomaIds);
      }

      const createdCompetencies = newCompetencyIds
        .map((id) => availableCompetencies.find((comp) => comp.id === id)?.name)
        .filter((name): name is string => Boolean(name));

      const createdDiplomas = newDiplomaIds
        .map(
          (id) => availableDiplomas.find((diploma) => diploma.id === id)?.name,
        )
        .filter((name): name is string => Boolean(name));

      setEmployees((prev) => [
        ...prev,
        {
          ...created,
          competencies: createdCompetencies.length
            ? createdCompetencies
            : created.competencies,
          diplomas: createdDiplomas.length ? createdDiplomas : created.diplomas,
          shiftPreferences:
            payload.shiftPreferences ?? created.shiftPreferences,
        },
      ]);
      setNewEmployeeDialogOpen(false);
      resetNewEmployeeForm();
      toast({
        title: "Gespeichert",
        description: "Mitarbeiter wurde angelegt",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Mitarbeiter konnte nicht angelegt werden",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!editingEmployee) return;

    if (
      !resetPasswordData.newPassword ||
      resetPasswordData.newPassword !== resetPasswordData.confirmPassword
    ) {
      toast({
        title: "Fehler",
        description: "Passwörter stimmen nicht überein",
        variant: "destructive",
      });
      return;
    }

    setResettingPassword(true);
    try {
      await apiRequest("POST", "/api/auth/set-password", {
        employeeId: editingEmployee.id,
        newPassword: resetPasswordData.newPassword,
      });
      toast({
        title: "Passwort zurückgesetzt",
        description: "Das neue Passwort wurde gespeichert",
      });
      setResetPasswordData({ newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Passwort konnte nicht gesetzt werden",
        variant: "destructive",
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const normalizeVisibilityGroups = (groups: VacationVisibilityGroup[]) => {
    const unique = Array.from(new Set(groups));
    const filtered = unique.filter((group) =>
      DEFAULT_VISIBILITY_GROUPS.includes(group),
    );
    return filtered.length ? filtered : DEFAULT_VISIBILITY_GROUPS;
  };

  const isDefaultVisibilityGroups = (groups: VacationVisibilityGroup[]) =>
    groups.length === DEFAULT_VISIBILITY_GROUPS.length &&
    DEFAULT_VISIBILITY_GROUPS.every((group) => groups.includes(group));

  const toggleEditCompetency = (id: number) => {
    setEditCompetencyIds((prev) =>
      prev.includes(id)
        ? prev.filter((compId) => compId !== id)
        : [...prev, id],
    );
  };

  const toggleNewCompetency = (id: number) => {
    setNewCompetencyIds((prev) =>
      prev.includes(id)
        ? prev.filter((compId) => compId !== id)
        : [...prev, id],
    );
  };

  const toggleEditDiploma = (id: number) => {
    setEditDiplomaIds((prev) =>
      prev.includes(id)
        ? prev.filter((diplomaId) => diplomaId !== id)
        : [...prev, id],
    );
  };

  const toggleNewDiploma = (id: number) => {
    setNewDiplomaIds((prev) =>
      prev.includes(id)
        ? prev.filter((diplomaId) => diplomaId !== id)
        : [...prev, id],
    );
  };

  const toggleCompetencyDiploma = (id: number) => {
    setCompetencyDiplomaIds((prev) =>
      prev.includes(id)
        ? prev.filter((diplomaId) => diplomaId !== id)
        : [...prev, id],
    );
  };

  const toggleEditDeploymentRoom = (id: number) => {
    setEditDeploymentRoomIds((prev) =>
      prev.includes(id)
        ? prev.filter((roomId) => roomId !== id)
        : [...prev, id],
    );
  };

  const toggleNewDeploymentRoom = (id: number) => {
    setNewDeploymentRoomIds((prev) =>
      prev.includes(id)
        ? prev.filter((roomId) => roomId !== id)
        : [...prev, id],
    );
  };

  const toggleEditServiceType = (type: ServiceType) => {
    setEditServiceTypeOverrides((prev) =>
      prev.includes(type)
        ? prev.filter((value) => value !== type)
        : [...prev, type],
    );
  };

  const toggleNewServiceType = (type: ServiceType) => {
    setNewServiceTypeOverrides((prev) =>
      prev.includes(type)
        ? prev.filter((value) => value !== type)
        : [...prev, type],
    );
  };

  const toggleEditVacationVisibilityGroup = (
    group: VacationVisibilityGroup,
  ) => {
    setEditVacationVisibilityGroups((prev) =>
      prev.includes(group)
        ? prev.filter((value) => value !== group)
        : [...prev, group],
    );
  };

  const toggleNewVacationVisibilityGroup = (group: VacationVisibilityGroup) => {
    setNewVacationVisibilityGroups((prev) =>
      prev.includes(group)
        ? prev.filter((value) => value !== group)
        : [...prev, group],
    );
  };

  const toggleDiplomaEmployee = (id: number) => {
    setDiplomaEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((empId) => empId !== id) : [...prev, id],
    );
  };

  const getCompetencyLabel = (id: number) =>
    availableCompetencies.find((comp) => comp.id === id)?.name ||
    `Kompetenz ${id}`;

  const getDiplomaLabel = (id: number) =>
    availableDiplomas.find((diploma) => diploma.id === id)?.name ||
    `Diplom ${id}`;

  const getRoomLabel = (id: number) =>
    availableRooms.find((room) => room.id === id)?.name || `Arbeitsplatz ${id}`;

  const getServiceTypeLabel = (type: ServiceType) =>
    serviceLineLookup.get(type)?.label || type;

  const getRoleLabel = (role: string) => ROLE_LABELS[role] || role;

  const getRoleSortRank = (role?: string | null) => {
    const normalized = normalizeRoleValue(role);
    return ROLE_SORT_ORDER[normalized] ?? 999;
  };

  const getEmployeeDiplomaIds = (emp: Employee, diplomas: Diploma[]) => {
    if (!Array.isArray(emp.diplomas)) return [];
    return emp.diplomas
      .map((name) => diplomas.find((diploma) => diploma.name === name)?.id)
      .filter((id): id is number => typeof id === "number");
  };

  const filteredEmployees = employees
    .filter((emp) => {
      const search = searchTerm.toLowerCase();
      const roleLabel = getRoleLabel(emp.role).toLowerCase();
      return (
        emp.name.toLowerCase().includes(search) ||
        emp.role.toLowerCase().includes(search) ||
        roleLabel.includes(search) ||
        (emp.competencies || []).some((c) => c.toLowerCase().includes(search))
      );
    })
    .slice()
    .sort((a, b) => {
      const roleRank = getRoleSortRank(a.role) - getRoleSortRank(b.role);
      if (roleRank !== 0) return roleRank;
      const lastNameA = (a.lastName || a.name || "").toLowerCase();
      const lastNameB = (b.lastName || b.name || "").toLowerCase();
      if (lastNameA !== lastNameB) return lastNameA.localeCompare(lastNameB);
      const firstNameA = (a.firstName || "").toLowerCase();
      const firstNameB = (b.firstName || "").toLowerCase();
      return firstNameA.localeCompare(firstNameB);
    });

  const filteredAvailableCompetencies = availableCompetencies.filter((comp) => {
    const query = competencySearch.trim().toLowerCase();
    if (!query) return true;
    return (
      comp.name.toLowerCase().includes(query) ||
      (comp.code || "").toLowerCase().includes(query)
    );
  });

  const filteredAvailableDiplomas = availableDiplomas.filter((diploma) => {
    const query = diplomaSearch.trim().toLowerCase();
    if (!query) return true;
    return diploma.name.toLowerCase().includes(query);
  });

  const filteredCompetencyDiplomas = availableDiplomas.filter((diploma) => {
    const query = competencyDiplomaSearch.trim().toLowerCase();
    if (!query) return true;
    return diploma.name.toLowerCase().includes(query);
  });

  const filteredRooms = availableRooms.filter((room) => {
    const query = roomSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      room.name.toLowerCase().includes(query) ||
      (room.category || "").toLowerCase().includes(query)
    );
  });

  const filteredDiplomaEmployees = employees
    .filter((emp) => emp.isActive)
    .filter((emp) => {
      const query = diplomaEmployeeSearch.trim().toLowerCase();
      if (!query) return true;
      return (
        emp.name.toLowerCase().includes(query) ||
        (emp.email || "").toLowerCase().includes(query) ||
        (emp.lastName || "").toLowerCase().includes(query)
      );
    })
    .slice()
    .sort((a, b) => {
      const roleRank = getRoleSortRank(a.role) - getRoleSortRank(b.role);
      if (roleRank !== 0) return roleRank;
      const lastNameA = (a.lastName || a.name || "").toLowerCase();
      const lastNameB = (b.lastName || b.name || "").toLowerCase();
      if (lastNameA !== lastNameB) return lastNameA.localeCompare(lastNameB);
      const firstNameA = (a.firstName || "").toLowerCase();
      const firstNameB = (b.firstName || "").toLowerCase();
      return firstNameA.localeCompare(firstNameB);
    });

  const editSelectedCompetencyLabels = editCompetencyIds.map((id) => ({
    id,
    label: getCompetencyLabel(id),
  }));

  const editSelectedDiplomaLabels = editDiplomaIds.map((id) => ({
    id,
    label: getDiplomaLabel(id),
  }));

  const newSelectedCompetencyLabels = newCompetencyIds.map((id) => ({
    id,
    label: getCompetencyLabel(id),
  }));

  const newSelectedDiplomaLabels = newDiplomaIds.map((id) => ({
    id,
    label: getDiplomaLabel(id),
  }));

  const editSelectedRoomLabels = editDeploymentRoomIds.map((id) => ({
    id,
    label: getRoomLabel(id),
  }));

  const newSelectedRoomLabels = newDeploymentRoomIds.map((id) => ({
    id,
    label: getRoomLabel(id),
  }));

  const editSelectedServiceTypeLabels = editServiceTypeOverrides.map(
    (type) => ({
      id: type,
      label: getServiceTypeLabel(type),
    }),
  );

  const newSelectedServiceTypeLabels = newServiceTypeOverrides.map((type) => ({
    id: type,
    label: getServiceTypeLabel(type),
  }));

  const filteredCompetencies = competencyList.filter(
    (comp) =>
      comp.name.toLowerCase().includes(competencySearchTerm.toLowerCase()) ||
      (comp.code || "")
        .toLowerCase()
        .includes(competencySearchTerm.toLowerCase()),
  );

  const filteredDiplomas = diplomaList.filter((diploma) =>
    diploma.name.toLowerCase().includes(diplomaSearchTerm.toLowerCase()),
  );

  const permissionOptions = availablePermissions.length
    ? PERMISSION_FALLBACK.map(
        (fallback) =>
          availablePermissions.find((perm) => perm.key === fallback.key) ||
          fallback,
      )
    : PERMISSION_FALLBACK;

  const getCapabilities = (emp: Employee) => {
    const types = getServiceTypesForEmployee(emp, serviceLineMeta);
    return types.map((type) => ({
      label: serviceLineLookup.get(type)?.label || type,
      color:
        serviceLineLookup.get(type)?.style.badge ||
        "bg-muted text-muted-foreground border-border",
    }));
  };

  const getDeploymentLabels = (emp: Employee) => {
    const prefs = (emp.shiftPreferences as ShiftPreferences | null) || null;
    const ids = Array.isArray(prefs?.deploymentRoomIds)
      ? prefs.deploymentRoomIds
      : [];
    if (ids.length) {
      return ids.map((id) => getRoomLabel(id));
    }
    if (emp.primaryDeploymentArea) {
      return [emp.primaryDeploymentArea];
    }
    return [];
  };

  const getAppRoleBadge = (appRole: string) => {
    switch (appRole) {
      case "Admin":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
            <Shield className="w-3 h-3" />
            Admin
          </Badge>
        );
      case "Editor":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1">
            <Shield className="w-3 h-3" />
            Editor
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Benutzer
          </Badge>
        );
    }
  };

  const handleNewCompetency = () => {
    setEditingCompetency({
      name: "",
      code: "",
      description: "",
      prerequisites: "",
    });
    setCompetencyDiplomaIds([]);
    setCompetencyDiplomaSearch("");
    setCompetencyDialogOpen(true);
  };

  const handleEditCompetency = (comp: Competency) => {
    setEditingCompetency({ ...comp });
    setCompetencyDiplomaSearch("");
    setCompetencyDialogOpen(true);
  };

  const handleSaveCompetency = async () => {
    if (!editingCompetency) return;
    const cleanedName = editingCompetency.name?.trim() || "";
    const cleanedCode = editingCompetency.code?.trim().toUpperCase() || "";
    if (!cleanedName || !cleanedCode) {
      toast({
        title: "Fehler",
        description: "Name und Kürzel sind erforderlich",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editingCompetency.id) {
        const updated = await competencyApi.update(editingCompetency.id, {
          name: cleanedName,
          code: cleanedCode,
          description: editingCompetency.description || null,
          prerequisites: editingCompetency.prerequisites || null,
        });
        await competencyApi.updateDiplomas(
          editingCompetency.id,
          competencyDiplomaIds,
        );
        setCompetencyList((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
      } else {
        const created = await competencyApi.create({
          name: cleanedName,
          code: cleanedCode,
          description: editingCompetency.description || null,
          prerequisites: editingCompetency.prerequisites || null,
          isActive: true,
        });
        if (competencyDiplomaIds.length) {
          await competencyApi.updateDiplomas(created.id, competencyDiplomaIds);
        }
        setCompetencyList((prev) => [...prev, created]);
      }
      setCompetencyDialogOpen(false);
      setEditingCompetency(null);
      setCompetencyDiplomaIds([]);
      setCompetencyDiplomaSearch("");
      toast({
        title: "Gespeichert",
        description: "Kompetenz wurde gespeichert",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Kompetenz konnte nicht gespeichert werden",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCompetency = async (id: number) => {
    setSaving(true);
    try {
      await competencyApi.delete(id);
      setCompetencyList((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Gelöscht", description: "Kompetenz wurde entfernt" });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Kompetenz konnte nicht gelöscht werden",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleNewDiploma = () => {
    setEditingDiploma({ name: "", description: "" });
    setDiplomaEmployeeIds([]);
    setDiplomaEmployeeSearch("");
    setDiplomaDialogOpen(true);
  };

  const handleEditDiploma = (diploma: Diploma) => {
    setEditingDiploma({ ...diploma });
    setDiplomaEmployeeSearch("");
    setDiplomaEmployeeIds(
      employees
        .filter(
          (emp) =>
            Array.isArray(emp.diplomas) && emp.diplomas.includes(diploma.name),
        )
        .map((emp) => emp.id),
    );
    setDiplomaDialogOpen(true);
  };

  const syncDiplomaAssignments = async (
    diploma: Diploma,
    nextDiplomas: Diploma[],
  ) => {
    if (!canManageEmployees) return;
    const selected = new Set(diplomaEmployeeIds);
    const toUpdate = employees.filter((emp) => {
      const currentIds = getEmployeeDiplomaIds(emp, nextDiplomas);
      const hasDiploma = currentIds.includes(diploma.id);
      const shouldHave = selected.has(emp.id);
      return hasDiploma !== shouldHave;
    });

    if (!toUpdate.length) return;

    await Promise.all(
      toUpdate.map(async (emp) => {
        const currentIds = getEmployeeDiplomaIds(emp, nextDiplomas);
        const shouldHave = selected.has(emp.id);
        const nextIds = shouldHave
          ? Array.from(new Set([...currentIds, diploma.id]))
          : currentIds.filter((id) => id !== diploma.id);
        await employeeApi.updateDiplomas(emp.id, nextIds);
      }),
    );

    setEmployees((prev) =>
      prev.map((emp) => {
        if (!toUpdate.some((candidate) => candidate.id === emp.id)) return emp;
        const currentIds = getEmployeeDiplomaIds(emp, nextDiplomas);
        const shouldHave = selected.has(emp.id);
        const nextIds = shouldHave
          ? Array.from(new Set([...currentIds, diploma.id]))
          : currentIds.filter((id) => id !== diploma.id);
        const nextNames = nextIds
          .map((id) => nextDiplomas.find((d) => d.id === id)?.name)
          .filter((name): name is string => Boolean(name));
        return { ...emp, diplomas: nextNames };
      }),
    );
  };

  const handleSaveDiploma = async () => {
    if (!editingDiploma) return;
    const cleanedName = editingDiploma.name?.trim() || "";
    if (!cleanedName) {
      toast({
        title: "Fehler",
        description: "Name ist erforderlich",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editingDiploma.id) {
        const updated = await diplomaApi.update(editingDiploma.id, {
          name: cleanedName,
          description: editingDiploma.description || null,
        });
        const next = diplomaList.map((d) =>
          d.id === updated.id ? updated : d,
        );
        setDiplomaList(next);
        setAvailableDiplomas(
          next.filter((diploma) => diploma.isActive !== false),
        );
        await syncDiplomaAssignments(updated, next);
      } else {
        const created = await diplomaApi.create({
          name: cleanedName,
          description: editingDiploma.description || null,
          isActive: true,
        });
        const next = [...diplomaList, created];
        setDiplomaList(next);
        setAvailableDiplomas(
          next.filter((diploma) => diploma.isActive !== false),
        );
        await syncDiplomaAssignments(created, next);
      }
      setDiplomaDialogOpen(false);
      setEditingDiploma(null);
      toast({ title: "Gespeichert", description: "Diplom wurde gespeichert" });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Diplom konnte nicht gespeichert werden",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDiploma = async (id: number) => {
    setSaving(true);
    try {
      await diplomaApi.delete(id);
      const next = diplomaList.filter((d) => d.id !== id);
      setDiplomaList(next);
      setAvailableDiplomas(
        next.filter((diploma) => diploma.isActive !== false),
      );
      toast({ title: "Gelöscht", description: "Diplom wurde entfernt" });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Diplom konnte nicht gelöscht werden",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEditingDiploma = async () => {
    if (!editingDiploma?.id || !canManageEmployees) return;
    const confirmed = window.confirm("Diplom wirklich löschen?");
    if (!confirmed) return;
    await handleDeleteDiploma(editingDiploma.id);
    setDiplomaDialogOpen(false);
    setEditingDiploma(null);
  };

  const handleDeleteEditingCompetency = async () => {
    if (!editingCompetency?.id || !canManageEmployees) return;
    const confirmed = window.confirm("Kompetenz wirklich löschen?");
    if (!confirmed) return;
    await handleDeleteCompetency(editingCompetency.id);
    setCompetencyDialogOpen(false);
    setEditingCompetency(null);
  };

  const handleDeleteEmployee = async () => {
    if (!editingEmployee || !canManageEmployees) return;
    const confirmed = window.confirm(
      "Mitarbeiter wirklich löschen? Der Datensatz wird deaktiviert.",
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      await employeeApi.delete(editingEmployee.id);
      setEmployees((prev) =>
        prev.filter((emp) => emp.id !== editingEmployee.id),
      );
      toast({
        title: "Gelöscht",
        description: "Mitarbeiter wurde deaktiviert",
      });
      setEditDialogOpen(false);
      setEditingEmployee(null);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Mitarbeiter konnte nicht gelöscht werden",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const loadPermissions = async (userId: number, departmentId?: number) => {
    setLoadingPermissions(true);
    try {
      const token = localStorage.getItem("cliniq_auth_token");
      const query = departmentId ? `?departmentId=${departmentId}` : "";
      const response = await fetch(
        `/api/admin/users/${userId}/permissions${query}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Fehler beim Laden der Berechtigungen");
      }

      const result = await response.json();
      if (result.success && result.data) {
        setAvailablePermissions(result.data.availablePermissions || []);
        setUserPermissions(result.data.permissions || []);
      }
    } catch (error) {
      console.error("Error loading permissions:", error);
      toast({
        title: "Fehler",
        description: "Berechtigungen konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoadingPermissions(false);
    }
  };

  const updatePermission = (key: string, enabled: boolean) => {
    setUserPermissions((prev) => {
      if (enabled) {
        return prev.includes(key) ? prev : [...prev, key];
      }
      return prev.filter((p) => p !== key);
    });
  };

  return (
    <Layout title="Mitarbeiter & Kompetenzen">
      <div className="space-y-6">
        <Tabs defaultValue="employees" className="space-y-6">
          <TabsList className="bg-background border border-border p-1 h-12 rounded-xl shadow-sm">
            <TabsTrigger
              value="employees"
              className="rounded-lg px-6 h-10"
              data-testid="tab-employees"
            >
              Mitarbeiter
            </TabsTrigger>
            <TabsTrigger
              value="competencies"
              className="rounded-lg px-6 h-10"
              data-testid="tab-competencies"
            >
              Kompetenzen
            </TabsTrigger>
            <TabsTrigger
              value="diplomas"
              className="rounded-lg px-6 h-10"
              data-testid="tab-diplomas"
            >
              Diplome
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="employees"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Mitarbeiter suchen..."
                  className="pl-9 bg-background"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-employees"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4" /> Filter
                </Button>

                {canManageEmployees && (
                  <Dialog
                    open={newEmployeeDialogOpen}
                    onOpenChange={handleNewEmployeeDialogChange}
                  >
                    <DialogTrigger asChild>
                      <Button
                        className="gap-2"
                        data-testid="button-new-employee"
                      >
                        <UserPlus className="w-4 h-4" /> Neuer Mitarbeiter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Neuen Mitarbeiter anlegen</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-6 py-2">
                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold">Basisdaten</h4>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Titel</Label>
                              <Input
                                value={newFormData.title}
                                onChange={(e) =>
                                  setNewFormData((prev) => ({
                                    ...prev,
                                    title: e.target.value,
                                  }))
                                }
                                placeholder="Dr. med."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Vorname</Label>
                              <Input
                                value={newFormData.firstName}
                                onChange={(e) =>
                                  setNewFormData((prev) => ({
                                    ...prev,
                                    firstName: e.target.value,
                                  }))
                                }
                                placeholder="Max"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Nachname</Label>
                              <Input
                                value={newFormData.lastName}
                                onChange={(e) =>
                                  setNewFormData((prev) => ({
                                    ...prev,
                                    lastName: e.target.value,
                                  }))
                                }
                                placeholder="Mustermann"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Geburtsdatum</Label>
                              <div className="flex items-center gap-2">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      aria-label="Kalender öffnen"
                                    >
                                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent align="start" className="p-2">
                                    <DatePickerCalendar
                                      mode="single"
                                      captionLayout="dropdown"
                                      selected={
                                        newFormData.birthday
                                          ? new Date(
                                              `${newFormData.birthday}T00:00:00`,
                                            )
                                          : undefined
                                      }
                                      onSelect={(date) => {
                                        if (!date) return;
                                        const iso = formatBirthday(date);
                                        setNewFormData((prev) => ({
                                          ...prev,
                                          birthday: iso,
                                        }));
                                        setNewBirthdayInput(
                                          formatBirthdayDisplay(iso),
                                        );
                                      }}
                                      fromYear={1900}
                                      toYear={new Date().getFullYear()}
                                    />
                                  </PopoverContent>
                                </Popover>
                                <Input
                                  value={newBirthdayInput}
                                  onChange={(e) =>
                                    setNewBirthdayInput(e.target.value)
                                  }
                                  placeholder="TT.MM.JJJJ"
                                />
                              </div>
                            </div>
                          </div>

                          <Separator />

                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>E-Mail (Dienst)</Label>
                              <Input
                                value={newFormData.email}
                                onChange={(e) =>
                                  setNewFormData((prev) => ({
                                    ...prev,
                                    email: e.target.value,
                                  }))
                                }
                                placeholder="name@klinik.at"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>E-Mail (privat)</Label>
                              <Input
                                value={newFormData.emailPrivate}
                                onChange={(e) =>
                                  setNewFormData((prev) => ({
                                    ...prev,
                                    emailPrivate: e.target.value,
                                  }))
                                }
                                placeholder="name@privat.at"
                              />
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Telefon (Dienst)</Label>
                              <Input
                                value={newFormData.phoneWork}
                                onChange={(e) =>
                                  setNewFormData((prev) => ({
                                    ...prev,
                                    phoneWork: e.target.value,
                                  }))
                                }
                                placeholder="+43 ..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Telefon (privat)</Label>
                              <Input
                                value={newFormData.phonePrivate}
                                onChange={(e) =>
                                  setNewFormData((prev) => ({
                                    ...prev,
                                    phonePrivate: e.target.value,
                                  }))
                                }
                                placeholder="+43 ..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Urlaubsanspruch (Tage)</Label>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                value={newFormData.vacationEntitlement}
                                onChange={(e) =>
                                  setNewFormData((prev) => ({
                                    ...prev,
                                    vacationEntitlement: e.target.value,
                                  }))
                                }
                                placeholder="z.B. 25"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-border p-4">
                            <div>
                              <Label>Private Kontaktdaten sichtbar</Label>
                              <p className="text-xs text-muted-foreground">
                                Erlaubt das Anzeigen privater
                                Telefonnummer/E-Mail
                              </p>
                            </div>
                            <Switch
                              checked={newFormData.showPrivateContact}
                              onCheckedChange={(checked) =>
                                setNewFormData((prev) => ({
                                  ...prev,
                                  showPrivateContact: Boolean(checked),
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold">
                            Rollen & Kompetenzen
                          </h4>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Rolle</Label>
                              <Select
                                value={newRoleValue}
                                onValueChange={(value) =>
                                  setNewRoleValue(value as Employee["role"])
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Rolle wählen" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map((role) => (
                                    <SelectItem
                                      key={role.value}
                                      value={role.value}
                                    >
                                      {role.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>App-Rolle</Label>
                              <Select
                                value={newAppRoleValue}
                                onValueChange={(value) =>
                                  setNewAppRoleValue(
                                    value as Employee["appRole"],
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="App-Rolle wählen" />
                                </SelectTrigger>
                                <SelectContent>
                                  {APP_ROLE_OPTIONS.map((role) => (
                                    <SelectItem key={role} value={role}>
                                      {role}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-border p-4">
                            <div>
                              <Label>Dienstplan berücksichtigen</Label>
                              <p className="text-xs text-muted-foreground">
                                Wenn deaktiviert, wird die Person im Dienstplan
                                nicht eingeplant.
                              </p>
                            </div>
                            <Switch
                              checked={newTakesShifts}
                              onCheckedChange={(checked) =>
                                setNewTakesShifts(Boolean(checked))
                              }
                              disabled={!canManageEmployees}
                            />
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-border p-4">
                            <div>
                              <Label>Kann Überdienst machen</Label>
                              <p className="text-xs text-muted-foreground">
                                Erlaubt Eintragung im Überdienst
                                (Rufbereitschaft).
                              </p>
                            </div>
                            <Switch
                              checked={newCanOverduty}
                              onCheckedChange={(checked) =>
                                setNewCanOverduty(Boolean(checked))
                              }
                              disabled={!canManageEmployees}
                            />
                          </div>

                          {canManageEmployees && (
                            <div className="space-y-3 rounded-lg border border-border p-4">
                              <div>
                                <Label>Urlaubsplan-Sichtbarkeit</Label>
                                <p className="text-xs text-muted-foreground">
                                  Legt fest, welche Rollen im Urlaubsplan
                                  sichtbar sind.
                                </p>
                              </div>
                              <div className="grid gap-2 md:grid-cols-2">
                                {DEFAULT_VISIBILITY_GROUPS.map((group) => (
                                  <div
                                    key={group}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={`new-vacation-visibility-${group}`}
                                      checked={newVacationVisibilityGroups.includes(
                                        group,
                                      )}
                                      onCheckedChange={() =>
                                        toggleNewVacationVisibilityGroup(group)
                                      }
                                    />
                                    <Label
                                      htmlFor={`new-vacation-visibility-${group}`}
                                      className="text-sm font-normal cursor-pointer"
                                    >
                                      {VISIBILITY_GROUP_LABELS[group]}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-3 rounded-lg border border-border p-4">
                            <div>
                              <Label>Einsetzbar für (Abweichung)</Label>
                              <p className="text-xs text-muted-foreground">
                                Nur bei Abweichungen vom Standard nach Rolle
                                setzen. Leer lassen = Standard.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {newSelectedServiceTypeLabels.length ? (
                                newSelectedServiceTypeLabels.map((service) => (
                                  <Badge
                                    key={service.id}
                                    variant="secondary"
                                    className="flex items-center gap-1"
                                  >
                                    <span>{service.label}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleNewServiceType(service.id)
                                      }
                                      className="ml-1 text-muted-foreground hover:text-foreground"
                                      aria-label={`Einsetzbarkeit entfernen: ${service.label}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </Badge>
                                ))
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Standard nach Rolle
                                </p>
                              )}
                            </div>
                            <div className="grid gap-2 md:grid-cols-3">
                              {selectableServiceLines.map((line) => (
                                <div
                                  key={line.key}
                                  className="flex items-center gap-2"
                                >
                                  <Checkbox
                                    id={`new-service-${line.key}`}
                                    checked={newServiceTypeOverrides.includes(
                                      line.key,
                                    )}
                                    onCheckedChange={() =>
                                      toggleNewServiceType(line.key)
                                    }
                                    disabled={!canManageEmployees}
                                  />
                                  <Label
                                    htmlFor={`new-service-${line.key}`}
                                    className="text-sm font-normal cursor-pointer"
                                  >
                                    {line.label}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-3 rounded-lg border border-border p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <Label>Befristete Anwesenheit</Label>
                                <p className="text-xs text-muted-foreground">
                                  Für Turnusärzt:innen: Zugang und Rechte sind nur im definierten Zeitraum aktiv.
                                  Nach Ablauf wird der Benutzer automatisch archiviert und kann sich nicht mehr anmelden.
                                </p>
                              </div>

                              <Switch
                                checked={newLimitedPresenceEnabled}
                                onCheckedChange={(checked) => {
                                  const enabled = Boolean(checked);
                                  setNewLimitedPresenceEnabled(enabled);
                                  if (!enabled) {
                                    setNewEmploymentFrom("");
                                    setNewEmploymentUntil("");
                                  }
                                }}
                                disabled={!canManageEmployees}
                              />
                            </div>

                            {newLimitedPresenceEnabled && (
                              <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Von</Label>
                                  <Input
                                    type="date"
                                    value={newEmploymentFrom}
                                    onChange={(e) => setNewEmploymentFrom(e.target.value)}
                                    disabled={!canManageEmployees}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Bis</Label>
                                  <Input
                                    type="date"
                                    value={newEmploymentUntil}
                                    onChange={(e) => setNewEmploymentUntil(e.target.value)}
                                    disabled={!canManageEmployees}
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-3 rounded-lg border border-border p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <Label>Langzeit-Deaktivierung</Label>
                                <p className="text-xs text-muted-foreground">
                                  Von/Bis - in diesem Zeitraum nicht fuer Dienst-
                                  und Wochenplan berücksichtigen.
                                </p>
                              </div>
                              <Switch
                                checked={newInactiveEnabled}
                                onCheckedChange={(checked) => {
                                  const enabled = Boolean(checked);
                                  setNewInactiveEnabled(enabled);
                                  if (!enabled) {
                                    setNewInactiveFrom("");
                                    setNewInactiveUntil("");
                                    setNewInactiveReason("");
                                  }
                                }}
                                disabled={!canManageEmployees}
                              />
                            </div>

                            {newInactiveEnabled && (
                              <>
                                <div className="grid md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Von</Label>
                                    <Input
                                      type="date"
                                      value={newInactiveFrom}
                                      onChange={(e) =>
                                        setNewInactiveFrom(e.target.value)
                                      }
                                      disabled={!canManageEmployees}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Bis</Label>
                                    <Input
                                      type="date"
                                      value={newInactiveUntil}
                                      onChange={(e) =>
                                        setNewInactiveUntil(e.target.value)
                                      }
                                      disabled={!canManageEmployees}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Label>Begruendung</Label>
                                    {newInactiveReason.trim() && (
                                      <Badge
                                        variant="secondary"
                                        className="max-w-[280px] truncate"
                                      >
                                        {newInactiveReason.trim()}
                                      </Badge>
                                    )}
                                  </div>
                                  <Textarea
                                    value={newInactiveReason}
                                    onChange={(e) =>
                                      setNewInactiveReason(e.target.value)
                                    }
                                    placeholder="z.B. Papamonat, Elternkarenz"
                                    rows={2}
                                    disabled={!canManageEmployees}
                                  />
                                </div>
                              </>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Kompetenzen</Label>
                            <div className="flex flex-wrap gap-2">
                              {newSelectedCompetencyLabels.length ? (
                                newSelectedCompetencyLabels.map((comp) => (
                                  <Badge
                                    key={comp.id}
                                    variant="secondary"
                                    className="flex items-center gap-1"
                                  >
                                    <span>{comp.label}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleNewCompetency(comp.id)
                                      }
                                      className="ml-1 text-muted-foreground hover:text-foreground"
                                      aria-label={`Kompetenz entfernen: ${comp.label}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </Badge>
                                ))
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Keine Kompetenzen ausgewählt
                                </p>
                              )}
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button type="button" variant="outline">
                                  Kompetenzen auswählen
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-80">
                                <div className="space-y-2">
                                  <Input
                                    value={competencySearch}
                                    onChange={(e) =>
                                      setCompetencySearch(e.target.value)
                                    }
                                    placeholder="Kompetenz suchen..."
                                  />
                                  <div className="max-h-56 overflow-y-auto space-y-2">
                                    {filteredAvailableCompetencies.map(
                                      (comp) => {
                                        const checked =
                                          newCompetencyIds.includes(comp.id);
                                        return (
                                          <div
                                            key={comp.id}
                                            className="flex items-center gap-2"
                                          >
                                            <Checkbox
                                              id={`new-competency-${comp.id}`}
                                              checked={checked}
                                              onCheckedChange={() =>
                                                toggleNewCompetency(comp.id)
                                              }
                                            />
                                            <Label
                                              htmlFor={`new-competency-${comp.id}`}
                                              className="text-sm font-normal cursor-pointer"
                                            >
                                              {comp.code
                                                ? `${comp.code} - ${comp.name}`
                                                : comp.name}
                                            </Label>
                                          </div>
                                        );
                                      },
                                    )}
                                    {!filteredAvailableCompetencies.length && (
                                      <p className="text-sm text-muted-foreground">
                                        Keine Kompetenzen gefunden
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>

                          <div className="space-y-2">
                            <Label>Diplome</Label>
                            <div className="flex flex-wrap gap-2">
                              {newSelectedDiplomaLabels.length ? (
                                newSelectedDiplomaLabels.map((diploma) => (
                                  <Badge
                                    key={diploma.id}
                                    variant="secondary"
                                    className="flex items-center gap-1"
                                  >
                                    <span>{diploma.label}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleNewDiploma(diploma.id)
                                      }
                                      className="ml-1 text-muted-foreground hover:text-foreground"
                                      aria-label={`Diplom entfernen: ${diploma.label}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </Badge>
                                ))
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Keine Diplome ausgewählt
                                </p>
                              )}
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button type="button" variant="outline">
                                  Diplome auswählen
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-80">
                                <div className="space-y-2">
                                  <Input
                                    value={diplomaSearch}
                                    onChange={(e) =>
                                      setDiplomaSearch(e.target.value)
                                    }
                                    placeholder="Diplom suchen..."
                                  />
                                  <div className="max-h-56 overflow-y-auto space-y-2">
                                    {filteredAvailableDiplomas.map(
                                      (diploma) => {
                                        const checked = newDiplomaIds.includes(
                                          diploma.id,
                                        );
                                        return (
                                          <div
                                            key={diploma.id}
                                            className="flex items-center gap-2"
                                          >
                                            <Checkbox
                                              id={`new-diploma-${diploma.id}`}
                                              checked={checked}
                                              onCheckedChange={() =>
                                                toggleNewDiploma(diploma.id)
                                              }
                                            />
                                            <Label
                                              htmlFor={`new-diploma-${diploma.id}`}
                                              className="text-sm font-normal cursor-pointer"
                                            >
                                              {diploma.name}
                                            </Label>
                                          </div>
                                        );
                                      },
                                    )}
                                    {!filteredAvailableDiplomas.length && (
                                      <p className="text-sm text-muted-foreground">
                                        Keine Diplome gefunden
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>

                          <div className="space-y-2">
                            <Label>Einsatzbereiche (Arbeitsplätze)</Label>
                            <div className="flex flex-wrap gap-2">
                              {newSelectedRoomLabels.length ? (
                                newSelectedRoomLabels.map((room) => (
                                  <Badge
                                    key={room.id}
                                    variant="secondary"
                                    className="flex items-center gap-1"
                                  >
                                    <span>{room.label}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleNewDeploymentRoom(room.id)
                                      }
                                      className="ml-1 text-muted-foreground hover:text-foreground"
                                      aria-label={`Einsatzbereich entfernen: ${room.label}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </Badge>
                                ))
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Keine Einsatzbereiche ausgewählt
                                </p>
                              )}
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button type="button" variant="outline">
                                  Einsatzbereiche auswählen
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-80">
                                <div className="space-y-2">
                                  <Input
                                    value={roomSearch}
                                    onChange={(e) =>
                                      setRoomSearch(e.target.value)
                                    }
                                    placeholder="Arbeitsplätze suchen..."
                                  />
                                  <div className="max-h-56 overflow-y-auto space-y-2">
                                    {filteredRooms.map((room) => {
                                      const checked =
                                        newDeploymentRoomIds.includes(room.id);
                                      return (
                                        <div
                                          key={room.id}
                                          className="flex items-center gap-2"
                                        >
                                          <Checkbox
                                            id={`new-room-${room.id}`}
                                            checked={checked}
                                            onCheckedChange={() =>
                                              toggleNewDeploymentRoom(room.id)
                                            }
                                          />
                                          <Label
                                            htmlFor={`new-room-${room.id}`}
                                            className="text-sm font-normal cursor-pointer"
                                          >
                                            {room.name}
                                          </Label>
                                        </div>
                                      );
                                    })}
                                    {!filteredRooms.length && (
                                      <p className="text-sm text-muted-foreground">
                                        Keine Arbeitsplätze gefunden
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Abbrechen</Button>
                        </DialogClose>
                        <Button
                          onClick={handleCreateEmployee}
                          disabled={creating}
                        >
                          {creating && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          Speichern
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

            <Card className="border-none shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Name</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>App-Rolle</TableHead>
                      <TableHead>Haupteinsatzbereich</TableHead>
                      <TableHead>Einsetzbar für</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((emp) => {
                      const capabilities = getCapabilities(emp);
                      const deploymentLabels = getDeploymentLabels(emp);
                      const employeeCompetencies = emp.competencies || [];
                      const isDutyExcluded = emp.takesShifts === false;
                      return (
                        <TableRow
                          key={emp.id}
                          data-testid={`row-employee-${emp.id}`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{emp.name}</span>
                              {employeeCompetencies.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {employeeCompetencies.slice(0, 2).join(", ")}
                                  {employeeCompetencies.length > 2 &&
                                    ` +${employeeCompetencies.length - 2}`}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal">
                              {getRoleLabel(emp.role)}
                            </Badge>
                          </TableCell>
                          <TableCell>{getAppRoleBadge(emp.appRole)}</TableCell>
                          <TableCell>
                            {deploymentLabels.length ? (
                              <div className="flex gap-1 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className="gap-1 font-normal"
                                >
                                  <MapPin className="w-3 h-3" />
                                  {deploymentLabels[0]}
                                </Badge>
                                {deploymentLabels.length > 1 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{deploymentLabels.length - 1}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isDutyExcluded ? (
                              <Badge
                                variant="outline"
                                className="text-xs text-muted-foreground border-muted-foreground/30"
                              >
                                Nicht im Dienstplan
                              </Badge>
                            ) : (
                              <div className="flex gap-1 flex-wrap">
                                {capabilities.map((cap, i) => (
                                  <Badge
                                    key={i}
                                    variant="outline"
                                    className={`text-xs font-medium border ${cap.color}`}
                                  >
                                    {cap.label}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManageEmployees && (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditEmployee(emp)}
                                  data-testid={`button-edit-employee-${emp.id}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="competencies"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Kompetenz suchen..."
                  className="pl-9 bg-background"
                  value={competencySearchTerm}
                  onChange={(e) => setCompetencySearchTerm(e.target.value)}
                  data-testid="input-search-competencies"
                />
              </div>
              {canManageEmployees && (
                <Button
                  className="gap-2"
                  onClick={handleNewCompetency}
                  data-testid="button-new-competency"
                >
                  <Plus className="w-4 h-4" /> Neue Kompetenz
                </Button>
              )}
            </div>

            <Card className="border-none shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Kompetenzname</TableHead>
                      <TableHead className="w-[100px]">Badge-Kürzel</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Zugeordnete Arbeitsplätze</TableHead>
                      <TableHead>Voraussetzungen</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompetencies.map((comp) => {
                      const assignedRooms =
                        competencyAssignments[comp.id] || [];
                      const renderAssignment = (
                        assignment: CompetencyAssignment,
                      ) =>
                        `${assignment.roomName}${assignment.weekdays.length ? ` (${assignment.weekdays.join(", ")})` : ""}`;
                      return (
                        <TableRow
                          key={comp.id}
                          data-testid={`row-competency-${comp.id}`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Award className="w-4 h-4 text-primary" />
                              {comp.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">
                              {comp.code || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                            {comp.description || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {assignedRooms.slice(0, 2).map((room, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  <Building className="w-3 h-3 mr-1" />
                                  {renderAssignment(room)}
                                </Badge>
                              ))}
                              {assignedRooms.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{assignedRooms.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                            {comp.prerequisites || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManageEmployees ? (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditCompetency(comp)}
                                  data-testid={`button-edit-competency-${comp.id}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="diplomas"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Diplom suchen..."
                  className="pl-9 bg-background"
                  value={diplomaSearchTerm}
                  onChange={(e) => setDiplomaSearchTerm(e.target.value)}
                  data-testid="input-search-diplomas"
                />
              </div>
              {canManageEmployees && (
                <Button
                  className="gap-2"
                  onClick={handleNewDiploma}
                  data-testid="button-new-diploma"
                >
                  <Plus className="w-4 h-4" /> Neues Diplom
                </Button>
              )}
            </div>

            <Card className="border-none shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[260px]">Diplom</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDiplomas.map((diploma) => (
                      <TableRow
                        key={diploma.id}
                        data-testid={`row-diploma-${diploma.id}`}
                      >
                        <TableCell className="font-medium">
                          {diploma.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {diploma.description || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {canManageEmployees ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditDiploma(diploma)}
                                data-testid={`button-edit-diploma-${diploma.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteDiploma(diploma.id)}
                                data-testid={`button-delete-diploma-${diploma.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={editDialogOpen} onOpenChange={handleEditDialogChange}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Mitarbeiter bearbeiten: {editingEmployee?.name}
              </DialogTitle>
            </DialogHeader>

            {editingEmployee && (
              <Tabs defaultValue="profile" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="profile">Profil</TabsTrigger>
                  <TabsTrigger value="roles">Rollen & Kompetenzen</TabsTrigger>
                  <TabsTrigger value="permissions">Berechtigungen</TabsTrigger>
                  <TabsTrigger value="security">Sicherheit</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="space-y-4 py-4">
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Titel</Label>
                        <Input
                          value={editFormData.title}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              title: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Vorname</Label>
                        <Input
                          value={editFormData.firstName}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              firstName: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Nachname</Label>
                        <Input
                          value={editFormData.lastName}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              lastName: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Geburtsdatum</Label>
                        <div className="flex items-center gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Kalender öffnen"
                              >
                                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="p-2">
                              <DatePickerCalendar
                                mode="single"
                                captionLayout="dropdown"
                                selected={
                                  editFormData.birthday
                                    ? new Date(
                                        `${editFormData.birthday}T00:00:00`,
                                      )
                                    : undefined
                                }
                                onSelect={(date) => {
                                  if (!date) return;
                                  const iso = formatBirthday(date);
                                  setEditFormData((prev) => ({
                                    ...prev,
                                    birthday: iso,
                                  }));
                                  setEditBirthdayInput(
                                    formatBirthdayDisplay(iso),
                                  );
                                }}
                                fromYear={1900}
                                toYear={new Date().getFullYear()}
                              />
                            </PopoverContent>
                          </Popover>
                          <Input
                            value={editBirthdayInput}
                            onChange={(e) =>
                              setEditBirthdayInput(e.target.value)
                            }
                            placeholder="TT.MM.JJJJ"
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>E-Mail (Dienst)</Label>
                        <Input
                          value={editFormData.email}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              email: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>E-Mail (privat)</Label>
                        <Input
                          value={editFormData.emailPrivate}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              emailPrivate: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Telefon (Dienst)</Label>
                        <Input
                          value={editFormData.phoneWork}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              phoneWork: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Telefon (privat)</Label>
                        <Input
                          value={editFormData.phonePrivate}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              phonePrivate: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Urlaubsanspruch (Tage)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={editFormData.vacationEntitlement}
                          onChange={(e) =>
                            setEditFormData((prev) => ({
                              ...prev,
                              vacationEntitlement: e.target.value,
                            }))
                          }
                          placeholder="z.B. 25"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border p-4">
                      <div>
                        <Label>Private Kontaktdaten sichtbar</Label>
                        <p className="text-xs text-muted-foreground">
                          Erlaubt das Anzeigen privater Telefonnummer/E-Mail
                        </p>
                      </div>
                      <Switch
                        checked={editFormData.showPrivateContact}
                        onCheckedChange={(checked) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            showPrivateContact: Boolean(checked),
                          }))
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="roles" className="space-y-4 py-4">
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Rolle</Label>
                        <Select
                          value={editRoleValue}
                          onValueChange={(value) =>
                            setEditRoleValue(value as Employee["role"])
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Rolle wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>App-Rolle</Label>
                        <Select
                          value={editAppRoleValue}
                          onValueChange={(value) =>
                            setEditAppRoleValue(value as Employee["appRole"])
                          }
                        >
                          <SelectTrigger data-testid="select-app-role">
                            <SelectValue placeholder="App-Rolle wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {APP_ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border p-4">
                      <div>
                        <Label>Dienstplan berücksichtigen</Label>
                        <p className="text-xs text-muted-foreground">
                          Wenn deaktiviert, wird die Person im Dienstplan nicht
                          eingeplant.
                        </p>
                      </div>
                      <Switch
                        checked={editTakesShifts}
                        onCheckedChange={(checked) =>
                          setEditTakesShifts(Boolean(checked))
                        }
                        disabled={!canManageEmployees}
                      />
                    </div>

                    <div className="space-y-3 rounded-lg border border-border p-4">
                      <div>
                        <Label>Einsetzbar für (Abweichung)</Label>
                        <p className="text-xs text-muted-foreground">
                          Nur bei Abweichungen vom Standard nach Rolle setzen.
                          Leer lassen = Standard.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editSelectedServiceTypeLabels.length ? (
                          editSelectedServiceTypeLabels.map((service) => (
                            <Badge
                              key={service.id}
                              variant="secondary"
                              className="flex items-center gap-1"
                            >
                              <span>{service.label}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  toggleEditServiceType(service.id)
                                }
                                className="ml-1 text-muted-foreground hover:text-foreground"
                                aria-label={`Einsetzbarkeit entfernen: ${service.label}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Standard nach Rolle
                          </p>
                        )}
                      </div>
                      <div className="grid gap-2 md:grid-cols-3">
                        {selectableServiceLines.map((line) => (
                          <div
                            key={line.key}
                            className="flex items-center gap-2"
                          >
                            <Checkbox
                              id={`edit-service-${line.key}`}
                              checked={editServiceTypeOverrides.includes(
                                line.key,
                              )}
                              onCheckedChange={() =>
                                toggleEditServiceType(line.key)
                              }
                              disabled={!canManageEmployees}
                            />
                            <Label
                              htmlFor={`edit-service-${line.key}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {line.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label>Befristete Anwesenheit</Label>
                          <p className="text-xs text-muted-foreground">
                            Für Turnusärzt:innen: Zugang und Rechte sind nur im definierten Zeitraum aktiv.
                            Nach Ablauf wird der Benutzer automatisch archiviert und kann sich nicht mehr anmelden.
                          </p>
                        </div>

                        <Switch
                          checked={editLimitedPresenceEnabled}
                          onCheckedChange={(checked) => {
                            const enabled = Boolean(checked);
                            setEditLimitedPresenceEnabled(enabled);
                            if (!enabled) {
                              setEditEmploymentFrom("");
                              setEditEmploymentUntil("");
                            }
                          }}
                          disabled={!canManageEmployees}
                        />
                      </div>

                      {editLimitedPresenceEnabled && (
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Von</Label>
                            <Input
                              type="date"
                              value={editEmploymentFrom}
                              onChange={(e) => setEditEmploymentFrom(e.target.value)}
                              disabled={!canManageEmployees}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Bis</Label>
                            <Input
                              type="date"
                              value={editEmploymentUntil}
                              onChange={(e) => setEditEmploymentUntil(e.target.value)}
                              disabled={!canManageEmployees}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 rounded-lg border border-border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label>Langzeit-Deaktivierung</Label>
                          <p className="text-xs text-muted-foreground">
                            Von/Bis - in diesem Zeitraum nicht fuer Dienst- und
                            Wochenplan berücksichtigen.
                          </p>
                        </div>
                        <Switch
                          checked={editInactiveEnabled}
                          onCheckedChange={(checked) => {
                            const enabled = Boolean(checked);
                            setEditInactiveEnabled(enabled);
                            if (!enabled) {
                              setEditInactiveFrom("");
                              setEditInactiveUntil("");
                              setEditInactiveReason("");
                            }
                          }}
                          disabled={!canManageEmployees}
                        />
                      </div>

                      {editInactiveEnabled && (
                        <>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Von</Label>
                              <Input
                                type="date"
                                value={editInactiveFrom}
                                onChange={(e) =>
                                  setEditInactiveFrom(e.target.value)
                                }
                                disabled={!canManageEmployees}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Bis</Label>
                              <Input
                                type="date"
                                value={editInactiveUntil}
                                onChange={(e) =>
                                  setEditInactiveUntil(e.target.value)
                                }
                                disabled={!canManageEmployees}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Label>Begruendung</Label>
                              {editInactiveReason.trim() && (
                                <Badge
                                  variant="secondary"
                                  className="max-w-[280px] truncate"
                                >
                                  {editInactiveReason.trim()}
                                </Badge>
                              )}
                            </div>
                            <Textarea
                              value={editInactiveReason}
                              onChange={(e) =>
                                setEditInactiveReason(e.target.value)
                              }
                              placeholder="z.B. Papamonat, Elternkarenz"
                              rows={2}
                              disabled={!canManageEmployees}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Kompetenzen</Label>
                      <div className="flex flex-wrap gap-2">
                        {editSelectedCompetencyLabels.length ? (
                          editSelectedCompetencyLabels.map((comp) => (
                            <Badge
                              key={comp.id}
                              variant="secondary"
                              className="flex items-center gap-1"
                            >
                              <span>{comp.label}</span>
                              <button
                                type="button"
                                onClick={() => toggleEditCompetency(comp.id)}
                                className="ml-1 text-muted-foreground hover:text-foreground"
                                aria-label={`Kompetenz entfernen: ${comp.label}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Keine Kompetenzen ausgewählt
                          </p>
                        )}
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline">
                            Kompetenzen auswählen
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80">
                          <div className="space-y-2">
                            <Input
                              value={competencySearch}
                              onChange={(e) =>
                                setCompetencySearch(e.target.value)
                              }
                              placeholder="Kompetenz suchen..."
                            />
                            <div className="max-h-56 overflow-y-auto space-y-2">
                              {filteredAvailableCompetencies.map((comp) => {
                                const checked = editCompetencyIds.includes(
                                  comp.id,
                                );
                                return (
                                  <div
                                    key={comp.id}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={`edit-competency-${comp.id}`}
                                      checked={checked}
                                      onCheckedChange={() =>
                                        toggleEditCompetency(comp.id)
                                      }
                                    />
                                    <Label
                                      htmlFor={`edit-competency-${comp.id}`}
                                      className="text-sm font-normal cursor-pointer"
                                    >
                                      {comp.code
                                        ? `${comp.code} - ${comp.name}`
                                        : comp.name}
                                    </Label>
                                  </div>
                                );
                              })}
                              {!filteredAvailableCompetencies.length && (
                                <p className="text-sm text-muted-foreground">
                                  Keine Kompetenzen gefunden
                                </p>
                              )}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Diplome</Label>
                      <div className="flex flex-wrap gap-2">
                        {editSelectedDiplomaLabels.length ? (
                          editSelectedDiplomaLabels.map((diploma) => (
                            <Badge
                              key={diploma.id}
                              variant="secondary"
                              className="flex items-center gap-1"
                            >
                              <span>{diploma.label}</span>
                              <button
                                type="button"
                                onClick={() => toggleEditDiploma(diploma.id)}
                                className="ml-1 text-muted-foreground hover:text-foreground"
                                aria-label={`Diplom entfernen: ${diploma.label}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Keine Diplome ausgewählt
                          </p>
                        )}
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline">
                            Diplome auswählen
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80">
                          <div className="space-y-2">
                            <Input
                              value={diplomaSearch}
                              onChange={(e) => setDiplomaSearch(e.target.value)}
                              placeholder="Diplom suchen..."
                            />
                            <div className="max-h-56 overflow-y-auto space-y-2">
                              {filteredAvailableDiplomas.map((diploma) => {
                                const checked = editDiplomaIds.includes(
                                  diploma.id,
                                );
                                return (
                                  <div
                                    key={diploma.id}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={`edit-diploma-${diploma.id}`}
                                      checked={checked}
                                      onCheckedChange={() =>
                                        toggleEditDiploma(diploma.id)
                                      }
                                    />
                                    <Label
                                      htmlFor={`edit-diploma-${diploma.id}`}
                                      className="text-sm font-normal cursor-pointer"
                                    >
                                      {diploma.name}
                                    </Label>
                                  </div>
                                );
                              })}
                              {!filteredAvailableDiplomas.length && (
                                <p className="text-sm text-muted-foreground">
                                  Keine Diplome gefunden
                                </p>
                              )}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Einsatzbereiche (Arbeitsplätze)</Label>
                      <div className="flex flex-wrap gap-2">
                        {editSelectedRoomLabels.length ? (
                          editSelectedRoomLabels.map((room) => (
                            <Badge
                              key={room.id}
                              variant="secondary"
                              className="flex items-center gap-1"
                            >
                              <span>{room.label}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  toggleEditDeploymentRoom(room.id)
                                }
                                className="ml-1 text-muted-foreground hover:text-foreground"
                                aria-label={`Einsatzbereich entfernen: ${room.label}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Keine Einsatzbereiche ausgewählt
                          </p>
                        )}
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline">
                            Einsatzbereiche auswählen
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80">
                          <div className="space-y-2">
                            <Input
                              value={roomSearch}
                              onChange={(e) => setRoomSearch(e.target.value)}
                              placeholder="Arbeitsplätze suchen..."
                            />
                            <div className="max-h-56 overflow-y-auto space-y-2">
                              {filteredRooms.map((room) => {
                                const checked = editDeploymentRoomIds.includes(
                                  room.id,
                                );
                                return (
                                  <div
                                    key={room.id}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={`edit-room-${room.id}`}
                                      checked={checked}
                                      onCheckedChange={() =>
                                        toggleEditDeploymentRoom(room.id)
                                      }
                                    />
                                    <Label
                                      htmlFor={`edit-room-${room.id}`}
                                      className="text-sm font-normal cursor-pointer"
                                    >
                                      {room.name}
                                    </Label>
                                  </div>
                                );
                              })}
                              {!filteredRooms.length && (
                                <p className="text-sm text-muted-foreground">
                                  Keine Arbeitsplätze gefunden
                                </p>
                              )}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="permissions" className="space-y-4 py-4">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Berechtigungen gelten pro Abteilung und steuern
                      Detailrechte in der Verwaltung.
                    </p>
                    <div className="flex items-center justify-between rounded-lg border border-border p-4">
                      <div>
                        <Label>Kann Überdienst machen</Label>
                        <p className="text-xs text-muted-foreground">
                          Nur Mitarbeiter mit dieser Freigabe können im
                          Überdienst eingetragen werden.
                        </p>
                      </div>
                      <Switch
                        checked={editCanOverduty}
                        onCheckedChange={(checked) =>
                          setEditCanOverduty(Boolean(checked))
                        }
                        disabled={!canManageEmployees}
                      />
                    </div>
                    {canManageEmployees && (
                      <div className="space-y-3 rounded-lg border border-border p-4">
                        <div>
                          <Label>Urlaubsplan-Sichtbarkeit</Label>
                          <p className="text-xs text-muted-foreground">
                            Legt fest, welche Rollen im Urlaubsplan sichtbar
                            sind.
                          </p>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {DEFAULT_VISIBILITY_GROUPS.map((group) => (
                            <div
                              key={group}
                              className="flex items-center gap-2"
                            >
                              <Checkbox
                                id={`edit-vacation-visibility-${group}`}
                                checked={editVacationVisibilityGroups.includes(
                                  group,
                                )}
                                onCheckedChange={() =>
                                  toggleEditVacationVisibilityGroup(group)
                                }
                              />
                              <Label
                                htmlFor={`edit-vacation-visibility-${group}`}
                                className="text-sm font-normal cursor-pointer"
                              >
                                {VISIBILITY_GROUP_LABELS[group]}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {loadingPermissions ? (
                      <div className="flex items-center justify-center py-6 text-muted-foreground">
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Berechtigungen werden geladen...
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {permissionOptions.map((perm) => (
                          <div
                            key={perm.key}
                            className="flex items-center justify-between rounded-lg border border-border p-3"
                          >
                            <Label
                              htmlFor={`perm-${perm.key}`}
                              className="text-sm font-normal flex-1"
                            >
                              {perm.label}
                            </Label>
                            <Switch
                              id={`perm-${perm.key}`}
                              checked={userPermissions.includes(perm.key)}
                              onCheckedChange={(checked) =>
                                updatePermission(perm.key, Boolean(checked))
                              }
                              disabled={!isTechnicalAdmin}
                            />
                          </div>
                        ))}
                        {!permissionOptions.length && (
                          <p className="text-sm text-muted-foreground">
                            Keine Berechtigungen verfügbar
                          </p>
                        )}
                      </div>
                    )}
                    {!isTechnicalAdmin && (
                      <div className="text-xs text-muted-foreground">
                        Nur System-Admins können Berechtigungen bearbeiten.
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="security" className="space-y-4 py-4">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Passwort zurücksetzen ohne aktuelles Passwort.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Neues Passwort</Label>
                      <Input
                        type="password"
                        value={resetPasswordData.newPassword}
                        onChange={(e) =>
                          setResetPasswordData((prev) => ({
                            ...prev,
                            newPassword: e.target.value,
                          }))
                        }
                        placeholder="Mindestens 6 Zeichen"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Passwort bestätigen</Label>
                      <Input
                        type="password"
                        value={resetPasswordData.confirmPassword}
                        onChange={(e) =>
                          setResetPasswordData((prev) => ({
                            ...prev,
                            confirmPassword: e.target.value,
                          }))
                        }
                        placeholder="Passwort bestätigen"
                      />
                    </div>
                    <div>
                      <Button
                        onClick={handleResetPassword}
                        disabled={resettingPassword}
                      >
                        {resettingPassword && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Passwort zurücksetzen
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            <DialogFooter>
              {canManageEmployees && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteEmployee}
                  disabled={saving}
                  className="mr-auto"
                  data-testid="button-delete-employee"
                >
                  Löschen
                </Button>
              )}
              <DialogClose asChild>
                <Button variant="outline">Abbrechen</Button>
              </DialogClose>
              <Button
                onClick={handleSaveEmployee}
                disabled={saving}
                data-testid="button-save-employee"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={competencyDialogOpen}
          onOpenChange={handleCompetencyDialogChange}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingCompetency?.name
                  ? "Kompetenz bearbeiten"
                  : "Neue Kompetenz"}
              </DialogTitle>
            </DialogHeader>

            {editingCompetency && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Kompetenzname *</Label>
                  <Input
                    value={editingCompetency.name || ""}
                    onChange={(e) =>
                      setEditingCompetency({
                        ...editingCompetency,
                        name: e.target.value,
                      })
                    }
                    placeholder="z.B. Senior Mamma Surgeon"
                    data-testid="input-competency-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Badge-Kürzel * (einzigartig)</Label>
                  <Input
                    value={(editingCompetency.code || "").toUpperCase()}
                    onChange={(e) =>
                      setEditingCompetency({
                        ...editingCompetency,
                        code: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="z.B. SMS"
                    maxLength={4}
                    className="font-mono uppercase"
                    data-testid="input-competency-badge"
                  />
                  <p className="text-xs text-muted-foreground">
                    Max. 4 Zeichen
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Beschreibung</Label>
                  <Textarea
                    value={editingCompetency.description || ""}
                    onChange={(e) =>
                      setEditingCompetency({
                        ...editingCompetency,
                        description: e.target.value,
                      })
                    }
                    placeholder="Kurze Beschreibung der Kompetenz..."
                    rows={2}
                    data-testid="input-competency-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Zugeordnete Arbeitsplätze</Label>
                  <div className="flex flex-wrap gap-2">
                    {(editingCompetency.id
                      ? competencyAssignments[editingCompetency.id] || []
                      : []
                    ).map((assignment, index) => (
                      <Badge
                        key={`${assignment.roomName}-${index}`}
                        variant="outline"
                        className="text-xs"
                      >
                        <Building className="w-3 h-3 mr-1" />
                        {assignment.roomName}
                        {assignment.weekdays.length
                          ? ` (${assignment.weekdays.join(", ")})`
                          : ""}
                      </Badge>
                    ))}
                    {editingCompetency.id &&
                      !(competencyAssignments[editingCompetency.id] || [])
                        .length && (
                        <p className="text-sm text-muted-foreground">
                          Keine Arbeitsplätze zugeordnet
                        </p>
                      )}
                    {!editingCompetency.id && (
                      <p className="text-sm text-muted-foreground">
                        Nach dem Speichern sichtbar
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Vorausgesetzte Diplome</Label>
                  <div className="flex flex-wrap gap-2">
                    {competencyDiplomaIds.length ? (
                      competencyDiplomaIds.map((id) => (
                        <Badge
                          key={id}
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          <span>{getDiplomaLabel(id)}</span>
                          <button
                            type="button"
                            onClick={() => toggleCompetencyDiploma(id)}
                            className="ml-1 text-muted-foreground hover:text-foreground"
                            aria-label={`Diplom entfernen: ${getDiplomaLabel(id)}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Keine Diplome ausgewählt
                      </p>
                    )}
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline">
                        Diplome auswählen
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80">
                      <div className="space-y-2">
                        <Input
                          value={competencyDiplomaSearch}
                          onChange={(e) =>
                            setCompetencyDiplomaSearch(e.target.value)
                          }
                          placeholder="Diplom suchen..."
                        />
                        <div className="max-h-56 overflow-y-auto space-y-2">
                          {filteredCompetencyDiplomas.map((diploma) => {
                            const checked = competencyDiplomaIds.includes(
                              diploma.id,
                            );
                            return (
                              <div
                                key={diploma.id}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  id={`competency-diploma-${diploma.id}`}
                                  checked={checked}
                                  onCheckedChange={() =>
                                    toggleCompetencyDiploma(diploma.id)
                                  }
                                />
                                <Label
                                  htmlFor={`competency-diploma-${diploma.id}`}
                                  className="text-sm font-normal cursor-pointer"
                                >
                                  {diploma.name}
                                </Label>
                              </div>
                            );
                          })}
                          {!filteredCompetencyDiplomas.length && (
                            <p className="text-sm text-muted-foreground">
                              Keine Diplome gefunden
                            </p>
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Voraussetzungen</Label>
                  <Textarea
                    value={editingCompetency.prerequisites || ""}
                    onChange={(e) =>
                      setEditingCompetency({
                        ...editingCompetency,
                        prerequisites: e.target.value,
                      })
                    }
                    placeholder="z.B. 10+ Jahre Erfahrung, Dysplasiediplom..."
                    rows={2}
                    data-testid="input-competency-requirements"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              {editingCompetency?.id && canManageEmployees && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteEditingCompetency}
                  disabled={saving}
                  className="mr-auto"
                  data-testid="button-delete-competency"
                >
                  Löschen
                </Button>
              )}
              <DialogClose asChild>
                <Button variant="outline">Abbrechen</Button>
              </DialogClose>
              <Button
                onClick={handleSaveCompetency}
                disabled={saving}
                data-testid="button-save-competency"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={diplomaDialogOpen}
          onOpenChange={handleDiplomaDialogChange}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingDiploma?.name ? "Diplom bearbeiten" : "Neues Diplom"}
              </DialogTitle>
            </DialogHeader>

            {editingDiploma && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Diplomname *</Label>
                  <Input
                    value={editingDiploma.name || ""}
                    onChange={(e) =>
                      setEditingDiploma({
                        ...editingDiploma,
                        name: e.target.value,
                      })
                    }
                    placeholder="z.B. ÖGUM II"
                    data-testid="input-diploma-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Beschreibung</Label>
                  <Textarea
                    value={editingDiploma.description || ""}
                    onChange={(e) =>
                      setEditingDiploma({
                        ...editingDiploma,
                        description: e.target.value,
                      })
                    }
                    placeholder="Kurze Beschreibung des Diploms..."
                    rows={2}
                    data-testid="input-diploma-description"
                  />
                </div>
                {canManageEmployees && (
                  <div className="space-y-2">
                    <Label>Benutzer zuordnen</Label>
                    <Input
                      value={diplomaEmployeeSearch}
                      onChange={(e) => setDiplomaEmployeeSearch(e.target.value)}
                      placeholder="Benutzer suchen..."
                    />
                    <div className="max-h-56 overflow-y-auto space-y-2 rounded-md border border-border p-2">
                      {filteredDiplomaEmployees.map((emp) => {
                        const checked = diplomaEmployeeIds.includes(emp.id);
                        return (
                          <div key={emp.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`diploma-employee-${emp.id}`}
                              checked={checked}
                              onCheckedChange={() =>
                                toggleDiplomaEmployee(emp.id)
                              }
                            />
                            <Label
                              htmlFor={`diploma-employee-${emp.id}`}
                              className="text-sm font-normal cursor-pointer flex-1"
                            >
                              {emp.name}
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              {getRoleLabel(emp.role)}
                            </span>
                          </div>
                        );
                      })}
                      {!filteredDiplomaEmployees.length && (
                        <p className="text-sm text-muted-foreground">
                          Keine Benutzer gefunden
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Zugeordnete Diplome erscheinen automatisch in den
                      Benutzereinstellungen.
                    </p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {editingDiploma?.id && canManageEmployees && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteEditingDiploma}
                  disabled={saving}
                  className="mr-auto"
                  data-testid="button-delete-diploma"
                >
                  Löschen
                </Button>
              )}
              <DialogClose asChild>
                <Button variant="outline">Abbrechen</Button>
              </DialogClose>
              <Button
                onClick={handleSaveDiploma}
                disabled={saving}
                data-testid="button-save-diploma"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
