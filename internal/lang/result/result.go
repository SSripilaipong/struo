package result

type Result[T any] struct {
	val T
	err error
}

func Ok[T any](val T) Result[T]      { return Result[T]{val: val} }
func Err[T any](err error) Result[T] { return Result[T]{err: err} }

func (r Result[T]) IsOk() bool         { return r.err == nil }
func (r Result[T]) Unwrap() (T, error) { return r.val, r.err }
