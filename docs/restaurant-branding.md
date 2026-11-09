# Restaurant branding

Available in Hub 0.1.27 / Android 0.1.17.

- **Hub:** Settings → General → upload a PNG/JPG, then **Adjust icon**. Move and zoom the image inside the circle. **Use icon** stages it; **Save identity** requires the Master PIN.
- **Android:** Settings → Restaurant → **Adjust icon**. Move, resize or pinch the native crop frame, then **Use crop**. Save with the Master PIN. Replace and Remove share one aligned row.
- **Cancel** keeps the previous framing. **Reset** restores the whole image. Cropping the icon preserves the full receipt artwork.
- **Bills:** Settings → Printers & receipts → Edit a printer. Choose automatic or custom logo width in millimetres. Print quality offers solid/detailed rendering and ink density. Each printer keeps its own settings. Kitchen tickets do not include branding.
- **Print visibility:** Ticket layout has independent name, logo and QR checkboxes. Turning one off preserves its saved content. Use logo only, name only or both. The restaurant name can also be blank.
- **Fallback:** the restaurant name and its initial replace missing artwork.

Windows window and existing installation shortcuts use the restaurant icon. Windows may cache shortcut artwork. Android provides **Add to home screen** for a restaurant shortcut, which follows later branding changes. Android controls its small application badge; the primary installed launcher icon is embedded in the APK.

Older settings and databases remain supported without a schema migration. Re-upload the original PNG if the previous saved logo had already lost detail. Thermal printing is monochrome and limited by the printer’s physical dot resolution.
