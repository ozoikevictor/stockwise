import { Pool } from 'pg';
export function connectDatabase(url: string) {
  return new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
}
