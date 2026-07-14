import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

// Central configuration derived from environment variables.
// Everything persistent lives under DATA_DIR so a single volume mount covers it.

export const PORT = Number(process.env.PORT) || 3000

export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

export const DATA_DIR = resolve(process.env.DATA_DIR || './data')
export const ROOMS_DIR = join(DATA_DIR, 'rooms')
export const ASSETS_DIR = join(DATA_DIR, 'assets')
export const AUTH_DB_PATH = join(DATA_DIR, 'auth.db')
export const APP_DB_PATH = join(DATA_DIR, 'app.db')

// Ensure the data directories exist before anything tries to open a database.
mkdirSync(ROOMS_DIR, { recursive: true })
mkdirSync(ASSETS_DIR, { recursive: true })

// Auth
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme-please-01'
// A secret is required in production. In dev we fall back to a static value.
export const BETTER_AUTH_SECRET =
	process.env.BETTER_AUTH_SECRET || (IS_PRODUCTION ? '' : 'dev-insecure-secret-do-not-use-in-prod')
export const BETTER_AUTH_URL =
	process.env.BETTER_AUTH_URL || `http://localhost:${process.env.CLIENT_PORT || 5757}`

if (IS_PRODUCTION && !process.env.BETTER_AUTH_SECRET) {
	throw new Error('BETTER_AUTH_SECRET is required in production')
}

// Additional trusted origins (comma separated) for auth CSRF / cookie handling.
export const TRUSTED_ORIGINS = (process.env.TRUSTED_ORIGINS || '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean)

// Cloudflare R2 (S3-compatible). When these are absent we fall back to local disk.
export const R2 = {
	endpoint: process.env.R2_ENDPOINT,
	accessKeyId: process.env.R2_ACCESS_KEY_ID,
	secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
	bucket: process.env.R2_BUCKET,
}
export const R2_ENABLED = Boolean(R2.endpoint && R2.accessKeyId && R2.secretAccessKey && R2.bucket)

// Upload cap: 25MB
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

// Room slug validation: [a-zA-Z0-9_-]{1,64}
export const ROOM_SLUG_RE = /^[a-zA-Z0-9_-]{1,64}$/
export function isValidRoomSlug(slug: string): boolean {
	return ROOM_SLUG_RE.test(slug)
}
