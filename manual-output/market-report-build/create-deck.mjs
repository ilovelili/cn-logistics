import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT =
  "/Users/min/Projects/cn-logistics/manual-output/CN_Logistics_追跡システム市場性レポート_2026.pptx";
const PREVIEW =
  "/Users/min/Projects/cn-logistics/manual-output/market-report-build/rendered";
const FONT = "Hiragino Sans";
const C = {
  ink: "#111111",
  muted: "#555B66",
  panel: "#F1F2F4",
  rule: "#B8BCC4",
  blue: "#1677D2",
  pale: "#DDF0FF",
  white: "#FFFFFF",
  red: "#C44A45",
};
const sources = {
  meti: "https://www.meti.go.jp/press/2025/08/20250826005/20250826005.html",
  mlitParcel: "https://www.mlit.go.jp/report/press/jidosha04_hh_000341.html",
  mlitAct:
    "https://www.mlit.go.jp/seisakutokatsu/freight/seisakutokatsu_freight_mn1_000034.html",
  mlitCapacity:
    "https://www.mlit.go.jp/hakusyo/mlit/r06/hakusho/r07/html/n1112000.html",
  cnJapan: "https://www.cnlogistics.co.jp/index.html",
  cnAnnual:
    "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0424/2026042402454.pdf",
};

function box(slide, x, y, w, h, fill = C.panel, line = "none", radius = false) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: line === "none" ? 0 : 1 },
  });
}

function text(slide, value, x, y, w, h, size = 24, opts = {}) {
  const s = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  s.text = value;
  s.text.style = {
    fontSize: size,
    typeface: FONT,
    color: opts.color || C.ink,
    bold: !!opts.bold,
    alignment: opts.align || "left",
    verticalAlignment: opts.valign || "top",
    autoFit: opts.autoFit || "shrinkText",
  };
  return s;
}

function rule(slide, x, y, w, color = C.rule, weight = 1) {
  return slide.shapes.add({
    geometry: "straightConnector1",
    position: { left: x, top: y, width: w, height: 0 },
    fill: "none",
    line: { style: "solid", fill: color, width: weight },
  });
}

function title(
  slide,
  heading,
  page,
  eyebrow = "CN LOGISTICS JAPAN｜MARKET REPORT 2026",
) {
  text(slide, eyebrow, 42, 28, 650, 22, 13, { bold: true, color: C.muted });
  text(slide, heading, 42, 56, 1140, 74, 36, { bold: true });
  text(slide, String(page).padStart(2, "0"), 1180, 666, 56, 18, 12, {
    align: "right",
    color: C.muted,
  });
}

function notes(slide, urls, method = "") {
  const lines = ["[Sources]", ...urls.map((u) => `- ${u}`)];
  if (method) lines.push("", "[Method]", method);
  slide.speakerNotes.textFrame.setText(lines.join("\n"));
  slide.speakerNotes.setVisible(true);
}

const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });

// 1 Cover — Codex Grid slide-01 silhouette
{
  const s = p.slides.add();
  s.background.fill = C.white;
  text(s, "CN LOGISTICS JAPAN", 42, 36, 500, 42, 22, {
    bold: true,
    color: C.blue,
  });
  text(s, "追跡システムは\nどこまで売上をつくれるか", 42, 175, 1030, 250, 62, {
    bold: true,
  });
  text(
    s,
    "物流可視化・書類ワークフローの市場性と3年間の収益シナリオ",
    42,
    500,
    900,
    80,
    26,
  );
  text(s, "2026年8月｜公開情報に基づく事業仮説", 42, 620, 650, 28, 15, {
    color: C.muted,
  });
  notes(s, [sources.cnJapan, sources.cnAnnual]);
}

