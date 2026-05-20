import { formatInr, searchMenuItems } from "@gaurav-pos/shared";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hubApi, type Bootstrap, type MenuItem } from "../../hub-api.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";
import { useKeyboardListNavigation } from "../../hooks/use-keyboard-list-navigation.js";
import { useOperationKeys } from "../../hooks/use-operation-keys.js";
import { type DraftItem, useHubStore } from "../../store.js";
import { LineItems } from "./line-items.js";
import { CategoryBadge, getMenuActionVariants, MenuItemActionGroup } from "./menu-card.js";

type PrintMode = "kot" | "kot_print";

export function NewOrderPanel({
  tableId,
  bootstrap,
  draft,
  setNotice,
  refreshTable,
}: {
  tableId: string;
  bootstrap: Bootstrap;
  draft: DraftItem[];
  setNotice: NoticeSetter;
  refreshTable: () => Promise<void>;
}) {
  const setOrderPanel = useHubStore((state) => state.setOrderPanel);
  const addDraftItem = useHubStore((state) => state.addDraftItem);
  const addOpenDraftItem = useHubStore((state) => state.addOpenDraftItem);
  const changeDraftQty = useHubStore((state) => state.changeDraftQty);
  const setDraftItemNote = useHubStore((state) => state.setDraftItemNote);
  const clearDraft = useHubStore((state) => state.clearDraft);
  const [guests, setGuests] = useState("2");
  const [openName, setOpenName] = useState("");
  const [openPrice, setOpenPrice] = useState("");
  const [openGroup, setOpenGroup] = useState("sg-food");
  const [openUnit, setOpenUnit] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const draftSearchInputRef = useRef<HTMLInputElement | null>(null);
  const operationKeys = useOperationKeys();
  const menuById = useMemo(() => new Map(bootstrap.menuItems.map((item) => [item.id, item])), [bootstrap.menuItems]);
  const saleGroupById = useMemo(() => new Map(bootstrap.saleGroups.map((group) => [group.id, group])), [bootstrap.saleGroups]);
  const draftTotal = draft.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
  const draftMatches = searchMenuItems(bootstrap.menuItems, draftSearch, {}).slice(0, 8);
  const draftMatchIds = draftMatches.map((item) => item.id).join("|");
  const addKeyboardDraftItem = useCallback(
    (item: MenuItem) => {
      const variant = getMenuActionVariants(item)[0];
      if (!variant) return;
      addDraftItem(tableId, item, variant.id || undefined);
      setDraftSearch("");
    },
    [addDraftItem, tableId]
  );
  const draftKeyboard = useKeyboardListNavigation({
    items: draftMatches,
    enabled: Boolean(draftSearch.trim()),
    resetKey: `${draftSearch}|${draftMatchIds}`,
    onCommit: addKeyboardDraftItem
  });

  const submitOrder = useMutation({
    mutationFn: (printMode: PrintMode) => {
      if (draft.length === 0) throw new Error("Add at least one new dish before sending KOT.");
      const payload = {
        tableId,
        pax: Number(guests || 1),
        printMode,
        items: draft.map((item) =>
          item.openName
            ? {
                openName: item.openName,
                openPricePaise: item.pricePaise,
                saleGroupId: item.saleGroupId ?? "sg-food",
                productionUnitId: item.productionUnitId ?? null,
                quantity: item.quantity,
                note: item.note?.trim() || undefined
              }
            : { menuItemId: item.menuItemId, menuItemVariantId: item.menuItemVariantId, quantity: item.quantity, note: item.note?.trim() || undefined }
        )
      };
      return hubApi.submitOrder(payload, operationKeys.keyFor("orders-submit", payload));
    },
    onSuccess: async (_result, printMode) => {
      clearDraft(tableId);
      await refreshTable();
      setOrderPanel("sent");
      setNotice({
        tone: "good",
        text: printMode === "kot" ? "KOT saved. New item list is clear now." : "Print and KOT sent. New item list is clear now."
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });
  const canSendDraft = draft.length > 0 && !submitOrder.isPending;

  useEffect(() => {
    if (!canSendDraft) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "F3") {
        event.preventDefault();
        submitOrder.mutate("kot");
      }
      if (event.key === "F6") {
        event.preventDefault();
        submitOrder.mutate("kot_print");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canSendDraft, submitOrder]);

  useEffect(() => {
    draftSearchInputRef.current?.focus();
  }, []);

  const sendDraft = (printMode: PrintMode) => {
    if (!canSendDraft) return;
    submitOrder.mutate(printMode);
  };

  return (
    <div className="ticket-section">
      <div className="guest-row">
        <label className="guest-count-field">
          Guests
          <input value={guests} onChange={(event) => setGuests(event.target.value)} inputMode="numeric" />
        </label>
        <div className="send-action-row">
          <button type="button" aria-label="KOT F3" disabled={!canSendDraft} onClick={() => sendDraft("kot")}>
            <span>KOT</span>
            <kbd>F3</kbd>
          </button>
          <button type="button" aria-label="Print and KOT F6" disabled={!canSendDraft} onClick={() => sendDraft("kot_print")}>
            <span>{submitOrder.isPending ? "Sending..." : "Print and KOT"}</span>
            <kbd>F6</kbd>
          </button>
        </div>
      </div>
      <section className="state-editor draft-menu-search">
        <div className="state-editor-head">
          <div className="state-editor-total">
            <small>New order</small>
            <strong>{formatInr(draftTotal)}</strong>
          </div>
          <span className="state-editor-status">{draft.length} {draft.length === 1 ? "item" : "items"}</span>
        </div>
        <div className="state-search">
          <label className="state-search-field">
            <span>Add dish</span>
            <input
              ref={draftSearchInputRef}
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              onKeyDown={draftKeyboard.onKeyDown}
              placeholder="Search menu item"
            />
          </label>
          {draftSearch.trim() ? (
            <div className="state-search-results">
              {draftMatches.map((item, index) => {
                const variants = getMenuActionVariants(item);
                return (
                  <div
                    key={item.id}
                    className={`state-search-row menu-card compact-menu-card category-${item.sale_group_kind ?? "other"}${draftKeyboard.activeIndex === index ? " keyboard-active" : ""}`}
                    onMouseEnter={() => draftKeyboard.setActiveIndex(index)}
                  >
                    <CategoryBadge kind={item.sale_group_kind} className="state-search-icon" />
                    <div className="menu-card-main">
                      <strong>{item.name}</strong>
                      <span>{item.sale_group_name ?? item.production_unit_name ?? "Menu item"}</span>
                    </div>
                    <footer>
                      <MenuItemActionGroup
                        itemName={item.name}
                        variants={variants}
                        onAdd={(variantId) => {
                          addDraftItem(tableId, item, variantId);
                          setDraftSearch("");
                        }}
                        className="state-search-actions"
                      />
                    </footer>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
      <form
        className="open-item-form"
        onSubmit={(event) => {
          event.preventDefault();
          const pricePaise = Math.round(Number(openPrice || 0) * 100);
          if (!openName.trim() || pricePaise <= 0) {
            setNotice({ tone: "bad", text: "Enter open item name and price." });
            return;
          }
          addOpenDraftItem(tableId, {
            name: openName.trim(),
            pricePaise,
            saleGroupId: openGroup,
            saleGroupName: saleGroupById.get(openGroup)?.name,
            saleGroupKind: saleGroupById.get(openGroup)?.kind,
            productionUnitId: openUnit || null
          });
          setOpenName("");
          setOpenPrice("");
        }}
      >
        <label>
          Open item
          <input value={openName} onChange={(event) => setOpenName(event.target.value)} placeholder="Open food / bar item" />
        </label>
        <label>
          Price
          <input value={openPrice} onChange={(event) => setOpenPrice(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          Group
          <select value={openGroup} onChange={(event) => setOpenGroup(event.target.value)}>
            {bootstrap.saleGroups.filter((group) => group.active).map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>
        <label>
          Print to
          <select value={openUnit} onChange={(event) => setOpenUnit(event.target.value)}>
            <option value="">Group default / no KOT</option>
            {bootstrap.productionUnits.filter((unit) => unit.active).map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </select>
        </label>
        <button type="submit">Add open item</button>
      </form>
      <LineItems
        emptyTitle="No new dishes selected"
        emptyText="Tap dishes from the menu. This list is only new items not sent yet."
        rows={draft.map((item) => ({
          id: item.lineKey,
          title: item.variantLabel ? `${item.name} ${item.variantLabel}` : item.name,
          meta: `${formatInr(item.pricePaise)} each`,
          saleGroupKind: item.saleGroupKind ?? menuById.get(item.menuItemId)?.sale_group_kind ?? saleGroupById.get(item.saleGroupId ?? "")?.kind,
          saleGroupName: item.saleGroupName ?? menuById.get(item.menuItemId)?.sale_group_name ?? saleGroupById.get(item.saleGroupId ?? "")?.name,
          quantity: item.quantity,
          amount: item.pricePaise * item.quantity,
          onMinus: () => changeDraftQty(tableId, item.lineKey, -1),
          onPlus: () => changeDraftQty(tableId, item.lineKey, 1),
          note: item.note ?? "",
          onNoteChange: (note) => setDraftItemNote(tableId, item.lineKey, note)
        }))}
      />
    </div>
  );
}
