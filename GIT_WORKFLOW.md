# BLW Canada OS — Git Workflow Guide

## Commit Strategy

### One logical change per commit
Each commit = one feature, fix, or refactor. If you catch yourself saying "and", split it.

### Commit Message Format
```
<type>(<scope>): <description>

[optional body — why, not what]

[optional footer — issue refs]
```

**Types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `ci`

**Examples:**
```
feat(communications): add email composer module
fix(dnd): prevent task card drag outside bounds
refactor(sidebar): simplify space navigation logic
```

## Branch Strategy

### Feature branches
```bash
git checkout -b feat/module-name
# or
git checkout -b fix/issue-description
```

### Branch naming
- `feat/communications-campaigns` — new feature
- `fix/drag-drop-safari-bug` — bug fix
- `refactor/sidebar-tree` — refactoring

### Keep branches short-lived
Merge to main within 1–2 days of opening the PR.

## Commit Frequency

| Trigger | Action |
|---------|--------|
| Finished a working piece | `git commit` |
| About to try something risky | `git commit` first |
| End of work session | `git commit` + `git push` |
| Tests pass on discrete change | `git commit` |

### WIP commits
When stopping mid-feature:
```bash
git commit -m "WIP: module-name — part done, X pending"
git push origin feat/your-branch
```

Then before merging, clean up with `git rebase -i main`.

## Push Frequency

| Situation | Push? |
|-----------|-------|
| End of day | ✅ Always |
| Before risky change | ✅ Always |
| After each commit | ❌ No (group them) |
| Before sharing/PR | ✅ Yes |
| Backing up work | ✅ Yes |

## Before Merging to Main

1. **Rebase & squash** if needed:
   ```bash
   git rebase -i origin/main
   ```
   Squash WIP commits into logical units.

2. **Run tests locally:**
   ```bash
   npm run test
   ```

3. **Verify no broken code** pushes to shared branches.

4. **Reference issues** in commit messages:
   ```
   feat(auth): add JWT rotation
   
   Closes #142
   ```

## Tag releases
After merging a major milestone:
```bash
git tag -a v0.1-chunk4 -m "CHUNK 4: Communications, Invitations, Drag-Drop"
git push origin v0.1-chunk4
```

This allows clean rollback during security remediation phases.

## Quick Reference

```bash
# Stage specific hunks (not whole files)
git add -p

# Commit with message
git commit -m "feat(scope): description"

# View unpushed commits
git log origin/main..HEAD

# Push to remote
git push origin feat/branch-name

# Clean up before merge
git rebase -i origin/main

# View recent history
git log --oneline -10
```

---

**Remember:** Commit often (logical checkpoints), push deliberately (end of day minimum).
