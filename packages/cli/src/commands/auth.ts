import { command, flag, option, optional, string } from "cmd-ts";
import { consola } from "consola";
import { AtpAgent } from "@atproto/api";
import {
  saveCredentials,
  deleteCredentials,
  listCredentials,
  getCredentials,
  getCredentialsPath,
} from "../lib/credentials";
import { resolveHandleToPDS } from "../lib/atproto";

export const authCommand = command({
  name: "auth",
  description: "Authenticate with your ATProto PDS",
  args: {
    logout: option({
      long: "logout",
      description: "Remove credentials for a specific identity (or all if only one exists)",
      type: optional(string),
    }),
    list: flag({
      long: "list",
      description: "List all stored identities",
    }),
  },
  handler: async ({ logout, list }) => {
    // List identities
    if (list) {
      const identities = await listCredentials();
      if (identities.length === 0) {
        consola.info("No stored identities");
      } else {
        consola.info("Stored identities:");
        for (const id of identities) {
          console.log(`  - ${id}`);
        }
      }
      return;
    }

    // Logout
    if (logout !== undefined) {
      // If --logout was passed without a value, it will be an empty string
      const identifier = logout || undefined;

      if (!identifier) {
        // No identifier provided - show available and prompt
        const identities = await listCredentials();
        if (identities.length === 0) {
          consola.info("No saved credentials found");
          return;
        }
        if (identities.length === 1) {
          const deleted = await deleteCredentials(identities[0]);
          if (deleted) {
            consola.success(`Removed credentials for ${identities[0]}`);
          }
          return;
        }
        // Multiple identities - prompt
        const selected = await consola.prompt("Select identity to remove:", {
          type: "select",
          options: identities,
        });
        const deleted = await deleteCredentials(selected as string);
        if (deleted) {
          consola.success(`Removed credentials for ${selected}`);
        }
        return;
      }

      const deleted = await deleteCredentials(identifier);
      if (deleted) {
        consola.success(`Removed credentials for ${identifier}`);
      } else {
        consola.info(`No credentials found for ${identifier}`);
      }
      return;
    }

    consola.box(
      "To authenticate, you'll need an App Password.\n\n" +
        "Create one at: https://bsky.app/settings/app-passwords\n\n" +
        "App Passwords are safer than your main password and can be revoked."
    );

    const identifier = await consola.prompt("Handle or DID:", {
      type: "text",
      placeholder: "yourhandle.bsky.social",
    });

    const password = await consola.prompt("App Password:", {
      type: "text",
      placeholder: "xxxx-xxxx-xxxx-xxxx",
    });

    if (!identifier || !password) {
      consola.error("Handle and password are required");
      process.exit(1);
    }

    // Check if this identity already exists
    const existing = await getCredentials(identifier as string);
    if (existing) {
      const overwrite = await consola.prompt(
        `Credentials for ${identifier} already exist. Update?`,
        {
          type: "confirm",
          initial: false,
        }
      );
      if (!overwrite) {
        consola.info("Keeping existing credentials");
        return;
      }
    }

    // Resolve PDS from handle
    consola.start("Resolving PDS...");
    let pdsUrl: string;
    try {
      pdsUrl = await resolveHandleToPDS(identifier as string);
      consola.success(`Found PDS: ${pdsUrl}`);
    } catch (error) {
      consola.error("Failed to resolve PDS from handle:", error);
      process.exit(1);
    }

    // Verify credentials
    consola.start("Verifying credentials...");

    try {
      const agent = new AtpAgent({ service: pdsUrl });
      await agent.login({
        identifier: identifier as string,
        password: password as string,
      });

      consola.success(`Logged in as ${agent.session?.handle}`);

      // Save credentials
      await saveCredentials({
        pdsUrl,
        identifier: identifier as string,
        password: password as string,
      });

      consola.success(`Credentials saved to ${getCredentialsPath()}`);
    } catch (error) {
      consola.error("Failed to login:", error);
      process.exit(1);
    }
  },
});
