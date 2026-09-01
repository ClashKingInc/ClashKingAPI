import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		server: {
			deps: {
				inline: ["pg"],
			},
		},
	},
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
			miniflare: {
				hyperdrives: {
					HYPERDRIVE: "postgres://test:test@127.0.0.1:5432/test",
				},
			},
		}),
	],
});
