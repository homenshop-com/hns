#!/usr/bin/env python3
"""Helper: reads SQL from stdin, queries SQLite DB, outputs JSON to stdout."""
import sqlite3, json, sys

if len(sys.argv) < 2:
    print("[]")
    sys.exit(0)

db_path = sys.argv[1]
sql = sys.stdin.read().strip()
if not sql:
    print("[]")
    sys.exit(0)

try:
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    cursor = db.cursor()
    cursor.execute(sql)
    rows = [dict(r) for r in cursor.fetchall()]
    print(json.dumps(rows, ensure_ascii=False))
    db.close()
except Exception:
    print("[]")
