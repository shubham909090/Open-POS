import { useState, type Dispatch, type SetStateAction } from "react";
import type { OrderItemInput } from "@gaurav-pos/shared";

import { clearDraft, loadDraft, saveDraft } from "../lib/draft-store";
import { normalisePax } from "../lib/mobile-format";
import type { ConnectionState, ViewMode } from "../lib/mobile-types";
import type { HubOrder } from "../lib/hub-client";

type UseOrderDraftInput = {
  connection: ConnectionState;
  loadTableOrder: (tableId: string) => Promise<void>;
  setCurrentOrder: Dispatch<SetStateAction<HubOrder | null>>;
  setMode: Dispatch<SetStateAction<ViewMode>>;
  setMessage: Dispatch<SetStateAction<string>>;
};

export function useOrderDraft({
  connection,
  loadTableOrder,
  setCurrentOrder,
  setMode,
  setMessage,
}: UseOrderDraftInput) {
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [pax, setPax] = useState("2");
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);

  async function selectTable(tableId: string) {
    setSelectedTableId(tableId);
    setMode("menu");
    setCurrentOrder(null);
    const draft = await loadDraft(tableId);
    setItems(draft?.items ?? []);
    if (draft) {
      setPax(String(draft.pax));
      setMessage("Draft restored for this table.");
    }
    if (connection === "online") await loadTableOrder(tableId);
  }

  async function persistDraft(nextItems = items, nextPax = pax) {
    if (!selectedTableId) return;
    setSavingDraft(true);
    await saveDraft({
      tableId: selectedTableId,
      pax: normalisePax(nextPax),
      items: nextItems,
      updatedAt: new Date().toISOString()
    });
    setSavingDraft(false);
  }

  function addItem(menuItemId: string, menuItemVariantId?: string) {
    if (!selectedTableId) {
      setMessage("Choose a table before adding dishes.");
      setMode("tables");
      return;
    }
    const current = items.find((item) => item.menuItemId === menuItemId && item.menuItemVariantId === menuItemVariantId);
    const next = current
      ? items.map((item) => (item.menuItemId === menuItemId && item.menuItemVariantId === menuItemVariantId ? { ...item, quantity: item.quantity + 1 } : item))
      : [...items, { menuItemId, menuItemVariantId, quantity: 1 }];
    setItems(next);
    void persistDraft(next);
  }

  function changeQty(index: number, delta: number) {
    const next = items
      .map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
      .filter((item) => item.quantity > 0);
    setItems(next);
    void persistDraft(next);
  }

  function changeItemNote(index: number, note: string) {
    const next = items.map((item, itemIndex) => (itemIndex === index ? { ...item, note } : item));
    setItems(next);
    void persistDraft(next);
  }

  async function clearSelectedTableDraft() {
    if (!selectedTableId) return;
    await clearDraft(selectedTableId);
    setItems([]);
  }

  return {
    selectedTableId,
    setSelectedTableId,
    pax,
    setPax,
    items,
    savingDraft,
    selectTable,
    persistDraft,
    addItem,
    changeQty,
    changeItemNote,
    clearSelectedTableDraft,
  };
}
