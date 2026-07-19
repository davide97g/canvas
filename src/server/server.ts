import { existsSync } from 'fs'
import { join } from 'path'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import websocketPlugin from '@fastify/websocket'
import fastify from 'fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RawData } from 'ws'
import { loadAsset, storeAsset } from './assets'
import { auth, getSessionFromHeaders, migrateAuth, seedAdminUser } from './auth'
import {
	BETTER_AUTH_URL,
	IS_PRODUCTION,
	MAX_UPLOAD_BYTES,
	PORT,
	R2_ENABLED,
	TRUSTED_ORIGINS,
	isValidRoomSlug,
} from './config'
import { destroyRoomData, makeOrLoadRoom } from './rooms'
import { createRoom, deleteRoom, getRoom, listRooms } from './roomStore'
import { unfurl } from './unfurl'

const CLIENT_DIST = join(process.cwd(), 'dist', 'client')

// Only these prefixes require an authenticated session. Everything else (the
// SPA shell, the login page, static assets, and the /api/auth/* endpoints) is
// public so the login flow can work.
const PROTECTED_PREFIXES = ['/connect', '/uploads', '/unfurl', '/api/rooms']

function isProtected(pathname: string): boolean {
	return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

async function main() {
	// Auth database schema + single admin user.
	await migrateAuth()
	await seedAdminUser()

	const app = fastify({
		// Traefik forwards X-Forwarded-For; trust it for correct client IPs.
		trustProxy: true,
		bodyLimit: MAX_UPLOAD_BYTES,
	})

	// Rate limiting: sane global default; stricter per-route overrides below.
	await app.register(rateLimit, {
		global: true,
		max: 300,
		timeWindow: '1 minute',
	})

	// CORS: credentialed. In production only the app's own origin (plus any
	// TRUSTED_ORIGINS) may make credentialed requests; in dev the Vite proxy
	// makes everything same-origin so reflecting is safe.
	await app.register(cors, {
		origin: IS_PRODUCTION ? [BETTER_AUTH_URL, ...TRUSTED_ORIGINS] : true,
		credentials: true,
	})

	await app.register(websocketPlugin)

	// Allow raw (unparsed) bodies for binary asset uploads. The default JSON
	// parser is left intact for /api/rooms and the auth endpoints.
	app.addContentTypeParser('*', (_req, _payload, done) => done(null))

	// --- Auth guard (runs before every request) -----------------------------
	app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
		const pathname = req.url.split('?')[0]
		if (!isProtected(pathname)) return
		const session = await getSessionFromHeaders(req.headers)
		if (!session) {
			// For the WS upgrade this 401 aborts the handshake and no socket is
			// established.
			reply.code(401).send({ error: 'Unauthorized' })
		}
	})

	// --- Better Auth handler (/api/auth/*) -----------------------------------
	app.route({
		method: ['GET', 'POST'],
		url: '/api/auth/*',
		config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
		async handler(req, reply) {
			const url = new URL(req.url, `${req.protocol}://${req.headers.host}`)
			const headers = new Headers()
			for (const [key, value] of Object.entries(req.headers)) {
				if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
				else if (value != null) headers.append(key, String(value))
			}
			let body: string | undefined
			if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
				body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
			}
			const request = new Request(url.toString(), { method: req.method, headers, body })
			const response = await auth.handler(request)

			reply.code(response.status)
			response.headers.forEach((value, key) => {
				if (key.toLowerCase() !== 'set-cookie') reply.header(key, value)
			})
			// Preserve multiple Set-Cookie headers individually.
			const setCookies = (response.headers as any).getSetCookie?.() as string[] | undefined
			if (setCookies) for (const c of setCookies) reply.header('set-cookie', c)

			const text = await response.text()
			reply.send(text || null)
		},
	})

	// --- Room metadata API (list / create) ----------------------------------
	app.get('/api/rooms', async () => {
		return { rooms: listRooms() }
	})

	app.post('/api/rooms', async (req, reply) => {
		const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
			name?: string
		} | null
		const name = body?.name?.trim()
		if (!name) return reply.code(400).send({ error: 'Room name is required' })
		try {
			const room = createRoom(name)
			return reply.code(201).send({ room })
		} catch (err: any) {
			return reply.code(400).send({ error: String(err?.message || err) })
		}
	})

	app.delete('/api/rooms/:slug', async (req, reply) => {
		const slug = (req.params as any).slug as string
		if (!isValidRoomSlug(slug)) return reply.code(400).send({ error: 'Invalid room id' })
		if (!getRoom(slug)) return reply.code(404).send({ error: 'Board not found' })
		try {
			destroyRoomData(slug)
			deleteRoom(slug)
			return reply.send({ ok: true })
		} catch (err: any) {
			return reply.code(500).send({ error: String(err?.message || err) })
		}
	})

	// --- Multiplayer sync WebSocket ------------------------------------------
	app.get('/connect/:roomId', { websocket: true }, async (socket, req) => {
		const roomId = (req.params as any).roomId as string
		const sessionId = (req.query as any)?.['sessionId'] as string

		if (!isValidRoomSlug(roomId)) {
			socket.close(1008, 'Invalid room id')
			return
		}

		// Collect messages that arrive before the room finishes loading.
		const caughtMessages: RawData[] = []
		const collectMessagesListener = (message: RawData) => caughtMessages.push(message)
		socket.on('message', collectMessagesListener)

		const room = makeOrLoadRoom(roomId)
		room.handleSocketConnect({ sessionId, socket })

		socket.off('message', collectMessagesListener)
		for (const message of caughtMessages) socket.emit('message', message)
	})

	// --- Asset upload / download (proxied, behind auth) ----------------------
	app.put(
		'/uploads/:id',
		{ config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
		async (req, reply) => {
			const id = (req.params as any).id as string
			const contentType = req.headers['content-type']
			try {
				await storeAsset(id, req.raw, contentType)
				return reply.send({ ok: true })
			} catch (err: any) {
				return reply.code(err?.statusCode || 500).send({ error: String(err?.message || err) })
			}
		}
	)

	app.get('/uploads/:id', async (req, reply) => {
		const id = (req.params as any).id as string
		const asset = await loadAsset(id)
		// Prevent XSS from user-uploaded SVGs.
		reply.header('Content-Security-Policy', "default-src 'none'")
		reply.header('X-Content-Type-Options', 'nosniff')
		reply.header('Content-Type', asset.contentType)
		if (asset.contentLength != null) reply.header('Content-Length', asset.contentLength)
		return reply.send(asset.body)
	})

	// --- Bookmark unfurling ---------------------------------------------------
	app.get('/unfurl', async (req, reply) => {
		const url = (req.query as any).url as string
		return reply.send(await unfurl(url))
	})

	// --- Static SPA (production) ---------------------------------------------
	if (existsSync(CLIENT_DIST)) {
		await app.register(fastifyStatic, { root: CLIENT_DIST })
		// SPA fallback: serve index.html for client-side routes (e.g. /r/<slug>).
		app.setNotFoundHandler((req, reply) => {
			if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/connect')) {
				return reply.sendFile('index.html')
			}
			return reply.code(404).send({ error: 'Not found' })
		})
	}

	await app.listen({ port: PORT, host: '0.0.0.0' })
	console.log(`[server] Canvas listening on port ${PORT}`)
	console.log(`[server] assets backend: ${R2_ENABLED ? 'Cloudflare R2' : 'local disk (dev fallback)'}`)
	console.log(`[server] mode: ${IS_PRODUCTION ? 'production' : 'development'}`)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
