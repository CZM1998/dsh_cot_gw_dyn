# dsh-cot-presets

> 📚 **实验文档**：[`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md) —— 20+ 组对照实验的完整数据、方法与结论

DeepSeek Harness 思维链保护预设：**网关路由模式（cot-gw）** 与 **动态工具模式（cot-dyn）**。

基于 [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) 与 B 站 [诗倾弦](https://www.bilibili.com/video/BV1Ftb26kErX) 的研究，并经我们 20+ 组对照实验重新确认（[完整实验文档](docs/EXPERIMENTS.md)）验证：模型思维链风格强受 **API 工具 schema 数量** 影响、弱受 **工具描述文本** 影响、不受 **user 文本/skill 目录** 影响。本仓库的两个预设把**请求工具面收敛到最优窗口（3 或 7 个 schema）**，同时通过转发/解锁机制保留**无限工具拓展能力**——工具数量增长不导致思维链退化。

## 核心结论（一句话）

> **let's / we need 型思维链 ≈ 强 agent 能力指纹；它由"请求中可见的工具 schema 数量"决定，与"注册的工具总数"无关。** 收敛请求面、工具能力按需可达，即可两全。

## 包含内容

```
presets/cot-gw/    网关路由模式（推荐生产）—— 3 个常驻 schema
presets/cot-dyn/   动态工具模式 —— 7 个常驻 + 按需解锁 + LRU 自动卸载
skills/            6 个配套技能（工具→skill 化，按需加载）
docs/EXPERIMENTS.md 全部实验数据与结论
```

## 安装

### Linux / macOS

```bash
dsh_home="${DSH_HOME:-$HOME/.dsh}"
# 1. 安装预设
cp -R presets/cot-gw "$dsh_home/.agent-presets/cot-gw"
cp -R presets/cot-dyn "$dsh_home/.agent-presets/cot-dyn"
# 2. 安装配套技能（可选，供 skill_search/skill_load 使用）
mkdir -p "$dsh_home/skills"
cp -R skills/* "$dsh_home/skills/"
# 3. 完全重启 DeepSeek Harness，新建会话选择对应模式
```

### Windows（PowerShell）

```powershell
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
Copy-Item -Recurse .\presets\cot-gw (Join-Path $dshHome '.agent-presets\cot-gw')
Copy-Item -Recurse .\presets\cot-dyn (Join-Path $dshHome '.agent-presets\cot-dyn')
New-Item -ItemType Directory -Force (Join-Path $dshHome 'skills') | Out-Null
Copy-Item -Recurse .\skills\* (Join-Path $dshHome 'skills\')
```

## 快速开始

1. 完全重启 DSH（预设为启动时发现）
2. 新建空白会话 → 选择 **网关路由模式**（或 **动态工具模式**）
3. 直接开始任务

### 模式对比

| | 网关路由模式（cot-gw） | 动态工具模式（cot-dyn） |
|---|---|---|
| 常驻 schema | **3**：bash、str_replace_editor、gateway | **7**：bash、str_replace_editor、ask_user_question、web_search、skill_search、skill_load、dev_tool_search |
| 全能力可达 | `gateway list` 查看目录 + `gateway call` 转发 | `dev_tool_search` 按需激活工具 |
| 工具面变化 | 恒定 | 解锁后增长，8 轮未用自动卸载 |
| 典型 let's 占比 | 86-90%（零 let me） | 82-89%（零 let me） |
| 适用 | 追求极简 schema 与架构清晰 | 追求常驻核心工具 + 按需扩展 |

## 机制说明

### gateway（转发工具）

- `gateway list`：返回完整目录（工具名 + 描述 + **完整参数 schema**，必填带 `*`）——动态生成，**新注册的工具自动接入，零维护**
- `gateway call`：转发 `ctx.tools.execute`（走完整策略管线：guard/审批/执行）
- 失败引导：转发出错时自动提示 "run gateway list"（试错学习路径）
- 官方双工具 + gateway 共 3 个 schema = 实验验证的思维链最优窗口

### tool-watch（增量工具通知）

会话中途**新注册的工具**（用户动态添加插件、vision 工具激活等）自动以增量消息披露给模型——只列新增，纯信息，不指示使用时机。

### tool-gate（动态工具面状态机，cot-dyn）

- 常驻层（永不卸载）
- 解锁层：`dev_tool_search({"toolNames":[...]})` 激活 → 下一轮注入
- **LRU 卸载**：任何非驻留工具（含解锁的）8 轮未使用自动收缩

### 工具→skill 化

非必需工具的使用方法沉淀为 6 个技能（file-search / background-tasks / task-tracking / long-run-goals / orchestration / image-analysis），经 skill_search/skill_load 按需加载——能力保留、零 schema 干扰。

## 实验证据速览

| 配置 | we need | let me | let's |
|---|---|---|---|
| 官方双工具（minimal，L2） | 10 (16%) | 0 (0%) | 51 (84%) |
| 3 工具（网关路由，E2a） | 21 (14%) | 0 (0%) | 133 (86%) |
| 9 工具（精选静态，E1） | 12 (11%) | 18 (17%) | 76 (72%) |
| 40 工具（全量原版描述，M3） | 23 (8%) | 110 (39%) | 147 (52%) |
| 40 工具（描述中性化，M4） | 30 (6%) | 40 (8%) | 422 (85%) |
| Portal 真实项目（3 工具网关） | 39 | **0 (0%)** | **414** |

完整数据与 20+ 组实验详见 [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md)。

## 依赖

- DeepSeek Harness（开发版，0.1.0-rc 系）
- 官方极简预设（bash + str_replace_editor）——本仓库基于其原样组合扩展

## 注意

- 预设与本仓库同步时，`preset.yml` 的 name/description 为中文；可自行修改
- cot-dyn 的 LRU 卸载窗口（`retireRounds`）可在 `agent.cordis.yml` 的 tool-gate 行调整
- gateway 的可转发工具 = 当前 scope 注册的全部工具（含全局层）

## License

MIT
