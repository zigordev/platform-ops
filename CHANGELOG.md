# Changelog

## [1.14.2](https://github.com/zigordev/platform-ops/compare/v1.14.1...v1.14.2) (2026-09-08)


### Bug Fixes

* **iam:** let the host pull kini and cv images from ECR ([#111](https://github.com/zigordev/platform-ops/issues/111)) ([d7b89e4](https://github.com/zigordev/platform-ops/commit/d7b89e490b792dc599502060ad4e93464247b139))

## [1.14.1](https://github.com/zigordev/platform-ops/compare/v1.14.0...v1.14.1) (2026-09-08)


### Bug Fixes

* **alertmanager:** give the rendered config to the user that reads it ([#109](https://github.com/zigordev/platform-ops/issues/109)) ([3d81d8d](https://github.com/zigordev/platform-ops/commit/3d81d8d679474ec74acd108286e7ce4dc5a37feb))

## [1.14.0](https://github.com/zigordev/platform-ops/compare/v1.13.0...v1.14.0) (2026-09-08)


### Features

* **ingress:** route kini through the shared Caddy ([#107](https://github.com/zigordev/platform-ops/issues/107)) ([736ad2c](https://github.com/zigordev/platform-ops/commit/736ad2ce4060371febf7ed3a835e1c6c1e9b8f99))

## [1.13.0](https://github.com/zigordev/platform-ops/compare/v1.12.2...v1.13.0) (2026-09-08)


### Features

* **terraform:** provision kini's deploy role, registries and SSM grant ([#104](https://github.com/zigordev/platform-ops/issues/104)) ([cfabc99](https://github.com/zigordev/platform-ops/commit/cfabc99deecd1715a921729b70f006427aa47f25))

## [1.12.2](https://github.com/zigordev/platform-ops/compare/v1.12.1...v1.12.2) (2026-09-08)


### Bug Fixes

* **terraform:** re-declare cv's deploy resources before an apply destroys them ([#103](https://github.com/zigordev/platform-ops/issues/103)) ([7088960](https://github.com/zigordev/platform-ops/commit/70889605c5765592225777e9c6e482c5991d3c26))

## [1.12.1](https://github.com/zigordev/platform-ops/compare/v1.12.0...v1.12.1) (2026-09-08)


### Bug Fixes

* **deploy:** grant the deploy roles ecr:DescribeImages ([#101](https://github.com/zigordev/platform-ops/issues/101)) ([e1543b4](https://github.com/zigordev/platform-ops/commit/e1543b4d0ac38b416354e58448fb8b1425125c3b))

## [1.12.0](https://github.com/zigordev/platform-ops/compare/v1.11.3...v1.12.0) (2026-09-06)


### Features

* **ci:** add CodeQL analysis ([#91](https://github.com/zigordev/platform-ops/issues/91)) ([3aa56d5](https://github.com/zigordev/platform-ops/commit/3aa56d5ee541e94cdc93cdf7d5fb97c1046a7e43))


### Bug Fixes

* **ci:** merge with a PAT so push-triggered workflows still run ([#93](https://github.com/zigordev/platform-ops/issues/93)) ([5455ec5](https://github.com/zigordev/platform-ops/commit/5455ec5abd494f8d63923dc2a4e638847dead888))

## [1.11.3](https://github.com/zigordev/platform-ops/compare/v1.11.2...v1.11.3) (2026-09-03)


### Bug Fixes

* **ci:** grant gitleaks the pull-requests:read it needs on Dependabot PRs ([542bec0](https://github.com/zigordev/platform-ops/commit/542bec05105874b99b1a5b19053c61e2f3e7b3f3))

## [1.11.2](https://github.com/zigordev/platform-ops/compare/v1.11.1...v1.11.2) (2026-09-03)


### Bug Fixes

* **ci:** install terraform in the Quality job, nothing else provides it ([8956575](https://github.com/zigordev/platform-ops/commit/8956575a0ee49b8d6dfa805d0b142d150fd8ed9d))

## [1.11.1](https://github.com/zigordev/platform-ops/compare/v1.11.0...v1.11.1) (2026-09-03)


### Bug Fixes

* **ci:** stop the Quality job running a gitleaks check with no gitleaks ([fe18229](https://github.com/zigordev/platform-ops/commit/fe18229b96494036d3f3d9f26bce6d6d6ab16b7a))

## [1.11.0](https://github.com/zigordev/platform-ops/compare/v1.10.0...v1.11.0) (2026-09-03)


### Features

* **design-system:** vendor colors.css/themes with an enforced sync ([d2434d4](https://github.com/zigordev/platform-ops/commit/d2434d4279b72f494cca52c742816abf2f4c41d9))
* **observability:** a vendored kit, plus alerting on things that matter ([21cfc9a](https://github.com/zigordev/platform-ops/commit/21cfc9a5f6027048789312cbf2146bf28aad767e))
* **standards:** add a script that verifies the standard, and defer backups ([18c8fff](https://github.com/zigordev/platform-ops/commit/18c8fff05de766707d06a7fffa34196b81e6d8aa))


### Bug Fixes

* **security:** check-secrets.sh silently no-ops without ripgrep ([8339a95](https://github.com/zigordev/platform-ops/commit/8339a9564fe9783bf4c1f896bb099837d9c45b50))

## [1.10.0](https://github.com/zigordev/platform-ops/compare/v1.9.0...v1.10.0) (2026-09-02)


### Features

* add provision local openbao token ([466a442](https://github.com/zigordev/platform-ops/commit/466a4423f9513ecf0102aeb2e8a1c1bf3db4aa97))

## [1.9.0](https://github.com/zigordev/platform-ops/compare/v1.8.0...v1.9.0) (2026-06-18)


### Features

* centralized logs generation ([#66](https://github.com/zigordev/platform-ops/issues/66)) ([1e6e4f9](https://github.com/zigordev/platform-ops/commit/1e6e4f90525c7dac75421e003ba564942cee288c))

## [1.8.0](https://github.com/zigordev/platform-ops/compare/v1.7.0...v1.8.0) (2026-05-13)


### Features

* **terraform:** add notifications deploy role ([#64](https://github.com/zigordev/platform-ops/issues/64)) ([20be486](https://github.com/zigordev/platform-ops/commit/20be486da62e4c9276c3b034b36599e952d57f12))

## [1.7.0](https://github.com/zigordev/platform-ops/compare/v1.6.0...v1.7.0) (2026-03-11)


### Features

* add notifications observability and docs ([#58](https://github.com/zigordev/platform-ops/issues/58)) ([d259669](https://github.com/zigordev/platform-ops/commit/d259669751cfedbdde0347584ad8de1391d3538d))
* auto merge release please PR ([e4fe8ca](https://github.com/zigordev/platform-ops/commit/e4fe8cadad5403749c703efea9db5259857ea606))
* auto merge release please PR ([94347b4](https://github.com/zigordev/platform-ops/commit/94347b4cf01004f03c449c488bfaca159126b2ea))
* **infra:** isolate cv-web deploy role and ECR repos ([#45](https://github.com/zigordev/platform-ops/issues/45)) ([5054560](https://github.com/zigordev/platform-ops/commit/50545600767159521fea10865ae6162fb70bd609))
* **ops:** centralize alerting UI in Grafana ([28443b7](https://github.com/zigordev/platform-ops/commit/28443b7875230cc606a0b6316acb22b3eeed9926))
* **ops:** centralize alerting UI in Grafana ([062f534](https://github.com/zigordev/platform-ops/commit/062f5342e5311f141f42cf25f7dcdef1de1eff30))
* **ops:** switch to always-on central ingress ([#56](https://github.com/zigordev/platform-ops/issues/56)) ([014217a](https://github.com/zigordev/platform-ops/commit/014217a9ed848937c583d2a630811a23a9e4b8ae))
* platform ops notifications 20260311 ([#60](https://github.com/zigordev/platform-ops/issues/60)) ([a27aa6f](https://github.com/zigordev/platform-ops/commit/a27aa6f9a36fff36d2582d0404dc7150d98fa0db))
* unified env non secrets 20260310 ([#52](https://github.com/zigordev/platform-ops/issues/52)) ([a99f4fa](https://github.com/zigordev/platform-ops/commit/a99f4fa28531efe568dc3c90fdaca0fb8744c908))
* unified env non secrets 20260310 ([#53](https://github.com/zigordev/platform-ops/issues/53)) ([12d11ab](https://github.com/zigordev/platform-ops/commit/12d11abd7069ea08cde4677d0a81448f34b6734f))


### Bug Fixes

* adapt code for cv-web integration ([6cefecb](https://github.com/zigordev/platform-ops/commit/6cefecb38baf1f6020c2a551302f19ca51f65335))
* adapt code for cv-web integration ([2c751d7](https://github.com/zigordev/platform-ops/commit/2c751d749b9472d0547e8f839d470206b8c2f10a))
* add placeholder ([eec45e3](https://github.com/zigordev/platform-ops/commit/eec45e349898f0948b218c2b0ab8d37888723b7a))
* add placeholder ([0e61d1a](https://github.com/zigordev/platform-ops/commit/0e61d1a6d5c206fe3b63b34e8becf58770215d77))
* add placeholder ([0c86a9f](https://github.com/zigordev/platform-ops/commit/0c86a9fd31e0d069c0bd7dd3e44b5c03543195d3))
* add placeholder ([02931dc](https://github.com/zigordev/platform-ops/commit/02931dc1af6e00466ee6dbd6b98e408725e92654))
* add placeholder ([fe53ee8](https://github.com/zigordev/platform-ops/commit/fe53ee8921de346b19a1e3876e16602e7928f2e1))
* add placeholder ([563a97e](https://github.com/zigordev/platform-ops/commit/563a97e5d2877316649098f25d89492e95cc6ddc))
* add specific token for release please ([af6c320](https://github.com/zigordev/platform-ops/commit/af6c320dc9f30b1683660960561e73e85756ffb9))
* add specific token for release please ([7fdd764](https://github.com/zigordev/platform-ops/commit/7fdd7649ccfc2f3dfa4965c3a62a4d18817f2993))
* **ci:** auto-merge release-please PRs by branch ([4f87131](https://github.com/zigordev/platform-ops/commit/4f87131ddbb40bb6d72d0a988a50932f0d121c04))
* **ci:** auto-merge release-please PRs by branch ([5f27fd0](https://github.com/zigordev/platform-ops/commit/5f27fd0d1088efdcc4bcb897baaa94c4a367b396))
* **ci:** deploy ops after release-please merge ([46294d1](https://github.com/zigordev/platform-ops/commit/46294d1f7913a8ceb6c188bb81f97c8993bf0742))
* **ci:** deploy ops after release-please merge ([0d6abc2](https://github.com/zigordev/platform-ops/commit/0d6abc2676d16b6711d5c3cad717c149ca2ccf33))
* **ci:** make refactor commits releasable ([74a9a65](https://github.com/zigordev/platform-ops/commit/74a9a6533fa9bcd53a6454601cf3f60bd336bacf))
* **ci:** make refactor commits releasable ([7a22f38](https://github.com/zigordev/platform-ops/commit/7a22f387f916c949bc10f6c7eb48d5d9755a73a9))
* **ci:** skip heavy checks for release-please PRs ([23540b6](https://github.com/zigordev/platform-ops/commit/23540b6415a7452235fa55468037cd6b0dd7e43c))
* **ci:** skip heavy checks for release-please PRs ([db4b2aa](https://github.com/zigordev/platform-ops/commit/db4b2aa8d254280acbd2aa2b8c8fabf4bf2d64d1))
* **ci:** trigger deploy on published release ([fbf084f](https://github.com/zigordev/platform-ops/commit/fbf084f57d5ff32ab48e3efd8876604333fbecf1))
* **ci:** trigger deploy on published release ([ab13529](https://github.com/zigordev/platform-ops/commit/ab13529a1e57bf062da4b5d25f9fac22369c16bc))
* **ci:** use release token for release-pr auto-merge ([7b64c5d](https://github.com/zigordev/platform-ops/commit/7b64c5dc2fa8bad2960c8d47cb8626d8d13c1cb9))
* **ci:** use release token for release-pr auto-merge ([5052f52](https://github.com/zigordev/platform-ops/commit/5052f52d0b860394ebf4c1d1f452409a18df84dc))
* deploy prune release root ([#43](https://github.com/zigordev/platform-ops/issues/43)) ([26d1bd6](https://github.com/zigordev/platform-ops/commit/26d1bd6c30acb04b4202d7c0889d9372619e14e1))
* **deploy:** derive release prune root from release dir ([#42](https://github.com/zigordev/platform-ops/issues/42)) ([44fe4cc](https://github.com/zigordev/platform-ops/commit/44fe4cc758f902f15fd3aa3ef1337d2e8123cf99))
* empty stuff to trigger a new release ([9cb7337](https://github.com/zigordev/platform-ops/commit/9cb7337bebe0542ea3a3e5623355a0f5e9822e2d))
* grafana and tolgee exposed ports for local forwarding ([b62c8d3](https://github.com/zigordev/platform-ops/commit/b62c8d320c0ec003c1b4d896700b9b55ab4ca37e))
* grafana and tolgee exposed ports for local forwarding ([09b8d32](https://github.com/zigordev/platform-ops/commit/09b8d32720fd706074443a2ddd879e370ec49432))
* platform ops post refactor 20260309 ([#50](https://github.com/zigordev/platform-ops/issues/50)) ([c19cd43](https://github.com/zigordev/platform-ops/commit/c19cd435fff2ef3ce8e4c2633993926a23ea775e))
* security issues ([62dcb10](https://github.com/zigordev/platform-ops/commit/62dcb105c3798c9cf891e499a464facf0ef5f3c0))
* security issues ([2579b8e](https://github.com/zigordev/platform-ops/commit/2579b8e1964ec3d5f1d490e5cca85ec28739afc1))
* **terraform:** allow cv-web runtime SSM and ECR access ([#47](https://github.com/zigordev/platform-ops/issues/47)) ([ec009e5](https://github.com/zigordev/platform-ops/commit/ec009e502d20b198aba8fc79e4737875fc24646b))
* trigger direct-release smoke test ([#41](https://github.com/zigordev/platform-ops/issues/41)) ([4ccc696](https://github.com/zigordev/platform-ops/commit/4ccc696cdc01672a060f9655aca12b1e68989c95))
* trigger release flow smoke test ([afdd046](https://github.com/zigordev/platform-ops/commit/afdd046e3dbb5ebf85bfff1fb07efea10912b910))
* trigger release flow smoke test ([092cd1d](https://github.com/zigordev/platform-ops/commit/092cd1d8b887a4dc12b92cc3b1925bb0177ba0a3))
* trigger release please ([e2d857b](https://github.com/zigordev/platform-ops/commit/e2d857bc5126a2b97471ace892afaaf7274aadfe))
* trigger release please ([fe305a1](https://github.com/zigordev/platform-ops/commit/fe305a121a9aeb5c1581fca429e77a54492ba483))
* trigger release please ([03f2640](https://github.com/zigordev/platform-ops/commit/03f2640f9e25347ed1851e28ded437bd64dbbb8b))
* wrong release PR author ([1fe9f49](https://github.com/zigordev/platform-ops/commit/1fe9f49f4df2935207897f3af31d84dd2f5cf611))


### Refactoring

* **ci:** switch to direct release mode ([32f6200](https://github.com/zigordev/platform-ops/commit/32f620052eba3969560fc7734053be0d5e6eb907))
* **ci:** switch to direct release mode ([7cd7c9d](https://github.com/zigordev/platform-ops/commit/7cd7c9d0179d936233377693689f174b97ae4497))
* remove outdate references ([09cc26d](https://github.com/zigordev/platform-ops/commit/09cc26dedbc871dd411f32f9438fd7b64bc2993c))
* remove outdate references ([056fdd0](https://github.com/zigordev/platform-ops/commit/056fdd02e793fb82ef8f9004eb85016e772beb13))
* removed legacy and unused stuff ([d05043f](https://github.com/zigordev/platform-ops/commit/d05043fa6dbc776f3133f96cb2590040046a7612))
* removed legacy and unused stuff ([2378658](https://github.com/zigordev/platform-ops/commit/2378658466e6f1e54bfebfa1816028d03b57a193))

## [1.6.0](https://github.com/zigordev/platform-ops/compare/v1.5.0...v1.6.0) (2026-03-11)


### Features

* platform ops notifications 20260311 ([#60](https://github.com/zigordev/platform-ops/issues/60)) ([a27aa6f](https://github.com/zigordev/platform-ops/commit/a27aa6f9a36fff36d2582d0404dc7150d98fa0db))

## [1.5.0](https://github.com/zigordev/platform-ops/compare/v1.4.0...v1.5.0) (2026-03-11)


### Features

* add notifications observability and docs ([#58](https://github.com/zigordev/platform-ops/issues/58)) ([d259669](https://github.com/zigordev/platform-ops/commit/d259669751cfedbdde0347584ad8de1391d3538d))

## [1.4.0](https://github.com/zigordev/platform-ops/compare/v1.3.0...v1.4.0) (2026-03-11)


### Features

* **ops:** switch to always-on central ingress ([#56](https://github.com/zigordev/platform-ops/issues/56)) ([014217a](https://github.com/zigordev/platform-ops/commit/014217a9ed848937c583d2a630811a23a9e4b8ae))

## [1.3.0](https://github.com/zigordev/platform-ops/compare/v1.2.2...v1.3.0) (2026-03-11)


### Features

* unified env non secrets 20260310 ([#52](https://github.com/zigordev/platform-ops/issues/52)) ([a99f4fa](https://github.com/zigordev/platform-ops/commit/a99f4fa28531efe568dc3c90fdaca0fb8744c908))
* unified env non secrets 20260310 ([#53](https://github.com/zigordev/platform-ops/issues/53)) ([12d11ab](https://github.com/zigordev/platform-ops/commit/12d11abd7069ea08cde4677d0a81448f34b6734f))

## [1.2.2](https://github.com/zigordev/platform-ops/compare/v1.2.1...v1.2.2) (2026-03-09)


### Bug Fixes

* platform ops post refactor 20260309 ([#50](https://github.com/zigordev/platform-ops/issues/50)) ([c19cd43](https://github.com/zigordev/platform-ops/commit/c19cd435fff2ef3ce8e4c2633993926a23ea775e))

## [1.2.1](https://github.com/zigordev/platform-ops/compare/v1.2.0...v1.2.1) (2026-03-02)


### Bug Fixes

* **terraform:** allow cv runtime SSM and ECR access ([#47](https://github.com/zigordev/platform-ops/issues/47)) ([ec009e5](https://github.com/zigordev/platform-ops/commit/ec009e502d20b198aba8fc79e4737875fc24646b))

## [1.2.0](https://github.com/zigordev/platform-ops/compare/v1.1.8...v1.2.0) (2026-02-28)


### Features

* **infra:** isolate cv deploy role and ECR repos ([#45](https://github.com/zigordev/platform-ops/issues/45)) ([5054560](https://github.com/zigordev/platform-ops/commit/50545600767159521fea10865ae6162fb70bd609))

## [1.1.8](https://github.com/zigordev/platform-ops/compare/v1.1.7...v1.1.8) (2026-02-27)


### Bug Fixes

* **ci:** make refactor commits releasable ([74a9a65](https://github.com/zigordev/platform-ops/commit/74a9a6533fa9bcd53a6454601cf3f60bd336bacf))
* **ci:** make refactor commits releasable ([7a22f38](https://github.com/zigordev/platform-ops/commit/7a22f387f916c949bc10f6c7eb48d5d9755a73a9))
* deploy prune release root ([#43](https://github.com/zigordev/platform-ops/issues/43)) ([26d1bd6](https://github.com/zigordev/platform-ops/commit/26d1bd6c30acb04b4202d7c0889d9372619e14e1))
* **deploy:** derive release prune root from release dir ([#42](https://github.com/zigordev/platform-ops/issues/42)) ([44fe4cc](https://github.com/zigordev/platform-ops/commit/44fe4cc758f902f15fd3aa3ef1337d2e8123cf99))
* trigger direct-release smoke test ([#41](https://github.com/zigordev/platform-ops/issues/41)) ([4ccc696](https://github.com/zigordev/platform-ops/commit/4ccc696cdc01672a060f9655aca12b1e68989c95))


### Refactoring

* **ci:** switch to direct release mode ([32f6200](https://github.com/zigordev/platform-ops/commit/32f620052eba3969560fc7734053be0d5e6eb907))
* **ci:** switch to direct release mode ([7cd7c9d](https://github.com/zigordev/platform-ops/commit/7cd7c9d0179d936233377693689f174b97ae4497))

## [1.1.7](https://github.com/zigordev/platform-ops/compare/v1.1.6...v1.1.7) (2026-02-27)


### Bug Fixes

* **ci:** skip heavy checks for release-please PRs ([23540b6](https://github.com/zigordev/platform-ops/commit/23540b6415a7452235fa55468037cd6b0dd7e43c))
* **ci:** skip heavy checks for release-please PRs ([db4b2aa](https://github.com/zigordev/platform-ops/commit/db4b2aa8d254280acbd2aa2b8c8fabf4bf2d64d1))

## [1.1.6](https://github.com/zigordev/platform-ops/compare/v1.1.5...v1.1.6) (2026-02-26)


### Bug Fixes

* **ci:** trigger deploy on published release ([fbf084f](https://github.com/zigordev/platform-ops/commit/fbf084f57d5ff32ab48e3efd8876604333fbecf1))
* **ci:** trigger deploy on published release ([ab13529](https://github.com/zigordev/platform-ops/commit/ab13529a1e57bf062da4b5d25f9fac22369c16bc))

## [1.1.5](https://github.com/zigordev/platform-ops/compare/v1.1.4...v1.1.5) (2026-02-26)


### Bug Fixes

* **ci:** use release token for release-pr auto-merge ([7b64c5d](https://github.com/zigordev/platform-ops/commit/7b64c5dc2fa8bad2960c8d47cb8626d8d13c1cb9))
* **ci:** use release token for release-pr auto-merge ([5052f52](https://github.com/zigordev/platform-ops/commit/5052f52d0b860394ebf4c1d1f452409a18df84dc))

## [1.1.4](https://github.com/zigordev/platform-ops/compare/v1.1.3...v1.1.4) (2026-02-26)


### Bug Fixes

* trigger release flow smoke test ([afdd046](https://github.com/zigordev/platform-ops/commit/afdd046e3dbb5ebf85bfff1fb07efea10912b910))
* trigger release flow smoke test ([092cd1d](https://github.com/zigordev/platform-ops/commit/092cd1d8b887a4dc12b92cc3b1925bb0177ba0a3))

## [1.1.3](https://github.com/zigordev/platform-ops/compare/v1.1.2...v1.1.3) (2026-02-26)


### Bug Fixes

* **ci:** deploy ops after release-please merge ([46294d1](https://github.com/zigordev/platform-ops/commit/46294d1f7913a8ceb6c188bb81f97c8993bf0742))
* **ci:** deploy ops after release-please merge ([0d6abc2](https://github.com/zigordev/platform-ops/commit/0d6abc2676d16b6711d5c3cad717c149ca2ccf33))

## [1.1.2](https://github.com/zigordev/platform-ops/compare/v1.1.1...v1.1.2) (2026-02-26)


### Bug Fixes

* **ci:** auto-merge release-please PRs by branch ([4f87131](https://github.com/zigordev/platform-ops/commit/4f87131ddbb40bb6d72d0a988a50932f0d121c04))
* **ci:** auto-merge release-please PRs by branch ([5f27fd0](https://github.com/zigordev/platform-ops/commit/5f27fd0d1088efdcc4bcb897baaa94c4a367b396))
* wrong release PR author ([1fe9f49](https://github.com/zigordev/platform-ops/commit/1fe9f49f4df2935207897f3af31d84dd2f5cf611))

## [1.1.1](https://github.com/zigordev/platform-ops/compare/v1.1.0...v1.1.1) (2026-02-26)


### Bug Fixes

* adapt code for cv integration ([6cefecb](https://github.com/zigordev/platform-ops/commit/6cefecb38baf1f6020c2a551302f19ca51f65335))
* adapt code for cv integration ([2c751d7](https://github.com/zigordev/platform-ops/commit/2c751d749b9472d0547e8f839d470206b8c2f10a))

## [1.1.0](https://github.com/zigordev/platform-ops/compare/v1.0.4...v1.1.0) (2026-02-25)


### Features

* **ops:** centralize alerting UI in Grafana ([28443b7](https://github.com/zigordev/platform-ops/commit/28443b7875230cc606a0b6316acb22b3eeed9926))
* **ops:** centralize alerting UI in Grafana ([062f534](https://github.com/zigordev/platform-ops/commit/062f5342e5311f141f42cf25f7dcdef1de1eff30))

## [1.0.4](https://github.com/zigordev/platform-ops/compare/v1.0.3...v1.0.4) (2026-02-25)


### Bug Fixes

* trigger release please ([e2d857b](https://github.com/zigordev/platform-ops/commit/e2d857bc5126a2b97471ace892afaaf7274aadfe))
* trigger release please ([fe305a1](https://github.com/zigordev/platform-ops/commit/fe305a121a9aeb5c1581fca429e77a54492ba483))

## [1.0.3](https://github.com/zigordev/platform-ops/compare/v1.0.2...v1.0.3) (2026-02-25)


### Bug Fixes

* empty stuff to trigger a new release ([9cb7337](https://github.com/zigordev/platform-ops/commit/9cb7337bebe0542ea3a3e5623355a0f5e9822e2d))
* trigger release please ([03f2640](https://github.com/zigordev/platform-ops/commit/03f2640f9e25347ed1851e28ded437bd64dbbb8b))

## [1.0.2](https://github.com/zigordev/platform-ops/compare/v1.0.1...v1.0.2) (2026-02-25)


### Bug Fixes

* add placeholder ([0c86a9f](https://github.com/zigordev/platform-ops/commit/0c86a9fd31e0d069c0bd7dd3e44b5c03543195d3))
* add placeholder ([02931dc](https://github.com/zigordev/platform-ops/commit/02931dc1af6e00466ee6dbd6b98e408725e92654))
* add placeholder ([fe53ee8](https://github.com/zigordev/platform-ops/commit/fe53ee8921de346b19a1e3876e16602e7928f2e1))
* add placeholder ([563a97e](https://github.com/zigordev/platform-ops/commit/563a97e5d2877316649098f25d89492e95cc6ddc))
* security issues ([62dcb10](https://github.com/zigordev/platform-ops/commit/62dcb105c3798c9cf891e499a464facf0ef5f3c0))
* security issues ([2579b8e](https://github.com/zigordev/platform-ops/commit/2579b8e1964ec3d5f1d490e5cca85ec28739afc1))

## [1.0.1](https://github.com/zigordev/platform-ops/compare/v1.0.0...v1.0.1) (2026-02-24)


### Bug Fixes

* grafana and tolgee exposed ports for local forwarding ([b62c8d3](https://github.com/zigordev/platform-ops/commit/b62c8d320c0ec003c1b4d896700b9b55ab4ca37e))
* grafana and tolgee exposed ports for local forwarding ([09b8d32](https://github.com/zigordev/platform-ops/commit/09b8d32720fd706074443a2ddd879e370ec49432))

## 1.0.0 (2026-02-24)


### Features

* auto merge release please PR ([e4fe8ca](https://github.com/zigordev/platform-ops/commit/e4fe8cadad5403749c703efea9db5259857ea606))
* auto merge release please PR ([94347b4](https://github.com/zigordev/platform-ops/commit/94347b4cf01004f03c449c488bfaca159126b2ea))


### Bug Fixes

* add specific token for release please ([af6c320](https://github.com/zigordev/platform-ops/commit/af6c320dc9f30b1683660960561e73e85756ffb9))
* add specific token for release please ([7fdd764](https://github.com/zigordev/platform-ops/commit/7fdd7649ccfc2f3dfa4965c3a62a4d18817f2993))
