import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OrderItemInput } from "@gaurav-pos/shared";

const HUB_URL_KEY = "gaurav-pos:hub-url";
const DEVICE_TOKEN_KEY = "gaurav-pos:device-token";
const DRAFT_PREFIX = "gaurav-pos:draft:";

export interface DraftOrder {
  tableId: string;
  pax: number;
  items: OrderItemInput[];
  updatedAt: string;
}

export async function getHubUrl(): Promise<string> {
  return (await AsyncStorage.getItem(HUB_URL_KEY)) ?? "http://192.168.1.10:3737";
}

export async function setHubUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(HUB_URL_KEY, url.trim().replace(/\/+$/, ""));
}

export async function getDeviceToken(): Promise<string> {
  return (await AsyncStorage.getItem(DEVICE_TOKEN_KEY)) ?? "";
}

export async function setDeviceToken(token: string): Promise<void> {
  await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token.trim());
}

// A table's earlier slow write must never overwrite a newer edit or resurrect
// a draft after Send. Other tables remain independent.
const draftWrites = new Map<string, Promise<void>>();
function writeTableDraft(tableId: string, write: () => Promise<void>): Promise<void> {
  const previous = draftWrites.get(tableId);
  const pending = previous ? previous.catch(() => undefined).then(write) : write();
  draftWrites.set(tableId, pending);
  const release = () => { if (draftWrites.get(tableId) === pending) draftWrites.delete(tableId); };
  void pending.then(release, release);
  return pending;
}

export async function loadDraft(tableId: string): Promise<DraftOrder | null> {
  await draftWrites.get(tableId);
  const raw = await AsyncStorage.getItem(`${DRAFT_PREFIX}${tableId}`);
  return raw ? (JSON.parse(raw) as DraftOrder) : null;
}

export function saveDraft(draft: DraftOrder): Promise<void> {
  const value = JSON.stringify({ ...draft, updatedAt: new Date().toISOString() });
  return writeTableDraft(draft.tableId, () => AsyncStorage.setItem(`${DRAFT_PREFIX}${draft.tableId}`, value));
}

export function clearDraft(tableId: string): Promise<void> {
  return writeTableDraft(tableId, () => AsyncStorage.removeItem(`${DRAFT_PREFIX}${tableId}`));
}
