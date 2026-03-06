#!/bin/bash

# Test script for incremental context update functionality
# Run this to verify that the dependency-aware update system is properly installed

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Incremental Context Update Test Suite (v2.0)                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

test_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    PASSED=$((PASSED + 1))
}

test_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    FAILED=$((FAILED + 1))
}

test_info() {
    echo -e "${BLUE}ℹ INFO${NC}: $1"
}

test_warn() {
    echo -e "${YELLOW}⚠ WARN${NC}: $1"
}

# ── Test 1: Git Repository ──
echo "Test 1: Git Repository Check"
echo "───────────────────────────────────────────────────────────────"
if [ -d ".git" ]; then
    test_pass "Running in a git repository"
else
    test_fail "Not a git repository"
    exit 1
fi
echo ""

# ── Test 2: Dependency Analysis Modules ──
echo "Test 2: Dependency Analysis Modules"
echo "───────────────────────────────────────────────────────────────"
for module in git-analyzer dependency-analyzer typescript-analyzer scan-strategy madge-analyzer error-handler codebase-summarizer; do
    if [ -f "lib/${module}.js" ]; then
        test_pass "${module}.js found"
    else
        test_fail "lib/${module}.js missing"
    fi
done
echo ""

# ── Test 3: NPM Dependencies ──
echo "Test 3: NPM Dependencies"
echo "───────────────────────────────────────────────────────────────"
if [ -d "node_modules" ]; then
    test_pass "node_modules directory exists"
    
    if [ -d "node_modules/typescript" ]; then
        test_pass "TypeScript dependency installed"
    else
        test_warn "TypeScript not installed (run: npm install)"
    fi
    
    if [ -d "node_modules/madge" ]; then
        test_pass "Madge dependency installed"
    else
        test_warn "Madge not installed (run: npm install)"
    fi
else
    test_warn "node_modules not found (run: npm install)"
fi
echo ""

# ── Test 4: SKILL.md ──
echo "Test 4: SKILL.md Architecture Check"
echo "───────────────────────────────────────────────────────────────"
SKILL_FILE="assets/skill/context-update/SKILL.md"
if [ -f "$SKILL_FILE" ]; then
    if grep -q "Step 0: Run Static Analysis" "$SKILL_FILE"; then
        test_pass "SKILL.md has Step 0 (static analysis first)"
    else
        test_fail "SKILL.md missing Step 0"
    fi
    
    if grep -q "decideScanStrategy" "$SKILL_FILE"; then
        test_pass "SKILL.md references scan strategy helper"
    else
        test_fail "SKILL.md missing scan strategy reference"
    fi
    
    if grep -q "Step 2.5: Incremental Scan" "$SKILL_FILE"; then
        test_pass "SKILL.md has Step 2.5 (incremental scan)"
    else
        test_fail "SKILL.md missing Step 2.5"
    fi
    
    if grep -q "Pre-Analysis" "$SKILL_FILE" || grep -q "pre-analysis" "$SKILL_FILE"; then
        test_pass "SKILL.md references pre-analysis"
    else
        test_fail "SKILL.md missing pre-analysis reference"
    fi
else
    test_fail "SKILL.md not found at $SKILL_FILE"
fi
echo ""

# ── Test 5: Git Configuration ──
echo "Test 5: Git Configuration"
echo "───────────────────────────────────────────────────────────────"
# Analysis directory should NOT be gitignored
if grep -q ".opencode/cache/" ".gitignore" 2>/dev/null; then
    test_warn ".gitignore still references old .opencode/cache/ (should be removed)"
else
    test_pass ".gitignore doesn't exclude old cache directory"
fi

# Check that .opencode/analysis/ is NOT in .gitignore (ignore comment lines)
if grep -v "^#" ".gitignore" 2>/dev/null | grep -q ".opencode/analysis/"; then
    test_fail ".opencode/analysis/ is gitignored (should be committed!)"
else
    test_pass ".opencode/analysis/ is not gitignored (will be committed)"
