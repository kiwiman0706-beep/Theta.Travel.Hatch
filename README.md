# Theta.Travel.Hatch — TravelHatch

**TravelHatch**（旧称：たびのたね）は、「行ってみたい」を気軽に貯めて、雨・午後から・1泊などの条件で行き先を選び、旅のしおりから実際の思い出までを一続きで残す Android アプリです。

- 最新版：**0.1.1（versionCode 101）** — [GitHub Releases](https://github.com/kiwiman0706-beep/Theta.Travel.Hatch/releases/latest)（`TravelHatch-0.1.1.apk`）
- package：`jp.theta.travelhatch`／Android 9（API 28）以上
- 署名：APK Signature Scheme v3、証明書 SHA-256 `049ca448c59a75ad4e7202cefa0b0559b31b8a8eecca0a87dc622353c42a60c0`
- **実機での動作確認はまだです。** ロジックとUIはブラウザで自動テスト済みですが、Androidの実機・エミュレーターでは確認していません。最初に [実機確認チェックリスト](docs/REAL_DEVICE_CHECKLIST.md) を一巡してください。

## インストール

1. スマホで [**TravelHatch-0.1.1.apk をダウンロード**](https://github.com/kiwiman0706-beep/Theta.Travel.Hatch/releases/download/v0.1.1/TravelHatch-0.1.1.apk)（他の版は [Releases](https://github.com/kiwiman0706-beep/Theta.Travel.Hatch/releases)）
2. 「提供元不明のアプリ」のインストールを許可して開く
3. 2回目以降は**アンインストールせずに上書き**します（データは端末内に残ります）。0.1.0（「たびのたね」表示）からも上書きでそのまま更新できます

[Obtainium](https://github.com/ImranR98/Obtainium) を使う場合は、このリポジトリのURLを追加すると Releases の新しい版を検知できます。

## できること（0.1.x）

| 画面 | 内容 |
| --- | --- |
| ホーム | 「今からどこ行く？」の自然文入力（音声可）＋条件チップ（雨・午後から・1泊・子連れ・屋内）で、保存済みスポットと過去の訪問から候補を理由付きで提案。出発地の今日の天気（降水確率）を表示 |
| スポット | 行きたい／行った／両方 を色分けして**全スポットを1枚の地図**に表示（密集地点は件数でまとめる）。位置未確認のスポットは地図に置かず一覧で知らせる。一覧と検索 |
| しおり | 日帰り・宿泊の行程（日別・時刻・雨天代替・メモ）、車メモ／公共交通の**往路・復路の区間と乗換**（駅・路線・時刻・乗換余裕・切符メモ、乗換時間の自動計算）、**持ち物**（数量・担当・チェック・条件からの候補・定番リスト） |
| 思い出 | しおりから「行った記録にする」、計画外のおでかけも直接記録。日付・天気・満足度・費用・再訪希望・同行者・感想・写真。一覧／表／地図、検索と絞り込み（雨の日・また行きたい・★4以上・年） |
| 設定 | 出発地、ふだんの交通手段、提案の好み、地図（地理院タイル／OSM）、Gemini APIキー（任意）、JSONバックアップと復元、CSV書き出し、更新確認 |

共有メニューからURLやテキストを送ると「行きたい」の追加画面が開きます。Gemini のキーを設定すると、スポットの整理と旅程の下書きにAIを使えます（未設定でもテンプレートの下書きは作れます）。
実装範囲と未実装の範囲は [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) にまとめています。

## リポジトリ構成

| 場所 | 内容 |
| --- | --- |
| `source/` | Android Studio で開くプロジェクト（WebView＋Java のネイティブ層）。[source/README.md](source/README.md) |
| `source/app/src/main/assets/www/` | 画面とロジック（HTML/CSS/JavaScript）。ブラウザでも開ける |
| `source/web-tests/` | ロジックの単体テストとブラウザでのUIテスト |
| `releases/` | 配布済みの署名済みAPKとチェックサム（バイト列無改変） |
| `docs/handoff/` | 2026-10-17 の引き継ぎパック（要望原文・構想・モックアップ）をそのまま収録 |
| `docs/09_THETA_HATCH_PLAN.md` | Theta.xxx.Hatch シリーズ要件に合わせる次の構想 |
| `docs/PUBLISHING.md` | リリース手順と署名鍵の扱い |
| `.github/workflows/build.yml` | push ごとに単体テスト・UIテスト・Gradleビルド・Lint |
| `.github/workflows/release-apk.yml` | 同梱APKの署名証明書・package・versionを検証して Release を作成 |

## 最初に読む

1. [docs/handoff/requirements/user-requests.md](docs/handoff/requirements/user-requests.md)：ユーザー要望の原文（最優先）
2. [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)：受入条件ごとの実装状況
3. [docs/09_THETA_HATCH_PLAN.md](docs/09_THETA_HATCH_PLAN.md)：次の構想
4. [docs/PUBLISHING.md](docs/PUBLISHING.md)：リリース手順・署名鍵

## プライバシー

登録したスポット・しおり・思い出・写真は端末内にだけ保存されます。通信するのは、地図タイル（国土地理院またはOpenStreetMap）、位置検索（Nominatim・国土地理院）、天気（Open-Meteo）、Gemini（キーを設定して使ったときだけ、入力した文と条件を送信）、更新確認（GitHub）のときです。開発者のサーバーはありません。

## このリポジトリに入れていないもの

- 署名鍵（`travelhatch-release.jks`）とパスワード。公開リポジトリのためコミットしません。紛失すると既存アプリへ上書き更新できなくなります
- APIキー、個人の旅行記録・写真

## クレジット

地図：[国土地理院 地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)、© OpenStreetMap contributors。位置検索：Nominatim、国土地理院 住所検索API。天気：[Open-Meteo.com](https://open-meteo.com/)（CC BY 4.0）。ライブラリ：Leaflet（BSD-2-Clause）、Leaflet.markercluster（MIT）、AndroidX WebKit（Apache-2.0）。
