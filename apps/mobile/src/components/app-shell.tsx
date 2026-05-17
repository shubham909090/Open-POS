import { useEffect, useRef, type ReactNode } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { formatRupees } from "../lib/mobile-format";
import type { ConnectionState, ViewMode } from "../lib/mobile-types";
import { palette, styles } from "../styles/app-styles";

function AppHeader({
  connection,
  title,
  subtitle,
  onSetupPress
}: {
  connection: ConnectionState;
  title: string;
  subtitle: string;
  onSetupPress: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.kicker}>Gaurav POS</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.muted} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={styles.headerActions}>
        <StatusPill connection={connection} />
        <Pressable style={styles.iconButton} onPress={onSetupPress} hitSlop={8}>
          <Text style={styles.iconButtonText}>Setup</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatusPill({ connection }: { connection: ConnectionState }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (connection === "offline") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [connection, pulseAnim]);
  return (
    <View style={[styles.statusPill, styles[`status_${connection}`]]}>
      {connection === "checking" ? (
        <ActivityIndicator size="small" />
      ) : (
        <Animated.View style={[styles.dot, styles[connection], connection === "offline" ? { opacity: pulseAnim } : undefined]} />
      )}
      <Text style={styles.statusText}>{connection === "online" ? "Online" : connection === "offline" ? "Offline" : "Checking"}</Text>
    </View>
  );
}

function OnboardingScreen({
  connection,
  formRevision,
  hubUrl,
  deviceToken,
  pairingCode,
  pairingPayload,
  hasSavedToken,
  loading,
  message,
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
  deviceToken: string;
  pairingCode: string;
  pairingPayload: string;
  hasSavedToken: boolean;
  loading: boolean;
  message: string;
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
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="always">
      <View style={styles.heroPanel}>
        <Text style={styles.kicker}>Phone Setup</Text>
        <Text style={styles.heroTitle}>Connect this phone to the hub PC.</Text>
        <Text style={styles.heroCopy}>Keep this phone on the same Wi-Fi as the hub. Scanning the QR is the easiest way.</Text>
      </View>

      <View style={styles.stepCard}>
        <StepNumber value="1" label="Find Hub" />
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
        <View style={styles.buttonStack}>
          <Pressable style={styles.primaryButton} onPress={onSaveConnection} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? "Checking..." : "Save And Check Hub"}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onRetry} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.stepCard}>
        <StepNumber value="2" label="Pair This Phone" />
        <Pressable style={styles.scanButton} onPress={onScan}>
          <Text style={styles.scanButtonText}>Scan Hub QR</Text>
          <Text style={styles.scanButtonMeta}>Recommended</Text>
        </Pressable>
        <UncontrolledInput
          inputKey={`pair-code-${formRevision}`}
          label="Pairing code"
          defaultValue={pairingCode}
          onChangeText={onPairingCodeChange}
          keyboardType="number-pad"
          returnKeyType="done"
          placeholder="Six digits"
        />
        <UncontrolledInput
          inputKey={`payload-${formRevision}`}
          label="Paste QR text"
          defaultValue={pairingPayload}
          onChangeText={onPairingPayloadChange}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          placeholder="Use this only if scanning is not available"
        />
        <Pressable style={styles.primaryButton} onPress={onPair}>
          <Text style={styles.primaryButtonText}>Pair Phone</Text>
        </Pressable>
      </View>

      <View style={styles.stepCard}>
        <StepNumber value="3" label="Ready For Orders" />
        <Text style={styles.muted}>
          {connection === "online" && hasSavedToken
            ? "This phone is connected. Start taking table orders."
            : "Once the phone is paired and the hub is online, orders can be sent to the kitchen."}
        </Text>
        <UncontrolledInput
          inputKey={`token-${formRevision}`}
          label="Saved device password"
          defaultValue={deviceToken}
          onChangeText={onDeviceTokenChange}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Filled by pairing"
        />
        <Pressable
          style={[styles.primaryButton, (connection !== "online" || !hasSavedToken) && styles.buttonDisabled]}
          onPress={onStart}
          disabled={connection !== "online" || !hasSavedToken}
        >
          <Text style={styles.primaryButtonText}>Start Taking Orders</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
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

function ConnectionBanner({ message, savingDraft }: { message: string; savingDraft: boolean }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{message}</Text>
      {savingDraft ? <Text style={styles.bannerMeta}>Saving draft...</Text> : null}
    </View>
  );
}

function ModeTabs({ mode, onModeChange, newItemCount }: { mode: ViewMode; onModeChange: (mode: ViewMode) => void; newItemCount: number }) {
  return (
    <View style={styles.modeTabs}>
      {(["tables", "menu", "ticket"] as ViewMode[]).map((entry) => (
        <Pressable key={entry} style={[styles.modeTab, mode === entry && styles.modeTabActive]} onPress={() => onModeChange(entry)}>
          <Text style={[styles.modeTabText, mode === entry && styles.modeTabTextActive]}>
            {entry === "tables" ? "Tables" : entry === "menu" ? "Menu" : "Check"}
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
  accentColor,
  children
}: {
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  accentColor?: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.collapsibleWrap, accentColor ? { borderLeftWidth: 4, borderLeftColor: accentColor } : undefined]}>
      <Pressable style={[styles.collapsibleHeader, expanded && styles.collapsibleHeaderExpanded]} onPress={onToggle}>
        <View style={styles.flexText}>
          <Text style={styles.collapsibleTitle}>{title}</Text>
          {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.collapsibleChevron}>{expanded ? "\u25BC" : "\u25B6"}</Text>
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
  const slideAnim = useRef(new Animated.Value(100)).current;
  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 9 }).start();
  }, [slideAnim]);
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
