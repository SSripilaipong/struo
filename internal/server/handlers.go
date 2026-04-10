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

func (s *Server) handleMappingPage(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, htmlShell, fmt.Sprintf(`<struo-mapping name="%s"></struo-mapping>`, name))
}

// --- API handlers ---

type collectionItem struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type collectionResponse struct {
	Items []collectionItem `json:"items"`
}

func (s *Server) handleAPICollection(w http.ResponseWriter, r *http.Request) {
	items := make([]collectionItem, 0, len(s.collection.Order))
	for name := range s.collection.All() {
		items = append(items, collectionItem{Name: name, Type: "mapping"})
	}
	writeJSON(w, collectionResponse{Items: items})
}

type mappingEntry struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type mappingResponse struct {
	Name    string         `json:"name"`
	Entries []mappingEntry `json:"entries"`
}

func (s *Server) handleAPIMapping(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	val, ok := s.collection.Bindings[name]
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	mv, ok := val.(interpreter.MappingVal)
	if !ok {
		http.Error(w, "not a mapping", http.StatusInternalServerError)
		return
	}
	entries := make([]mappingEntry, len(mv.Entries))
	for i, e := range mv.Entries {
		entries[i] = mappingEntry{From: e.From, To: e.To}
	}
	writeJSON(w, mappingResponse{Name: name, Entries: entries})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, "encoding error", http.StatusInternalServerError)
	}
}
