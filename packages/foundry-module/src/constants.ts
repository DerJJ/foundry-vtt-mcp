// Constants for Foundry MCP Bridge Module

/**
 * Module constants
 */
export const MODULE_ID = 'foundry-mcp-bridge';
export const MODULE_TITLE = 'Foundry MCP Bridge';

/**
 * Socket event names
 */
export const SOCKET_EVENTS = {
  MCP_QUERY: 'mcp-query',
  MCP_RESPONSE: 'mcp-response',
  BRIDGE_STATUS: 'bridge-status',
  PING: 'ping',
  PONG: 'pong',
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  MCP_HOST: 'localhost',
  MCP_PORT: 31415,
  CONNECTION_TIMEOUT: 10,
  // Keep trying (every 30 seconds at most): the MCP server is started by the AI client, often after
  // Foundry, and a bridge that gave up after 30 seconds needed a page reload to find it.
  RECONNECT_ATTEMPTS: Number.POSITIVE_INFINITY,
  RECONNECT_DELAY: 1000,
  LOG_LEVEL: 'info',
} as const;

/**
 * Connection states
 */
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
} as const;

/**
 * Token dispositions
 */
export const TOKEN_DISPOSITIONS = {
  HOSTILE: -1,
  NEUTRAL: 0,
  FRIENDLY: 1,
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  NOT_INITIALIZED: 'Data provider not initialized',
  NOT_CONNECTED: 'Not connected to Foundry VTT',
  CHARACTER_NOT_FOUND: 'Character not found',
  SCENE_NOT_FOUND: 'Scene not found',
  ACCESS_DENIED: 'Access denied - feature is disabled',
  QUERY_TIMEOUT: 'Query timeout',
  UNKNOWN_METHOD: 'Unknown method',
  BRIDGE_NOT_RUNNING: 'MCP Bridge is not running',
} as const;
