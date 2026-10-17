# Theta.Travel.Hatch（たびのたね）作業メモ

## APK を作ったら必ずチャットにリンクを出す（ユーザー指示 2026-10-17）

新しい APK をリリースしたら、最後の返信にスマホからそのままタップしてダウンロードできる**直リンク**を表示する。

- 直リンク：`https://github.com/kiwiman0706-beep/Theta.Travel.Hatch/releases/download/v<version>/tabi-no-tane-<version>.apk`
- リリースページ：`https://github.com/kiwiman0706-beep/Theta.Travel.Hatch/releases/tag/v<version>`
- 公開後に直リンクを実際にダウンロードし、SHA-256 が `releases/SHA256SUMS-<version>.txt` と一致することを確認してから貼る
- CI のデバッグ APK（Actions の artifact）はログインが必要でスマホから入れにくいので、インストール用リンクには使わない

## リリースの流れ

`docs/PUBLISHING.md` を参照。タグの push はこの環境のプロキシで拒否されるため、`releases/tabi-no-tane-<version>.apk` を含むコミットを push して `release-apk` ワークフローに Release を作らせる。署名鍵はリポジトリに入れない。
