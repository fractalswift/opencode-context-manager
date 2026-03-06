import { 
  getAllChanges,
  parseContextMetadata, 
  categorizeFile, 
  checkExportChanges,
  getAllTrackedFiles,
  getCurrentGitState,
  countCommitsBetween
} from './git-analyzer.js';
import { 
  getAnalysis, 
  generateAnalysis,
  getImporters, 
  isCacheValid, 
  loadAnalysisCache,
  computeImportanceScores,
  getFilesToRead,
  getGraphStatistics
} from './dependency-analyzer.js';
import { 
  generatePreAnalysis 
} from './codebase-summarizer.js';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Scan Strategy Decision Engine
 * 
 * Always runs static analysis first (dependency graph + summarizer),
 * then decides between full and incremental scan.
 * Outputs a human-readable action plan the AI agent can follow.
 */

const FULL_SCAN_CHANGE_THRESHOLD = 0.3; // 30% of files

/**
 * Check if full scan should be triggered
 */
export function shouldTriggerFullScan(options = {}) {
  const {
    changedFiles = [],
    oldCommit = null,
    cache = null,
    rootDir = '.',
    totalFiles = 0,
    userForced = false
  } = options;
  
  if (userForced) {
    return { trigger: true, reason: 'User requested full scan with --full flag' };
  }
  
  const contextDir = join(rootDir, '.opencode', 'context');
  if (!existsSync(contextDir)) {
    return { trigger: true, reason: 'No existing context found (first run)' };
  }
  
  if (!oldCommit) {
    return { trigger: true, reason: 'No previous commit reference found in context files' };
  }
  
  if (!cache) {
    return { trigger: true, reason: 'No analysis cache available' };
  }
  
  const cacheValidation = isCacheValid(cache, rootDir);
  if (!cacheValidation.valid) {
    return { trigger: true, reason: `Analysis cache invalid: ${cacheValidation.reason}` };
  }
  
  // Critical files changed
  const criticalFiles = changedFiles.filter(f => {
    const category = categorizeFile(f.path);
    return category === 'dependencies' || category === 'config';
  });
  
  if (criticalFiles.length > 0) {
    return {
      trigger: true,
      reason: `Critical files changed: ${criticalFiles.map(f => f.path).join(', ')}`
    };
  }
  
  // Too many files changed
  if (totalFiles > 0 && changedFiles.length > 0) {
    const changeRatio = changedFiles.length / totalFiles;
    if (changeRatio > FULL_SCAN_CHANGE_THRESHOLD) {
      return {
        trigger: true,
        reason: `Large change detected (${Math.round(changeRatio * 100)}% of files changed, threshold: ${FULL_SCAN_CHANGE_THRESHOLD * 100}%)`
      };
    }
  }
  
  // Multiple new top-level directories
  const newDirs = changedFiles
    .filter(f => f.status === 'A' && f.path.includes('/'))
    .map(f => f.path.split('/')[0]);
  const uniqueNewTopDirs = new Set(newDirs);
  if (uniqueNewTopDirs.size > 2) {
    return {
      trigger: true,
      reason: `Multiple new top-level directories detected (${[...uniqueNewTopDirs].join(', ')})`
    };
  }
  
  return { trigger: false, reason: 'Safe for incremental update' };
}

/**
 * Determine affected files using dependency graph for incremental mode
 */
