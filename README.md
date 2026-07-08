# Equipment Reservation for GitHub Pages

GitHub Pagesで公開できる、HTML/CSS/JavaScriptだけの装置予約サイトです。

## ファイル構成

- `index.html`: 画面本体
- `style.css`: デザイン
- `script.js`: 予約処理
- `config.js`: 装置名とAPI URLの設定
- `apps_script_backend.gs`: Google Sheetsに保存するためのGoogle Apps Script

## 重要

`config.js` の `API_URL` が空欄のままだと、予約データは各ブラウザの localStorage に保存されます。
この場合、自分のPCでは動作確認できますが、他の人とは予約データが共有されません。

研究室メンバー全員で同じ予約表を使う場合は、Google Apps Script + Google Sheets を設定してください。

## GitHub Pagesで公開する方法

1. GitHubで新しいリポジトリを作る
2. このフォルダ内のファイルをアップロードする
3. GitHubのリポジトリで `Settings` → `Pages`
4. `Build and deployment` の Source を `Deploy from a branch` にする
5. Branch を `main`、Folder を `/root` にして Save
6. 数分後に `https://ユーザー名.github.io/リポジトリ名/` で開ける

## Google Sheets共有バックエンドの作り方

1. Google Driveで新しいスプレッドシートを作る
2. スプレッドシートで `拡張機能` → `Apps Script`
3. `apps_script_backend.gs` の中身を貼り付ける
4. 保存する
5. 関数選択で `setup` を選び、1回実行する
6. 権限確認が出たら許可する
7. `デプロイ` → `新しいデプロイ`
8. 種類を `ウェブアプリ` にする
9. 次のように設定する
   - 次のユーザーとして実行: 自分
   - アクセスできるユーザー: 全員
10. デプロイして Web App URL をコピーする
11. `config.js` の `API_URL` に貼る

例:

```js
const API_URL = "https://script.google.com/macros/s/xxxxx/exec";
```

12. 変更した `config.js` をGitHubにアップロードする

## 装置名の変更

`config.js` の `EQUIPMENTS` を編集してください。

```js
const EQUIPMENTS = [
  "MOVPE",
  "ICP-RIE",
  "RTA"
];
```

## 注意

- Edit/Deleteには、予約作成時に入力したPassが必要です。
- PassはGoogle Sheetsにはハッシュ化して保存します。
- 本格運用では、管理者ログイン・利用者ログインを追加した方が安全です。
