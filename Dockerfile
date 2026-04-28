FROM node:20-slim

WORKDIR /app

# Install dependencies from package.json
COPY package*.json ./
RUN npm install --omit=dev

# Explicitly add the proxy middleware needed for the go2rtc tunnel
RUN npm install http-proxy-middleware

# Copy the rest of your sanitized 011 code
COPY . .

EXPOSE 8099

CMD ["node", "server.js"]
