# PRD：PR 自动创建与合并流程优化

**文档类型**：产品需求说明（PRD）  
**状态**：Draft  
**最后更新**：2026-03-10  
**提出方**：slashhuang（爸爸）

---

## 一、Context（背景与动机）

### 1.1 当前痛点

当前 git-workflow 流程中，阿布（Agent）创建 PR 时需要用户手动操作：

1. 阿布推送分支到远程
2. 阿布在飞书回复中给出 PR 创建链接（如 `https://github.com/slashhuang/claw-sources/pull/new/feat/xxx`）
3. **用户需要点击链接 → 手动填写标题/描述 → 点击「Create pull request」**
4. 用户回复「可以合并」
5. 阿布执行合并

**问题**：步骤 3 需要用户手动创建 PR，增加了用户操作成本，且流程不连贯。

### 1.2 目标

- **自动创建 PR**：阿布推送分支后，直接调用 GitHub API 创建 PR，无需用户手动操作
- **自动合并 PR**：用户回复「可以合并」后，阿布自动合并 PR，无需手动点击
- **流程闭环**：从提 PR 到合并全流程自动化，用户只需确认即可

### 1.3 技术可行性

| 能力 | 现状 | 可行性 |
|------|------|--------|
| **GITHUB_TOKEN** | ✅ 已配置（`ghp_...`） | 具备 `repo` 权限 |
| **创建 PR** | GitHub API `POST /pulls` | ✅ 可行 |
| **合并 PR** | GitHub API `PUT /pulls/{number}/merge` | ✅ 可行 |
| **查询 PR 状态** | GitHub API `GET /pulls/{number}` | ✅ 可行 |

---

## 二、Goal（目标）

### 2.1 用户视角

- **提 PR**：阿布推送代码后，自动创建 PR 并飞书通知爸爸（含 PR 链接）
- **确认合并**：爸爸回复「可以合并」，阿布自动合并 PR
- **无需手动**：爸爸不需要点击链接、填写表单、点击按钮

### 2.2 成功标准

- 阿布能在推送分支后自动创建 PR（标题、描述自动生成）
- 阿布能在用户确认后自动合并 PR
- 飞书通知包含 PR 链接，方便用户查看

---

## 三、Acceptance Criteria（可验收条件）

### 3.1 自动创建 PR

| ID | 条件 | 说明 |
|----|------|------|
| AC-1 | 推送后自动创建 | 代码推送到远程分支后，自动调用 GitHub API 创建 PR |
| AC-2 | PR 标题规范 | 格式：`<type>: <description>`（如 `feat: 实现分类播报`） |
| AC-3 | PR 描述规范 | 包含：变更内容、涉及文件、测试情况、关联 PRD（如有） |
| AC-4 | 飞书通知 | 创建成功后飞书通知用户，含 PR 链接 |
| AC-4b | **代码 Diff 展示** | **飞书通知中附带代码 diff 摘要**，用户可在聊天中直接查看变更（格式：markdown code block，含文件路径、增减行数、关键变更） |
| AC-5 | 异常处理 | 如 PR 已存在（同分支），跳过创建或更新现有 PR |

### 3.2 自动合并 PR

| ID | 条件 | 说明 |
|----|------|------|
| AC-6 | 用户确认触发 | 用户回复「可以合并」、「合并吧」、「OK 合并」等指令 |
| AC-7 | 合并方式 | 使用 `merge`（普通合并）或 `squash`（压缩合并），可配置 |
| AC-8 | 合并后清理 | 合并成功后删除远程分支（可选） |
| AC-9 | 飞书通知 | 合并成功后飞书通知用户 |
| AC-10 | 异常处理 | 如合并冲突、CI 失败等，飞书通知用户并请求手动处理 |

### 3.3 配置与扩展

| ID | 条件 | 说明 |
|----|------|------|
| AC-11 | Token 配置 | 使用环境变量 `GITHUB_TOKEN`（推荐） |
| AC-12 | 仓库配置 | 支持配置目标仓库（默认 `slashhuang/claw-sources`） |
| AC-13 | 分支保护 | 如分支有保护规则（要求 CI、review），合并失败时提示用户 |

---

## 四、Out of Scope（本次不包含）

- **PR Review 自动化**：不自动 approve PR，仍需用户确认
- **CI/CD 集成**：不等待 CI 结果（由用户判断）
- **多 PR 批量合并**：一次只合并一个 PR
- **PR 模板**：不使用 `.github/pull_request_template.md`（直接 API 创建）

