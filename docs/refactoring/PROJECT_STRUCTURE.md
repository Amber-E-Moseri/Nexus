# Project Structure - Feature-First Organization

This document explains the new feature-first organization of the ClickUp codebase.

## Directory Organization

```
src/
├── features/                    # Self-contained feature modules
│   ├── automations/            # PHASE 1 ✅ COMPLETE
│   │   ├── components/
│   │   ├── lib/
│   │   └── index.ts
│   │
│   ├── notifications/          # PHASE 2 ✅ COMPLETE
│   │   ├── components/
│   │   ├── lib/
│   │   └── index.ts
│   │
│   ├── spaces/                 # PHASE 2 (in progress)
│   │   ├── components/
│   │   ├── lib/
│   │   └── index.ts
│   │
│   ├── agendas/                # PHASE 2 (pending)
│   │   ├── components/
│   │   ├── lib/
│   │   └── index.ts
│   │
│   ├── calendar/               # PHASE 3 (pending)
│   │   ├── components/
│   │   ├── lib/
│   │   └── index.ts
│   │
│   ├── communications/         # PHASE 3 (pending)
│   │   ├── components/
│   │   ├── lib/
│   │   └── index.ts
│   │
│   ├── dashboard/              # PHASE 4 (pending)
│   ├── meetings/               # PHASE 4 (pending)
│   ├── tasks/                  # PHASE 4 (pending)
│   └── sprints/                # PHASE 4 (pending)
│
├── pages/                      # Next.js routes (thin wrappers)
│   ├── auth/
│   ├── calendar/
│   ├── communications/
│   ├── dept/
│   ├── meetings/
│   ├── sprints/
│   ├── tasks/
│   └── ...
│
├── shared/                     # Shared code (not yet created)
│   ├── components/            # UI library (Badge, Button, Modal, etc.)
│   ├── hooks/                 # Global hooks (useAuth, useMediaQuery)
│   ├── context/               # Global contexts (AuthContext, etc.)
│   ├── lib/                   # Cross-feature utilities (supabase, permissions)
│   └── types/
│
├── context/                   # Global contexts (temporary location)
│   ├── AuthContext.jsx
│   ├── NotificationsContext.jsx
│   └── ...
│
├── hooks/                     # Global hooks (temporary location)
│   ├── useAuth.js
│   └── ...
│
├── lib/                       # Global utilities (temporary location)
│   ├── supabase.js
│   ├── permissions.js
│   └── ...
│
├── components/                # UI components (temporary location)
│   ├── ui/                   # Basic UI components
│   ├── layout/               # Layout components
│   └── ...
│
├── modules/                   # Old feature structure (being migrated)
│   └── ... (gradually moving to features/)
│
├── styles/                    # Global styles
└── ...
```

## Migration Status

### ✅ PHASE 1 - Isolated Features (COMPLETE)
- **Automations** - Moved to `src/features/automations/`
  - 3 components, 1 lib file, 1 index.ts
  - 5 files updated with new imports
  
- **Notifications** - Moved to `src/features/notifications/`
  - 2 components, 1 lib file, 1 index.ts
  - 11 files updated with new imports

### 🔄 PHASE 2 - Simple Features (IN PROGRESS)
- **Spaces** - Ready to migrate
- **Agendas** - Ready to migrate

### ⏳ PHASE 3 - Connected Features (PENDING)
- **Calendar** - Moderate dependencies
- **Communications** - Uses people data

### ⏳ PHASE 4 - Core Features (PENDING)
- **Dashboard** - Depends on multiple features
- **Meetings** - Used by communications
- **Tasks** - Used by sprints, dashboard
- **Sprints** - Depends on tasks

## Feature Structure Pattern

Each feature follows this pattern:

```
src/features/[feature]/
├── components/
│   ├── ComponentOne.jsx
│   ├── ComponentTwo.jsx
│   └── ...
├── lib/
│   └── [feature].js         # API calls, business logic
├── hooks/                   # (Optional) Feature-specific hooks
├── context/                 # (Optional) Feature-specific state
├── types.ts                 # (Optional) Feature-specific types
└── index.ts                 # Public API exports
```

### Example: AutomationBuilder Import

**Before:**
```javascript
import AutomationBuilder from '../../modules/automations/AutomationBuilder'
import { createAutomation } from '../../lib/automations'
```

**After:**
```javascript
import { AutomationBuilder, createAutomation } from '../../features/automations'
```

## Next Steps

1. **Continue Phase 2**: Migrate Spaces and Agendas
2. **Create src/shared/**: Move global utilities there
3. **Update tsconfig**: Add path aliases:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@features/*": ["src/features/*"],
         "@shared/*": ["src/shared/*"]
       }
     }
   }
   ```
4. **Delete old structure**: Remove `src/modules/` after all features migrated

## Benefits of This Structure

✅ **Faster Navigation** - All related code in one folder  
✅ **Easier Dependencies** - Clear what each feature needs  
✅ **Parallel Development** - Teams can work on different features independently  
✅ **Simpler Testing** - Feature tests colocated with code  
✅ **Cleaner Imports** - Single export point per feature via `index.ts`  
✅ **Better Scaling** - Easy to add new features following the pattern  

---

**Started:** 2026-06-20  
**Current Phase:** 2 (In Progress)  
**Estimated Completion:** 4 phases remaining
