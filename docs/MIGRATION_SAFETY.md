# Migrationssicherheit Professional 0.4

1. Das Originalbackup wird niemals verändert.
2. Die komplette Quelldatei erhält SHA-256.
3. Jede Quelle erhält einen Source Pointer.
4. `shipments` und `savedShipments` werden auf eindeutige Sendungen gemappt.
5. Der aktuelle Prozessstatus hat Vorrang vor veralteten Hilfsfeldern.
6. POD-Dateien, POD-Status, Signatur und Abholnachweise werden unabhängig als Evidenz geprüft.
7. Eine Sendung mit Abhol- oder POD-Evidenz bleibt gesperrt.
8. Jedes Dokument bekommt einen Migrationsstatus und eine Cutover-Sperre.
9. Nicht vollständig gesicherte POD-Dokumente sind P0 und blockieren den Cutover ausdrücklich.
10. Remote-Dokumente müssen vor Cutover separat gesichert und verifiziert werden.
11. Dokumente ohne Dateiinhalte bleiben als Metadaten erhalten und werden nicht stillschweigend als migriert markiert.
12. Legacy-Passwörter werden nicht in Professional übernommen.
13. `READ_ONLY_READY` erlaubt nur Bestandsprüfung, keine Produktionsfreigabe.
