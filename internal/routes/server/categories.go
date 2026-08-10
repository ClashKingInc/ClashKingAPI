package server

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"unicode"
	"unicode/utf8"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const maxClanCategoryNameRunes = 64

type clanCategoryDB interface {
	Begin(context.Context) (pgx.Tx, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type clanCategoryRowScanner interface {
	Scan(...any) error
}

// listClanCategories godoc
// @Summary List clan categories
// @Description Lists the authorized server's clan categories with current assigned-clan counts.
// @Tags Clan Categories
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Success 200 {object} modelsv2.ClanCategoriesResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clan-categories [get]
func listClanCategories(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredClanCategoryDB(a)
		if err != nil {
			return err
		}
		serverID := strings.TrimSpace(c.Params("server_id"))
		items, err := queryClanCategories(c.UserContext(), db, serverID)
		if err != nil {
			return apptypes.Error(http.StatusInternalServerError, "Failed to list clan categories")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ClanCategoriesResponse{
			Items: items,
			Total: len(items),
		})
	}
}

// createClanCategory godoc
// @Summary Create a clan category
// @Description Creates one normalized, exact-name-unique category for the authorized server.
// @Tags Clan Categories
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param body body modelsv2.CreateClanCategoryRequest true "Category name"
// @Success 201 {object} modelsv2.ClanCategoryCreateResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clan-categories [post]
func createClanCategory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredClanCategoryDB(a)
		if err != nil {
			return err
		}
		var body modelsv2.CreateClanCategoryRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		name, err := normalizeClanCategoryName(body.Name)
		if err != nil {
			return err
		}
		category, err := insertClanCategory(
			c.UserContext(), db, strings.TrimSpace(c.Params("server_id")), name,
		)
		if err != nil {
			return clanCategoryOperationError(err, "Failed to create clan category")
		}
		return apptypes.JSON(c, http.StatusCreated, modelsv2.ClanCategoryCreateResponse{
			Category: category,
		})
	}
}

// renameClanCategory godoc
// @Summary Rename a clan category
// @Description Renames one category only when it belongs to the authorized server.
// @Tags Clan Categories
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param category_id path string true "Category UUID"
// @Param body body modelsv2.RenameClanCategoryRequest true "Replacement category name"
// @Success 200 {object} modelsv2.ClanCategoryRenameResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clan-categories/{category_id} [patch]
func renameClanCategory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredClanCategoryDB(a)
		if err != nil {
			return err
		}
		categoryID, err := parseClanCategoryID(c.Params("category_id"))
		if err != nil {
			return err
		}
		var body modelsv2.RenameClanCategoryRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		name, err := normalizeClanCategoryName(body.Name)
		if err != nil {
			return err
		}
		category, err := updateClanCategoryName(
			c.UserContext(), db,
			strings.TrimSpace(c.Params("server_id")), categoryID, name,
		)
		if err != nil {
			return clanCategoryOperationError(err, "Failed to rename clan category")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ClanCategoryRenameResponse{
			Category: category,
		})
	}
}

// reorderClanCategories godoc
// @Summary Reorder clan categories
// @Description Replaces the authorized server's complete clan-category order.
// @Tags Clan Categories
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param body body modelsv2.ReorderClanCategoriesRequest true "Complete ordered category ID list"
// @Success 200 {object} modelsv2.ClanCategoriesResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clan-categories/order [put]
func reorderClanCategories(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredClanCategoryDB(a)
		if err != nil {
			return err
		}
		var body modelsv2.ReorderClanCategoriesRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		categoryIDs, err := normalizeClanCategoryOrder(body.CategoryIDs)
		if err != nil {
			return err
		}
		serverID := strings.TrimSpace(c.Params("server_id"))
		if err := replaceClanCategoryOrder(c.UserContext(), db, serverID, categoryIDs); err != nil {
			return clanCategoryOperationError(err, "Failed to reorder clan categories")
		}
		items, err := queryClanCategories(c.UserContext(), db, serverID)
		if err != nil {
			return apptypes.Error(http.StatusInternalServerError, "Clan categories were reordered but could not be reloaded")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ClanCategoriesResponse{Items: items, Total: len(items)})
	}
}

// previewClanCategoryDelete godoc
// @Summary Preview clan category deletion
// @Description Returns the current number of this server's clans that will become uncategorized if the manager confirms deletion.
// @Tags Clan Categories
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param category_id path string true "Category UUID"
// @Success 200 {object} modelsv2.ClanCategoryDeletePreviewResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clan-categories/{category_id}/delete-preview [get]
func previewClanCategoryDelete(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredClanCategoryDB(a)
		if err != nil {
			return err
		}
		categoryID, err := parseClanCategoryID(c.Params("category_id"))
		if err != nil {
			return err
		}
		category, err := queryClanCategory(
			c.UserContext(), db,
			strings.TrimSpace(c.Params("server_id")), categoryID,
		)
		if err != nil {
			return clanCategoryOperationError(err, "Failed to preview clan category deletion")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ClanCategoryDeletePreviewResponse{
			Category:          category,
			AffectedClanCount: category.ClanCount,
		})
	}
}

