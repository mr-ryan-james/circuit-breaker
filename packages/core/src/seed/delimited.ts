export interface DelimitedTable {
  headers: string[];
  rows: string[][];
}

function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

export function parseDelimited(input: string, delimiter: string): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushRow = (): void => {
    const trimmed = row.map((c) => c.trim());
    const allEmpty = trimmed.every((c) => c.length === 0);
    if (!allEmpty) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (ch === "\n" || ch === "\r") {
      row.push(field);
      field = "";

      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      i += 1;
      pushRow();
      continue;
    }

    field += ch;
    i += 1;
  }

  // Final field/row.
  row.push(field);
  const trimmed = row.map((c) => c.trim());
  const allEmpty = trimmed.every((c) => c.length === 0);
  if (!allEmpty) rows.push(row);

  return rows;
}

export function parseDelimitedWithHeader(input: string, delimiter: string): DelimitedTable {
  const rows = parseDelimited(input, delimiter);
  if (rows.length === 0) throw new Error("No rows found");

  const headers = rows[0]!.map((h) => h.trim()).filter(Boolean);
  if (headers.length === 0) throw new Error("Header row is empty");

  const body = rows.slice(1);
  return { headers, rows: body };
}

