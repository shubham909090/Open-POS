# POS Reference Intake

Reference projects were cloned under `/Users/shubhamtemak/Documents/ExampleRepos` for product and architecture guidance.

## Adopted Patterns

- **URY ERP**: POS opening is required before table operations; KOT lifecycle uses new, modified, partial-cancel, cancelled, and reprint flows; production units route work to separate kitchens/printers; KDS cards show table, waiter, time, items, and comments.
- **MySagra**: menu categories/items map to workstation printers, and order events are broadcast to kitchen/bar stations.
- **Olgax POS**: modern TypeScript organization, offline queue terminology, cash-first checkout, void/refund audit expectations, and simple role model.
- **node-escpos**: Electron/Node can write ESC/POS payloads to network printer adapters; this repo keeps a small TCP adapter first and can swap to a richer ESC/POS driver after hardware testing.

## License Rule

AGPL/MRPL projects are reference material only unless reviewed. MIT code can be reused selectively with attribution, but this implementation currently uses fresh code based on observed behavior.
