package server

import (
	"errors"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const (
	serverLinksMemberCacheTTL = 15 * time.Minute
	serverLinksMemberLimit    = 5000
)

var (
	playerTagPattern      = regexp.MustCompile(`^#?[0289PYLQGRJCUV]{3,15}$`)
	roleMentionPrefixExpr = regexp.MustCompile(`^<@&(\d+)>\s*`)
	serverLinksCache      = struct {
		sync.Mutex
		values map[int64]serverLinksMemberCacheEntry
	}{values: map[int64]serverLinksMemberCacheEntry{}}
)

type serverLinksMemberCacheEntry struct {
	members   map[string]discord.Member
	expiresAt time.Time
}

type serverLinkRow struct {
	userID     string
	playerTag  string
	playerName *string
	townHall   *int
	verified   bool
	addedAt    time.Time
}

type serverLinksQuery struct {
	roleIDs   []string
	text      string
	playerTag string
}

// getLinks godoc
// @Summary Get links for Discord server members
// @Description Fetches up to 5,000 Discord members (cached for 15 minutes), excludes bots, joins visible links with basic_player, and supports member, player-tag, role-mention, and account filters. Multiple Discord role mentions are combined as a union.
// @Tags Links
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param limit query int false "Max members returned (default 100, maximum 5000)"
// @Param offset query int false "Pagination offset"
// @Param query query string false "Player tag, member username/display name, or one or more leading Discord role mentions"
// @Param account_filter query string false "Member account filter; none means no visible links" Enums(none)
// @Success 200 {object} modelsv2.ServerLinksResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 502 {object} modelsv2.ErrorResponse
// @Router /v2/links/server/{server_id} [get]
func getLinks(a apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if err := ensureSQLServer(c, a, serverID); err != nil {
			return notFoundErr(err, "Server not found")
		}

		limit := c.QueryInt("limit", 100)
		if limit <= 0 {
			limit = 100
		}
		if limit > serverLinksMemberLimit {
			limit = serverLinksMemberLimit
		}
		offset := c.QueryInt("offset", 0)
		if offset < 0 {
			offset = 0
		}
		accountFilter, err := serverAccountFilter(c.Query("account_filter"))
		if err != nil {
			return err
		}
		parsedQuery := parseServerLinksQuery(c.Query("query"))

		members, err := fetchAllServerMembers(c, a, int64(serverID))
		if err != nil {
			return apptypes.Error(http.StatusBadGateway, "Failed to fetch Discord members")
		}
		roles, allowedRoleIDs, err := fetchServerLinkRoles(c, a, int64(serverID))
		if err != nil {
			return apptypes.Error(http.StatusBadGateway, "Failed to fetch Discord roles")
		}
		for _, roleID := range parsedQuery.roleIDs {
			if !allowedRoleIDs[roleID] {
				return apptypes.Error(http.StatusBadRequest, "Role mention is not available for link filtering")
			}
		}

		memberIDs := make([]string, 0, len(members))
		for userID := range members {
			memberIDs = append(memberIDs, userID)
		}
		linkRows, err := sqlServerLinksByUsers(c, a, memberIDs)
		if err != nil {
			return err
		}
		linksByUser := make(map[string][]serverLinkRow, len(memberIDs))
		membersWithLinks := map[string]bool{}
		verifiedAccounts := 0
		for _, row := range linkRows {
			linksByUser[row.userID] = append(linksByUser[row.userID], row)
			membersWithLinks[row.userID] = true
			if row.verified {
				verifiedAccounts++
			}
		}

		filtered := make([]modelsv2.ServerLinkedMember, 0, len(members))
		for userID, member := range members {
			allAccounts := linksByUser[userID]
			if !serverMemberMatchesQuery(member, allAccounts, parsedQuery) {
				continue
			}
			if accountFilter == "none" && len(allAccounts) > 0 {
				continue
			}
			accounts := make([]modelsv2.ServerLinkedAccount, 0, len(allAccounts))
			for _, row := range allAccounts {
				accounts = append(accounts, modelsv2.ServerLinkedAccount{
					PlayerTag:  row.playerTag,
					PlayerName: row.playerName,
					TownHall:   row.townHall,
					IsVerified: row.verified,
					AddedAt:    row.addedAt.UTC().Format(time.RFC3339),
				})
			}
			filtered = append(filtered, modelsv2.ServerLinkedMember{
				UserID:         userID,
				Username:       member.User.Username,
				DisplayName:    member.EffectiveName(),
				AvatarURL:      member.EffectiveAvatarURL(),
				LinkedAccounts: accounts,
				AccountCount:   len(accounts),
			})
		}

		sort.SliceStable(filtered, func(i, j int) bool {
			if filtered[i].AccountCount != filtered[j].AccountCount {
				return filtered[i].AccountCount > filtered[j].AccountCount
			}
			left := strings.ToLower(filtered[i].DisplayName)
			right := strings.ToLower(filtered[j].DisplayName)
			if left != right {
				return left < right
			}
			return filtered[i].UserID < filtered[j].UserID
		})

		filteredCount := len(filtered)
		start := min(offset, filteredCount)
		end := min(start+limit, filteredCount)
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerLinksResponse{
			Members:             filtered[start:end],
			Roles:               roles,
			TotalMembers:        len(members),
			FilteredMembers:     filteredCount,
			MembersWithLinks:    len(membersWithLinks),
			TotalLinkedAccounts: len(linkRows),
			VerifiedAccounts:    verifiedAccounts,
		})
	}
}

