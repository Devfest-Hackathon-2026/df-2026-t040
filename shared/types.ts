// Wire contract shared by server and client.

export type Role = 'staff' | 'guest'

export type EmotionLabel =
  | 'neutral' | 'gratitude' | 'joy' | 'concern' | 'frustration' | 'urgency' | 'uncertainty' | 'unknown'
export type Delivery =
  | 'warm' | 'calm' | 'excited' | 'hesitant' | 'firm' | 'soft' | 'rapid' | 'neutral'
export type Certainty = 'low' | 'medium' | 'high'

export interface Emotion {
  label: EmotionLabel
  delivery: Delivery
  intensity: number // internal 0..1, never shown as a probability
  certainty: Certainty
  evidence?: string
}

export interface Participant {
  id: string
  name: string
  role: Role
  lang: string // BCP-47 base code, e.g. "ja", "en"
  langDetected: boolean
  /** follow the language they actually speak (off once they pick one by hand, until re-enabled) */
  langAuto?: boolean
  online: boolean
  /** how this participant hears translations: instant model audio, or emotion + speaker-like voice (≈2 s later) */
  voiceMode?: VoiceMode
}

export type VoiceMode = 'live' | 'expressive'

export interface Utterance {
  id: string
  seq: number
  speakerId: string
  speakerName: string
  kind: 'voice' | 'text' | 'image'
  /** kind 'image': small JPEG data URL (kept in memory only, deleted with the conversation) */
  image?: string
  /** facts that must not be mistranslated, waiting for / confirmed by the speaker */
  check?: CriticalCheck
  /** conversation flow: which earlier utterance this one answers / corrects (like a chat reply) */
  context?: UttContext
  /** the speaker corrected the recognised words by hand */
  edited?: boolean
  sourceLang: string
  original: string
  translations: Record<string, string>
  /** listener languages whose translation could not be produced (shown as an error with a retry) */
  failedLangs?: string[]
  final: boolean
  emotion?: Emotion
  hasAudio: boolean
  createdAt: string
}

/** 'auto' = AI found the critical facts translated correctly and nothing high-risk: shown, not asked */
export type CheckStatus = 'pending' | 'confirmed' | 'fixing' | 'corrected' | 'auto'
export type Relation = 'answer' | 'correction' | 'followup'
export interface UttContext {
  replyTo: string // utterance id
  relation: Relation
  /** per language: what "this / that / it" refers to, or what was corrected (only when needed) */
  note?: Record<string, string>
}
export interface CriticalItem {
  kind: string // number | price | time | date | direction | place | allergy | medical | quantity | negation | other
  source: string // span in the speaker's words
  checks: { lang: string; text: string; back: string; ok: boolean }[] // per listener language
}
export interface CriticalCheck { status: CheckStatus; items: CriticalItem[] }

export interface SummaryContent { title: string; points: string[]; important: string[]; next: string[] }
export interface Summary {
  primary: string // viewer's language
  secondary?: string // the other main language in the conversation
  byLang: Record<string, SummaryContent>
  participants: string[]
  createdAt: string
}

export interface RoomSnapshot {
  id: string
  name: string
  capacity: number
  participants: Participant[]
  inviteCode?: string // staff only
  inviteExpiresAt?: string // staff only
  glossary?: string[] // staff only: shop/menu/place names to recognise and keep exact
}

export type ServerMsg =
  | { t: 'hello'; you: Participant; room: RoomSnapshot; utterances: Utterance[] }
  | { t: 'room'; room: RoomSnapshot }
  | { t: 'utt'; u: Utterance }
  | { t: 'audio'; uid: string; data: string } // base64 PCM16 24kHz mono
  | { t: 'audio_end'; uid: string }
  | { t: 'speaking'; pid: string; on: boolean }
  | { t: 'tts'; uid: string; lang: string; data: string } // base64 WAV
  | { t: 'notice'; level: 'info' | 'warn' | 'error'; code: string; msg?: string }
  | { t: 'cleared' }
  | { t: 'summary'; summary: Summary }
  | { t: 'ended' }

export type ClientMsg =
  | { t: 'auth'; token: string }
  | { t: 'listen'; on: boolean }
  | { t: 'speech_start' }
  | { t: 'speech_end' }
  | { t: 'mic_start' }
  | { t: 'mic_stop' }
  | { t: 'text'; text: string }
  | { t: 'tts'; uid: string }
  | { t: 'set_lang'; lang: string; pid?: string }
  | { t: 'auto_lang'; on: boolean }
  | { t: 'glossary'; words: string[] }
  | { t: 'retranslate'; uid: string }
  | { t: 'voice_mode'; mode: VoiceMode }
  | { t: 'confirm'; uid: string; ok: boolean }
  | { t: 'edit'; uid: string; text: string }
  | { t: 'image'; data: string }
  | { t: 'summary'; lang?: string; second?: string | null }
  | { t: 'clear' }
  | { t: 'ping' }
