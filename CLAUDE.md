# struo

A graph manipulation program. Users define graphs as mappings in `.sto` files; struo serves them as an interactive web UI.

## Architecture

```
.sto source
  └─ tokenizer → tokens
  └─ parser (combinator-based) → AST
  └─ interpreter → Collection (in-memory)
  └─ Go HTTP server → JSON API
  └─ Web Components (TypeScript) → SVG graph
```

## Directory structure

```
struo/
├── main.go                             entry point
├── internal/
│   ├── common/
│   │   ├── result/result.go            Result[T] monad
│   │   ├── tuple/tuple.go              Of2/Of3 product types
│   │   └── optional/optional.go        Of[T] optional type
│   ├── lang/
│   │   ├── token/token.go              token types
│   │   ├── tokenizer/tokenizer.go      lexer
│   │   ├── parser/
│   │   │   ├── ast.go                  AST nodes
│   │   │   ├── combinator.go           parser combinator library
│   │   │   └── grammar.go              struo grammar
│   │   └── interpreter/interpreter.go  evaluator → Collection
│   ├── assets/assets.go                //go:embed for frontend dist
│   └── server/
│       ├── server.go                   HTTP server + routing
│       └── handlers.go                 route handlers
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── struo-collection.ts     <struo-collection> web component
│   │   │   ├── struo-arrow.ts          <struo-arrow> web component
│   │   │   ├── struo-arrows.ts         <struo-arrows> web component
│   │   │   ├── struo-set.ts            <struo-set> web component
│   │   │   └── struo-graph.ts          <struo-graph> web component
│   │   ├── utils.ts                    shared helpers (escapeHtml)
│   │   ├── main.ts                     entry point (imports components)
│   │   └── style.css                   pastel design system
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts                  outDir → internal/assets/dist
├── go.mod
├── index.sto.example
└── CLAUDE.md
```

## Build

```bash
# 1. Build frontend (writes to internal/assets/dist/)
cd frontend && npm install && npm run build && cd ..

# 2. Build Go binary (embeds internal/assets/dist/)
go build .
```

## Run

```bash
# Requires index.sto in the working directory
cp index.sto.example index.sto
./struo                  # listens on :8080
./struo -addr :9000      # custom port
./struo -dev             # serve frontend from disk (for debugging embed issues)
```

## Development

Run Go server and Vite dev server simultaneously. Vite proxies `/api` and `/_mapping` to Go.

```bash
# Terminal 1 — Go server (in -dev mode so it reads from disk)
./struo -dev -addr :8080

# Terminal 2 — Vite dev server (hot reloads TS/CSS changes)
cd frontend && npm run dev
# Open http://localhost:5173
```

## Language spec (V1)

File extension: `.sto`

```
# Comment to end of line

# Variable names start with uppercase
F = a->b                  # single arrow
G = fog: a->c             # labeled arrow
Fs = {f: a->b, g: b->c}  # set of (optionally labeled) arrows
Xs = {a, b, c}            # set
MyGraph = graph{objects: {a,b,c}, arrows: {f: a->b, g: b->c, c->d}}  # graph (explicit objects)
Short  = graph{arrows: {a->b, b->c}}                                  # graph (objects auto-derived)
```

- **Variable names**: start with uppercase — `[A-Z][a-zA-Z0-9_]*`
- **Keywords**: lowercase — `graph`, `objects`, `arrows`
- **Node/label identifiers**: any identifier — `[a-zA-Z][a-zA-Z0-9_]*`
- **Arrow**: `from->to` or `label: from->to`
- **Arrows literal**: `{ arrow, ... }` — comma-separated arrows with optional per-arrow labels
- **Set literal**: `{ ident, ... }` — comma-separated identifiers
- **Graph**: `graph{objects: setLiteral, arrows: arrowsLiteral}` — full form; or `graph{arrows: arrowsLiteral}` — shorthand, objects auto-derived from arrow endpoints in order of first appearance
- **Comments**: `#` to end of line

## HTTP routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | HTML shell with `<struo-collection>` |
| GET | `/_arrow/{name}` | HTML shell with `<struo-arrow name="...">` |
| GET | `/_arrows/{name}` | HTML shell with `<struo-arrows name="...">` |
| GET | `/_set/{name}` | HTML shell with `<struo-set name="...">` |
| GET | `/_graph/{name}` | HTML shell with `<struo-graph name="...">` |
| GET | `/api/collection` | JSON list of all definitions |
| GET | `/api/arrow/{name}` | JSON for a named arrow |
| GET | `/api/arrows/{name}` | JSON entries for a named arrows set |
| GET | `/api/set/{name}` | JSON elements for a named set |
| GET | `/api/graph/{name}` | JSON objects+arrows for a named graph |
| GET | `/assets/*` | Static frontend assets (embedded) |

## Common packages

`internal/common/` holds domain-agnostic generic utilities used across the project:
- `result.Result[T]` — `Ok`/`Err` monad; `IsOk()`, `Unwrap() (T, error)`
- `tuple.Of2[A,B]` / `Of3[A,B,C]` — product types with `T2`/`T3` constructors and `T3Drop2`
- `optional.Of[T]` — `Some`/`None`; `IsPresent()`, `Unwrap() (T, bool)`

When touching files that still import `internal/lang/result` or `internal/lang/tuple` (those paths no longer exist — they were moved to `internal/common/`), update the import paths accordingly.

## Parser combinators

The parser follows the same pattern as `~/projects/modulang/internal`:
- `Parser[R]` — type alias for `func([]token.Token) result.Result[tuple.Of2[R, []token.Token]]`
- Combinators: `Satisfy`, `Map`, `Sequence2/3`, `Choice`, `Optional`, `RepeatAnyTimes/OneOrMore`
- Whitespace helpers: `skipWS()`, `skipInlineWS()`, `Sequence2WithWhiteSpace/InlineWS`

## Acknowledged future features (not implemented in V1)

- **Assertions**: `:assert T functor[C->D]` — type-level constraints
- **Computed mappings**: `G = map F Xs` — applying a mapping to a set
- **Set literals and functions**: filter, compose, etc.
- **Query bar**: ad-hoc computation from the browser
- **Live editing**: edit `.sto` files from the browser with hot reload
- **Visualization config**: per-graph `.stv` files
- **Multi-file**: `index.sto` linking to definitions in other directories