// createLink godoc
// @Summary Add or reassign a server member link
// @Description Adds an unverified player link to a current Discord member. An existing unverified link is reassigned; a verified link owned by another user is never moved.
// @Tags Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param body body modelsv2.ServerLinkCreateRequest true "Link payload"
// @Success 200 {object} modelsv2.ServerLinkMutationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.ErrorResponse
// @Router /v2/links/server/{server_id} [post]
func createLink(a apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.ServerLinkCreateRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tag, err := validServerPlayerTag(body.PlayerTag)
		if err != nil {
			return err
		}
		userID := strings.TrimSpace(body.UserID)
		if userID == "" {
			return apptypes.Error(http.StatusBadRequest, "userID is required")
		}
		if err := ensureServerLinkMember(c, a, int64(serverID), userID); err != nil {
			return err
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(http.StatusServiceUnavailable, "SQL store is not configured")
		}

		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		var previousUserID *string
		var existingVerified bool
		err = tx.QueryRow(c.UserContext(), `SELECT user_id, is_verified FROM player_links WHERE tag = $1 FOR UPDATE`, tag).Scan(&previousUserID, &existingVerified)
		if err != nil && err != pgx.ErrNoRows {
			return err
		}
		exists := err == nil
		previousOwner := ""
		if previousUserID != nil {
			previousOwner = *previousUserID
		}
		if exists && previousOwner != userID && existingVerified {
			return apptypes.Error(http.StatusConflict, "Verified links cannot be reassigned")
		}
		if exists && previousOwner == userID {
			return apptypes.JSON(c, http.StatusOK, modelsv2.ServerLinkMutationResponse{Message: "Link already belongs to this server member", PlayerTag: tag, UserID: userID})
		}
		var orderIndex int
		if err := tx.QueryRow(c.UserContext(), `SELECT count(*) FROM player_links WHERE user_id = $1`, userID).Scan(&orderIndex); err != nil {
			return err
		}
		_, err = tx.Exec(c.UserContext(), `
			INSERT INTO player_links (tag, user_id, source, order_index, is_verified, hidden, added_at, verified_at, updated_at)
			VALUES ($1, $2, 'dashboard', $3, false, false, now(), NULL, now())
			ON CONFLICT (tag) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				source = EXCLUDED.source,
				order_index = EXCLUDED.order_index,
				is_verified = false,
				hidden = false,
				verified_at = NULL,
				updated_at = now()
		`, tag, userID, orderIndex)
		if err != nil {
			return err
		}
		if previousOwner != "" && previousOwner != userID {
			if err := reorderServerLinksTx(c, tx, previousOwner); err != nil {
				return err
			}
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerLinkMutationResponse{Message: "Link added successfully", PlayerTag: tag, UserID: userID})
	}
}

