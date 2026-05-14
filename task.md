# Restaurant Workflow Pass Tasks

This file tracks the current big POS workflow pass so future context stays clear.

## Current Pass

Goal: implement manager PIN approvals, configurable sale/tax groups, open items, revised/NC bills, table/order movement, clearer table states, printing/template telemetry, grouped reports, cloud report sync, and APK captain scope/notifications.

## Progress

- [x] Review fix pass agreed: add real captain role, tighten movement security, wire bill revision UI, clean open items, and add captain-ready notifications.
- [x] Added `captain` as a separate local/cloud device role.
- [x] Hub now derives actor identity from the authenticated device token for order submit and movement.
- [x] Captain devices can shift only their own running tables/items; waiter devices cannot shift.
- [x] Open Food/Bar/Beverage no longer creates hidden disabled dishes in `menu_items`.
- [x] Hub billing UI now exposes manager-approved bill revision.
- [x] NC marking is blocked after any normal payment has been recorded.
- [x] KDS ready status creates captain-device ready notifications; APK polls and alerts.
- [x] APK now supports selected-item shift as well as full-table shift for captain devices.
- [x] Plan agreed for the full restaurant workflow pass.
- [x] Manager approval model chosen: one shared restaurant manager PIN for v1.
- [x] Tax/group model chosen: configurable sale/tax groups with seeded defaults.
- [x] Bill regeneration meaning chosen: manager-approved revised bill, not just reprint.
- [x] NC bill accounting chosen: count item quantities, exclude sale/tax/payment totals.
- [x] Kitchen/bar ready source chosen: KDS screens mark ready; APK receives alerts.
- [x] Delivery shape chosen: one big delivery bundle, implemented internally in ordered slices.
- [x] Existing repo state inspected for current auth, tax, printer, KDS, report, schema, hub, and mobile surfaces.
- [x] Add shared schemas/types for approvals, sale groups, open items, bill revisions, NC bills, movement, print modes, and report groups.
- [x] Add SQLite/Drizzle schema and migration for new restaurant workflow data.
- [x] Seed default Food/Alcohol/Beverage/Other sale groups and tax components.
- [x] Implement manager PIN setup, hashing, validation, and audit events.
- [x] Protect sensitive actions with manager approval and reason.
- [x] Implement configurable tax/group-aware bill math and bill ticket output.
- [x] Implement open item ordering and routing.
- [x] Implement bill revision after print with audit history and KOT/BOT deltas in the domain/API.
- [x] Implement NC bill marking and report exclusion rules.
- [x] Split KOT/BOT/Bill print actions and add template header/footer settings.
- [x] Improve print-job telemetry and failed-printer audit events.
- [x] Implement table colours across hub and APK: free white, running amber, bill printed blue.
- [x] Rename remaining main app room wording to floor.
- [x] Implement full table shift and selected-item shift in hub API/domain.
- [x] Add full-table movement UI on APK and full/selected-item movement UI on hub.
- [x] Limit APK to captain/waiter scope and add KDS ready status polling through refreshed running-table data.
- [x] Add grouped day-end and cloud report summaries.
- [x] Update Convex schema/sync/report queries for grouped reports, NC, revisions, and printer audit metadata.
- [x] Update docs/context with final behavior and operator wording.
- [x] Run shared, hub, mobile, Convex, export, lint/typecheck/test verification.
- [x] Final code review and mark completed tasks in this file.
- [x] Review follow-up fixed: bill revision is blocked after any payment is recorded.
- [x] Review follow-up fixed: table and selected-item shifts now create source/target KOT/BOT transfer tickets.
- [x] Review follow-up fixed: order attribution now derives display captain/waiter name from the authenticated device session.
- [x] Review follow-up fixed: grouped reports allocate discounts/tips so Food/Alcohol/Beverage totals reconcile with final day sales.
- [x] Review follow-up fixed: duplicate open-item KOT rows link to the exact inserted order items.
- [x] Review follow-up fixed: APK refreshes its paired role from the hub through `/devices/me`.
- [x] Architecture simplification pass: hub/mobile no longer send fake actor names for order, movement, billing, bill print/reprint, KOT reprint, or cancellation paths.
- [x] Architecture simplification pass: table display state is centralized in `packages/shared`, so hub and APK use the same free/running/bill-printed/disabled wording and colours.
- [x] Architecture simplification pass: mobile role/name display comes from the paired device session, not locally stored editable state.
- [x] Alcohol management pass implemented: dedicated Hub Alcohol section, plain-liquor variants, prepared-product recipes, local stock storage, Manager PIN stock edits, pending/settled stock deductions, and BOT routing.
- [x] Alcohol recipe snapshot pass fixed: unpaid and settled cocktail stock usage reads `order_items.alcohol_recipe_snapshot_json`, not the current recipe table.
- [x] Price-flow hardening fixed: submit, bill revision, and selected-item movement preserve order-line price/variant/recipe/tax/routing snapshots and split rows when snapshots differ.

