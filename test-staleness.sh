#!/bin/bash

# Test script for context staleness detection

echo "=== Context Staleness Detection Test ==="
echo ""

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo "❌ Not a git repository"
    exit 1
fi

echo "✓ Git repository detected"
echo ""

# Test 1: Check if context file has the new header format
echo "Test 1: Checking context file header format..."
CONTEXT_FILE=".opencode/context/repo-structure.md"

if [ ! -f "$CONTEXT_FILE" ]; then
    echo "❌ Context file not found: $CONTEXT_FILE"
    exit 1
fi

HEADER=$(head -1 "$CONTEXT_FILE")
if [[ $HEADER =~ ^"<!-- Context: " ]]; then
    echo "✓ Context file has proper header: $HEADER"
else
    echo "❌ Context file missing proper header"
    echo "   Found: $HEADER"
    exit 1
fi

# Extract branch and hash from header
if [[ $HEADER =~ Context:\ ([^@]+)@([a-f0-9]+)\ --\> ]]; then
    STORED_BRANCH="${BASH_REMATCH[1]}"
    STORED_HASH="${BASH_REMATCH[2]}"
    echo "  → Stored branch: $STORED_BRANCH"
    echo "  → Stored hash: $STORED_HASH"
else
    echo "❌ Could not parse branch@hash from header"
    exit 1
fi

echo ""

# Test 2: Get current git state
echo "Test 2: Getting current git state..."
CURRENT_BRANCH=$(git branch --show-current)
CURRENT_HASH=$(git rev-parse --short HEAD)

echo "  → Current branch: $CURRENT_BRANCH"
echo "  → Current hash: $CURRENT_HASH"

# Check if branch matches
if [ "$STORED_BRANCH" != "$CURRENT_BRANCH" ]; then
    echo "⚠️  BRANCH MISMATCH: Context from '$STORED_BRANCH', currently on '$CURRENT_BRANCH'"
else
    echo "✓ Branch matches"
fi

echo ""

# Test 3: Check staleness
echo "Test 3: Checking staleness..."

# Check if stored hash exists in current branch history
if git rev-parse --verify "$STORED_HASH" >/dev/null 2>&1; then
    echo "✓ Stored commit exists in repository"
    
    # Count commits behind
    COMMITS_BEHIND=$(git log "$STORED_HASH..HEAD" --oneline | wc -l | tr -d ' ')
    echo "  → Commits behind: $COMMITS_BEHIND"
    
    # Assess staleness
    if [ "$COMMITS_BEHIND" -eq 0 ]; then
        echo "✓ Context is CURRENT (same commit)"
    elif [ "$COMMITS_BEHIND" -le 5 ]; then
        echo "✓ Context is RECENT ($COMMITS_BEHIND commits behind)"
    elif [ "$COMMITS_BEHIND" -le 15 ]; then
        echo "⚠️  Context is MODERATELY STALE ($COMMITS_BEHIND commits behind)"
    else
        echo "❌ Context is SIGNIFICANTLY STALE ($COMMITS_BEHIND commits behind)"
        echo "   Recommend running: /context-update"
    fi
    
    # Show files changed (limited to 20)
    echo ""
    echo "Files changed since context was generated:"
    CHANGED_FILES=$(git diff --name-only "$STORED_HASH..HEAD" | grep -v -E '^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|dist/|build/|\.next/|coverage/|\.env)' | head -20)
    
    FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c .)
    echo "  → $FILE_COUNT files changed (showing first 20, filtered)"
    
    if [ "$FILE_COUNT" -gt 0 ]; then
        echo "$CHANGED_FILES" | while read file; do
            echo "    - $file"
        done
    fi
else
    echo "❌ Stored commit not found in current branch history"
    echo "   Context may be from a different branch or commit was rewritten"
fi

echo ""
echo "=== Test Complete ==="
