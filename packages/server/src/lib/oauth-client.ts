import { JoseKey } from "@atproto/jwk-jose";
import { OAuthClient } from "@atproto/oauth-client";
import { AtprotoDohHandleResolver } from "@atproto-labs/handle-resolver";
import type { Database } from "bun:sqlite";
import { createStateStore, createSessionStore } from "./stores";

export const OAUTH_SCOPE =
	"atproto repo:site.standard.graph.subscription?action=create&action=delete";

export function createOAuthClient(
	db: Database,
	clientUrl: string,
	clientName = "Sequoia",
) {
	const clientId = `${clientUrl}/oauth/client-metadata.json`;
	const redirectUri = `${clientUrl}/oauth/callback`;

	const dohEndpoint =
		process.env.DOH_ENDPOINT || "https://cloudflare-dns.com/dns-query";

	return new OAuthClient({
		responseMode: "query",
		handleResolver: new AtprotoDohHandleResolver({ dohEndpoint }),
		clientMetadata: {
			client_id: clientId,
			client_name: clientName,
			client_uri: clientUrl,
			redirect_uris: [redirectUri],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: OAUTH_SCOPE,
			token_endpoint_auth_method: "none",
			application_type: "web",
			dpop_bound_access_tokens: true,
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- @atproto Key class mismatch across packages
		runtimeImplementation: {
			createKey: (algs: string[]) => JoseKey.generate(algs) as any,
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
		stateStore: createStateStore(db),
		sessionStore: createSessionStore(db),
	});
}
