# One image for every feed agent; the FEED build-arg/env picks which one runs.
#   docker compose up feed-news        -> FEED=news
#   docker run -e FEED=crypto-eth ...  -> another feed from the same image
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/agent-sdk/package.json packages/agent-sdk/
COPY agents/package.json agents/
RUN npm ci --workspaces --include-workspace-root --ignore-scripts
COPY packages/agent-sdk packages/agent-sdk
COPY agents agents
RUN npm run build -w @calling-platform/agent-sdk && npm run build -w @calling-platform/feed-agents

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/agent-sdk/package.json packages/agent-sdk/package.json
COPY --from=build /app/packages/agent-sdk/dist packages/agent-sdk/dist
COPY --from=build /app/agents/package.json agents/package.json
COPY --from=build /app/agents/dist agents/dist
COPY feeds.config.json ./feeds.config.json
ARG FEED=
ENV FEED=${FEED}
ENV FEEDS_CONFIG=/app/feeds.config.json
CMD ["node", "agents/dist/runner.js"]
