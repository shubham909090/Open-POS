# Cloud Sync Installations

The hub now identifies itself to Convex with a restaurant installation id.

## Hub Envs

```bash
CONVEX_HTTP_URL=<convex http url>
POS_INSTALLATION_ID=<stable id for this restaurant hub>
POS_SYNC_SECRET=<per-installation sync secret>
```

`POS_SYNC_SECRET` is sent as the installation secret. Cloud sync requires both `POS_INSTALLATION_ID` and `POS_SYNC_SECRET`; the cloud uses them to resolve the restaurant instead of trusting event payloads.

## Convex Tables

- `installations`: maps `installationId` to `restaurantId` and installation secret.
- `hubCommands`: ordered cloud-to-hub command stream.
- `syncedEvents`: local hub events uploaded to cloud with the restaurant id resolved from the installation.

Installation registration is an owner-only cloud action. If an installation id already belongs to one restaurant, it cannot be reused to claim another restaurant.

## Supported Cloud Commands

- `device.revoked`
- `device.updated`
- `production_unit.upsert`
- `menu_item.upsert`
- `menu_item.disabled`
- `receipt_printer.updated`

The hub pulls commands from `/pos/pull-hub-snapshot`, applies known command types locally, and stores the last cursor in `hub_settings.cloud_snapshot_cursor`.

## Bootstrap

Use `sync.registerInstallation` from Convex dashboard/dev tooling after creating the restaurant:

```ts
await convex.mutation(api.sync.registerInstallation, {
  restaurantId,
  installationId: "brothers-restaurant-main-hub",
  syncSecret: "<long random secret>"
});
```

Then put the same `installationId` and `syncSecret` into the Windows hub env.
