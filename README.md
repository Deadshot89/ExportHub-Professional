# ExportHUB Professional 0.6.0

Separates SaaS-Projekt für ExportHUB. **Nicht** in `Deadshot89/ExportHub` hochladen.

## Neu in 0.6

- serverseitige Anmeldung mit Workspace + Benutzer + Passwort
- scrypt-Passworthashes statt Legacy-Klartextpasswörter
- HttpOnly/Secure/SameSite-Strict Sitzungen
- serverseitige Benutzer-/Mandantenzuordnung über PostgreSQL
- Erst-Onboarding für den ersten Firmenmandanten
- getrennte Write Gates für Identity-Control-Plane und operative Migrationsdaten
- PostgreSQL RLS bleibt zweite Mandantenschutzschicht
- RC826-Migration bleibt read-only und unverändert

## Sicherheitszustand

`PROFESSIONAL_ENABLE_WRITES=false` bleibt Standard. Das bedeutet: Kunden, Sendungen, PODs und Dokumente aus der Bestandsmigration können weiterhin nicht produktiv überschrieben werden.

Identity-/Onboarding-Schreibzugriffe sind separat über `PROFESSIONAL_ENABLE_CONTROL_WRITES` gesperrt und müssen bewusst aktiviert werden.

## Tests

`npm test`

Der CI-Workflow prüft zusätzlich API-Module und verhindert weiterhin Internal-Dateien wie `TESTVERSION.html` oder `production-version.js` im Professional-Repository.
