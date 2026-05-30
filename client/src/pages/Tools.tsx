import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toolsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Baby,
  TestTube2,
  Sparkles,
  Ruler,
  Calculator,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  addDays,
  subDays,
  differenceInDays,
  format,
  startOfDay,
} from "date-fns";

type ToolKey =
  | "pregnancy_weeks"
  | "pul_calculator"
  | "body_surface_area"
  | "bishop_score";

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
    bg: "bg-rose-50",
  },
  {
    key: "pul_calculator",
    title: "PUL-Rechner",
    description: "hCG-Ratio und Verlaufstendenz berechnen.",
    icon: TestTube2,
    accent: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    key: "body_surface_area",
    title: "Körperoberflächen-Rechner",
    description: "Körperoberfläche (Mosteller) aus Größe und Gewicht.",
    icon: Ruler,
    accent: "text-sky-600",
    bg: "bg-sky-50",
  },
  {
    key: "bishop_score",
    title: "Bishop-Score-Rechner",
    description: "Zervixbefund strukturiert erfassen und Bishop-Score berechnen.",
    icon: Calculator,
    accent: "text-emerald-600",
    bg: "bg-emerald-50",
  },
];

const DEFAULT_VISIBILITY: Record<ToolKey, boolean> = {
  pregnancy_weeks: true,
  pul_calculator: true,
  body_surface_area: true,
  bishop_score: true,
};

