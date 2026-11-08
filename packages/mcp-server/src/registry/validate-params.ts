/**
 * A small JSON-schema check for the `params` of a domain-tool action: required properties,
 * primitive types, enums and the item type of arrays. It exists because `params` is open in the
 * schema a client sees (ADR-0004), so nothing else would catch a missing or mistyped argument
 * before it reaches the bridge. It deliberately does not reject unknown properties; the
 * operations validate their own input in depth.
 */

type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: unknown[];
  items?: Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  nullable?: boolean;
};

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

function check(schema: Schema, value: unknown, path: string, errors: string[]): void {
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives) {
    const scratch = alternatives.map(alt => {
      const found: string[] = [];
      check(alt, value, path, found);
      return found;
    });
    if (!scratch.some(found => found.length === 0)) {
      errors.push(`${path} matches none of the allowed forms`);
    }
    return;
  }

  const types =
    schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some(t => typeMatches(t, value))) {
    errors.push(`${path} must be ${types.join(' or ')}, got ${describeValue(value)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`);
    return;
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) =>
      check(schema.items as Schema, item, `${path}[${index}]`, errors)
    );
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
    for (const key of schema.required ?? []) {
      if ((value as Record<string, unknown>)[key] === undefined) {
        errors.push(`${path}.${key} is required`);
      }
    }
    for (const [key, sub] of Object.entries(schema.properties)) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) check(sub, child, `${path}.${key}`, errors);
    }
  }
}

/** Problems with `params` against an action's schema; empty if it is acceptable. */
export function validateAgainstSchema(schema: object, params: unknown): string[] {
  const errors: string[] = [];
  const root: Schema = { ...(schema as Schema), type: 'object' };
  check(root, params, 'params', errors);
  return errors.map(error => error.replace(/^params\./, '').replace(/^params /, 'params '));
}
