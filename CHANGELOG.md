# Changelog

All notable changes to ManaVault are documented here.

Versions follow [Semantic Versioning](https://semver.org/).
This file is generated from `git log` using [git-cliff](https://git-cliff.org).
See [docs/releasing.md](docs/releasing.md) for maintainer instructions.

---

## [0.6.1] - 2026-06-22

### Bug Fixes

- Use config_env instead of Mix.env ([`283a39d6`](../../commit/283a39d608a1039a62bbd5c972847ff0ae1ea8e5))

## [0.6.0] - 2026-06-22

### Bug Fixes

- Apk build ([`14613c7a`](../../commit/14613c7a80965d0df838b0ff4d18b6bf07c65f32))

### Features

- Deck tagging ([`223ccded`](../../commit/223ccdedbe4647ad555a508c4be940d34853006f))
- Auth ([`b4801d2f`](../../commit/b4801d2f0d3f5cb9f893ea47d698f9299407f52a))

## [0.5.3] - 2026-06-22

### Bug Fixes

- App fixes ([`977467b4`](../../commit/977467b4296c69b93c325d981bbbb4921a3b0f30))

### Features

- Sign release app and document custom domain ([`1f4c8da8`](../../commit/1f4c8da85ef7fe6e14569214ee7b31a13286a14e))

## [0.5.2] - 2026-06-22

### Bug Fixes

- Deck page buylist ([`71564893`](../../commit/71564893c4f8a337dc0a32f92fe19a74fe968746))

## [0.5.1] - 2026-06-22

### Bug Fixes

- Deck page N+1 ([`a09ae3ca`](../../commit/a09ae3ca4c68b1056489656002b4bbbb22364c3d))

## [0.5.0] - 2026-06-22

### Bug Fixes

- Reveal card actions on mobile tap ([`20c2987f`](../../commit/20c2987f7458c6276c7b7de74c3833e764de9b49))
- Move server config to settings once configured ([`c8be6d8a`](../../commit/c8be6d8ac7a1e202bfeff93b1d87b02984c1f364))

### Features

- Add deck playtest tool ([`52f7c03e`](../../commit/52f7c03eb8cb272861afcaaab9fd7f6e2e5d8d46))
- Playtest improvements ([`f1f05403`](../../commit/f1f05403744f6aa3c504fd3a6757ae719cfed0d5))

### Refactoring

- Code cleanup ([`fb7a877f`](../../commit/fb7a877f62a37ac97d13218c18d2c881ed2a4486))

## [0.4.0] - 2026-06-22

### Bug Fixes

- Cloudflare caching ([`c556a0bf`](../../commit/c556a0bfab2d01b6d0a58e46acb6c5fdf1543ab7))
- Capacitor app logo and startup ([`bcac212b`](../../commit/bcac212b738c82b46f8270e812b67a6d67f06841))

### Chores

- Scanner logging for prod ([`ae5e99f6`](../../commit/ae5e99f65e83278bae2c2bbb7a1ba7c638333c1f))

### Features

- Cloud backups ([`951e609c`](../../commit/951e609ce34ae8ca4d799ab6a075d00ea5a4f929))
- Commit asset versioning ([`82664bc3`](../../commit/82664bc3b7fcb62b73efb0448f83e5223fe23b0d))
- Force sync catalog ([`7ef15a42`](../../commit/7ef15a4263300d451c25034da0a1f2f248365318))
- Loosen art first threshold ([`7957fbe6`](../../commit/7957fbe6141bcefec2236766b9bda60b062eeead))
- Deletes and standardize modals ([`6ea30527`](../../commit/6ea3052744d99d1649511696225f0f177f9b44bb))
- Commander colors ([`13f0e841`](../../commit/13f0e841270979cb12f6f238a7e0c534ef01b283))

### Refactoring

- Delete scanner and pivot to better import ([`6f75f86e`](../../commit/6f75f86ebf5f0e6b5c87d940054cb445138fd819))
- Optimize slow queries ([`cc638386`](../../commit/cc638386887ac21180a62aefd61aad7f0ad6a5e2))

## [0.3.0] - 2026-06-22

### Bug Fixes

- Grype vulnerabilities ([`bea730e8`](../../commit/bea730e80a5eb312a68c3bfcb0f43d8b322e6f2a))
- Scanner/cacheing ([`d3353aa6`](../../commit/d3353aa61b7d8bd47091b527f2fdb71d53da19b1))
- Assets root ([`9bf1e7d3`](../../commit/9bf1e7d38a64758030fe085f5146a8732fa123f3))
- Scanner improvements ([`e1437f25`](../../commit/e1437f25784b5200593bf742f8a28ac6688563cc))
- Hide allocated cards from locations ([`ba591bd1`](../../commit/ba591bd1df4c2c1f63ce6455f4daef67b8393b4c))
- Capacitor build ([`9e485322`](../../commit/9e4853229592f81ec58614aa51a68e58358d7977))
- Browser chunk recovery and capacitor build ([`d18f5965`](../../commit/d18f59650a5b673f76480741e1124bd048d76349))
- Scanner improvements ([`fa4d24c3`](../../commit/fa4d24c3e2fe7b82fe4d1ce2a9dcc5eb8a214a80))
- Start scan session ([`3f842a54`](../../commit/3f842a5403b627083d955a0c91e3ab66048e702b))
- Don't count sideboards in deck count ([`56ff67c1`](../../commit/56ff67c1a28613986f6d9b555b7f9a506265923f))

### Features

- Proxy ([`51706f4f`](../../commit/51706f4f5b0a0d6dca3f031ea37b8bc7b167e936))
- Ocr title fast path ([`12446f92`](../../commit/12446f92512235727ef856a9030e7bb19f07f2f8))
- Support openvino for ocr ([`b92c14b6`](../../commit/b92c14b67bb79c2746496ac6a968db6846abf98b))
- Publish openvino container ([`400208ba`](../../commit/400208baf22fabed73e52463b0285b974b8261b5))
- Scanner footer crop ([`c0151c9d`](../../commit/c0151c9d9ccf14a0fe98483a128d4b54c85efbb1))
- Delete scanned card ([`031cbbc8`](../../commit/031cbbc8fb5961c6808abc46c5cfd3a454a53f01))
- Price tracking ([`5fc13742`](../../commit/5fc13742e2c9f9351f2fefd2aed99590519e58a3))
- Apk build and setup ([`3301fa46`](../../commit/3301fa4635d9c466bf6a42fde96a2acea28f0572))
- Show collection count on card search ([`c0a21bd2`](../../commit/c0a21bd2ba5c5883f4e8395eb0d89163eea2bf36))
- Fullscreen card preview ([`f29fa18c`](../../commit/f29fa18ccc67db2996f73ac9257073ea1992cb10))

### Refactoring

- Scanner optimizations ([`7a80f392`](../../commit/7a80f39222a35c370a8f4132cd902ab3ff866a05))
- Image match by default async ([`ff91ad23`](../../commit/ff91ad23412098514e29fe3829a3ce0770756386))

### Style

- Home screen ([`36a64365`](../../commit/36a64365988a260deefed2103f3c546a3bd75b34))
- Nav ([`8b55b77f`](../../commit/8b55b77fb65354a2c4b6e88c93419d1c2bce1e2d))
- Fullscreen card ([`7b75721e`](../../commit/7b75721efd24b81a2fee498d5da65dedccca5690))

## [0.2.3] - 2026-06-20

### Features

- Symbols sync worker ([`8a076580`](../../commit/8a07658061d32cfdc6b33f510ebfc7972ce8686b))

## [0.2.2] - 2026-06-20

### Features

- Shareable decks ([`1878c0ca`](../../commit/1878c0cabe6245e6069cdd2069018ef914584ee5))
- Card multi-select ([`c9ce5897`](../../commit/c9ce58978a7464a34a35523ea5a5b329649a5857))

### Refactoring

- Split out catalog ([`e417d4a2`](../../commit/e417d4a2c5fd6284e4c1527f04c4cad149c20d75))

## [0.2.1] - 2026-06-20

### Chores

- Add release changelog tooling ([`718d7c62`](../../commit/718d7c62302111d559cac3c6d3af59d6d1cfaa7a))

### Miscellaneous

- Fix OCR runtime container dependencies ([`c4fe0c56`](../../commit/c4fe0c56774502114d9777a443fa6958dab8454e))
