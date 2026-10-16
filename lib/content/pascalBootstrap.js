import { nodeRegistry, registerNode } from '@pascal-app/core';
import { builtinPlugin } from '@pascal-app/nodes';

// Register the built-in node kinds before the first <Editor>/<Viewer> renders.
// The guard keeps this idempotent under HMR (registerNode throws on duplicates).
let loaded = false;

if (!loaded) {
  loaded = true;
  for (const def of builtinPlugin.nodes ?? []) {
    if (!nodeRegistry.has(def.kind)) registerNode(def);
  }
}
