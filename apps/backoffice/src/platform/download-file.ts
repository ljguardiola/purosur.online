// Long enough for any browser to finish handing the blob to its download before it's released.
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

export function downloadFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking right after click() can cancel the download in Firefox and Safari, which read
  // the blob asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}
