MOroom-reservation v12 更新手順

【ファイル名について】
既存のファイル名は変更していません。新しいファイルも追加していません。
GitHub上の同名ファイルを、そのまま上書きしてください。

GitHubへ上書きするファイル:
- index.html
- script_v7_timeline.js
- style_v7_timeline.css
- config.js

※ config.js のAPI URLは、アップロード時の内容をそのまま保持しています。

Apps Script:
1. Googleスプレッドシートを開く
2. 拡張機能 → Apps Script
3. 既存コードを apps_script_backend.gs の内容で全置換
4. 保存
5. 関数一覧から setupSharedSheets を1回実行
   - AdminNotices シート
   - FacilitySchedules シート
   が作成されます。
   - Reservations シートと既存予約データは削除されません。
6. デプロイ → デプロイを管理 → 鉛筆 → 新バージョン → デプロイ
7. Gmailまたはスプレッドシートの権限を求められた場合は許可

追加した機能:
1. 管理室からの連絡
   - タイトル
   - 連絡内容
   - 対象（全体／特定装置／付帯設備）
   - 重要度（通常／重要／緊急）
   - 掲載開始日／掲載終了日
   - 投稿者
   - 管理パスワード
   - 重要・緊急の掲載中連絡は、予約画面上部にも表示
   - 登録済み連絡をクリックして変更・削除可能

2. 付帯設備メンテ・ガス交換
   - 月間カレンダー表示
   - 前月／今月／次月／月選択
   - 付帯設備メンテとガス交換を区分表示
   - 複数日にまたがる予定にも対応
   - カレンダー上の予定をクリックして変更・削除可能

データ保存先:
- 予約: Reservations
- 管理室連絡: AdminNotices
- 付帯設備予定: FacilitySchedules

トラブル情報共有の専用欄は追加していません。既存のメール内容機能を使用します。
