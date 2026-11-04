# Payment QR and print sizing

The hub stores one payment QR for the restaurant in `hub_settings`, shared by
both bill printers and paired staff devices. Customer bills include it above
the footer; KOTs and BOTs do not. New prints and reprints use the current QR.
Previously queued jobs and printed copies retain their original QR.

In **Settings → Payment QR**, upload a reusable PNG/JPG UPI QR (up to 2 MB),
download the current PNG, or remove it. The recipient is shared; in
**Printers & receipts**, each bill printer has its own 20–45 mm QR size and
optional roll-width override. New overrides inherit the existing global size,
32 mm by default. The hub decodes and regenerates the image, retaining the
payment payload and merchant fields. Fixed-amount and unreadable QRs are
rejected. Printed modules use whole dots and keep a white quiet zone; dense
codes may print larger than the chosen size and narrower rolls limit the width.
Codes too dense for the supported narrowest roll are rejected.

All paired roles can open **Show payment QR** in the mobile app. Captain/admin
devices can manage it. Uploading, replacing and removing require the
Master PIN, including on the hub. The Manager PIN does not authorize changes.
Android supports downloading to a selected folder and sharing the PNG.
The payment screen reloads on opening and foregrounding, listens for changes,
and polls while visible. It hides the QR when disconnected or a refresh fails.
Conflicting changes from another device are rejected so a stale edit
cannot restore an old recipient. Payment confirmation remains manual.

## Compatibility and rollout

- No database migration is required. QR data is an additional setting and is
  included in normal database backups.
- Existing Small/Normal/Large values, bold and alignment are preserved.
  A section only gains the optional `sizeLevel` field when its 0–10 slider is
  adjusted. Old queued print directives remain supported.
- The hub handles receipt formatting; existing mobile order/billing APIs are
  unchanged. Update the hub before installing the new mobile build to use QR.
- Mobile requires a new native build for its image picker and download/share
  modules. Hub Windows releases still use the native Windows build workflow.
  Native printer binaries and DLLs are unpacked from Electron's archive.
- Test a bill on the actual printer and scan its QR before using it in service.
  Check the recipient in the receiving payment app when changing accounts.
