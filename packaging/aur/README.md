# AUR packaging

This directory maintains the `amicited-desktop-bin` and `amicited-desktop-nightly-bin` AUR
packages. Both repackage the official x86_64 AppImage from GitHub Releases.

Publishing is off. The AUR packages are not registered yet, and `publish-aur.yml` runs only in
`QualityUnit/amicited-desktop` with the repository variable `AMICITED_RELEASES_ENABLED` set to
`true`. The committed `pkgver` and checksums are placeholders that `scripts/release.sh` replaces
from the release it publishes. The AppImage downloads from GitHub Releases, so the release
repository must be public before these packages can build.

## Publishing

The release workflow calls `.github/workflows/publish-aur.yml` after publishing a GitHub release;
the workflow can also be run manually for a specific tag. It selects the stable or nightly
package, then updates its version and checksums, builds it, regenerates `.SRCINFO`, and pushes it
to the AUR.

To validate a release on Arch Linux:

```bash
sudo pacman -Syu --needed base-devel github-cli jq namcap
GH_TOKEN=$(gh auth token) RELEASE_TAG=v1.0.0 \
  packaging/aur/scripts/release.sh
```
