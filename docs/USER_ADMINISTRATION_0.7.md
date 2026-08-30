# ExportHUB Professional 0.7 – Benutzerverwaltung

## Rollen und Berechtigungen

Nur `TENANT_ADMIN` besitzt `users.manage`. Andere Rollen dürfen – sofern ihre Rolle `users.read` enthält – Benutzerinformationen lesen, aber keine Einladungen, Rollenänderungen, Aktivierungen/Deaktivierungen oder Passwort-Resets ausführen.

Die API ermittelt Tenant und Rolle aus der serverseitigen Sitzung. `tenantId` und Benutzerrolle werden bei Admin-Aktionen nicht aus Browserfeldern übernommen.

## Einladung

1. Firmen-Admin erfasst Anzeigename, E-Mail, Anmeldename und Rolle.
2. Server erzeugt einen kryptographisch zufälligen Einmal-Token.
3. In PostgreSQL wird nur `SHA-256(token)` gespeichert.
4. Standardgültigkeit: 48 Stunden (`PROFESSIONAL_INVITE_HOURS`, 1–168 Stunden).
5. Beim Einlösen wird das Passwort mit scrypt gehasht und erst dann der Benutzer, die Membership und die Auth-Identität angelegt.
6. Einladung wird anschließend als `accepted_at` markiert und kann nicht erneut benutzt werden.

## Passwort-Reset

Ein Firmen-Admin kann für einen Benutzer einen einmaligen Reset-Link erzeugen. Bereits offene Reset-Tokens für diesen Benutzer werden widerrufen. Außerdem werden vorhandene Sitzungen sofort beendet und `password_reset_required=true` gesetzt.

Standardgültigkeit: 60 Minuten (`PROFESSIONAL_RESET_MINUTES`, 15–1440 Minuten).

Nach erfolgreichem Reset werden:

- Passwort neu mit scrypt gehasht,
- Fehlversuche auf 0 gesetzt,
- Kontosperre entfernt,
- `password_reset_required=false` gesetzt,
- Reset-Token einmalig als benutzt markiert,
- noch vorhandene Sitzungen widerrufen.

## Schutz des Firmen-Admins

Professional 0.7 blockiert:

- Deaktivierung des eigenen aktuell angemeldeten Kontos,
- Änderung der eigenen Rolle über die Benutzerverwaltung,
- Deaktivierung des letzten aktiven `TENANT_ADMIN`,
- Herabstufung des letzten aktiven `TENANT_ADMIN`.

Damit kann ein Firmenmandant sich nicht versehentlich vollständig aus seiner Administration aussperren.

## CSRF

Alle schreibenden Benutzer-Admin-Endpunkte verlangen zusätzlich zur HttpOnly-Sitzung den vom Server abgeleiteten Header `x-professional-csrf`.

## Audit

Folgende Ereignisse werden strukturiert in `audit_events` erfasst:

- `USER_INVITED`
- `USER_INVITE_REDEEMED`
- `USER_ROLE_CHANGED`
- `USER_ACTIVATED`
- `USER_DEACTIVATED`
- `PASSWORD_RESET_ISSUED`
- `PASSWORD_RESET_REDEEMED`

Roh-Tokens und Klartextpasswörter werden nicht in Audit-Metadaten geschrieben.
