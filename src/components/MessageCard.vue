<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Utterance } from '../../shared/types'
import { emotionLabel, langName, type Dict } from '../lib/i18n'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import Waveform from './Waveform.vue'

const props = defineProps<{
  u: Utterance
  viewerLang: string
  d: Dict
  isMe: boolean
  level?: number
  showLangs?: boolean
  /** the earlier utterance this one answers / corrects */
  reply?: Utterance
  /** same speaker as the message right above → hide avatar/name like a chat app */
  grouped?: boolean
  /** the speaker has said something newer: a still-pending check here won't be answered any more */
  superseded?: boolean
}>()
const emit = defineEmits<{ play: [expressive: boolean]; confirm: [ok: boolean]; edit: [text: string]; jump: [uid: string]; retry: [] }>()

// conversation flow: quote of the utterance this one replies to (like a chat reply)
const replyText = computed(() => {
  const r = props.reply
  if (!r) return ''
  const t = r.sourceLang === props.viewerLang ? r.original : r.translations[props.viewerLang] || r.original
  return t.length > 70 ? t.slice(0, 70) + '…' : t
})
const relLabel = computed(() => {
  const rel = props.u.context?.relation
  return rel === 'correction' ? props.d.relCorrection : rel === 'answer' ? props.d.relAnswer : props.d.relFollowup
})
const ctxNote = computed(() => {
  const n = props.u.context?.note
  if (!n) return ''
  return n[props.viewerLang] ?? n[props.u.sourceLang] ?? Object.values(n)[0] ?? ''
})

// the speaker can fix what was recognised (names, places misheard) → translated again
const editing = ref(false)
const draft = ref('')
const editBox = ref<HTMLTextAreaElement>()
async function startEdit() {
  draft.value = props.u.original
  editing.value = true
  await nextTick()
  editBox.value?.focus()
}
function saveEdit() {
  const t = draft.value.trim()
  editing.value = false
  if (t && t !== props.u.original) emit('edit', t)
}
// Secondary AI details ("checked by AI", tone label) appear only after tapping the text.
const more = ref(false)
const hasMore = computed(() => (props.isMe && props.u.check?.status === 'auto' && myChecks.value.length > 0) || !!emo.value || (canEdit.value && !!props.superseded))
const canEdit = computed(() => props.isMe && props.u.final && props.u.kind !== 'image' && !!props.u.original)
const showAsk = computed(() => props.isMe && check.value?.status === 'pending')

// critical-fact check: the speaker confirms; listeners see the status
const check = computed(() => props.u.check)
const myChecks = computed(() => (check.value?.items ?? []).map((it) => ({
  ...it,
  // the speaker sees every listener language; a listener sees their own
  shown: props.isMe ? it.checks : it.checks.filter((c) => c.lang === props.viewerLang),
})).filter((it) => it.shown.length))
const anyMismatch = computed(() => myChecks.value.some((it) => it.shown.some((c) => !c.ok)))
const KIND_ICON: Record<string, string> = { number: '🔢', price: '💴', quantity: '🔢', time: '🕒', date: '📅', direction: '🧭', place: '📍', allergy: '⚠️', medical: '💊', negation: '🚫', safety: '⚠️', other: '❗' }

