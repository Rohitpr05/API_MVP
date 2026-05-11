# RapidAPI Marketplace Deployment Guide

## Overview

This backend is designed as a **RapidAPI marketplace product**. RapidAPI handles:
- Subscriptions & billing
- API key management
- Rate limiting & quotas
- User authentication

Your backend only needs to validate the `x-rapidapi-proxy-secret` header on each request.

---

## Architecture Changes (from SaaS to RapidAPI)

### Removed
- ✅ JWT authentication (`@fastify/jwt`)
- ✅ User registration/login routes
- ✅ Password hashing
- ✅ User database models
- ✅ Session management

### Added
- ✅ RapidAPI proxy-secret validation middleware
- ✅ Swagger/OpenAPI documentation
- ✅ Simplified, stateless architecture

### Kept
- ✅ Playwright browser automation
- ✅ OpenRouter AI integration
- ✅ Extraction pipeline
- ✅ Error handling

---

## Local Development Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Create .env File
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
NODE_ENV=development
PORT=3000
HOST=localhost
LOG_LEVEL=info

# RapidAPI test secret (use any string for local testing)
RAPIDAPI_PROXY_SECRET=test-secret-local

# OpenRouter API key (free from https://openrouter.ai)
OPENROUTER_API_KEY=sk-...

# Extraction settings
EXTRACTION_TIMEOUT=30000
EXTRACTION_MAX_CONTENT=8000
EXTRACTION_MODEL=deepseek/deepseek-chat
```

### Step 3: Run Development Server
```bash
npm run dev
```

Server starts at `http://localhost:3000`

---

## Local Testing

### Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 45
  },
  "message": "API is healthy"
}
```

### Extraction Request
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: test-secret-local" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://en.wikipedia.org/wiki/Python_(programming_language)",
    "schema": {
      "title": "string",
      "year_created": "number"
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "extractionId": "ext_1715504192823_abc123def456",
    "success": true,
    "data": {
      "title": "Python (programming language)",
      "year_created": 1991
    },
    "source": {
      "url": "https://en.wikipedia.org/wiki/Python_(programming_language)",
      "title": "Python (programming language) - Wikipedia"
    },
    "usage": {
      "model": "deepseek/deepseek-chat",
      "tokensUsed": 342,
      "inputTokens": 250,
      "outputTokens": 92
    },
    "timestamp": "2024-05-12T10:30:00.000Z"
  },
  "message": "Extraction successful"
}
```

### Missing RapidAPI Secret (Test 403)
```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","schema":{"title":"string"}}'
```

Expected: HTTP 403 Unauthorized

### Invalid RapidAPI Secret (Test 403)
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: wrong-secret" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","schema":{"title":"string"}}'
```

Expected: HTTP 403 Unauthorized

---

## Production Deployment

### Option 1: Railway.app

#### 1. Create Railway Account
- Go to https://railway.app
- Sign up with GitHub

#### 2. Connect GitHub Repository
- Create new project
- Select "Deploy from GitHub"
- Connect your repo

#### 3. Set Environment Variables
In Railway dashboard, add:
```
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
RAPIDAPI_PROXY_SECRET=<get-from-rapidapi-dashboard>
OPENROUTER_API_KEY=<your-openrouter-key>
EXTRACTION_TIMEOUT=30000
EXTRACTION_MAX_CONTENT=8000
EXTRACTION_MODEL=deepseek/deepseek-chat
```

#### 4. Deploy
- Railway auto-deploys on push to main branch
- Your API URL: `https://<project-name>.up.railway.app`

### Option 2: Render.com

#### 1. Create Account
- Go to https://render.com
- Sign up

#### 2. Create Web Service
- Click "New +" → "Web Service"
- Select GitHub repo
- Choose Node environment

#### 3. Environment Variables
Add same variables as Railway (in Settings → Environment)

#### 4. Deploy
- Render auto-deploys on push
- Your API URL: `https://<service-name>.onrender.com`

### Option 3: Docker (Any Provider)

#### 1. Create Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
COPY .env.example .env

EXPOSE 3000

CMD ["npm", "start"]
```

#### 2. Create docker-compose.yml
```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      RAPIDAPI_PROXY_SECRET: ${RAPIDAPI_PROXY_SECRET}
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
```

#### 3. Run Locally
```bash
docker-compose up --build
```

---

## RapidAPI Marketplace Integration

### 1. Prepare API Specification
- Your Swagger docs are at `/docs`
- RapidAPI uses OpenAPI 3.0 specs for marketplace discovery
- Your endpoint is already documented in Swagger

### 2. Set Proxy Secret
- Generate a strong secret for RAPIDAPI_PROXY_SECRET
- Store in your deployment environment
- This secret is how RapidAPI identifies requests from its gateway

### 3. Test with RapidAPI Gateway
After publishing, test through RapidAPI:
```bash
# RapidAPI forwards requests as:
curl -X POST https://<your-rapidapi-endpoint> \
  -H "x-rapidapi-proxy-secret: <secret-from-env>" \
  -H "Content-Type: application/json" \
  -d '{"url":"...","schema":{...}}'
