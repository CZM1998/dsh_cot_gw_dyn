---
name: background-tasks
description: Run long commands in the background with nohup and monitor them via log files. Use for builds, long tests, servers, and parallel tasks.
---
# Background Tasks (Linux)

Start a long command detached and monitor it:

- Start: `nohup bash -c '<command>' > /tmp/task.log 2>&1 & echo $!` (record the PID)
- Poll: `cat /tmp/task.log` / `tail -20 /tmp/task.log`
- Check alive: `ps -p <PID>` / `kill -0 <PID> && echo alive`
- Stop: `kill <PID>`
- Parallel fan-out: start several nohup jobs with separate log files, poll them, then merge results.

Rules: always redirect output to a file (otherwise output is lost), record PIDs in a notes file, and poll with bounded output (tail) rather than dumping logs.
