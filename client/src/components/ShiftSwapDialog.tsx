import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { employeeApi, shiftSwapApi, rosterApi } from "@/lib/api";
import type { Employee, RosterShift, ShiftSwapRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { 
  ArrowRightLeft, 
  Check, 
  X, 
  Clock, 
  AlertTriangle, 
  Loader2, 
  CalendarDays,
  User
} from "lucide-react";

interface ShiftSwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceShift?: RosterShift | null;
  onSwapComplete?: () => void;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  gyn: "Gynäkologie",
  kreiszimmer: "Kreißzimmer",
  turnus: "Turnus"
};

const STATUS_BADGES = {
  Ausstehend: { variant: "outline" as const, icon: Clock, className: "text-amber-600 border-amber-300" },
  Genehmigt: { variant: "outline" as const, icon: Check, className: "text-green-600 border-green-300" },
  Abgelehnt: { variant: "outline" as const, icon: X, className: "text-red-600 border-red-300" }
};

export function ShiftSwapDialog({ open, onOpenChange, sourceShift, onSwapComplete }: ShiftSwapDialogProps) {
  const { employee: currentUser } = useAuth();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [myRequests, setMyRequests] = useState<ShiftSwapRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ShiftSwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [selectedTargetEmployee, setSelectedTargetEmployee] = useState<string>("");
  const [reason, setReason] = useState("");

  const canApprove = currentUser?.appRole === 'Admin' || 
    currentUser?.appRole === 'Editor' ||
    currentUser?.role === 'Primararzt' || 
    currentUser?.role === '1. Oberarzt';

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empData, pendingData] = await Promise.all([
        employeeApi.getAll(),
        shiftSwapApi.getPending()
      ]);
      
      setEmployees(empData);
      setPendingRequests(pendingData);
      
      if (currentUser) {
        const myData = await shiftSwapApi.getByEmployee(currentUser.id);
        setMyRequests(myData);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!sourceShift || !selectedTargetEmployee) {
      toast({ title: "Fehler", description: "Bitte Ziel-Mitarbeiter auswählen", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await shiftSwapApi.create({
        requesterId: currentUser!.id,
        requesterShiftId: sourceShift.id,
        targetEmployeeId: parseInt(selectedTargetEmployee),
        reason: reason || null,
        status: "Ausstehend"
      });
      
      toast({ title: "Anfrage gesendet", description: "Die Tausch-Anfrage wurde eingereicht" });
      setSelectedTargetEmployee("");
      setReason("");
      onSwapComplete?.();
      loadData();
    } catch (error) {
      toast({ title: "Fehler", description: "Anfrage konnte nicht gesendet werden", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (requestId: number) => {
    try {
      await shiftSwapApi.approve(requestId, currentUser!.id);
      toast({ title: "Genehmigt", description: "Die Tausch-Anfrage wurde genehmigt" });
      loadData();
      onSwapComplete?.();
    } catch (error) {
      toast({ title: "Fehler", description: "Genehmigung fehlgeschlagen", variant: "destructive" });
    }
  };

  const handleReject = async (requestId: number) => {
    try {
      await shiftSwapApi.reject(requestId, currentUser!.id);
      toast({ title: "Abgelehnt", description: "Die Tausch-Anfrage wurde abgelehnt" });
      loadData();
    } catch (error) {
      toast({ title: "Fehler", description: "Ablehnung fehlgeschlagen", variant: "destructive" });
    }
  };

  const getEmployeeName = (id: number) => employees.find(e => e.id === id)?.name || "Unbekannt";

  const eligibleEmployees = employees.filter(e => 
    e.id !== currentUser?.id && 
    e.isActive
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Diensttausch
          </DialogTitle>
          <DialogDescription>
            Tauschen Sie Dienste mit Kollegen oder verwalten Sie Tausch-Anfragen
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue={sourceShift ? "new" : "pending"} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="new">Neue Anfrage</TabsTrigger>
              <TabsTrigger value="my">Meine Anfragen</TabsTrigger>
              {canApprove && (
                <TabsTrigger value="pending" className="relative">
                  Ausstehend
                  {pendingRequests.length > 0 && (
                    <Badge className="ml-2 bg-primary text-primary-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">
                      {pendingRequests.length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="new" className="space-y-4 py-4">
              {sourceShift ? (
                <div className="space-y-4">
                  <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Aktueller Dienst</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">
                          {format(parseISO(sourceShift.date), 'EEEE, dd. MMMM yyyy', { locale: de })}
                        </span>
                      </div>
                      <Badge variant="outline">
                        {SERVICE_TYPE_LABELS[sourceShift.serviceType] || sourceShift.serviceType}
                      </Badge>
                    </CardContent>
                  </Card>

                  <div className="space-y-2">
                    <Label>Tauschen mit:</Label>
                    <Select value={selectedTargetEmployee} onValueChange={setSelectedTargetEmployee}>
                      <SelectTrigger data-testid="select-swap-target">
                        <SelectValue placeholder="Kollegen auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleEmployees.map(emp => (
                          <SelectItem key={emp.id} value={String(emp.id)}>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              {emp.name}
                              <Badge variant="secondary" className="ml-2 text-xs">{emp.role}</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Grund (optional)</Label>
                    <Textarea
                      placeholder="z.B. Arzttermin, Familienangelegenheit..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      data-testid="input-swap-reason"
                    />
                  </div>

                  <Button 
                    onClick={handleSubmitRequest} 
                    disabled={submitting || !selectedTargetEmployee}
                    className="w-full"
                    data-testid="button-submit-swap"
                  >
                    {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Tausch-Anfrage senden
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ArrowRightLeft className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Klicken Sie auf einen Dienst im Dienstplan, um einen Tausch anzufragen.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="my" className="py-4">
              {myRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Keine Tausch-Anfragen vorhanden</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myRequests.map(req => {
                    const statusConfig = STATUS_BADGES[req.status as keyof typeof STATUS_BADGES];
                    const StatusIcon = statusConfig?.icon || Clock;
                    return (
                      <Card key={req.id} data-testid={`card-my-request-${req.id}`}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant={statusConfig?.variant} className={statusConfig?.className}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {req.status}
                                </Badge>
                              </div>
                              <p className="text-sm">
                                Tausch mit <span className="font-medium">{req.targetEmployeeId ? getEmployeeName(req.targetEmployeeId) : 'Offen'}</span>
                              </p>
                              {req.reason && (
                                <p className="text-xs text-muted-foreground">{req.reason}</p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(req.requestedAt), 'dd.MM.yyyy', { locale: de })}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {canApprove && (
              <TabsContent value="pending" className="py-4">
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Check className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Keine ausstehenden Anfragen</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map(req => (
                      <Card key={req.id} data-testid={`card-pending-request-${req.id}`}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium">{getEmployeeName(req.requesterId)}</span>
                                <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">{req.targetEmployeeId ? getEmployeeName(req.targetEmployeeId) : 'Offen'}</span>
                              </div>
                              {req.reason && (
                                <p className="text-xs text-muted-foreground">{req.reason}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Angefragt am {format(new Date(req.requestedAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-green-600 border-green-300 hover:bg-green-50"
                                onClick={() => handleApprove(req.id)}
                                data-testid={`button-approve-${req.id}`}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-red-600 border-red-300 hover:bg-red-50"
                                onClick={() => handleReject(req.id)}
                                data-testid={`button-reject-${req.id}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
