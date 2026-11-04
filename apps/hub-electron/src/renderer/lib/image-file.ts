/** Reject unreadable files before previewing; the hub still validates and normalises uploads. */
export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onload = () => resolve(dataUrl);
      image.onerror = () => reject(new Error("This image could not be opened. Choose another PNG or JPG."));
      image.src = dataUrl;
    };
    reader.onerror = () => reject(new Error("Could not read this image. Try another file."));
    reader.readAsDataURL(file);
  });
}
