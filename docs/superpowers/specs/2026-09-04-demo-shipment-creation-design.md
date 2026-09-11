# ExportHUB Demo Shipment Creation Design

**Date:** 2026-09-04

## Goal

Extend the existing isolated ExportHUB Professional company showcase with a complete, presentation-ready shipment creation workspace that demonstrates the operational flow from customer/location selection through colli/LDM, documents/ABD, stowage preview and mail preview to a locally saved demo shipment.

## Scope

The flow is an extension of the existing `/demo/` shipment workspace. It does not create a second shipment system and does not change production `main`.

The creation flow contains these ordered sections:

1. Customer and delivery location
2. Shipment data
3. Colli and LDM
4. Documents and ABD
5. Stowage preview
6. Mail preview
7. Save locally as demo draft

## Business rules

- Reference is exactly 6 characters `A-Z` / `0-9`.
- A delivery location must belong to the selected customer.
- Physical quantity is the colli quantity.
- Pallet LDM uses `0.20` per physical pallet.
- Colli rows keep packaging, quantity, weight and optional L/B/H dimensions visible.
- Non-EU is derived from the selected location country for the fictional dataset.
- ABD is required when the destination is non-EU and either value exceeds EUR 1,000 or the forwarder requirement is enabled.
- Missing required ABD blocks later readiness exactly like existing demo shipments.
- The stowage preview is illustrative and local. Pallets are sorted high-to-low so higher units are presented toward the front/cab side.
- The mail area is preview-only. It must never use `mailto:`, network calls or real addresses.
- Saving creates a local `Entwurf` shipment marked `demo:true` and immediately makes it available in the existing shipment worklist.
- Reset restores the original baseline and removes created demo shipments.

## Presentation behavior

A clearly visible `Neue Demo-Sendung` action opens a creation drawer/workspace. The form should look like one coherent business process rather than disconnected raw inputs.

The Colli area supports adding and removing rows. LDM and total weight are recalculated live. The stowage preview updates from the same rows so the presentation visibly connects data entry and loading preparation.

The document section explains which files are currently present and whether ABD is required. The mail preview summarizes the selected customer, destination, collection date, reference and document state and is visibly marked `DEMO / MUSTER`.

## Architecture

- `demo/demo-shipment-create.js`: pure calculation/validation helpers and creation-workspace rendering/binding.
- `demo/demo-store.js`: owns the new `createShipment(input)` mutation only; it remains the source of truth for local demo state.
- `demo/demo-shipments.js`: opens the creation workspace and refreshes/selects the newly created shipment.
- `demo/index.html`: provides the creation trigger and drawer host.
- `demo/demo-shipments.css`: styles the creation workspace and stowage preview.

No production API or production frontend module is imported.

## Required tests

- reference validation accepts only exactly 6 uppercase alphanumeric characters
- pallet LDM is `quantity * 0.20`
- ABD requirement follows non-EU plus value/forwarder rule
- stowage blocks sort higher pallets toward the cab/front side
- `createShipment()` stores a fictional local draft and reset removes it
- creation runtime contains no network/auth/mail transport call
- shipment page exposes a visible creation trigger and creation workspace

## Isolation

All existing company showcase isolation requirements remain mandatory. The runtime must remain fully local and the separate PR preview must continue to deploy without Azure Functions/API.