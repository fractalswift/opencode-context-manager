<!-- Context: main@383f52f -->
# Repository Context

Last updated: 2026-03-05

## Tech Stack

- **Language**: JavaScript (ES Modules)
- **Runtime**: Node.js >= 18.0.0
- **Package Manager**: npm
- **Module System**: ESM (`"type": "module"`)
- **Version**: 2.0.0
- **Key Dependencies**:
  - `typescript` ^5.0.0 - TypeScript Compiler API for symbol-level dependency analysis
  - `madge` ^7.0.0 - File-level dependency graph generation for JavaScript projects

## Directory Structure

```
opencode-context-plugin/
├── assets/                          # Template files for installation
│   ├── command/
│   │   └── context-update.md        # Command template
│   └── skill/
│       └── context-update/
│           └── SKILL.md             # Skill template (modular context generation with incremental mode)
├── bin/
│   └── cli.js                       # Main CLI entry point (250 lines)
├── lib/                             # NEW: Dependency analysis modules (v2.0+)
│   ├── scan-strategy.js             # Scan mode decision engine (incremental vs full)
│   ├── dependency-analyzer.js       # Main orchestrator for dependency graph generation
│   ├── git-analyzer.js              # Git operations (changed files, export diff, categorization)
│   ├── typescript-analyzer.js       # TypeScript Compiler API for symbol-level analysis
│   ├── madge-analyzer.js            # Madge wrapper for file-level JavaScript analysis
│   └── error-handler.js             # Error handling and graceful fallback chain
├── .opencode/                       # Local OpenCode configuration
│   ├── command/
│   │   └── context-update.md        # Installed command
│   ├── skill/
│   │   └── context-update/
│   │       └── SKILL.md             # Installed skill with incremental scan logic
│   ├── context/
│   │   └── repo-structure.md        # This file (generated)
│   └── cache/                       # Dependency graph cache (gitignored)
│       └── dependency-graph.json    # Cached dependency graph (valid 7 days)
├── opencode.json                    # OpenCode configuration
├── package.json                     # Package manifest
├── package-lock.json                # npm lockfile
├── test-incremental.sh              # Test script for incremental mode validation
├── test-staleness.sh                # Test script for context staleness detection
├── README.md                        # Documentation
├── LICENSE                          # MIT License
└── .gitignore                       # Git ignore rules (includes .opencode/cache/)
```

## Core CLI (`bin/cli.js`)

The main CLI tool that installs the context-update skill and command into projects.

### Key Functions

- **`main()`** - Entry point; parses CLI arguments and routes to commands
- **`init(targetDir, options)`** - Main installation logic; copies assets and updates config
- **`copyAsset(srcRelative, destPath, force)`** - Copies template files from assets/ to target
- **`updateOpencodeJson(targetDir, force)`** - Updates or creates opencode.json with context instruction (uses glob pattern `.opencode/context/**/*.md`)
- **`confirmOverwrite(filePath, force)`** - Interactive prompt for overwriting existing files
- **`ensureDir(filePath)`** - Creates parent directories recursively
- **`prompt(question)`** - Readline-based user input helper
- **`printHelp()`** - Displays CLI usage information

### CLI Commands

- `init` - Install skill and command files to target directory

### CLI Options

- `--force`, `-f` - Overwrite existing files without prompting
- `--global`, `-g` - Install to ~/.config/opencode/ instead of current directory
- `--help`, `-h` - Show help message

## Dependency Analysis System (v2.0+)

The `lib/` directory contains a sophisticated dependency analysis system that enables **intelligent incremental updates** for context files.

### Architecture Overview

```
scan-strategy.js (Decision Engine)
    ↓
    ├─→ git-analyzer.js (Changed files, export diff)
    └─→ dependency-analyzer.js (Orchestrator)
            ↓
            ├─→ typescript-analyzer.js (Symbol-level for TS)
            ├─→ madge-analyzer.js (File-level for JS)
            └─→ error-handler.js (Graceful fallback)
```