// deleteClanCategory godoc
// @Summary Delete a clan category
// @Description Deletes one server-owned category. The database foreign key atomically clears categoryId on affected server clans.
// @Tags Clan Categories
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param category_id path string true "Category UUID"
// @Success 200 {object} modelsv2.ClanCategoryDeleteResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/clan-categories/{category_id} [delete]
func deleteClanCategory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredClanCategoryDB(a)
		if err != nil {
			return err
		}
		categoryID, err := parseClanCategoryID(c.Params("category_id"))
		if err != nil {
			return err
		}
		response, err := removeClanCategory(
			c.UserContext(), db,
			strings.TrimSpace(c.Params("server_id")), categoryID,
		)
		if err != nil {
			return clanCategoryOperationError(err, "Failed to delete clan category")
		}
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

func configuredClanCategoryDB(a apptypes.Deps) (clanCategoryDB, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(http.StatusServiceUnavailable, "Database is not configured")
	}
	return a.Store.SQL, nil
}

func queryClanCategories(ctx context.Context, db clanCategoryDB, serverID string) ([]modelsv2.ClanCategory, error) {
	rows, err := db.Query(ctx, `
		SELECT category.id::text, category.server_id, category.name, category.position,
		       count(clan.tag)::int AS clan_count
		FROM server_clan_categories category
		LEFT JOIN server_clans clan
		       ON clan.server_id = category.server_id
		      AND clan.category_id = category.id
		WHERE category.server_id = $1
		GROUP BY category.id, category.server_id, category.name, category.position
		ORDER BY category.position, category.id
	`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]modelsv2.ClanCategory, 0)
	for rows.Next() {
		category, err := scanClanCategory(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, category)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func queryClanCategory(ctx context.Context, db clanCategoryDB, serverID, categoryID string) (modelsv2.ClanCategory, error) {
	return scanClanCategory(db.QueryRow(ctx, `
		SELECT category.id::text, category.server_id, category.name, category.position,
		       count(clan.tag)::int AS clan_count
		FROM server_clan_categories category
		LEFT JOIN server_clans clan
		       ON clan.server_id = category.server_id
		      AND clan.category_id = category.id
		WHERE category.server_id = $1 AND category.id = $2::uuid
		GROUP BY category.id, category.server_id, category.name, category.position
	`, serverID, categoryID))
}

func insertClanCategory(ctx context.Context, db clanCategoryDB, serverID, name string) (modelsv2.ClanCategory, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return modelsv2.ClanCategory{}, err
	}
	defer tx.Rollback(ctx)

	category, err := scanClanCategory(tx.QueryRow(ctx, `
		INSERT INTO server_clan_categories (server_id, name, position)
		SELECT $1, $2, COALESCE(max(position) + 1, 0)
		FROM server_clan_categories
		WHERE server_id = $1
		RETURNING id::text, server_id, name, position, 0::int
	`, serverID, name))
	if err != nil {
		return modelsv2.ClanCategory{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return modelsv2.ClanCategory{}, err
	}
	return category, nil
}

func updateClanCategoryName(ctx context.Context, db clanCategoryDB, serverID, categoryID, name string) (modelsv2.ClanCategory, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return modelsv2.ClanCategory{}, err
	}
	defer tx.Rollback(ctx)

	category, err := scanClanCategory(tx.QueryRow(ctx, `
		UPDATE server_clan_categories category
		SET name = $3
		WHERE category.server_id = $1 AND category.id = $2::uuid
		RETURNING category.id::text, category.server_id, category.name, category.position,
		          (
		              SELECT count(*)::int
		              FROM server_clans clan
		              WHERE clan.server_id = category.server_id
		                AND clan.category_id = category.id
		          )
	`, serverID, categoryID, name))
	if err != nil {
		return modelsv2.ClanCategory{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return modelsv2.ClanCategory{}, err
	}
	return category, nil
}

func removeClanCategory(ctx context.Context, db clanCategoryDB, serverID, categoryID string) (modelsv2.ClanCategoryDeleteResponse, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return modelsv2.ClanCategoryDeleteResponse{}, err
	}
	defer tx.Rollback(ctx)

	var storedID, name string
	var position int
	if err := tx.QueryRow(ctx, `
		SELECT id::text, name, position
		FROM server_clan_categories
		WHERE server_id = $1 AND id = $2::uuid
		FOR UPDATE
	`, serverID, categoryID).Scan(&storedID, &name, &position); err != nil {
		return modelsv2.ClanCategoryDeleteResponse{}, err
	}

	var affectedClanCount int
	if err := tx.QueryRow(ctx, `
		SELECT count(*)::int
		FROM server_clans
		WHERE server_id = $1 AND category_id = $2::uuid
	`, serverID, categoryID).Scan(&affectedClanCount); err != nil {
		return modelsv2.ClanCategoryDeleteResponse{}, err
	}

	tag, err := tx.Exec(ctx, `
		DELETE FROM server_clan_categories
		WHERE server_id = $1 AND id = $2::uuid
	`, serverID, categoryID)
	if err != nil {
		return modelsv2.ClanCategoryDeleteResponse{}, err
	}
	if tag.RowsAffected() != 1 {
		return modelsv2.ClanCategoryDeleteResponse{}, pgx.ErrNoRows
	}
	if _, err := tx.Exec(ctx, `
		UPDATE server_clan_categories
		SET position = position - 1
		WHERE server_id = $1 AND position > $2
	`, serverID, position); err != nil {
		return modelsv2.ClanCategoryDeleteResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return modelsv2.ClanCategoryDeleteResponse{}, err
	}
	return modelsv2.ClanCategoryDeleteResponse{
		CategoryID:             storedID,
		Name:                   name,
		Deleted:                true,
		UncategorizedClanCount: affectedClanCount,
	}, nil
}

