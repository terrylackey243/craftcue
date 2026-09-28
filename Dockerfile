# Build the static app, then serve it with nginx. No server-side code runs in this image.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
# Optional accounts + sync (see src/lib/cloud/config.ts). Leave empty for the on-device-only app.
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_PUBLISHABLE_KEY=
ARG VITE_SIGNUP=
ARG VITE_AUTH_METHOD=
ARG VITE_BEHIND_ACCESS=
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY} VITE_SIGNUP=${VITE_SIGNUP} VITE_AUTH_METHOD=${VITE_AUTH_METHOD} VITE_BEHIND_ACCESS=${VITE_BEHIND_ACCESS}
RUN npm run build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/health >/dev/null || exit 1
