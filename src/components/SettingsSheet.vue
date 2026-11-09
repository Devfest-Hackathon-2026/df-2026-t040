<script setup lang="ts">
// Settings, laid out like a phone's own settings app: grouped rows, segmented choices,
// a language page you drill into, and the "leave" action kept apart at the bottom.
import { computed, ref } from 'vue'
import { langName, type Dict } from '../lib/i18n'
import Icon from './Icon.vue'

const props = defineProps<{ d: Dict; talkMode: 'tap' | 'hands'; autoplay: boolean; voiceMode: 'live' | 'expressive'; staff?: boolean; lang: string; langs: string[]; autoLang?: boolean; page?: 'main' | 'lang'; glossary?: string[] }>()
const emit = defineEmits<{ close: []; talkMode: [m: 'tap' | 'hands']; autoplay: [on: boolean]; voiceMode: [m: 'live' | 'expressive']; guide: []; lang: [l: string]; clear: []; autoLang: [on: boolean]; leave: []; glossary: [words: string[]] }>()
const view = ref<'main' | 'lang' | 'words'>(props.page ?? 'main')
// Staff word list: one entry per line (shop name, dishes, nearby stations…)
const wordsText = ref((props.glossary ?? []).join('\n'))
const wordCount = computed(() => (props.glossary ?? []).length)
function saveWords() {
  emit('glossary', wordsText.value.split(/\n|、|,/).map((w) => w.trim()).filter(Boolean))
  view.value = 'main'
}
const uiLang = computed(() => (props.staff ? 'ja' : props.lang))
// Each language is shown in its own script ("English", "日本語", "한국어"…) so people can find theirs.
const options = computed(() => [...new Set([props.lang, ...props.langs])].map((l) => ({ l, own: langName(l, l), here: langName(l, uiLang.value) })))
function pick(l: string) {
  if (l !== props.lang) emit('lang', l)
  view.value = 'main'
  if (props.page === 'lang') emit('close')
}
function back() { if (props.page === 'lang') emit('close'); else view.value = 'main' }
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="view === 'lang' ? d.language : d.settings">
      <span class="grab" aria-hidden="true" />

      <!-- ── Language page ── -->
      <template v-if="view === 'lang'">
        <header>
          <button class="nav" :aria-label="d.back" @click="back"><Icon name="back" :size="22" /></button>
          <h2>{{ d.language }}</h2>
          <button class="nav" :aria-label="d.close" @click="emit('close')"><Icon name="close" :size="20" /></button>
        </header>
        <div class="body">
          <div class="group">
            <label class="row">
              <span class="lbl">{{ d.autoLang }}</span>
              <span class="switch"><input type="checkbox" :checked="autoLang" @change="emit('autoLang', ($event.target as HTMLInputElement).checked)" /><i aria-hidden="true" /></span>
            </label>
          </div>
          <ul class="group list" role="listbox" :aria-label="d.language">
            <li v-for="o in options" :key="o.l">
              <button class="row" role="option" :aria-selected="o.l === lang" @click="pick(o.l)">
                <span class="lbl"><strong>{{ o.own }}</strong><small v-if="o.own !== o.here">{{ o.here }}</small></span>
                <Icon v-if="o.l === lang" name="check" :size="20" class="tick" />
              </button>
            </li>
          </ul>
        </div>
      </template>

      <!-- ── Word list page (staff) ── -->
      <template v-else-if="view === 'words'">
        <header>
          <button class="nav" :aria-label="d.back" @click="view = 'main'"><Icon name="back" :size="22" /></button>
          <h2>単語帳（固有名詞）</h2>
          <button class="nav" :aria-label="d.close" @click="emit('close')"><Icon name="close" :size="20" /></button>
        </header>
        <div class="body">
          <p class="note lead">店名・メニュー・近くの駅や観光地などを登録すると、聞き取りと翻訳でその名前を正しく扱います。1行に1つ書いてください（最大60個）。この端末に保存され、次の会話でも使われます。</p>
          <div class="group">
            <textarea v-model="wordsText" class="words" rows="9" placeholder="例）&#10;ゆうひ食堂&#10;豚骨ラーメン&#10;新宿御苑&#10;都営大江戸線" aria-label="単語帳" />
          </div>
          <button class="save" @click="saveWords">保存する</button>
        </div>
      </template>

      <!-- ── Main page ── -->
      <template v-else>
        <header>
          <span class="nav ghost" />
          <h2>{{ d.settings }}</h2>
          <button class="nav" :aria-label="d.close" @click="emit('close')"><Icon name="close" :size="20" /></button>
        </header>
        <div class="body">
          <div class="group">
            <button class="row" @click="view = 'lang'">
              <span class="ico blue"><Icon name="globe" :size="18" /></span>
              <span class="lbl">{{ d.language }}</span>
              <span class="val">{{ langName(lang, lang) }}</span>
              <Icon name="chevron" :size="18" class="chev" />
            </button>
            <button v-if="staff" class="row" @click="view = 'words'">
              <span class="ico orange"><Icon name="edit" :size="18" /></span>
              <span class="lbl">単語帳（固有名詞）<small>店名・メニュー・駅名を正しく聞き取る</small></span>
              <span class="val">{{ wordCount ? `${wordCount}語` : '未登録' }}</span>
              <Icon name="chevron" :size="18" class="chev" />
            </button>
          </div>

          <h3>{{ d.talkModeTitle }}</h3>
          <div class="group pad">
            <div class="seg" role="radiogroup" :aria-label="d.talkModeTitle">
              <button role="radio" :aria-checked="talkMode === 'tap'" @click="emit('talkMode', 'tap')"><Icon name="mic" :size="18" />{{ d.modeTap }}</button>
              <button role="radio" :aria-checked="talkMode === 'hands'" @click="emit('talkMode', 'hands')"><Icon name="headphones" :size="18" />{{ d.modeHands }}</button>
            </div>
          </div>

          <h3>{{ d.voiceTitle }}</h3>
          <div class="group">
            <label class="row">
              <span class="ico green"><Icon name="volume" :size="18" /></span>
              <span class="lbl">{{ d.autoplayLabel }}</span>
              <span class="switch"><input type="checkbox" :checked="autoplay" @change="emit('autoplay', ($event.target as HTMLInputElement).checked)" /><i aria-hidden="true" /></span>
            </label>
            <div class="pad sub">
              <div class="seg" role="radiogroup" :aria-label="d.voiceTitle">
                <button role="radio" :aria-checked="voiceMode === 'live'" @click="emit('voiceMode', 'live')">{{ d.voiceLive }}</button>
                <button role="radio" :aria-checked="voiceMode === 'expressive'" @click="emit('voiceMode', 'expressive')">{{ d.voiceExpressive }}</button>
              </div>
              <p class="note">{{ voiceMode === 'live' ? d.voiceLiveDesc : d.voiceExpDesc }}</p>
            </div>
          </div>

          <div class="group">
            <button class="row" @click="emit('guide')">
              <span class="ico violet"><Icon name="help" :size="18" /></span>
              <span class="lbl">{{ d.howTo }}</span>
              <Icon name="chevron" :size="18" class="chev" />
            </button>
            <button v-if="staff" class="row" @click="emit('clear')">
              <span class="ico gray"><Icon name="trash" :size="18" /></span>
              <span class="lbl">画面の文字を消す</span>
            </button>
          </div>

          <div class="group">
            <button class="row danger" @click="emit('leave')">
              <span class="lbl center"><Icon name="logout" :size="18" />{{ staff ? '会話を終了' : d.leave }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 85; background: rgba(20, 32, 27, .4); display: flex; align-items: flex-end; justify-content: center; }
