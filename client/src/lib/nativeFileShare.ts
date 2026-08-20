import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

type ShareBlobFileOptions = {
  blob: Blob;
  fileName: string;
  title?: string;
  text?: string;
};

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");

const blobToBase64 = async (blob: Blob) => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Datei konnte nicht verarbeitet werden."));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Datei konnte nicht gelesen werden."));
    };
    reader.readAsDataURL(blob);
  });

  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) {
    throw new Error("Datei konnte nicht in Base64 umgewandelt werden.");
  }
  return base64;
};

export async function shareBlobFileIfNative({
  blob,
  fileName,
  title,
  text,
}: ShareBlobFileOptions) {
  if (!Capacitor.isNativePlatform()) return false;

  const availability = await Share.canShare();
  if (!availability.value) return false;

  const safeFileName = sanitizeFileName(fileName);
  const base64Data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: `exports/${Date.now()}-${safeFileName}`,
    data: base64Data,
    directory: Directory.Cache,
    recursive: true,
  });

  await Share.share({
    title: title ?? safeFileName,
    text,
    files: [written.uri],
  });

  return true;
}
