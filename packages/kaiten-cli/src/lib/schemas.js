export function summarizeTask(card, context = {}) {
  const column = context.column || null;
  const task = {
    id: card.id,
    title: card.title || null,
    description: card.description || card.description_text || null,
    description_filled: Boolean(card.description_filled ?? card.description),
    archived: Boolean(card.archived),
    state: card.state ?? null,
    status: deriveStatus(card, column),
    is_open: isOpen(card, column),
    assignee_id: card.owner_id ?? card.owner?.id ?? null,
    assignee: summarizeUser(card.owner, card.owner_id),
    space: summarizeEntity(context.space),
    board: summarizeEntity(context.board),
    column: summarizeColumn(column),
    lane: summarizeEntity(context.lane),
    type: summarizeType(card.type),
    parents_count: card.parents_count ?? countItems(card.parents_ids) ?? countItems(card.parents) ?? 0,
    children_count: card.children_count ?? countItems(card.children_ids) ?? countItems(card.children) ?? 0,
    children_done: card.children_done ?? null,
    parents: summarizeRelatedTasks(card.parents),
    children: summarizeRelatedTasks(card.children),
    created_at: card.created ?? card.created_at ?? null,
    updated_at: card.updated ?? card.updated_at ?? null,
    completed_at: card.completed_at ?? null,
    last_moved_at: card.last_moved_at ?? null,
    url: card.url ?? card.web_url ?? null
  };

  return task;
}

export function summarizeComment(comment) {
  return {
    id: comment.id,
    author_id: comment.author_id ?? comment.author?.id ?? null,
    author: summarizeUser(comment.author, comment.author_id),
    content: comment.content ?? comment.text ?? null,
    created_at: comment.created ?? comment.created_at ?? null,
    updated_at: comment.updated ?? comment.updated_at ?? null
  };
}

export function compareTasks(left, right) {
  return (
    compareDates(left.updated_at, right.updated_at) ||
    compareDates(left.created_at, right.created_at) ||
    compareNumbers(right.id, left.id)
  );
}

export function matchesEntityFilter(entity, filter) {
  if (!filter) {
    return true;
  }

  const needle = String(filter).trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const fields = [
    entity?.id,
    entity?.uid,
    entity?.title,
    entity?.name,
    entity?.slug
  ];

  return fields.some((field) => String(field || "").trim().toLowerCase() === needle) ||
    fields.some((field) => String(field || "").trim().toLowerCase().includes(needle));
}

export function matchesUserFilter(user, filter) {
  if (!filter) {
    return true;
  }

  if (typeof filter === "object") {
    return sameUser(user, filter);
  }

  const needle = String(filter).trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const fields = [user?.id, user?.uid, user?.email, user?.username, user?.full_name];
  return fields.some((field) => String(field || "").trim().toLowerCase() === needle) ||
    fields.some((field) => String(field || "").trim().toLowerCase().includes(needle));
}

export function matchesSearch(task, query) {
  const needle = String(query).trim().toLowerCase();
  const haystack = [
    task.id,
    task.title,
    task.description,
    task.status,
    task.assignee?.full_name,
    task.assignee?.username,
    task.assignee?.email,
    task.board?.title,
    task.space?.title,
    task.column?.title,
    task.type?.name
  ]
    .map((value) => String(value || "").toLowerCase())
    .join("\n");

  return haystack.includes(needle);
}

export function matchesState(task, state) {
  switch (state) {
    case "open":
      return task.is_open;
    case "done":
      return task.status === "done";
    case "archived":
      return task.archived;
    case "all":
    default:
      return true;
  }
}

function summarizeUser(user, fallbackId) {
  if (!user && fallbackId === undefined) {
    return null;
  }

  return {
    id: user?.id ?? fallbackId ?? null,
    uid: user?.uid ?? null,
    full_name: user?.full_name ?? user?.name ?? null,
    email: user?.email ?? null,
    username: user?.username ?? null
  };
}

function summarizeEntity(entity) {
  if (!entity) {
    return null;
  }

  return {
    id: entity.id ?? null,
    uid: entity.uid ?? null,
    title: entity.title ?? entity.name ?? null
  };
}

function summarizeColumn(column) {
  if (!column) {
    return null;
  }

  return {
    id: column.id ?? null,
    title: column.title ?? column.name ?? null,
    type: column.type ?? null
  };
}

function summarizeType(type) {
  if (!type) {
    return null;
  }

  return {
    id: type.id ?? null,
    uid: type.uid ?? null,
    name: type.name ?? null,
    color: type.color ?? null,
    letter: type.letter ?? null
  };
}

function summarizeRelatedTasks(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.map((item) => {
    const column = item.column || null;

    return {
      id: item.id ?? null,
      title: item.title ?? null,
      archived: Boolean(item.archived),
      state: item.state ?? null,
      status: deriveStatus(item, column),
      assignee: summarizeUser(item.owner, item.owner_id),
      completed_at: item.completed_at ?? null
    };
  });
}

function deriveStatus(card, column) {
  if (card.archived) {
    return "archived";
  }

  if (column?.type === 3 || card.state === 3 || card.completed_at) {
    return "done";
  }

  if (column?.type === 2 || card.state === 2) {
    return "in_progress";
  }

  return "open";
}

function isOpen(card, column) {
  return !card.archived && !(column?.type === 3 || card.state === 3 || card.completed_at);
}

function sameUser(left, right) {
  if (!left || !right) {
    return false;
  }

  const comparable = ["id", "uid", "email", "username"];
  for (const key of comparable) {
    const leftValue = String(left[key] || "").trim().toLowerCase();
    const rightValue = String(right[key] || "").trim().toLowerCase();
    if (leftValue && rightValue && leftValue === rightValue) {
      return true;
    }
  }

  const leftName = String(left.full_name || left.name || "").trim().toLowerCase();
  const rightName = String(right.full_name || right.name || "").trim().toLowerCase();
  return Boolean(leftName && rightName && leftName === rightName);
}

function compareDates(left, right) {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  return rightTime - leftTime;
}

function compareNumbers(left, right) {
  return Number(left || 0) - Number(right || 0);
}

function countItems(items) {
  return Array.isArray(items) ? items.length : null;
}
