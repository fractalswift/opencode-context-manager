import ts from 'typescript';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve, relative, sep } from 'path';

/**
 * TypeScript Symbol-Level Dependency Analyzer
 * Uses TypeScript Compiler API for precise dependency tracking
 * Includes JSDoc extraction, line counts, and props detection
 */

/**
 * Recursively find files matching extensions (replaces glob dependency)
 * Uses Node 18+ recursive readdir
 */
function findFiles(rootDir, extensions, excludePatterns = []) {
  const results = [];
  const defaultExcludes = ['node_modules', 'dist', 'build', '.next', 'coverage', '.git'];
  const allExcludes = [...defaultExcludes, ...excludePatterns];
  
  function walk(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        // Skip excluded directories
        if (entry.isDirectory()) {
          if (!allExcludes.includes(entry.name)) {
            walk(fullPath);
          }
          continue;
        }
        
        // Check extension match
        if (entry.isFile()) {
          const ext = '.' + entry.name.split('.').slice(1).join('.');
          if (extensions.some(e => entry.name.endsWith(e))) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }
  
  walk(rootDir);
  return results;
}

/**
 * Find tsconfig.json in project
 */
export function findTsConfig(rootDir) {
  const possiblePaths = [
    join(rootDir, 'tsconfig.json'),
    join(rootDir, 'jsconfig.json'),
  ];
  
  for (const configPath of possiblePaths) {
    if (existsSync(configPath)) {
      return configPath;
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
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        dirname(configPath)
      );
      
      compilerOptions = parsedConfig.options;
      fileNames = parsedConfig.fileNames;
    } else {
      // No tsconfig - find all TS/TSX/JS/JSX files using built-in fs
      fileNames = findFiles(rootDir, ['.ts', '.tsx', '.js', '.jsx']);
    }
    
    const program = ts.createProgram(fileNames, compilerOptions);
    
    return { program, compilerOptions, rootDir };
  } catch (error) {
    throw new Error(`Failed to create TypeScript program: ${error.message}`);
  }
}

/**
 * Resolve module path using TypeScript's own resolver
 * Handles: path aliases, baseUrl, barrel exports, .js extensions, etc.
 */
export function resolveModulePath(importPath, fromFile, rootDir, compilerOptions) {
  try {
    // Use TypeScript's module resolution
    const result = ts.resolveModuleName(
      importPath,
      fromFile,
      compilerOptions,
      ts.sys
    );
    
    if (result.resolvedModule) {
      const resolved = result.resolvedModule.resolvedFileName;
      
      // Skip node_modules and declaration files
      if (resolved.includes('node_modules') || result.resolvedModule.isExternalLibraryImport) {
        return null;
      }
      
      return resolved;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract JSDoc comment from a node
 */
function extractJSDoc(node, sourceFile) {
  const jsDocTags = ts.getJSDocTags(node);
  const fullText = sourceFile.getFullText();
  
  // Get leading comment ranges
  const commentRanges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  
  if (commentRanges) {
    for (const range of commentRanges) {
      const comment = fullText.slice(range.pos, range.end);
      // Only return JSDoc-style comments (/** ... */)
      if (comment.startsWith('/**')) {
        // Clean up the comment: remove /**, */, and leading *
        return comment
          .replace(/^\/\*\*\s*/, '')
          .replace(/\s*\*\/$/, '')
          .replace(/^\s*\*\s?/gm, '')
          .trim();
      }
    }
  }
  
  return null;
}

/**
 * Extract interface/type members for props detection
 */
function extractInterfaceMembers(node) {
  const members = [];
  
  if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name = member.name.getText();
        const typeStr = member.type ? member.type.getText() : 'unknown';
        const optional = !!member.questionToken;
        members.push({ name, type: typeStr, optional });
      }
    }
  }
  
  return members;
}

/**
 * Analyze a single TypeScript/JavaScript file for imports, exports, and metadata
 */
