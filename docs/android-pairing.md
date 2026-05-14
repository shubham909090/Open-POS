# Android Pairing Runbook

Use this when adding a captain, waiter, kitchen, or admin device to the restaurant LAN.

## Before Pairing

- The Windows hub must be running on the restaurant LAN.
- The Android device must be on the same Wi-Fi/LAN as the hub.
- The hub should be opened with an admin token on the Setup screen.
- Set `HUB_PUBLIC_URL` on the hub to the Windows PC LAN URL, for example `http://192.168.1.20:3737`. Without this, a QR created while browsing `localhost` may point the phone at its own localhost.

## Pair With QR

1. Open the hub Setup screen.
2. In Step 5, enter the device name and role.
3. Click `Create Code`.
4. The hub shows a QR code and a six-digit code.
5. Open the Android app.
6. Tap `Scan`.
7. Scan the QR code from the hub screen.
8. Confirm pairing.

The QR contains the hub URL, pairing code, device name, role, and expiry. After pairing, the Android app stores the local device token and can work on LAN without internet.

## Pair Without Camera

If camera permission is unavailable:

1. Copy the QR payload text from the hub.
2. Paste it into the Android app's QR payload field.
3. Tap `Pair`.

If copying the payload is awkward:

1. Manually type the hub URL in the Android app.
2. Type the six-digit pairing code.
3. Tap `Pair`.

## Operational Notes

- Pairing codes expire after 10 minutes.
- A pairing code can be used once.
- Revoke lost devices from hub Setup.
- Captain devices can take orders, send KOT/BOT, view running table checks, shift a full running table, shift selected items, run billing/payment actions, view the current-day summary, and receive kitchen/bar ready alerts.
- Waiter devices can take orders and view running checks, but cannot shift tables/items.
- Kitchen devices can open the KDS screen and mark KOT/BOT tickets queued, preparing, ready, served, or cancelled.
- Admin/captain devices are trusted devices. They can see bill/payment details and run billing/report/print workflows.
- Full historical reports and setup stay on the hub/cloud admin screens.
- The hub decides permissions from the paired device token. The phone app cannot give itself a stronger role by changing local text or request fields.
- Keep the hub on the restaurant LAN only. Do not expose the hub port to the public internet.
