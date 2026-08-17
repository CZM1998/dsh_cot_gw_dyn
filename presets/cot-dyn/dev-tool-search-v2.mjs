/**
 * dev-tool-search — discover and activate additional tools on demand (E3/E4).
 *
 * The resident surface is small by design; this tool lets the model search
 * the FULL registered catalog by keyword and activate tools by exact name.
 * Activated tools appear in the request schema from the next turn on and
 * retire automatically when unused (see tool-gate.mjs).
 *
 * Description is deliberately neutral action semantics: no "plan / need /
 * before you start" meta-instructions.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dev-tool-search'

/** The tools registry must exist before this tool can register. */
export const inject = ['tools']

const MAX_RESULTS = 25

/** Minimal JSON schema compiler for tool parameters (zero dependencies). */
function toJsonSchema(spec) {
  const properties = {}
  const required = []
  for (const [key, meta] of Object.entries(spec || {})) {
    const prop = { type: meta.type }
    if (meta.description) prop.description = meta.description
    properties[key] = prop
    if (meta.required) required.push(key)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

/** Register the model-facing `dev_tool_search` tool. */
export function apply(ctx) {
  ctx.tools.register({
    name: 'dev_tool_search',
    description: [
      'Search the full tool catalog and activate tools.',
      'Pass `query` to search by keyword (returns matching tool names with short descriptions), then pass `toolNames` with exact names to activate them.',
      'Activated tools appear in your tool list from the next request on; tools not used for a while retire automatically.',
    ].join('\n'),
    parameters: toJsonSchema({
      query: { type: 'string', required: false, description: 'search keywords (e.g. "web", "background", "vision")' },
      toolNames: { type: 'array', required: false, description: 'exact tool names to activate', items: { type: 'string' } },
    }),
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    async execute(args, exec) {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      const unlock = Array.isArray(args.toolNames) ? args.toolNames.filter((name) => typeof name === 'string' && name.length > 0) : []
      const lines = []
      if (unlock.length > 0) lines.push(`Activated for the next request: ${unlock.join(', ')}`)
      if (query.length === 0 && unlock.length === 0) {
        lines.push('Provide `query` to search the catalog, or `toolNames` to activate tools.')
        return { text: lines.join('\n') }
      }
      if (query.length === 0) return { text: lines.join('\n') || 'Nothing to do.' }
      try {
        const schemas = ctx.tools.schemas(exec?.agent)
        const wanted = query.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean)
        const matches = schemas
          .filter((schema) => {
            if (schema.name === 'dev_tool_search' || schema.name === 'invoke') return false
            const haystack = `${schema.name} ${schema.description ?? ''}`.toLowerCase()
            return wanted.every((token) => haystack.includes(token))
          })
          .slice(0, MAX_RESULTS)
        if (matches.length === 0) {
          lines.push(`No tools match "${query}".`)
        } else {
          lines.push(`Matching tools (${matches.length}):`)
          for (const schema of matches) {
            const desc = (schema.description || '').split('\n')[0].slice(0, 90)
            lines.push(`- ${schema.name}: ${desc}`)
          }
          lines.push('Activate with dev_tool_search({"toolNames": ["<exact name>"]}).')
        }
      } catch (error) {
        lines.push(`catalog search unavailable: ${String((error && error.message) || error)}`)
      }
      return { text: lines.join('\n') }
    },
  })
}
