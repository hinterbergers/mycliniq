import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toolsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Baby, TestTube2, Sparkles, Ruler } from "lucide-react";
import { addDays, subDays, differenceInDays, format, startOfDay } from "date-fns";

type ToolKey = "pregnancy_weeks" | "pul_calculator" | "body_surface_area";

const TOOL_CATALOG: Array<{
  key: ToolKey;
  title: string;
  description: string;
  icon: typeof Baby;
  accent: string;
  bg: string;
}> = [
  {
    key: "pregnancy_weeks",
    title: "Schwangerschaftswochen-Rechner",
    description: "SSW und ET aus letzter Periode oder ET berechnen.",
    icon: Baby,
    accent: "text-rose-600",
    bg: "bg-rose-50"
  },
  {
    key: "pul_calculator",
    title: "PUL-Rechner",
    description: "hCG-Ratio und Verlaufstendenz berechnen.",
    icon: TestTube2,
    accent: "text-amber-600",
    bg: "bg-amber-50"
  },
  {
    key: "body_surface_area",
    title: "Körperoberflächen-Rechner",
    description: "Körperoberfläche (Mosteller) aus Größe und Gewicht.",
    icon: Ruler,
    accent: "text-sky-600",
    bg: "bg-sky-50"
  }
];

const DEFAULT_VISIBILITY: Record<ToolKey, boolean> = {
  pregnancy_weeks: true,
  pul_calculator: true,
  body_surface_area: true
};

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const safe = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(safe);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function PregnancyWeeksCalculator() {
  const [tab, setTab] = useState<"lmp" | "edd">("lmp");
  const [lmpInput, setLmpInput] = useState("");
  const [eddInput, setEddInput] = useState("");

  const { referenceDate, dueDate, diffDays } = useMemo(() => {
    if (tab === "lmp") {
      const lmp = parseDateValue(lmpInput);
      if (!lmp) {
        return { referenceDate: null, dueDate: null, diffDays: null };
      }
      return {
        referenceDate: lmp,
        dueDate: addDays(lmp, 280),
        diffDays: differenceInDays(startOfDay(new Date()), startOfDay(lmp))
      };
    }

    const edd = parseDateValue(eddInput);
    if (!edd) {
      return { referenceDate: null, dueDate: null, diffDays: null };
    }
    const lmpFromEdd = subDays(edd, 280);
    return {
      referenceDate: lmpFromEdd,
      dueDate: edd,
      diffDays: differenceInDays(startOfDay(new Date()), startOfDay(lmpFromEdd))
    };
  }, [tab, lmpInput, eddInput]);

  const displayWeeks = diffDays !== null && diffDays >= 0 ? Math.floor(diffDays / 7) : null;
  const displayDays = diffDays !== null && diffDays >= 0 ? diffDays % 7 : null;

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(value) => setTab(value as "lmp" | "edd")}>
        <TabsList>
          <TabsTrigger value="lmp">Letzte Periode</TabsTrigger>
          <TabsTrigger value="edd">Errechneter Termin</TabsTrigger>
        </TabsList>
        <TabsContent value="lmp" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lmp-date">Datum der letzten Periode (LMP)</Label>
            <Input
              id="lmp-date"
              type="date"
              value={lmpInput}
              onChange={(event) => setLmpInput(event.target.value)}
            />
          </div>
        </TabsContent>
        <TabsContent value="edd" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edd-date">Errechneter Termin (ET)</Label>
            <Input
              id="edd-date"
              type="date"
              value={eddInput}
              onChange={(event) => setEddInput(event.target.value)}
            />
          </div>
        </TabsContent>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="p-6 space-y-4">
          {diffDays === null ? (
            <p className="text-sm text-muted-foreground">Bitte Datum eingeben, um die Schwangerschaftswoche zu berechnen.</p>
          ) : diffDays < 0 ? (
            <p className="text-sm text-amber-600">Das angegebene Datum liegt in der Zukunft.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Schwangerschaftsalter</p>
                <p className="text-2xl font-semibold">
                  SSW {displayWeeks}+{displayDays}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Tage seit LMP</p>
                <p className="text-2xl font-semibold">{diffDays}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Errechneter Termin</p>
                <p className="text-2xl font-semibold">
                  {dueDate ? format(dueDate, "dd.MM.yyyy") : "—"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PulCalculator() {
  const [hcg0, setHcg0] = useState("");
  const [hcg48, setHcg48] = useState("");

  const parsed0 = Number(hcg0);
  const parsed48 = Number(hcg48);
  const ratio = parsed0 > 0 && parsed48 > 0 ? parsed48 / parsed0 : null;
  const delta = ratio ? (ratio - 1) * 100 : null;

  const interpretation = useMemo(() => {
    if (!ratio) return null;
    if (ratio < 0.87) {
      return {
        label: "Fallender Verlauf",
        detail: "Spricht eher für nicht vitale Schwangerschaft."
      };
    }
    if (ratio < 1.66) {
      return {
        label: "Grenzbereich",
        detail: "Verlauf kontrollieren und klinisch einordnen."
      };
    }
    return {
      label: "Ansteigender Verlauf",
      detail: "Spricht eher für intrauterine Schwangerschaft."
    };
  }, [ratio]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hcg-0">hCG (0 h)</Label>
          <Input
            id="hcg-0"
            type="number"
            inputMode="decimal"
            placeholder="z.B. 1200"
            value={hcg0}
            onChange={(event) => setHcg0(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hcg-48">hCG (48 h)</Label>
          <Input
            id="hcg-48"
            type="number"
            inputMode="decimal"
            placeholder="z.B. 1800"
            value={hcg48}
            onChange={(event) => setHcg48(event.target.value)}
          />
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-6 space-y-4">
          {!ratio ? (
            <p className="text-sm text-muted-foreground">Bitte beide Werte eingeben, um die Ratio zu berechnen.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground">hCG-Ratio</p>
                <p className="text-2xl font-semibold">{ratio.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Veränderung</p>
                <p className="text-2xl font-semibold">{delta ? `${delta.toFixed(1)}%` : "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase text-muted-foreground">Einschätzung</p>
                <p className="text-base font-semibold">{interpretation?.label ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{interpretation?.detail ?? ""}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Hinweis: Richtwerte für die Verlaufstendenz. Klinische Beurteilung bleibt erforderlich.
      </p>
    </div>
  );
}

function BodySurfaceAreaCalculator() {
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [therapy, setTherapy] = useState<"none" | "mtx">("none");

  const heightValue = Number(heightCm);
  const weightValue = Number(weightKg);
  const hasValues = heightValue > 0 && weightValue > 0;
  const bsa = hasValues ? Math.sqrt((heightValue * weightValue) / 3600) : null;
  const mtxDose = therapy === "mtx" && bsa ? bsa * 50 : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bsa-height">Größe (cm)</Label>
          <Input
            id="bsa-height"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="z.B. 172"
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bsa-weight">Gewicht (kg)</Label>
          <Input
            id="bsa-weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="z.B. 68"
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2 max-w-sm">
        <Label htmlFor="bsa-therapy">Therapie-Auswahl</Label>
        <Select value={therapy} onValueChange={(value) => setTherapy(value as "none" | "mtx")}>
          <SelectTrigger id="bsa-therapy">
            <SelectValue placeholder="Auswahl" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Leer</SelectItem>
            <SelectItem value="mtx">MTX</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-6 space-y-4">
          {!hasValues ? (
            <p className="text-sm text-muted-foreground">Bitte Größe und Gewicht eingeben, um die Körperoberfläche zu berechnen.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Körperoberfläche</p>
                <p className="text-2xl font-semibold">{bsa?.toFixed(2)} m²</p>
              </div>
              {therapy === "mtx" && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">MTX Dosis</p>
                  <p className="text-2xl font-semibold">{mtxDose ? `${mtxDose.toFixed(1)} mg` : "—"}</p>
                  <p className="text-xs text-muted-foreground">KOF × 50 mg</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase text-muted-foreground">Formel</p>
                <p className="text-sm text-muted-foreground">Mosteller: √((Größe cm × Gewicht kg) / 3600)</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Tools() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [visibility, setVisibility] = useState<Record<ToolKey, boolean>>(DEFAULT_VISIBILITY);
  const [selectedTool, setSelectedTool] = useState<ToolKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ToolKey | null>(null);

  useEffect(() => {
    const loadVisibility = async () => {
      setLoading(true);
      try {
        const settings = await toolsApi.getVisibility();
        const map = settings.reduce<Record<ToolKey, boolean>>((acc, setting) => {
          acc[setting.toolKey as ToolKey] = setting.isEnabled;
          return acc;
        }, { ...DEFAULT_VISIBILITY });
        setVisibility(map);
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Tool-Einstellungen konnten nicht geladen werden.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadVisibility();
  }, [toast]);

  const toolsToDisplay = useMemo(() => {
    if (isAdmin) {
      return TOOL_CATALOG;
    }
    return TOOL_CATALOG.filter((tool) => visibility[tool.key] !== false);
  }, [isAdmin, visibility]);

  useEffect(() => {
    if (!selectedTool && toolsToDisplay.length) {
      setSelectedTool(toolsToDisplay[0].key);
    }
  }, [selectedTool, toolsToDisplay]);

  const handleToggle = async (key: ToolKey, nextValue: boolean) => {
    setSavingKey(key);
    try {
      const updated = await toolsApi.updateVisibility([{ toolKey: key, isEnabled: nextValue }]);
      const map = updated.reduce<Record<ToolKey, boolean>>((acc, setting) => {
        acc[setting.toolKey as ToolKey] = setting.isEnabled;
        return acc;
      }, { ...DEFAULT_VISIBILITY });
      setVisibility(map);
      toast({ title: "Gespeichert", description: "Tool-Sichtbarkeit aktualisiert." });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Änderung konnte nicht gespeichert werden.",
        variant: "destructive"
      });
      setVisibility((prev) => ({ ...prev, [key]: !nextValue }));
    } finally {
      setSavingKey(null);
    }
  };

  const renderToolContent = () => {
    if (!selectedTool) return null;
    if (selectedTool === "pregnancy_weeks") {
      return <PregnancyWeeksCalculator />;
    }
    if (selectedTool === "pul_calculator") {
      return <PulCalculator />;
    }
    return <BodySurfaceAreaCalculator />;
  };

  return (
    <Layout title="Tools">
      <div className="space-y-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Praktische Helfer</h2>
          <p className="text-muted-foreground">
            Ausgewählte Tools für schnelle Berechnungen im klinischen Alltag.
          </p>
        </div>

        {isAdmin && (
          <Card className="border-none shadow-sm bg-secondary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-4 h-4" />
                Tools für Ihre Abteilung ein- oder ausblenden
              </CardTitle>
              <CardDescription>
                Diese Auswahl gilt für alle Nutzer Ihrer Abteilung.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {TOOL_CATALOG.map((tool) => (
                <div key={tool.key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{tool.title}</p>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                  <Switch
                    checked={visibility[tool.key]}
                    onCheckedChange={(value) => handleToggle(tool.key, Boolean(value))}
                    disabled={savingKey === tool.key || loading}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {toolsToDisplay.map((tool) => {
            const isDisabled = visibility[tool.key] === false;
            const isActive = selectedTool === tool.key;
            return (
              <Card
                key={tool.key}
                className={`border-none kabeg-shadow transition-all cursor-pointer group ${
                  isActive ? "ring-2 ring-primary/40" : "hover:shadow-md"
                } ${isDisabled && isAdmin ? "opacity-70" : ""}`}
                onClick={() => setSelectedTool(tool.key)}
              >
                <CardContent className="p-6 flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${tool.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                    <tool.icon className={`w-6 h-6 ${tool.accent}`} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{tool.title}</h3>
                      {isDisabled && isAdmin && (
                        <Badge variant="outline" className="text-xs">
                          Ausgeblendet
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm">{tool.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!toolsToDisplay.length && !loading && (
            <Card className="border-none shadow-sm">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Für Ihre Abteilung sind derzeit keine Tools aktiviert.
              </CardContent>
            </Card>
          )}
        </div>

        {selectedTool && (isAdmin || visibility[selectedTool]) && (
          <Card className="border-none kabeg-shadow">
            <CardHeader>
              <CardTitle>{TOOL_CATALOG.find((tool) => tool.key === selectedTool)?.title}</CardTitle>
              <CardDescription>
                {TOOL_CATALOG.find((tool) => tool.key === selectedTool)?.description}
              </CardDescription>
            </CardHeader>
            <CardContent>{renderToolContent()}</CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
