import test from "node:test";
import assert from "node:assert/strict";
import { findTasks, getTask, listMineTasks } from "../src/commands/tasks.js";

function createClient(fixtures) {
  const calls = [];

  return {
    calls,
    spacesPath: () => "/api/latest/spaces",
    spaceBoardsPath: (spaceId) => `/api/latest/spaces/${spaceId}/boards`,
    spaceBoardPath: (spaceId, boardId) => `/api/latest/spaces/${spaceId}/boards/${boardId}`,
    cardsPath: () => "/api/latest/cards",
    cardCandidatePaths: (cardId) => [`/api/latest/cards/${cardId}`],
    currentUserCandidatePaths: () => ["/api/latest/users/current"],
    requestOptionalJson: async (path) => fixtures[path] ?? null,
    requestJson: async (path, options = {}) => {
      const key = fixtureKey(path, options.query);
      calls.push(key);

      if (key in fixtures) {
        return fixtures[key];
      }

      if (path in fixtures) {
        return fixtures[path];
      }

      throw new Error(`unexpected path: ${key}`);
    }
  };
}

test("tasks mine returns only current user's open tasks", async () => {
  const client = createClient({
    "/api/latest/users/current": {
      id: 101,
      full_name: "Alice Example",
      username: "alice",
      email: "alice@example.com"
    },
    [fixtureKey("/api/latest/cards", {
      condition: 1,
      limit: 100,
      offset: 0,
      order_by: "updated,created",
      order_direction: "desc,desc",
      owner_id: 101,
      states: "1,2"
    })]: [
      {
        id: 9001,
        title: "Open task",
        owner_id: 101,
        owner: { id: 101, full_name: "Alice Example", username: "alice" },
        state: 2,
        board: { id: 34, title: "Backend", space_id: 12, space_title: "Engineering" },
        column: { id: 502, title: "In progress", type: 2 },
        created: "2026-02-01T08:15:00.000Z",
        updated: "2026-02-11T10:20:00.000Z"
      }
    ]
  });

  const result = await listMineTasks(client, {});

  assert.equal(result.kind, "list");
  assert.deepEqual(result.data.map((task) => task.id), [9001]);
  assert.deepEqual(client.calls, [
    "/api/latest/cards?condition=1&limit=100&offset=0&order_by=updated%2Ccreated&order_direction=desc%2Cdesc&owner_id=101&states=1%2C2"
  ]);
});

test("tasks find filters by assignee and search text", async () => {
  const client = createClient({
    [fixtureKey("/api/latest/cards", {
      additional_card_fields: "description",
      limit: 100,
      offset: 0,
      order_by: "updated,created",
      order_direction: "desc,desc",
      query: "auth"
    })]: [
      {
        id: 9001,
        title: "Add auth flow",
        description: "CLI auth flow",
        owner_id: 101,
        owner: { id: 101, full_name: "Alice Example", username: "alice" },
        state: 1,
        board: { id: 34, title: "Backend", space_id: 12, space_title: "Engineering" },
        column: { id: 501, title: "To do", type: 1 }
      },
      {
        id: 9002,
        title: "Auth rollout follow-up",
        description: "auth but for bob",
        owner_id: 202,
        owner: { id: 202, full_name: "Bob Example", username: "bob" },
        state: 1,
        board: { id: 34, title: "Backend", space_id: 12, space_title: "Engineering" },
        column: { id: 501, title: "To do", type: 1 }
      }
    ]
  });

  const result = await findTasks(client, {
    assignee: "alice",
    search: "auth"
  });

  assert.deepEqual(result.data.map((task) => task.id), [9001]);
  assert.deepEqual(client.calls, [
    "/api/latest/cards?additional_card_fields=description&limit=100&offset=0&order_by=updated%2Ccreated&order_direction=desc%2Cdesc&query=auth"
  ]);
});

