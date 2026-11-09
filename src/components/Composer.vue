<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Dict } from '../lib/i18n'
import Icon from './Icon.vue'

// One big "talk" button that also says whose turn it is, plus a text field (with camera).
// Tap mode: press → speak → stops by itself. Hands mode: always listening, the button pauses it.
const props = defineProps<{
  d: Dict
  talkMode: 'tap' | 'hands'
  talking: boolean
  micOn: boolean
  speaking: boolean
  playing: boolean
  partner?: string // someone else is speaking right now
  micError: boolean
  level?: number
  disabled?: boolean
  label?: string
  /** tap-to-talk turn phase (see room state) */
  phase?: '' | 'opening' | 'ready' | 'heard' | 'sending'
}>()
const emit = defineEmits<{ send: [text: string]; talk: []; photo: [dataUrl: string]; settings: [] }>()
const fileInput = ref<HTMLInputElement>()

/** Some formats (older Safari, HEIC exports) only decode through an <img>. */
function decodeViaImg(f: File): Promise<HTMLImageElement | undefined> {
  return new Promise((res) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); res(img) }
    img.onerror = () => { URL.revokeObjectURL(url); res(undefined) }
    img.src = url
  })
}
/** Downscale to ≤1280 px JPEG (keeps text legible, ~150–300 KB) before sending. */
async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  const bmp = await createImageBitmap(f).catch(() => decodeViaImg(f))
  if (!bmp) return
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  let q = 0.82
  let url = c.toDataURL('image/jpeg', q)
  while (url.length > 650 * 1024 && q > 0.4) { q -= 0.12; url = c.toDataURL('image/jpeg', q) }
  emit('photo', url)
}
const text = ref('')

// Japanese/Chinese/Korean input: the Enter that confirms a conversion must not send the message
// (Safari reports it as keyCode 229 / isComposing).
function onEnter(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) e.preventDefault()
}
function submit() {
  const s = text.value.trim()
  if (!s) return
  emit('send', s)
  text.value = ''
}

/** What the big button says = whose turn it is. */
const state = computed<'rec' | 'opening' | 'partner' | 'playing' | 'ready' | 'paused' | 'error'>(() => {
  if (props.micError) return 'error'
  if (props.talkMode === 'tap') {
    if (props.talking && props.phase === 'opening') return 'opening'
    if (props.talking) return 'rec'
    if (props.partner) return 'partner'
    if (props.playing) return 'playing'
    return 'ready'
  }
  if (!props.micOn) return 'paused'
  if (props.speaking) return 'rec'
  if (props.partner) return 'partner'
  if (props.playing) return 'playing'
  return 'ready'
})
const title = computed(() => {
  const d = props.d
  switch (state.value) {
    case 'error': return d.micDenied
    case 'opening': return d.phaseOpening
    case 'rec': return props.talkMode === 'tap' ? (props.phase === 'heard' ? d.sendNow : d.finishTalk) : d.youSpeaking
    case 'partner': return d.speaking(props.partner!)
    case 'playing': return d.playingNow
    case 'paused': return d.paused
    default: return props.talkMode === 'tap' ? d.tapToTalk : d.listening
  }
})
const hint = computed(() => {
  const d = props.d
  if (state.value === 'error') return d.micTapRetry
  if (state.value === 'rec' && props.talkMode === 'tap') return props.phase === 'heard' ? d.phaseHeardHint : d.phaseReady
  if (props.talkMode === 'hands' && props.micOn) return d.tapToStop
  if (state.value === 'partner' || state.value === 'playing') return d.tapToTalk
  return ''
})
const ring = computed(() => (state.value === 'rec' ? `0 0 0 ${4 + Math.min(16, (props.level ?? 0) * 140)}px rgba(255,92,92,.22)` : undefined))
</script>

