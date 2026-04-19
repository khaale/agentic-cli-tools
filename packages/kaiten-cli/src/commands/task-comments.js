import { fail } from "../lib/errors.js";
import { logDebug } from "../lib/debug.js";
import { summarizeComment } from "../lib/schemas.js";

export async function getTaskComments(client, options) {
  if (!options.task) {
    fail("task-comments get requires --task <id>", 2);
  }

  logDebug(options.verbose, `task-comments get: fetching comments for task ${options.task}`);
  
  const comments = await client.requestJson(client.cardCommentsPath(options.task), {
    refresh: options.refresh,
    verbose: options.verbose,
    scope: { resource: "card-comments", task: options.task }
  });

  const normalized = (Array.isArray(comments) ? comments : [])
    .map(summarizeComment);

  return {
    kind: "list",
    data: normalized
  };
}
