/**
 * Open a PDF receipt in whatever the device uses for PDFs.
 *
 * `Linking.openURL` can't do this job: a data: URI is refused on iOS and
 * either throws or falls into the browser on Android, and a presigned S3
 * URL punts the user out of the app into Chrome. Instead the bytes are
 * staged in the app's own cache and handed to the OS via the share sheet
 * (Quick Look on iOS, the open-with sheet on Android).
 *
 * Returns false when the file couldn't be staged or sharing isn't available
 * (web) — the caller decides the fallback.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/** Cache-local, single path segment: path separators and other hostile
 *  characters collapse to underscores, and the extension is pinned to .pdf. */
export function receiptShareFilename(name: string | undefined): string {
  const base = (name ?? 'receipt')
    .replace(/[/\\:*?"<>|\0]+/g, '_')
    .replace(/^[_.]+/, '')
    .trim();
  if (!base) return 'receipt.pdf';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

export type PdfSource =
  | { kind: 'base64'; base64: string; name?: string }
  | { kind: 'url'; url: string; headers?: Record<string, string>; name?: string }
  | { kind: 'file'; path: string };

/**
 * Stage the PDF bytes as a local cache file and return its path, or null.
 * Downloading ourselves (expo-file-system) rather than letting
 * react-native-pdf fetch matters on Android: its react-native-blob-util
 * downloader is unreliable with Authorization headers ("Download
 * interrupted", wonday/react-native-pdf#14).
 */
export async function stagePdf(source: PdfSource): Promise<string | null> {
  try {
    if (source.kind === 'file') return source.path;
    const dir = `${FileSystem.cacheDirectory}shared-receipts/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {
      // Already exists — fine.
    });
    const path = `${dir}${receiptShareFilename(source.name)}`;

    if (source.kind === 'base64') {
      await FileSystem.writeAsStringAsync(path, source.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else {
      const res = await FileSystem.downloadAsync(source.url, path, {
        headers: source.headers,
      });
      if (res.status !== 200) return null;
    }
    return path;
  } catch {
    return null;
  }
}

export async function openPdfExternally(source: PdfSource): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const path = await stagePdf(source);
    if (!path) return false;

    await Sharing.shareAsync(path, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
    return true;
  } catch {
    return false;
  }
}
