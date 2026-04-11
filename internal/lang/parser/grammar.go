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

// upperIdentTokenP matches identifiers that start with an uppercase letter (variable names).
func upperIdentTokenP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool {
		return t.Type == token.IDENT && len(t.Lexeme) > 0 && t.Lexeme[0] >= 'A' && t.Lexeme[0] <= 'Z'
	})
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

// arrowExprP parses: (IDENT ':' WS?)? IDENT WS? '->' WS? IDENT
// Optional label uses backtracking via Optional combinator.
func arrowExprP() Parser[ArrowExpr] {
	// label part: IDENT ':'  (Optional will backtrack if ':' is not found)
	labelP := Map(
		func(t tuple.Of2[token.Token, token.Token]) string { return t.V1.Lexeme },
		Sequence2WithInlineWS(identTokenP(), colonTokenP()),
	)
	// from -> to
	fromToP := Sequence2WithInlineWS(
		identTokenP(),
		Sequence2WithInlineWS(arrowTokenP(), identTokenP()),
	)
	return Map(
		func(t tuple.Of2[*string, tuple.Of2[token.Token, tuple.Of2[token.Token, token.Token]]]) ArrowExpr {
			return ArrowExpr{Label: t.V1, From: t.V2.V1.Lexeme, To: t.V2.V2.V2.Lexeme}
		},
		Sequence2WithInlineWS(Optional(labelP), fromToP),
	)
}

// arrowExprsP parses: arrowExpr (',' WS? arrowExpr)*
func arrowExprsP() Parser[[]ArrowExpr] {
	tailP := Map(
		func(t tuple.Of2[token.Token, ArrowExpr]) ArrowExpr { return t.V2 },
		Sequence2WithInlineWS(commaTokenP(), arrowExprP()),
	)
	return Map(
		func(t tuple.Of2[ArrowExpr, []ArrowExpr]) []ArrowExpr {
			return append([]ArrowExpr{t.V1}, t.V2...)
		},
		Sequence2(arrowExprP(), RepeatAnyTimes(tailP)),
	)
}

// arrowsLiteralP parses: '{' WS? arrowExprs? WS? '}'
func arrowsLiteralP() Parser[ArrowsLiteral] {
	innerP := Map(
		func(t tuple.Of2[[]token.Token, tuple.Of2[*[]ArrowExpr, []token.Token]]) []ArrowExpr {
			if t.V2.V1 == nil {
				return nil
			}
			return *t.V2.V1
		},
		Sequence2(skipInlineWS(), Sequence2(Optional(arrowExprsP()), skipInlineWS())),
	)
	return Map(
		func(t tuple.Of3[token.Token, []ArrowExpr, token.Token]) ArrowsLiteral {
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

// graphExprP parses: 'graph' '{' WS? 'objects' ':' WS? setLiteral WS? ',' WS? 'arrows' ':' WS? arrowsLiteral WS? '}'
func graphExprP() Parser[GraphExpr] {
	// objects: <setLiteral>
	objectsFieldP := Map(
		func(t tuple.Of2[token.Token, tuple.Of2[token.Token, SetLiteral]]) SetLiteral {
			return t.V2.V2
		},
		Sequence2WithInlineWS(identKeywordP("objects"), Sequence2WithInlineWS(colonTokenP(), setLiteralP())),
	)
	// arrows: <arrowsLiteral>
	arrowsFieldP := Map(
		func(t tuple.Of2[token.Token, tuple.Of2[token.Token, ArrowsLiteral]]) ArrowsLiteral {
			return t.V2.V2
		},
		Sequence2WithInlineWS(identKeywordP("arrows"), Sequence2WithInlineWS(colonTokenP(), arrowsLiteralP())),
	)
	// objects ',' arrows
	fieldsP := Map(
		func(t tuple.Of2[SetLiteral, tuple.Of2[token.Token, ArrowsLiteral]]) tuple.Of2[SetLiteral, ArrowsLiteral] {
			return tuple.Of2[SetLiteral, ArrowsLiteral]{V1: t.V1, V2: t.V2.V2}
		},
		Sequence2WithWhiteSpace(objectsFieldP, Sequence2WithWhiteSpace(commaTokenP(), arrowsFieldP)),
	)
	// WS? fields WS?
	innerP := Map(
		func(t tuple.Of2[[]token.Token, tuple.Of2[tuple.Of2[SetLiteral, ArrowsLiteral], []token.Token]]) tuple.Of2[SetLiteral, ArrowsLiteral] {
			return t.V2.V1
		},
		Sequence2(skipWS(), Sequence2(fieldsP, skipWS())),
	)
	// 'graph' '{' inner '}'
	bodyP := Map(
		func(t tuple.Of3[token.Token, tuple.Of2[SetLiteral, ArrowsLiteral], token.Token]) GraphExpr {
			return GraphExpr{Objects: t.V2.V1, Arrows: t.V2.V2}
		},
		Sequence3(lbraceTokenP(), innerP, rbraceTokenP()),
	)
	return Map(
		func(t tuple.Of2[token.Token, GraphExpr]) GraphExpr { return t.V2 },
		Sequence2(identKeywordP("graph"), bodyP),
	)
}

// exprP parses any expression.
// Order: graph (keyword 'graph') > single arrow (IDENT with ->) > arrows literal ({...}) > set literal ({...})
func exprP() Parser[Expr] {
	return Choice(
		Map(func(g GraphExpr) Expr { return g }, graphExprP()),
		Map(func(a ArrowExpr) Expr { return a }, arrowExprP()),
		Map(func(l ArrowsLiteral) Expr { return l }, arrowsLiteralP()),
		Map(func(l SetLiteral) Expr { return l }, setLiteralP()),
	)
}

// definitionP parses: UPPER_IDENT WS? '=' WS? expr
func definitionP() Parser[Definition] {
	nameEqP := Sequence2WithInlineWS(upperIdentTokenP(), equalsTokenP())
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
