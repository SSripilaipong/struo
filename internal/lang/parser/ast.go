package parser

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

// ArrowsLiteral is a set of directed edges: { a->b, b->c }
type ArrowsLiteral struct {
	Entries []ArrowEntry
}

// ArrowEntry is a single directed edge: from -> to
type ArrowEntry struct {
	From string
	To   string
}

func (ArrowsLiteral) exprNode() {}

// SetLiteral is a set of named objects: { a, b, c }
type SetLiteral struct {
	Elements []string
}

func (SetLiteral) exprNode() {}

// ArrowsCollectionEntry is a named arrows literal inside an ArrowsCollectionLiteral.
type ArrowsCollectionEntry struct {
	Name   string
	Arrows ArrowsLiteral
}

// ArrowsCollectionLiteral is a named collection of arrows sets: { F: {a->b}, G: {a->c} }
type ArrowsCollectionLiteral struct {
	Entries []ArrowsCollectionEntry
}

func (ArrowsCollectionLiteral) exprNode() {}

// GraphExpr references previously defined Set and ArrowsCollection by name.
// Forward references are not supported — both names must be defined earlier.
type GraphExpr struct {
	ObjectsName string
	ArrowsName  string
}

func (GraphExpr) exprNode() {}
