package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// getServerGiveaways godoc
// @Summary Get server giveaways
// @Description Returns all giveaways for a server split by status (ongoing, scheduled, ended).
// @Tags Server Giveaways
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/{server_id}/giveaways [get]
func getServerGiveaways(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		cur, err := a.Store.C.Giveaways.Find(c.UserContext(), bson.M{"server_id": serverID})
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(c.UserContext(), &docs); err != nil {
			return err
		}
		winnerIdentities := giveawayWinnerIdentities(c, a, int64(serverID), docs)

		ongoing := make([]modelsv2.GiveawayConfig, 0)
		upcoming := make([]modelsv2.GiveawayConfig, 0)
		ended := make([]modelsv2.GiveawayConfig, 0)

		for _, doc := range docs {
			serialized := giveawayModel(doc, winnerIdentities)
			switch status, _ := doc["status"].(string); status {
			case "ongoing":
				ongoing = append(ongoing, serialized)
			case "scheduled":
				upcoming = append(upcoming, serialized)
			default:
				ended = append(ended, serialized)
			}
		}

		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerGiveawaysResponse{Ongoing: ongoing, Upcoming: upcoming, Ended: ended, Total: len(docs)})
	}
}

// getServerGiveaway godoc
// @Summary Get a specific server giveaway
// @Description Returns a single giveaway by ID for a server.
// @Tags Server Giveaways
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param giveaway_id path string true "Giveaway ID"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/{server_id}/giveaways/{giveaway_id} [get]
func getServerGiveaway(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		giveawayID := c.Params("giveaway_id")
		var doc bson.M
		err = a.Store.C.Giveaways.FindOne(c.UserContext(),
			bson.M{"_id": giveawayID, "server_id": serverID},
		).Decode(&doc)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Giveaway not found")
		}
		return apptypes.JSON(c, http.StatusOK, giveawayModel(doc, giveawayWinnerIdentities(c, a, int64(serverID), []bson.M{doc})))
	}
}

// createServerGiveaway godoc
// @Summary Create a server giveaway
// @Description Creates a new giveaway. Accepts multipart/form-data with optional image upload.
// @Tags Server Giveaways
// @Accept mpfd
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param prize formData string true "Prize description"
// @Param end_time formData string true "End time (ISO 8601)"
// @Param winners formData int true "Number of winners"
// @Param channel_id formData string true "Discord channel ID"
// @Param start_time formData string false "Start time (ISO 8601)"
// @Param now formData string false "Start immediately (true/false)"
// @Param image formData file false "Giveaway banner image"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/{server_id}/giveaways [post]
func createServerGiveaway(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}

		giveawayID := uuid.New().String()
		doc, err := giveawayBuildDocument(c, a, int64(serverID), giveawayID)
		if err != nil {
			return err
		}
		doc["status"] = "scheduled"

		if _, err := a.Store.C.Giveaways.InsertOne(c.UserContext(), doc); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.GiveawayMutationResponse{Message: "Giveaway created successfully", GiveawayID: giveawayID, ServerID: serverID})
	}
}

// updateServerGiveaway godoc
// @Summary Update a server giveaway
// @Description Updates an existing giveaway. Accepts multipart/form-data with optional image upload.
// @Tags Server Giveaways
// @Accept mpfd
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param giveaway_id path string true "Giveaway ID"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/{server_id}/giveaways/{giveaway_id} [put]
func updateServerGiveaway(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		giveawayID := c.Params("giveaway_id")

		var existing bson.M
		err = a.Store.C.Giveaways.FindOne(c.UserContext(),
			bson.M{"_id": giveawayID, "server_id": serverID},
		).Decode(&existing)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Giveaway not found")
		}

		doc, err := giveawayBuildDocument(c, a, int64(serverID), giveawayID)
		if err != nil {
			return err
		}
		doc["updated"] = "yes"
		doc["status"] = asStringOr(existing["status"], "scheduled")

		result, err := a.Store.C.Giveaways.UpdateOne(c.UserContext(),
			bson.M{"_id": giveawayID, "server_id": serverID},
			bson.M{"$set": doc},
		)
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Giveaway not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.GiveawayMutationResponse{Message: "Giveaway updated successfully", GiveawayID: giveawayID, ServerID: serverID})
	}
}

