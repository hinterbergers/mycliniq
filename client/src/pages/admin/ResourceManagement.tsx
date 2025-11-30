import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Building } from "lucide-react";
import { useState } from "react";

export default function ResourceManagement() {
  // Mock State for rooms
  const [rooms, setRooms] = useState([
    { id: 1, name: "Echo-Labor 1", type: "Untersuchung", status: "open", message: "" },
    { id: 2, name: "Echo-Labor 2", type: "Untersuchung", status: "open", message: "" },
    { id: 3, name: "HKL 1 (Herzkatheter)", type: "Intervention", status: "open", message: "" },
    { id: 4, name: "HKL 2 (Herzkatheter)", type: "Intervention", status: "closed", message: "Wartung C-Bogen" },
    { id: 5, name: "Allg. Ambulanz Raum 1", type: "Ambulanz", status: "open", message: "" },
    { id: 6, name: "Allg. Ambulanz Raum 2", type: "Ambulanz", status: "open", message: "" },
    { id: 7, name: "Schrittmacher-Ambulanz", type: "Spezialambulanz", status: "open", message: "" },
  ]);

  const toggleRoom = (id: number) => {
    setRooms(rooms.map(r => 
      r.id === id 
        ? { ...r, status: r.status === 'open' ? 'closed' : 'open', message: r.status === 'open' ? 'Gesperrt durch Sekretariat' : '' } 
        : r
    ));
  };

  return (
    <Layout title="Ressourcen & Räume">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-orange-800">Hinweis für die Planung</h4>
            <p className="text-sm text-orange-700 mt-1">
              Gesperrte Räume werden im Tageseinsatzplan automatisch als "Nicht verfügbar" markiert. 
              Bitte geben Sie bei langfristigen Sperren (z.B. Umbau) einen Grund an.
            </p>
          </div>
        </div>

        <div className="grid gap-6">
          {["Intervention", "Untersuchung", "Ambulanz", "Spezialambulanz"].map((category) => (
            <div key={category} className="space-y-3">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Building className="w-4 h-4 text-muted-foreground" />
                {category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rooms.filter(r => r.type === category).map(room => (
                  <Card key={room.id} className={`border-none shadow-sm transition-all ${room.status === 'closed' ? 'bg-secondary/50 opacity-80' : 'bg-card'}`}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{room.name}</span>
                          {room.status === 'closed' && (
                            <Badge variant="destructive" className="text-[10px] h-5">Gesperrt</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {room.status === 'closed' ? room.message || 'Keine Begründung' : 'Verfügbar'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Label htmlFor={`room-${room.id}`} className="text-xs text-muted-foreground cursor-pointer">
                          {room.status === 'open' ? 'Aktiv' : 'Inaktiv'}
                        </Label>
                        <Switch 
                          id={`room-${room.id}`}
                          checked={room.status === 'open'}
                          onCheckedChange={() => toggleRoom(room.id)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
