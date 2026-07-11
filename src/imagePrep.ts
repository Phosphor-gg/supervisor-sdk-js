/**
 * Client-side image preprocessing.
 *
 * Downscales large images (longest edge capped at 1280px), flattens alpha
 * onto white, and re-encodes as JPEG (quality 85) before upload so payloads
 * stay small. Works in browsers/workers via canvas, and in Node when the
 * optional `sharp` peer dependency is installed. In environments where
 * neither is available (edge runtimes, Node without sharp), or on any error,
 * the input passes through unchanged.
 */

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;

/** Matches an optional `data:<mime>;base64,` prefix. */
const DATA_URL_PREFIX = /^data:[^;,]*(?:;[^;,]*)*;base64,/i;

/**
 * Prepare a base64-encoded image for upload.
 *
 * - Strips an optional `data:...;base64,` prefix; the result is always raw
 *   base64.
 * - Resizes so the longest edge is at most 1280px (never upscales), flattens
 *   transparency onto white, and re-encodes as JPEG at quality 85.
 * - If the image did not need resizing and the JPEG is not smaller than the
 *   original bytes, the original input is returned.
 * - On any error, or when no image codec is available in the current runtime,
 *   the input is returned unchanged (minus any data-URL prefix).
 *
 * @param imageB64 - Base64 image data, with or without a data-URL prefix.
 * @returns Raw base64 of the prepared image, or the original data on
 *   passthrough.
 */
export async function prepareImage(imageB64: string): Promise<string> {
  const raw = imageB64.replace(DATA_URL_PREFIX, "");

  try {
    const bytes = decodeBase64(raw);

    let prepared: string | null = null;
    if (hasCanvasSupport()) {
      prepared = await prepareWithCanvas(bytes, raw.length);
    } else {
      prepared = await prepareWithSharp(bytes);
    }

    return prepared ?? raw;
  } catch {
    return raw;
  }
}

// --- Environment helpers ---

function hasCanvasSupport(): boolean {
  return (
    typeof createImageBitmap === "function" &&
    (typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined")
  );
}

/** Node's Buffer constructor when present, without requiring @types/node. */
function nodeBuffer(): {
  from(data: string | Uint8Array, encoding?: string): Uint8Array & { toString(encoding: string): string };
} | undefined {
  const buf = (globalThis as Record<string, unknown>)["Buffer"] as
    | { from?: unknown }
    | undefined;
  return buf && typeof buf.from === "function" ? (buf as never) : undefined;
}

function decodeBase64(b64: string): Uint8Array {
  const BufferCtor = nodeBuffer();
  if (BufferCtor) {
    return new Uint8Array(BufferCtor.from(b64, "base64"));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  const BufferCtor = nodeBuffer();
  if (BufferCtor) {
    return BufferCtor.from(bytes).toString("base64");
  }
  // btoa takes a binary string; build it in chunks to avoid call-stack limits.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// --- Browser / worker path ---

async function prepareWithCanvas(
  bytes: Uint8Array,
  inputB64Length: number,
): Promise<string | null> {
  const blob = new Blob([bytes as BlobPart]);
  const bitmap = await createImageBitmap(blob);

  try {
    const { width, height } = bitmap;
    if (!width || !height) return null;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const resized = scale < 1;

    let canvas: OffscreenCanvas | HTMLCanvasElement;
    if (typeof OffscreenCanvas !== "undefined") {
      canvas = new OffscreenCanvas(targetWidth, targetHeight);
    } else {
      canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const ctx = canvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) return null;

    // Flatten transparency onto white before drawing.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    let outputB64: string;
    if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
      const jpegBlob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: JPEG_QUALITY,
      });
      outputB64 = encodeBase64(new Uint8Array(await jpegBlob.arrayBuffer()));
    } else if ("toDataURL" in canvas && typeof canvas.toDataURL === "function") {
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const comma = dataUrl.indexOf(",");
      if (comma < 0) return null;
      outputB64 = dataUrl.slice(comma + 1);
    } else {
      return null;
    }

    // If we neither resized nor shrank the payload, keep the original.
    if (!resized && outputB64.length >= inputB64Length) return null;
    return outputB64;
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }
}

// --- Node path (optional sharp peer dependency) ---

/**
 * Minimal structural view of the sharp API surface used here, so the SDK
 * type-checks without sharp's types installed.
 */
interface SharpLike {
  (input: Uint8Array): {
    metadata(): Promise<{ width?: number; height?: number }>;
    rotate(): SharpChain;
  };
}
interface SharpChain {
  resize(options: {
    width: number;
    height: number;
    fit: string;
    withoutEnlargement: boolean;
  }): SharpChain;
  flatten(options: { background: string }): SharpChain;
  jpeg(options: { quality: number }): SharpChain;
  toBuffer(): Promise<Uint8Array>;
}

async function prepareWithSharp(bytes: Uint8Array): Promise<string | null> {
  let sharp: SharpLike;
  try {
    // Computed specifier so bundlers (webpack/vite/esbuild) do not try to
    // statically resolve the optional sharp peer dependency.
    const specifier = "sharp".slice();
    const mod = (await import(/* @vite-ignore */ /* webpackIgnore: true */ specifier)) as {
      default?: SharpLike;
    };
    const candidate = mod.default ?? (mod as unknown as SharpLike);
    if (typeof candidate !== "function") return null;
    sharp = candidate;
  } catch {
    // sharp is not installed: pass the image through unchanged.
    return null;
  }

  const metadata = await sharp(bytes).metadata();
  const { width, height } = metadata;
  const resized =
    typeof width === "number" &&
    typeof height === "number" &&
    Math.max(width, height) > MAX_DIMENSION;

  // .rotate() with no args applies EXIF orientation; sharp uses only the
  // first frame of animated input by default.
  const output = await sharp(bytes)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer();

  // If we neither resized nor shrank the payload, keep the original.
  if (!resized && output.length >= bytes.length) return null;
  return encodeBase64(output);
}
