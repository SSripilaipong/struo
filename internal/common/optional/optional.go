package optional

type Of[T any] struct {
	val     T
	present bool
}

func Some[T any](val T) Of[T] { return Of[T]{val: val, present: true} }
func None[T any]() Of[T]      { return Of[T]{} }

func (o Of[T]) IsPresent() bool   { return o.present }
func (o Of[T]) Unwrap() (T, bool) { return o.val, o.present }
