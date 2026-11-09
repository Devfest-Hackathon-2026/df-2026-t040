<script setup lang="ts">
import { computed, ref } from 'vue'
import { saveToken } from '../lib/room'
import { browserLang, langName, t } from '../lib/i18n'
import SketchArt from '../components/SketchArt.vue'
import MultiLine from '../components/MultiLine.vue'

const emit = defineEmits<{ go: [path: string] }>()
// First guess comes from the browser/phone settings (navigator.languages); the guest can change it.
const detected = browserLang()
const lang = ref(detected)
const d = computed(() => t(lang.value))
const LANGS = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'th', 'vi', 'id', 'es', 'fr', 'de', 'it', 'pt-BR', 'ru']
const options = computed(() => [...new Set([detected, ...LANGS])].map((l) => ({ l, own: langName(l, l) })))
// Invite code comes in the URL fragment so it never reaches server logs or Referer headers.
const code = ref((location.hash.slice(1) || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
const name = ref('')
const err = ref('')
const busy = ref(false)

async function join() {
  err.value = ''
  busy.value = true
  try {
    const res = await fetch('/api/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code.value, name: name.value, lang: lang.value }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      err.value = j.error === 'expired' ? d.value.expiredCode : j.error === 'full' ? d.value.fullRoom : d.value.invalidCode
      return
    }
    saveToken(j.token)
    history.replaceState(null, '', '/j')
    emit('go', '/room')
  } catch {
    err.value = d.value.error
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page" :lang="lang">
    <div class="accent" />
    <main>
      <h1 class="logo"><img class="mark" src="/mark.png" alt="" />oshaberry</h1>
      <section class="hero" aria-hidden="true">
        <div class="strip">
          <div><SketchArt kind="scan" accent="#14b37d" /><b>1</b></div>
          <div><SketchArt kind="speak" accent="#5b7cfa" /><b>2</b></div>
          <div><SketchArt kind="chat" accent="#f59f00" /><b>3</b></div>
        </div>
        <MultiLine k="speakYourLang" class="ml" />
      </section>
      <form @submit.prevent="join">
        <label v-if="!code || err">{{ d.joinCode }}
          <input v-model="code" inputmode="text" autocapitalize="characters" maxlength="6" autocomplete="off" data-1p-ignore />
        </label>
        <label>{{ d.yourName }}<input v-model="name" maxlength="24" autocomplete="off" data-1p-ignore /></label>
        <p v-if="err" class="err" role="alert">{{ err }}</p>
        <button class="primary" :disabled="busy || code.length !== 6">{{ d.agree }}</button>
        <!-- language is confirmed right after joining ("Is this your language?"), so no picker here -->
        <details class="consent">
          <summary>{{ d.consentShort }} <span>{{ d.details }}</span></summary>
          <p>{{ d.consentBody }}</p>
        </details>
      </form>
    </main>
  </div>
</template>

<style scoped>
.page { min-height: 100%; display: flex; flex-direction: column; }
.accent { height: 7px; background: var(--green-600); }
main { width: min(440px, 100%); margin: 0 auto; padding: 32px 22px; display: flex; flex-direction: column; gap: 18px; }
.logo { font-size: 40px; font-weight: 800; color: var(--green-800); margin: 0; letter-spacing: -.03em; }
.hero { background: #f1effe; border-radius: 24px; padding: 12px 10px 10px; display: flex; flex-direction: column; gap: 6px; }
.strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.strip > div { position: relative; aspect-ratio: 4 / 5; }
.strip b { position: absolute; left: 4px; top: 0; width: 22px; height: 22px; border-radius: 50%; background: var(--ink, #1f2a26); color: #fff; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; }
.ml { color: var(--green-800); font-size: 18px; }
.langPick select { min-height: 56px; border-radius: 16px; border: 2px solid var(--gray-200); background: #fff; padding: 0 14px; font-size: 18px; font-weight: 700; }
.langPick small { font-size: 12.5px; font-weight: 500; color: var(--gray-500); line-height: 1.5; }
.consent { font-size: 13px; color: var(--gray-700); line-height: 1.55; }
.consent summary { cursor: pointer; list-style: none; }
.consent summary::-webkit-details-marker { display: none; }
.consent summary span { color: var(--green-600); font-weight: 700; text-decoration: underline; text-underline-offset: 3px; margin-left: 4px; }
.consent p { margin: 8px 0 0; background: var(--gray-50); border-radius: 12px; padding: 10px 12px; }
form { display: flex; flex-direction: column; gap: 14px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; color: var(--gray-700); }
input { min-height: 56px; border-radius: 16px; border: 1px solid var(--gray-200); background: var(--gray-50); padding: 0 16px; font-size: 18px; }
.primary { min-height: 72px; border-radius: 20px; background: var(--green-800); color: #fff; font-size: 20px; font-weight: 800; }
.primary:disabled { opacity: .5; }
.err { color: var(--red); margin: 0; font-weight: 600; }
@media (min-width: 768px) {
  .page { background: var(--gray-50); }
  main { flex: 1; justify-content: center; width: min(520px, 100%); }
  main > * { background: #fff; }
  main { background: none; }
  .logo { background: none; text-align: center; font-size: 48px; }
  form { background: #fff; border-radius: 28px; padding: 28px; box-shadow: 0 10px 40px rgba(0,0,0,.06); }
}
</style>
