<script setup lang="ts">
// One caption, cycling through many languages (like the "Speak your language" video).
// Skips the viewer's own language, which is already shown as the big title.
// Always one line: longer scripts (e.g. Russian) shrink to fit instead of wrapping,
// so the layout never jumps when the language changes.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MULTI, type MultiKey } from '../lib/i18n'

const props = defineProps<{ k: MultiKey; skip?: string }>()
// skip: languages already shown as the title (comma-separated)
const list = computed(() => { const sk = (props.skip ?? '').split(',').map((x) => x.split('-')[0]); return MULTI[props.k].filter(([l]) => !sk.includes(l)) })
const i = ref(0)
const box = ref<HTMLElement>()
const scale = ref(1)
watch(() => props.k, () => { i.value = 0 })
const cur = computed(() => list.value[i.value % list.value.length])

async function fit() {
  scale.value = 1
  await nextTick()
  const el = box.value
  const span = el?.querySelector('span') as HTMLElement | null
  if (!el || !span) return
  const avail = el.clientWidth
  const need = span.scrollWidth
  if (need > avail && avail > 0) scale.value = Math.max(0.6, (avail / need) * 0.98)
}
watch(cur, () => { void fit() })

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void fit()
  addEventListener('resize', fit)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  timer = setInterval(() => { i.value = (i.value + 1) % list.value.length }, 1700)
})
onBeforeUnmount(() => { clearInterval(timer); removeEventListener('resize', fit) })
</script>

<template>
  <div ref="box" class="multi" aria-hidden="true">
    <Transition name="fade" mode="out-in" @after-enter="fit">
      <span :key="k + i" :lang="cur[0]" :style="{ fontSize: `${scale}em` }">{{ cur[1] }}</span>
    </Transition>
  </div>
</template>

<style scoped>
.multi { height: 1.6em; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 17px; color: var(--gray-700); overflow: hidden; min-width: 0; width: 100%; }
.multi span { white-space: nowrap; }
.fade-enter-active, .fade-leave-active { transition: opacity .28s, transform .28s; }
.fade-enter-from { opacity: 0; transform: translateY(6px); }
.fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
