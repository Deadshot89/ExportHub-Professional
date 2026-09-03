# ExportHUB Professional – Live Shipments Core Design

Date: 2026-09-03
Status: Approved design for implementation planning
Repository: `Deadshot89/ExportHub-Professional`
Branch: `design/live-shipments-core`

## 1. Goal

ExportHUB Professional shall gain a single operational shipment core that supports all three requested outcomes:

1. Existing migrated shipments become searchable/readable and feed real dashboard data.
2. New Professional shipments can be created and edited live.
3. The same core expands to Colli/LDM, carriers, customs/ECB FX, documents, QR pickup, POD, completion and archive automation.

The shipment core is the sole source of truth for lifecycle state, readiness, locking, shipment-related audit events and dashboard shipment facts. Dashboard, pickup, documents and archive logic must not reimplement shipment rules independently.

## 2. Scope and non-goals

### In scope

- migrated shipment read model
- live shipment creation
- immutable six-character reference
- lifecycle/status machine
- readiness checklist
- address, sender, carrier and FX snapshots
- autosave and exclusive edit locks
- Colli/LDM calculation
- carrier master data
- one-off recipients and conversion to master data
- customs/ABD and cross-border CMR decisions
- manual and generated document lifecycle/versioning
- QR and admin manual pickup
- POD handling
- automatic completion and archive
- dashboard KPIs and action items
- audit and role enforcement
- phased write activation

### Explicitly deferred

- exact pickup time/time-window model; the first implementation uses the planned pickup date and keeps time-window support as a later compatible extension
- final visual/PDF template design for load list and CMR; this design defines required data, generation triggers and versioning, not the final print layout

## 3. Architectural principles

### 3.1 One shipment domain

All state transitions and shipment invariants are implemented in a server-side shipment domain module. UI code requests actions but never decides whether a transition is legal.

### 3.2 No second security model

Professional continues to use the existing session, tenant, CSRF and authorization infrastructure. Existing permissions such as `shipments.read`, `shipments.write`, `pickup.confirm`, `pod.upload` and `audit.read` remain authoritative.

### 3.3 Tenant isolation

Every shipment-related record is tenant-scoped. API code derives the tenant exclusively from the authenticated session. No mutation accepts a tenant ID from the browser as authority.

### 3.4 Historical correctness through snapshots

A shipment keeps the business facts that were used at the time of processing. Later master-data changes must not rewrite old shipment history or regenerated historical facts.

## 4. Shipment origin and identity

Each shipment has a `source_kind`:

- `MIGRATED`: imported/legacy shipment; permanently read-only in this rollout
- `LIVE`: created natively in Professional

The existing `shipments` table is extended rather than replaced.

A LIVE shipment receives on creation:

- immutable technical UUID
- server-generated reference of exactly six characters using `A-Z` and `0-9`
- `DRAFT` lifecycle status
- creation user/time
- revision number

The reference is generated when the user clicks **Neue Sendung**, before any form fields are completed. Generation is server-side and uniqueness is enforced per tenant. A reference can never be edited and can never be reused.

Completely empty drafts are soft-discarded after 24 hours. They are hidden from normal work lists, but their row/reference remains reserved so the reference can never be reassigned. A draft with any business data is not auto-discarded.

## 5. Lifecycle and exception model

### 5.1 Canonical lifecycle

The canonical lifecycle is:

`Entwurf -> Erstellt -> Bereit zur Abholung -> Abgeholt -> POD vorhanden -> Abgeschlossen -> Archiviert`

Terminal/special lifecycle state:

- `Storniert`

### 5.2 Nachbearbeitung

`Nachbearbeitung` is modeled as a blocking exception state attached to the current lifecycle state rather than destroying the underlying lifecycle position. The UI may present **Nachbearbeitung** as the dominant badge, while retaining the base lifecycle status for deterministic recovery.

Examples:

- Colli mismatch during pickup: base status remains `Bereit zur Abholung`, exception becomes `Nachbearbeitung`; pickup is blocked until corrected.
- System validation failure before readiness: lifecycle stays where it is, progression is blocked.

System-created rework clears when its concrete blockers are resolved and validation passes. Manually created rework by an admin requires `TENANT_ADMIN` or `EXPORT_ADMIN` and an audit reason to clear.

### 5.3 Lifecycle transitions

