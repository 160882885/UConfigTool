# UConfigTool

## 操作演示

<video controls preload="metadata" width="100%">
  <source src="https://gitee.com/zhangxueming1996/uconfig-tool/raw/master/docs/media/operation-demo.mp4" type="video/mp4" />
  您的浏览器不支持 video 标签，可使用下方链接查看视频。
</video>

备用链接：
- [Gitee Raw 视频地址](https://gitee.com/zhangxueming1996/uconfig-tool/raw/master/docs/media/operation-demo.mp4)
- [仓库内视频文件](docs/media/operation-demo.mp4)

`UConfigTool` 是一个基于 `Electron + React + TypeScript` 的开源配置工具，面向游戏/客户端/服务端项目中的配置编辑与代码生成场景。

本项目适合作为公开仓库长期维护，支持可视化配置管理、JSON 导出、多语言类型代码导出，以及 Windows 安装包分发。

## 功能特性

- 可视化管理配置类型与配置表
- 支持配置字段定义（基础类型、数组、嵌套类型）
- 支持配置表内容编辑与保存
- 配置导出
- 选择配置类型导出 JSON
- 选择编程语言导出类型代码
- 已支持导出语言：
- `C#`
- `Lua`
- `TypeScript`
- `Python`
- `Java`
- `Go`
- `C++`
- `Rust`
- 桌面端工程化能力
- 主进程/渲染进程/共享层分层
- 类型化 IPC 通信模型
- 可打包 Windows 安装包（NSIS）

## 运行环境

- Node.js 18+
- npm 9+
- Windows（当前主要打包目标）

## 快速开始

```bash
npm install
npm run dev
```

## 常用命令

- `npm run dev`：启动开发环境（Vite + Electron）
- `npm run build`：构建渲染层
- `npm run build:electron`：编译主进程与 preload
- `npm run typecheck`：类型检查
- `npm run test`：运行测试
- `npm run check:all`：完整质量门禁检查
- `npm run dist:win`：打包 Windows 安装包

## 打包发布（Windows）

```bash
npm run dist:win
```

安装包输出目录：

- `release/`

默认安装包文件名示例：

- `UConfigTool Setup 1.0.0.exe`

## 导出目录结构（示例）

当在应用中执行导出后，目标目录下默认会生成：

- `类型文件夹/`：按所选语言输出类型代码
- `配置表文件夹/`：按所选配置类型输出 JSON 配置表

## 项目结构（简要）

- `src/renderer/`：渲染层界面与交互逻辑
- `electron/main/`：主进程（窗口、IPC、配置存储、导出服务）
- `electron/preload/`：安全桥接 API（`window.appApi`）
- `shared/`：主/渲染共享类型与协议
- `docs/`：架构、规范、发布文档

## 文档索引

- [架构说明](docs/ARCHITECTURE.md)
- [开发约定](docs/CONVENTIONS.md)
- [上手指南](docs/ONBOARDING.md)
- [发布说明](docs/RELEASE.md)
- [项目结构](PROJECT_STRUCTURE.md)
- [详细结构说明](docs/PROJECT_STRUCTURE_DETAILED.md)

## 开源维护建议

建议在 Gitee 仓库中补充以下内容，便于公开协作：

- `LICENSE`（推荐 MIT）
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`（可选）
- Issue / PR 模板（可选）

## 贡献方式

欢迎提交 Issue 和 Pull Request：

1. Fork 仓库并创建功能分支
2. 完成开发并通过本地检查（`npm run check:all`）
3. 提交 PR，说明变更目的与影响范围

## 免责声明

本项目按“现状”提供，使用者需根据自身业务场景进行验证与适配。
