<script setup lang="ts">
defineProps<{ name: 'mic' | 'stop' | 'qr' | 'globe' | 'play' | 'check' | 'close' | 'link' | 'headphones' | 'send' | 'sparkle' | 'refresh' | 'logout' | 'trash' | 'camera' | 'download' | 'doc' | 'settings' | 'help' | 'edit' | 'reply' | 'volume' | 'chevron' | 'back'; size?: number }>()
</script>

<template>
  <svg :width="size ?? 22" :height="size ?? 22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'mic'"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></template>
    <template v-else-if="name === 'stop'"><rect x="7" y="7" width="10" height="10" rx="2.5" /></template>
    <template v-else-if="name === 'qr'"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></template>
    <template v-else-if="name === 'globe'"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></template>
    <template v-else-if="name === 'play'"><path d="M8 5.5v13l10-6.5z" /></template>
    <template v-else-if="name === 'check'"><path d="M5 12.5l4.5 4.5L19 7.5" /></template>
    <template v-else-if="name === 'chevron'"><path d="M9 6l6 6-6 6" /></template>
    <template v-else-if="name === 'back'"><path d="M15 6l-6 6 6 6" /></template>
    <template v-else-if="name === 'close'"><path d="M6 6l12 12M18 6L6 18" /></template>
    <template v-else-if="name === 'link'"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></template>
    <template v-else-if="name === 'headphones'"><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></template>
    <template v-else-if="name === 'send'"><path d="M4 12l16-8-6 16-2.5-6.5z" /></template>
    <template v-else-if="name === 'sparkle'"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></template>
    <template v-else-if="name === 'refresh'"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></template>
    <template v-else-if="name === 'logout'"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" /></template>
    <template v-else-if="name === 'camera'"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></template>
    <template v-else-if="name === 'download'"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></template>
    <template v-else-if="name === 'doc'"><path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" /></template>
    <template v-else-if="name === 'settings'"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></template>
    <template v-else-if="name === 'help'"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" /></template>
    <template v-else-if="name === 'edit'"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></template>
    <template v-else-if="name === 'reply'"><path d="M10 8L5 12l5 4M5 12h9a5 5 0 0 1 5 5v1" /></template>
    <template v-else-if="name === 'volume'"><path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></template>
    <template v-else-if="name === 'trash'"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></template>
  </svg>
</template>
