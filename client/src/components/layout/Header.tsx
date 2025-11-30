import { Bell, Search, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Header({ title }: { title?: string }) {
  return (
    <header className="h-16 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-10 px-6 flex items-center justify-between">
      <h2 className="text-xl font-semibold text-foreground tracking-tight">{title}</h2>
      
      <div className="flex items-center gap-4">
        <div className="relative w-64 hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Suchen..." 
            className="pl-9 bg-background border-border/50 focus-visible:ring-primary/20" 
          />
        </div>
        
        <Button variant="outline" size="icon" className="rounded-full border-border/50 relative">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-destructive rounded-full border-2 border-background"></span>
        </Button>
        
        <Button variant="outline" size="sm" className="hidden md:flex gap-2 text-muted-foreground border-border/50">
          <Calendar className="w-4 h-4" />
          <span>30. Nov 2025</span>
        </Button>
      </div>
    </header>
  );
}
