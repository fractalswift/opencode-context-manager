# Context Manager for OpenCode

No more wasting the first 20% of your session context asking the agent to explore your repo, and no more repeating yourself every session. The agent will know your codebase structure. This doesn't take many tokens away from your context as the structure is already summarized in markdown.

## What It Does

The Context Manager scans your repository and creates/updates **modular context files** in `.opencode/context/`. It always creates `repo-structure.md` with core project info, and optionally creates additional files for components, hooks, API endpoints, etc. based on what it discovers.

Once installed, context files are **automatically included in every prompt**, giving the AI persistent knowledge about your project.

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
# Option 1: Run inside OpenCode
/context-update

# Option 2: Run from terminal
opencode run "/context-update"
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

## Security Note

The skill only reads `.env.example` or template files - it **never** reads actual `.env` files that might contain secrets.

## Contributing

Found a pattern the skill should detect? Want to improve the scanning logic? Contributions welcome!

## License

MIT
