FROM oven/bun:1 AS base
WORKDIR /app

# 安全：非 root 用户运行
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# 依赖安装
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# 构建阶段
FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src/ src/
RUN bun build src/index.ts --outdir dist --target bun

# 运行阶段
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY src/db/ ./src/db/

# 安全：设置环境变量
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# 创建数据目录并设置权限
RUN mkdir -p /data/knowledge /data/artifacts /data/components /data/db && \
    chown -R appuser:appgroup /data /app

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

CMD ["bun", "run", "dist/index.js"]
