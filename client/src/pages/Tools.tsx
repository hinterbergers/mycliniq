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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Sparkles,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from "lucide-react";
import {
  addDays,
  subDays,
  differenceInDays,
  format,
  startOfDay,
} from "date-fns";
import {
  DEFAULT_TOOL_SORT_ORDER,
  DEFAULT_TOOL_VISIBILITY,
  TOOL_CATALOG,
  getToolTargetUrl,
  type ToolKey,
} from "@/lib/toolCatalog";

type ToolSource = {
  label: string;
  href: string;
  detail?: string;
};

function ToolSources({
  note,
  sources,
}: {
  note?: string;
  sources: ToolSource[];
}) {
  return (
    <Card className="border-slate-200 bg-slate-50/80">
      <CardHeader>
        <CardTitle>Quellen</CardTitle>
        <CardDescription>
          Medizinische Rechner dienen der klinischen Orientierung und ersetzen
          nicht die individuelle fachliche Beurteilung.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {note ? (
          <p className="text-xs leading-5 text-slate-600">{note}</p>
        ) : null}
        <ul className="space-y-2">
          {sources.map((source) => (
            <li key={source.href} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0F5BA7] hover:underline"
              >
                {source.label}
                <ExternalLink className="h-3 w-3" />
              </a>
              {source.detail ? (
                <p className="mt-1 text-[11px] leading-5 text-slate-600">
                  {source.detail}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const safe = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(safe);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseRequestedTool(
  tools: Array<{ key: ToolKey }>,
  search: string,
): ToolKey | null {
  const requestedTool = new URLSearchParams(search).get("tool");
  if (!requestedTool) return null;
  return tools.some((tool) => tool.key === requestedTool)
    ? (requestedTool as ToolKey)
    : null;
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

      <ToolSources
        note="Die Berechnung folgt der geburtshilflichen Standarddatierung aus letzter Menstruation beziehungsweise bekanntem Termin. Die Transfer-Ansicht leitet das Schwangerschaftsalter aus Transferdatum plus Embryonalter nach obstetrischer Konvention ab."
        sources={[
          {
            label: "ACOG Committee Opinion No. 700: Methods for Estimating the Due Date",
            href: "https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2017/05/methods-for-estimating-the-due-date",
            detail:
              "Grundlage fuer ET-/SSW-Datierung in der Geburtshilfe; urspruenglich 2017, reaffirmed 2023.",
          },
          {
            label: "ACOG - Estimated Due Date Redating Table",
            href: "https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2017/05/methods-for-estimating-the-due-date#table1",
            detail:
              "Referenz fuer Standardisierung der Terminberechnung und Dokumentation des finalen ET.",
          },
        ]}
      />
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
        note =
          "Progesteron ergänzt die Einordnung. Die App verwendet hier bewusst nur eine vereinfachte Orientierung und nicht den voll validierten M6-Algorithmus.";
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
                hCG + Progesteron
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

      <ToolSources
        note="Die hCG-Ratio-Schwellen und die PUL-Einordnung in der App dienen nur als strukturierte Erstorientierung. Die Progesteron-Variante ist bewusst als vereinfachte, nicht validierte Abbildung klinischer Heuristik gekennzeichnet und ersetzt keinen publizierten M6-Rechner."
        sources={[
          {
            label: "NICE Guideline NG126: Ectopic pregnancy and miscarriage",
            href: "https://www.nice.org.uk/guidance/ng126",
            detail:
              "Leitlinie zur Abklaerung frueher Schwangerschaftskomplikationen mit seriellen hCG-Kontrollen und Ultraschall.",
          },
          {
            label:
              "Seeber BE et al. Diagnostic value of serum hCG on the outcome of pregnancy of unknown location",
            href: "https://academic.oup.com/humupd/article/12/4/439/705354",
            detail:
              "Systematische Uebersicht zu hCG-Ratio und Verlauf bei Pregnancy of Unknown Location (PUL).",
          },
        ]}
      />
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

      <ToolSources
        note="Die MTX-Ausgabe zeigt die haeufig verwendete Berechnung 50 mg/m² auf Basis der Mosteller-KOF. Dosierungsentscheidungen muessen individuell, leitlinienbasiert und unter Beruecksichtigung von Kontraindikationen getroffen werden."
        sources={[
          {
            label: "Mosteller RD. Simplified calculation of body-surface area",
            href: "https://pubmed.ncbi.nlm.nih.gov/3657876/",
            detail:
              "Originalreferenz der Mosteller-Formel: sqrt((Groesse cm x Gewicht kg) / 3600).",
          },
          {
            label: "ACOG Practice Bulletin No. 193: Tubal Ectopic Pregnancy",
            href: "https://www.acog.org/clinical/clinical-guidance/practice-bulletin/articles/2018/03/tubal-ectopic-pregnancy",
            detail:
              "Geburtshilfliche Leitlinie mit Methotrexat-Regimen, inklusive Single-Dose-Strategie mit 50 mg/m².",
          },
        ]}
      />
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

      <ToolSources
        note="Der Bishop-Score wird in MyCliniQ als strukturierte Dokumentationshilfe verwendet. Die Schwellenwerte fuer die Einordnung bleiben klinischer Kontext und lokaler Entscheidungsweg."
        sources={[
          {
            label: "Bishop EH. Pelvic Scoring for Elective Induction",
            href: "https://pubmed.ncbi.nlm.nih.gov/14199536/",
            detail:
              "Originalpublikation des Bishop-Scores mit den klassischen fuenf Komponenten.",
          },
          {
            label: "NICE Guideline NG207: Inducing labour",
            href: "https://www.nice.org.uk/guidance/ng207",
            detail:
              "Aktuelle Leitlinie zur Geburtseinleitung und zur Beurteilung der Zervixreife im klinischen Kontext.",
          },
        ]}
      />
    </div>
  );
}

function BodyMassIndexCalculator() {
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");

  const heightValue = Number(heightCm);
  const weightValue = Number(weightKg);
  const heightMeters = heightValue > 0 ? heightValue / 100 : null;
  const bmi =
    heightMeters && weightValue > 0
      ? weightValue / (heightMeters * heightMeters)
      : null;

  const assessment = useMemo(() => {
    if (bmi === null || !Number.isFinite(bmi)) return null;
    if (bmi < 18.5) {
      return {
        label: "Untergewicht",
        detail: "WHO-Beurteilung: Untergewicht",
      };
    }
    if (bmi < 25) {
      return {
        label: "Normalgewicht",
        detail: "WHO-Beurteilung: Normalgewicht",
      };
    }
    if (bmi < 30) {
      return {
        label: "Übergewicht",
        detail: "WHO-Beurteilung: Präadipositas / Übergewicht",
      };
    }
    if (bmi < 35) {
      return {
        label: "Adipositas Grad I",
        detail: "WHO-Beurteilung: Adipositas Grad I",
      };
    }
    if (bmi < 40) {
      return {
        label: "Adipositas Grad II",
        detail: "WHO-Beurteilung: Adipositas Grad II",
      };
    }
    return {
      label: "Adipositas Grad III",
      detail: "WHO-Beurteilung: Adipositas Grad III",
    };
  }, [bmi]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bmi-height">Größe (cm)</Label>
          <Input
            id="bmi-height"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="z.B. 172"
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bmi-weight">Gewicht (kg)</Label>
          <Input
            id="bmi-weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="z.B. 68"
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
          />
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-6 space-y-4">
          {bmi === null ? (
            <p className="text-sm text-muted-foreground">
              Bitte Größe und Gewicht eingeben, um den BMI zu berechnen.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground">BMI</p>
                <p className="text-2xl font-semibold">{bmi.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  WHO-Kategorie
                </p>
                <p className="text-base font-semibold">
                  {assessment?.label ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Formel
                </p>
                <p className="text-sm text-muted-foreground">
                  Gewicht / Größe²
                </p>
              </div>
            </div>
          )}
          {assessment && (
            <p className="text-xs text-muted-foreground">{assessment.detail}</p>
          )}
        </CardContent>
      </Card>

      <ToolSources
        note="Die BMI-Klassifikation in der App folgt den WHO-Grenzwerten fuer Erwachsene. Der BMI ist ein Screening-Mass und keine alleinige Diagnostik."
        sources={[
          {
            label: "WHO Fact Sheet: Obesity and overweight",
            href: "https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight",
            detail:
              "WHO-Definitionen fuer BMI, Uebergewicht und Adipositas bei Erwachsenen.",
          },
          {
            label: "WHO Adult definitions of overweight and obesity",
            href: "https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight#Definition",
            detail:
              "Erwachsenen-Grenzwerte: Uebergewicht ab BMI >= 25, Adipositas ab BMI >= 30.",
          },
        ]}
      />
    </div>
  );
}

export default function Tools() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [visibility, setVisibility] =
    useState<Record<ToolKey, boolean>>(DEFAULT_TOOL_VISIBILITY);
  const [sortOrder, setSortOrder] =
    useState<Record<ToolKey, number>>(DEFAULT_TOOL_SORT_ORDER);
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
          { ...DEFAULT_TOOL_VISIBILITY },
        );
        const orderMap = settings.reduce<Record<ToolKey, number>>(
          (acc, setting) => {
            acc[setting.toolKey as ToolKey] = setting.sortOrder;
            return acc;
          },
          { ...DEFAULT_TOOL_SORT_ORDER },
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
    if (typeof window === "undefined") return;

    const syncSelectedToolFromUrl = () => {
      const requestedTool = parseRequestedTool(
        toolsToDisplay,
        window.location.search,
      );
      setSelectedTool(requestedTool);
    };

    syncSelectedToolFromUrl();
    window.addEventListener("popstate", syncSelectedToolFromUrl);
    return () => {
      window.removeEventListener("popstate", syncSelectedToolFromUrl);
    };
  }, [toolsToDisplay]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const requestedTool = parseRequestedTool(
      toolsToDisplay,
      window.location.search,
    );
    if (!requestedTool && selectedTool) {
      setSelectedTool(null);
    }
  }, [selectedTool, toolsToDisplay]);

  const openToolPopup = (toolKey: ToolKey) => {
    setSelectedTool(toolKey);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", getToolTargetUrl(toolKey));
    }
  };

  const closeToolPopup = () => {
    setSelectedTool(null);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", "/tools");
    }
  };

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
        { ...DEFAULT_TOOL_VISIBILITY },
      );
      const nextSortOrder = updated.reduce<Record<ToolKey, number>>(
        (acc, setting) => {
          acc[setting.toolKey as ToolKey] = setting.sortOrder;
          return acc;
        },
        { ...DEFAULT_TOOL_SORT_ORDER },
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
      { ...DEFAULT_TOOL_SORT_ORDER },
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
        { ...DEFAULT_TOOL_VISIBILITY },
      );
      const persistedSortOrder = updated.reduce<Record<ToolKey, number>>(
        (acc, setting) => {
          acc[setting.toolKey as ToolKey] = setting.sortOrder;
          return acc;
        },
        { ...DEFAULT_TOOL_SORT_ORDER },
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
    if (selectedTool === "bishop_score") {
      return <BishopScoreCalculator />;
    }
    return <BodyMassIndexCalculator />;
  };

  const selectedToolEntry = selectedTool
    ? TOOL_CATALOG.find((tool) => tool.key === selectedTool) ?? null
    : null;

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
                onClick={() => openToolPopup(tool.key)}
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

        <Dialog
          open={Boolean(selectedTool && (isAdmin || visibility[selectedTool]))}
          onOpenChange={(open) => {
            if (!open) {
              closeToolPopup();
            }
          }}
        >
          <DialogContent className="max-h-[94vh] w-[calc(100vw-0.5rem)] max-w-[calc(100vw-0.5rem)] overflow-y-auto rounded-[1.25rem] border-none bg-transparent p-0 shadow-none sm:max-w-3xl">
            <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-background shadow-2xl shadow-slate-950/20">
              <DialogHeader className="kabeg-deep-gradient relative gap-2 px-3 py-3 pr-12 text-left sm:px-5 sm:py-4">
                <div className="flex items-start gap-3">
                  {selectedToolEntry ? (
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 ${selectedToolEntry.accent}`}>
                      <selectedToolEntry.icon className="h-4 w-4 text-white" />
                    </div>
                  ) : null}
                  <div className="min-w-0 space-y-1">
                    <DialogTitle className="text-sm font-semibold leading-tight text-white sm:text-base">
                      {selectedToolEntry?.title}
                    </DialogTitle>
                    <DialogDescription className="text-[11px] leading-snug text-primary-foreground/80 sm:text-xs">
                      {selectedToolEntry?.description}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="bg-slate-50/80 p-2 sm:p-3">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm sm:p-3">
                  <div className="space-y-2 text-xs sm:text-sm [&_label]:text-[10px] [&_label]:font-medium [&_label]:tracking-wide [&_label]:text-slate-600 [&_label]:sm:text-xs [&_.tabs-list]:h-8 [&_.tabs-list]:w-full [&_.tabs-list]:justify-start [&_.tabs-list]:overflow-x-auto [&_.tabs-list]:rounded-xl [&_.tabs-list]:bg-slate-100 [&_.tabs-list]:p-1 [&_.tabs-trigger]:h-6 [&_.tabs-trigger]:shrink-0 [&_.tabs-trigger]:rounded-lg [&_.tabs-trigger]:px-2 [&_.tabs-trigger]:py-0 [&_.tabs-trigger]:text-[10px] [&_.tabs-trigger]:sm:text-xs [&_input]:h-8 [&_input]:text-xs [&_[data-slot='card']]:border-slate-200 [&_[data-slot='card-content']]:p-2 [&_[data-slot='card-content']]:sm:p-3 [&_[data-slot='card-header']]:px-2 [&_[data-slot='card-header']]:pt-2 [&_[data-slot='card-header']]:pb-0 [&_[data-slot='card-header']]:sm:px-3 [&_[data-slot='card-header']]:sm:pt-3 [&_[data-slot='card-title']]:text-xs [&_[data-slot='card-title']]:font-semibold [&_[data-slot='card-title']]:uppercase [&_[data-slot='card-title']]:tracking-[0.12em] [&_[data-slot='card-description']]:text-[10px] [&_[data-slot='card-description']]:sm:text-xs [&_p.text-2xl]:text-lg [&_p.text-base]:text-xs [&_button[role='combobox']]:h-8 [&_button[role='combobox']]:text-xs">
                    {renderToolContent()}
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