export function getAffectedFiles(changedFiles, graph, rootDir, oldCommit) {
  const affectedSet = new Set();
  const reasons = {};
  
  for (const change of changedFiles) {
    const { path, status } = change;
    
    if (status !== 'D') {
      affectedSet.add(path);
      reasons[path] = 'Directly modified';
    } else {
      reasons[path] = 'Deleted (will be removed from context)';
    }
    
    // Check if exports changed
    if (status === 'M' && oldCommit) {
      const exportCheck = checkExportChanges(path, oldCommit, 'HEAD', rootDir);
      
      if (exportCheck.changed) {
        const importers = getImporters(graph, path);
        if (importers.length > 0) {
          importers.forEach(imp => {
            affectedSet.add(imp);
            reasons[imp] = `Imports ${path} (exports changed)`;
          });
          reasons[path] += ` → exports changed, ${importers.length} importers affected`;
        }
      } else {
        reasons[path] += ' (exports unchanged, importers safe)';
      }
    }
    
    if (status === 'A') {
      reasons[path] = 'New file added';
    }
    
    if (status === 'R' && change.newPath) {
      affectedSet.add(change.newPath);
      reasons[change.newPath] = `Renamed from ${path}`;
    }
  }
  
  return { affectedFiles: Array.from(affectedSet), reasons };
}

/**
 * Group affected files by category
 */
export function groupByCategory(files) {
  const categories = {};
  
  for (const filePath of files) {
    const category = categorizeFile(filePath);
    if (!categories[category]) categories[category] = [];
    categories[category].push(filePath);
  }
  
  return categories;
}

/**
 * Format a human-readable action plan for the AI agent
 */
