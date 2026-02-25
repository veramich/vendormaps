import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload a multer file buffer to Cloudflare R2.
 * @param {Express.Multer.File} file - Multer file object (memory storage)
 * @param {string} folder - Folder/prefix inside the bucket (e.g. 'business_logos')
 * @returns {Promise<string>} Full public URL of the uploaded file
 */
export async function uploadFile(file, folder = '') {
  const ext = path.extname(file.originalname);
  const safeName = file.originalname
    .replace(ext, '')
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .substring(0, 60);
  const key = folder
    ? `${folder}/${Date.now()}_${safeName}${ext}`
    : `${Date.now()}_${safeName}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
