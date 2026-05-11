FROM node:18-alpine

WORKDIR /app

# Install Chromium dependencies for Playwright and app dependencies
RUN apk add --no-cache dumb-init chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY src ./src/
COPY .env.example ./

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { if (res.statusCode !== 200) throw new Error('Health check failed'); })"

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
