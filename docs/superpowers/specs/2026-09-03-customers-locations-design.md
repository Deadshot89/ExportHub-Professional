# ExportHUB Professional – Kunden & Standorte Design

Datum: 03.09.2026
Repository: `Deadshot89/ExportHub-Professional`
Status: fachlich freigegeben, noch nicht implementiert

## 1. Ziel

Der Bereich **Kunden & Standorte** wird als erstes operatives Stammdatenmodul von ExportHUB Professional umgesetzt. Er ersetzt die bisherige reine Migrations-/Read-only-Darstellung durch eine mandantenfähige Live-Verwaltung für Kunden, Standorte, Anmelde-E-Mail-Adressen sowie standortbezogene Versandvorgaben.

Das Modul muss später direkt von der Sendungserstellung genutzt werden können. Neue Sendungen wählen immer bewusst einen konkreten Standort. Es gibt keine automatische Hauptadresse und keinen automatisch vorausgewählten Hauptstandort.

## 2. Fachliche Grundregeln

### Kunden

- Jeder Kunde hat eine manuell gepflegte **Kundennummer**.
- Die Kundennummer ist innerhalb eines Workspaces eindeutig.
- Firmenname ist Pflicht.
- Kunden werden nicht regulär gelöscht, sondern auf **Aktiv/Inaktiv** gesetzt.
- Ein Kunde darf bei der Erstanlage **nicht ohne Standort** gespeichert werden.
- Historische Sendungen und Dokumente behalten ihre Verknüpfung zu einem später deaktivierten Kunden.

### Standorte

- Ein Kunde hat mindestens einen und kann beliebig viele Standorte besitzen.
- Es gibt **keinen Hauptstandort** und keine Hauptadresse.
- Bei jeder neuen Sendung muss ein Standort bewusst ausgewählt werden.
- Standorte werden nicht regulär gelöscht, sondern auf **Aktiv/Inaktiv** gesetzt.
- Inaktive Standorte bleiben für historische Daten sichtbar, dürfen aber bei neuen Sendungen nicht auswählbar sein.

Pflichtfelder je Standort:

- Standortname
- Straße
- Hausnummer
- PLZ
- Ort
- Land
- mindestens eine gültige **Anmelde-E-Mail-Adresse**

Optionale Standortdaten:

- Ansprechpartner
- normale Kontakt-E-Mail
- Telefon
- Spedition
- Versandvorgaben / Versandhinweise
- zusätzliche strukturierte Sonderinformationen, soweit später benötigt

### Anmelde-E-Mail-Adressen

- Pro Standort sind mehrere Anmelde-E-Mail-Adressen möglich.
- Mindestens eine Anmelde-E-Mail ist Pflicht.
- Doppelte Anmelde-E-Mail-Adressen innerhalb desselben Standorts werden verhindert.
- Normale Kontakt-E-Mail-Adressen werden getrennt von Anmelde-E-Mails geführt.
- Wenn später eine Anmeldung für eine Sendung erzeugt wird, werden **automatisch alle als Anmelde-E-Mail hinterlegten Adressen des gewählten Standorts übernommen**.
- Es ist keine manuelle Einzelauswahl dieser hinterlegten Anmelde-E-Mails erforderlich.

### Spedition und Versandvorgaben

- Spedition und Versandvorgaben werden **pro Standort** gepflegt, nicht nur auf Kundenebene.
- Dadurch können verschiedene Werke desselben Kunden unterschiedliche Speditionen oder Versandregeln besitzen.

## 3. Empfohlenes Datenmodell

Das Kernmodell wird relational aufgebaut. Freie oder seltene Sonderinformationen können ergänzend als JSONB gespeichert werden, damit das relationale Kernmodell stabil bleibt.

### Tabelle `customers`

Bestehende Tabelle wird erweitert bzw. fachlich geschärft.

Geplante Kernfelder:

- `id uuid primary key`
- `tenant_id uuid not null`
- `legacy_id text null`
- `account text not null` – Kundennummer
- `name text not null` – Firmenname
- `active boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Regel:

- `unique(tenant_id, account)`

Bestehende kundenbezogene Länderfelder dürfen für Migration/Kompatibilität bestehen bleiben, sind aber für den Live-Betrieb nicht die führende Empfängeradresse. Die konkrete Adresse liegt am Standort.

### Tabelle `customer_locations`

Bestehende Tabelle wird erweitert.

Geplante Kernfelder für live gepflegte Standorte:

- `id uuid primary key`
- `tenant_id uuid not null`
- `customer_id uuid not null`
- `legacy_location_id text null`
- `name text not null`
- `street text`
- `house_number text`
- `postal_code text`
- `city text`
- `country text`
- `country_iso text null`
- `contact_name text null`
- `contact_email text null`
- `phone text null`
- `carrier_name text null`
- `shipping_instructions text null`
- `source_metadata jsonb not null default '{}'::jsonb`
- `active boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Für **neu live angelegte oder live bearbeitete Standorte** erzwingt die API Straße, Hausnummer, PLZ, Ort und Land als Pflichtfelder. Bei der Schema-Erweiterung dürfen die neuen strukturierten Adressspalten zunächst nullable bleiben, damit eventuell vorhandene Legacy-/Migrationszeilen mit dem bisherigen Feld `address` nicht beschädigt werden. Eine spätere Datenmigration kann die strukturierten Felder auffüllen.

Das vorhandene Feld `derived_main` darf für Import-/Legacy-Metadaten bestehen bleiben, wird im Live-Modul aber **nicht** zur automatischen Standortauswahl verwendet.

### Neue Tabelle `customer_location_registration_emails`

Zweck: beliebig viele Anmelde-E-Mail-Adressen sauber relational pro Standort speichern.

Geplante Felder:

- `id uuid primary key`
- `tenant_id uuid not null`
- `location_id uuid not null`
- `email text not null`
- `created_at timestamptz not null`

Regeln:

- Foreign Key auf `customer_locations`
- tenant-sichere Zuordnung
- case-insensitive Eindeutigkeit pro Standort über einen eindeutigen Index auf Tenant, Standort und normalisierte E-Mail

## 4. Architektur und API

Das Modul folgt den bestehenden Professional-Mustern für Sessions, Berechtigungen, Tenant-Isolation, CSRF-Schutz und Audit.

Der Browser liefert keine frei verwendbaren Tenant-IDs. Der Workspace wird ausschließlich aus der validierten Sitzung abgeleitet.

Geplante serverseitige Fähigkeiten:

- Kundenliste mit Suche laden
- Kundendetail inklusive Standorten laden
- Kunde mit erstem Pflicht-Standort in **einer Transaktion** anlegen
- Kunde bearbeiten
- Kunde aktivieren/deaktivieren
- Standort hinzufügen
- Standort bearbeiten
- Standort aktivieren/deaktivieren
- Anmelde-E-Mail-Adressen hinzufügen/entfernen
- standortbezogene Spedition und Versandvorgaben pflegen
- globale Standortsuche über alle Kunden des aktuellen Workspaces

### Transaktionsregel bei Neuanlage

Die Neuanlage eines Kunden ist atomar:

1. Kundendaten validieren.
2. Ersten Standort validieren.
3. Mindestens eine Anmelde-E-Mail validieren.
4. Kunde anlegen.
5. Standort anlegen.
6. Anmelde-E-Mail-Adressen anlegen.
7. Audit-Einträge schreiben.
8. Erst dann Commit.

Schlägt ein Schritt fehl, wird die komplette Transaktion zurückgerollt. Es darf kein halber Kunde ohne Standort entstehen.

## 5. Rollen und Berechtigungen

Neue bzw. angepasste Rechte für `customers.read` und `customers.write`:

