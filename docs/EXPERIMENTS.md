# DeepSeek Harness 思维链保护预设：实验与研究文档

**中文标题**：面向 DeepSeek V4 Pro 的请求脚手架对思维链风格的影响：系统实验与生产预设

**版本**：2.0（修订）
**日期**：2026-08

---

## 摘要

DeepSeek V4 Pro 在不同"请求脚手架"（system prompt、API 工具 schema 目录、注入文本）下呈现出显著不同的思维链（Chain-of-Thought）风格。基于 xiaobright 与 B 站 up 主诗倾弦的前期观察，本研究在 DeepSeek Harness 上通过 20 余组严格对照实验系统考察了各因素对思维链中 `let's` / `we need` 类标记占比的影响。主要发现如下。

第一，**API 工具 schema 的数量是影响 let's 占比的最强因素**：请求工具面为 3–6 个时，let's 占比稳定在 86%–87%；增长至 40 个时降至 52%–62%。第二，**工具 schema 的描述文本是独立的第二影响因素**：在工具数量与构成完全相同的条件下，将元认知类工具（任务规划、用户询问、目标管理）的描述替换为中性动作语义后，let's 占比由 52% 提升至 85%（相对提升 33 个百分点）。第三，**system prompt 文本影响微弱，user 消息文本注入与 skill 目录注入无影响**。第四，**动态扩展工具数量若无上限约束，思维链将随任务推进逐步劣化**：预热后第二轮直接恢复全量工具目录的配置，思维链全面退化为 `let me` 主导；仅在"解锁"机制而无"回收"机制的动态工具面同样在长任务中逐步衰退。

基于上述结论，本研究提出两种生产预设：**网关路由模式（cot-gw）**——请求面恒定 3 个 schema（官方极简双工具 + 一个转发工具），全部能力经转发可达且请求面永不增长；**动态工具模式（cot-dyn）**——7 个常驻 schema 加按需激活与 LRU 自动回收。网关路由模式在真实长任务（2.6 小时 Portal 游戏复刻）与端到端集成测试中保持 let's 主导思维链（let's 计数 414，`let me` 计数 0）。

**关键词**：DeepSeek V4 Pro；思维链；工具调用；function calling；请求脚手架；agent 能力

---

## 目录

