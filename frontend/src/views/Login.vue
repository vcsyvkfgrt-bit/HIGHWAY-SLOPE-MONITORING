<template>
  <main class="login-page">
    <section class="project-panel" aria-label="系统介绍">
      <div class="project-panel__topline">
        <div class="project-mark" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <span>工程监测工作台</span>
      </div>

      <div class="project-intro">
        <p class="project-kicker">HIGHWAY SLOPE MONITORING</p>
        <h1>高边坡监测预警<br />管理平台</h1>
        <p class="project-description">汇集边坡、测点、监测数据与预警处置，让每一次观测都可追溯。</p>
      </div>

      <div class="survey-scene" aria-hidden="true">
        <div class="survey-scene__scale">
          <span>80</span><span>60</span><span>40</span><span>20</span><span>0</span>
        </div>
        <div class="survey-scene__contour contour-one"></div>
        <div class="survey-scene__contour contour-two"></div>
        <div class="survey-scene__contour contour-three"></div>
        <div class="survey-scene__slope"></div>
        <div class="survey-scene__baseline"></div>
        <div class="survey-point point-one"><i></i><b>BP-01</b></div>
        <div class="survey-point point-two"><i></i><b>BP-07</b></div>
        <div class="survey-point point-three"><i></i><b>CX-02</b></div>
      </div>

      <div class="project-footer">
        <span>数据可追溯</span>
        <span>监测有依据</span>
        <span>预警可处置</span>
      </div>
    </section>

    <section class="access-panel">
      <div class="access-panel__content">
        <div class="access-heading">
          <p>账户登录</p>
          <h2>进入监测工作台</h2>
          <span>使用您的工程账号继续工作</span>
        </div>

        <el-form ref="loginFormRef" :model="loginForm" :rules="loginRules" label-position="top" @submit.prevent="handleLogin">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="loginForm.username" placeholder="请输入用户名" autocomplete="username" size="large">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="loginForm.password" type="password" placeholder="请输入密码" autocomplete="current-password" show-password size="large" @keyup.enter="handleLogin">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <div class="access-options">
            <el-checkbox v-model="loginForm.remember">记住账号</el-checkbox>
            <el-button link type="primary" @click="showForgotPasswordDialog">忘记密码</el-button>
          </div>
          <el-button class="login-submit" type="primary" native-type="submit" :loading="loading">
            登录系统
            <el-icon v-if="!loading"><Right /></el-icon>
          </el-button>
        </el-form>

        <p class="register-prompt">还没有账号？<el-link type="primary" @click="$router.push('/register')">创建账号</el-link></p>
      </div>
      <p class="access-panel__support">如需重置账号，请联系项目系统管理员</p>
    </section>
  </main>

  <el-dialog v-model="forgotPasswordDialogVisible" title="重置登录密码" width="420px" align-center>
    <div class="forgot-password-content">
      <p>请联系系统开发者核验身份后重置密码。</p>
      <dl class="developer-info">
        <div><dt>联系人</dt><dd>郭紫锦</dd></div>
        <div><dt>联系电话</dt><dd>15827175932</dd></div>
      </dl>
      <p class="forgot-password-note">请提供您的用户名和所属单位，便于完成身份核验。</p>
    </div>
    <template #footer>
      <el-button type="primary" @click="forgotPasswordDialogVisible = false">知道了</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock, Right, User } from '@element-plus/icons-vue'
import { API_APP } from '../config/api'

const router = useRouter()
const loginFormRef = ref(null)
const loading = ref(false)
const forgotPasswordDialogVisible = ref(false)

const loginForm = reactive({
  username: '',
  password: '',
  remember: false
})

const loginRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const showForgotPasswordDialog = () => {
  forgotPasswordDialogVisible.value = true
}

onMounted(() => {
  const savedUsername = localStorage.getItem('savedUsername')
  const savedPassword = localStorage.getItem('savedPassword')
  if (!savedUsername) return

  loginForm.username = savedUsername
  loginForm.remember = true
  if (savedPassword) loginForm.password = savedPassword
})

