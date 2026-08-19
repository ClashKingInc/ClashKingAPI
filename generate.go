package main

//go:generate go run github.com/swaggo/swag/cmd/swag@v1.16.6 init --generalInfo main.go --output internal/docs --parseInternal --outputTypes go
//go:generate go run ./cmd/openapi
