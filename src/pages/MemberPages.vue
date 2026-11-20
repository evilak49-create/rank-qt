<script setup>
import { computed } from 'vue'
import MemberAccount from './MemberAccount.vue'
import MemberProtection from './MemberProtection.vue'
import MemberRewards from './MemberRewards.vue'
import './MemberPages.css'

const props = defineProps({ route: Object, member: Object })
const emit = defineEmits(['logout', 'refresh-member'])
const page = computed(() => {
  if (props.route.path.startsWith('/protection')) return MemberProtection
  if (props.route.path.startsWith('/red-packets') || props.route.path === '/pix') return MemberRewards
  return MemberAccount
})
</script>

<template>
  <component :is="page" :key="route.fullPath" :route="route" :member="member"
    @logout="emit('logout')" @refresh-member="emit('refresh-member')" />
</template>
