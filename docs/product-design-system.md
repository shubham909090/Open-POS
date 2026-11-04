# POS interface system

Windows Hub and Android share visual rules, semantic colors and interaction states. Their layouts follow the work: a cashier uses a keyboard and a wide display; floor staff use one hand; a cook reads tickets at a glance.

## Foundation

- Canonical tokens: `packages/shared/src/design-tokens.ts`. Hub CSS mirrors them in `styles/tokens.css`; Android maps them in `styles/app-style-tokens.ts`.
- Warm neutral workspace, white work surfaces, graphite text, deep teal primary actions. Amber means running/preparing, blue means billed, green means ready/paid, red means cancellation/error. Free tables are neutral.
- Segoe UI Variable/Segoe UI on Windows; platform text on Android. Use tabular numbers for money and quantities. Avoid loading decorative fonts.
- Spacing uses 4/8/12/16/24/32. Desktop controls are 36 px; touch controls are at least 48 px. Control radius 6 px; overlays 12 px.
- Borders separate editable controls and adjacent records. Use space and dividers for sections. Elevation belongs to overlays, not nested cards.

## Composition

- Center single-task setup, approval and QR presentation. Center quantity controls and icons optically. Align names and field labels left; amounts right.
- One page title, one clear primary action per decision area. No breadcrumb that repeats the adjacent heading, configured badge, duplicate total, or explanatory paragraph by default.
- Keep the catalog and service work visible immediately. Add/import forms open on demand. Do not put a catalog below a permanently expanded creation form.
- Order identity stays fixed while the content scrolls. Keep the payable amount and final action together. Never show an old bill's action while revising it.
- Settings use aligned field rows and progressive disclosure. Printer preview follows the selected printer and stays visible where space permits.
- Mobile keeps the next action within reach. Keep all fields reachable above the keyboard; system Back cancels an unfinished modal without changing data.

## Copy and behavior

- Start with a label. Add a short hint only when a choice cannot explain itself. Put optional detail behind contextual help. Show consequences when confirming a destructive action.
- Success feedback is brief; validation appears by the relevant field. A background refresh cannot erase an action error or an unfinished edit.
- Focus remains visible. Keyboard selection stays in view. A stationary pointer cannot override a newly typed search selection. Closing a modal restores the exact trigger.
- Disable duplicate submissions. Block service edits while a Hub update is installing. Never discard unsent items or apply another table's order after a late response.
- Loading, empty, offline and permission states retain context and offer one appropriate next action. No fake successful states or silent payment confirmation.

## Verification

Judge both appearance and use: Windows 1366/1440/1920, effective 125% space, keyboard and touch; Android narrow/large-text and wider layouts, Back and keyboard. Exercise ordinary service, bills, revisions, history, kitchen cancellations, QR, branding and update recovery. Record what was actually exercised. No perfect rating while a material defect remains.
