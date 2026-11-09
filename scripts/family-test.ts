// Checks the changes from the family feedback with two real Chrome pages (phone sizes):
// how-to guide, tap-to-talk (fake mic), reply/correction links, narrowed check, editing own words.
// Usage: npx tsx scripts/family-test.ts [baseUrl]   (env: OUT=dir, HEADLESS=0)
import 'dotenv/config'
import { chromium, type Page } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.argv[2] || 'http://localhost:5180'
const OUT = resolve(process.env.OUT || '.cache/family-test')
mkdirSync(OUT, { recursive: true })
const t0 = Date.now()
const log = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${s}`)

// guest's fake mic: 0.6 s silence, English speech, then silence (the turn should stop by itself)
const pcm = readFileSync('.cache/speech-en.pcm')
const body = Buffer.concat([Buffer.alloc(16000 * 2 * 0.6), pcm, Buffer.alloc(16000 * 2 * 6)])
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
const staff = await (await sb.newContext({ locale: 'ja-JP', viewport: { width: 820, height: 1180 } })).newPage()
const guest = await (await gb.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 }, permissions: ['microphone'] })).newPage()
for (const [n, p] of [['staff', staff], ['guest', guest]] as const) p.on('pageerror', (e) => log(`${n} pageerror ${e.message}`))

let code = ''
staff.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'hello' && m.room.inviteCode) code = m.room.inviteCode } catch { /* */ } }))
await staff.goto(BASE + '/')
await staff.fill('input[placeholder="例: Akira"]', 'Akira')
if (process.env.STAFF_PASSCODE) {
  const pass = staff.locator('input[type=password]')
  if (await pass.waitFor({ timeout: 5000 }).then(() => true, () => false)) await pass.fill(process.env.STAFF_PASSCODE)
}
await staff.click('button.primary')
for (let i = 0; i < 50 && !code; i++) await staff.waitForTimeout(100)
await guest.goto(`${BASE}/j#${code}`)
await guest.locator('form input').last().fill('Mia')
await guest.click('button.primary')

// 1) how-to guide on first visit
await guest.locator('[role=dialog] .next').waitFor({ timeout: 10000 }); await guest.waitForTimeout(600)
await guest.screenshot({ path: `${OUT}/1-guest-guide.png` })
for (let i = 0; i < 4; i++) await guest.click('[role=dialog] .next')
await staff.locator('[role=dialog] .skip').click().catch(() => {})
await staff.keyboard.press('Escape')
log('guide shown and closed')
await guest.screenshot({ path: `${OUT}/2-guest-empty.png` })

async function say(p: Page, text: string) { await p.fill('#msg', text); await p.press('#msg', 'Enter') }
const finals = (p: Page) => p.locator('article.card[aria-busy=false]').count()
async function waitCards(p: Page, n: number) { for (let i = 0; i < 300 && (await finals(p)) < n; i++) await p.waitForTimeout(100) }

// 2) conversation flow: question → answer → correction (reply links + note)
await say(staff, '駅へは3番出口から出て、右に曲がってください。')
await waitCards(guest, 1)
await say(guest, 'Sorry, which exit should I take?')
await waitCards(staff, 2)
await staff.waitForTimeout(1500)
await say(staff, 'すみません、3番ではなく5番出口でした。')
await guest.locator('article.card .quote').last().waitFor({ timeout: 30000 }).then(() => log('reply/correction link shown'), () => log('NO reply link'))
await guest.waitForTimeout(2500)
await guest.screenshot({ path: `${OUT}/3-guest-flow.png` })
await staff.screenshot({ path: `${OUT}/3-staff-flow.png` })

// 3) allergy → the speaker is asked; plain direction → only an "AI checked" badge at most
await say(guest, 'I am allergic to shrimp. Is this one okay?')
await guest.locator('article.card.me .check .cok').last().waitFor({ timeout: 30000 }).then(() => log('allergy: speaker asked to confirm'), () => log('allergy: NOT asked'))
await guest.screenshot({ path: `${OUT}/4-guest-allergy-check.png` })
await guest.locator('article.card.me .check .cok').last().click().catch(() => {})
const autoBadges = await staff.locator('details.auto').count()
const asks = await staff.locator('article.card.me .check .cok').count()
log(`staff side: ${autoBadges} auto badge(s), ${asks} confirm request(s)`)

// 4) staff fixes a misheard word in their own message
await staff.locator('article.card.me .editBtn').last().click()
await staff.fill('article.card.me textarea', 'すみません、3番ではなく5番出口でした。ゆうひ公園の方です。')
await staff.click('article.card.me .esave')
await guest.waitForFunction(() => [...document.querySelectorAll('article.card .main')].some((e) => /park/i.test(e.textContent || '')), null, { timeout: 30000 })
  .then(() => log('edited text re-translated'), () => log('edit: NOT re-translated'))

// 5) tap-to-talk on the phone: press once, speak, it stops by itself
await guest.locator('.talk').click()
await guest.waitForTimeout(800)
await guest.screenshot({ path: `${OUT}/5-guest-talking.png` })
const tStart = Date.now()
await guest.waitForFunction(() => !document.querySelector('.talk.rec'), null, { timeout: 30000 })
log(`tap-to-talk stopped by itself after ${((Date.now() - tStart) / 1000).toFixed(1)}s`)
await staff.waitForFunction(() => [...document.querySelectorAll('article.card[aria-busy=false]')].length >= 5, null, { timeout: 30000 })
  .then(() => log('spoken turn arrived at staff'), () => log('spoken turn NOT finalized'))
await staff.waitForTimeout(2500)
await staff.screenshot({ path: `${OUT}/6-staff-after-voice.png` })
await guest.screenshot({ path: `${OUT}/6-guest-after-voice.png` })

// settings sheet
await guest.click('.gear')
await guest.screenshot({ path: `${OUT}/7-guest-settings.png` })
await sb.close(); await gb.close()
console.log('output in', OUT)
