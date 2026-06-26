# Claude API Setup for Phase 3a (AI Transcription)

## Get Your API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/account/keys)
2. Sign in (create account if needed)
3. Click **"Account"** (top right)
4. Click **"API Keys"** 
5. Click **"Create Key"**
6. Name it: `BLW Nexus Meetings`
7. Copy the generated key (starts with `sk-ant-`)

## Configure Your Project

### Option A: Local Development (.env file)

Create a `.env.local` file in project root:

```
VITE_ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE
```

Then restart dev server:
```bash
npm run dev
```

### Option B: Production Deployment

Set environment variable in your deployment platform:

**Vercel/Netlify:**
- Project Settings → Environment Variables
- Add `VITE_ANTHROPIC_API_KEY` with your API key

**Docker/Self-hosted:**
```bash
export VITE_ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE
```

## Verify It Works

1. Start dev server: `npm run dev`
2. Open finalized meeting in Minutes tab
3. Paste a test transcript:
   ```
   Grace: Let's confirm the venue by June 18.
   Sarah: I'll check with facilities.
   ```
4. Click "Process with AI"
5. If working: results appear in 10-30 seconds
6. If failing: check browser console for error message

## Troubleshooting

### "Failed to process transcript"
- Check API key is correct (copy-paste exactly)
- Check .env file is `.env.local` not `.env`
- Restart dev server after adding key
- Check Anthropic console for API key status

### "401 Unauthorized"
- API key is invalid or expired
- Generate new key at console.anthropic.com

### "Rate limited"
- Account hit API rate limit
- Wait a minute and retry
- Check usage at console.anthropic.com/account/usage

### "No API key found"
- VITE_ANTHROPIC_API_KEY environment variable not set
- Make sure .env.local file exists in project root
- Make sure dev server was restarted after adding key

## Pricing

Using **Claude 3.5 Haiku** (most cost-effective):

- Input: $0.80 per 1M tokens
- Output: $4.00 per 1M tokens
- **Per transcript**: ~$0.0005 (half a cent!)
- **100 meetings/month**: ~$0.05/month
- **Annual (1000 meetings)**: ~$0.50

Compare to manual transcription: $10-20 per meeting = $100-200/month

## Next Steps

Once configured:
1. Test with sample transcript (above)
2. Go to Minutes tab of finalized meeting
3. Click "Process Meeting Transcript"
4. Paste real meeting transcript
5. Review extracted content
6. Save to Minutes

Transcript processing is now active! 🎉

## Support

- Anthropic docs: https://docs.anthropic.com
- API status: https://status.anthropic.com
- Your Anthropic account: https://console.anthropic.com
