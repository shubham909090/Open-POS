import type { UpdateRestaurantBrandingInput } from "@gaurav-pos/shared";
import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog } from "../ui/dialog.js";

export type IconCrop = NonNullable<UpdateRestaurantBrandingInput["iconCrop"]>;
const MAX_ICON_ZOOM = 8;

export function LogoCropDialog({ image, initialCrop, onClose, onUse }: {
  image: string;
  initialCrop: IconCrop | null;
  onClose: () => void;
  onUse: (crop: IconCrop | null) => void;
}) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState<IconCrop | null>(null);
  const [failed, setFailed] = useState(false);
  const [initialArea] = useState<Area | undefined>(() => initialCrop ? {
    x: initialCrop.x * 100,
    y: initialCrop.y * 100,
    width: initialCrop.width * 100,
    height: initialCrop.height * 100,
  } : undefined);

  const updateArea = (area: Area) => {
    const x = Math.max(0, Math.min(1, area.x / 100));
    const y = Math.max(0, Math.min(1, area.y / 100));
    setCrop({ x, y, width: Math.min(1 - x, area.width / 100), height: Math.min(1 - y, area.height / 100) });
  };

  return (
    <Dialog open title="Adjust icon" onOpenChange={(open) => { if (!open) onClose(); }} className="logo-crop-dialog">
      <div className="logo-crop-stage">
        <Cropper
          image={image}
          crop={position}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          style={{ cropAreaStyle: { boxShadow: "0 0 0 1000px rgba(0, 0, 0, 0.65)", border: "2px solid white" } }}
          objectFit="cover"
          showGrid={false}
          maxZoom={MAX_ICON_ZOOM}
          onCropChange={setPosition}
          onZoomChange={setZoom}
          initialCroppedAreaPercentages={initialArea}
          onCropAreaChange={updateArea}
          mediaProps={{ onError: () => setFailed(true) }}
          cropperProps={{ "aria-label": "Drag to frame your icon. Arrow keys move the logo." }}
        />
      </div>
      {failed ? <p className="field-error" role="alert">This image could not be opened.</p> : null}
      <label className="logo-crop-zoom">
        <span>Zoom <output>{zoom.toFixed(1)}×</output></span>
        <input data-autofocus type="range" min={1} max={MAX_ICON_ZOOM} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
      </label>
      <div className="form-actions logo-crop-actions">
        <button type="button" className="secondary-button" onClick={() => onUse(null)}>Reset</button>
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        <button type="button" disabled={!crop || failed} onClick={() => { if (crop) onUse(crop); }}>Use icon</button>
      </div>
    </Dialog>
  );
}

export function LogoIconPreview({ image, crop, alt }: { image: string; crop: IconCrop | null; alt: string }) {
  return (
    <span className={`branding-icon-preview${crop ? " cropped" : ""}`}>
      <img
        src={image}
        alt={alt}
        style={crop ? {
          width: `${100 / crop.width}%`,
          height: `${100 / crop.height}%`,
          left: `${-crop.x / crop.width * 100}%`,
          top: `${-crop.y / crop.height * 100}%`,
        } : undefined}
      />
    </span>
  );
}