// deleteLink godoc
// @Summary Delete a stale server member link
// @Description Deletes a link only after the Clash API confirms the player no longer exists.
// @Tags Links
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param playerTag query string true "Player tag"
// @Success 200 {object} modelsv2.ServerLinkMutationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.ErrorResponse
// @Failure 502 {object} modelsv2.ErrorResponse
// @Router /v2/links/server/{server_id} [delete]
func deleteLink(a apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		_, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag, err := validServerPlayerTag(c.Query("playerTag"))
		if err != nil {
			return err
		}
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(http.StatusServiceUnavailable, "SQL store is not configured")
		}
		var userID *string
		if err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT user_id FROM player_links WHERE tag = $1`, tag).Scan(&userID); err != nil {
			if err == pgx.ErrNoRows {
				return apptypes.Error(http.StatusNotFound, "Link not found")
			}
			return err
		}
		if a.Clash == nil {
			return apptypes.Error(http.StatusServiceUnavailable, "Clash API is not configured")
		}
		player, lookupErr := a.Clash.GetPlayer(c.UserContext(), tag)
		var notFound *clashy.NotFound
		switch {
		case errors.As(lookupErr, &notFound):
			// A typed 404 is the only condition that permits server management deletion.
		case lookupErr != nil:
			return apptypes.Error(http.StatusBadGateway, "Failed to verify that the player no longer exists")
		case player != nil:
			return apptypes.Error(http.StatusConflict, "Player still exists; deletion is not allowed")
		default:
			return apptypes.Error(http.StatusBadGateway, "Clash API returned no player without a 404")
		}

		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		result, err := tx.Exec(c.UserContext(), `DELETE FROM player_links WHERE tag = $1`, tag)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusConflict, "Link changed and can no longer be deleted")
		}
		linkUserID := ""
		if userID != nil {
			linkUserID = strings.TrimSpace(*userID)
			if linkUserID != "" {
				if err := reorderServerLinksTx(c, tx, linkUserID); err != nil {
					return err
				}
			}
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerLinkMutationResponse{Message: "Link removed successfully", PlayerTag: tag, UserID: linkUserID})
	}
}

func fetchAllServerMembers(c *fiber.Ctx, a apptypes.Deps, serverID int64) (map[string]discord.Member, error) {
	if members, ok := cachedServerMembers(serverID); ok {
		return members, nil
	}
	if a.Discord == nil {
		return nil, errors.New("Discord is not configured")
	}
	members := map[string]discord.Member{}
	var after int64
	fetched := 0
	for fetched < serverLinksMemberLimit {
		batch, err := a.Discord.GetMembers(c.UserContext(), serverID, 1000, after)
		if err != nil {
			return nil, err
		}
		if len(batch) == 0 {
			break
		}
		for _, member := range batch {
			fetched++
			if int64(member.User.ID) > after {
				after = int64(member.User.ID)
			}
			if !member.User.Bot {
				members[member.User.ID.String()] = member
			}
			if fetched == serverLinksMemberLimit {
				break
			}
		}
		if len(batch) < 1000 {
			break
		}
	}
	cacheServerMembers(serverID, members)
	return copyServerMembers(members), nil
}

func cachedServerMembers(serverID int64) (map[string]discord.Member, bool) {
	now := time.Now().UTC()
	serverLinksCache.Lock()
	defer serverLinksCache.Unlock()
	entry, ok := serverLinksCache.values[serverID]
	if !ok {
		return nil, false
	}
	if now.After(entry.expiresAt) {
		delete(serverLinksCache.values, serverID)
		return nil, false
	}
	return copyServerMembers(entry.members), true
}

func cacheServerMembers(serverID int64, members map[string]discord.Member) {
	serverLinksCache.Lock()
	defer serverLinksCache.Unlock()
	serverLinksCache.values[serverID] = serverLinksMemberCacheEntry{members: copyServerMembers(members), expiresAt: time.Now().UTC().Add(serverLinksMemberCacheTTL)}
}

func copyServerMembers(source map[string]discord.Member) map[string]discord.Member {
	out := make(map[string]discord.Member, len(source))
	for userID, member := range source {
		out[userID] = member
	}
	return out
}

func fetchServerLinkRoles(c *fiber.Ctx, a apptypes.Deps, serverID int64) ([]modelsv2.ServerLinkRole, map[string]bool, error) {
	if a.Discord == nil {
		return nil, nil, errors.New("Discord is not configured")
	}
	discordRoles, err := a.Discord.GetRoles(c.UserContext(), serverID)
	if err != nil {
		return nil, nil, err
	}
	roles := make([]modelsv2.ServerLinkRole, 0, len(discordRoles))
	allowed := make(map[string]bool, len(discordRoles))
	for _, role := range discordRoles {
		if role.ID.String() == strconv.FormatInt(serverID, 10) || role.Name == "@everyone" || role.Managed {
			continue
		}
		roleID := role.ID.String()
		allowed[roleID] = true
		roles = append(roles, modelsv2.ServerLinkRole{ID: roleID, Name: role.Name, Color: role.Color, Position: role.Position})
	}
	sort.SliceStable(roles, func(i, j int) bool { return roles[i].Position > roles[j].Position })
	return roles, allowed, nil
}

func parseServerLinksQuery(raw string) serverLinksQuery {
	query := serverLinksQuery{}
	remainder := strings.TrimSpace(raw)
	for {
		match := roleMentionPrefixExpr.FindStringSubmatch(remainder)
		if len(match) == 0 {
			break
		}
		query.roleIDs = append(query.roleIDs, match[1])
		remainder = strings.TrimSpace(remainder[len(match[0]):])
	}
	if playerTagPattern.MatchString(strings.ToUpper(remainder)) {
		query.playerTag = serverNormalizeTag(remainder)
	} else {
		query.text = strings.ToLower(remainder)
	}
	return query
}

func serverMemberMatchesQuery(member discord.Member, links []serverLinkRow, query serverLinksQuery) bool {
	if len(query.roleIDs) > 0 {
		memberRoles := make(map[string]bool, len(member.RoleIDs))
		for _, roleID := range member.RoleIDs {
			memberRoles[roleID.String()] = true
		}
		matchesAnyRole := false
		for _, roleID := range query.roleIDs {
			if memberRoles[roleID] {
				matchesAnyRole = true
				break
			}
		}
		if !matchesAnyRole {
			return false
		}
	}
	if query.playerTag != "" {
		for _, link := range links {
			if link.playerTag == query.playerTag {
				return true
			}
		}
		return false
	}
	if query.text == "" {
		return true
	}
	return strings.Contains(strings.ToLower(member.User.Username), query.text) || strings.Contains(strings.ToLower(member.EffectiveName()), query.text)
}

func serverAccountFilter(raw string) (string, error) {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "", "none":
		return value, nil
	default:
		return "", apptypes.Error(http.StatusBadRequest, "account_filter must be none")
	}
}

func validServerPlayerTag(raw string) (string, error) {
	tag := serverNormalizeTag(raw)
	if !playerTagPattern.MatchString(tag) {
		return "", apptypes.Error(http.StatusBadRequest, "playerTag is invalid")
	}
	return tag, nil
}

func ensureSQLServer(c *fiber.Ctx, a apptypes.Deps, serverID int) error {
	if a.Store == nil || a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var found int
	return a.Store.SQL.QueryRow(c.UserContext(), `SELECT 1 FROM servers WHERE id = $1 LIMIT 1`, strconv.Itoa(serverID)).Scan(&found)
}

func sqlServerLinksByUsers(c *fiber.Ctx, a apptypes.Deps, userIDs []string) ([]serverLinkRow, error) {
	if len(userIDs) == 0 {
		return []serverLinkRow{}, nil
	}
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT links.user_id, links.tag, links.is_verified, links.added_at,
		       player.name, player.townhall_level
		FROM player_links AS links
		LEFT JOIN basic_player AS player ON player.tag = links.tag
		WHERE links.user_id = ANY($1) AND links.hidden = false
		ORDER BY links.order_index ASC, links.added_at ASC
	`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	links := make([]serverLinkRow, 0)
	for rows.Next() {
		var row serverLinkRow
		if err := rows.Scan(&row.userID, &row.playerTag, &row.verified, &row.addedAt, &row.playerName, &row.townHall); err != nil {
			return nil, err
		}
		links = append(links, row)
	}
	return links, rows.Err()
}

