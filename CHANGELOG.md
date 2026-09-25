# Changelog

## [1.45.1](https://github.com/zigordev/platform-ops/compare/v1.45.0...v1.45.1) (2026-09-25)


### Bug Fixes

* **local:** wait for tolgee before the ops stack reports started ([#256](https://github.com/zigordev/platform-ops/issues/256)) ([eea79d2](https://github.com/zigordev/platform-ops/commit/eea79d2ee80ebffb3ef8aecc26947133509e9410))

## [1.45.0](https://github.com/zigordev/platform-ops/compare/v1.44.0...v1.45.0) (2026-09-25)


### Features

* **openbao:** unseal the local openbao by itself with a static seal ([#253](https://github.com/zigordev/platform-ops/issues/253)) ([9773ef2](https://github.com/zigordev/platform-ops/commit/9773ef2cddbfc680d7503750ee0e86715bd2a404))

## [1.44.0](https://github.com/zigordev/platform-ops/compare/v1.43.0...v1.44.0) (2026-09-25)


### Features

* **alerting:** see an empty tolgee export, and show the console which copy it served ([#250](https://github.com/zigordev/platform-ops/issues/250)) ([b5012b5](https://github.com/zigordev/platform-ops/commit/b5012b57dac2558ff68b0b80aa97316a9a0b8417))

## [1.43.0](https://github.com/zigordev/platform-ops/compare/v1.42.3...v1.43.0) (2026-09-25)


### Features

* **alerting:** see a wrong-shape tolgee export, and validate the ops deploy role ([#248](https://github.com/zigordev/platform-ops/issues/248)) ([9b4a978](https://github.com/zigordev/platform-ops/commit/9b4a97853db7a6f40959473d6af5100fdff58e8e))

## [1.42.3](https://github.com/zigordev/platform-ops/compare/v1.42.2...v1.42.3) (2026-09-24)


### Bug Fixes

* **checks:** make the estate verifier run, and stop three checks lying ([#244](https://github.com/zigordev/platform-ops/issues/244)) ([f660c5c](https://github.com/zigordev/platform-ops/commit/f660c5ca86ee3251ec09dcdf2b630007e9ec774d))

## [1.42.2](https://github.com/zigordev/platform-ops/compare/v1.42.1...v1.42.2) (2026-09-24)


### Bug Fixes

* **alerting:** name the services the log alerts watch, and stop two checks lying ([#242](https://github.com/zigordev/platform-ops/issues/242)) ([b928634](https://github.com/zigordev/platform-ops/commit/b9286343bdb698729ecbf59af23c84031031bdd2))

## [1.42.1](https://github.com/zigordev/platform-ops/compare/v1.42.0...v1.42.1) (2026-09-24)


### Bug Fixes

* **tempo:** raise the memory limit to 1 GiB and hold the runtime under it ([#239](https://github.com/zigordev/platform-ops/issues/239)) ([41160f0](https://github.com/zigordev/platform-ops/commit/41160f0931b44d38afbe9112e10cd9ed18a49793))

## [1.42.0](https://github.com/zigordev/platform-ops/compare/v1.41.0...v1.42.0) (2026-09-24)


### Features

* **alerts:** alert when the control plane drops a projection stream ([#238](https://github.com/zigordev/platform-ops/issues/238)) ([d02c620](https://github.com/zigordev/platform-ops/commit/d02c620aaf4f8deb0ecc170d402eb72d54916e8b))

## [1.41.0](https://github.com/zigordev/platform-ops/compare/v1.40.1...v1.41.0) (2026-09-24)


### Features

* **dashboards:** add the kini funnel and the trading-bot pipeline ([#234](https://github.com/zigordev/platform-ops/issues/234)) ([ce0654e](https://github.com/zigordev/platform-ops/commit/ce0654ec539bb0f3da071148fdc78f044a26256e))
* **slo:** measure page latency the same way on every web app ([#233](https://github.com/zigordev/platform-ops/issues/233)) ([add7354](https://github.com/zigordev/platform-ops/commit/add73543dbe2de6bfbce8694726295b1cb94f1c4))


### Bug Fixes

* **observability:** hold span metrics for two hours and alert on a wedged dlt ([#232](https://github.com/zigordev/platform-ops/issues/232)) ([e1c158d](https://github.com/zigordev/platform-ops/commit/e1c158d16254c261457b061e010c00a6bea6cdd3))

## [1.40.1](https://github.com/zigordev/platform-ops/compare/v1.40.0...v1.40.1) (2026-09-24)


### Bug Fixes

* **observability:** one server span per next request, and none lost when no route matched ([#231](https://github.com/zigordev/platform-ops/issues/231)) ([8af6a7d](https://github.com/zigordev/platform-ops/commit/8af6a7d0bcfd187c8846eb7004e3ea2526078be5))

## [1.40.0](https://github.com/zigordev/platform-ops/compare/v1.39.0...v1.40.0) (2026-09-24)


### Features

* **delivery:** add the shared delivery path for sity and trading-bot ([#230](https://github.com/zigordev/platform-ops/issues/230)) ([229a4fe](https://github.com/zigordev/platform-ops/commit/229a4fe1dff73fb653022cc475236150dc53fb7d))

## [1.39.0](https://github.com/zigordev/platform-ops/compare/v1.38.0...v1.39.0) (2026-09-23)


### Features

* **alerts:** watch the kini pool socket refusing connections ([#228](https://github.com/zigordev/platform-ops/issues/228)) ([8a760af](https://github.com/zigordev/platform-ops/commit/8a760af2c6917f342dbeef842075b03dcb9a802a))
* **observability:** check the vendored kit for drift and staleness ([#227](https://github.com/zigordev/platform-ops/issues/227)) ([7feb0dd](https://github.com/zigordev/platform-ops/commit/7feb0ddbfa1046aa189de294c6708831e7ed5e1b))


### Bug Fixes

* **observability:** make log alerts inhibitable, stop the config mounts going stale, and check Tolgee's database ([#226](https://github.com/zigordev/platform-ops/issues/226)) ([4528578](https://github.com/zigordev/platform-ops/commit/452857859e96fb5bd1f25e5b11c49a280034f3c1))

## [1.38.0](https://github.com/zigordev/platform-ops/compare/v1.37.3...v1.38.0) (2026-09-23)


### Features

* **observability:** name server spans by route and end the vendored-kit forks ([#223](https://github.com/zigordev/platform-ops/issues/223)) ([2ea9944](https://github.com/zigordev/platform-ops/commit/2ea9944c799bd1a91d874394fb5d8019a3410962))

## [1.37.3](https://github.com/zigordev/platform-ops/compare/v1.37.2...v1.37.3) (2026-09-23)


### Bug Fixes

* **prometheus:** stop scraping an ingress that does not run locally ([#221](https://github.com/zigordev/platform-ops/issues/221)) ([34bb7fc](https://github.com/zigordev/platform-ops/commit/34bb7fc13f7ceee601069c53549eb46657dfa616))

## [1.37.2](https://github.com/zigordev/platform-ops/compare/v1.37.1...v1.37.2) (2026-09-23)


### Bug Fixes

* **observability:** correct alert coverage, sli scope and business panels ([#219](https://github.com/zigordev/platform-ops/issues/219)) ([5ff2c20](https://github.com/zigordev/platform-ops/commit/5ff2c206bd8d1dffcebede449ba21b8edd020c52))

## [1.37.1](https://github.com/zigordev/platform-ops/compare/v1.37.0...v1.37.1) (2026-09-23)


### Bug Fixes

* **observability:** register the RUM vocabulary at startup and correct stale dashboard copy ([#217](https://github.com/zigordev/platform-ops/issues/217)) ([00ebdbb](https://github.com/zigordev/platform-ops/commit/00ebdbb1ca0b1c7ac9a032ce72e9612b2e141625))

## [1.37.0](https://github.com/zigordev/platform-ops/compare/v1.36.0...v1.37.0) (2026-09-23)


### Features

* **prometheus:** scrape sity-web and expect health from every web app ([#205](https://github.com/zigordev/platform-ops/issues/205)) ([41430e2](https://github.com/zigordev/platform-ops/commit/41430e2286b164c31114955a908d1fbe5019531f))

## [1.36.0](https://github.com/zigordev/platform-ops/compare/v1.35.0...v1.36.0) (2026-09-23)


### Features

* **observability:** dashboards for trading-bot, and a service picker the Rust services fit in ([#209](https://github.com/zigordev/platform-ops/issues/209)) ([077601b](https://github.com/zigordev/platform-ops/commit/077601bf9a815e4ad179824b89588313e28d338a))

## [1.35.0](https://github.com/zigordev/platform-ops/compare/v1.34.0...v1.35.0) (2026-09-23)


### Features

* **observability:** give gpool its own dashboards and mail alerts ([#207](https://github.com/zigordev/platform-ops/issues/207)) ([709cb00](https://github.com/zigordev/platform-ops/commit/709cb003679546369a173eecb71a1118e7009447))

## [1.34.0](https://github.com/zigordev/platform-ops/compare/v1.33.0...v1.34.0) (2026-09-23)


### Features

* **grafana:** a dashboard for sity-web, and nothing more ([#210](https://github.com/zigordev/platform-ops/issues/210)) ([a9af3e0](https://github.com/zigordev/platform-ops/commit/a9af3e050a547e8671bc3ca73ffc36198a23bf67))

## [1.33.0](https://github.com/zigordev/platform-ops/compare/v1.32.0...v1.33.0) (2026-09-23)


### Features

* **observability:** give kini its own dashboards and sync alerts ([#208](https://github.com/zigordev/platform-ops/issues/208)) ([aed6594](https://github.com/zigordev/platform-ops/commit/aed6594d374007e15e25977cd7d9dca46c805ed9))

## [1.32.0](https://github.com/zigordev/platform-ops/compare/v1.31.1...v1.32.0) (2026-09-23)


### Features

* **observability:** standard events, probe-free traces and zero-start metrics in the kit ([#204](https://github.com/zigordev/platform-ops/issues/204)) ([2757c2b](https://github.com/zigordev/platform-ops/commit/2757c2bb24b3f1adb99d1d2a9e35d17f7e2aea24))


### Bug Fixes

* **observability:** scrape the control plane by name and drop probes from the SLIs ([#206](https://github.com/zigordev/platform-ops/issues/206)) ([c44805a](https://github.com/zigordev/platform-ops/commit/c44805a6ba3cfd95e64f325e26632564a6f33e3b))

## [1.31.1](https://github.com/zigordev/platform-ops/compare/v1.31.0...v1.31.1) (2026-09-22)


### Bug Fixes

* **observability:** keep the seal alert up, read tiles at this instant, fix the unseal hint ([#201](https://github.com/zigordev/platform-ops/issues/201)) ([986030c](https://github.com/zigordev/platform-ops/commit/986030c0730620811587e6022ba5a3a6fd09a50e))

## [1.31.0](https://github.com/zigordev/platform-ops/compare/v1.30.0...v1.31.0) (2026-09-21)


### Features

* **grafana:** dashboards as code on Grafana 13 ([#190](https://github.com/zigordev/platform-ops/issues/190)) ([385e60c](https://github.com/zigordev/platform-ops/commit/385e60c34e0a5f30d2a40874e257e4dd157844e6))

## [1.30.0](https://github.com/zigordev/platform-ops/compare/v1.29.0...v1.30.0) (2026-09-21)


### Features

* **observability:** export the release as service_build_info ([#191](https://github.com/zigordev/platform-ops/issues/191)) ([615dd7a](https://github.com/zigordev/platform-ops/commit/615dd7a6b066b760f7b13ad16a9a5de281100b98))

## [1.29.0](https://github.com/zigordev/platform-ops/compare/v1.28.1...v1.29.0) (2026-09-21)


### Features

* **observability:** carry RUM v2 into the kit and link logs only to kept traces ([#184](https://github.com/zigordev/platform-ops/issues/184)) ([e05cb9c](https://github.com/zigordev/platform-ops/commit/e05cb9c42751086bf88c609959bff429dc31c304))

## [1.28.1](https://github.com/zigordev/platform-ops/compare/v1.28.0...v1.28.1) (2026-09-21)


### Bug Fixes

* **deploy:** remove the containers of services a release retired ([#187](https://github.com/zigordev/platform-ops/issues/187)) ([7593dfe](https://github.com/zigordev/platform-ops/commit/7593dfea3595fcd50eb0c6d22ff7a548cc2e16c7))

## [1.28.0](https://github.com/zigordev/platform-ops/compare/v1.27.0...v1.28.0) (2026-09-21)


### Features

* **alerts:** cv and notifications alerts, a delivery objective and runbooks ([#183](https://github.com/zigordev/platform-ops/issues/183)) ([ff07053](https://github.com/zigordev/platform-ops/commit/ff07053016ecf769092a15bc67f17cb6f5febfed))
* **grafana:** upgrade to Grafana 12 and link the signals ([#182](https://github.com/zigordev/platform-ops/issues/182)) ([04eb9bb](https://github.com/zigordev/platform-ops/commit/04eb9bbd29ee990e4e1f39e595d92ee39ee7a42d))


### Bug Fixes

* **deploy:** prune unused Docker images every weekday ([#185](https://github.com/zigordev/platform-ops/issues/185)) ([8fb1cea](https://github.com/zigordev/platform-ops/commit/8fb1cea6c510cad1ae0e2f1a7f7bce1b80f4f578))

## [1.27.0](https://github.com/zigordev/platform-ops/compare/v1.26.0...v1.27.0) (2026-09-21)


### Features

* **edge:** measure every site where the request arrives ([#178](https://github.com/zigordev/platform-ops/issues/178)) ([9c7237d](https://github.com/zigordev/platform-ops/commit/9c7237d4c648bc4e69766b5203d22378a46b059d))

## [1.26.0](https://github.com/zigordev/platform-ops/compare/v1.25.0...v1.26.0) (2026-09-21)


### Features

* **alerting:** alert on logs, and send one email per outage ([#177](https://github.com/zigordev/platform-ops/issues/177)) ([0d40965](https://github.com/zigordev/platform-ops/commit/0d40965eeac7227c5bc78bd3e52700030755488a))

## [1.25.0](https://github.com/zigordev/platform-ops/compare/v1.24.0...v1.25.0) (2026-09-20)


### Features

* **observability:** log events with release, flat fields and a level ([#173](https://github.com/zigordev/platform-ops/issues/173)) ([ecf41a9](https://github.com/zigordev/platform-ops/commit/ecf41a90144a0e16f9607a96497c8e2684bfb577))

## [1.24.0](https://github.com/zigordev/platform-ops/compare/v1.23.0...v1.24.0) (2026-09-20)


### Features

* **prometheus:** keep 90 days, store exemplars and watch the stack ([#174](https://github.com/zigordev/platform-ops/issues/174)) ([40b6d46](https://github.com/zigordev/platform-ops/commit/40b6d46501537682abb4962187143d8c49f23dab))

## [1.23.0](https://github.com/zigordev/platform-ops/compare/v1.22.1...v1.23.0) (2026-09-20)


### Features

* **tracing:** keep traces in Tempo ([#171](https://github.com/zigordev/platform-ops/issues/171)) ([06c5ae4](https://github.com/zigordev/platform-ops/commit/06c5ae490a3445033b94b4f5b02e90b54f6c1f1e))


### Bug Fixes

* **loki:** delete logs after 30 days and fix the notifications log panel ([#170](https://github.com/zigordev/platform-ops/issues/170)) ([6c1eda3](https://github.com/zigordev/platform-ops/commit/6c1eda3b1a55ee8df5656e9559b8fac5d2d976d1))

## [1.22.1](https://github.com/zigordev/platform-ops/compare/v1.22.0...v1.22.1) (2026-09-20)


### Bug Fixes

* **ops:** label and cap every ops container's logs ([#167](https://github.com/zigordev/platform-ops/issues/167)) ([127eeaf](https://github.com/zigordev/platform-ops/commit/127eeaf9907ee77d5244be3bbdb0de64cbe8ddb5))

## [1.22.0](https://github.com/zigordev/platform-ops/compare/v1.21.0...v1.22.0) (2026-09-20)


### Features

* **logs:** archive each day to S3 before it expires ([#166](https://github.com/zigordev/platform-ops/issues/166)) ([f915b89](https://github.com/zigordev/platform-ops/commit/f915b895cd2e73ffcba7fe0a957fef52de3eac82))

## [1.21.0](https://github.com/zigordev/platform-ops/compare/v1.20.5...v1.21.0) (2026-09-20)


### Features

* **infra:** add the archive bucket for logs and future backups ([#163](https://github.com/zigordev/platform-ops/issues/163)) ([2d9af1d](https://github.com/zigordev/platform-ops/commit/2d9af1d7601669614b1f12a579ad60326250a626))

## [1.20.5](https://github.com/zigordev/platform-ops/compare/v1.20.4...v1.20.5) (2026-09-20)


### Bug Fixes

* **observability:** carry the RUM fixes into the kit ([#160](https://github.com/zigordev/platform-ops/issues/160)) ([953947c](https://github.com/zigordev/platform-ops/commit/953947cc3b17f8526571cb7a717059aebd05d367))

## [1.20.4](https://github.com/zigordev/platform-ops/compare/v1.20.3...v1.20.4) (2026-09-20)


### Bug Fixes

* **ingress:** stop serving /metrics publicly ([#161](https://github.com/zigordev/platform-ops/issues/161)) ([9ef92f4](https://github.com/zigordev/platform-ops/commit/9ef92f43a069ea3b2237734c5e69687990b277aa))

## [1.20.3](https://github.com/zigordev/platform-ops/compare/v1.20.2...v1.20.3) (2026-09-15)


### Refactoring

* **shape:** converge the script surface, network key and README with the estate ([#145](https://github.com/zigordev/platform-ops/issues/145)) ([ebaa0b3](https://github.com/zigordev/platform-ops/commit/ebaa0b319c3580904cbadde7d897fdb552e2d665))

## [1.20.2](https://github.com/zigordev/platform-ops/compare/v1.20.1...v1.20.2) (2026-09-11)


### Bug Fixes

* **openbao:** probe the local healthcheck over IPv4 ([#142](https://github.com/zigordev/platform-ops/issues/142)) ([0c5589e](https://github.com/zigordev/platform-ops/commit/0c5589e299e33777be92a66dd1c6bd861ac3a0e8))

## [1.20.1](https://github.com/zigordev/platform-ops/compare/v1.20.0...v1.20.1) (2026-09-09)


### Bug Fixes

* **prometheus:** drop trading-bot scrape targets from prod ([#137](https://github.com/zigordev/platform-ops/issues/137)) ([2cfb859](https://github.com/zigordev/platform-ops/commit/2cfb859c92605628e65060c553f518b828fe0ab5))

## [1.20.0](https://github.com/zigordev/platform-ops/compare/v1.19.1...v1.20.0) (2026-09-09)


### Features

* **power:** stop and start the prod host on demand and on a schedule ([#135](https://github.com/zigordev/platform-ops/issues/135)) ([6997a9f](https://github.com/zigordev/platform-ops/commit/6997a9f453fd63c114058d08682b6b16e93fa501))

## [1.19.1](https://github.com/zigordev/platform-ops/compare/v1.19.0...v1.19.1) (2026-09-09)


### Bug Fixes

* **deploy:** quote secrets in the ops env file and stop sourcing it ([#132](https://github.com/zigordev/platform-ops/issues/132)) ([23a4829](https://github.com/zigordev/platform-ops/commit/23a4829afe0eee5b0b26c07d9e340cf7cf9c3931))

## [1.19.0](https://github.com/zigordev/platform-ops/compare/v1.18.2...v1.19.0) (2026-09-08)


### Features

* **ingress:** serve Unleash at flags.zigordev.com ([#130](https://github.com/zigordev/platform-ops/issues/130)) ([e871df5](https://github.com/zigordev/platform-ops/commit/e871df5737d4ee7102d222df5f3ae5f37db27f18))

## [1.18.2](https://github.com/zigordev/platform-ops/compare/v1.18.1...v1.18.2) (2026-09-08)


### Bug Fixes

* **ingress:** actually keep Unleash off the public ingress ([#128](https://github.com/zigordev/platform-ops/issues/128)) ([d7d032e](https://github.com/zigordev/platform-ops/commit/d7d032eb822f8e7dcb7d5b6996088067908f8f8e))

## [1.18.1](https://github.com/zigordev/platform-ops/compare/v1.18.0...v1.18.1) (2026-09-08)


### Bug Fixes

* **flags:** register with the server, and state the fallback order correctly ([#126](https://github.com/zigordev/platform-ops/issues/126)) ([4dcf3ab](https://github.com/zigordev/platform-ops/commit/4dcf3abc8393781cef04bac823ab0e5c02c297a1))

## [1.18.0](https://github.com/zigordev/platform-ops/compare/v1.17.0...v1.18.0) (2026-09-08)


### Features

* **flags:** let the vendored reader take values from Unleash ([#124](https://github.com/zigordev/platform-ops/issues/124)) ([38a91fe](https://github.com/zigordev/platform-ops/commit/38a91fec6a60379bdca59f7bb19ca37f0ab3ab1e))

## [1.17.0](https://github.com/zigordev/platform-ops/compare/v1.16.0...v1.17.0) (2026-09-08)


### Features

* **flags:** run Unleash in the ops stack ([#122](https://github.com/zigordev/platform-ops/issues/122)) ([002de1c](https://github.com/zigordev/platform-ops/commit/002de1cd112df269505842293b017dd4c4a32161))

## [1.16.0](https://github.com/zigordev/platform-ops/compare/v1.15.2...v1.16.0) (2026-09-08)


### Features

* **openbao:** auto-unseal production, stop deploys resealing it, and alert when sealed ([#119](https://github.com/zigordev/platform-ops/issues/119)) ([61ab319](https://github.com/zigordev/platform-ops/commit/61ab319e4fced6e87b1c0222a9d0e59e7cfd089c))

## [1.15.2](https://github.com/zigordev/platform-ops/compare/v1.15.1...v1.15.2) (2026-09-08)


### Bug Fixes

* **iam:** accept GitHub's identifier-qualified OIDC subject for cv ([#117](https://github.com/zigordev/platform-ops/issues/117)) ([b39e1d7](https://github.com/zigordev/platform-ops/commit/b39e1d7bef0471a2330d1bea2551e41acbb17669))

## [1.15.1](https://github.com/zigordev/platform-ops/compare/v1.15.0...v1.15.1) (2026-09-08)


### Bug Fixes

* **ingress:** pass CV_WEB_DOMAIN into the ingress container ([#115](https://github.com/zigordev/platform-ops/issues/115)) ([2d11de6](https://github.com/zigordev/platform-ops/commit/2d11de637a7da801ca331100cc0e0accb3f4ad91))

## [1.15.0](https://github.com/zigordev/platform-ops/compare/v1.14.2...v1.15.0) (2026-09-08)


### Features

* **ingress:** route cv.zigordev.com to the cv web container ([#113](https://github.com/zigordev/platform-ops/issues/113)) ([bd678cf](https://github.com/zigordev/platform-ops/commit/bd678cf5cec791872d89e3c8f7e0b714fe981263))

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
