#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CONTEXT_INSTRUCTION_PATH = '.opencode/context/repo-structure.md';

// ANSI colors
const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

async function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

async function confirmOverwrite(filePath, force) {
  if (!existsSync(filePath)) return true;
  if (force) return true;

  const answer = await prompt(
    `${colors.yellow('?')} ${filePath} already exists. Overwrite? (y/N) `
  );
  return answer === 'y' || answer === 'yes';
}

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function copyAsset(srcRelative, destPath, force) {
  return async () => {
    const srcPath = join(ASSETS_DIR, srcRelative);
    
    if (!existsSync(srcPath)) {
      console.error(colors.red(`Error: Source file not found: ${srcPath}`));
      process.exit(1);
    }

    const shouldWrite = await confirmOverwrite(destPath, force);
    if (!shouldWrite) {
      console.log(colors.dim(`  Skipped: ${destPath}`));
      return false;
    }

    ensureDir(destPath);
    copyFileSync(srcPath, destPath);
    console.log(colors.green(`  Created: ${destPath}`));
    return true;
  };
}

function updateOpencodeJson(targetDir, force) {
  return async () => {
    const configPath = join(targetDir, 'opencode.json');
    let config = {};
    let existed = false;

    if (existsSync(configPath)) {
      existed = true;
      try {
        const content = readFileSync(configPath, 'utf-8');
        config = JSON.parse(content);
      } catch (e) {
        console.error(colors.red(`Error parsing ${configPath}: ${e.message}`));
        const answer = await prompt(
          `${colors.yellow('?')} Create a new opencode.json? (y/N) `
        );
        if (answer !== 'y' && answer !== 'yes') {
          console.log(colors.dim(`  Skipped: opencode.json update`));
          return false;
        }
        config = {};
      }
    }

    // Ensure instructions array exists
    if (!config.instructions) {
      config.instructions = [];
    }

    // Check if already has the context instruction
    if (config.instructions.includes(CONTEXT_INSTRUCTION_PATH)) {
      console.log(colors.dim(`  Already configured: ${CONTEXT_INSTRUCTION_PATH} in instructions`));
      return false;
    }

    // Add the context file to instructions
    config.instructions.push(CONTEXT_INSTRUCTION_PATH);

    // Add schema if not present
    if (!config.$schema) {
      config.$schema = 'https://opencode.ai/config.json';
    }

    ensureDir(configPath);
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    
    if (existed) {
      console.log(colors.green(`  Updated: opencode.json (added context to instructions)`));
    } else {
      console.log(colors.green(`  Created: opencode.json`));
    }
    return true;
  };
}

async function init(targetDir, options) {
  const { force, global: isGlobal } = options;

  console.log('');
  console.log(colors.cyan('OpenCode Context Manager'));
  console.log(colors.dim('Installing skill and command files...'));
  console.log('');

  const tasks = [
    {
      name: 'skill',
      run: copyAsset(
        'skill/context-update/SKILL.md',
        join(targetDir, '.opencode', 'skill', 'context-update', 'SKILL.md'),
        force
      ),
    },
    {
      name: 'command',
      run: copyAsset(
        'command/context-update.md',
        join(targetDir, '.opencode', 'command', 'context-update.md'),
        force
      ),
    },
  ];

  // Only update opencode.json for local installs (not global)
  if (!isGlobal) {
    tasks.push({
      name: 'config',
      run: updateOpencodeJson(targetDir, force),
    });
  }

  let anyCreated = false;
  for (const task of tasks) {
    const created = await task.run();
    if (created) anyCreated = true;
  }

  console.log('');

  if (anyCreated) {
    console.log(colors.green('Done!'));
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Run ${colors.cyan('/context-update')} in OpenCode to generate your context file`);
    console.log(`  2. The context will be automatically included in every prompt`);
    console.log('');
    console.log(colors.dim(`Output location: .opencode/context/repo-structure.md`));
  } else {
    console.log(colors.dim('Nothing to do - everything is already set up.'));
  }

  console.log('');
}

function printHelp() {
  console.log(`
${colors.cyan('OpenCode Context Manager')}

Usage:
  npx opencode-context-manager init [options]

Commands:
  init          Install the context-update skill and command

Options:
  --force       Overwrite existing files without asking
  --global      Install to ~/.config/opencode/ instead of current directory
  --help, -h    Show this help message

Examples:
  npx opencode-context-manager init
  npx opencode-context-manager init --force
  npx opencode-context-manager init --global
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse flags
  const force = args.includes('--force') || args.includes('-f');
  const isGlobal = args.includes('--global') || args.includes('-g');
  const help = args.includes('--help') || args.includes('-h');
  
  // Get command (first non-flag argument)
  const command = args.find((arg) => !arg.startsWith('-'));

  if (help || (!command && args.length === 0)) {
    printHelp();
    process.exit(0);
  }

  if (command !== 'init') {
    console.error(colors.red(`Unknown command: ${command}`));
    console.error(`Run ${colors.cyan('npx opencode-context-manager --help')} for usage.`);
    process.exit(1);
  }

  // Determine target directory
  let targetDir;
  if (isGlobal) {
    const home = process.env.HOME || process.env.USERPROFILE;
    targetDir = join(home, '.config', 'opencode');
  } else {
    targetDir = process.cwd();
  }

  await init(targetDir, { force, global: isGlobal });
}

main().catch((err) => {
  console.error(colors.red('Error:'), err.message);
  process.exit(1);
});
