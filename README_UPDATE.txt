MOroom予約サイト 月曜・金曜 自動予定メール対応版

追加内容
・毎週月曜日の8:00前後に「今週」の月曜日～日曜日の予定を自動送信
・毎週金曜日の8:00前後に「次週」の月曜日～日曜日の予定を自動送信
・宛先：mousers@googlegroups.com
・メール本文に全装置の週間予定表を表示
・付帯設備メンテ・ガス交換予定も表示
・同内容のPDFを添付
・予約がない場合も送信
・月曜メールと金曜メールを別々に二重送信防止
・テスト送信先：ito.shin.z0@s.mail.nagoya-u.ac.jp

件名
月曜日：
【MO連絡網】今週のMOVPE使用予定（M/D～M/D）

金曜日：
【MO連絡網】次週のMOVPE使用予定（M/D～M/D）

反映手順
1. ib.nagoyau@gmail.com で現在使用中のApps Scriptを開く
2. apps_script_backend.gs の内容でコードを全置換
3. 自動保存を確認
4. authorizeWeeklyScheduleEmail を1回実行し、必要な権限を許可
5. installWeeklyScheduleEmailTrigger を1回実行
   ※古い月曜・金曜トリガーを削除して、次の2件を作成します。
   ・sendCurrentWeekScheduleEmailScheduled：毎週月曜日 8:00前後
   ・sendNextWeekScheduleEmailScheduled：毎週金曜日 8:00前後
6. 左側の時計マーク「トリガー」を開き、上記2件を確認
7. デプロイ → デプロイを管理 → 鉛筆 → 新バージョン → デプロイ
8. 旧アカウント tg22shin@gmail.com 側に古いトリガーが残っている場合は削除

安全なテスト
・sendCurrentWeekScheduleTestEmail
  今週の予定を ito.shin.z0@s.mail.nagoya-u.ac.jp のみに送信

・sendNextWeekScheduleTestEmail
  次週の予定を ito.shin.z0@s.mail.nagoya-u.ac.jp のみに送信

本番への手動送信
・sendCurrentWeekScheduleEmail
  今週の予定を mousers@googlegroups.com へ送信

・sendNextWeekScheduleEmail
  次週の予定を mousers@googlegroups.com へ送信

注意
・installWeeklyScheduleEmailTrigger を実行したGoogleアカウントが送信元になります。
・setup の再実行は不要です。
・GitHub側の更新は不要です。
