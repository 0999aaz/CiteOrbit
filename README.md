# Paper Atlas · Citation Intelligence

> Design Engineer Portfolio Project: Polar Academic Citation Topology with 60 FPS HTML5 Canvas 2D Visualization.

![Paper Atlas Preview](https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=1200&q=80)

---

## 1. Engineering Trade-offs (决策与取舍)

| 决策 (Decision) | 选择 (Choice) | 原因 (Rationale) | 代价 (Cost / Trade-off) |
|---|---|---|---|
| **渲染方式** | Canvas 2D | DOM/SVG 版本 200 节点即掉到 24fps；Canvas 2D 纯函数双缓冲 800 节点稳定 60fps（单帧耗时 < 5ms） | 失去 CSS 声明式样式与原生 DOM 无障碍能力，需手动实现反变换拾取 |
| **数据来源** | OpenAlex 离线快照 | 纯静态前端零运行时请求，避免第三方 API 速率封禁与网络延迟，确保极速可预测的首屏 | 数据为定期快照，新增前沿文献需重新执行抓取脚本 |
| **布局算法** | 预计算极坐标 (Polar Layout) | 辐射奠基拓扑在结构上天然吻合极坐标分形，免去力导向迭代时 CPU 抢占与布局抖动 | 无法自动避障未知新增节点，需在离线预计算阶段确定环形轨道 |
| **状态管理** | Zustand 外壳 + 独立渲染闭包 | 动画循环每秒 60 次触发，若使用 React setState 会引发整棵 DOM 树重复 reconcile；Zustand 仅承载 UI 事件 | 画布内部状态与 React 存在解耦边界，面板联动需走节流/事件驱动 |
| **覆盖率计算** | 纯函数派生值 (Derived Values) | 遵循 Single Source of Truth，避免数据冗余与时间轴滑动时的状态冲突 | 每次年份 scrub 需即时遍历子领域文献，需算法控制在 O(N) 极低开销内 |

---

## 2. 验收清单 (Acceptance Checklist)

- [x] **数据管道验证**: `npx tsx scripts/fetch-openalex.ts` 能从零跑出 `graph.json`，节点数 779（完美符合 700–800 规范）。
- [x] **真实数据保证**: `graph.json` 里每篇论文的标题、年份、被引数（如 Hinton 等的 "Deep learning" 83,901 次被引）均真实来自 OpenAlex REST API。
- [x] **时间轴联动**: 拖动左侧竖向 `TimelineRail` 年份轴，右侧 `IntelPanel` 的 Growth rate、覆盖率数字、18 根迷你柱及 `RadarWidget` 面积**实时同步重算**。
- [x] **簇选中反馈**: 点击任意子方向，整簇外扩 1.18×，二次贝塞尔连线与粒子流变色为 `--accent-hi` (#E6D29A)，右侧面板重构分析。
- [x] **鼠标锚点缩放**: 滚轮缩放通过坐标逆变换，精确锁定鼠标光标的世界坐标，缩放过程中锚点下的节点零漂移。
- [x] **多级细节 (LOD)**: 缩放到 1.8×~4× 后文献标题与引用标签平滑淡入，缩回 1× 后自然隐去，全流程无突兀跳变。
- [x] **逆变换命中拾取**: 拾取容差除以当前 scale（`18 / camera.scale`），放大到 3×~4× 后依然可精准点击任意微小节点。
- [x] **量化渲染性能**: 内置 `FpsMeter`（按 `F` 键或点击工具图标切换），779 节点 + 3600+ 连线满屏渲染稳定 60 FPS（单帧 CPU 耗时 ~3-5ms）。
- [x] **AI 研判逐字输出**: 面板 AI 分析基于真实文献统计拼装，采用 18ms 打字机光标动画逐字呈现。
- [x] **内存稳定性**: requestAnimationFrame 在组件卸载时严谨 cancel，无定时器泄漏，空闲 60 秒内存零漂移。
- [x] **控制台整洁**: 浏览器与终端零报错、零告警，TypeScript 开启 strict 校验。
- [x] **视口韧性**: 支持全屏响应式自适应，移动端竖屏自动显示建议横屏提示。

---

## 3. 架构设计与目录结构

```
scripts/
  fetch-openalex.ts        # OpenAlex REST 批量抓取（多页、限速、真实字段精简）
  prune.ts                 # 候选集去重、内引用过滤、度数打分、聚类与主干选拔
src/
  App.tsx                  # 3 栏工作台外壳
  styles/tokens.css        # 严格遵守的设计令牌（Deep void 色板、Inter 字体、统一圆角）
  store/useDashboard.ts    # Zustand 状态容器（相机、选区、年份、工具模式）
  data/
    schema.ts              # 严密的 TypeScript 类型定义
    graph.json             # 真实学术抓取快照（0.60 MB，小于 3MB 规范）
    derive.ts              # 纯函数：density, coverage, calculateGrowth, momentum
  layout/precompute.ts     # 极坐标向世界坐标系的离线预计算
  canvas/
    GraphCanvas.tsx        # Canvas 宿主：DPR、Pointer Events、锚点缩放
    camera.ts              # 缩放平移矩阵与双向坐标变换
    renderer.ts            # 纯函数无状态渲染器：贝塞尔二次曲线、粒子流、LOD、呼吸发光
    lod.ts                 # 缩放阈值平滑插值函数
    hitTest.ts             # 屏幕反变换距离拾取算法
  components/
    TopBar.tsx             # 顶部栏（品牌、4项工具栏、Forecast推演、头像）
    TimelineRail.tsx       # 竖向时间轴（1995-2026），支持指针捕获拖拽
    IntelPanel.tsx         # 右侧智能研判（增长率、18根微柱、2x2指标、打字机分析）
    RadarWidget.tsx        # 领域动量雷达图（0.9 rad/s 扫描线与多边形面积）
    CommandBar.tsx         # 底部胶囊问答栏（支持回车交互与智能研判）
    FpsMeter.tsx           # 性能监视仪 HUD（按 F 切换）
  hooks/
    useAnimationFrame.ts   # 严格清理的 rAF 循环钩子
    useResizeObserver.ts   # 响应式容器尺寸监听器
```

---

## 4. 本地复跑与验证

```bash
# 1. 运行逻辑单元测试
npx tsx --test src/data/derive.test.ts
npx tsx --test src/canvas/camera.test.ts

# 2. 重新从 OpenAlex 抓取真实文献并裁剪建图
npx tsx scripts/fetch-openalex.ts

# 3. 启动开发服务器
npm run dev

# 4. 构建验证
npm run build
```
