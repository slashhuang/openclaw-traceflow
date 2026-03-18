import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

export const healthApi = {
  getHealth: () => api.get('/health').then(res => res.data),
};

export const sessionsApi = {
  list: () => api.get('/sessions').then(res => res.data),
  getDetail: (id) => api.get(`/sessions/${id}`).then(res => res.data),
  kill: (id) => api.post(`/sessions/${id}/kill`).then(res => res.data),
};

export const logsApi = {
  getRecent: (limit = 100) => api.get(`/logs?limit=${limit}`).then(res => res.data),
};

export const setupApi = {
  getStatus: () => api.get('/setup/status').then(res => res.data),
  testConnection: (gatewayUrl) => api.post('/setup/test-connection', { gatewayUrl }).then(res => res.data),
  configure: (config) => api.post('/setup/configure', config).then(res => res.data),
  generateToken: () => api.post('/setup/generate-token').then(res => res.data),
};

export const metricsApi = {
  getLatency: () => api.get('/metrics/latency').then(res => res.data),
  getTools: () => api.get('/metrics/tools').then(res => res.data),
  getTokenSummary: () => api.get('/metrics/token-summary').then(res => res.data),
  getTokenUsage: () => api.get('/metrics/token-usage').then(res => res.data),
};

export const actionsApi = {
  restart: () => api.post('/actions/restart').then(res => res.data),
  cleanupLogs: () => api.post('/actions/cleanup-logs').then(res => res.data),
};

export default api;
