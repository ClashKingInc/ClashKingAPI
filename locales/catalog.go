package locales

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/text/language"
)

const English = "en"

//go:embed *.json
var embedded embed.FS

type Catalog struct {
	translations map[string]map[string]string
	matcher      language.Matcher
	tags         []language.Tag
}

var (
	defaultCatalog *Catalog
	defaultErr     error
	defaultOnce    sync.Once
)

func Default() (*Catalog, error) {
	defaultOnce.Do(func() { defaultCatalog, defaultErr = Load(embedded) })
	return defaultCatalog, defaultErr
}

func Load(files fs.FS) (*Catalog, error) {
	entries, err := fs.ReadDir(files, ".")
	if err != nil {
		return nil, fmt.Errorf("read locale catalogs: %w", err)
	}
	c := &Catalog{translations: make(map[string]map[string]string)}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := fs.ReadFile(files, entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read locale %s: %w", entry.Name(), err)
		}
		values := map[string]string{}
		if err := json.Unmarshal(data, &values); err != nil {
			return nil, fmt.Errorf("decode locale %s: %w", entry.Name(), err)
		}
		locale := Normalize(strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())))
		c.translations[locale] = values
	}
	if _, ok := c.translations[English]; !ok {
		return nil, fmt.Errorf("English locale catalog is required")
	}
	c.tags = []language.Tag{language.English}
	for locale := range c.translations {
		if locale == English {
			continue
		}
		if tag, err := language.Parse(locale); err == nil {
			c.tags = append(c.tags, tag)
		}
	}
	c.matcher = language.NewMatcher(c.tags)
	return c, nil
}

func Normalize(locale string) string {
	locale = strings.TrimSpace(strings.ReplaceAll(locale, "_", "-"))
	if locale == "" {
		return English
	}
	tag, err := language.Parse(locale)
	if err != nil {
		return English
	}
	base, _ := tag.Base()
	if base.String() == "und" {
		return English
	}
	return tag.String()
}

func (c *Catalog) Resolve(locale string) string {
	if c == nil {
		return English
	}
	tag, err := language.Parse(Normalize(locale))
	if err != nil {
		return English
	}
	_, index, confidence := c.matcher.Match(tag)
	if confidence == language.No {
		return English
	}
	return c.tags[index].String()
}

func (c *Catalog) Text(locale, key string, params map[string]string) string {
	resolved := c.Resolve(locale)
	value := c.translations[resolved][key]
	if value == "" {
		value = c.translations[English][key]
	}
	if value == "" {
		return key
	}
	for name, replacement := range params {
		value = strings.ReplaceAll(value, "{{"+name+"}}", replacement)
	}
	return value
}
