package interpreter

import (
	"fmt"
	"iter"
	"struo/internal/lang/parser"
)

// Value is the runtime value interface.
type Value interface{ valueTag() }

// ArrowsVal holds the evaluated entries of an arrows literal.
type ArrowsVal struct {
	Entries []parser.ArrowEntry
}

func (ArrowsVal) valueTag() {}

// SetVal holds the elements of a set literal.
type SetVal struct {
	Elements []string
}

func (SetVal) valueTag() {}

// ArrowsCollectionEntry is a named arrows set within an ArrowsCollectionVal.
type ArrowsCollectionEntry struct {
	Name   string
	Arrows ArrowsVal
}

// ArrowsCollectionVal holds a named collection of arrows sets.
type ArrowsCollectionVal struct {
	Entries []ArrowsCollectionEntry
}

func (ArrowsCollectionVal) valueTag() {}

// GraphVal holds a graph with a set of objects and a collection of named arrows.
type GraphVal struct {
	Objects []string
	Arrows  []ArrowsCollectionEntry // preserves definition order
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

func evalExpr(expr parser.Expr, c *Collection) (Value, error) {
	switch e := expr.(type) {
	case parser.ArrowsLiteral:
		entries := make([]parser.ArrowEntry, len(e.Entries))
		copy(entries, e.Entries)
		return ArrowsVal{Entries: entries}, nil

	case parser.SetLiteral:
		elems := make([]string, len(e.Elements))
		copy(elems, e.Elements)
		return SetVal{Elements: elems}, nil

	case parser.ArrowsCollectionLiteral:
		entries := make([]ArrowsCollectionEntry, len(e.Entries))
		for i, ace := range e.Entries {
			arrowEntries := make([]parser.ArrowEntry, len(ace.Arrows.Entries))
			copy(arrowEntries, ace.Arrows.Entries)
			entries[i] = ArrowsCollectionEntry{
				Name:   ace.Name,
				Arrows: ArrowsVal{Entries: arrowEntries},
			}
		}
		return ArrowsCollectionVal{Entries: entries}, nil

	case parser.GraphExpr:
		return evalGraphExpr(e, c)

	default:
		return nil, fmt.Errorf("unknown expression type %T", e)
	}
}

func evalGraphExpr(e parser.GraphExpr, c *Collection) (GraphVal, error) {
	objRaw, ok := c.Bindings[e.ObjectsName]
	if !ok {
		return GraphVal{}, fmt.Errorf("undefined name %q (must be a set defined before this graph)", e.ObjectsName)
	}
	sv, ok := objRaw.(SetVal)
	if !ok {
		return GraphVal{}, fmt.Errorf("%q is not a set", e.ObjectsName)
	}

	arrRaw, ok := c.Bindings[e.ArrowsName]
	if !ok {
		return GraphVal{}, fmt.Errorf("undefined name %q (must be an arrows-collection defined before this graph)", e.ArrowsName)
	}
	acv, ok := arrRaw.(ArrowsCollectionVal)
	if !ok {
		return GraphVal{}, fmt.Errorf("%q is not an arrows-collection", e.ArrowsName)
	}

	objects := make([]string, len(sv.Elements))
	copy(objects, sv.Elements)
	arrows := make([]ArrowsCollectionEntry, len(acv.Entries))
	copy(arrows, acv.Entries)
	return GraphVal{Objects: objects, Arrows: arrows}, nil
}
