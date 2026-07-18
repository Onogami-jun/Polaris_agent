/**
 * MCP (Model Context Protocol) Server Manager
 * Manages local MCP servers that provide tools to the agent.
 */

export interface MCPServer {
  id: string; name: string; command: string; args: string[]; env?: Record<string, string>; enabled: boolean; status: 'stopped' | 'starting' | 'running' | 'error';
}

const STORAGE_KEY = 'polaris_mcp_servers';

export function getStoredServers(): MCPServer[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : getDefaults(); } catch { return getDefaults(); }
}

function getDefaults(): MCPServer[] {
  return [
    { id: 'mcp1', name: 'Filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'], enabled: false, status: 'stopped' },
    { id: 'mcp2', name: 'GitHub', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: '' }, enabled: false, status: 'stopped' },
    { id: 'mcp3', name: 'Brave Search', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: { BRAVE_API_KEY: '' }, enabled: false, status: 'stopped' },
  ];
}

export function saveServers(servers: MCPServer[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

export function startServer(server: MCPServer): MCPServer {
  // In a real implementation, this would spawn a child process
  return { ...server, status: 'running' };
}

export function stopServer(server: MCPServer): MCPServer {
  return { ...server, status: 'stopped' };
}
