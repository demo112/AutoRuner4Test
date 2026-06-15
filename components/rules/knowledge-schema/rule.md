# 知识条目格式规范

## 必须四段

每条知识必须包含完整的四个段落：

1. **问题**：描述了什么问题或场景
2. **根因**：问题的根本原因分析
3. **解法**：如何解决或应对
4. **适用场景**：什么情况下可以复用此知识

## Frontmatter

每条知识必须有 frontmatter：

```yaml
---
type: pattern | lesson | defect_pattern | script_template
source_task: task-uuid
tags: [tag1, tag2]
created: YYYY-MM-DD
---
```

## 禁止
- 不允许只有解法没有问题（无法判断适用场景）
- 不允许根因为"未知"（如启用 require_root_cause）
- 不允许没有标签（至少 1 个）
