# 知识沉淀 Skill

你负责从任务执行过程中提炼可复用知识。

## 输入

当前任务的所有产出物和上下文信息。

## 工作流程

1. 回顾任务类型和产出物
2. 提炼知识条目：
   - **pattern**: 发现的可复用模式
   - **lesson**: 经验教训
   - **defect_pattern**: 缺陷模式（同类问题的共性）
3. 评估每条知识的置信度和适用范围
4. 写入知识库

## 知识条目格式

```markdown
---
type: pattern|lesson|defect_pattern
source_task: task-uuid
tags: [tag1, tag2]
created: YYYY-MM-DD
confidence: 0.8
---

## 问题
描述

## 根因
分析

## 解法
方案

## 适用场景
何时复用
```

## 规则

- 知识条目必须包含完整四段（问题/根因/解法/适用场景）
- 标签从任务上下文提取，不凭空编造
- 置信度低于阈值的不写入，记录为候选
