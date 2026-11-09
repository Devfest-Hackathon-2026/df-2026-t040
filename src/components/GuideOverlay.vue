<script setup lang="ts">
// First-time "how to use" walkthrough: 4 big pictorial steps in the viewer's language.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Dict, MultiKey } from '../lib/i18n'
import SketchArt, { type SketchKind } from './SketchArt.vue'
import MultiLine from './MultiLine.vue'

const props = defineProps<{ d: Dict; lang?: string }>()
const ART: SketchKind[] = ['speak', 'chat', 'turns', 'check']
const MK: MultiKey[] = ['press', 'chat', 'turns', 'check']
const emit = defineEmits<{ close: [] }>()
const i = ref(0)
const step = computed(() => props.d.guide[i.value])
const last = computed(() => i.value === props.d.guide.length - 1)
const COLORS = ['#171717', '#171717', '#171717', '#171717']
function next() { if (last.value) emit('close'); else i.value++ }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft' && i.value) i.value-- }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="card" role="dialog" aria-modal="true" :aria-label="d.howTo">
      <button class="skip" @click="emit('close')">{{ d.guideSkip }}</button>
      <div class="art" :style="{ background: COLORS[i] + '1c' }">
        <span class="num" :style="{ background: COLORS[i] }">{{ i + 1 }} / {{ d.guide.length }}</span>
        <Transition name="swap" mode="out-in"><SketchArt :key="i" :kind="ART[i] ?? 'chat'" :accent="COLORS[i]" /></Transition>
      </div>
      <h2>{{ step.title }}</h2>
      <MultiLine :k="MK[i] ?? 'chat'" :skip="lang" :style="{ color: COLORS[i] }" />
      <p>{{ step.body }}</p>
      <div class="dots" aria-hidden="true">
        <button v-for="(_s, k) in d.guide" :key="k" :class="{ on: k === i }" :style="k === i ? { background: COLORS[i] } : undefined" tabindex="-1" @click="i = k" />
      </div>
      <button class="next" :style="{ background: COLORS[i] }" @click="next">{{ last ? d.guideStart : d.guideNext }}</button>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 90; background: rgba(20, 32, 27, .45); display: flex; align-items: center; justify-content: center; padding: 18px; }
.card { position: relative; background: #fff; border-radius: 30px; width: min(420px, 100%); padding: 22px 22px 20px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; box-shadow: 0 24px 60px rgba(0,0,0,.22); animation: pop .25s ease-out; }
@keyframes pop { from { transform: scale(.94); opacity: 0; } }
.skip { position: absolute; top: 14px; right: 16px; font-size: 13px; font-weight: 700; color: var(--gray-500); min-height: 36px; padding: 0 8px; }
.art { position: relative; width: 100%; height: 200px; border-radius: 24px; padding: 10px 8px 4px; margin-top: 18px; transition: background .2s; }
.num { position: absolute; top: 10px; left: 12px; z-index: 1; font-weight: 800; font-size: 12px; color: #fff; border-radius: 999px; padding: 3px 10px; }
.swap-enter-active, .swap-leave-active { transition: opacity .2s, transform .2s; }
.swap-enter-from { opacity: 0; transform: translateX(14px); }
.swap-leave-to { opacity: 0; transform: translateX(-14px); }
h2 { margin: 6px 0 0; font-size: 22px; }
p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--gray-700); min-height: 72px; }
.dots { display: flex; gap: 8px; margin: 4px 0; }
.dots button { width: 9px; height: 9px; border-radius: 50%; background: var(--gray-200); padding: 0; transition: width .2s; }
.dots button.on { width: 24px; border-radius: 6px; }
.next { width: 100%; min-height: 56px; border-radius: 18px; color: #fff; font-weight: 800; font-size: 17px; }
</style>
