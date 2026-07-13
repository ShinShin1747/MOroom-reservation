MOroom-reservation v13 更新手順

【重要】
ファイル名は変更していません。ZIP内は元と同じ6ファイルだけです。
「不明な操作です。」を防ぐため、Apps Scriptを先に更新してからGitHubを更新してください。

==================================================
1. Google Apps Scriptを更新
==================================================
1) 予約用Googleスプレッドシートを開く
2) 拡張機能 → Apps Script
3) エディタ内の既存コードをすべて削除
4) apps_script_backend.gs の内容をすべて貼り付け
5) 自動保存されたことを確認
6) 関数一覧から setupSharedSheets を選び、1回実行
   - AdminNotices
   - FacilitySchedules
   の2シートが作成されます
   ※ Reservationsと既存予約データは削除されません
7) 右上「デプロイ」→「デプロイを管理」
8) 使用中デプロイの鉛筆マークを押す
9) バージョンで「新バージョン」を選択
10) 「デプロイ」を押す

コードを保存しただけでは公開中Webアプリは更新されません。
必ず「新バージョン」で再デプロイしてください。

==================================================
2. GitHubを更新
==================================================
GitHubリポジトリの同名ファイルを、ZIP内のファイルで上書きしてCommitしてください。

- index.html
- script_v7_timeline.js
- style_v7_timeline.css
- config.js

config.jsには、従来のWebアプリURLを設定しています。
https://script.google.com/macros/s/AKfycbxTd9kicJntO5cFSS5PEjqvBUynzUDypma4hVE1SoIBhvr8PqxLCNV4560kE8_dhwJA/exec

Apps Scriptの「デプロイを管理」に表示されるURLが異なる場合だけ、config.jsのAPI_URLをそのURLに置き換えてください。

==================================================
3. 表示を更新
==================================================
GitHubへCommit後、予約サイトを開いて Ctrl + F5 を押してください。

追加機能:
- 管理室からの連絡
  - 通常／重要／緊急
  - 掲載期間
  - 重要・緊急は予約表上部にも表示
  - 登録、変更、削除

- 付帯設備メンテ・ガス交換
  - 月間カレンダー
  - 月移動、月選択
  - 複数日予定
  - 登録、変更、削除

データ保存先:
- 予約: Reservations
- 管理室連絡: AdminNotices
- 付帯設備予定: FacilitySchedules

トラブル情報共有の専用欄は追加していません。既存のメール内容機能を使用します。
