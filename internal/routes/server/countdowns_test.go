package server

import (
	"errors"
	"net/http"
	"testing"

	disgorest "github.com/disgoorg/disgo/rest"
)

func TestIsMissingCountdownChannel(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "unknown channel code",
			err: &disgorest.Error{
				Code:    disgorest.JSONErrorCodeUnknownChannel,
				Message: "Unknown Channel",
			},
			want: true,
		},
		{
			name: "not found response",
			err: &disgorest.Error{
				Response: &http.Response{StatusCode: http.StatusNotFound},
			},
			want: true,
		},
		{
			name: "other discord error",
			err: &disgorest.Error{
				Code:    disgorest.JSONErrorCodeLackPermissionsToPerformAction,
				Message: "Missing Permissions",
			},
			want: false,
		},
		{
			name: "ordinary error",
			err:  errors.New("connection reset"),
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isMissingCountdownChannel(tt.err); got != tt.want {
				t.Fatalf("isMissingCountdownChannel() = %v, want %v", got, tt.want)
			}
		})
	}
}
