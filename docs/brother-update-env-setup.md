# Brother Restaurant Update Env Setup

Use this before asking your brother to update the live POS.

Goal: the cloud must be ready to issue/verify licenses, the admin dashboard must be reachable only by you, and the new Hub build must be able to verify the signed license lease offline.

Do not update the live restaurant PC until every item in the final checklist is done.

## What Goes Where

There are three separate env surfaces:

1. Convex backend envs  
   Stores the private signing key and platform-admin allowlist.

2. Cloud admin app envs  
   Lets the Next.js admin dashboard connect to Convex.

3. Hub app envs  
   Stores only machine/runtime basics such as host/port. The paid-build public verifier key and strict lock flag are baked into the Hub build, not loaded from `hub.env`.

Never put the private key on the restaurant PC, Android app, GitHub release, or Vercel frontend envs.

## Generate License Signing Keys

Generate one RSA keypair for production licenses:

```bash
mkdir -p .agent/secrets
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out .agent/secrets/pos-license-private.pem
openssl rsa -in .agent/secrets/pos-license-private.pem -pubout -out .agent/secrets/pos-license-public.pem
```

Keep `.agent/secrets/pos-license-private.pem` private. It is gitignored by default through `.agent/`.

Turn the PEMs into escaped single-line values for env tools that do not handle multiline input well:

```bash
python3 - <<'PY'
from pathlib import Path
for name in ["private", "public"]:
    text = Path(f".agent/secrets/pos-license-{name}.pem").read_text()
    print(f"POS_LICENSE_{name.upper()}_KEY_PEM=" + text.replace("\n", "\\n"))
PY
```

## Convex Backend Envs

Required in Convex:

```text
PLATFORM_ADMIN_EMAILS=your-google-email@example.com
# Use this only if Convex auth does not expose email for your WorkOS token.
PLATFORM_ADMIN_TOKEN_IDENTIFIERS=https://api.workos.com/...|...
POS_LICENSE_PRIVATE_KEY_PEM=<private key PEM, escaped with \n>
POS_LICENSE_KEY_ID=prod-2026-05
```

Rules:

- `PLATFORM_ADMIN_EMAILS` is comma-separated if you add more admins later.
- `PLATFORM_ADMIN_TOKEN_IDENTIFIERS` is optional. Add it only if the admin UI says the signed-in account is not allowlisted and shows a token identifier instead of an email.
- `POS_LICENSE_PRIVATE_KEY_PEM` is only for Convex.
- `POS_LICENSE_KEY_ID` can be any stable label. Change it when rotating keys.
- Do not set `POS_LICENSE_ALLOW_DEV_SIGNATURES` in production.
- Do not set `POS_LICENSE_DEV_SIGNING_SECRET` in production.

Recommended using Convex CLI:

```bash
pnpm exec convex env set PLATFORM_ADMIN_EMAILS "your-google-email@example.com"
# Optional fallback if WorkOS/Convex does not expose email:
# pnpm exec convex env set PLATFORM_ADMIN_TOKEN_IDENTIFIERS "token-identifier-shown-in-admin-ui"
cat > .agent/secrets/convex-license.env <<'EOF'
POS_LICENSE_KEY_ID=prod-2026-05
POS_LICENSE_PRIVATE_KEY_PEM=<private key PEM escaped with \n>
EOF
pnpm exec convex env set --from-file .agent/secrets/convex-license.env --force
```

Then deploy/codegen as usual:

```bash
pnpm exec convex codegen
```

If license creation fails with `POS_LICENSE_PRIVATE_KEY_PEM must be configured before issuing licenses`, stop. The backend signing env is not ready.

## Cloud Admin App Envs

Required for the cloud admin Next.js app:

