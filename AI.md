# AI Implementation Notes

## 2026-05-14 Alcohol Management Review Fixes

- Fixed alcohol stock adjustments so the Hub API route `POST /alcohol/stock/:id/adjust` is available to admin sessions while still requiring Manager PIN verification inside `OrderService.adjustAlcoholStock`.
- Added `OrderService.listAlcoholStockMovements()` and exposed it through `GET /reports/alcohol-stock-movements`, then surfaced the recent movement history in the Hub Reports view. The Storage tab still only shows current/pending/expected stock, keeping history out of that operational page.
- Updated alcohol item deletion safety in `OrderService.removeMenuItem`: if an item has order usage or alcohol stock movement history, removal disables the menu item instead of deleting rows that are still referenced by historical records.
- Changed alcohol variant replacement so existing variant ids are updated in place. Variants removed from setup are disabled when old order items reference them, preventing old bills/tickets from breaking after catalog edits.
- Added Hub Alcohol catalog editing UI in `apps/hub-electron/src/renderer/App.tsx`: admins can edit item type, name, active state, bar routing, bottle sizes, plain liquor variant prices/active states, and prepared-product recipes. Styles live in `apps/hub-electron/src/renderer/styles.css`.
- Added regression coverage in `apps/hub-electron/src/tests/order-service.test.ts` and `apps/hub-electron/src/tests/api-server.test.ts` for movement reports, delete-to-disable behavior, and captain stock adjustment with Manager PIN.

Verification run:

- `pnpm --filter @gaurav-pos/hub-electron typecheck`
- `pnpm --filter @gaurav-pos/hub-electron test`
- `pnpm --filter @gaurav-pos/hub-electron build:renderer`

## 2026-05-15 Alcohol Management Review Fixes

- Added `order_items.alcohol_recipe_snapshot_json` through `apps/hub-electron/drizzle/0005_alcohol_recipe_snapshots.sql` and `apps/hub-electron/src/db/drizzle-schema.ts` so cocktail/product recipes are captured on the order line at submit time.
- Updated `OrderService` to snapshot alcohol recipes in `prepareSubmittedItems`, preserve existing snapshots when order lines are later edited, copy snapshots when shifting items between tables, and calculate pending/settled alcohol usage from the snapshot instead of the live `alcohol_recipe_ingredients` table.
- Hardened alcohol catalog edits in `OrderService.updateAlcoholItem` and `replaceAlcoholVariants`: active alcohol items must keep at least one active variant, type changes require variant setup, plain-liquor items cannot keep cocktail recipes, and a variant id cannot be reassigned from another menu item.
- Updated Hub and Mobile waiter menu rendering so alcohol items with no active variants are shown as unavailable instead of falling back to a fake Regular option or submitting an inactive variant.
- Added regression tests in `apps/hub-electron/src/tests/order-service.test.ts` for recipe snapshot settlement/pending stock, stale recipe clearing after type change, active-variant validation, and foreign variant id rejection.

Verification run:

- `pnpm --filter @gaurav-pos/hub-electron typecheck`
- `pnpm --filter @gaurav-pos/hub-electron test`
- `pnpm --filter @gaurav-pos/mobile typecheck`
- `pnpm --filter @gaurav-pos/mobile test`
- `pnpm --filter @gaurav-pos/shared typecheck`
- `pnpm --filter @gaurav-pos/shared test`
- `pnpm --filter @gaurav-pos/hub-electron build:renderer`

## 2026-05-15 Alcohol Review Follow-Up Fixes

- Fixed liquor deletion safety after recipe snapshotting. `OrderService.removeMenuItem` now checks `order_items.alcohol_recipe_snapshot_json` for references to a liquor before hard-deleting alcohol stock/profile rows, so unpaid cocktail orders can still settle correctly even if the live recipe was edited afterward.
- Added server-side validation for prepared alcohol products: they must use exactly one `default` variant with `inventoryAction: "none"` and no volume. This prevents API callers from creating cocktails that deduct both their own bottle/shot inventory and recipe ingredients.
- Added regression coverage in `apps/hub-electron/src/tests/order-service.test.ts` for snapshot-referenced liquor deletion and prepared-product stock-affecting variant rejection.

