import { type ReactNode, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hubApi, type BillPrinterSlot, type MenuItem } from "../../hub-api.js";
import { useKeyboardListNavigation } from "../../hooks/use-keyboard-list-navigation.js";
import { BillPrinterChooser } from "../orders/bill-printer-chooser.js";
import { PAYMENT_METHODS, ReportHistoryEditModal, type HistoryEditItem, type HistoryPaymentMethod } from "./report-history-edit-modal.js";
import { ReportHistoryTable, type HistoryBill } from "./report-history-table.js";

const DETAIL_PAGE_SIZE = 6;

function ReportHistoryPanel({
  bills,
  hasBillSummaries,
  billHistoryPlaceholder
}: {
  bills: HistoryBill[];
  hasBillSummaries: boolean;
  billHistoryPlaceholder?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [billLimit, setBillLimit] = useState(DETAIL_PAGE_SIZE);
  const [editingBill, setEditingBill] = useState<HistoryBill | null>(null);
  const [editItems, setEditItems] = useState<HistoryEditItem[]>([]);
  const [editDiscountType, setEditDiscountType] = useState<"amount" | "percent">("amount");
  const [editDiscount, setEditDiscount] = useState("0");
  const [editTip, setEditTip] = useState("0");
  const [editPayments, setEditPayments] = useState<Record<HistoryPaymentMethod, string>>({ cash: "0", upi: "0", card: "0", online: "0" });
  const [editPaymentReference, setEditPaymentReference] = useState("");
  const [search, setSearch] = useState("");
  const [masterPin, setMasterPin] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [historyPrintBillId, setHistoryPrintBillId] = useState<string | null>(null);
  const [historyEditPrintBill, setHistoryEditPrintBill] = useState<HistoryBill | null>(null);
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: hubApi.bootstrap });
  const historyReprint = useMutation({
    mutationFn: (input: { billId: string; printerSlot: BillPrinterSlot }) =>
      hubApi.historyReprintBill(input.billId, `history-reprint-${input.billId}-${Date.now()}`, input.printerSlot)
  });
  const historyEdit = useMutation({
    mutationFn: (input: { bill: HistoryBill; printerSlot: BillPrinterSlot }) =>
      hubApi.historyEditBill(
        input.bill.billId,
        {
          masterApproval: { pin: masterPin, reason: "Owner history edit", approvedBy: "owner" },
          discountType: editDiscountType,
          discountValue: editDiscountType === "percent" ? Number(editDiscount || 0) : Math.round(Number(editDiscount || 0) * 100),
          tipPaise: Math.round(Number(editTip || 0) * 100),
          payments: input.bill.isNc
            ? undefined
            : PAYMENT_METHODS
                .map((method) => ({ method, amountPaise: Math.round(Number(editPayments[method] || 0) * 100), reference: editPaymentReference.trim() || undefined }))
                .filter((payment) => payment.amountPaise > 0),
          items: editItems
            .filter((item) => item.quantity > 0)
            .map((item) =>
              item.menuItemId
                ? {
                    orderItemId: item.orderItemId,
                    menuItemId: item.menuItemId,
                    menuItemVariantId: item.menuItemVariantId ?? undefined,
                    quantity: item.quantity,
                  }
                : {
                    orderItemId: item.orderItemId,
                    openName: item.name,
                    openPricePaise: item.unitPricePaise,
                    saleGroupId: item.saleGroupId ?? "sg-food",
                    productionUnitId: item.productionUnitId ?? null,
                    quantity: item.quantity,
                  }
            ),
        },
        `history-edit-${input.bill.billId}-${Date.now()}`,
        input.printerSlot
      ),
    onSuccess: async () => {
      setEditingBill(null);
      setEditItems([]);
      setSearch("");
      setMasterPin("");
      setEditPayments({ cash: "0", upi: "0", card: "0", online: "0" });
      setEditPaymentReference("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["currentBusinessDaySummary"] }),
        queryClient.invalidateQueries({ queryKey: ["dailyReports"] }),
        queryClient.invalidateQueries({ queryKey: ["dailyReport"] }),
        queryClient.invalidateQueries({ queryKey: ["rangeReport"] }),
      ]);
    },
    onError: (error) => setEditError(error instanceof Error ? error.message : "Could not edit history bill."),
  });
  const menuItems = bootstrap.data?.menuItems.filter((item) => item.active) ?? [];
  const searchedMenu = search.trim()
    ? menuItems.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];
  const searchedMenuIds = searchedMenu.map((item) => item.id).join("|");
  const editTotal = editItems.reduce((total, item) => total + Math.max(0, item.quantity) * item.unitPricePaise, 0);
  const editDiscountPaise = editDiscountType === "percent" ? Math.round((editTotal * Math.min(100, Number(editDiscount || 0))) / 100) : Math.round(Number(editDiscount || 0) * 100);
  const editTipPaise = Math.round(Number(editTip || 0) * 100);
  const editFinalTotal = Math.max(0, editTotal - editDiscountPaise + editTipPaise);
  const editPaymentTotalPaise = PAYMENT_METHODS.reduce((total, method) => total + Math.round(Number(editPayments[method] || 0) * 100), 0);
  const editPaymentRemainingPaise = Math.max(0, editFinalTotal - editPaymentTotalPaise);
  const editPaymentOverPaise = Math.max(0, editPaymentTotalPaise - editFinalTotal);
  const historyPaymentExact = Boolean(editingBill?.isNc) || editPaymentTotalPaise === editFinalTotal;
  const canSaveEdit = Boolean(editingBill && masterPin.trim().length >= 4 && editItems.some((item) => item.quantity > 0) && historyPaymentExact && !historyEdit.isPending);

  const openHistoryEdit = (bill: HistoryBill) => {
    setEditingBill(bill);
    setEditError(null);
    setMasterPin("");
    setSearch("");
    setEditDiscountType("amount");
    setEditDiscount(String((bill.discountPaise ?? 0) / 100));
    setEditTip(String((bill.tipPaise ?? 0) / 100));
    const nextPayments: Record<HistoryPaymentMethod, string> = { cash: "0", upi: "0", card: "0", online: "0" };
    for (const payment of bill.payments ?? []) {
      if (PAYMENT_METHODS.includes(payment.method as HistoryPaymentMethod)) {
        const method = payment.method as HistoryPaymentMethod;
        nextPayments[method] = String((Number(nextPayments[method] || 0) * 100 + payment.amountPaise) / 100);
      }
    }
    setEditPayments(nextPayments);
    setEditPaymentReference(bill.payments?.find((payment) => payment.reference)?.reference ?? "");
    setEditItems(
      (bill.items ?? []).map((item, index) => ({
        key: item.orderItemId ?? `${bill.billId}-${index}`,
        orderItemId: item.orderItemId,
        menuItemId: item.menuItemId,
        menuItemVariantId: item.menuItemVariantId,
        saleGroupId: item.saleGroupId,
        productionUnitId: item.productionUnitId,
        name: item.name,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
      }))
    );
  };

  const updateEditQty = (key: string, delta: number) => {
    setEditItems((current) =>
      current
        .map((item) => (item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.orderItemId || item.quantity > 0)
    );
  };

  const addMenuItem = useCallback((item: MenuItem, variant?: NonNullable<MenuItem["variants"]>[number]) => {
    const variantId = variant?.id ?? item.variants?.find((candidate) => candidate.kind === "default" && candidate.active)?.id ?? undefined;
    const price = variant?.price_paise ?? item.variants?.find((candidate) => candidate.id === variantId)?.price_paise ?? item.price_paise;
    const name = variant && variant.kind !== "default" ? `${item.name} ${variant.label}` : item.name;
    const existingKey = `new-${item.id}-${variantId ?? "default"}`;
    setEditItems((current) => {
      const existing = current.find((entry) => entry.key === existingKey || (!entry.orderItemId && entry.menuItemId === item.id && entry.menuItemVariantId === variantId));
      if (existing) return current.map((entry) => (entry === existing ? { ...entry, quantity: entry.quantity + 1 } : entry));
      return [
        ...current,
        {
          key: existingKey,
          menuItemId: item.id,
          menuItemVariantId: variantId,
          saleGroupId: item.sale_group_id,
          productionUnitId: item.production_unit_id,
          name,
          quantity: 1,
          unitPricePaise: price,
        },
      ];
    });
  }, []);

  const addKeyboardHistoryItem = useCallback(
    (item: MenuItem) => {
      const variant = (item.variants ?? []).find((candidate) => Boolean(candidate.active) && candidate.kind !== "default");
      addMenuItem(item, variant);
    },
    [addMenuItem]
  );
  const historySearchKeyboard = useKeyboardListNavigation({
    items: searchedMenu,
    enabled: Boolean(search.trim()),
    resetKey: `${search}|${searchedMenuIds}`,
    onCommit: addKeyboardHistoryItem
  });

  const fillHistoryPaymentFull = (method: HistoryPaymentMethod) => {
    setEditPayments({ cash: "0", upi: "0", card: "0", online: "0", [method]: String(editFinalTotal / 100) });
  };
  const fillHistoryPaymentRemaining = (method: HistoryPaymentMethod) => {
    setEditPayments((current) => {
      const otherTotal = PAYMENT_METHODS
        .filter((candidate) => candidate !== method)
        .reduce((total, candidate) => total + Math.round(Number(current[candidate] || 0) * 100), 0);
      return { ...current, [method]: String(Math.max(0, editFinalTotal - otherTotal) / 100) };
    });
  };
  const fillHistoryPaymentRemainingOnFocus = (method: HistoryPaymentMethod) => {
    setEditPayments((current) => {
      if (Number(current[method] || 0) > 0) return current;
      const otherTotal = PAYMENT_METHODS
        .filter((candidate) => candidate !== method)
        .reduce((total, candidate) => total + Math.round(Number(current[candidate] || 0) * 100), 0);
      if (otherTotal <= 0) return current;
      return { ...current, [method]: String(Math.max(0, editFinalTotal - otherTotal) / 100) };
    });
  };

  return (
    <>
      <ReportHistoryTable
        bills={bills}
        billLimit={billLimit}
        hasBillSummaries={hasBillSummaries}
        billHistoryPlaceholder={billHistoryPlaceholder}
        reprintPending={historyReprint.isPending}
        onLoadMore={() => setBillLimit((limit) => limit + DETAIL_PAGE_SIZE)}
        onPrint={setHistoryPrintBillId}
        onEdit={openHistoryEdit}
      />

      {editingBill ? (
        <ReportHistoryEditModal
          bill={editingBill}
          editItems={editItems}
          editDiscountType={editDiscountType}
          editDiscount={editDiscount}
          editTip={editTip}
          editPayments={editPayments}
          editPaymentReference={editPaymentReference}
          search={search}
          masterPin={masterPin}
          editError={editError}
          searchedMenu={searchedMenu}
          historySearchKeyboard={historySearchKeyboard}
          editTotal={editTotal}
          editDiscountPaise={editDiscountPaise}
          editTipPaise={editTipPaise}
          editFinalTotal={editFinalTotal}
          editPaymentTotalPaise={editPaymentTotalPaise}
          editPaymentRemainingPaise={editPaymentRemainingPaise}
          editPaymentOverPaise={editPaymentOverPaise}
          historyPaymentExact={historyPaymentExact}
          canSaveEdit={canSaveEdit}
          historyEditPending={historyEdit.isPending}
          setEditDiscountType={setEditDiscountType}
          setEditDiscount={setEditDiscount}
          setEditTip={setEditTip}
          setEditPayments={setEditPayments}
          setEditPaymentReference={setEditPaymentReference}
          setSearch={setSearch}
          setMasterPin={setMasterPin}
          onClose={() => setEditingBill(null)}
          onSavePrint={() => setHistoryEditPrintBill(editingBill)}
          updateEditQty={updateEditQty}
          addMenuItem={addMenuItem}
          fillHistoryPaymentFull={fillHistoryPaymentFull}
          fillHistoryPaymentRemaining={fillHistoryPaymentRemaining}
          fillHistoryPaymentRemainingOnFocus={fillHistoryPaymentRemainingOnFocus}
        />
      ) : null}

      <BillPrinterChooser
        open={Boolean(historyPrintBillId)}
        title="Print bill where?"
        busy={historyReprint.isPending}
        onClose={() => setHistoryPrintBillId(null)}
        onChoose={(printerSlot) => {
          if (!historyPrintBillId) return;
          const billId = historyPrintBillId;
          setHistoryPrintBillId(null);
          historyReprint.mutate({ billId, printerSlot });
        }}
      />
      <BillPrinterChooser
        open={Boolean(historyEditPrintBill)}
        title="Print edited bill where?"
        busy={historyEdit.isPending}
        onClose={() => setHistoryEditPrintBill(null)}
        onChoose={(printerSlot) => {
          if (!historyEditPrintBill) return;
          const bill = historyEditPrintBill;
          setHistoryEditPrintBill(null);
          historyEdit.mutate({ bill, printerSlot });
        }}
      />
    </>
  );
}

export { ReportHistoryPanel };
