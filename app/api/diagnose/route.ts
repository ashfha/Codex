import { createGateway, generateText, Output } from "ai";
import { z } from "zod";

const vehicleSchema = z.object({
  make: z.string().max(40),
  model: z.string().max(40),
  year: z.string().max(20),
  engine: z.string().max(60),
  power: z.string().max(40),
  generation: z.string().max(60),
  mileage: z.string().max(40),
  engineCode: z.string().max(40),
  transmission: z.string().max(80),
  vin: z.string().max(40),
});

const conversationSchema = z.array(z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
})).min(1).max(16);

const replySchema = z.object({
  kind: z.enum(["follow_up", "diagnosis"]),
  message: z.string().describe("Direkte, verständliche Antwort auf Deutsch."),
  questions: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
  safetyLevel: z.enum(["safe", "caution", "stop"]),
  safeToDrive: z.boolean().nullable(),
  summary: z.string(),
  likelyCauses: z.array(z.object({
    name: z.string(),
    probability: z.number().min(0).max(1),
    reason: z.string(),
    checks: z.array(z.string()).max(5),
  })).max(5),
  repairPlan: z.array(z.object({
    number: z.number().int().positive(),
    title: z.string(),
    instruction: z.string(),
    difficulty: z.enum(["leicht", "mittel", "schwer", "werkstatt"]),
    time: z.string(),
    safety: z.string(),
  })).max(10),
  shoppingList: z.array(z.object({
    item: z.string(),
    specification: z.string(),
    quantity: z.string(),
    priceMin: z.number().min(0),
    priceMax: z.number().min(0),
    note: z.string(),
  })).max(12),
  costs: z.object({
    partsMin: z.number().min(0),
    partsMax: z.number().min(0),
    workshopMin: z.number().min(0),
    workshopMax: z.number().min(0),
    currency: z.literal("EUR"),
  }).nullable(),
  nextBestAction: z.string(),
  warnings: z.array(z.string()).max(6),
});

const SYSTEM_PROMPT = `Du bist A6 DIAG, ein außergewöhnlich gewissenhafter deutscher Kfz-Meister und Diagnosetechniker mit besonderer Erfahrung bei Audi A6 und VAG-Dieselmotoren. Du arbeitest wie eine sehr gute Werkstatt: erst Symptome und Messwerte sauber eingrenzen, dann eine Lösung empfehlen.

Arbeitsregeln:
- Antworte ausschließlich auf Deutsch, konkret und für einen technisch interessierten Laien verständlich.
- Stelle gezielte Rückfragen, solange wesentliche Angaben fehlen. Maximal fünf Fragen pro Antwort. Frage besonders nach: exaktem Zeitpunkt, warm/kalt, Drehzahl/Geschwindigkeit, Warnleuchten und Wortlaut, Fehlercodes, Geräuschort und -art, Geruch/Rauch/Flüssigkeit, kürzlichen Arbeiten sowie Wiederholbarkeit.
- Trenne Beobachtung, wahrscheinliche Ursache und sichere Feststellung. Behaupte niemals, ein Teil sei sicher defekt, wenn es nicht gemessen oder geprüft wurde.
- Teile- oder Flüssigkeitsspezifikationen müssen zum Fahrzeug passen. Erfinde niemals Teilenummern. Ist FIN, PR-Code, Motorkennbuchstabe, Getriebe oder Baureihe für die Zuordnung nötig, frage danach oder schreibe klar, wie vor dem Kauf geprüft werden muss.
- Kosten sind realistische deutsche Endkunden-Spannen in EUR inklusive typischer Kleinteile. Kennzeichne indirekt durch Spannbreiten, dass Preise regional abweichen. Unterscheide reine Teilekosten und freie Werkstatt inklusive Arbeit.
- Gib Reparaturschritte in risikoarmer Reihenfolge: zuerst kostenlose Sicht-/Funktionsprüfungen, dann Messungen, erst dann Teiletausch.
- Sicherheitskritisch: Bei roter Öl-, Kühlmittel- oder Bremswarnung, starkem Kraftstoffgeruch, Überhitzung, Brems-/Lenkungsverlust, Rauch/Brandgefahr oder unklaren metallischen Motorschlägen lautet safetyLevel "stop". Keine Weiterfahrt empfehlen.
- Keine gefährlichen Anleitungen für Airbag, gespannte Federn, Hochdruck-Kraftstoffsystem, Arbeiten unter einem nur vom Wagenheber gehaltenen Auto oder Bremsen ohne passenden Kompetenzhinweis. Nenne Schutzmaßnahmen und Werkstattgrenzen.
- Berücksichtige bei einem Audi A6 3.0 TDI unter anderem Batterie/Lademanagement, Glühsystem, AGR, DPF, Ladedrucksystem, Drallklappen, Injektorkorrekturwerte, Steuerkettengeräusche, Thermostat/Kühlkreislauf, quattro/Tiptronic – aber nur, wenn die Symptome wirklich passen. Keine typische-Fehler-Liste ohne Bezug.

Antwortlogik:
- Nutze kind "follow_up", wenn die Ursache noch nicht belastbar eingegrenzt ist. Dann: kurze Einordnung in message, 2–5 priorisierte questions, gegebenenfalls safetyLevel und warnings. Alle Diagnose-, Reparatur-, Einkaufs- und Kostenfelder bleiben leer bzw. costs null.
- Nutze kind "diagnosis" erst, wenn genug Informationen für eine brauchbare Arbeitsdiagnose vorliegen. Nenne dann bis zu fünf Ursachen mit ehrlichen Wahrscheinlichkeiten, sinnvolle Prüfungen, einen Reparaturplan, Einkaufsliste und Kostenspannen. Confidence beschreibt die Sicherheit der Arbeitsdiagnose, nicht rhetorisches Selbstvertrauen.
- Wenn der Nutzer nur eine allgemeine Wartungsfrage stellt, darfst du direkt diagnostisch antworten, sofern Fahrzeugzuordnung und Spezifikation reichen.`;

