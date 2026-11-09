// Headless end-to-end check: staff (ja) + guest (en) in one room.
// 1) guest sends text  2) staff "speaks" Japanese audio (synthesised with TTS) through the Live Translate path.
// Usage: npx tsx scripts/e2e.ts [http://localhost:8787]
import 'dotenv/config'
import WebSocket from 'ws'
import { GoogleGenAI } from '@google/genai'

const BASE = process.argv[2] || 'http://localhost:8787'
const WS = BASE.replace(/^http/, 'ws') + '/ws'

async function post(path: string, body: object, token?: string) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  return r.json() as Promise<any>
}

function client(name: string, token: string) {
  const ws = new WebSocket(WS)
  const msgs: any[] = []
  ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })))
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString())
    msgs.push(m)
    if (m.t === 'audio') return
    if (m.t === 'utt' && !m.u.final) return
    console.log(`[${name}]`, m.t, m.t === 'utt' ? JSON.stringify({ kind: m.u.kind, src: m.u.sourceLang, orig: m.u.original, tr: m.u.translations, emo: m.u.emotion }) : m.t === 'notice' ? `${m.code} ${m.msg ?? ''}` : '')
  })
  return { ws, msgs, ready: new Promise((r) => ws.on('message', function h(d) { if (JSON.parse(d.toString()).t === 'hello') { ws.off('message', h); r(null) } })) }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function tts16k(text: string): Promise<Buffer> {
  const ai = new GoogleGenAI({ enterprise: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: 'global' })
  const res = await ai.models.generateContent({
    model: process.env.TTS_MODEL || 'gemini-3.8-flash-tts',
    contents: [{ role: 'user', parts: [{ text, speechMetadata: { style: 'worried, sincere' } }] }],
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: 'Kore' } } },
  })
  const b64 = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data
  if (!b64) throw new Error('no tts audio')
  let buf = Buffer.from(b64, 'base64')
  let rate = 24000
  if (buf.subarray(0, 4).toString() === 'RIFF') {
    rate = buf.readUInt32LE(24)
    const idx = buf.indexOf('data')
    buf = buf.subarray(idx + 8)
  }
  // resample to 16k (linear)
  const inS = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2)
  const outLen = Math.floor(inS.length * 16000 / rate)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const x = i * rate / 16000, i0 = Math.floor(x), f = x - i0
    out[i] = (inS[i0] ?? 0) * (1 - f) + (inS[i0 + 1] ?? 0) * f
  }
  return Buffer.from(out.buffer)
}

const room = await post('/api/rooms', { staffName: 'Akira', staffLang: 'ja', passcode: process.env.STAFF_PASSCODE })
const staff = client('staff', room.token)
await staff.ready
const inv = staff.msgs.find((m) => m.t === 'hello').room.inviteCode
const join = await post('/api/join', { code: inv, name: 'Mia', lang: 'en' })
const guest = client('guest', join.token)
await guest.ready

console.log('--- text from guest')
guest.ws.send(JSON.stringify({ t: 'text', text: "Thank you so much! Where is the nearest station?" }))
await sleep(6000)

console.log('--- voice from staff (synthesised)')
const pcm = await tts16k('ご心配なく。駅はこの道をまっすぐ五分ほどです。')
console.log('tts seconds', (pcm.length / 32000).toFixed(1))
staff.ws.send(JSON.stringify({ t: 'mic_start' }))
for (let i = 0; i < pcm.length; i += 3200) {
  staff.ws.send(pcm.subarray(i, i + 3200))
  await sleep(100)
}
// a little trailing silence
for (let i = 0; i < 10; i++) { staff.ws.send(Buffer.alloc(3200)); await sleep(100) }
staff.ws.send(JSON.stringify({ t: 'mic_stop' }))
await sleep(12000)
const audioChunks = guest.msgs.filter((m) => m.t === 'audio').length
console.log('guest received audio chunks:', audioChunks)
console.log('health:', JSON.stringify(await fetch(BASE + '/api/health').then((r) => r.json())))
await post('/api/end', {}, room.token)
process.exit(0)
