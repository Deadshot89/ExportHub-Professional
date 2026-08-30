# Professional 0.6 – Deployment-Konfiguration

## Erforderliche Professional-Umgebungsvariablen

| Variable | Zweck | 0.6 Standard |
|---|---|---|
| `PROFESSIONAL_DATABASE_URL` | PostgreSQL-Verbindung | nicht gesetzt |
| `PROFESSIONAL_DATABASE_SSL` | SSL-Verhalten | SSL aktiv |
| `PROFESSIONAL_SESSION_SECRET` | HMAC-Geheimnis für Sitzungs-CSRF | nicht gesetzt; min. 32 Zeichen |
| `PROFESSIONAL_SESSION_HOURS` | Sitzungsdauer | 8 Stunden |
| `PROFESSIONAL_BOOTSTRAP_TOKEN` | einmaliger Plattform-Bootstrap | nicht gesetzt; min. 24 Zeichen |
| `PROFESSIONAL_ENABLE_CONTROL_WRITES` | Login-Sessions und Erst-Onboarding | `false` |
| `PROFESSIONAL_DATA_MODE` | operativer Datenmodus | `migration-read-only` |
| `PROFESSIONAL_ENABLE_WRITES` | operative Kunden/Sendungs-/Dokumentschreibzugriffe | `false` |

## Sichere Inbetriebnahme-Reihenfolge

1. Datenbank erstellen.
2. `schema/postgres.sql` anwenden.
3. Session Secret und Bootstrap Token als Azure Application Settings setzen; niemals committen.
4. `PROFESSIONAL_ENABLE_CONTROL_WRITES=true` setzen.
5. `PROFESSIONAL_DATA_MODE=migration-read-only` belassen.
6. `PROFESSIONAL_ENABLE_WRITES=false` belassen.
7. Ersten Firmenmandanten über die Ersteinrichtung anlegen.
8. Bootstrap Token nach erfolgreicher Erstinstallation rotieren oder entfernen.
9. Bestandsmigration weiter ausschließlich über READ_ONLY_READY prüfen.

0.6 erfordert **keinen** Schreibzugriff auf den bisherigen RC826-Kunden-/Sendungs-/POD-Bestand.
