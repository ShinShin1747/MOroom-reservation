# 装置予約システム（GitHub Pages用）

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


## 日本語版について

この版では、画面上の主要な表示を日本語化しています。
GitHub Pagesに反映するには、このフォルダ内のファイルを既存リポジトリへ上書きアップロードしてください。

### 上書きアップロードするファイル

- `index.html`
- `style.css`
- `script.js`
- `config.js`
- `apps_script_backend.gs`
- `README.md`
- `.nojekyll`

アップロード後、GitHubで `Commit changes` を押すと数分で反映されます。


## 変更点

この版では以下を反映しています。

- 画面表示を日本語化
- 予約フォームに「使用時間」欄を追加
- 使用時間は開始・終了時刻から自動入力されます
- 手入力で「2時間」「終日」などに修正できます
- 予約表と予約一覧にも使用時間を表示します

既にGoogle Sheets連携を設定済みの場合は、`apps_script_backend.gs` も新しいものに差し替えてください。旧版のシートを使っている場合でも、初回アクセス時に `usageTime` 列を自動追加するようにしています。