### Module Descriptions

#### `lib/scan-strategy.js` (412 lines)
**Purpose**: Main decision engine for scan mode selection

**Key Functions**:
- `decideScanStrategy(options)` - Main entry point; analyzes git state and decides full vs incremental
- `shouldTriggerFullScan(options)` - Checks triggers: first run, >30% files changed, critical files, cache invalid
- `getAffectedFiles(changedFiles, graph, rootDir, oldCommit)` - Determines which files need re-scanning using dependency graph
- `groupByCategory(files)` - Organizes files by type (component, hook, service, etc.)
- `estimateTokenCost(strategy)` - Estimates token usage for the chosen strategy

**Full Scan Triggers**:
- No existing context (first run)
- No previous commit hash
- No dependency cache or invalid cache
- `package.json` or config files changed
- More than 30% of files changed
- Multiple new top-level directories
- User passes `--full` flag

**Incremental Logic**:
- Parses context metadata (`<!-- Context: branch@hash -->`)
- Gets changed files via git diff
- Checks if exports changed in each file
- If exports unchanged → skip importers (saves tokens)
- If exports changed → query dependency graph for all importers → add to re-scan list

#### `lib/dependency-analyzer.js` (350 lines)
**Purpose**: Orchestrates dependency graph generation and caching

**Key Functions**:
- `detectProjectType(rootDir)` - Returns TypeScript (symbol-level), JavaScript (file-level), or unknown (pattern-based)
- `getDependencyGraph(rootDir, forceRegenerate)` - Main entry point; loads cache or generates fresh graph
- `loadDependencyCache(rootDir)` - Loads cached graph from `.opencode/cache/dependency-graph.json`
- `saveDependencyCache(graph, metadata, rootDir)` - Saves graph to cache with git metadata
- `isCacheValid(cache, rootDir)` - Validates cache: commit in history, age < 7 days
- `generateDependencyGraph(rootDir, projectInfo)` - Generates fresh graph based on project type
- `getImporters(graph, filePath)` - Queries graph for files that import a given file
- `getImports(graph, filePath)` - Queries graph for files a given file imports
- `getGraphStatistics(graph)` - Returns stats: total files, avg imports/importers per file

**Cache Structure**:
```json
{
  "generated": "2026-03-05T10:30:00.000Z",
  "commit": "abc1234...",
  "shortCommit": "abc1234",
  "branch": "main",
  "projectType": "typescript",
  "precision": "symbol-level",
  "graph": { /* file-to-file + symbol mappings */ }
}
```

#### `lib/git-analyzer.js` (304 lines)
**Purpose**: All git-related operations for incremental updates

**Key Functions**:
- `isGitRepository(dir)` - Checks if directory is a git repo
- `getCurrentGitState(dir)` - Returns `{ branch, commit, shortCommit }`
- `parseContextMetadata(filePath)` - Parses `<!-- Context: branch@hash -->` from context files
- `getChangedFiles(oldCommit, newCommit, dir)` - Returns list of changed files with status (A/M/D/R)
- `checkExportChanges(filePath, oldCommit, newCommit, dir)` - Diffs file to see if export lines changed
- `categorizeFile(filePath)` - Categorizes by path/extension: component, hook, service, api, utility, type, test, documentation, dependencies, config, etc.
- `getAllTrackedFiles(dir)` - Returns all git-tracked files
- `countCommitsBetween(oldCommit, newCommit, dir)` - Counts commits between two points
- `isCommitInHistory(commit, dir)` - Validates commit exists in current branch history
- `hasUncommittedChanges(dir)` - Checks for uncommitted changes

