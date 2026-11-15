import pg from 'pg';

// Only the Node.js server connects to Supabase. Never expose DATABASE_URL in browser code.
export function createDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing from the server environment.');
  }
  // Temporary deployment diagnostic. Never log the full URL or password.
  try {
    const connection = new URL(process.env.DATABASE_URL);
    console.info('[DB DIAGNOSTIC]', {
      host: connection.hostname,
      port: connection.port || '(default)',
      username: decodeURIComponent(connection.username),
      passwordPresent: Boolean(connection.password),
      database: connection.pathname.replace(/^\\//, ''),
      protocol: connection.protocol
    });
  } catch {
    console.error('[DB DIAGNOSTIC] DATABASE_URL is not a valid URL');
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000
  });
  pool.on('error', error => console.error('PostgreSQL idle connection error:', error.message));

  function prepare(sql) {
    // These four tables are deliberately in Supabase's private app schema.
    const query = sql
      .replace(/\b(FROM|JOIN|INTO|UPDATE)\s+(users|auth_sessions|reviews|checkouts)\b/gi,
        (_match, operation, table) => `${operation} app.${table}`)
      .replace(/\?/g, (() => { let i = 0; return () => `$${++i}`; })());

    return {
      async get(...params) { return (await pool.query(query, params)).rows[0]; },
      async all(...params) { return (await pool.query(query, params)).rows; },
      async run(...params) { return (await pool.query(query, params)).rowCount; }
    };
  }

  return {
    prepare,
    ping: async () => { await pool.query('SELECT 1'); },
    close: async () => { await pool.end(); }
  };
}
