import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, ChevronLeft, ChevronRight, Clock, Save, AlertCircle, User } from "lucide-react";
import { useState } from "react";
import { format, addDays, subDays } from "date-fns";
import { de } from "date-fns/locale";

// Mock Data
const ASSIGNMENTS = [
  {
    area: "HKL (Herzkatheter)",
    rooms: [
      { id: 1, name: "HKL 1", requiredRole: "Oberarzt", assigned: { name: "OA Dr. Klein", role: "OA" } },
      { id: 2, name: "HKL 2", requiredRole: "Oberarzt", assigned: { name: "OA Dr. Schmidt", role: "1. OA" } },
    ]
  },
  {
    area: "Funktionsdiagnostik",
    rooms: [
      { id: 3, name: "Echo 1", requiredRole: "Facharzt", assigned: { name: "FA Müller", role: "FA" } },
      { id: 4, name: "Echo 2", requiredRole: "Assistenzarzt", assigned: null }, // Empty slot
      { id: 5, name: "Ergometrie", requiredRole: "Assistenzarzt", assigned: { name: "AA Bauer", role: "AA" } },
    ]
  },
  {
    area: "Ambulanz",
    rooms: [
      { id: 6, name: "Allg. Amb 1", requiredRole: "Assistenzarzt", assigned: { name: "AA Wagner", role: "AA" } },
      { id: 7, name: "Allg. Amb 2", requiredRole: "Assistenzarzt", assigned: { name: "AA Weber", role: "AA" } },
      { id: 8, name: "Schrittmacher", requiredRole: "Facharzt", assigned: { name: "OA Dr. Huber", role: "FOA" } },
    ]
  },
  {
    area: "Station",
    rooms: [
      { id: 9, name: "Visite Station A", requiredRole: "Oberarzt", assigned: { name: "OA Dr. Klein", role: "OA" } },
      { id: 10, name: "Stationsarzt A", requiredRole: "Assistenzarzt", assigned: { name: "AA Fischer", role: "AA" } },
    ]
  }
];

const AVAILABLE_STAFF = [
  { id: 101, name: "AA Meier", role: "AA", status: "available" },
  { id: 102, name: "AA Schulz", role: "AA", status: "available" },
  { id: 103, name: "KPJ Sarah", role: "KPJ", status: "available" },
  { id: 104, name: "OA Dr. Lang", role: "OA", status: "busy" }, // e.g., night shift before
];

export default function DailyPlanEditor() {
  const [date, setDate] = useState(new Date());

  return (
    <Layout title="Tageseinsatzplan bearbeiten">
      <div className="flex flex-col h-[calc(100vh-140px)]">
        
        {/* Header Toolbar */}
        <div className="flex items-center justify-between mb-6 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-secondary rounded-lg p-1">
              <Button variant="ghost" size="icon" onClick={() => setDate(subDays(date, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="font-medium w-32 text-center">{format(date, 'dd. MMM yyyy', { locale: de })}</span>
              <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Planungsstatus: Entwurf
            </Badge>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <AlertCircle className="w-4 h-4" /> Prüfung
            </Button>
            <Button className="gap-2">
              <Save className="w-4 h-4" /> Plan veröffentlichen
            </Button>
          </div>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden">
          
          {/* Main Planning Board */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            {ASSIGNMENTS.map((area) => (
              <div key={area.area} className="space-y-3">
                <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider flex items-center gap-2">
                  {area.area}
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {area.rooms.map((room) => (
                    <Card key={room.id} className={`border-l-4 shadow-sm ${!room.assigned ? 'border-l-orange-300 bg-orange-50/30' : 'border-l-primary/50'}`}>
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium text-sm">{room.name}</span>
                          <Badge variant="secondary" className="text-[10px] h-5">{room.requiredRole}</Badge>
                        </div>
                        
                        {room.assigned ? (
                          <div className="flex items-center gap-3 bg-background p-2 rounded border border-border group cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors">
                            <Avatar className="w-8 h-8 bg-primary/10 text-primary">
                              <AvatarFallback className="text-xs font-bold">{room.assigned.role}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{room.assigned.name}</p>
                              <p className="text-xs text-muted-foreground">08:00 - 16:00</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                              ×
                            </Button>
                          </div>
                        ) : (
                          <div className="h-12 border-2 border-dashed border-orange-200 rounded flex items-center justify-center text-orange-400 text-xs font-medium bg-orange-50/50 cursor-pointer hover:bg-orange-100/50 transition-colors">
                            + Zuweisung
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Right Sidebar: Available Staff */}
          <div className="w-80 flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <h3 className="font-semibold text-sm">Verfügbares Personal</h3>
              <p className="text-xs text-muted-foreground mt-1">Drag & Drop zur Zuweisung</p>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2">
                {AVAILABLE_STAFF.map(staff => (
                  <div 
                    key={staff.id} 
                    className={`p-3 rounded-lg border flex items-center gap-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${staff.status === 'busy' ? 'opacity-50 bg-muted' : 'bg-background border-border hover:border-primary/50'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${staff.status === 'busy' ? 'bg-muted-foreground/20 text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                      {staff.role}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{staff.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {staff.status === 'busy' ? 'Ruhezeit / Abwesend' : 'Verfügbar'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

        </div>
      </div>
    </Layout>
  );
}
