import { 
  getChangedFiles, 
  parseContextMetadata, 
  categorizeFile, 
  checkExportChanges,
  getAllTrackedFiles 
} from './git-analyzer.js';
import { 
  getDependencyGraph, 
  getImporters, 
  isCacheValid, 
  loadDependencyCache 
} from './dependency-analyzer.js';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Scan Strategy Decision Engine
 * Decides between full scan and incremental scan
 */

const FULL_SCAN_CHANGE_THRESHOLD = 0.3; // 30% of files changed

/**
 * Check if full scan should be triggered based on various conditions
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
  
  // User explicitly requested full scan
  if (userForced) {
    return {
      trigger: true,
      reason: 'User requested full scan with --full flag'
    };
  }
  
  // No existing context - first run
  const contextDir = join(rootDir, '.opencode', 'context');
  if (!existsSync(contextDir)) {
    return {
      trigger: true,
      reason: 'No existing context found (first run)'
    };
  }
  
  // No old commit reference - can't do incremental
  if (!oldCommit) {
    return {
      trigger: true,
      reason: 'No previous commit reference found'
    };
  }
  
  // No dependency cache or invalid cache
  if (!cache) {
    return {
      trigger: true,
      reason: 'No dependency cache available'
    };
  }
  
  const cacheValidation = isCacheValid(cache, rootDir);
  if (!cacheValidation.valid) {
    return {
      trigger: true,
      reason: `Dependency cache invalid: ${cacheValidation.reason}`
    };
  }
  
  // Check if critical files changed
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
  
  // Check if too many files changed (potential refactor)
  if (totalFiles > 0 && changedFiles.length > 0) {
    const changeRatio = changedFiles.length / totalFiles;
    
    if (changeRatio > FULL_SCAN_CHANGE_THRESHOLD) {
      return {
        trigger: true,
        reason: `Large change detected (${Math.round(changeRatio * 100)}% of files changed)`
      };
    }
  }
  
  // Check for new directories (structure change)
  const newDirs = changedFiles.filter(f => 
    f.status === 'A' && f.path.includes('/')
  ).map(f => f.path.split('/')[0]);
  
  const uniqueNewTopDirs = new Set(newDirs);
  if (uniqueNewTopDirs.size > 2) {
    return {
      trigger: true,
      reason: `Multiple new top-level directories detected (${uniqueNewTopDirs.size})`
    };
  }
  
  // Safe for incremental
  return {
    trigger: false,
    reason: 'Safe for incremental update'
  };
}

/**
 * Determine affected files using dependency graph
 */
export async function getAffectedFiles(changedFiles, graph, rootDir, oldCommit) {
  const affectedSet = new Set();
  const reasons = {};
  
  for (const change of changedFiles) {
    const { path, status } = change;
    
    // Always include the changed file itself (unless deleted)
    if (status !== 'D') {
      affectedSet.add(path);
      reasons[path] = 'File was modified';
    } else {
      reasons[path] = 'File was deleted (will be removed from context)';
    }
    
    // Check if exports changed
    if (status === 'M') {
      const exportCheck = checkExportChanges(path, oldCommit, 'HEAD', rootDir);
      
      if (exportCheck.changed) {
        // Exports changed - need to update all importers
        const importers = getImporters(graph, path);
        
        if (importers.length > 0) {
          importers.forEach(imp => {
            affectedSet.add(imp);
            reasons[imp] = `Imports ${path} (exports changed)`;
          });
          
          reasons[path] += ` (exports changed, affecting ${importers.length} importers)`;
        }
      } else {
        reasons[path] += ' (exports unchanged, importers not affected)';
      }
    }
    
    // For new files, add them but don't cascade
    if (status === 'A') {
      reasons[path] = 'New file added';
    }
    
    // For renamed files, treat as delete + add
    if (status.startsWith('R')) {
      const oldPath = path;
      const newPath = change.newPath;
      
      affectedSet.add(newPath);
      reasons[newPath] = `Renamed from ${oldPath}`;
    }
  }
  
  return {
    affectedFiles: Array.from(affectedSet),
    reasons
  };
}

/**
 * Group affected files by category for organized scanning
 */
export function groupByCategory(files) {
  const categories = {};
  
  for (const filePath of files) {
    const category = categorizeFile(filePath);
    
    if (!categories[category]) {
      categories[category] = [];
    }
    
    categories[category].push(filePath);
  }
  
  // Sort categories by priority
  const priorityOrder = [
    'dependencies',
    'config',
    'type',
    'component',
    'hook',
    'service',
    'api',
    'utility',
    'test',
    'documentation',
    'unknown'
  ];
  
  const sorted = {};
  for (const cat of priorityOrder) {
    if (categories[cat]) {
      sorted[cat] = categories[cat];
    }
  }
  
  return sorted;
}

/**
 * Main decision function - determines scan strategy
 */
