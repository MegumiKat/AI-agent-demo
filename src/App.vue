<script setup lang="ts">
  import { provide, ref, onMounted, onBeforeUnmount } from 'vue'
  import Info from './components/ConfigPanel.vue'
  import SdkRender from './components/AvatarRender.vue'
  import { appState, appStore } from './stores/app'
  
  // 提供全局状态和方法
  provide('appState', appState)
  provide('appStore', appStore)
  
  // 是否是手机 / 小屏
  const isMobile = ref(false)
  const updateIsMobile = () => {
    isMobile.value = window.innerWidth <= 768
  }
  
  onMounted(async () => {
    updateIsMobile()
    window.addEventListener('resize', updateIsMobile)
  
    // ⭐ 自动连接逻辑：env 里有 appId / appSecret 就自动连
    if (
      !appState.avatar.connected &&
      appState.avatar.appId &&
      appState.avatar.appSecret
    ) {
      try {
        await appStore.connectAvatar()
        console.log('[App] 自动连接虚拟人成功')
      } catch (err) {
        console.error('[App] 自动连接虚拟人失败:', err)
      }
    }
  })
  
  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateIsMobile)
  })
  </script>
  
  <template>
    <div class="main">
      <!-- 左侧：数字人渲染区域 -->
      <SdkRender class="sdk-render" />
  
      <!-- 右侧：配置面板，只在非手机端显示 -->
      <Info v-if="!isMobile" />
    </div>
  </template>
  
  <style scoped>
  .main {
    display: flex;
    width: 100vw;
    height: 100vh;
  }
  
  /* 让左侧渲染区域把剩余空间占满 */
  .sdk-render {
    flex: 1;
    min-width: 0;
  }
  </style>