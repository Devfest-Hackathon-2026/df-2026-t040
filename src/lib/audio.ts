// Mic capture -> 16 kHz PCM16, 40 ms frames. Two modes:
//  - hands-free: always open, energy VAD (adaptive noise floor, 320 ms pre-roll, 600 ms hangover)
//  - tap-to-talk (ptt): opened by a tap, streams everything at once and stops by itself
//    1.4 s after the person stops talking (or 8 s if nobody spoke). The mic is closed the
//    rest of the time, so other people's voices aren't picked up and iPhones play loudly.
// Plus a 24 kHz PCM16 playback queue.

const WORKLET = `
const FRAME = 640; // 40 ms @ 16 kHz
const PREROLL = 8; // 320 ms
const ATTACK = 3;  // 120 ms of speech to start
const RELEASE = 15; // 600 ms of silence to end
const PTT_RELEASE = 35; // tap-to-talk: 1.4 s of silence after speech ends the turn
const PTT_NO_SPEECH = 200; // tap-to-talk: give up after 8 s without speech
const PTT_MAX = 750; // tap-to-talk: a turn never runs longer than 30 s (noisy places, someone talking nearby)
const CALIB = 5; // first 200 ms after the mic opens: only learn the room's noise level
const MIN_WIN = 38; // 1.5 s window for the noise-floor minimum while waiting for speech
const MIN_WIN_SPEECH = 100; // 4 s once speech started: the quiet before speech stays in view
class Capture extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    this.ptt = !!(opts && opts.processorOptions && opts.processorOptions.ptt);
    this.heard = false; this.frames = 0; this.done = false;
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.frame = new Int16Array(FRAME);
    this.n = 0; this.acc = 0;
    this.ring = [];
    this.speaking = false; this.hot = 0; this.cold = 0;
    this.floor = 0.01; this.muted = false;
    this.calib = []; this.peak = 0; this.pfloor = 0.01;
    this.port.onmessage = (e) => {
      if ('muted' in e.data) this.muted = e.data.muted;
      if (e.data.stop && this.ptt && !this.done) { this.done = true; this.port.postMessage({ end: true }); }
    };
  }
  // Tap-to-talk end detection that also works in noisy places (stations, cafés):
  //  - noise level = the quietest moment of the last 1.5 s (4 s once speech started) — "minimum
  //    tracking": speech always has short gaps, so this follows the room's real noise level;
  //  - a frame counts as voice only if it is clearly above that noise AND reasonably close to how
  //    loud this person actually speaks (background chatter is quieter than the speaker);
  //  - a single loud blip (door, cough, chime) is ignored, and bursts of chatter only wind the
  //    countdown back a little instead of restarting it;
  //  - a turn ends after 30 s no matter what.
  pttFrame(buf, rms) {
    if (this.done) return;
    if (this.frames++ === 0) this.port.postMessage({ start: true });
    this.port.postMessage({ pcm: buf }, [buf]);
    this.calib.push(rms);
    if (this.calib.length > MIN_WIN_SPEECH) this.calib.shift();
    const winMin = Math.min(...(this.heard ? this.calib : this.calib.slice(-MIN_WIN)));
    this.pfloor = this.frames <= CALIB ? winMin : this.pfloor + (winMin - this.pfloor) * 0.25;
    const thr = Math.max(0.012, this.pfloor * 1.8 + 0.004);
    const voiced = this.frames > CALIB && rms > Math.max(thr, this.peak * 0.25);
    if (voiced) this.peak = Math.max(this.peak * 0.995, rms);
    this.hot = voiced ? this.hot + 1 : 0;
    this.recent = ((this.recent || 0) << 1 | (voiced ? 1 : 0)) & 15; // last 4 frames
    const recentVoiced = (this.recent & 1) + (this.recent >> 1 & 1) + (this.recent >> 2 & 1) + (this.recent >> 3 & 1);
    if (recentVoiced >= ATTACK && !this.heard) { this.heard = true; this.port.postMessage({ heard: true }); }
    const prevCold = this.cold;
    // silence fills the countdown; real speech (2+ voiced frames in a row) winds it back quickly,
    // but bursts of nearby chatter can't hold it at zero forever. A single blip is ignored.
    if (!voiced) this.cold++;
    else if (this.hot >= 2) this.cold = Math.max(0, this.cold - 3);
    // how far the "silence → send" countdown has run (0..1), so the UI can show when the turn will end
    if (this.heard && (this.cold > 0 || prevCold > 0)) this.port.postMessage({ tail: Math.min(1, this.cold / PTT_RELEASE) });
    if ((this.heard && this.cold >= PTT_RELEASE) || (!this.heard && this.frames >= PTT_NO_SPEECH) || this.frames >= PTT_MAX) {
      this.done = true;
      this.port.postMessage({ end: true, heard: this.heard });
    }
  }
  emitFrame() {
    const rms = Math.sqrt(this.acc / FRAME);
    this.acc = 0;
    const buf = this.frame.buffer;
    this.frame = new Int16Array(FRAME);
    // adaptive noise floor: falls fast, rises slowly
    this.floor = rms < this.floor ? this.floor * 0.9 + rms * 0.1 : this.floor * 0.998 + rms * 0.002;
    const thr = Math.max(0.012, this.floor * 3.2);
    // While our own speaker plays translated audio, don't fully block: require a clearly
    // louder voice (echo-cancelled playback leaks in quietly), so people can still barge in.
    const voiced = rms > (this.muted ? Math.max(thr * 3, 0.04) : thr);
    this.port.postMessage({ level: rms });
    if (this.ptt) return this.pttFrame(buf, rms);
    if (!this.speaking) {
      this.ring.push(buf);
      if (this.ring.length > PREROLL) this.ring.shift();
      this.hot = voiced ? this.hot + 1 : 0;
      if (this.hot >= ATTACK) {
        this.speaking = true; this.cold = 0; this.seg = 0;
        this.port.postMessage({ start: true });
        for (const b of this.ring) this.port.postMessage({ pcm: b }, [b]);
        this.ring = [];
      }
    } else {
      this.port.postMessage({ pcm: buf }, [buf]);
      this.hot = voiced ? this.hot + 1 : 0;
      if (!voiced) this.cold++;
      else if (this.hot >= 2) this.cold = 0; // one loud blip doesn't keep the segment open
      this.seg = (this.seg || 0) + 1;
      if (this.cold >= RELEASE || this.seg >= PTT_MAX) { this.speaking = false; this.hot = 0; this.seg = 0; this.port.postMessage({ end: true }); }
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos);
      const end = Math.max(i + 1, Math.min(ch.length, Math.floor(this.pos + this.ratio)));
      let s = 0;
      for (let k = i; k < end; k++) s += ch[k];
      const v = Math.max(-1, Math.min(1, s / (end - i)));
      this.acc += v * v;
      this.frame[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === FRAME) { this.n = 0; this.emitFrame(); }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('lingo-capture', Capture);
`