// deleteServerGiveaway godoc
// @Summary Delete a server giveaway
// @Description Deletes a giveaway and its image from the CDN if applicable.
// @Tags Server Giveaways
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param giveaway_id path string true "Giveaway ID"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/{server_id}/giveaways/{giveaway_id} [delete]
func deleteServerGiveaway(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		giveawayID := c.Params("giveaway_id")

		var existing bson.M
		err = a.Store.C.Giveaways.FindOne(c.UserContext(),
			bson.M{"_id": giveawayID, "server_id": serverID},
		).Decode(&existing)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Giveaway not found")
		}

		if imageURL, ok := existing["image_url"].(string); ok && imageURL != "" {
			_ = bunnyDeleteFile(a.Config.BunnyAccessKey, imageURL)
		}

		result, err := a.Store.C.Giveaways.DeleteOne(c.UserContext(),
			bson.M{"_id": giveawayID, "server_id": serverID},
		)
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Giveaway not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.GiveawayMutationResponse{Message: "Giveaway deleted successfully", GiveawayID: giveawayID, ServerID: serverID})
	}
}

// rerollGiveawayWinners godoc
// @Summary Reroll giveaway winners
// @Description Replaces selected winners of an ended giveaway with new ones drawn at random.
// @Tags Server Giveaways
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param giveaway_id path string true "Giveaway ID"
// @Param body body map[string][]string true "user_ids_to_replace"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/{server_id}/giveaways/{giveaway_id}/reroll [post]
func rerollGiveawayWinners(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		giveawayID := c.Params("giveaway_id")

		var body modelsv2.GiveawayRerollRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body.UserIDsToReplace) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No user IDs provided for replacement")
		}

		var giveaway bson.M
		err = a.Store.C.Giveaways.FindOne(c.UserContext(),
			bson.M{"_id": giveawayID, "server_id": serverID},
		).Decode(&giveaway)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "Giveaway not found")
		}
		if asStringOr(giveaway["status"], "") != "ended" {
			return apptypes.Error(http.StatusBadRequest, "Can only reroll winners of an ended giveaway")
		}

		// Build current winners set
		winnersList, _ := giveaway["winners_list"].(bson.A)
		currentWinners := make(map[string]struct{})
		for _, w := range winnersList {
			wm, ok := w.(bson.M)
			if !ok {
				continue
			}
			if asStringOr(wm["status"], "") == "winner" {
				currentWinners[fmt.Sprint(wm["user_id"])] = struct{}{}
			}
		}

		// Validate replace targets
		for _, uid := range body.UserIDsToReplace {
			if _, ok := currentWinners[uid]; !ok {
				return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("User %s is not a current winner", uid))
			}
		}

		// Build eligible pool from entries
		rawEntries, _ := giveaway["entries"].(bson.A)
		eligible := make([]string, 0, len(rawEntries))
		for _, e := range rawEntries {
			var uid string
			switch typed := e.(type) {
			case string:
				uid = typed
			case bson.M:
				uid = fmt.Sprint(typed["user_id"])
			}
			if _, inWinners := currentWinners[uid]; !inWinners {
				eligible = append(eligible, uid)
			}
		}
		if len(eligible) < len(body.UserIDsToReplace) {
			return apptypes.Error(http.StatusBadRequest, fmt.Sprintf(
				"Not enough eligible participants (%d) to replace %d winner(s)",
				len(eligible), len(body.UserIDsToReplace),
			))
		}

		// Draw new winners
		rand.Shuffle(len(eligible), func(i, j int) { eligible[i], eligible[j] = eligible[j], eligible[i] })
		newWinners := eligible[:len(body.UserIDsToReplace)]
		now := time.Now().UTC().Format(time.RFC3339)

		// Mark replaced as "rerolled"
		replaceSet := make(map[string]struct{}, len(body.UserIDsToReplace))
		for _, uid := range body.UserIDsToReplace {
			replaceSet[uid] = struct{}{}
		}
		_, err = a.Store.C.Giveaways.UpdateMany(c.UserContext(),
			bson.M{"_id": giveawayID},
			bson.M{"$set": bson.M{
				"winners_list.$[elem].status":    "rerolled",
				"winners_list.$[elem].timestamp": now,
				"winners_list.$[elem].reason":    "dashboard_reroll",
			}},
			options.UpdateMany().SetArrayFilters([]interface{}{
				bson.M{"elem.user_id": bson.M{"$in": body.UserIDsToReplace}},
			}),
		)
		if err != nil {
			return err
		}

		// Append new winners
		newWinnerDocs := make(bson.A, 0, len(newWinners))
		for _, uid := range newWinners {
			newWinnerDocs = append(newWinnerDocs, bson.M{
				"user_id":   uid,
				"status":    "winner",
				"timestamp": now,
			})
		}
		if _, err := a.Store.C.Giveaways.UpdateOne(c.UserContext(),
			bson.M{"_id": giveawayID},
			bson.M{"$push": bson.M{"winners_list": bson.M{"$each": newWinnerDocs}}},
		); err != nil {
			return err
		}

		return apptypes.JSON(c, http.StatusOK, modelsv2.GiveawayRerollResponse{Message: "Winners rerolled successfully", GiveawayID: giveawayID, ServerID: serverID, NewWinners: newWinners})
	}
}

