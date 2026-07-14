import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ASSETS_DIR, MAX_UPLOAD_BYTES, R2, R2_ENABLED } from './config'

export interface LoadedAsset {
	body: Buffer | Readable
	contentType: string
	contentLength?: number
}

// Read a stream fully into a Buffer, enforcing a hard byte cap.
async function readStreamCapped(stream: Readable, maxBytes: number): Promise<Buffer> {
	const chunks: Buffer[] = []
	let total = 0
	for await (const chunk of stream) {
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		total += buf.length
		if (total > maxBytes) {
			throw Object.assign(new Error('Upload exceeds maximum allowed size'), { statusCode: 413 })
		}
		chunks.push(buf)
	}
	return Buffer.concat(chunks)
}

// --- R2 (S3-compatible) backend ---------------------------------------------

let s3: S3Client | null = null
function getS3(): S3Client {
	if (!s3) {
		s3 = new S3Client({
			region: 'auto',
			endpoint: R2.endpoint!,
			forcePathStyle: true,
			credentials: {
				accessKeyId: R2.accessKeyId!,
				secretAccessKey: R2.secretAccessKey!,
			},
		})
	}
	return s3
}

// --- Public API -------------------------------------------------------------

export async function storeAsset(id: string, stream: Readable, contentType?: string): Promise<void> {
	const body = await readStreamCapped(stream, MAX_UPLOAD_BYTES)
	const ct = contentType || 'application/octet-stream'

	if (R2_ENABLED) {
		await getS3().send(
			new PutObjectCommand({
				Bucket: R2.bucket!,
				Key: id,
				Body: body,
				ContentType: ct,
				ContentLength: body.length,
			})
		)
		return
	}

	// Local-disk fallback (dev): store bytes plus a tiny sidecar for content type.
	await writeFile(join(ASSETS_DIR, id), body)
	await writeFile(join(ASSETS_DIR, `${id}.contenttype`), ct)
}

export async function loadAsset(id: string): Promise<LoadedAsset> {
	if (R2_ENABLED) {
		const res = await getS3().send(new GetObjectCommand({ Bucket: R2.bucket!, Key: id }))
		return {
			body: res.Body as Readable,
			contentType: res.ContentType || 'application/octet-stream',
			contentLength: res.ContentLength,
		}
	}

	const body = await readFile(join(ASSETS_DIR, id))
	let contentType = 'application/octet-stream'
	const ctPath = join(ASSETS_DIR, `${id}.contenttype`)
	if (existsSync(ctPath)) {
		contentType = (await readFile(ctPath, 'utf8')).trim() || contentType
	}
	return { body, contentType, contentLength: body.length }
}
