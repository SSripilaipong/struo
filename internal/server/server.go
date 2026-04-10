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
	mux.HandleFunc("GET /_mapping/{name}", s.handleMappingPage)
	mux.HandleFunc("GET /api/collection", s.handleAPICollection)
	mux.HandleFunc("GET /api/mapping/{name}", s.handleAPIMapping)
	mux.Handle("GET /assets/", http.FileServer(http.FS(s.static)))

	return mux
}

// Run starts the HTTP server on addr.
func (s *Server) Run(addr string) error {
	log.Printf("struo listening on http://%s", addr)
	return http.ListenAndServe(addr, s.Handler())
}
