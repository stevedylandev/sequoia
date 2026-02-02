#!/usr/bin/env node

import { run, subcommands } from "cmd-ts";
import { authCommand } from "./commands/auth";
import { initCommand } from "./commands/init";
import { injectCommand } from "./commands/inject";
import { loginCommand } from "./commands/login";
import { publishCommand } from "./commands/publish";
import { syncCommand } from "./commands/sync";

const app = subcommands({
	name: "sequoia",
	description: `

                 .*##*###:
               :**:     :**:
              :#:         :#:
              #=           =#
              #=           -#
             +#-           -#+
            **:      #.     .**
            #=   +#-:#.      =#
           :#:    .*##.  :   :*-
            #=      -#+*#-   =#
            **:      ##=    .**
             +#=     #.    -#+
               +**   #.  *#*
                     #.
                     #.
                     #.
                 :**###**:

Publish evergreen content to the ATmosphere

> https://tangled.org/stevedylan.dev/sequoia
	`,
	version: "0.2.1",
	cmds: {
		auth: authCommand,
		init: initCommand,
		inject: injectCommand,
		login: loginCommand,
		publish: publishCommand,
		sync: syncCommand,
	},
});

run(app, process.argv.slice(2));
