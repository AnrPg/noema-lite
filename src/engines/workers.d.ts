/* "noema-worker:<module>#<export>": the Worker bundle of an engine as text (tools/esbuild_engines.mjs builds it: the module and what
   it imports, as one script that sets self.noemaEngine to that export). */
declare module 'noema-worker:*' {
  const source: string;
  export default source;
}
