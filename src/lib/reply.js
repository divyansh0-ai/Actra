/**
 * Shape a tool result for maximum host compatibility.
 *
 * The WebMCP spec demonstrates tools returning `{ content: [{ type, text }] }`,
 * which every MCP host can read. Returning a bare object happens to work with
 * the polyfill (and with Google's own demos), but we should not rely on a host
 * tolerating it — so we send the canonical `content` array AND keep the typed
 * payload on `structuredContent`, which is what an agent should actually reason
 * over. A host that ignores both and stringifies the whole object still gets
 * every field.
 */
export const reply = (data) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
});
