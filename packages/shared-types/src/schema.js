// A small validator for the JSON-Schema subset the contracts use (docs/architecture/adr/0001-shared-package-boundaries.md):
// type (one or a list: string, number, integer, boolean, object, array, null), enum, pattern, minLength, maxLength, minimum, maximum,
// required, properties, additionalProperties (false: no other keys), items, prefixItems (a fixed-position array, a "tuple": the schema of
// each position in turn), minItems, maxItems, and anyOf (one of several schemas). Plain JSON, so other languages (the Python messaging
// service) can read the same contracts with a standard JSON-Schema library (prefixItems and anyOf are JSON Schema 2020-12).

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const fits = (v, t) => (t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === typeOf(v)); // NaN and Infinity are not JSON numbers

// Every problem with `value` against `schema`, as ["path: what is wrong"]. Empty when it fits.
export function validate(schema, value, at = '$') {
  if (schema.anyOf) {
    const each = schema.anyOf.map((s) => validate(s, value, at));
    if (!each.some((e) => e.length === 0)) return [`${at}: fits none of ${schema.anyOf.length} allowed shapes (${each.map((e) => e[0]).join('; ')})`];
  }
  const errors = [];
  const types = schema.type == null ? null : [].concat(schema.type);
  if (types && !types.some((t) => fits(value, t))) return [`${at}: expected ${types.join(' or ')}, got ${typeOf(value)}`];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
    if (schema.minLength != null && [...value].length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength}`);
    if (schema.maxLength != null && [...value].length > schema.maxLength) errors.push(`${at}: longer than ${schema.maxLength}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${at}: above ${schema.maximum}`);
  }
  if (typeOf(value) === 'object') {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${at}.${k}: missing`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in value) errors.push(...validate(sub, value[k], `${at}.${k}`));
    if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!(k in (schema.properties ?? {}))) errors.push(`${at}.${k}: not allowed`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.prefixItems) schema.prefixItems.forEach((s, i) => i < value.length && errors.push(...validate(s, value[i], `${at}[${i}]`)));
    if (schema.items) value.forEach((v, i) => i >= (schema.prefixItems?.length ?? 0) && errors.push(...validate(schema.items, v, `${at}[${i}]`)));
  }
  return errors;
}

// Checks `value` against a contract ({ id, version, schema }): { ok, errors }.
export const check = (contract, value) => {
  const errors = validate(contract.schema, value);
  return { ok: errors.length === 0, errors };
};