- `Entwurf -> Erstellt`: only when creation requirements are met.
- `Erstellt -> Bereit zur Abholung`: only after server readiness is green and a user explicitly confirms readiness.
- `Bereit zur Abholung -> Abgeholt`: only through QR pickup or admin manual pickup, with exact total-Colli confirmation and no blocking exception.
- `Abgeholt -> POD vorhanden`: automatic when at least one valid POD exists.
- `POD vorhanden -> Abgeschlossen`: automatic when no mandatory process blockers remain.
- `Abgeschlossen -> Archiviert`: automatic 30 days after completion or earlier by `TENANT_ADMIN`/`EXPORT_ADMIN`.
- `Archiviert -> Abgeschlossen`: only `TENANT_ADMIN`, mandatory reason, audited.

`TENANT_ADMIN` and `EXPORT_ADMIN` may cancel a shipment through `Bereit zur Abholung`. Cancellation is forbidden from `Abgeholt` onward and always requires an audit reason.

## 6. Roles

### Create/edit before pickup

- `TENANT_ADMIN`
- `EXPORT_ADMIN`
- `TEAM_LEAD`
- `OPERATOR`

### Read-only shipment access

- `WAREHOUSE` for ordinary shipment fields, with its separate allowed pickup/POD actions
- `AUDITOR`

### Restricted actions

- manual pickup: `TENANT_ADMIN`, `EXPORT_ADMIN`
- cancel: `TENANT_ADMIN`, `EXPORT_ADMIN`
- manual rework: `TENANT_ADMIN`, `EXPORT_ADMIN`
- force-release stale edit lock: `TENANT_ADMIN`
- restore archived shipment: `TENANT_ADMIN` only, mandatory reason

Roles are enforced on the server, not only through hidden buttons.

## 7. Creation requirements and checklist

A draft may be incomplete and autosaved.

Before `Entwurf -> Erstellt`, the server requires at minimum:

- a valid existing customer/location or a complete one-off recipient
- planned pickup date
- required registration email when an incomplete master-data location has been selected

The shipment page shows a persistent checklist split into:

1. Kunde & Standort
2. Sendungsdaten
3. Colli/LDM
4. Spedition
5. Warenwert & Zoll
6. Dokumente
7. Abholung

Each block exposes a server-derived state such as `complete`, `open` or `error`, plus concrete missing items. The checklist is informational; the same server validation is authoritative for transitions.

## 8. Readiness for pickup

Readiness is a server-computed state separate from lifecycle status.

Professional may expose **Versandbereit** only if all shipment facts required for the current shipment are valid and all mandatory current documents exist.

Mandatory documents for readiness:

- Lieferschein: always
- current Ladeliste: always
- current CMR: when destination country differs from workspace shipping country
- valid ABD: when ABD is required

A replaced, invalid or stale document does not satisfy readiness.

When readiness is green, the user sees **Bereit zur Abholung bestätigen**. The status does not change automatically merely because validation is green.

## 9. Recipient, customer and location behavior

### 9.1 Existing master data

Selecting a customer location copies the relevant recipient facts into the shipment snapshot, including address, country/ISO, contact data and registration emails. Later changes to the customer/location do not rewrite the shipment.

### 9.2 One-off recipient

A shipment may use a one-off recipient without a customer master-data record. The shipment stores the complete recipient snapshot directly.

The UI offers **In Stammdaten übernehmen**. The conversion flow:

1. asks for a mandatory customer number
2. blocks an identical customer number
3. searches for similar existing customers
4. allows either creating a new customer + first location or adding the address as a new location to an existing customer
5. links the shipment to the resulting customer/location after successful creation
6. preserves the shipment's original recipient snapshot unchanged

The special conversion path may create a location without a registration email. Such a location is marked `masterdata incomplete`, appears in action items, and may be selected for a new draft. A shipment using it cannot move to `Erstellt` until the required registration email is completed.

Normal customer creation keeps the stricter existing master-data rules; the incomplete-location exception is available only through this controlled conversion path.

## 10. Workspace sender data

Workspace settings hold at least:

- company name
- street/house number
- postal code/city
- shipping country and ISO

These values are used automatically for shipment and document generation. When a shipment is created, the then-current sender data is stored as a sender snapshot. Later workspace changes affect new shipments only.

Operational date calculations such as `Heute`, overdue pickup and archive dates use the workspace's configured timezone. Existing tenants receive a safe initial timezone during schema upgrade rather than relying on the server machine timezone.

