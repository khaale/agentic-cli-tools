import test from "node:test";
import assert from "node:assert/strict";
import { getTaskComments } from "../src/commands/task-comments.js";

function createClient(fixtures) {
  const calls = [];

  return {
    calls,
    cardCommentsPath: (cardId) => `/api/latest/cards/${cardId}/comments`,
    requestJson: async (path, options = {}) => {
      calls.push(path);

      if (path in fixtures) {
        return fixtures[path];
      }

      throw new Error(`unexpected path: ${path}`);
    }
  };
}

test("task-comments get returns normalized comments", async () => {
  const client = createClient({
    "/api/latest/cards/9001/comments": [
      {
        id: 1,
        author_id: 101,
        author: { id: 101, full_name: "Alice Example", username: "alice" },
        content: "First comment",
        created: "2026-02-01T08:15:00.000Z"
      },
      {
        id: 2,
        author_id: 102,
        author: { id: 102, full_name: "Bob Example", username: "bob" },
        content: "Second comment",
        created: "2026-02-02T10:20:00.000Z"
      }
    ]
  });

  const result = await getTaskComments(client, {
    task: "9001"
  });

  assert.equal(result.kind, "list");
  assert.equal(result.data.length, 2);
  assert.equal(result.data[0].id, 1);
  assert.equal(result.data[0].content, "First comment");
  assert.equal(result.data[0].author.full_name, "Alice Example");
  assert.equal(result.data[1].id, 2);
  assert.equal(result.data[1].content, "Second comment");
  assert.equal(client.calls[0], "/api/latest/cards/9001/comments");
});
