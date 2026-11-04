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
  const stackActions = fontScale >= 1.6;
  const reducedMotion = useReducedMotion();
  const imageSize = Math.max(150, Math.min(320, width - 64));
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
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.column}>
              {change ? (
                <View style={s.form}>
                  <Text style={s.formTitle}>
                    {change.kind === "remove"
                      ? "Remove payment QR?"
                      : qr
                          ? "Replace payment QR"
                          : "Add payment QR"}
                  </Text>
                  <Text style={s.formCopy}>
                    {change.kind === "remove"
                      ? "Removes the QR from new bills and staff devices."
                      : "Applies to bills and staff devices."}
                  </Text>
                  {change.kind !== "remove" ? (
                    <>
                      <Image
                        source={{ uri: change.imageDataUrl }}
                        style={s.selectedImage}
                        resizeMode="contain"
                        accessibilityLabel="Selected payment QR image"
                      />

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
                          : "Save QR"}
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
                      <Text style={s.subtitle}>Loading…</Text>
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
                      </View>
                      <Text style={s.note}>Confirm payment in your UPI app.</Text>
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
                            <Text style={s.actionText}>Download</Text>
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
                                ? "Share"
                                : "Share"}
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
                          ? "Upload your UPI QR below."
                          : "Ask your captain to add a QR."}
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
                            ? "Close settings"
                            : "Manage QR"}
                        </Text>
                      </Pressable>
                      {manageOpen ? (
                        <>
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
                            Master PIN required · PNG / JPEG, 2 MB max.
QR size: Hub → Printers.
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
