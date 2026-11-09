// App-level spend guard. The GCP spending cap on the Gemini API is the hard stop;
// this keeps a demo from silently burning the credit (runaway loops, stuck mics).

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d)

const limits = {
  liveSeconds: num(process.env.LIVE_MINUTES_LIMIT, 180) * 60,
  analysisCalls: num(process.env.ANALYSIS_CALLS_LIMIT, 1500),
  ttsCalls: num(process.env.TTS_CALLS_LIMIT, 300),
}

const used = { liveSeconds: 0, analysisCalls: 0, ttsCalls: 0 }

export const guard = {
  canLive: () => used.liveSeconds < limits.liveSeconds,
  addLiveSeconds: (s: number) => { used.liveSeconds += s },
  canAnalyze: () => used.analysisCalls < limits.analysisCalls,
  useAnalysis: () => { used.analysisCalls++ },
  canTts: () => used.ttsCalls < limits.ttsCalls,
  useTts: () => { used.ttsCalls++ },
  /** Rough USD estimate (paid-tier list prices, Nov 2026). */
  report() {
    const liveUsd = (used.liveSeconds / 60) * 0.037
    return {
      used: { ...used, liveMinutes: +(used.liveSeconds / 60).toFixed(2) },
      limits: { ...limits, liveMinutes: limits.liveSeconds / 60 },
      estimatedUsd: +(liveUsd + used.analysisCalls * 0.0004 + used.ttsCalls * 0.003).toFixed(3),
    }
  },
}

/** Simple fixed-window rate limiter keyed by string. */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>()
  return (key: string) => {
    const now = Date.now()
    const h = hits.get(key)
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + windowMs })
      return true
    }
    h.n++
    return h.n <= max
  }
}
