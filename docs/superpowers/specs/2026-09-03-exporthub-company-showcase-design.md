# ExportHUB Professional Company Showcase Design

**Date:** 2026-09-03

## Goal

Create a presentation-ready ExportHUB Professional demo that can be shown to other companies without exposing or depending on any real company, customer, employee, shipment, document, login, database, mail or Azure business data.

The demo must present ExportHUB workflows, not training/underweisung management.

## Product positioning

The showcase demonstrates one coherent export and logistics workflow from operational overview through shipment preparation, document control, collection and proof of delivery.

The presentation should answer these questions quickly:

1. What needs attention today?
2. Which shipments are ready, blocked or overdue?
3. Which documents are present or missing?
4. Who is responsible for the next action?
5. How are customers and delivery locations organized?
6. How does a shipment move from creation to collection and POD?
7. How can a customer-facing avis be prepared without exposing the internal workspace?

## Hard isolation

- The showcase lives only on branch `demo/company-showcase` until explicitly approved otherwise.
- `main` remains unchanged while the demo is developed and reviewed.
- The demo uses a dedicated `/demo/` entry point.
- Demo JavaScript must not call `/api/*`, `/.auth/*`, Microsoft login, SQL, Blob Storage, mail endpoints or production services.
- All business data is fictional and stored in static demo modules and optional browser `localStorage` only.
- Demo mutations must never write into the Professional database.
- No real Essentra, ExportHUB Internal or customer data may be copied into the showcase.
- Fake email addresses use reserved/example-style domains only.
- Downloads generated inside the demo must be visibly marked `DEMO / MUSTER`.
- The demo can always be reset to its baseline data in one action.

## Demo company and people

Use one clearly fictional company:

- **Rheinwerk Industrial Solutions GmbH**
- Industry: Industrial components and logistics
- Location: Nordrhein-Westfalen
- Workspace label: `rheinwerk-demo`

Use fictional employees covering the relevant roles:

- Firmenadmin
- Exportkoordination
- Teamleitung
- Lager
- Sachbearbeitung
- Auditor / read-only

The role switcher is presentation-only and changes visible demo permissions locally.

## Demo data

The baseline contains enough realistic fictional records to make every main workflow visibly useful:

- 12 fictional employees
- 8 fictional customers
- 12 delivery locations
- 14 shipments in mixed states
- 20+ shipment documents with deliberate gaps
- 10 operational tasks
- 3 customer avis examples
- at least 2 non-EU shipments requiring ABD handling
- at least 2 collected shipments with POD
- at least 1 blocked shipment with a missing required document

No values may reuse real customer names, shipment numbers, delivery addresses, phone numbers or email addresses from the user's productive environment.

## Demo navigation

### 1. Übersicht

Presentation dashboard with:

- open shipments
- collections today
- missing documents
- action required
- prioritized work list
- latest activity
- quick actions

KPIs use the fictional demo dataset and never show fake zero placeholders.

### 2. Sendungen

A shipment worklist with status, customer, destination, planned collection, owner and document state.

Filters:

- search
- status
- owner
- EU / non-EU
- attention required

Opening a shipment shows a structured detail workspace with:

- reference and customer
- consignee / location
- planned and actual collection
- package/colli summary
- document checklist
- ABD status where applicable
- customer avis status
- timeline / activity

Demo actions are local simulations only:

- create a new demo shipment
- mark documents present
- set `Bereit zur Abholung`
- simulate collection
- add DEMO POD
- archive completed demo shipment

State progression follows the ExportHUB model:

`Entwurf → Erstellt → Bereit zur Abholung → Abgeholt → POD vorhanden → Abgeschlossen → Archiviert`

Editing is locked after collection/POD except for viewing, printing/downloading and the allowed POD completion step.

### 3. Aufgaben & Planung

Operational cards show tasks by priority, owner and due time.

Examples include:

- ABD request
- customs registration
- pickup preparation
- missing POD
- customer avis
- document follow-up

Tasks can be marked complete locally. Relevant shipment actions automatically update matching demo tasks where practical.

### 4. Dokumente

A clear document control view for shipment files:

- Lieferschein
- L1 / QR
- L2
- CMR
- ABD
- POD

Each shipment gets a completeness indicator and a human-readable explanation of what is missing and why.

Generated demo previews/downloads are marked `DEMO / MUSTER`.

### 5. Kunden & Standorte

Customer cards and a location quality workspace show:

