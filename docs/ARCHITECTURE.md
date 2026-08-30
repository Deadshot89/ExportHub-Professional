# ExportHUB Professional 0.6 – Architektur

Professional ist ein vollständig getrenntes Repository. ExportHUB Internal bleibt das Ursprungssystem, bis ein späterer Cutover separat freigegeben wurde.

## Schichten

- Web-App: Migration/Read-only-Ansichten und später operative Module
- Security Core: Rollen, Berechtigungen, Tenant-Scope
- API: Health/Meta und später fachliche Endpunkte
- Data Access: PostgreSQL-Adapter mit standardmäßig deaktivierten Writes
- PostgreSQL: `tenant_id` an operativen Tabellen + Row Level Security
- Migration: unveränderte Quelle, Source Pointer, Hashes, READ_ONLY-/CUTOVER-Gates

## 0.5-Grenze

Es gibt noch keine produktive Benutzeranmeldung und keinen produktiven RC826-Datenbankimport. 0.5 schafft die sichere technische Grenze, bevor operative Schreibfunktionen aktiviert werden.
