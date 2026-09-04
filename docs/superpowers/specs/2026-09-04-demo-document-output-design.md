# ExportHUB Professional Demo Document Output Design

## Goal

Extend the isolated `/demo/` company showcase with a presentation-grade document output workspace for shipment documents. The feature must show how ExportHUB turns shipment data into usable logistics paperwork while remaining completely fictional and local-only.

## Scope

The demo must provide professional sample views for:

- Ladeliste
- L1 / QR
- L2
- CMR
- ABD
- POD

All outputs are presentation artifacts only and must visibly carry `DEMO / MUSTER`.

## Document package behavior

Each shipment exposes one document package summary. The package is generated from the current local demo state and reflects shipment/customer/location/colli/document status.

- Ladeliste is always available as a generated sample.
- L1 / QR is always available as a generated sample and contains a clearly non-operational demo QR-style marker.
- L2 is always available as a generated sample.
- CMR is relevant for international shipments and is presented as three print copies (`1/3`, `2/3`, `3/3`).
- ABD is only relevant when `requiresAbd === true`.
- POD is only relevant after collection and should clearly show whether the POD is still missing or present.
- Missing source documents are not silently treated as present; preview headers must show `Vorhanden`, `Fehlt` or `Generierte Musterausgabe` as appropriate.

## Business rules represented

- Dates use `TT.MM.JJJJ`.
- File/output names combine shipment reference, customer and document type in a safe presentation filename.
- Ladeliste uses the shipment Colli rows when available and never creates a second page.
- L1 includes shipment reference, pickup context, physical Colli count and a non-functional DEMO QR marker.
- L2 summarizes consignee, collection, Colli, weight, LDM and operational document state.
- CMR contains sender/consignee, goods summary, weights and 3-copy indication.
- ABD highlights export requirement and current presence state; it must never invent an MRN/reference that is not in demo data.
- POD is only presented as completed when the local shipment has been collected and `documents.pod === true`.

## Interaction design

The existing `Dokumente` view becomes a document-control and output workspace.

1. Shipment cards keep their completeness overview.
2. Each card gains `Dokumentpaket öffnen`.
3. A large preview drawer/modal shows:
   - shipment and customer context
   - document tabs/cards
   - one rendered paper sheet at a time
   - package completeness/state
   - print action
   - local sample download action
4. Changing document type does not navigate away from the workspace.
5. The preview remains useful on desktop, tablet and phone.

## Local-only output

No network/API/auth/mail call is allowed.

Printing may use the browser print dialog. Sample download may use an in-memory `Blob` / object URL or data URL; it must not upload anything and the downloaded output must be visibly marked `DEMO / MUSTER`.

## File boundaries

- `demo/demo-document-output.js`: pure document package/view-model builders plus browser preview/download binding.
- `demo/demo-documents.js`: document-control workspace integration.
- `demo/index.html`: preview host.
- `demo/demo-operations.css`: document output visuals and print rules.
- `test/company-showcase-document-output.test.mjs`: behavior and DOM contracts.
- CI/preview workflows: include the new runtime module in syntax and isolation checks.

## Acceptance criteria

- All output types render from local fictional shipment state.
- CMR produces three clearly numbered copies.
- ABD/POD relevance and missing/present states follow existing shipment rules.
- `DEMO / MUSTER` is visibly present in every rendered artifact.
- generated filenames are deterministic and safe.
- no real recipient, API, auth, mail, SQL or cloud storage call is introduced.
- current demo reset/status/role behavior remains intact.
- full Professional test suite and preview smoke test pass.
- PR remains Draft and `main` remains unchanged.