export function analyzeFile(filePath, program) {
  try {
    const sourceFile = program.getSourceFile(filePath);
    
    if (!sourceFile) {
      return null;
    }
    
    const imports = {};
    const exports = [];
    const lineCount = sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1;
    let fileJSDoc = null;
    let hasAnyTypes = false;
    
    function visit(node) {
      // Handle import declarations
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        
        if (ts.isStringLiteral(moduleSpecifier)) {
          const modulePath = moduleSpecifier.text;
          const importedSymbols = [];
          let isTypeOnly = node.importClause?.isTypeOnly || false;
          
          if (node.importClause?.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              node.importClause.namedBindings.elements.forEach(element => {
                importedSymbols.push({
                  name: element.name.text,
                  isTypeOnly: isTypeOnly || element.isTypeOnly
                });
              });
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              importedSymbols.push({
                name: '*',
                alias: node.importClause.namedBindings.name.text,
                isTypeOnly
              });
            }
          }
          
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
              isTypeOnly: node.isTypeOnly,
              jsdoc: null
            });
          });
        }
      }
      
      // Handle exported declarations (functions, classes, etc.)
      if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        const jsdoc = extractJSDoc(node, sourceFile);
        const isDefault = node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
        
        if (ts.isFunctionDeclaration(node) && node.name) {
          const sig = node.getText(sourceFile).split('{')[0].trim();
          
          // Detect 'any' types
          if (sig.includes(': any') || sig.includes('<any>')) {
            hasAnyTypes = true;
          }
          
          exports.push({
            name: node.name.text,
            type: 'function',
            signature: sig,
            jsdoc,
            isDefault
          });
        } else if (ts.isClassDeclaration(node) && node.name) {
          // Check for extends/implements
          const heritageClauses = node.heritageClauses || [];
          const extendsClause = heritageClauses.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
          const implementsClause = heritageClauses.find(h => h.token === ts.SyntaxKind.ImplementsKeyword);
          
          exports.push({
            name: node.name.text,
            type: 'class',
            jsdoc,
            isDefault,
            extends: extendsClause ? extendsClause.types.map(t => t.getText()).join(', ') : null,
            implements: implementsClause ? implementsClause.types.map(t => t.getText()).join(', ') : null
          });
        } else if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach(decl => {
            if (ts.isIdentifier(decl.name)) {
              const typeStr = decl.type ? decl.type.getText() : null;
              if (typeStr === 'any' || (decl.type && decl.type.getText().includes('any'))) {
                hasAnyTypes = true;
              }
              
              exports.push({
                name: decl.name.text,
                type: 'variable',
                jsdoc,
                isDefault,
                valueType: typeStr
              });
            }
          });
        } else if (ts.isInterfaceDeclaration(node) && node.name) {
          const members = extractInterfaceMembers(node);
          
          exports.push({
            name: node.name.text,
            type: 'interface',
            isTypeOnly: true,
            jsdoc,
            members
          });
        } else if (ts.isTypeAliasDeclaration(node) && node.name) {
          exports.push({
            name: node.name.text,
            type: 'type',
            isTypeOnly: true,
            jsdoc
          });
        } else if (ts.isEnumDeclaration(node) && node.name) {
          const members = node.members.map(m => m.name.getText());
          exports.push({
            name: node.name.text,
            type: 'enum',
            jsdoc,
            members
          });
        }
      }
      
      ts.forEachChild(node, visit);
    }
    
    // Check for file-level JSDoc (first comment in file)
    const firstStatement = sourceFile.statements[0];
    if (firstStatement) {
      fileJSDoc = extractJSDoc(firstStatement, sourceFile);
    }
    
    return {
      filePath,
      imports,
      exports,
      lineCount,
      hasJSDoc: exports.some(e => e.jsdoc !== null) || fileJSDoc !== null,
      fileJSDoc,
      hasAnyTypes,
      sourceFile
    };
  } catch (error) {
    console.warn(`Warning: Could not analyze ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Build complete dependency graph for TypeScript project
 * Returns symbol-level dependency information with relative paths
 */
export function buildDependencyGraph(rootDir, configPath = null) {
  try {
    const { program, compilerOptions } = createTypeScriptProgram(rootDir, configPath);
    const graph = {};
    const fileToImporters = {};
    
    const sourceFiles = program.getSourceFiles()
      .filter(sf => !sf.isDeclarationFile && !sf.fileName.includes('node_modules'));
    
    for (const sourceFile of sourceFiles) {
      const absPath = sourceFile.fileName;
      const relPath = toRelativePath(absPath, rootDir);
      const analysis = analyzeFile(absPath, program);
      
      if (!analysis) continue;
      
      graph[relPath] = {
        imports: analysis.imports,
        exports: analysis.exports,
        importedBy: [],
        lineCount: analysis.lineCount,
        hasJSDoc: analysis.hasJSDoc,
        fileJSDoc: analysis.fileJSDoc,
        hasAnyTypes: analysis.hasAnyTypes
      };
      
      // Build reverse mapping
      for (const [importPath, importInfo] of Object.entries(analysis.imports)) {
        const resolvedPath = resolveModulePath(importPath, absPath, rootDir, compilerOptions);
        
        if (resolvedPath) {
          const resolvedRelPath = toRelativePath(resolvedPath, rootDir);
          
          if (!fileToImporters[resolvedRelPath]) {
            fileToImporters[resolvedRelPath] = [];
          }
          fileToImporters[resolvedRelPath].push({
            importer: relPath,
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
 * Convert absolute path to relative path with forward slashes
 */
function toRelativePath(absPath, rootDir) {
  return relative(rootDir, absPath).split(sep).join('/');
}

/**
 * Compare exports between old and new versions to detect changes
 */
export function compareExports(oldExports, newExports) {
  const oldNames = new Set(oldExports.map(e => e.name));
  const newNames = new Set(newExports.map(e => e.name));
  
  const added = newExports.filter(e => !oldNames.has(e.name));
  const removed = oldExports.filter(e => !newNames.has(e.name));
  
  const changed = newExports.filter(newExp => {
    const oldExp = oldExports.find(e => e.name === newExp.name);
    if (!oldExp) return false;
    
    if (newExp.signature && oldExp.signature) {
      return newExp.signature !== oldExp.signature;
    }
    
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
  if (findTsConfig(rootDir)) {
    return true;
  }
  
  // Check for .ts or .tsx files using built-in fs
  try {
    const tsFiles = findFiles(rootDir, ['.ts', '.tsx']);
    return tsFiles.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get exported symbols from a source file (used for quick export checks)
 */
export function getExportedSymbols(sourceFile, typeChecker) {
  const symbol = typeChecker.getSymbolAtLocation(sourceFile);
  if (!symbol) return [];
  
  const exports = typeChecker.getExportsOfModule(symbol);
  return exports.map(exp => ({
    name: exp.getName(),
    type: typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(exp, sourceFile))
  }));
}
