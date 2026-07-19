// Shared galaxy backdrop: nebula glow layers (CSS) plus a handful of
// twinkling four-point stars. Purely decorative.
const STARS: Array<{ top: string; left: string; size: number; delay: number }> = [
	{ top: '12%', left: '8%', size: 18, delay: 0 },
	{ top: '22%', left: '86%', size: 26, delay: 1.4 },
	{ top: '64%', left: '12%', size: 14, delay: 2.6 },
	{ top: '78%', left: '78%', size: 22, delay: 0.8 },
	{ top: '38%', left: '94%', size: 12, delay: 3.2 },
	{ top: '85%', left: '42%', size: 16, delay: 1.9 },
	{ top: '8%', left: '55%', size: 12, delay: 2.2 },
]

export function CosmicBackdrop() {
	return (
		<div className="cosmos" aria-hidden="true">
			{STARS.map((star, i) => (
				<span
					key={i}
					className="cosmos-star"
					style={{
						top: star.top,
						left: star.left,
						fontSize: star.size,
						animationDelay: `${star.delay}s`,
					}}
				>
					✦
				</span>
			))}
		</div>
	)
}
