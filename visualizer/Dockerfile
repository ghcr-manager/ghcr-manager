FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY visualizer/package.json visualizer/package.json

RUN npm ci

COPY visualizer visualizer

RUN npm run build --workspace visualizer

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
COPY visualizer/package.json visualizer/package.json

RUN npm ci --omit=dev --workspace visualizer --include-workspace-root=false

COPY --from=build /app/visualizer/dist visualizer/dist

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
  && chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

ENTRYPOINT ["node", "visualizer/dist/src/index.js", "--host", "0.0.0.0", "--port", "8080"]