export class Mic {
  private ctx?: AudioContext
  private stream?: MediaStream
  private node?: AudioWorkletNode
  onStart: () => void = () => {}
  onAudio: (pcm: ArrayBuffer) => void = () => {}
  onEnd: () => void = () => {}
  onLevel: (level: number) => void = () => {}
  /** tap-to-talk: first speech detected in this turn */
  onHeard: () => void = () => {}
  /** tap-to-talk: silence countdown before the turn is sent (0 = talking, 1 = sending) */
  onTail: (t: number) => void = () => {}

  get running() { return !!this.node }

  /** ptt = tap-to-talk: start streaming at once and stop by itself after the person finishes. */
  async start(ptt = false) {
    // Device-rate context (resampled to 16 kHz in the worklet). A separate 16 kHz context next to the
    // 24 kHz player can silence or garble playback on iPhones, which share one hardware rate.
    this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') {
      await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 400))])
      if (this.ctx.state === 'suspended') {
        void this.ctx.close()
        this.ctx = undefined
        throw new Error('needs_gesture')
      }
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      // autoGainControl off: it turns the mic up during every pause, so background noise is boosted to
      // almost speaking level and the "you stopped talking" detection never sees silence in noisy places.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
    })
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await this.ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const src = this.ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.ctx, 'lingo-capture', { processorOptions: { ptt } })
    this.node.port.onmessage = (e) => {
      const d = e.data
      if (d.pcm) this.onAudio(d.pcm)
      else if (d.end) this.onEnd() // checked before `heard`: the end message carries heard too
      else if (d.tail !== undefined) this.onTail(d.tail)
      else if (d.heard) this.onHeard()
      else if (d.start) this.onStart()
      else if (d.level !== undefined) this.onLevel(d.level)
    }
    src.connect(this.node)
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.node.connect(mute).connect(this.ctx.destination)
  }

  /** Make speech *starts* need a louder voice (e.g. while our own speaker plays translated audio). */
  setMuted(muted: boolean) {
    this.node?.port.postMessage({ muted })
  }

  /** Tap-to-talk: finish the turn now (emits onEnd). */
  finish() {
    this.node?.port.postMessage({ stop: true })
  }

  stop() {
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    this.node = undefined
    this.stream = undefined
    this.ctx = undefined
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Sequential player for streamed PCM16 (24 kHz) and whole WAV clips. */
export class Player {
  private ctx?: AudioContext
  private t = 0
  private sources = new Set<AudioBufferSourceNode>()
  private out?: AudioNode
  onActive: (active: boolean) => void = () => {}
  onLocked: (locked: boolean) => void = () => {}

  /** Call from a user gesture once so autoplay policies allow sound. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' })
      // Translated speech is often quiet (and phones duck it): boost, with a limiter so it never clips.
      const gain = this.ctx.createGain()
      gain.gain.value = 2.2
      const lim = this.ctx.createDynamicsCompressor()
      lim.threshold.value = -8
      lim.knee.value = 6
      lim.ratio.value = 12
      lim.attack.value = 0.003
      lim.release.value = 0.15
      gain.connect(lim).connect(this.ctx.destination)
      this.out = gain
      this.ctx.onstatechange = () => {
        // iPhone: switching between recording and playback can leave the context "interrupted"
        if ((this.ctx!.state as string) === 'interrupted') void this.ctx!.resume().catch(() => {})
        this.onLocked(this.locked)
      }
    }
    // resume from "suspended" (autoplay policy) and from iOS's "interrupted" state alike
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().then(() => this.onLocked(this.locked), () => this.onLocked(this.locked))
  }

  /** true when the browser still blocks sound (needs a tap). */
  get locked() { return !this.ctx || this.ctx.state !== 'running' }

  get active() { return this.sources.size > 0 }

  pcm(b64: string) {
    this.unlock()
    const bytes = b64ToBytes(b64)
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
    const buf = this.ctx!.createBuffer(1, samples.length, 24000)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 0x8000
    this.schedule(buf)
  }

  async wav(b64: string) {
    this.unlock()
    const bytes = b64ToBytes(b64)
    const buf = await this.ctx!.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    this.schedule(buf)
  }

  private schedule(buf: AudioBuffer) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.out ?? ctx.destination)
    const now = ctx.currentTime
    // Small jitter buffer (20 ms) keeps latency low; if we fell behind, restart from now.
    if (this.t < now + 0.02) this.t = now + 0.02
    src.start(this.t)
    this.t += buf.duration
    this.sources.add(src)
    if (this.sources.size === 1) this.onActive(true)
    src.onended = () => {
      this.sources.delete(src)
      if (this.sources.size === 0) this.onActive(false)
    }
  }

  /** Short UI cue (turn start / turn sent). Quiet, ~0.15 s, never queued behind speech. */
  beep(freqs: number[]) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    let t = ctx.currentTime + 0.01
    for (const f of freqs) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.12)
      t += 0.09
    }
  }

  stop() {
    for (const s of this.sources) { try { s.stop() } catch { /* */ } }
    this.sources.clear()
    this.t = 0
    this.onActive(false)
  }
}

/**
 * iPhone/iPad (Safari 16.4+): while the mic is open the page is a "call" (quiet, ducked output).
 * Switch the audio session back to plain playback whenever we're not recording.
 */
export function setAudioSession(recording: boolean) {
  const as = (navigator as any).audioSession
  if (!as) return
  try { as.type = recording ? 'play-and-record' : 'playback' } catch { /* older Safari */ }
}
