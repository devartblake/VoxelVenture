import { nodeRegistry, registerNode } from '@pascal-app/core';
import { builtinPlugin } from '@pascal-app/nodes';

// Register the built-in node kinds before the first <Editor>/<Viewer> renders.
// The has() check keeps this idempotent under HMR, when the module runs again (registerNode throws on duplicates).
for (const def of builtinPlugin.nodes ?? []) {
  if (!nodeRegistry.has(def.kind)) registerNode(def);
}
