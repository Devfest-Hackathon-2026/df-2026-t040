// Exercises the "must-not-be-wrong" confirmation, photo explanation and summary image
// with two real Chrome pages (typed messages, so no microphone needed).
// Usage: npx tsx scripts/feature-test.ts [baseUrl]   (env: HEADLESS=0 to watch, OUT=dir)
import 'dotenv/config'
import { chromium, type Page } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.argv[2] || 'http://localhost:5180'
const OUT = resolve(process.env.OUT || '.cache/feature-test')
mkdirSync(OUT, { recursive: true })
const t0 = Date.now()
const log = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${s}`)

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: process.env.HEADLESS !== '0',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=/dev/null'],
})
const page = async (locale: string, viewport: { width: number; height: number }) => {
  const ctx = await browser.newContext({ locale, viewport, acceptDownloads: true })
  await ctx.addInitScript(() => localStorage.setItem('lingo.guideSeen', '1'))
  return ctx.newPage()
}

// 1) a "ticket" photo to show
const art = await page('ja-JP', { width: 900, height: 560 })
await art.setContent(`<div style="font-family:'Hiragino Sans';width:860px;height:520px;background:#f7f2e4;border:6px solid #2b5db8;border-radius:18px;padding:30px;box-sizing:border-box">
  <div style="font-size:30px;color:#2b5db8;font-weight:800">JR東日本　特急券・乗車券</div>
  <div style="font-size:56px;font-weight:800;margin:24px 0">東京 → 新大阪</div>
  <div style="font-size:34px">11月8日　のぞみ 21号　14:03発</div>
  <div style="font-size:34px">8号車　12番 D席</div>
  <div style="font-size:30px;margin-top:20px">指定席　¥14,720　（途中下車前途無効）</div></div>`)
const ticket = `${OUT}/ticket.jpg`
await art.screenshot({ path: ticket, type: 'jpeg', quality: 85 })
await art.context().close()

// 2) staff + guest
const staff = await page('ja-JP', { width: 1180, height: 820 })
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
const guest = await page('en-US', { width: 390, height: 844 })
await guest.goto(`${BASE}/j#${code}`)
await guest.locator('form input').last().fill('Mia')
await guest.click('button.primary')
await guest.waitForSelector('#msg')
await staff.keyboard.press('Escape')
log('room ready')

async function say(p: Page, text: string) { await p.fill('#msg', text); await p.press('#msg', 'Enter') }
const lastCard = (p: Page) => p.locator('article.card').last()
// with Web Share available the primary button shares; the "PNG" button always downloads
const saveBtn = async (p: Page) => (await p.locator('.btns .ghost').count()) ? p.locator('.btns .ghost') : p.locator('.btns .primary')

// 3) critical facts → speaker confirms
await say(staff, '2つ目の信号を右に曲がって、5分ほど歩くと3番出口があります。料金は1,200円です。')
await staff.locator('article.card.me .check').last().waitFor({ timeout: 30000 })
log('check card shown to the speaker')
await staff.screenshot({ path: `${OUT}/1-staff-check.png` })
await guest.screenshot({ path: `${OUT}/1-guest-pending.png` })
await staff.locator('article.card.me .check .cok').last().click()
await guest.locator('article.card .check.confirmed').last().waitFor({ timeout: 10000 })
log('guest sees "confirmed"')
await guest.screenshot({ path: `${OUT}/2-guest-confirmed.png` })

await say(guest, 'I have a severe peanut allergy. Does the curry contain nuts? I also need to leave by 3:30 pm.')
await guest.locator('article.card.me .check').last().waitFor({ timeout: 30000 })
log('guest check shown')
await guest.locator('article.card.me .check .cng').last().click()
await guest.locator('article.card .check.corrected').last().waitFor({ timeout: 30000 })
log('guest pressed "wrong – fix", corrected')
await staff.screenshot({ path: `${OUT}/3-staff-corrected.png` })
await guest.screenshot({ path: `${OUT}/3-guest-corrected.png` })

// 4) photo
await guest.setInputFiles('input[type=file]', ticket)
await lastCard(staff).locator('img.photo').waitFor({ timeout: 10000 })
await staff.waitForFunction(() => { const c = [...document.querySelectorAll('article.card')].pop(); return c && c.getAttribute('aria-busy') === 'false' }, null, { timeout: 40000 })
log('photo explained: ' + (await lastCard(staff).locator('p.main').innerText()).slice(0, 120))
await staff.screenshot({ path: `${OUT}/4-staff-photo.png` })
await guest.screenshot({ path: `${OUT}/4-guest-photo.png` })

// 5) summary on demand → save image
await guest.click('button.sum')
await guest.locator('.preview img').waitFor({ timeout: 40000 })
log('summary image ready')
await guest.screenshot({ path: `${OUT}/5-guest-summary.png` })
const [dl] = await Promise.all([guest.waitForEvent('download'), (await saveBtn(guest)).click()])
await dl.saveAs(`${OUT}/summary-guest.png`)
log('saved summary-guest.png')
await guest.locator('.sheet .x').click()

// 6) staff ends → everyone gets the summary
staff.on('dialog', (d) => d.accept())
await staff.locator('.side .danger').click()
await guest.locator('.preview img').waitFor({ timeout: 40000 })
log('guest got the end-of-conversation summary')
await guest.screenshot({ path: `${OUT}/6-guest-ended.png` })
await staff.locator('.preview img').waitFor({ timeout: 20000 })
const [dl2] = await Promise.all([staff.waitForEvent('download'), (await saveBtn(staff)).click()])
await dl2.saveAs(`${OUT}/summary-staff.png`)
log('saved summary-staff.png')
await browser.close()
console.log('output in', OUT)
