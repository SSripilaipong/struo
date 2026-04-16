package optional

type Of[T any] struct {
	val     T
	present bool
}

func Some[T any](val T) Of[T] { return Of[T]{val: val, present: true} }
func None[T any]() Of[T]      { return Of[T]{} }

func (o Of[T]) IsPresent() bool   { return o.present }
func (o Of[T]) Unwrap() (T, bool) { return o.val, o.present }

// FromPtr converts a *T (nil = absent) to Of[T].
func FromPtr[T any](p *T) Of[T] {
	if p == nil {
		return None[T]()
	}
	return Some(*p)
}

// ToPtr converts Of[T] to *T (nil when None).
func ToPtr[T any](o Of[T]) *T {
	if v, ok := o.Unwrap(); ok {
		return &v
	}
	return nil
}
