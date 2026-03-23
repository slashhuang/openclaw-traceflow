# 公众号长文 · 主线版（从研发方式到 TraceFlow）

**GitHub**  
`https://github.com/slashhuang/openclaw-traceflow`  

---

## 发稿备忘（给你自己看的，可删）

- **主线**：先讲我怎么干活 → 再讲我怎么用 OpenClaw → 为啥做了 TraceFlow → 功能点到为止，细节甩 README。  
- **标题**：从下表挑一个顺眼的当群发标题；副标题见文末「一句副标题」。  
- **图**：正文里标了 **【插图 1】【插图 2】…**，你按占位把本地素材贴进公众号编辑器即可；文件名建议和仓库 **`openclaw-traceflow/docs/traceFlowSnapshots/`** 里官方图一致，方便核对。完整列表见 **[`参考-README与截图.md`](./参考-README与截图.md)**。  
- **口径**：和 **[`README.zh-CN.md`](../../openclaw-traceflow/README.zh-CN.md)** 对一下，别手写编造指标。  

---

## 标题备选（挑一个当推送标题）

想写得像「我跟你聊天」，不像发通稿——所以标题也尽量口语一点。

| 方向 | 标题示例 |
|------|-----------|
| **主线** | 《从 git worktree 到 OpenClaw：我怎样干活，才反推出 TraceFlow》 |
| **主线** | 《Claude Code、Cursor、Plan 和 Debug 换着用——我为啥还要单独搞个 TraceFlow》 |
| **可观测** | 《OpenClaw 跑起来像盲盒？我开源了一块专门「摊开来看」的表盘》 |
| **Skill / 上下文** | 《Skill 装了不少，运行时却说不清谁在起作用——这是我做 TraceFlow 的起点》 |
| **独立部署** | 《不想和 Gateway 挤一间房：TraceFlow 默认 3001，单独做观测》 |

**一句副标题（可选）**  
《**OpenClaw TraceFlow**：尽量把 Agent 运行时从黑盒掰成能核对的事实——会话、Skill、上下文用量、延迟、Prompt、日志；细节见 README。》  

---

## 正文

先说一句总的：这篇文章不是产品说明书，是**我真实怎么用 OpenClaw、为啥觉得缺一块东西**，以及那个东西开源之后叫什么。你要是也有「能跑但说不清」的时候，下面可能能对上号。

---

【**插图 1**｜**此处插入图片**】  

- **推荐文件**（与仓库截图一致）：`docs/traceFlowSnapshots/dashboard-1.png`  
- **图注建议**：TraceFlow 仪表盘总览——先看一眼「整块屏长什么样」。  
- **上传后**：把本段说明删掉，只留图 + 简短图注即可。  

---

### 一、我的研发方式，其实挺「土」的

我写代码、带团队，没有啥玄学，就是几件事叠在一起，能并行、能复盘，机器能帮忙，但**最后签字的是我**。

git **worktree** 我常用：同一仓库多开几个工作区，多人协作时少踩脚，分支和本地实验能拆开。**Claude Code** 适合大块改、跟目录绑得紧的活；**Cursor** 这边我经常在 **Plan**（把事摊开、多文件一起改）和 **Debug**（对着报错和栈抠）之间切——真实排障本来就不是一种模式打到底。还有一条线在**阿里云**上：聊天式开发环境，从云端改完 **push GitHub**，和本机并进同一个远程仓。

平时我**搜狗语音**开得多，能先说清楚再敲键盘，脑子不断在指头上。大改之前会先把 **`CLAUDE.md`、`AGENTS.md`** 和整条 **flow** 理顺——这跟后来接 OpenClaw、写 TraceFlow 是同一套脾气：**边界先清楚，再让模型动刀。**

这些和 TraceFlow 没有一一对应关系。但有一点是通的：我受不了**运行时一片模糊**——外面看起来在跑，里面到底发生了什么，心里没底。

---

### 二、OpenClaw：公司和个人，我都是重度用户

