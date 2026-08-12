# Audi Diagnose Pro

KI-gestützte Fahrzeugdiagnose für einen Audi A6 3.0 TDI mit 240 PS. Die Anwendung stellt gezielte Rückfragen und erstellt anschließend eine Sicherheitsbewertung, wahrscheinliche Ursachen, Reparaturschritte, Einkaufsliste und Kostenspannen.

Die Produktion läuft auf Vercel. Der AI Gateway authentifiziert sich dort automatisch über OIDC; im Browser und im Repository wird kein statischer Gateway-Schlüssel benötigt.

## Entwicklung

```bash
npm install
npm run dev
```
