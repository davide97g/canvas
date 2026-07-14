import Database from 'better-sqlite3'
import { APP_DB_PATH, isValidRoomSlug } from './config'

// Lightweight metadata store for the room picker. The actual document data lives
// in per-room SQLite databases (see rooms.ts); this just tracks the list of
// rooms the user has created and their display names.

const db = new Database(APP_DB_PATH)
db.pragma('journal_mode = WAL')
db.exec(`
	CREATE TABLE IF NOT EXISTS rooms (
		slug TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)
`)

export interface RoomMeta {
	slug: string
	name: string
	createdAt: number
}

const listStmt = db.prepare('SELECT slug, name, created_at as createdAt FROM rooms ORDER BY created_at DESC')
const getStmt = db.prepare('SELECT slug, name, created_at as createdAt FROM rooms WHERE slug = ?')
const insertStmt = db.prepare('INSERT OR IGNORE INTO rooms (slug, name, created_at) VALUES (?, ?, ?)')

export function listRooms(): RoomMeta[] {
	return listStmt.all() as RoomMeta[]
}

export function getRoom(slug: string): RoomMeta | undefined {
	return getStmt.get(slug) as RoomMeta | undefined
}

// Derive a valid slug from a human room name.
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64)
}

export function createRoom(name: string): RoomMeta {
	const trimmed = name.trim()
	if (!trimmed) throw new Error('Room name is required')

	let base = slugify(trimmed)
	if (!base) base = 'room'

	// Ensure uniqueness by appending a short suffix on collision.
	let slug = base
	let attempt = 0
	while (getRoom(slug)) {
		attempt++
		const suffix = `-${attempt}`
		slug = (base.slice(0, 64 - suffix.length) + suffix)
	}

	if (!isValidRoomSlug(slug)) {
		throw new Error('Could not derive a valid room slug from name')
	}

	const meta: RoomMeta = { slug, name: trimmed, createdAt: Date.now() }
	insertStmt.run(meta.slug, meta.name, meta.createdAt)
	return meta
}
