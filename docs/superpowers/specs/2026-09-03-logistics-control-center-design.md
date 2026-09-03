# ExportHUB Professional – Logistics Control Center Design

Date: 03.09.2026
Status: Approved in chat, pending final spec review
Scope: UI/UX redesign of Overview, Customers and Locations. Existing masterdata APIs, role rules and data model remain unchanged.

## 1. Goal

ExportHUB Professional should no longer feel like a generic admin dashboard. The primary desktop experience becomes a dense, professional logistics control center focused on operational work: what is open, what is due, what is missing, and what action is needed next.

The redesign must reduce empty space, strengthen visual hierarchy, add consistent operational status cues, and keep all existing customer/location behavior intact.

## 2. Design Direction

Chosen direction: **B – Logistics Control Center**.

Characteristics:
- compact, professional, operationally focused
- dark navigation and restrained blue primary color
- status colors only where they carry meaning
- denser layouts without becoming visually noisy
- clear distinction between primary actions, secondary actions and destructive actions
- fewer oversized SaaS-style cards and less decorative empty space
- desktop-first for logistics workstations, while preserving clean responsive mobile behavior
- consistent iconography for customer, location, shipment, document, warning and status concepts

## 3. Global Shell

### Navigation
- Keep the dark left sidebar, but make spacing and grouping more compact.
- Selected navigation item must be clearly visible without oversized treatment.
- Navigation remains usable on smaller screens via the existing responsive pattern.

### Top bar
- Replace the visually empty top area with a compact work/status bar.
- Show workspace, signed-in user and small status indicators for database, migration mode and masterdata write state.
- Technical status remains visible but secondary to operational content.

### Common components
- compact page headers
- compact filter bars
- unified KPI cards
- consistent status chips
- consistent action buttons
- denser tables/lists with stronger row hierarchy
- meaningful empty states with a next action instead of plain “no data” text

## 4. Overview – Operative Control Center

The current large introductory hero is removed. The overview is a working dashboard, not a product explanation.

### 4.1 Today bar

Compact row at the top showing:
- current date
- workspace
- current user
- small system indicators

### 4.2 Primary KPIs

Four operational KPI cards:

1. **Open shipments**
   - total open shipments
   - subset due today

2. **Pickups today**
   - planned today
   - already collected

3. **Missing documents**
   - total missing required documents
   - examples later include ABD, POD, delivery note where applicable

4. **Action required**
   - total items requiring manual attention

Each KPI card must have:
- icon
- primary number
- short context line
- optional status indicator
- direct navigation/action target

### 4.3 Today in shipping

Main content area, approximately two-thirds of available width.

Each shipment row should show compactly:
- customer
- reference
- location
- status
- pickup date
- next required action

Critical/overdue items sort before normal items.

If shipment data is not yet available from a live source, the component remains structurally present with a useful empty state and no fake data.

### 4.4 Action required panel

Right-side panel with concrete problems, not generic system explanations.

Examples:
- registration email missing
- carrier not configured
- required document missing
- inactive or incomplete masterdata

Each item contains a direct action such as Open, Edit or Review.

### 4.5 Quick actions

Compact action strip:
- Create shipment
- Create customer
- Search location
- Review documents

Unavailable future actions must be visibly disabled rather than wired to placeholders.

### 4.6 Recent activity

Compact lower section showing meaningful recent changes and activity.

## 5. Customers – Premium Master/Detail Workspace

The existing master/detail interaction model stays. The visual treatment and information hierarchy are upgraded.

### 5.1 Customer list

Left column remains sticky on desktop and contains:
- search
- status filter
- count
- compact customer rows

Each customer row shows:
- customer account/number
- company name
- active/inactive status
- number of locations

The selected customer must be visually unmistakable.

### 5.2 Customer detail header

The selected customer receives a stronger detail header showing:
- customer number
- company name
- active/inactive state
- Edit action
- Activate/Deactivate action
- Add location action

Also show a compact summary, for example:
- number of locations
- total registration emails
- distinct configured carriers

