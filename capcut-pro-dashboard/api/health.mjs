import pg from "pg";

const { Pool } = pg;

export default async function handler(_req, res) {
  const connectionString = process.env.COMMUNITY_DATABASE_URL;
  if (!connectionString) {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ ok: false, database: false, error: "COMMUNITY_DATABASE_URL missing" }));
    return;
  }

  const pool = new Pool({ connectionString, max: 1, idleTimeoutMillis: 5_000 });
  try {
    await pool.query("SELECT 1");
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ ok: true, database: true }));
  } catch {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ ok: false, database: false }));
  } finally {
    await pool.end().catch(() => {});
  }
}
