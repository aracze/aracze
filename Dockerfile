# To use this Dockerfile, you have to set `output: 'standalone'` in your next.config.mjs file.
# From https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

FROM node:22.17.0-alpine AS base
RUN apk add --no-cache libc6-compat postgresql-client

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile;

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

# NEXT_PUBLIC_* proměnné Next.js zapéká do klientského bundlu UŽ PŘI BUILDU
# (ne za běhu), takže je sem předáváme jako build-args z GitHub Variables
# (viz .github/workflows/cd.yml). Bez nich by web měl prázdný Google Maps klíč,
# špatné URL obrázků a chybějící SITE_URL.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_PAYLOAD_BASE_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_ADSENSE_CLIENT
ARG NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT
ARG NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT_2
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_PAYLOAD_BASE_URL=$NEXT_PUBLIC_PAYLOAD_BASE_URL \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_PUBLIC_ADSENSE_CLIENT=$NEXT_PUBLIC_ADSENSE_CLIENT \
    NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT=$NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT \
    NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT_2=$NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT_2

RUN corepack enable pnpm && pnpm run build

# Ensure the public directory exists so the runner stage can safely copy it
# even if it's missing from the source.
RUN mkdir -p public

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Remove this line if you do not have this folder
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
CMD ["node", "server.js"]




