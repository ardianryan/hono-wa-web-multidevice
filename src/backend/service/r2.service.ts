import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const endpoint = process.env.R2_ENDPOINT;
const bucketName = process.env.R2_BUCKET ;
const region = process.env.R2_REGION ;
const prefix = process.env.R2_PREFIX ;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

let s3Client: S3Client | null = null;

if (endpoint && accessKeyId && secretAccessKey) {
  s3Client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  console.log("[R2] Cloudflare R2 Client initialized.");
} else {
  console.log("[R2] Missing R2 credentials. R2 upload feature is disabled.");
}

export const uploadToR2 = async (
  buffer: Buffer,
  mimeType: string,
  extension: string
): Promise<string | null> => {
  if (!s3Client) return null;

  const timestamp = Date.now();
  const randomStr = crypto.randomBytes(4).toString("hex");
  const cleanExt = extension.replace(/^\./, "");
  
  // Format: prefix/timestamp-randomStr.ext
  const objectKey = `${prefix ? prefix + '/' : ''}${timestamp}-${randomStr}.${cleanExt}`;

  try {
    // 1. Upload the object
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
      })
    );

    // 2. Generate a presigned URL valid for 7 days (604800 seconds)
    // Cloudflare R2 supports presigned URLs, which allows the browser to bypass AccessDenied
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 604800 });
    return signedUrl;
  } catch (err: any) {
    console.error("[R2] Error uploading to R2:", err.message ?? err);
    return null;
  }
};