### 5.3 Location cards within customer

Locations remain expandable and multiple locations may stay open simultaneously.

Collapsed state shows:
- location name
- city/country
- carrier
- registration-email count
- active/inactive status

Expanded state separates information into clear groups:
- address
- registration emails
- contact details
- carrier
- shipping instructions

Editing continues to use the existing canonical customer/location editor and drawer. No duplicate editor is introduced.

## 6. Global Locations View

The Locations page becomes an operational cross-customer search and masterdata quality view.

### 6.1 Filter bar

Provide compact filters for:
- location search
- status
- country
- carrier

### 6.2 Location KPIs

Show compact counts for:
- active locations
- locations without carrier
- locations with multiple registration emails
- incomplete masterdata

### 6.3 Location rows

Each row shows:
- location name
- customer name and customer number
- city/country
- carrier
- registration-email count
- active/inactive status
- quality/status marker

Quality/status markers:
- green: complete
- yellow: non-critical configuration gap such as missing carrier
- red: required masterdata incomplete
- grey: inactive

The action **Open** must navigate to the canonical Customers view, select the correct customer and expand the exact location. No second editing implementation is allowed.

## 7. Visual System

### Layout
- reduce excessive empty margins and oversized headers
- use compact page sections and a consistent spacing scale
- preserve readable line height and clear grouping

### Cards and surfaces
- use restrained borders and subtle shadowing
- avoid overly rounded playful cards
- favor technical, slightly squarer surfaces suitable for a logistics workstation

### Typography
- smaller, stronger page headings
- clear distinction between primary data, metadata and actions
- numeric KPIs visually dominant without oversized marketing typography

### Colors
- dark navy navigation
- blue as primary action/accent
- green only for positive/ready/complete states
- yellow/amber for warnings or incomplete-but-usable states
- red for blocking problems/errors
- grey for inactive or secondary states

### Icons
Use a consistent icon language for:
- customer
- location
- shipment
- document
- warning/action required
- search/filter
- status

Icons support recognition but must not replace text labels for important actions.

## 8. Responsive Behavior

Desktop is the primary target.

At narrower widths:
- KPI grids collapse progressively
- overview two-column layout becomes single-column
- customer master/detail becomes stacked
- filter bars wrap cleanly
- location/customer rows may hide secondary metadata before primary data
- all write actions remain reachable and touch-friendly

No horizontal scrolling should be required for the main customer/location workflows on normal phone widths.

## 9. Functional Constraints

The redesign must not change:
- tenant isolation
- role permissions
- CSRF behavior
- customer/location API contracts
- masterdata write gate
- customer number uniqueness
- required first location on customer creation
- registration-email requirements
- soft activate/deactivate behavior
- canonical customer/location edit flow
- global location → customer navigation behavior

No fake production metrics may be displayed. If a live data source for a dashboard widget does not yet exist, show a real empty/unavailable state.

## 10. Implementation Boundaries

Primary files expected to change:
- `index.html`
- `assets/css/app.css`
- `assets/js/app.js`
- `assets/js/locations.js`
- UI-focused tests under `test/`

New small UI modules may be introduced if needed to keep `app.js` from growing further, but this redesign does not justify API or schema changes by itself.

## 11. Testing and Acceptance

The redesign is accepted only when:
- existing full Professional test suite remains green
- frontend JavaScript syntax checks remain green
- customer/location API behavior is unchanged
- role-based write controls remain correct
- overview contains no large marketing hero
- operational KPI/work areas are present
- customers use the upgraded master/detail hierarchy
- locations use filters, quality status and canonical open behavior
- responsive layouts remain usable at desktop, tablet and phone widths
- no duplicate location/customer editor is introduced
- no placeholder/fake operational data is shown as real

## 12. Out of Scope for This Redesign

Not part of this UI pass unless separately designed later:
- new shipment backend features
- new document backend features
- analytics/charting subsystem
- new notification system
- changed customer/location database model
- changed authorization model
