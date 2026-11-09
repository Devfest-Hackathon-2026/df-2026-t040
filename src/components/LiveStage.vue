<script setup lang="ts">
// "いまの一言" stage: the line being said right now (or the latest one), very large, in the
// viewer's language. During your own tap-to-talk turn it becomes a step-by-step guide:
// mic starting (wait) → speak now → listening + "sends when you pause" countdown → sent.
import { computed, ref } from 'vue'
import type { Utterance } from '../../shared/types'
import type { Dict } from '../lib/i18n'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import SketchArt from './SketchArt.vue'
import Waveform from './Waveform.vue'

const props = defineProps<{
  d: Dict
  viewerLang: string
  meId?: string
  u?: Utterance
  /** someone is talking but their card hasn't arrived yet */
  speakingName?: string
  phase: '' | 'opening' | 'ready' | 'heard' | 'sending'
  tail: number
  level?: number
  emptyText: string
  partnerName?: string
  /** the empty stage is tappable (staff with no guest yet → show the QR) */
  emptyAction?: boolean
}>()
const emit = defineEmits<{ play: [uid: string]; sendNow: []; empty: [] }>()

const mine = computed(() => !!props.u && props.u.speakerId === props.meId)
const mode = computed(() => {
  if (props.phase) return 'turn' as const
  if (props.u && !props.u.final) return mine.value ? 'liveMine' as const : 'live' as const
  if (props.u) return mine.value ? 'mine' as const : 'other' as const
  if (props.speakingName) return 'waiting' as const
  return 'empty' as const
})

