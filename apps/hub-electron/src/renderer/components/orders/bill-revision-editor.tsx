import { formatInr, searchMenuItems } from "@gaurav-pos/shared";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { hubApi, type MenuItem, type TableOrder } from "../../hub-api.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { useKeyboardListNavigation } from "../../hooks/use-keyboard-list-navigation.js";
import { useOperationKeys } from "../../hooks/use-operation-keys.js";
import { menuItemVariantOptions, messageOf, type NoticeSetter } from "../../lib/format.js";
import { LineItems } from "./line-items.js";

type RevisionItem = {
  key: string;
  orderItemId?: string;
  menuItemId?: string;
  menuItemVariantId?: string;
  openName?: string;
  pricePaise: number;
  saleGroupId: string;
  productionUnitId?: string | null;
  name: string;
  quantity: number;
};

function BillRevisionEditor({
  tableOrder,
  menuItems,
  existingPaid,
  onSettled,
  setNotice,
  requestManagerApproval,
  onEditingChange,
}: {
  tableOrder: TableOrder;
  menuItems: MenuItem[];
  existingPaid: number;
  onSettled: () => Promise<void>;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (open) { wasEditing.current = true; return; }
    if (!wasEditing.current) return;
    wasEditing.current = false;
    const frame = window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  const [items, setItems] = useState<RevisionItem[]>([]);
  const searchId = useId();
  const [search, setSearch] = useState("");
  const operationKeys = useOperationKeys();
  const pendingScopes = useRef<Record<string, unknown>>({});
  const bill = tableOrder.bill;
  const searchItems = searchMenuItems(menuItems, search);
  const searchOptions = searchItems.flatMap((item) => menuItemVariantOptions(item).map((variant) => ({ item, variant })));
  const searchItemIds = searchOptions.map(({ item, variant }) => `${item.id}-${variant.id ?? "default"}`).join("|");

  const reviseBill = useMutation({
    mutationFn: async () => {
      if (!bill) throw new Error("Generate the bill first.");
      const revisedItems = items
        .filter((item) => item.quantity > 0)
        .map((item) =>
          item.menuItemId
            ? { orderItemId: item.orderItemId, menuItemId: item.menuItemId, menuItemVariantId: item.menuItemVariantId, quantity: item.quantity }
            : {
                orderItemId: item.orderItemId,
                openName: item.openName ?? item.name,
                openPricePaise: item.pricePaise,
                saleGroupId: item.saleGroupId,
                productionUnitId: item.productionUnitId ?? null,
                quantity: item.quantity
              }
        );
      if (revisedItems.length === 0) throw new Error("A revised bill needs at least one item.");
      const approval = await requestManagerApproval({
        title: "Approve revised bill",
        defaultReason: "Bill revised",
        confirmLabel: "Save revised bill",
        danger: true
      }).catch(() => null);
      if (!approval) return null;
      const payload = { items: revisedItems, managerApproval: approval };
      const scope = { billId: bill.id, payload };
      pendingScopes.current["bill-revise"] = scope;
      return hubApi.reviseBill(bill.id, payload, operationKeys.keyFor("bill-revise", scope));
    },
    onSuccess: async (result) => {
      if (!result) return;
      if (pendingScopes.current["bill-revise"]) operationKeys.clear("bill-revise", pendingScopes.current["bill-revise"]);
      setOpen(false);
      onEditingChange?.(false);
      await onSettled();
      setNotice({ tone: "good", text: "Bill revised and totals refreshed." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) })
  });

  function openEditor() {
    const rows = (tableOrder.items ?? [])
      .filter((item) => item.status !== "cancelled" && item.quantity > 0)
      .map((item) => ({
        key: item.id,
        orderItemId: item.id,
        menuItemId: item.menu_item_id ?? undefined,
        menuItemVariantId: item.menu_item_variant_id ?? undefined,
        openName: item.menu_item_id ? undefined : item.name_snapshot,
        pricePaise: item.unit_price_paise,
        saleGroupId: item.sale_group_id,
        productionUnitId: item.production_unit_id,
        name: item.name_snapshot,
        quantity: item.quantity
      }));
    setItems(rows);
    setOpen(true);
    onEditingChange?.(true);
  }

  function changeQty(key: string, delta: number) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
  }

  const addMenuItemLine = useCallback((item: MenuItem, requestedVariantId?: string) => {
    const variants = menuItemVariantOptions(item);
    const variant = variants.find((entry) => (entry.id ?? "") === (requestedVariantId ?? "")) ?? variants[0];
    const variantId = variant?.id;
    const lineName = variant && variant.kind !== "default" ? `${item.name} ${variant.label}` : item.name;
    setItems((current) => {
      const existing = current.find((row) => row.menuItemId === item.id && (row.menuItemVariantId ?? "") === (variantId ?? ""));
      if (existing) return current.map((row) => row.key === existing.key ? { ...row, quantity: row.quantity + 1 } : row);
      return [
        ...current,
        {
          key: `new-${item.id}-${variantId ?? "default"}`,
          menuItemId: item.id,
          menuItemVariantId: variantId,
          pricePaise: variant?.price_paise ?? item.price_paise,
          saleGroupId: item.sale_group_id,
          productionUnitId: item.production_unit_id,
          name: lineName,
          quantity: 1
        }
      ];
    });
  }, []);

  const addKeyboardItem = useCallback(({ item, variant }: typeof searchOptions[number]) => {
    addMenuItemLine(item, variant.id);
  }, [addMenuItemLine]);
  const keyboard = useKeyboardListNavigation({
    items: searchOptions,
    enabled: Boolean(open && search.trim()),
    resetKey: `${search}|${searchItemIds}`,
    onCommit: addKeyboardItem
  });

  if (!bill) return null;

  if (!open) {
    return (
      <button ref={triggerRef} type="button" className="secondary-button revision-trigger" title={bill.is_nc ? "NC bills cannot be revised here" : existingPaid > 0 ? "Bills with recorded payments cannot be revised here" : undefined} disabled={Boolean(bill.is_nc) || existingPaid > 0} onClick={openEditor}>
        Revise printed bill
      </button>
    );
  }

  return (
    <div className="revision-box">
      <div className="revision-head">
        <strong>Revise bill items</strong>
        <button type="button" className="secondary-button" onClick={() => { setOpen(false); onEditingChange?.(false); }}>Cancel</button>
      </div>
      <div className="revision-add-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={keyboard.onKeyDown}
          placeholder="Search dish to add" autoFocus
          role="combobox" aria-expanded={Boolean(search.trim())} aria-controls={searchId}
          aria-activedescendant={search.trim() && searchOptions.length ? `${searchId}-${keyboard.activeIndex}` : undefined}
          aria-autocomplete="list" aria-label="Search dishes for bill revision"
        />
      </div>
      {search.trim() ? <div id={searchId} role="listbox" aria-label="Dishes to add" className="revision-search-results">
        {searchOptions.map((option, index) => <button
          key={`${option.item.id}-${option.variant.id ?? "default"}`}
          id={`${searchId}-${index}`} role="option" aria-selected={keyboard.activeIndex === index}
          ref={(element) => keyboard.setItemElement(index, element)} type="button"
          className={`revision-search-result${keyboard.activeIndex === index ? " keyboard-active" : ""}`}
          onPointerMove={(event) => keyboard.onPointerMove(index, event)} onClick={() => addKeyboardItem(option)}
        ><span><strong>{option.item.name}{option.variant.kind !== "default" ? ` · ${option.variant.label}` : ""}</strong><small>{option.item.sale_group_name ?? "Menu item"}</small></span><b>{formatInr(option.variant.price_paise)}</b></button>)}
        {!searchOptions.length ? <p className="plain-state">No dishes found</p> : null}
      </div> : null}
      <LineItems
        emptyTitle="No bill items"
        emptyText="Add at least one item before saving the revised bill."
        rows={items.map((item) => ({
          id: item.key,
          title: item.name,
          meta: `${formatInr(item.pricePaise)} each`,
          quantity: item.quantity,
          amount: item.pricePaise * item.quantity,
          onMinus: () => changeQty(item.key, -1),
          onPlus: () => changeQty(item.key, 1)
        }))}
      />
      <div className="revision-actions"><div><span>Revised items total</span><strong>{formatInr(items.reduce((total, item) => total + item.quantity * item.pricePaise, 0))}</strong></div><button
        type="button"
        className="primary-button"
        disabled={reviseBill.isPending || items.every((item) => item.quantity <= 0)}
        onClick={() => reviseBill.mutate()}
      >
        {reviseBill.isPending ? "Saving revision..." : "Save revised bill"}
      </button></div>
    </div>
  );
}

export { BillRevisionEditor };
