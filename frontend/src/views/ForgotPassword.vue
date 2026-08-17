<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h2>忘记密码</h2>
        <p class="login-subtitle">请联系系统开发者重置密码</p>
      </div>
      
      <div class="developer-container">
        <p class="developer-info">如果您忘记了密码，请联系系统开发者进行重置：</p>
        <div class="developer-details">
          <div class="developer-item">
            <span class="developer-label">姓名：</span>
            <span class="developer-value">郭紫锦</span>
          </div>
          <div class="developer-item">
            <span class="developer-label">电话：</span>
            <span class="developer-value">15827175932</span>
          </div>
        </div>
        <p class="developer-note">请提供您的用户名和单位信息，以便开发者验证您的身份。</p>
        <el-button type="primary" @click="$router.push('/login')" style="width: 100%; margin-top: 20px;">
          返回登录
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  background-size: cover;
  background-position: center;
}

.login-box {
  width: 400px;
  background: rgba(255, 255, 255, 0.95);
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.login-box:hover {
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.25);
  transform: translateY(-5px);
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h2 {
  margin: 0 0 10px 0;
  color: #1e3c72;
  font-size: 24px;
  font-weight: 600;
}

.login-subtitle {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.developer-container {
  text-align: center;
  padding: 20px 0;
}

.developer-info {
  margin-bottom: 20px;
  color: #606266;
  line-height: 1.5;
}

.developer-details {
  background-color: #f5f7fa;
  border-radius: 4px;
  padding: 16px;
  margin-bottom: 20px;
  text-align: left;
  display: inline-block;
}

.developer-item {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

.developer-item:last-child {
  margin-bottom: 0;
}

.developer-label {
  font-weight: 500;
  color: #303133;
  width: 60px;
}

.developer-value {
  color: #606266;
}

.developer-note {
  color: #909399;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 20px;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .login-box {
    width: 90%;
    padding: 30px;
  }
  
  .login-header h2 {
    font-size: 20px;
  }
}
</style>