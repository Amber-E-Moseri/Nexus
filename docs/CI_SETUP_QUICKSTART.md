# CI/CD Pipeline - Quick Setup Guide

Get your CI pipeline working in 5 minutes.

## Prerequisites

✅ Already done:
- GitHub repository
- GitHub Actions enabled
- `.github/workflows/ci.yml` created

## Step 1: Add GitHub Secrets (2 minutes)

1. Go to your GitHub repository
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

Add these secrets:

| Secret Name | Value | Where to Find |
|-------------|-------|---------------|
| `SUPABASE_URL` | Your Supabase project URL | Supabase dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Your anonymous key | Supabase dashboard → Settings → API |

**Find your keys**:
```
Supabase Dashboard → Project → Settings → API
- Project URL = SUPABASE_URL
- anon public key = SUPABASE_ANON_KEY
```

## Step 2: Enable Branch Protection (2 minutes)

1. Go to **Settings** → **Branches**
2. Click **Add rule**
3. Fill in `main` as the branch name
4. ✅ Check: **Require a pull request before merging**
5. ✅ Check: **Require status checks to pass**
   - Select: `build`
   - Select: `test`  
   - Select: `security`
6. ✅ Check: **Require code reviews before merging** (1 approval)
7. Click **Create**

## Step 3: Test the Pipeline (1 minute)

Create a test PR to verify:

```bash
git checkout -b test/ci-setup
echo "# CI Test" >> README.md
git add README.md
git commit -m "test: verify CI pipeline"
git push origin test/ci-setup
```

Then create a PR on GitHub. You should see:
- CI checks running (yellow ⏳)
- Checks completing (green ✅ or red ❌)
- Cannot merge until all checks pass

## What Gets Checked?

### ✅ Always Checked (Required)

- **Build**: `npm run build` succeeds
- **Tests**: `npm run test` passes
- **Security**: `npm audit` finds no high/critical vulnerabilities

### ⏭️ Auto-enabled When Available (Optional)

- **Lint**: Runs if ESLint is installed
- **Type Check**: Runs if TypeScript is configured

## Monitoring Your Pipeline

### In GitHub Web UI

**View workflow status**:
- Pull Request → **Checks** tab
- Repository → **Actions** tab

**Re-run failed checks**:
- Click **Re-run jobs** button
- Or **Re-run all jobs**

### Command Line (GitHub CLI)

```bash
# Install GitHub CLI: https://cli.github.com

# List recent workflow runs
gh run list --workflow ci.yml --limit 5

# View specific run details
gh run view <RUN_ID>

# View detailed logs
gh run view <RUN_ID> --log

# Cancel running workflow
gh run cancel <RUN_ID>
```

## Common Pipeline Statuses

| Status | Meaning | Action |
|--------|---------|--------|
| 🟡 In Progress | Workflow running | Wait for completion |
| 🟢 Passed | All checks passed | Ready to merge |
| 🔴 Failed | One or more checks failed | Fix issues, push again |
| ⚪ Skipped | Check was skipped | Usually optional checks |

## Troubleshooting

### "Tests failing in CI but passing locally"

Usually environment variable issue:

```bash
# Run locally with same env as CI
VITE_SUPABASE_URL=your-url VITE_SUPABASE_ANON_KEY=your-key npm run test
```

### "Build failing with 'Cannot find module'"

Clear cache and reinstall:

```bash
npm ci  # Clean install (use instead of npm install in CI)
npm run build
```

### "Secrets not found"

Make sure secrets are set in GitHub and named exactly:
- `SUPABASE_URL` (not `VITE_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (not `VITE_SUPABASE_ANON_KEY`)

Check in GitHub: Settings → Secrets → Verify all are listed

### "Merge blocked but I need to bypass"

⚠️ **Admin can override**, but not recommended. Instead:

1. Fix the failing check
2. Push a new commit
3. Workflow automatically re-runs
4. Merge when checks pass

## Next Steps

### To Add Linting

```bash
npm install --save-dev eslint @eslint/js eslint-plugin-react

# Create .eslintrc.json with your rules
# Add "lint": "eslint src" to package.json scripts
```

Workflow will auto-detect and enable linting.

### To Add Type Checking

```bash
npm install --save-dev typescript @types/react

# Create tsconfig.json
# Add "type-check": "tsc --noEmit" to package.json scripts
```

Workflow will auto-detect and enable type checking.

### To Add Code Coverage

```bash
npm install --save-dev @vitest/coverage-v8
```

Update `package.json`:
```json
{
  "scripts": {
    "test": "vitest run tests/ --coverage"
  }
}
```

## Status Badge for README

Add to your `README.md`:

```markdown
## Status

![CI/CD Pipeline](https://github.com/YOUR-USERNAME/YOUR-REPO/actions/workflows/ci.yml/badge.svg)
```

Replace `YOUR-USERNAME` and `YOUR-REPO` with your values.

## Performance Tips

✅ **Cache is automatic** — npm dependencies cached between runs
✅ **Jobs run in parallel** — build, test, security all run simultaneously
✅ **Typical run time** — 1-2 minutes (warm cache)

To see timing:
- GitHub Actions UI → Click workflow run → View logs
- Each step shows duration

## Documentation

For advanced customization, see [`docs/CI_CD_PIPELINE.md`](./CI_CD_PIPELINE.md).

## Support

Questions? Check the full guide:
- 📖 [`docs/CI_CD_PIPELINE.md`](./CI_CD_PIPELINE.md) — Complete reference
- 🔗 [GitHub Actions Docs](https://docs.github.com/actions)
- 🎥 [GitHub Actions Tutorial](https://www.youtube.com/results?search_query=github+actions+tutorial)

---

**You're all set!** 🎉

Your CI pipeline is now active. Every PR will be automatically tested before merge.
