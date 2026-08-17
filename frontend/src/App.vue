<template>
  <router-view v-slot="{ Component, route }">
    <BlankLayout v-if="route.meta.layout === 'blank'">
      <component :is="Component" :key="route.fullPath" />
    </BlankLayout>
    <MainLayout v-else>
      <component :is="Component" :key="route.fullPath" />
    </MainLayout>
  </router-view>
</template>

<script setup>
import MainLayout from './layouts/MainLayout.vue'
import BlankLayout from './layouts/BlankLayout.vue'
</script>