## 11. Carrier master data

Professional gains first-class carrier master data with:

- name
- active/inactive
- default `ABD required`
- contact person
- email
- phone
- portal/website link

Locations may reference a carrier by ID. Existing legacy `carrier_name` remains readable during migration and can be mapped without destroying historic text.

Selecting a location preselects its active default carrier. The shipment user may choose a different active carrier before pickup. This does not change the location master data.

The shipment stores a carrier snapshot containing the selected carrier facts and the shipment-specific `carrier requires ABD` decision. The default is copied from carrier master data but may be changed for the individual shipment before pickup.

## 12. Colli and LDM

Each Colli row stores the packaging type, physical quantity, weight and applicable dimensions.

Physical quantity is authoritative. Professional calculates totals for:

- total Colli
- total weight
- total LDM

LDM is system-calculated only and cannot be overridden by any role.

Packaging master data supports:

- name
- active/inactive
- default dimensions
- fixed or calculated LDM rule
- which dimensions may be completed in the shipment

Standard pallet types may define a fixed rule such as `0.20 LDM per physical pallet` where required by the configured packaging type.

The exact total-Colli value calculated by the shipment core is the value later used for pickup verification.

## 13. Warenwert, ECB FX and customs

A shipment may store goods value in any supported ISO currency.

For EUR, no conversion is required. For foreign currencies, the backend retrieves the official European Central Bank reference rate. If the current day's rate is not yet available, Professional uses the most recently available official ECB rate.

The shipment stores an immutable FX decision snapshot:

- original amount
- original currency
- ECB rate used
- ECB rate date
- calculated EUR value
- conversion timestamp/source metadata

Rates should be cached server-side so repeated shipments do not require a fresh external call for the same rate date/currency.

If no confirmed official/cached ECB rate can be obtained, Professional must not invent or silently approximate a rate. Customs validation remains open and readiness is blocked until a confirmed rate is available.

### ABD rule

ABD is required when:

- destination is outside the EU, and
- either calculated goods value is greater than EUR 1,000 or the selected carrier decision says ABD is required

The destination country comes only from the recipient snapshot and is not independently editable in the shipment.

The shipment stores the resulting ABD decision and reason facts so later changes to FX rates, EU membership data or carrier defaults cannot silently rewrite the historical decision.

### CMR rule

CMR is required whenever recipient country differs from the workspace shipping country.

## 14. Documents and generated artifacts

Multiple files are permitted per document type, including Lieferschein, ABD, CMR and POD.

Manual documents are never physically deleted through normal product actions. Incorrect files are marked `REPLACED` or `INVALID`; replacement files are additional immutable records. All changes are audited.

Generated load lists and CMRs use versioned generated artifacts. On `Entwurf -> Erstellt`:

- Ladeliste version 1 is generated automatically
- CMR version 1 is generated automatically when cross-border rules require it

A shipment edit that changes document-relevant facts marks the latest generated artifact stale. Autosave does not generate a new PDF on every field change.

A new version is generated:

- on the next explicit document open/print flow when regeneration is needed, or
- automatically before readiness can become green

Older versions remain accessible for audit/history.

## 15. Pickup

### 15.1 QR pickup

QR is the standard pickup path. The pickup view uses the same server shipment domain and displays at least:

- reference
- recipient
- expected total Colli
- current pickup state

The actual received total Colli must exactly match the expected total. If it differs:

- pickup is rejected
- lifecycle does not advance
- a rework exception is created
- expected/actual values are audited
- no admin bypass exists

The shipment must be corrected before pickup is retried.

### 15.2 Manual pickup

Only `TENANT_ADMIN` and `EXPORT_ADMIN` can invoke manual pickup. Manual pickup is not a validation bypass: all readiness and Colli rules still apply.

Each successful pickup records:

- exact timestamp
- user
- method `QR` or `MANUAL`
- expected total Colli
- confirmed total Colli
- audit event

From `Abgeholt` onward, ordinary shipment business fields are immutable.

## 16. POD and completion

POD upload is allowed only after pickup through the permitted POD role flow.

A POD is never overwritten or physically deleted. Correction means adding a new POD and marking the earlier one replaced/invalid, with an audit trail.

When at least one valid POD exists, the shipment automatically enters `POD vorhanden`.

When `POD vorhanden` has no remaining mandatory blockers, Professional automatically enters `Abgeschlossen`.

