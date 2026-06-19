// Minimal JSON-Schema validator — zero dependencies, runnable under plain `node`.
// Supports exactly the keywords our schemas use (the same fail-closed spirit as
// the brain's hand-rolled validator). Returns an array of error strings; empty = valid.

const TYPE = {
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  string: (v) => typeof v === "string",
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  number: (v) => typeof v === "number",
  boolean: (v) => typeof v === "boolean",
  null: (v) => v === null,
};

export function validate(instance, schema, path = "$") {
  const errors = [];
  walk(instance, schema, path, errors);
  return errors;
}

function walk(inst, schema, path, errors) {
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => (TYPE[t] || (() => true))(inst))) {
      errors.push(`${path}: expected type ${schema.type}, got ${typeName(inst)}`);
      return; // dependent checks assume the type held
    }
  }
  if ("const" in schema && !deepEqual(inst, schema.const)) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((e) => deepEqual(e, inst))) {
    errors.push(`${path}: ${JSON.stringify(inst)} not in ${JSON.stringify(schema.enum)}`);
  }
  if (typeof inst === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(inst)) {
      errors.push(`${path}: ${JSON.stringify(inst)} does not match /${schema.pattern}/`);
    }
    if (schema.maxLength !== undefined && inst.length > schema.maxLength) {
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    }
    if (schema.minLength !== undefined && inst.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
  }
  if (typeof inst === "number") {
    if (schema.minimum !== undefined && inst < schema.minimum) {
      errors.push(`${path}: ${inst} below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && inst > schema.maximum) {
      errors.push(`${path}: ${inst} above maximum ${schema.maximum}`);
    }
  }
  if (TYPE.object(inst)) {
    for (const req of schema.required || []) {
      if (!(req in inst)) errors.push(`${path}: missing required field '${req}'`);
    }
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(inst)) {
        if (!(key in props)) errors.push(`${path}: unexpected property '${key}'`);
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in inst) walk(inst[key], sub, `${path}.${key}`, errors);
    }
  }
  if (Array.isArray(inst)) {
    if (schema.minItems !== undefined && inst.length < schema.minItems) {
      errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && inst.length > schema.maxItems) {
      errors.push(`${path}: more than maxItems ${schema.maxItems}`);
    }
    if (schema.uniqueItems) {
      const seen = [];
      for (const it of inst) {
        if (seen.some((s) => deepEqual(s, it))) { errors.push(`${path}: items must be unique`); break; }
        seen.push(it);
      }
    }
    if (schema.items && typeof schema.items === "object") {
      inst.forEach((it, i) => walk(it, schema.items, `${path}[${i}]`, errors));
    }
  }
}

function typeName(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