- `TENANT_ADMIN` / Firmen-Admin: lesen + ändern
- `EXPORT_ADMIN`: lesen + ändern
- `TEAM_LEAD`: lesen + ändern
- `OPERATOR` / Sachbearbeiter: lesen + ändern
- `WAREHOUSE` / Lager: nur lesen
- `AUDITOR`: nur lesen

Im bestehenden Rollenmodell sind dafür folgende Anpassungen notwendig:

- `TEAM_LEAD` erhält zusätzlich `customers.write`.
- `OPERATOR` erhält zusätzlich `customers.write`.
- `WAREHOUSE` erhält zusätzlich `customers.read`, aber **kein** `customers.write`.
- `AUDITOR` behält ausschließlich `customers.read`.

Lager und Auditor dürfen Kunden/Standorte ansehen. Lager darf diese Daten später bei Sendungen verwenden, aber nicht ändern.

## 6. Audit

Jede relevante Stammdatenänderung wird im bestehenden `audit_events`-Mechanismus protokolliert.

Vorgesehene Eventtypen:

- `CUSTOMER_CREATED`
- `CUSTOMER_UPDATED`
- `CUSTOMER_ACTIVATED`
- `CUSTOMER_DEACTIVATED`
- `LOCATION_CREATED`
- `LOCATION_UPDATED`
- `LOCATION_ACTIVATED`
- `LOCATION_DEACTIVATED`
- `LOCATION_REGISTRATION_EMAILS_CHANGED`

Audit speichert mindestens:

- Workspace/Tenant
- ausführender Benutzer
- Zeitpunkt
- Eventtyp
- Entity-Typ
- Entity-ID
- notwendige Änderungsmetadaten

Keine Passwörter, Tokens oder unnötigen sensiblen Inhalte werden in Audit-Metadaten geschrieben.

## 7. Oberfläche

### Grundlayout: Master-Detail

Der Bereich **Kunden** wird als moderne Master-Detail-Oberfläche umgesetzt.

**Linke Spalte:**

- dauerhaft sichtbare kompakte Kundenliste
- Suche
- Kundennummer
- Firmenname
- Aktiv/Inaktiv-Status
- ausgewählter Kunde visuell hervorgehoben

**Rechter Hauptbereich:**

- kompakter Kopf mit Kundennummer, Firmenname und Status
- Aktionen wie Bearbeiten und Deaktivieren/Aktivieren
- darunter der eigentliche Standort-Arbeitsbereich

### Standortdarstellung

- Alle Standorte eines Kunden stehen untereinander als **aufklappbare Bereiche/Accordions**.
- Mehrere Standorte dürfen gleichzeitig geöffnet sein.
- Eingeklappt werden nur Kerninformationen gezeigt:
  - Standortname
  - Ort
  - Land
  - Status
  - Spedition
- Aufgeklappt erscheinen:
  - vollständige Adresse
  - alle Anmelde-E-Mail-Adressen
  - Kontaktinformationen
  - Spedition
  - Versandvorgaben
  - Bearbeiten-Aktion

### Seitliches Panel / Drawer

Bearbeitung erfolgt nicht inline im Accordion und nicht auf einer neuen Seite.

Stattdessen wird eine wiederverwendbare **seitliche Panel-/Drawer-Komponente** eingeführt.

Verwendung:

- Kunde bearbeiten
- Standort bearbeiten
- neuer Standort
- neuer Kunde

`Neuer Kunde` verwendet ein breiteres Panel, weil in demselben Ablauf Kundendaten, erster Pflicht-Standort und mindestens eine Anmelde-E-Mail erfasst werden.

Nach erfolgreichem Speichern aktualisiert sich der Master-Detail-Bereich direkt, ohne unnötigen Seitenwechsel.

### Menüpunkt `Standorte`

Der bestehende Menüpunkt **Standorte** bleibt erhalten.

Er dient als globale Standortsuche über alle Kunden des Workspaces. Ein gefundener Standort öffnet den zugehörigen Kunden und fokussiert den ausgewählten Standort. Die eigentliche Bearbeitung bleibt im gemeinsamen Kunden-/Standort-Panel, damit keine zweite, abweichende Pflegeoberfläche entsteht.

