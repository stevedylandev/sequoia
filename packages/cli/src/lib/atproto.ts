import { AtpAgent } from "@atproto/api";
import * as path from "path";
import type { Credentials, BlogPost, BlobObject, PublisherConfig, PublicationRecord } from "./types";
import { generateTid } from "./tid";
import { stripMarkdownForText } from "./markdown";

export async function resolveHandleToPDS(handle: string): Promise<string> {
  // First, resolve the handle to a DID
  let did: string;

  if (handle.startsWith("did:")) {
    did = handle;
  } else {
    // Try to resolve handle via Bluesky API
    const resolveUrl = `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
    const resolveResponse = await fetch(resolveUrl);
    if (!resolveResponse.ok) {
      throw new Error("Could not resolve handle");
    }
    const resolveData = (await resolveResponse.json()) as { did: string };
    did = resolveData.did;
  }

  // Now resolve the DID to get the PDS URL from the DID document
  let pdsUrl: string | undefined;

  if (did.startsWith("did:plc:")) {
    // Fetch DID document from plc.directory
    const didDocUrl = `https://plc.directory/${did}`;
    const didDocResponse = await fetch(didDocUrl);
    if (!didDocResponse.ok) {
      throw new Error("Could not fetch DID document");
    }
    const didDoc = (await didDocResponse.json()) as {
      service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
    };

    // Find the PDS service endpoint
    const pdsService = didDoc.service?.find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    pdsUrl = pdsService?.serviceEndpoint;
  } else if (did.startsWith("did:web:")) {
    // For did:web, fetch the DID document from the domain
    const domain = did.replace("did:web:", "");
    const didDocUrl = `https://${domain}/.well-known/did.json`;
    const didDocResponse = await fetch(didDocUrl);
    if (!didDocResponse.ok) {
      throw new Error("Could not fetch DID document");
    }
    const didDoc = (await didDocResponse.json()) as {
      service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
    };

    const pdsService = didDoc.service?.find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    pdsUrl = pdsService?.serviceEndpoint;
  }

  if (!pdsUrl) {
    throw new Error("Could not find PDS URL for user");
  }

  return pdsUrl;
}

export interface CreatePublicationOptions {
  url: string;
  name: string;
  description?: string;
  iconPath?: string;
  showInDiscover?: boolean;
}

export async function createAgent(credentials: Credentials): Promise<AtpAgent> {
  const agent = new AtpAgent({ service: credentials.pdsUrl });

  await agent.login({
    identifier: credentials.identifier,
    password: credentials.password,
  });

  return agent;
}

export async function uploadImage(
  agent: AtpAgent,
  imagePath: string
): Promise<BlobObject | undefined> {
  const file = Bun.file(imagePath);

  if (!(await file.exists())) {
    return undefined;
  }

  try {
    const imageBuffer = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";

    const response = await agent.com.atproto.repo.uploadBlob(
      new Uint8Array(imageBuffer),
      {
        encoding: mimeType,
      }
    );

    return {
      $type: "blob",
      ref: {
        $link: response.data.blob.ref.toString(),
      },
      mimeType,
      size: imageBuffer.byteLength,
    };
  } catch (error) {
    console.error(`Error uploading image ${imagePath}:`, error);
    return undefined;
  }
}

export function resolveImagePath(
  ogImage: string,
  imagesDir: string | undefined,
  contentDir: string
): string | null {
  // Try multiple resolution strategies
  const filename = path.basename(ogImage);

  // 1. If imagesDir is specified, look there
  if (imagesDir) {
    const imagePath = path.join(imagesDir, filename);
    try {
      const stat = Bun.file(imagePath);
      if (stat.size > 0) {
        return imagePath;
      }
    } catch {
      // File doesn't exist, continue
    }
  }

  // 2. Try the ogImage path directly (if it's absolute)
  if (path.isAbsolute(ogImage)) {
    return ogImage;
  }

  // 3. Try relative to content directory
  const contentRelative = path.join(contentDir, ogImage);
  try {
    const stat = Bun.file(contentRelative);
    if (stat.size > 0) {
      return contentRelative;
    }
  } catch {
    // File doesn't exist
  }

  return null;
}

