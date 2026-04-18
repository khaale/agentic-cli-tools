export function pickFields(value, fields) {
  if (!fields || fields.length === 0) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => pickFields(item, fields));
  }

  if (value && typeof value === "object") {
    const next = {};
    for (const field of fields) {
      next[field] = value[field];
    }
    return next;
  }

  return value;
}
