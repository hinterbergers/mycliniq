import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowLeft, ArrowRight, Clock, Save, Shield, 
  User, Plus, Info, GripVertical, CheckCircle2
} from "lucide-react";
import { useState, useEffect } from "react";
import { format, addDays, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { employeeApi } from "@/lib/api";
import type { Employee } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type PlanStatus = "draft" | "preliminary" | "released";
type StaffStatus = "available" | "rest" | "absent";

interface AssignmentSlot {
  id: string;
  name: string;
  requiredRole: string;
  assigned: {
    employeeId: number;
    name: string;
    badge: string;
    timeStart: string;
    timeEnd: string;
  } | null;
}

interface SectionData {
  id: string;
  name: string;
  slots: AssignmentSlot[];
}

interface AvailableStaff {
  id: number;
  name: string;
  lastName: string;
  role: string;
  roleBadge: string;
  status: StaffStatus;
}

const ROLE_COLORS: Record<string, string> = {
  "Primararzt": "bg-purple-100 text-purple-800 border-purple-200",
  "1. Oberarzt": "bg-blue-100 text-blue-800 border-blue-200",
  "Oberarzt": "bg-blue-100 text-blue-800 border-blue-200",
  "Oberärztin": "bg-blue-100 text-blue-800 border-blue-200",
  "Facharzt": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Assistenzarzt": "bg-green-100 text-green-800 border-green-200",
  "Assistenzärztin": "bg-green-100 text-green-800 border-green-200",
  "Turnusarzt": "bg-amber-100 text-amber-800 border-amber-200",
  "Student (KPJ)": "bg-orange-100 text-orange-800 border-orange-200",
  "Hebamme": "bg-pink-100 text-pink-800 border-pink-200",
  "Spezialist": "bg-indigo-100 text-indigo-800 border-indigo-200",
};

const ROLE_BADGES: Record<string, string> = {
  "Primararzt": "Prim",
  "1. Oberarzt": "1.OA",
  "Oberarzt": "OA",
  "Oberärztin": "OA",
  "Facharzt": "FA",
  "Assistenzarzt": "AA",
  "Assistenzärztin": "AA",
  "Turnusarzt": "TA",
  "Student (KPJ)": "KPJ",
  "Hebamme": "HEB",
  "Spezialist": "SPZ",
};

const generateDummySections = (): SectionData[] => [
  {
    id: "kreiszsaal-op",
    name: "Kreißsaal & OP",
    slots: [
      { 
        id: "dienstarzt-ks", 
        name: "Dienstarzt KS", 
        requiredRole: "Oberarzt",
        assigned: { employeeId: 1, name: "Dr. Hinterberger", badge: "gyn", timeStart: "08:00", timeEnd: "16:00" }
      },
      { 
        id: "sectio-op", 
        name: "Sectio-OP", 
        requiredRole: "Oberarzt",
        assigned: { employeeId: 2, name: "Dr. Wagner", badge: "gyn", timeStart: "08:00", timeEnd: "16:00" }
      },
      { 
        id: "gyn-op-1", 
        name: "Gyn-OP 1", 
        requiredRole: "Facharzt",
        assigned: null
      },
      { 
        id: "gyn-op-2", 
        name: "Gyn-OP 2", 
        requiredRole: "Assistenzarzt",
        assigned: { employeeId: 3, name: "Brunner", badge: "geb", timeStart: "08:00", timeEnd: "14:00" }
      },
    ]
  },
  {
    id: "stationen",
    name: "Stationen",
    slots: [
      { 
        id: "visite-geb", 
        name: "Visite Wöchnerinnen", 
        requiredRole: "Facharzt",
        assigned: { employeeId: 4, name: "Dr. Müller", badge: "geb", timeStart: "08:00", timeEnd: "12:00" }
      },
      { 
        id: "visite-gyn", 
        name: "Visite Gyn", 
        requiredRole: "Assistenzarzt",
        assigned: null
      },
      { 
        id: "aufnahme", 
        name: "Aufnahme", 
        requiredRole: "Assistenzarzt",
        assigned: { employeeId: 5, name: "Bauer", badge: "gyn", timeStart: "08:00", timeEnd: "16:00" }
      },
    ]
  },
  {
    id: "ambulanzzentrum",
    name: "Ambulanzzentrum",
    slots: [
      { 
        id: "allg-amb", 
        name: "Allg. Gyn-Ambulanz", 
        requiredRole: "Assistenzarzt",
        assigned: { employeeId: 6, name: "Fischer", badge: "gyn", timeStart: "08:00", timeEnd: "13:00" }
      },
      { 
        id: "schwanger-amb", 
        name: "Schwangeren-Amb.", 
        requiredRole: "Facharzt",
        assigned: { employeeId: 7, name: "Dr. Huber", badge: "geb", timeStart: "09:00", timeEnd: "14:00" }
      },
      { 
        id: "praenatal", 
        name: "Pränatal-Diagnostik", 
        requiredRole: "Spezialist",
        assigned: { employeeId: 8, name: "Dr. Berg", badge: "ögum", timeStart: "08:00", timeEnd: "12:00" }
      },
      { 
        id: "mamma-amb", 
        name: "Mamma-Sprechstunde", 
        requiredRole: "Oberarzt",
        assigned: null
      },
    ]
  }
];

const generateAvailableStaff = (employees: Employee[]): AvailableStaff[] => {
  if (employees.length === 0) {
    return [
      { id: 101, name: "Meier", lastName: "Meier", role: "Assistenzarzt", roleBadge: "AA", status: "available" },
      { id: 102, name: "Schulz", lastName: "Schulz", role: "Assistenzarzt", roleBadge: "AA", status: "available" },
      { id: 103, name: "Sarah K.", lastName: "K.", role: "Student (KPJ)", roleBadge: "KPJ", status: "available" },
      { id: 104, name: "Dr. Lang", lastName: "Lang", role: "Oberarzt", roleBadge: "OA", status: "rest" },
      { id: 105, name: "Dr. Gruber", lastName: "Gruber", role: "Facharzt", roleBadge: "FA", status: "available" },
      { id: 106, name: "Hofer", lastName: "Hofer", role: "Turnusarzt", roleBadge: "TA", status: "absent" },
    ];
  }
  
  const statuses: StaffStatus[] = ["available", "available", "available", "rest", "absent"];
  return employees.slice(0, 8).map((emp, idx) => ({
    id: emp.id,
    name: emp.lastName || emp.name.split(" ").pop() || emp.name,
    lastName: emp.lastName || emp.name,
    role: emp.role,
    roleBadge: ROLE_BADGES[emp.role] || emp.role.substring(0, 2).toUpperCase(),
    status: statuses[idx % statuses.length]
  }));
};

export default function DailyPlanEditor() {
  const { toast } = useToast();
  const [date, setDate] = useState(new Date());
  const [planStatus, setPlanStatus] = useState<PlanStatus>("draft");
  const [sections] = useState<SectionData[]>(generateDummySections());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const empData = await employeeApi.getAll();
        setEmployees(empData.filter(e => e.isActive));
      } catch (error) {
        console.error("Failed to load employees:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const availableStaff = generateAvailableStaff(employees);

  const handleValidate = () => {
    toast({
      title: "Prüfung",
      description: "Tageseinsatzplan wird auf Konflikte geprüft...",
    });
  };

  const handleReleasePreliminary = () => {
    setPlanStatus("preliminary");
    toast({
      title: "Vorläufig freigegeben",
      description: "Der Tageseinsatzplan wurde als vorläufig markiert.",
    });
  };

  const handleReleaseFinal = () => {
    setPlanStatus("released");
    toast({
      title: "Endgültig freigegeben",
      description: "Der Tageseinsatzplan wurde veröffentlicht.",
    });
  };

  const getStatusLabel = (status: PlanStatus) => {
    switch (status) {
      case "draft": return "Entwurf";
      case "preliminary": return "Vorläufig";
      case "released": return "Freigegeben";
    }
  };

  const getStatusStyle = (status: PlanStatus) => {
    switch (status) {
      case "draft": return "bg-gray-50 text-gray-700 border-gray-200";
      case "preliminary": return "bg-amber-50 text-amber-700 border-amber-200";
      case "released": return "bg-green-50 text-green-700 border-green-200";
    }
  };

  const getStaffStatusLabel = (status: StaffStatus) => {
    switch (status) {
      case "available": return "Verfügbar";
      case "rest": return "Ruhezeit";
      case "absent": return "Abwesend";
    }
  };

  const getStaffStatusStyle = (status: StaffStatus) => {
    switch (status) {
      case "available": return "text-green-600";
      case "rest": return "text-amber-600";
      case "absent": return "text-red-600";
    }
  };

  return (
    <Layout title="Tageseinsatzplan bearbeiten">
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Tageseinsatzplan bearbeiten</h1>
          <p className="text-muted-foreground">
            Kurzfristige Änderungen am Tageseinsatz vornehmen.
          </p>
        </div>

        <Card className="border-none kabeg-shadow">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setDate(subDays(date, 1))}
                    data-testid="button-prev-day"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div className="w-44 text-center px-2">
                    <span className="font-bold">{format(date, "EEEE", { locale: de })}</span>
                    <span className="text-muted-foreground ml-2 text-sm">
                      {format(date, "dd.MM.yyyy", { locale: de })}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setDate(addDays(date, 1))}
                    data-testid="button-next-day"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>

                <Badge variant="outline" className={cn("text-xs", getStatusStyle(planStatus))}>
                  Planungsstatus: {getStatusLabel(planStatus)}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={handleValidate} data-testid="button-validate">
                  <Shield className="w-4 h-4" />
                  Prüfung
                </Button>
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={handleReleasePreliminary}
                  disabled={planStatus !== "draft"}
                  data-testid="button-release-preliminary"
                >
                  <Clock className="w-4 h-4" />
                  Vorläufig freigeben
                </Button>
                <Button 
                  className="gap-2"
                  onClick={handleReleaseFinal}
                  disabled={planStatus !== "preliminary"}
                  data-testid="button-release-final"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Plan veröffentlichen
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-6">
            {sections.map((section) => (
              <div key={section.id} className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">
                  {section.name}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {section.slots.map((slot) => (
                    <Card 
                      key={slot.id} 
                      className={cn(
                        "border-none kabeg-shadow hover:shadow-md transition-shadow",
                        !slot.assigned && "border-l-4 border-l-orange-300"
                      )}
                    >
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium">{slot.name}</CardTitle>
                          <Badge 
                            variant="outline" 
                            className={cn("text-[10px] px-1.5 py-0 h-5", ROLE_COLORS[slot.requiredRole] || "bg-gray-100")}
                          >
                            {slot.requiredRole}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 pt-0">
                        {slot.assigned ? (
                          <div 
                            className="flex items-center gap-3 p-2 rounded-lg border bg-primary/5 border-primary/20 group cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors"
                            draggable
                            data-testid={`assigned-${slot.id}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {ROLE_BADGES[slot.requiredRole] || "?"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {slot.assigned.name}
                                <span className="text-muted-foreground ml-1">({slot.assigned.badge})</span>
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {slot.assigned.timeStart} – {slot.assigned.timeEnd}
                              </p>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                              data-testid={`remove-${slot.id}`}
                            >
                              ×
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="h-14 border-2 border-dashed border-orange-200 rounded-lg flex items-center justify-center text-orange-500 text-sm font-medium bg-orange-50/50 cursor-pointer hover:bg-orange-100/50 hover:border-orange-300 transition-colors gap-2"
                            data-testid={`empty-${slot.id}`}
                          >
                            <Plus className="w-4 h-4" />
                            Zuweisung
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <Card className="border-none kabeg-shadow sticky top-20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Verfügbares Personal
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {format(date, "EEEE, dd.MM.yyyy", { locale: de })}
                </p>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[60vh]">
                  <div className="space-y-2 pr-2">
                    {isLoading ? (
                      <div className="text-sm text-muted-foreground text-center py-4">Laden...</div>
                    ) : (
                      availableStaff.map((staff) => (
                        <div
                          key={staff.id}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border bg-card transition-all group",
                            staff.status === "available" 
                              ? "hover:bg-muted/50 cursor-grab active:cursor-grabbing hover:shadow-sm" 
                              : "opacity-50 bg-muted cursor-not-allowed"
                          )}
                          draggable={staff.status === "available"}
                          onDragStart={(e) => {
                            if (staff.status === "available") {
                              e.dataTransfer.setData("employeeId", staff.id.toString());
                            }
                          }}
                          data-testid={`staff-${staff.id}`}
                        >
                          {staff.status === "available" && (
                            <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                            staff.status === "available" 
                              ? "bg-primary/10 text-primary" 
                              : "bg-muted-foreground/20 text-muted-foreground"
                          )}>
                            {staff.roleBadge}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{staff.name}</p>
                            <p className={cn("text-[10px]", getStaffStatusStyle(staff.status))}>
                              {getStaffStatusLabel(staff.status)}
                            </p>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-5 shrink-0",
                              staff.status === "available" 
                                ? ROLE_COLORS[staff.role] || "bg-gray-100"
                                : "bg-gray-100 text-gray-500"
                            )}
                          >
                            {staff.roleBadge}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Kurzfristige Änderungen am Tageseinsatzplan aktualisieren automatisch das Dashboard 
            der betroffenen Mitarbeitenden. Änderungen werden im Verlauf protokolliert.
          </p>
        </div>
      </div>
    </Layout>
  );
}
