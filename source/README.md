# たびのたね — Android プロジェクト

Android Studio で **この `source/` フォルダ** を開いてください。

## 構成

```
app/src/main/
  java/jp/theta/travelhatch/
    MainActivity.java   WebView のホスト、システムバー余白、戻る操作、共有インテント、各種インテントの結果
    NativeBridge.java   window.TabiNative：端末内保存（JSON）、HTTPS通信、音声入力、写真取り込み、ファイル書き出し/読み込み
  assets/www/
    index.html, styles.css
    js/core.js          データモデル・移行・提案・下書き・CSV など（DOMなし、Node でテスト）
    js/native.js        TabiNative の Promise ラッパー。ブラウザでは localStorage / fetch にフォールバック
    js/app.js           画面
    vendor/             Leaflet 1.9.4、Leaflet.markercluster 1.5.3
```

画面は `https://appassets.androidplatform.net/assets/www/index.html`（AndroidX WebViewAssetLoader）で配信し、写真は `/photos/` からアプリ専用領域を読みます。外部通信はネイティブ側の `http()` を通します（User-Agent 付与、HTTPS のみ）。

## ビルド

- JDK 17 以上、Android SDK Platform 35
- `./gradlew assembleDebug`（Windows は `gradlew.bat assembleDebug`）
- リリース署名は環境変数で渡します。[../docs/PUBLISHING.md](../docs/PUBLISHING.md)

## テスト

```bash
node --test web-tests/*.test.js             # ロジック単体テスト
# Playwright が入っていれば（npm i -g playwright / npx playwright install chromium）
node web-tests/ui-smoke.cjs [スクショ保存先]  # ブラウザで画面の流れを確認
node web-tests/bridge-smoke.cjs              # Android ブリッジの呼び出し規約を確認
```

画面だけなら `assets/www/index.html` をブラウザで開いても動きます（保存は localStorage、写真・音声は不可）。

## データ形式

`files/tabi-data.json`（schema 1）。`spots` / `plans`（`stops`・`legs`・`packing` を内包）/ `visits` / `packTemplates` / `settings` / `weather`。読み込み時は `core.migrate()` で必ず正規化します。形式を変えるときは `SCHEMA` を上げ、`migrate()` に旧形式からの変換を追加してください。
