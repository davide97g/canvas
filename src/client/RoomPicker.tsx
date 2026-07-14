import { FormEvent, useEffect, useState } from 'react'
import { signOut } from './authClient'

interface RoomMeta {
	slug: string
	name: string
	createdAt: number
}

export function RoomPicker({ onOpenRoom }: { onOpenRoom: (slug: string) => void }) {
	const [rooms, setRooms] = useState<RoomMeta[]>([])
	const [loading, setLoading] = useState(true)
	const [name, setName] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [creating, setCreating] = useState(false)

	async function refresh() {
		try {
			const res = await fetch('/api/rooms')
			if (!res.ok) throw new Error('Failed to load rooms')
			const data = await res.json()
			setRooms(data.rooms || [])
		} catch (e: any) {
			setError(String(e?.message || e))
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		refresh()
	}, [])

	async function onCreate(e: FormEvent) {
		e.preventDefault()
		setError(null)
		const trimmed = name.trim()
		if (!trimmed) return
		setCreating(true)
		try {
			const res = await fetch('/api/rooms', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: trimmed }),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data?.error || 'Failed to create room')
			setName('')
			onOpenRoom(data.room.slug)
		} catch (e: any) {
			setError(String(e?.message || e))
		} finally {
			setCreating(false)
		}
	}

	return (
		<div className="picker-shell">
			<header className="picker-header">
				<div className="brand">
					<span className="brand-glyph">DG</span>
					<h1>Canvas</h1>
				</div>
				<button className="btn ghost" onClick={() => signOut().then(() => window.location.reload())}>
					Sign out
				</button>
			</header>

			<main className="picker-main">
				<form className="card create-card" onSubmit={onCreate}>
					<h2>New board</h2>
					<div className="create-row">
						<input
							type="text"
							placeholder="e.g. Sprint planning"
							value={name}
							onChange={(e) => setName(e.target.value)}
							maxLength={80}
						/>
						<button type="submit" className="btn primary" disabled={creating || !name.trim()}>
							{creating ? 'Creating…' : 'Create'}
						</button>
					</div>
				</form>

				{error && <div className="error">{error}</div>}

				<section>
					<h2 className="section-title">Your boards</h2>
					{loading ? (
						<p className="muted">Loading…</p>
					) : rooms.length === 0 ? (
						<p className="muted">No boards yet. Create your first one above.</p>
					) : (
						<ul className="room-list">
							{rooms.map((room) => (
								<li key={room.slug}>
									<button className="room-item" onClick={() => onOpenRoom(room.slug)}>
										<span className="room-name">{room.name}</span>
										<span className="room-slug">/{room.slug}</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</section>
			</main>
		</div>
	)
}
