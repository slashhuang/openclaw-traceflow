openclaw-traceflow：减负 + 会话详情 Token 规则

会话详情 Token 展示（用户补充）





后端 [sessions.service.ts](openclaw-traceflow/src/sessions/sessions.service.ts) / getSessionById：继续返回 tokenUsage、tokenUsageMeta（含 totalTokensFresh、source、contextUtilizationReliable 等），不因全局减负而删掉详情里的 token 载荷；getSessionDetail 现有解析逻辑保留。



前端 [SessionDetail.jsx](openclaw-traceflow/frontend/src/pages/SessionDetail.jsx)（及子组件）：





有 token 数据：正常展示用量/分项（与列表页「去掉 token」不同，详情可保留）。



仅当 tokenUsageMeta.totalTokensFresh === false（sessions.json 索引非新鲜）：不做「当前上下文占用」类强结论；仅展示补充说明（例如 Alert：索引内 totalTokens 不宜作为当前窗口占用依据，数值仅供参考）。不将 contextUtilizationReliable === false 并入该分支条件（后端 mapTokenUsageForApi 仍可单独处理 utilization 字段，与前端「补充说明」门控无关）。

全局仍下线（与此前一致）





前端 /tokens、Token 监控、Dashboard/Sessions 的 token 聚合与列。



metrics 定时采集、refreshToolStatsSnapshot、dashboard overview 中的 token/tools/archive 聚合 API。



列表接口不返回 token 字段，减轻列表与轮询压力。

列表与 transcript：术语（避免评审误解）





不解析 JSONL：列表路径 不对 transcript 做 JSON.parse、不按 entry 语义提取 message/tool；与「完全不读盘」不是同一回事。



读盘两档  





纯 index + stat：只读 sessions.json + readdir + 对 .jsonl **fs.stat**——不 readFile transcript；此模式下方可对外说「列表不读日志文件」。  



需要 messageCount（行数）时：允许 **readFile 或流式 read**，但 仅统计字节流中的换行符，禁止为列表做 JSONL 语义扫描。



文档/评审表述：「不 readFile」仅限定在「纯 index+stat 模式」；一旦要填行数且文件小于阈值，即属于「读字节、不解析」。

列表字段与 messageCount（已定）





**messageCount 产品口径**：JSONL 行数（一行一条记录），不要求等于「含 message 的条数」。



实现规则（500KB 阈值）  





**stat.size < 500 * 1024**：读取完整文件，仅按字节流数 \n（或等价：非空行数若实现统一用 trim 后计数，需在代码注释写死口径）。不做 JSON 解析。  



**stat.size ≥ 500KB**：不读全文；用 文件头一小段（如 64KB）估平均行长 + stat.size 得到 估算行数，产品接受近似。



常量：500 * 1024 建议抽到与详情阈值同级的共享常量（如 session-jsonl-thresholds.ts），便于评审对照。



与详情：详情仍可按现有逻辑解析；列表字段若易混可加 messageLineCount 或 API 注释标明「列表=行数，大文件为估算」。

列表其它字段（index+stat 主路径）





lastActiveAt：max(index.updatedAt, transcript mtime)（readSessionsMeta 需透出 updatedAt / label / displayName 等）。  



status：无 transcript 末条时用 mtime 等启发式。  



participantSummary：不解析 jsonl 则省略或「—」。  



可选兜底：磁盘有 .jsonl 但 sessions.json 无 entry 时，再对该文件 head/tail（仍不强制语义扫描全文件）；见 todo list-jsonl-fallback-optional。

实现时注意





前端「补充说明 / 抑制强结论」只认 tokenUsageMeta.totalTokensFresh === false，不要再用 contextUtilizationReliable 做并联判断。

性能侧





去掉 metrics 后台循环与 overview 重聚合后，原 perf 主因消除。



列表刷新：以 index + stat 为基线；仅小于 500KB 的日志为行数做一次全文字节读，大于等于 500KB 只读头窗做估算，读盘量可控；详情单次 getSessionDetail 仍为打开详情时的主成本。



给实施者的说明（本段供转交千问 / 外包，尽量防踩坑）

仓库范围：仅修改 claw-sources/openclaw-traceflow/。不要修改 claw-sources/openclaw/（上游只读）、不要修改 wave-openclaw-wrapper/vendor/openclaw-wave-extension/（subtree 只读）。

工作方式：下列步骤有 顺序依赖；请按「推荐顺序」做，每阶段完成后 编译 + 跑前端构建，避免接口已删而 UI 仍调用导致白屏。



一、可行性结论（摘要）





本方案在 openclaw-traceflow 单仓内可完成，无需改 OpenClaw 核心。



