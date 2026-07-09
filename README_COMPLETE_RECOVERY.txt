MOroom COMPLETE RECOVERY

GitHubのMOroom-reservation直下に入れるファイル:
1. index.html
2. config.js
3. script_v6_timeline.js
4. style_v6_timeline.css

重要:
- index.html は必ず完全上書きしてください。
- script_v5.js / style_v5.css は残っていてもOKです。この版の index.html は v6 ファイルを読みます。
- Apps Script側は、表示修正だけなら触らなくてOKです。

表示仕様:
- 全体表示 / メンテ情報 / メール内容では予約フォームと予約一覧を非表示。
- 全体表示は縦軸=時間、横軸=曜日。
- 全体表示のブロック内は装置名だけ。
- メンテ情報も縦軸=時間、横軸=曜日。
- 14:00-17:00 の予約はその時間分だけ縦に伸びます。
- 同じ時間帯で違う装置が重なる場合は横並び。
- 装置ごとに色分け。

反映手順:
1. GitHubで index.html を完全上書き
2. config.js を完全上書き
3. script_v6_timeline.js を追加または上書き
4. style_v6_timeline.css を追加または上書き
5. Commit changes
6. 2〜3分待つ
7. Ctrl + F5