// 2 Executive summary — three strong takeaways
{
  const s = p.slides.add();
  title(s, "結論：追跡は「機能」より、契約を強くする営業基盤になる", 2);
  const items = [
    [
      "需要",
      "ECと越境取引は増加が続く。荷主は輸送状況と書類を同じ場所で確認したい。",
    ],
    [
      "収益",
      "月額利用料だけでなく、物流契約の継続・追加受注・運用工数削減まで含めて評価する。",
    ],
    [
      "判断",
      "3年目の直接売上は0.32〜1.70億円の仮説。まず10社で価格と利用率を検証する。",
    ],
  ];
  items.forEach(([h, b], i) => {
    const x = 42 + i * 403;
    box(s, x, 200, 368, 330, i === 2 ? C.pale : C.panel);
    text(s, h, x + 28, 226, 310, 42, 23, { bold: true, color: C.blue });
    text(s, b, x + 28, 292, 310, 164, 25, { bold: true });
    text(s, `0${i + 1}`, x + 28, 486, 80, 32, 16, { color: C.muted });
  });
  text(
    s,
    "売上試算はCN Logistics Japanの実績値ではなく、料金・導入社数・出荷量を置いた事業仮説。",
    42,
    608,
    1100,
    32,
    16,
    { color: C.muted },
  );
  notes(
    s,
    [sources.meti, sources.cnJapan],
    "市場統計と公開サービス情報を基にした経営向け要約。収益数値は後段の仮定モデル。 ",
  );
}

// 3 market signals — three stats
{
  const s = p.slides.add();
  title(s, "市場は拡大。ただし勝負は「荷物の数」ではなく、情報の扱いやすさ", 3);
  const stats = [
    ["26.1兆円", "国内BtoC-EC市場", "2024年、前年比+5.1%"],
    ["50.3億個", "国内宅配便取扱個数", "2024年度、前年比+0.5%"],
    ["2.64兆円", "中国消費者の日本向け越境EC購入", "2024年、前年比+8.5%"],
  ];
  stats.forEach(([v, l, d], i) => {
    const x = 42 + i * 403;
    text(s, v, x, 192, 365, 82, 44, { bold: true, color: C.blue });
    rule(s, x, 286, 350, C.ink, 2);
    text(s, l, x, 310, 350, 58, 21, { bold: true });
    text(s, d, x, 390, 350, 44, 17, { color: C.muted });
  });
  box(s, 42, 500, 1170, 92, C.panel);
  text(
    s,
    "取扱量が伸びるほど、問い合わせ・書類確認・例外対応も増える。追跡画面は、その増加を人員増だけで受け止めないための仕組みになる。",
    70,
    526,
    1110,
    48,
    20,
    { bold: true },
  );
  notes(
    s,
    [sources.meti, sources.mlitParcel],
    "金額・個数は各省公表値。2.64兆円は中国消費者が日本事業者から購入した越境EC額（2024年）。",
  );
}

// 4 regulatory and operations pressure
{
  const s = p.slides.add();
  title(
    s,
    "法対応と人手不足で、荷主との情報共有は「あると便利」ではなくなる",
    4,
  );
  text(s, "2024", 58, 215, 150, 48, 30, { bold: true, color: C.blue });
  text(s, "時間外労働規制\n輸送力不足への対応", 58, 275, 265, 95, 22, {
    bold: true,
  });
  rule(s, 180, 240, 780, C.ink, 2);
  text(s, "2025", 415, 215, 150, 48, 30, { bold: true, color: C.blue });
  text(s, "荷主・物流事業者に\n物流効率化の努力義務", 415, 275, 300, 95, 22, {
    bold: true,
  });
  text(s, "2026", 820, 215, 150, 48, 30, { bold: true, color: C.blue });
  text(s, "一定規模以上は\n中長期計画・定期報告", 820, 275, 310, 95, 22, {
    bold: true,
  });
  box(s, 42, 475, 570, 128, C.panel);
  text(s, "記録が残る", 70, 500, 220, 32, 22, { bold: true });
  text(
    s,
    "進捗・書類・承認履歴が、顧客説明と社内確認の共通記録になる。",
    70,
    540,
    500,
    50,
    18,
  );
  box(s, 642, 475, 570, 128, C.pale);
  text(s, "例外を早く見つける", 670, 500, 250, 32, 22, {
    bold: true,
    color: C.blue,
  });
  text(
    s,
    "遅延や書類不足を一覧化し、担当者が追うべき案件を絞れる。",
    670,
    540,
    500,
    50,
    18,
  );
  notes(
    s,
    [sources.mlitAct, sources.mlitCapacity],
    "国交省は、対策を講じない場合の輸送力不足を2024年度約14%、2030年度約34%とした。一方、2024年度分は官民対策で概ね解消したと説明している。",
  );
}

