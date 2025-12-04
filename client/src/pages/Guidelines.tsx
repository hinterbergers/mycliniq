import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, Book, Bookmark, BookmarkCheck, Clock, Filter, FileText, ExternalLink, Link2, Tag, Info, GraduationCap, ScrollText } from "lucide-react";
import { useState, useEffect } from "react";
import { knowledgeApi } from "@/lib/api";
import type { ProjectDocument } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface SOPData {
  id: number;
  title: string;
  type: "SOP" | "Leitlinie" | "Checkliste" | "Formular";
  updated: string;
  summary: string;
  content: string;
  tags: string[];
  important: boolean;
  awmfLink?: string;
  awmfTitle?: string;
  studies?: { title: string; authors: string; year: string }[];
}

const DUMMY_SOPS: SOPData[] = [
  {
    id: 1,
    title: "PPROM - Vorzeitiger Blasensprung",
    type: "SOP",
    updated: "25. Nov 2025",
    summary: "Vorgehen bei vorzeitigem Blasensprung vor der 37. SSW. Diagnostik, Antibiotikaprophylaxe und Lungenreifung.",
    content: "Diese SOP beschreibt das standardisierte Vorgehen bei PPROM (Preterm Premature Rupture of Membranes). Initiale Diagnostik umfasst Spekulumuntersuchung, Amnisure-Test und Ultraschall zur Fruchtwassermenge. Bei bestätigtem PPROM erfolgt stationäre Aufnahme, Antibiotikaprophylaxe nach Schema und bei <34+0 SSW die Lungenreifeinduktion mit Betamethason.",
    tags: ["PPROM", "Blasensprung", "Frühgeburt", "Notfall"],
    important: true,
    awmfLink: "https://register.awmf.org/de/leitlinien/detail/015-029",
    awmfTitle: "S2k-Leitlinie: Prävention und Therapie der Frühgeburt",
    studies: [
      { title: "Antibiotics for preterm rupture of membranes", authors: "Kenyon S, et al.", year: "2023" },
      { title: "Optimal timing of delivery in PPROM", authors: "Morris JM, et al.", year: "2022" }
    ]
  },
  {
    id: 2,
    title: "Präeklampsie & Eklampsie",
    type: "Leitlinie",
    updated: "20. Nov 2025",
    summary: "Aktualisierte Handlungsempfehlungen zur Diagnose und Therapie hypertensiver Schwangerschaftserkrankungen.",
    content: "Leitlinie zur Diagnose und Therapie der Präeklampsie. Kriterien: RR ≥140/90 mmHg + Proteinurie >300mg/24h oder Endorganbeteiligung nach 20. SSW. Therapie: Antihypertensiva (Nifedipin, Urapidil), Magnesiumsulfat zur Eklampsie-Prophylaxe, rechtzeitige Entbindungsplanung.",
    tags: ["Präeklampsie", "Eklampsie", "Blutdruck", "Notfall"],
    important: true,
    awmfLink: "https://register.awmf.org/de/leitlinien/detail/015-018",
    awmfTitle: "S2k-Leitlinie: Hypertensive Schwangerschaftserkrankungen",
    studies: [
      { title: "ASPRE trial - Aspirin for preeclampsia prevention", authors: "Rolnik DL, et al.", year: "2021" }
    ]
  },
  {
    id: 3,
    title: "Postpartale Hämorrhagie (PPH)",
    type: "SOP",
    updated: "12. Okt 2025",
    summary: "Stufenschema zur Versorgung bei verstärkter Blutung post partum. Medikamentöse und interventionelle Schritte.",
    content: "PPH-Stufenschema: Stufe 1 - Uterustonisierung (Oxytocin, Carbetocin), manuelle Plazentalösung wenn nötig. Stufe 2 - Sulproston, bimanuelle Kompression, Bakri-Ballon. Stufe 3 - Operative Intervention (B-Lynch, Hysterektomie). Parallel Volumenersatz und Gerinnungsmanagement.",
    tags: ["PPH", "Blutung", "Kreißsaal", "Notfall"],
    important: true,
    awmfLink: "https://register.awmf.org/de/leitlinien/detail/015-063",
    awmfTitle: "S2k-Leitlinie: Peripartale Blutungen",
    studies: [
      { title: "WOMAN Trial - Tranexamic acid for PPH", authors: "WOMAN Trial Collaborators", year: "2017" }
    ]
  },
  {
    id: 4,
    title: "Sectio-Checkliste",
    type: "Checkliste",
    updated: "15. Sep 2025",
    summary: "Prä-, intra- und postoperative Checkliste für elektive und eilige Sectio caesarea.",
    content: "Präoperative Checks: Nüchternheit, Laborwerte, Kreuzblut, Antibiotikaprophylaxe, Thromboseprophylaxe. Intraoperativ: Team-Time-Out, OP-Situs, Dokumentation. Postoperativ: Vitalzeichen-Monitoring, Rückbildung, Stillanleitung, Thromboseprophylaxe fortführen.",
    tags: ["Sectio", "OP", "Checkliste"],
    important: false
  },
  {
    id: 5,
    title: "Aufklärungsbogen Sectio",
    type: "Formular",
    updated: "01. Sep 2025",
    summary: "Standardisierter Aufklärungsbogen für elektive und eilige Kaiserschnitt-Operationen.",
    content: "Patientenaufklärung über Ablauf, Risiken und Alternativen der Sectio caesarea. Inkl. Anästhesie-Aufklärung (Spinalanästhesie/Vollnarkose), postoperativer Verlauf, mögliche Komplikationen (Blutung, Infektion, Verletzungen).",
    tags: ["Sectio", "Aufklärung", "Formular"],
    important: false
  },
  {
    id: 6,
    title: "Endometriose - Diagnostik & Therapie",
    type: "Leitlinie",
    updated: "01. Aug 2025",
    summary: "Diagnostischer Pfad und Therapieoptionen bei Verdacht auf Endometriose.",
    content: "Diagnostik: Anamnese (Dysmenorrhoe, Dyspareunie, Infertilität), gynäkologische Untersuchung, transvaginale Sonografie. Therapie: Gestagene, GnRH-Analoga, operative Sanierung bei tief infiltrierender Endometriose.",
    tags: ["Endometriose", "Schmerz", "Laparoskopie"],
    important: false,
    awmfLink: "https://register.awmf.org/de/leitlinien/detail/015-045",
    awmfTitle: "S2k-Leitlinie: Diagnostik und Therapie der Endometriose",
    studies: []
  },
  {
    id: 7,
    title: "CTG-Beurteilung",
    type: "SOP",
    updated: "20. Jul 2025",
    summary: "Standardisierte Beurteilung des CTG nach FIGO-Kriterien mit Handlungsempfehlungen.",
    content: "CTG-Klassifikation nach FIGO: Normal, suspekt, pathologisch. Parameter: Baseline-Frequenz, Variabilität, Akzelerationen, Dezelerationen. Handlungsempfehlungen je nach Klassifikation inkl. Eskalationsstufen.",
    tags: ["CTG", "Geburtshilfe", "Monitoring"],
    important: false
  }
];

