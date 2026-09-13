FROM node:24-bookworm-slim AS viewer
RUN npm install --global pnpm@10.8.1
WORKDIR /work/ifc-lite
COPY ifc-lite/ ./
RUN pnpm install --frozen-lockfile
RUN pnpm build:wasm:fetch
# Host incremental metadata can claim outputs exist even though dist is excluded.
RUN find packages -name '*.tsbuildinfo' -delete && pnpm turbo build --filter=@ifc-lite/viewer-embed^... --filter=@ifc-lite/embed-sdk
WORKDIR /work/ifc-lite/apps/viewer-embed
RUN pnpm exec vite build --base=/embed/

FROM oven/bun:1.4.2 AS mock
WORKDIR /work
COPY --from=viewer /work/ifc-lite/packages/embed-sdk ./ifc-lite/packages/embed-sdk
COPY --from=viewer /work/ifc-lite/packages/embed-protocol ./ifc-lite/packages/embed-protocol
COPY frontend-mock/ ./frontend-mock/
WORKDIR /work/frontend-mock
RUN bun install --frozen-lockfile
RUN bun run build

FROM nginx:1.28-alpine
COPY frontend-mock/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=mock /work/frontend-mock/dist /usr/share/nginx/html
COPY --from=viewer /work/ifc-lite/apps/viewer-embed/dist /usr/share/nginx/embed
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
