import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { formatPosDateTime } from "@gaurav-pos/shared";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import {
  hubApi,
  type LocalDevice,
  type PairingCodeResult,
  type Role,
} from "../../hub-api.js";
import { SetupCard } from "./setup-card.js";
import { EmptyState } from "../ui/empty-state.js";

const roleOptions: Array<{
  role: Role;
  title: string;
  description: string;
  permissions: string;
}> = [
  {
    role: "captain",
    title: "Captain",
    description: "Senior service phone",
    permissions: "orders, billing, payments, table transfers",
  },
  {
    role: "waiter",
    title: "Waiter",
    description: "Order-taking phone",
    permissions: "tables, menu, KOT submit",
  },
  {
    role: "kitchen",
    title: "Kitchen",
    description: "Kitchen display screen",
    permissions: "enabled KDS counters and ticket status",
  },
];

export function DevicePairingCard({
  devices,
  loading,
  setNotice,
  requestManagerApproval,
  onChanged,
}: {
  devices: LocalDevice[];
  loading: boolean;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onChanged: () => Promise<void>;
}) {
  const [deviceName, setDeviceName] = useState("");
  const [role, setRole] = useState<Role>("waiter");
  const [pairing, setPairing] = useState<PairingCodeResult | null>(null);

  const activeDevices = devices.filter(
    (device) => device.id !== "device-local-admin" && device.status !== "revoked",
  );

  const createPairing = useMutation({
    mutationFn: async () => {
      const managerApproval = await requestManagerApproval({
        title: "Approve Device Pairing",
        message:
          role === "captain"
            ? "Captain phones can bill, settle payments, and shift running tables. Only create this QR when the phone is in front of you."
            : "This creates a one-time QR code that lets a phone join this hub.",
        defaultReason: `Pair ${deviceName.trim() || `${role} device`}`,
        confirmLabel: "Create QR",
      });
      return hubApi.createPairingCode({
        deviceName: deviceName.trim() || `${role} device`,
        role,
        expiresInMinutes: 10,
        managerApproval,
      });
    },
    onSuccess: async (result) => {
      setPairing(result);
      setNotice({
        tone: "good",
        text: "QR code created. Scan it from the phone app within 10 minutes.",
      });
      await onChanged();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const revoke = useMutation({
    mutationFn: hubApi.revokeDevice,
    onSuccess: async () => {
      setNotice({ tone: "good", text: "Device revoked." });
      await onChanged();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  return (
    <SetupCard
      title="Pair Phones And Devices"
      done={activeDevices.length > 0}
      icon={<QrCode size={20} />}
      summary={`${activeDevices.length} paired devices`}
    >
      <p className="pairing-copy">
        Create a QR for each phone or kitchen screen. Open the Android app,
        choose pair by QR, and scan this code.
      </p>
      <div className="role-card-grid">
        {roleOptions.map((option) => (
          <button
            key={option.role}
            type="button"
            className={`role-card ${role === option.role ? "active" : ""}`}
            onClick={() => setRole(option.role)}
          >
            <strong>{option.title}</strong>
            <span>{option.description}</span>
            <small>{option.permissions}</small>
          </button>
        ))}
      </div>
      <form
        className="pairing-form"
        onSubmit={(event) => {
          event.preventDefault();
          createPairing.mutate();
        }}
      >
        <label>
          Device name
          <input
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            placeholder="Waiter phone 1"
          />
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {roleOptions.map((option) => (
              <option key={option.role} value={option.role}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={createPairing.isPending}>
          {createPairing.isPending ? "Creating..." : "Create QR code"}
        </button>
      </form>
      {pairing ? (
        <section className="pairing-card">
          <div className="pairing-qr-panel">
            <img src={pairing.qrDataUrl} alt="Device pairing QR code" />
            <div className="pairing-code">
              <strong>Code {pairing.code}</strong>
              <span>Expires {formatPosDateTime(pairing.expiresAt)}</span>
            </div>
          </div>
          <div className="pairing-payload-panel">
            <div>
              <strong>Manual pairing payload</strong>
              <span>Use only if QR scanning is unavailable.</span>
            </div>
            <textarea readOnly value={pairing.pairingPayloadText} />
          </div>
        </section>
      ) : null}
      <div className="record-list">
        {loading ? (
          <p className="text-sm text-muted">Loading paired devices...</p>
        ) : null}
        {!loading && activeDevices.length === 0 ? (
          <EmptyState
            title="No phones paired yet"
            description="Create a QR code above, then scan it from the Android app."
          />
        ) : null}
        {activeDevices.map((device) => (
          <article key={device.id} className="record-row">
            <div>
              <strong>{device.name}</strong>
              <span>
                {device.role} · {device.status}
                {device.last_seen_at
                  ? ` · seen ${formatPosDateTime(device.last_seen_at)}`
                  : ""}
              </span>
            </div>
            <button
              type="button"
              className="danger-button"
              onClick={() => revoke.mutate(device.id)}
              disabled={revoke.isPending}
            >
              Revoke
            </button>
          </article>
        ))}
      </div>
    </SetupCard>
  );
}