const same = computed(() => props.u.sourceLang === props.viewerLang)
const translated = computed(() => props.u.translations[props.viewerLang])
const main = computed(() => {
  if (props.isMe || same.value) return props.u.original
  return translated.value || props.u.original
})
const sub = computed(() => {
  if (props.isMe || same.value) {
    const other = Object.entries(props.u.translations).find(([l]) => l !== props.u.sourceLang)
    return other?.[1] ?? ''
  }
  return translated.value ? props.u.original : ''
})
const pendingTranslation = computed(() => !props.isMe && !same.value && !translated.value)
// Give up after a while: show "couldn't translate" + retry instead of "translating…" forever.
// The server marks real failures (failedLangs); the timer covers anything it never reports.
const STALE_MS = 25_000
const stale = ref(false)
let staleT: number | undefined
watch(() => [props.u.final, pendingTranslation.value, props.u.failedLangs?.length] as const, ([fin, pending]) => {
  clearTimeout(staleT)
  stale.value = false
  if (fin && pending) staleT = window.setTimeout(() => { stale.value = true }, STALE_MS)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(staleT))
const failed = computed(() => props.u.final && pendingTranslation.value && (!!props.u.failedLangs?.includes(props.viewerLang) || stale.value))
const failedForOthers = computed(() => props.isMe && props.u.final && !!props.u.failedLangs?.length)
function retry() { stale.value = false; emit('retry') }
const emo = computed(() => emotionLabel(props.u.emotion, props.viewerLang === 'ja' ? 'ja' : 'en'))
const time = computed(() => new Date(props.u.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
const live = computed(() => !props.u.final && props.u.kind === 'voice')
const reading = computed(() => !props.u.final && props.u.kind === 'image')
const canPlay = computed(() => props.u.final && !props.isMe && !same.value && !!translated.value)
const canExpress = computed(() => canPlay.value && !!emo.value)
// the speaker's confirmation sits in its own card under the bubble
// price / allergy / medicine checks are for the speaker only; listeners just get the (corrected) translation
const showCheck = computed(() => props.isMe && !!props.u.check && props.u.check.status !== 'auto' && myChecks.value.length > 0)
</script>

<template>
  <!-- SNS-style message: avatar outside the bubble, name above, time + play beside it,
       and a reply "thread line" that points up to the message it answers. -->
  <article class="msg" :class="{ me: isMe, grouped: grouped && !reply }" :aria-busy="!u.final" :data-uid="u.id">
    <button v-if="reply && replyText" class="thread" :class="{ corr: u.context?.relation === 'correction' }" @click="emit('jump', reply.id)">
      <span class="elbow" aria-hidden="true" />
      <span class="qrel">{{ relLabel }}</span>
      <Avatar :name="reply.speakerName" :size="18" />
      <span class="qwho">{{ reply.speakerName }}</span>
      <span class="qtext">{{ replyText }}</span>
    </button>
    <p v-if="!isMe && (!grouped || reply)" class="name">
      {{ live ? d.speaking(u.speakerName) : u.speakerName }}
      <small v-if="showLangs && !live">{{ langName(u.sourceLang, viewerLang) }}</small>
    </p>
    <div class="row">
      <div v-if="!isMe" class="av"><Avatar v-if="!grouped || reply" :name="u.speakerName" :size="34" /></div>
      <div class="card" :class="[live ? 'live' : u.kind, { me: isMe, corr: u.context?.relation === 'correction' }]">
    <p v-if="live && isMe" class="liveWho"><span class="rec" aria-hidden="true" />{{ d.youSpeaking }}</p>
    <div v-if="live" class="liveRow">
      <Waveform :level="isMe ? level : undefined" />
      <span class="gen">{{ d.generating }}</span>
    </div>

    <img v-if="u.image" class="photo" :src="u.image" alt="" />
    <p v-if="reading" class="sub">{{ d.photoReading }}</p>

    <div v-if="editing" class="editor">
      <textarea ref="editBox" v-model="draft" rows="2" maxlength="1000" @keydown.enter.exact="(e: KeyboardEvent) => { if (!e.isComposing && e.keyCode !== 229) { e.preventDefault(); saveEdit() } }" @keydown.esc="editing = false" />
      <div class="ebtns">
        <button class="esave" @click="saveEdit"><Icon name="check" :size="16" />{{ d.editSave }}</button>
        <button class="ecancel" @click="editing = false">{{ d.cancel }}</button>
      </div>
    </div>
    <p v-else-if="main" class="main" :class="{ partial: !u.final, tappable: hasMore }" :role="hasMore ? 'button' : undefined" :tabindex="hasMore ? 0 : undefined" :aria-expanded="hasMore ? more : undefined" @click="hasMore && (more = !more)" @keydown.enter="hasMore && (more = !more)" :lang="isMe || same ? u.sourceLang : viewerLang">{{ main }}<small v-if="u.edited" class="edited"> ✏️ {{ d.edited }}</small></p>
    <p v-if="sub" class="sub" :class="{ partial: !u.final }">{{ sub }}</p>
    <p v-else-if="failed" class="terr" role="status"><span aria-hidden="true">⚠</span>{{ d.translateFailed }}<button class="tretry" @click="retry"><Icon name="refresh" :size="14" />{{ d.tryAgain }}</button></p>
    <p v-else-if="pendingTranslation && u.final" class="sub">{{ d.translating }}</p>
    <p v-if="failedForOthers" class="terr" role="status"><span aria-hidden="true">⚠</span>{{ d.translateFailedMe }}<button class="tretry" @click="retry"><Icon name="refresh" :size="14" />{{ d.tryAgain }}</button></p>

    <p v-if="ctxNote" class="cnote"><span aria-hidden="true">💡</span>{{ ctxNote }}</p>

    <!-- facts AI verified by itself: a small badge, nobody is asked -->
    <template v-if="isMe && check?.status === 'auto'">
      <details v-if="myChecks.length && more" class="auto" open>
      <summary><Icon name="check" :size="14" />{{ d.checkAuto }}</summary>
      <ul>
        <li v-for="(it, i) in myChecks" :key="i">{{ KIND_ICON[it.kind] ?? '❗' }} {{ isMe ? it.source : it.shown[0]?.text }} → {{ isMe ? it.shown.map((c) => c.text).join(' / ') : it.source }}</li>
      </ul>
    </details>
    </template>



    <p v-if="emo && more" class="emo">
      <span aria-hidden="true">{{ emo.icon }}</span> {{ emo.text }}
      <span class="ai">· {{ d.aiGuess }}</span>
    </p>

    <footer v-if="canEdit && !editing && (!superseded || more)">
      <button class="editBtn" @click="startEdit"><Icon name="edit" :size="14" />{{ d.editWords }}</button>
    </footer>
      </div>
      <div v-if="!live" class="meta">
        <button v-if="canPlay" class="pmini" :aria-label="d.playTranslation" :title="d.playTranslation" @click="emit('play', false)"><Icon name="play" :size="16" /></button>
        <button v-if="canExpress" class="pmini alt" :aria-label="d.playExpressive" :title="d.playExpressive" @click="emit('play', true)"><Icon name="sparkle" :size="15" /></button>
        <time>{{ time }}</time>
      </div>
    </div>
    <!-- speaker: facts that must not be mistranslated (money, allergy, medicine, safety, or a suspected error) -->
    <section v-if="showCheck && check" class="check" :class="[check.status, { me: isMe, bad: anyMismatch && check.status === 'pending' }]">
      <p class="ctitle"><span aria-hidden="true">⚠️</span>{{ d.checkTitle }}</p>
      <p v-if="showAsk" class="cask" :title="d.checkWhy">{{ d.checkAsk }}</p>
      <ul>
        <li v-for="(it, i) in myChecks" :key="i">
          <span class="kicon" aria-hidden="true">{{ KIND_ICON[it.kind] ?? '❗' }}</span>
          <div class="cbody">
            <strong>{{ isMe ? it.source : it.shown[0]?.text }}</strong>
            <template v-if="isMe">
              <span v-for="c in it.shown" :key="c.lang" class="ctr" :class="{ ng: !c.ok }">
                → {{ c.text }}<small>（= {{ c.back }}）</small><em v-if="!c.ok">{{ d.checkMismatch }}</em>
              </span>
            </template>
            <small v-else class="corig">{{ it.source }}</small>
          </div>
        </li>
      </ul>
      <div v-if="isMe && check.status === 'pending'" class="cbtns">
        <button class="cok" @click="emit('confirm', true)"><Icon name="check" :size="18" />{{ d.checkOk }}</button>
        <button class="cng" @click="emit('confirm', false)">{{ d.checkFix }}</button>
      </div>
      <p v-else class="cstatus">
        {{ check.status === 'fixing' ? d.checkFixing : check.status === 'corrected' ? d.checkCorrected : check.status === 'confirmed' ? d.checkConfirmed : d.checkPending }}
      </p>
    </section>
  </article>
</template>

<style scoped>
/* chat-style bubbles: mine on the right, others on the left → whose turn it was is obvious */
.msg { display: flex; flex-direction: column; gap: 3px; align-self: stretch; animation: in var(--medium) ease-out; }
.msg.grouped { margin-top: -8px; }
.row { display: flex; align-items: flex-end; gap: 8px; min-width: 0; }
.msg.me .row { flex-direction: row-reverse; }
.av { width: 34px; flex: none; align-self: flex-start; }
.name { margin: 0 0 0 44px; font-size: 12px; font-weight: 800; color: var(--gray-700); }
.name small { font-weight: 600; color: var(--gray-500); margin-left: 4px; }
.meta { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: none; padding-bottom: 2px; }
.msg.me .meta { align-items: flex-end; }
.liveWho { margin: 0; font-size: 13px; font-weight: 800; display: flex; align-items: center; gap: 6px; }
/* reply thread: a bent line from this message's avatar up toward the quoted one */
.thread { position: relative; display: flex; align-items: center; gap: 6px; margin-left: 17px; padding: 0 0 0 30px; min-height: 26px; text-align: left; font-size: 12px; color: var(--gray-700); max-width: calc(100% - 17px); }
.elbow { position: absolute; left: 0; top: 13px; width: 24px; height: 14px; border-left: 2.5px solid #9fb4ff; border-top: 2.5px solid #9fb4ff; border-top-left-radius: 10px; }
.thread.corr .elbow { border-color: #f5b94a; }
.msg.me .thread { align-self: flex-end; margin: 0 17px 0 0; padding: 0 30px 0 0; }
.msg.me .elbow { left: auto; right: 0; border-left: 0; border-right: 2.5px solid #9fb4ff; border-top-left-radius: 0; border-top-right-radius: 10px; }
.msg.me .thread.corr .elbow { border-color: #f5b94a; }
.card { position: relative; border-radius: var(--r-con); padding: 10px 14px; background: #fff; display: flex; flex-direction: column; gap: 5px; min-width: 0; max-width: min(78%, 620px); border-top-left-radius: var(--r-inner); border: 1px solid var(--border); }
.msg.grouped .card:not(.me) { border-top-left-radius: var(--r-con); }
@keyframes in { from { transform: translateY(6px); opacity: 0; } }
.card.me { background: var(--me-bg); border-color: var(--me-line); border-top-left-radius: var(--r-con); border-top-right-radius: var(--r-inner); }
.msg.me.grouped .card.me { border-top-right-radius: var(--r-con); }
.card.text:not(.me) { background: #fff; }
.card.live { background: #fff; border: 1.5px dashed #a3a3a3; }
.card.me.live { border-color: var(--coral); }
.card.image { background: #fff; }
.card.corr { border-color: var(--warn); box-shadow: inset 0 0 0 1px var(--warn); }
.pmini { width: 34px; height: 34px; flex: none; border-radius: var(--r-el); background: var(--ink); color: #fff; display: inline-flex; align-items: center; justify-content: center; transition: transform var(--fast); }
.pmini:active { transform: scale(.94); }
.pmini.alt { width: 30px; height: 30px; background: #fff; color: var(--ink); border: 1px solid var(--border); }
time { font-size: 11px; color: var(--gray-500); font-variant-numeric: tabular-nums; }
.rec { width: 10px; height: 10px; border-radius: 50%; background: var(--coral); margin: 0 4px; animation: blink 1.2s infinite; }
@keyframes blink { 50% { opacity: .35; } }
.main { margin: 0; font-size: 19px; font-weight: 700; line-height: 1.45; word-break: break-word; }
.main.tappable { cursor: pointer; }
.main.tappable::after { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .25; margin-left: 6px; vertical-align: middle; }
.edited { font-size: 12px; font-weight: 600; color: var(--gray-500); }
.sub { margin: 0; font-size: 14px; color: var(--gray-500); line-height: 1.5; }
.partial { opacity: .55; }
.liveRow { display: flex; align-items: center; gap: 14px; }
.gen { font-size: 12px; font-weight: 700; color: var(--green-800); white-space: nowrap; }
.qrel { font-weight: 800; font-size: 11px; color: #fff; background: #7c9cff; border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
.thread.corr .qrel { background: #f5a623; }
.qwho { font-weight: 800; white-space: nowrap; }
.qtext { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; color: var(--gray-500); }
.terr { margin: 2px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 13px; font-weight: 700; color: var(--error); }
.tretry { display: inline-flex; align-items: center; gap: 4px; min-height: 30px; padding: 0 10px; border-radius: var(--r-inner); border: 1px solid var(--border); background: #fff; color: var(--ink); font-size: 12.5px; font-weight: 700; }
.cnote { margin: 0; font-size: 13px; background: var(--warn-bg); color: var(--warn-ink); border-radius: var(--r-inner); padding: 6px 10px; display: flex; gap: 6px; align-self: flex-start; }
.emo { margin: 2px 0 0; font-size: 13px; color: var(--gray-700); background: var(--gray-50); border-radius: var(--r-inner); padding: 4px 10px; align-self: flex-start; }
.ai { color: var(--gray-500); font-size: 12px; }
footer { display: flex; justify-content: flex-end; margin-top: -2px; }
.editBtn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--gray-700); min-height: 30px; padding: 0 10px; border-radius: var(--r-inner); background: rgba(255,255,255,.75); border: 1px solid var(--border); }
.editor { display: flex; flex-direction: column; gap: 8px; }
.editor textarea { font: inherit; font-size: 17px; border: 1px solid var(--ink); border-radius: var(--r-el); padding: 10px 12px; resize: vertical; background: #fff; }
.ebtns { display: flex; gap: 8px; }
.ebtns button { min-height: 40px; padding: 0 14px; border-radius: var(--r-el); font-weight: 800; display: inline-flex; align-items: center; gap: 6px; }
.esave { background: var(--ink); color: #fff; }
.ecancel { background: #fff; color: var(--gray-700); border: 1px solid var(--border); }
.photo { width: 100%; max-height: 280px; object-fit: contain; border-radius: var(--r-el); background: #fff; margin-top: 4px; }
.auto { font-size: 12px; color: var(--success); }
.auto summary { cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-weight: 700; background: rgba(255,255,255,.8); border-radius: var(--r-inner); padding: 3px 10px; list-style: none; }
.auto summary::-webkit-details-marker { display: none; }
.auto ul { margin: 6px 0 0; padding-left: 4px; list-style: none; color: var(--gray-700); display: flex; flex-direction: column; gap: 2px; }
.check { margin-top: 6px; background: #fff; border: 1px solid var(--border); border-radius: var(--r-con); padding: 12px; display: flex; flex-direction: column; gap: 8px; width: min(78%, 620px); align-self: flex-start; margin-left: 42px; }
.check.me { align-self: flex-end; margin-left: 0; margin-right: 50px; }
.check.confirmed, .check.corrected { border-color: #b9dcae; }
.check.bad { border-color: var(--error); }
.ctitle { margin: 0; align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: var(--warn-ink); background: var(--warn); border-radius: var(--r-inner); padding: 2px 8px; }
.check.confirmed .ctitle, .check.corrected .ctitle { color: #fff; background: var(--success); }
.cask { margin: 0; font-size: 14px; color: var(--ink); font-weight: 700; }
.cask small { font-size: 11px; color: var(--gray-500); font-weight: 400; }
.check ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.check li { display: flex; gap: 10px; align-items: flex-start; background: var(--warn-bg); border-radius: var(--r-inner); padding: 8px 10px; }
.check.confirmed li, .check.corrected li { background: var(--gray-50); }
.kicon { font-size: 18px; line-height: 1.4; }
.cbody { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cbody strong { font-size: 16px; }
.ctr { font-size: 14px; color: var(--gray-700); }
.ctr small { color: var(--gray-500); margin-left: 4px; }
.ctr.ng { color: var(--error); font-weight: 700; }
.ctr em { font-style: normal; font-size: 11px; background: var(--error); color: #fff; border-radius: var(--r-inner); padding: 1px 6px; margin-left: 6px; }
.corig { font-size: 12px; color: var(--gray-500); }
.cbtns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 2px; }
.cbtns button { min-height: 44px; border-radius: var(--r-el); font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; padding: 0 8px; transition: transform var(--fast); }
.cbtns button:active { transform: scale(.98); }
.cok { background: var(--ink); color: #fff; }
.cng { background: #fff; color: var(--ink); border: 1px solid var(--border); }
.cstatus { margin: 0; font-size: 12px; font-weight: 700; color: var(--gray-500); }
.check.confirmed .cstatus, .check.corrected .cstatus { color: var(--success); }
@media (max-width: 767px) {
  .card { max-width: calc(100% - 92px); }
  .check { width: calc(100% - 92px); }
  .main { font-size: 18px; }
}
</style>
