import { Hono } from "hono";

type Bindings = {
	ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/oauth/callback", (c) => {
	return c.text("Not Implemented", 501);
});

app.get("/api/health", (c) => {
	return c.json({ status: "ok" });
});

app.all("*", (c) => {
	return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
