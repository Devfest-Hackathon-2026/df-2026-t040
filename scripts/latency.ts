// Measures how "live" the voice path is: streams a ~15 s utterance in real time
// and logs when the listener receives partial captions / translation / audio.
// Usage: npx tsx scripts/latency.ts [baseUrl] [ja|en]
import 'dotenv/config'
import WebSocket from 'ws'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { GoogleGenAI } from '@google/genai'

const BASE = process.argv[2] || 'http://localhost:8787'
const SPEAKER_LANG = (process.argv[3] || 'ja') as 'ja' | 'en'
const WS = BASE.replace(/^http/, 'ws') + '/ws'
const TEXT = SPEAKER_LANG === 'ja'
  ? 'いらっしゃいませ。駅へは、この道をまっすぐ進んで、二つ目の信号を右に曲がってください。そこから五分ほど歩くと、左側に改札が見えます。切符は自動券売機で買えますよ。'
  : "Hi, excuse me. I'm really worried because I think I lost my bag on the train this morning. It's a small black backpack with my passport inside. Could you please help me find the lost and found office?"
const LISTENER_LANG = SPEAKER_LANG === 'ja' ? 'en' : 'ja'
const CACHE = `.cache/speech-${SPEAKER_LANG}.pcm`

async function speech16k(): Promise<Buffer> {
  if (existsSync(CACHE)) return readFileSync(CACHE)
  const ai = new GoogleGenAI({ enterprise: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: 'global' })
  const res = await ai.models.generateContent({
    model: 'gemini-3.8-flash-tts',
    contents: [{ role: 'user', parts: [{ text: TEXT, speechMetadata: { style: 'natural conversational pace' } }] }],
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: 'Kore' } } },
  })
  let buf = Buffer.from(res.candidates![0].content!.parts!.find((p) => p.inlineData)!.inlineData!.data!, 'base64')
  let rate = 24000
  if (buf.subarray(0, 4).toString() === 'RIFF') { rate = buf.readUInt32LE(24); buf = buf.subarray(buf.indexOf('data') + 8) }
  const inS = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 2)))
  // windowed-average resample to 16 kHz (avoids aliasing that hurt recognition)
  const ratio = rate / 16000
  const out = new Int16Array(Math.floor(inS.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio))
    let s = 0
    for (let k = a; k < b; k++) s += inS[k] ?? 0
    out[i] = s / (b - a)
  }
  const pcm = Buffer.from(out.buffer)
  mkdirSync('.cache', { recursive: true })
  writeFileSync(CACHE, pcm)
  return pcm
}

async function post(path: string, body: object, token?: string) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  return r.json() as Promise<any>
}
function connect(token: string, onMsg: (m: any) => void) {
  const ws = new WebSocket(WS)
  ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })))
  return new Promise<WebSocket>((res) => ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'hello') res(ws); onMsg(m) }))
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const pcm = await speech16k()
const dur = pcm.length / 32000
console.log(`utterance ${dur.toFixed(1)}s, ${SPEAKER_LANG} -> ${LISTENER_LANG}`)

const room = await post('/api/rooms', { staffName: 'Akira', staffLang: SPEAKER_LANG, passcode: process.env.STAFF_PASSCODE })
let code = ''
const speaker = await connect(room.token, (m) => { if (m.t === 'hello') code = m.room.inviteCode })
const join = await post('/api/join', { code, name: 'Mia', lang: LISTENER_LANG })

let t0 = 0
const ms = () => ((Date.now() - t0) / 1000).toFixed(2).padStart(6)
let firstOrig = 0, firstTr = 0, firstAudio = 0, audioChunks = 0
let lastTr = ''
const timeline: string[] = []
await connect(join.token, (m) => {
  if (!t0) return
  if (m.t === 'audio') {
    audioChunks++
    if (!firstAudio) { firstAudio = Date.now(); timeline.push(`${ms()}s  🔊 first translated audio`) }
  }
  if (m.t === 'utt') {
    const tr = m.u.translations[LISTENER_LANG] || ''
    if (m.u.original && !firstOrig) { firstOrig = Date.now(); timeline.push(`${ms()}s  📝 first source caption: ${m.u.original}`) }
    if (tr && tr !== lastTr) {
      if (!firstTr) firstTr = Date.now()
      lastTr = tr
      timeline.push(`${ms()}s  🌐 ${m.u.final ? 'FINAL' : 'partial'}: ${tr}`)
    }
    if (m.u.final && m.u.original) timeline.push(`${ms()}s  ✅ final source: ${m.u.original}`)
  }
})
// hands-free: start listening (warms the Live session), then speak a bit later
const tWarm = Date.now()
speaker.send(JSON.stringify({ t: 'listen', on: true }))
await new Promise<void>((res) => {
  const h = (d: any) => { const m = JSON.parse(d.toString()); if (m.t === 'notice' && m.code === 'live_ready') { speaker.off('message', h); res() } }
  speaker.on('message', h)
})
console.log(`warm session ready in ${Date.now() - tWarm}ms`)
await sleep(500)

const REPEAT = Number(process.env.REPEAT ?? 1)
const firsts: string[] = []
for (let rep = 0; rep < REPEAT; rep++) {
  firstOrig = firstTr = firstAudio = 0
  lastTr = ''
  t0 = Date.now()
  timeline.push(`--- utterance ${rep + 1}`)
  speaker.send(JSON.stringify({ t: 'speech_start' }))
  for (let i = 0; i < pcm.length; i += 1280) {
    const target = t0 + (i / 1280) * 40
    const wait = target - Date.now()
    if (wait > 0) await sleep(wait)
    speaker.send(pcm.subarray(i, i + 1280))
  }
  timeline.push(`${ms()}s  🎤 speech ends (${dur.toFixed(1)}s)`)
  for (let i = 0; i < 6; i++) { speaker.send(Buffer.alloc(3200)); await sleep(100) }
  speaker.send(JSON.stringify({ t: 'speech_end' }))
  timeline.push(`${ms()}s  ⏹ speech_end (VAD)`)
  await sleep(Number(process.env.GAP ?? 10000))
  firsts.push(`utt${rep + 1}: first caption ${((firstOrig - t0) / 1000).toFixed(2)}s, first translation ${((firstTr - t0) / 1000).toFixed(2)}s, first audio ${((firstAudio - t0) / 1000).toFixed(2)}s`)
}
console.log(timeline.join('\n'))
console.log('\n' + firsts.join('\n'))
await post('/api/end', {}, room.token)
process.exit(0)
