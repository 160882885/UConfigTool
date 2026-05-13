# 项目结构与代码结构详细说明

本文档面向团队协作，解释模板的目录设计、职责边界、运行链路和扩展规则。

## 1. 总体分层

模板采用 Electron 典型三层架构：

- 主进程（Main Process）：负责窗口、生命周期、IPC、系统能力。
- 预加载层（Preload）：主渲染隔离桥，只暴露最小安全 API。
- 渲染层（Renderer）：UI 与业务交互层，不直接访问 Node/Electron 能力。
- 共享契约层（Shared）：跨进程类型、协议和返回模型。

核心原则：
- 渲染层不能直接 import 主进程代码。
- 主进程不能 import 渲染层代码。
- 跨进程通信必须经过 `shared/contracts.ts` 约束。

## 2. 目录级说明

### 2.1 `electron/main`

主进程入口与系统能力实现：

- `index.ts`：应用启动入口；等待 `app.whenReady`、注册 IPC、创建主窗口。
- `window.ts`：窗口创建与渲染资源加载策略（dev server / dist / fallback）。
- `security.ts`：窗口安全策略（拦截跳转、外链转系统浏览器）。
- `lifecycle.ts`：跨平台生命周期处理（激活、全部窗口关闭等）。
- `logger.ts`：主进程日志输出适配。
- `runtimeMeta.ts`：读取应用运行时元信息。
- `config/runtimeBootstrap.ts`：构造统一 `RuntimeBootstrap` 启动载荷（meta/capabilities/flags）。
- `ipc/channels.ts`：IPC 通道常量。
- `ipc/result.ts`：统一 `ApiResult` 包装器。
- `ipc/registerAppIpc.ts`：注册全部主进程 IPC handler。

### 2.2 `electron/preload`

- `index.ts`：通过 `contextBridge.exposeInMainWorld` 暴露 `window.appApi`。
- 原则：只暴露必要方法，不把 `ipcRenderer` 原样泄露给渲染层。

### 2.3 `src/renderer/app`

应用壳层与启动编排：

- `shell/AppShell.tsx`：页面壳体（TopMenuBar + SidebarTabs + 内容区）、运行时 bootstrap 展示、错误提示。
- `bootstrap/bootstrapRuntime.ts`：渲染层启动数据获取入口。
- `config.ts`：Tab 配置、壳体标题/品牌配置。
- `featureRegistry.ts`：特性组件注册清单与排序输出。

### 2.4 `src/renderer/features`

业务功能区：
- 每个功能一个独立目录。
- `_core/featureFlags.ts`：功能开关辅助函数。
- 当前默认仅保留 custom 功能页面作为业务实现起点。

### 2.5 `src/renderer/shared`

渲染层公共基础设施：

- `api/`：桥接 API 封装与统一解包（错误转换）。
- `components/`：通用 UI 组件（错误边界、侧栏、顶部菜单等）。
- `hooks/`：通用 Hook（如可拖拽分割面板）。
- `logging/`：渲染层日志工具。
- `state/`：运行时状态缓存（bootstrap/feature flags）。

### 2.6 `shared`

- `contracts.ts`：跨进程共享契约。
- 定义 `ApiResult<T>`、`RuntimeBootstrap`、`FeatureFlag`、`AppApi` 等。

### 2.7 `scripts`

模板运维脚本：

- `dev-runner.cjs`：开发模式下自动侦测可用 renderer URL 并拉起 Electron。
- `init-project.cjs`：模板初始化（项目名、产品名、appId、描述等）。
- `scaffold-feature.cjs`：自动生成 feature 文件并注册 tab/manifest。
- `template-doctor.cjs`：模板结构与契约完整性体检。
- `clean-template.cjs`：清理构建产物。

### 2.8 `docs`

团队文档体系：

- `ARCHITECTURE.md`：架构与边界。
- `CONVENTIONS.md`：开发约定。
- `ONBOARDING.md`：新成员上手。
- `RELEASE.md`：发布流程。

## 3. 关键运行链路

### 3.1 启动链路

1. `electron/main/index.ts` 启动主进程。
2. 注册 IPC、隐藏原生菜单、创建主窗口。
3. `window.ts` 根据环境加载 renderer（dev URL 或 dist）。
4. preload 注入 `window.appApi`。
5. `AppShell` 调用 `bootstrapRuntime` 获取 `RuntimeBootstrap`。
6. UI 根据 bootstrap 渲染状态、能力和开关。

### 3.2 IPC 链路

1. 渲染层调用 `appBridge`。
2. `appBridge` 通过 `window.appApi` 请求 IPC。
3. 主进程 handler 通过 `wrapIpc` 返回 `ApiResult<T>`。
4. 渲染层 `unwrapApiResult` 统一处理成功/失败。

## 4. 扩展规则

### 4.1 新增功能

优先使用：
```bash
npm run scaffold:feature -- <feature-id> [Feature Label]
```

脚本会自动：
- 创建 feature 页面文件。
- 更新 `AppTabId` 联合类型。
- 更新 tab 配置。
- 更新 feature 组件 manifest 注册。

### 4.2 新增 IPC 能力

必须同步改动：
1. `shared/contracts.ts` 增加类型。
2. `electron/main/ipc/channels.ts` 增加通道。
3. `electron/main/ipc/registerAppIpc.ts` 增加 handler。
4. `electron/preload/index.ts` 暴露 API。
5. `src/renderer/shared/api/appBridge.ts` 接入封装。

## 5. 高风险改动禁区

- 不要恢复原生应用菜单（必须保持 Toolbox 壳体验）。
- 不要让 renderer 直接访问 Node/Electron 原生对象。
- 不要绕过 `ApiResult<T>` 直接返回裸数据/抛错。
- 不要移除 `useSplitPane` 通用能力（这是模板的交互基线）。

## 6. 团队交付建议

每次提交前建议执行：
```bash
npm run check:all
```

如需快速检查模板结构一致性：
```bash
npm run doctor
```

