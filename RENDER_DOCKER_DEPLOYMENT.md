# Render Docker Deployment Guide

## Overview

This application deploys to Render using Docker with the official Playwright image, which includes Chromium and all required runtime dependencies.

## Prerequisites

- Render account
- GitHub repository with this code
- Required environment variables configured in Render dashboard

## Docker-Based Deployment

### Why Docker?

The native Render Node environment lacks Playwright Chromium runtime dependencies. Docker deployment ensures:

- ✅ Official Playwright image with pre-installed Chromium
- ✅ All system libraries and fonts included
- ✅ No manual dependency installation required
- ✅ Consistent environment between local and production
- ✅ Playwright auto-detects managed browser installation

### Dockerfile Overview

```dockerfile
FROM mcr.microsoft.com/playwright:v1.52.0-jammy
```

Key features:
- Based on Ubuntu 22.04 (Jammy) with Node.js
- Chromium pre-installed and ready to use
- All Playwright dependencies bundled
- No executablePath or custom browser paths needed

## Deployment Steps

### 1. Create New Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Fill in deployment settings:
   - **Name**: `json-extraction-api`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your deployment branch)
   - **Runtime**: Select `Docker`
   - **Build Command**: Leave default (Render auto-detects Dockerfile)
   - **Start Command**: Leave default (Render uses CMD from Dockerfile)

### 2. Configure Environment Variables

In the Render dashboard, add the following environment variables:

**Required (must set):**
```
NODE_ENV=production
RAPIDAPI_PROXY_SECRET=<your-rapidapi-proxy-secret>
OPENROUTER_API_KEY=<your-openrouter-api-key>
```

**Optional (with defaults):**
```
PORT=3000
LOG_LEVEL=info
BROWSER_LAUNCH_TIMEOUT=15000
PAGE_GOTO_TIMEOUT=15000
EXTRACTION_TIMEOUT=15000
EXTRACTION_MAX_CONTENT=12000
```

### 3. Deploy

1. Click **Create Web Service**
2. Render will:
   - Build Docker image from Dockerfile
   - Install dependencies via `npm install --omit=dev`
   - Copy application source
   - Start container with `node src/app.js`

### 4. Verify Deployment

Once the service is live, test the extraction endpoint:

```bash
curl -X POST https://<your-render-url>/api/extract \
  -H "Content-Type: application/json" \
  -H "x-rapidapi-proxy-secret: <your-secret>" \
  -d '{
    "url": "https://example.com"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "title": "Example Domain",
    "content": "This domain is for use in examples...",
    "url": "https://example.com",
    "extractedAt": "2026-05-12T10:30:00.000Z"
  }
}
```

## Browser Launch Behavior

### Production (Docker)

```javascript
browser = await chromium.launch({
  headless: true,
  timeout: 15000,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ],
});
```

- Chromium comes from Playwright Docker image
- No executablePath needed
- No environment variable path resolution
- Playwright auto-detects installed browser
- Sandbox disabled (safe in container)
- Dev /dev/shm disabled (container memory management)

## Troubleshooting

### Build Fails: "Playwright not installed"

**Solution**: Ensure `package.json` lists Playwright as a dependency.

```json
{
  "dependencies": {
    "playwright": "^1.40.1"
  }
}
```

### Runtime Error: "browserType.launch: Executable doesn't exist"

**Causes & Solutions**:

1. **Using native Node runtime instead of Docker**
   - Check Render dashboard → Service settings → Runtime should be **Docker**
   - Verify Dockerfile exists in repository root

2. **Custom executablePath still in code**
   - Verify `src/services/browser.service.js` does NOT use `executablePath`
   - Verify `src/config/env.js` does NOT set `chromiumPath`

3. **Render cache issue**
   - Manually trigger rebuild: Dashboard → Service → Manual Deploy

### Health Check Fails

**Symptoms**: Service repeatedly restarts

**Solutions**:
1. Check logs for startup errors: Dashboard → Logs
2. Verify environment variables are set
3. Increase health check timeout in Dockerfile if needed

### Slow Page Extraction

**Optimize**:
```javascript
// Reduce timeout for faster responses
BROWSER_LAUNCH_TIMEOUT=10000  // 10 seconds
PAGE_GOTO_TIMEOUT=8000         // 8 seconds
```

## Monitoring

### View Logs

In Render dashboard → Service → Logs

Key indicators:
```
Starting browser extraction
Content extracted successfully
```

### Health Check

The service includes a health check endpoint:
```bash
curl https://<your-render-url>/health
```

Response (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2026-05-12T10:30:00.000Z"
}
```

## Updating Playwright Version

To update Playwright:

1. Update `package.json`:
   ```json
   {
     "dependencies": {
       "playwright": "^1.52.0"
     }
   }
   ```

2. (Optional) Update Dockerfile base image to matching version:
   ```dockerfile
   FROM mcr.microsoft.com/playwright:v1.52.0-jammy
   ```

3. Commit and push
4. Render will auto-redeploy with new versions

## Performance Notes

- Docker image ~2GB (includes Chromium + dependencies)
- First build takes ~2-3 minutes
- Subsequent builds use cache (faster)
- Container memory: ~500MB baseline + extraction overhead
- Recommend Render's **Standard** tier or higher

## Local Development

To match production environment locally:

```bash
# Build and run Docker image locally
docker build -t json-extraction-api .
docker run -p 3000:3000 \
  -e NODE_ENV=development \
  -e RAPIDAPI_PROXY_SECRET=test \
  -e OPENROUTER_API_KEY=your-key \
  json-extraction-api
```

## Additional Resources

- [Render Docker Deployment](https://render.com/docs/docker)
- [Playwright Docker Documentation](https://playwright.dev/docs/docker)
- [Microsoft Playwright Docker Images](https://mcr.microsoft.com/product/playwright/about)