No separate user completion button is required.

## 17. Archive

`Abgeschlossen` shipments are automatically archived after 30 days.

`TENANT_ADMIN` and `EXPORT_ADMIN` may archive an already completed shipment earlier.

Archived shipments are read-only for all normal flows.

Only `TENANT_ADMIN` may restore an archived shipment to `Abgeschlossen`. A non-empty reason is mandatory and an explicit audit event is written.

A scheduled server maintenance function handles at least:

- soft-discard of completely empty drafts older than 24 hours
- automatic archive of completed shipments after 30 days

The job is idempotent and tenant-safe.

## 18. Autosave and exclusive edit lock

LIVE shipments use background autosave. The UI always exposes one of:

- `Speichert...`
- `Gespeichert`
- `Speicherfehler – erneuter Versuch läuft`

A browser change is considered persisted only after server confirmation.

On failure, unsaved user input remains visible. Retry uses stepped delays approximately 2s, 5s, 10s, 30s, then longer intervals until success or the user leaves the flow.

### Exclusive edit lock

Opening a LIVE shipment for editing acquires an exclusive lock. Other users may still view it read-only.

The lock contains at least:

- owner user ID/display reference
- acquired time
- last activity time
- opaque lock token

The lock is released on orderly exit and expires after 15 minutes without genuine editing activity. Merely leaving a tab open must not renew it indefinitely.

Only `TENANT_ADMIN` can force-release an orphaned lock, and that action is audited.

Mutations include the lock token and current revision so stale or stolen browser state cannot silently overwrite newer server state even if UI locking fails.

## 19. Dashboard and operational read model

The dashboard consumes server-derived shipment facts rather than duplicating business calculations in JavaScript.

The shipment read model provides at least:

### Offene Sendungen

LIVE and MIGRATED shipments that are operationally open, excluding completed, archived, cancelled and soft-discarded empty drafts as appropriate to their normalized historical state.

### Abholungen heute

Shipments with planned pickup date today, separated into open and already picked up.

### Fehlende Dokumente

Shipments whose current lifecycle/readiness requires a document that is missing, invalid or stale.

### Handlungsbedarf

Includes at least:

- overdue pickup
- rework exception
- missing required document
- stale load list/CMR before readiness
- ABD required but missing
- ECB rate unavailable
- incomplete selected master data relevant to progression
- administratively relevant orphaned lock

### Heute im Versand

Concrete shipment rows for the current operational day. No fake metric values or invented sample rows are permitted.

Dashboard and shipment detail must derive from the same server facts so contradictory status/readiness representations cannot occur.

## 20. Abholtag task/finality point

The planned pickup date automatically creates a derived process item `Abholtag`; it is not maintained as a manually duplicated task record.

- future date: planned
- today: `Heute fällig`
- past date and not picked up: `Überfällig`
- picked up: automatically complete

Changing planned pickup date changes the derived due date automatically.

The exact time/time-window extension is deliberately deferred and must be additive to this date-based model.

## 21. Activity feed

Shipment audit/read events feed recent activity with factual events such as:

- shipment created
- document version generated
- ready for pickup confirmed
- pickup confirmed via QR/manual
- POD uploaded/replaced
- shipment automatically completed
- shipment archived/restored

The feed must not manufacture activity from missing backend data.

## 22. Data-model direction

The existing schema already contains `shipments`, `documents`, `generated_artifacts` and `audit_events`. The implementation should extend these instead of creating parallel legacy/live tables.

Expected schema additions include concepts for:

- shipment origin/source kind
- immutable snapshots (recipient, sender, carrier, FX/customs facts)
- planned pickup date and completion/archive timestamps
- revision/autosave metadata
- rework exception metadata
- edit locks
- Colli rows and packaging types
- carrier master data and location carrier reference
- document validity/replacement lineage
- workspace shipping address/country/timezone
- FX cache/decision metadata as needed

Exact column decomposition may use normalized tables and JSONB snapshots where appropriate, but query-critical fields used for filtering, readiness and scheduled maintenance must remain directly indexable.

## 23. API direction

Routes follow the existing Professional API conventions and existing authorization helper. Resources include conceptually:

- shipment list/search/detail
- create shipment draft
- acquire/release/refresh edit lock
- autosave/update shipment
- readiness evaluation/confirm readiness
- cancel/rework actions
- document upload/replace/generate
- pickup confirm QR/manual
- POD upload/replace
- archive/restore
- carrier master data
- packaging master data
- shipment dashboard summary/action items

