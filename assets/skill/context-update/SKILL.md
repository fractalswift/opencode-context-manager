---
name: context-update
description: Scan repository and update context files
---

# Context Update

You are updating the repository context files. These files serve as a knowledge base about the codebase for AI agents to reference.

## Output Structure

You will create context files in `.opencode/context/`. The structure is **modular**:

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

## Step 0: Incremental vs Full Scan Decision

**IMPORTANT**: Before starting the scan, determine whether to use **incremental** or **full** scan mode. Incremental mode can save 85-97% of tokens for typical updates.

### A. Check for Helper Scripts

First, check if the project has installed the dependency analysis helper scripts:

```bash
# Check if lib directory exists
ls lib/scan-strategy.js 2>/dev/null
```

**If helper scripts exist** (recommended):
1. Use Node.js to run the scan strategy decision:
   ```javascript
   import { decideScanStrategy, estimateTokenCost } from './lib/scan-strategy.js';
   
   const strategy = await decideScanStrategy({
     rootDir: process.cwd(),
     forceFullScan: // check if user passed --full flag
   });
   
   console.log(strategy);
   ```

2. The helper will output a strategy object with:
   - `mode`: 'full' or 'incremental'
   - `reason`: Why this mode was chosen
   - `affectedFiles`: Which files need re-scanning (for incremental)
   - `categories`: Files grouped by category
   - `graph`: Dependency graph (for incremental)

3. Follow the recommended strategy and skip to the appropriate section below

**If helper scripts don't exist** (fallback):
Continue with manual decision process below.

### B. Manual Decision Process (Fallback)

If helper scripts are not available, manually determine scan mode:

#### B.1: Parse Existing Context Metadata

Check if context files exist with git metadata:

```bash
# Read first line of repo-structure.md
head -1 .opencode/context/repo-structure.md
```

Look for: `<!-- Context: branch@hash -->`

Extract the commit hash (e.g., `main@abc1234` → hash is `abc1234`)

#### B.2: Analyze Changes

If you have a previous commit hash:

```bash
# Get changed files
git diff --name-status -M <old-hash>..HEAD

# Count changed files
git diff --name-only <old-hash>..HEAD | wc -l

# Get total tracked files
git ls-files | wc -l
```

#### B.3: Check Full Scan Triggers

**Trigger FULL SCAN if any of these are true:**

1. ❌ No existing context found (first run)
2. ❌ No previous commit hash available
3. ❌ `package.json` or `package-lock.json` changed
4. ❌ `tsconfig.json` or other major config files changed
5. ❌ More than 30% of files changed (large refactor)
6. ❌ New top-level directories created
7. ❌ User passed `--full` flag explicitly
8. ❌ No dependency cache or cache is invalid

**Use INCREMENTAL SCAN if:**
- ✅ Existing context found with valid commit hash
- ✅ Less than 30% of files changed
- ✅ No critical configuration files changed
- ✅ Changes are localized to specific categories

### C. Incremental Scan Process

If incremental scan is chosen:

#### C.1: Load or Generate Dependency Graph

**Check for cached graph:**
```bash
cat .opencode/cache/dependency-graph.json
```

**If cache exists and is valid** (commit is in current history, <7 days old):
- Load the cached dependency graph
- This contains file-level or symbol-level import/export relationships

**If cache doesn't exist or is invalid:**
- Generate fresh dependency graph (see Step 2.5 below)
- This costs ~20-50K tokens but is then cached for future updates

#### C.2: Determine Affected Files

For each changed file, determine what needs updating:

1. **Check if exports changed:**
   ```bash
   # Look for changed export lines
   git diff <old-hash>..HEAD -- <file> | grep "^[+-]export"
   ```

