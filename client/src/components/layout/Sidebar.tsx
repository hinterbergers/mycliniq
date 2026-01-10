import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Settings,
  LogOut,
  Stethoscope,
  CalendarDays,
  FileText,
  Briefcase,
  Wrench,
  MessageCircle,
} from "lucide-react";

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { employee, user, token, logout, isAdmin, isTechnicalAdmin } =
    useAuth();

  const navItems = [
    { href: "/dienstplaene", label: "Dienstpläne", icon: CalendarDays },
    { href: "/wissen", label: "SOPs", icon: FileText },
    { href: "/projekte", label: "Projekte", icon: Briefcase },
    { href: "/tools", label: "Tools", icon: Wrench },
    { href: "/nachrichten", label: "Nachrichten", icon: MessageCircle },
    { href: "/admin", label: "Verwaltung", icon: Users, adminOnly: true },
    { href: "/einstellungen", label: "Einstellungen", icon: Settings },
  ];

  const getInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return parts[0][0] + parts[parts.length - 1][0];
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  return (
    <aside className="w-64 bg-sidebar flex flex-col h-screen sticky top-0">
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          window.history.pushState({}, "", "/");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        className="p-6 flex items-center gap-3 border-b border-sidebar-border hover:bg-white/5 transition-colors cursor-pointer"
        data-testid="link-home"
      >
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white">
          <Stethoscope className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight text-white">
            MyCliniQ
          </h1>
          <p className="text-xs text-white/70 font-medium">
            Klinikum Klagenfurt
          </p>
        </div>
      </a>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems
          .filter((item) => !item.adminOnly || isTechnicalAdmin)
          .map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, "", item.href);
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white",
                )}
                data-testid={`nav-${item.href.replace(/\//g, "-").slice(1) || "home"}`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </a>
            );
          })}
      </nav>

      {(employee || user || token) && (
        <div className="p-4 border-t border-sidebar-border">
          <div
            className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs">
              {getInitials(
                employee?.name ||
                  `${user?.name ?? ""} ${user?.lastName ?? ""}`.trim() ||
                  "Benutzer",
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-white">
                {employee?.name ||
                  `${user?.name ?? ""} ${user?.lastName ?? ""}`.trim() ||
                  "Benutzer"}
              </p>
              <p className="text-xs text-white/60 truncate">
                {employee?.role ||
                  user?.appRole ||
                  user?.systemRole ||
                  "Abmelden"}
              </p>
            </div>
            <LogOut className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
          </div>
        </div>
      )}
    </aside>
  );
}
