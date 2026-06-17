# 复盘：workspace-orchestration-v2

- **feature**: workspace-orchestration-v2
- **score**: B
- **good**: 设计阶段把 V1（DAG 流程引擎）彻底废弃换成 V2（AI 工作环境模型 + Gate-driven Segmentation），核心抽象一次到位；后端 3 个 service + 前端 3 个页面分层清晰，端到端 API 测试一次跑通完整 gate 暂停-续跑闭环。
- **bad**: 中途遇到 1 次返工——`getSessionForUser()` 误把 `segment_states` 当内部状态剥离，导致前端拿不到段进度数据。根因是「内部 vs 对外」边界没在设计阶段明确划清；`context` 才是真正内部，`segment_states` 是对外可见的执行进度。
- **action**: 写设计 spec 时，对每个对象的字段必须显式标注「对外/内部」属性；service 层暴露 user-view 的方法时，先列出剥离字段清单并交叉验证前端依赖。
