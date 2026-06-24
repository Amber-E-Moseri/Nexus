# CI/CD Pipeline Guide

## Overview

The GitHub Actions CI/CD pipeline automatically tests, builds, and verifies every commit to ensure code quality and prevent regressions.

**Pipeline Features**:
- ✅ Automated builds on every PR
- ✅ Security vulnerability scanning
- ✅ Test coverage validation
- ✅ Optional linting and type checking
- ✅ Automatic deployment on main branch
- ✅ PR comments with status updates

## Workflow Structure

### Jobs

1. **Setup** (Prerequisite)
   - Installs Node.js 18.x
   - Caches npm dependencies
   - Verifies installation

2. **Security** (Parallel)
   - Runs `npm audit --audit-level=moderate`
   - Fails if high/critical vulnerabilities found
   - Reports vulnerability details

3. **Build** (Parallel)
   - Runs `npm run build`
   - Verifies dist directory created
   - Reports bundle size
   - Uploads artifacts for deployment

4. **Test** (Parallel)
   - Runs `npm run test` with Vitest
   - Uploads coverage reports
   - Fails if tests don't pass

5. **Lint** (Optional, Non-blocking)
   - Runs `npm run lint` if ESLint configured
   - Checks code style and patterns
   - Skipped if ESLint not installed

6. **Type Check** (Optional, Non-blocking)
   - Runs `npm run type-check` if TypeScript configured
   - Validates TypeScript compilation
   - Skipped if TypeScript not installed

7. **CI Status** (Final Check)
   - Summarizes all required jobs
   - Posts comment on PR with results
   - Fails if any required job failed

8. **Deploy** (Auto-deploy)
   - Runs only on main branch when all checks pass
   - Downloads build artifacts
   - Triggers Vercel deployment

## Triggering the Pipeline

### Automatic Triggers

1. **On Push to Main**
   - Runs automatically when commits are pushed
   - Deploys to production if all checks pass

2. **On Pull Request**
   - Runs on all PRs to main
   - Blocks merge if required checks fail
   - Posts status comment to PR

### Manual Triggers

Run the workflow manually from GitHub UI:

```bash
# GitHub UI:
Actions → CI/CD Pipeline → Run workflow → Select branch → Run
```

Or via GitHub CLI:
```bash
gh workflow run ci.yml --ref main
```

## Environment Variables

The workflow uses these secrets (set in GitHub):

```
SUPABASE_URL              - Supabase project URL
SUPABASE_ANON_KEY         - Supabase anonymous key
SUPABASE_SERVICE_ROLE_KEY - Service role key (optional)
```

Set these in GitHub repository settings:
```
Settings → Secrets and variables → Actions → New repository secret
```

## Branch Protection Rules

To enforce CI checks before merge:

### Setup Branch Protection

1. Go to **Settings → Branches**
2. Click **Add rule** under "Branch protection rules"
3. Configure for main branch:

```
Branch name pattern: main

Protection rules:
✅ Require a pull request before merging
✅ Require status checks to pass before merging
   - Select: build
   - Select: test
   - Select: security
✅ Require branches to be up to date before merging
✅ Require code reviews before merging (recommended)
   - Required number of approvals: 1
   - Dismiss stale pull request approvals when new commits are pushed
✅ Include administrators (check to apply to admins too)
```

## Monitoring Workflow Status

### GitHub Web UI

**View All Workflows**:
```
Actions → All workflows → Select CI/CD Pipeline
```

**View Specific Run**:
```
Pull Request → Checks tab → View detailed logs
```

### GitHub CLI

```bash
# List recent runs
gh run list --workflow ci.yml --limit 10

# View specific run
gh run view <RUN_ID>

# View logs
gh run view <RUN_ID> --log

# Rerun failed jobs
gh run rerun <RUN_ID>

# Cancel running workflow
gh run cancel <RUN_ID>
```

### Command Line

```bash
# Check if workflow is passing
gh run list --workflow ci.yml --status completed --json conclusion -q | head -1

# Watch live logs
gh run view <RUN_ID> --log --follow
```

## Performance & Caching

### Cache Strategy

The workflow caches npm dependencies to speed up runs:

```
Cache saved: ~/.npm (standard npm cache location)
Cache restored on: Each workflow run
Hit rate: ~95% on typical runs
```

**Cache is invalidated when**:
- `package-lock.json` changes
- `package.json` changes
- 7 days have passed (GitHub default)

### Expected Run Times

- **First run**: 2-3 minutes (cold cache)
- **Typical run**: 1.5-2 minutes (warm cache)
- **With new dependency**: 2-3 minutes

### Optimizing Runtime

To speed up the pipeline:

1. **Skip jobs on dependency changes** (optional):
```yaml
if: |
  !contains(github.event.head_commit.modified, 'package-lock.json')
```

2. **Parallel job execution**: All jobs run in parallel (already implemented)

3. **Use matrix strategy**: Run tests across Node versions (optional)

4. **Cache build artifacts**: Re-use dist folder (future enhancement)

## Enhancing the Pipeline

### Add ESLint (Code Linting)

1. **Install ESLint**:
```bash
npm install --save-dev eslint @eslint/js eslint-plugin-react eslint-plugin-react-hooks
```

