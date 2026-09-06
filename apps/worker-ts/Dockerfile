FROM debian:bookworm-slim AS whisper-build
ARG WHISPER_VERSION=v1.8.2
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl cmake g++ make \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fL --retry 3 "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_VERSION}.tar.gz" \
    | tar xz --strip-components=1 -C /opt
RUN cmake -S /opt -B /opt/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
    -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DWHISPER_CURL=OFF -DWHISPER_BUILD_TESTS=OFF \
    && cmake --build /opt/build --target whisper-cli -j2

FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM node:24-bookworm-slim AS final

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=whisper-build /opt/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper-build /opt/LICENSE /usr/share/doc/whisper.cpp/LICENSE

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist

USER node
ENTRYPOINT ["node", "dist/main.js"]
