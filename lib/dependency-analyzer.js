import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import * as tsAnalyzer from './typescript-analyzer.js';
import * as madgeAnalyzer from './madge-analyzer.js';
import { getCurrentGitState, isCommitInHistory } from './git-analyzer.js';

/**
 * Main Dependency Analyzer
 * Orchestrates dependency graph generation and caching
 */

const CACHE_DIR = '.opencode/cache';
const CACHE_FILE = 'dependency-graph.json';
const CACHE_MAX_AGE_DAYS = 7;

/**
 * Detect project type and return appropriate analyzer
 */
export function detectProjectType(rootDir) {
  // TypeScript takes precedence
  if (tsAnalyzer.isTypeScriptProject(rootDir)) {
    return {
      type: 'typescript',
      precision: 'symbol-level',
      analyzer: tsAnalyzer
    };
  }
  
  // JavaScript with madge
  if (madgeAnalyzer.isJavaScriptProject(rootDir)) {
    return {
      type: 'javascript',
      precision: 'file-level',
      analyzer: madgeAnalyzer
    };
  }
  
  // Unknown - will use pattern-based fallback
  return {
    type: 'unknown',
    precision: 'pattern-based',
    analyzer: null
  };
}

/**
 * Load cached dependency graph if valid
 */
export function loadDependencyCache(rootDir) {
  const cachePath = join(rootDir, CACHE_DIR, CACHE_FILE);
  
  if (!existsSync(cachePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(content);
    
    // Validate cache structure
    if (!cache.generated || !cache.commit || !cache.graph) {
      console.warn('Invalid cache structure, will regenerate');
      return null;
    }
    
    return cache;
  } catch (error) {
    console.warn(`Failed to load cache: ${error.message}`);
    return null;
  }
}

/**
 * Save dependency graph to cache
 */
export function saveDependencyCache(graph, metadata, rootDir) {
  const cachePath = join(rootDir, CACHE_DIR, CACHE_FILE);
  const cacheDir = dirname(cachePath);
  
  // Ensure cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  
  const cache = {
    generated: new Date().toISOString(),
    commit: metadata.commit,
    shortCommit: metadata.shortCommit,
    branch: metadata.branch,
    projectType: metadata.projectType,
    precision: metadata.precision,
    graph
  };
  
  try {
    writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Failed to save cache: ${error.message}`);
    return false;
  }
}

/**
 * Check if cached dependency graph is still valid
 */
export function isCacheValid(cache, rootDir) {
  if (!cache) {
    return { valid: false, reason: 'No cache found' };
  }
  
  try {
    const currentGitState = getCurrentGitState(rootDir);
    
    // Check if commit is in current history
    if (!isCommitInHistory(cache.commit, rootDir)) {
      return { 
        valid: false, 
        reason: `Cache commit ${cache.shortCommit} not in current branch history` 
      };
    }
    
    // Check age
    const cacheDate = new Date(cache.generated);
    const daysSinceGenerated = (Date.now() - cacheDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceGenerated > CACHE_MAX_AGE_DAYS) {
      return { 
        valid: false, 
        reason: `Cache is ${Math.floor(daysSinceGenerated)} days old (max: ${CACHE_MAX_AGE_DAYS})` 
      };
    }
    
    // Check if major config files changed
    // This would require git diff check - for now, we'll skip this
    // and rely on age and commit history
    
    return { 
      valid: true, 
      cacheAge: daysSinceGenerated,
      commit: cache.shortCommit 
    };
  } catch (error) {
    return { 
      valid: false, 
      reason: `Cache validation error: ${error.message}` 
    };
  }
}

/**
 * Generate fresh dependency graph based on project type
 */
export async function generateDependencyGraph(rootDir, projectInfo = null) {
  if (!projectInfo) {
    projectInfo = detectProjectType(rootDir);
  }
  
  console.log(`\n📊 Generating ${projectInfo.type} dependency graph (${projectInfo.precision})...`);
  
  try {
    let graph;
    let warnings = [];
    
    if (projectInfo.type === 'typescript') {
      // Use TypeScript Compiler API
      graph = tsAnalyzer.buildDependencyGraph(rootDir);
      console.log(`   Analyzed ${Object.keys(graph).length} TypeScript/JavaScript files`);
    } else if (projectInfo.type === 'javascript') {
      // Use madge for JavaScript
      const result = await madgeAnalyzer.buildDependencyGraph(rootDir);
      graph = result.graph;
      warnings = result.warnings || [];
      console.log(`   Analyzed ${Object.keys(graph).length} JavaScript files`);
      
      if (warnings.length > 0) {
        warnings.forEach(w => console.warn(`   ⚠️  ${w}`));
      }
    } else {
      // Pattern-based fallback
      graph = {};
      console.log('   Using pattern-based analysis (no dependency graph)');
    }
    
    // Save to cache
    const gitState = getCurrentGitState(rootDir);
    const saved = saveDependencyCache(graph, {
      ...gitState,
      projectType: projectInfo.type,
      precision: projectInfo.precision
    }, rootDir);
    
    if (saved) {
      console.log(`   ✓ Cached dependency graph at ${gitState.branch}@${gitState.shortCommit}`);
    }
    
    return {
      graph,
      projectType: projectInfo.type,
      precision: projectInfo.precision,
      warnings
    };
  } catch (error) {
    console.error(`Failed to generate dependency graph: ${error.message}`);
    throw error;
  }
}

/**
 * Get or generate dependency graph with caching
 */
export async function getDependencyGraph(rootDir, forceRegenerate = false) {
  // Check for cached graph
  if (!forceRegenerate) {
    const cache = loadDependencyCache(rootDir);
    
    if (cache) {
      const validation = isCacheValid(cache, rootDir);
      
      if (validation.valid) {
        console.log(`\n📊 Using cached dependency graph from ${cache.branch}@${cache.shortCommit}`);
        console.log(`   Cache age: ${Math.floor(validation.cacheAge * 10) / 10} days`);
        console.log(`   Project type: ${cache.projectType} (${cache.precision})`);
        
        return {
          graph: cache.graph,
          projectType: cache.projectType,
          precision: cache.precision,
          fromCache: true
        };
      } else {
        console.log(`\n⚠️  Cache invalid: ${validation.reason}`);
        console.log('   Regenerating dependency graph...');
      }
    }
  }
  
  // Generate fresh graph
  const result = await generateDependencyGraph(rootDir);
  return {
    ...result,
    fromCache: false
  };
}

/**
 * Query graph to find files that import a given file
 */
export function getImporters(graph, filePath) {
  const entry = graph[filePath];
  
  if (!entry) {
    return [];
  }
  
  return (entry.importedBy || []).map(imp => imp.importer);
}

/**
 * Query graph to find what a file imports
 */
export function getImports(graph, filePath) {
  const entry = graph[filePath];
  
  if (!entry) {
    return [];
  }
  
  return Object.keys(entry.imports || {});
}

/**
 * Check if a file's exports changed by comparing with cached graph
 */
export function getExportChanges(graph, filePath, newExports) {
  const entry = graph[filePath];
  
  if (!entry) {
    // New file
    return {
      changed: true,
      reason: 'New file',
      details: { added: newExports, removed: [], modified: [] }
    };
  }
  
  const oldExports = entry.exports || [];
  
  // Simple comparison by name
  const oldNames = new Set(oldExports.map(e => e.name));
  const newNames = new Set(newExports.map(e => e.name));
  
  const added = newExports.filter(e => !oldNames.has(e.name));
  const removed = oldExports.filter(e => !newNames.has(e.name));
  
  if (added.length > 0 || removed.length > 0) {
    return {
      changed: true,
      reason: `Exports changed (${added.length} added, ${removed.length} removed)`,
      details: { added, removed, modified: [] }
    };
  }
  
  return {
    changed: false,
    reason: 'Exports unchanged',
    details: { added: [], removed: [], modified: [] }
  };
}

/**
 * Get statistics about dependency graph
 */
export function getGraphStatistics(graph) {
  const files = Object.keys(graph);
  
  if (files.length === 0) {
    return {
      totalFiles: 0,
      filesWithImports: 0,
      filesWithImporters: 0,
      avgImportsPerFile: 0,
      avgImportersPerFile: 0
    };
  }
  
  const filesWithImports = files.filter(f => 
    Object.keys(graph[f].imports || {}).length > 0
  ).length;
  
  const filesWithImporters = files.filter(f =>
    (graph[f].importedBy || []).length > 0
  ).length;
  
  const totalImports = files.reduce((sum, f) => 
    sum + Object.keys(graph[f].imports || {}).length, 0
  );
  
  const totalImporters = files.reduce((sum, f) =>
    sum + (graph[f].importedBy || []).length, 0
  );
  
  return {
    totalFiles: files.length,
    filesWithImports,
    filesWithImporters,
    avgImportsPerFile: (totalImports / files.length).toFixed(1),
    avgImportersPerFile: (totalImporters / files.length).toFixed(1)
  };
}
