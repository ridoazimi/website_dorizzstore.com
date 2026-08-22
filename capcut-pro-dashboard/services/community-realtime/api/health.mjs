import pg from "pg";

const { Pool } = pg;
const DATABASE_URL = process.env.COMMUNITY_DATABASE_URL || process.env.DATABASE_URL;

export default async function handler(_request, response) {
  if (!DATABASE_URL) {
    return response.status(503).json({ ok: false, database: false, error: "database_not_configured" });
  }

  const pool = new Pool({ connectionString: DATABASE_URL, max: 1, idleTimeoutMillis: 5_000 });
  try {
    await pool.query("SELECT 1");
    response.setHeader("cache-control", "no-store");
    return response.status(200).json({ ok: true, database: true });
  } catch {
    response.setHeader("cache-control", "no-store");
    return response.status(503).json({ ok: false, database: false });
  } finally {
    await pool.end().catch(() => {});
  }
}
