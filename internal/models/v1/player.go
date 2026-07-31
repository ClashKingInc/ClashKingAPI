package modelsv1

// PlayerLegendsResponse is returned by GET /player/:player_tag/legends.
type PlayerLegendsResponse struct {
	Name     any `json:"name"`
	Tag      any `json:"tag"`
	Townhall any `json:"townhall"`
	Legends  any `json:"legends"`
	Rankings any `json:"rankings"`
	Streak   any `json:"streak"`
}