func scanClanCategory(row clanCategoryRowScanner) (modelsv2.ClanCategory, error) {
	var category modelsv2.ClanCategory
	err := row.Scan(
		&category.ID,
		&category.ServerID,
		&category.Name,
		&category.Position,
		&category.ClanCount,
	)
	return category, err
}

func normalizeClanCategoryOrder(values []string) ([]uuid.UUID, error) {
	categoryIDs := make([]uuid.UUID, 0, len(values))
	seen := make(map[uuid.UUID]struct{}, len(values))
	for _, value := range values {
		categoryID, err := uuid.Parse(strings.TrimSpace(value))
		if err != nil {
			return nil, apptypes.Error(http.StatusBadRequest, "categoryIds must contain only UUIDs")
		}
		if _, exists := seen[categoryID]; exists {
			return nil, apptypes.Error(http.StatusBadRequest, "categoryIds must not contain duplicates")
		}
		seen[categoryID] = struct{}{}
		categoryIDs = append(categoryIDs, categoryID)
	}
	return categoryIDs, nil
}

func replaceClanCategoryOrder(ctx context.Context, db clanCategoryDB, serverID string, categoryIDs []uuid.UUID) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		SELECT id
		FROM server_clan_categories
		WHERE server_id = $1
		FOR UPDATE
	`, serverID); err != nil {
		return err
	}
	var total, matched int
	if err := tx.QueryRow(ctx, `
		SELECT count(*)::int,
		       count(*) FILTER (WHERE id = ANY($2::uuid[]))::int
		FROM server_clan_categories
		WHERE server_id = $1
	`, serverID, categoryIDs).Scan(&total, &matched); err != nil {
		return err
	}
	if total != len(categoryIDs) || matched != len(categoryIDs) {
		return apptypes.Error(http.StatusBadRequest, "categoryIds must contain every category for this server exactly once")
	}
	if _, err := tx.Exec(ctx, `SET CONSTRAINTS server_clan_categories_server_id_position_key DEFERRED`); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `
		UPDATE server_clan_categories category
		SET position = (ordered.ordinality - 1)::int
		FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id, ordinality)
		WHERE category.server_id = $1 AND category.id = ordered.id
	`, serverID, categoryIDs)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != int64(len(categoryIDs)) {
		return pgx.ErrNoRows
	}
	return tx.Commit(ctx)
}

func normalizeClanCategoryName(value string) (string, error) {
	name := strings.Join(strings.Fields(value), " ")
	if name == "" {
		return "", apptypes.Error(http.StatusBadRequest, "name is required")
	}
	if utf8.RuneCountInString(name) > maxClanCategoryNameRunes {
		return "", apptypes.Error(http.StatusBadRequest, "name must be at most 64 characters")
	}
	for _, character := range name {
		if unicode.IsControl(character) {
			return "", apptypes.Error(http.StatusBadRequest, "name contains unsupported control characters")
		}
	}
	return name, nil
}

func normalizeClanCategoryAssignment(value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", nil
	}
	return normalizeClanCategoryName(value)
}

func parseClanCategoryID(value string) (string, error) {
	categoryID, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil {
		return "", apptypes.Error(http.StatusBadRequest, "categoryId must be a UUID")
	}
	return categoryID.String(), nil
}

func clanCategoryOperationError(err error, fallback string) error {
	var appErr *apptypes.AppError
	if errors.As(err, &appErr) {
		return err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return apptypes.Error(http.StatusNotFound, "Clan category not found")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			return apptypes.Error(http.StatusConflict, "A clan category with this name already exists")
		case "23503":
			return apptypes.Error(http.StatusNotFound, "Server not found")
		case "22P02":
			return apptypes.Error(http.StatusBadRequest, "categoryId must be a UUID")
		}
	}
	return apptypes.Error(http.StatusInternalServerError, fallback)
}
