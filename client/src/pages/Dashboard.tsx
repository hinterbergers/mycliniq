import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, FileText, ArrowRight, AlertCircle, CheckCircle2, Baby, Activity } from "lucide-react";

export default function Dashboard() {
  return (
    <Layout title="Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Welcome Section */}
        <div className="md:col-span-8 space-y-6">
          <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-8 text-primary-foreground shadow-lg shadow-primary/10">
            <div className="flex items-center justify-between mb-2">
               <h2 className="text-3xl font-bold">Guten Morgen, Dr. Müller</h2>
               <Badge variant="outline" className="text-primary-foreground border-primary-foreground/30 bg-primary-foreground/10">
                  KABEG Klinikum Klagenfurt
               </Badge>
            </div>
            <p className="text-primary-foreground/80 max-w-xl text-lg">
              Sie haben heute Dienst im Kreißsaal. Aktuell 3 laufende Geburten.
              Der Bereich Gyn-Ambulanz ist zu 80% ausgelastet.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" className="text-primary font-medium shadow-none border-0">
                Zum Dienstplan
              </Button>
              <Button variant="outline" className="bg-transparent border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                Urlaub beantragen
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Aufnahmen heute", value: "8", icon: UsersIcon, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Geburten lfd.", value: "3", icon: Baby, color: "text-pink-500", bg: "bg-pink-500/10" },
              { label: "OPs geplant", value: "5", icon: Activity, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            ].map((stat, i) => (
              <Card key={i} className="border-none shadow-sm">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">{stat.label}</p>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent Guidelines */}
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Neue Leitlinien Gyn/Geb</CardTitle>
              <Button variant="ghost" size="sm" className="text-muted-foreground">Alle anzeigen</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { title: "Präeklampsie Management", cat: "Geburtshilfe", date: "Vor 2 Tagen" },
                  { title: "Endometriose Diagnostik", cat: "Gynäkologie", date: "Vor 5 Tagen" },
                  { title: "Postpartale Hämorrhagie", cat: "Notfall", date: "Vor 1 Woche" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors border border-transparent hover:border-border group cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">{item.title}</h4>
                        <p className="text-xs text-muted-foreground">{item.cat}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{item.date}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Right - Schedule */}
        <div className="md:col-span-4 space-y-6">
          <Card className="h-full border-none shadow-sm flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Mein Dienstplan</CardTitle>
              <CardDescription>Nächste 7 Tage</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="relative border-l-2 border-border ml-3 space-y-8 pb-4">
                {[
                  { day: "Heute", date: "30. Nov", shift: "Frühdienst", time: "07:00 - 15:30", type: "current" },
                  { day: "Morgen", date: "01. Dez", shift: "Spätdienst", time: "14:30 - 23:00", type: "upcoming" },
                  { day: "Dienstag", date: "02. Dez", shift: "Nachtdienst", time: "22:30 - 07:00", type: "upcoming" },
                  { day: "Mittwoch", date: "03. Dez", shift: "Frei", time: "-", type: "off" },
                ].map((item, i) => (
                  <div key={i} className="relative pl-6">
                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-background ${
                      item.type === 'current' ? 'bg-primary' : 
                      item.type === 'off' ? 'bg-muted-foreground/30' : 'bg-primary/40'
                    }`} />
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.day}, <span className="text-muted-foreground">{item.date}</span></p>
                        <h4 className={`text-base font-semibold mt-1 ${item.type === 'off' ? 'text-muted-foreground' : 'text-primary'}`}>
                          {item.shift}
                        </h4>
                      </div>
                      <Badge variant="secondary" className="font-mono text-xs">{item.time}</Badge>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-6 border-t border-border">
                 <div className="flex items-center justify-between mb-4">
                   <span className="text-sm font-medium text-muted-foreground">Urlaubstage 2025</span>
                   <span className="text-sm font-bold text-foreground">24 / 30</span>
                 </div>
                 <div className="h-2 bg-secondary rounded-full overflow-hidden">
                   <div className="h-full bg-primary w-[80%] rounded-full" />
                 </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function UsersIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
