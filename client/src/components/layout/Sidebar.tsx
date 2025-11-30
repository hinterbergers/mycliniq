import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  Settings, 
  LogOut, 
  Stethoscope,
  CalendarDays,
  FileText,
  Briefcase
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/dienstplaene", label: "Dienstpläne", icon: CalendarDays },
    { href: "/wissen", label: "SOPs", icon: FileText },
    { href: "/projekte", label: "Projekte", icon: Briefcase },
    { href: "/admin", label: "Verwaltung", icon: LayoutDashboard },
    { href: "/einstellungen", label: "Einstellungen", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-sidebar flex flex-col h-screen sticky top-0">
      <a 
        href="/"
        onClick={(e) => {
          e.preventDefault();
          window.history.pushState({}, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
        className="p-6 flex items-center gap-3 border-b border-sidebar-border hover:bg-white/5 transition-colors cursor-pointer"
        data-testid="link-home"
      >
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white">
          <Stethoscope className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight text-white">cliniq</h1>
          <p className="text-xs text-white/70 font-medium">Klinikum Klagenfurt</p>
        </div>
      </a>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <a 
              key={item.href} 
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', item.href);
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-sidebar-accent text-white" 
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs">
            SH
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-white">Dr. Hinterberger</p>
            <p className="text-xs text-white/60 truncate">1. Oberarzt</p>
          </div>
          <LogOut className="w-4 h-4 text-white/60" />
        </div>
      </div>
    </aside>
  );
}
