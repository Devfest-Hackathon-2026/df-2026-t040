// Measures the pitch of each prebuilt TTS voice (to map speakers to the closest one).
import 'dotenv/config'
import { GoogleGenAI } from '@google/genai'
import { medianF0 } from '../server/voice.js'
const ai = new GoogleGenAI({ enterprise: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: 'global' })
const MODEL = process.argv[2] || 'gemini-3.8-flash-lite-tts'
const VOICES = (process.argv[3] || "Charon,Puck,Orus,Iapetus,Kore,Zephyr,Algenib,Umbriel,Enceladus,Achird,Aoede,Sulafat,Leda,Schedar").split(",")
const out: Record<string, number> = {}
await Promise.all(VOICES.map(async (v) => {
  const t0 = Date.now()
  try {
    const res = await ai.models.generateContent({ model: MODEL, contents: [{ role: 'user', parts: [{ text: 'Thank you so much, the station is just around the corner.' }] }], config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: v } } } })
    let buf = Buffer.from(res.candidates![0].content!.parts!.find((p) => p.inlineData)!.inlineData!.data!, 'base64')
    let rate = 24000
    if (buf.subarray(0, 4).toString() === 'RIFF') { rate = buf.readUInt32LE(24); buf = buf.subarray(buf.indexOf('data') + 8) }
    out[v] = Math.round(medianF0(buf, rate))
    console.log(v, out[v], 'Hz', Date.now() - t0, 'ms')
  } catch (e) { console.log(v, 'FAILED', (e as Error).message.slice(0, 120)) }
}))
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).sort((a, b) => a[1] - b[1]))))
