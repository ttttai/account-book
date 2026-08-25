# 機能モジュール

本番の機能コードは、このディレクトリ配下へ機能単位で配置する。

```text
src/modules/<feature>/
├── application/  # ユースケース、command、query
├── domain/       # 業務ルールと純粋な型・関数
├── infrastructure/ # Supabaseなど外部境界の実装
├── presentation/ # Server/Client Component、Server Action
└── index.ts       # 他機能へ公開する最小API
```

すべての機能で機械的に全階層を作らず、必要になった境界だけを追加する。別機能からは内部ファイルを直接importせず、公開`index.ts`を経由する。
