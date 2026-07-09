全体表示タブがブラウザに出ない場合のキャッシュ対策版です。

GitHubに上書きするファイル:
- index.html
- script_v5.js
- style_v5.css
- config.js

Apps Script側:
- 既に動いているなら貼り替え不要。
- 必要なら apps_script_backend.gs をApps Scriptに貼り、setup()は押さずに新バージョンでデプロイしてください。

ポイント:
index.html の script 読み込みを
config.js?v=overall-cachefix-20260709
script_v5.js?v=overall-cachefix-20260709
にして、古いJSキャッシュを強制的に回避します。
