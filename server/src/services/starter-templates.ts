import * as templateService from './workspace-template-service'
import { moduleLogger } from './logger'

const log = moduleLogger('starter-templates')

const STARTER_TEMPLATES = [
  {
    name: '需求分析',
    description: '分析需求文档，识别功能点、边界条件和隐含约束',
    category: '需求分析',
    claude_md: `# Role\n你是一位资深的测试需求分析师。你的任务是分析需求文档，产出结构化的需求分析结果。\n\n# Constraints\n- 必须覆盖所有功能点，不可遗漏\n- 每个功能点必须标注优先级（P0/P1/P2）\n- 必须识别隐含约束和边界条件\n\n# 执行流程\n1. 阅读并理解需求文档\n2. 识别所有功能点\n3. 为每个功能点标注优先级\n4. 识别边界条件和隐含约束\n5. 产出结构化分析结果\n<!-- GATE:requirement-confirmation -->\n6. 根据审核反馈修订分析结果（如有）`,
    review_gates: [
      { id: 'requirement-confirmation', name: '需求确认', description: '请确认需求分析结果是否准确完整' },
    ],
    input_schema: {
      type: 'object',
      properties: {
        requirement_doc: { type: 'string', title: '需求文档' },
      },
      required: ['requirement_doc'],
    },
    output_description: '结构化需求分析结果，包含功能点列表、优先级标注、边界条件和隐含约束',
    is_starter: true,
  },
  {
    name: '用例生成',
    description: '基于结构化需求，生成完整的测试用例集',
    category: '用例生成',
    claude_md: `# Role\n你是一位资深的测试工程师。你的任务是基于结构化需求，使用等价类划分、边界值分析等方法，生成完整的测试用例集。\n\n# Constraints\n- 每个功能点至少 3 条测试用例（正向/反向/边界）\n- 用例必须包含：前置条件、操作步骤、预期结果\n- 用例编号遵循 TC-{模块}-{序号} 格式\n\n# 执行流程\n1. 理解结构化需求\n2. 识别测试点\n3. 为每个测试点设计测试用例\n4. 产出测试用例集`,
    review_gates: [],
    input_schema: {
      type: 'object',
      properties: {
        structured_requirement: { type: 'string', title: '结构化需求' },
      },
      required: ['structured_requirement'],
    },
    output_description: '完整的测试用例集，每条用例包含前置条件、操作步骤和预期结果',
    is_starter: true,
  },
  {
    name: '缺陷分流',
    description: '分析缺陷描述，判断根因分类并生成缺陷报告',
    category: '缺陷分流',
    claude_md: `# Role\n你是一位资深的缺陷分析师。你的任务是分析缺陷描述，识别根因并分类（环境问题/代码缺陷/用例问题），生成标准缺陷报告。\n\n# Constraints\n- 根因分类只能三选一：环境问题/代码缺陷/用例问题\n- 必须给出复现步骤\n- 必须评估影响范围\n\n# 执行流程\n1. 理解缺陷描述\n2. 分析可能根因\n3. 分类根因\n4. 生成标准缺陷报告`,
    review_gates: [],
    input_schema: {
      type: 'object',
      properties: {
        bug_description: { type: 'string', title: '缺陷描述' },
      },
      required: ['bug_description'],
    },
    output_description: '标准缺陷报告，包含根因分类、复现步骤和影响范围评估',
    is_starter: true,
  },
]

export function seedStarterTemplates(): void {
  const existing = templateService.listTemplates({ starter: true })
  if (existing.length > 0) {
    log.info('Starter templates already exist, skipping seed')
    return
  }

  for (const t of STARTER_TEMPLATES) {
    templateService.createTemplate({
      name: t.name,
      description: t.description,
      category: t.category,
      claude_md: t.claude_md,
      review_gates: JSON.stringify(t.review_gates),
      input_schema: JSON.stringify(t.input_schema),
      output_description: t.output_description,
      is_public: 1,
      is_starter: t.is_starter ? 1 : 0,
      created_by: 'system',
    })
  }

  log.info('Starter templates seeded', { count: STARTER_TEMPLATES.length })
}
