import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Filter, MoreHorizontal, UserPlus } from "lucide-react";
import { useState } from "react";
import { MOCK_EMPLOYEES } from "@/lib/mockData";

const ROLES = [
  "Primararzt",
  "1. Oberarzt",
  "Oberarzt",
  "Oberärztin",
  "Facharzt",
  "Assistenzarzt",
  "Assistenzärztin",
  "Turnusarzt",
  "Student (KPJ)",
  "Student (Famulant)"
];

const COMPETENCIES = [
  "Senior Mamma Surgeon",
  "Endometriose",
  "Gyn-Onkologie",
  "Geburtshilfe",
  "Urogynäkologie",
  "Gynäkologische Chirurgie",
  "ÖGUM I",
  "ÖGUM II",
  "Dysplasie",
  "Allgemeine Gynäkologie",
  "Mamma",
  "Mamma Ambulanz",
  "Kindergynäkologie"
];

export default function EmployeeManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredEmployees = MOCK_EMPLOYEES.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.competencies.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <Layout title="Mitarbeiter & Kompetenzen">
      <div className="space-y-6">
        
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Mitarbeiter suchen..." 
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" /> Filter
            </Button>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <UserPlus className="w-4 h-4" /> Neuer Mitarbeiter
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Neuen Mitarbeiter anlegen</DialogTitle>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Titel</Label>
                      <Input placeholder="Dr. med." />
                    </div>
                    <div className="space-y-2">
                      <Label>Vorname</Label>
                      <Input placeholder="Max" />
                    </div>
                    <div className="space-y-2">
                      <Label>Nachname</Label>
                      <Input placeholder="Mustermann" />
                    </div>
                    <div className="space-y-2">
                      <Label>Rolle / Funktion</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Rolle wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map(role => (
                            <SelectItem key={role} value={role}>{role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Kompetenzen & Fähigkeiten</Label>
                    <div className="grid grid-cols-2 gap-3 p-4 border border-border rounded-lg bg-muted/10 h-64 overflow-y-auto">
                      {COMPETENCIES.map(comp => (
                        <div key={comp} className="flex items-center space-x-2">
                          <Checkbox id={comp} />
                          <Label htmlFor={comp} className="text-sm font-normal cursor-pointer">{comp}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Befristeter Zugang (Optional)</Label>
                    <Input type="date" />
                    <p className="text-xs text-muted-foreground">Für Studenten und Gastärzte</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline">Abbrechen</Button>
                  <Button>Speichern</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="border-none shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Name</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Kompetenzen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{emp.name}</span>
                        {/* @ts-ignore */}
                        {emp.validUntil && (
                          /* @ts-ignore */
                          <span className="text-xs text-orange-600 font-normal">Befristet bis {emp.validUntil}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">{emp.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {emp.competencies.length > 0 ? (
                          emp.competencies.slice(0, 2).map(comp => (
                            <Badge key={comp} variant="outline" className="text-xs bg-background">{comp}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                        {emp.competencies.length > 2 && (
                          <Badge variant="outline" className="text-xs bg-background">+{emp.competencies.length - 2}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${emp.status === 'active' ? 'bg-green-500' : 'bg-orange-500'}`} />
                        <span className="text-sm text-muted-foreground capitalize">
                          {emp.status === 'active' ? 'Aktiv' : 'Befristet'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
