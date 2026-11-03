import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { PAYMENT_QR_MAX_IMAGE_BYTES, type PaymentQr } from "@gaurav-pos/shared";

import type { HubClient } from "../lib/hub-client";

export type PaymentQrChange = ({ kind: "upload" | "resize"; imageDataUrl: string; sizeMm: number } | { kind: "remove" }) & { expectedUpdatedAt: string | null };

export function usePaymentQr({ client, online, deviceName }: {
  client: HubClient;
  online: boolean;
  deviceName: string;
}) {
  const [qr, setQr] = useState<PaymentQr | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [change, setChange] = useState<PaymentQrChange | null>(null);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const actionBusy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
      request.current?.abort();
    };
  }, []);

  const refresh = useCallback(async (clear = false) => {
    request.current?.abort();
    const version = ++sequence.current;
    if (!online || AppState.currentState === "background") {
      setQr(null);
      setLoading(false);
      setError("Connect to the hub to load the current payment QR.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    if (clear) {
      setQr(null);
      setLoading(true);
      setError("");
    }
    try {
      const result = await client.paymentQr(controller.signal);
      if (!mounted.current || version !== sequence.current) return;
      setQr(result.qr);
      setError("");
    } catch (failure) {
      if (!mounted.current || version !== sequence.current) return;
      setQr(null);
      setError(controller.signal.aborted ? "The hub took too long to respond. Try again." : failure instanceof Error ? failure.message : "Could not load the payment QR.");
    } finally {
      clearTimeout(timeout);
      if (mounted.current && version === sequence.current) setLoading(false);
    }
  }, [client, online]);

  useEffect(() => {
    void refresh(true);
    const poll = setInterval(() => {
      if (!actionBusy.current && AppState.currentState === "active") void refresh();
    }, 10_000);
    const unsubscribe = client.subscribeRealtime((event) => {
      if (event.type === "payment_qr.updated") void refresh(true);
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh(true);
      else {
        sequence.current += 1;
        request.current?.abort();
        setQr(null);
      }
    });
    return () => {
      clearInterval(poll);
      unsubscribe();
      appState.remove();
      sequence.current += 1;
      request.current?.abort();
    };
  }, [client, refresh]);

  async function pickImage() {
    if (actionBusy.current) return;
    setError("");
    setNotice("");
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        allowsMultipleSelection: false,
        base64: true,
        quality: 1
      });
      if (!mounted.current || selected.canceled) return;
      const image = selected.assets[0];
      if (!image) throw new Error("Choose a PNG or JPEG QR image.");
      const file = new File(image.uri);
      const mimeType = image.mimeType ?? file.type;
      if (mimeType !== "image/png" && mimeType !== "image/jpeg") throw new Error("Choose a PNG or JPEG image of the payment QR.");
      if ((image.fileSize ?? file.size) > PAYMENT_QR_MAX_IMAGE_BYTES) throw new Error("Choose a QR image smaller than 2 MB.");
      const base64 = image.base64 ?? await file.base64();
      if (base64.length > Math.ceil(PAYMENT_QR_MAX_IMAGE_BYTES / 3) * 4) throw new Error("Choose a QR image smaller than 2 MB.");
      setChange({ kind: "upload", imageDataUrl: `data:${mimeType};base64,${base64}`, sizeMm: qr?.sizeMm ?? 32, expectedUpdatedAt: qr?.updatedAt ?? null });
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Could not open the photo picker.");
    }
  }

  async function saveChange(pin: string) {
    if (!change || actionBusy.current) return;
    if (!online) {
      setError("Connect to the hub before changing the payment QR.");
      return;
    }
    actionBusy.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    request.current?.abort();
    sequence.current += 1;
    setLoading(false);
    const approval = { masterApproval: {
      pin,
      reason: change.kind === "remove" ? "Remove shared payment QR" : change.kind === "resize" ? "Change payment QR print size" : "Update shared payment QR",
      approvedBy: deviceName || "Master PIN holder"
    } };
    try {
      const result = change.kind === "remove"
        ? await client.removePaymentQr(approval, change.expectedUpdatedAt)
        : await client.updatePaymentQr(change.imageDataUrl, approval, change.sizeMm, change.expectedUpdatedAt);
      if (!mounted.current) return;
      sequence.current += 1;
      request.current?.abort();
      setQr(result.qr);
      setLoading(false);
      setChange(null);
      setNotice(result.qr ? "Payment QR updated for all bill printers and staff." : "Payment QR removed from bills and staff devices.");
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Could not update the payment QR.");
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function exportImage(download = false) {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      // Recheck the destination before exporting, just as when opening this screen.
      const latest = await client.paymentQr(controller.signal);
      clearTimeout(timeout);
      if (!mounted.current) return;
      setQr(latest.qr);
      if (!latest.qr) throw new Error("The payment QR has been removed. Ask the owner to upload one.");
      const fileName = `payment-qr-${Date.parse(latest.qr.updatedAt)}.png`;
      const imageBase64 = latest.qr.imageDataUrl.replace(/^data:image\/png;base64,/, "");
      if (download) {
        const directory = await Directory.pickDirectoryAsync();
        const file = directory.createFile(fileName, "image/png");
        file.write(imageBase64, { encoding: "base64" });
        if (mounted.current) setNotice("Payment QR image saved to your selected folder.");
        return;
      }
      if (!await Sharing.isAvailableAsync()) throw new Error("Saving and sharing images is unavailable on this device.");
      const file = new File(Paths.cache, fileName);
      file.write(imageBase64, { encoding: "base64" });
      await Sharing.shareAsync(file.uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Save or share payment QR" });
    } catch (failure) {
      if (mounted.current) {
        const message = failure instanceof Error ? failure.message : "Could not save the payment QR.";
        if (!/cancel/i.test(message)) {
          setQr(null);
          setError(message);
        }
      }
    } finally {
      clearTimeout(timeout);
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return { qr, loading, busy, error, notice, change, setChange, refresh, pickImage, saveChange, exportImage };
}