## 8. Validierung

Serverseitige Validierung ist verbindlich; Frontend-Validierung dient zusätzlich der Bedienbarkeit.

Pflichtregeln:

- Kundennummer vorhanden
- Kundennummer innerhalb Tenant eindeutig
- Firmenname vorhanden
- mindestens ein Standort bei Kundenneuanlage
- Standortname vorhanden
- Straße vorhanden
- Hausnummer vorhanden
- PLZ vorhanden
- Ort vorhanden
- Land vorhanden
- mindestens eine gültige Anmelde-E-Mail
- keine doppelte Anmelde-E-Mail innerhalb desselben Standorts
- Customer/Location-Zuordnungen müssen zum aktuellen Tenant gehören

## 9. Deaktivierung und Historie

Reguläre Löschfunktionen werden für dieses erste Live-Modul nicht angeboten.

Deaktivierte Kunden und Standorte:

- bleiben in der Datenbank
- bleiben in Audit und historischen Sendungen sichtbar
- können in der Kunden-/Standortverwaltung über Statusfilter gefunden werden
- sind bei neuen Sendungen nicht auswählbar

Ein späterer Hard-Delete für eindeutig unbenutzte Fehleingaben ist ausdrücklich **nicht Bestandteil dieser ersten Umsetzung**.

## 10. Getrennte Stammdaten-Schreibfreigabe

Der aktuelle Professional-Betrieb verwendet bewusst:

- `PROFESSIONAL_DATA_MODE=migration-read-only`
- `PROFESSIONAL_ENABLE_WRITES=false`
- `PROFESSIONAL_ENABLE_CONTROL_WRITES=true`

Der globale Betriebsdaten-Schreibmodus wird für Kunden & Standorte **nicht** pauschal aktiviert.

Stattdessen wird eine getrennte Freigabe eingeführt, vorgesehen als:

`PROFESSIONAL_ENABLE_MASTERDATA_WRITES=true`

Diese Freigabe erlaubt ausschließlich die explizit dafür vorgesehenen Stammdaten-Schreibpfade für Kunden und Standorte.

Ziele:

- Login/Benutzerverwaltung bleibt über Control-Writes funktionsfähig.
- Migration bleibt geschützt/read-only.
- Noch nicht freigegebene operative Module werden nicht versehentlich beschreibbar.
- Kunden/Standorte können trotzdem produktiv gepflegt werden.

Die Datenbank-Hilfsschicht erhält dafür eine klar getrennte, tenant-sichere Masterdata-Write-Funktion statt den vorhandenen globalen `writesEnabled()`-Schalter umzudeuten.

## 11. Fehlerbehandlung

Mindestens folgende Fehlerfälle erhalten eindeutige API-Fehlercodes und verständliche UI-Meldungen:

- doppelte Kundennummer
- Kunde ohne Standort
- unvollständiger Standort
- fehlende Anmelde-E-Mail
- ungültige E-Mail-Adresse
- doppelte Anmelde-E-Mail
- fehlende Berechtigung → 403
- ungültige/abgelaufene Sitzung → 401
- CSRF-Fehler
- fremder Tenant / nicht zugänglicher Datensatz → kein Datenleck; als nicht gefunden bzw. nicht berechtigt behandeln
- Masterdata-Writes deaktiviert
- Datenbankfehler

Bei Transaktionsfehlern erfolgt Rollback. Das Frontend zeigt nach Fehlern keine vermeintlich gespeicherten Zustände an.

## 12. Integration in spätere Sendungen

Dieses Modul schafft die verbindliche Grundlage für die spätere Sendungserstellung:

