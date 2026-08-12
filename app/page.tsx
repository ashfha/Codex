"use client";

import {
  CreateWebWorkerMLCEngine,
  prebuiltAppConfig,
  type WebWorkerMLCEngine,
} from "@mlc-ai/web-llm";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type VehicleProfile = {
  make: string;
  model: string;
  year: string;
  engine: string;
  power: string;
  generation: string;
  mileage: string;
  engineCode: string;
  transmission: string;
  vin: string;
};

type DiagnosticReply = {
  kind: "follow_up" | "diagnosis";
  message: string;
  questions: string[];
  confidence: number;
  safetyLevel: "safe" | "caution" | "stop";
  safeToDrive: boolean | null;
  summary: string;
  likelyCauses: Array<{
    name: string;
    probability: number;
    reason: string;
    checks: string[];
  }>;
  repairPlan: Array<{
    number: number;
    title: string;
    instruction: string;
    difficulty: "leicht" | "mittel" | "schwer" | "werkstatt";
    time: string;
    safety: string;
  }>;
  shoppingList: Array<{
    item: string;
    specification: string;
    quantity: string;
    priceMin: number;
    priceMax: number;
    note: string;
  }>;
  costs: {
    partsMin: number;
    partsMax: number;
    workshopMin: number;
    workshopMax: number;
    currency: "EUR";
  } | null;
  nextBestAction: string;
  warnings: string[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  reply?: DiagnosticReply;
};

type ModelStatus = "idle" | "loading" | "ready" | "error" | "unsupported";

const LOCAL_MODELS = [
  {
    id: "Qwen3.5-2B-q4f16_1-MLC",
    label: "Schnell · 2B",
    description: "ca. 2,2 GB · deutlich schneller, gute Alltagsdiagnose",
  },
  {
    id: "Qwen3.5-4B-q4f16_1-MLC",
    label: "Präzise · 4B",
    description: "ca. 3,9 GB · gründlicher, aber spürbar langsamer",
  },
] as const;

const DEFAULT_MODEL_ID = LOCAL_MODELS[0].id;

const DEFAULT_VEHICLE: VehicleProfile = {
  make: "Audi",
  model: "A6",
  year: "2011",
  engine: "3.0 TDI",
  power: "240 PS / 176 kW",
  generation: "",
  mileage: "",
  engineCode: "",
  transmission: "",
  vin: "",
};

const INITIAL_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Beschreibe mir, was dein A6 macht. Je genauer du Geräusch, Zeitpunkt, Warnleuchten und Fahrzustand beschreibst, desto sicherer wird die Diagnose.",
};

const quickStarters = [
  { label: "Start & Batterie", prompt: "Mein Audi startet nicht oder nur schwer. " },
  { label: "Motor & Leistung", prompt: "Mein Audi hat ein Problem mit Motor oder Leistung. " },
  { label: "Öl & Flüssigkeiten", prompt: "Ich habe ein Problem mit Öl oder einer Flüssigkeit. " },
  { label: "Bremsen", prompt: "Mir ist beim Bremsen etwas aufgefallen. " },
  { label: "Elektrik", prompt: "Ich habe ein elektrisches Problem oder eine Warnmeldung. " },
  { label: "Geräusch", prompt: "Mein Audi macht ein ungewöhnliches Geräusch. Es klingt wie " },
];

