import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Download, Filter, Printer, ArrowLeft, ArrowRight, Info } from "lucide-react";
import { useState } from "react";
import { MOCK_EMPLOYEES } from "@/lib/mockData";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, getDay } from "date-fns";
import { de } from "date-fns/locale";

// Define service types based on user input
const SERVICE_TYPES = [
  { id: "gyn", label: "Gynäkologie", requiredRole: ["Primararzt", "1. Oberarzt", "Oberarzt", "Oberärztin"], color: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "kreiszimmer", label: "Kreißzimmer", requiredRole: ["Assistenzarzt", "Assistenzärztin"], color: "bg-pink-100 text-pink-700 border-pink-200" },
  { id: "turnus", label: "Turnus", requiredRole: ["Assistenzarzt", "Assistenzärztin", "Turnusarzt"], color: "bg-emerald-100 text-emerald-700 border-emerald-200" }
];

// Mock roster data structure based on the PDF example
interface DailyRoster {
  date: Date;
  gyn?: number; // Employee ID
  kreiszimmer?: number; // Employee ID
  turnus?: number; // Employee ID
  absences: { empId: number, reason: string }[];
}

export default function RosterPlan() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 1)); // Jan 2026 as per PDF example

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

  // Mock assignment logic (simplified for visualization)
  const getAssignment = (date: Date, type: 'gyn' | 'kreiszimmer' | 'turnus') => {
    const day = date.getDate();
    
    // Example data based on PDF snippet (approximate)
    if (day === 1) {
      if (type === 'kreiszimmer') return MOCK_EMPLOYEES.find(e => e.name.includes("Rosenkranz"));
      if (type === 'gyn') return MOCK_EMPLOYEES.find(e => e.name.includes("Lermann"));
    }
    if (day === 2) {
      if (type === 'kreiszimmer') return MOCK_EMPLOYEES.find(e => e.name.includes("Stöger"));
      if (type === 'gyn') return MOCK_EMPLOYEES.find(e => e.name.includes("Markota"));
    }
    if (day === 3) {
      if (type === 'kreiszimmer') return MOCK_EMPLOYEES.find(e => e.name.includes("Gruber"));
      if (type === 'gyn') return MOCK_EMPLOYEES.find(e => e.name.includes("Lermann"));
      if (type === 'turnus') return MOCK_EMPLOYEES.find(e => e.name.includes("Rosenkranz"));
    }

    return null; // Empty slot
  };

  // Mock absences logic
  const getAbsences = (date: Date): { empId: number; name: string; reason: string }[] => {
    const day = date.getDate();
    const absences: { empId: number; name: string; reason: string }[] = [];
    
    if (day <= 6) {
      // Example: Some doctors on holiday
      const absentDocs = MOCK_EMPLOYEES.filter(e => e.name.includes("Köck") || e.name.includes("Gornjec"));
      absentDocs.forEach(doc => absences.push({ empId: doc.id, name: doc.name, reason: "Urlaub" }));
    }
    
    return absences;
  };
  
  // Statistics calculation
  const stats = MOCK_EMPLOYEES.map(emp => {
    return {
      ...emp,
      stats: {
        gyn: Math.floor(Math.random() * 5), // Mock stats
        geb: Math.floor(Math.random() * 5),
        tu: Math.floor(Math.random() * 2),
        sum: 0,
        abw: Math.floor(Math.random() * 5)
      }
    };
  }).map(s => ({...s, stats: {...s.stats, sum: s.stats.gyn + s.stats.geb + s.stats.tu}}));

  return (
    <Layout title="Dienstplan">
      <div className="space-y-6">
        
        {/* Controls Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <span className="font-bold w-40 text-center text-lg">{format(currentDate, 'MMMM yyyy', { locale: de })}</span>
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            <Badge variant="outline" className="hidden md:flex gap-1 bg-blue-50 text-blue-700 border-blue-200">
              <Info className="w-3 h-3" /> 
              <span>Planungsstatus: Entwurf</span>
            </Badge>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="gap-2 flex-1 md:flex-none">
              <Printer className="w-4 h-4" />
              Drucken
            </Button>
            <Button variant="outline" className="gap-2 flex-1 md:flex-none">
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
            <Button className="gap-2 flex-1 md:flex-none">
              Auto-Generieren
            </Button>
          </div>
        </div>

        {/* Main Roster Table */}
        <Card className="border-none shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="border-collapse w-full min-w-[1200px]">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 text-center border-r border-border font-bold">KW</TableHead>
                  <TableHead className="w-12 text-center border-r border-border font-bold">Tag</TableHead>
                  <TableHead className="w-24 border-r border-border font-bold">Datum</TableHead>
                  
                  {/* Service Columns */}
                  <TableHead className="w-48 bg-pink-50/50 border-r border-pink-100 text-pink-900 font-bold text-center">
                    Kreißzimmer (Ass.)
                  </TableHead>
                  <TableHead className="w-48 bg-blue-50/50 border-r border-blue-100 text-blue-900 font-bold text-center">
                    Gynäkologie (OA)
                  </TableHead>
                  <TableHead className="w-48 bg-emerald-50/50 border-r border-emerald-100 text-emerald-900 font-bold text-center">
                    Turnus (Ass./TA)
                  </TableHead>
                  
                  {/* Absence Column */}
                  <TableHead className="min-w-[300px] bg-slate-50/50 text-slate-700 font-bold text-center">
                    Abwesenheiten / Info
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((day) => {
                  const isWeekendDay = isWeekend(day);
                  const isHoliday = format(day, 'dd.MM') === '01.01' || format(day, 'dd.MM') === '06.01';
                  
                  const gynAssign = getAssignment(day, 'gyn');
                  const kreisAssign = getAssignment(day, 'kreiszimmer');
                  const turnusAssign = getAssignment(day, 'turnus');
                  // @ts-ignore
                  const absences = getAbsences(day);

                  return (
                    <TableRow key={day.toISOString()} className={`
                      ${isWeekendDay || isHoliday ? 'bg-slate-50/60' : 'bg-white'} 
                      hover:bg-slate-100/80 transition-colors border-b border-border/60
                    `}>
                      <TableCell className="text-center text-xs text-muted-foreground border-r border-border">
                        {format(day, 'w')}
                      </TableCell>
                      <TableCell className={`text-center font-medium border-r border-border ${isWeekendDay || isHoliday ? 'text-red-500' : ''}`}>
                        {format(day, 'EEE', { locale: de })}.
                      </TableCell>
                      <TableCell className={`border-r border-border ${isWeekendDay || isHoliday ? 'text-red-500 font-bold' : ''}`}>
                        {format(day, 'dd.MM.')}
                      </TableCell>

                      {/* Kreißzimmer Slot */}
                      <TableCell className="border-r border-border p-1">
                        {kreisAssign ? (
                          <div className="bg-pink-100 text-pink-800 text-sm px-2 py-1.5 rounded font-medium text-center border border-pink-200 shadow-sm">
                            {kreisAssign.name.split(' ').pop()}
                          </div>
                        ) : (
                          <div className="h-8 border border-dashed border-slate-200 rounded flex items-center justify-center text-xs text-slate-400 hover:bg-slate-50 cursor-pointer">
                            +
                          </div>
                        )}
                      </TableCell>

                      {/* Gyn Slot */}
                      <TableCell className="border-r border-border p-1">
                        {gynAssign ? (
                          <div className="bg-blue-100 text-blue-800 text-sm px-2 py-1.5 rounded font-medium text-center border border-blue-200 shadow-sm">
                            {gynAssign.name.split(' ').pop()}
                          </div>
                        ) : (
                          <div className="h-8 border border-dashed border-slate-200 rounded flex items-center justify-center text-xs text-slate-400 hover:bg-slate-50 cursor-pointer">
                            +
                          </div>
                        )}
                      </TableCell>

                      {/* Turnus Slot */}
                      <TableCell className="border-r border-border p-1">
                        {turnusAssign ? (
                          <div className="bg-emerald-100 text-emerald-800 text-sm px-2 py-1.5 rounded font-medium text-center border border-emerald-200 shadow-sm">
                            {turnusAssign.name.split(' ').pop()}
                          </div>
                        ) : (
                          <div className="h-8 border border-dashed border-slate-200 rounded flex items-center justify-center text-xs text-slate-400 hover:bg-slate-50 cursor-pointer">
                            +
                          </div>
                        )}
                      </TableCell>

                      {/* Absences & Info */}
                      <TableCell className="p-1 text-sm text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {isHoliday && (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 mr-2">
                              {format(day, 'dd.MM') === '01.01' ? 'Neujahr' : 'Hl. 3 Könige'}
                            </Badge>
                          )}
                          {/* @ts-ignore */}
                          {absences.map((ab, idx) => (
                            <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="font-bold mr-1">{ab.name.substring(0, 2).toUpperCase()}</span>
                              <span className="opacity-70">{ab.reason}</span>
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Statistics Summary */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Dienststatistik Jänner 2026</CardTitle>
            <CardDescription>Übersicht der Dienste und Abwesenheiten pro Mitarbeiter</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Mitarbeiter</TableHead>
                    <TableHead>Kürzel</TableHead>
                    <TableHead className="text-center text-blue-700 bg-blue-50/50">Gyn</TableHead>
                    <TableHead className="text-center text-pink-700 bg-pink-50/50">Geb</TableHead>
                    <TableHead className="text-center text-emerald-700 bg-emerald-50/50">Turnus</TableHead>
                    <TableHead className="text-center font-bold">Summe</TableHead>
                    <TableHead className="text-center text-slate-500 bg-slate-50/50">Abwesend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.slice(0, 10).map(emp => (
                    <TableRow key={emp.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {emp.name.split(' ').pop()?.substring(0, 2).toUpperCase()}
                      </TableCell>
                      <TableCell className="text-center bg-blue-50/20">{emp.stats.gyn}</TableCell>
                      <TableCell className="text-center bg-pink-50/20">{emp.stats.geb}</TableCell>
                      <TableCell className="text-center bg-emerald-50/20">{emp.stats.tu}</TableCell>
                      <TableCell className="text-center font-bold">{emp.stats.sum}</TableCell>
                      <TableCell className="text-center text-slate-500 bg-slate-50/20">{emp.stats.abw}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
