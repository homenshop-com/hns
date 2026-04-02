#!/usr/bin/env node
// Helper script: reads SQL from stdin, queries SQLite DB, outputs JSON to stdout
const Database = require('better-sqlite3');
const fs = require('fs');

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('[]');
  process.exit(0);
}

// Read SQL from stdin
let sql = '';
try {
  sql = fs.readFileSync(0, 'utf-8').trim();
} catch {
  console.log('[]');
  process.exit(0);
}

if (!sql) {
  console.log('[]');
  process.exit(0);
}

try {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare(sql).all();
  console.log(JSON.stringify(rows));
  db.close();
} catch (e) {
  console.log('[]');
}