主要风险是 前后端与 overview 响应形状不同步 → 运行期 undefined、白屏；按下文清单逐项改可规避。



二、GET /api/dashboard/overview 响应变更（合同）

当前（逻辑在 [dashboard.controller.ts](openclaw-traceflow/src/dashboard/dashboard.controller.ts)）：Promise.all 返回 health、sessions、metrics.latency、metrics.tools、metrics.tokenSummary、metrics.tokenUsage、metrics.tokenByKey、metrics.archiveCountMap 等。

目标：删除所有 token、tools/skills 聚合、archiveCountMap*；保留（除非产品另有要求）例如：





health



statusOverview



sessions（列表数据，且字段将随 SessionsService.listSessions 瘦身）



recentLogs



metrics.latency（若仍要延迟卡片；若 Dashboard 不再展示 latency，可连此项一并删除并同步删 UI）

实施要求：





先改 后端 dashboard.controller.ts 的 return 结构与 Promise.all 内容。



再改 前端 [frontend/src/pages/Dashboard.jsx](openclaw-traceflow/frontend/src/pages/Dashboard.jsx)：凡读取 data.metrics.tokenSummary、metrics.tools、metrics.skills、archiveCountMap、tokenByKey 的 整块 JSX 与 useMemo 依赖 必须删除或改写，禁止留下对已删字段的访问。



全局搜 metrics.token、archiveCountMap、skillChartData、toolChartData 等，确保无残留。



三、后端：模块与文件级清单







区域



文件



动作





Token 监控



[src/sessions/token-monitor.controller.ts](openclaw-traceflow/src/sessions/token-monitor.controller.ts)、[token-monitor.service.ts](openclaw-traceflow/src/sessions/token-monitor.service.ts)



删除文件或停用；必须改 [sessions.module.ts](openclaw-traceflow/src/sessions/sessions.module.ts)：移除 Controller/Service 注册与 export





Sessions 列表



[src/sessions/sessions.service.ts](openclaw-traceflow/src/sessions/sessions.service.ts)



① listSessions 返回对象 去掉 tokenUsage、tokenUsageMeta、estimatedTokensFromLog、usageCost 等（与计划一致）② listSessionsPaged 中 filter === 'archived'：禁止再调用 this.metricsService.getArchivedCountBySessionKey()（会全量读归档）；改为调用 新方法（见下）③ filter === 'stale_index'：依赖 tokenUsageMeta 时已不存在则 删除该 filter 或改规则，并 同步删前端 [Sessions.jsx](openclaw-traceflow/frontend/src/pages/Sessions.jsx) 对应选项





Sessions 与 Metrics 解耦



[src/sessions/sessions.module.ts](openclaw-traceflow/src/sessions/sessions.module.ts)



若 SessionsService 不再需要 MetricsService，移除 imports: [MetricsModule]，并删掉 constructor 注入





归档计数（轻量）



[src/openclaw/openclaw.service.ts](openclaw-traceflow/src/openclaw/openclaw.service.ts)（推荐）



