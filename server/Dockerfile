FROM oven/bun:1 AS base

WORKDIR /app

# 安装依赖
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 复制源码
COPY src/ src/

# 创建数据目录
RUN mkdir -p data/db data/components data/artifacts data/knowledge data/workdirs

# 安装 Claude Code CLI
RUN bun add -g @anthropic-ai/claude-code

# 暴露端口
EXPOSE 3000 3001

# 启动
CMD ["bun", "run", "src/index.ts"]
