import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, relative, sep } from 'path';
import * as tsAnalyzer from './typescript-analyzer.js';
import * as madgeAnalyzer from './madge-analyzer.js';
import { getCurrentGitState, isCommitInHistory } from './git-analyzer.js';

/**
 * Main Dependency Analyzer
 * Orchestrates dependency graph generation, caching, and importance scoring
 * 
 * Uses a single unified cache file: .opencode/analysis/codebase-analysis.json
 */

const ANALYSIS_DIR = '.opencode/analysis';
const ANALYSIS_FILE = 'codebase-analysis.json';
const CACHE_VERSION = 1;
const CACHE_MAX_AGE_DAYS = 7;

/**
 * Detect project type and return appropriate analyzer
 */
export function detectProjectType(rootDir) {
  if (tsAnalyzer.isTypeScriptProject(rootDir)) {
    return {
      type: 'typescript',
      precision: 'symbol-level',
      analyzer: tsAnalyzer
    };
  }
  
  if (madgeAnalyzer.isJavaScriptProject(rootDir)) {
    return {
      type: 'javascript',
      precision: 'file-level',
      analyzer: madgeAnalyzer
    };
  }
  
  return {
    type: 'unknown',
    precision: 'pattern-based',
    analyzer: null
  };
}

/**
 * Load cached analysis if valid
 */
