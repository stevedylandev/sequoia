import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadEnv } from "./env";
import type { Env } from "./env";
import { openDatabase } from "./lib/db";
import auth from "./routes/auth";
import subscribe from "./routes/subscribe";

const env = loadEnv();

const db = openDatabase(env.DATABASE_PATH);

type Variables = { env: Env; db: typeof db };

const app = new Hono<{ Variables: Variables }>();

// Inject env and db into all routes
app.use("*", async (c, next) => {
	c.set("env", env);
	c.set("db", db);
	await next();
});

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// OAuth routes
app.route("/oauth", auth);

// Subscribe routes with CORS
app.use(
	"/subscribe/*",
	cors({
		origin: (origin) => origin,
		credentials: true,
	}),
);
app.use(
	"/subscribe",
	cors({
		origin: (origin) => origin,
		credentials: true,
	}),
);
app.route("/subscribe", subscribe);

console.log(`Sequoia server listening on port ${env.PORT}`);

export default {
	port: env.PORT,
	fetch: app.fetch,
};
