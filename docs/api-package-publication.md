# API package releases

Publishing a GitHub Release tagged `v<VERSION>` builds the matching
`@clashking/api-contracts` and `@clashking/api-client` packages and attaches both
`.tgz` archives to that release. The two package manifests must use the same
exact version, and the client must depend on that exact contracts version.

The release workflow builds and validates the repository before packing either
package. It checks the archive file list and exported files, records SHA-512 and
SHA-256 digests in `manifest.json`, preserves the package set as a workflow
artifact, and uploads the two archives and manifest to the GitHub Release.
Rerunning the workflow for the same tag replaces the release assets only with
archives rebuilt from that tag's immutable commit.

To repair an interrupted release upload, run **Release API packages** manually
and enter the existing release tag. A new package version requires updating both
package manifests and their exact internal dependency before publishing the
matching GitHub Release.

Consumers install a release asset URL or downloaded archive and commit their
lockfile with the chosen package version.