function formatActionPlan(strategy) {
  const lines = [];
  
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  CONTEXT UPDATE ACTION PLAN');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  
  if (strategy.mode === 'full') {
    lines.push(`MODE: FULL SCAN`);
    lines.push(`REASON: ${strategy.reason}`);
    lines.push('');
    lines.push('ACTIONS:');
    lines.push('  1. Read the pre-analysis summary below (dependency graph + auto-summaries)');
    lines.push('  2. Read ALL files listed in "Files to Read" section');
    lines.push('  3. Read 2-3 sample files per category for pattern detection');
    lines.push('  4. Generate complete context files from summaries + file readings');
    lines.push('  5. Write AI-generated summaries for files you read');
    lines.push('  6. Save context with git metadata');
  } else {
    lines.push(`MODE: INCREMENTAL UPDATE`);
    lines.push(`REASON: ${strategy.reason}`);
    lines.push('');
    lines.push(`CHANGED FILES: ${strategy.changedFiles.length}`);
    
    for (const change of strategy.changedFiles.slice(0, 15)) {
      const symbol = change.status === 'A' ? '+' : change.status === 'D' ? '-' : change.status === 'R' ? '→' : '~';
      lines.push(`  ${symbol} ${change.path}`);
    }
    if (strategy.changedFiles.length > 15) {
      lines.push(`  ... and ${strategy.changedFiles.length - 15} more`);
    }
    
    lines.push('');
    lines.push(`AFFECTED FILES: ${strategy.affectedFiles.length}`);
    
    for (const file of strategy.affectedFiles.slice(0, 10)) {
      const reason = strategy.reasons[file] || '';
      lines.push(`  • ${file}`);
      lines.push(`    ${reason}`);
    }
    if (strategy.affectedFiles.length > 10) {
      lines.push(`  ... and ${strategy.affectedFiles.length - 10} more`);
    }
    
    lines.push('');
    lines.push('ACTIONS:');
    lines.push('  1. Read ONLY the affected files listed above');
    lines.push('  2. Update their summaries in the analysis cache');
    lines.push('  3. Update ONLY the affected sections in context files');
    lines.push('  4. Preserve all unchanged content');
    lines.push('  5. Save context with new git metadata');
  }
  
  // Pre-analysis summary
  if (strategy.preAnalysis) {
    const pa = strategy.preAnalysis;
    
    lines.push('');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('  PRE-ANALYSIS SUMMARY (generated with 0 AI tokens)');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('');
    
    lines.push(`Total files analyzed: ${pa.stats.totalFiles}`);
    lines.push(`Auto-summarized: ${pa.stats.autoSummarized} (${pa.stats.autoSummarizedPercent}%)`);
    lines.push(`Need AI reading: ${pa.stats.needsAIReading}`);
    
    if (pa.mostImported.length > 0) {
      lines.push('');
      lines.push('Most-imported files (architecture backbone):');
      for (const file of pa.mostImported.slice(0, 5)) {
        lines.push(`  • ${file.path} (imported by ${file.importerCount} files)`);
      }
    }
    
    if (pa.categoryStats && Object.keys(pa.categoryStats).length > 0) {
      lines.push('');
      lines.push('File categories:');
      for (const [cat, count] of Object.entries(pa.categoryStats).sort((a, b) => b[1] - a[1])) {
        if (cat !== 'unknown') {
          lines.push(`  • ${cat}: ${count} files`);
        }
      }
    }
    
    if (pa.project && Object.keys(pa.project).length > 0) {
      lines.push('');
      lines.push('Project capabilities detected:');
      for (const [key, value] of Object.entries(pa.project)) {
        if (typeof value === 'string') {
          lines.push(`  • ${key}: ${value}`);
        } else if (Array.isArray(value)) {
          lines.push(`  • ${key}: ${value.join(', ')}`);
        } else if (typeof value === 'object') {
          const desc = Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
          lines.push(`  • ${key}: ${desc}`);
        }
      }
    }
    
    if (strategy.filesToRead && strategy.filesToRead.length > 0) {
      lines.push('');
      lines.push(`Files for AI to read (${strategy.filesToRead.length}):`);
      for (const file of strategy.filesToRead.slice(0, 20)) {
        const reason = strategy.filesToReadReasons?.[file] || '';
        lines.push(`  📄 ${file}`);
        if (reason) lines.push(`     ${reason}`);
      }
      if (strategy.filesToRead.length > 20) {
        lines.push(`  ... and ${strategy.filesToRead.length - 20} more`);
      }
    }
  }
  
  // Token estimates
  lines.push('');
  lines.push('───────────────────────────────────────────────────────────');
  if (strategy.tokenEstimate) {
    lines.push(`ESTIMATED TOKEN USAGE: ~${Math.round(strategy.tokenEstimate.estimated / 1000)}K tokens`);
    if (strategy.tokenEstimate.savings) {
      lines.push(`SAVINGS vs full read: ~${strategy.tokenEstimate.savings.percentage}%`);
    }
  }
  lines.push('═══════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

/**
 * Main decision function - determines scan strategy and outputs action plan
 * ALWAYS runs static analysis first (dependency graph + summarizer)
 */
export async function decideScanStrategy(options = {}) {
  const {
    rootDir = '.',
    forceFullScan = false,
    rebuildGraph = false
  } = options;
  
  try {
    console.log('\n🔍 Analyzing repository...\n');
    
    // ── Step 1: Always run static analysis first ──
    const analysis = await getAnalysis(rootDir, rebuildGraph);
    const { graph, importanceScores, fromCache } = analysis;
    
    // Run pre-analysis (capabilities, auto-summaries)
    const preAnalysis = generatePreAnalysis(rootDir, graph, importanceScores || {});
    
    // Get files the AI should read
    const scores = importanceScores || computeImportanceScores(graph);
    const { mustRead, reasons: readReasons } = getFilesToRead(graph, scores);
    
    // ── Step 2: Parse existing context ──
    const contextFile = join(rootDir, '.opencode', 'context', 'repo-structure.md');
    const contextMetadata = parseContextMetadata(contextFile);
    
    let oldCommit = null;
    if (contextMetadata) {
      oldCommit = contextMetadata.commit;
      console.log(`Previous context: ${contextMetadata.branch}@${oldCommit}`);
    } else {
      console.log('No previous context found');
    }
    
    // ── Step 3: Get ALL changes (committed + uncommitted) ──
    const changedFiles = getAllChanges(oldCommit, rootDir);
    console.log(`Total changes detected: ${changedFiles.length} (committed + uncommitted)`);
    
    // ── Step 4: Check full scan triggers ──
    const cache = loadAnalysisCache(rootDir);
    const allFiles = getAllTrackedFiles(rootDir);
    
    const fullScanCheck = shouldTriggerFullScan({
      changedFiles,
      oldCommit,
      cache,
      rootDir,
      totalFiles: allFiles.length,
      userForced: forceFullScan
    });
    
    let strategy;
    
    if (fullScanCheck.trigger) {
      // ── Full Scan Strategy ──
      strategy = {
        mode: 'full',
        reason: fullScanCheck.reason,
        changedFiles,
        affectedFiles: [],
        categories: {},
        filesToRead: mustRead,
        filesToReadReasons: readReasons,
        preAnalysis,
        graph,
        requiresGraphRebuild: !fromCache,
        tokenEstimate: estimateTokenCost('full', mustRead.length, preAnalysis.stats.needsAIReading)
      };
    } else {
      // ── Incremental Strategy ──
      const { affectedFiles, reasons } = getAffectedFiles(changedFiles, graph, rootDir, oldCommit);
      const categories = groupByCategory(affectedFiles);
      
      strategy = {
        mode: 'incremental',
        reason: 'Changes are localized and safe for incremental update',
        changedFiles,
        affectedFiles,
        categories,
        reasons,
        filesToRead: affectedFiles, // In incremental mode, only read affected files
        filesToReadReasons: reasons,
        preAnalysis,
        graph,
        requiresGraphRebuild: false,
        tokenEstimate: estimateTokenCost('incremental', affectedFiles.length, 0)
      };
    }
    
    // ── Step 5: Generate and display action plan ──
    strategy.actionPlan = formatActionPlan(strategy);
    console.log('\n' + strategy.actionPlan);
    
    return strategy;
  } catch (error) {
    console.error(`\n❌ Error in scan strategy: ${error.message}`);
    console.log('   Falling back to full scan for safety\n');
    
    return {
      mode: 'full',
      reason: `Error in analysis: ${error.message}`,
      changedFiles: [],
      affectedFiles: [],
      categories: {},
      filesToRead: [],
      preAnalysis: null,
      requiresGraphRebuild: true,
      error: error.message,
      actionPlan: `MODE: FULL SCAN\nREASON: Error in analysis - ${error.message}\nACTIONS: Perform standard full repository scan`
    };
  }
}

/**
 * Estimate token cost for a scan strategy
 */
export function estimateTokenCost(mode, filesToReadCount, needsAISummaryCount) {
  const tokensPerFileRead = 2500; // Average tokens to read a file
  const tokensPerSummary = 200;   // Tokens to generate a summary
  const contextGenerationTokens = 10000; // Generating context markdown
  const overheadTokens = 5000;    // Reading pre-analysis, decision making
  
  if (mode === 'full') {
    const readCost = filesToReadCount * tokensPerFileRead;
    const summaryCost = needsAISummaryCount * tokensPerSummary;
    const estimated = readCost + summaryCost + contextGenerationTokens + overheadTokens;
    
    // Rough estimate of what a full read-everything scan would cost
    const fullReadEverythingCost = 300000; // ~300K tokens reading all files
    
    return {
      estimated,
      breakdown: { reading: readCost, summaries: summaryCost, contextGeneration: contextGenerationTokens, overhead: overheadTokens },
      savings: {
        vsFullRead: fullReadEverythingCost - estimated,
        percentage: Math.round((1 - estimated / fullReadEverythingCost) * 100)
      }
    };
  }
  
  // Incremental
  const readCost = filesToReadCount * tokensPerFileRead;
  const updateCost = 3000; // Updating context sections
  const estimated = readCost + updateCost + overheadTokens;
  
  return {
    estimated,
    breakdown: { reading: readCost, contextUpdate: updateCost, overhead: overheadTokens },
    savings: {
      vsFullRead: 300000 - estimated,
      percentage: Math.round((1 - estimated / 300000) * 100)
    }
  };
}
