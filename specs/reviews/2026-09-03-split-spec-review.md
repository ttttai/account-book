# 仕様レビュー記録を1レビュー1ファイルへ分割し、連番IDを廃止する

状態: 実装確認済み
レビュー日: 2026-09-03
ブランチ: docs/split-spec-review
対象仕様: `specs/README.md`、`specs/09-spec-review.md`、`specs/reviews/README.md`、`AGENTS.md`
関連ID: 追加なし（`NFR-MNT-*`の運用ルールに関わる文書変更）

## 指摘

並列開発で`specs/`が毎回コンフリクトする。直近2か月の変更回数は`09-spec-review.md`が74回、`README.md`が56回で、他の仕様ファイルより突出している。原因は次の2点である。

- `09-spec-review.md`は全ブランチが同じ末尾へ`R-0xx`項目を追記する単一ログで、内容が独立していても同じ行で衝突する。連番は先にmainへ入った方が正になるため、後続は番号の付け替えも必要になる。実際に`R-075`が第3節の途中（第4節の直前）に挿入され、第2節のID件数段落が`R-077`まで言及する一方で本文の順序が崩れている。
- 第2節の「要件ID n件、受け入れ条件ID m件」の段落を`tests/architecture/foundation.test.mjs`が検証しているため、IDを追加する全PRが同じ1文を書き換える。

## 対応

- `specs/reviews/`を新設し、以降の仕様レビューは`YYYY-MM-DD-<slug>.md`の1レビュー1ファイルで記録する。レビューIDはファイル名とし、連番を採番しない。運用ルールは`specs/reviews/README.md`に置く。
- `09-spec-review.md`は`R-001`〜`R-077`の記録として凍結し、冒頭に案内を追加する。既存項目の移動や番号の付け替えは行わない。
- ID件数の段落は0.3.12時点で凍結し、architecture testからは件数の一致確認を外して一意性の検証のみ残す。新規IDは各レビューファイルの`関連ID`に記録する。
- `AGENTS.md`の手順3と必読資料、`specs/README.md`の手順・承認条件・仕様書一覧、`docs/operations/e2e-tests.md`、`specs/11-production-infrastructure.md`、`specs/12-analytics-and-reporting.md`の参照先を`specs/reviews/`へ更新する。
- `tests/architecture/spec-reviews.test.mjs`を追加し、ファイル名形式・必須項目・`09-spec-review.md`への`R-078`以降の追記禁止を検証する。

## 安全性確認

文書とarchitecture testのみの変更で、production code、DB、RLS、認可、金額計算には影響しない。IDの一意性検証は残るため、要件ID・受け入れ条件IDの重複を検出する能力は変わらない。件数の一致確認を外すことで失う保証は「レビュー文書に書かれた件数が実際と一致すること」だけであり、件数そのものは仕様ファイルから機械的に導ける。

## 実装可能性確認

既存のarchitecture test（`startup-loading`が`### R-077`、`analytics-overview`が`### R-068`を参照）は`09-spec-review.md`の既存内容を読むため、凍結後も通る。新しいレビューを対象にするtestは`specs/reviews/<id>.md`を読む。新規ファイルは各ブランチで名前が異なるため、`specs/reviews/`配下でコンフリクトは発生しない。`specs/README.md`の仕様書一覧は本変更で1行追加するだけで、以後のレビュー追加では触らない。

## MVP範囲確認

機能横断ファイル（`02`・`03`・`07`）の機能別分割、`.gitattributes`による`merge=union`、`git rerere`の有効化は本変更に含めない。既存の`R-001`〜`R-077`を個別ファイルへ移す作業も行わない（過去の参照を壊すだけで衝突の軽減には寄与しない）。

## 判定

本変更は`AGENTS.md`の「同じファイルを複数のworktreeで同時に変更しない」原則と、開発手順の順序（仕様 → レビュー → テスト → 実装 → 検証）を変えずに整合する。`tests/architecture/spec-reviews.test.mjs`を先に追加し、`npm test`・lint・型検査が通る条件で承認する。UIを変えないため実画面確認は不要とする。

## 実装確認

`specs/reviews/README.md`と本ファイルを追加し、`09-spec-review.md`の冒頭と第2節へ凍結の案内を追記した。`AGENTS.md`・`specs/README.md`・`docs/operations/e2e-tests.md`・`specs/11`・`specs/12`の参照先を`specs/reviews/`へ更新した。`tests/architecture/spec-reviews.test.mjs`（3件）を追加し、`foundation.test.mjs`のID件数一致確認を一意性確認だけに変更した。architecture test 139件（うち新規3件）、vitest 639件、biome lintが成功した。`tsc --noEmit`は`@playwright/test`未インストールの環境要因による`tests/e2e/support/`の既存3件のみで、本変更に起因するエラーはない。UI変更がないため実画面確認は行っていない。
