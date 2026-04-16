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

// ArrowExpr is a single directed edge with an optional label: (p:) a->b
type ArrowExpr struct {
	Label *string // nil if no label
	From  string
	To    string
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

// GraphExpr is an inline graph: graph{objects: {a,b,c}, arrows: {f: a->b, ...}}
// Objects is None when the shorthand form graph{arrows: {...}} is used;
// the interpreter will auto-derive objects from arrow endpoints in that case.
type GraphExpr struct {
	Objects optional.Of[SetLiteral]
	Arrows  ArrowsLiteral
}

func (GraphExpr) exprNode() {}
