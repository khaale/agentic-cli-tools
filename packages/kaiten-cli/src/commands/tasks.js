import { parseDateSpec } from "@khaale/cli-core";
import { anonymizeUser, shortenHash } from "../lib/anonymize.js";
import { fail } from "../lib/errors.js";
import { logDebug } from "../lib/debug.js";
import {
  compareTasks,
  matchesEntityFilter,
  matchesSearch,
  matchesState,
  matchesUserFilter,
  summarizeTask
} from "../lib/schemas.js";

export async function listMineTasks(client, options) {
  logDebug(options.verbose, "tasks mine: resolving current user");
  const currentUser = await resolveCurrentUser(client, options);
  const tasks = await collectTaskListViaCards(client, options, {
    assigneeFilter: currentUser,
    defaultState: "open"
  });
  logDebug(options.verbose, `tasks mine: matched ${tasks.length} task(s)`);

  return {
    kind: "list",
    data: tasks
  };
}

export async function findTasks(client, options) {
  const assigneeFilter =
    String(options.assignee || "").trim().toLowerCase() === "me"
      ? await resolveCurrentUser(client, options)
      : options.assignee || null;
  logDebug(options.verbose, "tasks find: collecting tasks via cards list");
  const tasks = await collectTaskListViaCards(client, options, {
    assigneeFilter,
    defaultState: "all"
  });
  logDebug(options.verbose, `tasks find: matched ${tasks.length} task(s)`);

  return {
    kind: "list",
    data: tasks
  };
}

export async function getTask(client, options) {
  if (!options.task) {
    fail("tasks get requires --task <id>", 2);
  }

  logDebug(options.verbose, `tasks get: searching for task ${options.task}`);
  const directTask = await tryDirectTaskLookup(client, options);
  if (directTask) {
    return {
      kind: "get",
      data: directTask
    };
  }

  logDebug(options.verbose, `tasks get: direct lookup missed task ${options.task}, falling back to board scan`);
  return findTaskById(client, options);
}

async function collectTaskListViaCards(client, options, { assigneeFilter = null, defaultState = "all" } = {}) {
  const state = options.state || defaultState;
  const query = buildCardsListQuery(options, {
    assigneeFilter,
    state
  });
  const tasks = [];
  let offset = 0;
  const pageSize = 100;

  logDebug(
    options.verbose,
    `cards list: starting query owner=${describeAssigneeFilter(assigneeFilter)} state=${state} search=${options.search || "-"}`
  );

  while (true) {
    const limit = pageSize;
    const cards = await client.requestJson(client.cardsPath(), {
      query: {
        ...query,
        limit,
        offset
      },
      refresh: options.refresh,
      verbose: options.verbose,
      scope: { resource: "cards", mode: "list" }
    });

    const pageCards = Array.isArray(cards) ? cards : [];
    logDebug(
      options.verbose,
      `cards list: page offset=${offset} limit=${limit} received=${pageCards.length}`
    );

    if (pageCards.length === 0) {
      break;
    }

    const pageTasks = pageCards.map((card) => normalizeDirectCardTask(card));

    if (options.since) {
      const sinceDate = parseDateSpec(options.since);
      const isPastSince = (task) => {
        const updated = new Date(task.updated_at || task.updated);
        return updated < sinceDate;
      };

      // Since cards are returned sorted by updated desc, 
      // if the first card in the page is older than since, we can stop entirely.
      if (pageTasks.length > 0 && isPastSince(pageTasks[0])) {
        break;
      }
      
      // If some cards in the page are older than since, we filter them and stop.
      const hasOldTasks = pageTasks.some(isPastSince);
      const matchedTasks = applyTaskFilters(pageTasks, {
        ...options,
        assigneeFilter,
        state,
        limit: undefined
      });
      tasks.push(...matchedTasks);

      if (hasOldTasks) {
        break;
      }
    } else {
      const matchedTasks = applyTaskFilters(pageTasks, {
        ...options,
        assigneeFilter,
        state,
        limit: undefined
      });
      tasks.push(...matchedTasks);
    }

    if (options.limit !== undefined && tasks.length >= options.limit) {
      break;
    }

    if (pageCards.length < limit) {
      break;
    }

    offset += pageCards.length;
  }

  tasks.sort(compareTasks);
  return options.limit === undefined ? tasks : tasks.slice(0, options.limit);
}

