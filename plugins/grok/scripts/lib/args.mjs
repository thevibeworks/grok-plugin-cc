const QUOTES = new Set(['"', "'"]);

export function splitRawArgumentString(raw) {
  const tokens = [];
  let current = "";
  let quote = null;
  let hasToken = false;

  for (const char of String(raw ?? "")) {
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (QUOTES.has(char)) {
      quote = char;
      hasToken = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }

  if (quote) {
    throw new Error(`Unbalanced ${quote} quote in arguments.`);
  }
  if (hasToken) {
    tokens.push(current);
  }
  return tokens;
}

export function parseArgs(argv, config = {}) {
  const valueOptions = new Set(config.valueOptions ?? []);
  const booleanOptions = new Set(config.booleanOptions ?? []);
  const aliasMap = config.aliasMap ?? {};
  const options = {};
  const positionals = [];

  const resolveName = (name) => aliasMap[name] ?? name;

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index]);

    if (token === "--") {
      positionals.push(...argv.slice(index + 1).map(String));
      break;
    }

    if (!token.startsWith("-") || token === "-") {
      positionals.push(token);
      continue;
    }

    const isLong = token.startsWith("--");
    const body = isLong ? token.slice(2) : token.slice(1);
    const equalsIndex = body.indexOf("=");
    const rawName = equalsIndex === -1 ? body : body.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? null : body.slice(equalsIndex + 1);
    const name = resolveName(rawName);

    if (booleanOptions.has(name)) {
      if (inlineValue != null) {
        throw new Error(`Flag --${name} does not take a value.`);
      }
      options[name] = true;
      continue;
    }

    if (valueOptions.has(name)) {
      if (inlineValue != null) {
        options[name] = inlineValue;
        continue;
      }
      const next = argv[index + 1];
      if (next == null) {
        throw new Error(`Flag --${name} requires a value.`);
      }
      options[name] = String(next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown flag: ${token}`);
  }

  return { options, positionals };
}
