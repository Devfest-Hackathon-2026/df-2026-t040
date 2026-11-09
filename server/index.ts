import 'dotenv/config'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import { WebSocketServer } from 'ws'
import { timingSafeEqual } from 'node:crypto'
import { attachSocket, createRoom, endRoom, endRoomWithSummary, joinRoom, leaveRoom, onClientMessage, resolveToken, rotateInvite, roomCount } from './rooms.js'
import { guard, rateLimiter } from './guard.js'
import { hasKey, MODELS } from './ai.js'

const PORT = Number(process.env.PORT || 8787)
const app = express()
// The app moved (lingo → oshaberry): the old service sends every visitor to the new address,
// keeping the path. Browsers carry the #invite-code fragment across the redirect, so old QR codes still work.
const REDIRECT_TO = process.env.REDIRECT_TO?.replace(/\/$/, '')
if (REDIRECT_TO) app.use((req, res) => res.redirect(301, REDIRECT_TO + req.originalUrl))
app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))

const limitCreate = rateLimiter(20, 60 * 60 * 1000)
const limitJoin = rateLimiter(30, 10 * 60 * 1000)
const ip = (req: express.Request) => (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '?'

function bearer(req: express.Request) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : ''
}

function passOk(given: unknown) {
  const want = process.env.STAFF_PASSCODE || ''
  if (!want) return true
  const a = Buffer.from(String(given ?? ''))
  const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: hasKey(), models: MODELS, rooms: roomCount(), usage: guard.report(), passcodeRequired: !!process.env.STAFF_PASSCODE })
})

app.post('/api/rooms', (req, res) => {
  if (!limitCreate(ip(req))) return res.status(429).json({ error: 'rate_limited' })
  if (!passOk(req.body?.passcode)) return res.status(401).json({ error: 'bad_passcode' })
  const r = createRoom({ name: req.body?.name, staffName: req.body?.staffName, staffLang: req.body?.staffLang })
  res.json(r)
})

app.post('/api/join', (req, res) => {
  if (!limitJoin(ip(req))) return res.status(429).json({ error: 'rate_limited' })
  const code = String(req.body?.code || '')
  if (!/^[A-Za-z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'invalid' })
  const r = joinRoom(code, req.body?.name, req.body?.lang)
  if (!r.ok) return res.status(r.error === 'full' ? 409 : r.error === 'expired' ? 410 : 404).json({ error: r.error })
  res.json({ token: r.token, roomId: r.roomId })
})

app.post('/api/invite/rotate', (req, res) => {
  const ctx = resolveToken(bearer(req))
  if (!ctx || ctx.member.role !== 'staff') return res.status(403).json({ error: 'forbidden' })
  rotateInvite(ctx.room.id)
  res.json({ ok: true })
})

app.post('/api/leave', (req, res) => {
  const ctx = resolveToken(bearer(req))
  if (!ctx) return res.json({ ok: true })
  leaveRoom(ctx.room, ctx.member)
  res.json({ ok: true })
})

app.post('/api/end', async (req, res) => {
  const ctx = resolveToken(bearer(req))
  if (!ctx || ctx.member.role !== 'staff') return res.status(403).json({ error: 'forbidden' })
  await endRoomWithSummary(ctx.room)
  res.json({ ok: true })
})

// Static client (production build)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 })

wss.on('connection', (ws) => {
  let ctx: ReturnType<typeof resolveToken>
  const authTimer = setTimeout(() => ws.close(4401, 'auth timeout'), 5000)
  let alive = true
  ws.on('pong', () => { alive = true })
  const hb = setInterval(() => {
    if (!alive) return ws.terminate()
    alive = false
    ws.ping()
  }, 20000)
  ws.on('close', () => { clearInterval(hb); clearTimeout(authTimer) })

  ws.on('message', (raw, isBinary) => {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)
    if (!ctx) {
      if (isBinary) return
      try {
        const m = JSON.parse(buf.toString())
        if (m?.t !== 'auth') return
        ctx = resolveToken(String(m.token || ''))
      } catch { /* ignore */ }
      if (!ctx) return ws.close(4403, 'invalid token')
      clearTimeout(authTimer)
      attachSocket(ctx.room, ctx.member, ws)
      return
    }
    onClientMessage(ctx.room, ctx.member, buf, isBinary)
  })
})

server.listen(PORT, () => {
  console.log(`Lingo API on http://localhost:${PORT}  (gemini key: ${hasKey() ? 'set' : 'MISSING'})`)
})
