#!/bin/sh
# 2つのcommit間の変更が「アプリの挙動に影響しないドキュメントのみ」かを判定する。
# CI(重い検証ジョブのskip判定)とCD(deployのskip判定)の両方から呼ばれる共有scriptであり、
# 「何をドキュメント扱いするか」の定義はこのファイルだけに置く(INF-017)。
#
# 使い方: scripts/docs-only-diff.sh <base> <head>
# exit 0: ドキュメントのみの変更
# exit 1: アプリに影響しうる変更を含む、または判定不能(安全側)
#
# 注意: specs/**とAGENTS.mdは、architecture testが内容を検証する(ER図とmigrationの
# 一致確認など)ため、ドキュメント扱いにしない。変更時は通常どおり全CIを実行する。

set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <base> <head>" >&2
  exit 1
fi

# 差分が取れない場合(force pushで基点commitが消えた場合など)は安全側に倒す
changed_files=$(git diff --name-only "$1" "$2") || exit 1

# ファイル名の空白で誤分割しないよう、改行だけを区切りにする
IFS='
'
for file in $changed_files; do
  case "$file" in
    docs/*) ;;    # 運用ドキュメント
    README.md) ;; # ルートのREADME
    CLAUDE.md) ;; # エージェント向けエントリーポイント(AGENTS.mdへの参照のみ)
    *)
      # 上記以外が1つでも含まれる場合は「アプリに影響しうる変更」とする
      exit 1
      ;;
  esac
done

exit 0