Verification run:

- `pnpm --filter @gaurav-pos/hub-electron typecheck`
- `pnpm --filter @gaurav-pos/hub-electron test`

## 2026-05-14 Alcohol Review Follow-Up Fixes

- Fixed bill revision so menu item variants are preserved in revision payloads from the Hub UI, including existing alcohol lines and newly added revision items. Variant selectors in the bill revision add row now show prices before adding.
- Fixed `OrderService.reviseBill` quantity handling: revisions now treat submitted quantities as the desired final quantity instead of adding them on top of the previous quantity.
- Allowed bill revision to keep an inactive variant only when that variant was already present on the existing order, preserving historical alcohol bottle/shot lines after setup edits.
- Prevented hard-deleting a liquor that is still referenced by cocktail/product recipes; it now disables the item and keeps recipe rows intact.
- Removed alcohol items and the Alcohol sale group from the generic Setup/Dishes editor so alcohol setup only happens in the dedicated Alcohol section.
- Fixed plain-liquor creation so entering `0` in an unused variant price field does not send an invalid active zero-price variant.
- Added regression tests for recipe-linked delete behavior and alcohol variant preservation through printed-bill revision and settlement.

Verification run:

- `pnpm --filter @gaurav-pos/hub-electron typecheck`
- `pnpm --filter @gaurav-pos/hub-electron test`
- `pnpm --filter @gaurav-pos/hub-electron build:renderer`

## 2026-05-15 Order Snapshot Merge Fix

- Fixed `OrderService.applyOrderItemDiff` in `apps/hub-electron/src/domain/order-service.ts` so newly submitted menu items only merge into an existing open order line when the full sellable snapshot still matches. The comparison includes display name, variant label/volume, inventory action, alcohol recipe snapshot, unit price, production routing, sale group, ticket label, tax JSON, and open-item status.
- When the same menu item/variant is added again after a price or cocktail recipe change, the service now creates a separate order item row instead of increasing the old row quantity and accidentally applying the old recipe or overwriting historical pricing metadata.
- Added regression coverage in `apps/hub-electron/src/tests/order-service.test.ts` for normal menu item price changes and cocktail recipe changes before a second add. The cocktail test verifies unpaid pending stock uses both snapshots and settlement deducts the combined 30 ml + 90 ml from large-bottle stock.

Verification run:

- `pnpm --filter @gaurav-pos/hub-electron typecheck`
- `pnpm --filter @gaurav-pos/hub-electron test`

## 2026-05-15 Price Flow Hardening

- Audited price snapshot flows across Hub service, Hub UI, and Mobile after the alcohol variant work. Menu-item clients submit item/variant ids; authoritative prices are still taken and snapshotted by the Hub service at submit time, while open items carry their explicit open price.
- Fixed bill revision in `OrderService.reviseBill`: when an existing printed bill line is submitted with its `orderItemId`, the service now preserves that line's original price, display name, variant snapshot, recipe snapshot, tax JSON, sale group, and production routing unless the request explicitly edits price/routing. This prevents a catalog price change from repricing an old bill during a quantity-only revision.
- Fixed selected item shifting in `OrderService.moveOrderItems`: moved items now merge into an existing target-table row only when the full source and target snapshots match. If the target has an older price/recipe snapshot, the moved item is inserted as a separate row with its original values.
- Added regression tests in `apps/hub-electron/src/tests/order-service.test.ts` for printed-bill revision after a catalog price change and item transfer into a table with an older price snapshot.

Verification run:

- `pnpm --filter @gaurav-pos/hub-electron typecheck`
- `pnpm --filter @gaurav-pos/hub-electron test`
- `pnpm --filter @gaurav-pos/mobile typecheck`
- `pnpm --filter @gaurav-pos/mobile test`
