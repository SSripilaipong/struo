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

// MappingLiteral is a set of directed edges: { a->b, b->c }
type MappingLiteral struct {
	Entries []MappingEntry
}

// MappingEntry is a single directed edge: from -> to
type MappingEntry struct {
	From string
	To   string
}

func (MappingLiteral) exprNode() {}
