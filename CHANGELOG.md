# Changelog

All notable changes to ManaVault are documented here.

Versions follow [Semantic Versioning](https://semver.org/).
This file is generated from `git log` using [git-cliff](https://git-cliff.org).
See [docs/releasing.md](docs/releasing.md) for maintainer instructions.

---

## [0.11.1] - 2026-06-27

### Bug Fixes

- Local dev optimize deps ([`a2e6fb04`](../../commit/a2e6fb04b4e709de7a65ab0918cdbb6f9e309de4))
- Don't auto-sort deck allocated cards ([`9e319658`](../../commit/9e319658656fe04c9823fb7cf9c940695ac3d75d))
- Grab parent tags ([`785f31d3`](../../commit/785f31d387a317830b5f0b63d60c4a0ca48a7e37))

### Features

- Deck page fixes ([`4602e89b`](../../commit/4602e89b09448929f9a99638ecac7e9ec376166d))

### Style

- Change land and counter icons ([`532138ea`](../../commit/532138ea5e7e44d8a3bf0a100c68aa0d598cc4d6))

## [0.11.0] - 2026-06-26

### Bug Fixes

- Preview png ([`680015c2`](../../commit/680015c2a89357fca6d535a37c3d7435b9a485c9))
- Light mode card view ([`bef91e91`](../../commit/bef91e91e440b0726cd5e2e765228b9a8883e5b3))
- Edhrec deck status ([`d79c5578`](../../commit/d79c5578d1f09c2f8167ade70c331d907c89d379))
- Mobile deck view ([`f089aaa1`](../../commit/f089aaa17b1dfeaf288ad63c1fd5658b254de355))
- Deck share page ([`cb490153`](../../commit/cb4901536c2fa35191a23130b163701129fb818d))
- Deck card menu ([`f48b3edb`](../../commit/f48b3edbdfd3a53631e431b4c56c2ceafdecd469))
- Prevent PWA asset-reload from triggering in native Capacitor shell (#57) ([`6d9dc31d`](../../commit/6d9dc31da67862fc04dda4604551e76324dffc60))

### Chores

- Lint and format with vp ([`103c1332`](../../commit/103c1332cd7415c03987636df6491c4d86355cd9))
- Only build app when necessary ([`c583528d`](../../commit/c583528dc31e6ab4f9d5a07ac2c353e856ce3171))

### Features

- Preview image ([`5ad57fac`](../../commit/5ad57fac579a800619bcf6549fdc31d16b3304e6))
- Gamechangers ([`0c753254`](../../commit/0c7532548fd321ee03ae7371563ba15fcea1d7be))
- Deck view improvements ([`1bfa4cde`](../../commit/1bfa4cdefa51bd9b5f666896477ee99c38e303be))
- Deck optimistic updates ([`b5c380de`](../../commit/b5c380dedb9a07567d58d1b4332387799a02e747))
- Optimize printings ([`0f513c13`](../../commit/0f513c13c660423b56231067e10781f686f74b8a))

### Miscellaneous

- Shorten "owned but unavailable" badge label to "unavailable" (#59) ([`aca99319`](../../commit/aca99319821585e7df8d847415c2113ccab2ece7))
- Stop forcing external links into the native WebView (#60) ([`460f1c1b`](../../commit/460f1c1b8f4c9bb72a6d964f62d2970340013630))

### Refactoring

- Optimize deck query ([`0ce21220`](../../commit/0ce21220256fbef78bdd133d68fb9ab3ae856fb3))
- Optimize decks query ([`8ba397e1`](../../commit/8ba397e16cd483f70675b61763f021304bed4e81))
- Use apollo client ([`775ff95a`](../../commit/775ff95a8fc38e07cf179be5e065014ddda1c774))

## [0.10.0] - 2026-06-25

### Features

- Autosort ([`61216f8c`](../../commit/61216f8c6cf9b217f4e937afb093120e5ad9b1cc))
- Auto sort improvements ([`ced6d446`](../../commit/ced6d446e19189af2ca29ded2e0b6bd0b3c45d42))
- Show foil status on auto sort preview ([`869a52b0`](../../commit/869a52b0b47f9996aed014821031a8d468cf7b2a))
- Don't backup scryfall catalog ([`62bc8301`](../../commit/62bc83018d842485baccdd5aadea1ad35b8d1878))
- Pull list ([`764d1a7e`](../../commit/764d1a7ea8567f56b0c9f4b48ab61f1efc011987))
- Import purchase price ([`05117ee7`](../../commit/05117ee798aea580b9b614e207be04e232071ef3))
- Store sort ([`8a3489d3`](../../commit/8a3489d32d0ac2953c95cf51ce2c7481d1caded1))
- Disassemble deck ([`49d984cc`](../../commit/49d984cc7ab8fdafe448e1e9a700c20656c84898))
- Edit from card view ([`eb85c4de`](../../commit/eb85c4de8726544b6f40493d8c01eff425137d73))
- Bulk edit ([`6475e034`](../../commit/6475e034f7ab64c87e20f8c94ccc6fcf4862d668))
- Autocomplete set in filter ([`6b0a6ca4`](../../commit/6b0a6ca49f120f87d5e9393d4556a68c02418c42))
- Toast on modal close ([`55d43ae3`](../../commit/55d43ae365584cfb986fc2a6e448736a08aa5e3c))

### Tests

- Public mutation guard ([`b983d375`](../../commit/b983d3753a0810ac82061257c96de00658838386))

## [0.9.1] - 2026-06-24

### Bug Fixes

- Don't count basic lands for allocation ([`542ea819`](../../commit/542ea819a271dae722d5db86c055939d195d46ef))
- Healthcheck ([`541bbe78`](../../commit/541bbe7882583777c6a75ff6435ffaf852be7691))
- Deck pricing ([`356713f5`](../../commit/356713f591b09a8cd1f196c6a6bdf2658dbf92f3))
- Allocate only for mainboard ([`51eb88b4`](../../commit/51eb88b48703d94287a2755c75e6d2884f3ffb9b))

### Documentation

- Self-hosting healthcheck ([`17ed5a7b`](../../commit/17ed5a7b165bb6cd5529b9cf11338ba865011411))

### Features

- Share deck buy list ([`e7fb1d24`](../../commit/e7fb1d24b5e7d54311daaa29c0de8b96cd113537))

### Refactoring

- Switch to alpine image ([`c0768c9c`](../../commit/c0768c9c9be49ade2295b4076a0de82083f793df))

## [0.9.0] - 2026-06-24

### Bug Fixes

- Some deck loading slowness ([`ff85b79a`](../../commit/ff85b79abf1aaea581037d549d0405d079db2131))

### Chores

- Update README.md ([`2116eeea`](../../commit/2116eeead7f5cd9ac40f677a337ae95ebbfd37ac))

### Features

- Docs updates and mobile fixes ([`53f59475`](../../commit/53f5947505e7875c2522aea2dc6fad7d76deb495))
- Add some missing indices ([`e59f85a1`](../../commit/e59f85a1fe73d55dfac6d7f7d10502262d1dced0))

### Refactoring

- Split out large files ([`31b1d9e5`](../../commit/31b1d9e545d1008e8a9a24fad309ab2563d6c2df))
- Use dataloader for cards/collection ([`bfa95f13`](../../commit/bfa95f131f5e06d2ae96785ae796b08026348eb1))
- More dataloader and batching ([`055fdb8e`](../../commit/055fdb8eb51ef3f701bc642ca125a708eff90b12))
- Remove deprecated Repo.transaction/2 ([`e4d2efdc`](../../commit/e4d2efdc2df5b9f2cbe06c8e8ba7e1c2ccf202f1))
- Relay ([`41fa5b6b`](../../commit/41fa5b6b301d7b3e65e7359fc98e18414a1f95e6))

## [0.8.0] - 2026-06-23

### Features

- Deck tokens ([`0dc6dee4`](../../commit/0dc6dee4fb09bff0bfd196b0a1d3e0061f3b0c93))
- Deck/collection improvements ([`2e9da29a`](../../commit/2e9da29a7001fbb4933cb8ec4e1ccb542aeef0b3))

## [0.7.2] - 2026-06-23

### Bug Fixes

- Android app attachment loading ([`3cfeed35`](../../commit/3cfeed35e939f8678c744919138ee0f9327f2d52))

### Features

- Deck stats and fixes ([`36add790`](../../commit/36add790982ecf06b6cc30b10a3c1e97108b72cd))

## [0.7.1] - 2026-06-23

### Bug Fixes

- Put capacitor native methods in header ([`e77d3a2a`](../../commit/e77d3a2a54f5cd997a4efa6deb832b69b2f6c5ba))

### Features

- Deck legality ([`1a65ce54`](../../commit/1a65ce547406b9c75f289c95d42abc902cc4e4cc))

## [0.7.0] - 2026-06-23

### Features

- Import scryfall oracle tags ([`9f17efaf`](../../commit/9f17efafb6a6e97ac7bdc7aae5392511259565cc))
- Show tags on card view ([`f5d8989d`](../../commit/f5d8989d9033394fcb1b0615374f277ac4143d9e))
- Show card rulings ([`a1648b03`](../../commit/a1648b032d2b292c0b5e6332bcc6817a46be78f8))
- Show card legalities ([`46243ef6`](../../commit/46243ef6117b9099fb57ff8c4bfa4cca5f590eea))
- Group decks by category and theme ([`d1c9696d`](../../commit/d1c9696df07247b01caec54f15f585ac6bf52ab8))
- Deck page fixes and icons ([`fff1f274`](../../commit/fff1f274fb054294561c5f106f95346a058444d6))

## [0.6.9] - 2026-06-23

### Bug Fixes

- **android:** Load shared collection imports ([`8ba05779`](../../commit/8ba05779fc192b17757478cc6968e4f2ffb94814))

### Features

- Persist filter on search ([`dc782cbd`](../../commit/dc782cbdbd79270698de19f7981ef8281b106cf1))

## [0.6.8] - 2026-06-23

### Bug Fixes

- Add capacitor plugin headers ([`e72b1014`](../../commit/e72b1014de3b6b2d7d2c3e238c33c4eeed5bd9bc))

## [0.6.7] - 2026-06-23

### Bug Fixes

- Full screen card viewer in app ([`f351fd33`](../../commit/f351fd331662557ac75fd24ed080320167f14f89))
- Preserve pending import until consumed ([`05ae6265`](../../commit/05ae6265db9b8159c00c867f84ba1c5acfb40ad2))

## [0.6.6] - 2026-06-23

### Bug Fixes

- Import ([`310cab70`](../../commit/310cab70e054a0ed065125a8eacf9ffd283609ff))

## [0.6.5] - 2026-06-23

### Bug Fixes

- Android app ([`0066dba0`](../../commit/0066dba0c230e5c1c9b8080911716fe11c1d35b4))

## [0.6.4] - 2026-06-23

### Features

- Session cookies ([`cfbf9d01`](../../commit/cfbf9d01e3f8f467d3838dae536dfa927045a414))

## [0.6.3] - 2026-06-22

### Bug Fixes

- Android share ([`abf7ab3a`](../../commit/abf7ab3a4da3930243925aca88469d8c3163f678))

### Refactoring

- Full screen card view for shared deck ([`25892f8d`](../../commit/25892f8d2ee0f87cb1c7075b354f5425fd8c89a6))

## [0.6.2] - 2026-06-22

### Features

- Ip banning ([`7c64cebf`](../../commit/7c64cebf55ad2e5203ef6c89b6def3aa3ebc630b))
- Expose more features to shared deck view ([`3cdd923b`](../../commit/3cdd923b25ba001f836eab42c0e9225cf3fdab72))
- Sort by added date ([`5179d7de`](../../commit/5179d7de7a9540f48aff1a940e5161e40d40c462))

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
