package parser

import (
	"fmt"
	"struo/internal/lang/token"
	"struo/internal/lang/tuple"
)

// Parse tokenizes a struo program and returns the AST or an error.
// It errors if tokens remain unconsumed after the program.
func Parse(tokens []token.Token) (Program, error) {
	p := programP()
	r := p.Parse(tokens)
	val, err := r.Unwrap()
	if err != nil {
		return Program{}, err
	}
	remaining := val.V2
	// Remaining should be empty or just EOF.
	if len(remaining) > 0 && remaining[0].Type != token.EOF {
		t := remaining[0]
		return Program{}, fmt.Errorf("unexpected token %q at line %d col %d", t.Lexeme, t.Line, t.Column)
	}
	return val.V1, nil
}

// --- token matchers ---

func identTokenP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool { return t.Type == token.IDENT })
}

func equalsTokenP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool { return t.Type == token.EQUALS })
}

func lbraceTokenP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool { return t.Type == token.LBRACE })
}

func rbraceTokenP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool { return t.Type == token.RBRACE })
}

func arrowTokenP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool { return t.Type == token.ARROW })
}

func commaTokenP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool { return t.Type == token.COMMA })
}

// --- grammar rules ---

// mappingEntryP parses: IDENT WS? '->' WS? IDENT
func mappingEntryP() Parser[MappingEntry] {
	// from -> to, with optional inline whitespace around the arrow
	fromToP := Sequence2WithInlineWS(
		identTokenP(),
		Sequence2WithInlineWS(arrowTokenP(), identTokenP()),
	)
	return Map(
		func(t tuple.Of2[token.Token, tuple.Of2[token.Token, token.Token]]) MappingEntry {
			return MappingEntry{From: t.V1.Lexeme, To: t.V2.V2.Lexeme}
		},
		fromToP,
	)
}

// mappingEntriesP parses: mappingEntry (',' WS? mappingEntry)*
func mappingEntriesP() Parser[[]MappingEntry] {
	tailEntryP := Map(
		func(t tuple.Of2[token.Token, MappingEntry]) MappingEntry { return t.V2 },
		Sequence2WithInlineWS(commaTokenP(), mappingEntryP()),
	)
	return Map(
		func(t tuple.Of2[MappingEntry, []MappingEntry]) []MappingEntry {
			return append([]MappingEntry{t.V1}, t.V2...)
		},
		Sequence2(mappingEntryP(), RepeatAnyTimes(tailEntryP)),
	)
}

// mappingLiteralP parses: '{' WS? mappingEntries? WS? '}'
func mappingLiteralP() Parser[MappingLiteral] {
	innerP := Map(
		func(t tuple.Of2[[]token.Token, tuple.Of2[*[]MappingEntry, []token.Token]]) []MappingEntry {
			if t.V2.V1 == nil {
				return nil
			}
			return *t.V2.V1
		},
		Sequence2(skipInlineWS(), Sequence2(Optional(mappingEntriesP()), skipInlineWS())),
	)
	return Map(
		func(t tuple.Of3[token.Token, []MappingEntry, token.Token]) MappingLiteral {
			return MappingLiteral{Entries: t.V2}
		},
		Sequence3(lbraceTokenP(), innerP, rbraceTokenP()),
	)
}

// exprP parses any expression (V1: only mapping literals).
func exprP() Parser[Expr] {
	return Map(
		func(m MappingLiteral) Expr { return m },
		mappingLiteralP(),
	)
}

// definitionP parses: IDENT WS? '=' WS? expr
func definitionP() Parser[Definition] {
	nameEqP := Sequence2WithInlineWS(identTokenP(), equalsTokenP())
	return Map(
		func(t tuple.Of2[tuple.Of2[token.Token, token.Token], Expr]) Definition {
			return Definition{Name: t.V1.V1.Lexeme, Expr: t.V2}
		},
		Sequence2WithInlineWS(nameEqP, exprP()),
	)
}

// programP parses: WS? (definition WS?)* EOF
func programP() Parser[Program] {
	defWithSepP := Map(
		func(t tuple.Of2[Definition, []token.Token]) Definition { return t.V1 },
		Sequence2(definitionP(), skipWS()),
	)
	return Map(
		func(t tuple.Of2[[]token.Token, []Definition]) Program {
			return Program{Defs: t.V2}
		},
		Sequence2(skipWS(), RepeatAnyTimes(defWithSepP)),
	)
}