export function loadAnalysisCache(rootDir) {
  const cachePath = join(rootDir, ANALYSIS_DIR, ANALYSIS_FILE);
  
  if (!existsSync(cachePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(content);
    
    // Check cache version
    if (cache.version !== CACHE_VERSION) {
      console.warn(`Cache version mismatch (${cache.version} vs ${CACHE_VERSION}), will regenerate`);
      return null;
    }
    
    // Validate cache structure
    if (!cache.generated || !cache.commit || !cache.graph) {
      console.warn('Invalid cache structure, will regenerate');
      return null;
    }
    
    return cache;
  } catch (error) {
    console.warn(`Failed to load analysis cache: ${error.message}`);
    return null;
  }
}

/**
 * Save unified analysis to cache
 */
export function saveAnalysisCache(data, rootDir) {
  const cachePath = join(rootDir, ANALYSIS_DIR, ANALYSIS_FILE);
  const cacheDir = dirname(cachePath);
  
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  
  const cache = {
    version: CACHE_VERSION,
    generated: new Date().toISOString(),
    ...data
  };
  
  try {
    writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Failed to save analysis cache: ${error.message}`);
    return false;
  }
}

/**
 * Check if cached analysis is still valid
 */
export function isCacheValid(cache, rootDir) {
  if (!cache) {
    return { valid: false, reason: 'No cache found' };
  }
  
  if (cache.version !== CACHE_VERSION) {
    return { valid: false, reason: `Cache version mismatch (v${cache.version} vs v${CACHE_VERSION})` };
  }
  
  try {
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
    
    return { 
      valid: true, 
      cacheAge: daysSinceGenerated,
      commit: cache.shortCommit 
    };
  } catch (error) {
    return { valid: false, reason: `Cache validation error: ${error.message}` };
  }
}

/**
 * Compute importance score for each file in the graph
 * Higher score = more important = AI should read this file
 */
export function computeImportanceScores(graph) {
  const scores = {};
  
  for (const [filePath, entry] of Object.entries(graph)) {
    let score = 0;
    
    // How many files import this? (strongest signal)
    const importerCount = (entry.importedBy || []).length;
    score += importerCount * 10;
    
    // Is it an entry point? (imports many things, nothing imports it)
    const importCount = Object.keys(entry.imports || {}).length;
    if (importerCount === 0 && importCount > 5) {
      score += 50;
    }
    
    // Does it have JSDoc? (less need to read if well-documented)
    if (entry.hasJSDoc) {
      score -= 20;
    }
    
    // File size (larger files likely have more complex logic)
    const lineCount = entry.lineCount || 0;
    if (lineCount > 150) {
      score += 15;
    } else if (lineCount > 50) {
      score += 5;
    }
    
    // Has 'any' types (likely undocumented / needs AI reading)
    if (entry.hasAnyTypes) {
      score += 25;
    }
    
    // Is it a type definition? (compiler extracts everything)
    if (filePath.endsWith('.d.ts') || filePath.includes('/types/')) {
      score -= 30;
    }
    
    // Is it a test file?
    if (filePath.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
      score -= 50;
    }
    
    // Is it a base class / extended by others?
    const isExtended = Object.values(graph).some(e => 
      e.exports?.some(exp => exp.extends && 
        (entry.exports || []).some(myExp => exp.extends.includes(myExp.name))
      )
    );
    if (isExtended) {
      score += 40;
    }
    
    // Config/middleware files (architectural patterns)
    if (filePath.includes('middleware/') || filePath.includes('config/')) {
      score += 10;
    }
    
    scores[filePath] = score;
  }
  
  return scores;
}

/**
 * Get files that the AI should read (importance > threshold)
 * Also includes 2 most-imported files per category for pattern detection
 */
export function getFilesToRead(graph, scores, options = {}) {
  const { readThreshold = 10, samplesPerCategory = 2 } = options;
  
  const mustRead = new Set();
  const reasons = {};
  
  // Add files above importance threshold
  for (const [filePath, score] of Object.entries(scores)) {
    if (score > readThreshold) {
      mustRead.add(filePath);
      reasons[filePath] = `Importance score: ${score}`;
    }
  }
  
  // Add files >50 lines without JSDoc
  for (const [filePath, entry] of Object.entries(graph)) {
    if ((entry.lineCount || 0) > 50 && !entry.hasJSDoc && !filePath.match(/\.(test|spec)\./)) {
      mustRead.add(filePath);
      reasons[filePath] = (reasons[filePath] || '') + '; >50 lines, no JSDoc';
    }
  }
  
  // Add 2 most-imported files per category for pattern detection
  const categories = {};
  for (const [filePath, entry] of Object.entries(graph)) {
    const category = guessCategoryFromPath(filePath);
    if (category !== 'test' && category !== 'unknown') {
      if (!categories[category]) categories[category] = [];
      categories[category].push({
        path: filePath,
        importerCount: (entry.importedBy || []).length
      });
    }
  }
  
  for (const [category, files] of Object.entries(categories)) {
    // Sort by importer count descending and take top N
    const topFiles = files
      .sort((a, b) => b.importerCount - a.importerCount)
      .slice(0, samplesPerCategory);
    
    for (const file of topFiles) {
      mustRead.add(file.path);
      reasons[file.path] = (reasons[file.path] || '') + `; Pattern sample for ${category}`;
    }
  }
  
  return { mustRead: Array.from(mustRead), reasons };
}

/**
 * Simple category guess from file path (for pattern sampling)
 */
function guessCategoryFromPath(filePath) {
  const path = filePath.toLowerCase();
  if (path.match(/\.(test|spec)\./)) return 'test';
  if (path.includes('component')) return 'component';
  if (path.includes('hook') || path.match(/use[A-Z]/)) return 'hook';
  if (path.includes('service')) return 'service';
  if (path.includes('api') || path.includes('route')) return 'api';
  if (path.includes('util') || path.includes('helper') || path.includes('lib/')) return 'utility';
  if (path.includes('type') || path.endsWith('.d.ts')) return 'type';
  if (path.includes('middleware')) return 'middleware';
  if (path.includes('store') || path.includes('state')) return 'state';
  return 'unknown';
}

/**
 * Generate fresh dependency graph and analysis
 */
export async function generateAnalysis(rootDir, projectInfo = null) {
  if (!projectInfo) {
    projectInfo = detectProjectType(rootDir);
  }
  
  console.log(`\n📊 Generating ${projectInfo.type} dependency graph (${projectInfo.precision})...`);
  
  try {
    let graph;
    let warnings = [];
    
    if (projectInfo.type === 'typescript') {
      graph = tsAnalyzer.buildDependencyGraph(rootDir);
      console.log(`   Analyzed ${Object.keys(graph).length} TypeScript/JavaScript files`);
    } else if (projectInfo.type === 'javascript') {
      const result = await madgeAnalyzer.buildDependencyGraph(rootDir);
      graph = result.graph;
      warnings = result.warnings || [];
      console.log(`   Analyzed ${Object.keys(graph).length} JavaScript files`);
    } else {
      graph = {};
      console.log('   Using pattern-based analysis (no dependency graph)');
    }
    
    // Compute importance scores
    const importanceScores = computeImportanceScores(graph);
    
    // Determine which files AI should read
    const { mustRead, reasons } = getFilesToRead(graph, importanceScores);
    
    // Get git state
    const gitState = getCurrentGitState(rootDir);
    
    // Build unified analysis object
    const analysis = {
      commit: gitState.commit,
      shortCommit: gitState.shortCommit,
      branch: gitState.branch,
      projectType: projectInfo.type,
      precision: projectInfo.precision,
      graph,
      importanceScores,
      filesToRead: mustRead,
      filesToReadReasons: reasons,
      summaries: {}, // Will be filled by codebase-summarizer or AI
      project: {},   // Will be filled by codebase-summarizer
      warnings
    };
    
    // Save to analysis directory
    const saved = saveAnalysisCache(analysis, rootDir);
    if (saved) {
      console.log(`   ✓ Saved analysis at ${gitState.branch}@${gitState.shortCommit}`);
    }
    
    return analysis;
  } catch (error) {
    console.error(`Failed to generate analysis: ${error.message}`);
    throw error;
  }
}

/**
 * Get or generate analysis with caching
 */
export async function getAnalysis(rootDir, forceRegenerate = false) {
  if (!forceRegenerate) {
    const cache = loadAnalysisCache(rootDir);
    
    if (cache) {
      const validation = isCacheValid(cache, rootDir);
      
      if (validation.valid) {
        console.log(`\n📊 Using cached analysis from ${cache.branch}@${cache.shortCommit}`);
        console.log(`   Cache age: ${Math.floor(validation.cacheAge * 10) / 10} days`);
        console.log(`   Project type: ${cache.projectType} (${cache.precision})`);
        
        return { ...cache, fromCache: true };
      } else {
        console.log(`\n⚠️  Cache invalid: ${validation.reason}`);
        console.log('   Regenerating analysis...');
      }
    }
  }
  
  const result = await generateAnalysis(rootDir);
  return { ...result, fromCache: false };
}

/**
 * Query graph to find files that import a given file
 */
export function getImporters(graph, filePath) {
  const entry = graph[filePath];
  if (!entry) return [];
  return (entry.importedBy || []).map(imp => imp.importer);
}

/**
 * Query graph to find what a file imports
 */
export function getImports(graph, filePath) {
  const entry = graph[filePath];
  if (!entry) return [];
  return Object.keys(entry.imports || {});
}

/**
 * Get statistics about the analysis
 */
export function getGraphStatistics(graph) {
  const files = Object.keys(graph);
  
  if (files.length === 0) {
    return { totalFiles: 0, filesWithImports: 0, filesWithImporters: 0, avgImportsPerFile: 0, avgImportersPerFile: 0 };
  }
  
  const filesWithImports = files.filter(f => Object.keys(graph[f].imports || {}).length > 0).length;
  const filesWithImporters = files.filter(f => (graph[f].importedBy || []).length > 0).length;
  const totalImports = files.reduce((sum, f) => sum + Object.keys(graph[f].imports || {}).length, 0);
  const totalImporters = files.reduce((sum, f) => sum + (graph[f].importedBy || []).length, 0);
  
  return {
    totalFiles: files.length,
    filesWithImports,
    filesWithImporters,
    avgImportsPerFile: (totalImports / files.length).toFixed(1),
    avgImportersPerFile: (totalImporters / files.length).toFixed(1)
  };
}
