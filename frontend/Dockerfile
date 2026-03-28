FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
# Serve the tesseract.js worker from the same origin so script-src 'self' allows it.
# The blob: worker created by tesseract.js does importScripts(workerPath); if workerPath
# is a CDN URL that URL is blocked by our CSP. A same-origin path is fine.
RUN mkdir -p public \
 && cp node_modules/tesseract.js/dist/worker.min.js public/tesseract-worker.min.js \
 && cp node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js public/tesseract-core-lstm.wasm.js
RUN npm run build

FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
