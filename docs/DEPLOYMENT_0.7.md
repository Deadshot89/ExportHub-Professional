# Professional 0.7 – Deployment-Konfiguration

## Erforderliche Identity-Variablen

| Variable | Zweck | Standard |
|---|---|---|
| `PROFESSIONAL_DATABASE_URL` | PostgreSQL-Verbindung | nicht gesetzt |
| `PROFESSIONAL_DATABASE_SSL` | TLS für PostgreSQL | `true` |
| `PROFESSIONAL_SESSION_SECRET` | HMAC/CSRF-Secret, mindestens 32 Zeichen | nicht gesetzt |
| `PROFESSIONAL_SESSION_HOURS` | Sitzungsdauer | `8` |
| `PROFESSIONAL_BOOTSTRAP_TOKEN` | einmalige Ersteinrichtung | nicht gesetzt |
| `PROFESSIONAL_ENABLE_CONTROL_WRITES` | Identity-/Benutzer-Schreibzugriffe | `false` |
| `PROFESSIONAL_INVITE_HOURS` | Gültigkeit von Einladungen | `48` |
| `PROFESSIONAL_RESET_MINUTES` | Gültigkeit von Passwort-Reset-Tokens | `60` |

## Operativer Migrationsschutz

Diese Variablen bleiben unabhängig von der Identity-Control-Plane:

| Variable | Empfohlener 0.7-Wert |
|---|---|
| `PROFESSIONAL_DATA_MODE` | `migration-read-only` |
| `PROFESSIONAL_ENABLE_WRITES` | `false` |

Damit können Firmen-/Benutzerkonten für Professional getestet werden, ohne Kunden, Sendungen, PODs oder Dokumente aus der Bestandsmigration schreibend freizugeben.

## Datenbankschema

Vor dem Live-Test muss `schema/postgres.sql` auf der Professional-PostgreSQL-Datenbank angewendet werden. 0.7 ergänzt `user_invitations` und `password_reset_tokens`; beide Tabellen sind in die Tenant-RLS aufgenommen.