// 5 customer workflow
{
  const s = p.slides.add();
  title(s, "顧客が困るのは「今どこか」より、次に何をすべきか分からない時", 5);
  const steps = [
    ["集荷", "受付済みか"],
    ["輸送", "遅れはあるか"],
    ["通関", "追加書類は何か"],
    ["配送", "いつ届くか"],
    ["完了", "証憑はどこか"],
  ];
  rule(s, 88, 300, 1050, C.rule, 3);
  steps.forEach(([h, b], i) => {
    const x = 60 + i * 235;
    box(s, x, 260, 36, 36, C.blue, "none", true);
    text(s, String(i + 1), x, 266, 36, 22, 15, {
      bold: true,
      align: "center",
      color: C.white,
    });
    text(s, h, x, 330, 180, 36, 22, { bold: true });
    text(s, b, x, 375, 180, 52, 18, { color: C.muted });
  });
  box(s, 42, 510, 1170, 92, C.panel);
  text(
    s,
    "追跡・書類・承認を別々に探す状態では、問い合わせが減らない。案件単位で「状況・不足・次の行動」を並べることが価値になる。",
    70,
    535,
    1110,
    48,
    20,
    { bold: true },
  );
  notes(
    s,
    [sources.cnJapan],
    "CN Logistics Japanが掲げる国際輸送・通関・配送・3PLのワンストップ提供を、顧客接点の業務フローに置き換えた整理。",
  );
}

// 6 opportunity map
{
  const s = p.slides.add();
  title(s, "追跡システムが生む機会は、売上・継続・生産性の3層にある", 6);
  const rows = [
    ["直接売上", "有料プラン／書類ワークフロー", "月額基本料＋利用量課金"],
    ["物流売上", "新規荷主の受注／追加レーン", "提案時の差別化と運用品質"],
    ["継続率", "問い合わせ減／説明品質の平準化", "解約防止・契約拡大"],
    ["粗利改善", "確認作業・メール往復の削減", "1件当たり対応時間の短縮"],
  ];
  text(s, "価値の層", 55, 170, 230, 30, 16, { bold: true, color: C.muted });
  text(s, "顧客に見えるもの", 320, 170, 410, 30, 16, {
    bold: true,
    color: C.muted,
  });
  text(s, "収益へのつながり", 800, 170, 380, 30, 16, {
    bold: true,
    color: C.muted,
  });
  rule(s, 42, 210, 1170, C.ink, 2);
  rows.forEach((r, i) => {
    const y = 230 + i * 95;
    if (i === 0) box(s, 42, y - 10, 1170, 82, C.pale);
    text(s, r[0], 55, y, 220, 34, 21, {
      bold: true,
      color: i === 0 ? C.blue : C.ink,
    });
    text(s, r[1], 320, y, 420, 42, 20, { bold: true });
    text(s, r[2], 800, y, 380, 42, 19);
    rule(s, 42, y + 69, 1170, C.rule, 1);
  });
  notes(
    s,
    [sources.cnJapan, sources.cnAnnual],
    "公開情報で確認できるサービス領域と、一般的なSaaS・物流事業の収益構造を接続した機会仮説。",
  );
}

