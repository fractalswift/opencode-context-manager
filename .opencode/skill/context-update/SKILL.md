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

## Step 5: Generate Context Files

### repo-structure.md (Required)

Always create this file with this structure:

```markdown
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
