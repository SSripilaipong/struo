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
	r := p(tokens)
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

func identKeywordP(keyword string) Parser[token.Token] {
	return Satisfy(func(t token.Token) bool { return t.Type == token.IDENT && t.Lexeme == keyword })
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

func colonTokenP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool { return t.Type == token.COLON })
}

// --- grammar rules ---

// arrowEntryP parses: IDENT WS? '->' WS? IDENT
func arrowEntryP() Parser[ArrowEntry] {
	fromToP := Sequence2WithInlineWS(
		identTokenP(),
		Sequence2WithInlineWS(arrowTokenP(), identTokenP()),
	)
	return Map(
		func(t tuple.Of2[token.Token, tuple.Of2[token.Token, token.Token]]) ArrowEntry {
			return ArrowEntry{From: t.V1.Lexeme, To: t.V2.V2.Lexeme}
		},
		fromToP,
	)
}

// arrowEntriesP parses: arrowEntry (',' WS? arrowEntry)*
func arrowEntriesP() Parser[[]ArrowEntry] {
	tailEntryP := Map(
		func(t tuple.Of2[token.Token, ArrowEntry]) ArrowEntry { return t.V2 },
		Sequence2WithInlineWS(commaTokenP(), arrowEntryP()),
	)
	return Map(
		func(t tuple.Of2[ArrowEntry, []ArrowEntry]) []ArrowEntry {
			return append([]ArrowEntry{t.V1}, t.V2...)
		},
		Sequence2(arrowEntryP(), RepeatAnyTimes(tailEntryP)),
	)
}

// arrowsLiteralP parses: '{' WS? arrowEntries? WS? '}'
func arrowsLiteralP() Parser[ArrowsLiteral] {
	innerP := Map(
		func(t tuple.Of2[[]token.Token, tuple.Of2[*[]ArrowEntry, []token.Token]]) []ArrowEntry {
			if t.V2.V1 == nil {
				return nil
			}
			return *t.V2.V1
		},
		Sequence2(skipInlineWS(), Sequence2(Optional(arrowEntriesP()), skipInlineWS())),
	)
	return Map(
		func(t tuple.Of3[token.Token, []ArrowEntry, token.Token]) ArrowsLiteral {
			return ArrowsLiteral{Entries: t.V2}
		},
		Sequence3(lbraceTokenP(), innerP, rbraceTokenP()),
	)
}

// setElementsP parses: IDENT (',' WS? IDENT)*
func setElementsP() Parser[[]string] {
	tailP := Map(
		func(t tuple.Of2[token.Token, token.Token]) string { return t.V2.Lexeme },
		Sequence2WithInlineWS(commaTokenP(), identTokenP()),
	)
	return Map(
		func(t tuple.Of2[token.Token, []string]) []string {
			return append([]string{t.V1.Lexeme}, t.V2...)
		},
		Sequence2(identTokenP(), RepeatAnyTimes(tailP)),
	)
}

// setLiteralP parses: '{' WS? setElements? WS? '}'
func setLiteralP() Parser[SetLiteral] {
	innerP := Map(
		func(t tuple.Of2[[]token.Token, tuple.Of2[*[]string, []token.Token]]) []string {
			if t.V2.V1 == nil {
				return nil
			}
			return *t.V2.V1
		},
		Sequence2(skipInlineWS(), Sequence2(Optional(setElementsP()), skipInlineWS())),
	)
	return Map(
		func(t tuple.Of3[token.Token, []string, token.Token]) SetLiteral {
			return SetLiteral{Elements: t.V2}
		},
		Sequence3(lbraceTokenP(), innerP, rbraceTokenP()),
	)
}

// arrowsCollectionEntryP parses: IDENT WS? ':' WS? arrowsLiteral
func arrowsCollectionEntryP() Parser[ArrowsCollectionEntry] {
	return Map(
		func(t tuple.Of2[token.Token, tuple.Of2[token.Token, ArrowsLiteral]]) ArrowsCollectionEntry {
			return ArrowsCollectionEntry{Name: t.V1.Lexeme, Arrows: t.V2.V2}
		},
		Sequence2WithInlineWS(identTokenP(), Sequence2WithInlineWS(colonTokenP(), arrowsLiteralP())),
	)
}

