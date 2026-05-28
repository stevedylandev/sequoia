import { Hono } from "hono";
import { cors } from "hono/cors";
import auth from "./routes/auth";
import subscribe from "./routes/subscribe";
import recommend from "./routes/recommend";
import "./lib/path-redirect";

type Bindings = {
	ASSETS: Fetcher;
	SEQUOIA_SESSIONS: KVNamespace;
	CLIENT_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
	"/subscribe",
	cors({
		origin: (origin) => origin,
		credentials: true,
	}),
);
app.use(
	"/subscribe/*",
	cors({
		origin: (origin) => origin,
		credentials: true,
	}),
);

app.route("/oauth", auth);
app.route("/subscribe", subscribe);

app.use(
	"/recommend",
	cors({
		origin: (origin) => origin,
		credentials: true,
	}),
);
app.use(
	"/recommend/*",
	cors({
		origin: (origin) => origin,
		credentials: true,
	}),
);
app.route("/recommend", recommend);

app.get("/api/health", (c) => {
	return c.json({ status: "ok" });
});

app.all("*", (c) => {
	return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
