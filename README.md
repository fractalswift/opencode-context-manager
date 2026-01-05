# Context Manager Plugin for OpenCode

An OpenCode plugin that maintains an up-to-date knowledge base about your repository structure, components, and conventions.

## What It Does

The Context Manager plugin scans your repository and creates/updates `.opencode/context/repo-structure.md` - a comprehensive document that serves as a knowledge base for AI agents working on your codebase.

## Why Use It?

- **Cumulative Knowledge**: Each time you update context, it enriches the knowledge base for future work
- **Faster Onboarding**: New AI agents (or human developers) can quickly understand the codebase structure
- **Consistency**: Architectural patterns and conventions get documented automatically
- **Long-term Memory**: Important patterns don't get lost between coding sessions

## Installation

```bash
npm install opencode-context
```

Or with bun:

```bash
bun add opencode-context
```

Then install the plugin dependency:

```bash
cd node_modules/opencode-context && npm install
```

## Usage

Simply run the command from any directory in your repository:

```
/context-update
```

The plugin will:
1. Scan the repository from your current directory downward
2. Discover components, hooks, services, types, and patterns
3. Create/update `.opencode/context/repo-structure.md`
4. Report what changed

### First Run

```
Created .opencode/context/repo-structure.md

Summary:
- Scanned from: /Users/you/project
- Found: 12 components, 5 hooks, 3 services
- Tech stack: React 19.2.0 with TypeScript

Context file created. AI agents can now reference this for repository knowledge.
```

### Subsequent Runs

```
Updated .opencode/context/repo-structure.md

Changes:
+ Added component: WeatherSummary (src/components/WeatherSummary.tsx)
+ Added hook: useSummary (src/hooks/useSummary.ts)
+ Added service: ollamaApi (src/services/ollamaApi.ts)
~ Updated Tech Stack: added @types/node v24.10.1

Summary: Detected 1 new component, 1 new hook, 1 new service since last scan.

Context file is now synced with current repository state.
```

## What Gets Scanned

The plugin intelligently scans for:

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

The plugin uses **smart discovery**:

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

This makes it perfect for monorepos - you can have context files for each package.

## When to Run It

Run `/context-update` when:

- **After completing a major feature** - Capture structural changes
- **After refactoring** - Document new patterns and organization
- **When joining a project** - Create initial context for AI agents
- **Periodically** - Keep context fresh (it's idempotent, safe to run anytime)
- **Forgot to run it for a while?** - No problem! It scans current state, not history

## Output Format

The generated `repo-structure.md` includes:

```markdown
# Repository Context

Last updated: 2026-01-03 20:30:00

## Tech Stack
[Framework, languages, build tools, key dependencies]

## Directory Structure
[Tree view with purpose of each directory]

## Reusable Components
[Components with descriptions and paths]

## Custom Hooks
[Hooks with purposes and paths]

## API Services
[Services and what APIs they connect to]

## Utilities
[Helper modules and their purposes]

## Type Definitions
[Key types and interfaces]

## Conventions & Patterns
[Detected patterns in code organization]

## Testing
[Test framework and patterns]

## Environment Variables
[Required variables from .env.example]

## Build & Scripts
[Key commands and what they do]
```

## Tips

1. **Run it early**: Create initial context when starting a project
2. **Run it often**: It's fast and idempotent - run whenever you want
3. **Reference it**: When starting new work, read the context file to understand conventions
4. **Keep it updated**: After significant changes, refresh the context

## Security Note

The plugin only reads `.env.example` or template files - it **never** reads actual `.env` files that might contain secrets.

## Contributing

Found a pattern the plugin should detect? Want to improve the scanning logic? Contributions welcome!

## License

MIT
