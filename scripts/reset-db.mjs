// Deletes the local demo database. The app rebuilds it with fresh demo data on the next page load.
import { rmSync } from "node:fs";
for (const f of ["rangeday.db", "rangeday.db-journal", "rangeday.db-wal", "rangeday.db-shm"]) rmSync(f, { force: true });
console.log("Local demo database removed. Reload the app to get fresh demo data.");
