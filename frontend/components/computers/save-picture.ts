"use client";

// Saves a cloud computer's current screen as a PNG file: the screenshot endpoint's picture, or,
// when that is refused, the frame the live view is showing.
import { fetchRemoteComputerScreenshot, screenshotFilename } from "@/lib/remote-computers";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try { canvas.toBlob((blob) => resolve(blob), "image/png"); }
    catch { resolve(null); }
  });
}

// True when a file was handed to the browser.
export async function savePicture(computer: { id: number; name: string }, liveCanvas: HTMLCanvasElement | null): Promise<boolean> {
  const filename = screenshotFilename(computer.name, new Date());
  try {
    download(await fetchRemoteComputerScreenshot(computer.id, Date.now()), filename);
    return true;
  } catch {
    const blob = liveCanvas && liveCanvas.width > 0 ? await canvasBlob(liveCanvas) : null;
    if (!blob) return false;
    download(blob, filename);
    return true;
  }
}
