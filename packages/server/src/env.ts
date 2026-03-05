export interface Env {
	CLIENT_URL: string;
	CLIENT_NAME: string;
	PORT: number;
	REDIS_URL: string;
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
		REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
	};
}
