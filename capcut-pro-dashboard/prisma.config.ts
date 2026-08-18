// Prisma schema is split by domain so Member can be tracked without rewriting existing marketplace/Sales Creator models.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"] },
});
