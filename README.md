# Audi Diagnose Pro

KI-gestützte Fahrzeugdiagnose für einen Audi A6 3.0 TDI mit 240 PS. Die Anwendung stellt gezielte Rückfragen und erstellt anschließend eine Sicherheitsbewertung, wahrscheinliche Ursachen, Reparaturschritte, Einkaufsliste und Kostenspannen.

Die Anwendung wird kostenlos als statische Website über GitHub Pages veröffentlicht. Die echte KI läuft mit WebLLM und Qwen 3.5 vollständig lokal im Browser des Besuchers. Es werden weder Vercel noch ein API-Schlüssel, ein Benutzerkonto oder eine Zahlungsmethode benötigt.

Beim ersten Start wird das gewählte Modell heruntergeladen und anschließend im Browser-Cache gespeichert:

- Standard: Qwen 3.5 4B, ungefähr 3,9 GB Grafikspeicher
- Pro: Qwen 3.5 9B, ungefähr 6,4 GB Grafikspeicher

Voraussetzung ist ein aktueller Chrome- oder Edge-Browser mit WebGPU und aktivierter Hardwarebeschleunigung.

## Entwicklung

```bash
npm install
npm run dev
```

Ein Push auf `main` baut den statischen Export und veröffentlicht ihn automatisch mit GitHub Actions auf GitHub Pages.
