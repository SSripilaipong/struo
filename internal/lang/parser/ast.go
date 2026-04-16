package parser

import "struo/internal/common/optional"

// Program is the top-level AST node.
type Program struct {
	Defs []Definition
}

// Definition is a named binding: Name = Expr
type Definition struct {
	Name string
	Expr Expr
}

// Expr is the expression interface (sealed via unexported method).
type Expr interface{ exprNode() }

// ArrowExpr is a single directed edge with an optional label and optional body.
// Label: (label:) a->b
// Body:  a->b: ArrowsVarName  (body is a reference to an arrows-collection variable)
type ArrowExpr struct {
	Label optional.Of[string] // None if no label
	From  string
	To    string
	Body  optional.Of[string] // None if no body; Some(varName) if present
}

func (ArrowExpr) exprNode() {}

// ArrowsLiteral is a set of directed edges: { a->b, b->c } or { f: a->b, g: b->c }
type ArrowsLiteral struct {
	Entries []ArrowExpr
}

func (ArrowsLiteral) exprNode() {}

// SetLiteral is a set of named objects: { a, b, c }
type SetLiteral struct {
	Elements []string
}

func (SetLiteral) exprNode() {}

// ObjectEntry is a single entry in an objects section.
// Plain: just a name (e.g. "a"). Ref: a local alias to a graph variable (e.g. "g: G").
type ObjectEntry struct {
	Name string
	Ref  optional.Of[string] // None = plain object; Some = uppercase variable name (e.g. "G")
}

// ObjectsLiteral is the objects section of a graph: { a, b, g: G, h: H }
type ObjectsLiteral struct {
	Entries []ObjectEntry
}

// GraphExpr is an inline graph: graph{objects: {a,b,c}, arrows: {f: a->b, ...}}
// Objects is None when the shorthand form graph{arrows: {...}} is used;
// the interpreter will auto-derive objects from arrow endpoints in that case.
type GraphExpr struct {
	Objects optional.Of[ObjectsLiteral]
	Arrows  ArrowsLiteral
}

func (GraphExpr) exprNode() {}