async function collectTaskIndex(client, options) {
  const spaces = await fetchSpaces(client, options);
  const selectedSpaces = spaces.filter((space) => matchesEntityFilter(space, options.space));
  logDebug(
    options.verbose,
    `task scan: spaces total=${spaces.length} selected=${selectedSpaces.length}${options.space ? ` filter=${options.space}` : ""}`
  );

  if (options.space && selectedSpaces.length === 0) {
    fail(`space not found: ${options.space}`, 4);
  }

  const usersById = buildUsersById(selectedSpaces);
  const tasks = [];
  let selectedBoardCount = 0;

  for (const space of selectedSpaces) {
    const boards = await fetchBoards(client, space, options);
    const selectedBoards = boards.filter((board) => matchesEntityFilter(board, options.board));
    logDebug(
      options.verbose,
      `task scan: space=${formatEntity(space)} boards total=${boards.length} selected=${selectedBoards.length}${options.board ? ` filter=${options.board}` : ""}`
    );

    if (selectedBoards.length > 0) {
      selectedBoardCount += selectedBoards.length;
    }

    for (const board of selectedBoards) {
      const boardDetail = await fetchBoardDetail(client, space, board, options);
      const boardTasks = normalizeBoardTasks(boardDetail, space, usersById);
      logDebug(
        options.verbose,
        `task scan: board=${formatEntity(boardDetail)} cards=${boardTasks.length} total_tasks_before=${tasks.length}`
      );
      tasks.push(...boardTasks);
    }
  }

  if (options.board && selectedBoardCount === 0) {
    fail(`board not found: ${options.board}`, 4);
  }

  tasks.sort(compareTasks);
  logDebug(options.verbose, `task scan: completed spaces=${selectedSpaces.length} boards=${selectedBoardCount} tasks=${tasks.length}`);

  return { spaces: selectedSpaces, tasks, usersById };
}

async function fetchSpaces(client, options) {
  const data = await client.requestJson(client.spacesPath(), {
    refresh: options.refresh,
    verbose: options.verbose,
    scope: { resource: "spaces" }
  });

  return Array.isArray(data) ? data : [];
}

async function fetchBoards(client, space, options) {
  const data = await client.requestJson(client.spaceBoardsPath(space.id), {
    refresh: options.refresh,
    verbose: options.verbose,
    scope: { resource: "boards", space: space.id }
  });

  return Array.isArray(data) ? data : [];
}

async function fetchBoardDetail(client, space, board, options) {
  return client.requestJson(client.spaceBoardPath(space.id, board.id), {
    refresh: options.refresh,
    verbose: options.verbose,
    scope: { resource: "board", space: space.id, board: board.id }
  });
}

function buildUsersById(spaces) {
  const usersById = new Map();

  for (const space of spaces) {
    for (const user of space.users || []) {
      if (user?.id !== undefined && user?.id !== null) {
        usersById.set(String(user.id), user);
      }
    }
  }

  return usersById;
}

