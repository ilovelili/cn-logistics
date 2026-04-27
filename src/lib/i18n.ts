const ja = {
  "app.nav.dashboard": "ダッシュボード",
  "app.nav.jobs": "出荷案件",
  "app.nav.documents": "書類管理",
  "app.theme.light": "ライトモードに切り替え",
  "app.theme.dark": "ダークモードに切り替え",
  "app.error.unknownSupabase": "Supabaseで不明なエラーが発生しました",

  "login.tagline": "出荷管理ポータル",
  "login.portal": "ログイン",
  "login.heading": "ログイン",
  "login.invalid": "メールアドレスまたはパスワードが正しくありません",
  "login.submit": "ログイン",

  "profile.title": "プロフィール",
  "profile.email": "メール",
  "profile.avatar": "アバター",
  "profile.upload": "画像をアップロード",
  "profile.uploading": "アップロード中...",
  "profile.crop": "画像をトリミング",
  "profile.zoom": "ズーム",
  "profile.applyCrop": "保存",
  "profile.loadFailed": "プロフィールの読み込みに失敗しました",
  "profile.uploadFailed": "アバターの更新に失敗しました",

  "common.status": "ステータス",
  "common.trade": "取引",
  "common.tradeMode": "取引形態",
  "common.tradeTerm": "取引条件",
  "common.transport": "輸送",
  "common.transportMode": "輸送形態",
  "common.invoice": "インボイス#",
  "common.shipper": "荷主",
  "common.consignee": "荷受人",
  "common.parties": "荷主/荷受人",
  "common.route": "ルート",
  "common.documents": "書類",
  "common.internalDocuments": "社内書類",
  "common.blAwbDate": "BL/AWB日付",
  "common.notes": "メモ",
  "common.cancel": "キャンセル",
  "common.save": "保存",
  "common.saving": "保存中...",
  "common.create": "作成",
  "common.update": "更新",
  "common.download": "ダウンロード",
  "common.approve": "承認",
  "common.reject": "却下",
  "common.loadingJobs": "案件を読み込み中...",
  "common.loadingDocuments": "書類を読み込み中...",
  "common.noData": "データがありません。",
  "common.unset": "未設定",
  "common.admin": "管理者",
  "common.logout": "ログアウト",

  "status.underProcess": "処理中",
  "status.customsHold": "通関保留",
  "status.completed": "完了",
  "trade.export": "輸出",
  "trade.import": "輸入",
  "trade.triangle": "三国間",
  "transport.air": "航空",
  "transport.lcl": "LCL",
  "transport.fcl": "FCL",

  "dashboard.title": "出荷管理ダッシュボード",
  "dashboard.description":
    "取引形態、BL/AWB番号、航路、書類準備状況を一元管理します。",
  "dashboard.completionRate": "完了率",
  "dashboard.totalJobs": "案件数",
  "dashboard.statusPipeline": "ステータス別件数",
  "dashboard.tradeMix": "取引形態別",
  "dashboard.transportMix": "輸送形態別",
  "dashboard.recentJobs": "最近更新された案件",
  "dashboard.noJobs":
    "出荷案件がまだありません。最新マイグレーションを実行するか、管理画面から作成してください。",
  "dashboard.setup.title": "Supabaseの設定を確認してください",
  "dashboard.setup.body":
    "shipment_jobs / shipment_documents を読み込めませんでした。Supabase SQL Editorで最新マイグレーションを実行してから、画面を更新してください。",

  "jobs.title": "出荷案件",
  "jobs.description":
    "取引形態、輸送形態、BL/AWB番号、荷主/荷受人、ルート、書類チェックリストを管理します。",
  "jobs.new": "出荷案件を追加",
  "jobs.createTitle": "出荷案件を作成",
  "jobs.searchPlaceholder":
    "ID、インボイス、荷主、荷受人、ルート、BL/AWB、書類で検索...",
  "jobs.filter.allStatus": "すべてのステータス",
  "jobs.filter.allTrade": "すべての取引",
  "jobs.filter.allTransport": "すべての輸送",
  "jobs.list": "案件一覧",
  "jobs.count": "{total}件中 {filtered}件",
  "jobs.noMatches": "現在の条件に一致する出荷案件はありません。",
  "jobs.pagination.previous": "前へ",
  "jobs.pagination.next": "次へ",
  "jobs.pagination.pageSize": "表示件数",
  "jobs.pagination.summary": "{total}件中 {from}-{to}件を表示",
  "jobs.detail.title": "出荷案件詳細",
  "jobs.detail.close": "閉じる",
  "jobs.detail.shipment": "出荷情報",
  "jobs.detail.route": "ルート / BL",
  "jobs.detail.parties": "関係者",

  "documents.title": "書類管理",
  "documents.description":
    "顧客向け書類と社内用の経理・補助書類を分けて管理します。",
  "documents.customer": "顧客向け",
  "documents.internal": "社内",
  "documents.onHold": "保留中",
  "documents.pendingApproval": "承認待ち",
  "documents.approvedDownloads": "書類DL承認済み",
  "documents.searchPlaceholder":
    "ID、書類、インボイス、荷主、荷受人、MBL/MAWB、HBL/HAWBで検索...",
  "documents.filter.all": "すべての書類",
  "documents.filter.customer": "顧客向け書類",
  "documents.filter.internal": "社内書類",
  "documents.register": "書類台帳",
  "documents.count": "追跡中の書類 {count}件",
  "documents.scope": "区分",
  "documents.approval": "承認状態",
  "documents.downloadRequest": "DL申請",
  "documents.downloadRequestApplied": "承認中",
  "documents.downloadColumn": "DL",
  "documents.action": "操作",
  "documents.downloadLocked": "承認後にDL可能",
  "documents.internalOnly": "社内専用",
  "documents.noMatches": "現在の条件に一致する書類はありません。",
  "documents.approval.notRequested": "未申請",
  "documents.approval.pending": "DL申請",
  "documents.approval.approved": "承認済み",
  "documents.approval.rejected": "却下",

  "form.status": "ステータス",
  "form.tradeMode": "取引形態",
  "form.tradeTerm": "取引条件",
  "form.transportMode": "輸送形態",
  "form.invoice": "インボイス#",
  "form.shipper": "荷主",
  "form.consignee": "荷受人",
  "form.selectFiles": "ファイルを選択",
  "form.uploadHelp":
    "PDF、画像、Excelなどの書類ファイルをアップロードできます。",
  "form.existingFiles": "登録済み",
  "form.selectedFiles": "追加予定",
  "form.noFiles": "ファイルが選択されていません",
  "form.notesPlaceholder": "運用メモ、顧客要望、通関状況など",

  "admin.dashboard": "管理ダッシュボード",
  "admin.dashboardDescription":
    "出荷案件、通関保留、書類対応状況を管理します。",
  "admin.switch.selectUser": "ユーザーに切替",
  "admin.switch.backToAdmin": "管理画面に戻る",
  "admin.nav.dashboard": "ダッシュボード",
  "admin.nav.shipmentEntry": "出荷案件管理",
  "admin.nav.userRegistration": "ユーザー登録",
  "admin.entry.title": "出荷案件管理",
  "admin.entry.updateExisting": "既存案件を更新",
  "admin.entry.createNew": "新規作成",
  "admin.entry.findJob": "案件を検索",
  "admin.entry.filter.all": "すべて",
  "admin.entry.searchPlaceholder": "インボイス、荷主、荷受人、BL/AWB...",
  "admin.entry.untitledJob": "名称未設定の案件",
  "admin.entry.selectJob":
    "編集する出荷案件を選択してください。ステータス、BL/AWB、ルート、書類を更新できます。",
  "admin.entry.created": "出荷案件を作成しました",
  "admin.entry.updated": "出荷案件を更新しました",
  "admin.entry.createFailed": "出荷案件の作成に失敗しました",
  "admin.entry.updateFailed": "出荷案件の更新に失敗しました",
  "admin.documents.title": "書類承認",
  "admin.documents.description":
    "顧客向け書類は承認後にダウンロード可能になります。社内書類は管理者専用です。",
  "admin.documents.noDocuments": "この案件には書類が登録されていません。",
  "admin.documents.approved": "承認しました",
  "admin.documents.rejected": "書類を却下しました",
  "admin.documents.updateFailed": "書類承認の更新に失敗しました",

  "admin.userRegistration.title": "ユーザー登録",
  "admin.userRegistration.dashboard": "登録ユーザー一覧",
  "admin.userRegistration.newUser": "新規ユーザー作成",
  "admin.userRegistration.noUsers": "登録済みユーザーはまだありません。",
  "admin.userRegistration.noMatches":
    "現在の条件に一致するユーザーはありません。",
  "admin.userRegistration.count": "{count}件",
  "admin.userRegistration.searchPlaceholder":
    "ID、会社名、メール、郵便番号、住所、電話番号、担当者で検索...",
  "admin.userRegistration.email": "メールアドレス",
  "admin.userRegistration.companyName": "会社名",
  "admin.userRegistration.zipcode": "郵便番号",
  "admin.userRegistration.companyAddress": "会社住所",
  "admin.userRegistration.telephone": "電話番号",
  "admin.userRegistration.budget": "予算",
  "admin.userRegistration.budgetUnit": "万円",
  "admin.userRegistration.contactPerson": "担当者",
  "admin.userRegistration.notes": "備考",
  "admin.userRegistration.status": "ステータス",
  "admin.userRegistration.status.all": "すべてのステータス",
  "admin.userRegistration.status.toBeApproved": "承認待ち",
  "admin.userRegistration.status.approved": "承認済み",
  "admin.userRegistration.status.rejected": "却下",
  "admin.userRegistration.createdAt": "作成日",
  "admin.userRegistration.addressSearch": "住所検索",
  "admin.userRegistration.addressSearching": "検索中...",
  "admin.userRegistration.zipcodeLookupFailed":
    "郵便番号から住所を取得できませんでした",
  "admin.userRegistration.loadFailed":
    "登録済みユーザーの読み込みに失敗しました",
  "admin.userRegistration.created": "ユーザーを登録しました。承認待ちです。",
  "admin.userRegistration.createFailed": "ユーザー登録に失敗しました",
  "admin.userRegistration.updateFailed": "ユーザー情報の更新に失敗しました",

  "admin.login.title": "管理者ポータル",
  "admin.login.heading": "ログイン",
  "admin.login.username": "メール",
  "admin.login.password": "パスワード",
  "admin.login.invalid": "メールアドレスまたはパスワードが正しくありません",
  "admin.login.submitting": "ログイン中...",
  "admin.login.submit": "ログイン",
  "admin.login.back": "ダッシュボードに戻る",
  "admin.login.footer": "CN Logistics 管理システム - デモ環境",
} as const;

export type Locale = "ja";
export type TranslationKey = keyof typeof ja;

const translations: Record<Locale, typeof ja> = {
  ja,
};

let currentLocale: Locale = "ja";

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export function getLocale() {
  return currentLocale;
}

export function t(
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  let template: string = translations[currentLocale][key] ?? key;

  if (values) {
    Object.entries(values).forEach(([name, value]) => {
      template = template.split(`{${name}}`).join(String(value));
    });
  }

  return template;
}
