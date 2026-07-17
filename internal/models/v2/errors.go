package modelsv2

type ErrorCode string

const (
	ErrorCodeInvalidRequest      ErrorCode = "invalid_request"
	ErrorCodeValidationFailed    ErrorCode = "validation_failed"
	ErrorCodeUnauthenticated     ErrorCode = "unauthenticated"
	ErrorCodeForbidden           ErrorCode = "forbidden"
	ErrorCodeNotFound            ErrorCode = "not_found"
	ErrorCodeConflict            ErrorCode = "conflict"
	ErrorCodeRateLimited         ErrorCode = "rate_limited"
	ErrorCodeUpstreamUnavailable ErrorCode = "upstream_unavailable"
	ErrorCodeInternal            ErrorCode = "internal_error"
)

type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

type ErrorResponse struct {
	Code      ErrorCode    `json:"code"`
	Message   string       `json:"message"`
	RequestID string       `json:"request_id,omitempty"`
	Details   []FieldError `json:"details,omitempty"`
}

type AccountConflictErrorResponse struct {
	Code      ErrorCode            `json:"code"`
	Message   string               `json:"message"`
	RequestID string               `json:"request_id,omitempty"`
	Account   AccountsLinkedPlayer `json:"account"`
}
