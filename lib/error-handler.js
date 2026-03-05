/**
 * Error Handling and Fallback Chain
 * Provides graceful degradation when dependency analysis fails
 */

export class ContextUpdateError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ContextUpdateError';
    this.recoverable = options.recoverable !== false;
    this.fallback = options.fallback || 'full-scan';
    this.originalError = options.originalError;
  }
}

/**
 * Wrap async functions with error handling and fallback
 */
export async function withFallback(fn, fallbackFn, context = '') {
  try {
    return await fn();
  } catch (error) {
    console.warn(`⚠️  ${context} failed: ${error.message}`);
    
    if (fallbackFn) {
      console.log(`   Falling back to alternative approach...`);
      try {
        return await fallbackFn();
      } catch (fallbackError) {
        console.error(`❌ Fallback also failed: ${fallbackError.message}`);
        throw new ContextUpdateError(
          `Both primary and fallback failed for ${context}`,
          { originalError: error, recoverable: false }
        );
      }
    }
    
    throw error;
  }
}

/**
 * Validate that required tools/files are available
 */
export function validateEnvironment(rootDir) {
  const issues = [];
  const warnings = [];
  
  // Check if git is available
  try {
    const { execSync } = require('child_process');
    execSync('git --version', { stdio: 'pipe' });
  } catch {
    issues.push('Git is not available - context updates require a git repository');
  }
  
  // Check if in a git repository
  try {
    const { existsSync } = require('fs');
    const { join } = require('path');
    if (!existsSync(join(rootDir, '.git'))) {
      issues.push('Not a git repository - initialize with: git init');
    }
  } catch {
    issues.push('Cannot access .git directory');
  }
  
  // Check if node_modules exists (for dependencies)
  try {
    const { existsSync } = require('fs');
    const { join } = require('path');
    if (!existsSync(join(rootDir, 'node_modules'))) {
      warnings.push('node_modules not found - run npm install for full functionality');
    }
  } catch {
    warnings.push('Cannot check node_modules');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    warnings
  };
}

/**
 * Safe JSON parse with fallback
 */
export function safeJSONParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Safe file read with fallback
 */
export function safeReadFile(filePath, fallback = null) {
  try {
    const { readFileSync, existsSync } = require('fs');
    if (!existsSync(filePath)) {
      return fallback;
    }
    return readFileSync(filePath, 'utf-8');
  } catch {
    return fallback;
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2
  } = options;
  
  let lastError;
  let delay = initialDelay;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        console.warn(`   Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Log levels for consistent output
 */
export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

export function log(level, message, details = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = `[${timestamp}]`;
  
  switch (level) {
    case LogLevel.ERROR:
      console.error(`${prefix} ❌ ${message}`);
      if (details) console.error(details);
      break;
    case LogLevel.WARN:
      console.warn(`${prefix} ⚠️  ${message}`);
      if (details) console.warn(details);
      break;
    case LogLevel.INFO:
      console.log(`${prefix} ℹ️  ${message}`);
      if (details) console.log(details);
      break;
    case LogLevel.DEBUG:
      if (process.env.DEBUG) {
        console.log(`${prefix} 🔍 ${message}`);
        if (details) console.log(details);
      }
      break;
  }
}

/**
 * Graceful degradation chain for dependency analysis
 */
export async function analyzeDependenciesWithFallback(rootDir) {
  const results = {
    method: null,
    graph: null,
    precision: null,
    warnings: []
  };
  
  // Try 1: TypeScript Compiler API (best)
  try {
    const { isTypeScriptProject, buildDependencyGraph } = await import('./typescript-analyzer.js');
    
    if (isTypeScriptProject(rootDir)) {
      console.log('📊 Using TypeScript Compiler API (symbol-level precision)');
      const graph = buildDependencyGraph(rootDir);
      return {
        method: 'typescript',
        graph,
        precision: 'symbol-level',
        warnings: []
      };
    }
  } catch (error) {
    results.warnings.push(`TypeScript analysis failed: ${error.message}`);
    console.warn(`⚠️  TypeScript analysis unavailable, trying madge...`);
  }
  
  // Try 2: Madge (good)
  try {
    const { buildDependencyGraph } = await import('./madge-analyzer.js');
    console.log('📊 Using Madge (file-level precision)');
    const result = await buildDependencyGraph(rootDir);
    return {
      method: 'madge',
      graph: result.graph,
      precision: 'file-level',
      warnings: result.warnings || []
    };
  } catch (error) {
    results.warnings.push(`Madge analysis failed: ${error.message}`);
    console.warn(`⚠️  Madge analysis unavailable, using pattern matching...`);
  }
  
  // Try 3: Pattern-based (basic)
  console.log('📊 Using pattern-based analysis (basic)');
  return {
    method: 'pattern-based',
    graph: {},
    precision: 'pattern-based',
    warnings: [...results.warnings, 'Using basic pattern matching - install dependencies for better analysis']
  };
}
