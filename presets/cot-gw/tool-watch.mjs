/**
 * tool-watch — incremental disclosure of NEWLY registered tools.
 *
 * When a tool is registered AFTER the agent has been running (a user adds a
 * plugin row mid-session, a dynamic plugin registers a tool, vision tools
 * get activated, …), the model would otherwise have no way to know it
 * exists — the full catalog is preloaded once at the task start, and the
 * model rarely re-runs `gateway list`. This plugin compares each agent's
 * CURRENT visible tool set against the set it has already seen and, on the
 * first step where new names appear, prepends a small USER message listing
 * exactly the new tools (name, description, parameter schema).
 *
 * The first step of a session establishes the baseline silently (the full
 * catalog is already preloaded by the bench driver / resident set), so only
 * genuine MID-SESSION additions are disclosed, and each addition is
 * disclosed exactly once.
 *
 * Pure information: no instruction on when to use the new tools.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-watch'

/** Deliberately NO inject list: listeners touch services at event time. */
export const inject = []

/** Format one schema the same way the gateway catalog renders it. */
function formatSchema(schema) {
  const desc = (schema.description || '').split('\n')[0]
  let paramText = '(no parameters)'
  try {
    const prm = schema.parameters
    if (prm && typeof prm === 'object') {
      const props = prm.properties ?? {}
      const keys = Object.keys(props)
      paramText = keys.length === 0
        ? '(no parameters)'
        : keys.map((k) => {
            const meta = props[k] ?? {}
            const type = Array.isArray(meta.type) ? meta.type.join('|') : (meta.type ?? 'any')
            const req = (prm.required ?? []).includes(k) ? '*' : ''
            return `${k}${req}:${type}${meta.description ? ' — ' + String(meta.description).split('\n')[0].slice(0, 70) : ''}`
          }).join('; ')
    }
  } catch { /* keep generic */ }
  return `- ${schema.name}: ${desc}\n    params: ${paramText}`
}

/** Register the incremental tool-watch. */
export function apply(ctx) {
  /** agent -> Set of tool names it has already seen. */
  const known = new WeakMap()

  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    try {
      if (agent === undefined) return decision
      const tools = ctx.get('tools')
      if (tools === undefined) return decision
      const schemas = tools.schemas(agent) ?? []
      const names = new Set(schemas.map((s) => s.name))

      const prev = known.get(agent)
      if (prev === undefined) {
        // First step: baseline. The full catalog is preloaded elsewhere.
        known.set(agent, names)
        return decision
      }

      const added = [...names].filter((n) => !prev.has(n) && n !== 'gateway')
      if (added.length === 0) return decision
      for (const n of added) prev.add(n)

      const lines = ['=== New tools available in this session ===']
      for (const s of schemas) {
        if (added.includes(s.name)) lines.push(formatSchema(s))
      }
      const message = {
        id: `tool-watch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        role: 'user',
        content: [{ type: 'text', text: lines.join('\n') }],
        source: {
          kind: 'plugin',
          plugin: name,
          form: 'notice',
          summary: 'new tools available',
        },
      }
      return { ...decision, messages: [message, ...decision.messages] }
    } catch (error) {
      try { ctx.logger.warn('%s: failed: %s', name, String((error && error.message) || error)) } catch {}
      return decision
    }
  }, { prepend: true })
}
