import { betterAuth } from 'better-auth'
import { fromNodeHeaders } from 'better-auth/node'
import { getMigrations } from 'better-auth/db/migration'
import Database from 'better-sqlite3'
import type { IncomingHttpHeaders } from 'http'
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	AUTH_DB_PATH,
	BETTER_AUTH_SECRET,
	BETTER_AUTH_URL,
	IS_PRODUCTION,
	TRUSTED_ORIGINS,
} from './config'

// A single better-sqlite3 database instance, shared by both auth instances so
// we never open the same file twice.
const authDb = new Database(AUTH_DB_PATH)

const sharedOptions = {
	database: authDb,
	secret: BETTER_AUTH_SECRET,
	baseURL: BETTER_AUTH_URL,
	trustedOrigins: [BETTER_AUTH_URL, ...TRUSTED_ORIGINS],
	advanced: {
		// Traefik terminates TLS; in production we want secure cookies.
		useSecureCookies: IS_PRODUCTION,
		// Traefik forwards the real client IP so Better Auth's built-in rate
		// limiter can bucket per-IP instead of falling back to a shared bucket.
		ipAddress: {
			ipAddressHeaders: ['x-forwarded-for'],
		},
	},
}

// Main auth instance: email + password only, signups DISABLED.
export const auth = betterAuth({
	...sharedOptions,
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
	},
})

// A throwaway instance that shares the same database but *allows* signup.
// Used exclusively to seed the single admin user at startup.
const seedAuth = betterAuth({
	...sharedOptions,
	emailAndPassword: {
		enabled: true,
		disableSignUp: false,
		autoSignIn: false,
	},
})

// Run better-auth's schema migrations against the auth database.
export async function migrateAuth(): Promise<void> {
	const { runMigrations } = await getMigrations(auth.options)
	await runMigrations()
}

// Seed exactly one admin user from env. Creates it if missing, skips if present.
export async function seedAdminUser(): Promise<void> {
	try {
		await seedAuth.api.signUpEmail({
			body: {
				email: ADMIN_EMAIL,
				password: ADMIN_PASSWORD,
				name: 'Davide Ghiotto',
			},
		})
		console.log(`[auth] seeded admin user: ${ADMIN_EMAIL}`)
	} catch (err: any) {
		// A duplicate user (already seeded) is the expected steady-state case.
		const msg = String(err?.message || err?.body?.message || err)
		if (/exist|unique|already/i.test(msg)) {
			console.log(`[auth] admin user already exists: ${ADMIN_EMAIL}`)
		} else {
			console.warn('[auth] admin seed skipped:', msg)
		}
	}
}

// Validate a session from raw Node headers (used by route guards and the WS upgrade).
export async function getSessionFromHeaders(headers: IncomingHttpHeaders) {
	try {
		return await auth.api.getSession({ headers: fromNodeHeaders(headers) })
	} catch {
		return null
	}
}