export async function GET() {
  return Response.json({ configured: true, authentication: "vercel-oidc" });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const vehicle = vehicleSchema.parse(body.vehicle);
    const messages = conversationSchema.parse(body.messages);
    const gateway = createGateway();
    const { output } = await generateText({
      model: gateway("openai/gpt-5.6-sol"),
      system: SYSTEM_PROMPT,
      output: Output.object({ schema: replySchema }),
      maxOutputTokens: 4200,
      prompt: `FAHRZEUGPROFIL\n${JSON.stringify(vehicle, null, 2)}\n\nBISHERIGER DIALOG\n${messages.map((message) => `${message.role === "user" ? "FAHRER" : "A6 DIAG"}: ${message.content}`).join("\n\n")}\n\nErstelle jetzt die nächste fachlich korrekte Antwort nach den Regeln.`,
    });

    return Response.json({ reply: output });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Die übermittelten Fahrzeug- oder Problemdaten sind unvollständig." }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    console.error("A6 DIAG generation failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message,
    });
    const billingRequired = /valid credit card|add a card|free credits|payment required|\b402\b/i.test(message);
    const authenticationError = /auth|oidc|unauth|forbidden|401|403/i.test(message);
    return Response.json(
      {
        code: billingRequired ? "BILLING_REQUIRED" : authenticationError ? "AI_NOT_CONFIGURED" : "DIAGNOSIS_FAILED",
        error: billingRequired
          ? "Vercel verlangt einmalig eine hinterlegte Zahlungsmethode, bevor die kostenlosen AI-Gateway-Credits freigeschaltet werden. Ein API-Schlüssel ist nicht erforderlich."
          : authenticationError
            ? "Die automatische KI-Verbindung ist gerade nicht verfügbar."
            : "Die KI-Diagnose konnte gerade nicht abgeschlossen werden. Bitte versuche es erneut.",
      },
      { status: billingRequired ? 402 : authenticationError ? 503 : 500 },
    );
  }
}
