import { FormEvent, useState } from 'react'
import { signIn } from './authClient'
import { CosmicBackdrop } from './CosmicBackdrop'

export function Login() {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	async function onSubmit(e: FormEvent) {
		e.preventDefault()
		setError(null)
		setLoading(true)
		const { error } = await signIn.email({ email, password })
		setLoading(false)
		if (error) {
			setError(error.message || 'Invalid email or password')
			return
		}
		// The useSession hook will pick up the new session and re-render the app.
		window.location.reload()
	}

	return (
		<div className="auth-shell">
			<CosmicBackdrop />
			<form className="card auth-card" onSubmit={onSubmit}>
				<div className="brand">
					<span className="brand-glyph">DG</span>
					<h1>Canvas</h1>
				</div>
				<p className="auth-tagline">
					Welcome back, <span className="hero-gradient">stargazer</span>
				</p>
				<p className="muted">Sign in to your whiteboards</p>

				<label>
					Email
					<input
						type="email"
						autoComplete="username"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoFocus
					/>
				</label>

				<label>
					Password
					<input
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
				</label>

				{error && <div className="error">{error}</div>}

				<button type="submit" className="btn primary" disabled={loading}>
					{loading ? 'Signing in…' : 'Sign in'}
				</button>
			</form>
		</div>
	)
}
