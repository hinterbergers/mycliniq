import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Book, ArrowRight, Bookmark, Clock, Filter } from "lucide-react";

export default function Guidelines() {
  const categories = ["Alle", "Geburtshilfe", "Gynäkologie", "Onkologie", "Notfallmedizin", "Pflege"];
  
  const guidelines = [
    {
      title: "Präeklampsie & Eklampsie",
      category: "Geburtshilfe",
      updated: "25. Nov 2025",
      summary: "Aktualisierte Handlungsempfehlungen zur Diagnose und Therapie hypertensiver Schwangerschaftserkrankungen.",
      tags: ["Notfall", "Schwangerschaft", "Blutdruck"],
      important: true
    },
    {
      title: "Postpartale Hämorrhagie (PPH)",
      category: "Notfallmedizin",
      updated: "12. Okt 2025",
      summary: "Stufenschema zur Versorgung bei verstärkter Blutung post partum. Medikamentöse und interventionelle Schritte.",
      tags: ["Notfall", "Blutung", "Kreißsaal"],
      important: true
    },
    {
      title: "Endometriose Leitlinie",
      category: "Gynäkologie",
      updated: "01. Sep 2025",
      summary: "Diagnostischer Pfad und Therapieoptionen bei Verdacht auf Endometriose.",
      tags: ["Chronisch", "Schmerz", "Laparoskopie"],
      important: false
    },
    {
      title: "Sectio caesarea - OP Ablauf",
      category: "Geburtshilfe",
      updated: "15. Aug 2025",
      summary: "Standardablauf für elektive und eilige Sectio. Antibiotikaprophylaxe und Nahttechnik.",
      tags: ["OP", "Sectio", "Standard"],
      important: false
    },
    {
      title: "Mammakarzinom Nachsorge",
      category: "Onkologie",
      updated: "10. Aug 2025",
      summary: "Empfehlungen zur Nachsorgeintervalle und Bildgebung.",
      tags: ["Brustkrebs", "Nachsorge", "Screening"],
      important: false
    }
  ];

  return (
    <Layout title="Wissensmanagement">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Search Header */}
        <div className="relative bg-white/50 p-8 rounded-3xl border border-white/20 shadow-sm text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-serif text-foreground">Medizinische Leitlinien</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Greifen Sie schnell auf validierte SOPs, Behandlungspfade und Medikamenten-Dosierungen zu.
            </p>
          </div>
          
          <div className="max-w-2xl mx-auto relative">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
              <div className="relative flex bg-background rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <Input 
                  className="h-14 border-0 shadow-none focus-visible:ring-0 text-lg bg-transparent" 
                  placeholder="Suche nach Diagnose, Symptom oder Medikament..." 
                />
                <div className="pr-2 flex items-center">
                   <Button size="sm" className="h-10 rounded-lg px-6">Suchen</Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((cat, i) => (
              <Button 
                key={cat} 
                variant={i === 0 ? "default" : "outline"} 
                className={`rounded-full ${i !== 0 ? "bg-background/50 backdrop-blur-sm" : ""}`}
                size="sm"
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-lg font-semibold">Aktuelle Leitlinien</h3>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <Filter className="w-4 h-4" /> Filter
              </Button>
            </div>

            {guidelines.map((guide, i) => (
              <Card key={i} className="group hover:shadow-md transition-all duration-200 border-border/60 hover:border-primary/30 cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-secondary/50 hover:bg-secondary text-muted-foreground font-normal">
                          {guide.category}
                        </Badge>
                        {guide.important && (
                          <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-100 shadow-none hover:bg-red-100">
                            Wichtig
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto sm:ml-0">
                          <Clock className="w-3 h-3" /> {guide.updated}
                        </span>
                      </div>
                      
                      <div>
                        <h4 className="text-xl font-serif font-medium text-foreground group-hover:text-primary transition-colors">
                          {guide.title}
                        </h4>
                        <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
                          {guide.summary}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {guide.tags.map(tag => (
                          <span key={tag} className="text-xs font-medium text-primary/70 bg-primary/5 px-2 py-0.5 rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary shrink-0">
                      <Bookmark className="w-5 h-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Sidebar Widgets */}
          <div className="space-y-6">
            <Card className="bg-primary/5 border-primary/10 shadow-none">
              <CardContent className="p-5 space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-2">
                  <Book className="w-6 h-6" />
                </div>
                <h4 className="font-semibold text-lg">Meine Favoriten</h4>
                <p className="text-sm text-muted-foreground">
                  Schneller Zugriff auf Ihre meistgenutzten Leitlinien.
                </p>
                <div className="space-y-2">
                  {["Tokolyse-Schema", "Reanimations-Algorithmus Neugeborene", "Antibiotika in Schwangerschaft"].map(item => (
                    <div key={item} className="flex items-center gap-3 p-2 rounded-lg bg-background border border-border/50 hover:border-primary/30 cursor-pointer transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="text-sm font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h4 className="font-semibold mb-4">Kürzlich angesehen</h4>
                <div className="space-y-3">
                   <div className="text-sm p-2 hover:bg-secondary/50 rounded-md cursor-pointer transition-colors">
                     <p className="font-medium">COPD Exazerbation</p>
                     <p className="text-xs text-muted-foreground">Vor 2 Stunden</p>
                   </div>
                   <div className="text-sm p-2 hover:bg-secondary/50 rounded-md cursor-pointer transition-colors">
                     <p className="font-medium">Vorhofflimmern</p>
                     <p className="text-xs text-muted-foreground">Gestern</p>
                   </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
