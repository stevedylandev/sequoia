import { JoseKey } from "@atproto/jwk-jose";
import { OAuthClient } from "@atproto/oauth-client";
import { AtprotoDohHandleResolver } from "@atproto-labs/handle-resolver";
import { createStateStore, createSessionStore } from "./kv-stores";

export function createOAuthClient(kv: KVNamespace, clientUrl: string) {
	const clientId = `${clientUrl}/oauth/client-metadata.json`;
	const redirectUri = `${clientUrl}/oauth/callback`;

	return new OAuthClient({
		responseMode: "query",
		handleResolver: new AtprotoDohHandleResolver({
			dohEndpoint: "https://cloudflare-dns.com/dns-query",
		}),
		clientMetadata: {
			client_id: clientId,
			client_name: "Sequoia",
			client_uri: clientUrl,
			redirect_uris: [redirectUri],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: "atproto transition:generic",
			token_endpoint_auth_method: "none",
			application_type: "web",
			dpop_bound_access_tokens: true,
		},
		runtimeImplementation: {
			createKey: (algs: string[]) => JoseKey.generate(algs),
			getRandomValues: (length: number) =>
				crypto.getRandomValues(new Uint8Array(length)),
			digest: async (data: Uint8Array, { name }: { name: string }) => {
				const buf = await crypto.subtle.digest(
					name.replace("sha", "SHA-"),
					new Uint8Array(data),
				);
				return new Uint8Array(buf);
			},
			requestLock: <T>(_name: string, fn: () => T | PromiseLike<T>) => fn(),
		},
		stateStore: createStateStore(kv),
		sessionStore: createSessionStore(kv),
	});
}
