const ja = {
  "app.nav.dashboard": "ダッシュボード",
  "app.nav.jobs": "出荷案件",
  "app.nav.documents": "書類管理",
  "app.adminPortal": "管理者ポータル",
  "app.theme.light": "ライトモードに切り替え",
  "app.theme.dark": "ダークモードに切り替え",
  "app.error.unknownSupabase": "Supabaseで不明なエラーが発生しました",

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

  "dashboard.kicker": "物流オペレーション",
  "dashboard.title": "出荷管理ダッシュボード",
  "dashboard.description":
    "顧客提供のExcelに合わせて、取引形態、BL/AWB番号、航路、書類準備状況を一元管理します。",
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
  "jobs.createDescription": "顧客提供のExcel列を基準に入力します。",
  "jobs.searchPlaceholder":
    "インボイス、荷主、荷受人、ルート、BL/AWB、書類で検索...",
  "jobs.filter.allStatus": "すべてのステータス",
  "jobs.filter.allTrade": "すべての取引",
  "jobs.filter.allTransport": "すべての輸送",
  "jobs.list": "案件一覧",
  "jobs.count": "{total}件中 {filtered}件",
  "jobs.noMatches": "現在の条件に一致する出荷案件はありません。",

  "documents.kicker": "書類チェックリスト",
  "documents.title": "書類管理",
  "documents.description":
    "顧客向け書類と社内用の経理・補助書類を分けて、顧客提供Excelに合わせて管理します。",
  "documents.customer": "顧客向け",
  "documents.internal": "社内",
  "documents.onHold": "保留中",
  "documents.pendingApproval": "承認待ち",
  "documents.approvedDownloads": "承認済みDL",
  "documents.searchPlaceholder":
    "書類、インボイス、荷主、荷受人、MBL/MAWB、HBL/HAWBで検索...",
  "documents.filter.all": "すべての書類",
  "documents.filter.customer": "顧客向け書類",
  "documents.filter.internal": "社内書類",
  "documents.register": "書類台帳",
  "documents.count": "追跡中の書類 {count}件",
  "documents.scope": "区分",
  "documents.approval": "承認状態",
  "documents.action": "操作",
  "documents.downloadLocked": "承認後にDL可能",
  "documents.internalOnly": "社内専用",
  "documents.noMatches": "現在の条件に一致する書類はありません。",
  "documents.approval.pending": "承認待ち",
  "documents.approval.approved": "承認済み",
  "documents.approval.rejected": "却下",

  "form.status": "ステータス",
  "form.tradeMode": "取引形態",
  "form.tradeTerm": "取引条件",
  "form.transportMode": "輸送形態",
  "form.invoice": "インボイス#",
  "form.shipper": "荷主",
  "form.consignee": "荷受人",
  "form.documentsPlaceholder": "入庫票・輸出許可書・請求書",
  "form.internalDocumentsPlaceholder": "DN・AN・振込証明",
  "form.notesPlaceholder": "運用メモ、顧客要望、通関状況など",

  "admin.dashboard": "管理ダッシュボード",
  "admin.dashboardDescription":
    "出荷案件、通関保留、書類対応状況を管理します。",
  "admin.operatorWorkflow": "オペレーター業務",
  "admin.operatorWorkflowDescription":
    "「出荷案件入力」から、Excel形式の新規案件作成や既存案件のステータス、BL/AWB日付、ルート、顧客向け/社内書類チェックリストを更新できます。",
  "admin.nav.dashboard": "ダッシュボード",
  "admin.nav.shipmentEntry": "出荷案件入力",
  "admin.workflowHint":
    "Excel基準の業務フロー: ステータス、取引形態、ルート、BL/AWB、書類を管理します。",
  "admin.entry.title": "出荷案件入力",
  "admin.entry.description": "Excelベースの出荷案件を作成・更新します。",
  "admin.entry.updateExisting": "既存案件を更新",
  "admin.entry.createNew": "新規作成",
  "admin.entry.findJob": "案件を検索",
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
  "admin.documents.approved": "書類を承認しました",
  "admin.documents.rejected": "書類を却下しました",
  "admin.documents.updateFailed": "書類承認の更新に失敗しました",

  "admin.login.title": "管理者ポータル",
  "admin.login.heading": "ログイン",
  "admin.login.username": "ユーザー名",
  "admin.login.password": "パスワード",
  "admin.login.invalid": "ユーザー名またはパスワードが正しくありません",
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
