/* Modules tools/connector_bundle.mjs provides at bundle time. */
declare module 'legacy:*' {
  /** the text of one of the app's script files (engine/…), run by src/connector/engine/legacy.ts */
  const text: string;
  export default text;
}
declare module 'virtual:noema-connector-data' {
  import type { ConnectorData } from './env.ts';
  /** the public configuration and the documents (tools/build.py → tools/connector_bundle.mjs) */
  const data: ConnectorData;
  export default data;
}
