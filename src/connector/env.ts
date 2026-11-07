/* What the connector is built with: the public configuration (no secrets), the documents it hands Claude, and the app's
   own engine code (docs/CLAUDE_CONNECTOR.md). tools/connector_bundle.mjs writes the first two into the bundle. */
import type { EngineApi } from './engine/api.ts';

export interface LibrarySubject {
  id: string;
  title?: string;
  kind?: string;
  counts?: { chapters?: number; exercises?: number } | null;
  version?: string | null;
  bridgeLocales?: Record<string, { coverage?: number; status?: string; path?: string }>;
}
export interface LibraryLanguage {
  id: string;
  title?: string;
  languages?: string[];
  path: string;
  profiles?: string | null;
}

export interface ConnectorConfig {
  siteUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  /** = engine/cloud.js chunkBytes: big files are stored in parts (tests use a small one) */
  storageChunkBytes?: number;
  library?: LibrarySubject[];
  languages?: LibraryLanguage[];
}

export interface PipelineStep {
  title?: string;
  what?: string;
  gate?: string;
  per?: boolean;
  deferrable?: boolean;
  doc?: string;
  check?: { local?: unknown; run?: unknown; mcp?: string; manual?: string };
}
export interface PipelineFlow {
  id: string;
  title: string;
  when: string;
  steps: string[];
}

export interface ConnectorDocs {
  workflow?: string;
  content?: string;
  visual?: string;
  interactive?: string;
  bridge?: string;
  pipelines?: string;
  languages?: string;
  pipelineSteps?: Record<string, PipelineStep>;
  pipelineFlows?: Record<string, PipelineFlow>;
}

export interface ConnectorData {
  config: ConnectorConfig;
  docs: ConnectorDocs;
}

export interface ConnectorEnv extends ConnectorData {
  engine: EngineApi;
  /** the network (tests replace it); defaults to the runtime's fetch */
  fetch: typeof fetch;
}

export const trimSlash = (u: string): string => u.replace(/\/+$/, '');
export const siteFile = (cfg: ConnectorConfig, rel: string): string => trimSlash(cfg.siteUrl) + '/' + rel.replace(/^\//, '');
