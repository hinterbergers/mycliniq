import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  disableMotion?: boolean;
}

export function Layout({ children, title, disableMotion }: LayoutProps) {
  const contentClassName = disableMotion
    ? "max-w-7xl mx-auto w-full"
    : "max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500";

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <Header title={title} />
        <div className="flex-1 p-6 overflow-y-auto">
          <div className={contentClassName}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
