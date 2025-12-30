import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";
import { 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Shield, 
  Save,
  Loader2,
  AlertCircle,
  GraduationCap,
  Briefcase,
  Calendar as CalendarIcon,
  Tag,
  X
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { employeeApi, competencyApi, roomApi, diplomaApi, longTermWishesApi, longTermAbsencesApi, serviceLinesApi } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import type { Employee, Competency, Resource, Diploma, LongTermShiftWish, LongTermAbsence, ServiceLine } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { OVERDUTY_KEY, employeeDoesShifts, getServiceTypesForRole, type LongTermWishRule } from "@shared/shiftTypes";

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

function formatBirthdayDisplay(value: string | Date | null | undefined): string {
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

function parseVacationEntitlementInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value: string) =>
  EMAIL_REGEX.test(value) && !/[^\x00-\x7F]/.test(value);

const ROLE_LABELS: Record<string, string> = {
  "Primararzt": "Primararzt:in",
  "1. Oberarzt": "1. Oberarzt:in",
  "Funktionsoberarzt": "Funktionsoberarzt:in",
  "Ausbildungsoberarzt": "Ausbildungsoberarzt:in",
  "Oberarzt": "Oberarzt:in",
  "Oberärztin": "Oberarzt:in",
  "Facharzt": "Facharzt:in",
  "Assistenzarzt": "Assistenzarzt:in",
  "Assistenzärztin": "Assistenzarzt:in",
  "Turnusarzt": "Turnusarzt:in",
  "Student (KPJ)": "Student:in (KPJ)",
  "Student (Famulant)": "Student:in (Famulant)",
  "Sekretariat": "Sekretariat"
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
  "Primararzt": 1,
  "1. Oberarzt": 2,
  "Funktionsoberarzt": 3,
  "Ausbildungsoberarzt": 4,
  "Oberarzt": 5,
  "Oberärztin": 5,
  "Facharzt": 6,
  "Assistenzarzt": 7,
  "Assistenzärztin": 7,
  "Turnusarzt": 8,
  "Student (KPJ)": 9,
  "Student (Famulant)": 9,
  "Sekretariat": 10
};

const normalizeRoleValue = (role?: string | null): Employee["role"] | "" => {
  if (!role) return "";
  if (role === "Oberärztin") return "Oberarzt";
  if (role === "Assistenzärztin") return "Assistenzarzt";
  return role as Employee["role"];
};

const getRoleLabel = (role?: string | null) => {
  if (!role) return "";
  return ROLE_LABELS[role] || role;
};

const getRoleSortRank = (role?: string | null) => {
  const normalized = normalizeRoleValue(role);
  return ROLE_SORT_ORDER[normalized] ?? 999;
};

type ServiceType = string;

const FALLBACK_SERVICE_LINES: Array<Pick<ServiceLine, "key" | "label" | "roleGroup" | "sortOrder" | "isActive">> = [
  { key: "kreiszimmer", label: "Kreißzimmer", roleGroup: "ASS", sortOrder: 1, isActive: true },
  { key: "gyn", label: "Gyn-Dienst", roleGroup: "OA", sortOrder: 2, isActive: true },
  { key: "turnus", label: "Turnus", roleGroup: "TURNUS", sortOrder: 3, isActive: true },
  { key: "overduty", label: "Überdienst", roleGroup: "OA", sortOrder: 4, isActive: true }
];

const buildServiceLineDisplay = (
  lines: ServiceLine[],
  includeKeys: Set<string>
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
      isActive: true
    }));
  const allLines = [...source, ...extras];
  return allLines
    .filter((line) => line.isActive !== false || includeKeys.has(line.key))
    .sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (order !== 0) return order;
      return a.label.localeCompare(b.label);
    })
    .map((line) => ({
      key: line.key,
      label: line.label,
      roleGroup: line.roleGroup || "ALL",
      isActive: line.isActive !== false
    }));
};

const LONG_TERM_RULE_KINDS = [
  { value: "ALWAYS_OFF", label: "Immer frei" },
  { value: "PREFER_ON", label: "Bevorzugt" },
  { value: "AVOID_ON", label: "Vermeiden" }
];

const LONG_TERM_RULE_STRENGTHS = [
  { value: "SOFT", label: "Weich" },
  { value: "HARD", label: "Hart" }
];

const LONG_TERM_WEEKDAYS = [
  { value: "Mon", label: "Mo" },
  { value: "Tue", label: "Di" },
  { value: "Wed", label: "Mi" },
  { value: "Thu", label: "Do" },
  { value: "Fri", label: "Fr" },
  { value: "Sat", label: "Sa" },
  { value: "Sun", label: "So" }
];

const LONG_TERM_BASE_OPTION = { value: "any", label: "Alle Dienstschienen" };

const LONG_TERM_STATUS_LABELS: Record<string, string> = {
  Entwurf: "Entwurf",
  Eingereicht: "Eingereicht",
  Genehmigt: "Genehmigt",
  Abgelehnt: "Abgelehnt"
};

interface ShiftPreferences {
  deploymentRoomIds?: number[];
  serviceTypeOverrides?: ServiceType[];
}

type LongTermAbsenceDraft = {
  id?: number;
  localId: string;
  employeeId: number;
  startDate: string;
  endDate: string;
  reason: string;
  status: LongTermAbsence["status"];
  submittedAt?: string | null;
  approvedAt?: string | null;
  approvedById?: number | null;
  approvalNotes?: string | null;
};

function parseInactiveDate(value: string): string | null {
  if (!value.trim()) return "";
  return parseBirthdayInput(value);
}

const buildLongTermAbsenceDraft = (absence: LongTermAbsence): LongTermAbsenceDraft => ({
  localId: String(absence.id),
  id: absence.id,
  employeeId: absence.employeeId,
  startDate: formatBirthday(absence.startDate),
  endDate: formatBirthday(absence.endDate),
  reason: absence.reason || "",
  status: absence.status || "Entwurf",
  submittedAt: absence.submittedAt ? String(absence.submittedAt) : null,
  approvedAt: absence.approvedAt ? String(absence.approvedAt) : null,
  approvedById: absence.approvedById ?? null,
  approvalNotes: absence.approvalNotes || null
});

