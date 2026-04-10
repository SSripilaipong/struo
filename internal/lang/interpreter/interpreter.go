package interpreter

import (
	"fmt"
	"struo/internal/lang/parser"
)

// Value is the runtime value interface.
type Value interface{ valueTag() }

// MappingVal holds the evaluated entries of a mapping literal.
type MappingVal struct {
	Entries []parser.MappingEntry
}

func (MappingVal) valueTag() {}

// Collection is the result of interpreting a full program.
type Collection struct {
	Bindings map[string]Value
	Order    []string // preserves definition order
}

// Interpret evaluates a parsed Program into a Collection.
func Interpret(prog parser.Program) (*Collection, error) {
	c := &Collection{
		Bindings: make(map[string]Value),
	}
	for _, def := range prog.Defs {
		val, err := evalExpr(def.Expr)
		if err != nil {
			return nil, fmt.Errorf("definition %q: %w", def.Name, err)
		}
		c.Bindings[def.Name] = val
		c.Order = append(c.Order, def.Name)
	}
	return c, nil
}

func evalExpr(expr parser.Expr) (Value, error) {
	switch e := expr.(type) {
	case parser.MappingLiteral:
		return MappingVal{Entries: e.Entries}, nil
	default:
		return nil, fmt.Errorf("unknown expression type %T", e)
	}
}