export async function decideScanStrategy(options = {}) {
  const {
    rootDir = '.',
    forceFullScan = false,
    rebuildGraph = false
  } = options;
  
  try {
    console.log('\n🔍 Analyzing repository changes...\n');
    
    // Load dependency cache
    const cache = loadDependencyCache(rootDir);
    
    // Parse existing context metadata
    const contextFile = join(rootDir, '.opencode', 'context', 'repo-structure.md');
    const contextMetadata = parseContextMetadata(contextFile);
    
    let oldCommit = null;
    if (contextMetadata) {
      oldCommit = contextMetadata.commit;
      console.log(`Previous context: ${contextMetadata.branch}@${oldCommit}`);
    } else {
      console.log('No previous context found');
    }
    
    // Get changed files if we have old commit
    let changedFiles = [];
    if (oldCommit) {
      changedFiles = getChangedFiles(oldCommit, 'HEAD', rootDir);
      console.log(`Changed files: ${changedFiles.length}`);
      
      if (changedFiles.length > 0 && changedFiles.length <= 10) {
        changedFiles.forEach(f => {
          const statusSymbol = f.status === 'A' ? '+' : 
                             f.status === 'D' ? '-' : 
                             f.status === 'M' ? '~' : '↔';
          console.log(`  ${statusSymbol} ${f.path}`);
        });
      } else if (changedFiles.length > 10) {
        console.log(`  (showing first 10)`);
        changedFiles.slice(0, 10).forEach(f => {
          const statusSymbol = f.status === 'A' ? '+' : 
                             f.status === 'D' ? '-' : 
                             f.status === 'M' ? '~' : '↔';
          console.log(`  ${statusSymbol} ${f.path}`);
        });
      }
    }
    
    // Get total file count for percentage calculation
    const allFiles = getAllTrackedFiles(rootDir);
    const totalFiles = allFiles.length;
    
    // Check for full scan triggers
    const fullScanCheck = shouldTriggerFullScan({
      changedFiles,
      oldCommit,
      cache,
      rootDir,
      totalFiles,
      userForced: forceFullScan
    });
    
    console.log('');
    
    if (fullScanCheck.trigger) {
      console.log(`🔄 Mode: FULL SCAN`);
      console.log(`   Reason: ${fullScanCheck.reason}`);
      
      return {
        mode: 'full',
        reason: fullScanCheck.reason,
        changedFiles,
        affectedFiles: [],
        categories: {},
        requiresGraphRebuild: true
      };
    }
    
    // Incremental mode - get or load dependency graph
    console.log(`⚡ Mode: INCREMENTAL`);
    console.log(`   ${changedFiles.length} files changed, analyzing dependencies...\n`);
    
    const { graph, fromCache } = await getDependencyGraph(rootDir, rebuildGraph);
    
    // Determine affected files
    const { affectedFiles, reasons } = await getAffectedFiles(
      changedFiles,
      graph,
      rootDir,
      oldCommit
    );
    
    console.log(`📊 Dependency analysis:`);
    console.log(`   Directly changed: ${changedFiles.length} files`);
    console.log(`   Total affected: ${affectedFiles.length} files`);
    
    // Show reasons for key files
    const filesToShow = affectedFiles.slice(0, 5);
    if (filesToShow.length > 0) {
      console.log(`\n   Analysis details:`);
      filesToShow.forEach(f => {
        console.log(`   • ${f}`);
        console.log(`     ${reasons[f]}`);
      });
      
      if (affectedFiles.length > 5) {
        console.log(`   ... and ${affectedFiles.length - 5} more`);
      }
    }
    
    // Group by category
    const categories = groupByCategory(affectedFiles);
    
    console.log(`\n   Categories affected:`);
    for (const [category, files] of Object.entries(categories)) {
      if (category !== 'test' && category !== 'documentation') {
        console.log(`   • ${category}: ${files.length} files`);
      }
    }
    
    return {
      mode: 'incremental',
      reason: 'Changes are localized and safe for incremental update',
      changedFiles,
      affectedFiles,
      categories,
      reasons,
      graph,
      requiresGraphRebuild: false
    };
  } catch (error) {
    console.error(`\n❌ Error analyzing scan strategy: ${error.message}`);
    console.log('   Falling back to full scan for safety\n');
    
    return {
      mode: 'full',
      reason: `Error in incremental analysis: ${error.message}`,
      changedFiles: [],
      affectedFiles: [],
      categories: {},
      requiresGraphRebuild: true,
      error: error.message
    };
  }
}

/**
 * Estimate token cost for a scan strategy
 */
export function estimateTokenCost(strategy) {
  const { mode, affectedFiles = [], requiresGraphRebuild } = strategy;
  
  if (mode === 'full') {
    // Full scan estimates
    const baseFullScanCost = 150000; // Conservative estimate
    const graphRebuildCost = 30000;
    
    return {
      estimated: baseFullScanCost + (requiresGraphRebuild ? graphRebuildCost : 0),
      breakdown: {
        scanning: baseFullScanCost,
        graphGeneration: requiresGraphRebuild ? graphRebuildCost : 0
      }
    };
  }
  
  // Incremental scan estimates
  const tokensPerFile = 2000; // Rough estimate
  const scanCost = affectedFiles.length * tokensPerFile;
  const graphUpdateCost = 1000; // Minimal for incremental updates
  const overheadCost = 2000; // Decision logic, git operations
  
  return {
    estimated: scanCost + graphUpdateCost + overheadCost,
    breakdown: {
      scanning: scanCost,
      graphUpdate: graphUpdateCost,
      overhead: overheadCost
    },
    savings: {
      vsFullScan: 150000 - (scanCost + graphUpdateCost + overheadCost),
      percentage: Math.round((1 - (scanCost + graphUpdateCost + overheadCost) / 150000) * 100)
    }
  };
}
