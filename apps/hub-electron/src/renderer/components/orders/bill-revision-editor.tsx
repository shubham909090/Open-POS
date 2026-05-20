import { formatInr, searchMenuItems } from "@gaurav-pos/shared";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
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
  requestManagerApproval
}: {
  tableOrder: TableOrder;
  menuItems: MenuItem[];
  existingPaid: number;
  onSettled: () => Promise<void>;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [addMenuItemId, setAddMenuItemId] = useState("");
  const [addVariantId, setAddVariantId] = useState("");
  const [search, setSearch] = useState("");
  const operationKeys = useOperationKeys();
  const pendingScopes = useRef<Record<string, unknown>>({});
  const bill = tableOrder.bill;
  const addMenuItem = menuItems.find((menuItem) => menuItem.id === addMenuItemId);
  const addVariants = menuItemVariantOptions(addMenuItem);
  const searchItems = searchMenuItems(menuItems, search);
  const searchItemIds = searchItems.map((item) => item.id).join("|");

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

  function addSelectedDish() {
    if (!addMenuItem) return;
    addMenuItemLine(addMenuItem, addVariantId);
  }

  const addKeyboardItem = useCallback(
    (item: MenuItem) => {
      const variantId = menuItemVariantOptions(item)[0]?.id ?? "";
      setAddMenuItemId(item.id);
      setAddVariantId(variantId);
      addMenuItemLine(item, variantId);
    },
    [addMenuItemLine]
  );
  const keyboard = useKeyboardListNavigation({
    items: searchItems,
    enabled: Boolean(open && search.trim()),
    resetKey: `${search}|${searchItemIds}`,
    onCommit: addKeyboardItem
  });

  if (!bill) return null;

  if (!open) {
    return (
      <button type="button" className="secondary-button" disabled={Boolean(bill.is_nc) || existingPaid > 0} onClick={openEditor}>
        Revise printed bill
      </button>
    );
  }

  return (
    <div className="revision-box">
      <div className="revision-head">
        <strong>Revise bill items</strong>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <div className="revision-add-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={keyboard.onKeyDown}
          placeholder="Search dish to add"
        />
        <select
          value={addMenuItemId}
          onChange={(event) => {
            const nextItemId = event.target.value;
            const nextItem = menuItems.find((item) => item.id === nextItemId);
            const nextVariants = menuItemVariantOptions(nextItem);
            setAddMenuItemId(nextItemId);
            setAddVariantId(nextVariants[0]?.id ?? "");
          }}
        >
          <option value="">Add dish</option>
          {searchItems.map((item) => (
            <option key={item.id} value={item.id}>{item.name} · {formatInr(item.price_paise)}</option>
          ))}
        </select>
        {addVariants.length > 1 ? (
          <select value={addVariantId} onChange={(event) => setAddVariantId(event.target.value)}>
            {addVariants.map((variant) => (
              <option key={variant.id ?? "default"} value={variant.id ?? ""}>
                {variant.kind === "default" ? "Regular" : variant.label} · {formatInr(variant.price_paise)}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" disabled={!addMenuItemId} onClick={addSelectedDish}>Add</button>
      </div>
      {search.trim() && searchItems.length ? (
        <div className="revision-search-results">
          {searchItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`revision-search-result${keyboard.activeIndex === index ? " keyboard-active" : ""}`}
              onMouseEnter={() => keyboard.setActiveIndex(index)}
              onClick={() => addKeyboardItem(item)}
            >
              <span>
                <strong>{item.name}</strong>
                <small>{item.sale_group_name ?? item.production_unit_name ?? "Menu item"}</small>
              </span>
              <b>{formatInr(menuItemVariantOptions(item)[0]?.price_paise ?? item.price_paise)}</b>
            </button>
          ))}
        </div>
      ) : null}
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
      <button
        type="button"
        className="secondary-button"
        disabled={reviseBill.isPending || items.every((item) => item.quantity <= 0)}
        onClick={() => reviseBill.mutate()}
      >
        {reviseBill.isPending ? "Saving revision..." : "Save revised bill"}
      </button>
    </div>
  );
}

export { BillRevisionEditor };
