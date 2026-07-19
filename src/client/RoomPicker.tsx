import { FormEvent, useEffect, useState } from 'react'
import { signOut } from './authClient'
import { CosmicBackdrop } from './CosmicBackdrop'

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
	const [confirmSlug, setConfirmSlug] = useState<string | null>(null)
	const [deletingSlug, setDeletingSlug] = useState<string | null>(null)

	async function refresh() {
		try {
			const res = await fetch('/api/rooms')
			if (!res.ok) throw new Error('Failed to load boards')
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
			if (!res.ok) throw new Error(data?.error || 'Failed to create board')
			setName('')
			onOpenRoom(data.room.slug)
		} catch (e: any) {
			setError(String(e?.message || e))
		} finally {
			setCreating(false)
		}
	}

	async function onDelete(slug: string) {
		setError(null)
		setDeletingSlug(slug)
		try {
			const res = await fetch(`/api/rooms/${slug}`, { method: 'DELETE' })
			if (!res.ok) {
				const data = await res.json().catch(() => null)
				throw new Error(data?.error || 'Failed to delete board')
			}
			setRooms((prev) => prev.filter((r) => r.slug !== slug))
		} catch (e: any) {
			setError(String(e?.message || e))
		} finally {
			setDeletingSlug(null)
			setConfirmSlug(null)
		}
	}

	return (
		<div className="picker-shell">
			<CosmicBackdrop />
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
				<div className="picker-hero">
					<h2 className="hero-title">
						Your ideas, <span className="hero-gradient">in orbit</span>
					</h2>
					<p className="hero-sub">Spin up a board and start sketching.</p>
				</div>

				<form className="card create-card" onSubmit={onCreate}>
					<label className="eyebrow" htmlFor="new-board">
						New board
					</label>
					<div className="create-row">
						<input
							id="new-board"
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
					<h2 className="eyebrow section-title">Your boards</h2>
					{loading ? (
						<p className="muted">Loading…</p>
					) : rooms.length === 0 ? (
						<p className="muted">No boards yet. Create your first one above.</p>
					) : (
						<ul className="room-list">
							{rooms.map((room) => (
								<li key={room.slug} className="room-cell">
									{confirmSlug === room.slug ? (
										<div className="room-item room-confirm">
											<span className="room-confirm-text">
												Delete “{room.name}”? This can’t be undone.
											</span>
											<div className="room-confirm-actions">
												<button
													className="btn danger"
													onClick={() => onDelete(room.slug)}
													disabled={deletingSlug === room.slug}
												>
													{deletingSlug === room.slug ? 'Deleting…' : 'Delete'}
												</button>
												<button
													className="btn ghost"
													onClick={() => setConfirmSlug(null)}
													disabled={deletingSlug === room.slug}
												>
													Cancel
												</button>
											</div>
										</div>
									) : (
										<button className="room-item" onClick={() => onOpenRoom(room.slug)}>
											<span className="room-star" aria-hidden="true">
												✦
											</span>
											<span className="room-name">{room.name}</span>
											<span className="room-slug">/{room.slug}</span>
										</button>
									)}
									{confirmSlug !== room.slug && (
										<button
											className="room-delete"
											title={`Delete ${room.name}`}
											aria-label={`Delete board ${room.name}`}
											onClick={() => setConfirmSlug(room.slug)}
										>
											<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
												<path
													d="M2.5 4h11M6.5 4V2.5h3V4m-6 0 .6 9a1 1 0 0 0 1 .94h4.8a1 1 0 0 0 1-.94l.6-9"
													stroke="currentColor"
													strokeWidth="1.3"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
										</button>
									)}
								</li>
							))}
						</ul>
					)}
				</section>
			</main>
		</div>
	)
}
