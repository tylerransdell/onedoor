# syntax=docker/dockerfile:labs

# 0. Prepare versions
ARG PYTHON_VERSION="3.13"
ARG GO_VERSION="1.25"

# ==============================================================================
# 1. Build Layered Custom go2rtc v1.9.12 Binary with PR 1887
# ==============================================================================
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS build
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

ENV GOOS=${TARGETOS}
ENV GOARCH=${TARGETARCH}

WORKDIR /build

# Install git to grab the codebase and pull the keyframe patch
RUN apk add --no-cache git

# Clone the baseline repo cleanly
RUN git clone https://github.com/AlexxIT/go2rtc .

# Checkout the tag and branch off to safely merge PRs without head detachment
RUN git checkout tags/v1.9.12 -b v1.9.12-lowlatency

# Fetch and merge PR 1887 (Instant GOP / Keyframe Buffer)
RUN git fetch origin pull/1887/head:pr1887 && \
    git merge pr1887

# Download go modules utilizing native Docker build cache
RUN --mount=type=cache,target=/root/.cache/go-build go mod download

# Compile hardened, static binary
RUN --mount=type=cache,target=/root/.cache/go-build CGO_ENABLED=0 go build -ldflags "-s -w" -trimpath -o go2rtc


# ==============================================================================
# 2. Final Integrated Image (OneDoor / MoreDoors Target Runtime)
# ==============================================================================
FROM python:${PYTHON_VERSION}-alpine AS final
ARG TARGETARCH

# Core media tooling & hardware acceleration blocks from go2rtc base
RUN apk add --no-cache tini ffmpeg ffplay bash curl jq alsa-plugins-pulse font-droid

# Intel hardware acceleration layer (leveraged if running on amd64 architecture)
RUN if [ "${TARGETARCH}" = "amd64" ]; then apk add --no-cache libva-intel-driver intel-media-driver; fi

# Inject full telephony PBX stack, system scripts, and orchestration engines
RUN apk add --no-cache \
    asterisk \
    asterisk-srtp \
    asterisk-opus \
    libsrtp \
    openssl \
    nodejs \
    npm \
    py3-yaml \
    && pip3 install --break-system-packages PyYAML

# Pull our customized compilation from Stage 1 straight into system path
COPY --from=build /build/go2rtc /usr/local/bin/go2rtc

# Setup application layout space
WORKDIR /app

# Handle Node dependency trees cleanly
COPY package*.json ./
RUN npm install --production

# Move operational source over and correct execution permission layers
COPY . .
RUN chmod +x /app/keys.sh /app/entrypoint.sh /app/doorbell-webhook.sh

# Expose required signaling and stream standard matrix entry points
EXPOSE 1984 8554 8555 8555/udp

VOLUME /config

# Direct invocation through the local runtime environment manager script
ENTRYPOINT ["/app/entrypoint.sh"]
