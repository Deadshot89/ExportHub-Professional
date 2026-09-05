# ExportHUB Professional Demo – Sendungs-Gesamtausgabe

## Ziel

Die Firmen-Demo erhält pro Sendung zusätzlich zum bestehenden Einzel-Dokument-Viewer eine zusammenhängende **Gesamtausgabe** für Präsentation, Druck und lokalen Musterdownload.

## Umfang

- ein Klick über **Gesamtausgabe öffnen** im Dokumentenarbeitsbereich
- eigenes Deckblatt mit Referenz, Kunde, Ziel, Status, Abholung, Colli, Gewicht, Seitenzahl und offenen Pflichtunterlagen
- L1 / QR und L2 als feste Bestandteile
- bei internationalen Sendungen genau drei CMR-Ausfertigungen `1/3`, `2/3`, `3/3`
- ABD nur, wenn die Sendung ausfuhrpflichtig ist
- POD erst ab dem Prozessschritt Abholung; vorhanden/fehlend bleibt sichtbar
- durchgehende Seitennummerierung über das gesamte Paket
- jede Seite sichtbar `DEMO / MUSTER`
- sicherer lokaler HTML-Dateiname mit Referenz, Kunde und `Gesamtausgabe_DEMO-MUSTER`
- Browserdruck und lokaler `Blob`-Download

## Isolation

- keine API-, Auth-, SQL-, Blob-, Mail- oder Netzwerkverbindung
- keine Azure Functions im Preview
- ausschließlich fiktive Demo-Daten und lokaler Browserzustand
- `main` bleibt unverändert; Umsetzung nur auf `demo/company-showcase`

## Akzeptanz

- Nicht-EU/international: Deckblatt + L1 + L2 + 3× CMR + ABD, falls erforderlich
- Inland: kein CMR und kein ABD
- POD nur nach Abholung
- offene Dokumente werden auf dem Deckblatt als Handlungsbedarf ausgewiesen
- vollständiger Professional-Testlauf, Syntaxprüfung, Demo-Isolationsscan, Azure-Preview und HTTP-Smoke-Test müssen grün sein

## Verifikation

Verifizierter Funktionsstand vor Dokumentationsabschluss:

- Professional Tests: 139/139 PASS
- Demo-Isolation: 10/10 Runtime-Module ohne API/Auth/Netzwerk/Mail
- Azure Company Showcase Preview und HTTP-Smoke-Test: PASS
