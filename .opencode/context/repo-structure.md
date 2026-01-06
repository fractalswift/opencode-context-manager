# Repository Context

Last updated: 2026-01-06

## Tech Stack

- **Language**: JavaScript (ES Modules)
- **Runtime**: Node.js >= 18.0.0
- **Package Manager**: npm
- **Module System**: ESM (`"type": "module"`)
- **Version**: 1.1.0

## Directory Structure

```
opencode-context-plugin/
├── assets/                          # Template files for installation
│   ├── command/
│   │   └── context-update.md        # Command template
│   └── skill/
│       └── context-update/
│           └── SKILL.md             # Skill template (modular context generation)
├── bin/
│   └── cli.js                       # Main CLI entry point
├── .opencode/                       # Local OpenCode configuration
│   ├── command/
│   │   └── context-update.md        # Installed command
│   ├── skill/
│   │   └── context-update/
│   │       └── SKILL.md             # Installed skill
│   └── context/
│       └── repo-structure.md        # This file (generated)
├── opencode.json                    # OpenCode configuration
├── package.json                     # Package manifest
├── README.md                        # Documentation
├── LICENSE                          # MIT License
└── .gitignore                       # Git ignore rules
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

## Assets

Template files copied during installation:

### Command Template (`assets/command/context-update.md`)
Defines the `/context-update` slash command that triggers the skill.

### Skill Template (`assets/skill/context-update/SKILL.md`)
Comprehensive instructions for scanning repositories and generating **modular** context files:

- **Required output**: `repo-structure.md` (always created)
- **Optional outputs**: Additional files based on project type:
  - `frontend/components.md` - Reusable UI components
  - `frontend/hooks.md` - Custom hooks/composables
  - `backend/api.md` - API endpoints
  - `backend/services.md` - Business logic services
  - `shared/types.md` - TypeScript types/interfaces
  - `shared/utilities.md` - Utility functions

The skill decides which files to create based on what it discovers (3+ items in a category warrants a separate file).

## Conventions & Patterns

- **Exports**: No module exports; CLI-only tool with bin entry
- **Naming**: camelCase for functions, SCREAMING_SNAKE for constants
- **File Organization**: Flat structure with assets/ for templates
- **Error Handling**: Try-catch with colored error messages, process.exit(1) on failure
- **Colors**: ANSI escape codes for terminal output (green, yellow, red, cyan, dim)
- **Async/Await**: Used for file operations and user prompts
- **ES Modules**: Native ESM with `import` statements

## Configuration

### package.json

```json
{
  "name": "opencode-context-manager",
  "version": "1.1.0",
  "type": "module",
  "bin": {
    "opencode-context-manager": "./bin/cli.js"
  }
}
```

### opencode.json

```json
{
  "instructions": [".opencode/context/**/*.md"],
  "$schema": "https://opencode.ai/config.json"
}
```

The glob pattern `**/*.md` picks up all markdown files in the context directory and subdirectories.

## Testing

No test framework configured.

## Environment Variables

No environment variables required.

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
```

## Additional Context Files

This project is simple enough that only `repo-structure.md` is needed. Larger projects using this tool may have additional files like:
- `frontend/components.md`
- `backend/api.md`
- etc.
