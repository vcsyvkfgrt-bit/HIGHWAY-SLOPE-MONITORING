<template>
  <div class="home-placeholder">
    <el-card>
      <div style="font-size: 18px; font-weight: 700; margin-bottom: 12px">
        页面占位（工作流页当前未启用）
      </div>
      <el-button type="primary" @click="$router.push('/data-entry')">
        去数据录入
      </el-button>
      <el-button style="margin-left: 12px" @click="$router.push('/slope-management')">
        去边坡与测点管理
      </el-button>
    </el-card>
  </div>
</template>

<script setup>
</script>

<style scoped>
.home-placeholder {
  padding: 20px;
}
</style>