fi
echo ""

# ── Test 6: Package Configuration ──
echo "Test 6: Package Configuration"
echo "───────────────────────────────────────────────────────────────"
if grep -q '"typescript"' "package.json"; then
    test_pass "package.json includes TypeScript dependency"
else
    test_fail "package.json missing TypeScript dependency"
fi

if grep -q '"madge"' "package.json"; then
    test_pass "package.json includes Madge dependency"
else
    test_fail "package.json missing Madge dependency"
fi

if grep -q '"version": "2.0.0"' "package.json"; then
    test_pass "package.json version is 2.0.0"
else
    test_warn "package.json version is not 2.0.0"
fi

if grep -q '"lib"' "package.json"; then
    test_pass "package.json includes lib in files list"
else
    test_fail "package.json missing lib in files list"
fi
echo ""

# ── Test 7: Context Directory ──
echo "Test 7: Context Directory Structure"
echo "───────────────────────────────────────────────────────────────"
if [ -d ".opencode/context" ]; then
    test_pass ".opencode/context directory exists"
    
    if [ -f ".opencode/context/repo-structure.md" ]; then
        test_pass "repo-structure.md exists"
        
        if head -1 ".opencode/context/repo-structure.md" | grep -q "<!-- Context:"; then
            test_pass "repo-structure.md has git metadata header"
        else
            test_warn "repo-structure.md missing git metadata header"
        fi
    else
        test_info "repo-structure.md not yet generated (run /context-update)"
    fi
else
    test_info ".opencode/context not yet created (run /context-update)"
fi
echo ""

# ── Test 8: Analysis Directory ──
echo "Test 8: Analysis Cache"
echo "───────────────────────────────────────────────────────────────"
if [ -d ".opencode/analysis" ]; then
    test_pass ".opencode/analysis directory exists"
    
    if [ -f ".opencode/analysis/codebase-analysis.json" ]; then
        test_pass "codebase-analysis.json exists"
        
        if node -e "const c = JSON.parse(require('fs').readFileSync('.opencode/analysis/codebase-analysis.json', 'utf-8')); if(!c.version) throw new Error('no version')" 2>/dev/null; then
            test_pass "codebase-analysis.json is valid and has version"
        else
            test_fail "codebase-analysis.json is invalid or missing version"
        fi
    else
        test_info "codebase-analysis.json not yet generated (will be created on first run)"
    fi
else
    test_info "Analysis directory not yet created (will be created on first run)"
fi
echo ""

# ── Test 9: Module ESM Imports ──
echo "Test 9: Module ESM Compatibility"
echo "───────────────────────────────────────────────────────────────"
# Check that no module uses require()
HAS_REQUIRE=false
for module in lib/*.js; do
    if grep -q "require(" "$module" 2>/dev/null; then
        test_fail "$module uses require() instead of ESM import"
        HAS_REQUIRE=true
    fi
done
if [ "$HAS_REQUIRE" = false ]; then
    test_pass "All lib modules use ESM imports (no require())"
fi

# Check that no module uses glob dependency
HAS_GLOB=false
for module in lib/*.js; do
    if grep -q "from 'glob'" "$module" 2>/dev/null; then
        test_fail "$module imports from 'glob' (should use built-in fs)"
        HAS_GLOB=true
    fi
done
if [ "$HAS_GLOB" = false ]; then
    test_pass "No modules depend on 'glob' package (using built-in fs)"
fi
echo ""

# ── Summary ──
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Test Summary                                                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Tests Passed: ${GREEN}${PASSED}${NC}"
echo -e "Tests Failed: ${RED}${FAILED}${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "The dependency-aware incremental update system is ready."
    echo ""
    echo "Usage:"
    echo "  /context-update              Auto-decide (recommended)"
    echo "  /context-update --full       Force full scan"
    echo "  /context-update --rebuild-graph  Rebuild dependency graph"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Fix the failed tests before using. Run 'npm install' if dependencies are missing."
    echo ""
    exit 1
fi
