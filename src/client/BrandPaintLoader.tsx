import { useEffect, useRef, useState, type CSSProperties } from 'react'
import canvasLogo from './assets/canvas-logo.png'

const PALETTE = [
	{ name: 'Cyan', color: '#6ee7f9' },
	{ name: 'Blue', color: '#3d7bff' },
	{ name: 'Violet', color: '#8b5cf6' },
	{ name: 'Magenta', color: '#e879f9' },
] as const

/** Minimum time the splash stays visible so the reveal can finish. */
const MIN_MS = 2400
/** Exit fade duration — keep in sync with CSS. */
const EXIT_MS = 520

type Props = {
	/** When true, session is still resolving. */
	pending: boolean
	/** Called after the exit animation finishes. */
	onDone: () => void
}

/**
 * App boot splash inspired by Jitter's "Logo Tap: Color Reveal":
 * a paintbrush strokes color onto the official Canvas mark, then the
 * brand palette bursts outward as chips before the splash dissolves.
 */
export function BrandPaintLoader({ pending, onDone }: Props) {
	const [minElapsed, setMinElapsed] = useState(false)
	const [exiting, setExiting] = useState(false)
	const finishedRef = useRef(false)

	useEffect(() => {
		const t = window.setTimeout(() => setMinElapsed(true), MIN_MS)
		return () => window.clearTimeout(t)
	}, [])

	useEffect(() => {
		if (pending || !minElapsed || finishedRef.current) return

		setExiting(true)
		const t = window.setTimeout(() => {
			if (finishedRef.current) return
			finishedRef.current = true
			onDone()
		}, EXIT_MS)

		return () => window.clearTimeout(t)
	}, [pending, minElapsed, onDone])

	return (
		<div
			className={`paint-loader${exiting ? ' is-exiting' : ''}`}
			role="status"
			aria-live="polite"
			aria-busy={!exiting}
			aria-label="Loading Canvas"
		>
			<div className="paint-loader-void" aria-hidden="true" />

			<div className="paint-loader-stage">
				{/* Ink trails the brush leaves behind */}
				<svg className="paint-trails" viewBox="0 0 320 320" aria-hidden="true">
					<defs>
						<linearGradient id="paintTrailGrad" x1="0%" y1="100%" x2="100%" y2="0%">
							<stop offset="0%" stopColor="#6ee7f9" />
							<stop offset="40%" stopColor="#3d7bff" />
							<stop offset="70%" stopColor="#8b5cf6" />
							<stop offset="100%" stopColor="#e879f9" />
						</linearGradient>
						<filter id="paintSoft" x="-20%" y="-20%" width="140%" height="140%">
							<feGaussianBlur stdDeviation="1.2" result="b" />
							<feMerge>
								<feMergeNode in="b" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>
					<path
						className="paint-trail paint-trail-a"
						d="M48 210 C 70 80, 250 40, 272 150"
						fill="none"
						stroke="url(#paintTrailGrad)"
						strokeWidth="14"
						strokeLinecap="round"
						filter="url(#paintSoft)"
					/>
					<path
						className="paint-trail paint-trail-b"
						d="M260 70 C 300 160, 240 280, 90 250"
						fill="none"
						stroke="url(#paintTrailGrad)"
						strokeWidth="10"
						strokeLinecap="round"
						filter="url(#paintSoft)"
					/>
					<path
						className="paint-trail paint-trail-c"
						d="M70 90 C 40 180, 110 270, 220 240"
						fill="none"
						stroke="url(#paintTrailGrad)"
						strokeWidth="7"
						strokeLinecap="round"
						opacity="0.75"
					/>
				</svg>

				{/* Paintbrush tip that rides the first stroke */}
				<div className="paint-brush" aria-hidden="true">
					<svg viewBox="0 0 48 64" width="40" height="54">
						<defs>
							<linearGradient id="brushFerrule" x1="0" y1="0" x2="1" y2="1">
								<stop offset="0%" stopColor="#c9d2ff" />
								<stop offset="100%" stopColor="#7a86b8" />
							</linearGradient>
							<linearGradient id="brushHair" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#6ee7f9" />
								<stop offset="55%" stopColor="#8b5cf6" />
								<stop offset="100%" stopColor="#e879f9" />
							</linearGradient>
						</defs>
						{/* handle */}
						<rect x="19" y="0" width="10" height="28" rx="3" fill="#12162b" />
						<rect x="19" y="0" width="10" height="28" rx="3" fill="url(#brushFerrule)" opacity="0.28" />
						{/* ferrule */}
						<rect x="16.5" y="25" width="15" height="9" rx="2" fill="url(#brushFerrule)" />
						{/* bristles + wet tip */}
						<path
							d="M17.5 34 L30.5 34 L28.5 54 Q24 60 19.5 54 Z"
							fill="url(#brushHair)"
						/>
						<ellipse cx="24" cy="56" rx="6" ry="3" fill="#e879f9" opacity="0.9" />
					</svg>
				</div>

				{/* Ink drips that bloom after the first stroke */}
				<span className="paint-drip paint-drip-1" aria-hidden="true" />
				<span className="paint-drip paint-drip-2" aria-hidden="true" />
				<span className="paint-drip paint-drip-3" aria-hidden="true" />

				{/* Official mark — grayscale → full color reveal */}
				<div className="paint-logo-wrap">
					<img
						className="paint-logo paint-logo-ink"
						src={canvasLogo}
						alt=""
						draggable={false}
					/>
					<img
						className="paint-logo paint-logo-color"
						src={canvasLogo}
						alt="Canvas"
						draggable={false}
					/>
					<span className="paint-logo-bloom" aria-hidden="true" />
				</div>

				{/* Color-reveal chips (Jitter Logo Tap vibe) */}
				<ul className="paint-chips" aria-hidden="true">
					{PALETTE.map((swatch, i) => (
						<li
							key={swatch.name}
							className={`paint-chip paint-chip-${i}`}
							style={{ '--chip': swatch.color } as CSSProperties}
						>
							<span className="paint-chip-swatch" />
							<span className="paint-chip-label">{swatch.name}</span>
						</li>
					))}
				</ul>

				<p className="paint-wordmark">
					<span className="paint-wordmark-text">Canvas</span>
				</p>
			</div>
		</div>
	)
}
