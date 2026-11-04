import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, ScrollView, Text, TextInput, View } from "react-native";
import { Pressable } from "./pressable";

import { formatRupees } from "../lib/mobile-format";
import type { ConnectionState, ViewMode } from "../lib/mobile-types";
import { palette, styles } from "../styles/app-styles";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { QrCode, Settings2, X } from "lucide-react-native";
import type { RestaurantBranding } from "@gaurav-pos/shared";
import { BrandMark, brandDisplayName } from "./brand-mark";

function AppHeader({
  connection,
  title,
  subtitle,
  onSetupPress,
  onPaymentQrPress,
  onBackPress,
  setupVisible = false,
  branding,
}: {
  branding: RestaurantBranding | null;
  connection: ConnectionState;
  title: string;
  subtitle: string;
  onSetupPress: () => void;
  onPaymentQrPress?: () => void;
  onBackPress?: () => void;
  setupVisible?: boolean;
}) {
  return (
    <View>
      <View style={styles.header}>
        <BrandMark branding={branding} size={40} />
        <View style={styles.headerText}>
          <View style={styles.headerBrandRow}>
            <Text style={[styles.kicker, styles.headerBrandName]} numberOfLines={1}>{brandDisplayName(branding)}</Text>
            <StatusPill connection={connection} />
          </View>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.muted} numberOfLines={1}>{subtitle}</Text>
        </View>
        <View style={styles.headerActions}>
          {onPaymentQrPress ? (
            <Pressable accessibilityLabel="Show payment QR" style={[styles.iconButton, styles.paymentHeaderButton]} onPress={onPaymentQrPress}>
              <QrCode size={19} color={palette.greenBold} strokeWidth={1.7} />
            </Pressable>
          ) : null}
          {setupVisible ? onBackPress ? (
            <Pressable accessibilityLabel="Return to service" style={styles.iconButton} onPress={onBackPress}>
              <X size={19} color={palette.muted} strokeWidth={1.7} />
            </Pressable>
          ) : null : (
            <Pressable accessibilityLabel="Connection settings" style={styles.iconButton} onPress={onSetupPress} hitSlop={4}>
              <Settings2 size={19} color={palette.muted} strokeWidth={1.7} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function StatusPill({ connection }: { connection: ConnectionState }) {
  return (
    <View style={[styles.statusPill, styles[`status_${connection}`]]}>
      {connection === "checking" ? (
        <ActivityIndicator size="small" />
      ) : (
        <View style={[styles.dot, styles[connection]]} />
      )}
      <Text style={styles.statusText}>{connection === "online" ? "Online" : connection === "offline" ? "Offline" : "Checking"}</Text>
    </View>
  );
}

function OnboardingScreen({
  connection,
  formRevision,
  hubUrl,
  savedHubUrl,
  deviceToken,
  pairingCode,
  pairingPayload,
  hasSavedToken,
  deviceName,
  deviceRole,
  branding,
  loading,
  message,
  extraSections,
  onHubUrlChange,
  onDeviceTokenChange,
  onPairingCodeChange,
  onPairingPayloadChange,
  onRetry,
  onSaveConnection,
  onScan,
  onPair,
  onStart
}: {
  connection: ConnectionState;
  formRevision: number;
  hubUrl: string;
  savedHubUrl: string;
  deviceToken: string;
  pairingCode: string;
  pairingPayload: string;
  hasSavedToken: boolean;
  deviceName: string;
  deviceRole: string;
  branding: RestaurantBranding | null;
  loading: boolean;
  message: string;
  extraSections?: ReactNode;
  onHubUrlChange: (value: string) => void;
  onDeviceTokenChange: (value: string) => void;
  onPairingCodeChange: (value: string) => void;
  onPairingPayloadChange: (value: string) => void;
  onRetry: () => void;
  onSaveConnection: () => void;
  onScan: () => void;
  onPair: () => void;
  onStart: () => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const isOnline = connection === "online";
  const isReady = isOnline && hasSavedToken;
  const [pairingOpen, setPairingOpen] = useState(!isReady);
  // Exactly one solid action at a time: connect while offline, scan while online but unpaired,
  // otherwise return to service. Everything else stays outlined.
  const connectIsPrimary = !isOnline;
  const scanIsPrimary = isOnline && !hasSavedToken;
  const pairingSteps = (
    <>
      <View style={styles.stepCard}>
        <StepNumber value="1" label="Hub connection" />
        <Text style={styles.muted}>{message}</Text>
        <UncontrolledInput
          inputKey={`hub-${formRevision}`}
          label="Hub address"
          defaultValue={hubUrl}
          onChangeText={onHubUrlChange}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          placeholder="http://192.168.1.202:3737"
        />
        <View style={styles.sendButtonRow}>
          <Pressable style={[styles.secondaryButton, styles.sendButton]} onPress={onRetry} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Retry</Text>
          </Pressable>
          <Pressable style={[connectIsPrimary ? styles.primaryButton : styles.secondaryButton, styles.sendButton, loading && styles.buttonDisabled]} onPress={onSaveConnection} disabled={loading}>
            <Text style={connectIsPrimary ? styles.primaryButtonText : styles.secondaryButtonText}>{loading ? "Checking…" : "Save and connect"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.stepCard}>
        <StepNumber value="2" label="Pair this phone" />
        <Pressable style={scanIsPrimary ? styles.scanButton : styles.secondaryButton} onPress={onScan}>
          <Text style={scanIsPrimary ? styles.scanButtonText : styles.secondaryButtonText}>Scan pairing QR</Text>
        </Pressable>
        <View style={styles.pairCodeRow}>
          <View style={styles.flexText}>
            <UncontrolledInput
              inputKey={`pair-code-${formRevision}`}
              label="Or enter the six-digit code"
              defaultValue={pairingCode}
              onChangeText={onPairingCodeChange}
              keyboardType="number-pad"
              returnKeyType="done"
              placeholder="Six digits"
            />
          </View>
          <Pressable style={[styles.secondaryButton, styles.pairCodeButton]} onPress={onPair}>
            <Text style={styles.secondaryButtonText}>Pair</Text>
          </Pressable>
        </View>
      </View>

      <CollapsibleSection title="Manual connection" subtitle="QR text and device password" expanded={manualOpen} onToggle={() => setManualOpen((value) => !value)}>
        <Text style={styles.muted}>Use these fields only if QR scanning or code pairing is unavailable.</Text>
        <UncontrolledInput inputKey={`payload-${formRevision}`} label="Pairing QR text" defaultValue={pairingPayload} onChangeText={onPairingPayloadChange} autoCapitalize="none" autoCorrect={false} multiline placeholder="Paste the pairing text from the hub" />
        <UncontrolledInput inputKey={`token-${formRevision}`} label="Device password" defaultValue={deviceToken} onChangeText={onDeviceTokenChange} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Filled automatically when paired" />
        <Pressable style={styles.secondaryButton} onPress={pairingPayload.trim() ? onPair : onSaveConnection} disabled={loading}>
          <Text style={styles.secondaryButtonText}>{pairingPayload.trim() ? "Pair with QR text" : "Save manual connection"}</Text>
        </Pressable>
      </CollapsibleSection>
    </>
  );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {isReady ? (
        <>
          <View style={styles.connectedHero}>
            <BrandMark branding={branding} size={56} />
            <View style={styles.flexText}>
              <Text style={styles.connectedTitle} numberOfLines={2}>{deviceName || "This phone"}</Text>
              <Text style={styles.muted} numberOfLines={1}>{roleLabel(deviceRole)} · paired with {brandDisplayName(branding)}</Text>
              <Text style={styles.smallMuted} numberOfLines={1}>Connected to {savedHubUrl}</Text>
            </View>
          </View>
          <Pressable style={styles.primaryButton} onPress={onStart}>
            <Text style={styles.primaryButtonText}>Return to service</Text>
          </Pressable>
          <Pressable accessibilityState={{ expanded: pairingOpen }} style={styles.disclosureRow} onPress={() => setPairingOpen((value) => !value)}>
            <View style={styles.flexText}>
              <Text style={styles.collapsibleTitle}>Change hub or re-pair</Text>
              <Text style={styles.muted}>Only needed when moving this phone to another hub.</Text>
            </View>
            <Text style={styles.collapsibleChevron} importantForAccessibility="no">{pairingOpen ? "−" : "+"}</Text>
          </Pressable>
          {pairingOpen ? pairingSteps : null}
        </>
      ) : (
        <>
          <View style={styles.heroPanel}>
            <Text style={styles.heroTitle}>Connect to your hub</Text>
            <Text style={styles.heroCopy}>Join the same Wi-Fi as the hub PC, then scan its pairing QR to start service.</Text>
          </View>
          {pairingSteps}
        </>
      )}
      {extraSections}
    </ScrollView>
  );
}

function roleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "captain") return "Captain";
  if (role === "kitchen") return "Kitchen";
  if (role === "waiter") return "Waiter";
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "Paired";
}

function StepNumber({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepCircle}>
        <Text style={styles.stepCircleText}>{value}</Text>
      </View>
      <Text style={styles.sectionTitle}>{label}</Text>
    </View>
  );
}

