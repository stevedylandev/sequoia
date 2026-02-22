import { Hono } from "hono";
import auth from "./routes/auth";

type Bindings = {
	ASSETS: Fetcher;
	SEQUOIA_SESSIONS: KVNamespace;
	CLIENT_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.route("/oauth", auth);

app.get("/api/health", (c) => {
	return c.json({ status: "ok" });
});

app.all("*", (c) => {
	return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
