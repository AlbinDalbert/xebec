# Xebec: the static build behind nginx, which also proxies /api to meridian so the browser sees
# one origin (no CORS, nothing baked in at build time). Set MERIDIAN_URL to meridian's in-cluster
# address; it must resolve when the container starts.
#
#   docker build -t xebec .
#   docker run -p 8080:8080 -e MERIDIAN_URL=http://host.docker.internal:4000 xebec

# The output is plain files, so build on the native platform and only copy them per arch.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runs as uid 101 and listens on 8080.
FROM nginxinc/nginx-unprivileged:1-alpine
ENV MERIDIAN_URL=http://meridian
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