**File Categories**:
- `test` - `*.test.*`, `*.spec.*`
- `dependencies` - `package.json`, lockfiles
- `config` - `tsconfig.json`, `*.config.js`
- `component` - `components/**/*.{tsx,jsx,vue,svelte}`
- `hook` - `hooks/use*.{ts,js}`
- `service` - `services/**/*`
- `api` - `api/**/*`, `routes/**/*`
- `utility` - `utils/**/*`, `lib/**/*`
- `type` - `types/**/*.ts`, `*.d.ts`
- `documentation` - `*.md`
- `script` - `*.sh`

#### `lib/typescript-analyzer.js` (357 lines)
**Purpose**: Symbol-level dependency analysis using TypeScript Compiler API

**Key Functions**:
- `isTypeScriptProject(rootDir)` - Checks for `tsconfig.json` or `.ts`/`.tsx` files
- `findTsConfig(rootDir)` - Locates `tsconfig.json` or `jsconfig.json`
- `createTypeScriptProgram(rootDir, configPath)` - Creates TypeScript program for analysis
- `analyzeFile(filePath, program)` - Extracts imports and exports with symbol names
- `buildDependencyGraph(rootDir)` - Main entry point; generates full symbol-level graph
- `getExportedSymbols(sourceFile, typeChecker)` - Extracts all exported names and types

**Graph Entry Structure** (TypeScript):
```json
{
  "src/utils/helpers.ts": {
    "imports": {
      "react": { "symbols": ["useState", "useEffect"], "isTypeOnly": false }
    },
    "exports": [
      { "name": "formatDate", "type": "function", "isDefault": false }
    ],
    "importedBy": [
      { "importer": "src/Button.tsx", "symbols": ["formatDate"] }
    ]
  }
}
```

**Precision**: Symbol-level → knows exactly which symbols are imported/exported, enabling smart decisions on whether importers are affected.

#### `lib/madge-analyzer.js` (172 lines)
**Purpose**: File-level dependency analysis for JavaScript projects

**Key Functions**:
- `isMadgeAvailable()` - Checks if madge is installed
- `isJavaScriptProject(rootDir)` - Checks for `package.json`
- `buildDependencyGraph(rootDir, options)` - Generates file-level dependency graph using madge
- `convertToGraphFormat(madgeObj, circular)` - Converts madge format to standard graph format

**Graph Entry Structure** (JavaScript):
```json
{
  "src/utils/helpers.js": {
    "imports": {
      "react": { "symbols": [], "isTypeOnly": false }
    },
    "exports": [],
    "importedBy": [
      { "importer": "src/Button.js", "symbols": [] }
    ],
    "isCircular": false
  }
}
```

**Precision**: File-level → knows which files import each other, but not which specific symbols. More conservative than TypeScript analysis.

**Limitations**: Cannot detect if exports changed → conservative fallback (always re-scan importers).

#### `lib/error-handler.js` (233 lines)
**Purpose**: Error handling and graceful degradation

**Key Features**:
- `ContextUpdateError` - Custom error class with `recoverable` flag and `fallback` strategy
- `withFallback(fn, fallbackFn, context)` - Wraps async functions with automatic fallback
- `analyzeDependenciesWithFallback(rootDir)` - Graceful fallback chain:
  1. Try TypeScript Compiler API (best)
  2. Fall back to madge (good)
  3. Fall back to pattern-based (basic)
- `validateEnvironment(rootDir)` - Checks for git, node_modules, etc.
- `retry(fn, options)` - Retry with exponential backoff
- `log(level, message, details)` - Consistent logging with levels (ERROR, WARN, INFO, DEBUG)

**Fallback Chain**:
```
TypeScript Compiler API (symbol-level)
    ↓ (if fails or not TS project)
Madge (file-level)
    ↓ (if fails or not installed)
Pattern-based (basic)
    ↓ (always works)
Full scan (safest fallback)
```

### Incremental Update Flow

