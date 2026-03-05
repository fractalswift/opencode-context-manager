import ts from 'typescript';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { glob } from 'glob';

/**
 * TypeScript Symbol-Level Dependency Analyzer
 * Uses TypeScript Compiler API for precise dependency tracking
 */

/**
 * Find tsconfig.json in project
 */
export function findTsConfig(rootDir) {
  const possiblePaths = [
    join(rootDir, 'tsconfig.json'),
    join(rootDir, 'jsconfig.json'),
  ];
  
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  
  return null;
}

/**
 * Create TypeScript program for analysis
 */
export function createTypeScriptProgram(rootDir, configPath = null) {
  try {
    if (!configPath) {
      configPath = findTsConfig(rootDir);
    }
    
    let compilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
    };
    
    let fileNames = [];
    
    if (configPath && existsSync(configPath)) {
      // Parse tsconfig.json
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        dirname(configPath)
      );
      
      compilerOptions = parsedConfig.options;
      fileNames = parsedConfig.fileNames;
    } else {
      // No tsconfig - find all TS/TSX/JS/JSX files
      const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
      const exclude = ['**/node_modules/**', '**/dist/**', '**/build/**'];
      
      fileNames = patterns.flatMap(pattern => 
        glob.sync(pattern, { 
          cwd: rootDir, 
          ignore: exclude,
          absolute: true 
        })
      );
    }
    
    // Create program
    const program = ts.createProgram(fileNames, compilerOptions);
    
    return { program, compilerOptions, rootDir };
  } catch (error) {
    throw new Error(`Failed to create TypeScript program: ${error.message}`);
  }
}

/**
 * Analyze a single TypeScript/JavaScript file for imports and exports
 */