test("tasks get returns normalized task details", async () => {
  const client = createClient({
    "/api/latest/cards/9001": {
      id: 9001,
      title: "Add CLI auth flow",
      owner_id: 101,
      state: 2,
      created: "2026-02-01T08:15:00.000Z",
      updated: "2026-02-11T10:20:00.000Z",
      board: {
        id: 34,
        title: "Backend",
        space_id: 12,
        space_title: "Engineering"
      },
      column: {
        id: 502,
        title: "In progress",
        type: 2
      },
      parents_count: 1,
      children_count: 2,
      children_done: 1,
      parents: [
        {
          id: 8001,
          title: "Epic task",
          state: 1,
          owner_id: 102,
          owner: { id: 102, full_name: "Bob Example" }
        }
      ],
      children: [
        {
          id: 9101,
          title: "Wire API",
          state: 3,
          owner_id: 103,
          owner: { id: 103, full_name: "Carol Example" }
        }
      ]
    }
  });

  const result = await getTask(client, {
    task: "9001"
  });

  assert.equal(result.kind, "get");
  assert.equal(result.data.id, 9001);
  assert.equal(result.data.board.title, "Backend");
  assert.equal(result.data.space.title, "Engineering");
  assert.equal(result.data.column.title, "In progress");
  assert.equal(result.data.parents_count, 1);
  assert.equal(result.data.children_count, 2);
  assert.equal(result.data.children_done, 1);
  assert.deepEqual(result.data.parents.map((item) => item.id), [8001]);
  assert.deepEqual(result.data.children.map((item) => item.id), [9101]);
  assert.equal(result.data.children[0].status, "done");
});

test("tasks get stops scanning after it finds the task", async () => {
  const calls = [];
  const client = {
    spacesPath: () => "/api/latest/spaces",
    spaceBoardsPath: (spaceId) => `/api/latest/spaces/${spaceId}/boards`,
    spaceBoardPath: (spaceId, boardId) => `/api/latest/spaces/${spaceId}/boards/${boardId}`,
    cardCandidatePaths: (cardId) => [`/api/latest/cards/${cardId}`],
    currentUserCandidatePaths: () => ["/api/latest/users/me"],
    requestOptionalJson: async (path) => {
      calls.push(path);

      if (path === "/api/latest/cards/9001") {
        return {
          id: 9001,
          title: "Found early",
          state: 2,
          board: {
            id: 34,
            title: "Backend",
            space_id: 12,
            space_title: "Engineering"
          },
          column: { id: 502, title: "In progress", type: 2 }
        };
      }

      return null;
    },
    requestJson: async (path) => {
      calls.push(path);
      throw new Error(`should not scan boards after direct card hit: ${path}`);
    }
  };

  const result = await getTask(client, {
    task: "9001"
  });

  assert.equal(result.data.id, 9001);
  assert.deepEqual(calls, ["/api/latest/cards/9001"]);
});

test("tasks get falls back to board scan when direct lookup misses", async () => {
  const calls = [];
  const client = {
    spacesPath: () => "/api/latest/spaces",
    spaceBoardsPath: (spaceId) => `/api/latest/spaces/${spaceId}/boards`,
    spaceBoardPath: (spaceId, boardId) => `/api/latest/spaces/${spaceId}/boards/${boardId}`,
    cardCandidatePaths: (cardId) => [`/api/latest/cards/${cardId}`],
    currentUserCandidatePaths: () => ["/api/latest/users/me"],
    requestOptionalJson: async (path) => {
      calls.push(path);
      return null;
    },
    requestJson: async (path) => {
      calls.push(path);

      if (path === "/api/latest/spaces") {
        return [{ id: 12, title: "Engineering", users: [] }];
      }

      if (path === "/api/latest/spaces/12/boards") {
        return [{ id: 34, title: "Backend" }];
      }

      if (path === "/api/latest/spaces/12/boards/34") {
        return {
          id: 34,
          title: "Backend",
          columns: [{ id: 502, title: "In progress", type: 2 }],
          cards: [{ id: 9001, title: "Found via scan", state: 2, column_id: 502 }]
        };
      }

      throw new Error(`unexpected path: ${path}`);
    }
  };

  const result = await getTask(client, {
    task: "9001"
  });

  assert.equal(result.data.id, 9001);
  assert.deepEqual(calls, [
    "/api/latest/cards/9001",
    "/api/latest/spaces",
    "/api/latest/spaces/12/boards",
    "/api/latest/spaces/12/boards/34"
  ]);
});

function fixtureKey(path, query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query).sort(([left], [right]) => left.localeCompare(right))) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    params.set(key, String(value));
  }

  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}