## Implementation Notes From This Pass

- Role model is now explicit: `admin`, `cashier`, `captain`, `waiter`, `kitchen`.
- `captain` is the tablet role for trusted floor captains; `waiter` remains basic order-taking without table/item shift power.
- Order ownership is device-based for captain controls, using the paired device token session rather than free-text names.
- Open items are order-item snapshots with nullable `menu_item_id`; they remain billable, printable, and reportable without polluting dish setup.
- Menu items now have internal sellable variants. Normal dishes keep a default variant; plain liquor uses shot/small-bottle/large-bottle variants; prepared alcohol products use a single non-stock default variant.
- Alcohol stock is Hub-local v1. Sales deduct stock only on paid settlement; unpaid orders appear as pending expected usage. Shots/cocktails consume large/open ml, small bottles reduce sealed small count, and large bottles reduce sealed large count.
- Order lines are historical snapshots. Catalog edits, alcohol recipe edits, and price changes must not mutate existing open/printed order line values.
- Bill revision preserves an existing line's original snapshot when `orderItemId` is supplied. Selected-item movement merges into the target only when the full source/target snapshot matches.
- Ready notifications are hub-polled v1 alerts, not OS push notifications.
- Hub backend now supports manager PIN, manager approval audits, open items, sale/tax groups, KOT/BOT labels, bill templates, bill revision records, NC bills, table shift, selected-item shift, and grouped close-day reports.
- Bill revision is manager-approved only while no payment has been recorded; partial payment blocks revision until a future explicit reversal flow exists.
- Table/order movement creates transfer tickets for kitchen/bar counters so printed/KDS table context stays aligned after shifts.
- Grouped report `finalSalesPaise` includes each group's allocated discount/tip share and should reconcile to day final sales.
- Paired device identity is the source of truth for order attribution and mobile role display.
- Billing, print/reprint, cancellation, and movement actor names are derived from the authenticated hub device session on the API boundary.
- Table display state should use the shared `getTableDisplayState` helper rather than each UI inventing its own status mapping.
- Hub UI now exposes manager PIN setup, tax groups, print text, open items, table colours, floor wording, bill print/reprint/NC actions, and item shifting.
- Mobile APK remains captain/waiter scoped: it can connect/pair, pick table, add/send items, view running table order, and shift a full table to a free table.
- Cloud reports now store bills/items/groups, NC metadata, and grouped totals for Food/Alcohol/Beverage/Other style reporting.
- Real printer hardware still must be tested on the Windows restaurant PC with actual kitchen/bar/cash counter printers.

## Notes

- Hub remains offline-first source of truth.
- Convex receives finalized reports and audit summaries through sync.
- Existing uncommitted mobile packaging/onboarding fixes must be preserved.


## plan 

# Restaurant Workflow Pass: Manager PIN, Tax Groups, Printing, Reports, Movement, APK

## Summary
Implement the full restaurant workflow pass from your brother’s notes in one delivery bundle. This adds manager approvals, configurable tax/sale groups, open items, table/order shifting, clearer table states, revised bills, NC bills, printer telemetry, KOT/BOT/bill layout settings, reporting bifurcation, and captain APK limits/notifications.

## Key Changes

### Manager Approval And Sensitive Actions
- Add one shared **Manager PIN** in hub setup, stored hashed locally in hub settings.
- Add reusable manager approval validation to protected actions with required reason/audit fields.
- Require manager PIN for:
  - cancel/remove order
  - reprint/regenerate bill
  - revise bill after print
  - edit item price on a running table
  - mark bill as NC / Non Customer
- Add approval audit events with action, reason, table/order/bill id, cashier/device id, and timestamp.

### Billing, Tax Groups, Open Items, NC
- Add configurable sale/tax groups:
  - default groups: Food, Alcohol, Beverage, Other
  - each group has tax components, report label, optional default kitchen/counter, and active flag
- Menu item gets sale group; open items require sale group:
  - Open Food
  - Open Bar
  - Open Beverage
  - custom open item name, price, optional kitchen/counter
- Bill math becomes group-aware:
  - tax split lines by configured group/components
  - bill layout shows subtotal, grouped taxes, discounts, tips, final total
