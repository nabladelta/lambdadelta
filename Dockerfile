FROM node:alpine as base

WORKDIR /node

COPY node/package.json node/package-lock.json ./

RUN rm -rf node_modules && npm install --frozen-lockfile

WORKDIR /node/client

COPY client/package.json client/package-lock.json ./
RUN rm -rf node_modules && npm install --frozen-lockfile
COPY client/tsconfig.json /node/client/
COPY client/src /node/client/src
COPY client/public /node/client/public

ENV REACT_APP_API_URL="/api"
RUN npm run build

WORKDIR /node
COPY node/tsconfig.json /node/
COPY node/src /node/src
RUN npm run build

CMD ["node", "./dist/src/index.js"]