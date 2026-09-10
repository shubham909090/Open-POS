export function triggerDownload(file: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(file.blob);
  const revoke = URL.revokeObjectURL.bind(URL);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => revoke(url), 1000);
}
