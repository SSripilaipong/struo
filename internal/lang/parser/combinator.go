package parser

import (
	"fmt"
	"struo/internal/common/result"
	"struo/internal/common/tuple"
	"struo/internal/lang/token"
)

type Parser[R any] = func([]token.Token) result.Result[tuple.Of2[R, []token.Token]]

func Satisfy(pred func(token.Token) bool) Parser[token.Token] {
	return func(tokens []token.Token) result.Result[tuple.Of2[token.Token, []token.Token]] {
		if len(tokens) == 0 || tokens[0].Type == token.EOF {
			return result.Err[tuple.Of2[token.Token, []token.Token]](fmt.Errorf("unexpected end of input"))
		}
		if pred(tokens[0]) {
			return result.Ok(tuple.T2(tokens[0], tokens[1:]))
		}
		return result.Err[tuple.Of2[token.Token, []token.Token]](
			fmt.Errorf("unexpected token %q at line %d col %d", tokens[0].Lexeme, tokens[0].Line, tokens[0].Column),
		)
	}
}

func Map[A, B any](f func(A) B, p Parser[A]) Parser[B] {
	return func(tokens []token.Token) result.Result[tuple.Of2[B, []token.Token]] {
		r := p(tokens)
		val, err := r.Unwrap()
		if err != nil {
			return result.Err[tuple.Of2[B, []token.Token]](err)
		}
		return result.Ok(tuple.T2(f(val.V1), val.V2))
	}
}

func Sequence2[A, B any](a Parser[A], b Parser[B]) Parser[tuple.Of2[A, B]] {
	return func(tokens []token.Token) result.Result[tuple.Of2[tuple.Of2[A, B], []token.Token]] {
		ra := a(tokens)
		va, err := ra.Unwrap()
		if err != nil {
			return result.Err[tuple.Of2[tuple.Of2[A, B], []token.Token]](err)
		}
		rb := b(va.V2)
		vb, err := rb.Unwrap()
		if err != nil {
			return result.Err[tuple.Of2[tuple.Of2[A, B], []token.Token]](err)
		}
		return result.Ok(tuple.T2(tuple.T2(va.V1, vb.V1), vb.V2))
	}
}

func Sequence3[A, B, C any](a Parser[A], b Parser[B], c Parser[C]) Parser[tuple.Of3[A, B, C]] {
	return func(tokens []token.Token) result.Result[tuple.Of2[tuple.Of3[A, B, C], []token.Token]] {
		ra := a(tokens)
		va, err := ra.Unwrap()
		if err != nil {
			return result.Err[tuple.Of2[tuple.Of3[A, B, C], []token.Token]](err)
		}
		rb := b(va.V2)
		vb, err := rb.Unwrap()
		if err != nil {
			return result.Err[tuple.Of2[tuple.Of3[A, B, C], []token.Token]](err)
		}
		rc := c(vb.V2)
		vc, err := rc.Unwrap()
		if err != nil {
			return result.Err[tuple.Of2[tuple.Of3[A, B, C], []token.Token]](err)
		}
		return result.Ok(tuple.T2(tuple.T3(va.V1, vb.V1, vc.V1), vc.V2))
	}
}

func Choice[A any](parsers ...Parser[A]) Parser[A] {
	return func(tokens []token.Token) result.Result[tuple.Of2[A, []token.Token]] {
		var lastErr error
		for _, p := range parsers {
			r := p(tokens)
			if r.IsOk() {
				return r
			}
			_, lastErr = r.Unwrap()
		}
		return result.Err[tuple.Of2[A, []token.Token]](lastErr)
	}
}

func Optional[A any](p Parser[A]) Parser[*A] {
	return func(tokens []token.Token) result.Result[tuple.Of2[*A, []token.Token]] {
		r := p(tokens)
		if r.IsOk() {
			val, _ := r.Unwrap()
			return result.Ok(tuple.T2(&val.V1, val.V2))
		}
		return result.Ok(tuple.T2((*A)(nil), tokens))
	}
}

func RepeatAnyTimes[A any](p Parser[A]) Parser[[]A] {
	return func(tokens []token.Token) result.Result[tuple.Of2[[]A, []token.Token]] {
		var items []A
		remaining := tokens
		for {
			r := p(remaining)
			if !r.IsOk() {
				break
			}
			val, _ := r.Unwrap()
			items = append(items, val.V1)
			remaining = val.V2
		}
		return result.Ok(tuple.T2(items, remaining))
	}
}

func RepeatOneOrMore[A any](p Parser[A]) Parser[[]A] {
	return func(tokens []token.Token) result.Result[tuple.Of2[[]A, []token.Token]] {
		r := RepeatAnyTimes(p)(tokens)
		val, _ := r.Unwrap()
		if len(val.V1) == 0 {
			return result.Err[tuple.Of2[[]A, []token.Token]](fmt.Errorf("expected at least one match"))
		}
		return r
	}
}

func wsTokenP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool {
		return t.Type == token.WHITESPACE || t.Type == token.NEWLINE
	})
}

func inlineWsP() Parser[token.Token] {
	return Satisfy(func(t token.Token) bool { return t.Type == token.WHITESPACE })
}

func skipWS() Parser[[]token.Token]       { return RepeatAnyTimes(wsTokenP()) }
func skipInlineWS() Parser[[]token.Token] { return RepeatAnyTimes(inlineWsP()) }

// Sequence2WithWhiteSpace parses x, skips any whitespace/newlines, then parses y.
func Sequence2WithWhiteSpace[A, B any](x Parser[A], y Parser[B]) Parser[tuple.Of2[A, B]] {
	return Map(
		tuple.T3Drop2[A, []token.Token, B],
		Sequence3(x, skipWS(), y),
	)
}

// Sequence2WithInlineWS parses x, skips only spaces/tabs (not newlines), then parses y.
func Sequence2WithInlineWS[A, B any](x Parser[A], y Parser[B]) Parser[tuple.Of2[A, B]] {
	return Map(
		tuple.T3Drop2[A, []token.Token, B],
		Sequence3(x, skipInlineWS(), y),
	)
}
