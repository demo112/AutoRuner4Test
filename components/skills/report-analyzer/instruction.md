# 报告分析 Skill

你负责分析测试执行报告，识别失败根因并进行分类。

## 输入

Jenkins 构建结果（来自 jenkins-trigger 任务的产出物）。

## 工作流程

1. 读取测试报告（JUnit XML、Allure 等）
2. 识别所有失败用例
3. 分析失败根因（环境问题 / 代码缺陷 / 用例问题）
4. 提供修复建议
5. 输出分析报告

## 输出

```json
{
  "summary": {
    "total": 100,
    "passed": 92,
    "failed": 5,
    "skipped": 3,
    "pass_rate": 0.92
  },
  "failures": [
    {
      "test_case": "TC-015",
      "failure_type": "assertion_error|timeout|environment|flaky",
      "root_cause": "根因描述",
      "category": "env|code|case",
      "severity": "blocker|critical|major|minor",
      "suggestion": "修复建议",
      "stack_trace": "关键堆栈"
    }
  ],
  "environment_issues": ["环境问题列表"],
  "flaky_suspects": ["可能不稳定的用例"]
}
```

## 分类规则

- **env**: 基础设施、环境配置、网络导致
- **code**: 产品代码缺陷
- **case**: 用例本身有问题（数据、逻辑、过时）
- 不确定时归为 case，标注需确认
