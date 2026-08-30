# Migrationsbericht

Ein echter Migrationslauf muss mindestens enthalten:

- Quellversion
- Exportzeitpunkt
- SHA-256 des kompletten Originalbackups
- Anzahl Kunden
- Anzahl Sendungs-Quelldatensätze
- Anzahl eindeutiger Sendungen
- Anzahl PODs
- Anzahl weiterer Dokumente
- Anzahl Benutzer
- Anzahl vollständig gehashter eingebetteter Dateien
- Anzahl remote zu erfassender Dateien
- Mapping-Abdeckung
- READ_ONLY_READY: Ja/Nein
- CUTOVER_READY: Ja/Nein
- Blocker mit eindeutiger Begründung

Ein Produktiv-Cutover darf nur stattfinden, wenn CUTOVER_READY = Ja und ein zweiter unabhängiger Soll/Ist-Vergleich bestanden wurde.