```text
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

If this app is deployed on Vercel, set it there. If running locally, put it in the local env file used by the app.

The admin dashboard itself does not need the private signing key. It calls Convex functions, and Convex signs leases.

Before using admin:

```bash
pnpm --filter @gaurav-pos/cloud-admin build
```

Open the dashboard and confirm your Google account can see the command center. Any non-allowlisted account should be blocked.

## Hub Build License Settings

For paid Hub builds, these are build-time constants in:

```text
apps/hub-electron/src/license-build-config.ts
```

Current paid defaults:

```text
BUILD_LICENSE_REQUIRED=true
BUILD_LICENSE_PUBLIC_KEY_PEM=<public verifier key>
```

Do not put the private key in the hub build, `hub.env`, Android app, or admin frontend.

Recommended runtime defaults for the Windows hub:

```text
HUB_HOST=0.0.0.0
HUB_PORT=3737
```

Normal paid activation is:

```text
Hub Setup -> enter Cloud URL + setup key -> Activate license
```

The hub stores the returned `installationId`, `syncSecret`, and signed lease in local SQLite settings.

## Where To Put Hub Envs On Windows

For a live installed Windows hub, the app reads env fallback files from these locations:

```text
C:\ProgramData\Gaurav POS Hub\hub.env
%APPDATA%\Gaurav POS Hub\hub.env
```

For the paid update, create or update `C:\ProgramData\Gaurav POS Hub\hub.env` before launching the new build:

```text
HUB_HOST=0.0.0.0
HUB_PORT=3737
```

Do not add license keys to this file. The public key and strict mode are already in the paid app build.

## Brother Restaurant License Setup

In the cloud admin command center:

1. Create or select the brother restaurant.
2. Create a setup key.
3. For lifetime-ish access, use a very large month count, for example `6000` months.
4. Copy the setup key once and store it safely.
5. Keep the restaurant active and unsuspended.

On the brother hub after installing/updating:

1. Open Hub.
2. Go to Setup.
3. Confirm Manager PIN and Master PIN still work.
4. Enter the Cloud URL.
5. Enter the setup key.
6. Click Activate license.
7. Confirm license status is active.
8. Let the app sit online long enough for backup sync to start.

The update should not require manually pasting `POS_INSTALLATION_ID` or `POS_SYNC_SECRET`.

## Pre-Update Safety Checklist

Before asking him to update:

- [ ] Convex has `PLATFORM_ADMIN_EMAILS`, or `PLATFORM_ADMIN_TOKEN_IDENTIFIERS` if Convex auth does not expose email.
- [ ] Convex has `POS_LICENSE_PRIVATE_KEY_PEM`.
- [ ] Convex has `POS_LICENSE_KEY_ID`.
- [ ] Convex does not have production dev-signing envs enabled.
- [ ] Cloud admin has `NEXT_PUBLIC_CONVEX_URL`.
- [ ] Cloud admin build passes.
- [ ] Hub build has `BUILD_LICENSE_PUBLIC_KEY_PEM`.
- [ ] Hub build has `BUILD_LICENSE_REQUIRED=true`.
- [ ] A brother restaurant exists in admin.
- [ ] A long-validity setup key exists for brother.
- [ ] You have tested activation on a non-live test hub first.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass before packaging.
- [ ] Windows release was built and validated using `docs/release-build-workflow.md`.

## Test Activation Before Live Update

Use a test hub database, not the live brother database.

Expected behavior:

- Without a license, paid build service APIs return locked/missing-license errors.
- Setup/license screens still open.
- Valid setup key activates once.
- Reusing the same setup key fails.
- License status becomes active.
- `/sync/bootstrap` includes active license state.
- Backup sync starts pushing restorable rows.
- Admin can see activation and backup health.

## What To Do If Live Update Opens Locked

Do not wipe the local database.

Check in this order:

1. Is the PC online?
2. Is the installed Hub build the paid build with `BUILD_LICENSE_PUBLIC_KEY_PEM` and `BUILD_LICENSE_REQUIRED=true` in `apps/hub-electron/src/license-build-config.ts`?
3. Are there no accidental dev-signature envs in the runtime environment?
4. Is the Cloud URL correct?
5. Is the setup key unused and not expired?
6. Is the restaurant activation suspended, reset, or revoked in admin?
7. Did Convex sign with the same keypair whose public key is on the hub?

If the hub was activated on the wrong PC, reset the activation in admin and issue a replacement setup key.

## Env Reference

| Env | Location | Required | Notes |
| --- | --- | --- | --- |
| `PLATFORM_ADMIN_EMAILS` | Convex | Yes | Comma-separated Google admin emails. |
| `PLATFORM_ADMIN_TOKEN_IDENTIFIERS` | Convex | Optional fallback | Use only when Convex auth lacks email; copy the token identifier shown in the admin access screen. |
| `POS_LICENSE_PRIVATE_KEY_PEM` | Convex | Yes | Private RSA key. Never ship to clients. |
| `POS_LICENSE_KEY_ID` | Convex | Recommended | Label for current signing key. |
| `NEXT_PUBLIC_CONVEX_URL` | Cloud admin | Yes | Convex client URL ending in `.convex.cloud`. |
| `BUILD_LICENSE_PUBLIC_KEY_PEM` | Hub build | Yes for paid build | Public RSA key matching Convex private key. |
| `BUILD_LICENSE_REQUIRED` | Hub build | Yes for paid build | Set to `true` so missing license locks service APIs. |
| `HUB_HOST` | Hub | Recommended | Usually `0.0.0.0`. |
| `HUB_PORT` | Hub | Recommended | Usually `3737`. |
| `CONVEX_HTTP_URL` | Hub | Optional fallback | Setup key activation should save this locally. |
| `POS_INSTALLATION_ID` | Hub | Optional fallback | Do not use for normal setup. |
| `POS_SYNC_SECRET` | Hub | Optional fallback | Do not use for normal setup. |
| `POS_LICENSE_ALLOW_DEV_SIGNATURES` | Dev only | No in production | Allows dev signatures only when explicitly set to `1`. |
| `POS_LICENSE_DEV_SIGNING_SECRET` | Dev only | No in production | Must match signer/verifier for dev signatures. |

## Hard No List

Do not:

- put `POS_LICENSE_PRIVATE_KEY_PEM` in the hub app,
- send the private key over WhatsApp,
- enable `POS_LICENSE_ALLOW_DEV_SIGNATURES` for a paid build,
- update the live PC before creating the brother setup key,
- manually wipe SQLite because activation failed,
- reuse a setup key after it has activated one hub,
- publish a same-version update package over the currently installed version.




Yes. Here’s the practical flow.

**For Brother Update**
1. Keep existing Convex restaurant record:
   `sky` is his restaurant. Do not delete it.

2. Open cloud admin command center with your allowlisted Google account.

3. Select `sky`.

4. If `sky` has no active activation:
   click/create **Replacement setup key** for `6000` months if you want lifetime-ish.

5. If `sky` already has an activation from a test/wrong PC:
   click **Reset hub**, then create a replacement setup key.

6. Save/copy the setup key when shown. It is reveal-once; later only suffix remains.

7. Update his app by built-in updater or replacing exe.
   His local SQLite DB stays where it is. This does not wipe orders/reports.

8. When the new app opens:
   it may show license required/missing.
   Setup/license screens should still be accessible after local PIN unlock.

9. In Hub Setup:
   enter Cloud URL + setup key, then activate.

10. After activation:
   hub receives `installationId`, `syncSecret`, signed lease, and stores them in local SQLite settings.
   Then normal 60s soft sync starts backing up historical rows to cloud.

**For New Restaurant**
1. Open cloud admin.
2. Use **Create license**.
3. Enter restaurant name, timezone, months, hub label.
4. It creates the restaurant + setup key.
5. Give customer:
   Cloud URL + setup key.
6. They install app.
7. First run:
   create/unlock Manager PIN, enter Cloud URL + setup key, activate.
8. After activation:
   one hub is bound to that restaurant. If PC changes later, you reset activation in admin and issue replacement key.

**About Existing Convex Data**
- Keep `restaurants.sky`. That is useful and should become his license/backup identity.
- `memberships` was for the older restaurant-owner/admin portal. The new platform command center uses your platform admin allowlist instead. One membership row is tiny and harmless; we can leave it unless you want a pure cleanup.
- Old `syncedEvents`, `dailyReports`, `dailyReportBills`, `dailyReportItems`, `dailyReportGroups`, old command tables/code are no longer used or written by the app.
- From app/backend side, those old tables are removed from schema/code now. New backups go into `backupRows` / `backupManifests`.

For actual old storage cleanup: if Convex dashboard still shows those old tables/data, delete only the deprecated tables, not `restaurants`, `license*`, `installations`, `backupRows`, or `backupManifests`. The deprecated old data is not needed for reports anymore because reports come from local SQLite and cloud restore rebuilds local snapshots.