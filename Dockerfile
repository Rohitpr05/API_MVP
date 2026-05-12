# Use official Playwright Docker image with Node.js and all browser dependencies
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

# Set working directory
WORKDIR /app

# Install Node.js dependencies (Chromium already included in base image)
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY src ./src/

# Copy environment template (actual values come from Render environment variables)
COPY .env.example ./

# Expose port (Render will override this via PORT environment variable)
EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { if (res.statusCode !== 200) throw new Error('Health check failed'); })"

# Start the application (Playwright Chromium is pre-installed and managed by the base image)
CMD ["node", "src/app.js"]
