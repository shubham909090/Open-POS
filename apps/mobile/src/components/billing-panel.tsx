import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, LayoutAnimation, Pressable, ScrollView, SectionList, Text, TextInput, View } from "react-native";
import { formatPosDateTime, getTableDisplayState, searchMenuItems, tableDisplayLabel, type OrderItemInput, type SaleGroupKind } from "@gaurav-pos/shared";

import type { CurrentDaySummary, DailyReportDetail, DailyReportRow, HubBootstrap, HubOrder, KdsTicket } from "../lib/hub-client";
import { mobileDraftOrderStateSignature, mobileSavedOrderStateSignature } from "../lib/order-state";
import { formatMobileMenuActionLabel } from "../lib/menu-actions";
import { amountInputToPaise, categoryToneFor, findMenuVariant, formatRupees, paiseToRupeeInput } from "../lib/mobile-format";
import type { ConnectionState, MobileOrderStateItem, OrderStateSaveMode, PaymentMethod, PrintMode } from "../lib/mobile-types";
import { palette, styles } from "../styles/app-styles";
import { CollapsibleSection, EmptyState, LabeledMoneyInput, SummaryBox, UncontrolledInput } from "./app-shell";

function CaptainBillingPanel({
  canBill,
  currentOrder,
  currentSummary,
  dailyReports,
  selectedHistoryDayId,
  selectedHistoryDetail,
  hasNewItems,
  sending,
  onGenerateBill,
  onReprintBill,
  onHistoryPrint,
  onSelectHistoryDay,
  onMarkNc,
  onReviseBill,
  onSettleBill
}: {
  canBill: boolean;
  currentOrder: HubOrder | null;
  currentSummary: CurrentDaySummary | null;
  dailyReports: DailyReportRow[];
  selectedHistoryDayId: string | null;
  selectedHistoryDetail: DailyReportDetail | null;
  hasNewItems: boolean;
  sending: boolean;
  onGenerateBill: () => void;
  onReprintBill: (pin: string, reason: string) => void;
  onHistoryPrint: (billId: string) => void;
  onSelectHistoryDay: (posDayId: string | null) => void;
  onMarkNc: (pin: string, reason: string) => void;
  onReviseBill: (pin: string, reason: string) => void;
  onSettleBill: (input: {
    discountType: "amount" | "percent";
    discountValue: number;
    tipPaise: number;
    payments: Array<{ method: PaymentMethod; amountPaise: number; reference?: string }>;
  }) => void;
}) {
  const bill = currentOrder?.bill ?? null;
  const payments = currentOrder?.payments ?? [];
  const historySummary = selectedHistoryDayId ? selectedHistoryDetail : currentSummary;
  const historyBills = historySummary?.billSummaries ?? [];
  const historyLabel = selectedHistoryDayId
    ? selectedHistoryDetail?.business_date ?? "Older day"
    : currentSummary?.businessDay.business_date ?? "Today";
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [tipValue, setTipValue] = useState("0");
  const [reference, setReference] = useState("");
  const [paymentInputs, setPaymentInputs] = useState<Record<PaymentMethod, string>>({ cash: "0", upi: "0", card: "0", online: "0" });
  const [managerPin, setManagerPin] = useState("");
  const [managerReason, setManagerReason] = useState("");
  const [approvalAction, setApprovalAction] = useState<"reprint" | "nc" | "revise" | null>(null);

  useEffect(() => {
    if (!bill) return;
    setDiscountType("amount");
    setDiscountValue(paiseToRupeeInput(bill.discount_paise ?? 0));
    setTipValue(paiseToRupeeInput(bill.tip_paise ?? 0));
    setPaymentInputs({ cash: "0", upi: "0", card: "0", online: "0" });
    setApprovalAction(null);
    setManagerPin("");
    setManagerReason("");
  }, [bill?.id]);

  if (!canBill) return null;

  const existingPaidPaise = bill?.paid_paise ?? payments.reduce((total, payment) => total + payment.amount_paise, 0);
  const rawDiscount = Math.max(0, Number(discountValue || 0));
  const discountPaise = bill
    ? discountType === "percent"
      ? Math.round((bill.total_paise * Math.min(rawDiscount, 100)) / 100)
      : Math.round(rawDiscount * 100)
    : 0;
  const tipPaise = Math.round(Math.max(0, Number(tipValue || 0)) * 100);
  const finalTotalPaise = bill ? Math.max(0, bill.total_paise - discountPaise + tipPaise) : 0;
  const balancePaise = Math.max(0, finalTotalPaise - existingPaidPaise);
  const newPaymentPaise = (["cash", "upi", "card", "online"] as PaymentMethod[]).reduce((total, method) => total + amountInputToPaise(paymentInputs[method]), 0);
  const remainingPaise = balancePaise - newPaymentPaise;
  const canPunch = Boolean(bill && newPaymentPaise > 0 && remainingPaise === 0 && !sending);
  const hasApproval = managerPin.trim().length > 0 && managerReason.trim().length > 0;
  const approvalTitle = approvalAction === "reprint" ? "Reprint Bill" : approvalAction === "nc" ? "NC Bill" : "Revise Bill";

  const fillFullPayment = (method: PaymentMethod) => {
    setPaymentInputs({
      cash: method === "cash" ? paiseToRupeeInput(balancePaise) : "0",
      upi: method === "upi" ? paiseToRupeeInput(balancePaise) : "0",
      card: method === "card" ? paiseToRupeeInput(balancePaise) : "0",
      online: method === "online" ? paiseToRupeeInput(balancePaise) : "0"
    });
  };
  const selectApprovalAction = (action: "reprint" | "nc" | "revise") => {
    setApprovalAction(approvalAction === action ? null : action);
    setManagerPin("");
    setManagerReason("");
  };

  return (
    <View style={styles.billingStack}>
      <View>
        <Text style={styles.actionTitle}>Captain Actions</Text>
        <Text style={styles.actionMeta}>Billing, payment, NC, reprint, and revise</Text>
      </View>

      {currentSummary ? (
        <>
          <View style={styles.summaryGrid}>
            <SummaryBox label="Sales" value={`Rs ${formatRupees(currentSummary.finalSalesPaise)}`} />
            <SummaryBox label="Bills" value={String(currentSummary.billCount)} />
            <SummaryBox label="Cash" value={`Rs ${formatRupees(currentSummary.cashPaymentsPaise)}`} />
            <SummaryBox label="UPI/Card" value={`Rs ${formatRupees(currentSummary.upiPaymentsPaise + currentSummary.cardPaymentsPaise)}`} />
          </View>
          <View style={styles.historyBox}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.flexText}>
                <Text style={styles.actionTitle}>Order History</Text>
                <Text style={styles.actionMeta}>{historyLabel} · {historyBills.length} bills</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyDayChips}>
              <Pressable
                style={[styles.filterChip, !selectedHistoryDayId && styles.filterChipActive]}
                onPress={() => onSelectHistoryDay(null)}
              >
                <Text style={[styles.filterChipText, !selectedHistoryDayId && styles.filterChipTextActive]}>Today</Text>
              </Pressable>
              {dailyReports.map((report) => (
                <Pressable
                  key={report.pos_day_id}
                  style={[styles.filterChip, selectedHistoryDayId === report.pos_day_id && styles.filterChipActive]}
                  onPress={() => onSelectHistoryDay(report.pos_day_id)}
                >
                  <Text style={[styles.filterChipText, selectedHistoryDayId === report.pos_day_id && styles.filterChipTextActive]}>{report.business_date}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {historyBills.length === 0 ? (
              <Text style={styles.smallMuted}>No bills found for this day.</Text>
            ) : (
              historyBills.map((historyBill) => (
                <View key={historyBill.billId} style={styles.historyRow}>
                  <View style={styles.flexText}>
                    <Text style={styles.ticketName}>Bill #{historyBill.billNumber ?? historyBill.billId} · Table {historyBill.tableName}</Text>
                    <Text style={styles.muted}>
                      {historyBill.items?.length ? `${historyBill.items.slice(0, 3).map((item) => `${item.quantity} x ${item.name}`).join(", ")} · ` : ""}
                      subtotal Rs {formatRupees(historyBill.subtotalPaise ?? Math.max(0, historyBill.totalPaise - (historyBill.taxPaise ?? 0)))} · tax Rs {formatRupees(historyBill.taxPaise ?? 0)} · total Rs {formatRupees(historyBill.finalTotalPaise)} · paid Rs {formatRupees(historyBill.paidPaise)}
                      {historyBill.settledAt ? ` · ${formatPosDateTime(historyBill.settledAt)}` : ""}
                    </Text>
                  </View>
                  <Pressable style={[styles.secondaryButton, styles.historyPrintButton, sending && styles.buttonDisabled]} disabled={sending} onPress={() => onHistoryPrint(historyBill.billId)}>
                    <Text style={styles.secondaryButtonText}>Print</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}

      {!currentOrder?.order ? (
        <Text style={styles.smallMuted}>Send items for this table before billing.</Text>
      ) : !bill ? (
        <Pressable style={[styles.primaryButton, styles.heroSendButton, sending && styles.buttonDisabled]} disabled={sending} onPress={onGenerateBill}>
          <Text style={styles.primaryButtonText}>{sending ? "Working..." : "Generate and Print Bill"}</Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.billTotals}>
            <Text style={styles.sentName}>Bill {bill.revision_number ? `rev ${bill.revision_number}` : ""}</Text>
            <Text style={styles.muted}>Items Rs {formatRupees(bill.total_paise)}</Text>
            <Text style={styles.muted}>Already paid Rs {formatRupees(existingPaidPaise)}</Text>
            <Text style={[styles.totalText, { fontSize: 20 }]}>Balance Rs {formatRupees(balancePaise)}</Text>
          </View>

          <View style={styles.buttonStack}>
            <Pressable
              style={[styles.primaryButton, styles.heroSendButton, !canPunch && styles.buttonDisabled]}
              disabled={!canPunch}
              onPress={() =>
                onSettleBill({
                  discountType,
                  discountValue: discountType === "percent" ? rawDiscount : discountPaise,
                  tipPaise,
                  payments: (["cash", "upi", "card", "online"] as PaymentMethod[])
                    .map((method) => ({ method, amountPaise: amountInputToPaise(paymentInputs[method]), reference: reference.trim() || undefined }))
                    .filter((payment) => payment.amountPaise > 0)
                })
              }
            >
              <Text style={styles.primaryButtonText}>Punch Bill</Text>
            </Pressable>
          </View>

          <View style={styles.quickPayGrid}>
            {(["cash", "upi", "card", "online"] as PaymentMethod[]).map((method) => (
              <Pressable key={method} style={styles.quickPayButton} onPress={() => fillFullPayment(method)}>
                <Text style={styles.quickPayText}>Full {method.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.segmentedRow}>
            <Pressable style={[styles.segmentButton, discountType === "amount" && styles.segmentButtonActive]} onPress={() => setDiscountType("amount")}>
              <Text style={[styles.segmentText, discountType === "amount" && styles.segmentTextActive]}>Rs off</Text>
            </Pressable>
            <Pressable style={[styles.segmentButton, discountType === "percent" && styles.segmentButtonActive]} onPress={() => setDiscountType("percent")}>
              <Text style={[styles.segmentText, discountType === "percent" && styles.segmentTextActive]}>% off</Text>
            </Pressable>
          </View>

          <View style={styles.paymentGrid}>
            <LabeledMoneyInput label="Discount" value={discountValue} onChange={setDiscountValue} />
            <LabeledMoneyInput label="Tip" value={tipValue} onChange={setTipValue} />
          </View>

          <View style={styles.paymentGrid}>
            {(["cash", "upi", "card", "online"] as PaymentMethod[]).map((method) => (
              <LabeledMoneyInput
                key={method}
                label={method.toUpperCase()}
                value={paymentInputs[method]}
                onChange={(value) => setPaymentInputs((current) => ({ ...current, [method]: value }))}
              />
            ))}
          </View>
          <UncontrolledInput
            inputKey={`payment-reference-${bill.id}`}
            label="Reference"
            defaultValue={reference}
            onChangeText={setReference}
            placeholder="UPI/card note, optional"
            returnKeyType="done"
          />
          <Text style={[styles.smallMuted, remainingPaise < 0 && styles.dangerText]}>
            {remainingPaise === 0 ? "Payment covers the bill." : remainingPaise > 0 ? `Still pending Rs ${formatRupees(remainingPaise)}` : `Over by Rs ${formatRupees(Math.abs(remainingPaise))}`}
          </Text>

          <View style={styles.quickPayGrid}>
            <Pressable style={[styles.secondaryButton, approvalAction === "reprint" && styles.approvalActionActive, sending && styles.buttonDisabled]} disabled={sending} onPress={() => selectApprovalAction("reprint")}>
              <Text style={styles.secondaryButtonText}>Reprint</Text>
            </Pressable>
            <Pressable style={[styles.dangerButton, approvalAction === "nc" && styles.approvalDangerActive, sending && styles.buttonDisabled]} disabled={sending} onPress={() => selectApprovalAction("nc")}>
              <Text style={styles.dangerButtonText}>NC Bill</Text>
            </Pressable>
            <Pressable style={[styles.secondaryButton, approvalAction === "revise" && styles.approvalActionActive, (!hasNewItems || sending) && styles.buttonDisabled]} disabled={!hasNewItems || sending} onPress={() => selectApprovalAction("revise")}>
              <Text style={styles.secondaryButtonText}>Revise</Text>
            </Pressable>
          </View>

          {approvalAction ? (
            <View style={styles.managerBox}>
              <Text style={styles.subhead}>{approvalTitle}</Text>
              <Text style={styles.smallMuted}>Manager PIN and reason required.</Text>
              <UncontrolledInput
                inputKey={`manager-pin-${bill.id}-${approvalAction}`}
                label="Manager PIN"
                defaultValue=""
                secureTextEntry
                keyboardType="number-pad"
                onChangeText={setManagerPin}
              />
              <UncontrolledInput
                inputKey={`manager-reason-${bill.id}-${approvalAction}`}
                label="Reason"
                defaultValue=""
                onChangeText={setManagerReason}
                placeholder={`Reason for ${approvalTitle.toLowerCase()}`}
              />
              <Pressable
                style={[approvalAction === "nc" ? styles.dangerButton : styles.primaryButton, (!hasApproval || sending) && styles.buttonDisabled]}
                disabled={!hasApproval || sending}
                onPress={() => {
                  if (approvalAction === "reprint") onReprintBill(managerPin, managerReason);
                  if (approvalAction === "nc") onMarkNc(managerPin, managerReason);
                  if (approvalAction === "revise") onReviseBill(managerPin, managerReason);
                }}
              >
                <Text style={approvalAction === "nc" ? styles.dangerButtonText : styles.primaryButtonText}>{approvalTitle}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

export { CaptainBillingPanel };