const DEFAULT_SORT_ORDER: Record<ToolKey, number> = {
  pregnancy_weeks: 0,
  pul_calculator: 1,
  body_surface_area: 2,
  bishop_score: 3,
};

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const safe = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(safe);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function PregnancyWeeksCalculator() {
  const [tab, setTab] = useState<"lmp" | "edd" | "ivf">("lmp");
  const [lmpInput, setLmpInput] = useState("");
  const [eddInput, setEddInput] = useState("");
  const [transferInput, setTransferInput] = useState("");
  const [embryoAgeDays, setEmbryoAgeDays] = useState("5");

  const { referenceDate, dueDate, diffDays } = useMemo(() => {
    if (tab === "lmp") {
      const lmp = parseDateValue(lmpInput);
      if (!lmp) {
        return { referenceDate: null, dueDate: null, diffDays: null };
      }
      return {
        referenceDate: lmp,
        dueDate: addDays(lmp, 280),
        diffDays: differenceInDays(startOfDay(new Date()), startOfDay(lmp)),
      };
    }

    if (tab === "ivf") {
      const transferDate = parseDateValue(transferInput);
      const embryoAge = Number(embryoAgeDays);
      if (
        !transferDate ||
        !Number.isFinite(embryoAge) ||
        embryoAge < 3 ||
        embryoAge > 5
      ) {
        return { referenceDate: null, dueDate: null, diffDays: null };
      }
      const lmpFromTransfer = subDays(transferDate, embryoAge + 14);
      return {
        referenceDate: lmpFromTransfer,
        dueDate: addDays(lmpFromTransfer, 280),
        diffDays: differenceInDays(
          startOfDay(new Date()),
          startOfDay(lmpFromTransfer),
        ),
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
      diffDays: differenceInDays(
        startOfDay(new Date()),
        startOfDay(lmpFromEdd),
      ),
    };
  }, [tab, lmpInput, eddInput, transferInput, embryoAgeDays]);

  const displayWeeks =
    diffDays !== null && diffDays >= 0 ? Math.floor(diffDays / 7) : null;
  const displayDays = diffDays !== null && diffDays >= 0 ? diffDays % 7 : null;

  return (
    <div className="space-y-6">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "lmp" | "edd" | "ivf")}
      >
        <TabsList>
          <TabsTrigger value="lmp">Letzte Periode</TabsTrigger>
          <TabsTrigger value="edd">Errechneter Termin</TabsTrigger>
          <TabsTrigger value="ivf">IVF / Transfer</TabsTrigger>
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
        <TabsContent value="ivf" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="transfer-date">Transferdatum</Label>
            <Input
              id="transfer-date"
              type="date"
              value={transferInput}
              onChange={(event) => setTransferInput(event.target.value)}
            />
          </div>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="embryo-age">Embryo-Tag</Label>
            <Select value={embryoAgeDays} onValueChange={setEmbryoAgeDays}>
              <SelectTrigger id="embryo-age">
                <SelectValue placeholder="Embryo-Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Tag 3</SelectItem>
                <SelectItem value="4">Tag 4</SelectItem>
                <SelectItem value="5">Tag 5 (Blastozyste)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="p-6 space-y-4">
          {diffDays === null ? (
            <p className="text-sm text-muted-foreground">
              Bitte Datum eingeben, um die Schwangerschaftswoche zu berechnen.
            </p>
          ) : diffDays < 0 ? (
            <p className="text-sm text-amber-600">
              Das angegebene Datum liegt in der Zukunft.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Schwangerschaftsalter
                </p>
                <p className="text-2xl font-semibold">
                  SSW {displayWeeks}+{displayDays}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Tage seit LMP
                </p>
                <p className="text-2xl font-semibold">{diffDays}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Errechneter Termin
                </p>
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
  const [model, setModel] = useState<"ratio" | "progesterone">("ratio");
  const [progesterone, setProgesterone] = useState("");

  const parsed0 = Number(hcg0);
  const parsed48 = Number(hcg48);
  const ratio = parsed0 > 0 && parsed48 > 0 ? parsed48 / parsed0 : null;
  const delta = ratio ? (ratio - 1) * 100 : null;

  const interpretation = useMemo(() => {
    if (!ratio) return null;
    if (ratio < 0.87) {
      return {
        label: "Ratio < 0.87",
        detail: "Häufig abortiver Verlauf („failed PUL“).",
      };
    }
    if (ratio <= 1.65) {
      return {
        label: "Ratio 0.88–1.65",
        detail: "Erhöhtes Risiko für EUG – Verlauf eng kontrollieren.",
      };
    }
    return {
      label: "Ratio > 1.65",
      detail: "Wahrscheinliche intakte intrauterine Schwangerschaft.",
    };
  }, [ratio]);

  const probabilities = useMemo(() => {
    if (!ratio) return null;
    let intrauterin = 0;
    let extrauterin = 0;
    let abortiv = 0;
    let note = "";

    if (ratio < 0.87) {
      intrauterin = 10;
      extrauterin = 15;
      abortiv = 75;
    } else if (ratio <= 1.65) {
      intrauterin = 15;
      extrauterin = 65;
      abortiv = 20;
    } else {
      intrauterin = 70;
      extrauterin = 20;
      abortiv = 10;
    }

    if (model === "progesterone") {
      const progValue = Number(progesterone);
      if (!progesterone.trim()) {
        note = "Progesteronwert fehlt – Einordnung basiert auf der hCG-Ratio.";
      } else if (!Number.isFinite(progValue)) {
        note = "Ungültiger Progesteronwert – bitte prüfen.";
      } else if (progValue < 2) {
        intrauterin = 15;
        extrauterin = 10;
        abortiv = 75;
        note =
          "Progesteron < 2 nmol/L: niedriges EUG-Risiko, eher abortiver Verlauf.";
      } else {
        note = "Progesteron ergänzt die Einordnung (vereinfachtes M6-Modell).";
      }
    }

    return { intrauterin, extrauterin, abortiv, note };
  }, [ratio, model, progesterone]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="pul-model">Modell</Label>
          <Select
            value={model}
            onValueChange={(value) =>
              setModel(value as "ratio" | "progesterone")
            }
          >
            <SelectTrigger id="pul-model">
              <SelectValue placeholder="Modell auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ratio">β-hCG-Ratio</SelectItem>
              <SelectItem value="progesterone">
                M6 (hCG + Progesteron)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
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

      {model === "progesterone" && (
        <div className="space-y-2 max-w-sm">
          <Label htmlFor="progesterone">Progesteron (nmol/L)</Label>
          <Input
            id="progesterone"
            type="number"
            inputMode="decimal"
            placeholder="z.B. 1.8"
            value={progesterone}
            onChange={(event) => setProgesterone(event.target.value)}
          />
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="p-6 space-y-4">
          {!ratio ? (
            <p className="text-sm text-muted-foreground">
              Bitte beide Werte eingeben, um die Ratio zu berechnen.
            </p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    hCG-Ratio
                  </p>
                  <p className="text-2xl font-semibold">{ratio.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Veränderung
                  </p>
                  <p className="text-2xl font-semibold">
                    {delta ? `${delta.toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground">
                    Einschätzung
                  </p>
                  <p className="text-base font-semibold">
                    {interpretation?.label ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {interpretation?.detail ?? ""}
                  </p>
                </div>
              </div>
              {probabilities && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      Intrauterin
                    </p>
                    <p className="text-2xl font-semibold">
                      {probabilities.intrauterin}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      Extrauterin (EUG)
                    </p>
                    <p className="text-2xl font-semibold">
                      {probabilities.extrauterin}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      Abortiv
                    </p>
                    <p className="text-2xl font-semibold">
                      {probabilities.abortiv}%
                    </p>
                  </div>
                </div>
              )}
              {probabilities?.note && (
                <p className="text-xs text-muted-foreground">
                  {probabilities.note}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Hinweis: Vereinfachte Risikoklassifikation. Klinische Beurteilung bleibt
        erforderlich.
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
        <Select
          value={therapy}
          onValueChange={(value) => setTherapy(value as "none" | "mtx")}
        >
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
            <p className="text-sm text-muted-foreground">
              Bitte Größe und Gewicht eingeben, um die Körperoberfläche zu
              berechnen.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Körperoberfläche
                </p>
                <p className="text-2xl font-semibold">{bsa?.toFixed(2)} m²</p>
              </div>
              {therapy === "mtx" && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    MTX Dosis
                  </p>
                  <p className="text-2xl font-semibold">
                    {mtxDose ? `${mtxDose.toFixed(1)} mg` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">KOF × 50 mg</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Formel
                </p>
                <p className="text-sm text-muted-foreground">
                  Mosteller: √((Größe cm × Gewicht kg) / 3600)
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BishopScoreCalculator() {
  const [dilation, setDilation] = useState("0");
  const [effacement, setEffacement] = useState("0");
  const [station, setStation] = useState("0");
  const [consistency, setConsistency] = useState("0");
  const [position, setPosition] = useState("0");

  const score =
    Number(dilation) +
    Number(effacement) +
    Number(station) +
    Number(consistency) +
    Number(position);

  const interpretation =
    score >= 8
      ? {
          label: "Guenstiger Befund",
          detail:
            "Ein Bishop-Score ab 8 spricht fuer eine eher guenstige Zervixreife.",
        }
      : score >= 6
        ? {
            label: "Grenzwertiger Befund",
            detail:
              "Bei 6-7 Punkten ist die Zervixreife intermediär und der Kontext entscheidend.",
          }
        : {
            label: "Eher unguenstiger Befund",
            detail:
              "Ein Score bis 5 spricht eher fuer eine unreife Zervix und moeglichen Ripening-Bedarf.",
          };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="bishop-dilation">Muttermund</Label>
          <Select value={dilation} onValueChange={setDilation}>
            <SelectTrigger id="bishop-dilation">
              <SelectValue placeholder="Muttermund" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Geschlossen (0)</SelectItem>
              <SelectItem value="1">1-2 cm (1)</SelectItem>
              <SelectItem value="2">3-4 cm (2)</SelectItem>
              <SelectItem value="3">5+ cm (3)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bishop-effacement">Zervixlänge</Label>
          <Select value={effacement} onValueChange={setEffacement}>
            <SelectTrigger id="bishop-effacement">
              <SelectValue placeholder="Zervixlänge" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">&gt; 4 cm (0)</SelectItem>
              <SelectItem value="1">2-4 cm (1)</SelectItem>
              <SelectItem value="2">1-2 cm (2)</SelectItem>
              <SelectItem value="3">&lt; 1 cm (3)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bishop-station">Hoehenstand</Label>
          <Select value={station} onValueChange={setStation}>
            <SelectTrigger id="bishop-station">
              <SelectValue placeholder="Hoehenstand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">-3 (0)</SelectItem>
              <SelectItem value="1">-2 (1)</SelectItem>
              <SelectItem value="2">-1 / 0 (2)</SelectItem>
              <SelectItem value="3">+1 / +2 (3)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bishop-consistency">Konsistenz</Label>
          <Select value={consistency} onValueChange={setConsistency}>
            <SelectTrigger id="bishop-consistency">
              <SelectValue placeholder="Konsistenz" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Fest (0)</SelectItem>
              <SelectItem value="1">Mittel (1)</SelectItem>
              <SelectItem value="2">Weich (2)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bishop-position">Position</Label>
          <Select value={position} onValueChange={setPosition}>
            <SelectTrigger id="bishop-position">
              <SelectValue placeholder="Position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Posterior (0)</SelectItem>
              <SelectItem value="1">Mittig (1)</SelectItem>
              <SelectItem value="2">Anterior (2)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground">
                Bishop-Score
              </p>
              <p className="text-2xl font-semibold">{score}</p>
            </div>
            <div className="md:col-span-2 space-y-1">
              <p className="text-xs uppercase text-muted-foreground">
                Einordnung
              </p>
              <p className="text-base font-semibold">{interpretation.label}</p>
              <p className="text-xs text-muted-foreground">
                {interpretation.detail}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Hinweis: Vereinfachte klinische Orientierung. Die geburtshilfliche
        Gesamtbeurteilung bleibt ausschlaggebend.
      </p>
    </div>
  );
}

export default function Tools() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [visibility, setVisibility] =
    useState<Record<ToolKey, boolean>>(DEFAULT_VISIBILITY);
  const [sortOrder, setSortOrder] =
    useState<Record<ToolKey, number>>(DEFAULT_SORT_ORDER);
  const [selectedTool, setSelectedTool] = useState<ToolKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ToolKey | null>(null);

  useEffect(() => {
    const loadVisibility = async () => {
      setLoading(true);
      try {
        const settings = await toolsApi.getVisibility();
        const map = settings.reduce<Record<ToolKey, boolean>>(
          (acc, setting) => {
            acc[setting.toolKey as ToolKey] = setting.isEnabled;
            return acc;
          },
          { ...DEFAULT_VISIBILITY },
        );
        const orderMap = settings.reduce<Record<ToolKey, number>>(
          (acc, setting) => {
            acc[setting.toolKey as ToolKey] = setting.sortOrder;
            return acc;
          },
          { ...DEFAULT_SORT_ORDER },
        );
        setVisibility(map);
        setSortOrder(orderMap);
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Tool-Einstellungen konnten nicht geladen werden.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadVisibility();
  }, [toast]);

  const toolsToDisplay = useMemo(() => {
    const orderedTools = [...TOOL_CATALOG].sort(
      (a, b) => sortOrder[a.key] - sortOrder[b.key],
    );
    if (isAdmin) {
      return orderedTools;
    }
    return orderedTools.filter((tool) => visibility[tool.key] !== false);
  }, [isAdmin, sortOrder, visibility]);

  useEffect(() => {
    if (!selectedTool && toolsToDisplay.length) {
      setSelectedTool(toolsToDisplay[0].key);
    }
  }, [selectedTool, toolsToDisplay]);

  const handleToggle = async (key: ToolKey, nextValue: boolean) => {
    setSavingKey(key);
    try {
      const updated = await toolsApi.updateVisibility([
        {
          toolKey: key,
          isEnabled: nextValue,
          sortOrder: sortOrder[key],
        },
      ]);
      const nextVisibility = updated.reduce<Record<ToolKey, boolean>>(
        (acc, setting) => {
          acc[setting.toolKey as ToolKey] = setting.isEnabled;
          return acc;
        },
        { ...DEFAULT_VISIBILITY },
      );
      const nextSortOrder = updated.reduce<Record<ToolKey, number>>(
        (acc, setting) => {
          acc[setting.toolKey as ToolKey] = setting.sortOrder;
          return acc;
        },
        { ...DEFAULT_SORT_ORDER },
      );
      setVisibility(nextVisibility);
      setSortOrder(nextSortOrder);
      toast({
        title: "Gespeichert",
        description: "Tool-Sichtbarkeit aktualisiert.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Änderung konnte nicht gespeichert werden.",
        variant: "destructive",
      });
      setVisibility((prev) => ({ ...prev, [key]: !nextValue }));
    } finally {
      setSavingKey(null);
    }
  };

  const handleMoveTool = async (key: ToolKey, direction: "up" | "down") => {
    const previousSortOrder = { ...sortOrder };
    const orderedKeys = [...TOOL_CATALOG]
      .sort((a, b) => sortOrder[a.key] - sortOrder[b.key])
      .map((tool) => tool.key);
    const currentIndex = orderedKeys.indexOf(key);
    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= orderedKeys.length) {
      return;
    }

    const nextKeys = [...orderedKeys];
    const [moved] = nextKeys.splice(currentIndex, 1);
    nextKeys.splice(targetIndex, 0, moved);

    const nextSortOrder = nextKeys.reduce<Record<ToolKey, number>>(
      (acc, toolKey, index) => {
        acc[toolKey] = index;
        return acc;
      },
      { ...DEFAULT_SORT_ORDER },
    );

    setSavingKey(key);
    setSortOrder(nextSortOrder);

    try {
      const updated = await toolsApi.updateVisibility(
        nextKeys.map((toolKey, index) => ({
          toolKey,
          isEnabled: visibility[toolKey],
          sortOrder: index,
        })),
      );
      const persistedVisibility = updated.reduce<Record<ToolKey, boolean>>(
        (acc, setting) => {
          acc[setting.toolKey as ToolKey] = setting.isEnabled;
          return acc;
        },
        { ...DEFAULT_VISIBILITY },
      );
      const persistedSortOrder = updated.reduce<Record<ToolKey, number>>(
        (acc, setting) => {
          acc[setting.toolKey as ToolKey] = setting.sortOrder;
          return acc;
        },
        { ...DEFAULT_SORT_ORDER },
      );
      setVisibility(persistedVisibility);
      setSortOrder(persistedSortOrder);
      toast({
        title: "Gespeichert",
        description: "Reihenfolge der Tools aktualisiert.",
      });
    } catch (error) {
      setSortOrder(previousSortOrder);
      toast({
        title: "Fehler",
        description: "Reihenfolge konnte nicht gespeichert werden.",
        variant: "destructive",
      });
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
    if (selectedTool === "body_surface_area") {
      return <BodySurfaceAreaCalculator />;
    }
    return <BishopScoreCalculator />;
  };

  return (
    <Layout title="Tools">
      <div className="space-y-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">
            Praktische Helfer
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
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
                <CardContent className="p-5 md:p-6 flex flex-col items-start gap-4">
                  <div
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${tool.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200`}
                  >
                    <tool.icon className={`w-5 h-5 md:w-6 md:h-6 ${tool.accent}`} />
                  </div>
                  <div className="space-y-2 min-w-0 w-full">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base md:text-lg leading-snug break-words">
                        {tool.title}
                      </h3>
                      {isDisabled && isAdmin && (
                        <Badge variant="outline" className="text-xs">
                          Ausgeblendet
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs md:text-sm leading-snug break-words">
                      {tool.description}
                    </p>
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
              <CardTitle>
                {TOOL_CATALOG.find((tool) => tool.key === selectedTool)?.title}
              </CardTitle>
              <CardDescription>
                {
                  TOOL_CATALOG.find((tool) => tool.key === selectedTool)
                    ?.description
                }
              </CardDescription>
            </CardHeader>
            <CardContent>{renderToolContent()}</CardContent>
          </Card>
        )}

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
              {toolsToDisplay.map((tool, index) => (
                <div
                  key={tool.key}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{tool.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {tool.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleMoveTool(tool.key, "up")}
                      disabled={loading || savingKey === tool.key || index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleMoveTool(tool.key, "down")}
                      disabled={
                        loading ||
                        savingKey === tool.key ||
                        index === toolsToDisplay.length - 1
                      }
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Switch
                      checked={visibility[tool.key]}
                      onCheckedChange={(value) =>
                        handleToggle(tool.key, Boolean(value))
                      }
                      disabled={savingKey === tool.key || loading}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
