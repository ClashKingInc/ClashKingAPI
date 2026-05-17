package v2

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// maxCDNUploadSize is 25 MB — enough for Discord attachment limits.
const maxCDNUploadSize = 25 * 1024 * 1024

var cdnAllowedExtensions = map[string]bool{
	// images
	"png": true, "jpg": true, "jpeg": true, "gif": true, "webp": true, "svg": true,
	// video
	"mp4": true, "mov": true, "webm": true,
	// audio
	"mp3": true, "ogg": true, "wav": true,
	// documents / misc
	"pdf": true, "txt": true, "json": true,
}

// uploadFileToCDN godoc
// @Summary Upload a file to the ClashKing CDN
// @Description Uploads an arbitrary file and returns its public CDN URL. Requires authentication.
// @Tags CDN
// @Accept multipart/form-data
// @Produce json
// @Security ApiKeyAuth
// @Param file formData file true "File to upload (max 25 MB)"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 413 {object} map[string]string
// @Failure 415 {object} map[string]string
// @Router /v2/cdn/upload [post]
func uploadFileToCDN(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		fileHeader, err := c.FormFile("file")
		if err != nil || fileHeader == nil {
			return apptypes.Error(http.StatusBadRequest, "A 'file' field is required")
		}

		if fileHeader.Size > maxCDNUploadSize {
			return apptypes.Error(http.StatusRequestEntityTooLarge, "File too large (max 25 MB)")
		}

		// Derive and validate extension from original filename.
		originalName := fileHeader.Filename
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(originalName), "."))
		if ext == "" {
			ext = "bin"
		}
		if !cdnAllowedExtensions[ext] {
			return apptypes.Error(http.StatusUnsupportedMediaType, fmt.Sprintf("Unsupported file type: .%s", ext))
		}

		f, err := fileHeader.Open()
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Failed to open uploaded file")
		}
		defer f.Close()

		data, err := io.ReadAll(f)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Failed to read uploaded file")
		}

		// Double-check size after reading (in case Content-Length was missing).
		if len(data) > maxCDNUploadSize {
			return apptypes.Error(http.StatusRequestEntityTooLarge, "File too large (max 25 MB)")
		}

		title := fmt.Sprintf("embed_%s", uuid.New().String())
		cdnURL, err := bunnyUploadFileWithExt(a.Config.BunnyAccessKey, title, ext, data)
		if err != nil {
			return apptypes.Error(http.StatusInternalServerError, "Failed to upload file to CDN")
		}

		return apptypes.JSON(c, http.StatusOK, map[string]string{
			"url":      cdnURL,
			"filename": fmt.Sprintf("%s.%s", title, ext),
		})
	}
}

// bunnyUploadFileWithExt uploads bytes to BunnyCDN preserving the given extension.
func bunnyUploadFileWithExt(accessKey, title, ext string, data []byte) (string, error) {
	title = strings.ToLower(strings.ReplaceAll(title, " ", "_"))
	path := fmt.Sprintf("%s.%s", title, ext)
	uploadURL := fmt.Sprintf("https://storage.bunnycdn.com/clashking-files/%s", path)

	req, err := http.NewRequest(http.MethodPut, uploadURL, bytes.NewReader(data))
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
	return fmt.Sprintf("https://cdn.clashk.ing/%s", path), nil
}
