export function ScoreRing({ score }: { score: number }) {
  const r = 36
  const c = 2 * Math.PI * r
  const dash = (score / 100) * c
  return (
    <div className="score-ring">
      <svg viewBox="0 0 92 92" width="92" height="92">
        <circle cx="46" cy="46" r={r} className="score-track" />
        <circle
          cx="46"
          cy="46"
          r={r}
          className="score-val"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 46 46)"
        />
      </svg>
      <div className="score-label">
        <strong>{score}</strong>
        <span>Score</span>
      </div>
    </div>
  )
}
