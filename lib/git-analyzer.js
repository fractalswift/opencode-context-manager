import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Git Analysis Module
 * Handles all git-related operations for incremental context updates
 */

/**
 * Check if directory is a git repository
 */
export function isGitRepository(dir = '.') {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current git state (branch and commit hash)
 * @returns {{ branch: string, commit: string, shortCommit: string }}
 */
export function getCurrentGitState(dir = '.') {
  try {
    const branch = execSync('git branch --show-current', { 
      cwd: dir, 
      encoding: 'utf-8' 
    }).trim() || 'detached';
    
    const commit = execSync('git rev-parse HEAD', { 
      cwd: dir, 
      encoding: 'utf-8' 
    }).trim();
    
    const shortCommit = execSync('git rev-parse --short HEAD', { 
      cwd: dir, 
      encoding: 'utf-8' 
    }).trim();
    
    return { branch, commit, shortCommit };
  } catch (error) {
    throw new Error(`Failed to get git state: ${error.message}`);
  }
}

/**
 * Parse context metadata from markdown file header
 * Looks for: <!-- Context: branch@hash -->
 * @returns {{ branch: string, commit: string } | null}
 */
export function parseContextMetadata(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const firstLine = content.split('\n')[0];
    
    // Match: <!-- Context: branch@hash -->
    const match = firstLine.match(/<!--\s*Context:\s*([^@]+)@([a-f0-9]+)\s*-->/);
    
    if (match) {
      return {
        branch: match[1],
        commit: match[2]
      };
    }
    
    return null;
  } catch (error) {
    console.warn(`Warning: Could not parse context metadata from ${filePath}`);
    return null;
  }
}

/**
 * Get list of changed files between two commits
 * @param {string} oldCommit - Old commit hash
 * @param {string} newCommit - New commit hash (default: HEAD)
 * @returns {Array<{path: string, status: string, newPath?: string}>}
 */
export function getChangedFiles(oldCommit, newCommit = 'HEAD', dir = '.') {
  if (!oldCommit) {
    throw new Error('oldCommit is required');
  }
  
  try {
    const output = execSync(
      `git diff --name-status -M ${oldCommit}..${newCommit}`,
      { cwd: dir, encoding: 'utf-8' }
    );
    
    if (!output.trim()) {
      return [];
    }
    
    return parseNameStatusOutput(output);
  } catch (error) {
    throw new Error(`Failed to get changed files: ${error.message}`);
  }
}

/**
 * Get uncommitted changes (both staged and unstaged)
 * @returns {Array<{path: string, status: string, newPath?: string}>}
 */
export function getUncommittedChanges(dir = '.') {
  try {
    // Staged changes (index vs HEAD)
    const stagedOutput = execSync(
      'git diff --name-status -M --cached',
      { cwd: dir, encoding: 'utf-8' }
    );
    
    // Unstaged changes (working tree vs index)
    const unstagedOutput = execSync(
      'git diff --name-status -M',
      { cwd: dir, encoding: 'utf-8' }
    );
    
    // Untracked files
    const untrackedOutput = execSync(
      'git ls-files --others --exclude-standard',
      { cwd: dir, encoding: 'utf-8' }
    );
    
    const staged = stagedOutput.trim() ? parseNameStatusOutput(stagedOutput) : [];
    const unstaged = unstagedOutput.trim() ? parseNameStatusOutput(unstagedOutput) : [];
    const untracked = untrackedOutput.trim() 
      ? untrackedOutput.trim().split('\n').map(path => ({ status: 'A', path }))
      : [];
    
    // Merge and deduplicate (prefer staged status over unstaged)
    const seen = new Set();
    const merged = [];
    
    for (const change of [...staged, ...unstaged, ...untracked]) {
      if (!seen.has(change.path)) {
        seen.add(change.path);
        merged.push(change);
      }
    }
    
    return merged;
  } catch (error) {
    console.warn(`Warning: Could not get uncommitted changes: ${error.message}`);
    return [];
  }
}

/**
 * Get ALL changes: committed (since old commit) + uncommitted
 * This is what the scan strategy should use for a complete picture
 */
export function getAllChanges(oldCommit, dir = '.') {
  const committed = oldCommit ? getChangedFiles(oldCommit, 'HEAD', dir) : [];
  const uncommitted = getUncommittedChanges(dir);
  
  // Merge and deduplicate
  const seen = new Set();
  const merged = [];
  
  // Uncommitted changes take precedence (more recent state)
  for (const change of [...uncommitted, ...committed]) {
    if (!seen.has(change.path)) {
      seen.add(change.path);
      merged.push(change);
    }
  }
  
  return merged;
}

/**
 * Parse git diff --name-status output into structured array
 */
function parseNameStatusOutput(output) {
  return output.trim().split('\n').map(line => {
    const parts = line.split('\t');
    return {
      status: parts[0].charAt(0), // First char: A, M, D, R, C
      path: parts[1],
      newPath: parts[2] || undefined // For renames
    };
  });
}

/**
 * Count total commits between two points
 */
export function countCommitsBetween(oldCommit, newCommit = 'HEAD', dir = '.') {
  try {
    const output = execSync(
      `git log ${oldCommit}..${newCommit} --oneline`,
      { cwd: dir, encoding: 'utf-8' }
    );
    
    if (!output.trim()) {
      return 0;
    }
    
    return output.trim().split('\n').length;
  } catch {
    return -1; // Commit not in history
  }
}

