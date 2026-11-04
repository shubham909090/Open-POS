import { useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, LockKeyhole, Store } from "lucide-react";
import { RESTAURANT_LOGO_MAX_IMAGE_BYTES } from "@gaurav-pos/shared";
import { hubApi } from "../../hub-api.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";
import { readImageFile } from "../../lib/image-file.js";
import { DEFAULT_BRAND_MARK_URL } from "../../lib/branding.js";
import { SettingsPageActiveContext, SetupCard } from "./setup-card.js";

export function RestaurantBrandingPanel({
  masterPinConfigured,
  requestManagerApproval,
  setNotice,
}: {
  masterPinConfigured: boolean;
  requestManagerApproval: ManagerApprovalRequest;
  setNotice: NoticeSetter;
}) {
  const queryClient = useQueryClient();
  const active = useContext(SettingsPageActiveContext);
  const current = useQuery({
    queryKey: ["restaurant-branding"],
    queryFn: hubApi.restaurantBranding,
    enabled: active,
  });
  const branding = current.data?.branding;
  const [name, setName] = useState("");
  const [newLogo, setNewLogo] = useState("");
  const [reading, setReading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [loadedBranding, setLoadedBranding] = useState<typeof branding>();
  const [conflict, setConflict] = useState(false);
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadedVersion = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!branding || loadedVersion.current === branding.updatedAt) return;
    if (dirty.current) {
      setConflict(true);
      return;
    }
    loadedVersion.current = branding.updatedAt;
    setLoadedBranding(branding);
    setName(branding.restaurantName);
    setNewLogo("");
    setConflict(false);
  }, [branding]);

  const onSaved = (result: { branding: NonNullable<typeof branding> }, text: string) => {
    dirty.current = false;
    loadedVersion.current = result.branding.updatedAt;
    setLoadedBranding(result.branding);
    setName(result.branding.restaurantName);
    setNewLogo("");
    setConflict(false);
    queryClient.setQueryData(["restaurant-branding"], result);
    setNotice({ tone: "good", text });
  };
  const save = useMutation({
    mutationFn: (input: Parameters<typeof hubApi.updateRestaurantBranding>[0]) => hubApi.updateRestaurantBranding(input),
    onSuccess: (result) => onSaved(result, "Restaurant name and logo saved. New bills use them."),
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const remove = useMutation({
    mutationFn: (input: Parameters<typeof hubApi.removeRestaurantLogo>[0]) => hubApi.removeRestaurantLogo(input),
    onSuccess: (result) => onSaved(result, "Logo removed. New bills print the name only."),
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const busy = reading || save.isPending || remove.isPending;
  const locked = !masterPinConfigured;
  const trimmedName = name.trim();
  const changed = Boolean(loadedBranding) && (Boolean(newLogo) || trimmedName !== loadedBranding?.restaurantName);
  dirty.current = changed;
  const shownLogo = newLogo || loadedBranding?.logoImageDataUrl || "";

  const discardChanges = () => {
    dirty.current = false;
    loadedVersion.current = branding?.updatedAt;
    setLoadedBranding(branding);
    setName(branding?.restaurantName ?? "");
    setNewLogo("");
    setConflict(false);
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setImageError("");
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > RESTAURANT_LOGO_MAX_IMAGE_BYTES) {
      setImageError("Choose a PNG or JPG logo smaller than 2 MB.");
      return;
    }
    setReading(true);
    try {
      setNewLogo(await readImageFile(file));
    } catch (error) {
      setImageError(messageOf(error));
    } finally {
      setReading(false);
    }
  };

  const saveWithApproval = async () => {
    if (!branding || !trimmedName || busy || conflict) return;
    const approval = await requestManagerApproval({
      title: "Save restaurant identity",
      message: "The name and logo appear in this hub and at the top of new customer bills.",
      pinLabel: "Master PIN",
      approvedBy: "master",
      defaultReason: newLogo ? "Update restaurant logo" : "Update restaurant name",
      requireReason: false,
      confirmLabel: "Save",
    }).catch(() => null);
    if (!approval) return;
    save.mutate({
      restaurantName: trimmedName,
      ...(newLogo ? { imageDataUrl: newLogo } : {}),
      expectedUpdatedAt: loadedBranding?.updatedAt ?? branding.updatedAt,
      masterApproval: approval,
    });
  };

  const removeWithApproval = async () => {
    if (!branding || busy || conflict) return;
    const approval = await requestManagerApproval({
      title: "Remove restaurant logo",
      message: "New bills will print the restaurant name without a logo. Bills already printed are not affected.",
      pinLabel: "Master PIN",
      approvedBy: "master",
      defaultReason: "Remove restaurant logo",
      requireReason: false,
      confirmLabel: "Remove logo",
      danger: true,
    }).catch(() => null);
    if (approval) remove.mutate({ expectedUpdatedAt: loadedBranding?.updatedAt ?? branding.updatedAt, masterApproval: approval });
  };

  return (
    <SetupCard
      title="Restaurant identity"
      done={Boolean(branding?.restaurantName)}
      icon={<Store size={20} />}
      summary={branding ? `${branding.restaurantName || "No name set"} · ${branding.logoImageDataUrl ? "custom logo" : "default mark"}` : "Name and logo for bills"}
    >
      {current.isPending ? (
        <p className="soft-note" role="status">Loading restaurant identity…</p>
      ) : current.isError ? (
        <div className="settings-info-row" role="alert">
          <p className="soft-note">{messageOf(current.error)}</p>
          <button type="button" className="secondary-button" onClick={() => void current.refetch()}>Retry</button>
        </div>
      ) : (
        <form
          className="branding-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void saveWithApproval();
          }}
        >
          <div className="branding-previews" aria-live="polite">
            <figure>
              <div className="branding-logo-frame">
                <img src={shownLogo || DEFAULT_BRAND_MARK_URL} alt={shownLogo ? (newLogo ? "New logo preview" : "Current restaurant logo") : "Default app mark"} />
              </div>
              <figcaption>{newLogo ? "New logo · not saved" : shownLogo ? "In the app" : "Default mark · no logo uploaded"}</figcaption>
            </figure>
            <figure>
              <div className="branding-logo-frame paper">
                {shownLogo ? <img className="thermal" src={shownLogo} alt="" /> : <span>No logo on bills</span>}
                <strong>{trimmedName || "Restaurant name"}</strong>
              </div>
              <figcaption>Bill header · black and white</figcaption>
            </figure>
          </div>
          <div className="branding-fields">
            {conflict ? <div className="branding-conflict" role="alert"><p>The restaurant identity changed on another device. Your changes are still here. Load the current identity before saving.</p><button type="button" className="secondary-button compact" onClick={discardChanges}>Load current identity</button></div> : null}
            <label>
              Restaurant name
              <input
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
                disabled={busy || locked}
                placeholder="As printed on bills"
                aria-describedby="branding-name-hint"
              />
              <small id="branding-name-hint">Shown in the app and printed at the top of every bill.</small>
            </label>
            <div className="branding-logo-field">
              <span>Logo</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg"
                aria-label="Choose restaurant logo"
                className="sr-only"
                onChange={(event) => {
                  void chooseFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <div className="branding-logo-actions">
                <button type="button" className="secondary-button" disabled={busy || locked} onClick={() => fileInput.current?.click()}>
                  <ImageUp size={16} />
                  {reading ? "Reading…" : shownLogo ? "Replace logo" : "Upload logo"}
                </button>
                {branding?.logoImageDataUrl && !newLogo ? (
                  <button type="button" className="quiet-danger-button" disabled={busy || locked || conflict} onClick={() => void removeWithApproval()}>
                    {remove.isPending ? "Removing…" : "Remove logo"}
                  </button>
                ) : null}
              </div>
              <small>PNG or JPG, up to 2 MB. A simple dark mark on a light or clear background prints best. Kitchen tickets never print the logo.</small>
              {imageError ? <p className="branding-image-error" role="alert">{imageError}</p> : null}
            </div>
            {locked ? (
              <p className="branding-lock" role="status">
                <LockKeyhole size={14} /> Set a Master PIN in Administration › Security to change the name or logo.
              </p>
            ) : null}
            <div className="form-actions">
              <button type="submit" disabled={busy || locked || conflict || !changed || !trimmedName}>
                {save.isPending ? "Saving…" : "Save identity"}
              </button>
              {changed ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={discardChanges}
                >
                  Discard changes
                </button>
              ) : null}
              {!trimmedName && changed ? <small role="alert">Enter the restaurant name.</small> : null}
            </div>
          </div>
        </form>
      )}
    </SetupCard>
  );
}
