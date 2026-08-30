# ExportHUB Professional – Roadmap ab 0.5

## 0.5 – SaaS-Sicherheitsbasis (aktueller Stand)

- Rollen- und Berechtigungsmodell
- Tenant-Scope vor Datenzugriff
- Read-only-Store für Migrationsdaten
- PostgreSQL-Zielschema mit Row Level Security
- vorbereiteter DB-Adapter mit standardmäßig deaktivierten Writes
- `/api/professional-meta` und Health-Endpunkt
- RC826-Baseline und Dokument-Cutover-Gates unverändert erhalten

## 0.6 – Authentifizierung & Firmen-Onboarding

- sichere Benutzeridentität
- Firmen-/Mandantenzuordnung serverseitig
- Einladungen und Passwort-Neuvergabe/SSO-Option
- Plattform-Admin getrennt von operativen Mandantendaten
- Session-/Login-Audit

## 0.7 – Produktive Read-only-Datenbankmigration

- Migrationslauf in PostgreSQL schreiben, weiterhin ohne operativen Write-Cutover
- Source Map + Hashes dauerhaft speichern
- Bestandsvergleich Alt/Neu
- Remote-POD-Capture-Queue

## Danach

- Sendungserstellung
- Dokumentenspeicher
- Aufgaben & Planung
- Abholung/POD
- Paletten
- Reports
- Plattformadministration
