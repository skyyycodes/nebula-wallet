# Vercel Deployment Guide

## 1. Vercel Project Configuration

When deploying via Vercel UI with GitHhub import:

### Project Settings:
- **Framework Preset**: Other
- **Root Directory**: `./relayer`
- **Build Command**: `npm run vercel-build`
- **Output Directory**: (leave blank or set to `dist`)
- **Install Command**: `npm install`

## 2. Environment Variables (CRITICAL)

After creating the project, go to **Settings > Environment Variables** and add:

### Required Variables:
| Variable Name | Value | Example |
|--------------|-------|---------|
| `RELAYER_SECRET` | Your Stellar secret key | `SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `CONTRACT_ID` | Your Soroban contract ID | `CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `HORIZON_URL` | Stellar Horizon URL | `https://horizon-testnet.stellar.org` |
| `SOROBAN_RPC_URL` | Soroban RPC URL | `https://soroban-testnet.stellar.org` |
| `NETWORK_PASSPHRASE` | Stellar network | `Test SDF Network ; September 2015` |
| `NETWORK` | Network name | `testnet` |
| `POLL_INTERVAL_MS` | Polling interval | `5000` |

⚠️ **IMPORTANT**: Make sure to set these for **Production**, **Preview**, and **Development** environments.

## 3. Deploy

1. Click **Deploy**
2. Wait for build to complete
3. Your API will be available at: `https://your-project.vercel.app`

## 4. Test Deployment

```bash
# Test health endpoint
curl https://your-project.vercel.app/api/health

# Test public key endpoint
curl https://your-project.vercel.app/public-key
```

## 5. Update Extension

After deployment, update the extension to use your Vercel URL:

### Option A: Find and update relayer URL references

Search for `localhost:3001` or relayer API URLs in:
- `extension/src/*.ts`
- `extension/src/popup/*.tsx`

Replace with: `https://your-project.vercel.app`

### Option B: Create a config file

Create `extension/src/config.ts`:
```typescript
export const RELAYER_URL = process.env.NODE_ENV === 'production'
  ? 'https://your-project.vercel.app'
  : 'http://localhost:3001';
```

## 6. Update Extension Manifest

Add your Vercel domain to `extension/public/manifest.json`:

```json
{
  "host_permissions": [
    "https://your-project.vercel.app/*"
  ]
}
```

## 7. Rebuild Extension

```bash
cd extension
npm run build
```

Then reload the extension in Chrome.

## Troubleshooting

### Build Fails
- Check that `relayer` directory is set as Root Directory
- Verify `vercel-build` script exists in package.json
- Check build logs for TypeScript errors

### API Returns 500 Errors
- Verify all environment variables are set
- Check Function Logs in Vercel dashboard
- Test locally first: `cd relayer && npm run dev`

### CORS Errors
- CORS is already configured in `api.ts`
- If issues persist, check browser console for specific errors

### Serverless Function Timeout
- Vercel Hobby plan: 10s max execution time
- If SPHINCS+ verification takes longer, consider upgrading to Pro plan (60s limit)

## Notes

- The event watcher (`event-watcher.ts`) won't run on Vercel (serverless environment)
- Only the API endpoints will be available
- For continuous event watching, deploy on a traditional server or use Vercel cron jobs