- Add bill revision flow:
  - after bill is generated/printed, manager approval can reopen/revise
  - additions/subtractions create revised KOT/BOT where needed
  - old bill revision remains in audit history; latest revision is used for settlement
- Add NC bill flow:
  - manager PIN + reason required
  - prints like normal bill
  - item quantities count in usage reports
  - sale/tax/payment totals exclude NC amount

### Printing, KOT/BOT, Printer Health
- Split print actions clearly:
  - Send KOT/BOT only
  - Print Bill only
  - Send KOT/BOT + Print Bill for revised/add-on billed-table workflows
- Classify tickets:
  - Food/kitchen tickets = KOT
  - Alcohol/bar tickets = BOT
  - sale group or counter determines ticket label
- Add configurable ticket templates:
  - KOT/BOT header/footer
  - Bill header/footer
  - restaurant name/GST/VAT text fields
- Improve printer telemetry:
  - show failed/pending/printed per printer/counter
  - alert hub when KOT/BOT/Bill print job fails
  - keep retry action and last error visible
  - publish realtime printer failure events

### Tables, Floors, Movement, APK Scope
- Rename remaining “room” wording to **Floor**.
- Table colours across hub and APK:
  - Free = neutral white
  - Running = amber
  - Bill printed/pending payment = blue
- Add table/order movement:
  - shift full table order to another free table
  - shift selected items to another table
  - available on hub and APK
  - audit every move
- Captain APK scope:
  - take order
  - send KOT/BOT
  - view running table order
  - shift table/items
  - receive ready notifications
  - no billing, reports, manager settings
- Kitchen/bar KDS can mark tickets preparing/ready/served; APK receives ready alerts for table/items/counter.

### Reports And Cloud Sync
- Day-end and cloud reports split by:
  - Food
  - Alcohol
  - Beverage
  - Other
  - kitchen/counter/group
- Add item group summaries:
  - quantity sold
  - gross amount
  - discount share where available
  - tax totals
  - NC quantities separate from sales totals
- Cloud daily report sync stores the new group summaries, bill revisions, NC flag/reason, and printer failure audit events.
- Long-period cloud reports can filter food/alcohol/beverage/other and show total quantity + total sale.

## API / Data Shape
- Add local tables/columns for:
  - sale/tax groups and tax components
  - menu item sale group
  - open order item snapshots
  - bill revisions and NC metadata
  - manager approval audit
  - ticket template settings
  - table/order movement audit
- Extend shared schemas for:
  - manager approval payload
  - open item order input
  - revised bill commands
  - NC bill command
  - move table/items command
  - tax group setup
  - print action mode
- Add/extend hub endpoints:
  - manager PIN setup/update/verify through action payloads
  - tax group CRUD
  - submit order with normal/open items
  - revise billed order
  - mark NC bill
  - move table / move selected items
  - print bill / reprint bill / retry print job
  - KDS status updates and APK-ready notifications
- Update Convex report schema/functions for grouped report totals and NC/revision metadata.

## Test Plan
- Manager approval:
  - missing/wrong PIN blocks protected actions
  - correct PIN permits action and writes audit event
- Billing/tax:
  - Food/Alcohol/Beverage configurable tax math
  - open items bill and route correctly
  - bill revision updates totals and keeps audit history
  - NC bill prints but is excluded from sales/tax/payment totals
- Printing:
  - KOT only, bill only, and KOT+bill modes create correct print jobs
  - KOT/BOT labels route by group/counter
  - failed printer job surfaces error and remains retryable
- Movement:
  - full table shift moves active order and frees source table
  - selected item shift creates correct source/destination orders and tickets
  - movement works from hub and APK
- Reports:
  - automatic business-day reports split food/alcohol/beverage/other
  - NC quantities appear separately
  - cloud report receives grouped totals without duplicate counting
- UI:
  - hub table colours match states
  - floor wording is consistent
  - APK cannot access billing/report/admin actions
  - APK receives kitchen/bar ready updates
- Verification:
  - shared tests
  - hub unit/integration tests
  - mobile typecheck/test/export
  - Convex validation/typecheck

## Assumptions
- Delivery is one big pass, implemented internally in ordered slices but shipped together.
- Manager approval uses one shared restaurant PIN for v1.
- Tax groups are configurable, with default Food/Alcohol/Beverage/Other seeded.
- “Regenerate bill” means create a revised bill after manager-approved changes, not merely reprint.
- NC bills count item quantities but exclude money from sales/tax/payment totals.
- Kitchen/bar ready status is marked from the KDS screens, then pushed to APK.
