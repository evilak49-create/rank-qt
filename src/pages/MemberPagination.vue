<script setup>
defineProps({ page: Object, busy: Boolean })
const emit = defineEmits(['page'])
</script>

<template>
  <nav v-if="page?.last_page > 1" class="member-actions" aria-label="分页">
    <button class="quiet" :disabled="busy || page.current_page <= 1" @click="emit('page', page.current_page - 1)">上一页</button>
    <span class="muted">{{ page.current_page }} / {{ page.last_page }}</span>
    <button class="quiet" :disabled="busy || page.current_page >= page.last_page" @click="emit('page', page.current_page + 1)">下一页</button>
  </nav>
</template>
