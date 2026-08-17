<template>
  <div class="data-view-page">
    <DataViewWorkflow :workflow-data="workflowStub" standalone />
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import DataViewWorkflow from '../components/DataViewWorkflow.vue'

/** 独立页不传真实工作流，仅占位以便组件内必要时写入 dataView（不会用到） */
const workflowStub = reactive({
  dataEntry: {},
  dataView: {},
})
</script>

<style scoped>
.data-view-page {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