- Auswahl eines aktiven Kunden
- danach bewusste Auswahl eines aktiven Standorts dieses Kunden
- keine automatische Hauptadresse
- Übernahme der konkreten Standortadresse in die Sendung
- automatische Übernahme **aller** am Standort hinterlegten Anmelde-E-Mail-Adressen in den Anmeldeprozess
- spätere Verwendung von standortbezogener Spedition und Versandvorgaben
- historische Sendungen bleiben mit den damals verwendeten Kunden-/Standort-IDs verknüpft, auch nach Deaktivierung

Die Sendungsimplementierung selbst ist nicht Bestandteil dieser Spezifikation.

## 13. Tests

Die Umsetzung wird testgetrieben abgesichert.

Mindestens zu testen:

### Datenmodell / Store

- Kunde + erster Standort + E-Mails werden atomar angelegt
- Rollback bei fehlerhaftem Standort oder E-Mail
- Kundennummer pro Tenant eindeutig
- gleiche Kundennummer in anderem Tenant zulässig
- mehrere Anmelde-E-Mails möglich
- doppelte E-Mail im selben Standort wird verhindert
- Aktiv/Inaktiv funktioniert ohne Hard-Delete
- historische Beziehungen bleiben erhalten

### Berechtigungen

- Firmen-Admin darf schreiben
- Export-Admin darf schreiben
- Teamleiter darf schreiben
- Sachbearbeiter darf schreiben
- Lager darf lesen, aber nicht schreiben
- Auditor darf lesen, aber nicht schreiben

### Tenant-Isolation

- Kunde aus Tenant A ist in Tenant B nicht lesbar
- Standort aus Tenant A ist in Tenant B nicht lesbar oder änderbar
- API akzeptiert keine Manipulation durch fremde Customer-/Location-IDs

### API / Validierung

- ungültige Pflichtfelder werden abgelehnt
- fehlende Anmelde-E-Mail wird abgelehnt
- ungültige E-Mail wird abgelehnt
- Deaktivierungsaktionen funktionieren
- Audit-Einträge werden erzeugt
- Masterdata-Schreibgate wird erzwungen

### Frontend

- Kundenliste lädt und sucht
- Kundenauswahl aktualisiert den rechten Detailbereich
- mehrere Standort-Accordions bleiben gleichzeitig offen
- Bearbeitungs-Drawer öffnet/schließt korrekt
- neuer Kunde verlangt ersten Standort und Anmelde-E-Mail
- neue/aktualisierte Daten erscheinen nach Speichern sofort
- Lager/Auditor sehen keine Bearbeiten-Aktionen
- deaktivierte Datensätze werden korrekt gekennzeichnet

## 14. Nicht im Scope dieser ersten Umsetzung

- Sendungen vollständig implementieren
- Anmeldemails tatsächlich versenden
- Dokumenterzeugung
- QR/POD
- Versandkostenberechnung
- Palettenkonto
- generischer Hard-Delete
- automatische Hauptadresse oder Hauptstandort
- pauschale Aktivierung aller operativen Professional-Writes

## 15. Erfolgskriterien

Das Modul gilt als erfolgreich umgesetzt, wenn:

1. Ein berechtigter Benutzer einen Kunden nur zusammen mit mindestens einem vollständigen Standort und mindestens einer Anmelde-E-Mail anlegen kann.
2. Mehrere Standorte und mehrere Anmelde-E-Mails je Standort zuverlässig funktionieren.
3. Kundennummern tenantweit eindeutig sind.
4. Alle Schreibaktionen tenant-sicher, rollenbasiert und auditiert sind.
5. Lager und Auditor keine Stammdaten ändern können.
6. Deaktivierung historische Daten nicht beschädigt.
7. Die Master-Detail-Oberfläche mit mehreren gleichzeitig geöffneten Standorten und seitlichem Bearbeitungs-Panel funktioniert.
8. Das Modul schreiben kann, ohne den globalen Migrations-Leseschutz für andere Betriebsdaten aufzuheben.
9. Die spätere Sendungserstellung aktive Standorte sowie automatisch alle Anmelde-E-Mails des gewählten Standorts zuverlässig verwenden kann.
