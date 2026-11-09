import { RESTAURANT_LOGO_NORMALIZATION, renderLogoBitmap, type LogoPrintSettings } from "@gaurav-pos/shared";
import { useEffect, useRef, useState } from "react";

/** Uses the same pixels and monochrome conversion as the receipt printer. */
export function ThermalLogoPreview({ imageDataUrl, paperDots, settings }: {
  imageDataUrl: string;
  paperDots: number;
  settings?: LogoPrintSettings;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const logoWidthMm = settings?.logoWidthMm;
  const logoPrintMode = settings?.logoPrintMode;
  const logoThreshold = settings?.logoThreshold;

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const image = new Image();
    image.onload = () => {
      if (cancelled || !canvas.current) return;
      try {
        if (image.naturalWidth * image.naturalHeight > RESTAURANT_LOGO_NORMALIZATION.maxInputPixels) throw new Error("Logo is too large");
        const source = document.createElement("canvas");
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceContext = source.getContext("2d");
        const targetContext = canvas.current.getContext("2d");
        if (!sourceContext || !targetContext) throw new Error("Canvas unavailable");
        sourceContext.drawImage(image, 0, 0);
        const bitmap = renderLogoBitmap(sourceContext.getImageData(0, 0, source.width, source.height), paperDots, {
          logoWidthMm, logoPrintMode, logoThreshold,
        });
        canvas.current.width = bitmap.width;
        canvas.current.height = bitmap.height;
        const pixels = targetContext.createImageData(bitmap.width, bitmap.height);
        pixels.data.set(bitmap.data);
        targetContext.putImageData(pixels, 0, 0);
      } catch {
        setFailed(true);
      }
    };
    image.onerror = () => { if (!cancelled) setFailed(true); };
    const timer = setTimeout(() => { image.src = imageDataUrl; }, 80);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [imageDataUrl, paperDots, logoWidthMm, logoPrintMode, logoThreshold]);

  return failed ? <small role="status">Logo preview unavailable</small> : <canvas ref={canvas} width={paperDots} height={1} className="thermal-logo-preview" role="img" aria-label="Printed restaurant logo" />;
}
