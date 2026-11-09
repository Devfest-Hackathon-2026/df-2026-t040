<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoom } from '../lib/room'
import { langName, t } from '../lib/i18n'
import MessageCard from '../components/MessageCard.vue'
import Composer from '../components/Composer.vue'
import InviteModal from '../components/InviteModal.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import Waveform from '../components/Waveform.vue'
import SummarySheet from '../components/SummarySheet.vue'
import GuideOverlay from '../components/GuideOverlay.vue'
import SettingsSheet from '../components/SettingsSheet.vue'
import LiveStage from '../components/LiveStage.vue'
import LangConfirm from '../components/LangConfirm.vue'

const r = useRoom()
const s = r.state
const isStaff = computed(() => s.you?.role === 'staff')
const myLang = computed(() => s.you?.lang ?? 'en')
const d = computed(() => t(isStaff.value ? 'ja' : myLang.value))
const others = computed(() => s.room?.participants.filter((p) => p.id !== s.you?.id) ?? [])
const onlineOthers = computed(() => others.value.filter((p) => p.online).length)
const showInvite = ref(false)
const showPeople = ref(false)
const showSummary = ref(false)
// open the summary as soon as it arrives (on request, or when the conversation ends)
watch(() => s.summary, (v) => { if (v) showSummary.value = true })
function askSummary() {
  if (s.summary && !s.summaryLoading) showSummary.value = true
  r.requestSummary()
}
// first-time walkthrough (also from the ? button / settings)
const showGuide = ref(false)
const showSettings = ref(false)
const settingsPage = ref<'main' | 'lang'>('main')
function openSettings(p: 'main' | 'lang') { settingsPage.value = p; showSettings.value = true }
// Guests first confirm their language (guessed from the phone), then see the how-to guide.
const showLangCheck = ref(false)
watch(() => s.conn, (c) => {
  if (c !== 'ready') return
  if (!isStaff.value && !sessionStorage.getItem('lingo.langOk')) showLangCheck.value = true
  else if (!localStorage.getItem('lingo.guideSeen')) showGuide.value = true
}, { immediate: true })
function langChecked(pick?: string) {
  if (pick) r.setLang(pick)
  sessionStorage.setItem('lingo.langOk', '1')
  showLangCheck.value = false
  r.unlockAudio()
  if (!localStorage.getItem('lingo.guideSeen')) showGuide.value = true
}
function closeGuide() { showGuide.value = false; localStorage.setItem('lingo.guideSeen', '1'); r.unlockAudio() }
// someone else talking right now → shown on the big button ("their turn")
const partner = computed(() => others.value.find((p) => s.speaking[p.id])?.name)
const byId = computed(() => new Map(s.utterances.map((u) => [u.id, u])))
// D layout: the newest line (or the one being spoken right now) sits big on the stage;
// everything before it is the chat history underneath.
// The stage is only for your own turn (speaking / being translated); everyone else's lines live in the chat.
const stageU = computed(() => [...s.utterances].reverse().find((u) => !u.final && u.kind === 'voice' && u.speakerId === s.you?.id))
const showStage = computed(() => !!s.turnPhase || !!stageU.value || (!s.utterances.length && !speakingNoCard.value.length))
const history = computed(() => s.utterances.filter((u) => u !== stageU.value))
// latest finished line per speaker: older lines' pending checks are no longer shown to listeners
const latestBySpeaker = computed(() => {
  const m = new Map<string, string>()
  for (const u of s.utterances) if (u.final) m.set(u.speakerId, u.id)
  return m
})
const stageEmpty = computed(() => (isStaff.value && !others.value.length ? d.value.stageEmptyStaff : d.value.stageEmpty))

/** chat-app grouping: same speaker within 3 minutes → no repeated avatar/name */
function isGrouped(i: number) {
  const u = history.value[i], p = history.value[i - 1]
  return !!p && p.speakerId === u.speakerId && Date.parse(u.createdAt) - Date.parse(p.createdAt) < 180_000
}
function focusText() { (document.getElementById('msg') as HTMLInputElement | null)?.focus() }
function jump(uid: string) {
  const el = list.value?.querySelector(`[data-uid="${uid}"]`) as HTMLElement | null
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1200)
}
const list = ref<HTMLElement>()

