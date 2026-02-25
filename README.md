# tashks

No-guilt task management from the terminal.

## Install

```sh
npm i -g @tashks/cli
```

## Usage

### Create a task and list active tasks

```sh
$ tashks create --title "Write landing page" --area code --energy low
{"id":"a1b2c3","title":"Write landing page","status":"active","area":"code","energy":"low"}

$ tashks list --status active
[{"id":"a1b2c3","title":"Write landing page","area":"code","energy":"low"},
 {"id":"d4e5f6","title":"Review PR","area":"work","energy":"medium"}]
```

### Filter by energy and status

```sh
$ tashks list --energy low --status active
[{"id":"a1b2c3","title":"Write landing page","area":"code","energy":"low"},
 {"id":"g7h8i9","title":"Water plants","area":"home","energy":"low"}]
```

### Complete a task

```sh
$ tashks complete d4e5f6
{"id":"d4e5f6","title":"Review PR","status":"done","completed_at":"2026-02-25"}
```

### Pipe to jq

```sh
$ tashks list --status active | jq '.[].title'
"Write landing page"
"Review PR"
```

### Pipe to jtbl

```sh
$ tashks list --status active | jtbl
id      title                area   energy
──────  ───────────────────  ─────  ──────
a1b2c3  Write landing page   code   low
d4e5f6  Review PR            work   medium
```

### Perspective view

```sh
$ tashks perspective morning
[{"id":"g7h8i9","title":"Water plants","energy":"low"},
 {"id":"a1b2c3","title":"Write landing page","energy":"low"}]
```

### Store tasks in any format

tashks stores data via [proseql](https://github.com/simonwjackson/proseql), so you can use YAML, JSON, TOML, JSON5, JSONL, and more. The format is inferred from the file extension:

```sh
# YAML (default)
$ tashks create --title "Buy groceries" --tasks-file ~/tasks.yaml

# JSON
$ tashks create --title "Buy groceries" --tasks-file ~/tasks.json

# TOML
$ tashks create --title "Buy groceries" --tasks-file ~/tasks.toml
```

### Migrate from per-file layout

If upgrading from an older version of tashks that stored one file per task:

```sh
$ tashks migrate --from ~/.local/share/tashks --tasks-file ~/tasks.yaml --worklog-file ~/work-log.yaml
{"migrated":{"tasks":42,"workLogEntries":108}}
```

## Links

- [Website](https://tashks.simonwjackson.io)
- [npm](https://www.npmjs.com/package/@tashks/cli)
- [GitHub](https://github.com/simonwjackson/tashks)

## License

MIT — Simon W. Jackson
