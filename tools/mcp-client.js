import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import logger from '../logger.js';

/**
 * Spin up MCP client connections for each server config from the persona.
 * @param {Array<{name: string, command: string, args?: string[], env?: object}>} serverConfigs
 * @returns {Promise<Map<string, Client>>}
 */
export async function createMcpClients(serverConfigs) {
  const clients = new Map();
  for (const cfg of serverConfigs || []) {
    try {
      const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args || [],
        env: cfg.env,
      });
      const client = new Client({ name: 'ai-phone', version: '1.0.0' });
      await client.connect(transport);
      clients.set(cfg.name, client);
      logger.info({ serverName: cfg.name }, 'MCP server connected');
    } catch (err) {
      logger.error({ err, serverName: cfg.name }, 'Failed to connect MCP server');
    }
  }
  return clients;
}

/**
 * Query each connected MCP server for its tool list and return them in
 * OpenAI function-calling format, namespaced as "serverName__toolName".
 * @param {Map<string, Client>} clients
 * @returns {Promise<Array>}
 */
export async function getMcpTools(clients) {
  const tools = [];
  for (const [serverName, client] of clients) {
    try {
      const { tools: serverTools } = await client.listTools();
      for (const t of serverTools) {
        tools.push({
          type: 'function',
          name: `${serverName}__${t.name}`,
          description: t.description,
          parameters: t.inputSchema,
        });
      }
    } catch (err) {
      logger.error({ err, serverName }, 'Failed to list tools from MCP server');
    }
  }
  return tools;
}

/**
 * Invoke a namespaced tool ("serverName__toolName") on the appropriate MCP client.
 * @param {string} namespacedTool
 * @param {object} args
 * @param {Map<string, Client>} clients
 * @returns {Promise<any>}
 */
export async function callMcpTool(namespacedTool, args, clients) {
  const separatorIndex = namespacedTool.indexOf('__');
  if (separatorIndex === -1) throw new Error(`MCP tool name must include server prefix: ${namespacedTool}`);
  const serverName = namespacedTool.slice(0, separatorIndex);
  const toolName = namespacedTool.slice(separatorIndex + 2);
  const client = clients.get(serverName);
  if (!client) throw new Error(`No MCP server registered: ${serverName}`);
  const result = await client.callTool({ name: toolName, arguments: args });
  // Return text content directly, or raw result for callers that need more
  if (Array.isArray(result.content) && result.content[0]?.type === 'text') {
    return result.content[0].text;
  }
  return result;
}

/**
 * Close all active MCP client connections.
 * @param {Map<string, Client>} clients
 */
export async function closeMcpClients(clients) {
  for (const [serverName, client] of clients) {
    try {
      await client.close();
    } catch (err) {
      logger.warn({ err, serverName }, 'Error closing MCP client');
    }
  }
}