func giveawayModel(doc bson.M, winnerIdentities map[string]ticketUserIdentity) modelsv2.GiveawayConfig {
	out := modelsv2.GiveawayConfig{
		ID:                     asStringOr(doc["_id"], ""),
		Prize:                  asStringOr(doc["prize"], ""),
		ChannelID:              stringPtrMaybe(doc["channel_id"]),
		Status:                 asStringOr(doc["status"], ""),
		StartTime:              stringifyTime(doc["start_time"]),
		EndTime:                stringifyTime(doc["end_time"]),
		Winners:                asIntWithDefault(doc["winners"], 0),
		Mentions:               stringSlice(doc["mentions"]),
		TextAboveEmbed:         asStringOr(doc["text_above_embed"], ""),
		TextInEmbed:            asStringOr(doc["text_in_embed"], ""),
		TextOnEnd:              asStringOr(doc["text_on_end"], ""),
		ImageURL:               stringPtrMaybe(doc["image_url"]),
		ProfilePictureRequired: asBool(doc["profile_picture_required"]),
		COCAccountRequired:     asBool(doc["coc_account_required"]),
		RolesMode:              asStringOr(doc["roles_mode"], "none"),
		Roles:                  stringSlice(doc["roles"]),
		Boosters:               giveawayBoosters(doc["boosters"]),
		EntryCount:             giveawayEntryCount(doc["entries"]),
		Updated:                asStringOr(doc["updated"], "") == "yes" || asBool(doc["updated"]),
		MessageID:              stringPtrMaybe(doc["message_id"]),
		WinnersList:            giveawayWinners(doc["winners_list"], winnerIdentities),
	}
	return out
}

