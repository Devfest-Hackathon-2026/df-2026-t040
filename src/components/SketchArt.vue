<script setup lang="ts">
// Hand-drawn style illustrations (pen + hatching, a little wobble) for the how-to guide.
// Pure SVG: no images to load, scales to any screen, works offline.
export type SketchKind = 'scan' | 'speak' | 'chat' | 'turns' | 'check'
withDefaults(defineProps<{ kind: SketchKind; accent?: string }>(), { accent: '#14b37d' })
const uid = `sk${Math.random().toString(36).slice(2, 8)}`
// Hand drawings: scan/speak/chat from the team's sketch PDF; turns/check drawn to match that style.
const DRAWN: Partial<Record<SketchKind, string>> = { scan: '/guide/scan.webp', speak: '/guide/speak.webp', chat: '/guide/chat.webp', turns: '/guide/turns.webp', check: '/guide/check.webp' }
// fixed "random" QR modules so it looks like a code but never changes
const QR = [[3, 0], [3, 2], [0, 3], [1, 3], [3, 3], [5, 3], [6, 3], [4, 4], [6, 4], [3, 5], [5, 5], [4, 6], [6, 6]]
</script>

<template>
  <img v-if="DRAWN[kind]" :src="DRAWN[kind]" alt="" aria-hidden="true" class="sketch drawn" decoding="async" />
  <svg v-else viewBox="0 0 240 160" role="img" aria-hidden="true" class="sketch">
    <defs>
      <!-- wobble: makes straight vector lines look hand drawn -->
      <filter :id="`${uid}w`" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" />
        <feDisplacementMap in="SourceGraphic" scale="2.6" />
      </filter>
      <!-- pen hatching for phone bezels -->
      <pattern :id="`${uid}h`" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="#1f2a26" stroke-width="1.6" />
      </pattern>
      <g :id="`${uid}qr`">
        <rect x="0" y="0" width="3" height="3" fill="none" stroke="#1f2a26" stroke-width=".9" />
        <rect x="1" y="1" width="1" height="1" fill="#1f2a26" />
        <rect x="4" y="0" width="3" height="3" fill="none" stroke="#1f2a26" stroke-width=".9" />
        <rect x="5" y="1" width="1" height="1" fill="#1f2a26" />
        <rect x="0" y="4" width="3" height="3" fill="none" stroke="#1f2a26" stroke-width=".9" />
        <rect x="1" y="5" width="1" height="1" fill="#1f2a26" />
        <rect v-for="([x, y], k) in QR" :key="k" :x="x" :y="y" width="1" height="1" fill="#1f2a26" />
      </g>
    </defs>

    <g :filter="`url(#${uid}w)`" fill="none" stroke="#1f2a26" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <!-- 1. scan the QR on the staff tablet with your phone -->
      <template v-if="kind === 'scan'">
        <rect x="138" y="14" width="86" height="120" rx="12" :fill="`url(#${uid}h)`" />
        <rect x="145" y="24" width="72" height="100" rx="6" fill="#fff" />
        <path d="M168 14 v6 h26 v-6" />
        <path d="M168 114 h26" stroke-width="2" />
        <!-- your phone -->
        <rect x="40" y="26" width="58" height="104" rx="11" :fill="`url(#${uid}h)`" />
        <rect x="46" y="34" width="46" height="88" rx="5" fill="#fff" />
        <path d="M54 58 v-6 h6 M78 52 h6 v6 M84 86 v6 h-6 M60 92 h-6 v-6" :stroke="accent" stroke-width="2.4" />
        <!-- hand -->
        <path d="M44 86 c-10 6 -12 30 -20 54 M96 96 c10 -4 14 6 6 12 c8 2 6 12 -2 12 c6 4 2 12 -6 10 c-4 10 -18 18 -34 24" fill="#fff" />
        <path d="M100 66 c8 -2 10 8 4 14" />
        <!-- scan beam -->
        <path d="M104 72 L 140 58 M104 80 L 140 92" :stroke="accent" stroke-dasharray="4 6" stroke-width="2" />
        <text x="69" y="152" font-size="13" text-anchor="middle" stroke="none" fill="#1f2a26" font-family="'Comic Sans MS', 'Chalkboard SE', cursive">you</text>
      </template>

      <!-- 2. speak into your phone in your own language -->
      <template v-else-if="kind === 'speak'">
        <circle cx="92" cy="58" r="32" fill="#fff" />
        <path d="M76 88 L 62 150 H 126 L 110 88" fill="#fff" />
        <circle cx="106" cy="50" r="4" fill="#1f2a26" />
        <path d="M100 66 q 12 12 22 -2" :fill="accent" fill-opacity=".35" />
        <path d="M132 54 h 18 M132 64 h 20 M134 76 l 14 8" :stroke="accent" stroke-width="3" />
        <!-- phone with mic -->
        <rect x="160" y="34" width="38" height="70" rx="8" :fill="`url(#${uid}h)`" />
        <rect x="165" y="40" width="28" height="58" rx="4" fill="#fff" />
        <rect x="174" y="52" width="10" height="22" rx="5" fill="#1f2a26" />
        <path d="M170 66 a 9 9 0 0 0 18 0 M179 76 v8" />
        <path d="M162 84 c-8 8 -8 26 -14 40 M196 82 c8 0 8 8 2 10 c6 2 4 10 -2 10 c-4 10 -16 18 -28 24" fill="#fff" />
        <text x="94" y="158" font-size="12" text-anchor="middle" stroke="none" fill="#1f2a26" font-family="'Comic Sans MS', 'Chalkboard SE', cursive">you</text>
        <!-- little friend listening -->
        <path d="M24 96 c 0 -18 26 -22 30 -6 c 4 16 -10 22 -22 20 c -6 -1 -8 -6 -8 -14 z" fill="#fff" />
        <path d="M28 82 l -6 -10 l 10 4 M46 80 l 6 -10 l -1 11" />
        <circle cx="44" cy="92" r="2.4" fill="#1f2a26" />
      </template>

      <!-- 3. the conversation appears translated, like a chat -->
      <template v-else-if="kind === 'chat'">
        <rect x="74" y="6" width="92" height="150" rx="14" :fill="`url(#${uid}h)`" />
        <rect x="81" y="16" width="78" height="132" rx="7" fill="#fff" />
        <path d="M108 6 v7 h24 v-7" />
        <path d="M112 26 h38 v14 h-8 l -2 5 l -3 -5 h-25 z" :fill="accent" fill-opacity=".35" />
        <path d="M88 52 h40 v14 h-28 l -3 5 l -2 -5 h-7 z" />
        <path d="M118 78 h32 v13 h-6 l -2 5 l -3 -5 h-21 z" :fill="accent" fill-opacity=".35" />
        <path d="M88 103 h30 v12 h-20 l -3 5 l -2 -5 h-5 z" />
        <circle cx="92" cy="136" r="6" />
        <rect x="102" y="131" width="34" height="10" rx="3" />
        <circle cx="148" cy="136" r="6" :fill="accent" fill-opacity=".5" />
        <path d="M89 133 v6 M92 131 v10 M95 133 v6" stroke-width="1.6" />
        <!-- floating "other languages" -->
        <g stroke="none" fill="#1f2a26" font-family="system-ui" font-weight="700" text-anchor="middle">
          <text x="38" y="70" font-size="14">Hello</text>
          <text x="38" y="118" font-size="11">こんにちは</text>
          <text x="202" y="56" font-size="14">你好</text>
          <text x="202" y="118" font-size="14">Hola</text>
        </g>
      </template>

      <!-- 4. take turns: one speaks, then the other -->
      <template v-else-if="kind === 'turns'">
        <circle cx="56" cy="84" r="26" fill="#fff" />
        <path d="M42 108 L 32 156 H 82 L 72 108" fill="#fff" />
        <circle cx="66" cy="78" r="3.4" fill="#1f2a26" />
        <path d="M62 94 q 8 6 14 -2" />
        <circle cx="184" cy="84" r="26" fill="#fff" />
        <path d="M170 108 L 160 156 H 210 L 200 108" fill="#fff" />
        <circle cx="174" cy="78" r="3.4" fill="#1f2a26" />
        <path d="M166 94 q 6 6 12 0" />
        <path d="M40 22 h66 v30 h-44 l -10 10 l 0 -10 h-12 z" :fill="accent" fill-opacity=".35" />
        <text x="73" y="44" font-size="18" text-anchor="middle" stroke="none" fill="#1f2a26" font-family="system-ui" font-weight="700">1</text>
        <path d="M134 22 h66 v30 h-12 l 0 10 l -10 -10 h-44 z" stroke-dasharray="5 5" />
        <text x="167" y="44" font-size="18" text-anchor="middle" stroke="none" fill="#1f2a26" font-family="system-ui" font-weight="700">2</text>
        <path d="M100 96 q 20 -16 40 0 M134 90 l 6 6 l -8 3" :stroke="accent" />
      </template>

      <!-- 5. important details are double-checked -->
      <template v-else>
        <rect x="70" y="10" width="86" height="140" rx="14" :fill="`url(#${uid}h)`" />
        <rect x="77" y="20" width="72" height="122" rx="7" fill="#fff" />
        <path d="M84 34 h56 v24 h-40 l -3 6 l -3 -6 h-10 z" />
        <text x="112" y="51" font-size="14" text-anchor="middle" stroke="none" fill="#1f2a26" font-family="system-ui" font-weight="700">¥1,200</text>
        <path d="M84 74 h56 v24 h-10 l -3 6 l -3 -6 h-40 z" :fill="accent" fill-opacity=".3" />
        <text x="112" y="91" font-size="13" text-anchor="middle" stroke="none" fill="#1f2a26" font-family="system-ui" font-weight="700">🥜 ✕</text>
        <circle cx="168" cy="110" r="24" :fill="accent" />
        <path d="M156 110 l 8 8 l 15 -16" stroke="#fff" stroke-width="4.5" />
        <path d="M44 40 l 10 4 M40 60 h 12 M44 80 l 10 -4" :stroke="accent" stroke-width="3" />
      </template>
    </g>
    <!-- QR codes stay crisp (outside the wobble filter) so they still read as QR codes -->
    <g v-if="kind === 'scan'">
      <use :href="`#${uid}qr`" transform="translate(160 53) scale(5.6)" />
      <use :href="`#${uid}qr`" transform="translate(58 67) scale(3.1)" />
    </g>
  </svg>
</template>

<style scoped>
.sketch { width: 100%; height: 100%; display: block; }
.drawn { object-fit: contain; }
</style>
