/** 与会话 API 的 status 枚举对应（active / idle / completed / failed） */
export function sessionStatusLabel(intl, status) {
  if (status == null || status === '') return '—';
  return intl.formatMessage({ id: `sessions.status.${status}`, defaultMessage: String(status) });
}
