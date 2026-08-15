export function TrendChart({ values }: { values: number[] }) {
  const w = 280
  const h = 88
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - 8 - ((v - min) / (max - min || 1)) * (h - 16)
    return [x, y] as const
  })
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${d} L${w},${h} L0,${h} Z`
  const last = pts[pts.length - 1]
  return (
    <svg className="trend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#trendFill)" />
      <path d={d} className="trend-line" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2.5} className="trend-dot" />
      ))}
      <circle cx={last[0]} cy={last[1]} r="8" className="trend-glow" />
    </svg>
  )
}