// 7 market sizing funnel
{
  const s = p.slides.add();
  title(s, "市場規模は大きいが、狙うべき市場はCNの既存商流から絞る", 7);
  const levels = [
    [
      "TAM",
      "国内EC・宅配に関わる情報需要",
      "26.1兆円／50.3億個",
      "市場の追い風",
    ],
    [
      "SAM",
      "国際輸送・3PL・越境ECの荷主",
      "公開統計だけでは算定不可",
      "顧客台帳で確定",
    ],
    ["SOM", "3年で有料50社・12万件", "直接売上0.86億円／年", "基準シナリオ"],
  ];
  levels.forEach((r, i) => {
    const w = 1120 - i * 190,
      x = 42 + i * 95,
      y = 170 + i * 145;
    box(s, x, y, w, 105, i === 2 ? C.pale : C.panel);
    text(s, r[0], x + 22, y + 18, 90, 28, 18, { bold: true, color: C.blue });
    text(s, r[1], x + 120, y + 14, 390, 34, 22, { bold: true });
    text(s, r[2], x + 550, y + 14, 360, 34, 24, { bold: true });
    text(s, r[3], x + 550, y + 55, 360, 25, 16, { color: C.muted });
  });
  text(
    s,
    "TAMは追跡ソフトの売上ではなく、需要の母数。SAMは既存顧客数・見込み顧客数・年間出荷件数がないと精度が出ない。",
    42,
    630,
    1120,
    30,
    16,
    { color: C.muted },
  );
  notes(
    s,
    [sources.meti, sources.mlitParcel],
    "TAM/SAM/SOMの境界を明示。SOMは公開市場統計からの推計ではなく、後段のボトムアップ仮定。",
  );
}

// 8 revenue model formula
{
  const s = p.slides.add();
  title(s, "収益は「月額基本料＋利用量課金」で小さく始め、物流受注で伸ばす", 8);
  const cols = [
    ["月額基本料", "5〜20万円／社", "権限・通知・レポート"],
    ["利用量課金", "80〜150円／件", "書類申請・承認・保管"],
    ["物流クロスセル", "別管理", "追加レーン・3PL・通関"],
  ];
  cols.forEach((r, i) => {
    const x = 42 + i * 403;
    box(s, x, 190, 368, 300, i === 0 ? C.pale : C.panel);
    text(s, r[0], x + 26, 218, 310, 32, 21, { bold: true, color: C.blue });
    text(s, r[1], x + 26, 282, 310, 52, 30, { bold: true });
    text(s, r[2], x + 26, 360, 310, 72, 19);
  });
  text(s, "基準ケースの式", 42, 540, 260, 30, 17, {
    bold: true,
    color: C.muted,
  });
  text(
    s,
    "50社 × 12万円 × 12か月 ＋ 12万件 × 120円 ＝ 8,640万円／年",
    42,
    575,
    1100,
    52,
    28,
    { bold: true },
  );
  notes(
    s,
    [],
    "料金・社数・利用件数はすべて仮定。営業ヒアリングと実測ログで更新するための初期モデル。",
  );
}

// 9 scenario chart
{
  const s = p.slides.add();
  title(s, "3年目の直接売上は0.32〜1.70億円。差を決めるのは有料化率", 9);
  s.charts.add("bar", {
    position: { left: 55, top: 160, width: 650, height: 450 },
    categories: ["保守", "基準", "強気"],
    series: [
      {
        name: "年間直接売上（百万円）",
        values: [32.4, 86.4, 170.4],
        fill: C.blue,
      },
    ],
    hasLegend: false,
    dataLabels: { showValue: true, position: "outEnd" },
    chartFill: C.white,
    chartLine: { style: "solid", width: 0, fill: C.white },
    plotAreaFill: { type: "none" },
    plotAreaLine: { style: "solid", width: 0, fill: C.white },
    xAxis: {
      visible: true,
      line: { style: "solid", width: 1, fill: C.rule },
      textStyle: { typeface: FONT, fontSize: "15px", color: C.ink },
    },
    yAxis: {
      visible: true,
      max: 180,
      majorUnit: 30,
      majorGridlines: { style: "solid", width: 1, fill: C.panel },
      line: { style: "solid", width: 0, fill: C.white },
      textStyle: { typeface: FONT, fontSize: "12px", color: C.muted },
    },
    showTitle: false,
  });
  const cases = [
    ["保守", "25社｜8万円/月｜6万件×140円"],
    ["基準", "50社｜12万円/月｜12万件×120円"],
    ["強気", "80社｜15万円/月｜22万件×120円"],
  ];
  cases.forEach((r, i) => {
    const y = 190 + i * 125;
    box(s, 760, y, 440, 96, i === 1 ? C.pale : C.panel);
    text(s, r[0], 785, y + 18, 90, 25, 18, { bold: true, color: C.blue });
    text(s, r[1], 880, y + 16, 290, 48, 18, { bold: true });
  });
  text(
    s,
    "※物流受注の増加、解約防止、工数削減は含めない",
    760,
    590,
    430,
    26,
    15,
    { color: C.muted },
  );
  notes(
    s,
    [],
    "年額＝有料社数×月額×12＋年間課金件数×単価。直接売上だけを算定し、間接効果は除外。",
  );
}

