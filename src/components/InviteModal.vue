<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import type { RoomSnapshot } from '../../shared/types'
import Icon from './Icon.vue'

// inline: rendered as a panel (PC side column) instead of a modal sheet
const props = defineProps<{ room: RoomSnapshot; inline?: boolean; closable?: boolean }>()
const emit = defineEmits<{ close: []; rotate: [] }>()
const qr = ref('')
const now = ref(Date.now())
const copied = ref(false)
let timer: number | undefined

const url = computed(() => `${location.origin}/j#${props.room.inviteCode}`)
const expiresIn = computed(() => Math.max(0, Math.floor((new Date(props.room.inviteExpiresAt!).getTime() - now.value) / 1000)))
const expired = computed(() => expiresIn.value <= 0)
const full = computed(() => props.room.participants.length >= props.room.capacity)

async function render() {
  qr.value = await QRCode.toDataURL(url.value, { margin: 1, width: 560, color: { dark: '#171717', light: '#ffffff' }, errorCorrectionLevel: 'M' })
}
watch(url, render)
onMounted(() => {
  void render()
  timer = window.setInterval(() => (now.value = Date.now()), 1000)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => { clearInterval(timer); window.removeEventListener('keydown', onKey) })
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !props.inline) emit('close') }

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch { /* ignore */ }
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
</script>

<template>
  <div :class="inline ? 'inlineWrap' : 'scrim'" @click.self="!inline && emit('close')">
    <div class="sheet" :role="inline ? 'region' : 'dialog'" :aria-modal="inline ? undefined : true" aria-labelledby="inv-title">
      <header>
        <h2 id="inv-title">ルームに招待</h2>
        <button v-if="!inline || closable" class="x" aria-label="閉じる" @click="emit('close')"><Icon name="close" /></button>
      </header>
      <p class="lead">QRを読み取るとこの会話に参加できます</p>
      <div class="pillRow"><span class="pill">{{ room.participants.length }} / {{ room.capacity }} 人</span></div>
      <div class="qrBox" :class="{ dim: expired || full }">
        <img v-if="qr" :src="qr" alt="参加用QRコード" />
        <div v-if="expired || full" class="over">
          <p>{{ full ? '満員です' : 'QRの有効期限が切れました' }}</p>
          <button v-if="!full" class="regen" @click="emit('rotate')"><Icon name="refresh" :size="18" />新しいQRを発行</button>
        </div>
      </div>
      <p class="exp" v-if="!expired">有効期限 {{ mmss(expiresIn) }}・<button class="link" @click="emit('rotate')">再発行</button></p>
      <button class="code" @click="copy" :aria-label="'参加リンクをコピー'">
        <span>{{ room.inviteCode }}</span>
        <span class="copy">{{ copied ? 'コピーしました' : '' }}<Icon name="link" /></span>
      </button>
      <p class="foot">最大{{ room.capacity }}人まで同じルームに参加できます</p>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .4); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 50; }
.sheet { background: #fff; border-radius: 28px; padding: 22px 22px 18px; width: min(420px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.2); }
header { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0; font-size: 24px; }
.x { width: 48px; height: 48px; border-radius: 50%; background: var(--gray-50); display: inline-flex; align-items: center; justify-content: center; }
.lead { margin: 6px 0 12px; font-size: 13px; color: var(--gray-500); }
.pillRow { display: flex; justify-content: flex-end; }
.pill { font-size: 13px; font-weight: 700; padding: 6px 16px; border-radius: 999px; background: var(--green-100); color: var(--green-800); }
.qrBox { position: relative; margin: 12px 0 8px; background: var(--gray-50); border-radius: 24px; padding: 18px; display: flex; justify-content: center; }
.qrBox img { width: 100%; max-width: 300px; aspect-ratio: 1; image-rendering: pixelated; }
.qrBox.dim img { opacity: .15; }
.over { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; font-weight: 700; }
.regen { display: inline-flex; gap: 8px; align-items: center; background: var(--green-800); color: #fff; border-radius: 999px; padding: 12px 20px; min-height: 48px; }
.exp { text-align: center; font-size: 12px; color: var(--gray-500); margin: 0 0 10px; }
.link { color: var(--green-800); font-weight: 700; text-decoration: underline; font-size: 12px; }
.code { width: 100%; display: flex; align-items: center; justify-content: space-between; background: var(--gray-50); border-radius: 16px; padding: 0 18px; min-height: 60px; font-size: 20px; font-weight: 800; letter-spacing: .06em; }
.copy { display: inline-flex; align-items: center; gap: 8px; color: var(--green-600); font-size: 12px; letter-spacing: 0; font-weight: 600; }
.foot { text-align: center; margin: 10px 0 0; font-size: 12px; color: var(--gray-500); }
.inlineWrap .sheet { width: 100%; box-shadow: none; padding: 0; border-radius: 0; background: none; }
.inlineWrap h2 { font-size: 20px; }
.inlineWrap .qrBox { background: #fff; border: 1px solid var(--gray-200); }
</style>
