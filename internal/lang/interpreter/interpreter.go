package interpreter

import (
	"fmt"
	"iter"
	"struo/internal/lang/parser"
)

// Value is the runtime value interface.
type Value interface{ valueTag() }

// ArrowEntry is a single directed edge with an optional label.
type ArrowEntry struct {
	Label *string
	From  string
	To    string
}

// ArrowVal holds a single evaluated arrow.
type ArrowVal struct {
	Label *string
	From  string
	To    string
}

func (ArrowVal) valueTag() {}

// ArrowsVal holds the evaluated entries of an arrows literal.
type ArrowsVal struct {
	Entries []ArrowEntry
}

func (ArrowsVal) valueTag() {}

// SetVal holds the elements of a set literal.
type SetVal struct {
	Elements []string
}

func (SetVal) valueTag() {}

// GraphVal holds a graph with a set of objects and a list of arrows.
type GraphVal struct {
	Objects []string
	Arrows  []ArrowEntry
}

func (GraphVal) valueTag() {}

// Collection is the result of interpreting a full program.
type Collection struct {
	Bindings map[string]Value
	Order    []string // preserves definition order
}

// All yields (name, value) pairs in definition order.
func (c *Collection) All() iter.Seq2[string, Value] {
	return func(yield func(string, Value) bool) {
		for _, name := range c.Order {
			if !yield(name, c.Bindings[name]) {
				return
			}
		}
	}
}

// Interpret evaluates a parsed Program into a Collection.
func Interpret(prog parser.Program) (*Collection, error) {
	c := &Collection{
		Bindings: make(map[string]Value),
	}
	for _, def := range prog.Defs {
		val, err := evalExpr(def.Expr, c)
		if err != nil {
			return nil, fmt.Errorf("definition %q: %w", def.Name, err)
		}
		c.Bindings[def.Name] = val
		c.Order = append(c.Order, def.Name)
	}
	return c, nil
}

func evalExpr(expr parser.Expr, _ *Collection) (Value, error) {
	switch e := expr.(type) {
	case parser.ArrowExpr:
		return ArrowVal{Label: e.Label, From: e.From, To: e.To}, nil

	case parser.ArrowsLiteral:
		entries := make([]ArrowEntry, len(e.Entries))
		for i, ae := range e.Entries {
			entries[i] = ArrowEntry{Label: ae.Label, From: ae.From, To: ae.To}
		}
		return ArrowsVal{Entries: entries}, nil

	case parser.SetLiteral:
		elems := make([]string, len(e.Elements))
		copy(elems, e.Elements)
		return SetVal{Elements: elems}, nil

	case parser.GraphExpr:
		objects := make([]string, len(e.Objects.Elements))
		copy(objects, e.Objects.Elements)
		arrows := make([]ArrowEntry, len(e.Arrows.Entries))
		for i, ae := range e.Arrows.Entries {
			arrows[i] = ArrowEntry{Label: ae.Label, From: ae.From, To: ae.To}
		}
		return GraphVal{Objects: objects, Arrows: arrows}, nil

	default:
		return nil, fmt.Errorf("unknown expression type %T", e)
	}
}
