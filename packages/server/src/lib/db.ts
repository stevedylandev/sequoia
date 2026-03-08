import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDatabase(path: string): Database {
	mkdirSync(dirname(path), { recursive: true });

	const db = new Database(path);
	db.run("PRAGMA journal_mode = WAL");
	db.run(`
		CREATE TABLE IF NOT EXISTS kv (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			expires_at INTEGER
		)
	`);
	return db;
}

export function kvGet(db: Database, key: string): string | undefined {
	const row = db
		.query<{ value: string; expires_at: number | null }, [string]>(
			"SELECT value, expires_at FROM kv WHERE key = ?",
		)
		.get(key);

	if (!row) return undefined;

	if (row.expires_at !== null && row.expires_at <= Date.now()) {
		db.run("DELETE FROM kv WHERE key = ?", [key]);
		return undefined;
	}

	return row.value;
}

export function kvSet(
	db: Database,
	key: string,
	value: string,
	ttlSeconds?: number,
): void {
	const expiresAt =
		ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : null;
	db.run(
		"INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)",
		[key, value, expiresAt],
	);
}

export function kvDel(db: Database, key: string): void {
	db.run("DELETE FROM kv WHERE key = ?", [key]);
}
