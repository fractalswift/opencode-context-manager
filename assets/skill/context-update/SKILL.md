---
name: context-update
description: Scan repository and update context files with intelligent dependency-aware analysis
---

# Context Update

You are updating the repository context files. These files serve as a knowledge base about the codebase for AI agents to reference.

## Output Structure

Context files live in `.opencode/context/`. The structure is **modular**:

- **Required**: Always create `repo-structure.md` (core overview)
- **Optional**: Create additional files when there's enough content to warrant separation

```
.opencode/context/
├── repo-structure.md      # Always created - tech stack, structure, conventions
├── frontend/              # Optional - if frontend-heavy
│   ├── components.md
│   └── hooks.md
├── backend/               # Optional - if backend-heavy
│   ├── api.md
│   └── services.md
└── shared/                # Optional - if significant shared code
    ├── types.md
    └── utilities.md
```

---

## Step 0: Run Static Analysis (MUST DO FIRST)

**BEFORE reading any source files**, check if helper scripts exist and run the pre-analysis.

### A. Check for Helper Scripts

```bash
ls lib/scan-strategy.js 2>/dev/null
```

### B. If Helper Scripts Exist (Recommended Path)

Run the scan strategy decision engine. This performs dependency graph analysis, auto-generates summaries, detects project capabilities, and outputs an **action plan** you should follow:

```javascript
import { decideScanStrategy } from './lib/scan-strategy.js';

const strategy = await decideScanStrategy({
  rootDir: process.cwd(),
  forceFullScan: false,    // Set true if user passed --full
  rebuildGraph: false       // Set true if user passed --rebuild-graph
});

// strategy.actionPlan contains a human-readable plan to follow
// strategy.mode is 'full' or 'incremental'
// strategy.preAnalysis contains auto-generated summaries and project capabilities
// strategy.filesToRead lists which files you need to read
```

**The action plan output will tell you exactly:**
- Whether to do full scan or incremental
- Which specific files to read (and why)
- Auto-generated summaries for files you don't need to read
- Project capabilities detected (database, auth, integrations, etc.)
- Token estimates

**Follow the action plan.** It has already analyzed the dependency graph and determined the optimal update strategy.

### C. If Helper Scripts Don't Exist (Fallback)

If `lib/` doesn't exist, fall back to manual analysis:

1. Check for existing context: `ls .opencode/context/repo-structure.md`
2. Parse git metadata: Look for `<!-- Context: branch@hash -->` in first line
3. If found, run `git diff --name-status -M <old-hash>..HEAD` to see changes
4. If no existing context or large changes: do full scan
5. If small changes: update only affected sections

---

## Step 1: Read Existing Context

Check if `.opencode/context/` already exists. If it does, read ALL markdown files in it to understand the previous state. This helps you:

- Detect what changed in each file
- Preserve the structure the user/previous runs established
- Update existing files rather than recreating from scratch
- Show meaningful diffs to the user

**Important**: Don't delete files the user may have manually added. Only update files you recognize as auto-generated context files.

---

## Step 2: Scan Repository

**For FULL SCAN mode**, scan the repository using the pre-analysis as your guide:

### A. Use Pre-Analysis Data

