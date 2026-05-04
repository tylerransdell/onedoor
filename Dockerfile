FROM alexxit/go2rtc:1.9.14

RUN apk add --no-cache \
    asterisk \
    asterisk-srtp \
    asterisk-opus \
    libsrtp \
    openssl \
    curl \
    nodejs \
    npm \
    python3 \
    py3-pip \
    py3-yaml \
    bash \
    && pip3 install --break-system-packages PyYAML

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN chmod +x /app/keys.sh /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]

