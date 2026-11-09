-- Adds a "Before this lesson" box to the top of every lesson and a
-- "Where this leads" list to the bottom, using _generated/lessons.json
-- (written by scripts/build_index.py). Lessons only need to list their
-- own prerequisites in their header; everything else is filled in here.

local function read_index()
  local root = quarto.project.directory
  local f = io.open(pandoc.path.join({ root, "_generated", "lessons.json" }), "r")
  if not f then return nil end
  local text = f:read("a")
  f:close()
  return quarto.json.decode(text)
end

-- "../../" for a page two folders below the project root.
local function prefix_to_root()
  local root = quarto.project.directory
  local file = quarto.doc.input_file
  local rel = pandoc.path.make_relative(pandoc.path.directory(file), root)
  if rel == "." or rel == "" then return "" end
  local depth = select(2, rel:gsub("[^/\\]+", ""))
  return string.rep("../", depth)
end

local function lesson_item(lesson, prefix, note)
  local inlines = {
    pandoc.Link(lesson.title, prefix .. lesson.file),
  }
  if lesson.status ~= "published" then
    table.insert(inlines, pandoc.Space())
    table.insert(inlines, pandoc.Span("coming soon", { class = "soon" }))
  end
  if note then
    table.insert(inlines, pandoc.Space())
    table.insert(inlines, pandoc.Span(note, { class = "prereq-note" }))
  end
  local blocks = { pandoc.Plain(inlines) }
  if lesson.summary and lesson.summary ~= "" then
    table.insert(blocks, pandoc.Plain({ pandoc.Span(lesson.summary, { class = "prereq-summary" }) }))
  end
  return blocks
end

function Pandoc(doc)
  local lid = doc.meta["lesson-id"]
  if not lid then return doc end
  lid = pandoc.utils.stringify(lid)

  local index = read_index()
  if not index or not index[lid] then
    quarto.log.warning("No index entry for lesson '" .. lid .. "'. Run scripts/build_index.py.")
    return doc
  end
  local me = index[lid]
  local prefix = prefix_to_root()

  local top = {}

  if me.status == "planned" then
    table.insert(top, (quarto.Callout({
      type = "tip",
      title = "This lesson is being built",
      content = { pandoc.Para("The outline below shows what it will cover. The prerequisites are already set, so the map and links work today.") },
    })))
  end

  local items = {}
  for _, dep in ipairs(me.requires) do
    table.insert(items, lesson_item(index[dep], prefix, nil))
  end
  for _, dep in ipairs(me.helpful) do
    table.insert(items, lesson_item(index[dep], prefix, "(helpful, not required)"))
  end
  if #items > 0 then
    table.insert(top, (quarto.Callout({
      type = "note",
      title = "Before this lesson",
      content = { pandoc.BulletList(items) },
      collapse = false,
    })))
  else
    table.insert(top, (quarto.Callout({
      type = "note",
      title = "Before this lesson",
      content = { pandoc.Para("Nothing. This lesson is a starting point.") },
    })))
  end

  local bottom = {}
  if #me.leads_to > 0 then
    local next_items = {}
    for _, nxt in ipairs(me.leads_to) do
      table.insert(next_items, lesson_item(index[nxt], prefix, nil))
    end
    table.insert(bottom, pandoc.Header(2, "Where this leads", { id = "where-this-leads" }))
    table.insert(bottom, pandoc.Para("These lessons build directly on this one:"))
    table.insert(bottom, pandoc.BulletList(next_items))
  end

  local blocks = pandoc.List(top)
  blocks:extend(doc.blocks)
  blocks:extend(bottom)
  doc.blocks = blocks
  return doc
end
