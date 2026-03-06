# Context Manager for OpenCode

No more wasting the first 20% of your session context asking the agent to explore your repo, and no more repeating yourself every session. The agent will know your codebase structure. This doesn't take many tokens away from your context as the structure is already summarized in markdown.

## What It Does

The Context Manager scans your repository and creates/updates **modular context files** in `.opencode/context/`. It always creates `repo-structure.md` with core project info, and optionally creates additional files for components, hooks, API endpoints, etc. based on what it discovers.

Once installed, context files are **automatically included in every prompt**, giving the AI persistent knowledge about your project.

## Intelligent Dependency-Aware Updates (v2.0+)

**Version 2.0** introduces a two-phase architecture: **static analysis** (zero AI tokens) followed by **selective AI reading** (minimal tokens).

### Architecture

```
Phase 1: Static Analysis (0 AI tokens)
  ├── TypeScript Compiler API → imports, exports, signatures, JSDoc
  ├── Dependency graph → file relationships, importance scores
  ├── Auto-summarizer → summaries for well-documented files
  └── Capability detector → database, auth, integrations, etc.

Phase 2: AI Agent (minimal tokens)
  ├── Reads pre-analysis summary (map of the codebase)
  ├── Reads only important/undocumented files
  ├── Detects cross-file patterns from samples
  └── Generates context from summaries + readings
```

### Token Savings

| Scenario | Cost | vs Reading Everything |
|----------|------|----------------------|
| **First run** | ~150-200K tokens | 40-55% savings |
| **Full scan (cached)** | ~15-20K tokens | 94% savings |
| **Incremental (5 files)** | ~8-12K tokens | 97% savings |
| **Incremental (1 file)** | ~3-5K tokens | 99% savings |
| **No changes** | ~0 tokens | 100% savings |

### How It Works

**First Run** (one-time investment):
1. Static analysis builds dependency graph and auto-generates summaries (0 AI tokens)
2. AI reads only important files (those without JSDoc, heavily imported, etc.)
3. AI generates comprehensive context from summaries + file readings
4. Everything cached in `.opencode/analysis/` (committed to git for team sharing)

**Subsequent Updates** (cheap and fast):
1. Git diff identifies changed files
2. Dependency graph finds affected files (imports/exports tracking)
3. AI re-reads only affected files and updates their context sections
4. Unchanged content preserved

### What Gets Detected Automatically (0 Tokens)

The static analysis pre-processes your codebase and detects:

- **Dependencies & imports**: Symbol-level tracking (which functions imported from where)
- **Project capabilities**: Database/ORM, auth provider, state management, styling framework, API style, integrations (Stripe, SendGrid, etc.), deployment platform, CI/CD, queues, realtime, i18n, testing, logging, monorepo setup, and more
- **File importance**: Scores each file by import count, JSDoc presence, file size, and complexity
- **Auto-summaries**: Generates descriptions for well-documented and simple files without AI

### Dependency Analysis

**TypeScript** (primary, symbol-level):
- Uses TypeScript Compiler API
- Tracks which specific symbols are imported from each module
- Extracts JSDoc comments, interface members, function signatures
- Detects `any` types and generic names as needing AI reading

**JavaScript** (fallback, file-level):
- Uses madge for file-level dependency tracking
- Detects circular dependencies

**Other languages**: Falls back to pattern-based categorization

### Flags

```bash
# Auto-decide (recommended)
/context-update

# Force full scan
/context-update --full

# Rebuild dependency graph
/context-update --rebuild-graph
```

### Example Output

The tool outputs a human-readable **action plan** before scanning:

```
═══════════════════════════════════════════════════════════
  CONTEXT UPDATE ACTION PLAN
═══════════════════════════════════════════════════════════

MODE: INCREMENTAL UPDATE
REASON: Changes are localized and safe for incremental update

CHANGED FILES: 3
  ~ src/components/Button.tsx
  ~ src/utils/helpers.ts
  + src/hooks/useDebounce.ts

AFFECTED FILES: 4
  • src/components/Button.tsx
    Directly modified
  • src/utils/helpers.ts
    Directly modified (exports unchanged, importers safe)
  • src/hooks/useDebounce.ts
    New file added
  • src/pages/Home.tsx
    Imports Button.tsx (exports changed)

ACTIONS:
  1. Read ONLY the affected files listed above
  2. Update their summaries in the analysis cache
  3. Update ONLY the affected sections in context files
  4. Preserve all unchanged content
  5. Save context with new git metadata

───────────────────────────────────────────────────────────
ESTIMATED TOKEN USAGE: ~10K tokens
SAVINGS vs full read: ~97%
═══════════════════════════════════════════════════════════
```

