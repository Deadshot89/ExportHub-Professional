# ExportHUB Company Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a presentation-ready, backend-isolated `/demo/` experience for ExportHUB Professional using only fictional data.

**Architecture:** Keep the showcase in a self-contained `demo/` directory with static baseline data, a browser-only state store, view-specific rendering modules and a presentation guide. Production `index.html`, production API modules and `main` deployment behavior are not used by the demo runtime. A dedicated demo test suite validates isolation and workflow rules before preview deployment.

**Tech Stack:** HTML, CSS, vanilla ES modules, Node.js 20 `node:test`, GitHub Actions, Azure Static Web Apps preview.

**Spec:** `docs/superpowers/specs/2026-09-03-exporthub-company-showcase-design.md`

## Global Constraints

- Work only on `demo/company-showcase` until explicit approval.
- Keep `main` unchanged.
- No `/api/*`, `/.auth/*`, external fetch/XHR/WebSocket/sendBeacon or real mail integration in demo runtime.
- Use fictional company, employees, customers, locations, shipments and documents only.
- Use local static data and browser `localStorage` only.
- Mark demo UI and generated files `DEMO / MUSTER`.
- Preserve all existing Professional tests.

---

### Task 1: Showcase shell and fictional operational dashboard

**Files:**
- Create: `test/company-showcase.test.mjs`
- Create: `demo/index.html`
- Create: `demo/demo.css`
- Create: `demo/demo-data.js`
- Create: `demo/demo-ui.js`

**Interfaces:**
- Consumes: none from production runtime.
- Produces: `DEMO_COMPANY`, `DEMO_EMPLOYEES`, `DEMO_CUSTOMERS`, `DEMO_LOCATIONS`, `DEMO_SHIPMENTS`, `DEMO_TASKS`, `getDemoMetrics()` and a dashboard/nav renderer used by later tasks.

- [ ] **Step 1: Write the failing test**

Add `test/company-showcase.test.mjs` asserting `/demo/` has a visible DEMO marker, the fictional company, presentation/free-explore controls, required navigation items, baseline data counts and no network/auth/API markers.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/company-showcase.test.mjs`
Expected: FAIL because `demo/index.html` and modules do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create the shell, fictional baseline dataset, KPI calculator and dashboard/list rendering without any backend calls.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/company-showcase.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run complete project tests**

Run: `npm test`
Expected: all tests PASS.

### Task 2: Local store and shipment workflow

**Files:**
- Modify: `test/company-showcase.test.mjs`
- Create: `demo/demo-store.js`
- Create: `demo/demo-shipments.js`
- Modify: `demo/demo-ui.js`
- Modify: `demo/index.html`
- Modify: `demo/demo.css`

**Interfaces:**
- Consumes: baseline arrays from `demo-data.js`.
- Produces: `getState()`, `reset()`, `transitionShipment()`, shipment filtering and shipment detail rendering.

- [ ] **Step 1: Write failing tests** for status progression, ABD blocking, POD-before-collection rejection and post-collection edit lock.
- [ ] **Step 2: Run focused tests** and confirm failure because store/transition logic is absent.
- [ ] **Step 3: Implement minimal store and shipment workspace** using localStorage only.
- [ ] **Step 4: Run focused tests** and confirm PASS.
- [ ] **Step 5: Run `npm test`** and confirm all project tests PASS.

### Task 3: Tasks, documents and customer avis

**Files:**
- Modify: `test/company-showcase.test.mjs`
- Create: `demo/demo-documents.js`
- Create: `demo/demo-avis.js`
- Modify: `demo/demo-ui.js`
- Modify: `demo/index.html`
- Modify: `demo/demo.css`

**Interfaces:**
- Consumes: local demo store and shipment state.
- Produces: document completeness explanation, local task completion, DEMO file preview and local-only avis preview.

- [ ] **Step 1: Write failing tests** for required documents, local-only avis and DEMO/MUSTER output markers.
- [ ] **Step 2: Run focused tests** and confirm expected failures.
- [ ] **Step 3: Implement document/task/avis views** without network or mail calls.
- [ ] **Step 4: Run focused tests** and confirm PASS.
- [ ] **Step 5: Run `npm test`** and confirm all project tests PASS.

### Task 4: Customers, locations, roles and guided presentation

**Files:**
- Modify: `test/company-showcase.test.mjs`
- Create: `demo/presentation-guide.js`
- Modify: `demo/demo-ui.js`
- Modify: `demo/index.html`
- Modify: `demo/demo.css`

**Interfaces:**
- Consumes: demo state and existing view IDs/actions.
- Produces: local role switching, customer/location workspace and guided 10-step presentation.

- [ ] **Step 1: Write failing tests** for role scoping and guided-tour view/action references.
- [ ] **Step 2: Run focused tests** and confirm expected failures.
- [ ] **Step 3: Implement role and tour behavior** with no authentication calls.
- [ ] **Step 4: Run focused tests** and confirm PASS.
- [ ] **Step 5: Run `npm test`** and confirm all project tests PASS.

### Task 5: Isolated preview workflow and final verification

**Files:**
- Modify: `.github/workflows/professional-ci.yml`
- Create: `.github/workflows/company-showcase-preview.yml`
- Modify: `test/company-showcase.test.mjs`

**Interfaces:**
- Consumes: completed `demo/` static application.
- Produces: PR-only Azure preview deployment and isolation verification.

- [ ] **Step 1: Write failing workflow contract tests** requiring demo syntax checks, isolation scan and `/demo/` payload.
- [ ] **Step 2: Run focused tests** and confirm failure before workflow exists.
- [ ] **Step 3: Add preview workflow** limited to the showcase branch/PR and explicitly separate from main production deployment.
- [ ] **Step 4: Run `npm test`** and confirm all tests PASS.
- [ ] **Step 5: Verify PR workflow and preview URL**, then update Draft PR with exact test counts and deployment evidence.