---

## 五、实现方案

### 5.1 技术方案

#### 使用 GitHub REST API

直接用 `curl` + GitHub API，无需额外依赖：

**创建 PR**：
```bash
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/slashhuang/claw-sources/pulls \
  -d '{
    "title": "feat: 实现分类播报",
    "body": "变更内容...\n\n涉及文件：...\n\n测试：...",
    "head": "feat/smart-trading-classify",
    "base": "main"
  }'
```

**合并 PR**：
```bash
curl -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/slashhuang/claw-sources/pulls/{number}/merge \
  -d '{"merge_method": "merge"}'
```

**注意**：不使用 gh CLI（配置复杂且容易失败），直接用 curl + GitHub API。

---

### 5.2 git-workflow Skill 更新

更新 `skills/git-workflow/SKILL.md`，添加自动创建/合并 PR 的流程说明：

```markdown
## 自动创建 PR

推送分支后自动调用 GitHub API 创建 PR：

1. 提取 commit message 作为 PR 标题
2. 生成变更摘要作为 PR 描述
3. 调用 `POST /repos/{owner}/{repo}/pulls`
4. 飞书通知用户 PR 链接

## 自动合并 PR

用户回复「可以合并」后：

1. 解析 PR 号（从上下文或链接）
2. 调用 `PUT /repos/{owner}/{repo}/pulls/{number}/merge`
3. 飞书通知合并结果
```

---

### 5.3 新增脚本

在 `skills/git-workflow/scripts/` 下新增：

- `create_pr.sh` — 创建 PR 脚本
- `merge_pr.sh` — 合并 PR 脚本
- `github_api.sh` — GitHub API 封装（通用函数）
- `generate_diff.sh` — 生成代码 diff 摘要（用于飞书通知）

### 5.4 Diff 生成方案

**获取 diff**：
```bash
# 获取分支与 main 的 diff
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --no-color
```

**飞书通知格式**：
```markdown
**PR 创建成功** #17

📝 变更摘要：
```
 skills/smart-trading-assistant/scripts/daily_brief.py | 138 ++++++++++++++++-
 skills/smart-trading-assistant/config/assistant_config.json | 110 +++++++++++-
 2 files changed, 240 insertions(+), 8 deletions(-)
```

🔍 关键变更：
- 新增分类播报功能（按市场分组展示）
- 更新配置文件（新增 8 只标的）

🔗 PR 链接：https://github.com/slashhuang/claw-sources/pull/17
```

**Diff 长度限制**：
- 超过 50 行时只显示统计信息（`--stat`）
- 完整 diff 可通过 PR 链接查看

---

## 六、依赖与前置

| 依赖 | 状态 | 说明 |
|------|------|------|
| **GITHUB_TOKEN** | ✅ 已配置 | 需 `repo` 权限 |
| **仓库访问** | ✅ 已配置 | SSH 已通 |
| **curl** | ✅ 系统自带 | 调用 API |
| **jq** | ⚠️ 需确认 | 解析 JSON 响应（可选） |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **Token 过期/权限不足** | API 调用失败 | 合并失败时飞书通知用户检查 Token |
| **分支冲突** | 无法自动合并 | 提示用户手动处理冲突 |
| **分支保护规则** | 需要 Review/CI | 提示用户满足条件后再合并 |
| **API 限流** | 请求被拒绝 | 控制调用频率，失败时重试 |

---

## 八、实施计划

### 阶段 1：配置 gh CLI / API 封装

- 配置 `~/.config/gh/hosts.yml` 或封装 API 脚本
- 测试创建 PR、合并 PR 接口

### 阶段 2：更新 git-workflow Skill

- 修改 `SKILL.md` 说明文档
- 新增 `create_pr.sh`、`merge_pr.sh` 脚本
- 集成到现有流程

### 阶段 3：测试与验证

- 在测试分支验证完整流程
- 确认飞书通知正常

---

## 九、Status

| 项目 | 说明 |
|------|------|
| **状态** | Draft → review → approved → implemented |
| **实施** | 待实施 |
| **后续** | 根据实际使用反馈迭代（如支持 squash merge、自动删除分支等） |

---

## 十、变更日志

### 2026-03-10 初版

- 提出自动创建/合并 PR 需求
- 明确技术方案（GitHub API）
- 定义 AC 与实施计划

---

*本文档满足 `docs/prd-workflow-2025-03-07.md` 中 PRD 命名与结构约定。*