```
1. User runs /context-update
2. scan-strategy.js checks:
   - Read existing context metadata (branch@hash)
   - Load dependency graph cache (if valid)
   - Get changed files via git diff
3. Decision:
   a) Full Scan if:
      - First run (no context)
      - Critical files changed
      - >30% files changed
      - Cache invalid/missing
   b) Incremental if:
      - Small, localized changes
      - Valid dependency cache
      - No critical files changed
4. Incremental mode:
   - For each changed file:
     - Check if exports changed (git diff)
     - If exports unchanged → skip importers
     - If exports changed → query graph → add importers to re-scan list
   - Only re-scan affected files
   - Preserve unchanged content
5. Update context files:
   - Replace only affected sections
   - Keep all other entries unchanged
6. Update cache:
   - Save new commit hash
   - Update graph if needed
```

### Token Savings

**Full Scan**: ~150K tokens
**Incremental Scan** (typical): ~5-15K tokens
**Savings**: 85-97%

**Example**:
- Changed 3 files
- 1 file's exports unchanged → skip 12 importers
- Only re-scan 3 files
- Result: ~8K tokens vs 150K tokens (95% savings)

## Assets

Template files copied during installation:

### Command Template (`assets/command/context-update.md`)
Defines the `/context-update` slash command that triggers the skill.

### Skill Template (`assets/skill/context-update/SKILL.md`)
Comprehensive instructions for scanning repositories and generating **modular** context files with intelligent incremental updates:

**Scan Strategy Decision (Step 0)**:
- Check for helper scripts in `lib/`
- If available → use `decideScanStrategy()` from `lib/scan-strategy.js`
- If not → manual fallback decision process
- Output scan plan with affected files and token estimates

**Required output**: `repo-structure.md` (always created)

**Optional outputs**: Additional files based on project type:
- `frontend/components.md` - Reusable UI components
- `frontend/hooks.md` - Custom hooks/composables
- `backend/api.md` - API endpoints
- `backend/services.md` - Business logic services
- `shared/types.md` - TypeScript types/interfaces
- `shared/utilities.md` - Utility functions

The skill decides which files to create based on what it discovers (3+ items in a category warrants a separate file).

**Incremental Mode** (Step 2.5):
- Use affected files list from scan strategy
- Only re-read and analyze affected files
- Preserve unchanged content in context files
- Replace only the sections for affected items
- Handle new/deleted/renamed files

**Git Metadata** (Step 5):
- Captures current branch and commit hash
- Embeds in context files as `<!-- Context: branch@hash -->`
- Used for staleness detection

**Context Staleness Detection** (Step 8):
AI agents can check staleness before using context:
- Parse metadata from context file
- Check commits behind
- Show warning if >15 commits behind or branch mismatch
- ~50-100 token cost

## Test Scripts

### `test-incremental.sh` (228 lines)
Comprehensive test script that validates incremental update functionality:

**Checks**:
- Git repository available
- Dependency analysis modules present (`lib/*.js`)
- NPM dependencies installed (TypeScript, madge)
- SKILL.md has incremental logic
- Cache directory in .gitignore

**Tests**:
1. Initial context generation (full scan)
2. Small change detection (incremental)
3. Export change detection (cascade to importers)
4. Large change detection (triggers full scan)
5. Package.json change (triggers full scan)
6. Cache regeneration

**Usage**:
```bash
./test-incremental.sh
```

### `test-staleness.sh` (107 lines)
Tests context staleness detection:

**Tests**:
1. Context is current (0 commits behind)
2. Context moderately stale (6-15 commits behind)
3. Context significantly stale (>15 commits behind)
4. Branch mismatch detection
5. Commit not in history

**Usage**:
```bash
./test-staleness.sh
```

## Conventions & Patterns

- **Exports**: No module exports in CLI; ESM imports in lib/ modules
- **Naming**: camelCase for functions, SCREAMING_SNAKE for constants
- **File Organization**: Flat structure with assets/ for templates, lib/ for dependency analysis
- **Error Handling**: Try-catch with colored error messages, graceful fallbacks, process.exit(1) on fatal errors
- **Colors**: ANSI escape codes for terminal output (green, yellow, red, cyan, dim)
- **Async/Await**: Used for file operations, user prompts, and dependency analysis
- **ES Modules**: Native ESM with `import` statements
- **Caching Strategy**: 7-day cache validity, invalidated by branch switches or config changes
- **Git Integration**: All incremental logic depends on git; gracefully falls back to full scan if git unavailable

