# Docker Deployment - Quick Reference

## 🎯 What Changed

### Dockerfile
✅ **FROM**: `mcr.microsoft.com/playwright:v1.52.0-jammy` (Official Playwright image)
✅ **Chromium**: Pre-installed in base image (no manual install needed)
✅ **Dependencies**: All bundled automatically
✅ **Node**: Included in base image
✅ **Start**: `node src/app.js`

### Application Code
✅ **executablePath**: REMOVED (no longer needed)
✅ **CHROMIUM_PATH**: REMOVED (no longer needed)
✅ **chromiumPath env**: REMOVED (no longer needed)
✅ **Browser launch**: Uses Playwright defaults only

### New Files
✅ [render.yaml](render.yaml) - Render Docker configuration
✅ [RENDER_DOCKER_DEPLOYMENT.md](RENDER_DOCKER_DEPLOYMENT.md) - Full deployment guide
✅ [DOCKER_DEPLOYMENT_SUMMARY.md](DOCKER_DEPLOYMENT_SUMMARY.md) - Implementation details

## 🚀 Deploy to Render

### 1. Push to GitHub
```bash
git add .
git commit -m "feat: Docker deployment with official Playwright image"
git push
```

### 2. Create Render Web Service
- [Dashboard](https://dashboard.render.com)
- **New** → **Web Service**
- Connect repo, set Runtime: **Docker**

### 3. Set Environment Variables
```
NODE_ENV=production
RAPIDAPI_PROXY_SECRET=<your-value>
OPENROUTER_API_KEY=<your-value>
```

### 4. Deploy
Click **Create Web Service** → Wait 2-3 min → Done!

## 🔍 Verify Deployment

### Check Health
```bash
curl https://<your-render-url>/health
```

### Test Extraction
```bash
curl -X POST https://<your-render-url>/api/extract \
  -H "Content-Type: application/json" \
  -H "x-rapidapi-proxy-secret: <secret>" \
  -d '{"url": "https://example.com"}'
```

## 🐳 Test Locally First

```bash
# Build
docker build -t json-extraction-api .

# Run
docker run -p 3000:3000 \
  -e NODE_ENV=development \
  -e RAPIDAPI_PROXY_SECRET=test \
  -e OPENROUTER_API_KEY=test \
  json-extraction-api

# Test
curl http://localhost:3000/health
```

## 📊 Deployment Checklist

- [x] Dockerfile uses official Playwright image
- [x] No manual Chromium installation
- [x] No executablePath in code
- [x] No CHROMIUM_PATH env dependencies
- [x] Browser launches with Playwright defaults
- [x] Health check endpoint working
- [x] Application starts on PORT 3000
- [x] Render configuration file created
- [x] Documentation complete
- [x] Ready for production deployment

## 🎨 Architecture

```
GitHub → Render Docker Build → Ubuntu 22.04
         ↓
     npm install
     ↓
     Copy src/ & prisma/
     ↓
     Start: node src/app.js
     ↓
     Chromium: Pre-installed ✓
     Dependencies: Bundled ✓
     Ready: Yes ✓
```

## 💡 Key Features

**Official Playwright Image Benefits**:
- ✅ Chromium pre-installed and optimized
- ✅ All system dependencies included
- ✅ Ubuntu 22.04 + Node.js built-in
- ✅ No manual apt package installation
- ✅ Playwright browser auto-detected
- ✅ Production-ready environment

**Application Benefits**:
- ✅ No hardcoded browser paths
- ✅ Zero Chromium configuration needed
- ✅ Works locally and in production
- ✅ Portable across any Docker host

## ⚠️ Common Issues & Fixes

### Build Fails: "Playwright not found"
→ Verify `package.json` has `playwright` dependency

### Runtime: "browserType.launch: Executable doesn't exist"
→ Check Render dashboard: Runtime must be **Docker**

### Health Check Fails
→ Verify environment variables set correctly
→ Check logs: Dashboard → Service → Logs

### Slow Extractions
→ Increase timeouts in env vars:
```
BROWSER_LAUNCH_TIMEOUT=15000
PAGE_GOTO_TIMEOUT=15000
```

## 📚 Documentation

- [Full Deployment Guide](RENDER_DOCKER_DEPLOYMENT.md)
- [Implementation Summary](DOCKER_DEPLOYMENT_SUMMARY.md)
- [Original Config](README.md)

## 🔗 Useful Links

- [Render Docker Docs](https://render.com/docs/docker)
- [Playwright Docker](https://playwright.dev/docs/docker)
- [MS Playwright Image](https://mcr.microsoft.com/product/playwright/about)

---

**Status**: ✅ Ready for production deployment
**Docker Image**: `mcr.microsoft.com/playwright:v1.52.0-jammy`
**Playwright**: 1.40.1
**Port**: 3000
