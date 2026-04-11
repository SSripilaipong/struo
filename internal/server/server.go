package server

import (
	"io/fs"
	"log"
	"net/http"
	"struo/internal/lang/interpreter"
)

// Server holds the evaluated collection and static file system.
type Server struct {
	collection *interpreter.Collection
	static     fs.FS
}

// New creates a Server with the given collection and static asset FS.
func New(collection *interpreter.Collection, static fs.FS) *Server {
	return &Server{collection: collection, static: static}
}

// Handler returns an http.Handler with all routes configured.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /{$}", s.handleIndex)
	mux.HandleFunc("GET /_arrows/{name}", s.handleArrowsPage)
	mux.HandleFunc("GET /_set/{name}", s.handleSetPage)
	mux.HandleFunc("GET /_graph/{name}", s.handleGraphPage)
	mux.HandleFunc("GET /api/collection", s.handleAPICollection)
	mux.HandleFunc("GET /api/arrows/{name}", s.handleAPIArrows)
	mux.HandleFunc("GET /api/set/{name}", s.handleAPISet)
	mux.HandleFunc("GET /api/graph/{name}", s.handleAPIGraph)
	mux.Handle("GET /assets/", http.FileServer(http.FS(s.static)))

	return mux
}

// Run starts the HTTP server on addr.
func (s *Server) Run(addr string) error {
	log.Printf("struo listening on http://%s", addr)
	return http.ListenAndServe(addr, s.Handler())
}
