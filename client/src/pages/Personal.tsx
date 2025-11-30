import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, Plus, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { startOfWeek, addDays, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns";
import { de } from "date-fns/locale";
import { MOCK_EMPLOYEES } from "@/lib/mockData";

export default function Personal() {
  return (
    <Layout title="Personalmanagement">
      <Tabs defaultValue="roster" className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <TabsList className="bg-background border border-border p-1 h-12 rounded-xl shadow-sm">
            <TabsTrigger value="roster" className="rounded-lg px-6 h-10">Dienstplan</TabsTrigger>
            <TabsTrigger value="vacation" className="rounded-lg px-6 h-10">Urlaubsplanung</TabsTrigger>
            <TabsTrigger value="assignment" className="rounded-lg px-6 h-10">Einsatzplanung</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
             <Button variant="outline" className="gap-2">
               <Download className="w-4 h-4" />
               Export
             </Button>
             <Button className="gap-2">
               <Plus className="w-4 h-4" />
               Neuer Eintrag
             </Button>
          </div>
        </div>

        <TabsContent value="roster" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <RosterView />
        </TabsContent>

        <TabsContent value="vacation" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <VacationView />
        </TabsContent>
        
        <TabsContent value="assignment">
           <div className="flex items-center justify-center h-96 text-muted-foreground border-2 border-dashed rounded-xl">
             Einsatzplanung Modul
           </div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}

function RosterView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
    end: endOfMonth(currentDate)
  });

  // Mock shifts
  const shifts = [
    { date: 1, type: 'F', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { date: 2, type: 'F', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { date: 3, type: 'S', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    { date: 4, type: 'N', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    { date: 5, type: '-', color: 'bg-slate-100 text-slate-500' },
    { date: 12, type: 'F', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  ];

  const getShift = (day: Date) => {
    const dayNum = day.getDate();
    // Simple mock logic for demo
    if (!isSameMonth(day, currentDate)) return null;
    const shift = shifts.find(s => s.date === dayNum);
    if (shift) return shift;
    
    // Random filler for visuals
    if (dayNum % 4 === 0) return { type: 'F', color: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (dayNum % 4 === 1) return { type: 'S', color: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (dayNum % 4 === 2) return { type: 'N', color: 'bg-purple-100 text-purple-700 border-purple-200' };
    return { type: 'Frei', color: 'bg-slate-50 text-slate-400 border-slate-100' };
  };

  return (
    <Card className="border-none shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between bg-card">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-primary" />
            {format(currentDate, 'MMMM yyyy', { locale: de })}
          </h3>
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Select defaultValue="all">
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Abteilung" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Abteilungen</SelectItem>
              <SelectItem value="cardio">Geburtshilfe</SelectItem>
              <SelectItem value="neuro">Gynäkologie</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
          <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground border-r border-border last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr bg-background">
        {days.map((day, i) => {
          const isCurrentMonth = isSameMonth(day, currentDate);
          const shift = getShift(day);
          
          return (
            <div 
              key={i} 
              className={cn(
                "min-h-[120px] p-2 border-b border-r border-border last:border-r-0 hover:bg-secondary/20 transition-colors group relative",
                !isCurrentMonth && "bg-muted/10 text-muted-foreground"
              )}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={cn(
                  "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                  isToday(day) ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}>
                  {format(day, 'd')}
                </span>
                {isToday(day) && <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Heute</span>}
              </div>

              {isCurrentMonth && shift && (
                <div className={cn(
                  "p-2 rounded-md border text-xs font-medium mb-1 cursor-pointer hover:brightness-95 transition-all",
                  shift.color
                )}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">{shift.type}</span>
                    <span>08:00-16:30</span>
                  </div>
                  <div className="mt-1 opacity-80 truncate">Dienst</div>
                </div>
              )}
              
              <Button variant="ghost" size="icon" className="absolute bottom-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function VacationView() {
  // Mock vacation data distribution
  const getVacationDays = (empId: number) => {
    if (empId % 3 === 0) return 25;
    if (empId % 2 === 0) return 15;
    return 5;
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle>Urlaubsübersicht 2025</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {MOCK_EMPLOYEES.slice(0, 8).map((emp, i) => (
            <div key={emp.id} className="flex items-center gap-4 p-3 hover:bg-secondary/30 rounded-xl transition-colors">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {emp.name.split(' ').pop()?.substring(0, 2).toUpperCase()}
              </div>
              <div className="w-40 shrink-0">
                <p className="font-medium text-sm truncate">{emp.name}</p>
                <p className="text-xs text-muted-foreground truncate">{emp.role}</p>
              </div>
              <div className="flex-1 grid grid-cols-12 gap-1 h-8 min-w-[300px]">
                {Array.from({ length: 12 }).map((_, m) => (
                  <div key={m} className="bg-secondary rounded-sm relative group cursor-pointer hover:bg-secondary-foreground/10">
                    {/* Mock vacation blocks */}
                    {(i === 0 && m === 6) && <div className="absolute inset-y-1 inset-x-0 bg-green-400/50 rounded-sm border border-green-500/50" />}
                    {(i === 1 && (m === 2 || m === 8)) && <div className="absolute inset-y-1 inset-x-0 bg-green-400/50 rounded-sm border border-green-500/50" />}
                    
                    <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded shadow-sm border whitespace-nowrap z-10">
                      {format(new Date(2025, m, 1), 'MMM')}
                    </div>
                  </div>
                ))}
              </div>
              <div className="w-20 text-right text-sm shrink-0">
                <span className="font-bold text-foreground">{getVacationDays(emp.id)}</span> <span className="text-muted-foreground">Tage</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
