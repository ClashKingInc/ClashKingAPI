# Vendored packages

`clashking-clash-contract-0.1.2.tgz` is built from MockAPI's
`packages/clash-contract` package. It is committed so local and CI installs do
not depend on an absolute sibling checkout or an unpublished registry version.

Replace the tarball and update `package-lock.json` whenever MockAPI publishes a
new contract version. After the package is published to npm, replace the local
file dependency with its exact registry version and remove the tarball.
