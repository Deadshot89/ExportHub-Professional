# Aktuelle Migrations-Baseline – RC826

Professional 0.7 wurde gegen das echte Legacy-Backup aus ExportHUB Internal geprüft. Die Quelle besitzt keinen modernen `type/version/exportedAt`-Kopf und wird daher als `legacy-state-users` mit bestätigtem Versionshinweis RC826 behandelt.

## Bestands-Baseline

- 65 eindeutige Kunden
- 208 Sendungs-Quellstände → 128 eindeutige Sendungen
- 23 Benutzer
- 602 Dokument-Quellobjekte → 305 eindeutige Dokumente
- 68 eindeutige POD-Dokumentartefakte
- 61 Sendungen mit POD-Evidenz

## Dokumentstatus

- 61 eingebettete Dateien per SHA-256 verifiziert
- 32 Remote-Dokumente müssen vor Cutover separat gesichert werden
- 212 Dokumentartefakte besitzen im Backup keinen Dateiinhalte und bleiben ausdrücklich offen
- 35 POD-Dokumente sind noch nicht vollständig lokal verifiziert

## Dokumentarten

- 68 POD
- 151 Lieferscheine
- 35 ABD
- 48 sonstige Dokumente
- 2 Rechnungen
- 1 Ladeliste

Alle 35 ABD-Dokumente, 68 POD-Dokumente und 151 Lieferschein-Dokumente konnten einer Sendungsreferenz zugeordnet werden.

Die Quellversion ist über den SHA-256-Fingerprint an die konkrete Backup-Datei gebunden. Der detaillierte RC826-Dokumentbericht wird aus Datenschutzgründen nicht in das Professional-Quellrepository aufgenommen.

## Professional 0.7 Zusatzprüfung

- 66 eindeutige Standortdatensätze bei 63 Kunden mit vorhandener Standort-/Adressinformation
- 92 Sendungen konnten eindeutig auf einen Professional-Standort abgebildet werden
- 27 Sendungen enthalten einen Standortnamen, dessen Zuordnung bewusst offen bleibt statt zu raten
- 12.278 Audit-Ereignisse strukturiert (11.480 Legacy-Audit + 798 Security-Audit)
- 32 Remote-Capture-Aktionen geplant
- 211 Dokumente benötigen weiterhin die tatsächliche Originaldatei
- 1 fehlendes generierbares Dokument kann aus dem gesperrten Sendungsstand neu erzeugt werden, gilt bis dahin aber nicht als migrierte Originaldatei
- 2.029 Metadatensätze generierter Dokumentartefakte separat erhalten
- Kern-Mapping weiterhin 898 / 898
