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

## Links

- [Website](https://tashks.simonwjackson.io)
- [npm](https://www.npmjs.com/package/@tashks/cli)
- [GitHub](https://github.com/simonwjackson/tashks)

## License

MIT — Simon W. Jackson