func giveawayWinnerIdentities(c *fiber.Ctx, a apptypes.Deps, serverID int64, docs []bson.M) map[string]ticketUserIdentity {
	identityMap := map[string]ticketUserIdentity{}
	if len(docs) == 0 {
		return identityMap
	}

	userIDSet := map[string]struct{}{}
	lookupIDs := make([]any, 0)
	for _, doc := range docs {
		for _, winner := range anyMapSlice(doc["winners_list"]) {
			userID := serverAsString(winner["user_id"])
			if userID == "" {
				continue
			}
			if _, seen := userIDSet[userID]; seen {
				continue
			}
			userIDSet[userID] = struct{}{}
			lookupIDs = append(lookupIDs, userID)
			if numeric := ticketParseInt64(userID); numeric != 0 {
				lookupIDs = append(lookupIDs, numeric)
			}
		}
	}
	if len(userIDSet) == 0 {
		return identityMap
	}

	userCur, err := a.Store.C.Users.Find(c.UserContext(),
		bson.M{"linked_accounts.discord.discord_user_id": bson.M{"$in": lookupIDs}},
		options.Find().SetProjection(bson.M{"_id": 0, "linked_accounts.discord": 1}))
	if err == nil {
		var userDocs []bson.M
		if err := userCur.All(c.UserContext(), &userDocs); err == nil {
			for _, userDoc := range userDocs {
				discordAccount := mapMaybe(mapMaybe(userDoc["linked_accounts"])["discord"])
				userID := serverAsString(discordAccount["discord_user_id"])
				if userID == "" {
					continue
				}
				identity := ticketIdentityFromAuthUser(userDoc)
				if identity.Username != nil || identity.AvatarURL != nil {
					identityMap[userID] = identity
				}
			}
		}
	}

	remaining := make([]string, 0, len(userIDSet))
	for userID := range userIDSet {
		identity := identityMap[userID]
		if identity.Username != nil && identity.AvatarURL != nil {
			continue
		}
		remaining = append(remaining, userID)
	}

	if len(remaining) == 0 {
		return identityMap
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	sem := make(chan struct{}, 10)
	for _, userID := range remaining {
		userInt := ticketParseInt64(userID)
		if userInt == 0 {
			continue
		}
		wg.Add(1)
		go func(userID string, userInt int64) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			member := a.Discord.GetMemberDirect(c.UserContext(), serverID, userInt)
			if member == nil {
				return
			}
			identity := ticketIdentityFromMember(*member)
			if identity.Username == nil && identity.AvatarURL == nil {
				return
			}
			mu.Lock()
			existing := identityMap[userID]
			if existing.Username == nil {
				existing.Username = identity.Username
			}
			if existing.DisplayName == nil {
				existing.DisplayName = identity.DisplayName
			}
			if existing.AvatarURL == nil {
				existing.AvatarURL = identity.AvatarURL
			}
			identityMap[userID] = existing
			mu.Unlock()
		}(userID, userInt)
	}
	wg.Wait()

	return identityMap
}

func giveawayBoosters(value any) []modelsv2.GiveawayBooster {
	raw, ok := value.([]any)
	if !ok {
		return []modelsv2.GiveawayBooster{}
	}
	out := make([]modelsv2.GiveawayBooster, 0, len(raw))
	for _, item := range raw {
		if doc, ok := item.(bson.M); ok {
			out = append(out, modelsv2.GiveawayBooster{
				Value: lbAsFloat(doc["value"]),
				Roles: stringSlice(doc["roles"]),
			})
		}
	}
	return out
}

func giveawayWinners(value any, winnerIdentities map[string]ticketUserIdentity) []modelsv2.GiveawayWinner {
	raw := anyMapSlice(value)
	if len(raw) == 0 {
		return []modelsv2.GiveawayWinner{}
	}
	out := make([]modelsv2.GiveawayWinner, 0, len(raw))
	for _, doc := range raw {
		userID := asStringOr(doc["user_id"], "")
		identity := winnerIdentities[userID]
		username := stringPtrMaybe(doc["username"])
		if username == nil {
			username = identity.DisplayName
		}
		if username == nil {
			username = identity.Username
		}
		out = append(out, modelsv2.GiveawayWinner{
			UserID:    userID,
			Username:  username,
			AvatarURL: identity.AvatarURL,
			Status:    asStringOr(doc["status"], "winner"),
			Timestamp: stringPtrMaybe(doc["timestamp"]),
			Reason:    stringPtrMaybe(doc["reason"]),
		})
	}
	return out
}

