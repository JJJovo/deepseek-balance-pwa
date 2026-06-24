/* ========================================
   DeepSeek Balance PWA - 核心逻辑 (v2)
   修复移动端触摸兼容性问题
   ======================================== */

(function () {
  'use strict';

  // --- 常量 ---
  const DEEPSEEK_API = 'https://api.deepseek.com/user/balance';
  const STORAGE_KEY = 'ds_api_key';

  // --- DOM 引用 ---
  const $ = function (sel) { return document.querySelector(sel); };

  // --- 日志（便于移动端调试） ---
  function log() {
    try { console.log('[DS Balance]', ...arguments); } catch(e) {}
  }

  // --- 状态 ---
  var state = {
    apiKey: '',
    balanceData: null,
    lastUpdated: null,
    isLoading: false,
    currentView: 'loading'
  };

  // --- DOM 元素（延迟获取，确保 DOM 已就绪） ---
  var els = {};

  function cacheDom() {
    els.views = {
      loading: $('#view-loading'),
      setup: $('#view-setup'),
      dashboard: $('#view-dashboard')
    };
    els.apiKeyInput = $('#api-key-input');
    els.togglePassword = $('#toggle-password');
    els.saveKeyBtn = $('#save-key-btn');
    els.setupError = $('#setup-error');
    els.clearKeyBtn = $('#clear-key-btn');
    els.pullIndicator = $('#pull-indicator');
    els.totalBalance = $('#total-balance');
    els.statusBadge = $('#status-badge');
    els.toppedUpBalance = $('#topped-up-balance');
    els.grantedBalance = $('#granted-balance');
    els.lastUpdated = $('#last-updated');
    els.refreshBtn = $('#refresh-btn');
    els.settingsBtn = $('#settings-btn');
    els.dashboardError = $('#dashboard-error');
    els.toast = $('#toast');
  }

  // --- 视图切换 ---
  function showView(viewName) {
    log('showView:', viewName);
    state.currentView = viewName;
    Object.keys(els.views).forEach(function(key) {
      var el = els.views[key];
      if (!el) return;
      if (key === viewName) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  // --- Toast ---
  var toastTimer = null;
  function showToast(message, type) {
    if (!els.toast) return;
    type = type || '';
    els.toast.textContent = message;
    els.toast.className = 'toast ' + type + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      els.toast.classList.remove('show');
    }, 2500);
  }

  // --- 格式化时间 ---
  function formatTime(date) {
    if (!date) return '--';
    var now = new Date();
    var diff = now - date;
    var seconds = Math.floor(diff / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);

    if (seconds < 10) return '刚刚';
    if (seconds < 60) return seconds + ' 秒前';
    if (minutes < 60) return minutes + ' 分钟前';
    if (hours < 24) return hours + ' 小时前';

    var month = date.getMonth() + 1;
    var day = date.getDate();
    var hour = ('0' + date.getHours()).slice(-2);
    var min = ('0' + date.getMinutes()).slice(-2);
    return month + '/' + day + ' ' + hour + ':' + min;
  }

  // --- API 调用 ---
  function fetchBalance(apiKey) {
    log('fetchBalance: calling API...');
    return fetch(DEEPSEEK_API, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      }
    }).then(function(response) {
      log('fetchBalance: response status', response.status);
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('API Key 无效，请检查后重新输入');
        }
        if (response.status === 429) {
          throw new Error('请求过于频繁，请稍后再试');
        }
        throw new Error('请求失败 (HTTP ' + response.status + ')，请检查网络连接');
      }
      return response.json();
    }).then(function(data) {
      log('fetchBalance: success', data);
      return data;
    });
  }

  // --- 按钮加载状态 ---
  function setButtonLoading(btn, loading) {
    if (loading) {
      btn.disabled = true;
      btn._text = btn.textContent;
      btn.innerHTML = '<span class="loading-spinner" style="width:18px;height:18px;border-width:2px;"></span>';
    } else {
      btn.disabled = false;
      btn.textContent = btn._text || '验证并保存';
    }
  }

  // --- 显示/隐藏错误 ---
  function showSetupError(message) {
    log('setupError:', message);
    if (els.setupError) {
      els.setupError.textContent = message;
      els.setupError.style.display = 'flex';
    }
  }

  function hideSetupError() {
    if (els.setupError) {
      els.setupError.style.display = 'none';
    }
  }

  function showDashboardError(message) {
    log('dashboardError:', message);
    if (els.dashboardError) {
      els.dashboardError.style.display = 'flex';
      var textEl = els.dashboardError.querySelector('.error-text');
      if (textEl) textEl.textContent = message;
    }
  }

  function hideDashboardError() {
    if (els.dashboardError) {
      els.dashboardError.style.display = 'none';
    }
  }

  // --- 验证并保存 API Key ---
  function validateAndSaveKey() {
    var apiKey = els.apiKeyInput.value.trim();

    if (!apiKey) {
      showSetupError('请输入 API Key');
      return;
    }

    if (apiKey.indexOf('sk-') !== 0) {
      showSetupError('API Key 格式不正确，应以 sk- 开头');
      return;
    }

    setButtonLoading(els.saveKeyBtn, true);
    hideSetupError();

    fetchBalance(apiKey).then(function() {
      // 验证成功，保存
      localStorage.setItem(STORAGE_KEY, apiKey);
      state.apiKey = apiKey;
      showToast('API Key 验证成功', 'success');
      // 加载余额并切换视图
      return loadBalanceData();
    }).then(function() {
      showView('dashboard');
    }).catch(function(error) {
      showSetupError(error.message);
    }).then(function() {
      // finally
      setButtonLoading(els.saveKeyBtn, false);
    });
  }

  // --- 加载余额 ---
  function loadBalanceData() {
    if (state.isLoading) return Promise.resolve();
    state.isLoading = true;

    return fetchBalance(state.apiKey).then(function(data) {
      state.balanceData = data;
      state.lastUpdated = new Date();
      renderBalance(data);
      hideDashboardError();
      log('loadBalanceData: success');
    }).catch(function(error) {
      log('loadBalanceData: error', error.message);
      if (error.message.indexOf('401') >= 0 || error.message.indexOf('无效') >= 0) {
        showToast('API Key 已失效，请重新设置', 'error');
        switchToSetup();
        return;
      }
      showDashboardError(error.message);
    }).then(function() {
      state.isLoading = false;
      updateLastUpdated();
      if (els.pullIndicator) {
        els.pullIndicator.classList.remove('active');
      }
    });
  }

  // --- 渲染余额 ---
  function renderBalance(data) {
    if (!data || !data.balance_infos || data.balance_infos.length === 0) {
      els.totalBalance.textContent = '--';
      els.toppedUpBalance.textContent = '--';
      els.grantedBalance.textContent = '--';
      return;
    }

    var info = data.balance_infos[0];

    els.totalBalance.textContent = formatNumber(info.total_balance);
    els.toppedUpBalance.textContent = formatNumber(info.topped_up_balance);
    els.grantedBalance.textContent = formatNumber(info.granted_balance);

    if (data.is_available) {
      els.statusBadge.className = 'balance-hero-status available';
      els.statusBadge.innerHTML = '<span class="status-dot green"></span> 可用';
    } else {
      els.statusBadge.className = 'balance-hero-status unavailable';
      els.statusBadge.innerHTML = '<span class="status-dot red"></span> 余额不足';
    }
  }

  function formatNumber(value) {
    if (value === undefined || value === null) return '--';
    var num = parseFloat(value);
    if (isNaN(num)) return '--';
    return num.toFixed(2);
  }

  function updateLastUpdated() {
    if (els.lastUpdated) {
      els.lastUpdated.textContent = '更新于 ' + formatTime(state.lastUpdated);
    }
  }

  // --- 切换设置页 ---
  function switchToSetup() {
    state.balanceData = null;
    state.lastUpdated = null;
    showView('setup');
    if (els.apiKeyInput) {
      els.apiKeyInput.value = state.apiKey;
    }
    hideSetupError();
  }

  // --- 刷新 ---
  function doRefresh() {
    if (state.isLoading) return;
    if (els.pullIndicator) {
      els.pullIndicator.classList.add('active');
      var textEl = els.pullIndicator.querySelector('.pull-text');
      if (textEl) textEl.textContent = '刷新中...';
    }
    loadBalanceData().then(function() {
      if (els.pullIndicator) {
        els.pullIndicator.classList.remove('active');
        var t = els.pullIndicator.querySelector('.pull-text');
        if (t) t.textContent = '下拉刷新';
      }
    });
  }

  // --- 下拉刷新（简化版，仅监听 dashboard 的 touch） ---
  var touchStartY = 0;
  var touchMoved = false;
  var refreshing = false;

  function setupPullToRefresh() {
    var container = document.querySelector('.app-container');
    if (!container) return;

    container.addEventListener('touchstart', function(e) {
      if (state.currentView !== 'dashboard') return;
      if (state.isLoading) return;
      if (window.scrollY > 5) return;
      touchStartY = e.touches[0].clientY;
      touchMoved = false;
    }, { passive: true });

    container.addEventListener('touchmove', function(e) {
      if (state.currentView !== 'dashboard') return;
      if (state.isLoading) return;
      if (window.scrollY > 5) return;

      var delta = e.touches[0].clientY - touchStartY;
      if (delta > 60) {
        touchMoved = true;
        if (els.pullIndicator) {
          els.pullIndicator.classList.add('active');
          var t = els.pullIndicator.querySelector('.pull-text');
          if (t) t.textContent = '松开刷新';
        }
      }
    }, { passive: true });

    container.addEventListener('touchend', function() {
      if (!touchMoved || refreshing || state.currentView !== 'dashboard') return;
      refreshing = true;
      if (els.pullIndicator) {
        var t = els.pullIndicator.querySelector('.pull-text');
        if (t) t.textContent = '刷新中...';
      }
      loadBalanceData().then(function() {
        refreshing = false;
        if (els.pullIndicator) {
          els.pullIndicator.classList.remove('active');
          var t = els.pullIndicator.querySelector('.pull-text');
          if (t) t.textContent = '下拉刷新';
        }
      });
    });
  }

  // --- 事件绑定 ---
  function bindEvents() {
    log('bindEvents: start');

    // 保存按钮
    if (els.saveKeyBtn) {
      els.saveKeyBtn.addEventListener('click', validateAndSaveKey);
      els.saveKeyBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        validateAndSaveKey();
      });
    }

    // 回车提交
    if (els.apiKeyInput) {
      els.apiKeyInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') validateAndSaveKey();
        hideSetupError();
      });
      els.apiKeyInput.addEventListener('input', hideSetupError);
    }

    // 显示/隐藏密码
    if (els.togglePassword) {
      els.togglePassword.addEventListener('click', function() {
        var isPassword = els.apiKeyInput.type === 'password';
        els.apiKeyInput.type = isPassword ? 'text' : 'password';
        els.togglePassword.textContent = isPassword ? '🙈' : '👁';
      });
      els.togglePassword.addEventListener('touchend', function(e) {
        e.preventDefault();
        var isPassword = els.apiKeyInput.type === 'password';
        els.apiKeyInput.type = isPassword ? 'text' : 'password';
        els.togglePassword.textContent = isPassword ? '🙈' : '👁';
      });
    }

    // 刷新按钮
    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', doRefresh);
    }

    // 设置按钮
    if (els.settingsBtn) {
      els.settingsBtn.addEventListener('click', function() {
        switchToSetup();
      });
    }

    // 清除 Key
    if (els.clearKeyBtn) {
      els.clearKeyBtn.addEventListener('click', function() {
        if (confirm('确定要清除已保存的 API Key 吗？')) {
          localStorage.removeItem(STORAGE_KEY);
          state.apiKey = '';
          if (els.apiKeyInput) els.apiKeyInput.value = '';
          switchToSetup();
          showToast('API Key 已清除', 'success');
        }
      });
    }

    // 下拉刷新
    setupPullToRefresh();

    log('bindEvents: done');
  }

  // --- 初始化 ---
  function init() {
    log('init: start');
    cacheDom();
    bindEvents();

    var savedKey = localStorage.getItem(STORAGE_KEY);

    if (savedKey) {
      log('init: found saved key');
      state.apiKey = savedKey;
      if (els.apiKeyInput) els.apiKeyInput.value = savedKey;

      showView('loading');

      loadBalanceData().then(function() {
        showView('dashboard');
      }).catch(function(error) {
        log('init: load failed', error.message);
        showView('setup');
        showSetupError(error.message);
      });
    } else {
      log('init: no saved key, showing setup');
      showView('setup');
      setTimeout(function() {
        if (els.apiKeyInput) els.apiKeyInput.focus();
      }, 300);
    }
  }

  // --- 启动 ---
  // Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('sw.js').catch(function(err) {
        log('SW registration failed:', err);
      });
    });
  }

  // DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 定时刷新"最后更新"显示
  setInterval(function() {
    if (state.currentView === 'dashboard') {
      updateLastUpdated();
    }
  }, 30000);

  log('app.js loaded');
})();
