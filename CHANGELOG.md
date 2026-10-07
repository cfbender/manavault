# Changelog

All notable changes to ManaVault are documented here.

Versions follow [Semantic Versioning](https://semver.org/).
This file is generated from `git log` using [git-cliff](https://git-cliff.org).
See [docs/releasing.md](docs/releasing.md) for maintainer instructions.

---

## [2.0.0] - 2026-10-07

### Bug Fixes

- Version the stylesheet and shell scripts per deploy ([`61c53cfc`](../../commit/61c53cfc7678dbbcf33d5ae318904c0be384a711))
- **ai:** Refine bracket labels and interaction analysis ([`3c52c0e4`](../../commit/3c52c0e484c3a0774548d74d188571d601b777c3))
- **ai:** Anchor bracket labels to practical pace ([`8a6ba0ac`](../../commit/8a6ba0acc47279f9c82c6a74ada363e48400c54a))
- **ai:** Use compatible sampling defaults and log provider errors ([`fa0ff80f`](../../commit/fa0ff80fcbf4f73c25f8986c05f4ea561baaf589))
- **ai:** Separate nullable bracket rating schema branches ([`dfb988d4`](../../commit/dfb988d4dff3203ce2f00920acc44230d061e6c1))
- **ai:** Run saved-deck analysis in the background ([`a10defdb`](../../commit/a10defdbc8b35e5c5b6c4e528e837d5a293c9ac3))
- **ai:** Enable card links and previews in deck analysis ([`6a101a37`](../../commit/6a101a377d014355f1da5a1ad953d4ed3a3eec0d))
- **ai:** Open referenced cards on Scryfall ([`e792eff4`](../../commit/e792eff4693a193cc68a12e1176f8cd577300a86))
- **docker:** Bump OTP to 29.1.1 for CVE-2026-89422 ([`618063d0`](../../commit/618063d04e998156f69e386d9e85f143d1b52a71))
- **android:** Use supported resource shrinking assignment ([`fd68a7e7`](../../commit/fd68a7e7a9de99dc51f17d168f5e6e205d87fdde))
- **pricing:** Isolate vendor sync crashes and log Oban job failures ([`92b0fc65`](../../commit/92b0fc65a1b0b176e6cd55f475501ca25aab3195))
- **pricing:** Retry vendor price writes when SQLite is busy ([`58576592`](../../commit/58576592d0e2cb45040a6c2a11386df53e05bab8))
- **decks:** Allow any card that can be your commander as commander ([`a2c57412`](../../commit/a2c574127579ea60fac498a83353d53243c458ba))
- **decks:** Never allocate cards in the considering zone ([`d33c6b03`](../../commit/d33c6b0341124a8347d4167920fe1dd56e3d895d))
- **import:** Reject imports whose location or printing was deleted after preview ([`36e34372`](../../commit/36e34372d873cbda41de82d8e18e4c38df5b2626))
- **decks:** Keep purchase price when splitting collection items for allocation ([`26cac7e7`](../../commit/26cac7e75483a74079026c5caaa5b3eb15ff53c4))
- **scryfall:** Import reversible cards and match their full names (#158) ([`87152b21`](../../commit/87152b21a24d92da4b51ac537baeb22e4daf826e))
- **decks:** List only Scryfall-linked tokens when a card has them ([`9b38daa4`](../../commit/9b38daa4949a09312a362032570857b2dbc28bd3))
- **repo:** Give SQLite writers 15 s before Oban's stager gives up ([`1c481f54`](../../commit/1c481f54111ba51a6b3770f692610a889c73f5b9))
- **scanner:** Log tokens on click and reuse the last copy's back in tokens mode ([`56826719`](../../commit/56826719ae800bad1c7274eaaebf0f4a67bd7b89))
- **catalog:** Stop the Scryfall import from starving other SQLite writers ([`74fe2de3`](../../commit/74fe2de3ce52e021bade35659a4ee5fc6b22a2aa))
- **catalog:** Import bare-"Card" game helpers printed as tokens ([`062c8c9d`](../../commit/062c8c9d6e24b867720141686c422042a63ccc93))
- **decks:** Keep copy counts and purchase prices when releasing considering allocations ([`a270d004`](../../commit/a270d0041c4f79789c4e9d9c49be26e10e7f94c5))
- **decks:** Treat snow basics as basic lands ([`a587fda9`](../../commit/a587fda924b0c8afada689ed538f9fcf87f8f1cc))

### Chores

- **backlog:** Track trusted outlines for detector training ([`64fadd35`](../../commit/64fadd353bb66335d5271f54054214d70b5b25ac))
- **backlog:** Record trusted outline progress ([`5755c6ef`](../../commit/5755c6eff92561c8c859e6e25e37bd29e7b11ce4))
- **backlog:** Note trusted outlines are pushed ([`b1ae111d`](../../commit/b1ae111dc5cf7a4431589b659bb639bf5cc2e3cf))
- **deps:** Update compatible dependencies and fix compiler warnings ([`bd506da1`](../../commit/bd506da10ea9877b92b655c2413e3c4fcbe6e815))
- **deps:** Upgrade frontend tooling and resolve build warnings ([`544c59e1`](../../commit/544c59e1b0b24de065b02da4004608acdd573d4f))

### Documentation

- **scanner:** Link Oracle's guide to improving recognition ([`f3a1cca3`](../../commit/f3a1cca3308c33c2ef2006fe0014131d2edcdb85))
- **scanner:** Use Oracle's new-set command for set releases ([`f18a47af`](../../commit/f18a47af6e19eb02027485469d980568edab3668))
- Record granular bracket verification ([`49c1342c`](../../commit/49c1342cefd5002d2afd2986f2500e64fec43111))
- Reorganize README and document all features and operations ([`337b0e5f`](../../commit/337b0e5ffc09f5fc285b39155480ca5003801d0f))
- **scanner:** Describe Oracle's export-time hub penalty and its manifest record ([`fa4bbe63`](../../commit/fa4bbe637245aa2f4d932c03eddd418b9e4f0e51))
- **scanner:** Note that oracle exports emblem arts with an emblem frame ([`6a1e790a`](../../commit/6a1e790ae8ce81cbd616061c21a248e43d52bbe8))

### Features

- **scanner:** Check card outlines so they can train the detector ([`1d85ec5b`](../../commit/1d85ec5bd0d13d9d81dbf7495200959e5d06eaa8))
- **scanner:** Leave cards under a minimum price out of the total ([`0f2637bd`](../../commit/0f2637bd223f773f68513c062dcd7f12c44ddcea))
- **scanner:** Run recognition on WASM threads behind a cross-origin isolated /scan ([`c8727f31`](../../commit/c8727f31b82879645d51b4eff4ebbcb5572a342d))
- **ai:** Assess granular Commander bracket ratings ([`5a59f93d`](../../commit/5a59f93d8f5fabd461d31ee084bed9356be3735f))
- **ai:** Add saved deck conversations and fresh chats ([`32c4fecb`](../../commit/32c4fecb4782287dc56b88455423740da2054060))
- **pricing:** Price ManaPool from lowest near-mint listings per finish ([`2052e87f`](../../commit/2052e87fbcf714658f95c9d48dccc47b4979c168))
- **decks:** Open AI analysis card references in the card detail dialog ([`640b927b`](../../commit/640b927b68ca579e027a6a7188593de69192e946))
- **collection:** Toggle value rankings between total and percent gain/loss ([`a191f8c1`](../../commit/a191f8c118bf3daad5b3f36921cc53e08c5006f4))
- **config:** Allow extra WebSocket origins via MANAVAULT_ALLOWED_ORIGINS (#156) ([`f0b687d2`](../../commit/f0b687d213d5794b9769c4c68da6137adc4d41b2))
- **settings:** Add toggle to disable home screen animation ([`e8e207c9`](../../commit/e8e207c9cffd3c3831f7c2cf128ad8ac65c88bfb))
- **collection:** Add bulk clean dialog to pull surplus cheap cards ([`f9d0643b`](../../commit/f9d0643b14fea6949668b684fb373747a8caff6d))
- **collection:** Add bulk clean checklist, removal, foil preference, and keep swaps ([`1e53e5b9`](../../commit/1e53e5b93341e0706fa5aefde3a0cb3c0b49fb2b))
- **collection:** Collapse bulk clean card rows and add pull all per card ([`8fac0617`](../../commit/8fac0617f85b0b5e1e1ac320dddd954fde2aaf29))
- **collection:** Label header actions and clarify import/export icons ([`701bd477`](../../commit/701bd4775fd61f8622b014cf375603303cbdd7a1))
- **collection:** Collapse header actions to icons with hover-expanding labels ([`db3266be`](../../commit/db3266be2854fda2c520da17cf92797af40db2be))
- **decks:** Link decks to Moxfield or Archidekt and keep them synced ([`49026024`](../../commit/490260243f8eff52fa005d5d513ee35d68ecf958))
- **ai:** Analyze Commander decks for multiplayer finishers and resources ([`0e53bdff`](../../commit/0e53bdffac8af611ea681c5914a200b62a487aad))
- **collection:** Group bulk clean pulls by color and type ([`447d0a7c`](../../commit/447d0a7cfc5ed88e20a15522806b138e410268ab))
- **tokens:** Track owned tokens across catalog, scanner, collection, and decks ([`56befabe`](../../commit/56befabe8409ec1e0af841716d760270c77936ec))
- **tokens:** Narrow back-face prompt with Wizards' published token pairings ([`1e58fc15`](../../commit/1e58fc15ac5b85998acb62c436ee080eb68cd1ed))
- **scryfall:** Re-run the full catalog sync after upgrades that change the importer ([`3e783db3`](../../commit/3e783db31ffca029d158ff2828f5d85034a7f215))
- **scanner:** Tokens mode, learned token backs, token selection and masked search ([`d8f63468`](../../commit/d8f63468370af14c94aa8c1260662c5f01977c24))
- **catalog:** Treat emblems as tokens so they can be a token's back ([`be7da783`](../../commit/be7da7834cea420e23f87ed9fbd1831a77ee06d2))
- **scanner:** Pace frames, pause idle camera and show camera diagnostics ([`6f35b1d8`](../../commit/6f35b1d88dcb13dc3024b9f1cf1d6994e281c670))
- **playtest:** Rework playtester UX after Moxfield's goldfish tool ([`7e7103f7`](../../commit/7e7103f7dc13439569162d1707430aa494a58214))
- **scan:** Edit purchase price of scanned cards, defaulting to market ([`b660a015`](../../commit/b660a0152e732ae5d11f68395aad0f6bfec2b1b0))
- **pricing:** Source TCGplayer prices from tcgcsv TCG Low ([`0cafdac2`](../../commit/0cafdac2ab7c32c24f9ea37d3171e2cae4369f9f))
- Replace the Elixir backend with a Rust server ([`e2ee6a79`](../../commit/e2ee6a791197b2acdfc82025b75ba29c7f40cb41))

### Performance

- **scanner:** Skip empty frames and track the card between detector passes ([`5572814d`](../../commit/5572814d476361c76c03dc0e98d0be981a78558e))

## [1.4.3] - 2026-09-29

### Bug Fixes

- **android:** Fall back to the status bar height for the top inset ([`03f28366`](../../commit/03f28366b1f0084b39c04484f9c3b5046061e3f3))
- **scanner:** Say why a corrections export token was refused ([`21bf51bd`](../../commit/21bf51bd758fce90c2dd32b881d566349896c9c1))
- **scanner:** Export skipped captures with a null label ([`cac2456c`](../../commit/cac2456c9b6511b3863fc2f00e11d926330bec91))
- **pricing:** Prefer TCGplayer market price over listing lows ([`1af517fd`](../../commit/1af517fd2787f364314b8375fcd312eecfded5fd))

### Chores

- **backlog:** Record phone detector profile progress ([`8a13820b`](../../commit/8a13820be0f70e154f7cf29b2bf8553760880225))

### Documentation

- **scanner:** Document Identify and per-app training sources ([`6b6b1276`](../../commit/6b6b127641ea5ca0f43ac7ea11af7a133a975edf))

### Features

- **scanner:** Identify cards the scanner misses ([`e0883500`](../../commit/e088350097fc333114bf318a2a1bf80393882323))
- **scanner:** Fill the screen with the camera and add preview zoom and pan ([`682ce6b0`](../../commit/682ce6b0cb8ee9bf0fad42ed0ad097a153b96459))

## [1.4.2] - 2026-09-28

### Bug Fixes

- **android:** Keep backgrounds behind the system bars ([`090acee7`](../../commit/090acee707af6f38f7f83934ed4f1cc0b71511ef))
- **scanner:** Clean up the camera view on Android ([`30fc02b5`](../../commit/30fc02b509c4bca5c00195dff38a86d4f6ee5b9c))

### Features

- **scanner:** Collect labelled scans for training recognition ([`788d11f7`](../../commit/788d11f7b9e323ecf93f56d6cf6a10bbeb01defb))
- **pricing:** Follow lowest near-mint TCGplayer listing ([`10a93f24`](../../commit/10a93f24f48591b8225be0f63c94871df5ef04f2))

## [1.4.1] - 2026-09-28

### Bug Fixes

- **android:** Pad the WebView by the system bar insets natively ([`7a9787d6`](../../commit/7a9787d67d2fb678b550b9dea6e9fae3dba234b0))
- **scanner:** Delay notices and show the card scan straight away ([`0a2c1aae`](../../commit/0a2c1aae747e9862f926402227567aa3af2f1a90))

## [1.4.0] - 2026-09-28

### Bug Fixes

- Provide authoritative deck counts to AI ([`283195e1`](../../commit/283195e178d558037aef442862f31892bc2e7bdc))
- Prevent truncated deck AI answers ([`54a48a9b`](../../commit/54a48a9b8eb65393eadb4778c5464d32d9eef39b))
- Increase deck AI completion budgets ([`48ba8b46`](../../commit/48ba8b46274cf4ca324eb4bf7140cb92c478f78b))
- Enforce deck AI response invariants ([`a42b7de7`](../../commit/a42b7de7df8242b7974961a4341539a1b08cbe66))
- Import Moxfield dual card names ([`8b7385e5`](../../commit/8b7385e51bb32b4bc483c8446abc49fe68539df1))
- Add mobile Safari bottom clearance ([`b25f6e72`](../../commit/b25f6e72fb4ab1bf65f74a8bfc89eba8cfbfe7d0))
- **decks:** Consolidate active deck count ([`6b857957`](../../commit/6b85795773d8a371c186445a5fd9c8619aed7961))
- **decks:** Respect finish when switching allocations ([`d79ac532`](../../commit/d79ac5324796a1f0e4430b8a1675456dd49c5e15))
- **ai:** Process deck questions asynchronously ([`395e45d7`](../../commit/395e45d7cd8228c253e3f2ffeea7820a03420fb7))
- **settings:** Reject sockets without sessions ([`57d6353c`](../../commit/57d6353c40207742eae9a6f03f5ebd3750d78334))
- **settings:** Authenticate log subscriptions ([`93db9fa0`](../../commit/93db9fa0dba9238c712cc9abc20f429ddf4da777))
- **ai:** Make bracket analysis holistic ([`d876a9ae`](../../commit/d876a9aec24c62f29f50ad01ae3e743ad1c48057))
- **security:** Remediate container vulnerabilities ([`34c9a22e`](../../commit/34c9a22e9ead617400b76adaa854811e9a9b8688))
- Sort permanent cards by their front-face type ([`4a13eb8f`](../../commit/4a13eb8ffb570610617442b410d8951175ee0a5f))
- **jobs:** Recover orphaned catalog sync executions ([`ab76c650`](../../commit/ab76c650ed6cf9668c287f3b8703a9d209f89629))
- **catalog:** Release write locks between metric refresh batches ([`f66e52ef`](../../commit/f66e52efe58786f2a36c8d5723234b096e674469))
- **catalog:** Parse EDHREC commander continuation pages ([`10da94f2`](../../commit/10da94f2cefc5e153693aa9757d09e073e198d91))
- **ui:** Keep dropdowns and card previews above dialogs ([`ecad2d2b`](../../commit/ecad2d2bf0c5192ad58683709d76b365c5c27bf6))
- **decks:** Pick only active decks and reset skips on play ([`a6d8aa14`](../../commit/a6d8aa145c338e1293e95a913f281a043dd32b1b))
- Deallocate cards moved to considering ([`880d906a`](../../commit/880d906a972ee9f5127e782f50c38ff8a821b94c))
- Exclude proxies from deck pricing ([`4c40a2ca`](../../commit/4c40a2ca13ab67039446420b48b20d684fd65f98))
- **security:** Enforce GraphQL CSRF in every auth mode and make owner sessions revocable ([`273c795d`](../../commit/273c795d7c857d8997ce1ba6146c0cbbcc334808))
- **security:** Harden auth lockout recovery and document proxy hardening flags ([`d105be16`](../../commit/d105be16caafd550acc230598c878a2284415385))
- **ai:** Limit consistency advice to card changes ([`40b3b696`](../../commit/40b3b696171bb433c3fec4d7b191f86db9b6dbf8))
- Remove unsupported directive from deck allocation requests ([`a36f9e36`](../../commit/a36f9e3685c545080a8a518ed101124464679ad4))
- Stop deck analysis from labeling suggestions with collection status ([`2cee4366`](../../commit/2cee4366604181b16a252905a3f420e4e37aa35a))
- **ios:** Load saved server URL inside the native shell ([`890a772a`](../../commit/890a772abbec78b45e595ac2c7b3b415ebcb843e))
- **native:** Respect Android system bar insets injected by Capacitor ([`6696a3a2`](../../commit/6696a3a244d278b6359eed3d9a964aca06fa6cc7))

### CI

- Keep container build layers cached across commits ([`db2ae210`](../../commit/db2ae21004fc95504b26b414ee6c67118ef75fac))

### Chores

- **deps:** Bump mise-action to 4.3.0 and repair quality CI ([`6a6c4ae8`](../../commit/6a6c4ae8824b18c1484060e234da42eaa74536ac))
- **deps:** Bump softprops/action-gh-release from 3.0.2 to 3.0.3 ([`e1e62ce1`](../../commit/e1e62ce1118ab4bd589bfcf6a175e50676c4a79b))
- **deps:** Bump docker/setup-buildx-action from 4.2.0 to 4.3.0 ([`a2815c9a`](../../commit/a2815c9ae2a6d9b5c8a7b61730e060bf9067fe61))
- **deps:** Bump docker/login-action from 4.4.0 to 4.6.0 ([`5da53e59`](../../commit/5da53e5998e16263d1ea182134b00025e5a77533))
- **deps:** Bump actions/checkout from 7.0.0 to 7.0.1 ([`acc98669`](../../commit/acc9866920bc3ef600cc4d9f261e488292c273db))
- **backlog:** Add security and code standard remediation tasks ([`bf662741`](../../commit/bf662741095fab6c5839cc4a28470956c9ed71af))
- **backlog:** Repair duplicate TASK-30 identifiers ([`220330ea`](../../commit/220330ea0e23249f94f4f3502b47f5207bc1c4d8))
- **deps:** Resolve JavaScript dependency advisories ([`57b9122d`](../../commit/57b9122d8d96f52e71ccabb19f54996d1e1c8e83))
- **orb:** Speed up setup ([`837b7aa8`](../../commit/837b7aa8073e2d87e0fd7adf0c0f6b85d49f1d5c))
- **backlog:** Record published scanner bundle release ([`a7101911`](../../commit/a710191186762559d3e145b309ff4652f88b4470))

### Documentation

- **dev:** Generate GraphQL types from an Absinthe SDL dump instead of live introspection ([`304df8d1`](../../commit/304df8d1aeb77dd114293c53aca36bd752fec5d9))

### Features

- Sort collection by value gain ([`219433f6`](../../commit/219433f6a59c2b200839ec2247972099ccbd4847))
- Add AI deck analysis and bracket ratings ([`524f27d3`](../../commit/524f27d38ce1a5f67498da173327744c7b8dbdb0))
- Add one-off deck questions ([`d4162e0e`](../../commit/d4162e0e5e89f82347400eaea2a9793f60538a89))
- Persist deck AI question history ([`7eaf968a`](../../commit/7eaf968ab4df7bcbcf08b9a2c355b4286c5d7193))
- **ai:** Improve deck Q&A accuracy and rendering ([`d43d3b75`](../../commit/d43d3b759fee073d5985c890ef80f22a527bfa8c))
- Add custom AI deck analysis instructions ([`9ee36d13`](../../commit/9ee36d13e4162c09fcd642dae186e2db5acdd5f3))
- Show AI deck analysis progress ([`cd148a52`](../../commit/cd148a52cc214fad7458525a13fdb702bc05a0b7))
- Apply deck Q&A recommendations ([`b5e3959e`](../../commit/b5e3959e163918dbd70dd0d3194f9d41b7b8b678))
- **decks:** Show Commander Spellbook combos ([`ecffe42d`](../../commit/ecffe42dd8a7cd1b6bc4e2e7e617db6b5703e3aa))
- **jobs:** Migrate background work to Oban ([`fcfdd32e`](../../commit/fcfdd32e54c694027a66b1ecf9d918a1c69d7780))
- **ai:** Show model metadata for deck insights ([`ed90615c`](../../commit/ed90615c398739a3f4dc01199b704d32b751621e))
- **ai:** Expand deck analysis guidance ([`9a07d21c`](../../commit/9a07d21c90e78afd2b4af5f2c38a4fe1cd83b3d6))
- **ai:** Refresh all deck analyses ([`29a41211`](../../commit/29a41211802bf515323d338689f4b02e2ef84959))
- **settings:** Add live server logs ([`99270b13`](../../commit/99270b1313041ede2967afa55f63ab8a1a2cbc79))
- **decks:** Add weighted random deck picker ([`6781fcab`](../../commit/6781fcabcb3212c900af686d86641b1524925af0))
- **decks:** Allow editing play history ([`6cd0895a`](../../commit/6cd0895a0258059285ee0896f36cccd1fedced00))
- **decks:** Add Recommander deck recommendations ([`fdffc7bf`](../../commit/fdffc7bfca0bc4447aa69cb48f1a7abcffbe9463))
- **decks:** Analyze external decklists ([`ae695a2c`](../../commit/ae695a2c2962c0b007eab9ab3b6e9724e1694cef))
- Toggle auto-sort summaries between source and destination ([`2025693d`](../../commit/2025693d5d0d073ea593dfe070bf8811f9060967))
- **decks:** Control random play inclusion and exclude archives from home count ([`556cb112`](../../commit/556cb112174eee7516334bc4988b49ebc7b3643f))
- **ai:** Frame deck analysis around deck structure, role balance, and synergy ([`2d85a681`](../../commit/2d85a681b1b79d38a235a167a5cf718f7beafbc5))
- **api:** Add personal deck access keys (#153) ([`02656c1c`](../../commit/02656c1c3be2eb3f69e2921eecedc6fd375ab3bc))
- **appearance:** Add color palettes saved on the owner account ([`8dcc75ec`](../../commit/8dcc75ec4ef3ce8e5e8c101b5481a3b88fc210bc))
- **ai:** Let the model look up catalog cards during analysis and questions ([`a154eaf9`](../../commit/a154eaf9b1879d0354eeeaffaef2be1c28efed2d))
- Filter collection by purchase price, added date, and multiple sets ([`b5e893c3`](../../commit/b5e893c35636a8e3e64326d87c51da99c9462b3e))
- Add Swap cards workbench for staged deck cuts and adds ([`0b122e39`](../../commit/0b122e391d6cc8c4a0aede30c87d6cbc56a956d0))
- Add AI chat for cuts and adds in Swap cards ([`7cbc7aa4`](../../commit/7cbc7aa411c7d989e40e0d21dcc33d395b489a14))
- Add AI collection status tool that favors free owned cards ([`0490f597`](../../commit/0490f5978b4b000758948fa1cf5faa2867ddd62c))
- **scanner:** Add in-browser card scanner with OTA model bundles ([`7114d779`](../../commit/7114d779d761c8bb1ce950ef3bdd1cebd91da144))
- **scanner:** Make locked sets restrict recognition ([`03c98870`](../../commit/03c9887001a166273fb4ad371251b3271284d80d))
- **scanner:** Scan and show the whole camera image ([`c3a8a2bd`](../../commit/c3a8a2bd4fa1c3971b9b8fce05e5933e64d6a3b8))

### Performance

- **catalog:** Cover search and price queries with indexes ([`5c0eb428`](../../commit/5c0eb42860c3a3cdce45c17037e8be2a1c58aa18))

### Refactoring

- **catalog:** Drop unused scryfall_printing_search FTS table ([`1cb79307`](../../commit/1cb793077ac28c92ed598d149c7dc0ba2d58b4c7))
- **catalog:** Move deck resolver workflows and Repo access into Catalog actions ([`640fc768`](../../commit/640fc7682d780f208875f2f9c1471715650519b3))
- **catalog:** Split collection and trade contexts into actions and bound auto-sort and export work ([`b71ab012`](../../commit/b71ab01205dac3e4d6764cfd3298709cb95c0ba8))
- **ai,backup,scryfall:** Split contexts into actions, bound deck analysis listing, batch printing reconciliation ([`d64298fb`](../../commit/d64298fba94ec7a5409ca781e36e7a0dbc6748cc))
- **web:** Render shell and login from templates, use configured host for absolute URLs, add CSP ([`c44a8f27`](../../commit/c44a8f274c44d004ada1767b92ec8c463076308a))
- **react:** Split cards page, validate remote link hrefs, type Prism, initialize AI settings form once ([`0e165a30`](../../commit/0e165a300f34e3926a71a05d07f1ceb551bdee1d))
- **decks:** Decompose deck detail page, deck stack card, and deck GraphQL documents ([`6d38012b`](../../commit/6d38012bf47a07c8942d23be84c3975474f88a43))
- **collection:** Decompose collection page, import/export dialogs, and collection GraphQL documents ([`dde1f175`](../../commit/dde1f17506663410ebf232acd9aaaa4181984902))
- **catalog:** Move location fetching from the decks context into collection locations ([`f9bed03e`](../../commit/f9bed03ed72dd35a8d4bacb901accd597385838d))
- **scanner:** Move model training to cfbender/oracle ([`4bb6789e`](../../commit/4bb6789ed48ab200eb2173d120eeaf630b57ef22))

### Style

- **react:** Format files added by the remediation refactors ([`f4140bb8`](../../commit/f4140bb8e234d1f74d4d0533623fa1c03f2b8524))

### Tests

- **web:** Read the frontend deck query from its new documents module ([`771014a6`](../../commit/771014a646300bc26868412c167768c220b8c987))

## [1.3.0] - 2026-08-17

### Bug Fixes

- Harden public share GraphQL ([`e0c16847`](../../commit/e0c168476acdd2b7669a97978c3ffe4c3f224a33))
- Harden remote sharing boundaries ([`9d6e7080`](../../commit/9d6e708043eedd869f24f0da2a6eed50c0380636))
- **home:** Keep search suggestions above action cards ([`3e63811e`](../../commit/3e63811e4c5a6a23f3a06420f6b6f607506721c5))
- Group collection cards by printing ([`56810137`](../../commit/568101370d51031d6e835ff5460aafbb378f3333))
- Improve liquid glass dropdown readability ([`c5ce00d0`](../../commit/c5ce00d09ba07f680118df70e09ac5b76a317898))
- **collection:** Prevent card interactions while scrolling ([`35c0349a`](../../commit/35c0349ace5c94d707fdf1e36fbba22571a6ef61))
- **ui:** Contain dialogs and preserve binder scroll ([`ce302faa`](../../commit/ce302faacfb835a64d4f15a3bc0dd99b7fb73f2e))
- **ui:** Keep sort menus within viewport ([`3f507b10`](../../commit/3f507b10b46bdd2f47d0084bf4d0e74653098d10))
- Normalize card names and scroll deck picker ([`42ff0e5a`](../../commit/42ff0e5aedce2c8208b93d202232a1401d11c29f))
- Resolve MDFCs by front-face name ([`3455b3c6`](../../commit/3455b3c65685746a4bc78ea05cafba6924f8bee3))
- Group Scryfall replacement clauses ([`7cd8160f`](../../commit/7cd8160f3f061ea800ca646fa8a8d69f022f638d))
- **cards:** Correct card actions and deck options ([`44bf6347`](../../commit/44bf6347331b14f7839b4191517695cd63a87d33))
- **catalog:** Exclude non-card Scryfall printings ([`490eddb3`](../../commit/490eddb398b7f5b4d589c688e6fec8595e3684d5))
- **decks:** Allow deleting archived decks ([`bdf5a108`](../../commit/bdf5a1085f9fc305692d82c8ca10c9c2549d5c89))
- **decks:** Use server commander color identity in deck header and stop clipping mana symbols ([`db76da78`](../../commit/db76da782b1158194d3b1d437d8253ee5f803ea6))
- **catalog:** Remove cards without printings ([`55750677`](../../commit/5575067757f1a4496b57f47bdfbc79e238bbb63d))
- **collection:** Repair auto-sort card previews ([`bb24f651`](../../commit/bb24f65170f548d8a4802205994cb6dc1399df2b))
- **collection:** Use market prices for filters and sorting ([`004fe4fd`](../../commit/004fe4fd67ae4856fb23c092185a8dfa2eae0a65))
- **pricing:** Prioritize ManaPool card conditions ([`bc0db0ad`](../../commit/bc0db0ad12a8d0fa1257a139c917086d411a3e02))
- **collection:** Prevent value rankings mobile overflow ([`5e647d23`](../../commit/5e647d23c0ba46913ba2f3abb3aeb7836841098a))
- **pricing:** Use vendor market prices ([`10e3df28`](../../commit/10e3df28c80d9f68e7025ea2b31bdb249cffc4c6))
- **web:** Repair shared decks and page titles ([`bf18d8c9`](../../commit/bf18d8c9d48196e54baf1f37b0bebbde34e938f9))
- **web:** Use available logo asset on login ([`8a8b1fb9`](../../commit/8a8b1fb91364c17cd5b1dc4c441616b8f6f114f0))
- **pricing:** Handle special treatment values ([`05eb973e`](../../commit/05eb973e8917eb1bc08095b5932e4f5a595ed42a))
- **ui:** Hide background scrollbar behind dialogs ([`e395cc29`](../../commit/e395cc2925bd8292992a3d80d45fb31e694ae46b))
- **ui:** Fix card menu layering and hover clarity ([`f5d7ebfb`](../../commit/f5d7ebfb958dbf843737ab5048d1fe142ac60e0f))
- **ui:** Reset scroll after navigation ([`58fbdab6`](../../commit/58fbdab64d6a25fec5674ed5ff8af0fbfc2597ab))
- **decks:** Align salt score badge content ([`89fa2df0`](../../commit/89fa2df0d3b63e423ed4a38da4893a5e43497314))
- **collection:** Delete cards with lists ([`a83e1386`](../../commit/a83e1386c4d0e51d027e36c881993bf1aa09d028))
- **catalog:** Resolve alternate card names ([`68f39707`](../../commit/68f39707724464cabf131d3f365e576a394c9696))
- Prevent sell list import stalls ([`f07d4a60`](../../commit/f07d4a60c84d01e337bcc780882ac87d8bc89e76))
- Prevent duplicate page scrollbar ([`45bf9a45`](../../commit/45bf9a458fd43150e1dc89329f2616a43a41bbcd))

### Chores

- Configure Amp orb lifecycle ([`e1869686`](../../commit/e186968637502d3ed5e99943689d19bfa36c5cad))
- **orb:** Harden first-time setup ([`b57f8c51`](../../commit/b57f8c51ceda731076076e7492d8e3812382b0a9))
- Persist workflow and portal configuration ([`789a6132`](../../commit/789a6132cec7f417ba323c1e9157ad016b756e17))
- Optimize orb setup and update dependencies ([`fb6fdb86`](../../commit/fb6fdb8608bed31a73b72747cb6f1eaf10e481af))
- Disable Amp commit thread trailers ([`37270cb6`](../../commit/37270cb6ac43e5585ee3371d20471b59d4bfcf45))

### Features

- Share trade lists ([`9c35a3d1`](../../commit/9c35a3d1dc911f31746cca1fcf138e4bcae5be71))
- Add Liquid Glass interface style with settings selector ([`a9b40c48`](../../commit/a9b40c48f1363b1ac28dd9f4f7bea175fa355574))
- Allow changing collection item printings ([`57ecadcc`](../../commit/57ecadcc653ac5f1e89e06bf2e6ff3699a68f49a))
- Track trade binder quantities ([`88f8b515`](../../commit/88f8b5159f449a1e1b4802f9b9b492dacc9f525d))
- **trade:** Add binder sorting and filters ([`c5377218`](../../commit/c5377218247e1955873e97a7b63b436c72b21646))
- Sync paper cards and EDHREC ranks ([`d5608953`](../../commit/d560895335fdbb65fe60f583f6feb48cfda35c1f))
- **decks:** Add EDHREC cut actions ([`e4e39e49`](../../commit/e4e39e494b690dde7c9ddf8afb4ea59ddf82d629))
- **decks:** Support commander pairings for partners, companions, and backgrounds ([`1ff207ea`](../../commit/1ff207ea3a9e034128639711a44074550cd9b7ef))
- **pricing:** Add multi-vendor pricing engine with selectable price source ([`763d8961`](../../commit/763d8961345209d07332ed9499a69cecacacf88e))
- Add selectable deck cover cards ([`88721e41`](../../commit/88721e41929d50b0ead3205d7806c389c7b34c24))
- **collection:** Add value dashboard ([`188a333c`](../../commit/188a333c28d0ca03c3a7b2fe8543c4e89b765e53))
- **collection:** Add deck availability checker ([`92fc7af8`](../../commit/92fc7af85a5cfa058d5a5017d3dc7e4a1e71d941))
- **collection:** Add value position actions ([`560987f8`](../../commit/560987f81675e1d4c2326eadef5b5612382e63ec))
- **ui:** Default to liquid glass theme ([`7a01fe94`](../../commit/7a01fe9497a88bdd0757f96f4a851c0b2da2d60a))
- Add deck primer ([`d808ea6a`](../../commit/d808ea6a0f1027018fff2a5b16f39899a1eed2f5))
- Add EDHREC salt scoring ([`2e68c580`](../../commit/2e68c580496460dc4e66e9cd4628dc7aa7f7178d))
- **decks:** Group cards by salt score ([`18876e97`](../../commit/18876e978a60717dc00abf1774dcc3492caaeda1))
- **collection:** Support total spend on import ([`5f7d6065`](../../commit/5f7d606563689ac32c4518ca9a5ea515f0c7ddef))
- **cards:** Add EDHREC synergy panel ([`a4d5b1cb`](../../commit/a4d5b1cb5269c65e8285d40e93649ceec632591c))
- Show deck allocations on card copies ([`40484f15`](../../commit/40484f15eefebe1859fbc9bd8508078c19105436))

### Miscellaneous

- Add share link revocation and rotation ([`6931509f`](../../commit/6931509f413ab6ecafc453ae4228120368a8c194))
- Bound remote ManaVault import resources ([`a4f6dd20`](../../commit/a4f6dd2085c4a3a0805b7dd065b85f05365a7913))

### Refactoring

- Consolidate duplicated backend behavior into single owners ([`f1ed500a`](../../commit/f1ed500a1f449e649357285fdf6b1bef207b5179))
- **frontend:** Standardize UI components on Radix primitives ([`4f71099c`](../../commit/4f71099c8ddf30813824fa74c77367eb2e9e95f9))

## [1.2.0] - 2026-08-03

### Bug Fixes

- Card search pagination ([`7bfe870b`](../../commit/7bfe870bc1eb1ae70f11845cb34cf132d3a9e557))
- Card name search ([`4e5c2e9b`](../../commit/4e5c2e9b6f8a59a6b383bd723401056d4a885138))
- Don't lock completely during catalog import ([`c48d7be9`](../../commit/c48d7be9c6a5e9d9707ef02b398b443ca7f401b0))

### Chores

- Swap card advantage and ramp priority ([`a5ff0638`](../../commit/a5ff063830650b25949504deed5af0dc03f56bfb))

### Features

- Recent searches ([`537e391a`](../../commit/537e391a17bcc2e35313dc3a5e6a571a1fe5cc18))
- Improve deck export ([`c7bab6f4`](../../commit/c7bab6f419e91fc5b1de81eb12ce0329eab891b1))
- Scg purchase ([`3a8a2e1a`](../../commit/3a8a2e1abcb59db0466a45e5309043f3ab41a7dd))
- Edhrec commander categories ([`70b3b237`](../../commit/70b3b237096cd55bf33e419ce9aa166576f77cee))
- Trade, wants, diffs ([`50f87049`](../../commit/50f8704997ba2548311181c339a5a8991665d558))
- Change maybe/sideboard to considering ([`37c7daf2`](../../commit/37c7daf2f37bb073c9fc6b8c92a784b8780314c2))
- Share trade list ([`d6e0e1a6`](../../commit/d6e0e1a63f86a7dd6db88bf4d97e65a25b38ec7e))

### Refactoring

- Use scryfall bulk data api for import ([`f077dcd9`](../../commit/f077dcd964c835dcc8de704b2a08c59dd005a333))

## [1.1.2] - 2026-07-19

### Bug Fixes

- Capacitor build ([`450b4fc4`](../../commit/450b4fc4f5d580b3591482a81481a2a2447188e6))

## [1.1.1] - 2026-07-19

### Bug Fixes

- Search applies to just printings ([`d9d5eac9`](../../commit/d9d5eac9220c1560b569fa41c9e51e4b7167aa92))
- Mobile tag section to the right place ([`0e7f4f35`](../../commit/0e7f4f3597af8b4f58a0f67e3403f6f91696d562))

### Chores

- **deps:** Update Elixir dependencies ([`7e43283a`](../../commit/7e43283a0b5a3af802b4029c48b77898f3d3f772))
- **deps:** Update React/JS dependencies ([`050dde93`](../../commit/050dde933ffe4d516aef02c02c596b196f6c316d))

### Features

- More links on card ([`a0b61d46`](../../commit/a0b61d4655dc3f56b3f9695efc734d5d08c81db7))
- Add sort to card search ([`d8dcfb5c`](../../commit/d8dcfb5ca53760ae16274e6c349b384914def3f6))
- Upgrade to TypeScript 7 native compiler (tsc) ([`96d76341`](../../commit/96d76341ef3299bd7390423206176be293ecefc1))

### Style

- Fix deck page centering ([`ca284c35`](../../commit/ca284c35bf486f6e431b344e70b229e405fc5d90))

## [1.1.0] - 2026-07-15

### Bug Fixes

- Stabilize quality gate ([`2a395021`](../../commit/2a395021aa9bf186f34b86f35ef9580769b7189b))
- Restore batched allocation candidates ([`29c5a06d`](../../commit/29c5a06d5d2fcf8bc277d1c3213d7d4c382415ec))
- Consolidate single allocation status counts ([`1cf98d17`](../../commit/1cf98d170f87efa52f5f7b5db463c3cf62d0cffb))
- **ui:** Adopt Radix dialog behavior ([`03d6a678`](../../commit/03d6a6785b814b44a77e44576ee470cf2682adc3))
- **dialog:** Restore external opener focus ([`a26d0e9f`](../../commit/a26d0e9f1e25df0045981aad72c4f7a676a97310))
- **settings:** Preserve auto-sort row mutability ([`042d496d`](../../commit/042d496dfaa62463fabb322557d699f2cf6a9574))
- Isolate auto-sort tests ([`2a8934be`](../../commit/2a8934be89ce5c26714a032d52eb3dcb006dffe7))
- **catalog:** Isolate cache producer failures ([`6ddd7862`](../../commit/6ddd786262f1cdea7a28a33482cf8282d019b6da))
- **auth:** Constrain login return paths ([`f9e081f6`](../../commit/f9e081f6b573239b2fb25b6d6805eaf71ed9a6c9))
- **dialog:** Satisfy focus restore checks ([`a59679ed`](../../commit/a59679ed4ab9e3914fb2e18c605d991f8729a563))
- **security:** Protect authenticated GraphQL mutations with CSRF ([`0196bd98`](../../commit/0196bd98c61631c8b104470d09f4db993b22dbaf))
- Fix schema domain contract match ([`536ff5d3`](../../commit/536ff5d372029f8a701e71153cb3abd277a63588))
- **deck:** Adapt commander callback input ([`ad83a769`](../../commit/ad83a76925801172fc713a2f692bf9428b6f73a2))
- Harden public share cache lookups ([`d27e9d07`](../../commit/d27e9d0792f34c2a5d3da86b74a6908ef3e52048))
- Bound preview artifact retention ([`187d1528`](../../commit/187d15282453a448cd690dfd4817fd0fb8b29feb))
- Restore preview render queue ([`1499bb58`](../../commit/1499bb58f2a6fc79bbec2bac823bbee3bc49e1e5))

### Chores

- **deps:** Bump softprops/action-gh-release from 3.0.1 to 3.0.2 (#142) ([`a28c190d`](../../commit/a28c190ddebbf16d30a31fc95b478f4aa4d6e3e2))
- **backlog:** Start independent task wave ([`0abad7d5`](../../commit/0abad7d51474a8475b9b3f223b58f8c38d8a5dc7))
- **backlog:** Finalize foundation wave ([`99de7815`](../../commit/99de78151b52f6d63ef8188e46e02100108f5c14))
- **deps:** Normalize aube lockfile ([`4a56306a`](../../commit/4a56306a7b4ced8d1dcc382acfa7fa7228f1a19a))
- **ui:** Format dialog changes ([`7f7f9553`](../../commit/7f7f9553bc0d32b642ef95e6f2991b0d652bffaa))
- **settings:** Format auto-sort changes ([`bda46a4f`](../../commit/bda46a4f9fbf078a033f44129585c4082f6ad538))
- **backlog:** Start architecture wave ([`5fdd948c`](../../commit/5fdd948c08a426f47d13733cad3ce919f0d9e84f))
- **backlog:** Complete architecture wave ([`d54104b5`](../../commit/d54104b52474fc90496e2f182c8aa9cc58703222))
- **backlog:** Start public share hardening ([`104b5c20`](../../commit/104b5c20cf1c1078e4f24f07eb3e222dbd16b37e))
- **backlog:** Complete public share hardening ([`ccaa8443`](../../commit/ccaa844326a3ab9ffa66440f8dc8a744fe54e092))
- **backlog:** Start preview artifact caching ([`6c85eaca`](../../commit/6c85eacaabb62a5b2d4a85f04d06f13b75b25133))
- **backlog:** Complete preview artifact caching ([`3cad8a9e`](../../commit/3cad8a9e0ac69d218caed83e011de286c0d06ab0))
- Simplify preview retention flow ([`ced3c285`](../../commit/ced3c285b7fd2395761ebe53968a8d658fee26cf))
- **backlog:** Start deck boundary cutover ([`5a90f608`](../../commit/5a90f608babd0515f4117a684a1a3ec56810b35d))
- **backlog:** Complete deck boundary cutover ([`874d0528`](../../commit/874d052806438a43504b3ae1c29d6862537c67bc))
- Add backlog.md ([`b6fef864`](../../commit/b6fef864bfba4c98d49cc065a335f256875adc60))

### Features

- Cache public preview PNG artifacts ([`539fae96`](../../commit/539fae960ee365d656b70fc8a1355feb615f4971))

### Refactoring

- **settings:** Split collection auto-sort rules ([`e065db60`](../../commit/e065db60c362481cfca7fffb44cc4388c19b4014))
- **schema:** Compose catalog domains ([`602a2705`](../../commit/602a27054ed58111d8b9d4b72170c395e7d97662))
- **catalog:** Split deck allocation actions ([`57e0240c`](../../commit/57e0240cf21dcd8fd1f5813d29487967b7353604))
- **deck:** Decompose deck detail features ([`81871ead`](../../commit/81871ead93d07dfb8e64afdb98745814fff5bdd8))
- **catalog:** Move deck cache boundary ([`dde38737`](../../commit/dde38737fbcef9658120e04fb75c203083f7577c))
- **catalog:** Remove deck workflows facade ([`22fc1973`](../../commit/22fc1973bf3f4120d02f3958c47849265eaf8d45))

### Style

- **cache:** Satisfy strict credo ([`551a1616`](../../commit/551a1616975f040823bfa8d25e905c99f7d21bf3))
- **auth:** Satisfy strict credo ([`aace6712`](../../commit/aace6712f9f54d887d6fe14b81b9a61a09c91b4e))
- **catalog:** Satisfy strict credo ([`a7c3850e`](../../commit/a7c3850e03d4955c4a9083f8b04c6670f7347b49))
- Format architecture wave ([`739a2957`](../../commit/739a29577f6ec028f742cf69d4c09333e7dd6c78))
- Format public share hardening ([`98efdd2d`](../../commit/98efdd2dbb575dfa37ed7309140a9d46f5986faa))
- Format preview artifact cache ([`1255e609`](../../commit/1255e6090a5e4ab815fcb31c6bc12cc885de14e4))
- **catalog:** Order deck aliases ([`d7b8cb20`](../../commit/d7b8cb20958e1847fc429b002bf8723411c403d5))

### Tests

- Harden quality gate ([`997bef52`](../../commit/997bef52373418f42821e7b29a095438c3e0c3ba))
- Restore batching query count contract ([`d69e8c6d`](../../commit/d69e8c6dd28f1b54de2f2d5ae01a936de3169071))
- Match auto-sort minimum price label ([`01128240`](../../commit/01128240a895a7f9b7e4b82ebd4658fb563ab65f))
- Query auto-sort price by role ([`a27dbb37`](../../commit/a27dbb37dfc1bd69718df6ae16e2f0f0e9d13acb))
- Classify source-less fallback queries ([`242479a4`](../../commit/242479a4dc9a144305758c55636cdaaad3bdcf9b))
- Assert archived deck after disassembly ([`813d6b0e`](../../commit/813d6b0e6a456916cd2981456820acab907fc295))
- Bind share cache deck id ([`5889382c`](../../commit/5889382c898bc5b2eac9d078c00407a482bec635))

## [1.0.0] - 2026-07-09

### Bug Fixes

- Don't count allocated cards in estimated buylist ([`32b9f75d`](../../commit/32b9f75d138de1fce642ad8158d6354151761d4b))
- Header chip on deck shows all cards cost ([`7c5c4186`](../../commit/7c5c4186d3feec59f9388ac08a339654312f15b3))
- Count tags for deciding category and theme ([`080bc978`](../../commit/080bc97815cce9cdff9b01fed1510617109ae4fa))
- Prevent zip-slip path traversal in backup restore ([`d9f9e71a`](../../commit/d9f9e71ae1a8f8813e2f84242fdcd46ce13bc731))
- Derive auth rate-limit client id from trusted proxy header ([`ec1a3fd1`](../../commit/ec1a3fd14b826e8adae23938f801522487aee10e))
- Allow marking the session cookie Secure and configuring its lifetime ([`cd799f4a`](../../commit/cd799f4aca925813e4a8d9660721b33c9b1da156))
- Encrypt cloud backup credentials at rest ([`2416686b`](../../commit/2416686b24e09fb7335ff39ec6b081cd53e1a2f6))
- Stop minting atoms from external input in query and EDHRec parsers ([`9291bb37`](../../commit/9291bb37d8924680cca85151f4d3e9314aa7e44a))
- Avoid recursive chown of the data dir on every boot ([`060a187c`](../../commit/060a187cefbda13eaf9a247c34d866ae565ae06e))
- Disable Android auto-backup to keep the session out of backups ([`65b8a936`](../../commit/65b8a936de7bbd04d08a5a69526b6c0c530f4abe))
- Keep Android signing secrets off stdout and the process table ([`4f722044`](../../commit/4f7220445a3114be2b62edd0c514ea1ecde9723b))
- Load all deck cards instead of silently truncating at 500 ([`6d5521d5`](../../commit/6d5521d5ce9fedfb67b86ddc7305ddedce8b8aed))
- Don't render the previous deck under a new deck's URL ([`e09e255b`](../../commit/e09e255b07b6d89a8f991ca3419dcf0dc428bb9b))
- Reconcile deck cache after partial bulk-mutation failures ([`19b2e7bd`](../../commit/19b2e7bd25c730b8c2d88037ab975a0eaf3ffa7b))
- Surface deck-delete failures instead of failing silently ([`eb64b763`](../../commit/eb64b763b9362c792566efa8872087b1e2a7d727))
- Shift-range anchor, share status reset, and pwa title dump ([`37ed1e07`](../../commit/37ed1e074b91fe3860738d39d7ca6157d982fe53))
- Load all decks instead of silently truncating the list at 100 ([`55add072`](../../commit/55add072c19df0e375bb7ad732c1439b884ab655))
- Bulk deck allocation ([`63940bcc`](../../commit/63940bcc4bab1b8898a95f8e8d35de21657e4bf9))
- Recently added cap to 500 ([`707ac2c9`](../../commit/707ac2c9fe3b1c5501a48b585bde12e50251c188))
- Deck share view ([`b3bb4bd2`](../../commit/b3bb4bd202239f321d69ad7d557ebf8e62fa9d83))
- Precommit ([`e7553489`](../../commit/e75534895a1f3e0233f383009b0fb0d17c639879))
- Printing uses default if only one available ([`a2e0d93b`](../../commit/a2e0d93b16b81b46a5a2db5bcff55679c5221491))
- Precommit warnings ([`d195132d`](../../commit/d195132dda48467a969ae3ea3449d8bf54c76954))
- Decklist import ([`920a337d`](../../commit/920a337d3886db0d40acfdb92dac41913866f56b))
- Add card modal uses partial from search ([`367d1460`](../../commit/367d1460b16ebc893ed84da93198259c8ff9f5bb))
- Let taps fall through to covered cards in deck stack ([`f3aa6916`](../../commit/f3aa6916b54a668739baf7b80bec4a26f71f4869))
- Covered-card tap in deck stack only raises, no button fires ([`45f39aae`](../../commit/45f39aae0b91a4140fc25eaa290ee7e846a22ae1))
- Stop mobile sticky-hover from arming deck card overlays ([`35d8bc3e`](../../commit/35d8bc3e4ae6acff3c7bd427090245786cb07a05))
- Intercept covered-card touch reveal at the stack level ([`c8242e74`](../../commit/c8242e74cf5ba897f408c47820f422e1e8db8d6d))
- Stop card title overlapping mana cost on mobile ([`a98bf711`](../../commit/a98bf71136eecbf8fe4dc30cba1d8d9fb4dd7e51))
- Restore deck group masonry columns ([`c0a40592`](../../commit/c0a4059264dfa9277d01cfdf2fe7fe10360bbb93))
- Show per-card estimate in missing cards buy list ([`9776b004`](../../commit/9776b004223a7e12fd00f344e5efa4ab4ffc778d))
- Keep selecting deck tag when dragging off the dial ([`81ec5ad1`](../../commit/81ec5ad104390c791aa0c2792e97141e2cab3a14))
- Match card name suggestions with apostrophes ([`d8e46be6`](../../commit/d8e46be6fa38645c654688fde133146420c990db))
- Restore Set as a deck grouping option ([`47ca323b`](../../commit/47ca323bfe1032f1984da25682015032b28607f7))
- Deck share page ([`47cc3361`](../../commit/47cc3361dae79c1baa6850b70c2733411f620f89))

### Build

- Pin and checksum-verify mise instead of curl | sh ([`d33db1f6`](../../commit/d33db1f6bb37c08e54911867c53535fb08e9d784))

### CI

- Pin GitHub Actions to commit SHAs and add Dependabot ([`b4a04c05`](../../commit/b4a04c05bb75e8ab3b900d6f9b3214f50d6447c9))
- Scope contents:write to a tag-only release job ([`28e2c6e1`](../../commit/28e2c6e17af1adc7e7964c78c1e67b3061d663a4))
- Read keytool store password from env, not argv ([`a253b318`](../../commit/a253b318fe193ea3071be4ba5cf3aaa82bea603c))

### Chores

- Bump plug ([`dc88133a`](../../commit/dc88133a6e0f68d35c9a04e4f5970a21c8bb3a5b))
- **deps:** Bump actions/checkout from 4.3.1 to 7.0.0 (#121) ([`33006448`](../../commit/3300644815ec09249b297d48448d49a69f366e71))
- **deps:** Bump docker/build-push-action from 6.19.2 to 7.3.0 (#122) ([`aa35fbe0`](../../commit/aa35fbe0de68e84d200d32f5b462a0f86aee8b25))
- **deps:** Bump docker/setup-buildx-action from 3.12.0 to 4.1.0 (#123) ([`76127d3d`](../../commit/76127d3dd7b58e52cee31a66096a8f10735c483f))
- **deps:** Bump docker/login-action from 3.7.0 to 4.2.0 (#124) ([`8bdbc85d`](../../commit/8bdbc85d1ab0fd777a30eb5fda7b0dd635563f95))
- **deps:** Bump docker/metadata-action from 5.10.0 to 6.1.0 (#125) ([`7f95665c`](../../commit/7f95665c20d51bb38f433150a589ffc949f9990d))
- Add to design notes ([`6c3502ff`](../../commit/6c3502ffe5c678c412c87e165285ca94de710d5f))
- Remove buttons from deck card ([`a0afd970`](../../commit/a0afd970663b8d9b85b0ff56756d6416c58e30e7))
- Bump node to 26 and fix mise precommit issues ([`ed6881fb`](../../commit/ed6881fb19aff3ac8e46ccc10bbd8e496ed66027))
- Up auto sort debounce to 30 days ([`b20eca28`](../../commit/b20eca288ab8bf21b63a92f121a92aefc5e88873))
- **deps:** Bump docker/login-action from 4.3.0 to 4.4.0 (#137) ([`fd8cadec`](../../commit/fd8cadece42452174d866dc184fe4e6f5ad6dfec))
- **deps:** Bump docker/setup-buildx-action from 4.1.0 to 4.2.0 (#138) ([`dd8b9830`](../../commit/dd8b98302d7c0650336dc89c7c0a9440c4b8dfda))
- **deps:** Bump actions/upload-artifact from 6.0.0 to 7.0.1 (#139) ([`2dc14ad7`](../../commit/2dc14ad79dd0a43df9f879f186a8bfae637f2ecd))
- **deps:** Bump docker/metadata-action from 6.1.0 to 6.2.0 (#140) ([`05c38ede`](../../commit/05c38ede4c4f1da962404ad3d1d8941c4a7b1295))
- **deps:** Bump actions/download-artifact from 6.0.0 to 8.0.1 (#141) ([`22f5b41c`](../../commit/22f5b41c44148bfa2442694f18a1c4964e6aa94b))

### Features

- Page titles and further tag improvements ([`026038aa`](../../commit/026038aa5be2b05043db621f03fe1785842aa5c4))
- Better categorizing and import logs ([`f618f9eb`](../../commit/f618f9eb3fca8f842e6bdc54554bb2f601cfe97f))
- Warn when the native server URL uses cleartext http ([`8b5b0bd4`](../../commit/8b5b0bd4972c78c7ab81bdcdd1b00a2aba78c667))
- Group by tag ([`15209f18`](../../commit/15209f1837ecfd7dbccbfe2aaa68b0b44889786a))
- Filter by allocation status ([`1d8b9ec6`](../../commit/1d8b9ec679f3a694bb62e26e0237093c474f010e))
- Show cost per filter ([`9ab4d636`](../../commit/9ab4d636a5e2c26c94db085ccf27cb3e6428d4c1))
- Top commanders dome gallery ([`f5d1ac21`](../../commit/f5d1ac2125899c31eb96548b251de1fdcfc8aee4))
- Multi-select flat on mobile ([`2270e1a0`](../../commit/2270e1a0cc558cc3012e125f03640ec8c8d27a7c))
- Remove mana cost vs production section ([`037bb401`](../../commit/037bb4013cb05f72b954218e0c3c25d18c7d3867))
- Remove dnd from autosort rules ([`22e5338d`](../../commit/22e5338dee71ec8c81e1f99324d3df376ca80397))
- Move quantity tag to top ([`76a7c3ab`](../../commit/76a7c3ab056ee6682aea1c41963d72b3e86f3ba4))
- Tabs to dropdown on mobile ([`d6ac63c5`](../../commit/d6ac63c5ca0c7c6c9b163234a0fa94cc34bc6e35))
- Import decklist to board and import list to select mode ([`e7a760f5`](../../commit/e7a760f5ac7aad0909ed79b74d80436962da0236))
- Debounce auto sort by a week ([`d4103442`](../../commit/d4103442025d93da36f2416b62851fa537733bf6))
- Group deck by price ([`418afe3a`](../../commit/418afe3abf23087e83163d00fae41602a3e5b621))
- Improve search ([`793231b3`](../../commit/793231b30d248cc94752ae27f520dfee6a21901a))
- Auto sort by set and release date ([`4a9f0d2a`](../../commit/4a9f0d2aaa40f6c144a600f35a9e7f1c4f87076a))
- Archive deck on disassemble ([`ae80981d`](../../commit/ae80981d8cfea362ccb32ec03eb188e569b33bf4))
- Deallocate on select ([`7c892b9f`](../../commit/7c892b9f058d35db81fb17776a3f9f6c669ed110))
- Group by allocation ([`9b841161`](../../commit/9b8411617fa31dbc6fc72b543b0c338a8f78c857))
- Buylist when allocated ([`2d9dbf28`](../../commit/2d9dbf28eb658dceb4a5df18439551c8405bd73d))
- Delete from card edit ([`49c04588`](../../commit/49c045886258702b6a9911c7f58fe83a6de6c6cb))
- Remove getting tag on allocation ([`b9b1dae3`](../../commit/b9b1dae37d859482050ac9a753ef524869488b8e))
- Custom deck tags data model and API ([`928528dd`](../../commit/928528dd7531b34beea7cb3b94855fae94d90de6))
- Radial custom-tag button on deck cards ([`4f21dad0`](../../commit/4f21dad0dfd59a2f8000dd3b171a97a0640578ff))
- Deck tags sidebar with counts and jump-to-group ([`7fdd1110`](../../commit/7fdd111027478eae3e2e305096f0522d20531f2d))
- Deck detail keyboard shortcuts ([`2c7677b7`](../../commit/2c7677b761ce2fe35dd93acdcb94901915fcfa50))
- Customizable default deck tags ([`9c980199`](../../commit/9c9801998a480d4fa48caa6237222607304e90e7))
- Faster tag radial and collapsible tags sidebar ([`c6167a20`](../../commit/c6167a204a18a3a8875ca36c39a776bd852735ee))
- Group deck by custom tags ([`3b104d38`](../../commit/3b104d38ff25cb40fd8db7c256566826ff15bc2c))
- Smoother collapsible tags sidebar ([`f87f96d6`](../../commit/f87f96d65894d40347747f22ab69dc50e152f7a4))
- Adjustable card size across the app ([`0029d3ae`](../../commit/0029d3ae85db343c231f872874332ab0c312357d))
- Backfill existing decks with default tags ([`14d21d1e`](../../commit/14d21d1e614f73608b519fdd30b47cb80d1b023d))
- Refine deck card tagger interaction ([`aa2505af`](../../commit/aa2505aff2346b1171e543d2feb63b0ad225e4ee))

### Miscellaneous

- **android:** Stop reading files from shared/intent text ([`5733d27c`](../../commit/5733d27c507d8a4845fced26121b1ff3197bf257))
- Flag externally-shared imports and require review ([`ff49c51d`](../../commit/ff49c51de9476af308e32b8e50ba74b8c4d1acef))
- Require PHX_HOST in prod instead of defaulting to example.com ([`8859854d`](../../commit/8859854d2699a49561f02c3e94810b0b248d4bd7))
- Warn at boot when auth is disabled in prod ([`d61ab629`](../../commit/d61ab629f9ab2884c4983971cb108d0ba9a836ed))
- Read the CSRF token per request instead of once at module load ([`ea198c30`](../../commit/ea198c30a9faf5e5972a73b6a2e97c5ecac49be2))
- Only render http(s) external URLs from third-party data ([`c23a8ad3`](../../commit/c23a8ad3a2b881b7fb7429713a14663d83f1ed18))
- Hold deck tag feedback text visible longer ([`2b3c868d`](../../commit/2b3c868d679d62b0ef4871371b0c3479bf151553))
- Make deck tag feedback snappier ([`1a0504d7`](../../commit/1a0504d74aae03c55e95b871db695c1771afb2f3))

### Performance

- Stop double-decoding the Scryfall bulk payload ([`347233a8`](../../commit/347233a839238f92bc10eed6e38362295537a354))
- Defer EDHRec printing loads to the batched dataloader ([`a4dd7f47`](../../commit/a4dd7f47d0c45df4378d3e884306cb88a3bef257))
- Use the NOCASE index for case-insensitive card-name lookups ([`681b8e08`](../../commit/681b8e087a4fb9213cdf4f64a73163728dff9242))
- Batch allocation-status computation in bulk-allocate preview ([`65fbbdca`](../../commit/65fbbdca7e8191a1fbc5a6f7e12ff217bc5420e9))
- Preload deck_card->deck in the deck_allocations dataloader batch ([`d62489cd`](../../commit/d62489cd5f44db2eee49c8c2cd7ebd20770dae0d))
- Run Scryfall syncs off-process with in-flight dedup ([`f1f3b4d8`](../../commit/f1f3b4d81b8f2062b7737e762b2bc7fe7199107f))
- Bulk-resolve scryfall_id rows in collection import preview ([`2a4a2e21`](../../commit/2a4a2e21b98efdbf58e330e584858771d5d9c039))
- Batch fetches in bulk collection/deck-card mutations ([`ff8b5328`](../../commit/ff8b5328cff00b97c4fa6621583d271658f839e2))
- Stop caching by whole summaries map; surface cache failures ([`811fd349`](../../commit/811fd3493429d3c1b4edad3f0b657b4572511400))
- Paginate the decks connection at the database level ([`ff81e10f`](../../commit/ff81e10f36794a2ae6a7d19f380e00d2fdf28e31))
- Short-circuit and linearize card-name suggestion matching ([`bf8afe9e`](../../commit/bf8afe9ea8c1d25b872bda50bd347f20dacca3a9))
- Update deck-card allocation in cache instead of refetching everything ([`92eb56b7`](../../commit/92eb56b75967be1e9c173cf23cde02d00e5c6906))
- Memoize collection grid tiles to skip re-renders on selection toggle ([`778fecc7`](../../commit/778fecc76ed0a47ee5508512f797dc509fefc93a))
- Fetch only a primary printing for EDHREC cards ([`812844f2`](../../commit/812844f25c780aca6e546e541dc49cf03d96be0c))
- Merge collection pagination in the Apollo cache via a field policy ([`eb5161cd`](../../commit/eb5161cdf17ffa6613db0a11c262349483488ffa))
- Keep prior deck analysis visible while recomputing ([`92317818`](../../commit/92317818e867e73ce0ffd21882c80eb812349bde))
- Memoize deck-pull readiness scans instead of running them every render ([`4e7ffb9c`](../../commit/4e7ffb9cdc85de1fb8662a0949843d233a7257f4))
- Allocate deck pull list in parallel instead of serially ([`f17d9c2c`](../../commit/f17d9c2cf14e948897b804ec3a6f711934b76637))
- Lazy-load the Prism/ogl WebGL background on the home route ([`0c7d790c`](../../commit/0c7d790ca3eb02a8661ab61625ef83a12166c5ce))
- Throttle EDHREC scroll persistence and stop mirroring to localStorage ([`ded443c2`](../../commit/ded443c28ecef42c5cb966d34a7fd36febc7998b))
- Lazy-load card-image and image-summary-card images ([`65eb919f`](../../commit/65eb919f2d900a432e076aae553e1bf17e7cab49))
- Batch EDHRec collection-status queries across recs/cuts ([`605b4a4d`](../../commit/605b4a4dda0906e8d70b96e1a4394cc2cfab0bb8))
- Apply bulk deck allocation in a single transaction ([`94bafd40`](../../commit/94bafd404146944d377471db2830b29f49b76da9))
- Select all collection items by fetching ids only ([`1adb0913`](../../commit/1adb09132c2b1b8084888131b24ab91c390906e8))
- Add server-side bulk update/delete deck-card mutations ([`7c943a09`](../../commit/7c943a0917177b9c588d33f406668f7f1e083818))
- Batch collection status for EDHRec commander-page sections ([`ab89d55a`](../../commit/ab89d55a8bc351d39ecf6a5a07877c9cdae3c1f4))
- Batch EDHRec card resolution across a response ([`a6c6c1b6`](../../commit/a6c6c1b60a6f4156593496a968a26ecb22c3215f))

### Refactoring

- Parse collection-import CSV with NimbleCSV ([`f5888cf6`](../../commit/f5888cf6333cd6757edef1a391ee50d3130a1ebb))
- Extract shared price SQL fragments into PriceFragments ([`c1054c9e`](../../commit/c1054c9e6ff3073a398ad54803993d3d71c8ccc5))
- Share card/printing scalar search predicates via named bindings ([`5358c677`](../../commit/5358c677f0921f239951acf01e55d0578c6512b2))
- Reuse AllocationStatus in EDHRec CollectionStatus ([`e605e4c0`](../../commit/e605e4c0a697a811ff5bdafba0ee7cca19fca6f1))
- Remove the unused duplicate node resolver ([`7bac5c80`](../../commit/7bac5c80cbfeb24d16927e1fa4d5db4cd3bef2a4))
- Collapse the allocationError nested ternary into find() ([`7d1404d9`](../../commit/7d1404d934a5be4fa5fc1d41ce7cde52e461ef81))
- Group DeckDetailContent props into cohesive objects ([`bfedb1a1`](../../commit/bfedb1a1f536ce5f4b3fd43a8dcd83d2bd48e182))
- Remove dead deck code, share compareDeckCards, drop stale cast ([`0a37b70c`](../../commit/0a37b70c5a8c9e70cdec3a9971f9fba9249444d6))
- Extract useDeckMutation for the deck-card allocation wrappers ([`475c9cba`](../../commit/475c9cba0b284c3528180e32132a43488a6a0886))
- Use selection set for cards selection ([`6a6a849e`](../../commit/6a6a849eca445d6d065f8c1a9e051aca5f91c1df))
- Switch collection buttons to icon buttons ([`0ed6e994`](../../commit/0ed6e994ab2dd58bde84fdabd4fc53d276d5d111))
- Unify deck and collection add-card dialogs ([`691e8882`](../../commit/691e88829549aca26ea2be53ca3f3b58a4879bc4))

### Style

- Header opacity ([`66e98eec`](../../commit/66e98eec6433bdf1f685b4a8f3ef706820a1f025))
- Card tile buttons ([`f049442e`](../../commit/f049442ee4cd196f221fd4c6579db55a2c6d69e4))
- Card detail oracle text ([`14ca21fe`](../../commit/14ca21fef166c671d3094104d3c90b6763bedc87))

### Tests

- Cover custom deck tag cache helper and formatting ([`bfc5c493`](../../commit/bfc5c4937e7d80ecc59b973dd0f327dee234f3ed))

## [0.13.0] - 2026-07-01

### Bug Fixes

- Mobile tap ([`55ad3045`](../../commit/55ad304560774bd9fe58e27cf723a1ef5c7cc645))
- **collection:** Harden action menus ([`003bee19`](../../commit/003bee1915a06ecb8b4b620f2ad0819d01e1816f))
- **decks:** Tighten gallery header hierarchy ([`356985e4`](../../commit/356985e4e83c2e33c70d39e8a6297d05324cd5d0))
- **decks:** Teach gallery loading states ([`aba82bcc`](../../commit/aba82bcc92a2cb543463310849a0a8e6dbdd7898))
- **decks:** Expose gallery actions and readiness ([`c8bc8334`](../../commit/c8bc8334a42997e554b9c2c9d3af37640e6e006e))
- **decks:** Place quick actions on cards ([`6cc91c65`](../../commit/6cc91c65386604ec956ae6f7073aa7aa3dbaf16a))
- **ui:** Improve mobile touch targets ([`80f4fd37`](../../commit/80f4fd375c75a6e88f9e0659a618629b45060e8b))
- **decks:** Expose accessible card controls ([`d49936f1`](../../commit/d49936f1098f8fa1e9bda08b89dce3e18138d573))
- **decks:** Harden deck states and diagnostics ([`c61c5312`](../../commit/c61c5312afce34e8e9ba60f136ceb968b34d939c))
- **decks:** Reduce desktop card controls ([`845de6bc`](../../commit/845de6bcd98cf0ffa65609a39dc5056cd3f4cee7))
- **decks:** Tuck readiness behind modal ([`8f1a432b`](../../commit/8f1a432b16741d99ce190af3c0f8ec5f3c13a32b))
- **decks:** Separate readiness modal actions ([`dde91db4`](../../commit/dde91db49f6d6b3a540a016a382c9f8b205d13a5))
- **decks:** Keep mobile card controls compact ([`0cc39c32`](../../commit/0cc39c320c5a77687fdb8d19649b77d964704daa))
- **decks:** Move card readiness work into modal ([`2e19ecb8`](../../commit/2e19ecb8c1318b111739410cd3cdadacec752628))
- **decks:** Restore selection affordance flow ([`37877f1b`](../../commit/37877f1bbf220dd7d3fb3ce254383552c0bface8))
- Edhrec card name overflow ([`b94360a0`](../../commit/b94360a0d62ba9644bfb274fd4f01a2019ccae97))
- Collection views ([`a8c9738a`](../../commit/a8c9738a1d55a43483a53b195932f36a0a75589d))
- Click through on menu ([`f81b3367`](../../commit/f81b3367754d4b5dddca74b8e0dbdb4674c35bfb))
- Card component click through and style ([`d7170ad6`](../../commit/d7170ad6f38ba6060541d2252d6e3bf5f189646c))

### Chores

- Impeccable ([`dcc1f7f4`](../../commit/dcc1f7f47e5e38dfb8ddb03e460e26fe7aafecfe))
- **collection:** Polish vault UI details ([`72ed927c`](../../commit/72ed927c61e98a84f02cd606ad37036342f141ac))
- **decks:** Remove unused deck type ([`58bfb9cd`](../../commit/58bfb9cdab3dc18c17a566759e6d7e557f9b6719))
- New logo ([`a9b44da9`](../../commit/a9b44da9657ce991ff1099301bda2fca0dfc2cf7))

### Features

- Edhrec card pops up modal instead ([`b0e6f545`](../../commit/b0e6f545d32c5380363cbe08681cd971122e53c6))
- **collection:** Expose core collection actions ([`3f73182d`](../../commit/3f73182df466571f9bf2babd7dd3faf80fda4ce3))
- **collection:** Distill card filters ([`6be9bd72`](../../commit/6be9bd72958b69d8c9689c76759919dae39a7f76))
- **collection:** Add pull workflow shortcuts ([`35159073`](../../commit/351590730b0e044e2a90a7c05fde82e0b5f7376e))
- **cards:** Improve search result confidence ([`77fddd16`](../../commit/77fddd167e1a5dcb3cb7f21d51764fcda2d60397))
- **decks:** Surface deck readiness actions ([`640a1a69`](../../commit/640a1a699daa7c9cd3d70f23447f3fdc910fa800))

### Refactoring

- Readiness to pull list ([`fd673a36`](../../commit/fd673a36aaa34d8e543234d3ac7ad0ec583d6c7f))

## [0.12.0] - 2026-06-29

### Bug Fixes

- Edhrec checks side/maybeboard ([`4ab2e25c`](../../commit/4ab2e25c4e2912f6c3b6f8943d08bbffb5673afe))
- Editing handles allocation ([`dee04f78`](../../commit/dee04f7830006a8657a51b8f60511c040c2b51ae))
- Don't load app with query string ([`5d204849`](../../commit/5d2048491dfdbd2dd33158ef870866093a7a1091))
- Broaden cache invalidation for owned counts ([`75a6a74b`](../../commit/75a6a74bd59c8055575344d614abfe9fe69c189c))

### Chores

- Remove unique card count from deck ([`2987f11a`](../../commit/2987f11ad93bce2fde2420724d1d758baa23bc1b))

### Features

- Sell by quantity ([`a7ed876d`](../../commit/a7ed876d413816bc14bfd4eb5beec5c5e0b5dea3))
- Add nebulex cache foundation ([`9bdc850b`](../../commit/9bdc850bb37012998c09e2f4047a78cf6eb40086))
- Cache catalog read paths ([`1d5ea0a0`](../../commit/1d5ea0a06f52c2433a2d35a5365bdc9004d2d4cd))
- Cache deck field batches ([`fd398c8c`](../../commit/fd398c8c51bd1c04e1c2721c7b41333194ab5e9a))

## [0.11.2] - 2026-06-28

### Bug Fixes

- Don't serve phoenix digest ([`5b83d931`](../../commit/5b83d9315081b3cf6d6da7322d62fa13f0e34717))
- Allocate across finishes ([`83efebf1`](../../commit/83efebf13822bc4a5080e6809d25a68d2b7b49ee))

### Features

- Cloud backup retention ([`f863bf80`](../../commit/f863bf8026bfd4ff51ed0a06a06e684207f34d20))
- Show back image ([`b48f9d49`](../../commit/b48f9d498c2182ad2f4198cc337c38136b71903c))
- Collection quantity filter (#61) ([`c4e2646b`](../../commit/c4e2646b95f513568dc5e9587516ff03d473fbc2))
- Sell cards ([`f01c1ff9`](../../commit/f01c1ff93136efce4fa101238adbb25f74a8120d))

### Miscellaneous

- Apply remaining changes (#63) ([`28fd739c`](../../commit/28fd739c59a84bdd3ebe6935b8eef7f37e46db07))

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
