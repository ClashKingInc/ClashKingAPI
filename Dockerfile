FROM golang:1.26.5-alpine AS builder

WORKDIR /src

RUN apk add --no-cache ca-certificates git

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o /out/clashking-api .

FROM alpine:3.22

LABEL org.opencontainers.image.source=https://github.com/ClashKingInc/ClashKingAPI
LABEL org.opencontainers.image.description="Image for the ClashKing API"
LABEL org.opencontainers.image.licenses=MIT

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S clashking \
    && adduser -S -G clashking clashking

WORKDIR /app

COPY --from=builder --chown=clashking:clashking /out/clashking-api /app/clashking-api

USER clashking

EXPOSE 8010

CMD ["/app/clashking-api"]
