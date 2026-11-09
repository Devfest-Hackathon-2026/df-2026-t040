<script setup lang="ts">
// First thing a guest sees in the room: "Is this your language?" — the guess comes from the phone's
// settings, which is often wrong for travellers (e.g. an English-set phone owned by a Thai speaker).
import { computed } from 'vue'
import { langName, type Dict } from '../lib/i18n'
import Icon from './Icon.vue'
import MultiLine from './MultiLine.vue'

const props = defineProps<{ d: Dict; lang: string; langs: string[] }>()
const emit = defineEmits<{ ok: []; pick: [lang: string] }>()
const others = computed(() => props.langs.filter((l) => l !== props.lang).map((l) => ({ l, own: langName(l, l) })))
</script>

<template>
  <div class="scrim">
    <div class="card" role="dialog" aria-modal="true" :aria-label="d.langCheck">
      <Icon name="globe" :size="30" class="globe" />
      <h2>{{ d.langCheck }}</h2>
      <MultiLine k="isYourLang" :skip="`${lang},${d.langCheck === 'Is this your language?' ? 'en' : ''}`" />
      <p class="cur" :lang="lang">{{ langName(lang, lang) }}</p>
      <button class="yes" @click="emit('ok')"><Icon name="check" :size="20" />{{ d.langYes }}</button>
      <p class="or">{{ d.langOther }}</p>
      <div class="grid">
        <button v-for="o in others" :key="o.l" :lang="o.l" @click="emit('pick', o.l)">{{ o.own }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 92; background: rgba(20, 32, 27, .5); display: flex; align-items: center; justify-content: center; padding: 16px; }
.card { background: #fff; border-radius: 28px; width: min(440px, 100%); max-height: 92dvh; overflow-y: auto; padding: 22px 20px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.globe { color: var(--violet); }
h2 { margin: 0; font-size: 20px; }
.cur { margin: 6px 0 2px; font-size: 30px; font-weight: 700; }
.yes { width: 100%; min-height: 56px; border-radius: 18px; background: var(--green-600); color: #fff; font-weight: 800; font-size: 17px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.or { margin: 10px 0 2px; font-size: 13px; color: var(--gray-500); font-weight: 600; }
.grid { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.grid button { min-height: 46px; border-radius: 14px; border: 1.5px solid var(--gray-200); background: #fff; font-weight: 700; font-size: 14px; padding: 4px; }
.grid button:active { background: var(--sky); }
</style>
