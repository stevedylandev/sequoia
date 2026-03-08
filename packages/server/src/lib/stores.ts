import { JoseKey } from "@atproto/jwk-jose";
import type {
	Key,
	InternalStateData,
	SessionStore,
	StateStore,
} from "@atproto/oauth-client";
import type { Database } from "bun:sqlite";
import { kvGet, kvSet, kvDel } from "./db";

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

export function createStateStore(db: Database, ttl = 600): StateStore {
	return {
		async set(key, { dpopKey, ...rest }) {
			const data: SerializedStateData = {
				...rest,
				dpopJwk: serializeKey(dpopKey),
			};
			kvSet(db, `oauth_state:${key}`, JSON.stringify(data), ttl);
		},
		async get(key) {
			const raw = kvGet(db, `oauth_state:${key}`);
			if (!raw) return undefined;
			const { dpopJwk, ...rest }: SerializedStateData = JSON.parse(raw);
			const dpopKey = await deserializeKey(dpopJwk);
			return { ...rest, dpopKey };
		},
		async del(key) {
			kvDel(db, `oauth_state:${key}`);
		},
	};
}

export function createSessionStore(
	db: Database,
	ttl = 60 * 60 * 24 * 14,
): SessionStore {
	return {
		async set(sub, { dpopKey, ...rest }) {
			const data: SerializedSession = {
				...rest,
				dpopJwk: serializeKey(dpopKey),
			};
			kvSet(db, `oauth_session:${sub}`, JSON.stringify(data), ttl);
		},
		async get(sub) {
			const raw = kvGet(db, `oauth_session:${sub}`);
			if (!raw) return undefined;
			const { dpopJwk, ...rest }: SerializedSession = JSON.parse(raw);
			const dpopKey = await deserializeKey(dpopJwk);
			return { ...rest, dpopKey };
		},
		async del(sub) {
			kvDel(db, `oauth_session:${sub}`);
		},
	};
}
