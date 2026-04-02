import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

let _s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _s3;
}

function getBucket(): string {
  return process.env.R2_BUCKET || "homenshop";
}

function getPublicUrl(): string {
  return process.env.R2_PUBLIC_URL || "";
}

export async function uploadFile(file: File, folder: string = "uploads"): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const key = `${folder}/${randomUUID()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: Buffer.from(arrayBuffer),
      ContentType: file.type,
    })
  );

  return `${getPublicUrl()}/${key}`;
}

export async function deleteFile(url: string): Promise<void> {
  const publicUrl = getPublicUrl();
  const key = url.replace(`${publicUrl}/`, "");

  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );
}
