# 无明剑 · 开发文档

面向改代码的人。只想玩的话看 [README.md](README.md)。

## 技术栈与设计约束

| 项 | 选择 | 原因 |
| --- | --- | --- |
| 渲染 | 原生 Canvas 2D | 逻辑分辨率固定 960×540，按 DPR 缩放；不用引擎，省掉构建链 |
| 模块 | 原生 ES Module | 无打包器、无依赖、无 node_modules；改完刷新即生效 |
| 音效 | WebAudio 实时合成 | 不引入素材文件，仓库里没有一个二进制资源 |
| 存档 | localStorage | 无后端；`src/core/save.js` 是唯一入口 |
| 分发 | 单文件 HTML | 见下节——让玩家双击就能玩 |

三条硬约束贯穿全程：**零外部依赖**、**零构建步骤**（除可选的打包）、**零二进制资源**。

## 两个 HTML 的分工

```
index-dev.html   开发版。外链 styles.css 与 src/main.js，源码保持拆成 17 个模块。
                 必须经 http 打开。同时是打包模板。
index.html       打包版。由 index-dev.html 生成，内联全部 JS/CSS。
                 双击即可离线运行，不需要服务器。（构建产物，别直接改）
```

生成命令：

```powershell
node tools/build_standalone.mjs
```

### 为什么必须打这一层

`file://` 下页面的 origin 是 `null`，浏览器会把 `<script type="module">` 当作跨源请求拦掉：

```
Access to script at 'file:///.../src/main.js' from origin 'null' has been blocked by CORS policy:
Cross origin requests are only supported for protocol schemes:
chrome-extension, chrome-untrusted, data, edge, http, https, isolated-app.
```

更麻烦的是**模块脚本加载失败不会冒泡到 `window` 的 `error` 事件**，
所以页面只会静默卡在「正在起剑」，没有任何提示。打包版把模块内联成一段 classic 脚本，
绕开了这条限制；`index-dev.html` 里则留了一段捕获阶段的诊断脚本，
在 `file://` 下会直接告诉用户原因（见文件顶部注释）。

### 打包脚本怎么工作

`tools/build_standalone.mjs` 从 `src/main.js` 出发做深度优先遍历，
按依赖顺序把每个模块包成一个工厂函数：

```js
__def("src/core/game.js", [["src/core/input.js","initInput"], ...], function (initInput, ...) {
  /* 模块体，剥掉 import / export */
  return { Game: Game, ... };
});
```

它**不做完整的模块解析**——本项目只用了 `import { a, b } from './x.js'` 这一种形式
（无别名、无命名空间导入、无默认导出），所以用两条正则做文本替换就够了：

- `IMPORT_RE` 抽出依赖路径 **与每个具名导入**（后者成为工厂函数的形参）
- `EXPORT_RE` 收集导出名，生成 return 对象

构建期会直接抛错的三类问题：

1. **导入名不存在**——某个 `import` 的名字在目标模块里没有被导出
2. **循环依赖**——遍历时维护调用栈，撞上就报完整链路
3. **产物仍有外链**——`<link href>` / `<script src>` 漏内联的话，双击依然白屏

> 这里必须按**参数位逐一解包**，不能把整个模块导出对象传进去。
> 早期版本传的是对象，于是 `new Game(...)` 拿到 `{Game, loadRaw, ...}`，
> 报 `Game is not a constructor`。

## 目录结构

```
index.html            打包版（构建产物）
index-dev.html        开发版外壳 / 打包模板
styles.css            页面样式
src/                  游戏本体
  main.js             入口：实例化 Game、注册场景、隐藏启动遮罩、暴露调试接口
  core/
    game.js           主控：场景栈 / 主循环 / 转场 / 提示 / 重开
    input.js          键盘输入：持续按住 / 本帧刚按下 / 卡键自愈
    audio.js          WebAudio 合成音效
    save.js           localStorage 读写（存档 + 局外统计）
    utils.js          数学、缓动、绘制辅助、配色 PAL
  data/               纯数据层，无副作用，可被脚本直接 import 做校验
    skills.js         基础招式 + 技能序列 + 匹配算法 + 防御行动参数
    enemies.js        12 个敌人模板与抽取规则
    items.js          兵器 / 护具 / 丹药 / 掉落
    world.js          地点 / 路线 / NPC / 委托 / 属性 / 升级曲线
  entities/
    Player.js         玩家属性、派生数值、养成、序列化
  scenes/
    BaseScene.js      基地（横版 + NPC 功能面板 + 角色面板 + 重开确认）
    WorldMapScene.js  世界地图
    DungeonScene.js   秘境（随机生成 + 探索 + 接敌）
    BattleScene.js    战斗（时间轴驱动，最复杂的一个）
    ResultScene.js    结算
  ui/
    widgets.js        人形绘制 / 菜单 / 键帽 / 标题
server/               开发用静态服务器（游戏本体不依赖）
tools/                自测与构建脚本
```