- customer number
- company name
- active status
- delivery locations
- country
- contact hints using fake data
- shipment count from the demo dataset

The presentation should make the tenant/customer/location structure visually understandable without exposing admin complexity.

### 6. Kunden-Avis

Show how a customer-facing collection/avis flow would look from the business side:

- selected shipment
- reference
- documents released for customer view
- planned collection time
- generated personal demo link preview
- link status

The external/customer preview is entirely local and clearly marked as a demo. It must not send mail or create a real public token.

### 7. Team & Rollen

A compact role presentation makes permissions understandable:

- Firmenadmin: company-wide demo overview and administration surfaces
- Exportkoordination / Sachbearbeitung: operational shipment work
- Teamleitung: assigned team workload
- Lager: collection and warehouse-relevant actions
- Auditor: read-only documents/status/audit

Role switching is designed for presentations, not authentication testing.

## Presentation mode

The `/demo/` landing page has two entry paths:

- `Geführte Tour starten`
- `Demo frei erkunden`

The guided tour walks through:

1. company overview
2. prioritized shipment
3. document gap / ABD requirement
4. task and planning workflow
5. shipment readiness
6. collection and POD
7. customer avis preview
8. customer/location structure
9. role switch to warehouse or team lead
10. final audit / traceability message

A dock shows current step, explanation and next/back controls. Each step automatically navigates to the relevant demo view and selects a suitable fictional record.

## Visual direction

The demo should look like a commercial logistics control center rather than a technical prototype:

- strong hierarchy
- compact KPI cards
- clear status colors with text labels
- two-column work areas where appropriate
- tables only where comparison is genuinely useful
- shipment detail presented as a workspace, not a raw form dump
- responsive layout for desktop presentations and tablet/mobile inspection
- no visible RC/debug/internal implementation language

The visual system should reuse the current ExportHUB Professional control-center language where practical so the showcase and product feel related.

## Local state

A focused demo store owns all mutable showcase data.

Suggested public interface:

- `getState()`
- `reset()`
- `setRole(role, employeeId)`
- `createShipment(input)`
- `updateShipment(id, patch)`
- `transitionShipment(id, targetStatus)`
- `completeTask(id)`
- `setDocumentState(shipmentId, documentType, present)`
- `createAvis(shipmentId)`

Every mutation validates demo identity and state rules before persisting to browser storage.

## File boundaries

Create a self-contained demo area:

- `demo/index.html` — showcase shell and presentation entry
- `demo/demo.css` — demo presentation layout
- `demo/demo-data.js` — immutable fictional baseline dataset
- `demo/demo-store.js` — local state, role and transition rules
- `demo/demo-ui.js` — core navigation and view rendering
- `demo/demo-shipments.js` — shipment list/detail/create interactions
- `demo/demo-documents.js` — document checklist and DEMO preview generation
- `demo/demo-avis.js` — local customer avis simulation
- `demo/presentation-guide.js` — guided presentation tour

Keep the demo independent from `assets/js/app.js` and the production API modules.

## Deployment strategy

Use a dedicated Draft PR from `demo/company-showcase` to `main` as the review container.

A showcase preview workflow may deploy the branch to an Azure Static Web Apps PR preview environment, but must not update the production `main` deployment. The existing production deploy continues to deploy only validated `main`.

The demo preview workflow must verify:

- all demo files are present
- no demo JavaScript contains network/API/auth/mail calls
- fake company marker is present
- DEMO banner is visible
- demo tests pass

## Automated tests

Add focused Node tests that prove:

- all demo identities/business records are fictional markers
- no network/auth/API/mail path exists in demo runtime files
- role scoping hides disallowed actions
- shipment transitions enforce the status order
- post-collection edit locking works
- ABD-required demo shipments cannot become ready while ABD is missing
- POD cannot be added before collection
- document completeness identifies required files correctly
- customer avis is local-only
- reset restores the exact baseline
- guided tour references only existing views/actions

Existing Professional tests must remain green.

## Success criteria

The feature is ready for presentation when:

- the public preview opens directly at `/demo/`
- a viewer can understand the product without login credentials
- the guided tour can be completed end-to-end without dead buttons
- shipment, task, document, collection/POD and avis flows are visibly connected
- no real data or real backend dependency exists
- all demo and existing Professional tests pass
- the preview deployment is separate from production
- the Draft PR remains unmerged until explicitly approved by the user
