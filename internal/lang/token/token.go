package token

type TokenType int

const (
	IDENT      TokenType = iota // [a-zA-Z][a-zA-Z0-9_]*
	EQUALS                      // =
	LBRACE                      // {
	RBRACE                      // }
	ARROW                       // ->
	COMMA                       // ,
	WHITESPACE                  // spaces/tabs
	NEWLINE                     // \n
	EOF
)

type Token struct {
	Type   TokenType
	Lexeme string
	Line   int
	Column int
}
