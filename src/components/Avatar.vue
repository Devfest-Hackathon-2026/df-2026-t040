<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ name: string; size?: number }>()
const palette = [
  ['#e3f2ea', '#174b3c'],
  ['#fcebd9', '#5a3a1a'],
  ['#e6eefb', '#24467f'],
  ['#efe8fb', '#45307a'],
]
const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/)
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : props.name.slice(0, 2)
  return s.toUpperCase()
})
const color = computed(() => {
  let h = 0
  for (const c of props.name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
})
</script>

<template>
  <span
    class="avatar"
    :style="{ width: (size ?? 36) + 'px', height: (size ?? 36) + 'px', background: color[0], color: color[1], fontSize: (size ?? 36) * 0.36 + 'px' }"
    aria-hidden="true"
  >{{ initials }}</span>
</template>

<style scoped>
.avatar { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: 700; flex: none; letter-spacing: .02em; }
</style>
