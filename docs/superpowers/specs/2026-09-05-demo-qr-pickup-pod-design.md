# ExportHUB Professional Demo – QR-Abholung, Verlade-PIN und POD

## Ziel

Die Firmen-Demo zeigt den Abholprozess nicht mehr als direkten Statussprung, sondern als nachvollziehbare lokale Präsentationsstrecke von der QR-Übergabe über PIN/Colli-Prüfung bis zum POD.

## Präsentationsablauf

1. Eine Sendung im Status **Bereit zur Abholung** bietet **QR-Abholung öffnen** an.
2. Eine externe DEMO-Abholansicht zeigt Referenz, Kunde, Ziel, Colli und Gewicht.
3. Die Ansicht verlangt einen fiktiven vierstelligen Verlade-PIN und die physische Colli-Anzahl.
4. Falscher PIN oder abweichende Colli blockieren die Bestätigung.
5. Erfolgreiche Bestätigung schreibt einen lokalen Abholnachweis mit Fahrer, Colli, Referenz und Zeitstempel und setzt den Status auf **Abgeholt**.
6. Eine zweite Abholbestätigung derselben Sendung ist gesperrt.
7. Nach Abholung bleibt **POD fehlt** als eigener Nachweisschritt offen.
8. Über **POD-Nachweis öffnen** wird ein fiktiver POD ergänzt und der Status auf **POD vorhanden** gesetzt.

## Rollen

- Firmenadmin und Exportkoordination können die komplette Präsentationsstrecke zeigen.
- Lager kann Abholung und POD bedienen.
- Die vorhandene Rollenlogik wird nicht aufgeweicht.

## Isolation

- kein echter QR-Scan und keine Kamera
- keine API-, Auth-, SQL-, Blob-, Mail- oder Netzwerkverbindung
- ausschließlich lokale fiktive Daten
- Preview enthält keine Azure Functions
- jede externe Ansicht sichtbar **DEMO / MUSTER**

## TDD-Vertrag

Die Implementierung deckt folgende Fälle ab:

- lokaler Pickup-Verweis und vierstelliger Demo-PIN
- falscher PIN blockiert
- falsche Colli-Anzahl blockiert
- erfolgreiche Abholung setzt genau einmal auf **Abgeholt**
- POD ist vor Abholung gesperrt
- POD ergänzt den Nachweis erst nach Abholung
- Sendungsarbeitsplatz öffnet die Präsentationsstrecke statt den Status direkt zu überspringen
- CI und Preview prüfen das neue Runtime-Modul und die harte Isolation

## Verifikation

- RED: 147 Tests gesamt, 139 PASS, exakt 8 neue Pickup/POD-Verträge FAIL
- GREEN: **147/147 PASS**
- **11/11 Demo-Runtime-Module** ohne API/Auth/Netzwerk/Kamera/Mail
- Professional CI **#306** / Run `33975103941`: PASS
- Company Showcase Preview **#65** / Run `33975103947`: PASS
- Azure-Deployment: Succeeded
- Azure Functions/API im Preview: nicht erstellt
- veröffentlichter `/demo/`-Endpunkt: HTTP-Smoke-Test PASS
