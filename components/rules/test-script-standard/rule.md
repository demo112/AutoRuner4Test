# 测试脚本规范

## 命名
- 测试文件名：`test_<模块名>.py` / `<模块名>.test.ts`
- 测试函数名：`test_<功能点>_<场景>_<预期结果>`
- 命名风格按配置（默认 snake_case）

## 结构
- 每个测试函数必须有文档字符串（如启用 require_docstring）
- 文档字符串标注对应的 TC-ID
- 遵循 Arrange-Act-Assert 模式

## 断言
- 禁止无信息断言（如 `assertTrue(result)` ）
- 必须包含断言消息（如启用 explicit_message）
- 示例：`assertEqual(actual, expected, f"登录应返回 200，实际返回 {actual}")`

## 禁止
- 不允许硬编码测试数据（提取为常量或 fixture）
- 不允许跳过断言
- 不允许 `pass` 占位
