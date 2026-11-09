// Screenshots of every screen at phone / tablet / PC sizes (no mic: Chrome fake device, silent).
// Usage: npx tsx scripts/ui-shots.ts [baseUrl] [outDir]
import 'dotenv/config'
import { chromium, type Page } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const BASE = process.argv[2] || 'http://localhost:5180'
const OUT = process.argv[3] || '.cache/ui-shots'
mkdirSync(OUT, { recursive: true })
const SIZES: Record<string, { width: number; height: number }> = {
  phone: { width: 390, height: 844 }, tabletP: { width: 820, height: 1180 }, tabletL: { width: 1180, height: 820 }, pc: { width: 1440, height: 900 },
}
const only = process.env.SIZES?.split(',')
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=/dev/null'] })
async function page(size: string, locale: string): Promise<Page> {
  const ctx = await b.newContext({ viewport: SIZES[size], locale, deviceScaleFactor: 1 })
  return ctx.newPage()
}
for (const size of Object.keys(SIZES).filter((s) => !only || only.includes(s))) {
  const s = await page(size, 'ja-JP')
  let code = ''
  s.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'hello' && m.room.inviteCode) code = m.room.inviteCode } catch { /* binary */ } }))
  await s.goto(BASE + '/'); await s.waitForTimeout(600)
  await s.screenshot({ path: `${OUT}/${size}-1-staff-start.png` })
  await s.fill('input[placeholder="例: Akira"]', 'Akira')
  const pass = s.locator('input[type=password]')
  if (process.env.STAFF_PASSCODE && await pass.count()) await pass.fill(process.env.STAFF_PASSCODE)
  await s.click('button.primary'); await s.waitForTimeout(1500)
  await s.screenshot({ path: `${OUT}/${size}-2-staff-invite.png` })
  const g = await page(size, 'en-US')
  await g.goto(`${BASE}/j#${code}`); await g.waitForTimeout(600)
  await g.screenshot({ path: `${OUT}/${size}-3-guest-join.png` })
  await g.locator('form input').last().fill('Mia'); await g.click('button.primary'); await g.waitForTimeout(1500)
  // a couple of typed messages so the conversation isn't empty
  await s.keyboard.press('Escape'); await s.locator('.modal .close, [aria-label="close"], [aria-label="閉じる"]').first().click({ timeout: 1000 }).catch(() => {})
  await s.fill('#msg', 'いらっしゃいませ。何かお困りですか？'); await s.press('#msg', 'Enter')
  await g.waitForTimeout(3500)
  await g.fill('#msg', 'Where is the nearest station?'); await g.press('#msg', 'Enter')
  await s.waitForTimeout(4000)
  await s.screenshot({ path: `${OUT}/${size}-4-staff-room.png` })
  await g.screenshot({ path: `${OUT}/${size}-5-guest-room.png` })
  await s.context().close(); await g.context().close()
  console.log('done', size)
}
await b.close()
