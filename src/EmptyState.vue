<script setup>
import artwork from './assets/empty-records.png'

defineProps({ message: { type: String, required: true }, compact: Boolean })
</script>

<template>
  <div class="empty-state" :class="{ 'empty-state-compact': compact }">
    <img :src="artwork" alt="" width="124" height="124" decoding="async">
    <p role="status">{{ message }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 176px;
  padding: 12px 10px 18px;
  color: var(--muted, #d0c5b7);
  text-align: center;
  overflow-wrap: anywhere;
}
.empty-state img { display: block; width: 124px; height: 124px; object-fit: contain; opacity: .84; }
.empty-state p { margin: 0; font-size: 13px; line-height: 1.5; }
.empty-state-compact { gap: 3px; padding-block: 6px 10px; min-height: 0; }
.empty-state-compact img { width: 80px; height: 80px; }
</style>
