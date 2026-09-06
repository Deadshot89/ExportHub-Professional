# Professional Write Foundation 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first persistent operational write capabilities for tasks and shipment creation without enabling production writes.

**Architecture:** The established operations store and browser runtime remain strictly read-only. All mutations live in dedicated write modules and run server-side through existing Professional sessions, tenant-derived scope, role permission checks, CSRF validation and `db.withTenantClient(...,{write:true})`. The existing `PROFESSIONAL_DATA_MODE=live` plus `PROFESSIONAL_ENABLE_WRITES=true` gate remains the final runtime switch; this plan adds code only and does not alter Azure environment settings.

**Tech Stack:** Azure Static Web Apps, Azure Functions Node 20, PostgreSQL, browser ES modules, Node test runner.

**Spec:** Current ExportHUB Professional status chain and role model in repository schema/authorization plus project requirement that reference is exactly six uppercase alphanumeric characters.

## Global Constraints

- Production write environment stays unchanged in this block.
- No tenant id is accepted from browser payloads.
- All mutations require the existing server session, exact permission and CSRF token.
- Shipment reference is exactly six characters `A-Z0-9` and unique per tenant.
- Customer/location relationship is validated server-side in the current tenant.
- New tasks are tenant-scoped and RLS-protected.
- Existing read-only Operations contracts remain mutation-free.
- Demo PR #5 remains separate and is not merged.

---

### Task 1: Persistent operational tasks

- [x] Write failing schema/store/API contract tests.
- [x] Run full suite and confirm only new write-foundation tests fail.
- [x] Add `operational_tasks` with tenant/user/shipment references, priority, due date, status and explicit RLS.
- [x] Implement tenant-safe task store; mutations use `{write:true}`.
- [x] Implement GET list, POST create and PATCH status APIs with exact role/CSRF checks.
- [x] Add UUID validation before PostgreSQL access.
- [x] Run full suite and require PASS.

### Task 2: Controlled shipment creation

- [x] Add failing tests for six-character reference, tenant customer/location relationship, write gate, permission and CSRF.
- [x] Preserve `api/shared/operations-store.js` as strictly read-only and create `api/shared/operations-write-store.js` for mutations.
- [x] Implement reference and UUID validation plus tenant-safe customer/location verification.
- [x] Insert with initial status `Entwurf` only through the global write gate.
- [x] Reject duplicate tenant reference deterministically.
- [x] Create an isolated `assets/js/operations-write.js` enhancement while `assets/js/operations.js` remains GET-only.
- [x] Enable shipment/task actions only when Professional meta reports `database.writesEnabled=true` and the role permits the action.
- [x] Add session fallback for an already restored login.

### Task 3: Integration and release gate

- [x] Add all new runtime files to CI syntax/runtime validation.
- [x] Assert browser code contains no tenant input and cannot alter Professional environment gates.
- [x] Assert physical read-only/write module separation in CI and deploy preflight.
- [x] Initial RED #341: 92 existing PASS / exactly 8 expected new FAIL.
- [x] Diagnose architecture coupling regression #358 instead of weakening existing read-only tests.
- [x] Separated-module GREEN #368: 101/101 PASS.
- [x] UUID-hardening RED #369: 99 PASS / exactly 2 expected FAIL.
- [x] Final GREEN #372: 101/101 PASS, 0 FAIL; frontend syntax, invariants and API runtime PASS.
- [x] Verify branch is ahead of main with no unrelated project or environment changes.
- [ ] Merge verified dormant code to `main`.
- [ ] Run fresh main CI and production deploy.
- [ ] Keep `PROFESSIONAL_DATA_MODE` and `PROFESSIONAL_ENABLE_WRITES` unchanged during deployment.
