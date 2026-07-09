MOroom メール内容タブ追加版

変更内容:
- 上部の装置タブに「メール内容」を追加。
- 「メール内容」タブで users_movpe7@googlegroups.com 宛てに届いたGmail/Google Groupsメールを一覧表示。
- 予約候補として扱わず、予約フォームへのコピーや自動登録はしない。
- 表示項目: 受信日時、送信者、宛先、件名、まとめ、本文全文、Gmailで開くリンク。

GitHubに上書きするファイル:
- index.html
- script_v5.js
- style_v5.css
- config.js

Google Apps Script側に貼るファイル:
- apps_script_backend.gs

Apps Script手順:
1. Googleスプレッドシートを開く
2. 拡張機能 → Apps Script
3. 今のコードを全部消す
4. apps_script_backend.gs の中身を全部貼る
5. 保存
6. setup() は押さない
7. デプロイ → デプロイを管理 → 鉛筆マーク → バージョン: 新バージョン → デプロイ
8. Gmail権限の許可が出たら許可する

注意:
- Apps ScriptをデプロイしたGoogleアカウントのGmailに、users_movpe7@googlegroups.com 宛てのメールが届いている必要があります。
- 公開サイトを見られる人は「メール内容」も見られます。保護したい場合は apps_script_backend.gs の EMAIL_VIEW_PASSWORD にパスワードを入れてください。
- Gmail検索は最新1000件まで取得する設定です。必要なら EMAIL_MAX_MESSAGES を増やせますが、Apps Script/Gmailの制限に注意してください。