// People who are speaking but whose card hasn't arrived yet.
const speakingNoCard = computed(() =>
  Object.entries(s.speaking)
    .filter(([pid, on]) => on && !s.utterances.some((u) => u.speakerId === pid && !u.final))
    .map(([pid]) => s.room?.participants.find((p) => p.id === pid))
    .filter((p): p is NonNullable<typeof p> => !!p),
)

const firstTime = computed(() => {
  const u = s.utterances[0]
  return u ? new Date(u.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
})

// Layout breakpoints that change behaviour (not just CSS):
// ≥1100 px the staff side panel shows participants + actions; ≥1400 px the QR stays visible inline.
const mqSide = window.matchMedia('(min-width: 1100px)')
const mqQr = window.matchMedia('(min-width: 1400px)')
const sideOpen = ref(mqSide.matches)
const qrWide = ref(mqQr.matches)
const qrPinned = ref(false)
// Wide screens show the QR beside the chat only until someone joins (or when staff opens it again).
const qrInline = computed(() => qrWide.value && (others.value.length === 0 || qrPinned.value))
const onMq = () => { sideOpen.value = mqSide.matches; qrWide.value = mqQr.matches }
function openQr() { if (qrWide.value) qrPinned.value = true; else showInvite.value = true }
let invitedOnce = false
mqSide.addEventListener('change', onMq)
mqQr.addEventListener('change', onMq)
onBeforeUnmount(() => { mqSide.removeEventListener('change', onMq); mqQr.removeEventListener('change', onMq) })

// Staff: open the invite automatically while nobody else is in the room (unless the QR is already on screen).
watch(() => s.conn, (c) => {
  // open the invite once at the start, not again after every reconnect
  if (c === 'ready' && isStaff.value && others.value.length === 0 && !qrWide.value && !invitedOnce) { invitedOnce = true; showInvite.value = true }
})
watch(() => others.value.length, (n, o) => { if (n > (o ?? 0)) { showInvite.value = false; qrPinned.value = false } })

watch(() => [s.utterances.length, s.utterances.at(-1)?.original, s.utterances.at(-1)?.translations], async () => {
  await nextTick()
  const el = list.value
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
}, { deep: true })

const LANG_OPTIONS = ['ja', 'en', 'zh-Hans', 'zh-Hant', 'ko', 'th', 'es', 'fr', 'de', 'it', 'pt-BR', 'vi', 'id', 'ru']

const noticeText = (code: string, msg?: string) => {
  const dd = d.value
  switch (code) {
    case 'overlap': return dd.overlap
    case 'no_speech': return dd.noSpeech
    case 'mic_denied': return dd.micDenied
    case 'live_limit': return dd.limit
    case 'translate_failed': return dd.error
    case 'tts_failed': return dd.error
    case 'live_connect_failed': return `${dd.error}${msg ? ` (${msg.slice(0, 80)})` : ''}`
    case 'live_closed': return dd.reconnecting
    case 'lang_detected': {
      const [name, l] = (msg ?? '').split(':')
      return isStaff.value ? `${name} さんの言語を「${langName(l, 'ja')}」と判定しました` : dd.langChanged(langName(l, myLang.value))
    }
    default: return code
  }
}

function onPlay(uid: string, expressive: boolean) {
  const u = s.utterances.find((x) => x.id === uid)
  if (u) r.play(u, expressive)
}
async function leave() {
  if (isStaff.value && !confirm('会話を終了しますか？参加者全員に会話の要約を渡してから、接続と会話の文字を削除します。')) return
  if (!isStaff.value && s.utterances.some((u) => u.final) && !s.summary) {
    // guests leaving on their own still get their take-home summary
    r.requestSummary()
    for (let i = 0; i < 60 && s.summaryLoading; i++) await new Promise((res) => setTimeout(res, 200))
  }
  await r.leave()
}
</script>

<template>
  <div class="shell" :class="isStaff ? 'staff' : 'guest'" @pointerdown.once="r.unlockAudio()">
    <div class="accent" />

    <!-- states without a room -->
    <div v-if="s.conn === 'denied' || s.conn === 'ended'" class="center">
      <h1 class="logo"><img class="mark" src="/mark.png" alt="" />oshaberry</h1>
      <p class="big">{{ s.conn === 'ended' ? d.ended : d.invalidCode }}</p>
      <button v-if="s.summary" class="btn alt" @click="showSummary = true"><Icon name="doc" :size="20" />{{ d.summaryReady }}</button>
      <a v-if="isStaff || s.conn === 'denied'" class="btn" href="/">新しい会話</a>
    </div>
    <div v-else-if="!s.room" class="center"><h1 class="logo"><img class="mark" src="/mark.png" alt="" />oshaberry</h1><p>{{ d.reconnecting }}</p></div>

    <div v-else class="body">
      <!-- ── Staff side panel (tablet landscape / PC) ── -->
      <aside v-if="isStaff" class="side">
        <span class="logo sideLogo"><img class="mark" src="/mark.png" alt="" />oshaberry</span>
        <section class="sidePeople">
          <h2>参加者 <small>{{ s.room.participants.length }} / {{ s.room.capacity }}</small></h2>
          <div v-for="p in s.room.participants" :key="p.id" class="person">
            <Avatar :name="p.name" :size="36" :class="{ off: !p.online }" />
            <div class="pinfo">
              <strong>{{ p.name }}<small v-if="p.id === s.you?.id">（あなた）</small></strong>
              <small>{{ langName(p.lang, 'ja') }}{{ p.langDetected ? '・自動判定' : '' }}</small>
            </div>
            <span class="online" :class="{ on: p.online }" :aria-label="p.online ? '接続中' : '未接続'" />
            <select v-if="p.id !== s.you?.id" :value="p.lang" :aria-label="`${p.name} の言語を変更`" @change="r.setLang(($event.target as HTMLSelectElement).value, p.id)">
              <option v-for="l in LANG_OPTIONS" :key="l" :value="l">{{ langName(l, 'ja') }}</option>
            </select>
          </div>
        </section>
        <div class="sideActions">
          <button class="ghost" @click="r.clear()"><Icon name="trash" :size="18" />画面の文字を消す</button>
          <button class="danger" @click="leave"><Icon name="logout" :size="18" />会話を終了</button>
        </div>
      </aside>

      <!-- ── Guest side panel (PC / tablet landscape) ── -->
      <aside v-else class="side gside">
        <span class="logo sideLogo"><img class="mark" src="/mark.png" alt="" />oshaberry</span>
        <section class="banner sideBanner">
          <Icon name="globe" :size="26" />
          <div><strong>{{ d.autoTranslating }}</strong><small>{{ d.autoDetect }} · {{ langName(myLang, myLang) }}</small></div>
        </section>
        <section class="sidePeople">
          <h2>{{ d.people }}</h2>
          <div v-for="p in s.room.participants" :key="p.id" class="person">
            <Avatar :name="p.name" :size="36" :class="{ off: !p.online }" />
            <div class="pinfo">
              <strong>{{ p.name }}</strong>
              <small>{{ langName(p.lang, myLang) }}</small>
            </div>
            <span class="online" :class="{ on: p.online }" />
          </div>
        </section>
        <p class="privacy"><Icon name="check" :size="16" />{{ d.consentBody }}</p>
        <div class="sideActions">
          <button class="ghost" @click="leave"><Icon name="logout" :size="18" />{{ d.leave }}</button>
        </div>
      </aside>

      <!-- ── Conversation ── -->
      <main class="main">
        <header class="top">
          <span class="logo topLogo"><img class="mark" src="/mark.png" alt="oshaberry" /><span class="wordmark">oshaberry</span></span>
          <span class="dot" :class="s.conn" :title="s.conn" />
          <span class="spacer" />
          <template v-if="isStaff">
            <span class="pill">{{ s.room.participants.length }} / {{ s.room.capacity }}</span>
            <button class="iconBtn sum" :aria-label="d.summary" :title="d.summary" :disabled="s.summaryLoading" @click="askSummary"><Icon name="doc" :size="18" /><span>{{ s.summaryLoading ? d.makingSummary : d.summary }}</span></button>
            <button class="iconBtn narrowOnly hidePhone" aria-label="画面の文字を消す" title="画面の文字を消す" @click="r.clear()"><Icon name="trash" :size="20" /></button>
            <button class="iconBtn narrowOnly hidePhone danger" aria-label="会話を終了" title="会話を終了" @click="leave"><Icon name="logout" :size="20" /></button>
            <button class="iconBtn hidePhone" aria-label="使い方" title="使い方" @click="showGuide = true"><Icon name="help" :size="20" /></button>
            <button v-if="!qrInline" class="qr" aria-label="QRで招待" @click="openQr"><Icon name="qr" :size="24" /></button>
          </template>
          <template v-else>
            <span class="conn">{{ s.conn === 'reconnecting' ? d.reconnecting : d.connectedWith(onlineOthers) }}</span>
            <button class="iconBtn sum" :aria-label="d.summary" :title="d.summary" :disabled="s.summaryLoading" @click="askSummary"><Icon name="doc" :size="18" /><span>{{ s.summaryLoading ? d.makingSummary : d.summary }}</span></button>
            <button class="iconBtn langChip" :aria-label="`${d.language}: ${langName(myLang, myLang)}`" :title="d.language" @click="openSettings('lang')"><Icon name="globe" :size="18" /><span>{{ langName(myLang, myLang) }}</span></button>
            <button class="iconBtn hidePhone" :aria-label="d.howTo" :title="d.howTo" @click="showGuide = true"><Icon name="help" :size="20" /></button>
            <button class="leave narrowOnly hidePhone" :aria-label="d.leave" @click="leave"><Icon name="logout" :size="20" /></button>
          </template>
        </header>

        <section v-if="isStaff" class="intro col">
          <div class="titleRow">
            <h1>会話</h1>
            <span class="auto"><Icon name="globe" :size="18" />言語を自動判定</span>
          </div>
          <p class="subtitle">発話・入力言語を自動判定して翻訳</p>
          <template v-if="!sideOpen">
            <button class="people" @click="showPeople = !showPeople" :aria-expanded="showPeople">
              <Avatar v-for="p in s.room.participants" :key="p.id" :name="p.name" :size="34" :class="{ off: !p.online }" />
              <span>参加者 {{ s.room.participants.length }}人</span>
            </button>
            <div v-if="showPeople" class="peopleList">
              <div v-for="p in s.room.participants" :key="p.id" class="person">
                <Avatar :name="p.name" :size="36" />
                <div class="pinfo">
                  <strong>{{ p.name }}<small v-if="p.id === s.you?.id">（あなた）</small></strong>
                  <small>{{ langName(p.lang, 'ja') }}{{ p.langDetected ? '・自動判定' : '' }}</small>
                </div>
                <span class="online" :class="{ on: p.online }" :aria-label="p.online ? '接続中' : '未接続'" />
                <select :value="p.lang" :aria-label="`${p.name} の言語を変更`" @change="r.setLang(($event.target as HTMLSelectElement).value, p.id)">
                  <option v-for="l in LANG_OPTIONS" :key="l" :value="l">{{ langName(l, 'ja') }}</option>
                </select>
              </div>
            </div>
          </template>
        </section>
        <section v-else class="banner col narrowOnly">
          <Icon name="globe" :size="26" />
          <div><strong>{{ d.autoTranslating }}</strong><small>{{ d.autoDetect }} · {{ langName(myLang, myLang) }}</small></div>
        </section>

        <p v-if="s.conn === 'reconnecting' || s.conn === 'connecting'" class="offline" role="status"><span class="spinS" aria-hidden="true" />{{ d.offlineBar }}</p>

        <LiveStage
          v-if="showStage"
          :d="d"
          :viewer-lang="isStaff ? s.you!.lang : myLang"
          :me-id="s.you?.id"
          :u="stageU"
          :speaking-name="undefined"
          :phase="s.turnPhase"
          :tail="s.turnTail"
          :level="s.micLevel"
          :empty-text="stageEmpty"
          :partner-name="others[0]?.name"
          :empty-action="isStaff && !others.length"
          @empty="openQr"
          @play="(uid: string) => onPlay(uid, false)"
          @send-now="r.talk()"
        />

        <div ref="list" class="list">
          <div class="col listCol">
            <p v-if="history.length" class="day">{{ d.history }} · {{ firstTime }}</p>
            <MessageCard
              v-for="(u, i) in history"
              :key="u.id"
              :grouped="isGrouped(i)"
              :superseded="latestBySpeaker.get(u.speakerId) !== u.id"
              :u="u"
              :viewer-lang="isStaff ? s.you!.lang : myLang"
              :d="d"
              :is-me="u.speakerId === s.you?.id"
              :level="s.micLevel"
              :show-langs="isStaff"
              :reply="u.context ? byId.get(u.context.replyTo) : undefined"
              @play="(e: boolean) => onPlay(u.id, e)"
              @confirm="(ok: boolean) => r.confirm(u.id, ok)"
              @edit="(t: string) => r.edit(u.id, t)"
              @jump="jump"
              @retry="r.retranslate(u.id)"
            />
            <article v-for="p in speakingNoCard.filter((x) => x.id !== s.you?.id)" :key="'sp' + p.id" class="speaking">
              <Avatar :name="p.name" :size="28" />
              <strong>{{ d.speaking(p.name) }}</strong>
              <Waveform />
            </article>
          </div>
        </div>

        <div class="composerWrap">
          <p v-if="s.outbox.filter((m) => m.t === 'text' || m.t === 'image').length" class="outbox" role="status">⏳ {{ d.unsent(s.outbox.filter((m) => m.t === 'text' || m.t === 'image').length) }}</p>
          <button v-if="s.audioLocked && s.conn === 'ready' && !showGuide" class="soundOn" @click="r.unlockAudio()">
            <Icon name="volume" :size="18" />{{ d.soundOn }}
          </button>
          <Composer
            class="col"
            :d="d"
            :talk-mode="s.talkMode"
            :talking="s.talking"
            :mic-on="s.micOn"
            :speaking="s.selfSpeaking"
            :playing="s.playing"
            :partner="partner"
            :level="s.micLevel"
            :mic-error="s.micError"
            :phase="s.turnPhase"
            :disabled="s.conn !== 'ready'"
            @send="r.sendText"
            @talk="r.talk"
            @photo="r.sendImage"
            @settings="openSettings('main')"
          />
        </div>
      </main>

      <!-- ── PC: invite QR always visible ── -->
      <aside v-if="isStaff && qrInline && s.room.inviteCode" class="qrPanel">
        <InviteModal inline :closable="others.length > 0" :room="s.room" @close="qrPinned = false" @rotate="r.rotateInvite()" />
      </aside>
    </div>

    <InviteModal v-if="s.room && showInvite && isStaff && !qrInline && s.room.inviteCode" :room="s.room" @close="showInvite = false" @rotate="r.rotateInvite()" />

    <div v-if="s.micHelp" class="scrimHelp" @click.self="s.micHelp = false">
      <div class="micHelp" role="dialog" aria-modal="true" :aria-label="d.micHelpTitle">
        <Icon name="mic" :size="30" />
        <h2>{{ d.micHelpTitle }}</h2>
        <p>{{ d.micHelpIos }}</p>
        <p>{{ d.micHelpAndroid }}</p>
        <button class="mhRetry" @click="s.micHelp = false; r.talk()">{{ d.micRetry }}</button>
        <button class="mhType" @click="s.micHelp = false; focusText()">{{ d.micType }}</button>
      </div>
    </div>
    <LangConfirm v-if="showLangCheck && s.room" :d="d" :lang="myLang" :langs="LANG_OPTIONS" @ok="langChecked()" @pick="(l: string) => langChecked(l)" />
    <GuideOverlay v-if="showGuide && s.room" :d="d" :lang="isStaff ? 'ja' : myLang" @close="closeGuide" />
    <SettingsSheet
      v-if="showSettings"
      :page="settingsPage"
      :d="d"
      :staff="isStaff"
      :talk-mode="s.talkMode"
      :autoplay="s.autoplay"
      :voice-mode="s.voiceMode"
      :lang="s.you?.lang ?? myLang"
      :langs="LANG_OPTIONS"
      @close="showSettings = false"
      @talk-mode="r.setTalkMode"
      @autoplay="(on: boolean) => (s.autoplay = on)"
      @voice-mode="r.setVoiceMode"
      @guide="showSettings = false; showGuide = true"
      @lang="(l: string) => r.setLang(l)"
      :auto-lang="s.you?.langAuto !== false"
      @auto-lang="(on: boolean) => r.setAutoLang(on)"
      :glossary="s.room?.glossary ?? []"
      @glossary="(w: string[]) => r.setGlossary(w)"
      @leave="showSettings = false; leave()"
      @clear="showSettings = false; r.clear()"
    />
    <SummarySheet
      v-if="s.summary && showSummary"
      :summary="s.summary"
      :d="d"
      closable
      :loading="s.summaryLoading"
      @close="showSummary = false"
    />
    <div v-if="s.ending" class="ending"><span class="spin" />{{ d.endingSummary }}</div>

    <button v-if="s.needsTap && s.conn === 'ready' && s.talkMode === 'hands'" class="tapStart" @click="r.startMic()">
      <span class="tapMic"><Icon name="mic" :size="40" /></span>
      <strong>{{ d.tapToStart }}</strong>
      <small>{{ d.listening }}</small>
    </button>

    <div class="toasts" role="status">
      <p v-for="n in s.notices" :key="n.id" class="toast" :class="n.level">{{ noticeText(n.code, n.msg) }}</p>
    </div>
  </div>
</template>

<style scoped>
/* Breakpoints: phone < 768 ≤ tablet portrait < 1100 ≤ tablet landscape / PC (side panel) < 1400 ≤ wide PC (inline QR) */
.shell { height: 100%; display: flex; flex-direction: column; position: relative; background: var(--chat-bg); }
.accent { display: none; }
.center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; text-align: center; }
.big { font-size: 20px; font-weight: 700; }
.btn.alt { background: var(--green-100); color: var(--green-800); border: 0; display: inline-flex; gap: 8px; align-items: center; font-size: 16px; }
.btn { background: var(--green-800); color: #fff; padding: 16px 28px; border-radius: 999px; text-decoration: none; font-weight: 700; }

.body { flex: 1; min-height: 0; display: flex; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
/* content column: comfortable reading width, centred in whatever space the main area has */
.col { width: 100%; max-width: 860px; margin-inline: auto; }

/* ── side panels ── */
.side { display: none; }
.qrPanel { display: none; }
@media (min-width: 1100px) {
  .side { display: flex; flex-direction: column; gap: 22px; width: 340px; flex: none; padding: 20px 22px 22px; border-right: 1px solid var(--gray-200); overflow-y: auto; background: rgba(255,255,255,.6); }
  .narrowOnly { display: none !important; }
  .topLogo { display: none; }
  .dot { margin-left: 0; }
}
@media (min-width: 1400px) {
  .qrPanel { display: block; width: 340px; flex: none; padding: 24px; border-left: 1px solid var(--gray-200); overflow-y: auto; }
  .side { width: 340px; }
}
.sideLogo { font-size: 34px; }
.side h2 { margin: 0 0 4px; font-size: 17px; display: flex; align-items: baseline; gap: 8px; }
.side h2 small { font-size: 13px; color: var(--gray-500); font-weight: 600; }
.hint { margin: 0 0 10px; font-size: 12px; color: var(--gray-500); }
.sidePeople .person { background: #fff; border-radius: 14px; padding: 8px 10px; border: 1px solid var(--gray-200); }
.sidePeople .person + .person { margin-top: 8px; border-top: 1px solid var(--gray-200); }
.sidePeople select { max-width: 104px; }
.sideActions { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
.ghost, .danger { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; border-radius: var(--r-el); font-weight: 700; }
.ghost { background: #fff; border: 1px solid var(--gray-200); }
.side .danger { background: #fff; border: 1px solid var(--border); color: var(--error); }
.sideBanner { margin: 0; }
.privacy { margin: 0; font-size: 12px; line-height: 1.6; color: var(--gray-500); display: flex; gap: 8px; }
.privacy svg { flex: none; color: var(--green-600); margin-top: 2px; }

/* ── header ── */
.top { display: flex; align-items: center; gap: 8px; padding: 8px 14px; min-height: 56px; min-width: 0; background: #fff; border-bottom: 1px solid var(--border); }
.logo { font-size: 26px; font-weight: 700; letter-spacing: -.01em; margin: 0; color: var(--ink); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); margin-left: 12px; }
.dot.reconnecting, .dot.connecting { background: #e0a23a; }
.spacer { flex: 1; }
.pill { white-space: nowrap; font-size: 12.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: var(--gray-100); color: var(--gray-700); font-variant-numeric: tabular-nums; }
.qr { width: 44px; height: 44px; border-radius: var(--r-el); background: var(--ink); color: #fff; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.iconBtn { width: 40px; height: 40px; border-radius: var(--r-el); display: inline-flex; align-items: center; justify-content: center; background: #fff; color: var(--gray-700); border: 1px solid var(--border); flex: none; transition: background var(--fast); }
.iconBtn:hover { background: var(--gray-50); }
.iconBtn.danger { color: var(--error); }
.iconBtn.sum { width: auto; padding: 0 12px; gap: 6px; font-weight: 600; font-size: 13.5px; color: var(--ink); }
.iconBtn.sum:disabled { opacity: .7; }
.iconBtn.langChip { width: auto; max-width: 140px; padding: 0 12px; gap: 5px; font-weight: 600; font-size: 13.5px; color: var(--ink); }
.iconBtn.langChip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 767px) {
  .hidePhone { display: none !important; }
  .logo.topLogo { font-size: 22px; }
  .qr { width: 40px; height: 40px; }
  .top { padding-inline: 12px; }
  .dot { margin-left: 4px; }
  .iconBtn.langChip { max-width: 128px; }
}
/* small phones: the mark alone is the logo, so the summary + language chips fit */
@media (max-width: 440px) { .topLogo .wordmark { display: none; } .topLogo .mark { width: 38px; height: 38px; } }
.ending { position: fixed; inset: 0; z-index: 75; background: rgba(255,255,255,.92); display: flex; align-items: center; justify-content: center; gap: 14px; font-weight: 700; font-size: 18px; color: var(--green-800); }
.spin { width: 26px; height: 26px; border-radius: 50%; border: 3px solid var(--green-100); border-top-color: var(--green-600); animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.conn { font-size: 13px; color: var(--gray-500); }
.leave { width: 44px; height: 44px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: var(--gray-500); }

.intro { padding: 14px 20px 4px; }
.titleRow { display: flex; align-items: center; justify-content: space-between; }
h1 { margin: 0; font-size: 26px; }
.auto { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 700; color: var(--green-800); }
.subtitle { margin: 4px 0 10px; font-size: 13px; color: var(--gray-500); }
.people { display: flex; align-items: center; gap: 6px; min-height: 44px; }
.people span { margin-left: 6px; font-size: 13px; color: var(--gray-500); }
.off { opacity: .45; }
.peopleList { margin: 8px 0; border: 1px solid var(--gray-200); border-radius: 16px; padding: 6px 12px; }
.person { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
.peopleList .person + .person { border-top: 1px solid var(--gray-100); }
.pinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pinfo strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pinfo small { color: var(--gray-500); font-weight: 400; }
.online { width: 10px; height: 10px; border-radius: 50%; background: var(--gray-200); flex: none; }
.online.on { background: var(--success); }
.person select { min-height: 40px; border-radius: 10px; border: 1px solid var(--gray-200); background: #fff; padding: 0 8px; }

.banner { background: #fff; border-radius: 20px; padding: 12px 16px; display: flex; gap: 14px; align-items: center; color: var(--green-800); }
.main > .banner { margin: 14px 20px 4px; width: auto; }
@media (min-width: 900px) { .main > .banner { margin-inline: max(20px, calc((100% - 860px) / 2)); } }
.banner div { display: flex; flex-direction: column; }
.banner strong { font-size: 17px; color: var(--ink); }
.banner small { font-size: 13px; color: var(--gray-500); }

/* ── conversation ── */
.list { flex: 1; overflow-y: auto; padding: 8px 14px 16px; }
/* phones: keep only what's needed for the conversation */
@media (max-width: 767px) {
  .intro .titleRow, .intro .subtitle { display: none; }
  .intro { padding: 6px 14px 0; }
  .main > .banner { display: none; }
  .conn { display: none; }
}
.list { -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 14px); mask-image: linear-gradient(to bottom, transparent 0, #000 14px); }
.offline { margin: 0; padding: 8px 14px; background: #fff1d6; color: #6b4e00; font-size: 13.5px; font-weight: 700; display: flex; align-items: center; gap: 8px; justify-content: center; }
.spinS { width: 13px; height: 13px; border-radius: 50%; border: 2px solid #e8c77a; border-top-color: #6b4e00; animation: spin 1s linear infinite; flex: none; }
.outbox { margin: 10px 16px 0; padding: 8px 12px; border-radius: 12px; background: #fff1d6; color: #6b4e00; font-size: 13px; font-weight: 700; text-align: center; }
.scrimHelp { position: fixed; inset: 0; z-index: 93; background: rgba(20,32,27,.5); display: flex; align-items: center; justify-content: center; padding: 18px; }
.micHelp { background: #fff; border-radius: 26px; width: min(400px, 100%); padding: 22px 20px 18px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.micHelp h2 { margin: 0; font-size: 19px; }
.micHelp p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--gray-700); background: var(--gray-50); border-radius: 12px; padding: 8px 12px; text-align: left; width: 100%; }
.mhRetry { width: 100%; min-height: 52px; border-radius: 16px; background: var(--ink); color: #fff; font-weight: 800; margin-top: 4px; }
.mhType { width: 100%; min-height: 46px; border-radius: 16px; background: var(--gray-50); font-weight: 700; }
.listCol { display: flex; flex-direction: column; gap: 14px; min-height: 100%; }
.day { align-self: center; font-size: 12px; font-weight: 700; color: var(--gray-500); margin: 6px 0 0; background: rgba(255,255,255,.8); padding: 3px 12px; border-radius: 999px; }
.empty { margin: auto; text-align: center; color: var(--gray-700); font-size: 16px; padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 360px; }
.empty p { margin: 0; line-height: 1.6; font-weight: 600; }
.emptyArt { width: 96px; height: 96px; border-radius: 50%; background: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 48px; box-shadow: 0 8px 24px rgba(0,0,0,.08); animation: float 3s ease-in-out infinite; }
@keyframes float { 50% { transform: translateY(-6px); } }
.listCol :deep(.flash .card) { animation: flash 1.2s ease-out; }
@keyframes flash { 0%, 40% { box-shadow: 0 0 0 4px #7c9cff; } }
.soundOn { display: flex; width: calc(100% - 32px); max-width: 828px; margin: 12px auto 0; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 14px; background: #fff4d6; color: #6b4e00; font-weight: 800; font-size: 14px; border: 1.5px solid #ffd36b; }
.speaking { background: #fff; border: 2px dashed #7c9cff; border-radius: 24px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; align-self: flex-start; }
.speaking strong { white-space: nowrap; font-size: 15px; }
.rec { width: 10px; height: 10px; border-radius: 50%; background: var(--red); }

.composerWrap { background: #fff; border-top: 1px solid var(--border); }
.composerWrap :deep(.composer) { border-top: 0; }

.foot { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--gray-100); font-size: 13px; }
.fi { display: inline-flex; align-items: center; gap: 6px; color: var(--gray-700); }
.fi svg { color: var(--green-600); }
.toggle { font-weight: 800; min-height: 36px; padding: 0 12px; border-radius: 999px; display: inline-flex; gap: 6px; align-items: center; }
.toggle[aria-pressed='true'] { background: var(--green-100); color: var(--green-800); }
.toggle[aria-pressed='false'] { background: var(--gray-100); color: var(--gray-500); }
.fnote { color: var(--gray-500); font-size: 12px; margin-left: auto; }
@media (max-width: 767px) { .fnote, .pill { display: none; } .top { gap: 8px; } }
.seg { display: inline-flex; background: var(--gray-100); border-radius: 999px; padding: 3px; }
.seg button { white-space: nowrap; min-height: 30px; padding: 0 12px; border-radius: 999px; font-weight: 700; font-size: 13px; color: var(--gray-500); }
.seg button[aria-pressed='true'] { background: #fff; color: var(--green-800); box-shadow: 0 1px 3px rgba(0,0,0,.12); }

/* tablet+: a bit more air and larger reading type for the guest */
@media (min-width: 768px) {
  .top { padding-inline: 28px; }
  .list { padding-inline: 28px; }
  .intro { padding-inline: 28px; }
  .guest .listCol :deep(.main) { font-size: 23px; }
}

.toasts { position: fixed; left: 50%; top: 80px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; z-index: 60; width: min(92vw, 440px); pointer-events: none; }
.toast { margin: 0; padding: 12px 16px; border-radius: 14px; background: var(--ink); color: #fff; font-size: 14px; box-shadow: 0 8px 24px rgba(0,0,0,.18); }
.toast.warn { background: #7a5a12; }
.toast.error { background: var(--red); }
.tapStart { position: fixed; inset: 0; z-index: 70; background: rgba(255,255,255,.94); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; text-align: center; }
.tapMic { width: 112px; height: 112px; border-radius: 50%; background: var(--green-800); color: #fff; display: inline-flex; align-items: center; justify-content: center; animation: breathe 2.4s ease-in-out infinite; }
.tapStart strong { font-size: 22px; }
.tapStart small { font-size: 15px; color: var(--gray-500); }
@keyframes breathe { 0%,100% { box-shadow: 0 0 0 0 rgba(23,23,23,.25); } 50% { box-shadow: 0 0 0 18px rgba(23,23,23,0); } }
.reconn { position: fixed; bottom: 0; left: 0; right: 0; margin: 0; text-align: center; background: #e0a23a; color: #fff; padding: 6px; font-weight: 700; font-size: 13px; }
</style>
