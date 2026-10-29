# Single long-lived instance: the run registry is in memory (see docs/deploy.md).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
RUN pnpm build
# NEBIUS_API_KEY and TAVILY_API_KEY are injected at run time by the host, never baked in.
EXPOSE 3000
CMD ["pnpm", "start"]
