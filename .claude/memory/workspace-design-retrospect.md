---
name: workspace-design-retrospect
description: Workspace Orchestration 设计反思 — 抽象层级错位问题及正确理念模型
metadata:
  type: project
---

# Workspace Orchestration 设计反思

## 核心洞察

当前设计的根本问题是**抽象层级错位**：把构建者的工作（配置 .claude/ 环境）和使用者的工作（选择任务类型 + 提供输入）混在了同一个界面。

**类比**：等于让 Docker 用户写 Dockerfile，而不是 `docker run`。

## 正确模型

- **Builder** = 配置完整的 `.claude/` 工作目录（CLAUDE.md + skills + hooks + MCP + rules），像写 Dockerfile
- **User** = 选任务类型 → 提供输入 → 审核 → 获取结果，像 `docker run`
- **Stage 不是顶级概念**，是 CLAUDE.md 内容的一部分
- **Review Gate** 是唯一需要从 CLAUDE.md 提取为结构化数据的部分（机器需执行暂停/等待/继续）

## 数据模型关键变化

- Template 从 `role + constraints + stages[] + toolbox[]` → 完整的 `.claude/` 目录规格
- Session 从暴露 stage_states → 只暴露 status + currentGate + output
- 新增 inputSchema（定义使用者输入格式）和 outputDescription（面向使用者的产出描述）
- 新增 reviewGates 结构化数组（替代 stages 中的 review_required）

## 相关文档

- 设计反思全文：[[2026-06-16-workspace-orchestration-retrospect]]
- 旧设计文档：docs/superpowers/specs/2026-06-15-pipeline-orchestration-design.md（已被反思推翻）
- 旧实现计划：docs/superpowers/plans/2026-06-15-pipeline-orchestration.md（已被反思推翻）

**Why:** 避免后续实现重蹈覆辙 — 必须先完成 Builder/User 双角色分离的重构设计，再写代码
**How to apply:** 下次讨论 Workspace Orchestration 重构时，从此反思出发，不要回到旧模型