2. **Create `.eslintrc.json`**:
```json
{
  "extends": ["eslint:recommended"],
  "plugins": ["react", "react-hooks"],
  "env": {
    "browser": true,
    "node": true,
    "es2021": true
  },
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

3. **Add script to `package.json`**:
```json
{
  "scripts": {
    "lint": "eslint src --ext .js,.jsx,.ts,.tsx",
    "lint:fix": "eslint src --fix --ext .js,.jsx,.ts,.tsx"
  }
}
```

4. **Workflow will auto-enable** once `npm run lint` is available

### Add Prettier (Code Formatting)

1. **Install Prettier**:
```bash
npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier
```

2. **Create `.prettierrc`**:
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

3. **Add script to `package.json`**:
```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

4. **Update `.eslintrc.json`**:
```json
{
  "extends": ["eslint:recommended", "prettier"]
}
```

### Add TypeScript Type Checking

1. **Install TypeScript**:
```bash
npm install --save-dev typescript @types/react @types/react-dom @types/node
```

2. **Create `tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

3. **Add script to `package.json`**:
```json
{
  "scripts": {
    "type-check": "tsc --noEmit"
  }
}
```

4. **Workflow will auto-enable** once TypeScript is configured

## Common Issues

### "Workflow not running"

**Cause**: Workflow file not in `.github/workflows/` directory
**Solution**: Ensure `ci.yml` is at `.github/workflows/ci.yml`

### "Tests failing in CI but passing locally"

**Cause**: Different environment variables or Node versions
**Solution**: 
- Check Node version: `node --version`
- Check env vars: `echo $VITE_SUPABASE_URL`
- Run tests locally: `npm run test`

### "Build succeeds locally but fails in CI"

**Cause**: Missing environment variables or node_modules
**Solution**:
- Run with fresh cache: `rm -rf node_modules && npm ci`
- Check env vars are set in GitHub secrets
- Run `npm run build` locally with same env

### "npm audit reports vulnerabilities"

**Cause**: Outdated dependencies
**Solution**:
```bash
npm update                    # Update to latest minor versions
npm audit fix                 # Auto-fix vulnerabilities
npm audit fix --force         # Force fix (may break compatibility)
```

### "Cache not working"

**Cause**: Path changed or GitHub cache expired
**Solution**:
- Clear cache: Settings → Actions → Clear cache
- Re-run workflow: Actions → Select run → Re-run jobs

## Customizing the Pipeline

### Customize Security Level

Edit `.github/workflows/ci.yml`:

```yaml
- name: Run security audit
  run: npm audit --audit-level=moderate  # Change to: low, moderate, high, critical
```

### Add Custom Steps

Example: Run database migrations before tests

```yaml
test:
  steps:
    - name: Setup database
      run: npm run db:migrate
      env:
        DATABASE_URL: ${{ secrets.DATABASE_URL }}

    - name: Run tests
      run: npm run test
```

### Run Only on Specific Branches

```yaml
on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches: [ main, develop ]
```

### Skip Workflow for Certain Changes

```yaml
on:
  push:
    branches: [ main ]
    paths-ignore:
      - 'docs/**'
      - '*.md'
      - '.gitignore'
```

### Scheduled Nightly Runs

```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # Run at 2 AM UTC daily
```

## Debugging Workflow Failures

### Enable Debug Logging

Set repository secret:
```
ACTIONS_STEP_DEBUG = true
```

Then re-run workflow to see verbose logs.

### Common Commands

```bash
# View workflow file syntax
gh workflow view ci.yml

# Validate workflow locally (install act)
act -l                    # List workflows
act --job build           # Run specific job locally

# Download logs
gh run download <RUN_ID> -D ./logs
```

## Security Best Practices

1. **Use GitHub Secrets** for sensitive data
   - Never commit `.env` files
   - Use `${{ secrets.VARIABLE }}` syntax

2. **Limit permissions**:
```yaml
permissions:
  contents: read
  checks: write
  pull-requests: write
```

3. **Audit token usage**:
   - Use read-only tokens where possible
   - Rotate secrets regularly
   - Remove unused secrets

4. **Sign commits** (optional):
```yaml
- name: Setup Git
  run: |
    git config user.name "GitHub Actions"
    git config user.email "actions@github.com"
```

## Integration with External Services

### Codecov (Code Coverage)

1. **Install action**:
```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    fail_ci_if_error: false
```

2. **Get token**: https://codecov.io → Settings → CODECOV_TOKEN

### Slack Notifications

```yaml
- name: Notify Slack
  if: failure()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -d '{"text": "CI Pipeline Failed"}'
```

### Deploy to Vercel

```yaml
- name: Deploy to Vercel
  uses: vercel/actions/git@main
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

## Status Badge

Add to `README.md`:

```markdown
## Build Status

![CI/CD Pipeline](https://github.com/[owner]/[repo]/actions/workflows/ci.yml/badge.svg)
```

## Support & Troubleshooting

- **GitHub Actions Docs**: https://docs.github.com/actions
- **Workflow Syntax**: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
- **Community Examples**: https://github.com/actions

## Next Steps

1. ✅ Workflow file deployed (`.github/workflows/ci.yml`)
2. ⬜ Configure GitHub secrets (SUPABASE_URL, etc.)
3. ⬜ Enable branch protection rules
4. ⬜ (Optional) Add ESLint/Prettier/TypeScript
5. ⬜ Add status badge to README.md
6. ⬜ Test with a sample PR

---

**Last Updated**: 2026-06-23
**Maintainer**: Engineering Team
