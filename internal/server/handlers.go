package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"struo/internal/lang/interpreter"
)

// htmlShell is the HTML page wrapper. The server injects the appropriate
// web component into %s depending on the route.
const htmlShell = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>struo</title>
  <link rel="stylesheet" href="/assets/index.css">
  <script type="module" src="/assets/index.js"></script>
</head>
<body>%s</body>
</html>`

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, htmlShell, `<struo-collection></struo-collection>`)
}

func (s *Server) handleArrowsPage(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, htmlShell, fmt.Sprintf(`<struo-arrows name="%s"></struo-arrows>`, name))
}

func (s *Server) handleSetPage(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, htmlShell, fmt.Sprintf(`<struo-set name="%s"></struo-set>`, name))
}

func (s *Server) handleGraphPage(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, htmlShell, fmt.Sprintf(`<struo-graph name="%s"></struo-graph>`, name))
}

// --- API handlers ---

type collectionItem struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type collectionResponse struct {
	Items []collectionItem `json:"items"`
}

func valueTypeName(v interpreter.Value) string {
	switch v.(type) {
	case interpreter.ArrowsVal:
		return "arrows"
	case interpreter.SetVal:
		return "set"
	case interpreter.ArrowsCollectionVal:
		return "arrows-collection"
	case interpreter.GraphVal:
		return "graph"
	default:
		return "unknown"
	}
}

func (s *Server) handleAPICollection(w http.ResponseWriter, r *http.Request) {
	items := make([]collectionItem, 0, len(s.collection.Order))
	for name, val := range s.collection.All() {
		items = append(items, collectionItem{Name: name, Type: valueTypeName(val)})
	}
	writeJSON(w, collectionResponse{Items: items})
}

type arrowEntryJSON struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type arrowsResponse struct {
	Name    string           `json:"name"`
	Entries []arrowEntryJSON `json:"entries"`
}

func (s *Server) handleAPIArrows(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	val, ok := s.collection.Bindings[name]
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	av, ok := val.(interpreter.ArrowsVal)
	if !ok {
		http.Error(w, "not arrows", http.StatusNotFound)
		return
	}
	entries := make([]arrowEntryJSON, len(av.Entries))
	for i, e := range av.Entries {
		entries[i] = arrowEntryJSON{From: e.From, To: e.To}
	}
	writeJSON(w, arrowsResponse{Name: name, Entries: entries})
}

type setResponse struct {
	Name     string   `json:"name"`
	Elements []string `json:"elements"`
}

func (s *Server) handleAPISet(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	val, ok := s.collection.Bindings[name]
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	sv, ok := val.(interpreter.SetVal)
	if !ok {
		http.Error(w, "not a set", http.StatusNotFound)
		return
	}
	writeJSON(w, setResponse{Name: name, Elements: sv.Elements})
}

type graphResponse struct {
	Name    string                       `json:"name"`
	Objects []string                     `json:"objects"`
	Arrows  map[string][]arrowEntryJSON  `json:"arrows"`
}

func (s *Server) handleAPIGraph(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	val, ok := s.collection.Bindings[name]
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	gv, ok := val.(interpreter.GraphVal)
	if !ok {
		http.Error(w, "not a graph", http.StatusNotFound)
		return
	}
	arrowsMap := make(map[string][]arrowEntryJSON, len(gv.Arrows))
	for _, ace := range gv.Arrows {
		entries := make([]arrowEntryJSON, len(ace.Arrows.Entries))
		for i, e := range ace.Arrows.Entries {
			entries[i] = arrowEntryJSON{From: e.From, To: e.To}
		}
		arrowsMap[ace.Name] = entries
	}
	writeJSON(w, graphResponse{Name: name, Objects: gv.Objects, Arrows: arrowsMap})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, "encoding error", http.StatusInternalServerError)
	}
}