export default function Guidelines() {
  const [publishedDocs, setPublishedDocs] = useState<ProjectDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Alle");
  const [favorites, setFavorites] = useState<number[]>([1, 3]);
  const [selectedSOP, setSelectedSOP] = useState<SOPData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    loadPublishedDocs();
  }, []);

  const loadPublishedDocs = async () => {
    try {
      const docs = await knowledgeApi.getPublished();
      setPublishedDocs(docs);
    } catch (error) {
      console.error("Failed to load published documents:", error);
    }
  };

  const categories = ["Alle", "SOP", "Leitlinie", "Checkliste", "Formular"];

  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const openDetail = (sop: SOPData) => {
    setSelectedSOP(sop);
    setDetailOpen(true);
  };

  const getTypeBadgeStyle = (type: string) => {
    switch (type) {
      case "SOP":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "Leitlinie":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "Checkliste":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "Formular":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-secondary text-muted-foreground";
    }
  };

  const filteredSOPs = DUMMY_SOPS.filter(sop => {
    const matchesSearch = searchTerm === '' || 
      sop.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'Alle' || sop.type === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const favoriteSOPs = DUMMY_SOPS.filter(sop => favorites.includes(sop.id));

  return (
    <Layout title="SOPs & Leitlinien">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <div className="relative bg-white/50 p-8 rounded-3xl border border-white/20 shadow-sm text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-serif text-foreground">SOPs & Leitlinien</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Interne SOPs der Abteilung, ergänzend mit AWMF-Leitlinien und relevanten Studien.
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
                  placeholder="Suche nach SOP, Diagnose oder Schlagwort..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-sops"
                />
                <div className="pr-2 flex items-center">
                   <Button size="sm" className="h-10 rounded-lg px-6">Suchen</Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((cat) => (
              <Button 
                key={cat} 
                variant={selectedCategory === cat ? "default" : "outline"} 
                className={`rounded-full ${selectedCategory !== cat ? "bg-background/50 backdrop-blur-sm" : ""}`}
                size="sm"
                onClick={() => setSelectedCategory(cat)}
                data-testid={`button-category-${cat.toLowerCase()}`}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-lg font-semibold">Alle SOPs & Leitlinien</h3>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <Filter className="w-4 h-4" /> Filter
              </Button>
            </div>

            {filteredSOPs.map((sop) => (
              <Card 
                key={sop.id} 
                className="group hover:shadow-md transition-all duration-200 border-border/60 hover:border-primary/30 cursor-pointer" 
                onClick={() => openDetail(sop)}
                data-testid={`card-sop-${sop.id}`}
              >
                <CardContent className="p-5">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={getTypeBadgeStyle(sop.type)}>
                          {sop.type}
                        </Badge>
                        {sop.important && (
                          <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-100 shadow-none hover:bg-red-100">
                            Wichtig
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto sm:ml-0">
                          <Clock className="w-3 h-3" /> {sop.updated}
                        </span>
                      </div>
                      
                      <div>
                        <h4 className="text-xl font-serif font-medium text-foreground group-hover:text-primary transition-colors">
                          {sop.title}
                        </h4>
                        <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
                          {sop.summary}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {sop.tags.map((tag) => (
                          <span key={tag} className="text-xs font-medium text-primary/70 bg-primary/5 px-2 py-0.5 rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`shrink-0 ${favorites.includes(sop.id) ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                      onClick={(e) => toggleFavorite(sop.id, e)}
                      data-testid={`button-favorite-${sop.id}`}
                    >
                      {favorites.includes(sop.id) ? (
                        <BookmarkCheck className="w-5 h-5" />
                      ) : (
                        <Bookmark className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">Automatische Verlinkung</p>
                <p>
                  Begriffe wie „PPROM", „Blasensprung" oder „Präeklampsie" werden in der App 
                  automatisch mit den passenden SOPs verlinkt. Klicken Sie auf verlinkte Begriffe, 
                  um direkt zur entsprechenden SOP zu gelangen.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="bg-primary/5 border-primary/10 shadow-none">
              <CardContent className="p-5 space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-2">
                  <Book className="w-6 h-6" />
                </div>
                <h4 className="font-semibold text-lg">Meine Favoriten</h4>
                <p className="text-sm text-muted-foreground">
                  Schneller Zugriff auf Ihre meistgenutzten SOPs.
                </p>
                <div className="space-y-2">
                  {favoriteSOPs.length > 0 ? favoriteSOPs.map(sop => (
                    <div 
                      key={sop.id} 
                      className="flex items-center gap-3 p-2 rounded-lg bg-background border border-border/50 hover:border-primary/30 cursor-pointer transition-colors"
                      onClick={() => openDetail(sop)}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="text-sm font-medium">{sop.title}</span>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground italic">Keine Favoriten gesetzt</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h4 className="font-semibold mb-4">Kürzlich angesehen</h4>
                <div className="space-y-3">
                   <div className="text-sm p-2 hover:bg-secondary/50 rounded-md cursor-pointer transition-colors">
                     <p className="font-medium">CTG-Beurteilung</p>
                     <p className="text-xs text-muted-foreground">Vor 2 Stunden</p>
                   </div>
                   <div className="text-sm p-2 hover:bg-secondary/50 rounded-md cursor-pointer transition-colors">
                     <p className="font-medium">PPROM - Vorzeitiger Blasensprung</p>
                     <p className="text-xs text-muted-foreground">Gestern</p>
                   </div>
                   <div className="text-sm p-2 hover:bg-secondary/50 rounded-md cursor-pointer transition-colors">
                     <p className="font-medium">Sectio-Checkliste</p>
                     <p className="text-xs text-muted-foreground">Vor 3 Tagen</p>
                   </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedSOP && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={getTypeBadgeStyle(selectedSOP.type)}>
                    {selectedSOP.type}
                  </Badge>
                  {selectedSOP.important && (
                    <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-100">
                      Wichtig
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-2xl font-serif">{selectedSOP.title}</DialogTitle>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Zuletzt aktualisiert: {selectedSOP.updated}
                </p>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <ScrollText className="w-4 h-4" />
                    Inhalt / Kurzfassung
                  </h4>
                  <div className="p-4 bg-muted/30 rounded-lg text-sm leading-relaxed">
                    {selectedSOP.content}
                  </div>
                </div>

                {selectedSOP.awmfLink && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <ExternalLink className="w-4 h-4" />
                        Verknüpfte AWMF-Leitlinie
                      </h4>
                      <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                        <p className="text-sm font-medium text-purple-800">{selectedSOP.awmfTitle}</p>
                        <a 
                          href={selectedSOP.awmfLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:underline flex items-center gap-1 mt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link2 className="w-3 h-3" />
                          AWMF-Register öffnen (Placeholder)
                        </a>
                      </div>
                    </div>
                  </>
                )}

                {selectedSOP.studies && selectedSOP.studies.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-2">
                        <GraduationCap className="w-4 h-4" />
                        Aktuelle Studien
                      </h4>
                      <div className="space-y-2">
                        {selectedSOP.studies.map((study, i) => (
                          <div key={i} className="p-3 bg-muted/30 rounded-lg">
                            <p className="text-sm font-medium">{study.title}</p>
                            <p className="text-xs text-muted-foreground">{study.authors} ({study.year})</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <Separator />
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Schlagworte
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Diese Begriffe werden automatisch in anderen Texten verlinkt.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedSOP.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="bg-primary/10 text-primary">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(selectedSOP.id, e);
                  }}
                >
                  {favorites.includes(selectedSOP.id) ? (
                    <>
                      <BookmarkCheck className="w-4 h-4" />
                      Aus Favoriten entfernen
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-4 h-4" />
                      Zu Favoriten hinzufügen
                    </>
                  )}
                </Button>
                <Button onClick={() => setDetailOpen(false)}>Schließen</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
