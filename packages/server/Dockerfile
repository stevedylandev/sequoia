FROM oven/bun:1 AS install
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

ENV PORT=3000
EXPOSE ${PORT}

ENTRYPOINT ["bun", "run", "src/index.ts"]
