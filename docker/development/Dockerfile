ARG NODE_IMAGE_TAG=24-bookworm-slim
FROM node:${NODE_IMAGE_TAG}

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
RUN chown node:node /app

USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
