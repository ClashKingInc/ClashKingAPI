package modelsv2

// PaginationMeta describes a limit/offset paginated response.
type PaginationMeta struct {
	Limit          int  `json:"limit"`
	Offset         int  `json:"offset"`
	Total          int  `json:"total"`
	HasMore        bool `json:"has_more"`
	NextOffset     any  `json:"next_offset"`
	PreviousOffset any  `json:"previous_offset"`
}
