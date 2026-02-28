export { ready } from "./ready.js";
export { create } from "./create.js";
export { update } from "./update.js";
export { show } from "./show.js";
export { close } from "./close.js";
export { list } from "./list.js";
export { dep } from "./dep.js";
export { comments } from "./comments.js";
export { status } from "./status.js";
export { prime } from "./prime.js";

import { ready } from "./ready.js";
import { create } from "./create.js";
import { update } from "./update.js";
import { show } from "./show.js";
import { close } from "./close.js";
import { list } from "./list.js";
import { dep } from "./dep.js";
import { comments } from "./comments.js";
import { status } from "./status.js";
import { prime } from "./prime.js";

export const allTools = [ready, create, update, show, close, list, dep, comments, status, prime] as const;