/** what the viewer reads big */
const big = computed(() => {
  const u = props.u
  if (!u) return ''
  if (mine.value) {
    // your own line: once final, show what the other person received (their language)
    if (u.final) {
      const other = Object.entries(u.translations).find(([l]) => l !== u.sourceLang)
      return other?.[1] || u.original
    }
    return u.original
  }
  return u.sourceLang === props.viewerLang ? u.original : u.translations[props.viewerLang] || u.original
})
const small = computed(() => {
  const u = props.u
  if (!u) return ''
  if (mine.value) return u.final ? u.original : ''
  return u.sourceLang === props.viewerLang ? '' : (u.translations[props.viewerLang] ? u.original : '')
})
const bigLang = computed(() => {
  const u = props.u
  if (!u) return undefined
  if (mine.value && u.final) return Object.keys(u.translations).find((l) => l !== u.sourceLang) ?? u.sourceLang
  if (mine.value) return u.sourceLang
  return u.translations[props.viewerLang] ? props.viewerLang : u.sourceLang
})
/** long lines get a smaller (still large) size so the stage never needs to scroll */
const size = computed(() => {
  const n = big.value.length
  return n > 90 ? 'sm' : n > 42 ? 'md' : 'lg'
})
const time = computed(() => props.u ? new Date(props.u.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
const canPlay = computed(() => mode.value === 'other' && !!props.u?.translations[props.viewerLang] && props.u.sourceLang !== props.viewerLang)
const phaseText = computed(() => {
  const d = props.d
  return { opening: d.phaseOpening, ready: d.phaseReady, heard: d.phaseHeard, sending: d.phaseSending, '': '' }[props.phase]
})

// full-screen "show it to the other person" view
const full = ref(false)
</script>

<template>
  <section class="stage" :class="[mode, phase && `ph-${phase}`, size]" aria-live="polite">
    <!-- your tap-to-talk turn: what to do right now -->
    <template v-if="mode === 'turn'">
      <p class="lbl">
        <span v-if="phase === 'opening'" class="spin" aria-hidden="true" />
        <Icon v-else-if="phase === 'sending'" name="check" :size="16" />
        <span v-else class="rec" aria-hidden="true" />
        {{ phaseText }}
      </p>
      <p v-if="u && !u.final && u.original" class="big" :lang="u.sourceLang">{{ u.original }}</p>
      <p v-else-if="phase === 'ready'" class="big cue">{{ d.phaseReady }}</p>
      <p v-else-if="phase === 'opening'" class="big cue dim">…</p>
      <p v-if="phase === 'ready'" class="hint">{{ d.phaseHeardHint }}</p>
      <div v-if="phase === 'heard' || phase === 'ready'" class="foot">
        <Waveform :level="level" />
        <div v-if="phase === 'heard'" class="tail" :class="{ on: tail > 0.12 }">
          <span class="bar"><i :style="{ transform: `scaleX(${tail})` }" /></span>
          <small>{{ tail > 0.12 ? d.phaseTail : d.phaseHeardHint }}</small>
        </div>
        <button v-if="phase === 'heard'" class="now" @click="emit('sendNow')"><Icon name="send" :size="16" />{{ d.sendNow }}</button>
      </div>
    </template>

    <button v-else-if="mode === 'empty' && emptyAction" class="emptyBtn" @click="emit('empty')">
      <div class="emptyArt"><SketchArt kind="scan" /></div>
      <span class="emptyTxt"><Icon name="qr" :size="20" />{{ emptyText }}</span>
    </button>
    <template v-else-if="mode === 'empty'">
      <div class="emptyArt"><SketchArt kind="speak" accent="#5a3df5" /></div>
      <p class="emptyTxt">{{ emptyText }}</p>
    </template>

    <template v-else-if="mode === 'waiting'">
      <p class="lbl"><span class="rec" aria-hidden="true" />{{ d.speaking(speakingName!) }}</p>
      <Waveform />
    </template>

    <template v-else-if="u">
      <p class="lbl">
        <span v-if="mode === 'live' || mode === 'liveMine'" class="rec" aria-hidden="true" />
        <Avatar v-else :name="u.speakerName" :size="22" />
        <template v-if="mode === 'live'">{{ d.speaking(u.speakerName) }}</template>
        <template v-else-if="mode === 'liveMine'">{{ d.youSpeaking }}</template>
        <template v-else-if="mode === 'mine'">{{ d.youSpeaking }}</template>
        <template v-else>{{ u.speakerName }} · {{ time }}</template>
      </p>
      <p class="big" :class="{ partial: !u.final }" :lang="bigLang">{{ big || '…' }}</p>
      <p v-if="small" class="small">{{ small }}</p>
      <div v-if="u.final" class="acts">
        <button v-if="canPlay" class="act play" @click="emit('play', u.id)"><Icon name="play" :size="16" />{{ d.playTranslation }}</button>
        <button class="act" @click="full = true"><Icon name="sparkle" :size="15" />{{ d.showPartner }}</button>
      </div>
    </template>
  </section>

  <Teleport to="body">
    <div v-if="full && u" class="fullShow" role="dialog" :aria-label="d.showPartner" @click="full = false">
      <p :lang="bigLang">{{ big }}</p>
      <button :aria-label="d.close"><Icon name="close" :size="26" /></button>
    </div>
  </Teleport>
</template>

<style scoped>
.stage {
  --bg: #4b39ef; --fg: #fff; --soft: #dcd6ff;
  margin: 10px 12px 0; border-radius: 26px; padding: 14px 16px 14px; background: var(--bg); color: var(--fg);
  display: flex; flex-direction: column; gap: 6px; max-height: 44vh; overflow: hidden; flex: none;
  box-shadow: 0 10px 24px -14px rgba(40, 30, 140, .55); transition: background-color .25s;
}
.stage.mine { --bg: #0b7a55; --soft: #c9f0df; box-shadow: 0 10px 24px -14px rgba(11, 122, 85, .55); }
.stage.turn, .stage.liveMine { --bg: #d9472b; --soft: #ffd9cf; box-shadow: 0 10px 24px -14px rgba(217, 71, 43, .6); }
.stage.turn.ph-opening { --bg: #3a3f4a; --soft: #d4d8e0; box-shadow: none; }
.stage.turn.ph-sending { --bg: #0b7a55; --soft: #c9f0df; }
.stage.empty, .stage.waiting { --bg: #f1effe; --fg: #2a2466; --soft: #5b5591; box-shadow: none; }
.lbl { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--soft); min-height: 22px; }
.big { margin: 0; font-weight: 700; line-height: 1.35; word-break: break-word; overflow-wrap: anywhere; font-size: 30px; letter-spacing: .01em; }
.md .big { font-size: 24px; }
.sm .big { font-size: 19px; line-height: 1.45; }
.big.partial { opacity: .75; }
.big.cue { font-size: 28px; }
.big.dim { opacity: .5; }
.small { margin: 0; font-size: 14px; color: var(--soft); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.acts { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.act { min-height: 38px; padding: 0 14px; border-radius: 999px; background: rgba(255,255,255,.16); color: var(--fg); font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
.act.play { background: #fff; color: var(--bg); }
.rec { width: 9px; height: 9px; border-radius: 50%; background: #fff; animation: blink 1.1s ease-in-out infinite; flex: none; }
.empty .rec, .waiting .rec { background: #d9472b; }
@keyframes blink { 50% { opacity: .3; } }
.spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; animation: spin .8s linear infinite; flex: none; }
@keyframes spin { to { transform: rotate(360deg); } }
.foot { display: flex; align-items: center; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
.foot :deep(.wave) { flex: 0 0 auto; height: 28px; }
.stage :deep(.wave span) { background: currentColor; opacity: .85; }
.tail { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 4px; }
.tail .bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.25); overflow: hidden; }
.tail .bar i { display: block; height: 100%; background: #fff; transform-origin: left; transition: transform .08s linear; }
.tail small { font-size: 12px; font-weight: 600; color: var(--soft); }
.tail.on small { color: #fff; font-weight: 800; }
.now { min-height: 40px; padding: 0 14px; border-radius: 999px; background: #fff; color: #d9472b; font-weight: 800; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
.hint { margin: 0; font-size: 14px; font-weight: 700; color: var(--soft); }
.emptyArt { height: 120px; }
.emptyTxt { margin: 0; text-align: center; font-weight: 700; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; }
.emptyBtn { display: flex; flex-direction: column; gap: 6px; width: 100%; color: inherit; border-radius: 18px; }
.emptyBtn .emptyTxt { align-self: center; background: var(--ink, #14201b); color: #fff; border-radius: 999px; padding: 10px 18px; font-size: 15px; }
.fullShow { position: fixed; inset: 0; z-index: 95; background: #fff; display: flex; align-items: center; justify-content: center; padding: 32px 24px; }
.fullShow p { margin: 0; font-size: clamp(30px, 9vw, 64px); font-weight: 700; line-height: 1.3; text-align: center; color: #14201b; overflow-wrap: anywhere; }
.fullShow button { position: absolute; top: calc(16px + env(safe-area-inset-top)); right: 16px; width: 52px; height: 52px; border-radius: 50%; background: #f1f1f4; display: inline-flex; align-items: center; justify-content: center; }
@media (min-width: 768px) {
  .stage { margin: 14px auto 0; width: calc(100% - 40px); max-width: 860px; }
}
@media (prefers-reduced-motion: reduce) { .rec, .spin { animation: none; } }
</style>