// 10 sensitivity
{
  const s = p.slides.add();
  title(s, "売上を最も動かすのは単価より、有料社数と日常利用への定着", 10);
  const data = [
    ["有料社数", 50, "最優先", "営業対象と更新率を週次管理"],
    ["月額単価", 12, "次点", "権限・レポート・APIで段階化"],
    ["年間課金件数", 12, "定着指標", "書類承認を追跡画面に集約"],
    ["件数単価", 120, "補助", "価格より請求の分かりやすさ"],
  ];
  text(s, "変数", 55, 165, 210, 28, 16, { bold: true, color: C.muted });
  text(s, "基準値", 300, 165, 150, 28, 16, { bold: true, color: C.muted });
  text(s, "感度", 500, 165, 150, 28, 16, { bold: true, color: C.muted });
  text(s, "打ち手", 720, 165, 430, 28, 16, { bold: true, color: C.muted });
  rule(s, 42, 205, 1170, C.ink, 2);
  data.forEach((r, i) => {
    const y = 232 + i * 94;
    text(s, r[0], 55, y, 220, 32, 21, { bold: true });
    text(
      s,
      `${r[1]}${i === 0 ? "社" : i === 1 ? "万円/月" : i === 2 ? "万件" : "円/件"}`,
      300,
      y,
      170,
      32,
      21,
      { bold: true, color: C.blue },
    );
    text(s, r[2], 500, y, 170, 32, 18, { bold: true });
    text(s, r[3], 720, y, 430, 40, 18);
    rule(s, 42, y + 65, 1170, C.rule, 1);
  });
  box(s, 42, 615, 1170, 45, C.panel);
  text(
    s,
    "最初の価格テストは3プランで十分。料金表を細かくする前に、毎週使われる業務を1つ作る。",
    60,
    625,
    1120,
    26,
    18,
    { bold: true },
  );
  notes(
    s,
    [],
    "一変数感度の定性的整理。厳密な弾力性は価格テスト後に更新する。",
  );
}

// 11 go-to-market timeline
{
  const s = p.slides.add();
  title(s, "90日で売れるかを確かめ、12か月で物流提案の標準装備にする", 11);
  rule(s, 70, 320, 1070, C.ink, 2);
  const phases = [
    ["0〜30日", "設計", "既存顧客10社へ聞く\n問い合わせ・書類業務を計測"],
    ["31〜90日", "有料実証", "3〜5社で価格テスト\n利用率と削減時間を確認"],
    ["4〜12か月", "標準化", "営業資料と見積に組み込む\n3プランで提供"],
  ];
  phases.forEach((r, i) => {
    const x = 70 + i * 390;
    box(s, x, 303, 28, 28, C.blue, "none", true);
    text(s, r[0], x, 230, 170, 32, 20, { bold: true, color: C.blue });
    text(s, r[1], x, 355, 300, 38, 24, { bold: true });
    text(s, r[2], x, 410, 310, 92, 18);
  });
  box(s, 42, 565, 1170, 74, C.pale);
  text(
    s,
    "次の投資判断：有料化率30%以上、週次利用率60%以上、問い合わせ時間20%以上削減のうち2つを達成。",
    68,
    587,
    1110,
    34,
    20,
    { bold: true, color: C.blue },
  );
  notes(
    s,
    [],
    "閾値は初期の意思決定基準。実証開始前に計測方法と母数を固定する。",
  );
}

