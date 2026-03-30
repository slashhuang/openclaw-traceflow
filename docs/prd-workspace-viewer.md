# PRD: Workspace 文件浏览器

**版本**: 1.0  
**日期**: 2026-03-30  
**作者**: 阿布  
**状态**: 待评审

---

## 1. 背景

用户需要直接在 TraceFlow 中浏览和查看 OpenClaw workspace 目录下的文件内容，包括：
- 查看 memory 文件、配置文档、日志等
- 无需 SSH 或本地文件管理器即可快速预览
- 支持多种文件格式的渲染

---

## 2. 目标

在 TraceFlow 中新增一个 **Workspace** 页面，以文件目录树的形式展示 workspace 内容，支持常见文件的在线预览。

---

## 3. 需求详情

### 3.1 路由
- **路径**: `/workspace`
- **位置**: TraceFlow 主菜单新增一项

### 3.2 文件目录展示
- **根目录**: 自动嗅探（见 3.4 技术实现）
- **展示形式**: 树形目录结构（类似 VSCode 资源管理器）
- **交互**:
  - 点击文件夹 → 展开/收起
  - 点击文件 → 右侧/弹窗预览内容

### 3.3 文件渲染规则

| 文件类型 | 扩展名 | 渲染方式 |
|---------|--------|---------|
| Markdown | `.md` | 普通文本（可考虑后续加 markdown 渲染） |
| JSON/JSONL | `.json`, `.jsonl` | 普通文本（带语法高亮） |
| HTML | `.html`, `.htm` | iframe 嵌入 |
| 纯文本 | `.txt`, `.log` | 普通文本 |
| 代码文件 | `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.sh` | 普通文本（带语法高亮） |
| 其他 | 未知扩展名 | 普通文本 / 提示"不支持预览" |

### 3.4 技术实现

#### 后端 (NestJS)
- **新增 Controller**: `WorkspaceController`
- **路由**:
  - `GET /api/workspace/tree` - 获取目录树结构
  - `GET /api/workspace/file/*path` - 获取文件内容
- **根目录嗅探逻辑**（复用 OpenClaw 降级逻辑）:
  1. 环境变量 `OPENCLAW_WORKSPACE_DIR`（优先级最高）
  2. 默认值：`~/.openclaw/workspace`（使用 `os.homedir()` 展开）
- **安全限制**:
  - 仅允许访问嗅探到的 workspace 目录
  - 禁止访问目录外文件（路径遍历防护）

#### 前端 (React)
- **新增页面**: `Workspace.tsx`
- **组件**:
  - `FileTree` - 文件树组件
  - `FilePreview` - 文件预览组件
  - `MarkdownViewer` - Markdown 渲染（可选）
  - `CodeViewer` - 代码高亮（使用现有组件或轻量库）
  - `HtmlViewer` - iframe 嵌入 HTML

---

## 4. 验收标准

- [ ] 菜单中可见 `/workspace` 入口
- [ ] 能正确展示 `.workspace` 目录结构
- [ ] 点击文件夹可展开/收起
- [ ] 点击 `.md` 文件能查看内容
- [ ] 点击 `.json` 文件能查看内容
- [ ] 点击 `.html` 文件能用 iframe 预览
- [ ] 路径遍历攻击被阻止（如 `../../../etc/passwd`）

---

## 5. 非目标（后续迭代）

- ❌ 文件编辑功能
- ❌ 文件上传/删除
- ❌ Markdown 富文本渲染（第一版用纯文本即可）
- ❌ 图片预览

---

## 6. 技术备注

### 安全考虑
1. 后端必须校验请求路径，确保不超出 `.workspace` 范围
2. 使用 `path.resolve()` + 前缀检查防止路径遍历
3. HTML 文件用 iframe 隔离，避免 XSS

### 性能考虑
1. 大文件（>1MB）限制预览或截断
2. 目录树懒加载（点击文件夹时才请求子目录）

---

## 7. 相关文件

- `openclaw-traceflow/src/workspace/workspace.controller.ts` (新增)
- `openclaw-traceflow/src/workspace/workspace.service.ts` (新增)
- `openclaw-traceflow/frontend/src/pages/Workspace.tsx` (新增)
- `openclaw-traceflow/frontend/src/components/FileTree.tsx` (新增)
- `openclaw-traceflow/frontend/src/components/FilePreview.tsx` (新增)