export async function createDocument(
  agent: AtpAgent,
  post: BlogPost,
  config: PublisherConfig,
  coverImage?: BlobObject
): Promise<string> {
  const pathPrefix = config.pathPrefix || "/posts";
  const postPath = `${pathPrefix}/${post.slug}`;
  const textContent = stripMarkdownForText(post.content);
  const publishDate = new Date(post.frontmatter.publishDate);

  const record: Record<string, unknown> = {
    $type: "site.standard.document",
    title: post.frontmatter.title,
    site: config.publicationUri,
    path: postPath,
    textContent: textContent.slice(0, 10000),
    publishedAt: publishDate.toISOString(),
    canonicalUrl: `${config.siteUrl}${postPath}`,
  };

  if (coverImage) {
    record.coverImage = coverImage;
  }

  if (config.location) {
    record.location = config.location;
  }

  const rkey = generateTid();

  const response = await agent.com.atproto.repo.createRecord({
    repo: agent.session!.did,
    collection: "site.standard.document",
    rkey,
    record,
  });

  return response.data.uri;
}

export async function updateDocument(
  agent: AtpAgent,
  post: BlogPost,
  atUri: string,
  config: PublisherConfig,
  coverImage?: BlobObject
): Promise<void> {
  // Parse the atUri to get the collection and rkey
  // Format: at://did:plc:xxx/collection/rkey
  const uriMatch = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!uriMatch) {
    throw new Error(`Invalid atUri format: ${atUri}`);
  }

  const [, , collection, rkey] = uriMatch;

  const pathPrefix = config.pathPrefix || "/posts";
  const postPath = `${pathPrefix}/${post.slug}`;
  const textContent = stripMarkdownForText(post.content);
  const publishDate = new Date(post.frontmatter.publishDate);

  const record: Record<string, unknown> = {
    $type: "site.standard.document",
    title: post.frontmatter.title,
    site: config.publicationUri,
    path: postPath,
    textContent: textContent.slice(0, 10000),
    publishedAt: publishDate.toISOString(),
    canonicalUrl: `${config.siteUrl}${postPath}`,
  };

  if (coverImage) {
    record.coverImage = coverImage;
  }

  if (config.location) {
    record.location = config.location;
  }

  await agent.com.atproto.repo.putRecord({
    repo: agent.session!.did,
    collection: collection!,
    rkey: rkey!,
    record,
  });
}

export function parseAtUri(atUri: string): { did: string; collection: string; rkey: string } | null {
  const match = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    did: match[1]!,
    collection: match[2]!,
    rkey: match[3]!,
  };
}

export interface DocumentRecord {
  $type: "site.standard.document";
  title: string;
  site: string;
  path: string;
  textContent: string;
  publishedAt: string;
  canonicalUrl?: string;
  coverImage?: BlobObject;
  location?: string;
}

export interface ListDocumentsResult {
  uri: string;
  cid: string;
  value: DocumentRecord;
}

export async function listDocuments(
  agent: AtpAgent,
  publicationUri?: string
): Promise<ListDocumentsResult[]> {
  const documents: ListDocumentsResult[] = [];
  let cursor: string | undefined;

  do {
    const response = await agent.com.atproto.repo.listRecords({
      repo: agent.session!.did,
      collection: "site.standard.document",
      limit: 100,
      cursor,
    });

    for (const record of response.data.records) {
      const value = record.value as unknown as DocumentRecord;

      // If publicationUri is specified, only include documents from that publication
      if (publicationUri && value.site !== publicationUri) {
        continue;
      }

      documents.push({
        uri: record.uri,
        cid: record.cid,
        value,
      });
    }

    cursor = response.data.cursor;
  } while (cursor);

  return documents;
}

export async function createPublication(
  agent: AtpAgent,
  options: CreatePublicationOptions
): Promise<string> {
  let icon: BlobObject | undefined;

  if (options.iconPath) {
    icon = await uploadImage(agent, options.iconPath);
  }

  const record: Record<string, unknown> = {
    $type: "site.standard.publication",
    url: options.url,
    name: options.name,
    createdAt: new Date().toISOString(),
  };

  if (options.description) {
    record.description = options.description;
  }

  if (icon) {
    record.icon = icon;
  }

  if (options.showInDiscover !== undefined) {
    record.preferences = {
      showInDiscover: options.showInDiscover,
    };
  }

  const rkey = generateTid();

  const response = await agent.com.atproto.repo.createRecord({
    repo: agent.session!.did,
    collection: "site.standard.publication",
    rkey,
    record,
  });

  return response.data.uri;
}
