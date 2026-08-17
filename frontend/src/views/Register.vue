<template>
  <div class="register-container">
    <div class="register-box">
      <h2>高边坡监测平台注册</h2>
      <el-form :model="registerForm" :rules="registerRules" ref="registerFormRef" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="registerForm.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="registerForm.password" type="password" placeholder="请输入密码" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="registerForm.confirmPassword" type="password" placeholder="请确认密码" />
        </el-form-item>
        <el-form-item label="真实姓名" prop="real_name">
          <el-input v-model="registerForm.real_name" placeholder="请输入真实姓名" />
        </el-form-item>
        <el-form-item label="单位" prop="unit">
          <el-input v-model="registerForm.unit" placeholder="请输入单位或项目名称" />
        </el-form-item>
        <el-form-item label="电话" prop="phone">
          <el-input v-model="registerForm.phone" placeholder="请输入电话号码" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleRegister" :loading="loading" style="width: 100%">
            注册
          </el-button>
        </el-form-item>
        <el-form-item>
          <el-link type="primary" @click="$router.push('/login')">
            已有账号，去登录
          </el-link>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { API_APP } from '../config/api'

const router = useRouter()
const registerFormRef = ref(null)
const loading = ref(false)

const registerForm = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  real_name: '',
  unit: '',
  phone: ''
})

const registerRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 50, message: '用户名长度在3-50之间', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== registerForm.password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ],
  real_name: [
    { required: true, message: '请输入真实姓名', trigger: 'blur' }
  ]
};

const handleRegister = async () => {
  if (!registerFormRef.value) return
  
  try {
    await registerFormRef.value.validate()
    loading.value = true
    
    const response = await fetch(`${API_APP}/api/user/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(registerForm)
    })
    
    const data = await response.json()
    
    if (response.ok) {
      ElMessage.success('注册成功，请登录')
      router.push('/login')
    } else {
      ElMessage.error(data.error || '注册失败')
    }
  } catch (error) {
    ElMessage.error('注册失败，请检查网络连接')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.register-box {
  width: 400px;
  background: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
}

.register-box h2 {
  text-align: center;
  margin-bottom: 30px;
  color: #333;
}
</style>
