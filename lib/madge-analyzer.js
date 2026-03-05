import madge from 'madge';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Madge-based Dependency Analyzer
 * File-level dependency tracking for JavaScript projects
 */

/**
 * Check if madge can be used
 */
export async function isMadgeAvailable() {
  try {
    // Madge is a dependency, so it should be available
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect if project is JavaScript-based
 */
export function isJavaScriptProject(rootDir) {
  // Check for package.json
  if (existsSync(join(rootDir, 'package.json'))) {
    return true;
  }
  
  return false;
}

/**
 * Generate dependency graph using madge
 * Returns file-level dependencies
 */
export async function buildDependencyGraph(rootDir, options = {}) {
  try {
    const config = {
      fileExtensions: ['js', 'jsx', 'mjs'],
      excludeRegExp: [
        /node_modules/,
        /dist/,
        /build/,
        /\.next/,
        /coverage/,
        /\.test\./,
        /\.spec\./
      ],
      ...options
    };
    
    // Create madge instance
    const res = await madge(rootDir, config);
    
    // Get dependency object
    const dependencies = res.obj();
    
    // Get circular dependencies (useful for warnings)
    const circular = res.circular();
    
    // Convert to our graph format
    const graph = convertToGraphFormat(dependencies, circular);
    
    return {
      graph,
      circular,
      warnings: circular.length > 0 ? [`Found ${circular.length} circular dependencies`] : []
    };
  } catch (error) {
    throw new Error(`Failed to generate madge dependency graph: ${error.message}`);
  }
}

/**
 * Convert madge format to our standard graph format
 */
function convertToGraphFormat(madgeObj, circular = []) {
  const graph = {};
  const fileToImporters = {};
  
  // First pass: create entries and track imports
  for (const [filePath, dependencies] of Object.entries(madgeObj)) {
    graph[filePath] = {
      imports: {},
      exports: [], // File-level analysis doesn't give us export info
      importedBy: [],
      isCircular: circular.some(cycle => cycle.includes(filePath))
    };
    
    // Track each dependency
    dependencies.forEach(depPath => {
      graph[filePath].imports[depPath] = {
        symbols: [], // Not available in file-level analysis
        isTypeOnly: false
      };
      
      // Build reverse mapping
      if (!fileToImporters[depPath]) {
        fileToImporters[depPath] = [];
      }
      fileToImporters[depPath].push({
        importer: filePath,
        symbols: [] // Not available
      });
    });
  }
  
  // Second pass: fill in importedBy relationships
  for (const [filePath, importers] of Object.entries(fileToImporters)) {
    if (graph[filePath]) {
      graph[filePath].importedBy = importers;
    } else {
      // File exists but wasn't in initial scan (might be external)
      graph[filePath] = {
        imports: {},
        exports: [],
        importedBy: importers,
        isExternal: true
      };
    }
  }
  
  return graph;
}

/**
 * Incremental update: add new files to existing graph
 */
export async function updateGraphWithNewFiles(existingGraph, newFiles, rootDir) {
  try {
    // For simplicity, regenerate the full graph
    // In a more sophisticated implementation, we could analyze just the new files
    return await buildDependencyGraph(rootDir);
  } catch (error) {
    console.warn('Failed to update graph incrementally, using existing graph');
    return { graph: existingGraph, warnings: ['Incremental update failed'] };
  }
}

/**
 * Get statistics about the dependency graph
 */
export function getGraphStats(graph) {
  const files = Object.keys(graph);
  const totalFiles = files.length;
  
  const filesWithDependencies = files.filter(f => 
    Object.keys(graph[f].imports || {}).length > 0
  ).length;
  
  const filesWithImporters = files.filter(f => 
    (graph[f].importedBy || []).length > 0
  ).length;
  
  const circularFiles = files.filter(f => graph[f].isCircular).length;
  
  // Calculate average dependencies
  const totalDeps = files.reduce((sum, f) => 
    sum + Object.keys(graph[f].imports || {}).length, 0
  );
  const avgDependencies = totalFiles > 0 ? (totalDeps / totalFiles).toFixed(1) : 0;
  
  return {
    totalFiles,
    filesWithDependencies,
    filesWithImporters,
    circularFiles,
    avgDependencies
  };
}
