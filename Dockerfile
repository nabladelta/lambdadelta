FROM node:alpine as base

WORKDIR /node

COPY node/package.json node/package-lock.json ./

RUN rm -rf node_modules && npm install --frozen-lockfile

WORKDIR /client

COPY client/package.json client/package-lock.json ./
RUN rm -rf node_modules && npm install --frozen-lockfile
COPY client/tsconfig.json /client/
COPY client/src /client/src
COPY client/public /client/public

ENV REACT_APP_API_URL="/api"
RUN npm run build

WORKDIR /node
COPY node/tsconfig.json /node/
COPY node/src /node/src
RUN npm run build

CMD ["node", "./dist/src/index.js"]