FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tokens.css ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/appearance/package.json packages/appearance/package.json
COPY apps/staff ./apps/staff
RUN bun install --frozen-lockfile
COPY apps/web/src ./apps/web/src
RUN bun run --cwd apps/staff build

FROM nginx:1.29-alpine
COPY apps/staff/nginx.conf /etc/nginx/nginx.conf
COPY apps/web/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/apps/staff/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
