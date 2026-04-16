package interpreter

import (
	"fmt"
	"iter"
	"struo/internal/common/optional"
	"struo/internal/lang/parser"
)

// Value is the runtime value interface.
type Value interface{ valueTag() }

// ArrowEntry is a single directed edge with an optional label.
type ArrowEntry struct {
	Label optional.Of[string]
	From  string
	To    string
}

// ArrowVal holds a single evaluated arrow.
type ArrowVal struct {
	Label optional.Of[string]
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

// GraphObjectEntry represents one entry in a graph's objects list.
// SubGraph is Some when the object is a reference to another graph variable.
type GraphObjectEntry struct {
	Name     string
	SubGraph optional.Of[GraphVal]
}

// GraphVal holds a graph with a set of objects and a list of arrows.
type GraphVal struct {
	Objects []GraphObjectEntry
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

func evalExpr(expr parser.Expr, c *Collection) (Value, error) {
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
		var objects []GraphObjectEntry
		if objsLit, ok := e.Objects.Unwrap(); ok {
			for _, entry := range objsLit.Entries {
				if ref, ok := entry.Ref.Unwrap(); ok {
					refVal, exists := c.Bindings[ref]
					if !exists {
						return nil, fmt.Errorf("object ref %q not found", ref)
					}
					subGraph, ok := refVal.(GraphVal)
					if !ok {
						return nil, fmt.Errorf("object ref %q is not a graph", ref)
					}
					objects = append(objects, GraphObjectEntry{Name: entry.Name, SubGraph: optional.Some(subGraph)})
				} else {
					objects = append(objects, GraphObjectEntry{Name: entry.Name, SubGraph: optional.None[GraphVal]()})
				}
			}
		} else {
			seen := map[string]bool{}
			for _, ae := range e.Arrows.Entries {
				for _, node := range []string{ae.From, ae.To} {
					if !seen[node] {
						seen[node] = true
						objects = append(objects, GraphObjectEntry{Name: node, SubGraph: optional.None[GraphVal]()})
					}
				}
			}
		}

		var arrows []ArrowEntry
		for _, ae := range e.Arrows.Entries {
			body, hasBody := ae.Body.Unwrap()
			if !hasBody {
				arrows = append(arrows, ArrowEntry{Label: ae.Label, From: ae.From, To: ae.To})
				continue
			}
			// Look up the body arrows-collection variable.
			bodyVal, exists := c.Bindings[body]
			if !exists {
				return nil, fmt.Errorf("arrow body ref %q not found", body)
			}
			bodyArrows, ok := bodyVal.(ArrowsVal)
			if !ok {
				return nil, fmt.Errorf("arrow body ref %q is not an arrows collection", body)
			}
			// Optionally validate: each inner arrow's From must be in the source graph.
			var sourceGraph *GraphVal
			for i := range objects {
				if objects[i].Name == ae.From {
					if sub, ok := objects[i].SubGraph.Unwrap(); ok {
						sourceGraph = &sub
					}
					break
				}
			}
			// Expand inner arrows with compound labels.
			outerLabel, hasOuter := ae.Label.Unwrap()
			for _, inner := range bodyArrows.Entries {
				if sourceGraph != nil {
					valid := false
					for _, o := range sourceGraph.Objects {
						if o.Name == inner.From {
							valid = true
							break
						}
					}
					if !valid {
						return nil, fmt.Errorf("arrow body %q: endpoint %q is not in source graph %q", body, inner.From, ae.From)
					}
				}
				innerLabel, hasInner := inner.Label.Unwrap()
				var compLabel optional.Of[string]
				switch {
				case hasOuter && hasInner:
					compLabel = optional.Some(outerLabel + "::" + innerLabel)
				case hasOuter:
					compLabel = optional.Some(outerLabel)
				case hasInner:
					compLabel = optional.Some(innerLabel)
				default:
					compLabel = optional.None[string]()
				}
				arrows = append(arrows, ArrowEntry{Label: compLabel, From: inner.From, To: inner.To})
			}
		}
		return GraphVal{Objects: objects, Arrows: arrows}, nil

	default:
		return nil, fmt.Errorf("unknown expression type %T", e)
	}
}