const handleLogin = async () => {
  if (!loginFormRef.value) return

  try {
    await loginFormRef.value.validate()
    loading.value = true
    const response = await fetch(`${API_APP}/api/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm)
    })
    const data = await response.json()

    if (!response.ok) {
      ElMessage.error(data.error || '登录失败')
      return
    }

    if (loginForm.remember) {
      localStorage.setItem('savedUsername', loginForm.username)
      localStorage.setItem('savedPassword', loginForm.password)
    } else {
      localStorage.removeItem('savedUsername')
      localStorage.removeItem('savedPassword')
    }

    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    router.push('/home')
  } catch (error) {
    ElMessage.error('登录失败，请检查网络连接')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  --survey-navy: #16334b;
  --survey-blue: #276e9f;
  --survey-cyan: #79bfd1;
  --survey-line: #cddce3;
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(430px, 0.8fr);
  background: #f5f8fa;
  color: #1d2f3e;
}

.project-panel {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding: clamp(36px, 6vw, 84px);
  display: flex;
  flex-direction: column;
  background-color: var(--survey-navy);
  background-image: linear-gradient(rgba(159, 201, 214, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(159, 201, 214, 0.1) 1px, transparent 1px);
  background-size: 32px 32px;
}

.project-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(13, 39, 60, 0.12), rgba(13, 39, 60, 0.55));
  pointer-events: none;
}

.project-panel__topline,
.project-intro,
.project-footer {
  position: relative;
  z-index: 1;
}

.project-panel__topline {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  color: #d8ebf1;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.project-mark {
  display: flex;
  align-items: end;
  gap: 3px;
  width: 25px;
  height: 24px;
  padding-bottom: 2px;
  border-bottom: 2px solid #82c7d8;
}

.project-mark span { width: 5px; background: #82c7d8; }
.project-mark span:nth-child(1) { height: 8px; }
.project-mark span:nth-child(2) { height: 15px; }
.project-mark span:nth-child(3) { height: 21px; }

.project-intro { margin-top: clamp(80px, 14vh, 172px); max-width: 600px; }
.project-kicker { margin: 0 0 22px; color: #8bd1de; font-family: Consolas, monospace; font-size: 12px; letter-spacing: 0.13em; }
.project-intro h1 { margin: 0; color: #fff; font-size: clamp(36px, 4vw, 60px); line-height: 1.22; font-weight: 650; letter-spacing: 0; }
.project-description { max-width: 440px; margin: 26px 0 0; color: #c7dce4; font-size: 16px; line-height: 1.9; }

.survey-scene { position: absolute; z-index: 0; right: 0; bottom: 66px; left: 9%; height: min(38vw, 400px); opacity: 0.95; }
.survey-scene__scale { position: absolute; top: 0; bottom: 0; left: 0; display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 5px; color: #8eb4c0; font-family: Consolas, monospace; font-size: 11px; }
.survey-scene__scale::after { content: ''; position: absolute; top: 0; bottom: 0; left: 31px; border-left: 1px solid rgba(126, 190, 208, 0.58); }
.survey-scene__contour { position: absolute; border: 1px solid rgba(125, 195, 211, 0.42); border-radius: 48% 52% 43% 57%; transform: rotate(-12deg); }
.contour-one { right: 4%; bottom: 14%; width: 75%; height: 55%; }
.contour-two { right: 12%; bottom: 19%; width: 58%; height: 42%; }
.contour-three { right: 21%; bottom: 25%; width: 40%; height: 29%; }
.survey-scene__slope { position: absolute; right: 4%; bottom: 7%; left: 7%; height: 58%; border-top: 2px solid #84c8d6; clip-path: polygon(0 73%, 20% 64%, 38% 38%, 55% 49%, 70% 15%, 100% 45%, 100% 47%, 70% 17%, 55% 51%, 38% 40%, 20% 66%, 0 75%); background: rgba(98, 174, 192, 0.13); }
.survey-scene__baseline { position: absolute; right: 0; bottom: 7%; left: 31px; border-top: 1px solid rgba(132, 200, 214, 0.65); }
.survey-point { position: absolute; display: flex; align-items: center; gap: 7px; color: #d8edf1; font-family: Consolas, monospace; font-size: 11px; }
.survey-point i { display: block; width: 9px; height: 9px; border: 2px solid #e5f7f9; border-radius: 50%; background: #2b84a9; box-shadow: 0 0 0 5px rgba(119, 195, 211, 0.14); }
.survey-point b { font-weight: 500; }
.point-one { bottom: 38%; left: 29%; }.point-two { right: 28%; bottom: 51%; }.point-three { right: 10%; bottom: 29%; }

.project-footer { display: flex; gap: 28px; margin-top: auto; color: #a9c9d3; font-size: 13px; }
.project-footer span { position: relative; padding-left: 12px; }.project-footer span::before { content: ''; position: absolute; top: 50%; left: 0; width: 4px; height: 4px; border-radius: 50%; background: #80cbd7; transform: translateY(-50%); }

.access-panel { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 48px clamp(32px, 7vw, 112px); background: #ffffff; }
.access-panel__content { width: min(100%, 430px); margin: auto; }
.access-heading { margin-bottom: 38px; }.access-heading p { margin: 0 0 10px; color: #39799c; font-size: 14px; font-weight: 600; }.access-heading h2 { margin: 0; color: #183349; font-size: 30px; font-weight: 650; line-height: 1.3; }.access-heading span { display: block; margin-top: 11px; color: #6d7e89; font-size: 14px; }
.access-panel :deep(.el-form-item) { margin-bottom: 23px; }.access-panel :deep(.el-form-item__label) { padding-bottom: 8px; color: #314759; font-size: 14px; font-weight: 600; line-height: 1.2; }.access-panel :deep(.el-input__wrapper) { min-height: 46px; padding: 1px 14px; border-radius: 5px; background: #fff; box-shadow: 0 0 0 1px #cfdbe2 inset; }.access-panel :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 2px #4e94b4 inset; }.access-panel :deep(.el-input__prefix) { margin-right: 8px; color: #7395a7; }.access-panel :deep(.el-input__inner) { color: #203746; }
.access-options { display: flex; align-items: center; justify-content: space-between; margin: -4px 0 27px; }.access-options :deep(.el-checkbox__label) { color: #647581; font-size: 14px; }.access-options :deep(.el-button) { font-size: 14px; }
.login-submit { width: 100%; height: 48px; border: 0; border-radius: 5px; background: #276e9f; font-size: 15px; font-weight: 600; letter-spacing: 0.04em; }.login-submit:hover, .login-submit:focus { background: #1f5f8b; }.login-submit .el-icon { margin-left: 7px; font-size: 17px; }
.register-prompt { margin: 25px 0 0; color: #6d7e89; font-size: 14px; text-align: center; }.register-prompt :deep(.el-link) { margin-left: 4px; vertical-align: baseline; }
.access-panel__support { width: min(100%, 430px); margin: 48px auto 0; color: #99a7b0; font-size: 12px; text-align: center; }
.forgot-password-content p { margin: 0; color: #52636e; line-height: 1.7; }.developer-info { margin: 20px 0; padding: 15px 17px; border-left: 3px solid #4e94b4; background: #f3f8fa; }.developer-info div { display: flex; gap: 20px; }.developer-info div + div { margin-top: 9px; }.developer-info dt { min-width: 65px; color: #75858e; }.developer-info dd { margin: 0; color: #263d4d; font-weight: 600; }.forgot-password-content .forgot-password-note { color: #84929a; font-size: 13px; }

@media (max-width: 880px) { .login-page { grid-template-columns: 1fr; }.project-panel { min-height: 320px; padding: 30px clamp(24px, 7vw, 56px); }.project-intro { margin-top: 50px; }.project-intro h1 { font-size: 36px; }.project-description { margin-top: 14px; }.survey-scene { right: -5%; bottom: 25px; left: 19%; height: 245px; }.project-footer { display: none; }.access-panel { min-height: auto; padding: 58px 28px 40px; }.access-panel__support { margin-top: 40px; } }
@media (max-width: 480px) { .project-panel { min-height: 295px; }.project-panel__topline { font-size: 12px; }.project-intro { margin-top: 38px; }.project-intro h1 { font-size: 30px; }.project-description { max-width: 310px; font-size: 14px; line-height: 1.7; }.survey-scene { display: none; }.access-panel { padding: 42px 24px 32px; }.access-heading { margin-bottom: 30px; }.access-heading h2 { font-size: 26px; }.access-options { margin-bottom: 24px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }
</style>
