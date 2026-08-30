# ExportHUB Professional 0.4.0

Separate Professional-/SaaS-Basis. ExportHUB Internal wird nicht beschrieben oder automatisch verändert.

## Neu in 0.4

- Kundenstandorte werden mandanten- und kundenbezogen normalisiert; eine vorhandene Hauptadresse wird nur als abgeleiteter Standort ergänzt, wenn sie nicht bereits als Standort existiert.
- Sendungen erhalten eine Professional-Standortzuordnung, soweit die Legacy-Daten sie eindeutig zulassen. Nicht eindeutige Standorte werden nicht geraten.
- `state.audit` und `state.auditLog` werden als strukturierte Audit-Ereignisse übernommen. Bekannte Secret-Felder wie Passwort, Token, Session, Authorization oder Connection String werden in der normalisierten Sicht redigiert. Der Source Snapshot bleibt unverändert.
- Dokumente erhalten einen Wiederherstellungsplan: autorisierter SharePoint-Capture, Legacy-API-Capture, sonstiger Remote-Capture, Originaldatei erforderlich oder – nur bei generierbaren Ausgabedokumenten – Regeneration aus einem gesperrten Sendungsstand.
- Metadaten bereits generierter Deckblätter/Ladelisten/CMRs werden separat als `generatedArtifacts` erhalten. Sie gelten nicht als Ersatz für eine tatsächlich migrierte Originaldatei.
- POD/ABD/Lieferschein werden niemals aus Metadaten als erfolgreich migriert markiert.
- `READ_ONLY_READY` und `CUTOVER_READY` bleiben getrennte Gates.

## Sicherheitsregel

Ein Cutover bleibt blockiert, solange Remote-Dokumente, fehlende Dateiinhalte oder nicht vollständig erfasste POD-Dokumente vorhanden sind. Es findet in 0.4 kein automatischer Zugriff auf SharePoint oder andere Remote-Quellen statt.

## Lokal testen

```text
npm test
```

Der Browser-Migrationschecker verarbeitet das ausgewählte Backup ausschließlich lokal.
