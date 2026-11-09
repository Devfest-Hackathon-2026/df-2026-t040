// Two real Chrome windows (staff + guest) talking through the actual web UI.
// Each Chrome gets a "virtual microphone" from a WAV file (Chrome's fake capture
// device), so the whole browser path is exercised: getUserMedia, AudioWorklet VAD,
// WebSocket, server, Live Translate, playback.
//
// Usage:  npx tsx scripts/browser-test.ts [baseUrl]
//   env: STAFF_LANG=ja GUEST_LANG=en HEADLESS=1 OUT=dir VOICE_MODE=live|expressive
// Needs the dev server (npm run dev) or a deployed URL. Speech comes from
// .cache/speech-{lang}.pcm (create it by running scripts/latency.ts once per language).
import 'dotenv/config'
import { chromium, type Page, type Browser } from 'playwright-core'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { medianF0 } from '../server/voice.js'

const BASE = process.argv[2] || 'http://localhost:5180'
const STAFF_LANG = process.env.STAFF_LANG || 'ja'
const GUEST_LANG = process.env.GUEST_LANG || 'en'
const HEADLESS = process.env.HEADLESS === '1'
const OUT = resolve(process.env.OUT || '.cache/browser-test')
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(OUT, { recursive: true })

// ---- virtual microphones -------------------------------------------------
function speech(lang: string): Buffer {
  const p = `.cache/speech-${lang}.pcm`
  if (!existsSync(p)) throw new Error(`${p} missing — run: npx tsx scripts/latency.ts ${BASE} ${lang}`)
  return readFileSync(p)
}
const silence = (sec: number) => Buffer.alloc(Math.round(sec * 16000) * 2)
function wav(pcm: Buffer, file: string) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  writeFileSync(file, Buffer.concat([h, pcm]))
  return file
}
const staffSpeech = speech(STAFF_LANG)
const guestSpeech = speech(GUEST_LANG)
const staffDur = staffSpeech.length / 32000
const guestDur = guestSpeech.length / 32000
// Staff talks first; the guest answers after the staff's translation has played out.
// (Each file starts when that page opens its mic; the guest joins a few seconds later.)
const STAFF_LEAD = Number(process.env.STAFF_LEAD ?? 12), GUEST_LEAD = STAFF_LEAD + staffDur + 6
const staffWav = wav(Buffer.concat([silence(STAFF_LEAD), staffSpeech, silence(GUEST_LEAD + guestDur + 20)]), `${OUT}/mic-staff.wav`)
const guestWav = wav(Buffer.concat([silence(GUEST_LEAD), guestSpeech, silence(20)]), `${OUT}/mic-guest.wav`)
const TOTAL = GUEST_LEAD + guestDur + 14

// ---- browsers ------------------------------------------------------------
const t0 = Date.now()
const now = () => (Date.now() - t0) / 1000
const log: string[] = []
const say = (who: string, s: string) => { const l = `${now().toFixed(2).padStart(6)}s [${who}] ${s}`; log.push(l); console.log(l) }

