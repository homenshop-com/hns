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
  const urls: Record<string, string> = {
    original: `${UPLOAD_URL}/${folder}/${origFilename}`,
  };

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

    urls[cfg.suffix] = `${UPLOAD_URL}/${folder}/${resizedFilename}`;
  }

  return urls as { original: string } & ImageSizes;
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
