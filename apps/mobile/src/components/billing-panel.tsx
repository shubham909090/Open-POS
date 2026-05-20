import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import type { HubOrder } from "../lib/hub-client";
import { amountInputToPaise, formatRupees, paiseToRupeeInput } from "../lib/mobile-format";
import type { PaymentMethod } from "../lib/mobile-types";
import { palette, styles } from "../styles/app-styles";
import { LabeledMoneyInput, UncontrolledInput } from "./app-shell";

export { BillingHistoryPanel } from "./billing-history-panel";

function CaptainBillingPanel({
  canBill,
  currentOrder,
  hasNewItems,
  sending,
  onGenerateBill,
  onReprintBill,
  onMarkNc,
  onReviseBill,
  onSettleBill
}: {
  canBill: boolean;
  currentOrder: HubOrder | null;
  hasNewItems: boolean;
  sending: boolean;
  onGenerateBill: () => void;
  onReprintBill: (pin: string, reason: string) => void;
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
  const confirmApprovalAction = () => {
    if (!approvalAction) return;
    const pin = managerPin.trim();
    const reason = managerReason.trim();
    if (!pin || !reason) return;
    if (approvalAction === "reprint") onReprintBill(pin, reason);
    if (approvalAction === "nc") onMarkNc(pin, reason);
    if (approvalAction === "revise") onReviseBill(pin, reason);
    setApprovalAction(null);
    setManagerPin("");
    setManagerReason("");
  };

  return (
    <View style={styles.billingStack}>
      <View>
        <Text style={styles.actionTitle}>Captain Actions</Text>
        <Text style={styles.actionMeta}>Settle the selected table. History is in its own tab.</Text>
      </View>

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

          <Modal visible={Boolean(approvalAction)} transparent animationType="fade" onRequestClose={() => setApprovalAction(null)}>
            <View style={styles.popupBackdrop}>
              <View style={styles.popupCard}>
                <View>
                  <Text style={styles.actionTitle}>{approvalTitle}</Text>
                  <Text style={styles.actionMeta}>Manager PIN and reason required.</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={managerPin}
                  onChangeText={setManagerPin}
                  secureTextEntry
                  keyboardType="number-pad"
                  placeholder="Manager PIN"
                  placeholderTextColor={palette.muted}
                />
                <TextInput
                  style={styles.input}
                  value={managerReason}
                  onChangeText={setManagerReason}
                  placeholder={`Reason for ${approvalTitle.toLowerCase()}`}
                  placeholderTextColor={palette.muted}
                />
                <View style={styles.sendButtonRow}>
                  <Pressable style={[styles.secondaryButton, styles.sendButton]} onPress={() => setApprovalAction(null)}>
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[approvalAction === "nc" ? styles.dangerButton : styles.primaryButton, styles.sendButton, (!hasApproval || sending) && styles.buttonDisabled]}
                    disabled={!hasApproval || sending}
                    onPress={confirmApprovalAction}
                  >
                    <Text style={approvalAction === "nc" ? styles.dangerButtonText : styles.primaryButtonText}>{approvalTitle}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

export { CaptainBillingPanel };
