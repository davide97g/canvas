import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

// The backend port the dev server proxies to.
const SERVER_PORT = process.env.PORT || 3000
const proxyTarget = `http://localhost:${SERVER_PORT}`

// Requests the SPA makes that must reach the Node backend during development.
// Everything stays same-origin so the Better Auth session cookie works.
const proxy = {
	'/api': { target: proxyTarget, changeOrigin: true },
	'/uploads': { target: proxyTarget, changeOrigin: true },
	'/unfurl': { target: proxyTarget, changeOrigin: true },
	'/connect': { target: proxyTarget, ws: true, changeOrigin: true },
}

export default defineConfig(() => ({
	plugins: [react()],
	root: path.join(__dirname, 'src/client'),
	publicDir: path.join(__dirname, 'public'),
	build: {
		outDir: path.join(__dirname, 'dist/client'),
		emptyOutDir: true,
	},
	server: {
		port: 5757,
		proxy,
	},
	optimizeDeps: {
		exclude: ['@tldraw/assets'],
	},
}))
