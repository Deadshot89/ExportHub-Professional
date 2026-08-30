# ExportHUB Professional 0.4 – Architektur

Professional wird parallel zu ExportHUB Internal entwickelt. Internal bleibt das aktive Ursprungssystem, bis ein späterer Cutover separat freigegeben wurde.

## Phase 0.4

- modulare Web-App
- Azure-Functions-kompatible API-Struktur
- noch keine produktive Datenbankverbindung
- Read-only-Migrationsprüfung
- Legacy-Importadapter für ältere ExportHUB-Backups
- Mandantenmodell und Tenant-ID an jedem normalisierten Datensatz
- Read-only-Ansicht für Benutzer/Rollen, Kunden und Sendungen
- POD-/Abhol-Sperrerhalt
- Dokumentinventur mit Inline-Hash, Remote-Erfassung und Metadatenstatus
- vollständige Herkunftszuordnung über Source Pointer

## Sicherheitsprinzip

Frontend-Read-only ist nur die erste Ebene. Sobald eine produktive Datenbank/API aktiviert wird, muss jede API-Operation die Tenant-ID und Rolle serverseitig prüfen. Kein Mandant darf Daten eines anderen Mandanten über IDs, URLs oder API-Aufrufe erreichen.

## Nächste Zielmodule

- produktive Authentifizierung mit Passwort-Neuvergabe/SSO-Option
- serverseitige Tenant- und Rollenprüfung
- Dokumentenspeicher
- Kundenstandorte
- Sendungserstellung
- Aufgaben & Planung
- strukturiertes Audit
- Plattformadministration
