export function Waveform({ hot = false }: { hot?: boolean }) {
  const bars = [8, 14, 22, 34, 18, 28, 12, 40, 24, 16, 32, 20, 36, 14, 26, 10, 30, 18, 22, 12, 28, 16, 34, 20, 12, 24, 8]
  return (
    <div className={`wave ${hot ? 'hot' : ''}`} aria-hidden>
      {bars.map((h, i) => (
        <i key={i} style={{ height: h, animationDelay: `${i * 0.05}s` }} />
      ))}
    </div>
  )
}