export function analyzeFile(filePath, program) {
  try {
    const sourceFile = program.getSourceFile(filePath);
    
    if (!sourceFile) {
      return null;
    }
    
    const imports = {};
    const exports = [];
    const typeChecker = program.getTypeChecker();
    
    // Visit all nodes in the file
    function visit(node) {
      // Handle import declarations
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        
        if (ts.isStringLiteral(moduleSpecifier)) {
          const modulePath = moduleSpecifier.text;
          const importedSymbols = [];
          let isTypeOnly = node.importClause?.isTypeOnly || false;
          
          // Named imports: import { foo, bar } from 'module'
          if (node.importClause?.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              node.importClause.namedBindings.elements.forEach(element => {
                importedSymbols.push({
                  name: element.name.text,
                  isTypeOnly: isTypeOnly || element.isTypeOnly
                });
              });
            }
            // Namespace import: import * as foo from 'module'
            else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              importedSymbols.push({
                name: '*',
                alias: node.importClause.namedBindings.name.text,
                isTypeOnly
              });
            }
          }
          
          // Default import: import foo from 'module'
          if (node.importClause?.name) {
            importedSymbols.push({
              name: 'default',
              alias: node.importClause.name.text,
              isTypeOnly
            });
          }
          
          imports[modulePath] = {
            symbols: importedSymbols,
            isTypeOnly
          };
        }
      }
      
      // Handle export declarations
      if (ts.isExportDeclaration(node)) {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          node.exportClause.elements.forEach(element => {
            exports.push({
              name: element.name.text,
              type: 'named',
              isTypeOnly: node.isTypeOnly
            });
          });
        }
      }
      
      // Handle export assignments (functions, classes, etc.)
      if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isFunctionDeclaration(node) && node.name) {
          exports.push({
            name: node.name.text,
            type: 'function',
            signature: node.getText().split('\n')[0] // First line of function
          });
        } else if (ts.isClassDeclaration(node) && node.name) {
          exports.push({
            name: node.name.text,
            type: 'class'
          });
        } else if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach(decl => {
            if (ts.isIdentifier(decl.name)) {
              exports.push({
                name: decl.name.text,
                type: 'variable'
              });
            }
          });
        } else if (ts.isInterfaceDeclaration(node) && node.name) {
          exports.push({
            name: node.name.text,
            type: 'interface',
            isTypeOnly: true
          });
        } else if (ts.isTypeAliasDeclaration(node) && node.name) {
          exports.push({
            name: node.name.text,
            type: 'type',
            isTypeOnly: true
          });
        }
      }
      
      ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    
    return {
      filePath,
      imports,
      exports,
      sourceFile
    };
  } catch (error) {
    console.warn(`Warning: Could not analyze ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Resolve module path to actual file path
 * Handles relative imports and node_modules
 */
export function resolveModulePath(importPath, fromFile, rootDir, compilerOptions) {
  try {
    // Relative import (./foo or ../bar)
    if (importPath.startsWith('.')) {
      const dir = dirname(fromFile);
      const resolved = resolve(dir, importPath);
      
      // Try various extensions
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.d.ts', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
      
      for (const ext of extensions) {
        const fullPath = resolved + ext;
        if (existsSync(fullPath)) {
          return fullPath;
        }
      }
      
      // Try without extension (might already have it)
      if (existsSync(resolved)) {
        return resolved;
      }
    }
    
    // Absolute/alias imports or node_modules - skip for now
    // (Would need path mapping configuration from tsconfig)
    return null;
  } catch {
    return null;
  }
}

/**
 * Build complete dependency graph for TypeScript project
 * Returns symbol-level dependency information
 */
export function buildDependencyGraph(rootDir, configPath = null) {
  try {
    const { program, compilerOptions } = createTypeScriptProgram(rootDir, configPath);
    const graph = {};
    const fileToImporters = {}; // Reverse mapping
    
    // Analyze all source files
    const sourceFiles = program.getSourceFiles()
      .filter(sf => !sf.isDeclarationFile && !sf.fileName.includes('node_modules'));
    
    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.fileName;
      const analysis = analyzeFile(filePath, program);
      
      if (!analysis) continue;
      
      graph[filePath] = {
        imports: analysis.imports,
        exports: analysis.exports,
        importedBy: [] // Will be filled in reverse pass
      };
      
      // Build reverse mapping
      for (const [importPath, importInfo] of Object.entries(analysis.imports)) {
        const resolvedPath = resolveModulePath(importPath, filePath, rootDir, compilerOptions);
        
        if (resolvedPath) {
          if (!fileToImporters[resolvedPath]) {
            fileToImporters[resolvedPath] = [];
          }
          fileToImporters[resolvedPath].push({
            importer: filePath,
            symbols: importInfo.symbols.map(s => s.name || s.alias)
          });
        }
      }
    }
    
    // Fill in importedBy relationships
    for (const [filePath, importers] of Object.entries(fileToImporters)) {
      if (graph[filePath]) {
        graph[filePath].importedBy = importers;
      }
    }
    
    return graph;
  } catch (error) {
    throw new Error(`Failed to build TypeScript dependency graph: ${error.message}`);
  }
}

/**
 * Compare exports between old and new versions to detect changes
 */
export function compareExports(oldExports, newExports) {
  const oldNames = new Set(oldExports.map(e => e.name));
  const newNames = new Set(newExports.map(e => e.name));
  
  const added = newExports.filter(e => !oldNames.has(e.name));
  const removed = oldExports.filter(e => !newNames.has(e.name));
  
  // Check for signature changes (simplified)
  const changed = newExports.filter(newExp => {
    const oldExp = oldExports.find(e => e.name === newExp.name);
    if (!oldExp) return false;
    
    // Compare signatures if available
    if (newExp.signature && oldExp.signature) {
      return newExp.signature !== oldExp.signature;
    }
    
    // Compare types
    return newExp.type !== oldExp.type;
  });
  
  return {
    added,
    removed,
    changed,
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0
  };
}

/**
 * Check if TypeScript is available for this project
 */
export function isTypeScriptProject(rootDir) {
  // Check for tsconfig or TypeScript files
  if (findTsConfig(rootDir)) {
    return true;
  }
  
  // Check for .ts or .tsx files
  try {
    const tsFiles = glob.sync('**/*.{ts,tsx}', {
      cwd: rootDir,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      nodir: true
    });
    
    return tsFiles.length > 0;
  } catch {
    return false;
  }
}