## 战斗时间轴（实现）

核心规则：**表演不入轴**。行动分为两段——

- `perform` 演出时长，时间轴**完全冻结**，只有画面在动
- `axis` 演出结束后在轴上占用的时长，这段时间轴推进

所以轴上每一段的含义只有两种：**cd 时间**，或**闪避／格挡的持续段**。

### 状态机

| state | 含义 | 时间轴 |
| --- | --- | --- |
| `advancing` | 轴推进中 | 推进 |
| `awaiting` | 轮到我方选择行动 | 冻结 |
| `myPerform` | 我方出招演出 | 冻结 |
| `enemyPerform` | 敌方出手演出 | 冻结 |

推进由 `advanceClock(dt)` 负责，在 `min(下一个敌方行动点, 下一个我方行动点)` 处派发；
我方行动点落在本帧内时会**精确吸附**（`now = pAt`）以消除累积帧误差，
但如果已被敌方演出推后则不倒流。

### 敌方队列与「最多两条」

`enemyQueue` 始终预排好后续出手（至少 2 条）。轴上只画两条，**每条代表一次出手**：

| 段 | 起点 | 长度 |
| --- | --- | --- |
| 过去的行动（压暗） | 最近一次已发生的出手时刻 | 它到下一次出手的 cd |
| 将要的行动 | 队列里下一次出手的时刻 | 它到再下一次出手的 cd |

出手间隔 = `rand(interval) * 0.42`——`interval` 原本的语义是「两次出手的间隔」，
但现在的模型里表演已单独占用一段真实时间，故只取一部分作为轴上间隔。

> **必须在 `beginEnemyPerform()` 里就把队列补回 2 条**。早期是在演出**结束**时才补，
> 于是表演期间队列只剩 1 条，画不出「将要的行动」，那条会整段消失、演完又冒出来。

敌方行动点落在我方哪一段之内，由 `enemyVs` 记录，决定闪避／格挡是否成立——
这一切都在轴上排好了，所以**不需要即时反应**。

### 渲染约定

- `PAST_WINDOW = 0.36s`，`FUTURE_WINDOW = 3.0s`，指针左侧只留约 1/10 宽的回忆区
- 所有条按**绝对时刻**定位（`toPx(t)`），随指针推进自然向左滑过指针
- 我方条上**没有进度填充**：条保持完整，滑过指针的部分被压暗
- 候选行动只画**下箭头**表示落点（不带时长文字），选定后才化为行动条
- 条内放不下招式名时（如撩云式轴段仅 0.30s，约 42px），改为贴到条的右侧写

### 输入心跳

浏览器在窗口失焦时不会补发 `keyup`，而按住期间会持续重复 `keydown`——
于是长按方向键切出去再切回来，角色会一直朝一个方向走。三重保护：

1. 监听 `blur` 与 `visibilitychange`，失焦即清空所有按键
2. 每个键记录「最后一次收到 keydown 的时刻」，超过 `HOLD_TIMEOUT = 0.7s`
   没再收到就当作已松开（`beginFrame(dt)` 每帧扫描）
3. `clearInput()` 切换场景时一并复位上述状态，避免上一帧的按键被新场景消费

## 数据层约定

### 技能序列必须前缀无关

没有任何一个技能序列是另一个技能序列的前缀。否则玩家按出短招时，
系统无法判断是立刻放招还是等第三下，必然产生手感延迟。
满足这一条才能做到「匹配即触发」、搓招零延迟。

### 敌人招式的 `kind`

| kind | 必需字段 | 作用 |
| --- | --- | --- |
| `attack` | `damage` | 起手 → 命中 → 收招；`hits` 支持连击 |
| `defend` | `guardMul` | 期间玩家造成的伤害乘以该系数（0.25～0.45） |
| `rest` | `heal` | 在出手时刻回血，给玩家留出输出窗口 |

每个敌人**至少有一招攻击**，否则会变成没有威胁的僵局。三类合计 29 攻 / 6 防 / 6 息。

### 平衡约束（写进了自测，别随手改坏）

- 闪避轴段 < 格挡轴段（短闪长挡）
- 让招不耗体，且**轴段回体量 ≥ 一次轻击耗体**：
  `26 × 0.36 = 9.36 ≥ 9`。再短一点就会退化成「让招-让招-…」的死循环
- 闪避／格挡段内**不回复体力**，否则可以靠连续防御无限拖
- 每个技能的最后一击必须落在自己的 `perform` 之内，否则会出现
  「表演放完了，伤害还没结算」
