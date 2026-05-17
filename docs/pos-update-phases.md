# POS Update Progress

- [x] Phase 1: Bill generate prints
  - `Generate bill` now creates the bill and queues/processes the receipt print.
  - Hub/mobile print-only action removed from the primary billing UI.
- [x] Phase 2: Sequential bill numbers and print cleanup
  - Bills now get global sequential `bill_number` values.
  - Ticket renderers suppress `Regular` and duplicate volume labels like `30 ml 30 ml`.
- [x] Phase 3: Order-state editor backend
  - Added full order-state replacement endpoint with `save` and `save_print`.
  - Running saves need no PIN; billed saves require manager approval.
  - Plain `save` creates no KOT/KDS/print output; `save_print` creates deltas.
  - Billed all-zero edits revise the bill to zero before freeing the table.
- [x] Phase 4: Hub order/menu UX
  - Sent items replaced by editable table-state UI with add/search, plus/minus/remove, Save, Save and print.
  - Take-order menu simplified to fuzzy search plus sale-group tabs and compact rows.
  - Live editor state now refreshes on same-line quantity/content changes from other devices.
- [x] Phase 5: Mobile UX parity
  - Mobile gets the same table-state edit/save/save-print flow and simplified menu.
  - Mobile print-only button removed; Generate Bill now queues the first receipt print.
  - Mobile Order History can open older finalized business days and print historical bills.
- [x] Phase 6: Realtime, KDS, and audio
  - Hub/mobile clients refresh truth from realtime events.
  - KDS updates only come from print-enabled changes.
  - Kitchen screen and captain/waiter mobile now notify on new/ready work.
- [x] Phase 7: Order history and date formatting
  - Order History shows bill number, table, item lines, subtotal, tax, totals, payment state, and one-tap print.
  - History reprint requires no PIN and writes `history_reprint` audit/event data.
  - Shared POS date formatter is used across renderer date/time displays.

Verification completed:
- `pnpm --filter @gaurav-pos/shared test`
- `pnpm --filter @gaurav-pos/hub-electron test`
- `pnpm --filter @gaurav-pos/hub-electron typecheck`
- `pnpm --filter @gaurav-pos/mobile test`
- `pnpm --filter @gaurav-pos/mobile typecheck`
