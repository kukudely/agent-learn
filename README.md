# agent-learn

> 第一次使用：请先阅读 [JS/TS 初学者从这里开始](docs/steps/START_HERE.md)。
一个通过亲手实现 Coding Agent 来学习 Agent Runtime 的 TypeScript 项目。

## 学习路线

完整路线和独立步骤手册：

- [从零实现 Coding Agent：分步骤学习与实现计划](docs/AGENT_LEARNING_PLAN.md)
- [35 个步骤的独立实现手册与测试入口](docs/steps/README.md)

路线按照技术依赖关系组织，从最小 Agent Kernel 开始，逐步实现工具、文件与
Shell、权限、会话、上下文压缩、Skills、MCP、多 Agent、沙箱和评测。

## 环境要求

- Node.js 22 或更高版本
- npm 10 或更高版本

## 常用命令

```powershell
npm install
npm run start
npm run typecheck
npm test
npm run lint
npm run build
```

完成一个步骤后：

```powershell
# 只运行当前步骤验收，便于调试
npm run verify:step -- 08 --only

# 累计运行步骤 00 到 08
npm run verify:step -- 08

# 最终运行全部步骤
npm run verify:all
```

## 当前状态

项目目前包含工程骨架、35 份步骤手册和 35 个步骤验收契约，尚未实现 Agent
功能。日常 `npm test` 不会加载未来关卡；完成某一步后创建对应测试 adapter，再用
`npm run verify:step -- XX` 做累计验证。
