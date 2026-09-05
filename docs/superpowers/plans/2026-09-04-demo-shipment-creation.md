# ExportHUB Demo Shipment Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete local shipment-creation presentation flow to the existing `/demo/` ExportHUB showcase.

**Architecture:** Extend the existing shipment workspace with one focused creation module. Pure business helpers calculate LDM, ABD requirement and stowage order; the demo store owns persistence; the existing shipment workspace opens/closes the creator and selects the newly created record after save.

**Tech Stack:** HTML, CSS, vanilla ES modules, Node.js 20 `node:test`, GitHub Actions, Azure Static Web Apps preview.

**Spec:** `docs/superpowers/specs/2026-09-04-demo-shipment-creation-design.md`

## Global Constraints

- Work only on `demo/company-showcase`.
- Keep production `main` unchanged.
- No API/auth/network/mail transport in demo runtime.
- New records must use fictional data and `demo:true`.
- Reference format is exactly six uppercase alphanumeric characters.
- Pallet LDM equals physical pallet quantity multiplied by `0.20`.
- ABD requirement is non-EU AND (`valueEur > 1000` OR `forwarderRequiresAbd === true`).
- Saved records start at `Entwurf` and existing status/ABD/POD rules remain authoritative.

---

### Task 1: Pure creation rules and store mutation

**Files:**
- Create: `test/company-showcase-shipment-create.test.mjs`
- Create: `demo/demo-shipment-create.js`
- Modify: `demo/demo-store.js`

**Interfaces:**
- Produces: `isValidReference(reference)`, `calculateColliSummary(rows)`, `requiresAbd(input)`, `buildStowagePlan(rows)`, `createShipment(input)`.

- [x] **Step 1: Write failing tests** for reference format, pallet LDM, ABD rule, high-pallet-first stowage order and store/reset behavior.
- [x] **Step 2: Run `npm test`** — RED run Professional CI #265 (`33856601156`): 121 tests, 114 pass / 7 expected failures before implementation.
- [x] **Step 3: Implement pure helpers** in `demo/demo-shipment-create.js` with no DOM/network dependency.
- [x] **Step 4: Implement `createShipment(input)`** in `demo/demo-store.js`, validating customer/location relationship, reference uniqueness, demo marker and initial `Entwurf` state.
- [x] **Step 5: Run `npm test`** — creation behavior tests PASS in the final 121/121 suite.

### Task 2: Presentation-grade creation workspace

**Files:**
- Modify: `test/company-showcase-shipment-create.test.mjs`
- Modify: `demo/index.html`
- Modify: `demo/demo-shipment-create.js`
- Modify: `demo/demo-shipments.js`
- Modify: `demo/demo-shipments.css`

**Interfaces:**
- Consumes: helpers and `createShipment()` from Task 1.
- Produces: `initShipmentCreator({ onCreated, onClose })` and DOM contract `shipmentCreateBtn`, `shipmentCreateDrawer`, `shipmentCreateForm`.

- [x] **Step 1: Add failing DOM-contract tests** requiring a visible `Neue Demo-Sendung` trigger, creation drawer, ordered section labels, Colli row controls, stowage preview and `DEMO / MUSTER` mail preview.
- [x] **Step 2: Verify UI contract was RED** as part of CI #265 before the creator existed.
- [x] **Step 3: Add HTML host and creation trigger** to the shipment page.
- [x] **Step 4: Implement creator rendering/binding** with customer/location linkage, reference/date/value/owner fields, add/remove Colli rows, live LDM/weight, document toggles, ABD status, stowage preview and local mail preview.
- [x] **Step 5: Integrate creator with existing shipment workspace** so save refreshes the list and selects the new draft.
- [x] **Step 6: Add responsive styling** to `demo/demo-shipments.css`, including the three-row Colli structure and wide local stowage preview.
- [x] **Step 7: Run `npm test`** — all shipment-creation tests PASS in the final suite.

### Task 3: Final isolation and preview verification

**Files:**
- Modify: `.github/workflows/professional-ci.yml`.
- Modify: `.github/workflows/company-showcase-preview.yml`.
- Modify: `test/company-showcase-preview.test.mjs`.

**Interfaces:**
- Consumes: completed creator runtime.
- Produces: verified PR preview with no Functions/API.

- [x] **Step 1: Ensure CI syntax-checks `demo/demo-shipment-create.js` and preview isolation scan includes it.** A focused RED run #271 (`33857340642`) produced exactly two expected failures before both workflow lists were updated.
- [x] **Step 2: Run the complete Professional test suite** — final content head `252ecadee94526db2a48289ecb8e2dcaa7a568e7`: **121/121 PASS**.
- [x] **Step 3: Verify Professional CI succeeds** — CI #273 (`33857440727`): PASS, including explicit creator syntax check.
- [x] **Step 4: Verify Showcase Preview deploy succeeds and its HTTP smoke test passes** — Preview #32 (`33857440752`): PASS. Isolation reports **8 Demo-Module** without API/Auth/network/mail. Azure reports no API directory and no Functions creation. HTTP smoke check confirms `https://kind-grass-0395b3a03-5.westeurope.6.azurestaticapps.net/demo/`.
- [x] **Step 5: Verify PR remains Draft and `main` SHA remains unchanged** — final release check required after this documentation-only commit.

## Verified Shipment-Creation Candidate

- Tested content head: `252ecadee94526db2a48289ecb8e2dcaa7a568e7`
- Full suite: **121/121 PASS**
- Demo runtime isolation: **8/8 modules**
- Professional CI #273: **PASS**
- Showcase Preview #32: **PASS**
- Azure Functions/API in preview: **not created**
- Live `/demo/` HTTP smoke check: **PASS**
- Public demo: `https://kind-grass-0395b3a03-5.westeurope.6.azurestaticapps.net/demo/`
