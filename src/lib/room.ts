import { reactive } from 'vue'
import type { ClientMsg, Participant, RoomSnapshot, ServerMsg, Summary, Utterance, VoiceMode } from '../../shared/types'
import { Mic, Player, setAudioSession } from './audio'

const GLOSSARY_KEY = 'oshaberry.glossary'
function loadGlossary(): string[] {
  try { const v = JSON.parse(localStorage.getItem(GLOSSARY_KEY) ?? '[]'); return Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 60) : [] } catch { return [] }
}
function saveGlossary(words: string[]) { try { localStorage.setItem(GLOSSARY_KEY, JSON.stringify(words)) } catch { /* private mode */ } }

export type TalkMode = 'tap' | 'hands'

export type ConnState = 'connecting' | 'ready' | 'reconnecting' | 'ended' | 'denied'

const TOKEN_KEY = 'lingo.token'
export const saveToken = (t: string) => sessionStorage.setItem(TOKEN_KEY, t)
export const loadToken = () => sessionStorage.getItem(TOKEN_KEY) || ''
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY)

export interface Notice { id: number; level: 'info' | 'warn' | 'error'; code: string; msg?: string }

export function useRoom() {
  const state = reactive({
    conn: 'connecting' as ConnState,
    you: undefined as Participant | undefined,
    room: undefined as RoomSnapshot | undefined,
    utterances: [] as Utterance[],
    speaking: {} as Record<string, boolean>,
    // 'tap' = press to talk, stops by itself when you finish (default: works without earphones);
    // 'hands' = always listening (best with earphones)
    talkMode: (localStorage.getItem('lingo.talkMode') === 'hands' ? 'hands' : 'tap') as TalkMode,
    talking: false, // tap-to-talk turn in progress
    // tap-to-talk turn phases, so people can see exactly when to speak and when it will be sent:
    // 'opening' (mic starting — don't talk yet) → 'ready' (speak now) → 'heard' (got your voice) → 'sending'
    turnPhase: '' as '' | 'opening' | 'ready' | 'heard' | 'sending',
    turnTail: 0, // 0..1 silence countdown before the turn is sent
    audioLocked: false, // browser blocks sound until a tap
    micOn: false, // the microphone is open
    selfSpeaking: false, // local VAD says we're talking right now
    needsTap: false, // browser wants a tap before audio can start
    liveReady: false, // warm translation session is up
    micLevel: 0,
    micError: false,
    micHelp: false, // show how to allow the microphone
    outbox: [] as ClientMsg[], // typed while disconnected: sent as soon as we're back
    autoplay: true,
    // 'live' = instant model audio; 'expressive' = emotion + speaker-like voice, ≈2 s after each sentence
    voiceMode: (localStorage.getItem('lingo.voiceMode') === 'expressive' ? 'expressive' : 'live') as VoiceMode,
    playing: false,
    notices: [] as Notice[],
    summary: undefined as Summary | undefined, // take-home summary (kept after the room ends)
    summaryLoading: false,
    ending: false, // staff pressed "end": summaries are being made
  })

  const token = loadToken()
  const audioByUtt = new Map<string, string[]>()
  const player = new Player()
  const mic = new Mic()
  let unmuteTimer: number | undefined
  player.onLocked = (l) => { state.audioLocked = l }
  // Browsers only allow sound after a user gesture: any tap anywhere turns sound on
  // (people rarely notice the "turn on sound" bar, and translated voice would stay silent).
  const unlockOnGesture = () => {
    player.unlock()
    state.audioLocked = player.locked
    if (!player.locked) for (const ev of ['click', 'touchend', 'keydown']) document.removeEventListener(ev, unlockOnGesture, true)
  }
  for (const ev of ['click', 'touchend', 'keydown']) document.addEventListener(ev, unlockOnGesture, true)
  // Overlap handling: translated voice that gets cut off (you start talking) or arrives while you're
  // talking is never lost — it plays again from the start as soon as your turn ends.
  const queued = new Set<string>() // utterances whose audio is in the player right now
  const missed: string[] = [] // utterances to replay after your turn, oldest first
  function interruptPlayback() {
    if (player.active) for (const uid of queued) if (!missed.includes(uid)) missed.push(uid)
    queued.clear()
    player.stop()
  }
  function replayMissed() {
    if (!state.autoplay || !missed.length || state.talking || state.selfSpeaking) return
    for (const uid of missed.splice(0)) {
      const speaker = state.utterances.find((x) => x.id === uid)?.speakerId
      if (speaker && state.speaking[speaker]) { missed.push(uid); continue } // still talking: keep waiting
      const chunks = audioByUtt.get(`${uid}:${state.you?.lang ?? ''}`)
      if (!chunks?.length) continue
      chunks.forEach((c) => player.pcm(c))
      queued.add(uid)
    }
  }
  player.onActive = (a) => {
    if (!a) queued.clear()
    state.playing = a
    // Echo gate: don't let our own speaker's translated audio start a new utterance.
    clearTimeout(unmuteTimer)
    if (a) mic.setMuted(true)
    else unmuteTimer = window.setTimeout(() => mic.setMuted(false), 300)
  }
  let autoStarted = false
  let ws: WebSocket | undefined
  let retry = 0
  let noticeId = 0
  let closedByUs = false

  function notify(level: Notice['level'], code: string, msg?: string) {
    const n = { id: ++noticeId, level, code, msg }
    state.notices.push(n)
    setTimeout(() => { state.notices = state.notices.filter((x) => x.id !== n.id) }, level === 'error' ? 6000 : 3500)
  }

  // Things the person did on purpose are kept while offline and sent on reconnect (never silently lost).
  const KEEP = new Set<ClientMsg['t']>(['text', 'edit', 'confirm', 'set_lang', 'auto_lang', 'voice_mode', 'image', 'glossary'])
  function send(m: ClientMsg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m))
    else if (KEEP.has(m.t)) state.outbox.push(m)
  }
  function flushOutbox() {
    const out = state.outbox.splice(0)
    for (const m of out) send(m)
  }

  // Keep the screen on during a conversation (a sleeping phone drops the connection and the mic).
  let wake: { release: () => Promise<void> } | undefined
  async function keepAwake() {
    try { if (!wake && document.visibilityState === 'visible') wake = await (navigator as any).wakeLock?.request('screen'); (wake as any)?.addEventListener?.('release', () => { wake = undefined }) } catch { /* not supported / denied */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.conn === 'ready') void keepAwake() })

  function upsert(u: Utterance) {
    if (u.seq < 0) {
      state.utterances = state.utterances.filter((x) => x.id !== u.id)
      return
    }
    const i = state.utterances.findIndex((x) => x.id === u.id)
    if (i >= 0) state.utterances[i] = u
    else {
      state.utterances.push(u)
      state.utterances.sort((a, b) => a.seq - b.seq)
    }
  }

  function onMessage(m: ServerMsg) {
    switch (m.t) {
      case 'hello':
        state.you = m.you
        state.room = m.room
        state.utterances = [...m.utterances].sort((a, b) => a.seq - b.seq)
        state.conn = 'ready'
        void keepAwake()
        setTimeout(flushOutbox, 0)
        retry = 0
        if (state.voiceMode !== 'live') send({ t: 'voice_mode', mode: state.voiceMode })
        // staff device remembers its word list (shop, menu, nearby places) across conversations
        if (m.you.role === 'staff' && !m.room.glossary?.length) { const g = loadGlossary(); if (g.length) send({ t: 'glossary', words: g }) }
        // keep the translation sessions warm for both modes
        send({ t: 'listen', on: true })
        if (state.talkMode === 'hands' && !state.micOn && !autoStarted) { autoStarted = true; void startMic(true) }
        if (state.talkMode === 'tap') { setAudioSession(false); state.audioLocked = player.locked }
        break
      case 'room':
        state.room = m.room
        if (state.you) state.you = m.room.participants.find((p) => p.id === state.you!.id) ?? state.you
        break
      case 'utt': upsert(m.u); break
      case 'speaking':
        state.speaking = { ...state.speaking, [m.pid]: m.on }
        if (!m.on) setTimeout(replayMissed, 150) // they finished: play their translation now
        break
      case 'audio': {
        // keyed by utterance + my language: after a language switch, old-language audio is never replayed
        const key = `${m.uid}:${state.you?.lang ?? ''}`
        const arr = audioByUtt.get(key) ?? []
        arr.push(m.data)
        audioByUtt.set(key, arr)
        // Don't play into an open mic (echo loop). Clips are queued, never overlapped.
        if (!state.autoplay) break
        if (missed.includes(m.uid)) break // will be replayed whole (its later chunks are already stored)
        // Don't play over the person who is still talking: hold it, then play it whole once they stop.
        const speaker = state.utterances.find((x) => x.id === m.uid)?.speakerId
        const stillTalking = !!speaker && !!state.speaking[speaker]
        if (!state.selfSpeaking && !state.talking && !stillTalking) { player.pcm(m.data); queued.add(m.uid) }
        else missed.push(m.uid) // play it after the speaker (or you) finishes
        break
      }
      case 'audio_end': break
      case 'tts': void player.wav(m.data); break
      case 'notice':
        if (m.code === 'live_ready') { state.liveReady = true; break }
        if (m.code === 'summary_empty' || m.code === 'summary_failed') state.summaryLoading = false
        notify(m.level, m.code, m.msg)
        break
      case 'cleared': state.utterances = []; audioByUtt.clear(); break
      case 'summary': state.summary = m.summary; state.summaryLoading = false; break
      case 'ended':
        closedByUs = true
        state.conn = 'ended'
        stopMic()
        clearToken()
        break
    }
  }

  function connect() {
    if (!token) { state.conn = 'denied'; return }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onopen = () => ws!.send(JSON.stringify({ t: 'auth', token }))
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)) } catch { /* ignore */ } }
    ws.onclose = (e) => {
      if (state.talking) endTalk()
      if (state.micOn) stopMic()
      if (closedByUs || state.conn === 'ended') return
      if (e.code === 4403 || e.code === 4000 || e.code === 4001) {
        state.conn = e.code === 4403 && state.conn === 'connecting' ? 'denied' : 'ended'
        clearToken()
        return
      }
      state.conn = 'reconnecting'
      const delay = Math.min(8000, 500 * 2 ** retry++)
      setTimeout(connect, delay)
    }
  }

  async function startMic(auto = false, ptt = false) {
    if (state.micOn) return
    player.unlock()
    state.audioLocked = player.locked
    try {
      mic.onStart = () => {
        if (ptt) {
          // the mic is really streaming now: tell them to go ahead (sound + buzz + text)
          state.turnPhase = 'ready'
          player.beep([660, 880])
          navigator.vibrate?.(25)
        }
        state.selfSpeaking = true
        interruptPlayback() // barge-in: pause the translation now, it's replayed after your turn
        send({ t: 'speech_start' })
      }
      mic.onAudio = (pcm) => { if (ws?.readyState === WebSocket.OPEN) ws.send(pcm) }
      mic.onHeard = () => { if (state.talking) state.turnPhase = 'heard' }
      mic.onTail = (t) => { state.turnTail = t }
      mic.onEnd = () => {
        if (ptt && state.turnPhase === 'heard') { player.beep([880, 590]); navigator.vibrate?.(15) }
        state.selfSpeaking = false
        send({ t: 'speech_end' })
        if (ptt) endTalk()
        else setTimeout(replayMissed, 400) // hands-free: catch up on what you talked over
      }
      mic.onLevel = (l) => { state.micLevel = l }
      if (ptt) { state.talking = true; state.turnPhase = 'opening'; state.turnTail = 0; interruptPlayback(); setAudioSession(true) }
      await mic.start(ptt)
      state.micOn = true
      state.needsTap = false
      state.micError = false
      state.micHelp = false
      send({ t: 'listen', on: true })
    } catch (e) {
      if (ptt) { state.talking = false; state.turnPhase = ''; setAudioSession(false) }
      if ((e as Error).message === 'needs_gesture') {
        state.needsTap = true
        return
      }
      console.warn('mic error', e)
      if (state.micError) state.micHelp = true // second failure: show how to allow it
      state.micError = true
      if (!auto) notify('warn', 'mic_denied')
    }
  }

  function stopMic(keepWarm = state.talkMode === 'tap') {
    if (!state.micOn) return
    mic.stop()
    if (state.selfSpeaking) send({ t: 'speech_end' })
    state.micOn = false
    state.selfSpeaking = false
    state.micLevel = 0
    if (!keepWarm) send({ t: 'listen', on: false })
  }

  /** Tap-to-talk turn finished (by itself after silence, or by a second tap). */
  function endTalk() {
    state.talking = false
    // back to playback mode: make sure the player is running again (iPhone may have interrupted it)
    setTimeout(() => { player.unlock(); state.audioLocked = player.locked; replayMissed() }, 250)
    // show "sending…" briefly so the hand-off is visible, then clear
    if (state.turnPhase === 'heard') {
      state.turnPhase = 'sending'
      setTimeout(() => { if (!state.talking) state.turnPhase = '' }, 1600)
    } else state.turnPhase = ''
    state.turnTail = 0
    stopMic(true)
    setAudioSession(false)
  }

  /** The big talk button: start a turn, or finish it early. */
  function talk() {
    if (state.talkMode === 'hands') return state.micOn ? stopMic() : startMic()
    if (state.talking) {
      if (state.selfSpeaking) mic.finish() // → onEnd → endTalk
      else endTalk()
      return
    }
    void startMic(false, true)
  }

  function setTalkMode(mode: TalkMode) {
    if (state.talking) endTalk()
    state.talkMode = mode
    localStorage.setItem('lingo.talkMode', mode)
    if (mode === 'hands') void startMic()
    else { stopMic(true); setAudioSession(false) }
  }

  const toggleMic = talk

  function sendText(text: string) {
    player.unlock()
    if (text.trim()) send({ t: 'text', text })
  }

  function play(u: Utterance, expressive = false) {
    player.unlock()
    player.stop()
    const chunks = audioByUtt.get(`${u.id}:${state.you?.lang ?? ''}`)
    if (!expressive && chunks?.length) chunks.forEach((c) => player.pcm(c))
    else send({ t: 'tts', uid: u.id })
  }

  async function api(path: string, body?: object) {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
    })
  }

  async function leave() {
    if (state.you?.role === 'staff') state.ending = true
    closedByUs = true
    stopMic()
    void wake?.release().catch(() => {}); wake = undefined
    await api(state.you?.role === 'staff' ? '/api/end' : '/api/leave').catch(() => {})
    clearToken()
    ws?.close()
    state.conn = 'ended'
    state.ending = false
  }

  connect()

  function setVoiceMode(mode: VoiceMode) {
    state.voiceMode = mode
    localStorage.setItem('lingo.voiceMode', mode)
    player.stop()
    send({ t: 'voice_mode', mode })
  }

  /** lang/second: the languages to save the summary in (default: mine + the other main language) */
  let summaryT: ReturnType<typeof setTimeout> | undefined
  function requestSummary(lang?: string, second?: string | null) {
    state.summaryLoading = true
    send({ t: 'summary', lang, second })
    // never spin forever: if no summary (or error) arrives, stop and say so
    clearTimeout(summaryT)
    summaryT = setTimeout(() => { if (state.summaryLoading) { state.summaryLoading = false; notify('warn', 'summary_failed') } }, 60_000)
  }

  return {
    state,
    setVoiceMode,
    setTalkMode,
    talk,
    edit: (uid: string, text: string) => send({ t: 'edit', uid, text }),
    requestSummary,
    confirm: (uid: string, ok: boolean) => send({ t: 'confirm', uid, ok }),
    sendImage: (data: string) => send({ t: 'image', data }),
    toggleMic,
    startMic: () => startMic(),
    stopMic,
    sendText,
    play,
    hasLiveAudio: (uid: string) => !!audioByUtt.get(`${uid}:${state.you?.lang ?? ''}`)?.length,
    unlockAudio: () => { player.unlock(); state.audioLocked = player.locked },
    setLang: (lang: string, pid?: string) => send({ t: 'set_lang', lang, pid }),
    setAutoLang: (on: boolean) => send({ t: 'auto_lang', on }),
    retranslate: (uid: string) => send({ t: 'retranslate', uid }),
    setGlossary: (words: string[]) => { saveGlossary(words); send({ t: 'glossary', words }) },
    clear: () => send({ t: 'clear' }),
    rotateInvite: () => api('/api/invite/rotate'),
    leave,
  }
}
export type RoomApi = ReturnType<typeof useRoom>
