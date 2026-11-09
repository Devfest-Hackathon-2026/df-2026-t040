<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
// If `level` is given, bars follow the live mic level; otherwise they animate idly.
const props = defineProps<{ level?: number }>()
const N = 18
const bars = ref<number[]>(Array.from({ length: N }, () => 0.3))
let raf = 0
let tick = 0
function frame() {
  tick++
  if (tick % 3 === 0) {
    const base = props.level !== undefined ? Math.min(1, props.level * 4) : 0.55
    bars.value = bars.value.map((_, i) => {
      const wobble = 0.35 + 0.65 * Math.abs(Math.sin(tick / 9 + i * 1.7)) * Math.random()
      return Math.max(0.18, Math.min(1, base * wobble + 0.12))
    })
  }
  raf = requestAnimationFrame(frame)
}
onMounted(() => { raf = requestAnimationFrame(frame) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
watch(() => props.level, () => {})
</script>

<template>
  <div class="wave" aria-hidden="true">
    <span v-for="(b, i) in bars" :key="i" :style="{ height: 4 + b * 26 + 'px' }" />
  </div>
</template>

<style scoped>
.wave { display: flex; align-items: center; gap: 4px; height: 32px; flex: 1; }
span { width: 4px; border-radius: 2px; background: var(--green-600); transition: height .08s linear; }
</style>
