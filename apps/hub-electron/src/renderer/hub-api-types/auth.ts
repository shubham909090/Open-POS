export type Role = "admin" | "captain" | "waiter" | "kitchen";

export interface LocalDevice {
  id: string;
  name: string;
  role: Role;
  status: "active" | "revoked" | string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

export interface PairingCodeResult {
  id: string;
  code: string;
  expiresAt: string;
  qrDataUrl: string;
  pairingPayloadText: string;
}

export interface ManagerApprovalPayload {
  managerApproval: { pin: string; reason: string; approvedBy: string };
}

export interface MasterApprovalPayload {
  masterApproval: { pin: string; reason: string; approvedBy: string };
}
