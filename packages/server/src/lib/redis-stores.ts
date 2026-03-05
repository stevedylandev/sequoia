import { JoseKey } from "@atproto/jwk-jose";
import type {
	Key,
	InternalStateData,
	SessionStore,
	StateStore,
} from "@atproto/oauth-client";
import { RedisClient } from "bun";

type SerializedStateData = Omit<InternalStateData, "dpopKey"> & {
	dpopJwk: Record<string, unknown>;
};

type SerializedSession = Omit<Parameters<SessionStore["set"]>[1], "dpopKey"> & {
	dpopJwk: Record<string, unknown>;
};

function serializeKey(key: Key): Record<string, unknown> {
	const jwk = key.privateJwk;
	if (!jwk) throw new Error("Private DPoP JWK is missing");
	return jwk as Record<string, unknown>;
}

async function deserializeKey(jwk: Record<string, unknown>): Promise<Key> {
	return JoseKey.fromJWK(jwk) as unknown as Key;
}

export function createStateStore(redis: RedisClient, ttl = 600): StateStore {
	return {
		async set(key, { dpopKey, ...rest }) {
			const data: SerializedStateData = {
				...rest,
				dpopJwk: serializeKey(dpopKey),
			};
			const redisKey = `oauth_state:${key}`;
			await redis.set(redisKey, JSON.stringify(data));
			await redis.expire(redisKey, ttl);
		},
		async get(key) {
			const raw = await redis.get(`oauth_state:${key}`);
			if (!raw) return undefined;
			const { dpopJwk, ...rest }: SerializedStateData = JSON.parse(raw);
			const dpopKey = await deserializeKey(dpopJwk);
			return { ...rest, dpopKey };
		},
		async del(key) {
			await redis.del(`oauth_state:${key}`);
		},
	};
}

export function createSessionStore(
	redis: RedisClient,
	ttl = 60 * 60 * 24 * 14,
): SessionStore {
	return {
		async set(sub, { dpopKey, ...rest }) {
			const data: SerializedSession = {
				...rest,
				dpopJwk: serializeKey(dpopKey),
			};
			const redisKey = `oauth_session:${sub}`;
			await redis.set(redisKey, JSON.stringify(data));
			await redis.expire(redisKey, ttl);
		},
		async get(sub) {
			const raw = await redis.get(`oauth_session:${sub}`);
			if (!raw) return undefined;
			const { dpopJwk, ...rest }: SerializedSession = JSON.parse(raw);
			const dpopKey = await deserializeKey(dpopJwk);
			return { ...rest, dpopKey };
		},
		async del(sub) {
			await redis.del(`oauth_session:${sub}`);
		},
	};
}
