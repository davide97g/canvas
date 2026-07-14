import { createAuthClient } from 'better-auth/react'

// The client talks to the same origin it is served from. In development the
// Vite dev server proxies /api/auth/* to the backend; in production everything
// is served by the Node server behind Traefik.
export const authClient = createAuthClient({
	baseURL: window.location.origin,
})

export const { signIn, signOut, useSession } = authClient
