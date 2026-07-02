/**
 * Client-side photo downscale for uploads.
 *
 * Per spec the browser shrinks a picked photo to a longest edge of at most
 * 1600px and re-encodes it as JPEG at 0.85 quality before upload — this keeps
 * the raw object small and the upload fast without touching quality the AI
 * pipeline needs. Runs entirely on the main thread via an offscreen canvas;
 * safe to call with any image `File`.
 */

/** Longest-edge cap for the uploaded raw image. */
const MAX_EDGE = 1600;

/** JPEG quality for the re-encoded upload. */
const JPEG_QUALITY = 0.85;

/**
 * Downscale + re-encode a picked image File to a JPEG Blob. If the source is
 * already within the edge cap it is still re-encoded to JPEG for a predictable
 * content type. Throws if the browser cannot decode or encode the image.
 */
export async function downscaleToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob) throw new Error('Image encode failed');
    return blob;
  } finally {
    bitmap.close();
  }
}
