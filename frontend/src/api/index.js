import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

/** 与设置页保存 token 时写入的 key 一致，供 accessMode=token 时调用受保护 API */
export const TRACE_FLOW_ACCESS_TOKEN_STORAGE_KEY = 'openclawTraceflowAccessToken';

api.interceptors.request.use((config) => {
  try {
    if (typeof localStorage === 'undefined') return config;
    const t = localStorage.getItem(TRACE_FLOW_ACCESS_TOKEN_STORAGE_KEY);
    if (t) {
      const headers = config.headers ?? {};
      headers.Authorization = `Bearer ${t}`;
      config.headers = headers;
    }
  } catch {
    /* ignore */
  }
  return config;
});

export function extractApiErrorMessage(error, fallback = 'Request failed') {
  const data = error?.response?.data;
  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }
  }
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

export const skillsApi = {
  getUsage: () => api.get('/skills/usage').then(res => res.data),
  getUsageByUser: () => api.get('/skills/usage-by-user').then(res => res.data),
  getSkillToolUsage: () => api.get('/skills/skill-tool-usage').then(res => res.data),
};

export const healthApi = {
  getHealth: () => api.get('/health').then(res => res.data),
};

/** IM Session Watch 状态 */
export const watchSessionApi = {
  getStatus: () => api.get('/im/watch/status').then(res => res.data),
};

export const statusApi = {
  getOverview: () => api.get('/status').then(res => res.data),
};

export const sessionsApi = {
  /** PRD §3.2：按 agent 会话概览（与 /sessions 着陆同源） */
  getAgentOverview: () => api.get('/sessions/agent-overview').then((res) => res.data),
  /** 筛选统计（供前端筛选项显示计数） */
  getFilterStats: () => api.get('/sessions/filter-stats').then((res) => res.data),
  list: (params) => api.get('/sessions', { params }).then(res => res.data),
  getDetail: (id, params) =>
    api
      .get(`/sessions/${encodeURIComponent(id)}`, {
        timeout: 60000,
        params: params && typeof params === 'object' ? params : undefined,
      })
      .then((res) => res.data),
  kill: (id) => api.post(`/sessions/${id}/kill`).then(res => res.data),
  getConfiguredModels: () => api.get('/sessions/config/models').then(res => res.data),
  /** 归档轮次（*.jsonl.reset.*） */
  getArchiveEpochs: (id) =>
    api.get(`/sessions/${encodeURIComponent(id)}/archive-epochs`).then((res) => res.data),
};

/** 工作区文件编辑（通用文件读写，无额外权限限制） */
export const workspaceFileApi = {
  getFile: (path) => api.get(`/workspace/file/${encodeURIComponent(path)}`).then(res => res.data),
  putFile: (path, content, expectedMtimeMs) =>
    api.put(`/workspace/file/${encodeURIComponent(path)}`, { content, expectedMtimeMs }).then(res => res.data),
  deleteFile: (path) => api.delete(`/workspace/file/${encodeURIComponent(path)}`).then(res => res.data),
  getTree: (path) => api.get(`/workspace/tree${path ? `?path=${encodeURIComponent(path)}` : ''}`).then(res => res.data),
};

export const logsApi = {
  getRecent: (limit = 100) => api.get(`/logs?limit=${limit}`).then(res => res.data),
  getTraceflowLogs: (limit = 100) => api.get(`/logs/traceflow?limit=${limit}`).then(res => res.data),
  getImPushLogs: (limit = 100) => api.get(`/logs/im?limit=${limit}`).then(res => res.data),
};

/** 合并并发 GET /setup/status（开发态 StrictMode 会双跑 useEffect，避免重复打 Gateway） */
let setupStatusInflight = null;

export const setupApi = {
  /** 单次 Gateway + 本地路径解析，最坏约 8s+8s，避免默认 10s axios 超时 */
  getStatus: () => {
    if (setupStatusInflight) {
      return setupStatusInflight;
    }
    setupStatusInflight = api
      .get('/setup/status', { timeout: 25000 })
      .then((res) => res.data)
      .finally(() => {
        setupStatusInflight = null;
      });
    return setupStatusInflight;
  },
  testConnection: (params) =>
    api.post('/setup/test-connection', {
      openclawGatewayUrl: params?.gatewayUrl ?? params?.openclawGatewayUrl,
      openclawGatewayToken: params?.gatewayToken ?? params?.openclawGatewayToken,
      openclawGatewayPassword: params?.gatewayPassword ?? params?.openclawGatewayPassword,
    }).then(res => res.data),
  configure: (config) => api.post('/setup/configure', config).then(res => res.data),
  generateToken: () => api.get('/setup/generate-token').then(res => res.data),
};

export const metricsApi = {
  getLatency: () => api.get('/metrics/latency').then(res => res.data),
};

export const actionsApi = {
  restart: () => api.post('/actions/restart').then(res => res.data),
};

export const pricingApi = {
  getAll: () => api.get('/pricing').then(res => res.data),
  getConfig: () => api.get('/pricing/config').then(res => res.data),
  updateConfig: (config) => api.post('/pricing/config', config).then(res => res.data),
  updateModelPrice: (name, pricing) => api.post(`/pricing/model/${name}`, pricing).then(res => res.data),
  removeModelPrice: (name) => api.delete(`/pricing/model/${name}`).then(res => res.data),
  resetToDefaults: () => api.post('/pricing/reset').then(res => res.data),
};

export const systemPromptApi = {
  putWorkspaceBootstrapFile: (body) =>
    api
      .put('/skills/system-prompt/workspace-file', body, { timeout: 60000 })
      .then((res) => res.data),
};

/** 会话质量评估模板（eval-prompt-v1），用于会话详情 POST /sessions/:id/evaluations */
export const evaluationPromptApi = {
  get: () => api.get('/evaluation-prompt', { timeout: 60000 }).then((res) => res.data),
  save: (template) =>
    api.put('/evaluation-prompt', { template }, { timeout: 60000 }).then((res) => res.data),
  clear: () => api.delete('/evaluation-prompt', { timeout: 60000 }).then((res) => res.data),
};

/** 工作区规范与引导文件评估模板（workspace-bootstrap-eval-v1），用于 /system-prompt */
export const workspaceBootstrapEvaluationPromptApi = {
  get: () =>
    api
      .get('/workspace-bootstrap-evaluation-prompt', { timeout: 60000 })
      .then((res) => res.data),
  save: (template) =>
    api
      .put('/workspace-bootstrap-evaluation-prompt', { template }, { timeout: 60000 })
      .then((res) => res.data),
  clear: () =>
    api
      .delete('/workspace-bootstrap-evaluation-prompt', { timeout: 60000 })
      .then((res) => res.data),
};

export default api;
