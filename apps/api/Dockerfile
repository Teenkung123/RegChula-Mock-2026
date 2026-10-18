FROM oven/bun:1.3.14-alpine AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/appearance/package.json packages/appearance/package.json
RUN bun install --frozen-lockfile --production --linker=hoisted

FROM oven/bun:1.3.14-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./package.json
COPY apps/api ./apps/api
COPY packages/appearance ./packages/appearance
COPY database ./database
COPY data ./data
RUN rm -rf /app/apps/api/node_modules && ln -s /app/node_modules /app/apps/api/node_modules
USER bun
EXPOSE 3000
CMD ["bun", "apps/api/src/index.ts"]
