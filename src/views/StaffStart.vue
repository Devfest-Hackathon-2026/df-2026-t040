<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { saveToken } from '../lib/room'
import { langName } from '../lib/i18n'
import Icon from '../components/Icon.vue'

const emit = defineEmits<{ go: [path: string] }>()
const name = ref(localStorage.getItem('lingo.staffName') || '')
const lang = ref(localStorage.getItem('lingo.staffLang') || 'ja')
const passcode = ref('')
const needPass = ref(false)
const hasKey = ref(true)
const err = ref('')
const busy = ref(false)
const LANGS = ['ja', 'en', 'zh-Hans', 'ko']

onMounted(async () => {
  try {
    const h = await fetch('/api/health').then((r) => r.json())
    needPass.value = h.passcodeRequired
    hasKey.value = h.hasKey
  } catch { /* offline */ }
})

async function start() {
  err.value = ''
  if (needPass.value && !passcode.value.trim()) { err.value = 'スタッフ用パスコードを入力してください'; return }
  busy.value = true
  try {
    localStorage.setItem('lingo.staffName', name.value)
    localStorage.setItem('lingo.staffLang', lang.value)
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staffName: name.value || 'スタッフ', staffLang: lang.value, passcode: passcode.value }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error === 'bad_passcode' ? 'パスコードが違います。もう一度確認してください' : j.error === 'rate_limited' ? '少し時間をおいてからお試しください' : '開始できませんでした')
    saveToken(j.token)
    emit('go', '/room')
  } catch (e) {
    err.value = (e as Error).message || '開始できませんでした'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="accent" />
    <main>
      <section class="hero">
        <h1 class="logo"><img class="mark" src="/mark.png" alt="" />oshaberry</h1>
        <p class="tag">言葉の壁だけでなく、気持ちの壁も越える翻訳</p>
        <ul class="features">
          <li><span class="fic"><Icon name="mic" :size="22" /></span><div><strong>話すだけで翻訳</strong><small>言語を自動判定し、話している途中から字幕と翻訳音声を届けます</small></div></li>
          <li><span class="fic"><Icon name="sparkle" :size="22" /></span><div><strong>気持ちのニュアンスも</strong><small>声の調子をAIが推定し、感情を込めた翻訳音声で再生できます</small></div></li>
          <li><span class="fic"><Icon name="qr" :size="22" /></span><div><strong>QRを見せるだけで参加</strong><small>観光客はログインもアプリも不要。最大6人まで同時に会話</small></div></li>
        </ul>
      </section>
      <form class="card" @submit.prevent="start">
        <h2>新しい会話</h2>
        <label>スタッフ名<input v-model="name" placeholder="例: Akira" maxlength="24" autocomplete="off" data-1p-ignore /></label>
        <label>あなたの言語
          <select v-model="lang"><option v-for="l in LANGS" :key="l" :value="l">{{ langName(l, 'ja') }}</option></select>
        </label>
        <label v-if="needPass">スタッフ用パスコード<input v-model="passcode" type="password" autocomplete="off" data-1p-ignore /></label>
        <p v-if="!hasKey" class="warn">サーバーに GOOGLE_CLOUD_PROJECT が設定されていません（翻訳は動作しません）</p>
        <p v-if="err" class="err">{{ err }}</p>
        <button class="primary" :disabled="busy">新しい会話をはじめる</button>
        <p class="note">QRコードを観光客に見せると、ログインや言語選択なしで参加できます。</p>
      </form>
    </main>
  </div>
</template>

<style scoped>
.page { min-height: 100%; display: flex; flex-direction: column; }
.accent { height: 7px; background: var(--green-600); }
main { width: min(440px, 100%); margin: 0 auto; padding: 48px 24px; display: flex; flex-direction: column; gap: 12px; }
.logo { font-size: 48px; font-weight: 800; color: var(--green-800); margin: 0; letter-spacing: -.03em; }
.tag { margin: 0 0 20px; color: var(--gray-500); }
.features { display: none; list-style: none; padding: 0; margin: 0; flex-direction: column; gap: 22px; }
.features li { display: flex; gap: 16px; align-items: flex-start; }
.features div { display: flex; flex-direction: column; gap: 4px; }
.features strong { font-size: 17px; }
.features small { font-size: 14px; color: var(--gray-700); line-height: 1.6; }
.fic { width: 48px; height: 48px; border-radius: 14px; background: #fff; color: var(--green-800); display: inline-flex; align-items: center; justify-content: center; flex: none; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
form { display: flex; flex-direction: column; gap: 16px; }
.card h2 { display: none; margin: 0 0 4px; font-size: 22px; }
/* tablet: centred card on a soft background */
@media (min-width: 768px) {
  .page { background: var(--gray-50); }
  main { width: min(560px, 100%); justify-content: center; flex: 1; }
  .card { background: #fff; border-radius: 28px; padding: 32px; box-shadow: 0 10px 40px rgba(0,0,0,.06); }
  .card h2 { display: block; }
}
/* PC / tablet landscape: brand panel + form side by side */
@media (min-width: 1024px) {
  main { width: min(1120px, 100%); flex-direction: row; align-items: center; gap: 64px; padding: 48px; }
  .hero { flex: 1; background: var(--green-100); border-radius: 32px; padding: 48px; align-self: stretch; display: flex; flex-direction: column; justify-content: center; }
  .hero .logo { font-size: 64px; }
  .hero .tag { font-size: 18px; color: var(--gray-700); margin-bottom: 36px; }
  .features { display: flex; }
  .card { width: 440px; flex: none; }
}
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; color: var(--gray-700); }
input, select { min-height: 56px; border-radius: 16px; border: 1px solid var(--gray-200); background: var(--gray-50); padding: 0 16px; font-size: 17px; }
.primary { min-height: 64px; border-radius: 18px; background: var(--green-800); color: #fff; font-size: 18px; font-weight: 800; margin-top: 8px; }
.primary:disabled { opacity: .6; }
.err { color: var(--red); margin: 0; }
.warn { color: #7a5a12; background: #fff6e0; border-radius: 12px; padding: 10px 12px; margin: 0; font-size: 13px; }
.note { color: var(--gray-500); font-size: 13px; margin: 8px 0 0; line-height: 1.6; }
</style>
