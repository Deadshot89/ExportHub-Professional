# ExportHUB Demo Document Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development task-by-task.

**Goal:** Add professional local-only document package previews for demo shipments.

**Architecture:** Introduce one independent document-output module that builds deterministic view models from the existing demo store. The existing document workspace opens a preview host and delegates rendering/printing/download to the new module. No backend or external dependency is added.

**Tech Stack:** HTML, CSS, vanilla ES modules, Node.js 20 `node:test`, GitHub Actions, Azure Static Web Apps preview.

**Spec:** `docs/superpowers/specs/2026-09-04-demo-document-output-design.md`

## Global Constraints

- Work only on `demo/company-showcase`.
- Keep `main` unchanged.
- Follow RED → GREEN → verification.
- Every rendered artifact must include `DEMO / MUSTER`.
- Dates use `TT.MM.JJJJ`.
- No network/API/auth/mail/SQL/blob calls.
- CMR must expose three numbered copies.
- ABD only when required; never invent an MRN.
- POD only completed after collection + present POD.
- Ladeliste remains one-page.

---

### Task 1: Pure document package model

**Files:**
- Create: `test/company-showcase-document-output.test.mjs`
- Create: `demo/demo-document-output.js`

- [ ] Write failing tests for package composition, German date formatting, safe filename, CMR 3-copy output, ABD relevance, POD state and DEMO marker.
- [ ] Verify RED in CI.
- [ ] Implement minimal pure builders.
- [ ] Verify GREEN.

### Task 2: Document output workspace

**Files:**
- Modify: `test/company-showcase-document-output.test.mjs`
- Modify: `demo/index.html`
- Modify: `demo/demo-documents.js`
- Modify: `demo/demo-document-output.js`
- Modify: `demo/demo-operations.css`

- [ ] Add failing DOM-contract tests for package trigger, preview host, tabs, paper sheet, print and local download actions.
- [ ] Verify RED.
- [ ] Add preview host and integrate shipment document cards.
- [ ] Render Ladeliste, L1/QR, L2, CMR, ABD and POD sample sheets.
- [ ] Add responsive and print styling.
- [ ] Verify GREEN.

### Task 3: Isolation and final preview

**Files:**
- Modify: `.github/workflows/professional-ci.yml`
- Modify: `.github/workflows/company-showcase-preview.yml`
- Modify: `test/company-showcase-preview.test.mjs` if needed.

- [ ] Write/update failing workflow coverage first.
- [ ] Add `demo/demo-document-output.js` to syntax/isolation/payload checks.
- [ ] Run full Professional suite.
- [ ] Verify Professional CI success.
- [ ] Verify Azure preview deploy and HTTP smoke test success.
- [ ] Verify PR stays Draft and `main` SHA unchanged.
