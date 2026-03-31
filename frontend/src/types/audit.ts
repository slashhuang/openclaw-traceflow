/**
 * Agent 贡献审计系统类型定义（前端）
 */

// Token 使用量
export interface TokenUsage {
  input: number;
  output: number;
}

// 发起人统计
export interface InitiatorStats {
  displayName: string;
  total: number;
  repos: string[];
}

// 代码交付统计
export interface CodeDeliveryStats {
  totalMRs: number;
  byInitiator: Record<string, InitiatorStats>;
  byRepo: Record<string, number>;
}

// 用户统计
export interface UserStats {
  displayName: string;
  questions: number;
  tags: Record<string, number>;
}

// 问答服务统计
export interface QaServiceStats {
  totalQuestions: number;
  uniqueUsers: number;
  byUser: Record<string, UserStats>;
  byTag: Record<string, number>;
}

// 自动化统计
export interface AutomationStats {
  totalRuns: number;
  byType: Record<string, number>;
}

// 成本统计
export interface CostStats {
  totalInputTokens: number;
  totalOutputTokens: number;
}

// 审计快照
export interface AuditSnapshot {
  generatedAt: string;
  period?: string;
  codeDelivery: CodeDeliveryStats;
  qaService: QaServiceStats;
  automation: AutomationStats;
  cost: CostStats;
}