// 12 risk and decision
{
  const s = p.slides.add();
  title(s, "作る判断ではなく、売れる条件を先に確かめる", 12);
  const risks = [
    [
      "データ連携",
      "運送会社・海外拠点で更新粒度が違う",
      "例外ステータスと手動補正を設計",
    ],
    [
      "情報管理",
      "顧客書類と社内書類の境界",
      "権限・監査ログ・期限管理を必須化",
    ],
    [
      "無料化圧力",
      "追跡は無料と思われやすい",
      "書類承認・通知・分析を有料価値にする",
    ],
    [
      "営業定着",
      "機能説明だけでは売れない",
      "物流提案の運用改善シナリオで示す",
    ],
  ];
  text(s, "リスク", 55, 165, 230, 28, 16, { bold: true, color: C.muted });
  text(s, "起こり方", 330, 165, 380, 28, 16, { bold: true, color: C.muted });
  text(s, "先に打つ手", 790, 165, 380, 28, 16, { bold: true, color: C.muted });
  rule(s, 42, 205, 1170, C.ink, 2);
  risks.forEach((r, i) => {
    const y = 230 + i * 86;
    text(s, r[0], 55, y, 220, 32, 20, {
      bold: true,
      color: i === 2 ? C.red : C.ink,
    });
    text(s, r[1], 330, y, 390, 42, 18);
    text(s, r[2], 790, y, 370, 42, 18, { bold: true });
    rule(s, 42, y + 61, 1170, C.rule, 1);
  });
  box(s, 42, 600, 1170, 58, C.blue);
  text(
    s,
    "推奨：追加開発の前に、既存顧客10社への需要・価格ヒアリングを実施する。",
    68,
    616,
    1110,
    30,
    20,
    { bold: true, color: C.white },
  );
  notes(
    s,
    [sources.cnJapan],
    "情報管理上、顧客向け書類と社内書類の権限分離を前提とする。",
  );
}

// 13 Sources
{
  const s = p.slides.add();
  title(s, "主な出典と試算上の注意", 13);
  const list = [
    [
      "経済産業省",
      "令和6年度 電子商取引に関する市場調査（2024年実績）",
      sources.meti,
    ],
    ["国土交通省", "令和6年度 宅配便・メール便取扱実績", sources.mlitParcel],
    ["国土交通省", "物流効率化法／荷主・物流事業者向け情報", sources.mlitAct],
    [
      "CN Logistics Japan",
      "公式サイト：国際輸送・3PL・越境EC・会社概要",
      sources.cnJapan,
    ],
    ["CN Logistics International", "Annual Report 2025", sources.cnAnnual],
  ];
  list.forEach((r, i) => {
    const y = 160 + i * 82;
    text(s, r[0], 50, y, 230, 28, 18, { bold: true, color: C.blue });
    text(s, r[1], 300, y, 520, 36, 18, { bold: true });
    text(s, r[2], 840, y, 360, 42, 11, { color: C.muted });
    rule(s, 42, y + 57, 1170, C.rule, 1);
  });
  box(s, 42, 590, 1170, 66, C.panel);
  text(
    s,
    "売上シナリオは公開情報から確認できない顧客数・料金・出荷件数を仮定したもの。投資判断前に実績データで更新する。",
    66,
    608,
    1110,
    34,
    18,
    { bold: true },
  );
  notes(
    s,
    Object.values(sources),
    "調査日：2026年8月1日。公開情報の数値と仮定値を区別して記載。",
  );
}

await fs.mkdir(PREVIEW, { recursive: true });
for (const [i, s] of p.slides.items.entries()) {
  const png = await p.export({ slide: s, format: "png", scale: 1 });
  await fs.writeFile(
    `${PREVIEW}/slide-${String(i + 1).padStart(2, "0")}.png`,
    new Uint8Array(await png.arrayBuffer()),
  );
  const layout = await s.export({ format: "layout" });
  await fs.writeFile(
    `${PREVIEW}/slide-${String(i + 1).padStart(2, "0")}.layout.json`,
    await layout.text(),
  );
}
const montage = await p.export({ format: "webp", montage: true, scale: 1 });
await fs.writeFile(
  `${PREVIEW}/montage.webp`,
  new Uint8Array(await montage.arrayBuffer()),
);
const pptx = await PresentationFile.exportPptx(p);
await pptx.save(OUT);
console.log(
  JSON.stringify({ out: OUT, slides: p.slides.items.length, preview: PREVIEW }),
);
