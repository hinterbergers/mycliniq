import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ReactNode, useEffect, useState } from "react";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  disableMotion?: boolean;
}

const DESKTOP_SIDEBAR_COLLAPSED_KEY = "layout_desktop_sidebar_collapsed";

export function Layout({ children, title, disableMotion }: LayoutProps) {
  const contentClassName = disableMotion
    ? "max-w-7xl mx-auto w-full"
    : "max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DESKTOP_SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DESKTOP_SIDEBAR_COLLAPSED_KEY,
        desktopSidebarCollapsed ? "1" : "0",
      );
    } catch {
      // ignore localStorage issues
    }
  }, [desktopSidebarCollapsed]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div
        className={`hidden md:block overflow-hidden transition-[width] duration-300 ease-out ${
          desktopSidebarCollapsed ? "w-0" : "w-64"
        }`}
      >
        <Sidebar collapsed={desktopSidebarCollapsed} />
      </div>
      <main className="flex-1 min-h-0 flex flex-col min-w-0">
        <Header
          title={title}
          onToggleMobileNav={() => setMobileNavOpen((prev) => !prev)}
          desktopSidebarCollapsed={desktopSidebarCollapsed}
          onToggleDesktopSidebar={() =>
            setDesktopSidebarCollapsed((prev) => !prev)
          }
        />
        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          <div className={contentClassName}>{children}</div>
        </div>
      </main>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Menü schließen"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <Sidebar
              variant="mobile"
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
