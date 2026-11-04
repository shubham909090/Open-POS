import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { OrderItemInput } from "@gaurav-pos/shared";

import { clearDraft, loadDraft, saveDraft } from "../lib/draft-store";
import { normalisePax } from "../lib/mobile-format";
import type { ConnectionState, ViewMode } from "../lib/mobile-types";
import type { HubClient, HubOrder } from "../lib/hub-client";
import { createTableSelection, loadSelectedTableOrder, restoreSelectedDraft } from "../lib/table-selection";

type UseOrderDraftInput = {
  connection: ConnectionState;
  client: HubClient;
  setCurrentOrder: Dispatch<SetStateAction<HubOrder | null>>;
  setMode: Dispatch<SetStateAction<ViewMode>>;
  setMessage: Dispatch<SetStateAction<string>>;
};

/** Informational only: App clears it after a moment so it never pushes the floor down for good. */
export const DRAFT_RESTORED_MESSAGE = "Draft restored for this table.";

export function useOrderDraft({
  connection,
  client,
  setCurrentOrder,
  setMode,
  setMessage,
}: UseOrderDraftInput) {
  const [selectedTableId, setSelectedTableIdState] = useState<string | null>(null);
  const [pax, setPaxState] = useState("2");
  const [items, setItemsState] = useState<OrderItemInput[]>([]);
  // Native taps can arrive before React commits another render. Keep the next
  // edit based on the last accepted edit, including notes and variant identity.
  const latestItems = useRef<OrderItemInput[]>([]);
  const latestPax = useRef("2");
  const writeRevision = useRef(0);
  function setItems(next: OrderItemInput[]) { latestItems.current = next; setItemsState(next); }
  function setPax(next: string) { latestPax.current = next; setPaxState(next); }
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const scope = useRef(createTableSelection(client));
  const hydrating = useRef(false);
  scope.current.setClient(client);
  const renderSelection = scope.current.snapshot();

  useEffect(() => {
    setSelectedTableIdState(null);
    setItems([]);
    setPax("2");
    setCurrentOrder(null);
    setDraftLoading(false);
    hydrating.current = false;
  }, [client]);

  function setSelectedTableId(tableId: string | null) {
    const selection = scope.current.select(tableId);
    setSelectedTableIdState(tableId);
    setSavingDraft(false);
    setItems([]);
    setPax("2");
    setCurrentOrder(null);
    return selection;
  }

  function isCurrentSelection() {
    return scope.current.isCurrent(renderSelection) && scope.current.matches(client, selectedTableId) && !hydrating.current;
  }

  async function loadTableOrder(tableId: string) {
    await loadSelectedTableOrder(scope.current, client, tableId, setCurrentOrder, setMessage);
  }

  async function selectTable(tableId: string) {
    const selection = setSelectedTableId(tableId);
    hydrating.current = true;
    setDraftLoading(true);
    setMode("menu");
    setCurrentOrder(null);
    let restored = false;
    try {
      restored = await restoreSelectedDraft(scope.current, selection, loadDraft, (draft) => {
        setItems(draft?.items ?? []);
        setPax(String(draft?.pax ?? 2));
        setMessage(draft?.items.length ? DRAFT_RESTORED_MESSAGE : "");
      });
    } catch (error) {
      if (scope.current.isCurrent(selection)) setMessage(error instanceof Error ? error.message : "Could not restore this table's draft.");
    } finally {
      if (scope.current.isCurrent(selection)) {
        hydrating.current = false;
        setDraftLoading(false);
      }
    }
    if (restored && connection === "online" && scope.current.isCurrent(selection)) await loadTableOrder(tableId);
  }

  async function persistDraft(nextItems = latestItems.current, nextPax = latestPax.current) {
    if (!isCurrentSelection() || !selectedTableId) return;
    const revision = ++writeRevision.current;
    setSavingDraft(true);
    try {
      await saveDraft({ tableId: selectedTableId, pax: normalisePax(nextPax), items: nextItems, updatedAt: new Date().toISOString() });
    } catch (error) {
      if (isCurrentSelection()) setMessage(error instanceof Error ? error.message : "Could not save the table draft.");
    } finally {
      if (revision === writeRevision.current && isCurrentSelection()) setSavingDraft(false);
    }
  }

  function addItem(menuItemId: string, menuItemVariantId?: string) {
    if (!selectedTableId) {
      setMessage("Choose a table before adding dishes.");
      setMode("tables");
      return;
    }
    if (!isCurrentSelection()) return;
    const current = latestItems.current.find((item) => item.menuItemId === menuItemId && item.menuItemVariantId === menuItemVariantId);
    const next = current
      ? latestItems.current.map((item) => (item.menuItemId === menuItemId && item.menuItemVariantId === menuItemVariantId ? { ...item, quantity: item.quantity + 1 } : item))
      : [...latestItems.current, { menuItemId, menuItemVariantId, quantity: 1 }];
    setItems(next);
    void persistDraft(next);
  }

  function addOpenItem(input: {
    openName: string;
    openPricePaise: number;
    saleGroupId: string;
    productionUnitId?: string | null;
  }): boolean {
    if (!selectedTableId) {
      setMessage("Choose a table before adding an open item.");
      setMode("tables");
      return false;
    }
    if (!isCurrentSelection()) return false;
    const openName = input.openName.trim();
    if (!openName || input.openPricePaise <= 0 || !input.saleGroupId) {
      setMessage("Enter an open item name, price, and group.");
      return false;
    }
    const next = [...latestItems.current, {
      openName,
      openPricePaise: input.openPricePaise,
      saleGroupId: input.saleGroupId,
      ...(input.productionUnitId !== undefined ? { productionUnitId: input.productionUnitId } : {}),
      quantity: 1
    }];
    setItems(next);
    void persistDraft(next);
    setMessage(`${openName} added to the table draft.`);
    return true;
  }

  function changeQty(index: number, delta: number) {
    if (!isCurrentSelection()) return;
    const next = latestItems.current
      .map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
      .filter((item) => item.quantity > 0);
    setItems(next);
    void persistDraft(next);
  }

  function changeItemNote(index: number, note: string) {
    if (!isCurrentSelection()) return;
    const next = latestItems.current.map((item, itemIndex) => (itemIndex === index ? { ...item, note } : item));
    setItems(next);
    void persistDraft(next);
  }

  async function clearSelectedTableDraft() {
    if (!isCurrentSelection() || !selectedTableId) return;
    setItems([]);
    await clearDraft(selectedTableId);
  }

  return {
    selectedTableId: scope.current.matches(client, selectedTableId) ? selectedTableId : null,
    setSelectedTableId,
    pax,
    setPax,
    items: isCurrentSelection() ? items : [],
    savingDraft,
    draftLoading,
    isCurrentSelection,
    loadTableOrder,
    selectTable,
    persistDraft,
    addItem,
    addOpenItem,
    changeQty,
    changeItemNote,
    clearSelectedTableDraft,
  };
}
