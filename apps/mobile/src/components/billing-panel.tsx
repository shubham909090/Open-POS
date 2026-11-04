import { FormModal } from "./form-modal";
import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Pressable } from "./pressable";

import type { HubOrder } from "../lib/hub-client";
import {
  amountInputToPaise,
  formatRupees,
  paiseToRupeeInput,
} from "../lib/mobile-format";
import type { PaymentMethod } from "../lib/mobile-types";
import { palette, styles } from "../styles/app-styles";
import { Button } from "./ui-primitives";
import { LabeledMoneyInput, UncontrolledInput } from "./app-shell";

export { BillingHistoryPanel } from "./billing-history-panel";

function CaptainBillingPanel({
  canBill,
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
  const { width, fontScale } = useWindowDimensions();
  const widePaymentButtons = fontScale >= 1.3 || width < 360;
  const bill = currentOrder?.bill ?? null;
  const payments = currentOrder?.payments ?? [];
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    "amount",
  );
  const [discountValue, setDiscountValue] = useState("0");
  const [tipValue, setTipValue] = useState("0");
  const [reference, setReference] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
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
    setAdjustmentsOpen(false);
    setSplitOpen(false);
    setManagerPin("");
    setManagerReason("");
  }, [currentOrder?.order?.id, bill?.id]);

  if (!canBill) return null;

  const existingPaidPaise =
    bill?.paid_paise ??
    payments.reduce((total, payment) => total + payment.amount_paise, 0);
  const rawDiscount = Math.max(0, Number(discountValue || 0));
  const discountPaise = bill
    ? discountType === "percent"
      ? Math.round((bill.total_paise * Math.min(rawDiscount, 100)) / 100)
      : Math.round(rawDiscount * 100)
    : 0;
  const tipPaise = Math.round(Math.max(0, Number(tipValue || 0)) * 100);
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
    bill && newPaymentPaise > 0 && remainingPaise === 0 && !sending,
  );
  const hasApproval =
    managerPin.trim().length >= 4 && managerReason.trim().length >= 3;
  const approvalTitle =
    approvalAction === "reprint"
      ? "Reprint bill"
      : approvalAction === "nc"
        ? "NC bill"
        : "Revise bill";

  const fillFullPayment = (method: PaymentMethod) => {
    setPaymentInputs({
      cash: method === "cash" ? paiseToRupeeInput(balancePaise) : "0",
      upi: method === "upi" ? paiseToRupeeInput(balancePaise) : "0",
      card: method === "card" ? paiseToRupeeInput(balancePaise) : "0",
      online: method === "online" ? paiseToRupeeInput(balancePaise) : "0",
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
    <View style={styles.billingStack}>
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
          <Pressable
            style={[
              styles.primaryButton,
              styles.heroSendButton,
              sending && styles.buttonDisabled,
            ]}
            disabled={sending}
            onPress={() => onGenerateBill(customerName)}
          >
            <Text style={styles.primaryButtonText}>
              {sending ? "Printing…" : "Print bill"}
            </Text>
          </Pressable>
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
            {discountPaise > 0 || tipPaise > 0 || existingPaidPaise > 0 ? <View style={styles.billAmountRow}><Text style={styles.muted}>Items</Text><Text style={styles.muted}>Rs {formatRupees(bill.total_paise)}</Text></View> : null}
            {discountPaise > 0 ? <View style={styles.billAmountRow}><Text style={styles.muted}>Discount</Text><Text style={styles.muted}>− Rs {formatRupees(discountPaise)}</Text></View> : null}
            {tipPaise > 0 ? <View style={styles.billAmountRow}><Text style={styles.muted}>Tip</Text><Text style={styles.muted}>Rs {formatRupees(tipPaise)}</Text></View> : null}
            {existingPaidPaise > 0 ? <View style={styles.billAmountRow}><Text style={styles.muted}>Already paid</Text><Text style={styles.muted}>Rs {formatRupees(existingPaidPaise)}</Text></View> : null}
            <View style={styles.billAmountRow}><Text style={styles.sectionTitle}>Balance</Text><Text style={styles.sectionTitle}>Rs {formatRupees(balancePaise)}</Text></View>
          </View>

          <View style={styles.quickPayGrid}>
            {(["cash", "upi", "card", "online"] as PaymentMethod[]).map(
              (method) => (
                <Pressable
                  key={method}
                  accessibilityState={{ selected: amountInputToPaise(paymentInputs[method]) === balancePaise && balancePaise > 0 }}
                  style={[styles.quickPayButton, widePaymentButtons && styles.quickPayButtonWide, amountInputToPaise(paymentInputs[method]) === balancePaise && balancePaise > 0 && styles.quickPaySelected]}
                  onPress={() => fillFullPayment(method)}
                >
                  <Text style={styles.quickPayText}>
                    {method === "upi" ? "UPI" : method.charAt(0).toUpperCase() + method.slice(1)}
                  </Text>
                </Pressable>
              ),
            )}
          </View>

          <Pressable accessibilityState={{ expanded: adjustmentsOpen }} style={styles.billAdjustmentToggle} onPress={() => setAdjustmentsOpen((open) => !open)}>
            <Text style={styles.secondaryButtonText}>Discount and tip</Text><Text style={styles.muted}>{adjustmentsOpen ? "−" : "+"}</Text>
          </Pressable>
          {adjustmentsOpen ? <>
          <View style={styles.segmentedRow}>
            <Pressable
              style={[
                styles.segmentButton,
                discountType === "amount" && styles.segmentButtonActive,
              ]}
              onPress={() => setDiscountType("amount")}
            >
              <Text
                style={[
                  styles.segmentText,
                  discountType === "amount" && styles.segmentTextActive,
                ]}
              >
                Rs off
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segmentButton,
                discountType === "percent" && styles.segmentButtonActive,
              ]}
              onPress={() => setDiscountType("percent")}
            >
              <Text
                style={[
                  styles.segmentText,
                  discountType === "percent" && styles.segmentTextActive,
                ]}
              >
                % off
              </Text>
            </Pressable>
          </View>

          <View style={styles.paymentGrid}>
            <LabeledMoneyInput
              label="Discount"
              value={discountValue}
              onChange={setDiscountValue}
            />
            <LabeledMoneyInput
              label="Tip"
              value={tipValue}
              onChange={setTipValue}
            />
          </View>
          </> : null}

          <Pressable accessibilityState={{ expanded: splitOpen }} style={styles.billAdjustmentToggle} onPress={() => setSplitOpen((open) => !open)}>
            <Text style={styles.secondaryButtonText}>Split payment / reference</Text><Text style={styles.muted}>{splitOpen ? "−" : "+"}</Text>
          </Pressable>
          {splitOpen ? <>{/* Payment fields stay mounted only while editing; state is retained. */}
          <View style={styles.paymentGrid}>
            {(["cash", "upi", "card", "online"] as PaymentMethod[]).map(
              (method) => (
                <LabeledMoneyInput
                  key={method}
                  label={method.toUpperCase()}
                  value={paymentInputs[method]}
                  onChange={(value) =>
                    setPaymentInputs((current) => ({
                      ...current,
                      [method]: value,
                    }))
                  }
                />
              ),
            )}
          </View>
          <UncontrolledInput
            inputKey={`payment-reference-${bill.id}`}
            label="Reference"
            defaultValue={reference}
            onChangeText={setReference}
            placeholder="UPI/card note, optional"
            returnKeyType="done"
          />
          </> : null}
          {newPaymentPaise > 0 && remainingPaise !== 0 ? <Text style={[styles.smallMuted, remainingPaise < 0 && styles.dangerText]}>{remainingPaise > 0 ? `Remaining Rs ${formatRupees(remainingPaise)}` : `Over by Rs ${formatRupees(Math.abs(remainingPaise))}`}</Text> : null}

          <Button label={sending ? "Saving payment…" : `Record Rs ${formatRupees(newPaymentPaise || balancePaise)}`} disabled={!canPunch} style={styles.heroSendButton}
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
                      (!hasApproval || sending) && styles.buttonDisabled,
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
    </View>
  );
}

export { CaptainBillingPanel };