我自己用 OpenClaw 用得很多。**公司里**偏研发场景：自动改代码、**worktree** 撑多人并行、自动指 **reviewer** 之类，链路一长，你就会问：**Skill 到底有没有被用？会话上下文顶到哪了？Prompt 里进了啥？** 往往变成「好像是这样」，而不是「我能指给你看」。

个人项目也一样。说白了，要对齐**现象和依据**的时候，缺一条能摊开的路径——不是一句「模型胡说」能交差，而是：**此刻会话里装了什么、哪些 Skill 动过、窗口吃到哪**——你自己都未必一眼说清。有人叫这「记忆幻觉」，我更愿意讲：**根上是运行时对你不够可见。**

---

【**插图 2**｜**此处插入图片**】  

- **推荐文件**：`docs/traceFlowSnapshots/sessionDetail.png`（或 `sessionList.png`，二选一或两张都上，中间隔一段字）  
- **图注建议**：会话列表 / 详情——把「一条会话里能核对什么」摊开一点。  

---

### 三、为啥要单独开源 TraceFlow

我需要的不是再多一个「能点的后台」，而是**能核对的事实**。OpenClaw 自带界面能覆盖很多日常操作；但当我要和同事把事说圆、把 Skill / 会话 / 上下文摊开讨论时，我还是想要一块**独立进程**的屏：默认 **3001**，跟 Gateway **分房睡**，数字从哪来尽量写在 **ℹ** 里，慢的地方也写在 **ROADMAP**，不装成全知。

所以 **TraceFlow** 是**从用法里长出来的**，不是先拍脑袋列功能再讲故事。名字就叫 TraceFlow，意思也简单：把 trace 摊开，能聊、能查。

---

【**插图 3**｜**此处插入图片**】  

- **推荐文件**：`docs/traceFlowSnapshots/skills.png`（若更想强调 Prompt，可换 `systemPrompt.png`）  
- **图注建议**：Skill / Prompt 一类视图——和「谁在起作用」直接相关。  

---

### 四、它到底有啥（短说，细节请看 README）

具体能力、路由、安全、对比表，都在 **[README.zh-CN](https://github.com/slashhuang/openclaw-traceflow/blob/main/README.zh-CN.md)**，这里只写我**自己**最关心的几件事：

Skill / 工具谁在调；会话和上下文能不能看见「吃到哪」；用量和延迟别只有一个裸数；System Prompt 怎么进会话；日志能流就流。做不到百分之百透明的地方，产品上会说清楚，不糊弄。

你要是懒得翻长文，记住一句就行：**可观测是目的，黑盒尽量变白盒。**

---

### 五、写 TraceFlow 这个仓库时

写这个仓库的时候，前面那套也没变：**Claude Code、Cursor、云上 push** 照样用；本机一条线、云端一条线，**合什么、怎么接 Gateway**，还是人拍板。只是这次对象换成 TraceFlow 自己而已。

---

【**插图 4（可选）**｜**此处插入图片**】  

- **推荐文件**：`tokenMonitor.png` / `models.png` / `systemPrompt.png`（按需选一，不必全上）  
- **图注建议**：Token / 模型参考 / Prompt 分析——有版面再上，避免一篇里图太密。  

---

## 咋跑 & 怎么支持

```bash
cd openclaw-traceflow
pnpm run deploy:pm2
# 浏览器 http://localhost:3001（默认）
# Gateway 多为 http://localhost:18789，按环境改
```

觉得有用就去 **`https://github.com/slashhuang/openclaw-traceflow`** 点个 **Star**。愿意转给同样在 OpenClaw + 研发协作里折腾的朋友，也行。Issue、PR 都欢迎；带复现、带会话量级，更好。

**安全**：别裸奔挂公网，内网或前面挡一层代理再说（README 里有写）。

---

**信息卡**

| 项目 | OpenClaw TraceFlow |
|------|---------------------|
| 定位 | OpenClaw Agent 可观测仪表盘 |
| 栈 | NestJS · React · Vite · Ant Design |
| 协议 | MIT |
| 地址 | https://github.com/slashhuang/openclaw-traceflow |

细节以仓库 **README.zh-CN、ROADMAP** 与代码为准。  
