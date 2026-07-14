import { join } from 'path'
import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import Database from 'better-sqlite3'
import { ROOMS_DIR, isValidRoomSlug } from './config'

// Each room is persisted to its own SQLite database via SQLiteSyncStorage.
// SQLiteSyncStorage debounces + persists changes automatically and is the
// production-ready path shipped with @tldraw/sync-core, so we simply point it
// at $DATA_DIR/rooms/<slug>.db instead of the template's ./.rooms directory.

// In-memory map of active rooms (one TLSocketRoom per room, globally — hence
// the deployment MUST run a single replica).
const rooms = new Map<string, { room: TLSocketRoom<any, void>; db: Database.Database }>()

export function makeOrLoadRoom(roomId: string): TLSocketRoom<any, void> {
	if (!isValidRoomSlug(roomId)) {
		throw new Error(`Invalid room id: ${roomId}`)
	}

	const existing = rooms.get(roomId)
	if (existing && !existing.room.isClosed()) {
		return existing.room
	}

	console.log('[rooms] loading room', roomId)
	// Open (or create) the room's database.
	const db = new Database(join(ROOMS_DIR, `${roomId}.db`))
	const sql = new NodeSqliteWrapper(db)
	const storage = new SQLiteSyncStorage({ sql })

	const room = new TLSocketRoom<any, void>({
		storage,
		onSessionRemoved(room, args) {
			console.log('[rooms] client disconnected', args.sessionId, roomId)
			if (args.numSessionsRemaining === 0) {
				console.log('[rooms] closing room', roomId)
				room.close()
				db.close()
				rooms.delete(roomId)
			}
		},
	})

	rooms.set(roomId, { room, db })
	return room
}