<template>
  <section class="composer">
    <button
      class="talk"
      :class="state"
      :style="{ boxShadow: ring }"
      :disabled="disabled"
      :aria-pressed="state === 'rec'"
      aria-live="polite"
      @click="emit('talk')"
    >
      <span class="ic" aria-hidden="true">
        <Icon :name="state === 'playing' ? 'headphones' : 'mic'" :size="28" />
        <span v-if="state === 'paused'" class="slash" />
      </span>
      <span class="txt">
        <strong>{{ title }}</strong>
        <small v-if="hint">{{ hint }}</small>
      </span>
      <span v-if="state === 'rec'" class="bars" aria-hidden="true"><i /><i /><i /><i /></span>
    </button>

    <div class="row">
      <form class="field" @submit.prevent="submit">
        <label class="sr-only" for="msg">{{ d.placeholder }}</label>
        <input id="msg" v-model="text" @keydown.enter="onEnter" :placeholder="d.placeholder" autocomplete="off" enterkeyhint="send" maxlength="1000" />
        <button v-if="text.trim()" type="submit" class="send" aria-label="send"><Icon name="send" :size="18" /></button>
        <button v-else type="button" class="cam" :aria-label="d.camera" :title="d.camera" :disabled="disabled" @click="fileInput?.click()"><Icon name="camera" :size="22" /></button>
        <input ref="fileInput" class="sr-only" type="file" accept="image/*" tabindex="-1" @change="onFile" />
      </form>
      <button class="gear" type="button" :aria-label="d.settings" :title="d.settings" @click="emit('settings')"><Icon name="settings" :size="22" /></button>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.composer { padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 8px; }
.talk { width: 100%; min-height: 56px; border-radius: var(--r-con); display: flex; align-items: center; gap: 14px; padding: 10px 18px; text-align: left;
  background: var(--ink); color: #fff; transition: background var(--fast), box-shadow .08s linear, transform var(--fast); }
.talk:active { transform: scale(.985); }
.talk .ic { position: relative; width: 40px; height: 40px; flex: none; border-radius: var(--r-el); background: rgba(255,255,255,.16); display: inline-flex; align-items: center; justify-content: center; }
.talk.ready .ic { animation: pulse 2.2s ease-in-out infinite; }
.talk.opening .ic { animation: none; opacity: .6; }
.txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.txt strong { font-size: 17px; line-height: 1.3; }
.txt small { font-size: 13px; opacity: .9; font-weight: 600; }
.talk.rec { background: #d9472b; }
.talk.opening { background: #3a3f4a; }
.talk.partner { background: #3d3d3d; }
.talk.playing { background: var(--warn); color: var(--warn-ink); }
.talk.playing .ic { background: rgba(255,255,255,.4); }
.talk.paused, .talk.error { background: var(--gray-100); color: var(--gray-700); }
.talk.paused .ic, .talk.error .ic { background: #fff; }
.talk:disabled { opacity: .6; }
.slash { position: absolute; width: 30px; height: 3px; background: currentColor; transform: rotate(-45deg); border-radius: 2px; }
@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,.55); } 50% { box-shadow: 0 0 0 10px rgba(255,255,255,0); } }
.bars { display: inline-flex; gap: 4px; align-items: center; height: 28px; }
.bars i { width: 4px; border-radius: 2px; background: #fff; animation: bar 0.9s ease-in-out infinite; }
.bars i:nth-child(2) { animation-delay: .15s; } .bars i:nth-child(3) { animation-delay: .3s; } .bars i:nth-child(4) { animation-delay: .45s; }
@keyframes bar { 0%,100% { height: 8px; } 50% { height: 26px; } }

.row { display: flex; gap: 8px; align-items: center; }
.field { flex: 1; display: flex; align-items: center; background: #fff; border: 1px solid var(--border); border-radius: var(--r-el); min-height: 48px; padding: 0 4px 0 14px; }
.field:focus-within { border-color: var(--ink); }
.field input { flex: 1; border: 0; background: none; font-size: 16px; min-width: 0; height: 46px; outline: none; }
.cam { width: 40px; height: 40px; border-radius: 8px; color: var(--gray-700); display: inline-flex; align-items: center; justify-content: center; }
.cam:hover { background: var(--gray-100); }
.send { width: 40px; height: 40px; border-radius: 8px; background: var(--ink); color: #fff; display: inline-flex; align-items: center; justify-content: center; }
.gear { width: 48px; height: 48px; border-radius: var(--r-el); background: #fff; border: 1px solid var(--border); color: var(--gray-700); display: inline-flex; align-items: center; justify-content: center; flex: none; }
</style>
