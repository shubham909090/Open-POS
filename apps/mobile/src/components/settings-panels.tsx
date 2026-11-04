import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import type { RestaurantBranding } from "@gaurav-pos/shared";

import type { useMobileUpdate } from "../hooks/use-mobile-update";
import type { RestaurantBrandingDraft } from "../hooks/use-restaurant-branding";
import { palette, styles } from "../styles/app-styles";
import { settingsStyles as s } from "../styles/settings-styles";
import { BrandMark, DEFAULT_BRAND_NAME } from "./brand-mark";
import { Pressable } from "./pressable";
import { Button } from "./ui-primitives";

export function SettingsSection({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta ? <Text style={styles.muted}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function BrandingSettings({
  branding,
  online,
  busy,
  error,
  notice,
  onPickLogo,
  onSave
}: {
  branding: RestaurantBranding | null;
  online: boolean;
  busy: boolean;
  error: string;
  notice: string;
  onPickLogo: () => Promise<string | null>;
  onSave: (draft: RestaurantBrandingDraft, pin: string) => Promise<boolean>;
}) {
  const savedName = branding?.restaurantName ?? "";
  const savedLogo = branding?.logoImageDataUrl ?? null;
  const [name, setName] = useState(savedName);
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [pin, setPin] = useState("");
  const previousSaved = useRef({ name: savedName, logo: savedLogo });
  const [remoteChanged, setRemoteChanged] = useState(false);
  // Preserve an unfinished edit if another device changes the shared branding.
  useEffect(() => {
    if (busy) return;
    if (savedName === previousSaved.current.name && savedLogo === previousSaved.current.logo) return;
    if (name === previousSaved.current.name && logo === undefined) setName(savedName);
    else if (name !== savedName || (logo !== undefined && logo !== savedLogo)) setRemoteChanged(true);
    previousSaved.current = { name: savedName, logo: savedLogo };
  }, [savedName, savedLogo, busy]);

  const previewLogo = logo === undefined ? savedLogo : logo;
  const dirty = name.trim() !== savedName.trim() || logo !== undefined || remoteChanged;
  const reset = () => { setName(savedName); setLogo(undefined); setPin(""); setRemoteChanged(false); };
  const submit = async () => {
    const submittedPin = pin.trim();
    setPin("");
    if (await onSave({ restaurantName: name, imageDataUrl: logo }, submittedPin)) { setLogo(undefined); setRemoteChanged(false); }
  };

  return (
    <SettingsSection title="Restaurant">
      <View style={s.brandEditorRow}>
        <BrandMark branding={branding} previewUri={previewLogo} size={56} />
        <View style={s.brandEditorActions}>
          <Pressable style={[s.smallButton, (!online || busy) && styles.buttonDisabled]} disabled={!online || busy} onPress={async () => {
            const picked = await onPickLogo();
            if (picked) setLogo(picked);
          }}>
            <Text style={s.smallButtonText}>{previewLogo ? "Replace logo" : "Upload logo"}</Text>
          </Pressable>
          {previewLogo ? (
            <Pressable style={[s.textButton, (!online || busy) && styles.buttonDisabled]} disabled={!online || busy} onPress={() => setLogo(null)}>
              <Text style={s.textButtonDanger}>Remove logo</Text>
            </Pressable>
          ) : (
            <Text style={styles.smallMuted}>PNG / JPEG · 2 MB max</Text>
          )}
        </View>
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Restaurant name</Text>
        <TextInput
          accessibilityLabel="Restaurant name"
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={160}
          editable={online && !busy}
          placeholder={DEFAULT_BRAND_NAME}
          placeholderTextColor={palette.muted}
          returnKeyType="done"
        />
      </View>
      {dirty ? (
        <View style={s.approvalBlock}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Master PIN</Text>
            <TextInput
              accessibilityLabel="Master PIN for restaurant branding"
              style={styles.input}
              value={pin}
              onChangeText={setPin}
              secureTextEntry
              keyboardType="number-pad"
              placeholder="Required to save"
              placeholderTextColor={palette.muted}
            />
          </View>
          <View style={styles.sendButtonRow}>
            <Pressable style={[styles.secondaryButton, styles.sendButton]} onPress={reset} disabled={busy}>
              <Text style={styles.secondaryButtonText}>Discard</Text>
            </Pressable>
            <Button label={busy ? "Saving…" : logo === null && name.trim() === savedName.trim() ? "Remove logo" : "Save"} style={styles.sendButton} disabled={busy || !pin.trim() || remoteChanged} onPress={() => void submit()} />
          </View>
        </View>
      ) : null}
      {!online ? <Text style={styles.smallMuted}>Connect to edit.</Text> : null}
      {remoteChanged ? <Text style={styles.dangerText} accessibilityLiveRegion="polite">Changed on another device. Discard to reload.</Text> : null}
      {error ? <Text style={styles.dangerText} accessibilityLiveRegion="polite">{error}</Text> : null}
      {notice && !dirty ? <Text style={s.successText} accessibilityLiveRegion="polite">{notice}</Text> : null}
    </SettingsSection>
  );
}

type MobileUpdateState = ReturnType<typeof useMobileUpdate>;

export function MobileUpdatePanel({ update }: { update: MobileUpdateState }) {
  const { status, supported, currentVersion, availableVersion, progress, error } = update;
  const working = status === "checking" || status === "downloading" || status === "verifying" || status === "installing";
  const percent = Math.round(progress * 100);
  const headline = !supported
    ? "Android app required."
    : status === "checking" ? "Checking…"
    : status === "up_to_date" ? "No update available."
    : status === "available" ? `Version ${availableVersion} available`
    : status === "downloading" ? `Downloading version ${availableVersion} · ${percent}%`
    : status === "verifying" ? "Verifying…"
    : status === "ready" ? `Version ${availableVersion} ready`
    : status === "installing" ? "Opening installer…"
    : status === "installer_opened" ? "Confirm installation in Android."
    : status === "error" ? error || "Update failed."
    : "";

  return (
    <SettingsSection title="App update" meta={`Version ${currentVersion || "unknown"}`}>
      {headline ? <View style={s.updateStatusRow}>
        {working ? <ActivityIndicator size="small" color={palette.green} /> : null}
        <Text style={[s.updateHeadline, status === "error" && styles.dangerText]} accessibilityLiveRegion="polite">{headline}</Text>
      </View> : null}
      {status === "downloading" ? (
        <View style={s.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
          <View style={[s.progressFill, { width: `${percent}%` }]} />
        </View>
      ) : null}
      {status === "available" || status === "ready" || status === "installer_opened" || (status === "error" && availableVersion) ? (
        <Text style={styles.smallMuted}>
          Pairing and saved drafts are kept.
        </Text>
      ) : null}
      {supported ? <UpdateActions update={update} /> : null}
    </SettingsSection>
  );
}

function UpdateActions({ update }: { update: MobileUpdateState }) {
  const { status, availableVersion } = update;
  if (status === "downloading" || status === "verifying") {
    return (
      <Pressable style={styles.secondaryButton} onPress={update.cancel}>
        <Text style={styles.secondaryButtonText}>Cancel download</Text>
      </Pressable>
    );
  }
  if (status === "checking" || status === "installing") return null;
  if (status === "available") {
    return (
      <Pressable style={styles.primaryButton} onPress={() => void update.downloadAndInstall()}>
        <Text style={styles.primaryButtonText}>Download and install</Text>
      </Pressable>
    );
  }
  if (status === "ready") {
    return (
      <Pressable style={styles.primaryButton} onPress={() => void update.retryInstall()}>
        <Text style={styles.primaryButtonText}>Install update</Text>
      </Pressable>
    );
  }
  if (status === "installer_opened" || (status === "error" && availableVersion)) {
    return (
      <View style={styles.sendButtonRow}>
        <Pressable style={[styles.secondaryButton, styles.sendButton]} onPress={() => void update.openInstallPermission()}>
          <Text style={styles.secondaryButtonText}>Allow installs</Text>
        </Pressable>
        <Pressable style={[styles.primaryButton, styles.sendButton]} onPress={() => void update.retryInstall()}>
          <Text style={styles.primaryButtonText}>{status === "error" ? "Try again" : "Open installer"}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable style={styles.secondaryButton} onPress={() => void update.check()}>
      <Text style={styles.secondaryButtonText}>{status === "up_to_date" || status === "error" ? "Check again" : "Check for updates"}</Text>
    </Pressable>
  );
}
