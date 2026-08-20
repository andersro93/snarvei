/**
 * Minimal structured logger: one JSON line per event so Workers Logs can be
 * filtered by `event`, `rayId`, `userId`, etc. Never log secrets or links.
 */
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const serialise = (value: unknown): unknown => {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
};

const emit = (level: Level, event: string, fields: Fields) => {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, serialise(value)])),
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
};

export const log = {
  info: (event: string, fields: Fields = {}) => emit("info", event, fields),
  warn: (event: string, fields: Fields = {}) => emit("warn", event, fields),
  error: (event: string, fields: Fields = {}) => emit("error", event, fields),
};
