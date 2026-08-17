---
name: orchestration
description: Understand when and how to use subagents, workflows, and iterative loops. Reference knowledge; actual invocation needs the tools activated.
---
# Orchestration

When a task could be split across agents, consider:

- subagent (fresh context): independent self-contained subtasks (research, scoped implementation) that would consume your context.
- subagent_fork (inherits context): follow-up analyses that build on this conversation.
- workflow: fan-out of many independent pieces with structured results (audits, migrations, multi-angle research).
- ralph: iterative fresh-agent loops toward one objective.

Guidance: use delegation when the subtask is large and independent; do not delegate trivial steps. Children report structured results; you integrate them. If the tools are not activated, tell the user the capability exists and ask to activate the relevant tools.
