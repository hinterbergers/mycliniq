import { Bell, Search, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Header({ title }: { title?: string }) {
  return (
    <header className="h-16 kabeg-header sticky top-0 z-10 px-6 flex items-center justify-between shadow-sm">
      <h2 className="text-xl font-semibold text-white tracking-tight">{title}</h2>
      
      <div className="flex items-center gap-4">
        <div className="relative w-64 hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/60" />
          <Input 
            placeholder="Suchen..." 
            className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30" 
          />
        </div>
        
        <Button variant="ghost" size="icon" className="rounded-full text-white/80 hover:text-white hover:bg-white/10 relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-red-400 rounded-full"></span>
        </Button>
        
        <Button variant="ghost" size="sm" className="hidden md:flex gap-2 text-white/80 hover:text-white hover:bg-white/10">
          <Calendar className="w-4 h-4" />
          <span>30. Nov 2025</span>
        </Button>
      </div>
    </header>
  );
}
