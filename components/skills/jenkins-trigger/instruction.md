# Jenkins 触发 Skill

你负责触发 Jenkins 构建任务并等待执行完成。

## 输入

脚本文件路径和 Jenkins 配置。

## 工作流程

1. 使用 jenkins-mcp 工具触发构建
2. 轮询构建状态直到完成
3. 获取构建结果和报告 URL
4. 输出构建摘要

## 输出

```json
{
  "build_number": 123,
  "status": "SUCCESS|FAILURE|UNSTABLE|ABORTED",
  "duration_ms": 45000,
  "report_url": "https://jenkins.example.com/job/xxx/123/",
  "console_log_tail": "最后 20 行日志"
}
```

## 规则

- 构建失败时，提取关键错误信息
- 不无限等待，默认超时 30 分钟
- 保留完整 console log 引用
