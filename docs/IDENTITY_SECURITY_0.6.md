# ExportHUB Professional 0.6 – Anmeldung & Mandantenzuordnung

## Sicherheitsprinzip

Professional 0.6 besitzt erstmals eine serverseitige Identity-Schicht. Der Browser entscheidet weder Mandant noch Rolle selbst. Eine erfolgreiche Anmeldung wird aus **Workspace + Anmeldename + Passwort** serverseitig gegen `tenants`, `app_users`, `tenant_memberships` und `app_user_auth` aufgelöst.

## Sitzung

- Zufälliger 256-Bit-Sitzungstoken.
- Nur als `HttpOnly; Secure; SameSite=Strict` Cookie.
- In PostgreSQL wird nur SHA-256 des Tokens gespeichert.
- Tenant-ID ist als nicht-geheimer Routing-Präfix Teil des Tokens, damit die API vor dem RLS-Zugriff den richtigen Tenant Scope setzen kann.
- Rolle und Aktivstatus werden bei der Sitzungsauflösung erneut aus der Datenbank gelesen.
- CSRF-Wert wird aus dem Sitzungstoken per HMAC abgeleitet und niemals als Cookie-JavaScript-Geheimnis verwendet.

## Passwörter

- Legacy-Passwörter werden weiterhin nicht migriert.
- Neue Professional-Passwörter werden mit Node.js `scrypt` und zufälligem Salt gehasht.
- Mindestlänge: 12 Zeichen.
- Kein Klartextpasswort wird gespeichert oder in Auditdaten geschrieben.

## Firmen-Onboarding

0.6 implementiert absichtlich nur das **Erst-Onboarding** einer Plattforminstanz. Es benötigt:

- konfigurierte Professional-Datenbank,
- `PROFESSIONAL_ENABLE_CONTROL_WRITES=true`,
- `PROFESSIONAL_BOOTSTRAP_TOKEN` mit mindestens 24 Zeichen,
- `PROFESSIONAL_SESSION_SECRET` mit mindestens 32 Zeichen.

Das Bootstrap-Token wird nur für die Erstellung des ersten Mandanten verwendet. Sobald ein Mandant existiert, lehnt die API weitere Erst-Onboardings ab.

## Zwei getrennte Write Gates

`PROFESSIONAL_ENABLE_CONTROL_WRITES` erlaubt ausschließlich Identity-/Onboarding-Schreibpfade der Professional-Control-Plane.

`PROFESSIONAL_ENABLE_WRITES` bleibt für operative Daten wie Sendungen, Kunden und Dokumente separat und ist in der Migrationsphase weiterhin **false**.

Dadurch kann die Professional-Anmeldung aufgebaut werden, ohne den RC826-Bestandsimport schreibend freizugeben.
