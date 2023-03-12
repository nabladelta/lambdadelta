FROM node:alpine as base

WORKDIR /node

COPY node/package.json node/package-lock.json ./

RUN rm -rf node_modules && npm install --frozen-lockfile && npm cache clean

WORKDIR /client

COPY client/package.json client/package-lock.json ./
RUN rm -rf node_modules && npm install --frozen-lockfile && npm cache clean
COPY client/tsconfig.json client/src client/public /client/

ENV REACT_APP_API_URL="/api"
RUN npm run build

WORKDIR /node
COPY node/tsconfig.json node/src /node/
RUN npm run build

CMD ["node", "./dist/src/index.js"]