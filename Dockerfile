# Market Watch as a container (deploy/docker.md). Spec 01.
# Same image on a Mac and a Raspberry Pi (amd64 and arm64). No npm packages for Market Watch itself.
FROM node:22-bookworm-slim

# The AI command-line tool Market Watch calls. Built and tested with Claude Code; for another tool,
# build with --build-arg AI_NPM_PACKAGE=<npm package>, or an empty value to install none.
ARG AI_NPM_PACKAGE=@anthropic-ai/claude-code
RUN if [ -n "$AI_NPM_PACKAGE" ]; then npm install -g "$AI_NPM_PACKAGE" && npm cache clean --force; fi

ENV NODE_ENV=production TZ=Europe/Helsinki MARKET_WATCH_HOST=0.0.0.0 PORT=3002 \
    CLAUDE_CONFIG_DIR=/home/node/.claude
WORKDIR /app
COPY --chown=node:node . .
USER node
EXPOSE 3002
# data/, .env and the AI tool's login are mounted from outside: see docker-compose.yml
CMD ["node", "server.js"]
