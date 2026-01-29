#!/usr/bin/env bun

import { run, subcommands } from "cmd-ts";
import { authCommand } from "./commands/auth";
import { initCommand } from "./commands/init";
import { injectCommand } from "./commands/inject";
import { publishCommand } from "./commands/publish";
import { syncCommand } from "./commands/sync";

const app = subcommands({
	name: "sequoia",
	description: "Publish evergreen content to the ATmosphere",
	version: "0.1.0",
	cmds: {
		auth: authCommand,
		init: initCommand,
		inject: injectCommand,
		publish: publishCommand,
		sync: syncCommand,
	},
});

run(app, process.argv.slice(2));
