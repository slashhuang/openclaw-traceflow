/**
 * Agent 贡献审计系统类型定义
 *
 * 数据由 `audit-scanner.mjs` 写入；扫描器随本仓库 `resources/bundled-skills/agent-audit/` 分发
 * 数据位置：~/.openclaw/workspace/.openclawAudits/
 */

// ─── 审计事件 ───────────────────────────────────────────────

/** 问答事件 */
export interface QaEvent {
  type: 'qa';
  timestamp: string;
  sessionId: string;
  senderId: string;
  senderName?: string;
  tags: string[];
  userMessage: string;
  tokenUsage: TokenUsage;
  turnIndex: number;
}

/** 代码交付事件 */
export interface CodeDeliveryEvent {
  type: 'code_delivery';
  timestamp: string;
  sessionId: string;
  senderId: string;
  senderName?: string;
  mr: {
    project: string;
    iid: number;
    url: string;
    sourceBranch: string;
    targetBranch: string;
  };
  tokenUsage: TokenUsage;
}

/** 自动化事件 */
export interface AutomationEvent {
  type: 'automation';
  timestamp: string;
  sessionId: string;
  automationType: string;
  tokenUsage: TokenUsage;
}

/** Token 使用量 */
export interface TokenUsage {
  input: number;
  output: number;
}

/** 审计事件联合类型 */
export type AuditEvent = QaEvent | CodeDeliveryEvent | AutomationEvent;

// ─── 审计快照 ───────────────────────────────────────────────

/** 代码交付统计 */
export interface CodeDeliveryStats {
  totalMRs: number;
  byInitiator: Record<string, InitiatorStats>;
  byRepo: Record<string, number>;
}

/** 发起人统计 */
export interface InitiatorStats {
  displayName: string;
  total: number;
  repos: string[];
}

/** 问答服务统计 */
export interface QaServiceStats {
  totalQuestions: number;
  uniqueUsers: number;
  byUser: Record<string, UserStats>;
  byTag: Record<string, number>;
}

/** 用户统计 */
export interface UserStats {
  displayName: string;
  questions: number;
  tags: Record<string, number>;
}

/** 自动化统计 */
export interface AutomationStats {
  totalRuns: number;
  byType: Record<string, number>;
}

/** 成本统计 */
export interface CostStats {
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** 审计快照 */
export interface AuditSnapshot {
  generatedAt: string;
  period?: string; // YYYY-MM
  codeDelivery: CodeDeliveryStats;
  qaService: QaServiceStats;
  automation: AutomationStats;
  cost: CostStats;
}

// ─── 扫描锚点 ───────────────────────────────────────────────

/** 文件锚点 */
export interface FileAnchor {
  byteOffset: number;
  lineCount: number;
  sessionKey?: string;
  status: 'active' | 'archived';
}

/** 扫描锚点 */
export interface ScanAnchors {
  version: number;
  lastRunAt: string;
  files: Record<string, FileAnchor>;
}

// ─── API 响应 ───────────────────────────────────────────────

/** 审计快照 API 响应 */
export interface AuditSnapshotResponse {
  success: boolean;
  data?: AuditSnapshot;
  error?: string;
}

/** 审计事件列表 API 响应 */
export interface AuditEventsResponse {
  success: boolean;
  events?: AuditEvent[];
  total?: number;
  error?: string;
}
