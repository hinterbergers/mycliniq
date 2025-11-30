import { Bell, Search, Calendar, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEffect, useState } from "react";
import { rosterSettingsApi, type NextPlanningMonth } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const MONTH_NAMES = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export function Header({ title }: { title?: string }) {
  const { employee } = useAuth();
  const [planningMonth, setPlanningMonth] = useState<NextPlanningMonth | null>(null);
  const [hasNotification, setHasNotification] = useState(false);
  
  const isAdmin = employee?.appRole === 'Admin' || 
    employee?.role === 'Primararzt' || 
    employee?.role === '1. Oberarzt';
  
  useEffect(() => {
    if (isAdmin) {
      loadPlanningData();
    }
  }, [isAdmin]);
  
  const loadPlanningData = async () => {
    try {
      const data = await rosterSettingsApi.getNextPlanningMonth();
      setPlanningMonth(data);
      setHasNotification(data.allSubmitted);
    } catch (error) {
      console.error('Failed to load planning data', error);
    }
  };
  
  const today = format(new Date(), 'd. MMM yyyy', { locale: de });
  
  return (
    <header className="h-16 kabeg-header sticky top-0 z-10 px-6 flex items-center justify-between shadow-sm">
      <h2 className="text-xl font-semibold text-white tracking-tight">{title}</h2>
      
      <div className="flex items-center gap-4">
        <div className="relative w-64 hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/60" />
          <Input 
            placeholder="Suchen..." 
            className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30" 
            data-testid="input-search"
          />
        </div>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full text-white/80 hover:text-white hover:bg-white/10 relative"
              data-testid="button-notifications"
            >
              <Bell className="w-4 h-4" />
              {hasNotification && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"></span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Benachrichtigungen</h3>
              
              {hasNotification && planningMonth ? (
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Dienstplan kann erstellt werden
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Alle Mitarbeiter haben ihre Wünsche für {MONTH_NAMES[planningMonth.month - 1]} {planningMonth.year} eingereicht.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Keine neuen Benachrichtigungen
                </p>
              )}
              
              {planningMonth && !planningMonth.allSubmitted && isAdmin && (
                <div className="text-xs text-muted-foreground">
                  <p>Dienstwünsche für {MONTH_NAMES[planningMonth.month - 1]} {planningMonth.year}:</p>
                  <p className="font-medium">
                    {planningMonth.submittedCount} von {planningMonth.totalEmployees} eingereicht
                  </p>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        
        <Button variant="ghost" size="sm" className="hidden md:flex gap-2 text-white/80 hover:text-white hover:bg-white/10">
          <Calendar className="w-4 h-4" />
          <span>{today}</span>
        </Button>
      </div>
    </header>
  );
}
