---
name: long-run-goals
description: Manage long-running objectives with a goals file so work continues across turns. Use for multi-turn or autonomous tasks.
---
# Long-Run Goals

For objectives that span many turns (autonomous work, long builds, big refactors), record the goal in a `GOALS.md` file:

```
objective: <one sentence>
phase: <current phase>
rounds: <count>
next: <next concrete step>
```

- Create/update with the editor or heredoc.
- At each turn boundary, check GOALS.md and continue from `next`.
- Update phase/rounds after each completed step so a resumed session knows where it is.
- Keep the goal objective stable; change only phase/next.
