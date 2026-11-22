/**
 * Delete ALL data except superadmin accounts (and the platform system-settings document).
 *
 * Irreversible. Runs only when every guard passes:
 *   RESET_ALL_CONFIRM=1 node scripts/reset-except-superadmin.js \
 *     --execute --confirm-database <db-name> --backup <path-to-existing-backup-file>
 *
 * Without --execute it prints a dry run (counts only, no deletes).
 * Take the backup first, e.g.:
 *   mongodump --uri="$MONGO_URI" --archive=database/<name>.archive.gz --gzip
 */
import 'dotenv/config';
import fs from 'fs';
import mongoose from 'mongoose';

const KEEP_COLLECTIONS = new Set(['systemsettings']);
const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : ''; };
const execute = process.argv.includes('--execute');

const uri = process.env.MONGO_URI;
if (!uri) throw new Error('MONGO_URI is required.');
const dbName = new URL(uri).pathname.replace(/^\//, '').split('/')[0];

if (execute) {
  const backup = arg('--backup');
  if (process.env.RESET_ALL_CONFIRM !== '1') throw new Error('Set RESET_ALL_CONFIRM=1 to execute.');
  if (arg('--confirm-database') !== dbName) throw new Error(`--confirm-database must equal the target database name (${dbName}).`);
  if (!backup || !fs.existsSync(backup) || fs.statSync(backup).size === 0) throw new Error('--backup must point to an existing, non-empty backup file.');
}

await mongoose.connect(uri);
try {
  const db = mongoose.connection.db;
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
  console.log(`${execute ? 'RESET' : 'DRY RUN'} on database "${dbName}"`);
  for (const name of collections.sort()) {
    if (KEEP_COLLECTIONS.has(name)) { console.log(`  keep   ${name}`); continue; }
    const filter = name === 'users' ? { role: { $ne: 'superadmin' } } : {};
    const count = await db.collection(name).countDocuments(filter);
    if (execute && count) await db.collection(name).deleteMany(filter);
    console.log(`  ${execute ? 'delete' : 'would delete'} ${String(count).padStart(5)}  ${name}${name === 'users' ? ' (superadmins kept)' : ''}`);
  }
  const kept = await db.collection('users').countDocuments({ role: 'superadmin' });
  console.log(`Superadmin accounts kept: ${kept}`);
} finally {
  await mongoose.disconnect();
}