function applyTaskFilters(tasks, options) {
  const search = options.search ? String(options.search).trim() : null;
  const assigneeFilter = options.assigneeFilter || null;
  const state = options.state || "all";
  let filtered = tasks;

  if (assigneeFilter) {
    filtered = filtered.filter((task) => matchesUserFilter(task.assignee, assigneeFilter));
  }

  if (search) {
    filtered = filtered.filter((task) => matchesSearch(task, search));
  }

  if (options.space) {
    filtered = filtered.filter((task) => matchesEntityFilter(task.space, options.space));
  }

  if (options.board) {
    filtered = filtered.filter((task) => matchesEntityFilter(task.board, options.board));
  }

  if (state !== "all") {
    filtered = filtered.filter((task) => matchesState(task, state));
  }

  if (options.since) {
    const sinceDate = parseDateSpec(options.since);
    filtered = filtered.filter((task) => {
      const updated = new Date(task.updated_at || task.updated);
      return updated >= sinceDate;
    });
  }

  if (options.till) {
    const tillDate = parseDateSpec(options.till);
    filtered = filtered.filter((task) => {
      const updated = new Date(task.updated_at || task.updated);
      return updated <= tillDate;
    });
  }

  if (options.limit !== undefined) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

async function resolveCurrentUser(client, options) {
  for (const path of client.currentUserCandidatePaths()) {
    logDebug(options.verbose, `current user probe: ${path}`);
    const user = await client.requestOptionalJson(path, {
      refresh: options.refresh,
      verbose: options.verbose,
      scope: { resource: "current-user" }
    });

    if (isUserLike(user)) {
      logDebug(options.verbose, `current user resolved from endpoint: ${formatUser(user)}`);
      return user;
    }
  }

  fail("unable to resolve the current Kaiten user via GET /users/current", 3);
}

function isUserLike(value) {
  return Boolean(value && typeof value === "object" && (value.id || value.uid || value.email || value.username));
}

function indexById(items) {
  const index = new Map();

  for (const item of items) {
    if (item?.id !== undefined && item?.id !== null) {
      index.set(String(item.id), item);
    }
  }

  return index;
}

function normalizeBoardTasks(boardDetail, space, usersById) {
  const columnsById = indexById(boardDetail.columns || []);
  const lanesById = indexById(boardDetail.lanes || []);
  const tasks = [];

  for (const card of boardDetail.cards || []) {
    const owner = card.owner || usersById.get(String(card.owner_id)) || null;
    const normalized = summarizeTask(
      { ...card, owner },
      {
        space,
        board: boardDetail,
        column: columnsById.get(String(card.column_id)) || null,
        lane: lanesById.get(String(card.lane_id)) || null
      }
    );
    tasks.push(normalized);
  }

  return tasks;
}

function normalizeDirectCardTask(card) {
  return summarizeTask(card, {
    space: extractSpace(card),
    board: extractBoard(card),
    column: extractColumn(card),
    lane: extractLane(card)
  });
}

async function findTaskById(client, options) {
  const spaces = await fetchSpaces(client, options);
  const selectedSpaces = spaces.filter((space) => matchesEntityFilter(space, options.space));
  logDebug(
    options.verbose,
    `tasks get: spaces total=${spaces.length} selected=${selectedSpaces.length}${options.space ? ` filter=${options.space}` : ""}`
  );

  if (options.space && selectedSpaces.length === 0) {
    fail(`space not found: ${options.space}`, 4);
  }

  const usersById = buildUsersById(selectedSpaces);
  let selectedBoardCount = 0;

  for (const space of selectedSpaces) {
    const boards = await fetchBoards(client, space, options);
    const selectedBoards = boards.filter((board) => matchesEntityFilter(board, options.board));
    logDebug(
      options.verbose,
      `tasks get: space=${formatEntity(space)} boards total=${boards.length} selected=${selectedBoards.length}${options.board ? ` filter=${options.board}` : ""}`
    );

    if (selectedBoards.length > 0) {
      selectedBoardCount += selectedBoards.length;
    }

    for (const board of selectedBoards) {
      logDebug(options.verbose, `tasks get: scanning board=${formatEntity(board)}`);
      const boardDetail = await fetchBoardDetail(client, space, board, options);
      const boardTasks = normalizeBoardTasks(boardDetail, space, usersById);
      logDebug(options.verbose, `tasks get: board=${formatEntity(boardDetail)} cards=${boardTasks.length}`);
      const task = boardTasks.find((item) => String(item.id) === String(options.task));

      if (task) {
        logDebug(options.verbose, `tasks get: found task=${task.id} board=${formatEntity(boardDetail)}`);
        return {
          kind: "get",
          data: task
        };
      }
    }
  }

  if (options.board && selectedBoardCount === 0) {
    fail(`board not found: ${options.board}`, 4);
  }

  fail(`task not found: ${options.task}`, 4);
}

async function tryDirectTaskLookup(client, options) {
  for (const path of client.cardCandidatePaths(options.task)) {
    logDebug(options.verbose, `tasks get: direct card probe ${path}`);
    const card = await client.requestOptionalJson(path, {
      refresh: options.refresh,
      verbose: options.verbose,
      scope: { resource: "card", task: options.task }
    });

    if (!card) {
      continue;
    }

    const task = summarizeTask(card, {
      space: extractSpace(card),
      board: extractBoard(card),
      column: extractColumn(card),
      lane: extractLane(card)
    });

    if (options.board && !matchesEntityFilter(task.board, options.board)) {
      logDebug(
        options.verbose,
        `tasks get: direct card ${task.id} does not match board filter=${options.board}, falling back to scan`
      );
      return null;
    }

    if (options.space && task.space && !matchesEntityFilter(task.space, options.space)) {
      logDebug(
        options.verbose,
        `tasks get: direct card ${task.id} does not match space filter=${options.space}, falling back to scan`
      );
      return null;
    }

    logDebug(options.verbose, `tasks get: direct card hit ${task.id}`);
    return task;
  }

  return null;
}

function formatEntity(entity) {
  return `${entity?.title || entity?.name || entity?.uid || "?"}#${entity?.id ?? "?"}`;
}

function formatUser(user) {
  const anonymized = anonymizeUser(user);
  if (!anonymized?.hash) {
    return "sha256:unknown";
  }

  return shortenHash(anonymized.hash);
}

function extractSpace(card) {
  if (card.space) {
    return card.space;
  }

  if (card.path_data?.space) {
    return card.path_data.space;
  }

  if (card.board?.space) {
    return card.board.space;
  }

  if (card.path_data?.space_id !== undefined && card.path_data?.space_id !== null) {
    return {
      id: card.path_data.space_id,
      title: card.path_data.space_title ?? null,
      uid: card.path_data.space_uid ?? null
    };
  }

  if (card.board?.space_id !== undefined && card.board?.space_id !== null) {
    return {
      id: card.board.space_id,
      title: card.board.space_title ?? null,
      uid: card.board.space_uid ?? null
    };
  }

  return null;
}

function extractBoard(card) {
  if (card.board) {
    return card.board;
  }

  if (card.path_data?.board) {
    return card.path_data.board;
  }

  if (card.board_id !== undefined && card.board_id !== null) {
    return {
      id: card.board_id,
      title: card.path_data?.board_title ?? null,
      uid: card.path_data?.board_uid ?? null
    };
  }

  return null;
}

function extractColumn(card) {
  if (card.column) {
    return card.column;
  }

  if (card.path_data?.column) {
    return card.path_data.column;
  }

  if (card.column_id !== undefined && card.column_id !== null) {
    return {
      id: card.column_id,
      title: card.path_data?.column_title ?? null,
      type: card.path_data?.column_type ?? null
    };
  }

  return null;
}

function extractLane(card) {
  if (card.lane) {
    return card.lane;
  }

  if (card.path_data?.lane) {
    return card.path_data.lane;
  }

  if (card.lane_id !== undefined && card.lane_id !== null) {
    return {
      id: card.lane_id,
      title: card.path_data?.lane_title ?? null,
      uid: card.path_data?.lane_uid ?? null
    };
  }

  return null;
}

function buildCardsListQuery(options, { assigneeFilter, state }) {
  const query = {
    order_by: "updated,created",
    order_direction: "desc,desc"
  };

  if (options.search) {
    query.query = options.search;
    query.additional_card_fields = "description";
  }

  const ownerId = resolveOwnerIdFilter(assigneeFilter, options.assignee);
  if (ownerId !== null) {
    query.owner_id = ownerId;
  }

  const spaceId = resolveNumericId(options.space);
  if (spaceId !== null) {
    query.space_id = spaceId;
  }

  const boardId = resolveNumericId(options.board);
  if (boardId !== null) {
    query.board_id = boardId;
  }

  applyStateQuery(query, state);

  return query;
}

function applyStateQuery(query, state) {
  switch (state) {
    case "open":
      query.condition = 1;
      query.states = "1,2";
      break;
    case "done":
      query.condition = 1;
      query.states = "3";
      break;
    case "archived":
      query.condition = 2;
      query.archived = true;
      break;
    case "all":
    default:
      break;
  }
}

function resolveOwnerIdFilter(assigneeFilter, assigneeOption) {
  if (assigneeFilter && typeof assigneeFilter === "object") {
    return resolveNumericId(assigneeFilter.id);
  }

  return resolveNumericId(assigneeOption);
}

function resolveNumericId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function describeAssigneeFilter(assigneeFilter) {
  if (!assigneeFilter) {
    return "-";
  }

  if (typeof assigneeFilter === "object") {
    return formatUser(assigneeFilter);
  }

  return String(assigneeFilter);
}
