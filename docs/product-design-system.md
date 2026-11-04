# POS interface system

Windows Hub and Android share visual rules, semantic colors and interaction states. Their layouts follow the work: a cashier uses a keyboard and a wide display; floor staff use one hand; a cook reads tickets at a glance.

## Foundation — "the pass"

- Canonical tokens: `packages/shared/src/design-tokens.ts`. Hub CSS mirrors them in `styles/tokens.css`; Android maps them in `styles/app-style-tokens.ts`.
- Three planes give depth: graphite chrome (Hub rail, table workspace header, draft bar), warm paper page, white work cards with real shadow. Never a white card inside a white panel.
- Colour carries meaning only, and an action takes the colour of the state it produces: saffron sends to the kitchen and marks running tables; indigo prints a bill and marks tables waiting for money; green settles money (Punch / Record) and nothing else; red is destructive or needs attention. Neutral commits (Save, Create) are graphite.
- Free tables recede (flat, name only, short rows). Live tables are lifted cards with a coloured top edge, timer and amount. A running table open 3h+ shows a red timer.
- Every table tile in a floor shares one row height. On the Hub a live table spans two rows; on Android every tile is the same two-line height. Free tables never stretch into empty boxes beside a live one.
- Android table columns follow usable width: three on narrow phones, four with at least420dp of grid space, six/eight on tablets. Selection must preserve content width; table identity, status and ordinary money/timers must remain readable.
- Long saved lists (menu, devices, print jobs, sale categories) are dense one-line rows: name, muted meta inline, a right-aligned value column, quiet actions. Tables in setup are a tile grid; the tile opens its editor, where Disable and Delete live.
- A primary action that is waiting for input (no target, no PIN yet) is neutral grey, never a faded brand colour. On Android, button labels use weight 700: weight 600 is measured lighter than it draws and clips the last word.
- Segoe UI Variable/Segoe UI on Windows; platform text on Android. Tabular numbers for money and quantities. Rupee sign is always "₹", never "Rs".
- Desktop controls are 32 px, coarse pointers 44 px. Control radius 7 px, cards 12 px, dialogs 14 px. 13 px body text on Hub.
- Size inputs to their content (a tip field is not 500 px wide). One primary action per surface, pinned in the same place across panels.
## Composition

- Center single-task setup, approval and QR presentation. Center quantity controls and icons optically. Align names and field labels left; amounts right.
- The table popup is one continuous surface. Separate its ticket, footer and payment areas with spacing or dividers, never nested rounded cards.
- One page title, one clear primary action per decision area. No breadcrumb that repeats the adjacent heading, configured badge, duplicate total, or explanatory paragraph by default.
- Keep the catalog and service work visible immediately. Add/import forms open on demand. Do not put a catalog below a permanently expanded creation form.
- Order identity and the New order / Sent items / Bill tabs live in the workspace header. Keep the dialog bounded and centered; Sent items fits its contents. New order starts with search and category controls only. A search or explicit category opens the menu grid beside the ticket; no category opens automatically. Each editable line has quantity controls and a whole-line Remove action. Sent removals remain local edits until saved through existing approval rules. Bill shows the receipt beside the settle card. Keep the payable amount and final action together. Never show an old bill's action while revising it.
- Tender has one method chip (fill remaining) and one explicit amount per method; split tender remains directly editable. Cash change subtracts recorded payments and new non-cash tenders from the balance before comparing cash received; the calculator never changes tender amounts. Bill opens on Cash. F8 punches an exact payment; reprint requires its focused button, never global Enter.
- History edit uses receipt/items beside settlement, a compact Master PIN beside Save, and an aligned Before/After audit with IDs in a selectable footer.
- Destructive entry actions use red text or outline. Filled red belongs to confirmation.
- Kitchen shows bare quantities for new orders and signed changes for modifications. Show age from the stored ticket timestamp when available; billed table timers show time since billing.
- Dialogs open on the field that does the work (PIN, search, default printer), not on Close.
- Settings use aligned field rows and progressive disclosure. Printer preview follows the selected printer and stays visible where space permits.
- Mobile keeps the next action within reach. Keep all fields reachable above the keyboard; system Back cancels an unfinished modal without changing data.

## Copy and behavior

- Start with a label. Add a short hint only when a choice cannot explain itself. Put optional detail behind contextual help. Show consequences when confirming a destructive action.
- Success feedback is brief; validation appears by the relevant field. A background refresh cannot erase an action error or an unfinished edit.
- Focus uses a graphite 2 px ring with a 2 px white offset on every control. Keyboard menu cursor uses a graphite inset ring; in-draft uses a neutral count badge and subtle tint. Roles and category markers never borrow Running or Billed colours.
- Focus remains visible. Keyboard selection stays in view. A stationary pointer cannot override a newly typed search selection. Closing a modal restores the exact trigger.
- Disable duplicate submissions. Block service edits while a Hub update is installing. Never discard unsent items or apply another table's order after a late response.
- Loading, empty, offline and permission states retain context and offer one appropriate next action. No fake successful states or silent payment confirmation.

## Verification

Judge both appearance and use: Windows 1366/1440/1920, effective 125% space, keyboard and touch; Android narrow/large-text and wider layouts, Back and keyboard. Exercise ordinary service, bills, revisions, history, kitchen cancellations, QR, branding and update recovery. Record what was actually exercised. No perfect rating while a material defect remains.
