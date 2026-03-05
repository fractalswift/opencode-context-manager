---
description: Scan repository and update context files with intelligent incremental updates
agent: general
---

Scan the current repository and update context files in .opencode/context/. 

The tool automatically decides between full scan and incremental scan based on what changed. Incremental mode saves 85-97% of tokens for typical updates.

Load the context-update skill for detailed instructions.

## Flags

Check if the user provided any flags in their message:

- `--full`: Force full repository scan (ignore incremental mode)
- `--rebuild-graph`: Force dependency graph regeneration
- No flags: Auto-decide between full/incremental (recommended)

Pass these flags to the scan strategy decision in Step 0.