### Shared Analysis Cache

Analysis artifacts are committed to git so the whole team benefits:

```
.opencode/
  ├── analysis/                         # Committed to git
  │   └── codebase-analysis.json        # Dependency graph + summaries + capabilities
  ├── context/                          # Committed to git
  │   ├── repo-structure.md
  │   └── (optional category files)
  ├── skill/
  └── command/
```

### Testing

Run the test script to verify the system:

```bash
./test-incremental.sh
```

## Why Use It?

- **Cumulative Knowledge**: Each time you update context, it enriches the knowledge base for future work
- **Faster Onboarding**: New AI agents (or human developers) can quickly understand the codebase structure
- **Consistency**: Architectural patterns and conventions get documented automatically
- **Long-term Memory**: Important patterns don't get lost between coding sessions
- **Always Available**: Context is automatically included in every prompt

## Installation

Run this command in your project root:

```bash
npx opencode-context-manager init
```

This will:

1. Install the `/context-update` command and skill
2. Configure `opencode.json` to include context files in every prompt (via glob pattern)

### Options

```bash
# Overwrite existing files without asking
npx opencode-context-manager init --force

# Install globally to ~/.config/opencode/
npx opencode-context-manager init --global
```

## Usage

After installation, generate your context files:

```bash
# Run inside OpenCode
/context-update
```

The skill will:

1. Scan the repository from your current directory downward
2. Discover components, hooks, services, types, and patterns
3. Create/update context files in `.opencode/context/`
4. Report what changed

### First Run

```
Created context files in .opencode/context/

  repo-structure.md
    - Tech stack: React 19.2.0 with TypeScript
    - Directory structure mapped
    - 5 environment variables documented

  frontend/components.md
    - 12 reusable components documented

  frontend/hooks.md
    - 5 custom hooks documented

Summary: Created 3 context files.
```

### Subsequent Runs

```
Updated context files in .opencode/context/

  repo-structure.md
    ~ Updated Tech Stack: added @types/node v24.10.1

  frontend/components.md
    + Added: WeatherSummary, LoadingSpinner (2 new)
    - Removed: OldButton (no longer exists)

  frontend/hooks.md
    + Added: useSummary

Summary: Updated 3 files.
```

## What Gets Scanned

The skill intelligently scans for:

### Tech Stack

- Framework, language, and versions (from package.json, etc.)
- Build tools
- Key dependencies

### Code Organization

- **Components**: React, Vue, Svelte components with descriptions
- **Hooks**: Custom React hooks / Vue composables
- **API Services**: Backend integration code
- **Utilities**: Helper functions and modules
- **Types**: TypeScript definitions and interfaces

### Patterns & Conventions

- Export styles (named vs default)
- Naming conventions
- File organization patterns
- Error handling approaches

### Environment & Build

- Required environment variables (from .env.example)
- Build commands and scripts
- Testing setup (if present)

## Scanning Strategy

The skill uses **smart discovery**:

- Doesn't hardcode paths - adapts to your project structure
- Deep scans up to 5 directory levels
- Follows import patterns to find what's actually used
- Works with any framework: React, Vue, Node, Go, Python, etc.

## Scope Control

The context file is scoped to **where you run the command**:

```bash
# From repo root - scans everything
/project$ /context-update
-> Creates .opencode/context/repo-structure.md (entire repo)

# From subdirectory - scans only that subtree
/project/packages/frontend$ /context-update
-> Creates packages/frontend/.opencode/context/repo-structure.md (frontend only)
```

### Monorepo Setup

For monorepos, you can have context files for each package. Add glob patterns to your `opencode.json`:

```json
{
  "instructions": [
    ".opencode/context/**/*.md",
    "packages/frontend/.opencode/context/**/*.md",
    "packages/backend/.opencode/context/**/*.md"
  ]
}
```

Then run `/context-update` from each package directory to generate its context.

## When to Run It

Run `/context-update` when:

