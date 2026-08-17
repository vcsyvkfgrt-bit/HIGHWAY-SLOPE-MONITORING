<template>
  <div class="basic-data-management">
    <SlopeManagement :key="`slopes-${slopeVersion}`" @changed="handleSlopeChanged" />
    <PointManagement :key="`points-${pointVersion}`" @changed="handlePointChanged" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import SlopeManagement from './SlopeManagement.vue'
import PointManagement from './PointManagement.vue'

const slopeVersion = ref(0)
const pointVersion = ref(0)

const handleSlopeChanged = () => {
  pointVersion.value += 1
}

const handlePointChanged = () => {
  slopeVersion.value += 1
}
</script>

<style scoped>
.basic-data-management {
  display: grid;
  gap: 18px;
  width: 100%;
}
</style>
