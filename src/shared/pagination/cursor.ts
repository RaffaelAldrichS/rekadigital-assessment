export function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): unknown {
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  return JSON.parse(decoded);
}