async function open(who: string, micFile: string, locale: string, x: number, viewport = { width: 414, height: 820 }): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: HEADLESS,
    args: [
      '--use-fake-ui-for-media-stream', // auto-allow mic
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${micFile}%noloop`,
      '--autoplay-policy=no-user-gesture-required',
      `--lang=${locale}`,
      `--window-position=${x},40`, `--window-size=${viewport.width + 16},${viewport.height + 80}`,
    ],
  })
  const ctx = await browser.newContext({ locale, viewport, permissions: ['microphone'] })
  const mode = process.env.VOICE_MODE || 'live'
  // this test drives an always-open fake mic: hands-free mode, no first-time guide
  await ctx.addInitScript((m) => { localStorage.setItem('lingo.voiceMode', m); localStorage.setItem('lingo.talkMode', 'hands'); localStorage.setItem('lingo.guideSeen', '1') }, mode)
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') say(who, `console.${m.type()}: ${m.text()}`) })
  page.on('pageerror', (e) => say(who, `pageerror: ${e.message}`))
  return { browser, page }
}

type Rec = { speaker: string; start: number; pcm: Buffer[]; orig?: number; tr?: number; audio?: number; final?: number; text?: string; translation?: string }
const utts = new Map<string, Rec>()
const pendingStart: Record<string, number> = {}
let inviteCode = ''

function watch(who: 'staff' | 'guest', page: Page, listenLang: string) {
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      if (typeof f.payload !== 'string') return
      const m = JSON.parse(f.payload)
      if (m.t === 'speech_start') { pendingStart[who] = now(); say(who, '🎤 VAD speech_start') }
      if (m.t === 'speech_end') say(who, '⏹ VAD speech_end')
    })
    ws.on('framereceived', (f) => {
      if (typeof f.payload !== 'string') return
      const m = JSON.parse(f.payload)
      if (m.t === 'hello' && m.room.inviteCode) inviteCode = m.room.inviteCode
      if (m.t === 'notice') say(who, `notice ${m.level} ${m.code} ${m.msg ?? ''}`)
      if (m.t === 'utt' && m.u.kind === 'voice') {
        const speakerRole = m.u.speakerName === 'Akira' ? 'staff' : 'guest'
        if (speakerRole === who) return // only measure on the listener side
        let r = utts.get(m.u.id)
        if (!r) { r = { speaker: speakerRole, start: pendingStart[speakerRole] ?? now(), pcm: [] }; utts.set(m.u.id, r) }
        if (m.u.original && !r.orig) { r.orig = now(); say(who, `📝 first caption: ${m.u.original}`) }
        const tr = m.u.translations?.[listenLang]
        if (tr && !r.tr) { r.tr = now(); say(who, `🌐 first translation: ${tr}`) }
        if (m.u.final && !r.final) { r.final = now(); r.text = m.u.original; r.translation = tr; say(who, `✅ final: ${m.u.original} → ${tr}`) }
      }
      if (m.t === 'audio') {
        const r = utts.get(m.uid)
        if (r) r.pcm.push(Buffer.from(m.data, 'base64'))
        if (r && !r.audio) { r.audio = now(); say(who, `🔊 first translated audio${r.final ? ` (${(r.audio - r.final).toFixed(2)}s after final)` : ''}`) }
      }
    })
  })
}

const staff = await open('staff', staffWav, STAFF_LANG === 'ja' ? 'ja-JP' : STAFF_LANG, 0, { width: 1180, height: 820 })
watch('staff', staff.page, STAFF_LANG)
await staff.page.goto(BASE + '/')
await staff.page.fill('input[placeholder="例: Akira"]', 'Akira')
await staff.page.selectOption('select', STAFF_LANG)
if (process.env.STAFF_PASSCODE) {
  // the passcode field appears once /api/health says it's required
  const pass = staff.page.locator('input[type=password]')
  if (await pass.waitFor({ timeout: 5000 }).then(() => true, () => false)) await pass.fill(process.env.STAFF_PASSCODE)
}
await staff.page.click('button.primary')
say('staff', 'room created')
for (let i = 0; i < 50 && !inviteCode; i++) await staff.page.waitForTimeout(100)
if (!inviteCode) throw new Error('no invite code')

const guestLocale = { en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', es: 'es-ES', th: 'th-TH' }[GUEST_LANG] ?? GUEST_LANG
const guest = await open('guest', guestWav, guestLocale, 1200)
watch('guest', guest.page, GUEST_LANG)
await guest.page.goto(`${BASE}/j#${inviteCode}`)
await guest.page.locator('form input').last().fill('Mia')
await guest.page.click('button.primary')
say('guest', `joined with code ${inviteCode} (browser locale ${guestLocale})`)

// If the page still asks for a tap (autoplay blocked), tap it like a user would.
for (const [who, p] of [['staff', staff.page], ['guest', guest.page]] as const) {
  const tap = p.locator('button.tapStart')
  if (await tap.isVisible().catch(() => false)) { await tap.click(); say(who, 'tapped start overlay') }
}

await Promise.all([staff.page.waitForTimeout(TOTAL * 1000)])
await staff.page.bringToFront()
await staff.page.screenshot({ path: `${OUT}/staff.png` })
await guest.page.screenshot({ path: `${OUT}/guest.png` })

const lines = ['', '=== results (listener side, seconds after the speaker\'s VAD speech_start) ===']
for (const [id, r] of utts) {
  const d = (t?: number) => (t ? `${(t - r.start).toFixed(2)}s` : '—')
  lines.push(`${r.speaker} utt ${id.slice(0, 6)}: caption ${d(r.orig)}, translation ${d(r.tr)}, audio ${d(r.audio)}, final ${d(r.final)}`)
  lines.push(`   "${r.text ?? ''}" → "${r.translation ?? ''}"`)
  if (r.pcm.length) {
    const pcm = Buffer.concat(r.pcm)
    const f = `${OUT}/audio-${r.speaker}-${id.slice(0, 6)}.wav`
    const h = Buffer.alloc(44)
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
    h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
    writeFileSync(f, Buffer.concat([h, pcm]))
    lines.push(`   audio ${(pcm.length / 48000).toFixed(1)}s, pitch ${Math.round(medianF0(pcm, 24000))} Hz → ${f.split('/').pop()}`)
  }
}
if (!utts.size) lines.push('no voice utterances reached the listener')
console.log(lines.join('\n'))
writeFileSync(`${OUT}/log.txt`, log.concat(lines).join('\n'))
console.log(`\nscreenshots + log in ${OUT}`)
await staff.browser.close()
await guest.browser.close()
process.exit(0)