- **After completing a major feature** - Capture structural changes
- **After refactoring** - Document new patterns and organization
- **When joining a project** - Create initial context for AI agents
- **Periodically** - Keep context fresh (it's idempotent, safe to run anytime)
- **Forgot to run it for a while?** - No problem! It scans current state, not history

## Output Structure

The skill creates **modular context files** based on what it discovers:

```
.opencode/context/
├── repo-structure.md      # Always created - core project info
├── frontend/              # Created if frontend-heavy
│   ├── components.md      # If 3+ reusable components
│   └── hooks.md           # If 3+ custom hooks
├── backend/               # Created if backend-heavy  
│   ├── api.md             # If significant API surface
│   └── services.md        # If 3+ service modules
└── shared/                # Created if significant shared code
    ├── types.md           # Key TypeScript types
    └── utilities.md       # Utility functions
```

**Simple projects** may only need `repo-structure.md`. **Larger projects** get additional files automatically when there's enough content to warrant separation.

### repo-structure.md (always created)

Contains: Tech stack, directory structure, conventions, environment variables, build scripts.

### Additional files (created when relevant)

| File | Created when... |
|------|-----------------|
| `frontend/components.md` | 3+ reusable UI components |
| `frontend/hooks.md` | 3+ custom hooks/composables |
| `backend/api.md` | Significant API endpoints |
| `backend/services.md` | 3+ service modules |
| `shared/types.md` | Key TypeScript types |
| `shared/utilities.md` | 3+ utility modules |

## Customization

The skill and command files are installed locally in your `.opencode/` folder. Feel free to customize them:

- **Change output location**: Edit `.opencode/skill/context-update/SKILL.md` and update the output path
- **Add/remove sections**: Modify the skill instructions to scan for different things
- **Change scanning depth**: Adjust the depth limit in the skill

## Updating

To update to a newer version of the skill:

```bash
npx opencode-context-manager init --force
```

## File Structure

After installation, your project will have:

```
your-project/
├── .opencode/
│   ├── command/
│   │   └── context-update.md    # The /context-update command
│   ├── skill/
│   │   └── context-update/
│   │       └── SKILL.md         # Skill instructions
│   └── context/                 # Generated context (after first run)
│       ├── repo-structure.md    # Always created
│       ├── frontend/            # Optional, if relevant
│       │   ├── components.md
│       │   └── hooks.md
│       └── backend/             # Optional, if relevant
│           └── api.md
└── opencode.json                # Config with glob pattern
```

## Automation / CI

You can run context updates non-interactively using the OpenCode CLI. This is useful for:

- Git hooks (post-commit, pre-push)
- CI pipelines (on PR merge to main)
- Scripts

```bash
opencode run --model <provider/model> "/context-update"
```

**Note**: The `--model` flag is required in non-interactive mode.

### Example: GitHub Actions (on PR merge)

```yaml
# .github/workflows/context-update.yml
name: Update Context

on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  update-context:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install OpenCode
        run: curl -fsSL https://opencode.ai/install | bash
      
      - name: Update context
        run: opencode run --model <provider/model> "/context-update"
        env:
          # Add your provider's API key as a secret
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      
      - name: Commit changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .opencode/context/
          git diff --staged --quiet || git commit -m "chore: update repo context"
          git push
```

### Example: GitHub Actions (on every push)

```yaml
on:
  push:
    branches: [main]
```

## Troubleshooting

### "Dependency analysis failed"

This usually means TypeScript compilation errors or missing dependencies.

**Fix:**
```bash
# Check for TypeScript errors
npx tsc --noEmit

# Install dependencies
npm install

# Try updating with full scan
/context-update --full
```

The tool will automatically fall back to file-level analysis (madge) if TypeScript analysis fails.

### "Cache invalid, regenerating"

This is normal and happens when:
- Switching branches
- First run after git clone
- Cache older than 7 days
- Config files changed

The tool will regenerate the cache (~30K tokens) then use it for future updates.

### Context seems outdated

Force a full scan to ensure everything is current:

```bash
/context-update --full
```

### Incremental update missed changes

If you suspect the incremental logic missed something:

1. Check the analysis cache:
   ```bash
   cat .opencode/analysis/codebase-analysis.json | head -20
   ```

2. Rebuild the dependency graph:
   ```bash
   /context-update --rebuild-graph
   ```

3. Or force full scan:
   ```bash
   /context-update --full
   ```

### "No git repository" error

The tool requires a git repository for incremental updates. Initialize one:

```bash
git init
git add .
git commit -m "Initial commit"
```

### Disabling Incremental Mode

If you want to always use full scans, set an environment variable:

```bash
export OPENCODE_CONTEXT_INCREMENTAL=false
/context-update
```

## Security Note

The skill only reads `.env.example` or template files - it **never** reads actual `.env` files that might contain secrets.

## Contributing

Found a pattern the skill should detect? Want to improve the scanning logic? Contributions welcome!

## License

MIT