新增例如 getArchiveResetFileCountBySessionKey(): Promise<Record<string, number>>：仅 readdir agents/*/sessions/，用正则匹配 ^(.+?)\.jsonl\.reset\.(.+)$，按 sessionId 或 sessionKey 规则 累加 count，不要 readFile





Metrics



[src/metrics/metrics.module.ts](openclaw-traceflow/src/metrics/metrics.module.ts)



删除 onModuleInit / startTokenCollection 整段（含 refreshToolStatsSnapshot、getArchivedTokenUsageFromResetFiles、recordTokenUsage）





Metrics



[src/metrics/metrics.controller.ts](openclaw-traceflow/src/metrics/metrics.controller.ts)



删除路由：token-summary、token-usage、token-usage-by-session-key、tools（若计划不再保留）；若前端仍直接调 archive-count-by-session-key，要么保留该路由但内部改为调用 OpenClawService 轻量实现，要么改前端改调新 API





Metrics



[src/metrics/metrics.service.ts](openclaw-traceflow/src/metrics/metrics.service.ts)



删除 refreshToolStatsSnapshot、getToolStatsSnapshot、sessionToolStatsCache 及仅被 token 采集使用的方法；getArchivedCountBySessionKey 若仍存在勿再读全文归档，可删或改为委托 OpenClaw 轻量方法





存储层



[src/storage/session-storage.ts](openclaw-traceflow/src/storage/session-storage.ts)



重写列表加载路径：以 readSessionsMeta + readdir + stat 为主；不调用现有 readSessionFile 的 JSONL 语义扫描；messageCount 按 500KB 规则（全文数 \n vs 头窗估算）；readSessionsMeta 必须透出 updatedAt、label、displayName（及实现 lastActiveAt 所需字段）





详情



[sessions.service.ts](openclaw-traceflow/src/sessions/sessions.service.ts) getSessionById



保留 tokenUsage / tokenUsageMeta 等详情字段；勿删 getSessionDetail

Nest 编译：每改 module 的 imports/providers，运行 npm run build（或项目等价命令）确认无循环依赖与缺失 provider。



四、前端：文件级清单







文件



动作





[frontend/src/App.jsx](openclaw-traceflow/frontend/src/App.jsx)



删除 /tokens 路由与 TokenMonitor import





[frontend/src/layouts/BasicLayout.jsx](openclaw-traceflow/frontend/src/layouts/BasicLayout.jsx)



删除 Tokens 菜单项





[frontend/src/pages/TokenMonitor.jsx](openclaw-traceflow/frontend/src/pages/TokenMonitor.jsx)



删除或不再引用





[frontend/src/pages/Dashboard.jsx](openclaw-traceflow/frontend/src/pages/Dashboard.jsx)



与 overview 新响应对齐；删 token/tools/archive 相关卡片与数据依赖





[frontend/src/pages/Sessions.jsx](openclaw-traceflow/frontend/src/pages/Sessions.jsx)



删 token 列；stale_index / archived 与后端 filter 同步；若 archived 仍用 API，改为新端点或 sessions 查询参数





[frontend/src/pages/SessionDetail.jsx](openclaw-traceflow/frontend/src/pages/SessionDetail.jsx)



仅当 tokenUsageMeta?.totalTokensFresh === false 时展示补充说明 Alert；不要用 contextUtilizationReliable 控制该 Alert；保留 toolCalls / invokedSkills





[frontend/src/api/index.js](openclaw-traceflow/frontend/src/api/index.js)



删除对已下线 GET /api/metrics/* 的封装，或改为新 URL





[frontend/src/components/TokenMetricHint.jsx](openclaw-traceflow/frontend/src/components/TokenMetricHint.jsx)



删除引用或删文件





[frontend/src/locales/zh-CN.js](openclaw-traceflow/frontend/src/locales/zh-CN.js)、[en-US.js](openclaw-traceflow/frontend/src/locales/en-US.js)



删除 menu.tokens、token 监控说明等死文案（避免误导）



五、500KB 与行数计数（实现硬约束）





阈值：LIST_MESSAGE_LINE_COUNT_FULL_READ_MAX_BYTES = 500 * 1024。约定：size < 500*1024 才允许全文读；size >= 500*1024 禁止全文读，只用头窗估算。



全文读时：只数 字节 \n（或团队统一一种：非空行 = split 后 trim 非空）；禁止 JSON.parse。



估算：头窗建议 64KB（与现有 openclaw 详情头窗量级一致），公式：estimatedLines = Math.round(size / (headBytes / headNonEmptyLineCount))，注意除零。



六、推荐实施顺序（减少半成品）





后端：metrics.module 停采集 → metrics.controller 删路由 → metrics.service 删方法 → dashboard.controller 瘦身。



后端：OpenClawService 增加轻量归档计数 → SessionsService 换用并去掉对 MetricsService 的依赖（如可）→ sessions.module 调整 imports。



后端：session-storage 列表路径重写 + readSessionsMeta 扩展。



后端：SessionsService.listSessions DTO 瘦身。



前端：api/index.js → Dashboard.jsx → Sessions.jsx → App.jsx / BasicLayout → SessionDetail token Alert → 删 Token 页与 locale。



全仓 grep：token-summary、archive-count、refreshToolStats、TokenMonitor、stale_index（若已删 filter）。



构建与冒烟：启动后端 + 前端，打开 /、/sessions、会话详情，确认无控制台报错。



七、验收清单（实施完成后自检）





GET /api/dashboard/overview 不再触发 getSessionDetail 循环、不调已删 metrics token 逻辑。  



无后台每 30s「Token usage collected」日志（或等价采集已移除）。  



GET /api/sessions 列表响应无计划删除的 token 字段。  



会话详情仍有 toolCalls；token 区在 totalTokensFresh === false 时有说明文案。  



列表刷新：大 transcript 不做 JSON 解析；小文件仅字节数换行；大文件为估算。  



npm run build（后端）与前端 build 均通过。



八、可选后续（非本需求阻塞）





[health.service.ts](openclaw-traceflow/src/health/health.service.ts)：connectionOverride.connected === true 时跳过 getHealth（进一步缩 health 延迟）。  



metrics.db 中旧表：可保留文件不迁移，或清理死表（低优先级）。

