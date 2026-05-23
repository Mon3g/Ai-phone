import { callMcpTool } from './mcp-client.js';

// Built-in tools that are always available without any MCP server
const builtins = {
  get_current_time: () => ({ time: new Date().toISOString() }),
  get_current_date: () => ({
    date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  }),
};

/**
 * Dispatch a tool call to either a built-in handler or an MCP server.
 *
 * Tool names containing "__" are routed to MCP via callMcpTool().
 * Everything else is matched against the builtins map.
 *
 * @param {string} name - Tool name (e.g. "get_current_time" or "booking__make_reservation")
 * @param {object} args - Parsed arguments from OpenAI
 * @param {Map} mcpClients - Active MCP client connections for this call session
 * @returns {Promise<any>}
 */
export async function dispatchTool(name, args, mcpClients) {
  if (builtins[name]) {
    return builtins[name](args);
  }
  if (name.includes('__')) {
    return callMcpTool(name, args, mcpClients);
  }
  throw new Error(`Unknown tool: ${name}`);
}