func giveawayEntryCount(value any) int {
	if raw, ok := value.([]any); ok {
		return len(raw)
	}
	return 0
}

func stringifyTime(value any) string {
	switch typed := value.(type) {
	case time.Time:
		return typed.UTC().Format(time.RFC3339)
	case bson.DateTime:
		return time.UnixMilli(int64(typed)).UTC().Format(time.RFC3339)
	case string:
		return typed
	default:
		return serverAsString(value)
	}
}

// --- helpers ---

func giveawayBuildDocument(c *fiber.Ctx, a apptypes.Deps, serverID int64, giveawayID string) (bson.M, error) {
	prize := c.FormValue("prize")
	if prize == "" {
		return nil, apptypes.Error(http.StatusBadRequest, "prize is required")
	}
	endTimeStr := c.FormValue("end_time")
	if endTimeStr == "" {
		return nil, apptypes.Error(http.StatusBadRequest, "end_time is required")
	}
	channelID := c.FormValue("channel_id")
	if channelID == "" {
		return nil, apptypes.Error(http.StatusBadRequest, "channel_id is required")
	}
	winnersStr := c.FormValue("winners")
	winners, err := strconv.Atoi(winnersStr)
	if err != nil || winners < 1 {
		return nil, apptypes.Error(http.StatusBadRequest, "winners must be a positive integer")
	}

	// Parse start time
	var startTime time.Time
	if nowVal := c.FormValue("now"); strings.EqualFold(nowVal, "true") || nowVal == "1" {
		startTime = time.Now().UTC()
	} else if st := c.FormValue("start_time"); st != "" {
		startTime, err = time.Parse(time.RFC3339, st)
		if err != nil {
			startTime, err = time.Parse("2006-01-02T15:04:05", st)
			if err != nil {
				return nil, apptypes.Error(http.StatusBadRequest, "Invalid start_time format, expected ISO 8601")
			}
		}
	} else {
		return nil, apptypes.Error(http.StatusBadRequest, "start_time is required unless now=true")
	}

	endTime, err := time.Parse(time.RFC3339, endTimeStr)
	if err != nil {
		endTime, err = time.Parse("2006-01-02T15:04:05", endTimeStr)
		if err != nil {
			return nil, apptypes.Error(http.StatusBadRequest, "Invalid end_time format, expected ISO 8601")
		}
	}
	if !endTime.After(startTime) {
		return nil, apptypes.Error(http.StatusBadRequest, "end_time must be after start_time")
	}

	channelIDInt, _ := strconv.ParseInt(channelID, 10, 64)

	// Parse JSON list fields
	mentions := giveawayParseJSONList(c.FormValue("mentions_json"))
	roles := giveawayParseJSONList(c.FormValue("roles_json"))
	boosters := giveawayParseBoosters(c.FormValue("boosters_json"))

	rolesMode := c.FormValue("roles_mode")
	if rolesMode != "allow" && rolesMode != "deny" {
		rolesMode = "none"
	}

	// Handle image upload / removal
	var imageURL any = nil

	// Check if we should remove the existing image
	removeImage := c.FormValue("remove_image")
	if strings.EqualFold(removeImage, "true") || removeImage == "1" {
		// Look up existing image URL and delete from CDN
		var existing bson.M
		_ = a.Store.C.Giveaways.FindOne(c.UserContext(),
			bson.M{"_id": giveawayID, "server_id": serverID},
		).Decode(&existing)
		if existing != nil {
			if oldURL, ok := existing["image_url"].(string); ok && oldURL != "" {
				_ = bunnyDeleteFile(a.Config.BunnyAccessKey, oldURL)
			}
		}
	}

	// Upload new image if provided
	fileHeader, err := c.FormFile("image")
	if err == nil && fileHeader != nil && fileHeader.Filename != "" {
		file, err := fileHeader.Open()
		if err != nil {
			return nil, apptypes.Error(http.StatusBadRequest, "Failed to read image file")
		}
		defer file.Close()
		imgBytes, err := io.ReadAll(file)
		if err != nil {
			return nil, apptypes.Error(http.StatusBadRequest, "Failed to read image content")
		}
		timestamp := time.Now().UTC().Format("20060102150405")
		title := fmt.Sprintf("giveaway_%s_%s", giveawayID, timestamp)
		url, err := bunnyUploadFile(a.Config.BunnyAccessKey, title, imgBytes)
		if err != nil {
			return nil, apptypes.Error(http.StatusInternalServerError, "Failed to upload image to CDN")
		}
		imageURL = url
	}

	return bson.M{
		"_id":                      giveawayID,
		"server_id":                serverID,
		"prize":                    prize,
		"channel_id":               channelIDInt,
		"start_time":               startTime,
		"end_time":                 endTime,
		"winners":                  winners,
		"entries":                  bson.A{},
		"mentions":                 mentions,
		"text_above_embed":         c.FormValue("text_above_embed"),
		"text_in_embed":            c.FormValue("text_in_embed"),
		"text_on_end":              c.FormValue("text_on_end"),
		"image_url":                imageURL,
		"profile_picture_required": giveawayParseBool(c.FormValue("profile_picture_required")),
		"coc_account_required":     giveawayParseBool(c.FormValue("coc_account_required")),
		"roles_mode":               rolesMode,
		"roles":                    roles,
		"boosters":                 boosters,
	}, nil
}

