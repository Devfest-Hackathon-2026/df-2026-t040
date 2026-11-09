<script setup lang="ts">
// Take-home summary: drawn into a PNG card in the viewer's own language
// that can be saved to the device (or shared to Photos on phones).
import { onMounted, ref, watch } from 'vue'
import type { Summary, SummaryContent } from '../../shared/types'
import { langName, t, type Dict } from '../lib/i18n'
import Icon from './Icon.vue'

const props = defineProps<{ summary: Summary; d: Dict; closable?: boolean; loading?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const url = ref('')
const blob = ref<Blob>()
const canShare = ref(false)

const W = 1080
const PAD = 72
const FONT = `Inter, 'Hiragino Sans', 'Noto Sans JP', 'Noto Sans SC', 'Noto Sans KR', 'Noto Sans Thai', system-ui, sans-serif`
const C = { green: '#171717', green6: '#4b39ef', mint: '#eeedfd', ink: '#0a0a0a', gray: '#5c5c5c', line: '#e5e5e5', warn: '#fff8e1' }

/** Wrap text for canvas: CJK/Thai break per character, Latin per word. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const tokens = text.match(/[฀-๿　-鿿가-힯＀-￯]|[^\s฀-๿　-鿿가-힯＀-￯]+|\s+/g) ?? []
  const lines: string[] = []
  let cur = ''
  for (const t of tokens) {
    const next = cur + t
    if (ctx.measureText(next).width > width && cur.trim()) {
      lines.push(cur.trimEnd())
      cur = t.trimStart()
    } else cur = next
  }
  if (cur.trim()) lines.push(cur.trim())
  return lines
}

type Block = { draw: (ctx: CanvasRenderingContext2D, y: number) => number }

function render() {
  const s = props.summary
  const main = s.byLang[s.primary]
  if (!main) return
  const sec: SummaryContent | undefined = s.secondary ? s.byLang[s.secondary] : undefined
  const L = t(s.primary) // headings in the summary's own language (falls back to English)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const inner = W - PAD * 2

  // Measure + draw in two passes: first with a dry-run context to get the height.
  const blocks: Block[] = []
  const text = (str: string, size: number, color: string, weight = 400, indent = 0, gapAfter = 8): Block => ({
    draw: (c, y) => {
      c.font = `${weight} ${size}px ${FONT}`
      const lines = wrap(c, str, inner - indent)
      c.fillStyle = color
      lines.forEach((l, i) => c.fillText(l, PAD + indent, y + size + i * size * 1.42))
      return y + lines.length * size * 1.42 + gapAfter
    },
  })
  const section = (title: string, items: string[], secItems: string[] | undefined, mark: string, box?: string): Block[] => {
    if (!items.length) return []
    const out: Block[] = [{
      draw: (c, y) => {
        c.font = `800 30px ${FONT}`
        c.fillStyle = C.green6
        c.fillText(title, PAD, y + 30)
        return y + 52
      },
    }]
    items.forEach((it, i) => {
      out.push({
        draw: (c, y) => {
          const first = text(it, 36, C.ink, 700, 56, 4)
          const second = secItems?.[i] ? text(secItems[i], 27, C.gray, 400, 56, 0) : undefined
          // measure on the scratch context, then paint (box → text → mark)
          const mid = first.draw(dryCtx, y)
          const end = second ? second.draw(dryCtx, mid) : mid
          const h = end - y + 22
          if (c !== dryCtx) {
            if (box) {
              c.fillStyle = box
              roundRect(c, PAD - 8, y - 6, inner + 16, h - 8, 18)
              c.fill()
            }
            first.draw(c, y)
            second?.draw(c, mid)
            c.font = `700 34px ${FONT}`
            c.fillStyle = C.green6
            c.fillText(mark, PAD + 8, y + 37)
          }
          return y + h
        },
      })
    })
    out.push({ draw: (_c, y) => y + 18 })
    return out
  }

  blocks.push(text(main.title, 52, C.ink, 800, 0, 4))
  if (sec?.title) blocks.push(text(sec.title, 30, C.gray, 600, 0, 30))
  else blocks.push({ draw: (_c, y) => y + 26 })
  blocks.push(...section(L.important, main.important, sec?.important, '!', C.warn))
  blocks.push(...section(L.points, main.points, sec?.points, '•'))
  blocks.push(...section(L.next, main.next, sec?.next, '→'))

  const HEADER = 230
  const FOOTER = 120
  const dryCanvas = document.createElement('canvas')
  dryCanvas.width = W
  dryCanvas.height = 10
  const dryCtx = dryCanvas.getContext('2d')!
  let y = HEADER + 56
  for (const b of blocks) y = b.draw(dryCtx, y)
  const H = Math.ceil(y + FOOTER)

  canvas.width = W
  canvas.height = H
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  // header band
  ctx.fillStyle = C.green
  ctx.fillRect(0, 0, W, HEADER)
  ctx.fillStyle = C.green6
  ctx.fillRect(0, HEADER - 10, W, 10)
  ctx.fillStyle = '#fff'
  ctx.font = `800 64px ${FONT}`
  ctx.fillText('oshaberry', PAD, 104)
  ctx.font = `600 30px ${FONT}`
  ctx.fillText(L.summaryReady, PAD, 156)
  ctx.font = `400 24px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,.75)'
  const when = new Date(s.createdAt).toLocaleString(s.primary, { dateStyle: 'medium', timeStyle: 'short' })
  const langs = [s.primary, s.secondary].filter(Boolean).map((l) => langName(l!, s.primary)).join(' / ')
  ctx.fillText(`${when} · ${s.participants.join(', ')} · ${langs}`.slice(0, 90), PAD, 198)

  y = HEADER + 56
  for (const b of blocks) y = b.draw(ctx, y)

  // footer
  ctx.strokeStyle = C.line
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PAD, H - FOOTER + 20); ctx.lineTo(W - PAD, H - FOOTER + 20); ctx.stroke()
  ctx.font = `400 22px ${FONT}`
  ctx.fillStyle = C.gray
  wrap(ctx, L.summaryNote, inner).slice(0, 2).forEach((l, i) => ctx.fillText(l, PAD, H - FOOTER + 58 + i * 30))

  canvas.toBlob((b) => {
    if (!b) return
    blob.value = b
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = URL.createObjectURL(b)
    const file = new File([b], fileName(), { type: 'image/png' })
    // Share sheet only on phones/tablets (it offers "Save image" to Photos there). On a computer
    // the share sheet has no "save", so the button downloads the PNG instead.
    canShare.value = matchMedia('(pointer: coarse)').matches && !!navigator.canShare?.({ files: [file] })
  }, 'image/png')
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

const fileName = () => `oshaberry-summary-${new Date(props.summary.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`

function save() {
  if (!url.value) return
  const a = document.createElement('a')
  a.href = url.value
  a.download = fileName()
  a.rel = 'noopener'
  // Safari/Firefox only follow a download link that is in the document
  document.body.appendChild(a)
  a.click()
  setTimeout(() => a.remove(), 0)
}
async function share() {
  if (!blob.value) return
  const file = new File([blob.value], fileName(), { type: 'image/png' })
  try {
    await navigator.share({ files: [file], title: 'oshaberry' })
  } catch (e) {
    // the person closed the share sheet: fine. Anything else (not allowed, unsupported): download instead.
    if ((e as Error)?.name !== 'AbortError') save()
  }
}

onMounted(async () => {
  await document.fonts?.ready
  render()
})
watch(() => props.summary, render)
</script>

<template>
  <div class="scrim" @click.self="closable && emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="d.summaryReady">
      <header>
        <h2><Icon name="doc" :size="22" />{{ d.summaryReady }}</h2>
        <button v-if="closable" class="x" :aria-label="d.close" @click="emit('close')"><Icon name="close" /></button>
      </header>
      <div class="preview" :class="{ busy: loading }">
        <img v-if="url" :src="url" :alt="summary.byLang[summary.primary]?.title" />
        <p v-else class="wait">{{ d.makingSummary }}</p>
      </div>
      <div class="btns">
        <button v-if="canShare" class="primary" @click="share"><Icon name="download" :size="20" />{{ d.saveImage }}</button>
        <button v-else class="primary" :disabled="!url" @click="save"><Icon name="download" :size="20" />{{ d.saveImage }}</button>
        <button v-if="canShare" class="ghost" :disabled="!url" @click="save">PNG</button>
      </div>
      <p v-if="url" class="saveHint">{{ d.saveHint }}</p>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .4); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 80; }
.sheet { background: #fff; border-radius: var(--r-page); padding: 20px; width: min(520px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.2); }
header { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px; color: var(--ink); }
.x { width: 36px; height: 36px; border-radius: var(--r-el); background: var(--gray-50); display: inline-flex; align-items: center; justify-content: center; }
.preview { flex: 1; min-height: 160px; overflow: auto; border-radius: var(--r-con); background: var(--gray-50); border: 1px solid var(--gray-200); }
.preview img { width: 100%; display: block; }
.wait { text-align: center; color: var(--gray-500); padding: 40px; }
.btns { display: flex; gap: 10px; }
.primary { flex: 1; min-height: 48px; border-radius: var(--r-el); background: var(--ink); color: #fff; font-weight: 800; font-size: 17px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.primary:disabled { opacity: .5; }
.ghost { min-height: 48px; padding: 0 16px; border-radius: var(--r-el); background: #fff; border: 1px solid var(--border); font-weight: 700; }
.saveHint { margin: 0; font-size: 12.5px; color: var(--gray-500); text-align: center; }
.preview.busy { opacity: .45; transition: opacity .2s; }
</style>