```

### 4. Publish to Marketplace
- Go to RapidAPI dashboard
- Create new API
- Upload OpenAPI spec (or connect your endpoint)
- Configure pricing plans
- Submit for review

---

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| 200 | OK | Extraction successful |
| 400 | Bad Request | Invalid URL or schema |
| 403 | Forbidden | Invalid RAPIDAPI_PROXY_SECRET |
| 422 | Unprocessable Entity | Extraction failed (bad response) |
| 500 | Server Error | Internal error |

---

## Monitoring & Logging

### View Logs
```bash
# Production (Railway)
railway logs

# Production (Render)
# View in dashboard

# Local development
npm run dev  # Shows structured logs with Pino
```

### Enable Debug Logging
```env
LOG_LEVEL=debug
```

---

## Performance Optimization

### Extraction Timeout
Adjust based on website complexity:
```env
EXTRACTION_TIMEOUT=20000  # Faster, fail quicker
EXTRACTION_TIMEOUT=60000  # Slower, handles heavy sites
```

### Content Limit
Reduce to save LLM tokens:
```env
EXTRACTION_MAX_CONTENT=5000  # Cheaper
EXTRACTION_MAX_CONTENT=15000  # More accurate
```

### LLM Model Selection
```env
# Free/cheap options
EXTRACTION_MODEL=deepseek/deepseek-chat
EXTRACTION_MODEL=qwen/qwen-14b-chat

# Better quality (paid)
EXTRACTION_MODEL=gpt-3.5-turbo
EXTRACTION_MODEL=gpt-4
```

---

## Common Issues

### Issue: `RAPIDAPI_PROXY_SECRET not found`
**Solution:** Add to `.env` and restart server

### Issue: Extraction timeout
**Solution:** Increase `EXTRACTION_TIMEOUT` in `.env`

### Issue: Browser not found
**Solution:** Run `npm install playwright --force` to download Chromium

### Issue: OpenRouter auth failed
**Solution:** Verify `OPENROUTER_API_KEY` is correct from https://openrouter.ai

### Issue: Invalid JSON response from LLM
**Solution:** Try different model: `EXTRACTION_MODEL=qwen/qwen-14b-chat`

---

## Scaling Considerations

### Stateless Design
✅ API is stateless - scale horizontally with load balancers
✅ No database required for MVP
✅ All computation isolated per request

### Database Optional
If you add analytics/logging later:
```bash
npm run db:migrate  # Enable database
```

### Rate Limiting
RapidAPI handles rate limiting - no need to implement

### Caching
Consider caching identical extractions:
- Same URL + same schema = same result
- Add Redis for distributed caching (optional)

---

## Maintenance

### Update Dependencies
```bash
npm update

# Test after update
npm run dev
npm run lint
```

### Monitor Costs
- OpenRouter usage is pay-per-token
- Check OpenRouter dashboard for costs
- Consider cheaper models if budget constrained

### Regular Testing
```bash
# Test extraction pipeline
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: $RAPIDAPI_PROXY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://news.ycombinator.com","schema":{"title":"string"}}'
```

---

## Migration Path: SaaS → RapidAPI

If you had existing SaaS users:

1. **Keep SaaS running** with old auth for existing users
2. **Launch RapidAPI version** as new marketplace product
3. **Migrate users gradually** by offering both options
4. **Eventually deprecate SaaS** version after 6-12 months

For this MVP, focus on RapidAPI-only architecture (current state).

---

## Support & Debugging

### Check Server Health
```bash
curl http://localhost:3000/
```

### View Swagger Documentation
```
http://localhost:3000/docs
```

### Enable Verbose Logging
```bash
LOG_LEVEL=debug npm run dev
```

---

## Next Steps

1. ✅ Deploy to Railway or Render
2. ✅ Test all endpoints work
3. ✅ Generate strong `RAPIDAPI_PROXY_SECRET`
4. ✅ Publish to RapidAPI marketplace
5. ✅ Set pricing and features
6. ✅ Submit for review
7. ✅ Monitor usage and costs

---

**Status:** 🟢 Ready for RapidAPI Marketplace Deployment

**Created:** May 12, 2026
