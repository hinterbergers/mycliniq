import { useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  Users,
  Settings,
  LogOut,
  Stethoscope,
  CalendarDays,
  FileText,
  Wrench,
  MessageCircle,
  ListCheck,
  GraduationCap,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type SidebarVariant = "desktop" | "mobile";

type SidebarProps = {
  variant?: SidebarVariant;
  onNavigate?: () => void;
  className?: string;
};

export function Sidebar({
  variant = "desktop",
  onNavigate,
  className,
}: SidebarProps) {
  const [location, setLocation] = useLocation();
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const {
    employee,
    user,
    token,
    logout,
    canAny,
    isSuperuser,
    canViewTraining,
  } = useAuth();
  const isExternalDuty = user?.accessScope === "external_duty";

  const adminCaps = [
    "dutyplan.edit",
    "dutyplan.publish",
    "weeklyplan.edit",
    "vacation.approve",
    "vacation.lock",
    "absence.create",
    "users.manage",
    "users.permissions.manage",
    "resources.manage",
    "sop.manage",
    "sop.publish",
    "project.manage",
    "project.delete",
    "departments.manage",
  ];

  // “Verwaltung” is shown if the user is a superuser (admin/technical admin)
  // OR has at least one admin capability.
  const hasAdminAccess = isSuperuser || canAny(adminCaps);

  type NavChild = {
    href: string;
    label: string;
    icon?: LucideIcon;
  };

  type NavItem = {
    label: string;
    href?: string;
    icon?: LucideIcon;
    adminOnly?: boolean;
    trainingOnly?: boolean;
    children?: NavChild[];
  };

  const navItems: NavItem[] = [
    { href: "/dienstplaene", label: "Dienstpläne", icon: CalendarDays },
    { href: "/wissen", label: "SOPs", icon: FileText },
    { href: "/aufgaben", label: "Aufgaben", icon: ListCheck },
    { href: "/tools", label: "Tools", icon: Wrench },
    { href: "/nachrichten", label: "Nachrichten", icon: MessageCircle },
    {
      label: "Fortbildung",
      icon: GraduationCap,
      trainingOnly: true,
      children: [
        { href: "/fortbildung/videos", label: "Videos", icon: Video },
        {
          href: "/fortbildung/presentations",
          label: "PowerPoint",
          icon: FileText,
        },
      ],
    },
    { href: "/admin", label: "Verwaltung", icon: Users, adminOnly: true },
    { href: "/einstellungen", label: "Einstellungen", icon: Settings },
  ];

  const externalDutyNav = new Set(["/dienstplaene"]);

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
    onNavigate?.();
  };

  const containerClass =
    variant === "desktop"
      ? "w-64 h-screen sticky top-0 hidden md:flex"
      : "w-full h-full";

  return (
    <aside
      className={cn("bg-sidebar flex flex-col", containerClass, className)}
      data-variant={variant}
    >
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          setLocation("/");
          onNavigate?.();
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

      {variant === "mobile" && (
        <div className="px-4 pb-4 border-b border-sidebar-border">
          <label className="text-xs uppercase tracking-wide text-white/70 mb-1 block">
            Suchen
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
            <Input
              placeholder="Suchen..."
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30"
              readOnly
            />
          </div>
        </div>
      )}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems
          .filter((item) => {
            if (item.adminOnly && !hasAdminAccess) return false;
            if (item.trainingOnly && !canViewTraining) return false;
            if (isExternalDuty) {
              const href = item.href;
              if (!href) return false;
              return externalDutyNav.has(href);
            }
            return true;
          })
          .map((item) => {
            if (item.children && item.children.length) {
              const isGroupActive = item.children.some(
                (child) =>
                  location === child.href ||
                  (child.href !== "/" && location.startsWith(child.href)),
              );
              const isGroupOpen =
                variant === "mobile" ||
                isGroupActive ||
                hoveredGroup === item.label;
              return (
                <div
                  key={item.label}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200"
                  aria-expanded={isGroupOpen}
                  onMouseEnter={() => {
                    if (variant === "desktop") {
                      setHoveredGroup(item.label);
                    }
                  }}
                  onMouseLeave={() => {
                    if (variant === "desktop") {
                      setHoveredGroup(null);
                    }
                  }}
                >
                  <div
                    className={cn(
                      "flex items-center gap-3",
                      isGroupActive
                        ? "bg-sidebar-accent text-white"
                        : "text-white/80",
                    )}
                  >
                    {item.icon && (
                      <item.icon className="w-5 h-5" aria-hidden />
                    )}
                    <span>{item.label}</span>
                  </div>
                  {isGroupOpen && (
                    <div className="mt-2 space-y-1 pl-8">
                      {item.children.map((child) => {
                        const isActive =
                          location === child.href ||
                          (child.href !== "/" &&
                            location.startsWith(child.href));
                        return (
                          <a
                            key={child.href}
                            href={child.href}
                            onClick={(e) => {
                              e.preventDefault();
                              setLocation(child.href);
                              onNavigate?.();
                            }}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                              isActive
                                ? "bg-sidebar-accent text-white"
                                : "text-white/70 hover:bg-white/10 hover:text-white",
                            )}
                            data-testid={`nav-${child.href
                              .replace(/\//g, "-")
                              .slice(1)}`}
                          >
                            {child.icon && (
                              <child.icon className="w-4 h-4" aria-hidden />
                            )}
                            {child.label}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const href = item.href;
            if (!href) return null;
            const isActive =
              location === href || (href !== "/" && location.startsWith(href));
            return (
              <a
                key={href}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  setLocation(href);
                  onNavigate?.();
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white",
                )}
                data-testid={`nav-${href.replace(/\//g, "-").slice(1) || "home"}`}
              >
                {item.icon && <item.icon className="w-5 h-5" aria-hidden />}
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
