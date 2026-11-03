import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Pressable } from "./pressable";
import { SafeAreaView } from "react-native-safe-area-context";

import { usePaymentQr } from "../hooks/use-payment-qr";
import type { HubClient } from "../lib/hub-client";
import { palette } from "../styles/app-style-tokens";
import { paymentQrStyles as s } from "../styles/payment-qr-styles";
import { Download, QrCode, Share2, X } from "lucide-react-native";
import { useReducedMotion } from "../hooks/use-reduced-motion";

export function PaymentQrModal({
  client,
  online,
  canManage,
  deviceName,
  onClose,
}: {
  client: HubClient;
  online: boolean;
  canManage: boolean;
  deviceName: string;
  onClose: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stackActions = width < 380 || fontScale >= 1.3;
  const reducedMotion = useReducedMotion();
  const imageSize = Math.max(150, Math.min(320, width - 100));
  const {
    qr,
    loading,
    busy,
    error,
    notice,
    change,
    setChange,
    refresh,
    pickImage,
    saveChange,
    exportImage,
  } = usePaymentQr({ client, online, deviceName });
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [Boolean(change)]);
  const [pin, setPin] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const close = () => {
    setPin("");
    setChange(null);
    onClose();
  };
  const cancelChange = () => {
    setPin("");
    setChange(null);
  };
  const submit = () => {
    const submittedPin = pin.trim();
    setPin("");
    void saveChange(submittedPin);
  };

  return (
    <Modal
      visible
      animationType={reducedMotion ? "none" : "slide"}
      onRequestClose={close}
    >
      <SafeAreaView style={s.shell}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Payment QR</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close payment QR"
            style={s.close}
            onPress={close}
          >
            <X size={20} color={palette.muted} strokeWidth={1.7} />
          </Pressable>
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.column}>
              {change ? (
                <View style={s.form}>
                  <Text style={s.kicker}>Master PIN required</Text>
                  <Text style={s.formTitle}>
                    {change.kind === "remove"
                      ? "Remove payment QR?"
                      : change.kind === "resize"
                        ? "Bill QR size"
                        : qr
                          ? "Replace payment QR"
                          : "Add payment QR"}
                  </Text>
                  <Text style={s.formCopy}>
                    {change.kind === "remove"
                      ? "This removes the shared QR from new bills and staff screens."
                      : "This QR is shared by all bill printers and staff. It never appears on kitchen tickets."}
                  </Text>
                  {change.kind !== "remove" ? (
                    <>
                      <Image
                        source={{ uri: change.imageDataUrl }}
                        style={s.selectedImage}
                        resizeMode="contain"
                        accessibilityLabel="Selected payment QR image"
                      />
                      <View style={s.field}>
                        <Text style={s.inputLabel}>Print size</Text>
                        <View style={s.sizeRow}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Decrease QR print size"
                            disabled={busy || change.sizeMm <= 20}
                            style={[
                              s.sizeButton,
                              (busy || change.sizeMm <= 20) && s.disabled,
                            ]}
                            onPress={() =>
                              setChange({
                                ...change,
                                sizeMm: change.sizeMm - 1,
                              })
                            }
                          >
                            <Text style={s.sizeButtonText}>−</Text>
                          </Pressable>
                          <Text
                            style={s.sizeValue}
                            accessibilityLiveRegion="polite"
                          >
                            {change.sizeMm} mm
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Increase QR print size"
                            disabled={busy || change.sizeMm >= 45}
                            style={[
                              s.sizeButton,
                              (busy || change.sizeMm >= 45) && s.disabled,
                            ]}
                            onPress={() =>
                              setChange({
                                ...change,
                                sizeMm: change.sizeMm + 1,
                              })
                            }
                          >
                            <Text style={s.sizeButtonText}>+</Text>
                          </Pressable>
                        </View>
                        <Text style={s.sizeHelp}>
                          20–45 mm. Fits the roll; dense QR codes may print
                          larger to stay scannable. Appears before the bill
                          footer.
                        </Text>
                      </View>
                    </>
                  ) : null}
                  <View style={s.field}>
                    <Text style={s.inputLabel}>Master PIN</Text>
                    <TextInput
                      accessibilityLabel="Master PIN"
                      style={s.input}
                      value={pin}
                      onChangeText={setPin}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      textContentType="none"
                      maxLength={32}
                      editable={!busy}
                      placeholder="Enter master PIN"
                      placeholderTextColor={palette.muted}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (pin.trim().length >= 4 && !busy) submit();
                      }}
                    />
                  </View>
                  {error ? (
                    <View style={s.alert}>
                      <Text accessibilityRole="alert" style={s.errorText}>
                        {error}
                      </Text>
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || pin.trim().length < 4 || !online}
                    style={[
                      s.action,
                      change.kind === "remove" ? s.danger : s.primary,
                      (busy || pin.trim().length < 4 || !online) && s.disabled,
                    ]}
                    onPress={submit}
                  >
                    {busy ? (
                      <ActivityIndicator
                        color={
                          change.kind === "remove" ? palette.red : palette.white
                        }
                      />
                    ) : null}
                    <Text
                      style={[
                        s.actionText,
                        change.kind === "remove" ? s.dangerText : s.primaryText,
                      ]}
                    >
                      {busy
                        ? "Saving…"
                        : change.kind === "remove"
                          ? "Remove QR"
                          : change.kind === "resize"
                            ? "Save print size"
                            : "Save payment QR"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    style={s.textButton}
                    onPress={cancelChange}
                  >
                    <Text style={s.textButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={s.intro}>
                    <Text style={s.kicker}>UPI payments</Text>
                    <Text style={s.title}>Scan to pay</Text>
                    <Text style={s.subtitle}>
                      Show this code to your customer.
                    </Text>
                  </View>
                  {notice ? (
                    <View style={[s.alert, s.success]}>
                      <Text
                        accessibilityLiveRegion="polite"
                        style={s.successText}
                      >
                        {notice}
                      </Text>
                    </View>
                  ) : null}
                  {error ? (
                    <View style={s.alert}>
                      <Text accessibilityRole="alert" style={s.errorText}>
                        {error}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        style={s.textButton}
                        onPress={() => void refresh(true)}
                      >
                        <Text style={s.dangerText}>Try again</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {loading ? (
                    <View style={s.empty}>
                      <ActivityIndicator size="large" color={palette.green} />
                      <Text style={s.subtitle}>Loading the current QR…</Text>
                    </View>
                  ) : qr ? (
                    <>
                      <View style={s.qrCard}>
                        <Image
                          source={{ uri: qr.imageDataUrl }}
                          style={[
                            s.image,
                            { width: imageSize, height: imageSize },
                          ]}
                          resizeMode="contain"
                          accessibilityLabel={`Payment QR for ${qr.payeeName || qr.upiId}`}
                        />
                        <View style={s.recipient}>
                          <Text style={s.payee}>
                            {qr.payeeName || "UPI payment"}
                          </Text>
                          <Text style={s.upiId} selectable>
                            {qr.upiId}
                          </Text>
                        </View>
                        <View style={s.upiBadge}>
                          <Text style={s.upiBadgeText}>
                            Pay with any UPI app
                          </Text>
                        </View>
                      </View>
                      <Text style={s.note}>
                        Confirm receipt in the receiving payment app before
                        marking the bill paid.
                      </Text>
                      <View style={[s.toolbar, stackActions && s.toolbarStack]}>
                        {Platform.OS === "android" ? (
                          <Pressable
                            accessibilityRole="button"
                            disabled={busy || !online}
                            style={[
                              s.action,
                              !stackActions && s.toolbarAction,
                              (busy || !online) && s.disabled,
                            ]}
                            onPress={() => void exportImage(true)}
                          >
                            <Download
                              size={17}
                              color={palette.ink}
                              strokeWidth={1.7}
                            />
                            <Text style={s.actionText}>Download PNG</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          accessibilityRole="button"
                          disabled={busy || !online}
                          style={[
                            s.action,
                            !stackActions && s.toolbarAction,
                            (busy || !online) && s.disabled,
                          ]}
                          onPress={() => void exportImage()}
                        >
                          <Share2
                            size={17}
                            color={palette.ink}
                            strokeWidth={1.7}
                          />
                          {busy ? (
                            <ActivityIndicator color={palette.green} />
                          ) : null}
                          <Text style={s.actionText}>
                            {busy
                              ? "Preparing…"
                              : Platform.OS === "android"
                                ? "Share QR"
                                : "Save / share QR image"}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  ) : !error ? (
                    <View style={s.empty}>
                      <View style={s.emptyIcon}>
                        <QrCode
                          size={30}
                          color={palette.muted}
                          strokeWidth={1.5}
                        />
                      </View>
                      <Text style={s.emptyTitle}>No payment QR yet</Text>
                      <Text style={s.subtitle}>
                        {canManage
                          ? "Upload your Google Pay, PhonePe or other UPI QR. One image works across all bills and staff devices."
                          : "Ask the owner or captain to add the restaurant’s payment QR."}
                      </Text>
                    </View>
                  ) : null}
                  {canManage ? (
                    <View style={s.management}>
                      <Pressable
                        accessibilityRole="button"
                        style={s.textButton}
                        onPress={() => setManageOpen((value) => !value)}
                      >
                        <Text style={s.textButtonText}>
                          {manageOpen
                            ? "Hide QR settings"
                            : "Manage payment QR"}{" "}
                          · Master PIN
                        </Text>
                      </Pressable>
                      {manageOpen ? (
                        <>
                          <Text style={s.managementTitle}>
                            Shared across this restaurant
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            style={[s.action, s.primary, !online && s.disabled]}
                            disabled={!online || busy}
                            onPress={() => {
                              setPin("");
                              void pickImage();
                            }}
                          >
                            <Text style={[s.actionText, s.primaryText]}>
                              {qr ? "Replace QR image" : "Upload QR image"}
                            </Text>
                          </Pressable>
                          {qr ? (
                            <View
                              style={[
                                s.toolbar,
                                stackActions && s.toolbarStack,
                              ]}
                            >
                              <Pressable
                                accessibilityRole="button"
                                style={[
                                  s.action,
                                  !stackActions && s.toolbarAction,
                                ]}
                                onPress={() => {
                                  setPin("");
                                  setChange({
                                    kind: "resize",
                                    imageDataUrl: qr.imageDataUrl,
                                    sizeMm: qr.sizeMm,
                                    expectedUpdatedAt: qr.updatedAt,
                                  });
                                }}
                              >
                                <Text style={s.actionText}>
                                  Print size · {qr.sizeMm} mm
                                </Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                style={[s.action, s.danger]}
                                onPress={() => {
                                  setPin("");
                                  setChange({
                                    kind: "remove",
                                    expectedUpdatedAt: qr.updatedAt,
                                  });
                                }}
                              >
                                <Text style={[s.actionText, s.dangerText]}>
                                  Remove
                                </Text>
                              </Pressable>
                            </View>
                          ) : null}
                          <Text style={s.note}>
                            PNG or JPEG, up to 2 MB. Saved changes apply to
                            newly printed bills.
                          </Text>
                        </>
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