func bunnyUploadFile(accessKey, title string, data []byte) (string, error) {
	title = strings.ToLower(strings.ReplaceAll(title, " ", "_"))
	url := fmt.Sprintf("https://storage.bunnycdn.com/clashking-files/%s.png", title)
	req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("AccessKey", accessKey)
	req.Header.Set("Content-Type", "application/octet-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("BunnyCDN upload failed: status %d", resp.StatusCode)
	}
	return fmt.Sprintf("https://cdn.clashking.xyz/%s.png", title), nil
}

func bunnyDeleteFile(accessKey, imageURL string) error {
	const prefix = "https://cdn.clashking.xyz/"
	if !strings.HasPrefix(imageURL, prefix) {
		return nil
	}
	filePath := imageURL[len(prefix):]
	deleteURL := fmt.Sprintf("https://storage.bunnycdn.com/clashking-files/%s", filePath)
	req, err := http.NewRequest(http.MethodDelete, deleteURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("AccessKey", accessKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func giveawaySerialize(doc bson.M) map[string]any {
	result := make(map[string]any, len(doc))
	for k, v := range doc {
		if k == "_id" {
			result["id"] = fmt.Sprint(v)
		} else {
			result[k] = v
		}
	}
	return result
}

func giveawayParseBool(v string) bool {
	v = strings.ToLower(strings.TrimSpace(v))
	return v == "true" || v == "1" || v == "yes" || v == "on"
}

func giveawayParseJSONList(raw string) []string {
	if raw == "" {
		return []string{}
	}
	var list []any
	if err := json.Unmarshal([]byte(raw), &list); err != nil {
		return []string{}
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		out = append(out, fmt.Sprint(item))
	}
	return out
}

func giveawayParseBoosters(raw string) []map[string]any {
	if raw == "" {
		return []map[string]any{}
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(raw), &list); err != nil {
		return []map[string]any{}
	}
	out := make([]map[string]any, 0, len(list))
	for _, b := range list {
		roles, _ := b["roles"].([]any)
		if len(roles) == 0 {
			continue
		}
		roleStrs := make([]string, 0, len(roles))
		for _, r := range roles {
			roleStrs = append(roleStrs, fmt.Sprint(r))
		}
		value := 1.0
		if v, ok := b["value"]; ok {
			switch typed := v.(type) {
			case float64:
				value = typed
			case int:
				value = float64(typed)
			}
		}
		out = append(out, map[string]any{"value": value, "roles": roleStrs})
	}
	return out
}
