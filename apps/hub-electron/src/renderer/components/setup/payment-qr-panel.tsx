import { useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LockKeyhole, QrCode, Upload } from "lucide-react";
import { PAYMENT_QR_MAX_IMAGE_BYTES } from "@gaurav-pos/shared";
import { hubApi } from "../../hub-api.js";
import type {
  ManagerApproval,
  ManagerApprovalRequest,
} from "../../hooks/use-manager-approval.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";
import { SettingsPageActiveContext } from "./setup-card.js";
import { readImageFile } from "../../lib/image-file.js";

export function PaymentQrPanel({
  masterPinConfigured,
  requestManagerApproval,
  setNotice,
}: {
  masterPinConfigured: boolean;
  requestManagerApproval: ManagerApprovalRequest;
  setNotice: NoticeSetter;
}) {
  const queryClient = useQueryClient();
  const active = useContext(SettingsPageActiveContext);
  const current = useQuery({
    queryKey: ["payment-qr"],
    queryFn: hubApi.paymentQr,
    enabled: active,
    refetchInterval: active ? 30_000 : false,
  });
  const [loaded, setLoaded] = useState<typeof current.data>();
  const qr = loaded?.qr;
  const [image, setImage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const originalVersion = useRef<string | null | undefined>(undefined);
  const dirty = useRef(false);
  dirty.current = Boolean(image) || reading;
  useEffect(() => {
    if (!current.data) return;
    const version = current.data.qr?.updatedAt ?? null;
    if (originalVersion.current === version) return;
    if (dirty.current) {
      setConflict(true);
      return;
    }
    originalVersion.current = version;
    setLoaded(current.data);
    setConflict(false);
  }, [current.data]);
  const acceptSaved = (result: NonNullable<typeof current.data>) => {
    dirty.current = false;
    originalVersion.current = result.qr?.updatedAt ?? null;
    setLoaded(result);
    setImage("");
    setConflict(false);
  };
  const discardChanges = () => {
    const latest = current.data ?? loaded;
    if (latest) acceptSaved(latest);
  };
  // Printed size belongs to each bill printer; this panel only shows it.
  const billPrinters = useQuery({ queryKey: ["bill-printers"], queryFn: hubApi.billPrinters, enabled: active });

  const save = useMutation({
    mutationFn: ({
      imageDataUrl,
      size,
      approval,
      version,
    }: {
      imageDataUrl: string;
      size: number;
      approval: ManagerApproval;
      version: string | null;
    }) => hubApi.updatePaymentQr(imageDataUrl, size, approval, version),
    onSuccess: (result) => {
      acceptSaved(result);
      queryClient.setQueryData(["payment-qr"], result);
      setNotice({
        tone: "good",
        text: "Payment QR saved for both bill printers and staff phones.",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const remove = useMutation({
    mutationFn: ({
      approval,
      version,
    }: {
      approval: ManagerApproval;
      version: string | null;
    }) => hubApi.removePaymentQr(approval, version),
    onSuccess: (result) => {
      acceptSaved(result);
      queryClient.setQueryData(["payment-qr"], result);
      setNotice({
        tone: "good",
        text: "Payment QR removed from new bills and staff phones.",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const busy = reading || save.isPending || remove.isPending;
  const changed = Boolean(image);
  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > PAYMENT_QR_MAX_IMAGE_BYTES
    ) {
      setNotice({
        tone: "bad",
        text: "Choose a PNG or JPG payment QR smaller than 2 MB.",
      });
      return;
    }
    setReading(true);
    try {
      const data = await readImageFile(file);
      setImage(data);
    } catch (error) {
      setNotice({ tone: "bad", text: messageOf(error) });
    } finally {
      setReading(false);
    }
  };
  const saveWithApproval = async () => {
    const imageDataUrl = image;
    if (!imageDataUrl || busy || conflict) return;
    const version = originalVersion.current ?? null;
    const approval = await requestManagerApproval({
      title: qr ? "Update payment QR" : "Add payment QR",
      message:
        "This changes the payment QR on all new bills and staff phones for this hub.",
      pinLabel: "Master PIN",
      defaultReason: "Update shared payment QR",
      requireReason: false,
      approvedBy: "master",
      confirmLabel: "Save payment QR",
    }).catch(() => null);
    if (approval)
      save.mutate({
        imageDataUrl,
        // Legacy shared size, kept only as the fallback for printers without their own size.
        size: qr?.sizeMm ?? 32,
        approval,
        version,
      });
  };
  const removeWithApproval = async () => {
    if (!qr || busy || conflict) return;
    const version = originalVersion.current ?? null;
    const approval = await requestManagerApproval({
      title: "Remove payment QR",
      pinLabel: "Master PIN",
      approvedBy: "master",
      message:
        "The QR will disappear from new bills and staff phones. Already printed bills still contain it.",
      defaultReason: "Remove shared payment QR",
      requireReason: false,
      confirmLabel: "Remove QR",
      danger: true,
    }).catch(() => null);
    if (approval) remove.mutate({ approval, version });
  };
  return (
    <section className="payment-qr-panel" aria-labelledby="payment-qr-title">
      <div className="payment-qr-heading">
        <div className="payment-qr-icon">
          <QrCode size={24} />
        </div>
        <div>
          <h3 id="payment-qr-title">Restaurant payment QR</h3>
          <p>
            Customer bills and staff phones share the same payment destination.
          </p>
        </div>
        <span className="payment-qr-lock">
          <LockKeyhole size={13} /> Master PIN to change
        </span>
      </div>
      {current.isPending && !loaded ? (
        <p role="status">Loading payment QR…</p>
      ) : null}
      {current.isError ? (
        <div role="alert">
          <p>{messageOf(current.error)}</p>
          {loaded ? <p>The last saved QR and your changes are still shown.</p> : null}
          <button type="button" className="secondary-button" disabled={current.isFetching} onClick={() => void current.refetch()}>
            {current.isFetching ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : null}
      {loaded ? (
        <div className="payment-qr-content">
          <div className="payment-qr-paper">
            {image || qr ? (
              <img
                src={image || qr?.imageDataUrl}
                alt={image ? "New payment QR preview" : "Current payment QR"}
              />
            ) : (
              <QrCode size={100} strokeWidth={1} aria-hidden="true" />
            )}
            <strong>
              {image
                ? "Ready to upload"
                : qr?.payeeName || (qr ? "Scan to pay" : "Add your payment QR")}
            </strong>
            <small>
              {image
                ? "Save with the Master PIN to apply"
                : qr?.upiId || "Use the QR from your UPI app"}
            </small>
          </div>
          <div className="payment-qr-options">
            {conflict ? <div className="branding-conflict" role="alert"><p>The payment QR changed on another device. Your replacement is still here. Load the current QR before making another change.</p><button type="button" className="secondary-button compact" disabled={busy} onClick={discardChanges}>Load current QR</button></div> : null}
            <p>
              Upload a reusable UPI QR from Google Pay, PhonePe or your bank. We
              prepare a crisp, scannable copy and place it above the bill
              footer.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Upload payment QR image"
              className="sr-only"
              onChange={(event) => {
                void chooseFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="payment-qr-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => fileInput.current?.click()}
                disabled={busy || !masterPinConfigured}
              >
                <Upload size={16} />
                {qr || image ? "Choose replacement" : "Choose QR image"}
              </button>
              {qr && (
                <a
                  className="secondary-button payment-qr-download"
                  href={qr.imageDataUrl}
                  download="payment-qr.png"
                >
                  <Download size={16} /> Download current QR
                </a>
              )}
            </div>
            <small>PNG or JPG · up to 2 MB · no fixed payment amount</small>
            <p className="payment-qr-hint">
              Printed size is set for each bill printer in Printers &amp; receipts
              {billPrinters.data
                ? `: ${billPrinters.data.default.label} ${billPrinters.data.default.paymentQrSizeMm} mm${billPrinters.data.alternate.configured ? `, ${billPrinters.data.alternate.label} ${billPrinters.data.alternate.paymentQrSizeMm} mm` : ""}.`
                : "."}{" "}
              Confirm each payment in your UPI app.
            </p>
            {!masterPinConfigured && (
              <p role="status">
                Set a Master PIN in Administration › Security to upload or change the
                payment QR.
              </p>
            )}
            <div className="payment-qr-actions">
              <button
                type="button"
                disabled={busy || conflict || !changed || !masterPinConfigured}
                onClick={() => void saveWithApproval()}
              >
                {save.isPending ? "Saving…" : "Save payment QR"}
              </button>
              {changed && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={discardChanges}
                >
                  Cancel changes
                </button>
              )}
              {qr && (
                <button
                  type="button"
                  className="payment-qr-remove"
                  disabled={busy || conflict || !masterPinConfigured}
                  onClick={() => void removeWithApproval()}
                >
                  Remove QR
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
