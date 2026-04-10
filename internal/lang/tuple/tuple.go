package tuple

type Of2[A, B any] struct{ V1 A; V2 B }
type Of3[A, B, C any] struct{ V1 A; V2 B; V3 C }

func T2[A, B any](a A, b B) Of2[A, B]            { return Of2[A, B]{a, b} }
func T3[A, B, C any](a A, b B, c C) Of3[A, B, C] { return Of3[A, B, C]{a, b, c} }

// T3Drop2 drops the middle element: Of3[A,B,C] → Of2[A,C]
func T3Drop2[A, B, C any](t Of3[A, B, C]) Of2[A, C] { return Of2[A, C]{t.V1, t.V3} }
