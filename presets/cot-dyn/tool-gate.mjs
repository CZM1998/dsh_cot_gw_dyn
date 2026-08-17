/**
 * tool-gate — dynamic tool surface state machine (E2a / E2b / E3 / E4).
 *
 * The assemble filter narrows the request's tool catalog to:
 *   - RESIDENT tools (always present, configured),
 *   - tools EXPLICITLY unlocked via `dev_tool_search` (toolNames recorded as
 *     durable tool/call arguments, so resume keeps them),
 *   - recently-used unlockable tools (LRU: called within the last
 *     `retireRounds` steps stay; after that they retire automatically, so
 *     the schema surface shrinks back and the chain-of-thought style
 *     recovers).
 *
 * Unlockable tools are registered in the scope but hidden from the request
 * until unlocked/used — reachable through `dev_tool_search` (E3/E4) or
 * `invoke` (E2a/E2b, which forwards to the registry regardless of the
 * visible surface).
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-gate'

/** Deliberately NO inject list: the listeners only touch services at event time. */
export const inject = []

function stringList(value, field, fallback) {
  if (value === undefined) return [...fallback]
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${name}: ${field} must be an array of non-empty strings`)
  }
  return [...new Set(value)]
}

/** Tool names the model explicitly unlocked via dev_tool_search (durable). */
function unlockedFor(agent) {
  const unlocked = new Set()
  const events = agent?.session?.events
  if (!Array.isArray(events)) return unlocked
  for (const event of events) {
    if (event.type !== 'tool/call' || event.data?.name !== 'dev_tool_search') continue
    let args
    try { args = JSON.parse(event.data.arguments) } catch { continue }
    if (args === null || typeof args !== 'object' || Array.isArray(args)) continue
    const names = args.toolNames
    if (Array.isArray(names)) for (const name of names) if (typeof name === 'string' && name.length > 0) unlocked.add(name)
  }
  return unlocked
}

/** Register the dynamic tool-surface gate. */
export function apply(ctx, config) {
  const resident = stringList(config.resident, 'resident', [])
  const retireRounds = Number.isSafeInteger(config.retireRounds) && config.retireRounds > 0
    ? config.retireRounds
    : 8
  const includeSubagents = config.includeSubagents === true

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    try {
      const agent = context.agent
      if (agent === undefined) return assembled
      if (!includeSubagents && (agent?.session?.header?.delegationDepth ?? 0) > 0) return assembled
      const available = new Set(assembled.tools.map((tool) => tool.name))
      const keep = new Set(resident.filter((name) => available.has(name)))

      // Explicit unlocks via dev_tool_search.
      for (const name of unlockedFor(agent)) if (available.has(name)) keep.add(name)

      // LRU: every non-resident tool (explicitly unlocked OR incidentally
      // called) stays only while its LAST ACTIVITY is within the last
      // retireRounds steps. Activity = the tool's own tool/call seq, or the
      // seq of the dev_tool_search call that unlocked it. Beyond the window
      // the tool retires and the schema surface shrinks back.
      const events = agent?.session?.events
      if (Array.isArray(events)) {
        const activity = new Map()
        for (const event of events) {
          if (event.type !== 'tool/call' || event.data?.name === undefined) continue
          const seq = event.seq0 ?? event.seq ?? 0
          const name = event.data.name
          activity.set(name, Math.max(activity.get(name) ?? 0, seq))
          if (name === 'dev_tool_search') {
            let args
            try { args = JSON.parse(event.data.arguments) } catch { continue }
            if (args !== null && typeof args === 'object' && Array.isArray(args.toolNames)) {
              for (const tn of args.toolNames) {
                if (typeof tn === 'string' && tn.length > 0) activity.set(tn, Math.max(activity.get(tn) ?? 0, seq))
              }
            }
          }
        }
        const stepStarts = []
        for (const event of events) if (event.type === 'step/start') stepStarts.push(event.seq0 ?? event.seq ?? 0)
        const cutoff = stepStarts.length > retireRounds ? stepStarts[stepStarts.length - retireRounds] : -1
        for (const [name, seq] of activity) {
          if ((cutoff < 0 || seq >= cutoff) && available.has(name)) keep.add(name)
        }
      }

      return { ...assembled, tools: assembled.tools.filter((tool) => keep.has(tool.name)) }
    } catch (error) {
      try { ctx.logger.warn('%s: gate failed, exposing full catalog: %s', name, String((error && error.message) || error)) } catch {}
      return assembled
    }
  }, { prepend: true })
}
