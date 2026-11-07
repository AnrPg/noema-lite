/**
 * THE CONNECTOR ROOT (the MCP server of the Claude connector, docs/CLAUDE_CONNECTOR.md). Phase 1 creates it empty: the
 * connector's own adapters and tools are registered here by their area (CONNECTOR_REGISTRATIONS), with the same
 * container and the same rules as the other roots. It never touches a DOM, a Worker or window.NoemaCore.
 */
import { Container, type Registration } from './container.ts';

/** The connector's registrations, in order (its area appends here). */
export const CONNECTOR_REGISTRATIONS: readonly Registration[] = [];

/** Builds the connector's root: its registrations (then the extra ones of a test), frozen. */
export function createConnectorContainer(extra: readonly Registration[] = []): Container {
  const c = new Container();
  for (const register of [...CONNECTOR_REGISTRATIONS, ...extra]) register(c);
  return c.freeze();
}
