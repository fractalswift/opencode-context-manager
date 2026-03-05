#!/bin/bash

# Test script for incremental context update functionality
# Run this to verify that incremental updates are working correctly

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Incremental Context Update Test Suite                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Helper function for test status
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

# Test 1: Check if git repository
echo "Test 1: Git Repository Check"
echo "───────────────────────────────────────────────────────────────"
if [ -d ".git" ]; then
    test_pass "Running in a git repository"
else
    test_fail "Not a git repository (required for context updates)"
    echo ""
    echo "Please run this test from within a git repository."
    exit 1
fi
echo ""

# Test 2: Check if lib modules exist
echo "Test 2: Dependency Analysis Modules"
echo "───────────────────────────────────────────────────────────────"
if [ -f "lib/git-analyzer.js" ]; then
    test_pass "git-analyzer.js found"
else
    test_fail "lib/git-analyzer.js missing"
fi

if [ -f "lib/dependency-analyzer.js" ]; then
    test_pass "dependency-analyzer.js found"
else
    test_fail "lib/dependency-analyzer.js missing"
fi

if [ -f "lib/typescript-analyzer.js" ]; then
    test_pass "typescript-analyzer.js found"
else
    test_fail "lib/typescript-analyzer.js missing"
fi

if [ -f "lib/scan-strategy.js" ]; then
    test_pass "scan-strategy.js found"
else
    test_fail "lib/scan-strategy.js missing"
fi

if [ -f "lib/madge-analyzer.js" ]; then
    test_pass "madge-analyzer.js found"
else
    test_fail "lib/madge-analyzer.js missing"
fi
echo ""

# Test 3: Check if dependencies are installed
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

# Test 4: Check if SKILL.md has incremental logic
echo "Test 4: SKILL.md Update Check"
echo "───────────────────────────────────────────────────────────────"
if grep -q "Step 0: Incremental vs Full Scan Decision" "assets/skill/context-update/SKILL.md"; then
    test_pass "SKILL.md contains incremental update instructions"
else
    test_fail "SKILL.md missing incremental update instructions"
fi

if grep -q "Step 2.5: Incremental Scan" "assets/skill/context-update/SKILL.md"; then
    test_pass "SKILL.md contains Step 2.5 (Incremental Scan)"
else
    test_fail "SKILL.md missing Step 2.5"
fi
echo ""

# Test 5: Check if .gitignore includes cache directory
echo "Test 5: Git Configuration"
echo "───────────────────────────────────────────────────────────────"
if grep -q ".opencode/cache/" ".gitignore"; then
    test_pass ".gitignore includes .opencode/cache/"
else
    test_fail ".gitignore missing .opencode/cache/ entry"
fi
echo ""

# Test 6: Verify package.json has correct dependencies
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
echo ""

# Test 7: Check if context directory exists
echo "Test 7: Context Directory Structure"
echo "───────────────────────────────────────────────────────────────"
if [ -d ".opencode/context" ]; then
    test_pass ".opencode/context directory exists"
    
    if [ -f ".opencode/context/repo-structure.md" ]; then
        test_pass "repo-structure.md exists"
        
        # Check for git metadata header
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

# Test 8: Check cache functionality (if exists)
echo "Test 8: Dependency Cache"
echo "───────────────────────────────────────────────────────────────"
if [ -d ".opencode/cache" ]; then
    test_pass ".opencode/cache directory exists"
    
    if [ -f ".opencode/cache/dependency-graph.json" ]; then
        test_pass "dependency-graph.json exists"
        
        # Validate JSON
        if node -e "JSON.parse(require('fs').readFileSync('.opencode/cache/dependency-graph.json', 'utf-8'))" 2>/dev/null; then
            test_pass "dependency-graph.json is valid JSON"
        else
            test_fail "dependency-graph.json is invalid JSON"
        fi
    else
        test_info "dependency-graph.json not yet generated"
    fi
else
    test_info "Cache directory not yet created (will be created on first update)"
fi
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Test Summary                                                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Tests Passed: ${GREEN}${PASSED}${NC}"
echo -e "Tests Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All critical tests passed!${NC}"
    echo ""
    echo "The incremental context update system is properly installed."
    echo "You can now run: opencode run \"/context-update\""
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Please fix the failed tests before using incremental updates."
    echo "Run 'npm install' to install missing dependencies."
    echo ""
    exit 1
fi
