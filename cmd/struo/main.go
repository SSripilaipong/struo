package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"struo/internal/assets"
	"struo/internal/lang/interpreter"
	"struo/internal/lang/parser"
	"struo/internal/lang/tokenizer"
	"struo/internal/server"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	dev := flag.Bool("dev", false, "serve frontend assets from internal/assets/dist on disk")
	flag.Parse()

	// Read and evaluate index.sto from the working directory.
	src, err := os.ReadFile("index.sto")
	if err != nil {
		log.Fatalf("error reading index.sto: %v", err)
	}

	tokens, err := tokenizer.Tokenize(string(src))
	if err != nil {
		log.Fatalf("tokenize error: %v", err)
	}

	prog, err := parser.Parse(tokens)
	if err != nil {
		log.Fatalf("parse error: %v", err)
	}

	collection, err := interpreter.Interpret(prog)
	if err != nil {
		log.Fatalf("interpret error: %v", err)
	}

	// Choose static file source: embedded FS or disk for development.
	var staticFS fs.FS
	if *dev {
		staticFS = os.DirFS("internal/assets/dist")
	} else {
		staticFS, err = fs.Sub(assets.FS, "dist")
		if err != nil {
			log.Fatalf("embed error: %v", err)
		}
	}

	srv := server.New(collection, staticFS)
	if err := srv.Run(*addr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
