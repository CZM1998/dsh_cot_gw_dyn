---
name: file-search
description: Search files and file contents with Linux commands (find / rg / grep). Use when you need to locate files, match paths, or search text across a repository.
---
# File Search (Linux)

Use these commands instead of dedicated search tools when they are unavailable:

- Find files by name/pattern: `find <dir> -name '*.py' -not -path '*/node_modules/*'`
- Find by content (ripgrep): `rg -n 'pattern' <dir> -g '!*.min.js'`
- Fallback grep: `grep -rn --include='*.py' 'pattern' <dir>`
- List top-level: `ls -la` / `find . -maxdepth 2 -type f | head -50`
- Largest files: `find . -type f -printf '%s %p\n' | sort -rn | head -10`
- Count lines: `wc -l <file>` / total: `find . -name '*.py' -exec wc -l {} + | tail -1`

Keep searches bounded (add `head`, `-maxdepth`, excludes); huge outputs waste context.
