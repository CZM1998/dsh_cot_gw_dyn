---
name: task-tracking
description: Track multi-step work with a TASKS.md file (create, update statuses, mark done). Use for tasks with 3+ steps.
---
# Task Tracking

Maintain a `TASKS.md` file in the working directory:

```
# Tasks
- [ ] Step 1: ...
- [x] Step 2: ...   (mark done when finished)
- [ ] Step 3: ...
```

- Create/update: `cat > TASKS.md <<'EOF' ... EOF` or edit with the editor.
- Update as you go: keep at most one task "in progress" notionally; mark completed the moment it is done.
- Skip tracking for trivial single-step work.
- At the end, ensure TASKS.md reflects the final state.