// arrowsCollectionEntriesP parses: acEntry (',' WS? acEntry)*
func arrowsCollectionEntriesP() Parser[[]ArrowsCollectionEntry] {
	tailP := Map(
		func(t tuple.Of2[token.Token, ArrowsCollectionEntry]) ArrowsCollectionEntry { return t.V2 },
		Sequence2WithInlineWS(commaTokenP(), arrowsCollectionEntryP()),
	)
	return Map(
		func(t tuple.Of2[ArrowsCollectionEntry, []ArrowsCollectionEntry]) []ArrowsCollectionEntry {
			return append([]ArrowsCollectionEntry{t.V1}, t.V2...)
		},
		Sequence2(arrowsCollectionEntryP(), RepeatAnyTimes(tailP)),
	)
}

// arrowsCollectionLiteralP parses: '{' WS? acEntries? WS? '}'
func arrowsCollectionLiteralP() Parser[ArrowsCollectionLiteral] {
	innerP := Map(
		func(t tuple.Of2[[]token.Token, tuple.Of2[*[]ArrowsCollectionEntry, []token.Token]]) []ArrowsCollectionEntry {
			if t.V2.V1 == nil {
				return nil
			}
			return *t.V2.V1
		},
		Sequence2(skipInlineWS(), Sequence2(Optional(arrowsCollectionEntriesP()), skipInlineWS())),
	)
	return Map(
		func(t tuple.Of3[token.Token, []ArrowsCollectionEntry, token.Token]) ArrowsCollectionLiteral {
			return ArrowsCollectionLiteral{Entries: t.V2}
		},
		Sequence3(lbraceTokenP(), innerP, rbraceTokenP()),
	)
}

// graphExprP parses: 'Graph' '{' WS? 'Objects' ':' WS? IDENT WS? ',' WS? 'Arrows' ':' WS? IDENT WS? '}'
func graphExprP() Parser[GraphExpr] {
	// Objects: <name>
	objectsFieldP := Map(
		func(t tuple.Of2[token.Token, tuple.Of2[token.Token, token.Token]]) string {
			return t.V2.V2.Lexeme
		},
		Sequence2WithInlineWS(identKeywordP("Objects"), Sequence2WithInlineWS(colonTokenP(), identTokenP())),
	)
	// Arrows: <name>
	arrowsFieldP := Map(
		func(t tuple.Of2[token.Token, tuple.Of2[token.Token, token.Token]]) string {
			return t.V2.V2.Lexeme
		},
		Sequence2WithInlineWS(identKeywordP("Arrows"), Sequence2WithInlineWS(colonTokenP(), identTokenP())),
	)
	// Objects ',' Arrows
	fieldsP := Map(
		func(t tuple.Of2[string, tuple.Of2[token.Token, string]]) tuple.Of2[string, string] {
			return tuple.Of2[string, string]{V1: t.V1, V2: t.V2.V2}
		},
		Sequence2WithWhiteSpace(objectsFieldP, Sequence2WithWhiteSpace(commaTokenP(), arrowsFieldP)),
	)
	// WS? fields WS?
	innerP := Map(
		func(t tuple.Of2[[]token.Token, tuple.Of2[tuple.Of2[string, string], []token.Token]]) tuple.Of2[string, string] {
			return t.V2.V1
		},
		Sequence2(skipWS(), Sequence2(fieldsP, skipWS())),
	)
	// 'Graph' '{' inner '}'
	bodyP := Map(
		func(t tuple.Of3[token.Token, tuple.Of2[string, string], token.Token]) GraphExpr {
			return GraphExpr{ObjectsName: t.V2.V1, ArrowsName: t.V2.V2}
		},
		Sequence3(lbraceTokenP(), innerP, rbraceTokenP()),
	)
	return Map(
		func(t tuple.Of2[token.Token, GraphExpr]) GraphExpr { return t.V2 },
		Sequence2(identKeywordP("Graph"), bodyP),
	)
}

// exprP parses any expression.
func exprP() Parser[Expr] {
	return Choice(
		Map(func(g GraphExpr) Expr { return g }, graphExprP()),
		// Brace literals: try most specific first (IDENT COLON > IDENT ARROW > IDENT only)
		Map(func(l ArrowsCollectionLiteral) Expr { return l }, arrowsCollectionLiteralP()),
		Map(func(l ArrowsLiteral) Expr { return l }, arrowsLiteralP()),
		Map(func(l SetLiteral) Expr { return l }, setLiteralP()),
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
