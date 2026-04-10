package tokenizer

import (
	"fmt"
	"struo/internal/lang/token"
	"unicode"
)

type scanner struct {
	src []rune
	pos int
}

func (s *scanner) peek() (rune, bool) {
	if s.pos >= len(s.src) {
		return 0, false
	}
	return s.src[s.pos], true
}

func (s *scanner) advance() rune {
	r := s.src[s.pos]
	s.pos++
	return r
}

func makeToken(t token.TokenType, lexeme string, line, col int) token.Token {
	return token.Token{Type: t, Lexeme: lexeme, Line: line, Column: col}
}

// Tokenize converts a struo source string into a slice of tokens.
// Comments (# to end of line) are stripped. An EOF sentinel is appended.
func Tokenize(source string) ([]token.Token, error) {
	s := &scanner{src: []rune(source)}
	var tokens []token.Token
	line := 1
	col := 1

	for {
		r, ok := s.peek()
		if !ok {
			break
		}

		startLine, startCol := line, col

		switch {
		case r == '#':
			// Line comment: consume to end of line without emitting a token.
			for {
				ch, ok := s.peek()
				if !ok || ch == '\n' {
					break
				}
				s.advance()
				col++
			}

		case r == '\n':
			s.advance()
			tokens = append(tokens, makeToken(token.NEWLINE, "\n", startLine, startCol))
			line++
			col = 1

		case r == ' ' || r == '\t':
			var lexeme []rune
			for {
				ch, ok := s.peek()
				if !ok || (ch != ' ' && ch != '\t') {
					break
				}
				lexeme = append(lexeme, s.advance())
				col++
			}
			tokens = append(tokens, makeToken(token.WHITESPACE, string(lexeme), startLine, startCol))

		case r == '=':
			s.advance()
			col++
			tokens = append(tokens, makeToken(token.EQUALS, "=", startLine, startCol))

		case r == '{':
			s.advance()
			col++
			tokens = append(tokens, makeToken(token.LBRACE, "{", startLine, startCol))

		case r == '}':
			s.advance()
			col++
			tokens = append(tokens, makeToken(token.RBRACE, "}", startLine, startCol))

		case r == ',':
			s.advance()
			col++
			tokens = append(tokens, makeToken(token.COMMA, ",", startLine, startCol))

		case r == '-':
			s.advance()
			col++
			ch, ok := s.peek()
			if !ok || ch != '>' {
				return nil, fmt.Errorf("unexpected '-' at line %d col %d (expected '->')", startLine, startCol)
			}
			s.advance()
			col++
			tokens = append(tokens, makeToken(token.ARROW, "->", startLine, startCol))

		case unicode.IsLetter(r) || r == '_':
			var lexeme []rune
			lexeme = append(lexeme, s.advance()) // consume the first char
			col++
			for {
				ch, ok := s.peek()
				if !ok || (!unicode.IsLetter(ch) && !unicode.IsDigit(ch) && ch != '_') {
					break
				}
				lexeme = append(lexeme, s.advance())
				col++
			}
			tokens = append(tokens, makeToken(token.IDENT, string(lexeme), startLine, startCol))

		default:
			s.advance()
			return nil, fmt.Errorf("unexpected character %q at line %d col %d", r, startLine, startCol)
		}
	}

	tokens = append(tokens, makeToken(token.EOF, "", line, col))
	return tokens, nil
}