/**
 * Check if a commit exists in current branch history
 */
export function isCommitInHistory(commit, dir = '.') {
  try {
    execSync(`git rev-parse --verify ${commit}`, { 
      cwd: dir, 
      stdio: 'pipe' 
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if exports changed in a file by looking at git diff
 * This is a simple heuristic - checks for lines with 'export' that changed
 * @returns {{ changed: boolean, details: string }}
 */
export function checkExportChanges(filePath, oldCommit, newCommit = 'HEAD', dir = '.') {
  try {
    const diff = execSync(
      `git diff ${oldCommit}..${newCommit} -- "${filePath}"`,
      { cwd: dir, encoding: 'utf-8' }
    );
    
    if (!diff.trim()) {
      return { changed: false, details: 'No changes' };
    }
    
    // Look for added or removed export lines
    const exportChanges = diff
      .split('\n')
      .filter(line => {
        return (line.startsWith('+') || line.startsWith('-')) && 
               !line.startsWith('+++') && 
               !line.startsWith('---') &&
               line.includes('export');
      });
    
    if (exportChanges.length > 0) {
      return {
        changed: true,
        details: `Export changes detected (${exportChanges.length} lines)`
      };
    }
    
    return { changed: false, details: 'Exports unchanged' };
  } catch (error) {
    // File might not exist in old commit (new file)
    if (error.message.includes('does not exist')) {
      return { changed: true, details: 'New file' };
    }
    throw error;
  }
}

/**
 * Categorize a file by its path and extension
 * Returns the category type for context organization
 */
export function categorizeFile(filePath) {
  const path = filePath.toLowerCase();
  
  // Test files
  if (path.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) return 'test';
  
  // Package/dependency files
  if (path === 'package.json' || path === 'package-lock.json' || 
      path === 'yarn.lock' || path === 'pnpm-lock.yaml') return 'dependencies';
  
  // Config files
  if (path === 'tsconfig.json' || path === 'jsconfig.json' || 
      path.endsWith('.config.js') || path.endsWith('.config.ts') ||
      path.endsWith('.config.mjs')) return 'config';
  
  // Database / ORM
  if (path.includes('prisma/') || path.includes('migrations/') || 
      path.includes('drizzle/') || path.match(/models\/.*\.(ts|js)$/)) return 'database';
  
  // Middleware
  if (path.match(/middleware\/.*\.(ts|tsx|js|jsx)$/)) return 'middleware';
  
  // Components
  if (path.match(/components\/.*\.(tsx|jsx|vue|svelte)$/)) return 'component';
  
  // Hooks (React/Vue)
  if (path.match(/(hooks|composables)\/use.*\.(ts|tsx|js|jsx)$/)) return 'hook';
  
  // Services
  if (path.match(/services\/.*\.(ts|tsx|js|jsx)$/)) return 'service';
  
  // API/Routes
  if (path.match(/(api|routes)\/.*\.(ts|tsx|js|jsx)$/)) return 'api';
  
  // Workers / Jobs / Queues
  if (path.match(/(workers|jobs|queues)\/.*\.(ts|tsx|js|jsx)$/)) return 'worker';
  
  // Utilities
  if (path.match(/(utils|helpers|lib)\/.*\.(ts|tsx|js|jsx)$/)) return 'utility';
  
  // Types
  if (path.match(/types\/.*\.(ts|d\.ts)$/) || path.endsWith('.d.ts')) return 'type';
  
  // Auth
  if (path.match(/auth\/.*\.(ts|tsx|js|jsx)$/)) return 'auth';
  
  // State management (stores)
  if (path.match(/(store|stores|state)\/.*\.(ts|tsx|js|jsx)$/)) return 'state';
  
  // Translations / i18n
  if (path.match(/(locales|translations|i18n)\//) || path.endsWith('.json') && path.includes('lang')) return 'i18n';
  
  // CI/CD
  if (path.includes('.github/workflows/') || path.includes('.gitlab-ci') || 
      path === 'Dockerfile' || path === 'docker-compose.yml') return 'deployment';
  
  // Documentation
  if (path.endsWith('.md') || path.endsWith('.mdx')) return 'documentation';
  
  // Scripts
  if (path.endsWith('.sh') || path.endsWith('.bash')) return 'script';
  
  // Python files
  if (path.endsWith('.py')) return 'python';
  
  // Go files
  if (path.endsWith('.go')) return 'go';
  
  return 'unknown';
}

/**
 * Get all files in repository (for initial scan)
 */
export function getAllTrackedFiles(dir = '.') {
  try {
    const output = execSync('git ls-files', { 
      cwd: dir, 
      encoding: 'utf-8' 
    });
    
    return output.trim().split('\n').filter(f => f);
  } catch (error) {
    throw new Error(`Failed to get tracked files: ${error.message}`);
  }
}

/**
 * Check if there are uncommitted changes
 */
export function hasUncommittedChanges(dir = '.') {
  try {
    const output = execSync('git status --porcelain', { 
      cwd: dir, 
      encoding: 'utf-8' 
    });
    
    return output.trim().length > 0;
  } catch {
    return false;
  }
}
