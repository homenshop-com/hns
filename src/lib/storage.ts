import { randomUUID } from "crypto";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, extname } from "path";
import sharp from "sharp";

/* ─── Configuration ─── */
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/uploads";
const UPLOAD_URL = process.env.UPLOAD_URL || "/uploads";

/* ─── Image sizes ─── */
export interface ImageSizes {
  thumb: string;  // 150x150 — 썸네일
  medium: string; // 450px wide — 중간 이미지
  large: string;  // 900px wide — 최대 확대 이미지
}

const SIZE_CONFIGS = [
  { suffix: "thumb", width: 150, height: 150, fit: "cover" as const },
  { suffix: "medium", width: 450, height: undefined, fit: "inside" as const },
  { suffix: "large", width: 900, height: undefined, fit: "inside" as const },
];

/**
 * Upload a single file (no resize). Returns the public URL.
 */
export async function uploadFile(file: File, folder: string = "uploads"): Promise<string> {
  const ext = extname(file.name) || ".bin";
  const uuid = randomUUID();
  const filename = `${uuid}${ext}`;
  const dir = join(UPLOAD_DIR, folder);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(dir, filename);
  await writeFile(filePath, buffer);

  return `${UPLOAD_URL}/${folder}/${filename}`;
}

/**
 * Upload a design-editor image with mild compression.
 *
 * Use when the user is putting an image into a site (hero, card, gallery,
 * background) and we want one URL — not 4 variants like products. Pipeline:
 *   1. EXIF auto-rotate so portraits don't end up sideways
 *   2. Strip metadata (EXIF / GPS) — privacy + smaller file
 *   3. Cap at max-width / max-height (default 1920×1920) — never upscale
 *   4. Re-encode: JPEG 85 / PNG 90 / WebP 85 / GIF passthrough
 *
 * Typical: 5MB phone photo → 200-500KB output, visually indistinguishable.
 * Format passthrough: PNG stays PNG (preserves transparency), GIF stays
 * GIF (preserves animation since sharp's animated-GIF support is fragile).
 */
export async function uploadImageCompressed(
  file: File,
  folder: string = "uploads",
  opts: { maxWidth?: number; maxHeight?: number } = {},
): Promise<string> {
  const maxWidth = opts.maxWidth ?? 1920;
  const maxHeight = opts.maxHeight ?? 1920;

  const ext = extname(file.name).toLowerCase();
  const isPng = ext === ".png" || file.type === "image/png";
  const isWebp = ext === ".webp" || file.type === "image/webp";
  const isGif = ext === ".gif" || file.type === "image/gif";
  // GIF passthrough — sharp would flatten animation. Save as-is, no resize.
  if (isGif) {
    return uploadFile(file, folder);
  }

  const outputExt = isPng ? ".png" : isWebp ? ".webp" : ".jpg";
  const uuid = randomUUID();
  const filename = `${uuid}${outputExt}`;
  const dir = join(UPLOAD_DIR, folder);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(dir, filename);

  // Probe input for alpha so we never accidentally flatten a
  // transparent PNG/WebP (sharp's resize/format ops occasionally drop
  // alpha when the source is unusual; we explicitly preserve it).
  const inputMeta = await sharp(buffer).metadata();
  const inputHasAlpha = !!inputMeta.hasAlpha;

  let pipe = sharp(buffer).rotate().resize({
    width: maxWidth,
    height: maxHeight,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (isPng) {
    // ensureAlpha() forces RGBA output when input had alpha — guards
    // against any subtle sharp behavior that would convert to RGB.
    // Also disable palette mode so transparent areas stay editable
    // pixel-perfect.
    if (inputHasAlpha) pipe = pipe.ensureAlpha();
    await pipe
      .png({ quality: 90, compressionLevel: 9, palette: false })
      .toFile(filePath);
  } else if (isWebp) {
    if (inputHasAlpha) pipe = pipe.ensureAlpha();
    await pipe.webp({ quality: 85 }).toFile(filePath);
  } else {
    await pipe.jpeg({ quality: 85, mozjpeg: true }).toFile(filePath);
  }

  return `${UPLOAD_URL}/${folder}/${filename}`;
}

/**
 * Upload an image file and create resized variants (thumb, medium, large).
 * Returns URLs for all three sizes plus the original.
 */
export async function uploadImageWithResize(
  file: File,
  folder: string = "products"
): Promise<{ original: string } & ImageSizes> {
  const ext = extname(file.name).toLowerCase();
  const outputExt = ext === ".png" ? ".png" : ".jpg";
  const uuid = randomUUID();
  const dir = join(UPLOAD_DIR, folder);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());

  // Save original
  const origFilename = `${uuid}${outputExt}`;
  const origPath = join(dir, origFilename);

  // Process with sharp — convert to sRGB, strip metadata
  const sharpInstance = sharp(buffer).rotate(); // auto-rotate EXIF

  if (outputExt === ".png") {
    await sharpInstance.clone().png({ quality: 90 }).toFile(origPath);
  } else {
    await sharpInstance.clone().jpeg({ quality: 85 }).toFile(origPath);
  }

  // Generate resized variants
  const urls = {
    original: `${UPLOAD_URL}/${folder}/${origFilename}`,
  } as { original: string } & ImageSizes;

  for (const cfg of SIZE_CONFIGS) {
    const resizedFilename = `${uuid}_${cfg.suffix}${outputExt}`;
    const resizedPath = join(dir, resizedFilename);

    const resizer = sharp(buffer).rotate().resize({
      width: cfg.width,
      height: cfg.height,
      fit: cfg.fit,
      withoutEnlargement: true,
    });

    if (outputExt === ".png") {
      await resizer.png({ quality: 85 }).toFile(resizedPath);
    } else {
      await resizer.jpeg({ quality: 80 }).toFile(resizedPath);
    }

    urls[cfg.suffix as keyof ImageSizes] = `${UPLOAD_URL}/${folder}/${resizedFilename}`;
  }

  return urls;
}

/**
 * Delete a file by its public URL.
 */
export async function deleteFile(url: string): Promise<void> {
  const relativePath = url.replace(UPLOAD_URL, "");
  const filePath = join(UPLOAD_DIR, relativePath);
  try {
    await unlink(filePath);
  } catch {
    // File may already be deleted
  }
}

/**
 * Delete an image and all its resized variants.
 */
export async function deleteImageWithVariants(url: string): Promise<void> {
  await deleteFile(url);

  // Try to delete variants based on naming convention
  const dotIdx = url.lastIndexOf(".");
  if (dotIdx === -1) return;
  const base = url.substring(0, dotIdx);
  const ext = url.substring(dotIdx);

  for (const cfg of SIZE_CONFIGS) {
    await deleteFile(`${base}_${cfg.suffix}${ext}`);
  }
}
