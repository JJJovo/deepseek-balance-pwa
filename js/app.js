/* ========================================
   DeepSeek Balance PWA - 核心逻辑
   ======================================== */

(function () {
  'use strict';

  // --- 常量 ---
  const DEEPSEEK_API = 'https://api.deepseek.com/user/balance';
  const STORAGE_KEY = 'ds_api_key';

  // --- DOM 引用 ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // --- 状态 ---
  const state = {
    apiKey: '',
    balanceData: null,
    lastUpdated: null,
    isLoading: false,
    currentView: 'loading', // 'loading' | 'setup' | 'dashboard'
  };

  // --- DOM 元素 ---
  const views = {
    loading: $('#view-loading'),
    setup: $('#view-setup'),
    dashboard: $('#view-dashboard'),
  };

  // Setup 页元素
  const apiKeyInput = $('#api-key-input');
  const togglePasswordBtn = $('#toggle-password');
  const saveKeyBtn = $('#save-key-btn');
  const setupError = $('#setup-error');

  // Dashboard 页元素
  const pullIndicator = $('#pull-indicator');
  const totalBalanceEl = $('#total-balance');
  const statusBadge = $('#status-badge');
  const toppedUpBalanceEl = $('#topped-up-balance');
  const grantedBalanceEl = $('#granted-balance');
  const lastUpdatedEl = $('#last-updated');
  const refreshBtn = $('#refresh-btn');
  const settingsBtn = $('#settings-btn');
  const dashboardError = $('#dashboard-error');

  // --- 视图切换 ---
  function showView(viewName) {
    state.currentView = viewName;
    Object.entries(views).forEach(([name, el]) => {
      el.classList.toggle('active', name === viewName);
    });
  }

  // --- Toast ---
  let toastTimer;
  function showToast(message, type = '') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // --- 格式化时间 ---
  function formatTime(date) {
    if (!date) return '--';
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 10) return '刚刚';
    if (seconds < 60) return `${seconds} 秒前`;
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${min}`;
  }

  // --- API 调用 ---
  async function fetchBalance(apiKey) {
    const response = await fetch(DEEPSEEK_API, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('API Key 无效，请检查后重新输入');
      }
      if (response.status === 429) {
        throw new Error('请求过于频繁，请稍后再试');
      }
      throw new Error(`请求失败 (HTTP ${response.status})，请检查网络连接`);
    }

    const data = await response.json();
    return data;
  }

  // --- 验证并保存 API Key ---
  async function validateAndSaveKey() {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showSetupError('请输入 API Key');
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      showSetupError('API Key 格式不正确，应以 sk- 开头');
      return;
    }

    setLoading(saveKeyBtn, true);

    try {
      // 调用 API 验证 Key 是否有效
      await fetchBalance(apiKey);

      // 验证成功，保存 Key
      localStorage.setItem(STORAGE_KEY, apiKey);
      state.apiKey = apiKey;
      hideSetupError();
      showToast('API Key 验证成功', 'success');

      // 加载余额数据并切换到 dashboard
      await loadBalanceData();
      showView('dashboard');
    } catch (error) {
      showSetupError(error.message);
    } finally {
      setLoading(saveKeyBtn, false);
    }
  }

  function showSetupError(message) {
    setupError.textContent = message;
    setupError.style.display = 'flex';
    // 抖动输入框
    apiKeyInput.style.borderColor = 'var(--danger)';
    setTimeout(() => {
      apiKeyInput.style.borderColor = 'var(--border)';
    }, 2000);
  }

  function hideSetupError() {
    setupError.style.display = 'none';
  }

  // --- 加载余额数据 ---
  async function loadBalanceData() {
    if (state.isLoading) return;
    state.isLoading = true;

    try {
      const data = await fetchBalance(state.apiKey);
      state.balanceData = data;
      state.lastUpdated = new Date();
      renderBalance(data);
      hideDashboardError();
    } catch (error) {
      // 如果是认证错误，跳回设置页
      if (error.message.includes('401') || error.message.includes('无效')) {
        showToast('API Key 已失效，请重新设置', 'error');
        switchToSetup();
        return;
      }
      showDashboardError(error.message);
    } finally {
      state.isLoading = false;
      updateLastUpdated();
      pullIndicator.classList.remove('active');
    }
  }

  // --- 渲染余额 ---
  function renderBalance(data) {
    if (!data || !data.balance_infos || data.balance_infos.length === 0) {
      totalBalanceEl.textContent = '--';
      toppedUpBalanceEl.textContent = '--';
      grantedBalanceEl.textContent = '--';
      return;
    }

    const info = data.balance_infos[0];

    // 总余额
    totalBalanceEl.textContent = formatNumber(info.total_balance);

    // 充值余额
    toppedUpBalanceEl.textContent = formatNumber(info.topped_up_balance);

    // 赠送余额
    grantedBalanceEl.textContent = formatNumber(info.granted_balance);

    // 状态标识
    if (data.is_available) {
      statusBadge.className = 'balance-hero-status available';
      statusBadge.innerHTML = '<span class="status-dot green"></span> 可用';
    } else {
      statusBadge.className = 'balance-hero-status unavailable';
      statusBadge.innerHTML = '<span class="status-dot red"></span> 余额不足';
    }
  }

  function formatNumber(value) {
    if (value === undefined || value === null) return '--';
    const num = parseFloat(value);
    if (isNaN(num)) return '--';
    return num.toFixed(2);
  }

  function showDashboardError(message) {
    dashboardError.style.display = 'flex';
    dashboardError.querySelector('.error-text').textContent = message;
  }

  function hideDashboardError() {
    dashboardError.style.display = 'none';
  }

  function updateLastUpdated() {
    lastUpdatedEl.textContent = '更新于 ' + formatTime(state.lastUpdated);
  }

  // --- 切换到设置页 ---
  function switchToSetup() {
    state.balanceData = null;
    state.lastUpdated = null;
    showView('setup');
    apiKeyInput.value = state.apiKey;
    hideSetupError();
  }

  // --- 按钮加载状态 ---
  function setLoading(button, loading) {
    if (loading) {
      button.disabled = true;
      button._originalText = button.textContent;
      button.innerHTML = '<span class="loading-spinner" style="width:18px;height:18px;border-width:2px;"></span> 验证中...';
    } else {
      button.disabled = false;
      button.textContent = button._originalText || '验证并保存';
    }
  }

  // --- 下拉刷新 ---
  let touchStartY = 0;
  let touchCurrentY = 0;
  let isPulling = false;
  const PULL_THRESHOLD = 80;

  function isAtTop() {
    return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
  }

  function initPullToRefresh() {
    document.addEventListener('touchstart', (e) => {
      // 只在页面顶部且处于仪表盘视图时触发下拉刷新
      if (!isAtTop() || state.currentView !== 'dashboard') return;
      touchStartY = e.touches[0].clientY;
      isPulling = false;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!isAtTop() || state.currentView !== 'dashboard') {
        if (isPulling) {
          isPulling = false;
          pullIndicator.classList.remove('active');
        }
        return;
      }
      touchCurrentY = e.touches[0].clientY;
      const delta = touchCurrentY - touchStartY;

      if (delta > 20 && !isPulling) {
        isPulling = true;
        pullIndicator.classList.add('active');
      }

      if (isPulling && delta > PULL_THRESHOLD) {
        pullIndicator.querySelector('.pull-text').textContent = '松开刷新';
      } else if (isPulling) {
        pullIndicator.querySelector('.pull-text').textContent = '下拉刷新';
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (!isPulling) return;
      const delta = touchCurrentY - touchStartY;
      isPulling = false;

      if (delta > PULL_THRESHOLD) {
        pullIndicator.querySelector('.pull-text').textContent = '刷新中...';
        loadBalanceData().then(() => {
          pullIndicator.querySelector('.pull-text').textContent = '下拉刷新';
        });
      } else {
        pullIndicator.classList.remove('active');
      }
    });
  }

  // --- 事件绑定 ---
  function bindEvents() {
    // 保存 API Key
    saveKeyBtn.addEventListener('click', validateAndSaveKey);

    // 回车提交
    apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        validateAndSaveKey();
      }
      // 输入时隐藏错误
      hideSetupError();
    });

    // 显示/隐藏 API Key
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.textContent = isPassword ? '🙈' : '👁';
    });

    // 刷新按钮
    refreshBtn.addEventListener('click', () => {
      pullIndicator.classList.add('active');
      pullIndicator.querySelector('.pull-text').textContent = '刷新中...';
      loadBalanceData().then(() => {
        pullIndicator.querySelector('.pull-text').textContent = '下拉刷新';
        pullIndicator.classList.remove('active');
      });
    });

    // 设置按钮
    settingsBtn.addEventListener('click', () => {
      switchToSetup();
    });

    // 清除 Key 按钮
    $('#clear-key-btn').addEventListener('click', () => {
      if (confirm('确定要清除已保存的 API Key 吗？')) {
        localStorage.removeItem(STORAGE_KEY);
        state.apiKey = '';
        apiKeyInput.value = '';
        switchToSetup();
        showToast('API Key 已清除', 'success');
      }
    });

    // 初始化下拉刷新
    initPullToRefresh();
  }

  // --- 初始化 ---
  async function init() {
    bindEvents();

    // 检查本地存储的 API Key
    const savedKey = localStorage.getItem(STORAGE_KEY);

    if (savedKey) {
      state.apiKey = savedKey;
      apiKeyInput.value = savedKey;

      // 先显示加载状态
      showView('loading');

      try {
        await loadBalanceData();
        showView('dashboard');
      } catch (error) {
        // 加载失败，显示设置页
        showView('setup');
        showSetupError(error.message);
      }
    } else {
      // 没有保存的 Key，显示设置页
      showView('setup');
      apiKeyInput.focus();
    }
  }

  // --- 启动 ---
  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW 注册失败不影响主功能
      });
    });
  }

  // 启动应用
  document.addEventListener('DOMContentLoaded', init);

  // 定时更新最后更新时间（每分钟刷新显示）
  setInterval(() => {
    if (state.currentView === 'dashboard') {
      updateLastUpdated();
    }
  }, 30000);

})();
