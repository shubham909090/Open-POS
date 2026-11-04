import { FormModal } from "./form-modal";
import { useEffect, useState } from "react";
import { Keyboard, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Pressable } from "./pressable";

import type { HubOrder } from "../lib/hub-client";
import {
  amountInputToPaise,
  formatRupees,
  isValidAmountInput,
  paiseToRupeeInput,
} from "../lib/mobile-format";
import type { PaymentMethod } from "../lib/mobile-types";
import { palette, styles } from "../styles/app-styles";
import { Button } from "./ui-primitives";
import { LabeledMoneyInput, UncontrolledInput } from "./app-shell";

export { BillingHistoryPanel } from "./billing-history-panel";

function CaptainBillingPanel({
  canBill,
  keyboardVisible = false,
  sentTotalPaise = 0,
  currentOrder,
  hasNewItems,
  sending,
  onGenerateBill,
  onReprintBill,
  onMarkNc,
  onReviseBill,
  onSettleBill,
}: {
  canBill: boolean;
  keyboardVisible?: boolean;
  sentTotalPaise?: number;
  currentOrder: HubOrder | null;
  hasNewItems: boolean;
  sending: boolean;
  onGenerateBill: (customerName?: string) => void;
  onReprintBill: (pin: string, reason: string) => void;
  onMarkNc: (pin: string, reason: string) => void;
  onReviseBill: (pin: string, reason: string) => void;
  onSettleBill: (input: {
    discountType: "amount" | "percent";
    discountValue: number;
    tipPaise: number;
    payments: Array<{
      method: PaymentMethod;
      amountPaise: number;
      reference?: string;
    }>;
  }) => void;
}) {
  const bill = currentOrder?.bill ?? null;
  const payments = currentOrder?.payments ?? [];
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    "amount",
  );
  const [discountValue, setDiscountValue] = useState("0");
  const [tipValue, setTipValue] = useState("0");
  const [reference, setReference] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [paymentInputs, setPaymentInputs] = useState<
    Record<PaymentMethod, string>
  >({ cash: "0", upi: "0", card: "0", online: "0" });
  const [managerPin, setManagerPin] = useState("");
  const [managerReason, setManagerReason] = useState("");
  const [approvalAction, setApprovalAction] = useState<
    "reprint" | "nc" | "revise" | null
  >(null);

  useEffect(() => {
    setCustomerName(bill?.customer_name ?? "");
    if (!bill) return;
    setDiscountType("amount");
    setDiscountValue(paiseToRupeeInput(bill.discount_paise ?? 0));
    setTipValue(paiseToRupeeInput(bill.tip_paise ?? 0));
    setPaymentInputs({ cash: "0", upi: "0", card: "0", online: "0" });
    setApprovalAction(null);
    setManagerPin("");
    setManagerReason("");
  }, [currentOrder?.order?.id, bill?.id]);

  if (!canBill) return null;

  const existingPaidPaise =
    bill?.paid_paise ??
    payments.reduce((total, payment) => total + payment.amount_paise, 0);
  const amountsValid = isValidAmountInput(discountValue) && isValidAmountInput(tipValue) && Object.values(paymentInputs).every(isValidAmountInput);
  const rawDiscount = isValidAmountInput(discountValue) ? Math.max(0, Number(discountValue || 0)) : 0;
  const discountPaise = bill
    ? discountType === "percent"
      ? Math.round((bill.total_paise * Math.min(rawDiscount, 100)) / 100)
      : Math.round(rawDiscount * 100)
    : 0;
  const tipPaise = amountInputToPaise(tipValue);
  const finalTotalPaise = bill
    ? Math.max(0, bill.total_paise - discountPaise + tipPaise)
    : 0;
  const balancePaise = Math.max(0, finalTotalPaise - existingPaidPaise);
  const newPaymentPaise = (
    ["cash", "upi", "card", "online"] as PaymentMethod[]
  ).reduce(
    (total, method) => total + amountInputToPaise(paymentInputs[method]),
    0,
  );
  const remainingPaise = balancePaise - newPaymentPaise;
  const canPunch = Boolean(
    bill && amountsValid && newPaymentPaise > 0 && remainingPaise === 0 && !sending,
  );
  const hasApproval =
    managerPin.trim().length >= 4 && managerReason.trim().length >= 3;
  const approvalTitle =
    approvalAction === "reprint"
      ? "Reprint bill"
      : approvalAction === "nc"
        ? "NC bill"
        : "Revise bill";

  const fillRemainingPayment = (method: PaymentMethod) => {
    setPaymentInputs((current) => {
      const otherPaid = (["cash", "upi", "card", "online"] as PaymentMethod[]).filter((entry) => entry !== method).reduce((sum, entry) => sum + amountInputToPaise(current[entry]), 0);
      return { ...current, [method]: paiseToRupeeInput(Math.max(0, balancePaise - otherPaid)) };
    });
  };
  const selectApprovalAction = (action: "reprint" | "nc" | "revise") => {
    setApprovalAction(approvalAction === action ? null : action);
    setManagerPin("");
    setManagerReason("");
  };
  const closeApproval = () => {
    setApprovalAction(null);
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
    <View style={styles.ticketSegment}>
      <ScrollView testID="bill-details-scroll" style={styles.ticketScroll} contentContainerStyle={[styles.checkBody, styles.billingStack]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {!currentOrder?.order ? (
        <Text style={styles.smallMuted}>
          Send items for this table before billing.
        </Text>
      ) : !bill ? (
        <>
          {hasNewItems ? <Text style={styles.muted}>New items aren’t included.</Text> : null}
          <UncontrolledInput
            inputKey={`bill-name-${currentOrder.order.id}`}
            label="Bill name"
            defaultValue={customerName}
            onChangeText={(value) => setCustomerName(value.slice(0, 80))}
            placeholder="Customer name, optional"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
          />
          <View style={styles.billAmountRow}><Text style={styles.muted}>Items</Text><Text style={styles.totalText}>₹{formatRupees(sentTotalPaise)}</Text></View>

        </>
      ) : (
        <>
          {hasNewItems && existingPaidPaise === 0 ? <>
            <Text style={styles.muted}>Include new items in a revised bill.</Text>
            <Pressable style={[styles.primaryButton, (sending || existingPaidPaise > 0) && styles.buttonDisabled]} disabled={sending || existingPaidPaise > 0} onPress={() => selectApprovalAction("revise")}><Text style={styles.primaryButtonText}>Revise bill</Text></Pressable>
          </> : <>
          {hasNewItems ? <Text style={styles.muted}>Current bill · new items excluded.</Text> : null}
          <View style={styles.billTotals}>
            {bill.revision_number && bill.revision_number > 1 ? <Text style={styles.smallMuted}>Revision {bill.revision_number}</Text> : null}
            {bill.customer_name ? (
              <Text style={styles.muted}>{bill.customer_name}</Text>
            ) : null}
            {discountPaise > 0 || tipPaise > 0 || existingPaidPaise > 0 ? <View style={styles.billAmountRow}><Text style={styles.muted}>Items</Text><Text style={styles.muted}>₹{formatRupees(bill.total_paise)}</Text></View> : null}
            {discountPaise > 0 ? <View style={styles.billAmountRow}><Text style={styles.muted}>Discount</Text><Text style={styles.muted}>− ₹{formatRupees(discountPaise)}</Text></View> : null}
            {tipPaise > 0 ? <View style={styles.billAmountRow}><Text style={styles.muted}>Tip</Text><Text style={styles.muted}>₹{formatRupees(tipPaise)}</Text></View> : null}
            {existingPaidPaise > 0 ? <View style={styles.billAmountRow}><Text style={styles.muted}>Already paid</Text><Text style={styles.muted}>₹{formatRupees(existingPaidPaise)}</Text></View> : null}
            <View style={styles.billAmountRow}><Text style={styles.sectionTitle}>Balance</Text><Text style={styles.sectionTitle}>₹{formatRupees(balancePaise)}</Text></View>
          </View>

          <Text style={styles.smallMuted}>Tap a method to fill the remaining balance, or enter a split.</Text>
          <View style={styles.paymentGrid}>
            {(["cash", "upi", "card", "online"] as PaymentMethod[]).map((method) => <View key={method} style={styles.tenderRow}>
              <Pressable accessibilityLabel={method === "upi" ? "UPI" : method.charAt(0).toUpperCase() + method.slice(1)} style={[styles.quickPayButton, amountInputToPaise(paymentInputs[method]) > 0 && styles.quickPaySelected]} onPress={() => fillRemainingPayment(method)}>
                <Text style={styles.quickPayText}>{method === "upi" ? "UPI" : method.charAt(0).toUpperCase() + method.slice(1)}</Text>
              </Pressable>
              <TextInput accessibilityLabel={`${method.toUpperCase()} amount`} style={[styles.input, styles.tenderInput]} value={paymentInputs[method]} onChangeText={(value) => setPaymentInputs((current) => ({ ...current, [method]: value.replace(/[^0-9.]/g, "").slice(0, 10) }))} keyboardType="decimal-pad" selectTextOnFocus returnKeyType="done" />
            </View>)}
          </View>
          <View style={[styles.paymentGrid, { alignItems: "flex-end" }]}>
            <View style={styles.moneyInputWrap}>
              <View style={styles.adjustmentFieldHeader}>
                <Text style={styles.inputLabel}>Discount</Text>
                <View style={styles.discountUnits}>
                  {(["amount", "percent"] as const).map((type) => <Pressable key={type} accessibilityLabel={type === "amount" ? "₹ off" : "% off"} accessibilityState={{ selected: discountType === type }} style={[styles.discountUnit, discountType === type && styles.discountUnitSelected]} onPress={() => setDiscountType(type)}><Text style={[styles.segmentText, discountType === type && styles.segmentTextActive]}>{type === "amount" ? "₹" : "%"}</Text></Pressable>)}
                </View>
              </View>
              <TextInput accessibilityLabel="Discount" value={discountValue} onChangeText={(value) => setDiscountValue(value.replace(/[^0-9.]/g, ""))} style={styles.input} selectTextOnFocus keyboardType="decimal-pad" returnKeyType="done" />
            </View>
            <View style={styles.moneyInputWrap}>
              <View style={styles.adjustmentFieldHeader}><Text style={styles.inputLabel}>Tip</Text></View>
              <TextInput accessibilityLabel="Tip" value={tipValue} onChangeText={(value) => setTipValue(value.replace(/[^0-9.]/g, ""))} style={styles.input} selectTextOnFocus keyboardType="decimal-pad" returnKeyType="done" />
            </View>
          </View>
          <UncontrolledInput
            inputKey={`payment-reference-${bill.id}`}
            label="Reference"
            defaultValue={reference}
            onChangeText={setReference}
            placeholder="UPI/card note, optional"
            returnKeyType="done"
          />
          {!amountsValid ? <Text style={styles.dangerText} accessibilityLiveRegion="polite">Enter valid amounts with up to two decimal places.</Text> : null}
          {amountsValid && newPaymentPaise > 0 && remainingPaise !== 0 ? <Text style={[styles.smallMuted, remainingPaise < 0 && styles.dangerText]}>{remainingPaise > 0 ? `Remaining ₹${formatRupees(remainingPaise)}` : `Over by ₹${formatRupees(Math.abs(remainingPaise))}`}</Text> : null}



          <View style={styles.quickPayGrid}>
            <Pressable
              style={[
                styles.secondaryButton,
                approvalAction === "reprint" && styles.approvalActionActive,
                sending && styles.buttonDisabled,
              ]}
              disabled={sending}
              onPress={() => selectApprovalAction("reprint")}
            >
              <Text style={styles.secondaryButtonText}>Reprint</Text>
            </Pressable>
            <Pressable
              style={[
                styles.dangerSmallButton,
                (sending || existingPaidPaise > 0) && styles.buttonDisabled,
              ]}
              disabled={sending || existingPaidPaise > 0}
              onPress={() => selectApprovalAction("nc")}
            >
              <Text style={styles.dangerSmallButtonText}>NC bill</Text>
            </Pressable>

          </View>

          </>}
          {existingPaidPaise > 0 ? <Text style={styles.smallMuted}>Reverse payments on the hub to revise or mark NC.</Text> : null}

          <FormModal
            visible={Boolean(approvalAction)}
            transparent
            animationType="fade"
            onRequestClose={closeApproval}
          >
            <View style={styles.popupBackdrop}>
              <ScrollView
                style={[styles.popupCard, { padding: 0 }]}
                contentContainerStyle={{ padding: 20, gap: 16 }}
                keyboardShouldPersistTaps="handled"
              >
                <View>
                  <Text style={styles.actionTitle}>{approvalTitle}</Text>
                  <Text style={styles.actionMeta}>
                    {approvalAction === "nc" ? "Make this bill non-chargeable. " : approvalAction === "revise" ? "Add the new dishes to a revised bill. " : "Print another copy of this bill. "}

                  </Text>
                </View>
                <TextInput
                  autoFocus
                  accessibilityLabel="Manager PIN"
                  style={styles.input}
                  value={managerPin}
                  onChangeText={setManagerPin}
                  secureTextEntry
                  keyboardType="number-pad"
                  placeholder="Manager PIN"
                  placeholderTextColor={palette.muted}
                />
                <TextInput
                  accessibilityLabel="Reason for approval"
                  style={styles.input}
                  value={managerReason}
                  onChangeText={setManagerReason}
                  placeholder={`Reason for ${approvalTitle.toLowerCase()}`}
                  placeholderTextColor={palette.muted}
                />
                <View style={styles.sendButtonRow}>
                  <Pressable
                    style={[styles.secondaryButton, styles.sendButton]}
                    onPress={closeApproval}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      approvalAction === "nc"
                        ? styles.dangerButton
                        : styles.primaryButton,
                      styles.sendButton,
                      !hasApproval ? styles.primaryButtonWaiting : sending && styles.buttonDisabled,
                    ]}
                    disabled={!hasApproval || sending}
                    onPress={confirmApprovalAction}
                  >
                    <Text
                      style={
                        approvalAction === "nc"
                          ? styles.dangerButtonText
                          : styles.primaryButtonText
                      }
                    >
                      {approvalTitle}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </FormModal>
        </>
      )}
      </ScrollView>
      {keyboardVisible ? <View style={styles.keyboardCommit}><Button label="Done editing" tone="secondary" onPress={() => Keyboard.dismiss()} /></View> : currentOrder?.order && !bill ? <View testID="bill-actions" style={styles.checkCommit}>
        <View style={styles.billAmountRow}><Text style={styles.muted}>Bill total</Text><Text style={styles.totalText}>₹{formatRupees(sentTotalPaise)}</Text></View>
          <Pressable
            style={[
              styles.primaryButton,
              styles.heroSendButton,
              styles.generateBillButton,
              sending && styles.buttonDisabled,
            ]}
            disabled={sending}
            onPress={() => onGenerateBill(customerName)}
          >
            <Text style={styles.primaryButtonText}>
              {sending ? "Printing…" : "Print bill"}
            </Text>
          </Pressable>
      </View> : bill && !(hasNewItems && existingPaidPaise === 0) ? <View testID="bill-actions" style={styles.checkCommit}>
        <View style={styles.billAmountRow}><Text style={styles.muted}>Balance</Text><Text style={styles.totalText}>₹{formatRupees(balancePaise)}</Text></View>
          <Button label={sending ? "Saving payment…" : `Record ₹${formatRupees(newPaymentPaise || balancePaise)}`} tone="money" disabled={!canPunch} style={styles.heroSendButton}
              onPress={() =>
                onSettleBill({
                  discountType,
                  discountValue:
                    discountType === "percent" ? rawDiscount : discountPaise,
                  tipPaise,
                  payments: (
                    ["cash", "upi", "card", "online"] as PaymentMethod[]
                  )
                    .map((method) => ({
                      method,
                      amountPaise: amountInputToPaise(paymentInputs[method]),
                      reference: reference.trim() || undefined,
                    }))
                    .filter((payment) => payment.amountPaise > 0),
                })
              } />
      </View> : null}
    </View>
  );
}

export { CaptainBillingPanel };
