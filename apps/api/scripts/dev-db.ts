// Local dev database: downloads and runs a real Postgres, no system install
// needed. Data persists in apps/api/.pgdata between runs. Dev only — production
// uses a managed DATABASE_URL (see DEPLOY.md).
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

const PORT = 5432;

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: "./.pgdata",
    user: "postgres",
    password: "zitie-dev",
    port: PORT,
    persistent: true,
  });

  try {
    await pg.initialise();
  } catch {
    // already initialised on a previous run
  }
  await pg.start();

  // Create the app database with UTF8 explicitly — on Windows the cluster
  // initializes with the system locale (WIN1252), which cannot store hanzi.
  const admin = postgres(`postgres://postgres:zitie-dev@localhost:${PORT}/postgres`, { max: 1 });
  const exists = await admin`SELECT 1 FROM pg_database WHERE datname = 'zitie'`;
  if (!exists.length) {
    await admin.unsafe(`CREATE DATABASE zitie ENCODING 'UTF8' TEMPLATE template0`);
  }
  await admin.end();

  console.log(`dev postgres running on port ${PORT}`);
  console.log(`DATABASE_URL=postgres://postgres:zitie-dev@localhost:${PORT}/zitie`);
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
