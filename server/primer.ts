// Live Translate answers the *first* speech of a session ~2 s slower than later speech.
// We warm each new session with a short synthetic phrase in the speaker's language
// (output discarded), so the user's first real sentence takes the fast path.
import { ai, MODELS } from './ai.js'

const PHRASES: Record<string, string> = {
  ja: 'はい、こんにちは。',
  en: 'Hi, hello there.',
  'zh-Hans': '你好，欢迎。',
  'zh-Hant': '你好，歡迎。',
  ko: '네, 안녕하세요.',
  es: 'Hola, buenos días.',
  fr: 'Bonjour, merci.',
  de: 'Hallo, guten Tag.',
  th: 'สวัสดีครับ',
  it: 'Ciao, buongiorno.',
  'pt-BR': 'Olá, bom dia.',
  vi: 'Xin chào.',
  id: 'Halo, selamat pagi.',
  ru: 'Здравствуйте.',
}

/** Normalised primer phrase, to recognise its caption if it leaks into a real utterance. */
export function primerText(lang: string): string {
  return norm(PHRASES[PHRASES[lang] ? lang : 'en'])
}
export const norm = (s: string) => s.toLowerCase().replace(/[\s、。，．,.!?！？]/g, '')

const cache = new Map<string, Promise<Buffer | undefined>>()

export function primer(lang: string): Promise<Buffer | undefined> {
  const key = PHRASES[lang] ? lang : 'en'
  let p = cache.get(key)
  if (!p) {
    p = synth(PHRASES[key]).catch((e) => {
      console.warn('[primer] tts failed:', (e as Error).message)
      cache.delete(key)
      return undefined
    })
    cache.set(key, p)
  }
  return p
}

async function synth(text: string): Promise<Buffer | undefined> {
  const res = await ai().models.generateContent({
    model: MODELS.tts,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: 'Kore' } } },
  })
  const b64 = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data
  if (!b64) return undefined
  let buf = Buffer.from(b64, 'base64')
  let rate = 24000
  if (buf.subarray(0, 4).toString() === 'RIFF') {
    rate = buf.readUInt32LE(24)
    buf = buf.subarray(buf.indexOf('data') + 8)
  }
  const inS = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 2)))
  const ratio = rate / 16000
  const out = new Int16Array(Math.floor(inS.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio)
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio))
    let s = 0
    for (let k = a; k < b; k++) s += inS[k] ?? 0
    out[i] = s / (b - a)
  }
  return Buffer.from(out.buffer)
}