2. **If exports unchanged:**
   - Only update this file's entry in context
   - Skip all files that import it (they're not affected)

3. **If exports changed:**
   - Update this file's entry
   - Query dependency graph to find all importers
   - Add all importers to the re-scan list

4. **For new files (status: A):**
   - Add to re-scan list
   - Don't cascade (nothing imports it yet)

5. **For deleted files (status: D):**
   - Remove from context
   - Don't scan

6. **For renamed files (status: R):**
   - Treat as delete old + add new

#### C.3: Show Scan Plan

Display what will be scanned:

```
⚡ Incremental update mode

Changed files: 5
  ~ src/components/Button.tsx
  ~ src/components/Modal.tsx
  ~ src/utils/helpers.ts
  + tests/Button.test.tsx
  ~ README.md

Dependency analysis:
  • helpers.ts exports unchanged → skip 12 importers
  • Button.tsx modified → will re-scan
  • Modal.tsx modified → will re-scan

Total files to scan: 3 (vs 150+ for full scan)
Estimated tokens: ~8K (95% savings)

Proceeding with incremental scan...
```

### D. Full Scan Process

If full scan is chosen:

```
🔄 Full scan mode

Reason: <reason why full scan was triggered>

This will:
- Scan entire repository comprehensively
- Regenerate all context files
- Rebuild dependency graph cache

Estimated tokens: ~150K

Proceeding with full scan...
```

## Step 1: Read Existing Context

First, check if `.opencode/context/` already exists. If it does, read ALL markdown files in it to understand the previous state. This will help you:

- Detect what changed in each file
- Preserve the structure the user/previous runs established
- Update existing files rather than recreating from scratch
- Show meaningful diffs to the user

**Important**: Don't delete files the user may have manually added. Only update files you recognize as auto-generated context files.

## Step 2: Scan Repository

Scan the repository comprehensively. Use deep scanning (up to 5 levels) to discover:

### A. Tech Stack
- Read `package.json`, `requirements.txt`, `Gemfile`, `go.mod`, `Cargo.toml`, etc.
- Identify framework, language version, build tools
- List key dependencies with brief purpose

### B. Directory Structure
- Map out the high-level folder organization
- Identify the purpose of each major directory
- Note common patterns (src/, lib/, components/, etc.)

### C. Reusable Components
- Scan for React/Vue/Svelte components (`.tsx`, `.jsx`, `.vue`, `.svelte`)
- Common locations: `src/components/`, `components/`, `app/components/`
- For each component, extract:
  - Name and file path
  - Description from JSDoc comments, or first comment in file, or inferred from filename
  - Example: "WeatherCard (src/components/WeatherCard.tsx) - Displays weather data with icon and temperature"

### D. Custom Hooks (React/Vue)
- Look for files matching `use*.ts`, `use*.js` patterns
- Common locations: `src/hooks/`, `hooks/`, `composables/`
- Extract name, path, and purpose

### E. API Endpoints & Services
- Look for API route definitions and service modules
- Common locations: `src/services/`, `src/api/`, `lib/api/`, `api/`, `routes/`
- Identify endpoints, methods, and what they do
- Example: "GET /api/users - List all users with pagination"

### F. Utilities
- Common locations: `src/utils/`, `utils/`, `lib/`, `helpers/`
- List utility modules and their purpose

### G. Type Definitions
- TypeScript: `src/types/`, `types/`, `*.d.ts` files
- Document key types/interfaces that are widely used

### H. Conventions & Patterns
Detect patterns by analyzing code:
- Export style (named vs default)
- Naming conventions (camelCase, PascalCase, kebab-case)
- Import patterns (relative vs absolute, aliases)
- File organization (co-location, separation)
- Error handling approaches

### I. Testing Patterns (If Tests Exist)
- Test framework (Jest, Vitest, Pytest, etc.)
- Test file patterns (`*.test.js`, `*.spec.ts`, `_test.go`)
- Test location (co-located, separate `/tests` directory)

### J. Environment Variables
- Read `.env.example`, `.env.template`, or scan code for `process.env`, `os.Getenv`, etc.
- List required environment variables and their purpose
- DO NOT read actual `.env` files (may contain secrets)

### K. Build & Scripts
- From `package.json`, `Makefile`, etc.
- Document key commands: dev server, build, test, deploy

## Step 2.5: Incremental Scan (When Applicable)

**Skip this step if you're doing a full scan. This step is only for incremental mode.**

### A. Use Affected Files List

If you determined incremental mode in Step 0, you should have:
- List of affected files to re-scan
- Reason for each file being affected
- Dependency graph (if available)

**Only re-read and analyze the files in the affected list.** Do not scan the entire repository.

### B. Selective Category Scanning

For each category with affected files:

1. **Components**: If any component file changed, re-scan only those specific components
2. **Utilities**: If utility files changed, check if exports changed
   - Exports unchanged: Update only the utility entry
   - Exports changed: Also re-scan files that import it (from dependency graph)
3. **Services/API**: Re-scan only the specific service files that changed
4. **Types**: If type files changed, note that importers may be affected
5. **Documentation/Tests**: Usually safe to skip these

### C. Preserve Unchanged Content

When updating context files:
- **Read existing context file** for that category
- **Replace only the sections** for affected items
- **Keep all other entries unchanged** from the existing context

Example:
```markdown
<!-- If Button.tsx changed but Modal.tsx didn't -->

# Components

## Button
[NEW scanned content for Button]

## Modal
[KEEP existing content for Modal from old context]

## Card
[KEEP existing content for Card from old context]
```

### D. Handle Special Cases

**New files added:**
- Scan and add to appropriate context file
- If this is the 3rd item in a category, consider creating a new context file

**Files deleted:**
- Remove the entry from context file
- If category now has <3 items, consider merging back into repo-structure.md

**Files renamed:**
- Remove old entry
- Add new entry with new path

### E. Update Dependency Graph Cache

If using helper scripts, the dependency graph will be updated automatically.

If doing manually and new files were added:
- Note that dependency graph may need updating
- This will happen on next full scan

### F. Incremental Scan Output

After incremental scan, you should have:
- Updated context files for affected categories only
- Preserved all unchanged content
- List of what was updated (for user report)

## Step 3: Smart Discovery

Don't assume standard paths. Instead:

1. **Look for package manifests first** to understand the tech stack
2. **Scan all directories** to find actual structure (not just `src/`)
3. **Follow import statements** to discover what's actually used
4. **Use glob patterns** to find files:
   - Components: `**/*.{tsx,jsx,vue,svelte}`
   - Hooks: `**/use*.{ts,js,tsx,jsx}`
   - Services: `**/services/**/*.{ts,js}`, `**/api/**/*.{ts,js}`
   - Types: `**/types/**/*.{ts,d.ts}`, `**/*.d.ts`

## Step 4: Decide Output Structure

You MUST create `repo-structure.md`. Additional files are OPTIONAL.

### When to Create Additional Files

Create a separate file when:
- There are **3+ items** in a category worth documenting individually
- The content would make `repo-structure.md` unwieldy (>300 lines)
- The category has distinct, reusable artifacts (components, hooks, endpoints)

Keep everything in `repo-structure.md` when:
- The project is small or simple
- Categories have only 1-2 items
- Items are better described inline with the structure

### Example Structures

Pick and adapt based on what you discover:

**Frontend-focused project:**
```
.opencode/context/
├── repo-structure.md
└── frontend/
    ├── components.md      # If 3+ reusable components
    └── hooks.md           # If 3+ custom hooks
```

**Backend-focused project:**
```
.opencode/context/
├── repo-structure.md
└── backend/
    ├── api-endpoints.md   # If significant API surface
    └── services.md        # If 3+ service modules
```

**Full-stack project:**
```
.opencode/context/
├── repo-structure.md
├── frontend/
│   ├── components.md
│   └── hooks.md
├── backend/
│   └── api.md
└── shared/
    └── types.md
```

**CLI/Library project:**
```
.opencode/context/
├── repo-structure.md
└── api/
    └── public-api.md      # Exported functions/classes
```

**Simple project (no additional files needed):**
```
.opencode/context/
└── repo-structure.md      # Everything fits here
```

### File Naming

Use descriptive, kebab-case filenames:
- `components.md` not `frontend-components.md` (the folder provides context)
- `api-endpoints.md` or just `api.md`
- `custom-hooks.md` or just `hooks.md`

### What Goes Where

| File | Contents |
|------|----------|
| `repo-structure.md` | Tech stack, directory structure, conventions, build scripts, env vars, high-level overview |
| `frontend/components.md` | Reusable UI components with descriptions and props |
| `frontend/hooks.md` | Custom hooks/composables with usage |
| `backend/api.md` | API endpoints, routes, request/response formats |
| `backend/services.md` | Business logic services and their responsibilities |
| `shared/types.md` | Key TypeScript types/interfaces used across the codebase |
| `shared/utilities.md` | Utility functions with descriptions |
| `testing/patterns.md` | Test utilities, mocks, fixtures, testing conventions |

## Step 5: Capture Git Metadata

Before generating context files, capture git state:

1. **Current branch**: `git branch --show-current` (or "detached" if detached HEAD)
2. **Commit hash**: `git rev-parse --short HEAD`
3. **Format**: `[branch]@[hash]` (e.g., `main@abc1234`)

This will be embedded in each context file for staleness detection.

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

## Conventions & Patterns

- **Exports**: [pattern observed]
- **Naming**: [conventions used]
- **File Organization**: [pattern]
- **Error Handling**: [approach]

## Environment Variables

- `[VAR_NAME]` - [purpose]

## Build & Scripts

- `[command]` - [what it does]

## Additional Context Files

[List any additional context files you created and what they contain]
```

### frontend/components.md (Optional)

```markdown
# Frontend Components

Reusable UI components in this project.

## [ComponentName]

**Path**: `src/components/ComponentName.tsx`

[Description from JSDoc or inferred]

**Props**:
- `propName` (type) - description

---

[Repeat for each component]
```

### frontend/hooks.md (Optional)

```markdown
# Custom Hooks

React hooks / Vue composables in this project.

## [useHookName]

**Path**: `src/hooks/useHookName.ts`

[What it does]

**Returns**: [what it returns]

**Usage**:
\`\`\`tsx
const result = useHookName(params);
\`\`\`

---

[Repeat for each hook]
```

### backend/api.md (Optional)

```markdown
# API Endpoints

## [Resource Name]

### [METHOD] [path]

[Description]

**Request**:
- Body/Query params if applicable

**Response**:
- Success response shape

---

[Repeat for each endpoint]
```

### backend/services.md (Optional)

```markdown
# Backend Services

## [ServiceName]

**Path**: `src/services/ServiceName.ts`

[What this service handles]

**Key Methods**:
- `methodName()` - [what it does]

---

[Repeat for each service]
```

### shared/types.md (Optional)

```markdown
# Type Definitions

Key types and interfaces used across the codebase.

## [TypeName]

**Path**: `src/types/models.ts`

\`\`\`typescript
interface TypeName {
  field: type;
}
\`\`\`

[What it represents]

---

[Repeat for key types]
```

## Step 6: Detect Changes

Compare old vs new for EACH file and identify:
- **Added**: New items discovered
- **Removed**: Items that no longer exist in the codebase
- **Modified**: Changes to existing items

## Step 7: Write Files and Report

Write all context files to `.opencode/context/`.

Then report to the user:

### For Updates (existing context found):

```
Updated context files in .opencode/context/

  repo-structure.md
    ~ Updated Tech Stack: added vitest dependency
    ~ Updated Directory Structure: added src/hooks/

  frontend/components.md
    + Added: Modal, Tooltip (2 new components)
    - Removed: OldButton (no longer exists)

  frontend/hooks.md (new file)
    + Created with 4 hooks: useAuth, useDebounce, useLocalStorage, useMediaQuery

Summary: Updated 2 files, created 1 new file.
```

### For First Run (no existing context):

```
Created context files in .opencode/context/

  repo-structure.md
    - Tech stack: Next.js 14 with TypeScript
    - Directory structure mapped
    - 5 environment variables documented
    - 8 build scripts documented

  frontend/components.md
    - 12 reusable components documented

  frontend/hooks.md
    - 4 custom hooks documented

Summary: Created 3 context files. AI agents can now reference these for repository knowledge.
```

## Step 8: Context Staleness Detection (For AI Agents)

When context files are loaded for use, AI agents should check staleness before relying on the information:

### A. Parse Context Header

Extract the embedded metadata from the HTML comment at the top of each context file:
```markdown
<!-- Context: main@abc1234 -->
```

Format: `[branch]@[short-hash]`

### B. Check Current Git State

Run these commands to assess staleness:

1. **Get current branch and commit**:
   ```bash
   git branch --show-current  # Current branch
   git rev-parse --short HEAD # Current commit hash
   ```

2. **Count commits behind** (if on same branch):
   ```bash
   git log abc1234..HEAD --oneline | wc -l
   ```

3. **See what files changed** (token-efficient):
   ```bash
   git diff --name-only abc1234..HEAD
   ```
   
   **Important**: Filter out noise files:
   - Skip: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
   - Skip: `dist/`, `build/`, `.next/`, `coverage/`
   - Skip: `.env` files
   - Limit: First 20 files max

### C. Staleness Thresholds

| Metric | Status | Action |
|--------|--------|--------|
| Same commit | Current | Proceed normally |
| 1-5 commits behind | Recent | Minor staleness, proceed with awareness |
| 6-15 commits behind | Moderate | Warning: "Context may be outdated" |
| 16+ commits behind | Significant | Warning: "Recommend running /context-update" |
| Branch mismatch | Unknown | Warning: "Context from [branch], currently on [current-branch]" |
| Hash not in history | Diverged | Warning: "Context commit not in current branch history" |

### D. Token-Efficient Assessment

**Total cost: ~50-100 tokens**

Example check output:
```
Context staleness check:
- Context: main@abc1234 (generated 2026-01-06)
- Current: main@def5678
- Commits behind: 8
- Files changed: 12 (showing first 5):
  - src/components/NewButton.tsx
  - src/utils/helpers.js
  - src/hooks/useAuth.ts
  - tests/components/Button.test.tsx
  - README.md
```

### E. Decision Logic

```
IF branch mismatch OR commit not in history:
  → Show warning about branch/context mismatch
  → Use context cautiously

ELIF commits_behind > 15:
  → Strong warning: "Context significantly stale"
  → Recommend: "Run /context-update to refresh"

ELIF commits_behind > 5:
  → Moderate warning: "Context somewhat outdated"
  → Show changed files to help assess impact

ELSE:
  → Proceed normally
```

### F. Non-Git Repositories

If no `.git` directory exists:
- Skip staleness check entirely
- Use context as-is (manual updates only)
- Consider recommending git initialization for better context management

## Important Notes

- **Scope**: Scan from current working directory downward
- **Depth limit**: Maximum 5 directory levels to prevent runaway scanning
- **Performance**: For very large repos, focus on most important items first
- **Accuracy**: Infer descriptions when not explicitly documented (better than nothing)
- **Security**: Never read actual `.env` files, only `.env.example` or template files
- **Modular by default**: Create additional files when content warrants it
- **Don't delete**: Don't remove files the user may have manually created
- **Update, don't replace**: When updating, preserve structure and detect changes
- **Idempotent**: Running multiple times should produce consistent results

## Edge Cases

1. **No package.json**: Still scan - might be Go, Python, Rust, etc.
2. **Multiple frameworks**: Document all (e.g., monorepo with React + Node backend)
3. **Monorepo**: Consider creating context files for the root, or per-package
4. **Nested node_modules**: Ignore them when scanning
5. **Build artifacts**: Ignore `dist/`, `build/`, `.next/`, etc.
6. **Hidden files**: Scan `.env.example` but respect `.gitignore` patterns
7. **Existing manual files**: If user created `.opencode/context/notes.md`, leave it alone
8. **Very small projects**: Don't create additional files if everything fits in repo-structure.md

## Example Workflow

```bash
# User runs from repo root
/project-root$ /context-update

# Agent scans entire repo
# Creates:
#   /project-root/.opencode/context/repo-structure.md
#   /project-root/.opencode/context/frontend/components.md (if applicable)
#   /project-root/.opencode/context/backend/api.md (if applicable)

# Later, user adds new components and runs again
/project-root$ /context-update

# Agent detects changes, updates existing files
# Reports what was added/removed/modified
```
