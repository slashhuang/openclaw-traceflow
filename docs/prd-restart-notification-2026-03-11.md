# PRD：Gateway 重启通知优化

## 📋 基础信息
- **日期**：2026-03-11
- **来源**：爸爸（slashhuang）反馈
- **记录人**：阿布
- **标签**：#功能 #效率 #通知

---

## 💡 需求背景

目前 Gateway 重启后只给当前会话用户发送通知。但如果同时有多个用户在和不同的机器人聊天，他们可能不知道 Gateway 已经重启更新了。

---

## 🎯 目标

### 解决什么问题
- 重启通知只发给当前会话用户，其他用户不知道更新
- 妈妈、爸爸、佩奇一家企业用户可能在不同时间聊天，都需要知道最新状态

### 用户场景
- Gateway 重启后，自动给以下对象发送通知：
  1. 妈妈（jojo 机器人）
  2. 爸爸（slashhuang 机器人）
  3. 佩奇一家企业（peiqi 机器人）

---

## 📝 功能设计

### 1. 重启通知流程

**触发时机**：Gateway 启动后（BOOT.md 流程）

**通知对象**：
| 用户 | 机器人账号 | 飞书账号 | 通知方式 |
|------|-----------|----------|----------|
| 妈妈 | jojo | ou_31fd1b6d3639ffaf1e4d70c5de2f5ef4 | message 工具 |
| 爸爸 | slashhuang | ou_3ea312add9031b59971788b123de0dd8 | message 工具 |
| 佩奇一家企业 | peiqi | 企业群/企业用户 | 可选 |

### 2. 通知内容

```
👧 阿布重启好啦～这次更新：

- <commit_hash> <commit_message>
- <commit_hash> <commit_message>
...

**新功能**：xxx（如有）
```

### 3. 幂等设计

- 使用 `.workspace/.last_boot_commit` 判断是否有更新
- 只有 commit 变化时才发送通知
- 避免重复通知

### 4. 配置化

在 `bot.prod.json` 或单独配置文件中定义通知列表：

```json
"restartNotification": {
  "enabled": true,
  "recipients": [
    {
      "name": "妈妈",
      "account": "jojo",
      "target": "user:ou_31fd1b6d3639ffaf1e4d70c5de2f5ef4"
    },
    {
      "name": "爸爸",
      "account": "slashhuang",
      "target": "user:ou_3ea312add9031b59971788b123de0dd8"
    }
  ]
}
```

---

## 🔍 技术实现

### 修改文件

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `skills/code-sync/scripts/sync.py` | 修改 | 重启后调用通知函数 |
| `skills/code-sync/scripts/notify_restart.py` | 新增 | 重启通知脚本 |
| `bot.prod.json` | 修改 | 添加通知配置（可选） |

### 实现逻辑

```python
# notify_restart.py 伪代码
def send_restart_notification(commits):
    """发送重启通知给所有配置的用户"""
    config = load_notification_config()
    
    for recipient in config['recipients']:
        message = format_notification_message(commits, recipient['name'])
        send_feishu_message(
            account=recipient['account'],
            target=recipient['target'],
            message=message
        )
```

### BOOT.md 修改

在 BOOT.md 的「功能更新通知」任务中添加：

```markdown
3. **仅当 commit 不同时**：
   - 在仓库根执行 `git log --oneline <上次>..HEAD` 获取变更摘要
   - 调用 `skills/code-sync/scripts/notify_restart.py` 发送通知
   - 将当前 commit 写入 `.workspace/.last_boot_commit`（覆盖原内容）
```

---

## 📊 优先级评估
- **紧迫性**：中（爸爸明确提出需求）
- **影响力**：中（提升用户体验）
- **实现难度**：小（主要是消息发送逻辑）
- **推荐优先级**：P1

---

## ✅ 验收标准

1. Gateway 重启后自动发送通知给妈妈、爸爸
2. 通知内容包含最近的 commit 列表
3. 幂等设计：commit 未变化时不重复发送
4. 支持配置化（可选）

---

## 📝 后续演进
- [ ] PRD 确认
- [ ] 开发中
- [ ] 已实现

**关联需求/PR**：(实现后填)
