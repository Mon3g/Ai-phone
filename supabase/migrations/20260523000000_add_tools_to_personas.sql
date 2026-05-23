/*
  # Add tool calling support to personas

  Adds two JSONB columns to the personas table so each persona can declare:
    - tools: OpenAI function-calling schemas (inline, no MCP server required)
    - mcp_servers: MCP server process configs; the backend spawns these per call
                   and discovers tools from them automatically at runtime.

  Column shapes:

  tools (array of OpenAI tool objects):
  [
    {
      "type": "function",
      "name": "get_weather",
      "description": "Return current weather for a city",
      "parameters": {
        "type": "object",
        "required": ["city"],
        "properties": { "city": { "type": "string" } }
      }
    }
  ]

  mcp_servers (array of stdio server configs):
  [
    { "name": "booking", "command": "node", "args": ["./mcp-servers/booking.js"] }
  ]
*/

ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS tools jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mcp_servers jsonb DEFAULT '[]'::jsonb;