.sheet { position: relative; max-height: 90dvh; background: var(--gray-50); width: min(480px, 100%); border-radius: var(--r-page) var(--r-page) 0 0; display: flex; flex-direction: column; animation: up .22s ease-out; overflow: hidden; }
@media (min-width: 768px) { .scrim { align-items: center; padding: 20px; } .sheet { border-radius: var(--r-page); } .grab { display: none; } }
@keyframes up { from { transform: translateY(30px); opacity: 0; } }
.sheet { animation-duration: var(--medium); }
.grab { position: absolute; top: 6px; left: 50%; width: 38px; height: 5px; margin-left: -19px; border-radius: 3px; background: #c9c9cf; }
header { flex: none; display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; padding: 14px 12px 8px; }
h2 { margin: 0; font-size: 17px; font-weight: 800; text-align: center; }
.nav { width: 36px; height: 36px; border-radius: var(--r-el); background: #e8e8e8; color: var(--gray-700); display: inline-flex; align-items: center; justify-content: center; }
.nav.ghost { background: none; }
.body { overflow-y: auto; padding: 6px 16px calc(24px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 6px; -webkit-overflow-scrolling: touch; }
/* groups must not shrink inside the scrolling column, or their rows get clipped */
.body > * { flex-shrink: 0; }
h3 { margin: 14px 4px 4px; font-size: 13px; font-weight: 700; color: var(--gray-500); }
.group { background: #fff; border: 1px solid var(--border); border-radius: var(--r-con); overflow: hidden; margin-top: 8px; }
h3 + .group { margin-top: 0; }
.group.pad, .pad { padding: 12px; }
.sub { padding-top: 2px; border-top: 1px solid var(--border); margin-left: 14px; padding-left: 0; padding-right: 12px; padding-top: 12px; }
.list { list-style: none; margin: 8px 0 0; padding: 0; }
.row { width: 100%; min-height: 50px; display: flex; align-items: center; gap: 12px; padding: 8px 14px; text-align: left; background: #fff; font-size: 16px; color: var(--ink); cursor: pointer; }
.row + .row, li + li .row { border-top: 1px solid var(--border); }
.row:active { background: #f4f4f7; }
.lbl { flex: 1; min-width: 0; font-weight: 700; display: flex; flex-direction: column; gap: 1px; line-height: 1.35; }
.lbl small { font-weight: 500; font-size: 13px; color: var(--gray-500); }
.lbl.center { flex-direction: row; justify-content: center; align-items: center; gap: 8px; }
.val { color: var(--gray-500); font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
.chev { color: #b8b8c0; flex: none; }
.tick { color: var(--ink); flex: none; }
.ico { display: none; }
.ico.blue { background: #3478f6; } .ico.green { background: var(--green-600); } .ico.violet { background: var(--violet); } .ico.gray { background: #8e8e96; } .ico.orange { background: #f29a2e; }
.lead { margin: 6px 4px 0; font-size: 13.5px; }
.words { display: block; width: 100%; border: 0; padding: 14px; font: inherit; font-size: 16px; line-height: 1.6; resize: vertical; min-height: 200px; outline: none; }
.save { margin-top: 12px; min-height: 48px; border-radius: var(--r-el); background: var(--ink); color: #fff; font-weight: 800; font-size: 16px; }
.danger { color: var(--red); justify-content: center; }
.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 2px; border-radius: var(--r-el); background: var(--gray-100); }
.seg button { min-height: 42px; border-radius: 8px; font-size: 13.5px; font-weight: 700; color: var(--gray-700); display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 4px 8px; line-height: 1.25; text-align: center; }
.seg button[aria-checked='true'] { background: #fff; color: var(--ink); box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.note { margin: 8px 2px 0; font-size: 12.5px; color: var(--gray-500); line-height: 1.5; }
.switch { position: relative; flex: none; }
.switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.switch i { display: block; width: 51px; height: 31px; border-radius: 999px; background: #e0e0e6; position: relative; transition: background .2s; }
.switch i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .2s; }
.switch input:checked + i { background: var(--ink); }
.switch input:checked + i::after { transform: translateX(20px); }
.switch input:focus-visible + i { outline: 2px solid var(--violet); outline-offset: 2px; }
</style>
