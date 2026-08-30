# ExportHUB Professional 0.7.0

Separates SaaS-Projekt für ExportHUB. **Nur** in `Deadshot89/ExportHub-Professional` verwenden. Nicht in `Deadshot89/ExportHub` hochladen.

## Neu in 0.7

- serverseitige Benutzerverwaltung pro Firmenmandant
- Einladungen mit einmaligen, gehasht gespeicherten Tokens
- sichere Erstpasswortvergabe über URL-Fragment statt Query-Token
- Admin-Passwort-Reset mit einmaligem Token und sofortiger Sitzungsrevokation
- Rollenänderungen ausschließlich durch `TENANT_ADMIN`
- Aktivieren/Deaktivieren von Benutzerkonten mit Sitzungsrevokation
- Schutz vor Selbst-Deaktivierung und vor Verlust des letzten aktiven Firmen-Admins
- CSRF-Prüfung für alle mutierenden Benutzer-Admin-APIs
- strukturierter Identity-Audit-Trail für Einladung, Rollen, Status und Passwort-Reset
- offene Einladungen und Identity-Audit direkt im Bereich `Benutzer & Rollen`

## Bestehende Sicherheitsbasis

- Workspace + Benutzer + Passwort werden serverseitig aufgelöst
- scrypt-Passworthashes
- HttpOnly / Secure / SameSite-Strict Session-Cookie
- serverseitige Mandantenbindung
- PostgreSQL Row Level Security als zweite Mandantenschutzschicht
- 5 Fehlversuche → 30 Minuten Kontosperre

## Schreibschutz der Bestandsmigration

`PROFESSIONAL_DATA_MODE=migration-read-only` und `PROFESSIONAL_ENABLE_WRITES=false` bleiben Standard. Kunden, Sendungen, PODs und Dokumente aus dem RC826-Bestand können damit weiterhin nicht produktiv überschrieben werden.

Benutzer-/Identity-Schreibzugriffe laufen getrennt über `PROFESSIONAL_ENABLE_CONTROL_WRITES=true`. Diese Freigabe aktiviert **nicht** automatisch operative Sendungs-/Dokumentschreibzugriffe.

## Einladungs- und Reset-Links

Professional speichert nur SHA-256-Hashes der Einmal-Tokens. Der Klartext-Token wird genau beim Erzeugen an den Firmen-Admin zurückgegeben. Browserlinks verwenden `#invite=` bzw. `#reset=` im URL-Fragment, damit der Token nicht als normale URL-Query an den Webserver übertragen wird.

Ein automatischer E-Mail-Versand ist in 0.7 bewusst noch nicht aktiviert. Der Admin kopiert den erzeugten Einmal-Link und übermittelt ihn über einen geeigneten sicheren Kanal.

## Tests

```text
npm test
```

Der CI-Workflow prüft zusätzlich alle API-Module sowie die eindeutige Repository-Identität und blockiert Internal-Dateien wie `TESTVERSION.html` oder `production-version.js`.
