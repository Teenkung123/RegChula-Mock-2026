FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tokens.css ./
COPY apps/api/package.json apps/api/package.json
COPY apps/staff/package.json apps/staff/package.json
COPY packages/appearance/package.json packages/appearance/package.json
COPY apps/web ./apps/web
COPY packages/appearance ./packages/appearance
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY apps/web/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
