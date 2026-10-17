# たびのたね — 旅行計画・おでかけ記録アプリ 引き継ぎパック

作成: 2026-10-17

このZIPは、別の会話でAndroid APKの開発を始めるための現時点の資料一式です。

## 最初に読む順番

1. `requirements/user-requests.md` — ユーザーが実際に出した要望と発言の時系列
2. `handoff/STATUS.md` — 完成済みのもの、未実装のもの、モックアップの制約
3. `requirements/travel-app-concept-v0.1.md` — これまでにまとめた構想の原本
4. `requirements/implementation-spec.md` — APK化に向けた整理と受入条件
5. `mockup/tabi-no-tane-portable.html` — ブラウザーで直接開ける操作可能なモックアップ
6. `mockup/source/travel-mockup-fragment.html` — モックアップの編集用HTML/CSS/JavaScript
7. `handoff/NEXT_THREAD_PROMPT.md` — 新しい会話に添える文章

`mockup/archive/tabi-no-tane-original-snapshot.html` は前の会話で渡したHTMLの保存版です。`portable.html` はそこから画面本体を取り出した軽量版で、見た目と操作の確認に使えます。デモデータはサンプルです。

## 現在の到達点

要件整理と操作可能な画面モックアップまで。Androidのプロジェクト、APK、Gemini・地図・天気・交通APIの実接続はこのZIPにありません。モックアップの入力状態はページを閉じると消えます。新しい会話ではこの状態から実装を始めてください。

## 優先関係

ユーザーの明示的な発言を最優先とします。構想メモや実装仕様は提案を含み、技術選択の確定ではありません。実際のAPI仕様、利用料金、規約は開発時点で公式資料を再確認してください。

## ファイルの確認

`manifest.json` に各ファイルのSHA-256を記録しています。APIキー、認証情報、個人の旅行履歴は含めていません。
