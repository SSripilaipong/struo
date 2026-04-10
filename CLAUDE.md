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
├── cmd/struo/main.go                   entry point
├── internal/
│   ├── lang/
│   │   ├── result/result.go            Result[T] monad
│   │   ├── tuple/tuple.go              Of2/Of3 product types
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
│   │   │   └── struo-mapping.ts        <struo-mapping> web component
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
go build ./cmd/struo/
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

# Simple mapping definition
F = {a->b, b->c, a->c}
```

- **Identifiers**: `[a-zA-Z][a-zA-Z0-9_]*`
- **Mapping literal**: `{ from->to, ... }` — comma-separated directed edges
- **Comments**: `#` to end of line

## HTTP routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | HTML shell with `<struo-collection>` |
| GET | `/_mapping/{name}` | HTML shell with `<struo-mapping name="...">` |
| GET | `/api/collection` | JSON list of all definitions |
| GET | `/api/mapping/{name}` | JSON entries for a named mapping |
| GET | `/assets/*` | Static frontend assets (embedded) |

## Parser combinators

The parser follows the same pattern as `~/projects/modulang/internal`:
- `Parser[R]` interface + `ParserFunc[R]` struct
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
