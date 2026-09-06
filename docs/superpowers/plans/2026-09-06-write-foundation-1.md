# Professional Write Foundation 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first persistent operational write capabilities for tasks and shipment creation without enabling production writes.

**Architecture:** All mutations run server-side through existing Professional sessions, tenant-derived scope, role permission checks, CSRF validation and `db.withTenantClient(...,{write:true})`. The existing `PROFESSIONAL_DATA_MODE=live` plus `PROFESSIONAL_ENABLE_WRITES=true` gate remains the final runtime switch; this plan adds code only and does not alter Azure environment settings. Persistent tasks receive their own tenant-RLS table; shipment creation uses the existing shipment/customer/location schema and validates the tenant relationship before insert.

**Tech Stack:** Azure Static Web Apps, Azure Functions Node 20, PostgreSQL, browser ES modules, Node test runner.

**Spec:** Current ExportHUB Professional status chain and role model in repository schema/authorization plus project requirement that reference is exactly six uppercase alphanumeric characters.

## Global Constraints

- Production write environment stays unchanged in this block.
- No tenant id is accepted from browser payloads.
- All mutations require the existing server session, exact permission and CSRF token.
- Shipment reference is exactly six characters `A-Z0-9` and unique per tenant.
- Customer/location relationship is validated server-side in the current tenant.
- New tasks are tenant-scoped and RLS-protected.
- Demo PR #5 remains separate and is not merged.

---

### Task 1: Persistent operational tasks

**Files:**
- Modify: `schema/postgres.sql`
- Create: `api/shared/tasks-store.js`
- Create: `api/tasks-list/index.js`, `api/tasks-list/function.json`
- Create: `api/task-create/index.js`, `api/task-create/function.json`
- Create: `api/task-status/index.js`, `api/task-status/function.json`
- Test: `test/write-foundation.test.mjs`

**Interfaces:**
- Consumes: `authorization.requireSession`, `database.withTenantClient`
- Produces: `listTasks(tenantId)`, `createTask(tenantId,userId,input)`, `setTaskStatus(tenantId,taskId,status,userId)`

- [ ] Write failing schema/store/API contract tests.
- [ ] Run full suite and confirm only new write-foundation tests fail.
- [ ] Add `operational_tasks` with tenant/user/shipment references, priority, due date, status and RLS.
- [ ] Implement tenant-safe task store; mutations use `{write:true}`.
- [ ] Implement GET list, POST create and PATCH status APIs with exact role/CSRF checks.
- [ ] Run full suite and require PASS.
- [ ] Commit the task subsystem independently.

### Task 2: Controlled shipment creation

**Files:**
- Modify: `api/shared/operations-store.js`
- Create: `api/shipment-create/index.js`, `api/shipment-create/function.json`
- Modify: `assets/js/operations.js`
- Test: `test/write-foundation.test.mjs`

**Interfaces:**
- Consumes: existing `shipments`, `customers`, `customer_locations`, `db.withTenantClient`
- Produces: `validateShipmentCreateInput(input)`, `createShipment(tenantId,input)` and POST `/api/professional-operations/shipments`

- [ ] Add failing tests for six-character reference, tenant customer/location relationship, write gate, permission and CSRF.
- [ ] Implement validation and tenant-safe insert with initial status `Entwurf`.
- [ ] Reject duplicate tenant reference deterministically.
- [ ] Extend live UI with a shipment-create drawer that only enables when Professional meta says operational writes are enabled.
- [ ] Keep production UI visibly read-only when gate is false.
- [ ] Run full suite and runtime syntax checks.
- [ ] Commit independently.

### Task 3: Integration and release gate

**Files:**
- Modify: `.github/workflows/professional-ci.yml`
- Modify: `.github/workflows/professional-deploy.yml` only if required for validation coverage; never add an environment activation.

**Interfaces:**
- Consumes: Task 1 and Task 2 files.
- Produces: CI evidence that mutation handlers, schema contracts and UI gating are validated before merge.

- [ ] Add all new runtime files to CI syntax/runtime validation.
- [ ] Assert browser code contains no tenant input and no mutation action can be enabled unless meta exposes `database.writesEnabled=true`.
- [ ] Run full PR CI.
- [ ] Merge only after fresh GREEN evidence.
- [ ] Run main CI and production deploy.
- [ ] Do not alter `PROFESSIONAL_DATA_MODE` or `PROFESSIONAL_ENABLE_WRITES` in Azure during this release.