function ConnectionBanner({ message, savingDraft, onDismiss }: { message: string; savingDraft: boolean; onDismiss?: () => void }) {
  if (!message && !savingDraft) return null;
  return (
    <View style={styles.banner}>
      <View style={styles.flexText} accessibilityLiveRegion="polite">
        {message ? <Text style={styles.bannerText}>{message}</Text> : null}
        {savingDraft ? <Text style={styles.bannerMeta}>Saving draft...</Text> : null}
      </View>
      {message && onDismiss ? <Pressable accessibilityLabel="Dismiss message" style={styles.searchClear} onPress={onDismiss}><X size={16} color={palette.muted} /></Pressable> : null}
    </View>
  );
}

function ModeTabs({
  mode,
  onModeChange,
  newItemCount,
  showHistory = false
}: {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  newItemCount: number;
  showHistory?: boolean;
}) {
  const tabs: ViewMode[] = showHistory ? ["tables", "menu", "ticket", "history"] : ["tables", "menu", "ticket"];
  return (
    <View style={styles.modeTabs}>
      {tabs.map((entry) => (
        <Pressable key={entry} accessibilityRole="tab" accessibilityState={{ selected: mode === entry }} style={[styles.modeTab, mode === entry && styles.modeTabActive]} onPress={() => onModeChange(entry)}>
          <Text style={[styles.modeTabText, mode === entry && styles.modeTabTextActive]}>
            {entry === "tables" ? "Tables" : entry === "menu" ? "Menu" : entry === "ticket" ? "Check" : "History"}
          </Text>
          {entry === "ticket" && newItemCount > 0 && mode !== "ticket" ? (
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>{newItemCount > 99 ? "99" : String(newItemCount)}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  expanded,
  onToggle,
  children
}: {
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.collapsibleWrap}>
      <Pressable accessibilityState={{ expanded }} style={[styles.collapsibleHeader, expanded && styles.collapsibleHeaderExpanded]} onPress={onToggle}>
        <View style={styles.flexText}>
          <Text style={styles.collapsibleTitle}>{title}</Text>
          {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.collapsibleChevron} importantForAccessibility="no">{expanded ? "−" : "+"}</Text>
      </Pressable>
      {expanded ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryBox}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function LabeledMoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.moneyInputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value}
        onChangeText={(next) => onChange(next.replace(/[^0-9.]/g, "").slice(0, 8))}
        keyboardType="decimal-pad"
        returnKeyType="done"
      />
    </View>
  );
}

function DraftBar({ count, total, onReview }: { count: number; total: number; onReview: () => void }) {
  const reducedMotion = useReducedMotion();
  const slideAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) { slideAnim.setValue(0); return; }
    slideAnim.setValue(12);
    const animation = Animated.timing(slideAnim, { toValue: 0, duration: 160, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, slideAnim]);
  return (
    <Animated.View style={[styles.draftBar, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.draftBarMain}>
        <View style={styles.draftBarBadge}>
          <Text style={styles.draftBarBadgeText}>{count > 99 ? "99" : String(count)}</Text>
        </View>
        <View style={styles.draftBarText}>
          <Text style={styles.draftBarTitle}>{count} new item{count === 1 ? "" : "s"}</Text>
          <Text style={styles.draftBarMeta}>Rs {formatRupees(total)} ready to review</Text>
        </View>
      </View>
      <Pressable style={styles.draftBarButton} onPress={onReview}>
        <Text style={styles.draftBarButtonText}>Review</Text>
      </Pressable>
    </Animated.View>
  );
}

function UncontrolledInput({
  inputKey,
  label,
  defaultValue,
  onChangeText,
  secureTextEntry,
  autoCapitalize,
  autoCorrect,
  keyboardType,
  returnKeyType,
  placeholder,
  multiline
}: {
  inputKey: string;
  label: string;
  defaultValue: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  keyboardType?: "default" | "number-pad" | "decimal-pad" | "url";
  returnKeyType?: "done" | "next" | "search";
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        key={inputKey}
        accessibilityLabel={label}
        defaultValue={defaultValue}
        onChangeText={onChangeText}
        style={[styles.input, multiline && styles.multilineInput]}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

function EmptyState({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return (
    <View style={[styles.empty, compact && styles.emptyCompact]}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

export {
  AppHeader,
  CollapsibleSection,
  ConnectionBanner,
  DraftBar,
  EmptyState,
  LabeledMoneyInput,
  ModeTabs,
  OnboardingScreen,
  SummaryBox,
  UncontrolledInput
};
