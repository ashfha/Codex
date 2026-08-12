"use client";

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
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const lastReply = useMemo(
    () => [...messages].reverse().find((message) => message.reply)?.reply,
    [messages],
  );

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const storedVehicle = window.localStorage.getItem("a6-diagnose-vehicle");
      const storedMessages = window.localStorage.getItem("a6-diagnose-messages");
      if (storedVehicle) {
        try { setVehicle({ ...DEFAULT_VEHICLE, ...JSON.parse(storedVehicle) }); } catch { /* keep defaults */ }
      }
      if (storedMessages) {
        try {
          const parsed = JSON.parse(storedMessages) as ChatMessage[];
          if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
        } catch { /* begin a fresh diagnosis */ }
      }
    }, 0);

    return () => window.clearTimeout(restoreTimer);
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
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle,
          messages: nextMessages.slice(-16).map(({ role, text: content }) => ({ role, content })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Die Diagnose konnte gerade nicht erstellt werden.");
      }

      const reply = data.reply as DiagnosticReply;
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: reply.message, reply },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Diagnose konnte gerade nicht erstellt werden.");
    } finally {
      setIsLoading(false);
    }
  }

  const profileCompleteness = [vehicle.generation, vehicle.mileage, vehicle.engineCode, vehicle.transmission].filter(Boolean).length;

  return (
    <main className="app-page">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="A6 Diagnose Startseite">
          <span className="brand-emblem">A6</span>
          <span className="brand-copy"><strong>DIAGNOSE</strong><small>INTELLIGENT WORKSHOP</small></span>
        </a>
        <div className="topbar-actions">
          <span className="ai-status online">
            <i /> KI bereit
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
                  <p>Ich gleiche Symptome, typische Fehlerbilder und Sicherheitsrisiken ab …</p>
                </div>
              </article>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <div className="error-banner"><strong>Verbindung fehlgeschlagen</strong><span>{error}</span></div>}

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
                {isLoading ? "Prüfe …" : "Diagnose starten"}
                <b>→</b>
              </button>
            </div>
          </form>
          <p className="disclaimer">KI-Einschätzung ersetzt keine Sichtprüfung. Bei roter Warnleuchte, Brems- oder Lenkungsproblemen: nicht weiterfahren.</p>
        </section>

        <aside className="right-rail">
          <section className="readiness-card ready">
            <div className="readiness-icon"><span /></div>
            <span className="eyebrow">Diagnosemotor</span>
            <h2>Bereit für die Analyse</h2>
            <p>Das Fahrzeugprofil und der bisherige Dialog werden bei jeder Antwort berücksichtigt.</p>
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
