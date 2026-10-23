import { listen } from "@colyseus/tools";
import { server } from "./app.config.ts";
import { resolvePort } from "./config.ts";

await listen(server, resolvePort(process.env));
