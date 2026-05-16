// src/utils/schemaUtils.js
// Utilities to inspect schema depth and key counts

export const countSchemaKeys = (schema) => {
  if (!schema || typeof schema !== 'object') return 0;
  let count = 0;

  const walk = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    Object.entries(node).forEach(([k, v]) => {
      count += 1;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v);
    });
  };

  walk(schema);
  return count;
};

export const schemaDepth = (schema) => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 0;

  const depths = [];

  const walk = (node, depth) => {
    depths.push(depth);
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    Object.values(node).forEach((v) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        walk(v, depth + 1);
      }
    });
  };

  walk(schema, 1);
  return Math.max(...depths, 0);
};

export default { countSchemaKeys, schemaDepth };
