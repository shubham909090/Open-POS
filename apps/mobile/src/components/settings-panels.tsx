import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import type { RestaurantBranding } from "@gaurav-pos/shared";

import type { useMobileUpdate } from "../hooks/use-mobile-update";
import type { RestaurantBrandingDraft } from "../hooks/use-restaurant-branding";
import { palette, styles } from "../styles/app-styles";
import { settingsStyles as s } from "../styles/settings-styles";
import { BrandMark, DEFAULT_BRAND_NAME, brandDisplayName } from "./brand-mark";
import { cropRestaurantIcon, isRestaurantIconCropSupported, isRestaurantShortcutSupported, requestRestaurantShortcut } from "../../modules/restaurant-shortcut";
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
  const savedCropKey = JSON.stringify(branding?.iconCrop ?? null);
  const savedUpdatedAt = branding?.updatedAt ?? null;
  const [name, setName] = useState(savedName);
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [iconCrop, setIconCrop] = useState<RestaurantBrandingDraft["iconCrop"]>(undefined);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [cropError, setCropError] = useState("");
  const previousSaved = useRef({ name: savedName, logo: savedLogo, crop: savedCropKey, updatedAt: savedUpdatedAt });
  const [remoteChanged, setRemoteChanged] = useState(false);
  // Preserve an unfinished edit if another device changes the shared branding.
  useEffect(() => {
    if (busy) return;
    const previous = previousSaved.current;
    if (savedName === previous.name && savedLogo === previous.logo && savedCropKey === previous.crop && savedUpdatedAt === previous.updatedAt) return;
    if (!cropping && name === previous.name && logo === undefined && iconCrop === undefined) {
      setName(savedName);
      setIconPreview(null);
    } else if (cropping || name !== savedName || (logo !== undefined && logo !== savedLogo) || (iconCrop !== undefined && JSON.stringify(iconCrop) !== savedCropKey)) {
      setRemoteChanged(true);
    }
    previousSaved.current = { name: savedName, logo: savedLogo, crop: savedCropKey, updatedAt: savedUpdatedAt };
  }, [savedName, savedLogo, savedCropKey, savedUpdatedAt, busy, cropping]);

  const previewLogo = logo === undefined ? savedLogo : logo;
  const previewIcon = iconCrop === null ? previewLogo : iconPreview || (logo === undefined ? branding?.iconImageDataUrl ?? savedLogo : previewLogo);
  const dirty = name.trim() !== savedName.trim() || logo !== undefined || iconCrop !== undefined || remoteChanged;
  const cropSupported = isRestaurantIconCropSupported();
  const hubCropSupported = Boolean(branding && "iconCrop" in branding);
  const disabled = !online || busy || cropping;
  const reset = () => { setName(savedName); setLogo(undefined); setIconCrop(undefined); setIconPreview(null); setCropError(""); setPin(""); setRemoteChanged(false); };
  const adjustIcon = async () => {
    if (!previewLogo) return;
    setCropping(true);
    setCropError("");
    try {
      const result = await cropRestaurantIcon(previewLogo, iconCrop === undefined ? branding?.iconCrop : iconCrop);
      if (result) {
        setIconCrop(result.crop);
        setIconPreview(result.previewImageDataUrl);
      }
    } catch {
      setCropError("Could not adjust the icon. Try again.");
    } finally {
      setCropping(false);
    }
  };
  const submit = async () => {
    const submittedPin = pin.trim();
    setPin("");
    if (await onSave({ restaurantName: name, imageDataUrl: logo, iconCrop }, submittedPin)) { setLogo(undefined); setIconCrop(undefined); setIconPreview(null); setRemoteChanged(false); }
  };

  return (
    <SettingsSection title="Restaurant">
      <View style={s.brandEditorRow}>
        <BrandMark branding={branding} previewUri={previewLogo} previewName={name} size={56} />
        <View style={s.brandEditorActions}>
          <Pressable accessibilityLabel={previewLogo ? "Replace logo" : "Upload logo"} style={[s.smallButton, s.brandAction, disabled && styles.buttonDisabled]} disabled={disabled} onPress={async () => {
            const picked = await onPickLogo();
            if (picked) { setLogo(picked); setIconCrop(null); setIconPreview(null); setCropError(""); }
          }}>
            <Text style={s.smallButtonText}>{previewLogo ? "Replace" : "Upload"}</Text>
          </Pressable>
          {previewLogo ? (
            <Pressable accessibilityLabel="Remove logo" style={[s.smallButton, s.brandAction, s.removeLogoButton, disabled && styles.buttonDisabled]} disabled={disabled} onPress={() => { setLogo(null); setIconCrop(null); setIconPreview(null); setCropError(""); }}>
              <Text style={[s.smallButtonText, s.textButtonDanger]}>Remove</Text>
            </Pressable>
          ) : (
            <Text style={[styles.smallMuted, s.brandAction]}>PNG / JPEG · 2 MB max</Text>
          )}
        </View>
      </View>
      {previewLogo ? (
        <View style={s.brandIconRow}>
          <BrandMark branding={branding} previewUri={previewIcon} previewName={name} size={44} />
          <View style={s.brandIconControls}>
            <Text style={styles.inputLabel}>App icon</Text>
            <View style={s.brandIconActions}>
              <Pressable accessibilityLabel="Adjust restaurant icon" style={[s.smallButton, (!cropSupported || !hubCropSupported || disabled) && styles.buttonDisabled]} disabled={!cropSupported || !hubCropSupported || disabled} onPress={() => void adjustIcon()}>
                <Text style={s.smallButtonText}>{cropping ? "Opening…" : "Adjust icon"}</Text>
              </Pressable>
              {(iconCrop === undefined ? branding?.iconCrop : iconCrop) ? (
                <Pressable accessibilityLabel="Reset restaurant icon" style={[s.smallButton, disabled && styles.buttonDisabled]} disabled={disabled} onPress={() => { setIconCrop(null); setIconPreview(null); setCropError(""); }}>
                  <Text style={s.smallButtonText}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}
      {previewLogo && (!cropSupported || !hubCropSupported) ? <Text style={styles.smallMuted}>{!hubCropSupported ? "Update Hub to adjust the icon." : "Update Android app to adjust the icon."}</Text> : null}
      {cropError ? <Text style={styles.dangerText} accessibilityLiveRegion="polite">{cropError}</Text> : null}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Restaurant name</Text>
        <TextInput
          accessibilityLabel="Restaurant name"
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={160}
          editable={!disabled}
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
            <Pressable style={[styles.secondaryButton, styles.sendButton]} onPress={reset} disabled={busy || cropping}>
              <Text style={styles.secondaryButtonText}>Discard</Text>
            </Pressable>
            <Button label={busy ? "Saving…" : logo === null && name.trim() === savedName.trim() ? "Remove logo" : "Save"} style={styles.sendButton} disabled={busy || cropping || !pin.trim() || remoteChanged} onPress={() => void submit()} />
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

export function RestaurantShortcutSettings({ branding }: { branding: RestaurantBranding | null }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const supported = isRestaurantShortcutSupported();
  async function addShortcut() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestRestaurantShortcut({ name: brandDisplayName(branding), logoImageDataUrl: branding?.iconImageDataUrl ?? branding?.logoImageDataUrl ?? null });
      setNotice(result === "updated" ? "Home screen shortcut updated." : result === "requested" ? "Confirm on your home screen to add the shortcut." : "This launcher does not support home screen shortcuts.");
    } catch {
      setError("Could not add the shortcut. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsSection title="App icon">
      <Pressable style={[styles.secondaryButton, (!supported || busy) && styles.buttonDisabled]} disabled={!supported || busy} onPress={() => void addShortcut()}>
        <Text style={styles.secondaryButtonText}>{busy ? "Opening…" : "Add to home screen"}</Text>
      </Pressable>
      {!supported ? <Text style={styles.smallMuted}>Available in the updated Android app.</Text> : null}
      {notice ? <Text style={styles.smallMuted} accessibilityLiveRegion="polite">{notice}</Text> : null}
      {error ? <Text style={styles.dangerText} accessibilityLiveRegion="polite">{error}</Text> : null}
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