## Configuration

### package.json

```json
{
  "name": "opencode-context-manager",
  "version": "2.0.0",
  "type": "module",
  "bin": {
    "opencode-context-manager": "./bin/cli.js"
  },
  "files": ["bin", "lib", "assets"],
  "dependencies": {
    "typescript": "^5.0.0",
    "madge": "^7.0.0"
  }
}
```

**Key Changes from v1.x**:
- Version bumped to 2.0.0 (major version due to new features)
- Added `lib` to files list
- Added `typescript` and `madge` dependencies

### opencode.json

```json
{
  "instructions": [".opencode/context/**/*.md"],
  "$schema": "https://opencode.ai/config.json"
}
```

The glob pattern `**/*.md` picks up all markdown files in the context directory and subdirectories.

### .gitignore

```
node_modules/
.DS_Store
.opencode/cache/
```

**Important**: `.opencode/cache/` is gitignored to prevent dependency graph caches from being committed. Each developer/branch should have its own cache.

## Testing

No test framework configured. Testing is done via shell scripts:
- `test-incremental.sh` - Validates incremental update functionality
- `test-staleness.sh` - Validates staleness detection

## Environment Variables

**Optional**:
- `OPENCODE_CONTEXT_INCREMENTAL=false` - Disables incremental mode (always full scan)
- `DEBUG=1` - Enables debug logging in error-handler.js

No required environment variables.

## Build & Scripts

No build scripts defined. The package is plain JavaScript that runs directly with Node.js.

### Usage

```bash
# Install to current project
npx opencode-context-manager init

# Install with force overwrite
npx opencode-context-manager init --force

# Install globally
npx opencode-context-manager init --global

# After installation, generate/update context
/context-update

# Force full scan
/context-update --full

# Rebuild dependency graph
/context-update --rebuild-graph
```

## Token Cost Estimates

### Full Scan
- **Repository scan**: ~120K tokens
- **Dependency graph generation**: ~30K tokens
- **Total**: ~150K tokens

### Incremental Scan (typical update)
- **Git analysis**: ~1K tokens
- **Dependency analysis**: ~1K tokens
- **File re-scanning**: ~2-10K tokens (depends on number of affected files)
- **Total**: ~5-15K tokens

### Savings
- **Typical update**: 85-97% token reduction
- **Example**: 3 files changed, 1 export unchanged → 8K tokens vs 150K tokens (95% savings)

## Additional Context Files

This project is simple enough that only `repo-structure.md` is needed. Larger projects using this tool may have additional files like:
- `frontend/components.md`
- `backend/api.md`
- `shared/types.md`
- etc.

## Key Design Decisions

1. **Modular Architecture**: Separate concerns (git, dependency analysis, scan strategy) into focused modules
2. **Graceful Degradation**: Multiple fallback levels (TypeScript → madge → pattern-based → full scan)
3. **Conservative Safety**: When in doubt, trigger full scan to avoid missing changes
4. **Cache Invalidation**: 7-day TTL, invalidated by branch switch or config changes
5. **Symbol-level Precision**: Use TypeScript Compiler API when available for best accuracy
6. **Token Efficiency**: Incremental updates save 85-97% of tokens for typical changes
7. **Git-centric**: All incremental logic relies on git metadata for change detection
8. **User Control**: Flags (`--full`, `--rebuild-graph`) allow manual override of automatic decisions

## Future Enhancements (Potential)

- Support for other languages (Python, Go, Rust)
- Parallel dependency analysis for large repositories
- Configurable cache TTL
- Watch mode (auto-update on file changes)
- Integration with CI/CD pipelines
- Web UI for visualizing dependency graphs
