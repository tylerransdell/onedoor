FROM node:18-alpine
WORKDIR /app

# Install dependencies first for caching
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080
CMD ["node", "server.js"]