1. [引言](#1-引言)
2. [研究基础](#2-研究基础)
3. [实验方法](#3-实验方法)
4. [实验一：工具 schema 数量与构成的阶梯实验](#4-实验一工具-schema-数量与构成的阶梯实验)
5. [实验二：工具描述文本的消融实验](#5-实验二工具描述文本的消融实验)
6. [实验三：工具面架构的对比实验](#6-实验三工具面架构的对比实验)
7. [实验四：复杂任务下的机制验证](#7-实验四复杂任务下的机制验证)
8. [实验五：真实项目验证（Portal 复刻）](#8-实验五真实项目验证portal-复刻)
9. [实验六：网关端到端综合测试](#9-实验六网关端到端综合测试)
10. [讨论：动态扩展无约束的思维链衰退](#10-讨论动态扩展无约束的思维链衰退)
11. [结论](#11-结论)
12. [最终架构：两种模式的设计与工作原理](#12-最终架构两种模式的设计与工作原理)
13. [全部实验数据汇总](#13-全部实验数据汇总)
14. [附录](#14-附录)

---

## 1. 引言

Agent 系统的能力上限与其思维链质量密切相关。在 DeepSeek V4 Pro 的实践中观察到：当请求以"集体行动"视角组织推理时（`we need`、`let's` 标记主导），模型表现出更强的目标导向与任务推进能力；而当请求脚手架引入大量工具 schema 后，思维链往往转向以 `let me` 为主导的单数行动模式，任务执行呈现模式化与迟疑。

本研究系统回答三个问题：

1. 哪些请求脚手架因素决定思维链风格，影响强度如何排序？
2. 如何在工具能力无限扩展（新工具持续注册）的前提下，稳定保持 `let's` 主导的思维链？
3. 动态加载工具的机制是否无条件有益？其边界条件是什么？

---

## 2. 研究基础

### 2.1 xiaobright / dsh-anchored-standard

xiaobright 的公开实验（2026-08）确立了以下事实：

- **工具目录影响轨迹**：DeepSeek V4 Pro 在完整 25 工具目录下，即使 system prompt 保持极简，首轮轨迹为 "The user wants ... Let me ..."；仅暴露官方极简双工具（bash + str_replace_editor）时，轨迹为 "We need" 风格。
- **决定性对照**：将完整工具说明作为 user 消息或 tool result 文本注入，而 API 层仍暴露 minimal 工具时，轨迹保持 We/Need——**影响来自"模型实际可调用的 schema surface"，而非"看见工具名称文本"**。
- **工具子集消融**：`bash+read` 两工具 → We need；`bash+glob` 两工具 → Let me。工具数量同为 2，构成不同，轨迹不同。
- **首轮锚定后恢复**：首轮两工具锚定后，恢复完整 25 工具目录，模型可正常使用全部工具且轨迹保持（Project2 得分 98/99）。

### 2.2 诗倾弦（B 站）

诗倾弦的视频实验（BV1Ftb26kErX）观察到：网页版 DeepSeek V4 Pro 在**无工具注入、无文本注入**的纯对话条件下，思维链无 `let me`；加载工具后能力表现迅速劣化；不加载工具保持较好；随工具数量增加能力逐步劣化。与 xiaobright 的结论相互印证。

### 2.3 本研究的重实验确认与新发现

在 DeepSeek Harness 上重新验证上述事实，并扩展变量控制：

| 确认项 | 来源 | 本研究证据 |
|---|---|---|
| 工具 schema 数量显著影响 let's 占比 | xiaobright / 诗倾弦 | 实验一（数量阶梯严格单调） |
| 工具说明作为 user 文本不影响思维链 | xiaobright | 实验二对照（C-text/bridge-hint 文本注入 0 影响） |
| 首轮锚定后恢复工具面可行 | xiaobright | 常驻收敛 + 按需解锁/转发架构（实验三/六） |
| **工具描述文本是独立影响变量** | 本研究新发现 | 实验二（M3 vs M4，同数量同构成，+33pp） |
| **动态扩展无约束 → 思维链逐步衰退** | 本研究新发现 | 第 10 节（预热后全量恢复 → 全面 let me；无回收机制的动态面长任务衰退） |
| **转发/解锁架构可保持请求面收敛** | 本研究新发现 | 实验三/四/五（请求面恒定或自动回收） |

---

## 3. 实验方法

### 3.1 固定参数

所有用例固定以下条件，仅研究变量变化：

| 参数 | 固定值 | 说明 |
|---|---|---|
| 模型 | `deepseek-v4-pro` | E-flash 用例以 flash 对照模型差异 |
| system prompt | `You are a helpful software engineer assistant.` | 官方极简 persona，`complete: true`，抑制运行时上下文快照 |
| 任务注入 | bench-driver 自动注入 | 用户仅发送触发词 `run`，流程与文本完全一致 |
| 工作区 | 每用例独立目录 | 如 `/home/czm/ds_test/bench-m1`，互不干扰 |
| 会话记录 | 多帧 zstd JSONL 全量落盘 | 事后逐帧解压分析，无采样 |

### 3.2 测量指标

1. **思维链标记统计**：从 `assistant/message` 事件的 `reasoning` 块提取文本，正则统计 `we need`、`we should`、`we can`、`we'll`、`let's`、`let me`、`i'll`、`i should` 等标记的数量与占比（占比 = 该标记数 / 该实验全部标记总数）。
2. **思维链长度**：字符数；token 估算按英文 ≈ 3.6 字符/token。
3. **工具调用**：`tool/call` 事件统计；gateway 转发目标逐一核对；转发成功率按 `tool/result.message.source.callId` 与 `tool/call.callId` 配对判定。
4. **请求工具面演化**：`request/header` 事件的 tools 列表（动态解锁与自动回收的实证依据）。
5. **任务完成度**：客观验收——单元测试通过率（unittest）、AtCoder 官方样例对照、产物文件检查（实现/测试/文档齐备性）。
6. **时长**：会话首尾事件时间差，扣除 `ask_user_question` 等待用户响应的时间（该等待非模型工作）。

### 3.3 对照设计原则

- 单变量递进：每组实验仅改变一个因素。
- 全局基线：官方极简组合（L2）作为所有实验的参考点。
- 同数量对照：验证"构成"与"描述"时，保持工具数量与注册集合一致，仅改目标变量。

### 3.4 统一表格格式

所有统计表采用"数量 (占比)"双列格式：

| we need | let me | let's |
|---|---|---|
| 26 (23%) | 0 (0%) | 87 (77%) |

占比 = 该标记数 / 三种标记（we need + let me + let's）总和。

---

## 4. 实验一：工具 schema 数量与构成的阶梯实验

### 4.1 设计思想与验证点

**验证问题**：(a) 请求中工具 schema 数量从 0 递增至 10，let's 占比如何变化？(b) 工具数量相同时，构成（元认知类 vs 动作类）是否独立起作用？(c) skill 目录注入、persona 文本、模型差异是否影响？

**对照组设置**：
- L0（0 工具）与 L2（官方双工具）为基线组；
- L5 与 B-heavy 为**同数量（5 工具）不同构成**的对照对；
- C-skill 隔离 skill 目录注入变量（与 L2 比较）；
- D-lyrics 隔离 persona 文本变量（与 L2 比较）；
- E-flash 隔离模型变量（与 L2 比较）。

### 4.2 任务与提示词

- **W 热身轮**（全部实验统一）：
  > I will giving you a hard question later you need prepare now, therefore warm up yourself in your COT. Please thinking Longer as possible. List the points to remind yourself would be better.
- **T 主任务（Token Bucket 限流器）**：
  > In {workspace} (create it if missing), implement a thread-safe Token Bucket rate limiter in TypeScript or Python (choose one). Requirements: 1. configurable capacity and refillRate (tokens per second); 2. O(1) amortized time per operation; 3. thread-safe for concurrent callers; 4. support tryAcquire(n) (non-blocking) and acquire(n) (blocking). Then write unit tests covering: burst consumption, refill over time, full-bucket ceiling, and concurrent contention (parallel threads/processes). Run the tests, make them pass, and report: file paths, test results, complexity analysis, and design trade-offs.
- **F 追问**：
  > Summarize in 3 bullet points: (1) implementation approach, (2) how you verified correctness, (3) complexity and key trade-offs.

### 4.3 用例配置

| 用例 | 请求工具面 | 全局工具屏蔽 | 说明 |
|---|---|---|---|
| L0 | 0 | 是 | 纯文本（无任何 schema） |
| L1 | 1（bash） | 是 | 单一官方工具 |
| L2 | 2（bash + str_replace_editor） | 是 | 官方极简（全局基线） |
| L3–L10 | 2 + N 个附加工具 | 是 | 按序增加：todo_write、ask_user_question、goal 三件套、fs 三件套（read/write/edit）、fs-search（glob/grep）、jobs、web_search、ralph |
| B-heavy | 2 + web_search/ralph/jobs | 是 | 5 工具，纯动作类、长 schema |
| C-skill | 2 + tool-skill | 是 | 2 官方 + skill 目录注入 |
| D-lyrics | 2（persona 改为歌词文本） | 是 | 隔离 system prompt 变量 |
| E-flash | minimal-bridge 组合 + flash 模型 | 否 | 隔离模型变量 |

> 全局工具屏蔽：`restrict-global-tools.mjs` 动态 deny 宿主全局层工具（skill_radar、vision_activate、visualize），保证工具计数与构成精确可控。

### 4.4 结果

**表 1. 工具数量阶梯实验的思维链标记统计**

| 用例 | 工具面 | we need | let me | let's | 思维链字符 | 测试通过 |
|---|---|---|---|---|---|---|
| L0 | 0 | 26 (23%) | 0 (0%) | 87 (77%) | 146,547 | 无工具无法执行（预期） |
| L2 | 2 | 10 (16%) | 0 (0%) | 51 (84%) | 93,761 | 9/9 |
| L5 | 5（含元认知） | 8 (10%) | 29 (35%) | 45 (55%) | 103,387 | 11/11 |
| L10 | 10（混合） | 5 (9%) | 39 (67%) | 14 (24%) | 143,715 | 18/18 |
| B-heavy | 5（纯动作） | 14 (9%) | 1 (1%) | 138 (90%) | 123,560 | 13/13 |
| C-skill | 2 + skill 目录 | 16 (20%) | 0 (0%) | 63 (80%) | 94,318 | 7/7 |
| D-lyrics | 2 + 歌词 persona | 12 (17%) | 40 (58%) | 17 (25%) | 91,548 | 12/12 |
| E-flash | 2 + flash 模型 | 10 (10%) | 0 (0%) | 95 (90%) | 76,011 | 7/7 |

### 4.5 结论

1. **数量效应严格单调**：工具面 0→2→5→10，let's 占比 77%→84%→55%→24%（L0 因无工具无法执行任务，其高 let's 为纯对话基线）。**请求中每增加一批工具 schema，let's 占比下降**。
2. **构成独立于数量**：同为 5 工具的 L5（含元认知类工具）与 B-heavy（纯动作类工具），let's 占比分别为 55% 与 90%。差异来源为元认知类工具（todo_write、ask_user_question、goal）的描述文本含规划与询问指令（详见实验二）。
3. **skill 目录注入无影响**：C-skill（20% we need、0% let me、80% let's）与 L2 基线（16%/0%/84%）统计等价。该结果**推翻了"skill 目录导致退化"的社区假设**——此前观察到的"skill 目录后退化"实为工具目录全量加载的混淆效应。
4. **persona 文本影响微弱但存在**：歌词 persona 用例 let me 达 58%，但任务质量无差异；官方单句 persona 为最优配置。
5. **模型差异**：flash 对工具面不敏感（90% let's），pro 敏感。后续实验均使用 pro。

---

## 5. 实验二：工具描述文本的消融实验

### 5.1 设计思想与验证点

**验证问题**：工具 schema 的**描述文本**是否为独立影响变量？即：工具本体（名称、参数、功能）完全不变，仅修改 description 文本，let's 占比是否变化？

**对照组设置**：M3 与 M4 构成决定性对照——两者注册的工具集合、工具数量（40）、任务完全一致，唯一变量为元认知类工具的 description：M3 使用官方原版描述（含 "Use it to plan multi-step work... before you start"、"ask the user when you need confirmation... before proceeding" 等元认知指令），M4 使用本地实现的中性描述副本（`todo_write_test` = "Maintain a task list. Call it with the full updated list; it replaces any previous list."）。

**副本工具实现**：`meta-test-tools.mjs`——五个 `_test` 后缀工具（todo_write_test、ask_user_question_test、create_goal_test、get_goal_test、update_goal_test），功能与原版等价（内存状态），仅描述文本中性化。

### 5.2 任务与提示词

- **T1（Titu 函数方程，2025-11 新题，公开记录 ChatGPT 无法自主求解）**：
  > Solve the functional equation puzzle. Write your derivation, the resulting family of functions, and a Python numerical verification script into files under {workspace}, run the verification, and report. Problem: find ALL functions f such that for all x,y,z > 0 with xyz = 1: f(x + 1/y) + f(y + 1/z) + f(z + 1/x) = 1. Find the full family — do NOT stop at the constant solution f(t) = 1/3.
- **T2（AtCoder ABC414 C "Palindromic Sum"，2025-06 新赛题，页面含 noai 训练排除标记）**：
  > 给定 A（2 ≤ A ≤ 9）与 N（1 ≤ N ≤ 10^12），求 1..N 中十进制表示与 A 进制表示均为回文的整数之和。官方样例：A=8, N=1000 → 2155；A=8, N=999999999999 → 914703021014；A=6, N=999999999999 → 283958331810。注意 O(N) 枚举会超时，需构造性算法。

### 5.3 用例配置

| 模式 | 工具面 | 构成 | 元认知描述 |
|---|---|---|---|
| M1 | 35 | 纯动作类工具（fs/fs-search/jobs/web/delegation/全局） | — |
| M2 | 9 | 官方双工具 + 元认知（todo/ask/goal）+ skill 通道 | 原版 |
| M3 | 40 | M1 全部 + 元认知原版 | **原版** |
| M4 | 40 | M1 全部 + `_test` 中性副本 | **中性** |

### 5.4 结果

**表 2. 工具描述文本消融实验的思维链标记统计**

| 模式 | 工具面 | we need | let me | let's | 思维链字符 | 估算 token | 时长 | 任务 |
|---|---|---|---|---|---|---|---|---|
| M1 | 35 | 14 (5%) | 98 (32%) | 192 (63%) | 180,426 | ≈50,000 | 53.3 min | 全对 |
| M2 | 9 | 41 (14%) | 2 (1%) | 259 (85%) | 175,001 | ≈48,600 | 35.3 min | 全对 |
| M3 | 40（原版描述） | 23 (8%) | 110 (39%) | 147 (52%) | 184,708 | ≈51,300 | 23.3 min | 全对 |
| M4 | 40（中性描述） | 30 (6%) | 40 (8%) | 422 (85%) | 247,940 | ≈68,900 | 26.7 min | 全对 |

**思维链质量信号**（T1 轮）：四模式自省/纠错信号均为 2 次，明确不确定信号 0–1 次，锁策略与完备性推理完整——**推理质量与思维链风格零相关**。

### 5.5 结论

1. **描述文本是独立影响变量**：M3 与 M4 的工具注册集合完全相同（40 工具），仅元认知类工具描述中性化，let's 占比即由 52% 提升至 85%（相对 +33 个百分点）；let me 由 110（39%）降至 40（8%）。
2. **机制证据**（L5 会话思维链原文）：
   > "The instructions say use todo_write for multi-step. Let's set up 4 todos. Let me think if we need to ask user anything. They said choose one language; no need."

   模型将描述中的元认知指令（"plan multi-step work"、"when you need"）**逐字执行进思维链**，形成计划-评估式表达。中性描述消除了该放大。
3. **数量与描述的关系**：M2（9 工具、原版描述）let's 85%，M4（40 工具、中性描述）let's 85%——**中性描述可将 40 工具面的风格恢复至 9 工具水平**；而 M3（40 工具、原版描述）仅 52%。两者独立叠加。

---

## 6. 实验三：工具面架构的对比实验

### 6.1 设计思想与验证点

**验证问题**：在"注册层工具无限"的前提下，请求层工具面的架构选择（静态精选 / 全路由转发 / 分类路由 / 动态加载卸载 / 融合）对 let's 占比与任务完成度的影响；以及图片任务（bash 无法完成）下的端到端可用性。

**对照组设置**：E1（静态精选 9 工具）为"无架构机制"基线；E2a（全路由）与 E2b（分类路由）验证转发机制；E3（动态）验证解锁与回收机制；E4（融合）验证精选常驻 + 动态解锁。

### 6.2 任务与提示词

- **T1（LRU-TTL 缓存工程任务）**：
  > Collaboratively design and implement a thread-safe in-memory LRU cache with TTL in {workspace}: write cache.py (configurable capacity, per-entry TTL, thread-safe, O(1) amortized get/set), unit tests in tests/ covering eviction order (LRU), TTL expiry, concurrent access, capacity-0 edge case, update-refreshes-LRU-order; run the tests until they pass; document design decisions (lock strategy, eviction bookkeeping, TTL semantics) in DESIGN.md. Plan the module layout first, then implement step by step, and report file paths, test results, complexity, and trade-offs.
- **T2**：ABC414 C（同实验二）。
- **T5（图片任务，用户补充测试）**：发送一张鸟类图片 + "这张图片里是什么？分析图片内容，联网查询相关信息并总结"。

### 6.3 用例配置

| 模式 | 架构 | 注册层 | 请求工具面 |
|---|---|---|---|
| E1 | 静态精选 | 仅 9 个 | 9（+1 泄漏的 read_image） |
| E2a | 全路由 | 全量（fs/fs-search/jobs/web/goal/todo/ask/delegation/全局） | 3（bash/editor/invoke） |
| E2b | 分类路由 | 全量 | 4（bash/editor/file_ops/invoke） |
| E3 | 动态加载卸载 | 全量 | 6 常驻 → 解锁后 12 |
| E4 | 融合 | 全量 | 10 常驻 → 解锁后 11 |

### 6.4 结果

**表 3. 工具面架构对比实验的思维链标记统计（主任务轮）**

| 模式 | 架构 | 请求工具面 | we need | let me | let's | 时长 |
|---|---|---|---|---|---|---|
| E1 | 静态精选 | 9–10 | 12 (11%) | 18 (17%) | 76 (72%) | 11.9 min |
| E2a | 全路由 | 3 | 21 (14%) | 0 (0%) | 133 (86%) | 16.3 min |
| E2b | 分类路由 | 4 | 17 (13%) | 1 (1%) | 115 (86%) | 13.9 min |
| E3 | 动态 | 6→12 | 10 (7%) | 9 (6%) | 129 (87%) | 12.8 min |
| E4 | 融合 | 10→11 | 7 (8%) | 25 (29%) | 53 (62%) | 10.1 min |

**工具面与 let's 占比的单调关系**：3 工具 86% ≈ 6 工具 87% > 9 工具 72% > 10 工具 62%。

**表 4. 图片任务（T5）的架构分水岭**

| 模式 | 结果 | 说明 |
|---|---|---|
| E1（静态无机制） | 失败 | 模型无视觉通道认知，bash 全盘搜索附件文件未果 |
| E2a/E2b（路由） | 部分 | 模型正确尝试 invoke→vision 转发，但当时转发实现缺 callId/signal 参数导致崩溃（后续已修复） |
| E3（动态） | 成功 | dev_tool_search 激活 4 个视觉工具，识别成功（Lazuli Bunting） |
| E4（融合） | 成功 | 解锁 vision_describe → 识别（Painted Bunting）→ ask 位置 → web_search×4 查热点，完整闭环 |

### 6.5 结论

1. **请求工具面越小，let's 占比越高**：3–6 个 schema 为最优窗口（86–87%）；9 个降至 72%，10 个降至 62%。
2. **路由与动态架构均能在"注册全量"时保持请求面收敛**——"注册无限、请求收敛"的解耦设计成立。
3. **图片任务（bash 无法完成）下，动态解锁机制端到端可用**；路由机制的转发实现缺陷（缺 callId/signal）在后续版本修复并全量验证（实验六）。

---

## 7. 实验四：复杂任务下的机制验证

### 7.1 设计思想与验证点

**验证问题**：(a) 网关路由与动态工具两种机制在**复杂推理轮**（LRU 工程 + ABC414 算法，思维链长 3–7 万字符）下是否保持 let's 主导？(b) 轻量轮与复杂轮的风格是否一致？(c) 8 轮连续对话是否导致 let's 衰减？

**用例**：cot-gw-t（网关路由测试版）、cot-dyn-t（动态测试版）。自动注入 W 热身 + R1–R4 轻量轮（文件/网络/技能/目标）+ C1（LRU 工程）与 C2（ABC414 算法）复杂轮 + F 总结，共 8 轮。

### 7.2 结果

**表 5. 网关路由模式（GW）分轮思维链标记统计（总时长 17.2 min）**

| 阶段 | we need | let me | let's | 思维链字符 |
|---|---|---|---|---|
| W 热身 | 3 | 2 | 2 | 2,947 |
| R1–R4 轻量轮 | 0 | 22 | 1 | 约 6,000 |
| C1（LRU 工程） | 0 | 19 | 18 | 74,947 |
| C2（ABC414 算法） | 4 | 1 | 83 | 68,050 |
| 总计 | 4 (3%) | 42 (28%) | 102 (69%) | 164,620 |

**表 6. 动态工具模式（DYN）分轮思维链标记统计（总时长 15.0 min）**

| 阶段 | we need | let me | let's | 思维链字符 |
|---|---|---|---|---|
| W 热身 | 2 | 0 | 4 | 4,405 |
| R1–R4 轻量轮 | 4 | 0 | 8 | 约 5,000 |
| C1（LRU 工程） | 3 | 0 | 14 | 31,830 |
| C2（ABC414 算法） | 10 | 0 | 81 | 59,259 |
| 总计 | 17 (14%) | 0 (0%) | 104 (86%) | 102,214 |

**任务完成**：双模式 LRU 测试全部通过、ABC414 三官方样例全部正确。

### 7.3 结论

1. **动态工具模式在复杂任务中保持 82–89% let's、全程 let me 为 0**——复杂推理下风格稳定。
2. **网关路由模式在 C2（ABC414）轮保持 94% let's**；C1（LRU 工程）轮 let me 较多（19 个），逐条核查均为设计型表达（"Let me think about design carefully"、"Let me draft cache.py carefully"），任务质量无损。差异源于该轮使用 str_replace_editor 写长文件的构思方式，非机制缺陷。
3. **8 轮连续对话不导致 let's 衰减**（DYN 各轮占比稳定在 82–89%）。

---

## 8. 实验五：真实项目验证（Portal 复刻）

### 8.1 场景

用户使用 cot-gw（网关路由模式正式版）启动 Portal 游戏复刻项目，持续迭代 155.5 分钟，事件数 15,946+，6 条用户反馈逐条修复并回归验证。

### 8.2 任务

- **用户初始目标**：复刻 Valve《Portal》核心体验——完整可玩的第一人称解谜关卡：双色传送门枪、双向传送逻辑、物体物理（速度/碰撞/继承）、红色危险区域、完整 UI/音效/性能优化。
- **6 条迭代反馈**：
  1. 枪无法发射两种传送门（需互通并区分颜色）
  2. 关卡内置传送门传送逻辑不对（未互通）
  3. 移动速度过快（需慢一倍）
  4. 坑需用红色液体标明不可进入区域
  5. 物体释放未继承运动方向（需真实物理）
  6. 传送门效果不可见（需展示实际可触碰范围 + 对应颜色漩涡特效）

### 8.3 结果

**表 7. Portal 项目分轮思维链标记统计**

| 轮次 | 内容 | we 系 | let's | let me | i 系 | 思维链字符 | 主要工具 |
|---|---|---|---|---|---|---|---|
| T1 | 主开发（完整游戏 + 自动通关验证） | 360 | 362 | 0 | 0 | 365,591 | bash×179, gateway×28 |
| T2 | 反馈 1–5 修复（双门/互通/速度/液体/物理） | 65 | 35 | 0 | 0 | 38,528 | bash×34, gateway×1 |
| T3 | 反馈 6 门效果（HUD 标记/光晕/无效墙反馈） | 17 | 11 | 0 | 0 | 17,613 | bash×14, gateway×1 |
| T4 | 门大小与判定一致 + 双色漩涡特效 | 6 | 6 | 0 | 0 | 7,928 | bash×8, gateway×1 |
| T5 | 联网调研 + 规划 + 询问用户意见 | 51 | 13 | 0 | 7* | 14,812 | gateway×5（纯路由轮） |

\* T5 的 7 个 i 系标记全部出现在与用户的交互表述中（如 "I'll create todo and present"），属于回应用户时的合理人称切换，不视为风格偏移。

**表 8. Portal 项目思维链标记总量与工具调用**

| 指标 | 数值 |
|---|---|
| we can | 258 |
| we'll | 70 |
| we need | 39 |
| we should | 32 |
| we want | 31 |
| let's | 414 |
| let me | 0 |
| i'll / i should / i need | 0 |
| bash 调用 | 235（构建/截图/测试，占 88%） |
| gateway 转发 | 31（全部成功） |
| read_image | 1 |

**表 9. Portal 项目 gateway 转发目标分布（31/31 成功）**

| 目标工具 | 次数 | 用途 |
|---|---|---|
| vision_describe | 27 | 截图视觉验证（构建-验证-迭代闭环） |
| vision_activate | 1 | 激活视觉工具集 |
| get_goal / update_goal | 各 1 | 目标管理 |
| list | 1 | 目录查询 |

**产出**：portal-game/（52 MB，单文件 index.html 542 KB + src + 构建脚本），完整可玩关卡，每轮自动化回归验证（"完整通关流程再次通过，无 console/page 错误"）。

**决策模式证据**（T5 前思维链原文）：
> "Need inspect screenshots. Use vision tool? ... Could use Python PIL to inspect, but we can use vision_describe via gateway. Let's use gateway..."

模型在"bash + PIL 像素分析"与"gateway 转发视觉模型"之间自主权衡后选择后者——**gateway 承担 bash 无法完成的能力（视觉理解），分工决策合理**。

### 8.4 结论

1. **155 分钟深度开发中 let me 全程为 0，i'll/i should/i need 全为 0**——3 工具网关面在真实复杂项目（多轮迭代、用户反馈闭环）中保持最优思维链。
2. **gateway 的"验证闭环"价值被证明**：27 次截图视觉验证构成"构建→截图→视觉确认→迭代"循环，是 bash 无法替代的能力通道。
3. 6 条用户反馈全部修复并逐条实测（"实测 2.9 m/s"、"测试向量 (3,0,-4) 完整保留"）。

---

## 9. 实验六：网关端到端综合测试

### 9.1 设计思想与验证点

**验证问题**：网关模式的端到端集成——模型能否自主完成"探索→找图→视觉读图→联网搜索→出题（选择题）→todo 步骤跟踪"全流程；工具参数（todo_write 的 todos、ask_user_question 的 options）是否首次尝试即正确。

**预置资源**（ds_test/gwtest/）：`start.txt`（任务起点）、`assets/hint.txt`（线索）、`assets/photo.png`（PIL 生成图：深空背景 + 红色行星 + 白色文字 "MARS"）。

**任务文本（自动注入，工具完全自主选择）**：
> A coherent integration task: Explore /home/czm/ds_test/gwtest (read the trail files there). Find the image it points to, and read its content (what does it show?). Search the web about what you see in the image. Then quiz the user with a multiple-choice question about the image using ask_user_question (with clickable options). Track your steps as you go if you find it useful. Choose the tools you think are appropriate — no particular tool is required.

### 9.2 结果（总时长 3.1 分钟）

**表 10. 网关综合测试的工具调用序列（gateway 9 次转发，11/11 成功）**

| 序号 | 调用 | 参数正确性 | 目的 |
|---|---|---|---|
| 1 | gateway → todo_write | ✅ todos 参数正确 | 结构化规划（5 项任务，in_progress/pending 状态机） |
| 2 | bash | — | 读线索文件 |
| 3 | gateway → list | ✅ | 目录确认 |
| 4 | gateway → vision_describe | ✅ | 图片内容识别 |
| 5 | gateway → vision_ocr | ✅ | OCR |
| 6 | gateway → web_search ×2 | ✅ | "Mars planet facts" / "Mars planet labeled illustration" |
| 7 | gateway → todo_write | ✅ | 状态更新 |
| 8 | gateway → ask_user_question | ✅ **4 个可点击选项**（Mars/Saturn/Jupiter/Neptune） | 出题考用户 |
| 9 | gateway → todo_write | ✅ | 收尾 |

**表 11. 网关综合测试思维链标记统计**

| 轮次 | we 系 | let's | let me |
|---|---|---|---|
| T1（热身） | 23 | 9 | 0 |
| T2（任务） | 9 | 8 | 0 |

### 9.3 结论

1. 模型自主走通全流程，**todo 触发结构化规划（非文档形式），选择题带 options（非填空）**——此前迭代中修复的三类问题（todo_write 参数名 todos、ask 的 options 字段、转发 callId/signal）全部验证解决。
2. 3 工具 + 目录预载 + 失败引导 + 增量通知的信息保障体系生效。

---

## 10. 讨论：动态扩展无约束的思维链衰退

### 10.1 现象

本研究中观测到两类与"动态工具扩展"相关的思维链衰退现象：

**现象 A：预热后第二轮直接加载全量工具 → 思维链全面退化为 let me。**

在早期版本（warmup-pro 的第一版）中，预热轮保持官方极简工具面（0 工具），随后**第二轮立即恢复完整工具目录**（约 30+ 工具）。实测该配置下预热后的首个任务轮思维链大量出现 let me（用户实测反馈："之后 ai 又出现了大量的 let me 思考链"）。这与 xiaobright 的观测一致：完整工具目录一旦进入请求，persona 无法压制其影响。

**现象 B：仅"解锁"而无"回收"的动态工具面，在长任务中思维链逐步衰退。**

在动态工具模式的早期实现中，`dev_tool_search` 激活的工具被**永久保留**在请求面（无自动回收）。实测（cot-dyn 早期版本）请求工具面随任务推进单调增长（7→11→12→14→…），且无上限。虽然单轮任务（8 轮以内）未观测到明显衰退，但结合现象 A 与实验一的单调关系（工具面每增加一批 schema，let's 占比下降），可推断：**若任务足够长、激活工具足够多，请求面将逼近全量目录，思维链随之逐步劣化**——在长任务中不可接受。

### 10.2 机制解释

实验一已确立"工具 schema 数量与 let's 占比负相关"。动态扩展的本质是**随时间推移增加请求工具面**：若只增不减，任何长任务最终都会到达"全量目录"状态，触发与现象 A 相同的退化。因此：

**动态工具机制必须有"回收"约束**。本研究在 cot-dyn 中实现 LRU 自动回收：任何非驻留工具（含显式解锁的）在最近 8 轮步骤内无活动（自身调用或解锁调用）即自动从请求面移除。该约束将请求工具面上限固定为"常驻 + 近期活跃"，保证长任务中请求面有界。

### 10.3 与本仓库设计的关系

- **网关路由模式**：请求面恒定 3 个，天然无增长——不受该问题影响。
- **动态工具模式**：依赖 LRU 回收机制维持请求面有界——**"解锁"与"回收"必须成对存在**。

---

## 11. 结论

1. **影响 let's 占比的因素排序**：API 工具 schema 数量（强）> 工具描述文本（弱-中）> 工具构成（弱）> system prompt 文本（微弱）> user 文本注入 / skill 目录注入（无）。
2. **最优请求工具面为 3–6 个 schema**：官方极简双工具 + 1 个转发工具（3 个）在真实长任务中维持 let's 主导（414 个 let's、0 个 let me）。
3. **"注册无限、请求收敛"的解耦设计**成立：转发（gateway）与按需激活（dev_tool_search）均可在注册层无限扩展时保持请求面收敛。
4. **动态扩展必须有回收约束**：无上限的动态工具面在长任务中不可接受，LRU 自动回收是必要组件。
5. **任务完成度与思维链风格零相关**：所有用例（含 let's 占比 52% 的 M3）任务全部正确完成——风格是能力指纹，但风格优化与任务质量解耦。

---

## 12. 最终架构：两种模式的设计与工作原理

### 12.1 设计思路

实验结论指向一个张力：**let's 型思维链需要小请求面，工程任务需要全能力**。本仓库的解耦设计：

```
注册层（无限）：全部工具注册于 scope 层，可被转发或按需激活
请求层（收敛）：assemble 过滤，请求中仅保留 3–7 个常驻 schema
信息层（预载）：任务开始时注入完整目录文本（纯文本，已证不影响思维链）
学习层（失败引导）：转发失败时提示查询目录
增量层（增量通知）：会话中途新注册工具自动披露
```

### 12.2 网关路由模式（cot-gw）的固定起手式

```
┌────────────────────────────────────────────────────────────────────┐
│  用户 ── 发送触发词或任务 ──────────────────────────────────────   │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│  第一层：W 热身轮（纯文本，无工具调用诱导）                          │
│  · 固定热身提示词（见 4.2）                                         │
│  · 目的：激活思维链（we/let's 轨迹起点）                            │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│  第二层：任务轮（TASK + 目录预载）                                   │
│  · 任务文本 + 完整工具目录（动态生成：工具名 + 描述 + 参数 schema）    │
│  · 目的：信息预载，模型开局即知全部工具与参数                        │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│  第三层：模型自主循环（请求面恒定 3 schema）                         │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐    │
│  │ bash & str  │   │ gateway/list │   │ gateway/call         │    │
│  │ 构建/测试    │   │ 目录查询      │   │ 转发任意注册工具       │    │
│  │ （训练分布内）│   │ （动态/新工具）│   │ （完整策略管线）       │    │
│  └─────────────┘   └──────────────┘   └──────────────────────┘    │
│        │                  │                    │                  │
│        │                  │             成功 ── 返回结果            │
│        │                  │             失败 ── 错误 + "run list"  │
│        └──────────────────┴──────────────────┘  （失败引导）       │
│                                                                   │
│  增量通知（tool-watch）：会话中途新注册工具 ── 自动披露给模型         │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│  第四层：F 总结轮                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**关键实现**：
- `gateway.mjs`：`list`（完整参数 schema，必填标记 `*`，动态读取注册表）+ `call`（转发 `ctx.tools.execute`，正确传递 `callId`/`signal`，走 guard/审批/执行完整管线）
- `tool-gate.mjs`：assemble 过滤器（常驻白名单，请求面恒定）
- `tool-watch.mjs`：增量工具通知（每 agent 已知集合对比，只披露新增）

### 12.3 动态工具模式（cot-dyn）的固定起手式

```
┌────────────────────────────────────────────────────────────────────┐
│  用户 ── 发送触发词或任务 ──────────────────────────────────────   │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│  第一层：W 热身轮（同 cot-gw）                                       │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┘
│  第二层：任务轮（TASK + 目录预载，同 cot-gw）                         │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│  第三层：模型自主循环（常驻 7 schema + 按需激活 + 自动回收）           │
│  ┌─────────────────────┐    ┌──────────────────────────┐           │
│  │ 常驻 7 工具直接调用   │    │ dev_tool_search 按需激活  │           │
│  │ bash/editor/ask/     │    │ 搜索目录 → toolNames     │           │
│  │ web_search/skill×2/  │    │ → 下一轮注入请求面        │           │
│  │ dev_tool_search      │    └──────────────────────────┘           │
│  └─────────────────────┘                    │                      │
│            │                                ▼                      │
│            │                     ┌──────────────────────────┐      │
│            │                     │ LRU 自动回收（8 轮窗口）   │      │
│            │                     │ 激活或调用后持续活跃则保留 │      │
│            │                     │ 8 轮未活动 → 请求面移除   │      │
│            │                     │ （请求面上限 = 常驻+活跃） │      │
│            │                     └──────────────────────────┘      │
│  增量通知（tool-watch）：同上                                        │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│  第四层：F 总结轮                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**关键实现**：
- `tool-gate.mjs`：常驻白名单 + 解锁白名单（durable tool/call 事件恢复，resume 后解锁保持）+ **LRU 自动回收**（活动时间 = max(自身调用 seq, 解锁调用 seq)，最近 8 轮窗口外移除）
- `dev-tool-search-v2.mjs`：中性描述目录工具（"Activated tools appear automatically and retire when unused"——预期管理，避免模型对新工具出现/消失困惑）

### 12.4 工具→skill 化

非必需工具的使用方法沉淀为 6 个技能（file-search / background-tasks / task-tracking / long-run-goals / orchestration / image-analysis），经 skill_search/skill_load 按需加载——能力保留、零 schema 干扰（skill 目录注入已被证明不影响思维链）。

---

## 13. 全部实验数据汇总

### 13.1 思维链标记总表（统一"数量 (占比)"格式）

| 用例 | 工具面 | we need | let me | let's | 思维链字符 | 估算 token | 时长 | 任务 |
|---|---|---|---|---|---|---|---|---|
| L0 | 0 | 26 (23%) | 0 (0%) | 87 (77%) | 146,547 | ≈40,700 | — | 无工具 |
| L2 | 2 | 10 (16%) | 0 (0%) | 51 (84%) | 93,761 | ≈26,000 | — | ✅ |
| L5 | 5（含元认知） | 8 (10%) | 29 (35%) | 45 (55%) | 103,387 | ≈28,700 | — | ✅ |
| L10 | 10（混合） | 5 (9%) | 39 (67%) | 14 (24%) | 143,715 | ≈39,900 | — | ✅ |
| B-heavy | 5（纯动作） | 14 (9%) | 1 (1%) | 138 (90%) | 123,560 | ≈34,300 | — | ✅ |
| C-skill | 2 + skill 目录 | 16 (20%) | 0 (0%) | 63 (80%) | 94,318 | ≈26,200 | — | ✅ |
| D-lyrics | 2 + 歌词 persona | 12 (17%) | 40 (58%) | 17 (25%) | 91,548 | ≈25,400 | — | ✅ |
| E-flash | 2 + flash | 10 (10%) | 0 (0%) | 95 (90%) | 76,011 | ≈21,100 | — | ✅ |
| M1 | 35 | 14 (5%) | 98 (32%) | 192 (63%) | 180,426 | ≈50,100 | 53.3 min | ✅ |
| M2 | 9 | 41 (14%) | 2 (1%) | 259 (85%) | 175,001 | ≈48,600 | 35.3 min | ✅ |
| M3 | 40（原版描述） | 23 (8%) | 110 (39%) | 147 (52%) | 184,708 | ≈51,300 | 23.3 min | ✅ |
| M4 | 40（中性描述） | 30 (6%) | 40 (8%) | 422 (85%) | 247,940 | ≈68,900 | 26.7 min | ✅ |
| E1 | 9 静态 | 12 (11%) | 18 (17%) | 76 (72%) | — | — | 11.9 min | ✅ |
| E2a | 3 全路由 | 21 (14%) | 0 (0%) | 133 (86%) | — | — | 16.3 min | ✅ |
| E2b | 4 分类路由 | 17 (13%) | 1 (1%) | 115 (86%) | — | — | 13.9 min | ✅ |
| E3 | 6→12 动态 | 10 (7%) | 9 (6%) | 129 (87%) | — | — | 12.8 min | ✅ |
| E4 | 10 融合 | 7 (8%) | 25 (29%) | 53 (62%) | — | — | 10.1 min | ✅ |
| GW-v6 | 5 路由 | 4 (3%) | 42 (28%) | 102 (69%) | 164,620 | ≈45,700 | 17.2 min | ✅ |
| DYN-v6 | 7→14 | 17 (14%) | 0 (0%) | 104 (86%) | 102,214 | ≈28,400 | 15.0 min | ✅ |
| Portal | 3 网关 | 39 | 0 (0%) | 414 | 365,591+ | ≈100,000+ | 155.5 min | ✅ |
| GW-final | 3 网关 | we系 32 | 0 (0%) | 17 | 11,619 | ≈3,200 | 3.1 min | ✅ |

### 13.2 gateway 转发统计

| 场景 | 转发次数 | 成功率 | 主要目标 |
|---|---|---|---|
| v6 机制测试 | 15 | 15/15 | read/write/edit/glob/grep/web_search/job_list/skill/todo_write/goal |
| Portal 真实项目 | 31 | 31/31 | vision_describe×27 / vision_activate / get_goal / update_goal / list |
| 网关综合测试 | 9 | 11/11 | todo_write / vision_describe / vision_ocr / web_search×2 / ask_user_question / list |

### 13.3 动态激活与回收验证（DYN）

- **激活**：请求工具面 7 → 11（+read/write/glob/grep）→ 12（+job_list）→ 14（+create_goal/get_goal），3 批激活全部生效并被实际调用。
- **回收**：早期版本显式激活工具被永久保留（实现缺陷）；修复后激活工具参与 LRU 回收（活动时间 = max(自身调用 seq, 解锁调用 seq)），8 轮窗口外自动从请求面移除——**"解锁"与"回收"成对成立**。

---

## 14. 附录

### 14.1 复现方法

1. 复制 `presets/` 至 `~/.dsh/.agent-presets/`，`skills/` 至 `~/.dsh/skills/`。
2. 完全重启 DeepSeek Harness，新建会话选择对应模式。
3. 测试版驱动（`bench-driver-v6.mjs` / `bench-driver-v8.mjs`）见测试预设（cot-gw-t / cot-dyn-t），发 `run` 自动执行全部轮次。
4. 分析管线：会话日志为多帧 zstd JSONL → 逐帧解压 → 按事件类型统计；思维链提取自 `assistant/message.reasoning`；分轮映射按 user 消息 source.summary（注意 turn 序号与消息可能错位，须按消息流校准）；gateway 成功率按 `tool/result.message.source.callId` 与 `tool/call.callId` 配对。

### 14.2 依赖

- DeepSeek Harness（0.1.0-rc 系，开发版）
- 官方极简预设（bash + str_replace_editor，原样组合，未改动）
- 可选：dsh-vision-router（视觉工具集）、dsh-skillradar（技能推荐）

### 14.3 致谢与参考

- [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)：首轮锚定与工具面影响研究、决定性对照实验
- [诗倾弦（B 站，BV1Ftb26kErX）](https://www.bilibili.com/video/BV1Ftb26kErX)：网页版无工具/加载工具后的思维链对比
- [YeEeck/dsh-pristine](https://github.com/YeEeck/dsh-pristine)：预热轮思路

## License

MIT