const SYSTEM_PROMPT = `Du bist A6 DIAG, ein sehr gewissenhafter deutscher Kfz-Meister und Diagnosetechniker mit Schwerpunkt Audi A6 und VAG-Diesel. Antworte ausschließlich auf Deutsch und arbeite wie eine gute Werkstatt: Symptome eingrenzen, kostenlose Prüfungen zuerst, dann Messungen und erst danach Teiletausch.

Regeln:
- Stelle 2 bis 4 gezielte Rückfragen, solange wichtige Angaben fehlen. Nutze dann kind "follow_up" und lasse Ursachen, Reparaturplan, Einkaufsliste und Kosten leer.
- Nutze kind "diagnosis" erst für eine belastbare Arbeitsdiagnose. Trenne Vermutung und sichere Feststellung, gib ehrliche Wahrscheinlichkeiten an und erfinde niemals Teilenummern.
- Für Teile und Flüssigkeiten bei Unsicherheit FIN, PR-Code, Motorkennbuchstabe, Getriebe oder Altteil verlangen. Preise als realistische deutsche Endkunden-Spannen in EUR; Teile und freie Werkstatt trennen.
- Bei roter Öl-, Kühlmittel- oder Bremswarnung, Überhitzung, Kraftstoffgeruch, Brems-/Lenkungsverlust, Rauch/Brandgefahr oder metallischen Motorschlägen safetyLevel "stop" und keine Weiterfahrt.
- Keine gefährlichen Anleitungen für Airbag, gespannte Federn, Hochdruck-Kraftstoffsystem, ungesichertes Arbeiten unter dem Auto oder Bremsen ohne Kompetenzhinweis.
- Berücksichtige typische Themen des Audi A6 3.0 TDI wie Batterie/Lademanagement, Glühsystem, AGR, DPF, Ladedruck, Drallklappen, Injektorkorrekturwerte, Steuerkette, Thermostat, quattro und Tiptronic nur, wenn die Symptome dazu passen.
- Schreibe kompakt: Gründe höchstens ein Satz, Prüfschritte höchstens ein Satz und Reparaturanweisungen höchstens zwei kurze Sätze. Maximal vier Ursachen und sechs Reparaturschritte.
- Antworte exakt als JSON gemäß dem vorgegebenen Schema. Kein Markdown außerhalb des JSON.`;

