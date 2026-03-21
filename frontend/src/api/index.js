import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
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
  getSystemPromptAnalysis: () => api.get('/skills/system-prompt/analysis').then(res => res.data),
};

export const healthApi = {
  getHealth: () => api.get('/health').then(res => res.data),
};

export const statusApi = {
  getOverview: () => api.get('/status').then(res => res.data),
};

export const sessionsApi = {
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

export const logsApi = {
  getRecent: (limit = 100) => api.get(`/logs?limit=${limit}`).then(res => res.data),
};

export const setupApi = {
  getStatus: () => api.get('/setup/status').then(res => res.data),
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
  getTools: () => api.get('/metrics/tools').then(res => res.data),
  getTokenSummary: () => api.get('/metrics/token-summary').then(res => res.data),
  getTokenUsage: (params) => api.get('/metrics/token-usage', { params }).then(res => res.data),
  getTokenUsageBySessionKey: (timeRangeMs = 86400000) =>
    api.get('/metrics/token-usage-by-session-key', { params: { timeRangeMs } }).then(res => res.data),
  getTokenUsageBySessionKeyPaged: (params) =>
    api.get('/metrics/token-usage-by-session-key', { params }).then(res => res.data),
  getArchiveCountBySessionKey: () =>
    api.get('/metrics/archive-count-by-session-key').then(res => res.data),
};

export const dashboardApi = {
  getOverview: () => api.get('/dashboard/overview').then(res => res.data),
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

export default api;