If the pre-analysis is available, it already provides:
- **Auto-generated summaries**: For well-documented and simple files (don't re-read these)
- **Project capabilities**: Database, auth, styling, integrations, etc. (already detected)
- **Most-imported files**: Architecture backbone (read these carefully)
- **Files to read list**: Only read files the pre-analysis flagged

### B. Read Flagged Files

For each file in the "files to read" list:
- Read the file
- Write a 2-3 sentence summary capturing: what it does, why it matters, key patterns
- Note any cross-file patterns you discover

### C. Pattern Detection

Read 2-3 sample files from each major category (components, services, hooks, etc.) to detect:
- Common patterns and conventions
- Error handling approaches
- State management patterns
- Code organization style

### D. Comprehensive Discovery

Also scan for (much of this may already be in pre-analysis):

- **Tech Stack**: package.json, requirements.txt, go.mod, etc.
- **Directory Structure**: Map the high-level folder organization
- **Components**: React/Vue/Svelte components with descriptions
- **Hooks**: Custom hooks/composables
- **API Endpoints**: Routes, methods, request/response shapes
- **Services**: Business logic modules
- **Utilities**: Helper functions
- **Types**: TypeScript interfaces and types
- **Database**: Schema, ORM, migrations
- **Auth**: Strategy, providers, middleware
- **Integrations**: Third-party APIs (Stripe, SendGrid, etc.)
- **State Management**: Client and server state patterns
- **Deployment**: Docker, CI/CD, hosting platform
- **Background Jobs**: Queues, workers, cron
- **Realtime**: WebSockets, SSE, pub/sub
- **i18n**: Internationalization setup
- **Styling**: CSS framework, component library, design tokens
- **Testing**: Framework, patterns, utilities
- **Logging & Monitoring**: Error tracking, APM
- **Security**: CSRF, CSP, input sanitization
- **Performance**: Caching, code splitting, SSR/SSG
- **Developer Experience**: Linting, formatting, git hooks

- **Environment Variables**: From `.env.example` only (NEVER read actual `.env` files)
- **Build Scripts**: Key commands from package.json or Makefile
- **Conventions**: Export style, naming, imports, error handling

---

## Step 2.5: Incremental Scan (When in Incremental Mode)

**Skip this step if doing a full scan.**

### A. Read Only Affected Files

The action plan lists exactly which files to re-read. For each:
1. Read the file
2. Update its summary
3. Check if any patterns changed

### B. Preserve Unchanged Content

When updating context files:
- Read existing context file for that category
- **Replace only the sections** for affected items
- **Keep all other entries unchanged**

### C. Handle Special Cases

- **New files**: Scan and add to appropriate context file
- **Deleted files**: Remove entry from context file
- **Renamed files**: Remove old entry, add new one with new path

---

## Step 3: Smart Discovery

Don't assume standard paths. Instead:

1. **Look at pre-analysis first** - it has already categorized files
2. **Check package manifests** to understand tech stack
3. **Follow the dependency graph** - most-imported files reveal architecture
4. **Use glob patterns** for anything the pre-analysis missed:
   - Components: `**/*.{tsx,jsx,vue,svelte}`
   - Hooks: `**/use*.{ts,js,tsx,jsx}`
   - Services: `**/services/**/*.{ts,js}`, `**/api/**/*.{ts,js}`
   - Types: `**/types/**/*.{ts,d.ts}`, `**/*.d.ts`

---

## Step 4: Decide Output Structure

You MUST create `repo-structure.md`. Additional files are OPTIONAL.

### When to Create Additional Files

Create a separate file when:
- There are **3+ items** in a category worth documenting individually
- The content would make `repo-structure.md` unwieldy (>300 lines)
- The category has distinct, reusable artifacts

Keep everything in `repo-structure.md` when:
- The project is small or simple
- Categories have only 1-2 items

### What Goes Where

| File | Contents |
|------|----------|
| `repo-structure.md` | Tech stack, directory structure, conventions, build scripts, env vars, database, auth, integrations, deployment, high-level overview |
| `frontend/components.md` | Reusable UI components with descriptions and props |
| `frontend/hooks.md` | Custom hooks/composables with usage |
| `backend/api.md` | API endpoints, routes, request/response formats |
| `backend/services.md` | Business logic services and their responsibilities |
| `shared/types.md` | Key TypeScript types/interfaces used across the codebase |
| `shared/utilities.md` | Utility functions with descriptions |

---

## Step 5: Capture Git Metadata

Before generating context files, capture git state:

1. **Current branch**: `git branch --show-current`
2. **Commit hash**: `git rev-parse --short HEAD`
3. **Format**: `[branch]@[hash]` (e.g., `main@abc1234`)

This will be embedded in each context file for staleness detection.

---

## Step 6: Generate Context Files

### repo-structure.md (Required)

Always create this file with this structure:

```markdown
<!-- Context: [branch]@[hash] -->
# Repository Context

Last updated: [current timestamp]

## Tech Stack

- **Language**: [language and version]
- **Framework**: [name and version]
- **Build Tool**: [tool and version]
- **Package Manager**: [npm, yarn, pnpm, etc.]
- **Key Dependencies**:
  - [dependency]: [brief purpose]

## Directory Structure

\`\`\`
[tree-like structure with inline comments explaining each directory]
\`\`\`

## Core Architecture

[Key functions, classes, entry points, and how they connect]

## Database

[If applicable: type, ORM, schema overview, migration approach]

## Authentication

[If applicable: strategy, provider, middleware, token handling]

## Third-Party Integrations

[If applicable: services used and what they're for]

## Deployment & Infrastructure

[If applicable: hosting, CI/CD, environments, Docker]

## Conventions & Patterns

- **Exports**: [pattern observed]
- **Naming**: [conventions used]
- **File Organization**: [pattern]
- **Error Handling**: [approach]
- **State Management**: [approach if applicable]

## Environment Variables

- `[VAR_NAME]` - [purpose]

## Build & Scripts

- `[command]` - [what it does]

## Testing

[If applicable: framework, patterns, utilities]

## Additional Context Files

[List any additional context files you created and what they contain]
```

### Optional Category Files

Follow the same patterns as repo-structure.md but focused on the specific category. Include relevant items with path, description, and key details.

---

## Step 7: Write Files and Report

Write all context files to `.opencode/context/`.

### Save AI Summaries

If the pre-analysis provided a file-summaries structure, update it with the AI-generated summaries for the files you read. Save to `.opencode/analysis/codebase-analysis.json`.

### Report Changes

**For Updates (existing context found):**
```
Updated context files in .opencode/context/

  repo-structure.md
    ~ Updated Tech Stack: added vitest dependency
    ~ Updated Directory Structure: added src/hooks/

  frontend/components.md
    + Added: Modal, Tooltip (2 new components)
    - Removed: OldButton (no longer exists)

Summary: Updated 2 files, created 0 new files.
Tokens used: ~8K (incremental mode, 97% savings)
```

**For First Run:**
```
Created context files in .opencode/context/

  repo-structure.md
    - Tech stack: Next.js 14 with TypeScript
    - Directory structure mapped
    - Database: PostgreSQL via Prisma
    - Auth: Clerk
    - 5 environment variables documented

  frontend/components.md
    - 12 reusable components documented

Summary: Created 2 context files.
Tokens used: ~120K (first run with pre-analysis)
```

---

## Step 8: Context Staleness Detection (For AI Agents)

When context files are loaded for use, AI agents should check staleness:

### Quick Staleness Check

```bash
# Parse metadata from context file
head -1 .opencode/context/repo-structure.md
# → <!-- Context: main@abc1234 -->

# Count commits behind
git log abc1234..HEAD --oneline | wc -l

# See what changed
git diff --name-only abc1234..HEAD | head -20
```

### Staleness Thresholds

| Metric | Status | Action |
|--------|--------|--------|
| Same commit | Current | Proceed normally |
| 1-5 commits behind | Recent | Proceed with awareness |
| 6-15 commits behind | Moderate | Warning: "Context may be outdated" |
| 16+ commits behind | Significant | Warning: "Run /context-update" |
| Branch mismatch | Unknown | Warning: "Context from different branch" |

---

## Important Notes

- **Scope**: Scan from current working directory downward
- **Depth limit**: Maximum 5 directory levels to prevent runaway scanning
- **Pre-analysis first**: Always check for and use pre-analysis data before reading files
- **Read selectively**: Only read files the pre-analysis flagged or that you need for understanding
- **Accuracy**: Infer descriptions when not explicitly documented (better than nothing)
- **Security**: Never read actual `.env` files, only `.env.example` or template files
- **Modular by default**: Create additional files when content warrants it
- **Don't delete**: Don't remove files the user may have manually created
- **Update, don't replace**: When updating, preserve structure and detect changes
- **Idempotent**: Running multiple times should produce consistent results
- **Patterns matter**: Detect cross-file conventions (they're the most valuable context)

## Edge Cases

1. **No package.json**: Still scan - might be Go, Python, Rust, etc.
2. **Multiple frameworks**: Document all (e.g., monorepo with React + Node backend)
3. **Monorepo**: Consider creating context files for the root, or per-package
4. **Nested node_modules**: Ignore them when scanning
5. **Build artifacts**: Ignore `dist/`, `build/`, `.next/`, etc.
6. **Hidden files**: Scan `.env.example` but respect `.gitignore` patterns
7. **Existing manual files**: If user created `.opencode/context/notes.md`, leave it alone
8. **Very small projects**: Don't create additional files if everything fits in repo-structure.md
9. **Pre-analysis missing**: Fall back to reading files directly (standard scan)
10. **Analysis cache corrupted**: Trigger full scan
