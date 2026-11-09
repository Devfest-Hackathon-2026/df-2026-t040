// "A voice close to the speaker's": we can't clone a walk-in guest's voice (cloning needs a
// consent recording), so we measure the speaker's pitch from their own audio and pick
// the prebuilt TTS voice whose pitch is closest. Purely acoustic: no gender/age inference.

// Median pitch of each prebuilt voice measured with scripts/voice-survey.ts (varies ±15 Hz
// between takes), grouped into registers. Two voices per register so that two speakers
// with similar voices still sound different.
const REGISTERS: { maxF0: number; voices: string[] }[] = [
  { maxF0: 140, voices: ['Charon', 'Iapetus'] },   // ≈120–135 Hz
  { maxF0: 175, voices: ['Orus', 'Puck'] },        // ≈150–165 Hz
  { maxF0: 205, voices: ['Aoede', 'Sulafat'] },    // ≈195–200 Hz
  { maxF0: Infinity, voices: ['Kore', 'Leda'] },   // ≈205–215 Hz
]
export const DEFAULT_VOICE = 'Kore'

/** Closest prebuilt voice for a speaker pitch, avoiding voices other speakers already use. */
export function pickVoice(f0: number, taken: Set<string>): string {
  if (!f0) return DEFAULT_VOICE
  const reg = REGISTERS.find((r) => f0 <= r.maxF0)!
  return reg.voices.find((v) => !taken.has(v)) ?? reg.voices[0]
}

/** Median fundamental frequency (Hz) of voiced frames in PCM16 mono, or 0 (YIN estimator). */
export function medianF0(pcm: Buffer, rate = 16000): number {
  // the first 5 s are plenty and keep this under ~50 ms (it runs on the event loop)
  const len = Math.min(pcm.length - (pcm.length % 2), rate * 2 * 5)
  const s = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + len))
  const W = Math.round(rate * 0.03) // 30 ms integration window
  const maxTau = Math.ceil(rate / 65), minTau = Math.floor(rate / 450)
  const hop = Math.round(rate * 0.04)
  const d = new Float64Array(maxTau + 1)
  const f0s: number[] = []
  // skip quiet frames (silence / breath): gate at 10% of the loud-frame energy
  const energy = (i: number) => { let e = 0; for (let k = 0; k < W; k++) e += s[i + k] * s[i + k]; return e / W }
  const es: number[] = []
  for (let i = 0; i + W + maxTau <= s.length; i += hop) es.push(energy(i))
  const loud = [...es].sort((a, b) => b - a)[Math.floor(es.length * 0.1)] ?? 0
  for (let f = 0; f < es.length; f++) {
    if (es[f] < loud * 0.1 || es[f] < 1e4) continue
    const i = f * hop
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0
      for (let k = 0; k < W; k++) { const x = s[i + k] - s[i + k + tau]; sum += x * x }
      d[tau] = sum
    }
    let run = 0, found = 0
    const vals = new Float64Array(maxTau + 1)
    for (let tau = 1; tau <= maxTau; tau++) { run += d[tau]; vals[tau] = d[tau] * tau / (run || 1) }
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (vals[tau] < 0.15) {
        while (tau + 1 <= maxTau && vals[tau + 1] < vals[tau]) tau++
        found = tau
        break
      }
    }
    if (found) f0s.push(rate / found)
  }
  if (f0s.length < 5) return 0
  f0s.sort((a, b) => a - b)
  return f0s[Math.floor(f0s.length / 2)]
}
