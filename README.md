# Audi Diagnose Pro

KI-gestützte Fahrzeugdiagnose für einen Audi A6 3.0 TDI mit 240 PS. Die Anwendung stellt gezielte Rückfragen und erstellt anschließend eine Sicherheitsbewertung, wahrscheinliche Ursachen, Reparaturschritte, Einkaufsliste und Kostenspannen.

Die öffentliche Anwendung läuft unter `https://audi-diagnose-pro.early-tiger-2839.chatgpt.site`. Die echte KI läuft mit WebLLM und Qwen 3.5 vollständig lokal im Browser des Besuchers. Es werden weder Vercel noch ein API-Schlüssel, ein Benutzerkonto oder eine Zahlungsmethode benötigt.

Beim ersten Start wird das gewählte Modell heruntergeladen und anschließend im Browser-Cache gespeichert:

- Schnell: Qwen 3.5 2B, ungefähr 2,2 GB Grafikspeicher
- Präzise: Qwen 3.5 4B, ungefähr 3,9 GB Grafikspeicher

Voraussetzung ist ein aktueller Chrome- oder Edge-Browser mit WebGPU und aktivierter Hardwarebeschleunigung.

## Entwicklung

```bash
npm install
npm run dev
```

Dieses Repository enthält eine statisch exportierbare Next.js-Version derselben Oberfläche und Diagnose-Logik.
