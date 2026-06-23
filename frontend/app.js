/* ========================================
   Project Pulse - 前端主应用
   单文件 Vue 3 + Element Plus + ECharts
   ======================================== */

// ============ 全局错误处理 + 加载失败降级 ============
window.addEventListener('error', (event) => {
  console.error('[GlobalError]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[UnhandledRejection]', event.reason);
  if (event.reason && event.reason.message) {
    showFatalError('数据加载失败', event.reason.message);
  }
});
function showFatalError(title, detail) {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div class="app-error">
        <h1>⚠️ ${title}</h1>
        <p>${detail || '页面初始化失败，请刷新重试'}</p>
        <button onclick="location.reload()">刷新页面</button>
      </div>
    `;
  }
}
setTimeout(() => {
  // 10 秒后骨架屏还在 → 加载异常
  if (document.getElementById('app') && document.querySelector('.app-skeleton')) {
    console.warn('[Boot] 骨架屏超过 10s 未被替换');
  }
}, 10000);

try {

const { createApp, ref, reactive, onMounted, onBeforeUnmount, computed, watch, watchEffect, nextTick } = Vue;

const API_BASE = '';  // 同源部署,直接走相对路径
const DEMO_DATA = '/api/data';           // 优先使用后端 API
const DEMO_DATA_FALLBACK = '/data/demo_data.json';  // 后端不可用时 fallback (仅静态部署)

// 把握度配色映射
const CONFIDENCE_COLORS = {
  '已下单': '#059669',
  '保底': '#1d4ed8',
  '机会': '#d97706',
  '风险': '#dc2626',
  '关闭': '#6b7280',
};

// 数字格式化
const fmt = {
  amount: (v) => {
    if (v == null) return '0';
    const n = Number(v);
    if (n >= 10000) return (n / 10000).toFixed(2) + ' 亿';
    return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  },
  amountW: (v) => {
    if (v == null) return '0';
    const n = Number(v);
    return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  },
  count: (v) => (v == null ? '0' : Number(v).toLocaleString('zh-CN')),
  pct: (v) => (v == null ? '0%' : Number(v).toFixed(1) + '%'),
};

const app = createApp({
  setup() {
    // ============ URL 参数 + 下钻模式 ============
    const urlParams = new URLSearchParams(window.location.search);
    const isDrillMode = urlParams.get('drill') === '1';
    // 下钻模式下,从 URL 读取筛选参数 - 多选用逗号分隔
    const drillFilters = reactive({});
    if (isDrillMode) {
      for (const k of ['confidence', 'partner', 'po_ho', 'industry', 'predict_month', 'deployment_mode']) {
        const v = urlParams.get(k);
        if (v) drillFilters[k] = v.split(',');
      }
      const kw = urlParams.get('keyword');
      if (kw) drillFilters.keyword = kw;
    }

    // ============ 状态 ============
    const loading = ref(false);
    const activeTab = ref('overview');

    // 静态演示数据
    const DEMO = ref(null);  // 使用 ref 让 computed 能跟踪 DEMO 的变化

    // KPI
    const kpi = ref({});

    // 各维度数据
    const dimConfidence = ref({ buckets: [], total_count: 0, total_amount: 0 });
    const dimTime = ref({ buckets: [], total_count: 0, total_amount: 0 });
    const dimPartner = ref({ buckets: [], total_count: 0, total_amount: 0 });
    const dimPoHo = ref({ buckets: [], total_count: 0, total_amount: 0 });
    const dimIndustry = ref({ buckets: [], total_count: 0, total_amount: 0 });
    const dimDeployment = ref({ buckets: [], total_count: 0, total_amount: 0 });

    // 筛选条件
    // 筛选状态 - 所有值都存为数组(多选)。空数组表示未筛选
    const filters = reactive({
      confidence: [],       // 数组(多选)
      partner: [],          // 数组(多选)
      po_ho: [],            // 数组(多选)
      owner: [],            // 人员(多选)
      deployment_mode: [],  // 部署方式(多选)
      predict_month: [],    // 预测月份(多选)
      keyword: '',
    });

    // ============ 明细表列筛选 + 排序状态 ============
    const showTableFilters = ref(true);  // 列筛选行默认展开
    const tableFilters = reactive({
      project_no: [], opportunity_name: [], customer: [], owner: [],
      partner: [], industry: [], track: [], deployment_mode: [], stage: [],
      confidence: [], po_ho: [], predict_month: [],
    });  // 每列筛选值(数组:多选值;空数组+无其他key:未筛选)
    const sortField = ref('');          // 当前排序列
    const sortOrder = ref('');          // 'ascending' / 'descending' / ''

    // 列定义 - 统一管理项目明细表列名(用于动态筛选、排序、显示)
    const TABLE_COLUMNS = [
      { key: 'project_no', label: '项目编号', type: 'string' },
      { key: 'opportunity_name', label: '机会点名称', type: 'string' },
      { key: 'customer', label: '客户', type: 'string' },
      { key: 'owner', label: '人员', type: 'string' },
      { key: 'partner', label: '伙伴', type: 'string' },
      { key: 'industry', label: '行业', type: 'string' },
      { key: 'track', label: '赛道', type: 'string' },
      { key: 'deployment_mode', label: '部署方式', type: 'string' },
      { key: 'confidence', label: '把握度', type: 'string' },
      { key: 'po_ho', label: 'PO/HO', type: 'string' },
      { key: 'predict_month', label: '下单月', type: 'string' },
      { key: 'stage', label: '项目阶段', type: 'string' },
      { key: 'software_budget', label: '软件预算', type: 'number' },
      { key: 'cloud_budget', label: '云资源', type: 'number' },
      { key: 'scale_amount', label: '总规模', type: 'number' },
    ];

    // 筛选选项(下拉字典)
    const filterOptions = ref({});

    // 项目明细
    const projectList = ref({ items: [], total: 0, page: 1, page_size: 50 });

    // ECharts 实例 - 使用函数 ref避免 Vue 覆盖 ref 对象
    const chartRefs = {
      confidence: null,
      time: null,
      partner: null,
      poHo: null,
    };
    const chartInstances = {};

    // 上传相关
    const uploadVisible = ref(false);
    const uploadRef = ref(null);
    const uploadStatus = ref('idle');  // idle | uploading | success | error
    const uploadProgress = ref(0);
    const uploadStatusText = ref('');
    const lastImportResult = ref(null);
    const recentBatches = ref([]);

    // ============ 版本号 ============
    const appBuild = '20260623-2';  // 变更后需重打包, bust 浏览器缓存

    // ============ 云端同步状态 ============
    const syncStatus = ref({
      last_run_at: null, last_result: 'never', last_message: '',
      last_inserted: 0, last_duration_ms: 0, next_run_at: null,
      is_running: false, last_etag: null, last_modified: null,
      history: [], config: { url: '', time: '08:30', enabled: true },
    });
    const syncConfigVisible = ref(false);
    const syncConfigForm = reactive({
      time: '08:30', enabled: true,
      transit_url: '', transit_strategy: 'auto', transit_selector: '', transit_cookie: '',
    });
    const syncTick = ref(0);  // 强制刷新计算属性
    const syncTestResult = ref(null);  // { success, message, ... }
    const syncTestLoading = ref(false);

    const loadSyncStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sync/status`);
        if (res.ok) syncStatus.value = await res.json();
      } catch (e) {
        console.warn('[Sync] 状态加载失败:', e.message);
      }
    };
    const manualSyncNow = async (force = false) => {
      if (syncStatus.value.is_running) {
        ElementPlus.ElMessage.warning('已有同步任务进行中');
        return;
      }
      ElementPlus.ElMessage.info(force ? '强制同步中...' : '同步中...');
      try {
        const res = await fetch(`${API_BASE}/api/sync/trigger?force=${force}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          if (data.skipped) {
            ElementPlus.ElMessage.success(data.message);
          } else {
            // 展示示例行 - 让用户看到实际导入的是什么
            if (data.sample && data.sample.project_no) {
              const s = data.sample;
              ElementPlus.ElMessageBox.alert(
                `<div style="font-size:13px;line-height:1.7;">
                  <b>同步成功 · 示例数据 (1/共 ${data.inserted} 条):</b><br>
                  <hr>
                  <b>项目编号:</b> ${s.project_no || '—'}<br>
                  <b>机会名称:</b> ${s.opportunity_name || '—'}<br>
                  <b>客户:</b> ${s.customer || '—'}<br>
                  <b>负责人:</b> ${s.owner || '—'}<br>
                  <b>行业:</b> ${s.industry || '—'}<br>
                  <b>赛道:</b> ${s.track || '—'}<br>
                  <b>把握度:</b> ${s.confidence || '—'}<br>
                  <b>预测月份:</b> ${s.predict_month || '—'}<br>
                  <b>软件预算:</b> ${s.software_budget || 0} 万<br>
                  <b>云预算:</b> ${s.cloud_budget || 0} 万
                  <hr>
                  <i style="color:#6b7280;">如果以上都是空/None,说明中转页下载的 Excel 列名跟 field_mapping.yaml 不匹配</i>
                </div>`,
                '导入完成',
                { dangerouslyUseHTMLString: true, confirmButtonText: '确认' }
              ).catch(() => {});
            } else {
              ElementPlus.ElMessage.success(data.message || `同步 ${data.inserted || 0} 条`);
            }
            // 刷新看板数据
            await loadAll(true);
            await loadRecentBatches();
          }
        } else {
          ElementPlus.ElMessage.error(data.message || '同步失败');
        }
        await loadSyncStatus();
      } catch (e) {
        ElementPlus.ElMessage.error('同步失败: ' + e.message);
      }
    };
    const openSyncConfig = async () => {
      const cfg = syncStatus.value.config || {};
      syncConfigForm.time = cfg.time || '08:30';
      syncConfigForm.enabled = cfg.enabled ?? true;
      syncConfigForm.transit_url = cfg.transit_url || '';
      syncConfigForm.transit_strategy = cfg.transit_strategy || 'auto';
      syncConfigForm.transit_selector = cfg.transit_selector || '';
      syncConfigForm.transit_cookie = '';
      syncTestResult.value = null;
      syncConfigVisible.value = true;
    };
    const saveSyncConfig = async () => {
      try {
        const payload = {
          ...syncConfigForm,
          transit_enabled: true,  // 唯一模式:中转页
        };
        const res = await fetch(`${API_BASE}/api/sync/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          ElementPlus.ElMessage.success(data.message || '配置已保存');
          syncConfigVisible.value = false;
          await loadSyncStatus();
        } else {
          ElementPlus.ElMessage.error(data.message || '保存失败');
        }
      } catch (e) {
        ElementPlus.ElMessage.error('保存失败: ' + e.message);
      }
    };
    const inspectSyncColumns = async () => {
      if (!syncConfigForm.transit_url) {
        ElementPlus.ElMessage.warning('请先填写中转页 URL');
        return;
      }
      syncTestLoading.value = true;
      try {
        const payload = { ...syncConfigForm, transit_enabled: true };
        const res = await fetch(`${API_BASE}/api/sync/inspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        syncTestResult.value = data;
        if (data.success) {
          ElementPlus.ElMessageBox.alert(
            `<div style="font-size:13px;line-height:1.6;">
              <b>总行数:</b> ${data.total_rows}<br>
              <b>总列数:</b> ${data.excel_columns.length}<br>
              <b>文件大小:</b> ${(data.size/1024).toFixed(1)} KB<br>
              <hr>
              <b style="color:#16a34a;">✅ 匹配上的列 (${data.matched_columns.length}):</b><br>
              ${data.matched_columns.slice(0,15).map(c => '• ' + c).join('<br>')}
              ${data.matched_columns.length > 15 ? '<br>...还有 ' + (data.matched_columns.length-15) + ' 个' : ''}
              ${data.unmatched_columns.length > 0 ? `<br><br><b style="color:#dc2626;">⚠️ 未匹配的列 (${data.unmatched_columns.length}):</b><br>` + data.unmatched_columns.slice(0,20).map(c => '• ' + c).join('<br>') : '<br><b style="color:#16a34a;">🎉 所有列都匹配上 field_mapping.yaml 了</b>'}
              <hr>
              <b>第一行示例:</b><br>
              <code style="font-size:11px;">${data.sample_row.slice(0,8).join(' | ')}</code>
              <hr>
              <i>${data.hint}</i>
            </div>`,
            'Excel 列名诊断',
            { dangerouslyUseHTMLString: true, confirmButtonText: '知道了' }
          );
        } else {
          syncTestResult.value = { success: false, message: data.message };
          ElementPlus.ElMessage.error(data.message);
        }
      } catch (e) {
        ElementPlus.ElMessage.error('诊断失败: ' + e.message);
      } finally {
        syncTestLoading.value = false;
      }
    };

    const testSyncConnection = async () => {
      if (!syncConfigForm.transit_url) {
        ElementPlus.ElMessage.warning('请先填写中转页 URL');
        return;
      }
      syncTestLoading.value = true;
      syncTestResult.value = null;
      try {
        const payload = {
          ...syncConfigForm,
          transit_enabled: true,
        };
        const res = await fetch(`${API_BASE}/api/sync/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        syncTestResult.value = data;
        if (data.success) {
          ElementPlus.ElMessage.success(data.message);
        } else {
          ElementPlus.ElMessage.warning(data.message);
        }
      } catch (e) {
        syncTestResult.value = { success: false, message: '测试请求失败: ' + e.message };
        ElementPlus.ElMessage.error(syncTestResult.value.message);
      } finally {
        syncTestLoading.value = false;
      }
    };
    // 同步配置按钮的小字（显示最近同步时间 + 状态）
    const syncBtnSubtitle = computed(() => {
      void syncTick.value;
      const s = syncStatus.value;
      if (s.is_running) return '正在同步...';
      if (!s.config?.url) return '未配置 · 点此设置';
      if (s.last_result === 'never') return '未运行';
      const time = formatSyncTime(s.last_run_at);
      if (s.last_result === 'success') return `已同步 ${time}`;
      if (s.last_result === 'failed') return `失败 ${time}`;
      if (s.last_result === 'skipped') return `未变 ${time}`;
      return time;
    });
    const syncStatusDotType = computed(() => {
      const s = syncStatus.value;
      if (s.is_running) return 'primary';
      if (!s.config?.url) return 'info';
      if (s.last_result === 'failed') return 'danger';
      if (s.last_result === 'success') return 'success';
      return 'info';
    });
    const syncTooltip = computed(() => {
      const s = syncStatus.value;
      if (s.is_running) return '云端同步进行中...';
      if (!s.config?.url) return '未配置云端地址,点此设置';
      const lines = [];
      lines.push(`地址: ${s.config.url}`);
      lines.push(`定时: 每日 ${s.config.time}`);
      if (s.next_run_at) lines.push(`下次: ${formatSyncTime(s.next_run_at)}`);
      if (s.last_run_at) {
        lines.push(`上次: ${formatSyncTime(s.last_run_at)} · ${s.last_message || s.last_result}`);
      }
      return lines.join('\n');
    });
    const formatSyncRelative = (iso) => {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        const now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 0) return '即将';
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
        return Math.floor(diff / 86400) + '天前';
      } catch { return ''; }
    };
    const formatSyncTime = (iso) => {
      if (!iso) return '-';
      try {
        return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch { return '-'; }
    };

    // 加载最近导入记录
    const loadRecentBatches = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/batches`);
        if (res.ok) {
          const data = await res.json();
          recentBatches.value = data.batches || data || [];
        }
      } catch (e) {
        console.warn('[Batches] 加载失败:', e.message);
      }
    };
    const formatBatchTime = (iso) => {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        const now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
        return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch { return ''; }
    };

    // ============ 数据加载 ============
    // API 模式:优先用后端，失败 fallback 到静态文件
    const loadAll = async (forceRefresh = false) => {
      loading.value = true;
      try {
        // localStorage 缓存仅在 forceRefresh=false 时生效
        const CACHE_KEY = 'project_pulse_data_v1';
        if (!forceRefresh) {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed && parsed.projects) {
                DEMO.value = parsed;
                console.info('[Data] 使用本地缓存');
              }
            } catch (e) {
              localStorage.removeItem(CACHE_KEY);
            }
          }
        }
        if (!DEMO.value || !DEMO.value.projects || forceRefresh) {
          // 先试后端 API - 加 cache: no-store + 时间戳 · 强制跳过浏览器缓存
          const cacheBuster = forceRefresh ? `?_=${Date.now()}_${Math.random().toString(36).slice(2,8)}` : '';
          let res = await fetch(DEMO_DATA + cacheBuster, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
          });
          if (!res.ok) {
            // 后端不可用 → fallback 到静态数据
            console.info('[Data] 后端不可用,使用静态数据');
            res = await fetch(DEMO_DATA_FALLBACK + cacheBuster, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          }
          const newData = await res.json();
          if (newData && newData.projects) {
            // 重要: 创建新对象,确保 Vue 响应式系统能检测到变化
            DEMO.value = JSON.parse(JSON.stringify(newData));
            console.info(`[Data] 从后端加载 ${newData.projects.length} 条数据`);
          } else {
            console.warn('[Data] 后端返回数据格式错误,无 projects 字段');
          }
          // 缓存到 localStorage (forceRefresh=true 时也更新缓存)
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(DEMO.value));
          } catch (e) {
            console.warn('[Cache] 存储失败:', e.message);
          }
        }

        // 下钻模式:把 URL 参数合并到 filters(已是数组形式)
        if (isDrillMode) {
          for (const [k, v] of Object.entries(drillFilters)) {
            if (filters[k] !== undefined) filters[k] = v;
          }
        }

        loadOptions();
        refreshDashboard();
        loadProjects();

        await nextTick();
        renderAllCharts();
      } catch (e) {
        console.error('加载失败', e);
        ElementPlus.ElMessage.error('数据加载失败: ' + e.message);
        showFatalError('数据加载失败', e.message);
      } finally {
        loading.value = false;
      }
    };

    const loadOptions = () => {
      filterOptions.value = DEMO.value.options;
    };

    // ============ 统一筛选逻辑 - KPI / 图表 / 明细表 都用 filteredProjects ============
    const filteredProjects = computed(() => {
      if (!DEMO.value || !DEMO.value.projects) return [];
      let items = DEMO.value.projects.slice();
      // 多选筛选 - 数组(空数组表示未选,不过滤)
      if (filters.confidence && filters.confidence.length > 0) items = items.filter(p => filters.confidence.includes(p.confidence));
      if (filters.partner && filters.partner.length > 0) items = items.filter(p => filters.partner.includes(p.partner));
      if (filters.po_ho && filters.po_ho.length > 0) items = items.filter(p => filters.po_ho.includes(p.po_ho));
      if (filters.owner && filters.owner.length > 0) items = items.filter(p => filters.owner.includes(p.owner));
      if (filters.deployment_mode && filters.deployment_mode.length > 0) items = items.filter(p => filters.deployment_mode.includes(p.deployment_mode));
      if (filters.predict_month && filters.predict_month.length > 0) items = items.filter(p => filters.predict_month.includes(p.predict_month));
      // 关键词
      if (filters.keyword) {
        const k = filters.keyword.toLowerCase();
        items = items.filter(p =>
          (p.opportunity_name || '').toLowerCase().includes(k) ||
          (p.customer || '').toLowerCase().includes(k) ||
          (p.project_no || '').toLowerCase().includes(k)
        );
      }
      return items;
    });

    // 每列可用的筛选选项(从筛选后的数据中提取 distinct)
    const columnFilterOptions = computed(() => {
      const opts = {};
      const items = filteredProjects.value;
      for (const col of TABLE_COLUMNS) {
        const set = new Set();
        for (const p of items) {
          const v = p[col.key];
          if (v !== undefined && v !== null && v !== '') set.add(v);
        }
        // 按业务排序:把握度/PO/HO 等用业务顺序,其他按值排序
        let arr = Array.from(set);
        if (col.key === 'confidence') {
          const order = ['已下单', '保底', '机会', '风险', '关闭'];
          arr.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        } else if (col.key === 'po_ho') {
          const order = ['PO', 'HO'];
          arr.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        } else if (col.type === 'number') {
          arr.sort((a, b) => Number(a) - Number(b));
        } else {
          arr.sort();
        }
        opts[col.key] = arr.map(v => ({ text: String(v), value: v }));
      }
      return opts;
    });

    // 最终展示在明细表里的数据(应用列筛选 + 排序)
    const tableRef = ref(null);

    const displayedProjects = computed(() => {
      let items = filteredProjects.value;
      // 列筛选
      for (const [col, values] of Object.entries(tableFilters)) {
        if (values && values.length > 0) {
          items = items.filter(p => values.includes(p[col]));
        }
      }
      // 排序
      if (sortField.value && sortOrder.value) {
        const f = sortField.value;
        const dir = sortOrder.value === 'ascending' ? 1 : -1;
        items = items.slice().sort((a, b) => {
          const va = a[f], vb = b[f];
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
          return String(va).localeCompare(String(vb), 'zh-CN') * dir;
        });
      }
      return items;
    });

    const computeKpi = (projects) => {
      let totalSoftware = 0, totalCloud = 0;
      for (const p of projects) {
        totalSoftware += (p.software_budget || 0);
        totalCloud += (p.cloud_budget || 0);
      }
      const totalAmount = totalSoftware + totalCloud;
      return {
        total_projects: projects.length,
        total_amount: Math.round(totalAmount * 100) / 100,
        total_software: Math.round(totalSoftware * 100) / 100,
        total_cloud: Math.round(totalCloud * 100) / 100,
      };
    };

    const computeDimByField = (projects, field) => {
      const map = {};
      for (const p of projects) {
        const k = p[field] || '(空)';
        if (!map[k]) map[k] = { count: 0, amount: 0, software: 0, cloud: 0 };
        map[k].count += 1;
        map[k].amount += (p.scale_amount || 0);
        map[k].software += (p.software_budget || 0);
        map[k].cloud += (p.cloud_budget || 0);
      }
      return Object.keys(map).map(k => ({
        key: k,
        count: map[k].count,
        amount: Math.round(map[k].amount * 100) / 100,
        software: Math.round(map[k].software * 100) / 100,
        cloud: Math.round(map[k].cloud * 100) / 100,
        avg_amount: map[k].count > 0 ? Math.round((map[k].amount / map[k].count) * 100) / 100 : 0,
      }));
    };

    const computeDimByMonth = (projects) => {
      const monthMap = {};
      for (const p of projects) {
        const m = p.predict_month;
        if (!m) continue;
        if (!monthMap[m]) monthMap[m] = { count: 0, amount: 0 };
        monthMap[m].count += 1;
        monthMap[m].amount += (p.scale_amount || 0);
      }
      return Object.keys(monthMap).sort().map(m => ({
        key: m,
        count: monthMap[m].count,
        amount: Math.round(monthMap[m].amount * 100) / 100,
        avg_amount: monthMap[m].count > 0 ? Math.round((monthMap[m].amount / monthMap[m].count) * 100) / 100 : 0,
      }));
    };

    // 部署方式中最大占比
    const topDeployment = computed(() => {
      const buckets = dimDeployment.value?.buckets || [];
      if (buckets.length === 0) return { key: '—', pct: 0 };
      const sorted = [...buckets].sort((a, b) => b.amount - a.amount);
      const top = sorted[0];
      const total = buckets.reduce((s, b) => s + b.amount, 0);
      const pct = total > 0 ? Math.round((top.amount / total) * 1000) / 10 : 0;
      return { key: top.key, pct };
    });

    // 同步刷新所有看板数据
    const refreshDashboard = () => {
      const items = filteredProjects.value;
      kpi.value = computeKpi(items);
      dimConfidence.value = {
        buckets: computeDimByField(items, 'confidence'),
        total_count: items.length,
        total_amount: kpi.value.total_amount,
      };
      dimTime.value = {
        buckets: computeDimByMonth(items),
        total_count: items.length,
        total_amount: kpi.value.total_amount,
      };
      dimPartner.value = {
        buckets: computeDimByField(items, 'partner'),
        total_count: items.length,
        total_amount: kpi.value.total_amount,
      };
      dimPoHo.value = {
        buckets: computeDimByField(items, 'po_ho'),
        total_count: items.length,
        total_amount: kpi.value.total_amount,
      };
      // 部署方式(新增)
      dimDeployment.value = {
        buckets: computeDimByField(items, 'deployment_mode'),
        total_count: items.length,
        total_amount: kpi.value.total_amount,
      };
    };

    // 筛选变化时同步刷新看板与明细表
    const onFilterChange = () => {
      // 筛选项变化时直接刷新，不依赖 watchEffect（避免 Vue 响应式追踪多选数组变更的边界情况）
      refreshDashboard();
      loadProjects(1);
      nextTick(() => renderAllCharts());
    };

    const loadProjects = (page = 1) => {
      const items = displayedProjects.value;
      projectList.value = {
        items: items.slice((page - 1) * 20, page * 20),
        total: items.length,
        page: page,
        page_size: 20,
      };
    };

    // 顶栏有效筛选数(数组非空 / 关键词非空)
    const activeFilterCount = computed(() => {
      let n = 0;
      for (const [k, v] of Object.entries(filters)) {
        if (Array.isArray(v) && v.length > 0) n += 1;
        else if (typeof v === 'string' && v.trim() !== '') n += 1;
      }
      return n;
    });

    // 列筛选有效数量(数组非空,或首元素为非空字符串)
    const activeColumnFilterCount = computed(() => {
      let n = 0;
      for (const [k, v] of Object.entries(tableFilters)) {
        if (Array.isArray(v)) {
          if (v.length > 0 && (typeof v[0] !== 'string' || v[0].trim() !== '')) n += 1;
        } else if (v && typeof v === 'string' && v.trim() !== '') {
          n += 1;
        }
      }
      return n;
    });

    const onTableFilterChange = (filtersObj) => {
      // filtersObj: { colKey: [values] } 或 { colKey: string }
      if (filtersObj) {
        for (const [k, v] of Object.entries(filtersObj)) {
          if (Array.isArray(v)) {
            // 清理空字符串，只保留有效值
            tableFilters[k] = v.filter(val => typeof val !== 'string' || val.trim() !== '');
          } else if (typeof v === 'string' && v.trim()) {
            tableFilters[k] = [v.trim()];
          } else {
            tableFilters[k] = [];
          }
        }
      }
      loadProjects(1);
    };

    // 排序变化
    const onTableSortChange = ({ prop, order }) => {
      sortField.value = prop || '';
      sortOrder.value = order || '';
      loadProjects(1);
    };

    // 清空列筛选 + 排序
    const clearTableState = () => {
      for (const k of Object.keys(tableFilters)) tableFilters[k] = [];
      sortField.value = '';
      sortOrder.value = '';
      loadProjects(1);
    };

    // ============ 图表渲染 ============
    const baseChartOption = () => ({
      backgroundColor: 'transparent',
      textStyle: { color: '#1f2937', fontFamily: 'inherit' },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#1f2937' },
        extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08);',
        axisPointer: { type: 'shadow', lineStyle: { color: '#d1d5db' } },
      },
      legend: {
        textStyle: { color: '#6b7280' },
        top: 0,
        right: 0,
      },
      grid: { left: 50, right: 20, top: 40, bottom: 30 },
    });

    const renderConfidenceChart = () => {
      const el = chartRefs.confidence;
      if (!el) return;
      const chart = echarts.init(el);
      chartInstances.confidence = chart;

      const data = dimConfidence.value.buckets || [];

      chart.setOption({
        ...baseChartOption(),
        tooltip: {
          ...baseChartOption().tooltip,
          formatter: (params) => {
            return `<b>${params.name}</b><br/>金额: <b>${fmt.amount(params.value)}</b> 万<br/>项目数: ${params.data.count}<br/>占比: ${params.percent}%<br/><span style="color:#C7000B;">👉 点击查看明细</span>`;
          },
        },
        legend: {
          orient: 'vertical',
          right: 16,
          top: 'center',
          textStyle: { color: '#1f2937', fontSize: 13 },
          itemWidth: 14,
          itemHeight: 14,
        },
        color: ['#059669', '#1d4ed8', '#d97706', '#dc2626', '#6b7280'],
        series: [{
          name: '把握度分布',
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['38%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#ffffff', borderWidth: 3 },
          label: {
            show: true,
            position: 'outside',
            color: '#1f2937',
            formatter: '{b}\n{d}%',
            fontSize: 12,
            fontWeight: 600,
          },
          labelLine: { lineStyle: { color: '#d1d5db' } },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(199, 0, 11, 0.3)' },
            label: { fontSize: 14, fontWeight: 700 },
          },
          data: data.map(d => ({
            name: d.key,
            value: d.amount,
            count: d.count,
            itemStyle: { color: CONFIDENCE_COLORS[d.key] || '#C7000B' },
          })),
        }],
      });

      chart.on('click', (params) => {
        if (params.componentType === 'series') {
          filters.confidence = params.name;
          loadProjects(1);
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
      });
    };

    const renderTimeChart = () => {
      const el = chartRefs.time;
      if (!el) return;
      const chart = echarts.init(el);
      chartInstances.time = chart;

      // 从原始项目数据按月份聚合软件预算与云资源
      const projects = DEMO.value?.projects || [];
      const monthMap = {};
      for (const p of projects) {
        const m = p.predict_month;
        if (!m) continue;
        if (!monthMap[m]) monthMap[m] = { software: 0, cloud: 0 };
        monthMap[m].software += (p.software_budget || 0);
        monthMap[m].cloud += (p.cloud_budget || 0);
      }
      const data = Object.keys(monthMap).sort().map(m => ({
        key: m,
        software: Math.round(monthMap[m].software * 100) / 100,
        cloud: Math.round(monthMap[m].cloud * 100) / 100,
      }));

      chart.setOption({
        ...baseChartOption(),
        tooltip: {
          ...baseChartOption().tooltip,
          trigger: 'axis',
          axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(199, 0, 11, 0.05)' } },
          formatter: (params) => {
            const total = params.reduce((s, p) => s + (p.value || 0), 0);
            const items = params.map(p => `${p.marker} ${p.seriesName}: <b>${fmt.amount(p.value)}</b> 万`).join('<br/>');
            return `<b>${params[0].axisValue}</b><br/>${items}<br/>总计: <b style="color:#C7000B;">${fmt.amount(total)}</b> 万`;
          },
        },
        legend: { data: ['软件预算', '云资源'], textStyle: { color: '#6b7280' }, top: 0, right: 0, itemGap: 24 },
        xAxis: {
          type: 'category',
          data: data.map(d => d.key),
          axisLine: { lineStyle: { color: '#d1d5db' } },
          axisLabel: { color: '#6b7280' },
        },
        yAxis: {
          type: 'value',
          name: '万元',
          nameTextStyle: { color: '#9ca3af' },
          axisLine: { lineStyle: { color: '#d1d5db' } },
          axisLabel: { color: '#6b7280', formatter: (v) => v >= 1000 ? (v / 1000) + 'k' : v },
          splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
        },
        series: [
          {
            name: '软件预算',
            type: 'bar',
            stack: 'total',
            data: data.map(d => d.software),
            itemStyle: { color: '#C7000B', borderRadius: [0, 0, 0, 0] },
            barWidth: '55%',
          },
          {
            name: '云资源',
            type: 'bar',
            stack: 'total',
            data: data.map(d => d.cloud),
            itemStyle: { color: '#1d4ed8', borderRadius: [4, 4, 0, 0] },
          },
        ],
      });
    };

    const renderPartnerChart = () => {
      const el = chartRefs.partner;
      if (!el) return;
      const chart = echarts.init(el);
      chartInstances.partner = chart;

      const data = (dimPartner.value.buckets || []).slice(0, 10);

      chart.setOption({
        ...baseChartOption(),
        tooltip: {
          ...baseChartOption().tooltip,
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const i = params[0].dataIndex;
            return `<b>${params[0].name}</b><br/>项目数: <b>${data[i].count}</b> 个<br/>软件: <b>${fmt.amountW(data[i].software)}</b> 万<br/>云资源: <b>${fmt.amountW(data[i].cloud)}</b> 万<br/>总规模: <b style="color:#C7000B;">${fmt.amount(data[i].amount)}</b>`;
          },
        },
        grid: { left: 100, right: 30, top: 30, bottom: 50 },
        xAxis: {
          type: 'category',
          data: data.map(d => d.key),
          axisLine: { lineStyle: { color: '#d1d5db' } },
          axisLabel: { color: '#6b7280', interval: 0, rotate: data.length > 5 ? 30 : 0 },
        },
        yAxis: [
          {
            type: 'value',
            name: '项目数',
            nameTextStyle: { color: '#6b7280', fontSize: 11 },
            axisLine: { lineStyle: { color: '#d1d5db' } },
            axisLabel: { color: '#6b7280' },
            splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
          },
        ],
        series: [
          {
            name: '伙伴贡献项目数',
            type: 'bar',
            data: data.map(d => d.count),
            itemStyle: {
              color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
                { offset: 0, color: '#FF4D4F' }, { offset: 1, color: '#C7000B' }
              ]},
              borderRadius: [4, 4, 0, 0],
            },
            barWidth: '50%',
            label: {
              show: true, position: 'top', color: '#C7000B', fontSize: 11, fontWeight: 600,
              formatter: (p) => p.value,
            },
          },
        ],
      });
    };

    const renderPoHoChart = () => {
      const el = chartRefs.poHo;
      if (!el) return;
      const chart = echarts.init(el);
      chartInstances.poHo = chart;

      const data = dimPoHo.value.buckets || [];
      const po = data.find(d => d.key === 'PO') || { count: 0, amount: 0 };
      const ho = data.find(d => d.key === 'HO') || { count: 0, amount: 0 };

      chart.setOption({
        ...baseChartOption(),
        tooltip: {
          ...baseChartOption().tooltip,
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            return params.map(p => `${p.marker} ${p.seriesName}<br/>&nbsp;&nbsp;<b>${fmt.amount(p.value)}</b> 万`).join('<br/>');
          },
        },
        legend: { data: ['项目数(个)', '金额(万)'], textStyle: { color: '#6b7280' }, top: 0, right: 0, itemGap: 24 },
        grid: { left: 50, right: 30, top: 50, bottom: 30 },
        xAxis: {
          type: 'category',
          data: ['PO', 'HO'],
          axisLine: { lineStyle: { color: '#d1d5db' } },
          axisLabel: { color: '#1f2937', fontSize: 14, fontWeight: 600 },
        },
        yAxis: [
          {
            type: 'value',
            name: '金额(万)',
            position: 'left',
            axisLine: { lineStyle: { color: '#d1d5db' } },
            axisLabel: { color: '#6b7280', formatter: (v) => v >= 1000 ? (v / 1000) + 'k' : v },
            splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
          },
          {
            type: 'value',
            name: '项目数',
            position: 'right',
            axisLine: { lineStyle: { color: '#d1d5db' } },
            axisLabel: { color: '#6b7280' },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: '金额(万)',
            type: 'bar',
            data: [
              { value: po.amount, itemStyle: { color: '#C7000B', borderRadius: [4, 4, 0, 0] } },
              { value: ho.amount, itemStyle: { color: '#FF4D4F', borderRadius: [4, 4, 0, 0] } },
            ],
            barWidth: '32%',
            label: {
              show: true,
              position: 'top',
              color: '#1f2937',
              fontWeight: 600,
              formatter: (p) => fmt.amountW(p.value),
            },
          },
          {
            name: '项目数(个)',
            type: 'bar',
            yAxisIndex: 1,
            data: [
              { value: po.count, itemStyle: { color: 'rgba(199, 0, 11, 0.25)', borderRadius: [4, 4, 0, 0] } },
              { value: ho.count, itemStyle: { color: 'rgba(255, 77, 79, 0.25)', borderRadius: [4, 4, 0, 0] } },
            ],
            barWidth: '32%',
            label: {
              show: true,
              position: 'top',
              color: '#6b7280',
              fontSize: 11,
              formatter: '{c}个',
            },
          },
        ],
      });

      chart.on('click', (params) => {
        if (params.componentType === 'series' && (params.name === 'PO' || params.name === 'HO')) {
          ElementPlus.ElNotification({
            title: '🚀 正在打开下钻窗口',
            message: `下钻: po_ho = ${params.name}`,
            type: 'success',
            duration: 1500,
          });
          const search = new URLSearchParams();
          search.set('drill', '1');
          for (const [k, v] of Object.entries(filters)) {
            if (Array.isArray(v) && v.length > 0) search.set(k, v.join(','));
            else if (v && !Array.isArray(v)) search.set(k, v);
          }
          search.set('po_ho', params.name);
          const url = `${window.location.pathname}?${search.toString()}`;
          window.open(url, '_blank');
        }
      });
    };

    const renderAllCharts = () => {
      renderConfidenceChart();
      renderTimeChart();
      renderPartnerChart();
      renderPoHoChart();

      // 下钻交互 - 点击图表柱子 -> 新窗口打开下钻详情页
      const openDrillWindow = (extraFilters) => {
        const url = new URL(window.location.href);
        const search = new URLSearchParams();
        search.set('drill', '1');
        // 多选筛选 - 数组转逗号分隔字符串
        const isArrayField = (k) => ['confidence', 'partner', 'po_ho', 'industry', 'predict_month', 'deployment_mode'].includes(k);
        for (const [k, v] of Object.entries(filters)) {
          if (Array.isArray(v) && v.length > 0) search.set(k, v.join(','));
          else if (v && !Array.isArray(v)) search.set(k, v);
        }
        for (const [k, v] of Object.entries(extraFilters)) {
          if (Array.isArray(v) && v.length > 0) search.set(k, v.join(','));
          else if (v && !Array.isArray(v)) search.set(k, v);
        }
        const baseUrl = url.pathname;
        const fullUrl = `${baseUrl}?${search.toString()}`;
        window.open(fullUrl, '_blank');
      };

      const drill = (chart, dimKey) => {
        if (!chart) return;
        chart.off('click');
        chart.on('click', (params) => {
          if (params.componentType !== 'series') return;
          const name = params.name;
          if (!name) return;
          ElementPlus.ElNotification({
            title: '🚀 正在打开下钻窗口',
            message: `下钻: ${dimKey} = ${name}`,
            type: 'success',
            duration: 1500,
          });
          openDrillWindow({ [dimKey]: name });
        });
      };
      drill(chartInstances.confidence, 'confidence');
      drill(chartInstances.time, 'predict_month');
      drill(chartInstances.partner, 'partner');
      // drill(chartInstances.poHo, 'po_ho');  // PO/HO 已在内部绑定
    };

    // 窗口 resize 时重绘
    const onResize = () => {
      Object.values(chartInstances).forEach(c => c && c.resize());
    };

    // ============ 交互 ============
    // onFilterChange 已在上面定义(会同时刷新看板与明细表)

    const resetFilters = () => {
      // 重置多选筛选
      for (const k of Object.keys(filters)) {
        if (Array.isArray(filters[k])) filters[k] = [];
        else if (typeof filters[k] === 'boolean') filters[k] = false;
        else filters[k] = '';
      }
      // 同时清空列筛选 + 排序
      for (const k of Object.keys(tableFilters)) tableFilters[k] = [];
      sortField.value = '';
      sortOrder.value = '';
    };

    // ============ 筛选下拉辅助：全选 / 清空 / 反选 ============
    const selectAll = (key) => {
      const opts = (filterOptions.value && filterOptions.value[key]) || [];
      filters[key] = opts.map(o => o.value);
    };
    const selectNone = (key) => {
      filters[key] = [];
    };
    const selectInverse = (key) => {
      const opts = (filterOptions.value && filterOptions.value[key]) || [];
      const current = filters[key] || [];
      filters[key] = opts.map(o => o.value).filter(v => !current.includes(v));
    };
    const selectAllMonths = () => {
      const months = (filterOptions.value && filterOptions.value.predict_month) || [];
      filters.predict_month = months.map(o => o.value);
    };

    const onPageChange = (page) => {
      loadProjects(page);
    };

    const exportCSV = async () => {
      // 前端生成 CSV
      let items = (DEMO.value?.projects || []).slice();
      if (filters.confidence) items = items.filter(p => p.confidence === filters.confidence);
      if (filters.partner) items = items.filter(p => p.partner === filters.partner);
      if (filters.po_ho) items = items.filter(p => p.po_ho === filters.po_ho);
      if (filters.industry) items = items.filter(p => p.industry === filters.industry);
      if (filters.keyword) {
        const k = filters.keyword.toLowerCase();
        items = items.filter(p =>
          (p.opportunity_name || '').toLowerCase().includes(k) ||
          (p.customer || '').toLowerCase().includes(k)
        );
      }

      const headers = ['项目编号','机会点名称','客户','负责人','伙伴','行业','赛道','部署方式','把握度','项目阶段','PO/HO','预测下单月份','软件预算(万)','云资源(万)','总规模(万)','项目进展','风险'];
      const rows = items.map(p => [
        p.project_no, p.opportunity_name, p.customer, p.owner, p.partner,
        p.industry, p.track, p.deployment_mode, p.confidence, p.stage,
        p.po_ho, p.predict_month,
        p.software_budget, p.cloud_budget, p.scale_amount,
        p.progress_note, p.risk_note
      ]);
      const csv = '\ufeff' + [headers, ...rows].map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `projects_export_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      ElementPlus.ElMessage.success(`已导出 ${items.length} 条 (CSV)`);
    };

    // 导出为 Excel (.xls) - 使用 HTML 表格格式，兼容 Excel 中文
    const exportExcel = async () => {
      let items = (DEMO.value?.projects || []).slice();
      // 应用全局筛选
      for (const [k, v] of Object.entries(filters)) {
        if (!Array.isArray(v) || v.length === 0) continue;
        items = items.filter(p => v.includes(p[k]));
      }
      if (filters.keyword) {
        const k = filters.keyword.toLowerCase();
        items = items.filter(p => (p.opportunity_name || '').toLowerCase().includes(k) || (p.customer || '').toLowerCase().includes(k));
      }
      // 应用列筛选
      for (const [k, vals] of Object.entries(tableFilters)) {
        if (!Array.isArray(vals) || vals.length === 0) continue;
        const cleaned = vals.filter(v => typeof v !== 'string' || v.trim() !== '');
        if (cleaned.length > 0) items = items.filter(p => cleaned.some(v => String(p[k] || '').includes(String(v))));
      }
      // 生成 HTML 表格（Excel 可读）
      const headers = ['项目编号','机会点名称','客户','负责人','伙伴','行业','赛道','部署方式','把握度','项目阶段','PO/HO','预测下单月份','软件预算(万)','云资源(万)','总规模(万)','项目进展','风险'];
      const esc = (s) => (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const rows = items.map(p => '<tr>' + [
        p.project_no, p.opportunity_name, p.customer, p.owner, p.partner,
        p.industry, p.track, p.deployment_mode, p.confidence, p.stage,
        p.po_ho, p.predict_month,
        p.software_budget, p.cloud_budget, p.scale_amount,
        p.progress_note, p.risk_note
      ].map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('');
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
      const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `projects_export_${Date.now()}.xls`;
      a.click();
      URL.revokeObjectURL(url);
      ElementPlus.ElMessage.success(`已导出 ${items.length} 条 (Excel)`);
    };

    // 清除本地缓存 + 重新加载
    const clearDataCache = async () => {
      localStorage.removeItem('project_pulse_data_v1');
      DEMO.value = null;
      ElementPlus.ElMessage.success('已清除本地缓存，正在重新加载...');
      await loadAll();
    };

    const refreshData = async () => {
      // 强制从后端拉取，不走 localStorage 缓存
      await loadAll(true);
      ElementPlus.ElMessage.success('数据已刷新');
    };

    // 上传
    const handleUpload = async (options) => {
      const formData = new FormData();
      formData.append('file', options.file);
      uploadStatus.value = 'uploading';
      uploadProgress.value = 0;
      uploadStatusText.value = '上传中…';
      lastImportResult.value = null;
      try {
        // 使用 XMLHttpRequest 以便跟踪进度
        const result = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              uploadProgress.value = Math.round((e.loaded / e.total) * 50);
            }
          });
          xhr.addEventListener('load', () => {
            uploadProgress.value = 80;
            uploadStatusText.value = '服务器处理中…';
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch (e) {
              reject(new Error('响应解析失败'));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('网络错误')));
          xhr.open('POST', `${API_BASE}/api/import?operator=user`);
          xhr.send(formData);
        });
        uploadProgress.value = 100;
        if (result.success) {
          uploadStatus.value = 'success';
          lastImportResult.value = result;
          ElementPlus.ElMessage.success(`已导入 ${result.inserted || 0} 条 / 更新 ${result.updated || 0} 条`);
          // 刷新数据 + 最近导入记录
          await loadAll(true);
          await loadRecentBatches();
        } else {
          uploadStatus.value = 'error';
          lastImportResult.value = { success: false, error: result.error || '未知错误' };
          ElementPlus.ElMessage.error('导入失败');
        }
      } catch (e) {
        uploadStatus.value = 'error';
        lastImportResult.value = { success: false, error: e.message };
        ElementPlus.ElMessage.error('导入失败: ' + e.message);
      }
    };

    const regenerateDemo = async () => {
      try {
        await ElementPlus.ElMessageBox.confirm(
          '将清空当前数据并重新生成 200 条演示数据,确定继续?',
          '重置演示数据',
          { type: 'warning' }
        );
      } catch { return; }

      const res = await fetch(`${API_BASE}/api/seed?count=200`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        ElementPlus.ElMessage.success(`已重新生成 ${data.count} 条数据`);
        await loadAll();
      }
    };

    // 把握度标签样式
    const confidenceTagType = (c) => {
      return {
        '已下单': 'tag-signed',
        '保底': 'tag-guaranteed',
        '机会': 'tag-opportunity',
        '风险': 'tag-risk',
        '关闭': 'tag-closed',
      }[c] || '';
    };

    // ============ 下钻视图辅助 ============
    const goBack = () => {
      // 返回主看板
      window.location.href = window.location.pathname;
    };

    const activeFiltersDisplay = computed(() => {
      const labels = {
        confidence: '把握度',
        partner: '伙伴',
        po_ho: 'PO/HO',
        owner: '人员',
        predict_month: '预测月份',
        deployment_mode: '部署方式',
        keyword: '关键词',
      };
      const parts = [];
      for (const [k, v] of Object.entries(filters)) {
        if (!labels[k]) continue;
        if (k === 'keyword' && v) parts.push(`关键词=${v}`);
        else if (Array.isArray(v) && v.length > 0) parts.push(`${labels[k]}=${v.length > 2 ? v.slice(0, 2).join(',') + '等' + v.length + '项' : v.join(',')}`);
      }
      return parts;
    });

    const drillViewTitle = computed(() => {
      const items = activeFiltersDisplay.value;
      if (items.length === 0) return '全部项目';
      return items.join(' · ');
    });

    // ESC 键返回(仅下钻模式)
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && isDrillMode) {
        goBack();
      }
    };

    // ============ 生命周期 ============
    let syncStatusTimer = null;
    onMounted(() => {
      loadAll();
      loadRecentBatches();
      loadSyncStatus();
      // 每 30 秒轮询同步状态(以更新徽章)
      syncStatusTimer = setInterval(() => {
        loadSyncStatus();
        syncTick.value++;
      }, 30000);
      window.addEventListener('resize', onResize);
      window.addEventListener('keydown', onKeyDown);
    });
    onBeforeUnmount(() => {
      if (syncStatusTimer) clearInterval(syncStatusTimer);
    });

    // 打开上传对话框时拉取最近导入
    watch(uploadVisible, (v) => {
      if (v) loadRecentBatches();
    });

    // 筛选变化由各 el-select 的 @change="onFilterChange" 显式触发

    // 解构需要的 icons
    const icons = window.ElementPlusIconsVue || {};
    const Refresh = icons.Refresh;
    const Upload = icons.Upload;
    const Search = icons.Search;
    const Cloud = icons.Cloud;
    const Download = icons.Download;
    const UploadFilled = icons.UploadFilled;
    const Back = icons.Back;
    const ArrowLeft = icons.ArrowLeft;
    const Filter = icons.Filter;

    return {
      // 状态
      loading,
      activeTab,
      isDrillMode,
      drillViewTitle,
      activeFiltersDisplay,
      goBack,
      // 明细表
      tableFilters,
      sortField,
      sortOrder,
      TABLE_COLUMNS,
      columnFilterOptions,
      displayedProjects,
      tableRef,
      activeColumnFilterCount,
      onTableFilterChange,
      onTableSortChange,
      clearTableState,
      kpi,
      // Icons - 提供给 template 直接使用
      Refresh,
      Upload,
      Search,
      Download,
      Cloud,
      Back,
      ArrowLeft,
      Filter,
      UploadFilled,
      dimConfidence,
      dimTime,
      dimPartner,
      dimPoHo,
      dimIndustry,
      dimDeployment,
      topDeployment,
      filters,
      filterOptions,
      projectList,
      chartRefs,

      // 上传
      uploadVisible,
      uploadRef,
      uploadStatus,
      uploadProgress,
      uploadStatusText,
      lastImportResult,
      recentBatches,
      formatBatchTime,
      loadRecentBatches,

      // 方法
      fmt,
      confidenceTagType,
      onFilterChange,
      resetFilters,
      onPageChange,
      exportCSV,
      exportExcel,
      clearDataCache,
      refreshData,
      handleUpload,
      regenerateDemo,
      // 云同步
      syncStatus,
      syncConfigVisible,
      syncConfigForm,
      syncStatusDotType,
      syncTooltip,
      loadSyncStatus,
      manualSyncNow,
      openSyncConfig,
      saveSyncConfig,
      testSyncConnection,
      inspectSyncColumns,
      syncTestResult,
      syncTestLoading,
      formatSyncTime,
      syncBtnSubtitle,
      appBuild,
      // 筛选辅助
      activeFilterCount,
      showTableFilters,
      selectAll,
      selectNone,
      selectInverse,
      selectAllMonths,
      CONFIDENCE_COLORS,
    };
  },

  template: `
    <div>
      <!-- ============ 顶部导航 ============ -->
      <div class="app-header">
        <div class="brand" v-if="isDrillMode" style="cursor: pointer;" @click="goBack">
          <div class="logo" style="background: linear-gradient(135deg, #6b7280, #475569);">←</div>
          <div>
            <div class="title">下钻分析 · {{ drillViewTitle }} <el-tag size="small" type="info" effect="light" style="margin-left: 8px; vertical-align: middle;">DRILL</el-tag></div>
            <div class="subtitle">返回主页 <kbd>ESC</kbd> · 点击左上角或该处均可返回</div>
          </div>
        </div>
        <div class="brand" v-else>
          <div class="logo">🏢</div>
          <div>
            <div class="title">四川云生态机会点项目经营分析看板 <el-tag size="small" type="danger" effect="light" style="margin-left: 8px; vertical-align: middle;">DEMO</el-tag></div>
            <div class="subtitle">实时掌握项目动态 · 项目数 {{ kpi.total_projects || 0 }} · 总规模 {{ fmt.amount(kpi.total_amount) }} 万 <span v-if="activeFilterCount > 0" style="color: var(--huawei-red);">· {{ activeFilterCount }} 个筛选条件生效</span></div>
          </div>
        </div>
        <div class="actions">
          <el-button v-if="isDrillMode" @click="goBack" :icon="Back">返回看板</el-button>
          <template v-else>
            <!-- 同步配置 - 按钮颜色和文字根据同步状态变化 -->
            <el-tooltip :content="syncTooltip" placement="bottom">
              <el-button
                :type="syncStatusDotType"
                :icon="Cloud"
                @click="openSyncConfig"
                :loading="syncStatus.is_running"
                class="sync-config-btn"
              >
                <span class="sync-btn-content">
                  <span class="sync-btn-title">同步配置</span>
                  <span class="sync-btn-sub">{{ syncBtnSubtitle }}</span>
                </span>
              </el-button>
            </el-tooltip>
            <!-- 数据刷新 -->
            <el-button @click="refreshData" :icon="Refresh">数据刷新</el-button>
            <!-- 导入数据 -->
            <el-button type="primary" @click="uploadVisible = true" :icon="Upload">导入数据</el-button>
            <!-- 导出数据 -->
            <el-dropdown>
              <el-button :icon="Download">导出数据</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="exportExcel">📊 导出 Excel (.xlsx)</el-dropdown-item>
                  <el-dropdown-item @click="exportCSV">📄 导出 CSV</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </div>
      </div>

      <!-- ============ 面包屑/下钻提示 ============ -->
      <div v-if="isDrillMode" class="breadcrumb-bar">
        <span class="crumb" @click="goBack">📊 主看板</span>
        <span class="crumb-sep">›</span>
        <span class="crumb active">🔍 下钻分析</span>
        <span class="crumb-tip">点击任意筛选条可修改 · 按 <kbd>ESC</kbd> 快速返回</span>
      </div>

      <!-- ============ 主体 ============ -->
      <div class="main-content">
        <!-- ============ 下钻模式 KPI 摘要 ============ -->
        <template v-if="isDrillMode">
          <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr);">
            <div class="kpi-card kpi-total">
              <div class="kpi-label">📊 下钻项目数</div>
              <div class="kpi-value">{{ fmt.count(kpi.total_projects) }}<span class="kpi-unit">个</span></div>
              <div class="kpi-extra">已应用 {{ activeFiltersDisplay.length }} 个筛选条件</div>
            </div>
            <div class="kpi-card kpi-software">
              <div class="kpi-label">💻 软件预算</div>
              <div class="kpi-value">{{ fmt.amountW(kpi.total_software) }}<span class="kpi-unit">万</span></div>
              <div class="kpi-extra">占总规模 {{ kpi.total_amount > 0 ? Math.round(kpi.total_software / kpi.total_amount * 100) : 0 }}%</div>
            </div>
            <div class="kpi-card kpi-cloud">
              <div class="kpi-label">☁️ 云资源</div>
              <div class="kpi-value">{{ fmt.amountW(kpi.total_cloud) }}<span class="kpi-unit">万</span></div>
              <div class="kpi-extra">占总规模 {{ kpi.total_amount > 0 ? Math.round(kpi.total_cloud / kpi.total_amount * 100) : 0 }}%</div>
            </div>
            <div class="kpi-card kpi-scale">
              <div class="kpi-label">💰 总规模</div>
              <div class="kpi-value">{{ fmt.amountW(kpi.total_amount) }}<span class="kpi-unit">万</span></div>
              <div class="kpi-extra">软件 + 云资源</div>
            </div>
          </div>

          <!-- 当前筛选条件 chips -->
          <div v-if="activeFiltersDisplay.length > 0" class="filter-chips">
            <span class="chip-label">当前筛选:</span>
            <el-tag v-for="item in activeFiltersDisplay" :key="item" type="danger" effect="light" class="filter-chip">{{ item }}</el-tag>
          </div>
        </template>

        <!-- ============ 主模式专属内容(KPI + 图表 + 部署方式报表) ============ -->
        <template v-else>

        <!-- ============ 筛选栏(在 KPI 上方) ============ -->
        <div class="filter-bar">
          <span class="filter-label">🔍 筛选</span>

          <!-- 把握度 - 多选 + 全选 -->
          <el-select
            v-model="filters.confidence"
            placeholder="把握度(可多选)"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            @change="onFilterChange"
            style="width: 200px;"
          >
            <template #header>
              <div style="display: flex; gap: 8px; padding: 4px;">
                <el-button size="small" type="primary" link @click="selectAll('confidence')">全选</el-button>
                <el-button size="small" type="info" link @click="selectNone('confidence')">清空</el-button>
                <el-button size="small" type="success" link @click="selectInverse('confidence')">反选</el-button>
              </div>
            </template>
            <el-option v-for="opt in filterOptions.confidence" :key="opt" :label="opt" :value="opt" />
          </el-select>

          <!-- 伙伴 - 多选 + 全选 -->
          <el-select
            v-model="filters.partner"
            placeholder="伙伴(可多选)"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            filterable
            @change="onFilterChange"
            style="width: 240px;"
          >
            <template #header>
              <div style="display: flex; gap: 8px; padding: 4px;">
                <el-button size="small" type="primary" link @click="selectAll('partner')">全选</el-button>
                <el-button size="small" type="info" link @click="selectNone('partner')">清空</el-button>
              </div>
            </template>
            <el-option v-for="opt in filterOptions.partner" :key="opt" :label="opt" :value="opt" />
          </el-select>

          <!-- PO/HO - 多选 -->
          <el-select
            v-model="filters.po_ho"
            placeholder="PO/HO(可多选)"
            multiple
            collapse-tags
            clearable
            @change="onFilterChange"
            style="width: 160px;"
          >
            <el-option v-for="opt in filterOptions.po_ho" :key="opt" :label="opt" :value="opt" />
          </el-select>

          <!-- 人员 - 多选 -->
          <el-select
            v-model="filters.owner"
            placeholder="人员(可多选)"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            filterable
            @change="onFilterChange"
            style="width: 180px;"
          >
            <template #header>
              <div style="display: flex; gap: 8px; padding: 4px;">
                <el-button size="small" type="primary" link @click="selectAll('owner')">全选</el-button>
                <el-button size="small" type="info" link @click="selectNone('owner')">清空</el-button>
              </div>
            </template>
            <el-option v-for="opt in filterOptions.owner" :key="opt" :label="opt" :value="opt" />
          </el-select>

          <!-- 部署方式 - 多选 -->
          <el-select
            v-model="filters.deployment_mode"
            placeholder="部署方式(可多选)"
            multiple
            collapse-tags
            clearable
            @change="onFilterChange"
            style="width: 220px;"
          >
            <el-option v-for="opt in filterOptions.deployment_mode" :key="opt" :label="opt" :value="opt" />
          </el-select>

          <!-- 预测月份 - 简单多选下拉，风格与其他筛选一致 -->
          <el-select
            v-model="filters.predict_month"
            placeholder="预测月份(可多选)"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            filterable
            @change="onFilterChange"
            style="width: 200px;"
          >
            <template #header>
              <div style="display: flex; gap: 8px; padding: 4px;">
                <el-button size="small" type="primary" link @click="selectAllMonths">全选</el-button>
                <el-button size="small" type="info" link @click="selectNone('predict_month')">清空</el-button>
              </div>
            </template>
            <el-option v-for="opt in filterOptions.predict_month" :key="opt" :label="opt" :value="opt" />
          </el-select>

          <el-input v-model="filters.keyword" placeholder="搜索项目/客户/编号" clearable @input="onFilterChange" style="width: 200px;" />

          <!-- 导出按钮(筛选即时生效,无需确认) -->
          <el-dropdown @click="(e) => e.stopPropagation()">
            <el-button type="success" :icon="Download">导出 ▾</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="exportCSV">📄 CSV 格式</el-dropdown-item>
                <el-dropdown-item @click="exportExcel">📊 Excel 格式</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 重置(顶栏右侧有独立重置按钮,这里不需要) -->
        </div>

        <!-- KPI 卡 -->
        <div class="kpi-grid">
          <div class="kpi-card kpi-total">
            <div class="kpi-label">📊 总项目数</div>
            <div class="kpi-value">{{ fmt.count(kpi.total_projects) }}<span class="kpi-unit">个</span></div>
            <div class="kpi-extra">总规模 {{ fmt.amount(kpi.total_amount) }} 万</div>
          </div>

          <div class="kpi-card kpi-software">
            <div class="kpi-label">💻 总软件预算</div>
            <div class="kpi-value">{{ fmt.amountW(kpi.total_software) }}<span class="kpi-unit">万</span></div>
            <div class="kpi-extra">软件 / 总规模</div>
          </div>

          <div class="kpi-card kpi-cloud">
            <div class="kpi-label">☁️ 总云资源</div>
            <div class="kpi-value">{{ fmt.amountW(kpi.total_cloud) }}<span class="kpi-unit">万</span></div>
            <div class="kpi-extra">云 / 总规模</div>
          </div>

          <div class="kpi-card kpi-scale">
            <div class="kpi-label">💰 总项目规模</div>
            <div class="kpi-value">{{ fmt.amountW(kpi.total_amount) }}<span class="kpi-unit">万</span></div>
            <div class="kpi-extra">软件 + 云资源</div>
          </div>

          <div class="kpi-card kpi-deployment">
            <div class="kpi-label">🚀 部署方式种类</div>
            <div class="kpi-value">{{ dimDeployment.buckets.length }}<span class="kpi-unit">种</span></div>
            <div class="kpi-extra">最大占比: {{ topDeployment.key }} · {{ topDeployment.pct }}%</div>
          </div>
        </div>

        <!-- 第一行图表:核心维度 -->
        <div class="chart-grid">
          <!-- 把握度分布 -->
          <div class="chart-card col-6">
            <div class="card-header">
              <div>
                <div class="card-title">把握度分布</div>
                <div class="card-subtitle">数量 + 金额双指标 · 共 {{ dimConfidence.total_count }} 个项目</div>
              </div>
            </div>
            <div class="chart-body" :ref="el => (chartRefs.confidence = el)"></div>
          </div>

          <!-- 时间趋势 -->
          <div class="chart-card col-6">
            <div class="card-header">
              <div>
                <div class="card-title">预测下单月份趋势</div>
                <div class="card-subtitle">未来 {{ dimTime.buckets.length }} 个月的项目规模分布</div>
              </div>
            </div>
            <div class="chart-body" :ref="el => (chartRefs.time = el)"></div>
          </div>
        </div>

        <!-- 第二行图表:PO vs HO + 伙伴 TOP10 -->
        <div class="chart-grid">
          <!-- PO vs HO 分组柱状图 -->
          <div class="chart-card col-6">
            <div class="card-header">
              <div>
                <div class="card-title">PO vs HO 对比</div>
                <div class="card-subtitle">金额柱 + 项目数柱</div>
              </div>
            </div>
            <div class="chart-body" :ref="el => (chartRefs.poHo = el)"></div>
          </div>

          <!-- TOP10 伙伴贡献排行 -->
          <div class="chart-card col-6">
            <div class="card-header">
              <div>
                <div class="card-title">伙伴贡献项目数 TOP 10</div>
                <div class="card-subtitle">按贡献项目数排序 · 鼠标悬停查看规模</div>
              </div>
            </div>
            <div class="chart-body" :ref="el => (chartRefs.partner = el)"></div>
            <!-- 伙伴贡献明细表 -->
            <el-table :data="dimPartner.buckets.slice(0, 10)" stripe size="small" style="margin-top: 8px; width: 100%;">
              <el-table-column type="index" label="#" width="50" align="center" />
              <el-table-column prop="key" label="伙伴" min-width="120" show-overflow-tooltip />
              <el-table-column label="项目数" width="80" align="right" sortable :sort-by="(row) => row.count">
                <template #default="{ row }">
                  <span class="amount-cell">{{ row.count }} 个</span>
                </template>
              </el-table-column>
              <el-table-column label="总规模(万)" width="110" align="right" sortable :sort-by="(row) => row.amount">
                <template #default="{ row }">
                  <span class="amount-cell" style="color: #C7000B; font-weight: 600;">{{ fmt.amountW(row.amount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="软件(万)" width="100" align="right" sortable :sort-by="(row) => row.software">
                <template #default="{ row }">
                  <span class="amount-cell">{{ fmt.amountW(row.software) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="云资源(万)" width="110" align="right" sortable :sort-by="(row) => row.cloud">
                <template #default="{ row }">
                  <span class="amount-cell" style="color: #3b82f6; font-weight: 600;">{{ fmt.amountW(row.cloud) }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <!-- 部署方式报表 -->
        <div class="chart-grid">
          <div class="chart-card col-12">
            <div class="card-header">
              <div>
                <div class="card-title">🚀 部署方式报表</div>
                <div class="card-subtitle">按筛选条件实时汇总 · 共 {{ dimDeployment.buckets.length }} 种部署方式</div>
              </div>
            </div>
            <el-table :data="dimDeployment.buckets" stripe size="small" style="width: 100%;">
              <el-table-column type="index" label="序号" width="60" align="center" />
              <el-table-column prop="key" label="部署方式" min-width="140" />
              <el-table-column label="项目数" width="120" align="right" sortable :sort-by="(row) => row.count">
                <template #default="{ row }">
                  <span class="amount-cell">{{ fmt.count(row.count) }} 个</span>
                </template>
              </el-table-column>
              <el-table-column label="总规模(万)" width="140" align="right" sortable :sort-by="(row) => row.amount">
                <template #default="{ row }">
                  <span class="amount-cell" style="color: #C7000B; font-weight: 600;">{{ fmt.amountW(row.amount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="软件(万)" width="120" align="right" sortable :sort-by="(row) => row.software">
                <template #default="{ row }">
                  <span class="amount-cell">{{ fmt.amountW(row.software) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="云资源(万)" width="120" align="right" sortable :sort-by="(row) => row.cloud">
                <template #default="{ row }">
                  <span class="amount-cell" style="color: #3b82f6;">{{ fmt.amountW(row.cloud) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="平均规模(万)" width="120" align="right">
                <template #default="{ row }">
                  <span class="amount-cell">{{ fmt.amountW(row.avg_amount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="占比" min-width="220">
                <template #default="{ row }">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="flex: 1; height: 8px; background: #f0f1f5; border-radius: 4px; overflow: hidden;">
                      <div :style="{
                        width: ((row.amount / (dimDeployment.total_amount || 1)) * 100) + '%',
                        height: '100%',
                        background: 'linear-gradient(90deg, #C7000B, #FF4D4F)',
                        borderRadius: '4px',
                      }"></div>
                    </div>
                    <span style="color: #1f2937; font-weight: 600; min-width: 48px; text-align: right;">
                      {{ ((row.amount / (dimDeployment.total_amount || 1)) * 100).toFixed(1) }}%
                    </span>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
        </template>
        <!-- ============ /主模式专属内容 ============ -->

        <!-- 项目明细 -->
        <div class="detail-card">
          <div class="detail-header">
            <div class="detail-title">项目明细</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="font-size:12px;color:#666;">显示 <strong style="color:var(--huawei-red);">{{ projectList.items.length }}</strong> / {{ projectList.total }} 条</span>
              <el-button v-if="activeColumnFilterCount > 0" size="small" type="info" link @click="clearTableState">清除列筛选</el-button>
            </div>
          </div>

          <!-- ============ 明细表顶部横向筛选栏(与表格列对齐) ============ -->
          <div class="tbl-filter-bar" :style="{ '--col-count': 17 }">
            <!-- 序号(无筛选) -->
            <div class="tf-cell" style="width: 60px; flex-shrink: 0;"></div>
            <!-- 项目编号(文本) -->
            <div class="tf-cell" style="width: 130px; flex-shrink: 0;">
              <el-input v-model="tableFilters.project_no[0]" placeholder="编号..." size="small" clearable @input="val => onTableFilterChange({ project_no: val ? [val] : [] })" style="width:100%">
                <template #prefix><span style="font-size:10px;color:#bbb">🔍</span></template>
              </el-input>
            </div>
            <!-- 机会点名称(文本) -->
            <div class="tf-cell" style="flex: 1; min-width: 180px;">
              <el-input v-model="tableFilters.opportunity_name[0]" placeholder="机会点名称..." size="small" clearable @input="val => onTableFilterChange({ opportunity_name: val ? [val] : [] })" style="width:100%">
                <template #prefix><span style="font-size:10px;color:#bbb">🔍</span></template>
              </el-input>
            </div>
            <!-- 客户(文本) -->
            <div class="tf-cell" style="width: 120px; flex-shrink: 0;">
              <el-input v-model="tableFilters.customer[0]" placeholder="客户..." size="small" clearable @input="val => onTableFilterChange({ customer: val ? [val] : [] })" style="width:100%">
                <template #prefix><span style="font-size:10px;color:#bbb">🔍</span></template>
              </el-input>
            </div>
            <!-- 人员(多选) -->
            <div class="tf-cell" style="width: 100px; flex-shrink: 0;">
              <el-select v-model="tableFilters.owner" multiple collapse-tags size="small" placeholder="人员" clearable @change="val => onTableFilterChange({ owner: val })" style="width:100%">
                <el-option v-for="o in columnFilterOptions.owner" :key="o.value" :label="o.text" :value="o.value" />
              </el-select>
            </div>
            <!-- 伙伴(多选) -->
            <div class="tf-cell" style="width: 120px; flex-shrink: 0;">
              <el-select v-model="tableFilters.partner" multiple collapse-tags filterable size="small" placeholder="伙伴" clearable @change="val => onTableFilterChange({ partner: val })" style="width:100%">
                <el-option v-for="o in columnFilterOptions.partner" :key="o.value" :label="o.text" :value="o.value" />
              </el-select>
            </div>
            <!-- 行业(多选) -->
            <div class="tf-cell" style="width: 100px; flex-shrink: 0;">
              <el-select v-model="tableFilters.industry" multiple collapse-tags size="small" placeholder="行业" clearable @change="val => onTableFilterChange({ industry: val })" style="width:100%">
                <el-option v-for="o in columnFilterOptions.industry" :key="o.value" :label="o.text" :value="o.value" />
              </el-select>
            </div>
            <!-- 赛道(多选) -->
            <div class="tf-cell" style="width: 100px; flex-shrink: 0;">
              <el-select v-model="tableFilters.track" multiple collapse-tags size="small" placeholder="赛道" clearable @change="val => onTableFilterChange({ track: val })" style="width:100%">
                <el-option v-for="o in columnFilterOptions.track" :key="o.value" :label="o.text" :value="o.value" />
              </el-select>
            </div>
            <!-- 部署方式(多选) -->
            <div class="tf-cell" style="width: 110px; flex-shrink: 0;">
              <el-select v-model="tableFilters.deployment_mode" multiple collapse-tags size="small" placeholder="部署" clearable @change="val => onTableFilterChange({ deployment_mode: val })" style="width:100%">
                <el-option v-for="o in columnFilterOptions.deployment_mode" :key="o.value" :label="o.text" :value="o.value" />
              </el-select>
            </div>
            <!-- 阶段(多选) -->
            <div class="tf-cell" style="width: 90px; flex-shrink: 0;">
              <el-select v-model="tableFilters.stage" multiple collapse-tags size="small" placeholder="阶段" clearable @change="val => onTableFilterChange({ stage: val })" style="width:100%">
                <el-option v-for="o in columnFilterOptions.stage" :key="o.value" :label="o.text" :value="o.value" />
              </el-select>
            </div>
            <!-- 软件预算(无筛选) -->
            <div class="tf-cell" style="width: 120px; flex-shrink: 0;"></div>
            <!-- 云资源(无筛选) -->
            <div class="tf-cell" style="width: 110px; flex-shrink: 0;"></div>
            <!-- 总规模(无筛选) -->
            <div class="tf-cell" style="width: 120px; flex-shrink: 0;"></div>
            <!-- 把握度(多选) -->
            <div class="tf-cell" style="width: 100px; flex-shrink: 0;">
              <el-select v-model="tableFilters.confidence" multiple collapse-tags size="small" placeholder="把握度" clearable @change="val => onTableFilterChange({ confidence: val })" style="width:100%">
                <el-option v-for="o in columnFilterOptions.confidence" :key="o.value" :label="o.text" :value="o.value" />
              </el-select>
            </div>
            <!-- PO/HO(多选) -->
            <div class="tf-cell" style="width: 80px; flex-shrink: 0;">
              <el-select v-model="tableFilters.po_ho" multiple collapse-tags size="small" placeholder="PO/HO" clearable @change="val => onTableFilterChange({ po_ho: val })" style="width:100%">
                <el-option v-for="o in columnFilterOptions.po_ho" :key="o.value" :label="o.text" :value="o.value" />
              </el-select>
            </div>
            <!-- 下单月(多选) -->
            <div class="tf-cell" style="width: 100px; flex-shrink: 0;">
              <el-select v-model="tableFilters.predict_month" multiple collapse-tags size="small" placeholder="下单月" clearable @change="val => onTableFilterChange({ predict_month: val })" style="width:100%">
                <el-option v-for="o in columnFilterOptions.predict_month" :key="o.value" :label="o.text" :value="o.value" />
              </el-select>
            </div>
          </div>

          <!-- ============ 明细表(只负责排序) ============ -->
          <el-table
            ref="tableRef"
            :data="projectList.items"
            stripe
            v-loading="loading"
            @sort-change="onTableSortChange"
          >
            <el-table-column type="index" label="序号" width="60" align="center" />
            <el-table-column prop="project_no" label="项目编号" width="130" sortable="custom" show-overflow-tooltip />
            <el-table-column prop="opportunity_name" label="机会点名称" min-width="180" sortable="custom" show-overflow-tooltip />
            <el-table-column prop="customer" label="客户" width="120" sortable="custom" show-overflow-tooltip />
            <el-table-column prop="owner" label="人员" width="100" sortable="custom" />
            <el-table-column prop="partner" label="伙伴" width="120" sortable="custom" show-overflow-tooltip />
            <el-table-column prop="industry" label="行业" width="100" sortable="custom" />
            <el-table-column prop="track" label="赛道" width="100" sortable="custom" />
            <el-table-column prop="deployment_mode" label="部署方式" width="110" sortable="custom" />
            <el-table-column prop="stage" label="阶段" width="90" align="center" sortable="custom" />
            <el-table-column label="软件预算(万)" prop="software_budget" width="120" align="right" sortable="custom">
              <template #default="{ row }"><span class="amount-cell">{{ fmt.amountW(row.software_budget) }}</span></template>
            </el-table-column>
            <el-table-column label="云资源(万)" prop="cloud_budget" width="110" align="right" sortable="custom">
              <template #default="{ row }"><span class="amount-cell">{{ fmt.amountW(row.cloud_budget) }}</span></template>
            </el-table-column>
            <el-table-column label="总规模(万)" prop="scale_amount" width="120" align="right" sortable="custom">
              <template #default="{ row }"><span class="amount-cell" style="color:#C7000B;font-weight:600;">{{ fmt.amountW(row.scale_amount) }}</span></template>
            </el-table-column>
            <el-table-column prop="confidence" label="把握度" width="100" sortable="custom">
              <template #default="{ row }"><el-tag :class="confidenceTagType(row.confidence)" size="small">{{ row.confidence }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="po_ho" label="PO/HO" width="80" align="center" sortable="custom" />
            <el-table-column prop="predict_month" label="下单月" width="100" align="center" sortable="custom" />
          </el-table>

          <div style="margin-top: 16px; text-align: right;">
            <el-pagination
              background
              layout="prev, pager, next, total"
              :total="projectList.total"
              :page-size="projectList.page_size"
              :current-page="projectList.page"
              @current-change="onPageChange"
            />
          </div>
        </div>

      </div>

      <!-- ============ 上传弹窗 ============ -->
      <el-dialog v-model="uploadVisible" title="导入 Excel 数据 · 覆盖当前数据" width="600px" :close-on-click-modal="false">
        <el-upload
          ref="uploadRef"
          drag
          :auto-upload="false"
          :show-file-list="false"
          accept=".xlsx,.xls"
          :on-change="(file) => handleUpload({ file: file.raw })"
        >
          <el-icon style="font-size: 48px; color: #3b82f6;"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            将 Excel 文件拖到此处,或<em>点击选择</em>
          </div>
          <template #tip>
            <div class="el-upload__tip" style="color: #6b7280;">
              支持 .xlsx / .xls 格式 · 字段映射见 <code>field_mapping.yaml</code>
            </div>
          </template>
        </el-upload>

        <!-- 上传中进度 -->
        <div v-if="uploadStatus === 'uploading'" style="margin-top: 16px;">
          <el-progress :percentage="uploadProgress" :status="uploadProgress === 100 ? 'success' : ''" />
          <div style="color: #6b7280; font-size: 12px; margin-top: 4px;">{{ uploadStatusText }}</div>
        </div>

        <!-- 上传结果 -->
        <div v-if="lastImportResult" style="margin-top: 16px;">
          <el-alert
            :title="lastImportResult.success ? '✅ 导入成功' : '❌ 导入失败'"
            :type="lastImportResult.success ? 'success' : 'error'"
            :closable="true"
            @close="lastImportResult = null"
            show-icon
          >
            <template #default>
              <div v-if="lastImportResult.success" style="line-height: 1.8;">
                <div>✅ 新增入库: <b style="color: #C7000B;">{{ lastImportResult.inserted || 0 }}</b> 条</div>
                <div v-if="(lastImportResult.skipped || lastImportResult.skipped_count) > 0" style="color: #f59e0b;">
                  ⚠️ 跳过未导入: <b>{{ lastImportResult.skipped || lastImportResult.skipped_count }}</b> 条
                  <span style="color: #999; font-size: 12px;">（项目编号为空）</span>
                </div>
                <div v-if="lastImportResult.errors && lastImportResult.errors.length > 0" style="margin-top: 8px; color: #6b7280; font-size: 12px;">
                  <div>全部错误明细 ({{ lastImportResult.errors.length }} 条):</div>
                  <ul style="margin: 4px 0 0 20px; max-height: 120px; overflow-y: auto;">
                    <li v-for="(e, i) in lastImportResult.errors" :key="i" :class="{'skipped-item': e.includes('已跳过')}">{{ e }}</li>
                  </ul>
                </div>
              </div>
              <div v-else>{{ lastImportResult.error || '未知错误' }}</div>
            </template>
          </el-alert>
        </div>

        <!-- 最近导入历史 -->
        <div v-if="recentBatches.length > 0" style="margin-top: 16px;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 8px;">最近导入</div>
          <div v-for="b in recentBatches.slice(0, 5)" :key="b.id" style="display: flex; justify-content: space-between; padding: 6px 8px; background: #f9fafb; border-radius: 4px; margin-bottom: 4px; font-size: 12px;">
            <span>{{ b.filename }}</span>
            <span style="color: #6b7280;">{{ b.inserted }} 条 · {{ formatBatchTime(b.created_at) }}</span>
          </div>
        </div>
      </el-dialog>

      <!-- ============ 同步配置对话框 (中转页模式) ============ -->
      <el-dialog v-model="syncConfigVisible" title="同步配置" width="520px" :close-on-click-modal="false">
        <el-form label-width="100px" size="default">
          <!-- 中转页 URL -->
          <el-form-item label="中转页 URL">
            <el-input v-model="syncConfigForm.transit_url" placeholder="https://feishu.cn/wiki/xxxxx 或内网文档页" clearable />
          </el-form-item>
          <el-form-item label="查找策略">
            <el-select v-model="syncConfigForm.transit_strategy" style="width: 100%;">
              <el-option label="auto (推荐) - 优先找 .xlsx 链接,再找“下载”按钮" value="auto" />
              <el-option label="text - 找含“下载/导出/Download”文本的按钮" value="text" />
              <el-option label="selector - 按 CSS 选择器点击(需填下面)" value="selector" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="syncConfigForm.transit_strategy === 'selector'" label="CSS 选择器">
            <el-input v-model="syncConfigForm.transit_selector" placeholder="如 #download 或 button.download-btn" clearable />
          </el-form-item>
          <el-form-item label="预设 Cookie">
            <el-input v-model="syncConfigForm.transit_cookie" type="password" show-password placeholder="可选 · 需登录页面填 name1=v1; name2=v2" clearable />
          </el-form-item>
          <el-form-item label="每日同步时间">
            <el-time-picker
              v-model="syncConfigForm.time"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="选择时间"
              style="width: 140px;"
            />
            <span style="margin-left: 12px; color: #6b7280; font-size: 12px;">默认 08:30</span>
          </el-form-item>
          <el-form-item label="启用同步">
            <el-switch v-model="syncConfigForm.enabled" active-text="启用" inactive-text="暂停" inline-prompt />
          </el-form-item>
          <!-- 诊断 / 测试 结果 -->
          <el-form-item v-if="syncTestResult" label="测试结果">
            <el-alert :type="syncTestResult.success ? 'success' : 'error'" :closable="false" show-icon>
              <template #title>
                {{ syncTestResult.success ? '✅ ' : '❌ ' }}{{ syncTestResult.message }}
              </template>
            </el-alert>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="syncConfigVisible = false">取消</el-button>
          <el-button @click="inspectSyncColumns" :loading="syncTestLoading">🔍 诊断列名</el-button>
          <el-button @click="testSyncConnection" :loading="syncTestLoading">🔌 测试连接</el-button>
          <el-button @click="manualSyncNow(false)" :loading="syncStatus.is_running">立即同步</el-button>
          <el-button type="primary" @click="saveSyncConfig">保存</el-button>
        </template>
      </el-dialog>

      <!-- 版本号 - 方便确认是否为新版本 -->
      <div class="pp-version-tag" :title="'Build ' + appBuild">v{{ appBuild }} · 云同步</div>
    </div>
  `,
});

app.use(ElementPlus);
// 全局注册所有 Element Plus Icons - 确保按钮和模板中能直接使用组件名
if (window.ElementPlusIconsVue) {
  for (const [name, comp] of Object.entries(window.ElementPlusIconsVue)) {
    try {
      app.component(name, comp);
    } catch (e) {
      // ignore individual component registration errors
    }
  }
}
app.mount('#app');

} catch (e) {
  console.error('[Init] 初始化失败:', e);
  showFatalError('应用初始化失败', e.message);
}