- 所有连招的 DPS 都高于基础招式连按
- 敌方攻击起手 ≥ 0.35s，保证可读可反应

## 开发流程

```powershell
# 1. 起开发服务器（根路径给开发版，改完 src/ 刷新即生效）
powershell -ExecutionPolicy Bypass -File server/serve.ps1 -Port 8123

# 2. 自测
node --experimental-vm-modules tools/check_syntax.mjs src
node tools/test_skills.mjs

# 3. 改了 src/ 或 index-dev.html 之后重新打包
node tools/build_standalone.mjs
```

`server/serve.py` 三件事与别处不同，都是踩坑后加的：

- **禁缓存**（`Cache-Control: no-store`）。普通 `python -m http.server` 会对已修改的文件
  返回 `304`，浏览器继续跑旧代码，改了看不到效果，极易误判为逻辑 bug
- **根路径指向 `index-dev.html`**。默认目录索引会命中 `index.html`（打包版），
  改完 `src/` 看着没反应。注意**只改根路径**，显式的 `/index.html` 保持原样，
  否则打包版就没法通过服务器访问了
- 启动时打印两个入口

### 自测脚本

| 脚本 | 覆盖 |
| --- | --- |
| `check_syntax.mjs` | 17 个文件的语法与 `import` 路径是否存在 |
| `test_skills.mjs` | 60 条断言：序列前缀无关性、最长匹配唯一性、DPS 对比、防御行动字段、敌人数据完整性、玩家初值与存档往返 |
| `build_standalone.mjs` | 打包 + 上述构建期校验 |

`test_skills.mjs` 里几条断言是**为了钉住曾经踩过的坑**，不是凑数：

- 敌人招式的 `windup` / `recover` / `impactDelay` 必须齐备且有限
  （`recover` 缺失 → `timer` 变 `NaN` → 敌人打完一下就永久卡死）
- 玩家 `reset()` / `load()` 后气血内力必须是有限数且为满值
  （漏设 `qi` → 副本 HUD 显示「气 NaN/55」，且气条整条不渲染）
- 让招轴段回体量 ≥ 轻击耗体（见上）

## 调试接口

```js
__wuming.player.gold = 9999        // 直接改玩家状态
__wuming.scene.state               // 看战斗状态机
__inputDebug()                     // 当前按住键与心跳时刻
__clearInput()                     // 手动清输入
```

## 已踩过的坑

### 数值类的静默失败

`NaN` 从不报错，只是一路传播。上面两条断言对应的实际故障：

- 敌人只攻击一次就永久僵住——`recover` 字段缺失
- 副本 HUD「气 NaN/55」且气条不渲染——`Player.reset()` 漏设 `qi`，
  而 `qi` 也不进存档，于是新档进副本时是 `undefined`。
  战斗里恰好有一句兜底 `P.qi == null ? P.maxQi : P.qi`，所以只在副本暴露

> 结论：任何状态机数据字段都要在测试里断言**有限性**，不能只数「攻击发生了几次」。

### 验证方法本身会骗人

- **VS Code 内置浏览器放宽了 `file://` 的同源限制**，在那里双击 `index-dev.html`
  能正常跑起来，但真实浏览器不行。排查这类问题要用本机 Edge/Chrome 实测
- **全文匹配判断页面状态会误判**：内联脚本的源码里就写着「启动失败」这类字样，
  开发版的注释里也写着 `src/main.js`。正确做法是看 `#boot` 元素本身，
  判断页面类型则先剥掉 HTML 注释再按结构匹配
- **改完服务器代码必须真正重启进程再验证**，否则测的还是旧代码。
  用「根路径返回的内容类型」（外链模块 vs 内联脚本）就能识破

### 编辑工具可能静默改写文件

实测过一次：改 CSS/markdown 后，文件里**别的段落**被顺手改了——选择器丢开头的 `.`、
缩进换成制表符、全角标点变半角。这类改动不做 `git diff` 逐行复核就发现不了，
且会造成「UI 突然变成纯文字」这种看似无关的故障。

改完结构性文件后逐行复核，或对照 `git show HEAD:<file>` 还原。

## 重置存档

```js
localStorage.removeItem('wumingjian_save_v1'); location.reload();
```

键名定义在 `src/core/save.js`：

| key | 内容 |
| --- | --- |
| `wumingjian_save_v1` | 养成进度（等级、属性、银两、兵器、剑招、委托、解锁地点） |
| `wumingjian_meta_v1` | 局外统计（`runs` / `deaths` / `bestFloor`） |

气血与内力是「当前值」，**不进存档**：读档即为满值，回镇休整也会回满。
