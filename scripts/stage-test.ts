// Phone-size check of the "D" layout: big stage + chat history, tap-to-talk phases with a
// fake mic (opening → ready → heard/countdown → sent), second-pass transcript, Russian caption.
// Usage: npx tsx scripts/stage-test.ts [baseUrl]   (env: OUT=dir, HEADLESS=0)
import 'dotenv/config'
import { chromium, type Page } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.argv[2] || 'http://localhost:5180'
const OUT = resolve(process.env.OUT || '.cache/stage-test')
mkdirSync(OUT, { recursive: true })
const t0 = Date.now()
const log = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${s}`)

// guest's fake mic: 1.2 s silence, English speech, then silence
const pcm = readFileSync('.cache/speech-en.pcm')
const body = Buffer.concat([Buffer.alloc(16000 * 2 * 1.2), pcm, Buffer.alloc(16000 * 2 * 8)])
const h = Buffer.alloc(44)
h.write('RIFF', 0); h.writeUInt32LE(36 + body.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(body.length, 40)
writeFileSync(`${OUT}/mic-guest.wav`, Buffer.concat([h, body]))

const launch = (mic: string) => chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: process.env.HEADLESS !== '0',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${mic}`, '--autoplay-policy=no-user-gesture-required'],
})
const sb = await launch('/dev/null')
const gb = await launch(`${OUT}/mic-guest.wav%noloop`)
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }
const staff = await (await sb.newContext({ locale: 'ja-JP', ...phone })).newPage()
const guest = await (await gb.newContext({ locale: 'en-US', ...phone, permissions: ['microphone'] })).newPage()
for (const p of [staff, guest]) await p.addInitScript(() => { localStorage.setItem('lingo.guideSeen', '1'); sessionStorage.setItem('lingo.langOk', '1') })
for (const [n, p] of [['staff', staff], ['guest', guest]] as const) p.on('pageerror', (e) => log(`${n} pageerror ${e.message}`))

let code = ''
staff.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'hello' && m.room.inviteCode) code = m.room.inviteCode } catch { /* */ } }))
await staff.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await staff.fill('input[placeholder="例: Akira"]', 'ゆうひ')
if (process.env.STAFF_PASSCODE) {
  const pass = staff.locator('input[type=password]')
  if (await pass.waitFor({ timeout: 5000 }).then(() => true, () => false)) await pass.fill(process.env.STAFF_PASSCODE)
}
await staff.click('button.primary')
for (let i = 0; i < 50 && !code; i++) await staff.waitForTimeout(100)
await staff.waitForTimeout(800)
await staff.keyboard.press('Escape') // close invite modal if open
await staff.locator('.scrim').click({ position: { x: 5, y: 5 } }).catch(() => {})
await staff.screenshot({ path: `${OUT}/0-staff-empty.png` })

await guest.goto(`${BASE}/j#${code}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await guest.locator('form input').last().fill('Emma')
await guest.click('button.primary')
await guest.locator('#msg').waitFor({ timeout: 10000 })

async function say(p: Page, text: string) { await p.fill('#msg', text); await p.press('#msg', 'Enter') }
async function settle(p: Page, ms = 300) { for (let i = 0; i < 200 && await p.locator('.stage.live, .stage .partial').count(); i++) await p.waitForTimeout(100); await p.waitForTimeout(ms) }

await say(guest, 'Hi! Do you have a vegetarian menu?')
await staff.locator('article.msg:not(.me)').first().waitFor({ timeout: 30000 })
await staff.waitForTimeout(2500)
await staff.screenshot({ path: `${OUT}/1-staff-stage-other.png` })
log('staff: guest line is in the chat (stage hidden: ' + !(await staff.locator('.stage').count()) + ')')
await say(staff, 'はい、野菜ラーメンがございます。1,200円です。')
await staff.waitForTimeout(6000)
await staff.screenshot({ path: `${OUT}/2-staff-stage-mine.png` })
await guest.screenshot({ path: `${OUT}/2-guest-stage.png` })

// tap-to-talk with the fake mic: capture each phase
const phases: Record<string, boolean> = {}
const shot = async (name: string) => guest.screenshot({ path: `${OUT}/3-guest-${name}.png` })
await guest.click('.talk')
for (let i = 0; i < 300; i++) {
  const cls = (await guest.locator('.stage').getAttribute('class')) ?? ''
  for (const ph of ['opening', 'ready', 'heard', 'sending']) {
    if (cls.includes(`ph-${ph}`) && !phases[ph]) { phases[ph] = true; await shot(ph); log(`phase ${ph}`) }
  }
  if (cls.includes('ph-heard') && !phases.tail) {
    const w = await guest.locator('.tail.on').count()
    if (w) { phases.tail = true; await shot('tail'); log('silence countdown visible') }
  }
  if (phases.sending) break
  await guest.waitForTimeout(50)
}
log(`phases seen: ${Object.keys(phases).join(', ')}`)
await staff.waitForTimeout(8000)
await staff.screenshot({ path: `${OUT}/4-staff-after-voice.png` })
await guest.screenshot({ path: `${OUT}/4-guest-after-voice.png` })

// Russian guest: the rotating caption must stay on one line
const ru = await (await gb.newContext({ locale: 'ru-RU', viewport: { width: 360, height: 780 } })).newPage()
await ru.goto(`${BASE}/j#${code}`)
let maxH = 0
for (let i = 0; i < 24; i++) { maxH = Math.max(maxH, (await ru.locator('.multi').boundingBox())?.height ?? 0); const t = await ru.locator('.multi span').innerText().catch(() => ''); if (/Говор/.test(t)) await ru.screenshot({ path: `${OUT}/5-ru-join.png` }); await ru.waitForTimeout(400) }
log(`russian caption max height ${maxH.toFixed(0)}px (one line ≈ 27px)`)

await sb.close(); await gb.close()
log('done')
