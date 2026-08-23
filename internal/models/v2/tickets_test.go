package modelsv2

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestUpsertEmbedRequestPreservesFullMessagePayload(t *testing.T) {
	input := []byte(`{
		"name":"Bienvenue",
		"data":{
			"application_id":9007199254740993,
			"username":"ClashKing",
			"messages":[{
				"data":{
					"content":"Welcome to the server",
					"embeds":[{"title":"Bienvenue","description":"Choose your roles"}]
				}
			}]
		}
	}`)

	var request UpsertEmbedRequest
	if err := json.Unmarshal(input, &request); err != nil {
		t.Fatalf("decode embed request: %v", err)
	}

	messages, ok := request.Data["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected the messages wrapper to be preserved, got %#v", request.Data["messages"])
	}
	message, ok := messages[0].(map[string]any)
	if !ok {
		t.Fatalf("expected a message object, got %#v", messages[0])
	}
	data, ok := message["data"].(map[string]any)
	if !ok || data["content"] != "Welcome to the server" {
		t.Fatalf("expected nested message data to be preserved, got %#v", message["data"])
	}

	applicationID, ok := request.Data["application_id"].(json.Number)
	if !ok || applicationID.String() != "9007199254740993" {
		t.Fatalf("expected the large integer to remain exact, got %#v", request.Data["application_id"])
	}
	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("encode embed request: %v", err)
	}
	if !bytes.Contains(encoded, []byte(`"application_id":9007199254740993`)) {
		t.Fatalf("expected encoded payload to preserve the large integer, got %s", encoded)
	}
}
