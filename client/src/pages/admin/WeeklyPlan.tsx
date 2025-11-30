import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Download, Printer, Edit2, Lock, Unlock } from "lucide-react";
import { useState, useEffect } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getWeek, getYear, eachDayOfInterval, isWeekend } from "date-fns";
import { de } from "date-fns/locale";
import { employeeApi } from "@/lib/api";
import type { Employee } from "@shared/schema";
import { cn } from "@/lib/utils";

const WEEK_DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const WEEK_STRUCTURE = [
  {
    section: "Stationen",
    areas: [
      {
        name: "Geburtshilfl. Bettenstation - Kreißsaal",
        slots: [
          { id: "geb-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt"] },
          { id: "geb-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "geb-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      },
      {
        name: "Gynäkologische Bettenstation",
        slots: [
          { id: "gyn-station-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt"] },
          { id: "gyn-station-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "gyn-station-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      }
    ]
  },
  {
    section: "Schwangerenambulanz",
    areas: [
      { name: "Risikoambulanz 1", slots: [{ id: "risk1", label: "", roleFilter: ["Oberarzt", "Oberärztin", "Assistenzarzt", "Assistenzärztin"] }] },
      { name: "Risikoambulanz 2", slots: [{ id: "risk2", label: "", roleFilter: ["Oberarzt", "Oberärztin"] }] },
      { name: "Schwangerensprechstunde", slots: [{ id: "schwanger", label: "", roleFilter: ["Assistenzarzt", "Assistenzärztin"] }] }
    ]
  },
  {
    section: "Gynäkologische Ambulanz",
    areas: [
      { name: "GYN 1 (Vulva, Dysplasie, Chef)", slots: [{ id: "gyn1", label: "OA / Ass", roleFilter: ["Primararzt", "Oberarzt", "Oberärztin", "Assistenzarzt", "Assistenzärztin"] }] },
      { name: "GYN 2 (Bestell-/Notfallambulanz, TNS)", slots: [{ id: "gyn2", label: "OA / Ass", roleFilter: ["Oberarzt", "Oberärztin", "Assistenzarzt", "Assistenzärztin"] }] },
      { name: "GYN 3 (Bestell-/Notfallambulanz, Uro)", slots: [{ id: "gyn3", label: "", roleFilter: ["Oberarzt", "Oberärztin", "Assistenzarzt", "Assistenzärztin"] }] },
      { name: "TU / KPJ", slots: [{ id: "gyn-tu", label: "", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }] },
      { name: "Mamma", slots: [{ id: "mamma", label: "", roleFilter: ["Oberarzt", "Oberärztin"] }] }
    ]
  },
  {
    section: "OP",
    areas: [
      {
        name: "OP 1 TCH",
        slots: [
          { id: "op1-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt", "Primararzt"] },
          { id: "op1-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "op1-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      },
      {
        name: "OP 2",
        slots: [
          { id: "op2-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt", "Primararzt"] },
          { id: "op2-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "op2-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      }
    ]
  },
  {
    section: "Abwesenheiten",
    areas: [
      { name: "Urlaub", slots: [{ id: "urlaub", label: "", roleFilter: [] }] },
      { name: "RZ (Ruhezeit)", slots: [{ id: "rz", label: "", roleFilter: [] }] },
      { name: "ZA (Zeitausgleich)", slots: [{ id: "za", label: "", roleFilter: [] }] },
      { name: "FB (Fortbildung)", slots: [{ id: "fb", label: "", roleFilter: [] }] }
    ]
  },
  {
    section: "Dienstfrei",
    areas: [
      {
        name: "Frei nach Dienst",
        slots: [
          { id: "frei-oa", label: "OA", roleFilter: ["Oberarzt", "Oberärztin", "1. Oberarzt", "Primararzt"] },
          { id: "frei-ass", label: "Ass", roleFilter: ["Assistenzarzt", "Assistenzärztin"] },
          { id: "frei-tu", label: "TU / KPJ", roleFilter: ["Turnusarzt", "Student (KPJ)", "Student (Famulant)"] }
        ]
      }
    ]
  }
];

const MOCK_ASSIGNMENTS: Record<string, Record<string, string>> = {
  "geb-oa": { "0": "Waschnig", "1": "Gerhold", "2": "Herbst", "3": "Krenn", "4": "Gerhold" },
  "geb-ass": { "0": "Gerhold", "1": "Gruber", "2": "Rosenkranz, Krauss", "3": "Sellner", "4": "Gurmane" },
  "gyn-station-oa": { "0": "Herzog", "1": "Herzog", "2": "Herzog", "3": "Herzog", "5": "Markota", "6": "Köck" },
  "gyn-station-ass": { "2": "Dullnig", "3": "Dullnig", "4": "Lesnik", "5": "Gruber", "6": "Rosenkranz" },
  "risk1": { "0": "geschlossen", "1": "Herbst", "2": "Markota", "3": "Herbst", "4": "Rosenkranz" },
  "risk2": { "0": "Gellen", "1": "Gellen", "2": "geschlossen", "3": "geschlossen", "4": "Markota" },
  "schwanger": { "0": "Gruber", "1": "Waschnig", "2": "Gurmane", "3": "Gruber", "4": "Waschnig" },
  "gyn1": { "0": "Lermann, Lesnik", "1": "Rosenkranz", "2": "Gornjec", "3": "Gornjec" },
  "gyn2": { "0": "Gornjec", "1": "Hinterberger", "2": "Stöger", "4": "Gruber" },
  "mamma": { "0": "Krenn", "1": "Krenn", "2": "Krenn", "4": "Köck" },
  "op1-oa": { "4": "Herbst" },
  "op1-ass": { "0": "Sectio-OP", "2": "Sectio-OP", "4": "Krauss" },
  "op2-oa": { "0": "Köck", "1": "Lermann, Gornjec", "2": "Hinterberger", "3": "Köck", "4": "Hinterberger" },
  "op2-ass": { "0": "Stöger", "2": "Gerhold", "3": "Lesnik", "4": "Sellner" },
  "urlaub": { "0": "Herbst, Markota, Dullnig", "1": "Markota, Dullnig", "2": "Waschnig", "3": "Waschnig, Lermann", "4": "Lermann, Krenn, Herzog" },
  "rz": { "0": "Sellner", "1": "Sellner", "2": "Sellner", "3": "Gurmane" },
  "za": { "0": "Krauss", "1": "Krauss", "2": "Gellen", "3": "Gellen", "4": "Gellen" },
  "fb": { "0": "Hinterberger", "1": "Gurmane", "2": "Lesnik", "3": "Markota" },
  "frei-oa": { "0": "Lermann", "1": "Köck", "2": "Lermann", "3": "Hinterberger", "4": "Gornjec", "5": "Herbst", "6": "Markota" },
  "frei-ass": { "0": "Gurmane", "1": "Lesnik", "2": "Gruber", "3": "Gerhold", "4": "Stöger", "5": "Rosenkranz", "6": "Gruber" }
};

export default function WeeklyPlan() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 11, 1));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekNumber = getWeek(currentDate, { weekStartsOn: 1 });
  const weekYear = getYear(currentDate);
  
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const data = await employeeApi.getAll();
      setEmployees(data);
    } catch (error) {
      console.error("Failed to load employees");
    }
  };

  const getAssignment = (slotId: string, dayIndex: number): string => {
    return MOCK_ASSIGNMENTS[slotId]?.[dayIndex.toString()] || "";
  };

  const getCellStyle = (value: string) => {
    if (value === "geschlossen") return "bg-gray-100 text-gray-500 italic";
    if (value.includes("Sectio")) return "bg-pink-50 text-pink-700 font-medium";
    return "";
  };

  return (
    <Layout title="Wochenplanung">
      <div className="space-y-4">
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card p-4 rounded-xl kabeg-shadow">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subWeeks(currentDate, 1))}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-56 text-center">
                <span className="font-bold text-lg">KW {weekNumber}</span>
                <span className="text-muted-foreground ml-2 text-sm">
                  {format(weekStart, "dd.MM.", { locale: de })} - {format(weekEnd, "dd.MM.yyyy", { locale: de })}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              Abteilung Frauenheilkunde und Geburtshilfe
            </Badge>
          </div>

          <div className="flex gap-2 w-full lg:w-auto">
            <Button 
              variant={isEditing ? "default" : "outline"} 
              className="gap-2 flex-1 lg:flex-none"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? <Lock className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              {isEditing ? "Speichern" : "Bearbeiten"}
            </Button>
            <Button variant="outline" className="gap-2 flex-1 lg:flex-none">
              <Printer className="w-4 h-4" />
              Drucken
            </Button>
            <Button variant="outline" className="gap-2 flex-1 lg:flex-none">
              <Download className="w-4 h-4" />
              PDF
            </Button>
          </div>
        </div>

        <Card className="border-none kabeg-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead>
                <tr className="bg-primary text-white">
                  <th className="p-2 text-left font-medium w-48 border-r border-primary/30" colSpan={2}>Bereich</th>
                  {days.map((day, i) => (
                    <th 
                      key={i} 
                      className={cn(
                        "p-2 text-center font-medium border-r border-primary/30 min-w-[100px]",
                        isWeekend(day) && "bg-primary/80"
                      )}
                    >
                      <div>{WEEK_DAYS[i]}</div>
                      <div className="text-xs font-normal opacity-80">{format(day, "dd.MM.", { locale: de })}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEK_STRUCTURE.map((section, sectionIdx) => (
                  <>
                    <tr key={`section-${sectionIdx}`} className="bg-primary/10">
                      <td colSpan={9} className="p-2 font-bold text-primary border-b border-border">
                        {section.section}
                      </td>
                    </tr>
                    {section.areas.map((area, areaIdx) => (
                      area.slots.map((slot, slotIdx) => (
                        <tr key={`${sectionIdx}-${areaIdx}-${slotIdx}`} className="border-b border-border hover:bg-muted/30">
                          {slotIdx === 0 && (
                            <td 
                              className="p-2 font-medium text-foreground border-r border-border bg-muted/20 align-top"
                              rowSpan={area.slots.length}
                            >
                              {area.name}
                            </td>
                          )}
                          <td className="p-2 text-xs text-muted-foreground border-r border-border w-16 text-center bg-muted/10">
                            {slot.label}
                          </td>
                          {days.map((day, dayIdx) => {
                            const value = getAssignment(slot.id, dayIdx);
                            const cellKey = `${slot.id}-${dayIdx}`;
                            return (
                              <td 
                                key={dayIdx}
                                className={cn(
                                  "p-1.5 border-r border-border text-center min-w-[100px]",
                                  isWeekend(day) && "bg-muted/30",
                                  getCellStyle(value),
                                  isEditing && "cursor-pointer hover:bg-primary/5"
                                )}
                                onClick={() => isEditing && setEditingCell(cellKey)}
                              >
                                {editingCell === cellKey ? (
                                  <Select 
                                    defaultValue=""
                                    onValueChange={() => setEditingCell(null)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={value || "Auswählen..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="empty">- Leer -</SelectItem>
                                      <SelectItem value="closed">geschlossen</SelectItem>
                                      {employees
                                        .filter(e => slot.roleFilter.length === 0 || slot.roleFilter.includes(e.role))
                                        .map(emp => (
                                          <SelectItem key={emp.id} value={emp.id.toString()}>
                                            {emp.name.split(" ").pop()}
                                          </SelectItem>
                                        ))
                                      }
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs">{value}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex items-center justify-between text-xs text-muted-foreground p-2">
          <div className="flex gap-4">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-pink-100 rounded"></span> Diensthabende/r
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-primary/20 rounded"></span> TB-Leiter
            </span>
          </div>
          <div>
            Prim. PD Dr. Johannes Lermann • Erstellt: {format(new Date(), "dd.MM.yyyy", { locale: de })}
          </div>
        </div>

      </div>
    </Layout>
  );
}
