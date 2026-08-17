<template>
  <div class="user-profile-container">
    <el-card class="user-profile-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>个人信息</span>
        </div>
      </template>
      
      <el-form :model="userForm" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" disabled />
        </el-form-item>
        
        <el-form-item label="真实姓名" prop="real_name">
          <el-input v-model="userForm.real_name" placeholder="请输入真实姓名" />
        </el-form-item>
        
        <el-form-item label="单位/项目" prop="unit">
          <el-input v-model="userForm.unit" placeholder="请输入单位或项目" />
        </el-form-item>
        
        <el-form-item label="电话号码" prop="phone">
          <el-input v-model="userForm.phone" placeholder="请输入电话号码" />
        </el-form-item>
        
        <el-form-item label="角色">
          <el-input v-model="userForm.role" disabled />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="handleSubmit" :loading="loading">保存修改</el-button>
          <el-button @click="handleCancel">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { API_APP } from '../config/api'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)

const userForm = reactive({
  username: '',
  real_name: '',
  unit: '',
  phone: '',
  role: ''
})

const rules = {
  real_name: [
    { required: true, message: '请输入真实姓名', trigger: 'blur' }
  ],
  unit: [
    { required: true, message: '请输入单位或项目', trigger: 'blur' }
  ],
  phone: [
    { required: true, message: '请输入电话号码', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
  ]
}

// 加载用户信息
async function loadUserInfo() {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      ElMessage.error('请先登录')
      router.push('/login')
      return
    }
    
    const response = await fetch(`${API_APP}/api/user/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data.user) {
        Object.assign(userForm, data.user)
      }
    } else {
      ElMessage.error('获取用户信息失败')
    }
  } catch (error) {
    ElMessage.error('网络错误，请稍后重试')
  }
}

// 提交修改
async function handleSubmit() {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    loading.value = true
    
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_APP}/api/user/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        real_name: userForm.real_name,
        unit: userForm.unit,
        phone: userForm.phone
      })
    })
    
    const data = await response.json()
    
    if (response.ok) {
      // 更新本地存储的用户信息
      localStorage.setItem('user', JSON.stringify(data.user))
      ElMessage.success('个人信息更新成功')
    } else {
      ElMessage.error(data.error || '更新失败')
    }
  } catch (error) {
    ElMessage.error('网络错误，请稍后重试')
  } finally {
    loading.value = false
  }
}

// 取消
function handleCancel() {
  loadUserInfo()
}

onMounted(loadUserInfo)
</script>

<style scoped>
.user-profile-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px 0;
}

.card-header {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.user-profile-card {
  border-radius: 8px;
}
</style>