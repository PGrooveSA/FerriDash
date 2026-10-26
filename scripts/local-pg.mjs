// Local Postgres for development and tests, no install needed (PGlite = Postgres 17 in WebAssembly).
// Usage: node scripts/local-pg.mjs [port] [dataDir]
//   then set DATABASE_URL=postgres://postgres:postgres@127.0.0.1:<port>/postgres
// Data is kept in dataDir (default data/local-pg) between runs; delete the folder to start empty.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { mkdirSync } from "node:fs";

const port = Number(process.argv[2] || 54329);
const dir = process.argv[3] || "data/local-pg";
mkdirSync(dir, { recursive: true });
const db = await PGlite.create(dir);
// PGlite is single-connection; the server multiplexes several clients over it (fine for development).
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log(`Local Postgres (PGlite) on 127.0.0.1:${port}, data in ${dir}`);
console.log(`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
const stop = async () => { await server.stop(); await db.close(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