func ensureServerLinkMember(c *fiber.Ctx, a apptypes.Deps, serverID int64, userID string) error {
	discordID, err := strconv.ParseInt(strings.TrimSpace(userID), 10, 64)
	if err != nil || discordID <= 0 || a.Discord == nil || a.Discord.GetMember(c.UserContext(), serverID, discordID) == nil {
		return apptypes.Error(http.StatusForbidden, "Link owner is not a member of this Discord server")
	}
	return nil
}

func reorderServerLinksTx(c *fiber.Ctx, tx pgx.Tx, userID string) error {
	_, err := tx.Exec(c.UserContext(), `
		WITH ordered AS (
			SELECT tag, (row_number() OVER (ORDER BY order_index, added_at) - 1)::integer AS order_index
			FROM player_links
			WHERE user_id = $1
		)
		UPDATE player_links AS links
		SET order_index = ordered.order_index, updated_at = now()
		FROM ordered
		WHERE links.tag = ordered.tag
	`, userID)
	return err
}

func asBool(value any) bool {
	if typed, ok := value.(bool); ok {
		return typed
	}
	return false
}

func stringifyTimeLike(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		return typed
	case time.Time:
		return typed.UTC().Format(time.RFC3339)
	default:
		return serverAsString(typed)
	}
}
