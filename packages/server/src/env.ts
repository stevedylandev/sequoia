export interface Env {
	CLIENT_URL: string;
	CLIENT_NAME: string;
	PORT: number;
	DATABASE_PATH: string;
}

export function loadEnv(): Env {
	const CLIENT_URL = process.env.CLIENT_URL;
	if (!CLIENT_URL) {
		throw new Error("CLIENT_URL environment variable is required");
	}

	return {
		CLIENT_URL: CLIENT_URL.replace(/\/+$/, ""),
		CLIENT_NAME: process.env.CLIENT_NAME || "Sequoia",
		PORT: Number(process.env.PORT) || 3000,
		DATABASE_PATH: process.env.DATABASE_PATH || "./data/sequoia.db",
	};
}
