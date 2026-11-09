<script setup lang="ts">
import { ref } from 'vue'
import StaffStart from './views/StaffStart.vue'
import GuestJoin from './views/GuestJoin.vue'
import RoomView from './views/RoomView.vue'

const path = ref(location.pathname)
function go(p: string) {
  history.pushState(null, '', p)
  path.value = p
}
window.addEventListener('popstate', () => (path.value = location.pathname))
</script>

<template>
  <RoomView v-if="path === '/room'" />
  <GuestJoin v-else-if="path.startsWith('/j')" @go="go" />
  <StaffStart v-else @go="go" />
</template>