All mutations require authenticated session, role permission, CSRF validation where applicable, tenant isolation and server-side domain validation.

A dedicated rollout gate such as `PROFESSIONAL_ENABLE_SHIPMENT_WRITES=true` controls LIVE shipment mutations independently of legacy migration read mode. Existing `PROFESSIONAL_DATA_MODE=migration-read-only` remains compatible with migrated read-only data. Carrier/packaging master-data mutations continue to respect the master-data write gate.

## 24. Error behavior

The server, not the browser, blocks at least:

- duplicate/reused reference
- invalid status transition
- mutation of `MIGRATED`
- mutation after pickup
- wrong role
- cross-tenant access
- stale/missing edit lock
- total-Colli mismatch
- readiness with missing/invalid/stale required documents
- readiness when customs/ECB decision is unresolved
- LDM override attempts
- archive restore without `TENANT_ADMIN` and reason

The UI converts these failures into actionable messages without discarding user input.

## 25. Rollout phases

### Phase 1 – Historical shipments + real dashboard

- read/normalize MIGRATED shipments
- shipment list/search/detail read-only
- dashboard shipment KPIs/action items from real data

### Phase 2 – LIVE core

- draft creation/reference
- lifecycle domain
- autosave
- exclusive locks
- recipient/sender snapshots
- checklist

### Phase 3 – Operational shipment data

- Colli/LDM
- packaging master data
- one-off recipient conversion
- carrier master data and snapshots

### Phase 4 – Customs

- goods value/currency
- official ECB rates with last-available fallback
- ABD calculation
- CMR rule

### Phase 5 – Documents

- multiple manual documents
- replacement/invalid lifecycle
- generated load list/CMR versioning
- readiness document checks

### Phase 6 – Pickup and POD

- QR pickup
- admin manual pickup
- exact Colli validation
- shipment lock after pickup
- POD lifecycle
- automatic completion

### Phase 7 – Archive and full control center

- automatic archive
- restore flow
- complete dashboard/action model
- activity feed

Each phase is separately testable and should not enable its write path before its database/API/UI contract is green.

## 26. Test and acceptance requirements

Automated tests must cover at least:

- six-character reference is created exactly once, unique per tenant and immutable
- discarded empty draft reference is never reused
- MIGRATED shipment mutations are rejected
- lifecycle transitions are server-enforced
- `Entwurf -> Erstellt` rejects missing required facts
- readiness rejects missing/invalid/stale required documents
- CMR decision follows cross-border rule
- ABD decision follows non-EU plus value/carrier rule
- official ECB rate fallback uses last available confirmed rate and never invents a rate
- LDM cannot be overridden by any role
- ordinary edits are rejected after pickup
- pickup rejects total-Colli mismatch without admin bypass
- manual pickup limited to `TENANT_ADMIN` and `EXPORT_ADMIN`
- valid POD automatically produces `POD vorhanden`
- complete POD state automatically produces `Abgeschlossen`
- automatic archive occurs after 30 days
- early archive limited to admin roles
- restore limited to `TENANT_ADMIN` with mandatory reason
- two users cannot edit the same shipment concurrently
- stale lock/revision mutations are rejected
- tenant A cannot read/write tenant B shipment data
- generated document versions remain immutable/history-preserving
- replacement documents remain historically traceable
- dashboard counters exactly match underlying shipment read model
- autosave failure does not discard browser input
- required audit events are generated server-side
- existing customer/location/login/authorization/Control Center regressions remain green

GitHub delivery remains:

`feature branch -> RED test -> implementation -> GREEN -> PR -> main CI -> deploy`

No production-write claim is made until the exact deployed commit has passed the corresponding CI and deploy verification.

## 27. Success criteria

The design is successfully implemented when Professional can use one shared server-side shipment model to:

- show historical shipments safely
- create and process new shipments end-to-end
- keep historical shipment facts stable despite master-data changes
- prevent simultaneous/stale editing and forbidden state changes
- calculate LDM, CMR and ABD decisions deterministically
- generate and version shipment documents
- verify pickup Colli without bypass
- process immutable POD history
- complete/archive shipments automatically
- populate the Logistics Control Center with real, internally consistent shipment data

No separate dashboard, QR, document or archive status engine may diverge from the shipment core.