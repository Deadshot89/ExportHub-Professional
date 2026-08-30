# ExportHUB Professional 0.5.0

Eigenständige Professional-/SaaS-Basis. Dieses Repository darf nicht in `Deadshot89/ExportHub` hochgeladen werden.

## Neu in 0.5

- serverseitig nutzbares Rollen- und Berechtigungsmodell mit sieben klaren Rollen
- harte Tenant-Scope-Prüfung gegen mandantenübergreifende Zugriffe
- mandantengefilterter Read-only-Store für den bestehenden Migrationsbestand
- PostgreSQL-Zielschema mit Row Level Security als zweite Tenant-Schutzschicht
- vorbereitete PostgreSQL-Datenzugriffsschicht; Standardmodus bleibt `migration-read-only`
- Schreibzugriff benötigt später zwei bewusste Freigaben (`live` + `PROFESSIONAL_ENABLE_WRITES=true`)
- neuer `/api/professional-meta`-Endpunkt für technische Plattformfähigkeiten ohne Secrets
- RC826-Migrationslogik, Dokumentregister, POD-Schutz, Kundenstandorte und Audit bleiben erhalten

## Sicherheitsregel

Professional 0.5 schreibt nicht in ExportHUB Internal und führt keinen automatischen Cutover durch. Das alte Quellsystem bleibt unangetastet. Remote-/fehlende Dokumente blockieren weiterhin den endgültigen Cutover.

## Lokal prüfen

`npm test`

Optional für die API-Abhängigkeiten: `npm install --prefix api`.