export default function Settings() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { employee: currentUser, user, isAdmin, isTechnicalAdmin, capabilities } = useAuth();

  const APP_ROLE_OPTIONS: Employee["appRole"][] = ["Admin", "Editor", "User"];

  const PERMISSION_FALLBACK = [
    { key: "users.manage", label: "Kann Benutzer anlegen / verwalten" },
    { key: "dutyplan.edit", label: "Kann Dienstplan bearbeiten" },
    { key: "dutyplan.publish", label: "Kann Dienstplan freigeben" },
    { key: "vacation.lock", label: "Kann Urlaubsplanung bearbeiten (Sperrzeitraum)" },
    { key: "vacation.approve", label: "Kann Urlaub freigeben" },
    { key: "absence.create", label: "Kann Abwesenheiten eintragen" },
    { key: "sop.approve", label: "Kann SOPs freigeben" },
    { key: "project.close", label: "Kann Projekte abschliessen" },
    { key: "training.edit", label: "Kann Ausbildungsplan bearbeiten" }
  ];
  
  const viewingUserId = params.userId
    ? parseInt(params.userId)
    : user?.employeeId || currentUser?.id || 0;
  
  const isViewingOwnProfile = currentUser
    ? viewingUserId === currentUser.id
    : user
    ? viewingUserId === user.employeeId
    : false;
  const canEditBasicInfo = isViewingOwnProfile || isAdmin;
  const canEditPrivateInfo = isAdmin;
  const canEditRoleAndCompetencies = isAdmin;
  const canEditVacationEntitlement = isAdmin || isTechnicalAdmin;
  const canEditDiplomas = isViewingOwnProfile || isAdmin;
  const canChangePassword = isViewingOwnProfile;
  const canApproveLongTerm =
    isTechnicalAdmin ||
    currentUser?.appRole === "Admin" ||
    currentUser?.role === "Primararzt" ||
    currentUser?.role === "1. Oberarzt";
  
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isBadgeDialogOpen, setIsBadgeDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    firstName: '',
    lastName: '',
    birthday: '',
    email: '',
    emailPrivate: '',
    phoneWork: '',
    phonePrivate: '',
    showPrivateContact: false,
    badge: '',
    vacationEntitlement: ''
  });
  const [birthdayInput, setBirthdayInput] = useState("");
  const [roleValue, setRoleValue] = useState<Employee["role"] | "">("");
  const [appRoleValue, setAppRoleValue] = useState<Employee["appRole"] | "">("");
  const [takesShifts, setTakesShifts] = useState(true);
  const [canOverduty, setCanOverduty] = useState(false);
  const [availableCompetencies, setAvailableCompetencies] = useState<Competency[]>([]);
  const [selectedCompetencyIds, setSelectedCompetencyIds] = useState<number[]>([]);
  const [competencySearch, setCompetencySearch] = useState("");
  const [availableDiplomas, setAvailableDiplomas] = useState<Diploma[]>([]);
  const [selectedDiplomaIds, setSelectedDiplomaIds] = useState<number[]>([]);
  const [diplomaSearch, setDiplomaSearch] = useState("");
  const [availableRooms, setAvailableRooms] = useState<Resource[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [deploymentRoomIds, setDeploymentRoomIds] = useState<number[]>([]);
  const [serviceTypeOverrides, setServiceTypeOverrides] = useState<ServiceType[]>([]);
  const [roomSearch, setRoomSearch] = useState("");
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [newBadge, setNewBadge] = useState('');
  const [availablePermissions, setAvailablePermissions] = useState<Array<{ key: string; label: string; scope?: string }>>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [longTermWish, setLongTermWish] = useState<LongTermShiftWish | null>(null);
  const [longTermRules, setLongTermRules] = useState<LongTermWishRule[]>([]);
  const [longTermNotes, setLongTermNotes] = useState("");
  const [longTermSaving, setLongTermSaving] = useState(false);
  const [longTermDecisionNotes, setLongTermDecisionNotes] = useState("");
  const [longTermAbsences, setLongTermAbsences] = useState<LongTermAbsenceDraft[]>([]);
  const [longTermAbsenceDecisionNotes, setLongTermAbsenceDecisionNotes] = useState<Record<string, string>>({});
  const [longTermAbsenceSavingIds, setLongTermAbsenceSavingIds] = useState<string[]>([]);

  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [viewingUserId]);

  useEffect(() => {
    if (isTechnicalAdmin) {
      loadPermissions();
    } else {
      setAvailablePermissions(PERMISSION_FALLBACK);
      setSelectedPermissions(capabilities || []);
    }
  }, [viewingUserId, isTechnicalAdmin, capabilities]);

  const serviceLineIncludeKeys = useMemo(() => {
    const keys = new Set<string>();
    serviceTypeOverrides.forEach((key) => keys.add(key));
    longTermRules.forEach((rule) => {
      if (rule.serviceType && rule.serviceType !== "any") {
        keys.add(rule.serviceType);
      }
    });
    return keys;
  }, [serviceTypeOverrides, longTermRules]);

  const serviceLineDisplay = useMemo(
    () => buildServiceLineDisplay(serviceLines, serviceLineIncludeKeys),
    [serviceLines, serviceLineIncludeKeys]
  );
  const serviceLineLookup = useMemo(
    () => new Map(serviceLineDisplay.map((line) => [line.key, line])),
    [serviceLineDisplay]
  );
  const serviceLineKeySet = useMemo(
    () => new Set(serviceLineDisplay.map((line) => line.key)),
    [serviceLineDisplay]
  );
  const selectableServiceLines = useMemo(
    () => serviceLineDisplay.filter((line) => line.key !== OVERDUTY_KEY),
    [serviceLineDisplay]
  );
  const serviceLineMeta = useMemo(
    () => serviceLineDisplay.map((line) => ({ key: line.key, roleGroup: line.roleGroup, label: line.label })),
    [serviceLineDisplay]
  );
  const longTermServiceOptions = useMemo(() => {
    return [
      LONG_TERM_BASE_OPTION,
      ...selectableServiceLines.map((line) => ({ value: line.key, label: line.label }))
    ];
  }, [selectableServiceLines]);

  const selectedCompetencyLabels = selectedCompetencyIds.map((id) => {
    const match = availableCompetencies.find((comp) => comp.id === id);
    return { id, label: match?.name || `Kompetenz ${id}` };
  });
  const filteredCompetencies = availableCompetencies.filter((comp) => {
    const query = competencySearch.trim().toLowerCase();
    if (!query) return true;
    return (
      comp.name.toLowerCase().includes(query) ||
      (comp.code || "").toLowerCase().includes(query)
    );
  });
  const selectedDiplomaLabels = selectedDiplomaIds.map((id) => {
    const match = availableDiplomas.find((diploma) => diploma.id === id);
    return { id, label: match?.name || `Diplom ${id}` };
  });
  const filteredDiplomas = availableDiplomas.filter((diploma) => {
    const query = diplomaSearch.trim().toLowerCase();
    if (!query) return true;
    return diploma.name.toLowerCase().includes(query);
  });
  const selectedRoomLabels = deploymentRoomIds.map((id) => {
    const match = availableRooms.find((room) => room.id === id);
    return { id, label: match?.name || `Arbeitsplatz ${id}` };
  });
  const selectedServiceTypeLabels = serviceTypeOverrides.map((type) => ({
    id: type,
    label: serviceLineLookup.get(type)?.label || type
  }));
  const defaultServiceTypeLabels = getServiceTypesForRole(roleValue || employee?.role, serviceLineMeta).map(
    (type) => serviceLineLookup.get(type)?.label || type
  );
  const filteredRooms = availableRooms.filter((room) => {
    const query = roomSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      room.name.toLowerCase().includes(query) ||
      (room.category || "").toLowerCase().includes(query)
    );
  });
  const permissionOptions = availablePermissions.length
    ? PERMISSION_FALLBACK.map(
        (fallback) => availablePermissions.find((perm) => perm.key === fallback.key) || fallback
      )
    : PERMISSION_FALLBACK;

  const sortedEmployees = useMemo(() => {
    return allEmployees
      .filter((emp) => emp.isActive)
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
  }, [allEmployees]);

  const applyEmployeeState = (emp: Employee) => {
    setEmployee(emp);
    const nameParts = emp.name.split(' ');
    const hasTitle = nameParts[0]?.includes('Dr.') || nameParts[0]?.includes('PD') || nameParts[0]?.includes('Prof.');
    const titleValue = emp.title?.trim() || (hasTitle ? nameParts.slice(0, nameParts.length > 2 ? 2 : 1).join(' ') : '');
    const birthdayIso = formatBirthday(emp.birthday);

    setFormData({
      title: titleValue,
      firstName: emp.firstName || '',
      lastName: emp.lastName || (hasTitle ? nameParts.slice(-1)[0] : nameParts.slice(-1)[0]) || '',
      birthday: birthdayIso,
      email: emp.email || '',
      emailPrivate: emp.emailPrivate || '',
      phoneWork: emp.phoneWork || '',
      phonePrivate: emp.phonePrivate || '',
      showPrivateContact: emp.showPrivateContact || false,
      badge: emp.lastName?.substring(0, 2).toUpperCase() || emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '',
      vacationEntitlement: emp.vacationEntitlement !== null && emp.vacationEntitlement !== undefined
        ? String(emp.vacationEntitlement)
        : ""
    });
    setBirthdayInput(formatBirthdayDisplay(birthdayIso || emp.birthday));
    setNewBadge(emp.lastName?.substring(0, 2).toUpperCase() || '');
    setRoleValue(normalizeRoleValue(emp.role));
    setAppRoleValue(emp.appRole || "");
    setTakesShifts(emp.takesShifts ?? true);
    setCanOverduty(emp.canOverduty ?? false);
    setSelectedCompetencyIds([]);
    const prefs = (emp.shiftPreferences as ShiftPreferences | null) || null;
    setDeploymentRoomIds(Array.isArray(prefs?.deploymentRoomIds) ? prefs.deploymentRoomIds : []);
    setServiceTypeOverrides(
      Array.isArray(prefs?.serviceTypeOverrides)
        ? prefs.serviceTypeOverrides.filter((value): value is ServiceType => typeof value === "string")
        : []
    );
  };

  const loadData = async () => {
    try {
      const [employees, competencies, rooms, diplomas, serviceLineData] = await Promise.all([
        employeeApi.getAll(),
        competencyApi.getAll(),
        roomApi.getAll(),
        diplomaApi.getAll(),
        serviceLinesApi.getAll().catch(() => [])
      ]);
      setAllEmployees(employees);
      setAvailableCompetencies(competencies.filter((comp) => comp.isActive !== false));
      setAvailableDiplomas(diplomas.filter((diploma) => diploma.isActive !== false));
      setAvailableRooms(rooms);
      setServiceLines(serviceLineData);
      
      const emp = employees.find(e => e.id === viewingUserId);
      if (emp) {
        applyEmployeeState(emp);
        try {
          const empCompetencies = await employeeApi.getCompetencies(emp.id);
          const ids = empCompetencies
            .map((comp) => comp.competencyId)
            .filter((id) => typeof id === "number");
          if (ids.length) {
            setSelectedCompetencyIds(ids);
          } else if (Array.isArray(emp.competencies) && competencies.length) {
            const fallbackIds = emp.competencies
              .map((name) => competencies.find((comp) => comp.name === name)?.id)
              .filter((id): id is number => typeof id === "number");
            setSelectedCompetencyIds(fallbackIds);
          }
        } catch {
          if (Array.isArray(emp.competencies) && competencies.length) {
            const fallbackIds = emp.competencies
              .map((name) => competencies.find((comp) => comp.name === name)?.id)
              .filter((id): id is number => typeof id === "number");
            setSelectedCompetencyIds(fallbackIds);
          }
        }

        try {
          const empDiplomas = await employeeApi.getDiplomas(emp.id);
          const ids = empDiplomas
            .map((diploma) => diploma.diplomaId)
            .filter((id) => typeof id === "number");
          if (ids.length) {
            setSelectedDiplomaIds(ids);
          } else if (Array.isArray(emp.diplomas) && diplomas.length) {
            const fallbackIds = emp.diplomas
              .map((name) => diplomas.find((diploma) => diploma.name === name)?.id)
              .filter((id): id is number => typeof id === "number");
            setSelectedDiplomaIds(fallbackIds);
          }
        } catch {
          if (Array.isArray(emp.diplomas) && diplomas.length) {
            const fallbackIds = emp.diplomas
              .map((name) => diplomas.find((diploma) => diploma.name === name)?.id)
              .filter((id): id is number => typeof id === "number");
            setSelectedDiplomaIds(fallbackIds);
          }
        }

        try {
          const wish = await longTermWishesApi.getByEmployee(emp.id);
          setLongTermWish(wish);
          setLongTermRules(Array.isArray(wish?.rules) ? wish?.rules : []);
          setLongTermNotes(wish?.notes || "");
          setLongTermDecisionNotes("");
        } catch {
          setLongTermWish(null);
          setLongTermRules([]);
          setLongTermNotes("");
          setLongTermDecisionNotes("");
        }

        try {
          const absences = await longTermAbsencesApi.getByEmployee(emp.id);
          const sorted = [...absences].sort((a, b) => a.startDate.localeCompare(b.startDate));
          setLongTermAbsences(sorted.map(buildLongTermAbsenceDraft));
          setLongTermAbsenceDecisionNotes({});
        } catch {
          setLongTermAbsences([]);
          setLongTermAbsenceDecisionNotes({});
        }
      }
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Daten konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async () => {
    setLoadingPermissions(true);
    try {
      const response = await apiRequest("GET", `/api/admin/users/${viewingUserId}/permissions`);
      const result = await response.json();
      if (result.success && result.data) {
        setAvailablePermissions(result.data.availablePermissions || PERMISSION_FALLBACK);
        setSelectedPermissions(result.data.permissions || []);
      } else {
        setAvailablePermissions(PERMISSION_FALLBACK);
        setSelectedPermissions([]);
      }
    } catch (error) {
      setAvailablePermissions(PERMISSION_FALLBACK);
      setSelectedPermissions([]);
      toast({
        title: "Fehler",
        description: "Berechtigungen konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoadingPermissions(false);
    }
  };

  const handleSavePermissions = async () => {
    if (!isTechnicalAdmin) return;
    if (!employee?.departmentId && !currentUser?.departmentId) {
      toast({
        title: "Fehler",
        description: "Keine Abteilung zugeordnet",
        variant: "destructive"
      });
      return;
    }

    setSavingPermissions(true);
    try {
      const departmentId = employee?.departmentId || currentUser?.departmentId;
      await apiRequest("PUT", `/api/admin/users/${viewingUserId}/permissions`, {
        departmentId,
        permissionKeys: selectedPermissions
      });
      toast({
        title: "Gespeichert",
        description: "Berechtigungen wurden aktualisiert"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Berechtigungen konnten nicht gespeichert werden",
        variant: "destructive"
      });
    } finally {
      setSavingPermissions(false);
    }
  };

  const updatePermission = (key: string, enabled: boolean) => {
    setSelectedPermissions((prev) => {
      if (enabled) {
        return prev.includes(key) ? prev : [...prev, key];
      }
      return prev.filter((perm) => perm !== key);
    });
  };

  const handleSave = async () => {
    if (!employee || (!canEditBasicInfo && !canEditRoleAndCompetencies)) return;
    
    setSaving(true);
    try {
      const payload: Partial<Omit<Employee, "id" | "createdAt">> = {};
      const parsedBirthday = parseBirthdayInput(birthdayInput);
      if (parsedBirthday === null) {
        toast({
          title: "Fehler",
          description: "Bitte ein gueltiges Geburtsdatum eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      const emailValue = formData.email.trim();
      if (!emailValue || !isValidEmail(emailValue)) {
        toast({
          title: "Fehler",
          description: "Bitte eine gueltige E-Mail-Adresse ohne Umlaute eingeben.",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      const emailPrivateValue = formData.emailPrivate.trim();
      if (emailPrivateValue && !isValidEmail(emailPrivateValue)) {
        toast({
          title: "Fehler",
          description: "Bitte eine gueltige private E-Mail-Adresse ohne Umlaute eingeben.",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      const parsedVacationEntitlement = parseVacationEntitlementInput(formData.vacationEntitlement);
      if (formData.vacationEntitlement.trim() && parsedVacationEntitlement === null) {
        toast({
          title: "Fehler",
          description: "Bitte einen gueltigen Urlaubsanspruch (Tage) eingeben.",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      // TODO: Backend schema needs title, birthday, badge fields before full persistence
      // Currently saving only fields supported by the existing API
      if (canEditBasicInfo) {
        Object.assign(payload, {
          title: formData.title || null,
          firstName: formData.firstName,
          lastName: formData.lastName,
          birthday: parsedBirthday || null,
          email: emailValue,
          emailPrivate: emailPrivateValue || null,
          phoneWork: formData.phoneWork,
          phonePrivate: formData.phonePrivate,
          showPrivateContact: formData.showPrivateContact,
        });
      }

      if (canEditRoleAndCompetencies) {
        const baseShiftPreferences = (employee.shiftPreferences && typeof employee.shiftPreferences === "object")
          ? (employee.shiftPreferences as ShiftPreferences)
          : {};
        const nextShiftPreferences: ShiftPreferences = {
          ...baseShiftPreferences,
          deploymentRoomIds: deploymentRoomIds
        };
        if (serviceTypeOverrides.length) {
          nextShiftPreferences.serviceTypeOverrides = serviceTypeOverrides;
        } else {
          delete (nextShiftPreferences as { serviceTypeOverrides?: ServiceType[] }).serviceTypeOverrides;
        }

        Object.assign(payload, {
          role: (roleValue || employee.role) as Employee["role"],
          appRole: (appRoleValue || employee.appRole) as Employee["appRole"],
          takesShifts,
          canOverduty,
          shiftPreferences: nextShiftPreferences
        });
      }

      if (canEditVacationEntitlement) {
        Object.assign(payload, {
          vacationEntitlement: parsedVacationEntitlement
        });
      }

      if (Object.keys(payload).length === 0) {
        setSaving(false);
        return;
      }

      const updated = Object.keys(payload).length
        ? await employeeApi.update(employee.id, payload)
        : null;

      if (canEditRoleAndCompetencies) {
        await employeeApi.updateCompetencies(employee.id, selectedCompetencyIds);
      }
      if (canEditDiplomas) {
        await employeeApi.updateDiplomas(employee.id, selectedDiplomaIds);
      }
      toast({
        title: "Gespeichert",
        description: "Ihre Einstellungen wurden aktualisiert"
      });
      if (updated) {
        applyEmployeeState(updated);
        setAllEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
      }
      loadData();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Änderungen konnten nicht gespeichert werden",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddLongTermRule = () => {
    setLongTermRules((prev) => [
      ...prev,
      { kind: "ALWAYS_OFF", weekday: "Mon", strength: "SOFT", serviceType: "any" }
    ]);
  };

  const handleUpdateLongTermRule = (index: number, patch: Partial<LongTermWishRule>) => {
    setLongTermRules((prev) =>
      prev.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule))
    );
  };

  const handleRemoveLongTermRule = (index: number) => {
    setLongTermRules((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveLongTermWish = async () => {
    if (!employee || !isViewingOwnProfile) return;
    setLongTermSaving(true);
    try {
      const status = longTermWish?.status === "Abgelehnt" ? "Entwurf" : longTermWish?.status || "Entwurf";
      const wish = await longTermWishesApi.save({
        employeeId: employee.id,
        rules: longTermRules,
        notes: longTermNotes || null,
        status
      });
      setLongTermWish(wish);
      toast({
        title: "Gespeichert",
        description: "Langfristige Dienstwünsche wurden aktualisiert"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Speichern fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setLongTermSaving(false);
    }
  };

  const handleSubmitLongTermWish = async () => {
    if (!employee || !isViewingOwnProfile) return;
    setLongTermSaving(true);
    try {
      let wish = longTermWish;
      if (!wish || wish.status === "Abgelehnt" || wish.status === "Entwurf") {
        wish = await longTermWishesApi.save({
          employeeId: employee.id,
          rules: longTermRules,
          notes: longTermNotes || null,
          status: "Entwurf"
        });
      }
      if (!wish) return;
      const submitted = await longTermWishesApi.submit(wish.id);
      setLongTermWish(submitted);
      toast({
        title: "Eingereicht",
        description: "Langfristige Wünsche wurden zur Freigabe eingereicht"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Einreichen fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setLongTermSaving(false);
    }
  };

  const handleApproveLongTermWish = async () => {
    if (!longTermWish) return;
    setLongTermSaving(true);
    try {
      const updated = await longTermWishesApi.approve(longTermWish.id, longTermDecisionNotes || undefined);
      setLongTermWish(updated);
      toast({
        title: "Genehmigt",
        description: "Langfristige Wünsche wurden freigegeben"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Freigabe fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setLongTermSaving(false);
    }
  };

  const handleRejectLongTermWish = async () => {
    if (!longTermWish) return;
    setLongTermSaving(true);
    try {
      const updated = await longTermWishesApi.reject(longTermWish.id, longTermDecisionNotes || undefined);
      setLongTermWish(updated);
      toast({
        title: "Abgelehnt",
        description: "Langfristige Wünsche wurden abgelehnt"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Ablehnung fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setLongTermSaving(false);
    }
  };

  const handleAddLongTermAbsence = () => {
    if (!employee) return;
    const localId = `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setLongTermAbsences((prev) => [
      ...prev,
      {
        localId,
        employeeId: employee.id,
        startDate: "",
        endDate: "",
        reason: "",
        status: "Entwurf"
      }
    ]);
  };

  const updateLongTermAbsenceDraft = (localId: string, patch: Partial<LongTermAbsenceDraft>) => {
    setLongTermAbsences((prev) =>
      prev.map((draft) => (draft.localId === localId ? { ...draft, ...patch } : draft))
    );
  };

  const setLongTermAbsenceSaving = (localId: string, saving: boolean) => {
    setLongTermAbsenceSavingIds((prev) => {
      if (saving) {
        if (prev.includes(localId)) return prev;
        return [...prev, localId];
      }
      return prev.filter((id) => id !== localId);
    });
  };

  const validateLongTermAbsenceDraft = (draft: LongTermAbsenceDraft) => {
    const parsedStart = parseInactiveDate(draft.startDate);
    if (parsedStart === null || !parsedStart) {
      toast({
        title: "Fehler",
        description: "Bitte ein gueltiges Startdatum eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive"
      });
      return null;
    }
    const parsedEnd = parseInactiveDate(draft.endDate);
    if (parsedEnd === null || !parsedEnd) {
      toast({
        title: "Fehler",
        description: "Bitte ein gueltiges Enddatum eingeben (TT.MM.JJJJ oder JJJJ-MM-TT).",
        variant: "destructive"
      });
      return null;
    }
    if (parsedStart > parsedEnd) {
      toast({
        title: "Fehler",
        description: "Das Enddatum muss nach dem Startdatum liegen.",
        variant: "destructive"
      });
      return null;
    }
    if (!draft.reason.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte eine Beschreibung der Abwesenheit angeben.",
        variant: "destructive"
      });
      return null;
    }
    return { startDate: parsedStart, endDate: parsedEnd, reason: draft.reason.trim() };
  };

  const handleSaveLongTermAbsence = async (draft: LongTermAbsenceDraft) => {
    if (!employee || !isViewingOwnProfile) return;
    const payload = validateLongTermAbsenceDraft(draft);
    if (!payload) return;
    setLongTermAbsenceSaving(draft.localId, true);
    try {
      const saved = draft.id
        ? await longTermAbsencesApi.update(draft.id, payload)
        : await longTermAbsencesApi.create({
            employeeId: employee.id,
            ...payload,
            status: "Entwurf"
          });
      updateLongTermAbsenceDraft(draft.localId, {
        ...buildLongTermAbsenceDraft(saved),
        localId: draft.localId
      });
      toast({
        title: "Gespeichert",
        description: "Langzeit-Abwesenheit wurde gespeichert"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Speichern fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setLongTermAbsenceSaving(draft.localId, false);
    }
  };

  const handleSubmitLongTermAbsence = async (draft: LongTermAbsenceDraft) => {
    if (!employee || !isViewingOwnProfile) return;
    const payload = validateLongTermAbsenceDraft(draft);
    if (!payload) return;
    setLongTermAbsenceSaving(draft.localId, true);
    try {
      let target = draft;
      if (!draft.id || draft.status === "Abgelehnt" || draft.status === "Entwurf") {
        const saved = draft.id
          ? await longTermAbsencesApi.update(draft.id, payload)
          : await longTermAbsencesApi.create({
              employeeId: employee.id,
              ...payload,
              status: "Entwurf"
            });
        target = { ...buildLongTermAbsenceDraft(saved), localId: draft.localId };
        updateLongTermAbsenceDraft(draft.localId, target);
      }
      if (!target.id) return;
      const submitted = await longTermAbsencesApi.submit(target.id);
      updateLongTermAbsenceDraft(draft.localId, { ...buildLongTermAbsenceDraft(submitted), localId: draft.localId });
      toast({
        title: "Eingereicht",
        description: "Langzeit-Abwesenheit wurde zur Freigabe eingereicht"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Einreichen fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setLongTermAbsenceSaving(draft.localId, false);
    }
  };

  const handleApproveLongTermAbsence = async (draft: LongTermAbsenceDraft) => {
    if (!draft.id) return;
    setLongTermAbsenceSaving(draft.localId, true);
    try {
      const notes = longTermAbsenceDecisionNotes[draft.localId];
      const updated = await longTermAbsencesApi.approve(draft.id, notes || undefined);
      updateLongTermAbsenceDraft(draft.localId, { ...buildLongTermAbsenceDraft(updated), localId: draft.localId });
      toast({
        title: "Genehmigt",
        description: "Langzeit-Abwesenheit wurde freigegeben"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Freigabe fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setLongTermAbsenceSaving(draft.localId, false);
    }
  };

  const handleRejectLongTermAbsence = async (draft: LongTermAbsenceDraft) => {
    if (!draft.id) return;
    setLongTermAbsenceSaving(draft.localId, true);
    try {
      const notes = longTermAbsenceDecisionNotes[draft.localId];
      const updated = await longTermAbsencesApi.reject(draft.id, notes || undefined);
      updateLongTermAbsenceDraft(draft.localId, { ...buildLongTermAbsenceDraft(updated), localId: draft.localId });
      toast({
        title: "Abgelehnt",
        description: "Langzeit-Abwesenheit wurde abgelehnt"
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Ablehnung fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setLongTermAbsenceSaving(draft.localId, false);
    }
  };

  const handlePasswordChange = async () => {
    if (!canChangePassword) {
      toast({
        title: "Nicht erlaubt",
        description: "Passwort kann nur vom Benutzer selbst geändert werden.",
        variant: "destructive"
      });
      return;
    }

    if (!passwordData.currentPassword.trim()) {
      toast({
        title: "Fehler",
        description: "Aktuelles Passwort ist erforderlich",
        variant: "destructive"
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Fehler",
        description: "Passwörter stimmen nicht überein",
        variant: "destructive"
      });
      return;
    }

    if (!passwordData.newPassword || passwordData.newPassword.length < 6) {
      toast({
        title: "Fehler",
        description: "Passwort muss mindestens 6 Zeichen haben",
        variant: "destructive"
      });
      return;
    }
    
    try {
      await apiRequest("POST", "/api/auth/set-password", {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });

      toast({
        title: "Passwort geändert",
        description: "Ihr Passwort wurde erfolgreich aktualisiert"
      });
      setIsPasswordDialogOpen(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Passwort konnte nicht geändert werden",
        variant: "destructive"
      });
    }
  };

  const handleBadgeChange = () => {
    setFormData(prev => ({ ...prev, badge: newBadge.toUpperCase() }));
    toast({
      title: "Kürzel geändert",
      description: `Ihr neues Kürzel ist "${newBadge.toUpperCase()}"`
    });
    setIsBadgeDialogOpen(false);
  };

  const toggleCompetency = (id: number) => {
    setSelectedCompetencyIds((prev) =>
      prev.includes(id) ? prev.filter((compId) => compId !== id) : [...prev, id]
    );
  };

  const toggleDiploma = (id: number) => {
    setSelectedDiplomaIds((prev) =>
      prev.includes(id) ? prev.filter((diplomaId) => diplomaId !== id) : [...prev, id]
    );
  };

  const toggleDeploymentRoom = (id: number) => {
    setDeploymentRoomIds((prev) =>
      prev.includes(id) ? prev.filter((roomId) => roomId !== id) : [...prev, id]
    );
  };

  const toggleServiceTypeOverride = (type: ServiceType) => {
    setServiceTypeOverrides((prev) =>
      prev.includes(type) ? prev.filter((value) => value !== type) : [...prev, type]
    );
  };

  if (loading) {
    return (
      <Layout title="Einstellungen">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Wird geladen...</div>
        </div>
      </Layout>
    );
  }

  if (!employee) {
    return (
      <Layout title="Einstellungen">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Benutzer nicht gefunden</h3>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const viewingEmployeeDoesShifts = employeeDoesShifts(employee, serviceLineMeta);
  const longTermStatus = longTermWish?.status || "Entwurf";
  const canEditLongTerm =
    isViewingOwnProfile && (longTermStatus === "Entwurf" || longTermStatus === "Abgelehnt");
  const showApproveActions =
    !isViewingOwnProfile && canApproveLongTerm && longTermStatus === "Eingereicht";

  return (
    <Layout title={isViewingOwnProfile ? "Einstellungen" : `Profil: ${employee.name}`}>
      <div className="max-w-4xl mx-auto space-y-6">
        
        {isAdmin && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-900">Admin-Ansicht</p>
                    <p className="text-sm text-amber-700">Sie können alle Benutzerprofile bearbeiten</p>
                  </div>
                </div>
                <Select 
                  value={viewingUserId.toString()} 
                  onValueChange={(v) => setLocation(`/einstellungen/${v}`)}
                >
                  <SelectTrigger className="w-64" data-testid="select-user">
                    <SelectValue placeholder="Benutzer wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedEmployees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.name} - {getRoleLabel(emp.role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
            {formData.badge || employee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <h2 className="text-2xl font-bold">{employee.name}</h2>
            <p className="text-muted-foreground flex items-center gap-2">
              <User className="w-4 h-4" /> {getRoleLabel(employee.role)}
            </p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">Profil</TabsTrigger>
            <TabsTrigger value="security">Sicherheit</TabsTrigger>
            <TabsTrigger value="roles">Rollen & Kompetenzen</TabsTrigger>
            {viewingEmployeeDoesShifts && (
              <TabsTrigger value="longterm">Langfristige Dienstwünsche</TabsTrigger>
            )}
            {viewingEmployeeDoesShifts && (
              <TabsTrigger value="longterm-absence">Langzeit-Abwesenheit</TabsTrigger>
            )}
            <TabsTrigger value="permissions">Berechtigungen</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Basisdaten</CardTitle>
                <CardDescription>Verwalten Sie Ihre persönlichen Informationen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Titel</Label>
                    <Input 
                      value={formData.title} 
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))} 
                      disabled={!canEditBasicInfo}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vorname</Label>
                    <Input 
                      value={formData.firstName} 
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))} 
                      disabled={!canEditBasicInfo}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nachname</Label>
                    <Input 
                      value={formData.lastName} 
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))} 
                      disabled={!canEditBasicInfo}
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
                            disabled={!canEditBasicInfo}
                            aria-label="Kalender oeffnen"
                          >
                            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="p-2">
                          <DatePickerCalendar
                            mode="single"
                            captionLayout="dropdown"
                            selected={formData.birthday ? new Date(`${formData.birthday}T00:00:00`) : undefined}
                            onSelect={(date) => {
                              if (!date) return;
                              const iso = formatBirthday(date);
                              setFormData(prev => ({ ...prev, birthday: iso }));
                              setBirthdayInput(formatBirthdayDisplay(iso));
                            }}
                            fromYear={1900}
                            toYear={new Date().getFullYear()}
                          />
                        </PopoverContent>
                      </Popover>
                      <Input 
                        value={birthdayInput}
                        onChange={(e) => setBirthdayInput(e.target.value)}
                        placeholder="TT.MM.JJJJ"
                        disabled={!canEditBasicInfo}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>E-Mail (Dienst)</Label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input 
                        className="pl-10"
                        value={formData.email} 
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} 
                        disabled={!canEditBasicInfo}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>E-Mail (privat)</Label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input 
                        className="pl-10"
                        value={formData.emailPrivate} 
                        onChange={(e) => setFormData(prev => ({ ...prev, emailPrivate: e.target.value }))} 
                        disabled={!canEditPrivateInfo}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telefon (Dienst)</Label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input 
                        className="pl-10"
                        value={formData.phoneWork} 
                        onChange={(e) => setFormData(prev => ({ ...prev, phoneWork: e.target.value }))} 
                        disabled={!canEditBasicInfo}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Telefon (privat)</Label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input 
                        className="pl-10"
                        value={formData.phonePrivate} 
                        onChange={(e) => setFormData(prev => ({ ...prev, phonePrivate: e.target.value }))} 
                        disabled={!canEditPrivateInfo}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Urlaubsanspruch (Tage)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.vacationEntitlement}
                      onChange={(e) => setFormData(prev => ({ ...prev, vacationEntitlement: e.target.value }))}
                      disabled={!canEditVacationEntitlement}
                      placeholder="z.B. 25"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Private Kontaktdaten sichtbar</p>
                      <p className="text-sm text-muted-foreground">Erlaubt das Anzeigen privater Telefonnummer/E-Mail</p>
                    </div>
                  </div>
                  <Switch 
                    checked={formData.showPrivateContact}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showPrivateContact: checked }))}
                    disabled={!canEditPrivateInfo}
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={!canEditBasicInfo || saving}>
                    <Save className="w-4 h-4 mr-2" />
                    Speichern
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Sicherheit</CardTitle>
                <CardDescription>Passwort ändern</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!canChangePassword && (
                  <div className="text-sm text-muted-foreground">
                    Passwortänderungen sind nur für den eigenen Account möglich. Admins nutzen die Benutzerverwaltung
                    zum Zurücksetzen.
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Aktuelles Passwort</Label>
                    <Input 
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      disabled={!canChangePassword}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Neues Passwort</Label>
                    <Input 
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                      disabled={!canChangePassword}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Neues Passwort bestätigen</Label>
                    <Input 
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      disabled={!canChangePassword}
                    />
                  </div>
                </div>

                <Button onClick={handlePasswordChange} disabled={!canChangePassword}>
                  <Lock className="w-4 h-4 mr-2" />
                  Passwort ändern
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Rollen & Kompetenzen</CardTitle>
                <CardDescription>Verwalten Sie Ihre fachlichen Einstellungen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rolle</Label>
                    <div className="relative">
                      <Briefcase className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      {canEditRoleAndCompetencies ? (
                        <Select
                          value={roleValue}
                          onValueChange={(value) => setRoleValue(value as Employee["role"])}
                        >
                          <SelectTrigger className="pl-10">
                            <SelectValue placeholder="Rolle auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={getRoleLabel(employee.role)} disabled />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>App-Rolle</Label>
                    <div className="relative">
                      <Shield className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      {canEditRoleAndCompetencies ? (
                        <Select
                          value={appRoleValue}
                          onValueChange={(value) => setAppRoleValue(value as Employee["appRole"])}
                        >
                          <SelectTrigger className="pl-10">
                            <SelectValue placeholder="App-Rolle auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {APP_ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={employee.appRole} disabled />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label>Dienstplan berücksichtigen</Label>
                    <p className="text-xs text-muted-foreground">
                      Wenn deaktiviert, wird die Person im Dienstplan nicht eingeplant.
                    </p>
                  </div>
                  <Switch
                    checked={takesShifts}
                    onCheckedChange={(checked) => setTakesShifts(Boolean(checked))}
                    disabled={!canEditRoleAndCompetencies}
                  />
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Langzeit-Abwesenheiten werden im Reiter "Langzeit-Abwesenheit" eingereicht und freigegeben.
                </div>

                <div className="space-y-2">
                  <Label>Kompetenzen</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedCompetencyLabels.length ? (
                      selectedCompetencyLabels.map((comp) => (
                        <Badge key={comp.id} variant="secondary" className="flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" />
                          <span>{comp.label}</span>
                          {canEditRoleAndCompetencies && (
                            <button
                              type="button"
                              onClick={() => toggleCompetency(comp.id)}
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              aria-label={`Kompetenz entfernen: ${comp.label}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine Kompetenzen hinterlegt</p>
                    )}
                  </div>
                  {canEditRoleAndCompetencies && (
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
                            onChange={(e) => setCompetencySearch(e.target.value)}
                            placeholder="Kompetenz suchen..."
                          />
                          <div className="max-h-56 overflow-y-auto space-y-2">
                            {filteredCompetencies.map((comp) => {
                              const checked = selectedCompetencyIds.includes(comp.id);
                              return (
                                <div key={comp.id} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`competency-${comp.id}`}
                                    checked={checked}
                                    onCheckedChange={() => toggleCompetency(comp.id)}
                                  />
                                  <Label htmlFor={`competency-${comp.id}`} className="text-sm font-normal cursor-pointer">
                                    {comp.code ? `${comp.code} - ${comp.name}` : comp.name}
                                  </Label>
                                </div>
                              );
                            })}
                            {!filteredCompetencies.length && (
                              <p className="text-sm text-muted-foreground">Keine Kompetenzen gefunden</p>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Diplome</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedDiplomaLabels.length ? (
                      selectedDiplomaLabels.map((diploma) => (
                        <Badge key={diploma.id} variant="secondary" className="flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" />
                          <span>{diploma.label}</span>
                          {canEditDiplomas && (
                            <button
                              type="button"
                              onClick={() => toggleDiploma(diploma.id)}
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              aria-label={`Diplom entfernen: ${diploma.label}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine Diplome hinterlegt</p>
                    )}
                  </div>
                  {canEditDiplomas && (
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
                            {filteredDiplomas.map((diploma) => {
                              const checked = selectedDiplomaIds.includes(diploma.id);
                              return (
                                <div key={diploma.id} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`diploma-${diploma.id}`}
                                    checked={checked}
                                    onCheckedChange={() => toggleDiploma(diploma.id)}
                                  />
                                  <Label htmlFor={`diploma-${diploma.id}`} className="text-sm font-normal cursor-pointer">
                                    {diploma.name}
                                  </Label>
                                </div>
                              );
                            })}
                            {!filteredDiplomas.length && (
                              <p className="text-sm text-muted-foreground">Keine Diplome gefunden</p>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Einsatzbereiche (Arbeitsplätze)</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedRoomLabels.length ? (
                      selectedRoomLabels.map((room) => (
                        <Badge key={room.id} variant="secondary" className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          <span>{room.label}</span>
                          {canEditRoleAndCompetencies && (
                            <button
                              type="button"
                              onClick={() => toggleDeploymentRoom(room.id)}
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              aria-label={`Einsatzbereich entfernen: ${room.label}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine Einsatzbereiche hinterlegt</p>
                    )}
                  </div>
                  {canEditRoleAndCompetencies && (
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
                              const checked = deploymentRoomIds.includes(room.id);
                              return (
                                <div key={room.id} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`room-${room.id}`}
                                    checked={checked}
                                    onCheckedChange={() => toggleDeploymentRoom(room.id)}
                                  />
                                  <Label htmlFor={`room-${room.id}`} className="text-sm font-normal cursor-pointer">
                                    {room.category ? `${room.name} (${room.category})` : room.name}
                                  </Label>
                                </div>
                              );
                            })}
                            {!filteredRooms.length && (
                              <p className="text-sm text-muted-foreground">Keine Arbeitsplätze gefunden</p>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Einsetzbar für (Abweichung)</Label>
                  <p className="text-xs text-muted-foreground">
                    Nur bei Abweichungen setzen. Standard nach Rolle: {defaultServiceTypeLabels.length ? defaultServiceTypeLabels.join(", ") : "—"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedServiceTypeLabels.length ? (
                      selectedServiceTypeLabels.map((service) => (
                        <Badge key={service.id} variant="secondary" className="flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          <span>{service.label}</span>
                          {canEditRoleAndCompetencies && (
                            <button
                              type="button"
                              onClick={() => toggleServiceTypeOverride(service.id)}
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              aria-label={`Einsetzbarkeit entfernen: ${service.label}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Keine Abweichung gesetzt</p>
                    )}
                  </div>
                  {canEditRoleAndCompetencies && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline">
                          Einsetzbarkeit anpassen
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72">
                        <div className="space-y-2">
                          {selectableServiceLines.map((line) => (
                            <div key={line.key} className="flex items-center gap-2">
                              <Checkbox
                                id={`service-${line.key}`}
                                checked={serviceTypeOverrides.includes(line.key)}
                                onCheckedChange={() => toggleServiceTypeOverride(line.key)}
                              />
                              <Label htmlFor={`service-${line.key}`} className="text-sm font-normal cursor-pointer">
                                {line.label}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={!canEditRoleAndCompetencies || saving}>
                    <Save className="w-4 h-4 mr-2" />
                    Speichern
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {viewingEmployeeDoesShifts && (
            <TabsContent value="longterm" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Langfristige Dienstwünsche</CardTitle>
                  <CardDescription>
                    Wiederkehrende Präferenzen für die Dienstplanung. Diese müssen freigegeben werden.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Badge
                      variant="outline"
                      className={
                        longTermStatus === "Genehmigt"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : longTermStatus === "Eingereicht"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : longTermStatus === "Abgelehnt"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      Status: {LONG_TERM_STATUS_LABELS[longTermStatus] || longTermStatus}
                    </Badge>
                    {isViewingOwnProfile && canEditLongTerm && (
                      <Button type="button" variant="outline" onClick={handleAddLongTermRule}>
                        Regel hinzufügen
                      </Button>
                    )}
                  </div>

                  {longTermRules.length ? (
                    <div className="space-y-3">
                      {longTermRules.map((rule, index) => {
                        const serviceValue = rule.serviceType || "any";
                        return (
                          <div key={`${rule.kind}-${index}`} className="grid md:grid-cols-5 gap-3 items-end">
                            <div className="space-y-1">
                              <Label>Regel</Label>
                              <Select
                                value={rule.kind}
                                onValueChange={(value) => handleUpdateLongTermRule(index, { kind: value as LongTermWishRule["kind"] })}
                              >
                                <SelectTrigger disabled={!canEditLongTerm}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {LONG_TERM_RULE_KINDS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>Wochentag</Label>
                              <Select
                                value={rule.weekday}
                                onValueChange={(value) => handleUpdateLongTermRule(index, { weekday: value as LongTermWishRule["weekday"] })}
                              >
                                <SelectTrigger disabled={!canEditLongTerm}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {LONG_TERM_WEEKDAYS.map((day) => (
                                    <SelectItem key={day.value} value={day.value}>
                                      {day.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>Dienstschiene</Label>
                              <Select
                                value={serviceValue}
                                onValueChange={(value) =>
                                  handleUpdateLongTermRule(index, {
                                    serviceType: value === "any" ? "any" : (value as LongTermWishRule["serviceType"])
                                  })
                                }
                              >
                                <SelectTrigger disabled={!canEditLongTerm}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {longTermServiceOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>Stärke</Label>
                              <Select
                                value={rule.strength}
                                onValueChange={(value) =>
                                  handleUpdateLongTermRule(index, { strength: value as LongTermWishRule["strength"] })
                                }
                              >
                                <SelectTrigger disabled={!canEditLongTerm}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {LONG_TERM_RULE_STRENGTHS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex justify-end">
                              {canEditLongTerm && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveLongTermRule(index)}
                                  aria-label="Regel entfernen"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Keine Regeln hinterlegt.</p>
                  )}

                  <div className="space-y-2">
                    <Label>Anmerkungen</Label>
                    <Textarea
                      value={longTermNotes}
                      onChange={(event) => setLongTermNotes(event.target.value)}
                      placeholder="Optional..."
                      disabled={!canEditLongTerm}
                    />
                  </div>

                  {showApproveActions && (
                    <div className="space-y-2">
                      <Label>Hinweise zur Entscheidung</Label>
                      <Textarea
                        value={longTermDecisionNotes}
                        onChange={(event) => setLongTermDecisionNotes(event.target.value)}
                        placeholder="Optional..."
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    {isViewingOwnProfile && (
                      <>
                        <Button
                          variant="outline"
                          onClick={handleSaveLongTermWish}
                          disabled={!canEditLongTerm || longTermSaving}
                        >
                          {longTermSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Speichern
                        </Button>
                        <Button
                          onClick={handleSubmitLongTermWish}
                          disabled={
                            !canEditLongTerm ||
                            longTermSaving ||
                            longTermStatus === "Eingereicht" ||
                            longTermStatus === "Genehmigt"
                          }
                        >
                          {longTermSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Einreichen
                        </Button>
                      </>
                    )}
                    {showApproveActions && (
                      <>
                        <Button
                          variant="destructive"
                          onClick={handleRejectLongTermWish}
                          disabled={longTermSaving}
                        >
                          {longTermSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Ablehnen
                        </Button>
                        <Button
                          onClick={handleApproveLongTermWish}
                          disabled={longTermSaving}
                        >
                          {longTermSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Genehmigen
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {viewingEmployeeDoesShifts && (
            <TabsContent value="longterm-absence" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Langzeit-Abwesenheiten</CardTitle>
                  <CardDescription>
                    Langfristige Abwesenheiten mit Freigabeprozess (z. B. Papamonat, Elternkarenz).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Eintraege werden nach Einreichung freigegeben und im Dienstplan beruecksichtigt.
                    </p>
                    {isViewingOwnProfile && (
                      <Button type="button" variant="outline" onClick={handleAddLongTermAbsence}>
                        Neu hinzufügen
                      </Button>
                    )}
                  </div>

                  {longTermAbsences.length ? (
                    <div className="space-y-4">
                      {longTermAbsences.map((draft) => {
                        const statusLabel = LONG_TERM_STATUS_LABELS[draft.status] || draft.status;
                        const canEditDraft =
                          isViewingOwnProfile && (draft.status === "Entwurf" || draft.status === "Abgelehnt");
                        const canApproveDraft =
                          !isViewingOwnProfile && canApproveLongTerm && draft.status === "Eingereicht";
                        const isSaving = longTermAbsenceSavingIds.includes(draft.localId);
                        return (
                          <div key={draft.localId} className="rounded-lg border border-border p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge
                                variant="outline"
                                className={
                                  draft.status === "Genehmigt"
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : draft.status === "Eingereicht"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : draft.status === "Abgelehnt"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-muted text-muted-foreground"
                                }
                              >
                                Status: {statusLabel}
                              </Badge>
                              {draft.startDate && draft.endDate && (
                                <span className="text-xs text-muted-foreground">
                                  {formatBirthdayDisplay(draft.startDate)} – {formatBirthdayDisplay(draft.endDate)}
                                </span>
                              )}
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Von</Label>
                                <Input
                                  value={draft.startDate}
                                  onChange={(event) =>
                                    updateLongTermAbsenceDraft(draft.localId, { startDate: event.target.value })
                                  }
                                  placeholder="TT.MM.JJJJ"
                                  disabled={!canEditDraft}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Bis</Label>
                                <Input
                                  value={draft.endDate}
                                  onChange={(event) =>
                                    updateLongTermAbsenceDraft(draft.localId, { endDate: event.target.value })
                                  }
                                  placeholder="TT.MM.JJJJ"
                                  disabled={!canEditDraft}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Begruendung</Label>
                              <Textarea
                                value={draft.reason}
                                onChange={(event) =>
                                  updateLongTermAbsenceDraft(draft.localId, { reason: event.target.value })
                                }
                                placeholder="z. B. Papamonat 01.01.2026 bis 31.01.2026"
                                disabled={!canEditDraft}
                              />
                            </div>

                            {canApproveDraft && (
                              <div className="space-y-2">
                                <Label>Hinweis zur Entscheidung</Label>
                                <Textarea
                                  value={longTermAbsenceDecisionNotes[draft.localId] || ""}
                                  onChange={(event) =>
                                    setLongTermAbsenceDecisionNotes((prev) => ({
                                      ...prev,
                                      [draft.localId]: event.target.value
                                    }))
                                  }
                                  placeholder="Optional..."
                                />
                              </div>
                            )}

                            <div className="flex flex-wrap justify-end gap-2">
                              {canEditDraft && (
                                <>
                                  <Button
                                    variant="outline"
                                    onClick={() => handleSaveLongTermAbsence(draft)}
                                    disabled={isSaving}
                                  >
                                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Speichern
                                  </Button>
                                  <Button
                                    onClick={() => handleSubmitLongTermAbsence(draft)}
                                    disabled={isSaving}
                                  >
                                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Einreichen
                                  </Button>
                                </>
                              )}
                              {canApproveDraft && (
                                <>
                                  <Button
                                    variant="destructive"
                                    onClick={() => handleRejectLongTermAbsence(draft)}
                                    disabled={isSaving}
                                  >
                                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Ablehnen
                                  </Button>
                                  <Button
                                    onClick={() => handleApproveLongTermAbsence(draft)}
                                    disabled={isSaving}
                                  >
                                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Genehmigen
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Keine Langzeit-Abwesenheiten hinterlegt.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="permissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Berechtigungen</CardTitle>
                <CardDescription>
                  {isTechnicalAdmin
                    ? "Berechtigungen für diesen Benutzer verwalten"
                    : "Ihre Berechtigungen (nur lesbar)"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label>Kann Überdienst machen</Label>
                    <p className="text-xs text-muted-foreground">
                      Nur Mitarbeiter mit dieser Freigabe können im Überdienst eingetragen werden.
                    </p>
                  </div>
                  <Switch
                    checked={canOverduty}
                    onCheckedChange={(checked) => setCanOverduty(Boolean(checked))}
                    disabled={!canEditRoleAndCompetencies}
                  />
                </div>
                {loadingPermissions ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Berechtigungen werden geladen...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {permissionOptions.map((perm) => (
                      <div key={perm.key} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <Label htmlFor={`perm-${perm.key}`} className="text-sm font-normal flex-1">
                          {perm.label}
                        </Label>
                        <Switch
                          id={`perm-${perm.key}`}
                          checked={selectedPermissions.includes(perm.key)}
                          onCheckedChange={(checked) => updatePermission(perm.key, Boolean(checked))}
                          disabled={!isTechnicalAdmin}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {isTechnicalAdmin && (
                  <div className="pt-2">
                    <Button onClick={handleSavePermissions} disabled={savingPermissions}>
                      {savingPermissions && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Speichern
                    </Button>
                  </div>
                )}
                {canEditRoleAndCompetencies && (
                  <div className="pt-2">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Überdienst speichern
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
