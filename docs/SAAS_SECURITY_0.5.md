# ExportHUB Professional 0.5 – SaaS-Sicherheitsbasis

## Mandantentrennung

Jeder operative Datensatz trägt `tenant_id`. Zugriff wird zweifach begrenzt:

1. API-/Anwendungslogik prüft Access Context + Berechtigung.
2. PostgreSQL Row Level Security (RLS) prüft zusätzlich `app.tenant_id` pro Transaktion.

Ein Platform-Admin erhält bewusst nicht automatisch operative Leserechte auf Kundensendungen. Plattformverwaltung und operative Mandantendaten sind getrennt.

## Rollen

- PLATFORM_ADMIN – Plattformstatus und Mandantenverwaltung
- TENANT_ADMIN – vollständige Administration im eigenen Mandanten
- EXPORT_ADMIN – Exportprozessverwaltung im eigenen Mandanten
- TEAM_LEAD – operative Steuerung
- OPERATOR – Sendungen/Aufgaben/Dokumente bearbeiten
- WAREHOUSE – Abholung, POD und Paletten
- AUDITOR – ausschließlich lesende Prüfung

## Datenbankmodus

Standard ist `PROFESSIONAL_DATA_MODE=migration-read-only`. Schreibende DB-Operationen bleiben blockiert, bis später sowohl `PROFESSIONAL_DATA_MODE=live` als auch `PROFESSIONAL_ENABLE_WRITES=true` bewusst gesetzt werden.

Der RC826-Bestand wird in 0.5 nicht schreibend an eine Datenbank übertragen.