const DIAGNOSIS_SCHEMA = {
  type: "object",
  properties: {
    kind: { enum: ["follow_up", "diagnosis"] },
    message: { type: "string" },
    questions: { type: "array", items: { type: "string" }, maxItems: 4 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    safetyLevel: { enum: ["safe", "caution", "stop"] },
    safeToDrive: { type: ["boolean", "null"] },
    summary: { type: "string" },
    likelyCauses: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          probability: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
          checks: { type: "array", items: { type: "string" }, maxItems: 3 },
        },
        required: ["name", "probability", "reason", "checks"],
      },
    },
    repairPlan: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          number: { type: "integer", minimum: 1 },
          title: { type: "string" },
          instruction: { type: "string" },
          difficulty: { enum: ["leicht", "mittel", "schwer", "werkstatt"] },
          time: { type: "string" },
          safety: { type: "string" },
        },
        required: ["number", "title", "instruction", "difficulty", "time", "safety"],
      },
    },
    shoppingList: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          specification: { type: "string" },
          quantity: { type: "string" },
          priceMin: { type: "number", minimum: 0 },
          priceMax: { type: "number", minimum: 0 },
          note: { type: "string" },
        },
        required: ["item", "specification", "quantity", "priceMin", "priceMax", "note"],
      },
    },
    costs: {
      anyOf: [
        {
          type: "object",
          properties: {
            partsMin: { type: "number", minimum: 0 },
            partsMax: { type: "number", minimum: 0 },
            workshopMin: { type: "number", minimum: 0 },
            workshopMax: { type: "number", minimum: 0 },
            currency: { const: "EUR" },
          },
          required: ["partsMin", "partsMax", "workshopMin", "workshopMax", "currency"],
        },
        { type: "null" },
      ],
    },
    nextBestAction: { type: "string" },
    warnings: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
  required: [
    "kind", "message", "questions", "confidence", "safetyLevel", "safeToDrive",
    "summary", "likelyCauses", "repairPlan", "shoppingList", "costs",
    "nextBestAction", "warnings",
  ],
} as const;

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textOf(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberOf(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function listOfText(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizeReply(value: unknown): DiagnosticReply {
  const source = recordOf(value);
  const costsSource = source.costs === null ? null : recordOf(source.costs);
  const kind = source.kind === "diagnosis" ? "diagnosis" : "follow_up";
  const safetyLevel = source.safetyLevel === "stop" || source.safetyLevel === "caution"
    ? source.safetyLevel
    : "safe";

  const likelyCauses = Array.isArray(source.likelyCauses)
    ? source.likelyCauses.map((entry) => {
      const cause = recordOf(entry);
      return {
        name: textOf(cause.name, "Noch nicht eindeutig"),
        probability: Math.min(1, Math.max(0, numberOf(cause.probability))),
        reason: textOf(cause.reason),
        checks: listOfText(cause.checks),
      };
    })
    : [];

  const repairPlan = Array.isArray(source.repairPlan)
    ? source.repairPlan.map((entry, index) => {
      const step = recordOf(entry);
      const difficulty = ["leicht", "mittel", "schwer", "werkstatt"].includes(textOf(step.difficulty))
        ? textOf(step.difficulty) as DiagnosticReply["repairPlan"][number]["difficulty"]
        : "werkstatt";
      return {
        number: Math.max(1, Math.round(numberOf(step.number, index + 1))),
        title: textOf(step.title, `Prüfschritt ${index + 1}`),
        instruction: textOf(step.instruction),
        difficulty,
        time: textOf(step.time),
        safety: textOf(step.safety),
      };
    })
    : [];

  const shoppingList = Array.isArray(source.shoppingList)
    ? source.shoppingList.map((entry) => {
      const part = recordOf(entry);
      return {
        item: textOf(part.item, "Teil"),
        specification: textOf(part.specification),
        quantity: textOf(part.quantity, "1"),
        priceMin: Math.max(0, numberOf(part.priceMin)),
        priceMax: Math.max(0, numberOf(part.priceMax)),
        note: textOf(part.note),
      };
    })
    : [];

  const costs = costsSource
    ? {
        partsMin: Math.max(0, numberOf(costsSource.partsMin)),
        partsMax: Math.max(0, numberOf(costsSource.partsMax)),
        workshopMin: Math.max(0, numberOf(costsSource.workshopMin)),
        workshopMax: Math.max(0, numberOf(costsSource.workshopMax)),
        currency: "EUR" as const,
      }
    : null;

  const message = textOf(source.message, "Bitte beschreibe das Problem noch etwas genauer.");
  return {
    kind,
    message,
    questions: listOfText(source.questions),
    confidence: Math.min(1, Math.max(0, numberOf(source.confidence))),
    safetyLevel,
    safeToDrive: typeof source.safeToDrive === "boolean" ? source.safeToDrive : null,
    summary: textOf(source.summary, message),
    likelyCauses,
    repairPlan,
    shoppingList,
    costs,
    nextBestAction: textOf(source.nextBestAction),
    warnings: listOfText(source.warnings),
  };
}

function EuroRange({ min, max }: { min: number; max: number }) {
  const format = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  return <>{min === max ? format.format(min) : `${format.format(min)}–${format.format(max)}`}</>;
}

function SafetyBadge({ level }: { level: DiagnosticReply["safetyLevel"] }) {
  const labels = {
    safe: "Weiterfahrt wahrscheinlich möglich",
    caution: "Nur vorsichtig weiterfahren",
    stop: "Fahrzeug stehen lassen",
  };
  return <span className={`safety-badge ${level}`}>{labels[level]}</span>;
}

function DiagnosisResult({ reply }: { reply: DiagnosticReply }) {
  const confidence = Math.round(reply.confidence * 100);

  if (reply.kind === "follow_up") {
    return (
      <div className="follow-up-block">
        {reply.questions.length > 0 && (
          <div className="question-list">
            {reply.questions.map((question, index) => (
              <div className="question-row" key={`${question}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{question}</p>
              </div>
            ))}
          </div>
        )}
        {reply.warnings.length > 0 && (
          <div className="inline-warning">
            <strong>Sicherheit</strong>
            <span>{reply.warnings.join(" ")}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="diagnosis-result">
      <div className="result-head">
        <div>
          <span className="eyebrow">Diagnosebild</span>
          <h3>{reply.summary}</h3>
        </div>
        <div className="confidence-ring" style={{ "--score": `${confidence * 3.6}deg` } as React.CSSProperties}>
          <span>{confidence}%</span>
          <small>Sicherheit</small>
        </div>
      </div>

      <SafetyBadge level={reply.safetyLevel} />

      {reply.warnings.length > 0 && (
        <div className="warning-stack">
          {reply.warnings.map((warning) => (
            <div className="inline-warning" key={warning}>
              <strong>Achtung</strong>
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {reply.likelyCauses.length > 0 && (
        <section className="result-section">
          <div className="section-title-row">
            <h4>Wahrscheinliche Ursachen</h4>
            <span>nach Plausibilität</span>
          </div>
          <div className="cause-grid">
            {reply.likelyCauses.map((cause, index) => (
              <article className="cause-card" key={`${cause.name}-${index}`}>
                <div className="cause-rank">{String(index + 1).padStart(2, "0")}</div>
                <div className="cause-copy">
                  <div className="cause-heading">
                    <h5>{cause.name}</h5>
                    <span>{Math.round(cause.probability * 100)}%</span>
                  </div>
                  <p>{cause.reason}</p>
                  {cause.checks.length > 0 && (
                    <ul>
                      {cause.checks.map((check) => <li key={check}>{check}</li>)}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {reply.repairPlan.length > 0 && (
        <section className="result-section">
          <div className="section-title-row">
            <h4>Reparaturplan</h4>
            <span>in sicherer Reihenfolge</span>
          </div>
          <div className="repair-timeline">
            {reply.repairPlan.map((step) => (
              <article className="repair-step" key={`${step.number}-${step.title}`}>
                <div className="step-number">{step.number}</div>
                <div>
                  <div className="step-heading">
                    <h5>{step.title}</h5>
                    <span>{step.difficulty} · {step.time}</span>
                  </div>
                  <p>{step.instruction}</p>
                  {step.safety && <small>{step.safety}</small>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {reply.shoppingList.length > 0 && (
        <section className="result-section">
          <div className="section-title-row">
            <h4>Einkaufsliste</h4>
            <span>passende Spezifikation prüfen</span>
          </div>
          <div className="parts-table">
            {reply.shoppingList.map((part) => (
              <article className="part-row" key={`${part.item}-${part.specification}`}>
                <div>
                  <strong>{part.item}</strong>
                  <span>{part.specification}</span>
                  {part.note && <small>{part.note}</small>}
                </div>
                <span className="part-quantity">{part.quantity}</span>
                <strong className="part-price"><EuroRange min={part.priceMin} max={part.priceMax} /></strong>
              </article>
            ))}
          </div>
        </section>
      )}

      {reply.costs && (
        <section className="cost-panel">
          <div>
            <span>Selbst reparieren · Teile</span>
            <strong><EuroRange min={reply.costs.partsMin} max={reply.costs.partsMax} /></strong>
          </div>
          <div>
            <span>Freie Werkstatt · gesamt</span>
            <strong><EuroRange min={reply.costs.workshopMin} max={reply.costs.workshopMax} /></strong>
          </div>
        </section>
      )}

      {reply.nextBestAction && (
        <div className="next-action">
          <span>Nächster sinnvoller Schritt</span>
          <strong>{reply.nextBestAction}</strong>
        </div>
      )}
    </div>
  );
}

function VehicleEditor({
  vehicle,
  onChange,
  onClose,
}: {
  vehicle: VehicleProfile;
  onChange: (profile: VehicleProfile) => void;
  onClose: () => void;
}) {
  const fields: Array<{ key: keyof VehicleProfile; label: string; placeholder?: string }> = [
    { key: "year", label: "Baujahr" },
    { key: "generation", label: "Baureihe", placeholder: "z. B. C6 / 4F" },
    { key: "mileage", label: "Kilometerstand", placeholder: "z. B. 186000 km" },
    { key: "engineCode", label: "Motorkennbuchstabe", placeholder: "falls bekannt" },
    { key: "transmission", label: "Getriebe / Antrieb", placeholder: "z. B. Tiptronic, quattro" },
    { key: "vin", label: "FIN (optional)", placeholder: "für exakte Teilezuordnung" },
  ];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="vehicle-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Fahrzeugakte</span>
            <h2 id="vehicle-title">Deinen A6 genauer machen</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fenster schließen">×</button>
        </div>
        <p className="modal-intro">Baureihe, Motorkennbuchstabe und FIN helfen, falsche Teile oder unpassende Anleitungen zu vermeiden.</p>
        <div className="vehicle-fixed-row">
          <div><span>Modell</span><strong>Audi A6</strong></div>
          <div><span>Motor</span><strong>3.0 TDI · 240 PS</strong></div>
        </div>
        <div className="form-grid">
          {fields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <input
                value={vehicle[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => onChange({ ...vehicle, [field.key]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <button className="primary-button wide" type="button" onClick={onClose}>Fahrzeugdaten übernehmen</button>
      </section>
    </div>
  );
}

export default function Home() {
  const [vehicle, setVehicle] = useState<VehicleProfile>(DEFAULT_VEHICLE);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [modelProgressText, setModelProgressText] = useState("Noch nicht geladen");
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const engineRef = useRef<WebWorkerMLCEngine | null>(null);
  const enginePromiseRef = useRef<Promise<WebWorkerMLCEngine> | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const lastReply = useMemo(
    () => [...messages].reverse().find((message) => message.reply)?.reply,
    [messages],
  );

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const storedVehicle = window.localStorage.getItem("a6-diagnose-vehicle");
      const storedMessages = window.localStorage.getItem("a6-diagnose-messages");
      const storedModel = window.localStorage.getItem("a6-diagnose-model-v2");
      if (storedVehicle) {
        try { setVehicle({ ...DEFAULT_VEHICLE, ...JSON.parse(storedVehicle) }); } catch { /* keep defaults */ }
      }
      if (storedMessages) {
        try {
          const parsed = JSON.parse(storedMessages) as ChatMessage[];
          if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
        } catch { /* begin a fresh diagnosis */ }
      }
      if (storedModel && LOCAL_MODELS.some((model) => model.id === storedModel)) {
        setModelId(storedModel);
      }
      if (!("gpu" in navigator)) {
        setModelStatus("unsupported");
        setModelProgressText("WebGPU wird von diesem Browser oder Gerät nicht unterstützt.");
      }
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => () => {
    workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    window.localStorage.setItem("a6-diagnose-vehicle", JSON.stringify(vehicle));
  }, [vehicle]);

  useEffect(() => {
    window.localStorage.setItem("a6-diagnose-messages", JSON.stringify(messages.slice(-20)));
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  function startFresh() {
    setMessages([INITIAL_MESSAGE]);
    setInput("");
    setError("");
    window.localStorage.removeItem("a6-diagnose-messages");
  }

  function chooseStarter(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  function describeModelError(caught: unknown): string {
    const message = caught instanceof Error ? caught.message : "Unbekannter Fehler";
    if (/webgpu|gpu adapter|navigator\.gpu/i.test(message)) {
      return "Die lokale KI benötigt WebGPU. Öffne die Seite in einer aktuellen Version von Chrome oder Edge und aktiviere Hardwarebeschleunigung.";
    }
    if (/memory|allocation|device lost|buffer/i.test(message)) {
      return "Der Grafikspeicher reicht für dieses Modell nicht aus. Lade die Seite neu und wähle das Standard-Modell mit 4B.";
    }
    return `Das lokale KI-Modell konnte nicht geladen werden: ${message}`;
  }

  async function loadLocalAI(): Promise<WebWorkerMLCEngine> {
    if (engineRef.current) return engineRef.current;
    if (enginePromiseRef.current) return enginePromiseRef.current;
    if (!("gpu" in navigator)) {
      setModelStatus("unsupported");
      throw new Error("WebGPU ist nicht verfügbar.");
    }

    const loadPromise = (async () => {
      setError("");
      setModelStatus("loading");
      setModelProgress(0);
      setModelProgressText("Modell wird vorbereitet …");
      window.localStorage.setItem("a6-diagnose-model-v2", modelId);

      const worker = new Worker(new URL("./llm.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      const engine = await CreateWebWorkerMLCEngine(worker, modelId, {
        appConfig: { ...prebuiltAppConfig, cacheBackend: "cache" },
        initProgressCallback: (progress) => {
          setModelProgress(Math.round(progress.progress * 100));
          setModelProgressText(progress.text || "Modell wird geladen …");
        },
      });

      engineRef.current = engine;
      setModelProgress(100);
      setModelProgressText("Lokale KI ist einsatzbereit");
      setModelStatus("ready");
      return engine;
    })();

    enginePromiseRef.current = loadPromise;
    try {
      return await loadPromise;
    } catch (caught) {
      workerRef.current?.terminate();
      workerRef.current = null;
      engineRef.current = null;
      setModelStatus("error");
      setModelProgressText(describeModelError(caught));
      throw caught;
    } finally {
      enginePromiseRef.current = null;
    }
  }

  async function startModelDownload() {
    try {
      await loadLocalAI();
    } catch (caught) {
      setError(describeModelError(caught));
    }
  }

  async function submitProblem(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const engine = await loadLocalAI();
      const transcript = nextMessages.slice(-6).map((message) => {
        const questions = message.reply?.questions.length
          ? `\nRückfragen: ${message.reply.questions.join(" | ")}`
          : "";
        return `${message.role === "user" ? "FAHRER" : "A6 DIAG"}: ${message.text}${questions}`;
      }).join("\n\n");
      const completion = await engine.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `FAHRZEUGPROFIL\n${JSON.stringify(vehicle)}\n\nDIALOG\n${transcript}\n\nErstelle die nächste Antwort. Nutze bei fehlenden Angaben follow_up. Gib ausschließlich das verlangte JSON aus.`,
          },
        ],
        temperature: 0.1,
        top_p: 0.8,
        max_tokens: 1000,
        response_format: {
          type: "json_object",
          schema: JSON.stringify(DIAGNOSIS_SCHEMA),
        },
      });
      const content = completion.choices[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Das lokale Modell hat keine verwertbare Antwort geliefert.");
      }
      const reply = normalizeReply(JSON.parse(content));
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: reply.message, reply },
      ]);
    } catch (caught) {
      const message = caught instanceof SyntaxError
        ? "Die lokale KI hat eine unvollständige Antwort erzeugt. Bitte versuche es mit einer etwas kürzeren Problembeschreibung erneut."
        : describeModelError(caught);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  const profileCompleteness = [vehicle.generation, vehicle.mileage, vehicle.engineCode, vehicle.transmission].filter(Boolean).length;
  const selectedModel = LOCAL_MODELS.find((model) => model.id === modelId) ?? LOCAL_MODELS[0];

  return (
    <main className="app-page">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="A6 Diagnose Startseite">
          <span className="brand-emblem">A6</span>
          <span className="brand-copy"><strong>DIAGNOSE</strong><small>INTELLIGENT WORKSHOP</small></span>
        </a>
        <div className="topbar-actions">
          <span className={`ai-status ${modelStatus === "ready" ? "online" : ""}`}>
            <i /> {modelStatus === "ready" ? "KI lokal bereit" : modelStatus === "loading" ? `KI lädt · ${modelProgress}%` : "Lokale KI"}
          </span>
          <button type="button" className="ghost-button" onClick={startFresh}>Neue Diagnose</button>
        </div>
      </header>

      <div className="workspace" id="top">
        <aside className="left-rail">
          <section className="vehicle-card">
            <div className="vehicle-glow" />
            <span className="eyebrow">Dein Fahrzeug</span>
            <div className="model-line"><strong>A6</strong><span>3.0 TDI</span></div>
            <p>240 PS · {vehicle.year}</p>
            <dl>
              <div><dt>Baureihe</dt><dd>{vehicle.generation || "noch offen"}</dd></div>
              <div><dt>Laufleistung</dt><dd>{vehicle.mileage || "noch offen"}</dd></div>
              <div><dt>Getriebe</dt><dd>{vehicle.transmission || "noch offen"}</dd></div>
            </dl>
            <button className="secondary-button wide" type="button" onClick={() => setVehicleOpen(true)}>Fahrzeugakte bearbeiten</button>
            <div className="profile-meter"><span style={{ width: `${35 + profileCompleteness * 16}%` }} /><small>Profil {profileCompleteness < 3 ? "ergänzen" : "gut ausgefüllt"}</small></div>
          </section>

          <section className="rail-card">
            <div className="rail-title"><span>Diagnoseprinzip</span><b>04 Schritte</b></div>
            <ol className="process-list">
              <li className="active"><span>01</span><div><strong>Symptom</strong><small>Was genau passiert?</small></div></li>
              <li className={messages.length > 1 ? "active" : ""}><span>02</span><div><strong>Rückfragen</strong><small>Zeitpunkt & Bedingungen</small></div></li>
              <li className={lastReply?.kind === "diagnosis" ? "active" : ""}><span>03</span><div><strong>Eingrenzung</strong><small>Ursachen & Prüfungen</small></div></li>
              <li className={lastReply?.kind === "diagnosis" ? "active" : ""}><span>04</span><div><strong>Lösung</strong><small>Teile, Ablauf & Kosten</small></div></li>
            </ol>
          </section>
        </aside>

        <section className="diagnosis-console">
          <div className="console-head">
            <div>
              <span className="eyebrow">KI-Diagnose für deinen Audi</span>
              <h1>Was macht dein A6?</h1>
              <p>Erst sauber eingrenzen, dann reparieren. Die KI fragt nach, bis eine belastbare Empfehlung möglich ist.</p>
            </div>
            <div className="technical-code">A6 · 3.0 TDI · 176 kW</div>
          </div>

          {messages.length === 1 && (
            <div className="starter-grid">
              {quickStarters.map((starter) => (
                <button type="button" onClick={() => chooseStarter(starter.prompt)} key={starter.label}>
                  <span>{starter.label}</span><b>↗</b>
                </button>
              ))}
            </div>
          )}

          <div className="conversation" aria-live="polite">
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-label">{message.role === "assistant" ? "A6 DIAG" : "DU"}</div>
                <div className="message-body">
                  <p>{message.text}</p>
                  {message.reply && <DiagnosisResult reply={message.reply} />}
                </div>
              </article>
            ))}
            {isLoading && (
              <article className="message assistant loading-message">
                <div className="message-label">A6 DIAG</div>
                <div className="message-body">
                  <div className="thinking"><span /><span /><span /></div>
                  <p>{modelStatus === "loading" ? `Das lokale KI-Modell wird geladen (${modelProgress} %). Beim ersten Mal kann das mehrere Minuten dauern …` : "Ich gleiche Symptome, typische Fehlerbilder und Sicherheitsrisiken ab …"}</p>
                </div>
              </article>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="error-banner">
              <strong>Lokale KI konnte die Anfrage nicht abschließen</strong>
              <span>{error}</span>
            </div>
          )}

          <form className="composer" onSubmit={submitProblem}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={3}
              maxLength={4000}
              placeholder="z. B. Beim Kaltstart dreht der Anlasser langsam, danach leuchtet kurz die Batterielampe …"
              aria-label="Problem mit dem Fahrzeug beschreiben"
            />
            <div className="composer-bottom">
              <span>Enter senden · Shift + Enter neue Zeile</span>
              <button className="send-button" type="submit" disabled={!input.trim() || isLoading}>
                {isLoading ? (modelStatus === "loading" ? `Lade KI ${modelProgress}%` : "Prüfe …") : "Diagnose starten"}
                <b>→</b>
              </button>
            </div>
          </form>
          <p className="disclaimer">KI-Einschätzung ersetzt keine Sichtprüfung. Bei roter Warnleuchte, Brems- oder Lenkungsproblemen: nicht weiterfahren.</p>
        </section>

        <aside className="right-rail">
          <section className={`readiness-card ${modelStatus === "ready" ? "ready" : "needs-key"}`}>
            <div className="readiness-icon"><span /></div>
            <span className="eyebrow">Lokaler Diagnosemotor</span>
            <h2>{modelStatus === "ready" ? "Bereit für die Analyse" : modelStatus === "loading" ? `KI wird geladen · ${modelProgress}%` : modelStatus === "unsupported" ? "WebGPU nicht verfügbar" : "KI einmalig laden"}</h2>
            <p>{modelStatus === "ready"
              ? `${selectedModel.label} läuft lokal. Fahrzeugdaten und Dialog verlassen dieses Gerät nicht.`
              : modelStatus === "unsupported"
                ? "Öffne die Seite in aktuellem Chrome oder Edge auf einem PC mit aktivierter Hardwarebeschleunigung."
                : "Kein Schlüssel, kein Konto und keine Zahlung. Das Modell wird beim ersten Start heruntergeladen und danach im Browser gespeichert."}</p>

            {modelStatus !== "ready" && modelStatus !== "unsupported" && (
              <div className="local-model-controls">
                <label>
                  <span>KI-Stufe</span>
                  <select
                    value={modelId}
                    disabled={modelStatus === "loading"}
                    onChange={(event) => {
                      setModelId(event.target.value);
                      window.localStorage.setItem("a6-diagnose-model-v2", event.target.value);
                    }}
                  >
                    {LOCAL_MODELS.map((model) => (
                      <option value={model.id} key={model.id}>{model.label}</option>
                    ))}
                  </select>
                  <small>{selectedModel.description}</small>
                </label>
                <div className="model-progress" aria-label={`Modellfortschritt ${modelProgress} Prozent`}>
                  <span style={{ width: `${modelProgress}%` }} />
                </div>
                <small className="progress-copy">{modelProgressText}</small>
                <button className="primary-button wide" type="button" disabled={modelStatus === "loading"} onClick={startModelDownload}>
                  {modelStatus === "loading" ? `Lädt ${modelProgress}%` : modelStatus === "error" ? "Erneut versuchen" : "Lokale KI laden"}
                </button>
              </div>
            )}
          </section>

          <section className="rail-card expertise-card">
            <div className="rail-title"><span>Werkstattlogik</span><b>AKTIV</b></div>
            <ul className="check-list">
              <li><i>✓</i><span><strong>Keine Blinddiagnose</strong><small>Rückfragen bei fehlenden Daten</small></span></li>
              <li><i>✓</i><span><strong>A6-spezifisch</strong><small>3.0 TDI · 240 PS · 2011</small></span></li>
              <li><i>✓</i><span><strong>Kosten getrennt</strong><small>Selbsthilfe vs. Werkstatt</small></span></li>
              <li><i>✓</i><span><strong>Sicherheitsgrenze</strong><small>Stop-Empfehlung bei Risiko</small></span></li>
            </ul>
          </section>

          <section className="safety-card">
            <span>Wichtig</span>
            <p>Teilenummern sind erst mit FIN, PR-Codes oder altem Bauteil wirklich sicher. Die KI soll bei Unsicherheit ausdrücklich nachfragen.</p>
          </section>
        </aside>
      </div>

      {vehicleOpen && <VehicleEditor vehicle={vehicle} onChange={setVehicle} onClose={() => setVehicleOpen(false)} />}
    </main>
  );
}
