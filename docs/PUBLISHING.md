# リリース手順と署名鍵

## 署名鍵

- 0.1.0 から使う鍵：`travelhatch-release.jks`（alias `travelhatch`、RSA 4096、有効期限 100年）
- 証明書 SHA-256：`049ca448c59a75ad4e7202cefa0b0559b31b8a8eecca0a87dc622353c42a60c0`
- 鍵とパスワード（`SIGNING.env`）は**このリポジトリに入れません**（公開リポジトリのため。`.gitignore` で `*.jks`・`SIGNING*` を除外）。作成した会話でユーザーに直接渡しました。パスワード管理アプリや暗号化ストレージに保管してください
- **鍵を失うと、既にインストールされたアプリへ上書き更新できません**（別アプリとして入れ直し、JSONバックアップから復元することになります）

`release-apk` ワークフローは上記の証明書と一致するAPKしか公開しません。

## 手元でビルドしてリリースする（現在の方式）

```bash
cd source
# SIGNING.env の4項目を環境変数に設定（Windows PowerShell なら $env:TRAVEL_KEYSTORE_PATH="..." など）
export TRAVEL_KEYSTORE_PATH=/path/to/travelhatch-release.jks
export TRAVEL_STORE_PASSWORD=...
export TRAVEL_KEY_ALIAS=travelhatch
export TRAVEL_KEY_PASSWORD=...
./gradlew assembleRelease -PappVersionName=0.2.0     # versionCode は 0.2.0 → 200 を自動計算
cp app/build/outputs/apk/release/app-release.apk ../releases/tabi-no-tane-0.2.0.apk
cd ../releases && sha256sum tabi-no-tane-0.2.0.apk > SHA256SUMS-0.2.0.txt
```

1. `source/app/build.gradle` の既定 `appVersionName` を新しい版に更新
2. 上の手順で `releases/tabi-no-tane-<version>.apk` と `SHA256SUMS-<version>.txt` を作る
3. `docs/release-notes/v<version>.md` を書き、`CHANGELOG.md` に追記してコミット・push
4. `releases/*.apk` を含むコミットを push すると **release-apk** が自動で走り、`build.gradle` の `appVersionName` から `v<version>` の Release を作ります（同じタグの Release が既にあれば何もしません）。手動なら Actions → **release-apk** → Run workflow（`version` に `v<version>`）、またはタグ `v<version>` の push でも可。`v0.2.0-beta.1` のように `-` を含むとプレリリース（アプリの「ベータ版も含む」で検知）

versionCode は `major*10000 + minor*100 + patch` です。必ず前の版より大きくなるようにしてください。

## 今後：CI で署名まで行う（docs/09_THETA_HATCH_PLAN.md Phase 1）

リポジトリの Settings → Secrets and variables → Actions に次を登録すると、タグから CI でビルド・署名・公開できるようにする予定です。

| Secret | 中身 |
| --- | --- |
| `TRAVEL_KEYSTORE_B64` | `base64 -w0 travelhatch-release.jks`（Windows: `certutil -encode` の本文） |
| `TRAVEL_STORE_PASSWORD` | SIGNING.env の値 |
| `TRAVEL_KEY_ALIAS` | `travelhatch` |
| `TRAVEL_KEY_PASSWORD` | SIGNING.env の値 |
