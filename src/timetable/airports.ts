export interface Airport {
  code: string;
  name: string;
  nameEn: string;
  /** 名前以外で引けるようにする呼び名 */
  aliases?: string[];
}

export interface CityGroup {
  code?: string;
  name: string;
  nameEn: string;
  airports: string[];
}

// 国内空港の一覧。ANA のデータに含まれる国際線を除外する判定にも使う。
// 名前は odpt:Airport の airportTitle に揃えている。末尾の 7 空港は odpt:Airport に無いが、
// 国内線の判定漏れを防ぐために入れている。
const AIRPORT_ROWS: ReadonlyArray<readonly [string, string, string, string[]?]> = [
  ["AKJ", "旭川", "Asahikawa"],
  ["AOJ", "青森", "Aomori"],
  ["ASJ", "奄美", "Amami"],
  ["AXJ", "天草", "Amakusa"],
  ["AXT", "秋田", "Akita"],
  ["CTS", "札幌(新千歳)", "Sapporo(New Chitose)"],
  ["FKS", "福島", "Fukushima"],
  ["FSZ", "静岡", "Shizuoka"],
  ["FUJ", "福江", "Fukue", ["五島福江"]],
  ["FUK", "福岡", "Fukuoka"],
  ["GAJ", "山形", "Yamagata"],
  ["HAC", "八丈島", "Hachijojima"],
  ["HIJ", "広島", "Hiroshima"],
  ["HKD", "函館", "Hakodate"],
  ["HNA", "花巻", "Hanamaki", ["いわて花巻"]],
  ["HND", "東京(羽田)", "Tokyo Haneda"],
  ["HSG", "佐賀", "Saga"],
  ["IKI", "壱岐", "Iki"],
  ["ISG", "石垣", "Ishigaki"],
  ["ITM", "大阪(伊丹)", "Osaka Itami"],
  ["IWJ", "石見", "Iwami", ["萩・石見"]],
  ["IWK", "岩国", "Iwakuni"],
  ["IZO", "出雲", "Izumo"],
  ["KCZ", "高知", "Kochi"],
  ["KIJ", "新潟", "Niigata"],
  ["KIX", "大阪(関西)", "Osaka Kansai"],
  ["KKJ", "北九州", "Kitakyushu"],
  ["KKX", "喜界島", "Kikaijima"],
  ["KMI", "宮崎", "Miyazaki"],
  ["KMJ", "熊本", "Kumamoto"],
  ["KMQ", "小松", "Komatsu"],
  ["KOJ", "鹿児島", "Kagoshima"],
  ["KTD", "北大東", "Kitadaito"],
  ["KUH", "釧路", "Kushiro"],
  ["KUM", "屋久島", "Yakushima"],
  ["MBE", "紋別", "Monbetsu", ["オホーツク紋別"]],
  ["MMB", "女満別", "Memanbetsu"],
  ["MMD", "南大東", "Minamidaito"],
  ["MMJ", "松本", "Matsumoto"],
  ["MMY", "宮古", "Miyako"],
  ["MSJ", "三沢", "Misawa"],
  ["MYJ", "松山", "Matsuyama"],
  ["NGO", "名古屋(中部)", "Nagoya Centrair", ["セントレア"]],
  ["NGS", "長崎", "Nagasaki"],
  ["NKM", "名古屋(小牧)", "Nagoya Komaki", ["県営名古屋"]],
  ["NRT", "成田", "Narita"],
  ["NTQ", "能登", "Noto"],
  ["OBO", "帯広", "Obihiro"],
  ["OGN", "与那国", "Yonaguni"],
  ["OIR", "奥尻", "Okushiri"],
  ["OIT", "大分", "Oita"],
  ["OKA", "那覇", "Naha", ["沖縄", "Okinawa"]],
  ["OKD", "札幌(丘珠)", "Sapporo Okadama"],
  ["OKE", "沖永良部", "Okinoerabu"],
  ["OKI", "隠岐", "Oki"],
  ["OKJ", "岡山", "Okayama"],
  ["ONJ", "大館能代", "Odate-Noshiro"],
  ["RIS", "利尻", "Rishiri"],
  ["RNJ", "与論", "Yoron"],
  ["SDJ", "仙台", "Sendai"],
  ["SHB", "中標津", "Nakashibetsu", ["根室中標津"]],
  ["SHI", "下地島", "Shimojishima", ["宮古下地島"]],
  ["SHM", "南紀白浜", "Nanki-Shirahama"],
  ["SYO", "庄内", "Shonai"],
  ["TAK", "高松", "Takamatsu"],
  ["TJH", "但馬", "Tajima"],
  ["TKN", "徳之島", "Tokunoshima"],
  ["TKS", "徳島", "Tokushima"],
  ["TNE", "種子島", "Tanegashima"],
  ["TOY", "富山", "Toyama"],
  ["TRA", "多良間", "Tarama"],
  ["TSJ", "対馬", "Tsushima"],
  ["TTJ", "鳥取", "Tottori"],
  ["UBJ", "山口宇部", "Yamaguchi-Ube"],
  ["UEO", "久米島", "Kumejima"],
  ["UKB", "神戸", "Kobe"],
  ["WKJ", "稚内", "Wakkanai"],
  ["YGJ", "米子", "Yonago"],
  ["AGJ", "粟国", "Aguni"],
  ["HTR", "波照間", "Hateruma"],
  ["IBR", "茨城", "Ibaraki"],
  ["KJP", "慶良間", "Kerama"],
  ["MYE", "三宅島", "Miyakejima"],
  ["OIM", "大島", "Oshima"],
  ["SDS", "佐渡", "Sado"],
];

export const DOMESTIC_AIRPORTS: ReadonlyMap<string, Airport> = new Map(
  AIRPORT_ROWS.map(([code, name, nameEn, aliases]) => [code, { code, name, nameEn, ...(aliases && { aliases }) }]),
);

export const CITY_GROUPS: readonly CityGroup[] = [
  { code: "TYO", name: "東京", nameEn: "Tokyo", airports: ["HND", "NRT"] },
  { code: "OSA", name: "大阪", nameEn: "Osaka", airports: ["ITM", "KIX"] },
  { code: "SPK", name: "札幌", nameEn: "Sapporo", airports: ["CTS", "OKD"] },
  { name: "名古屋", nameEn: "Nagoya", airports: ["NGO", "NKM"] },
];

export function isDomesticAirport(code: string): boolean {
  return DOMESTIC_AIRPORTS.has(code);
}

export function airportName(code: string): string {
  return DOMESTIC_AIRPORTS.get(code)?.name ?? code;
}

export interface AirportMatch {
  airports: Airport[];
  cityGroup?: CityGroup;
  /** 完全一致 (コード・都市・名前) なら true、部分一致なら false */
  exact: boolean;
}

function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/空港|airport|[\s()（）]/g, "");
}

// "東京(羽田)" からは "東京(羽田)" "東京" "羽田" を、"Tokyo Haneda" からは "tokyohaneda" "tokyo" "haneda" を照合キーにする
function exactKeys(airport: Airport): string[] {
  const parts = [airport.name, airport.nameEn, ...(airport.aliases ?? [])].flatMap((n) => [n, ...n.split(/[\s()（）]+/)]);
  return parts.map(normalize).filter((k) => k !== "");
}

const EXACT_INDEX = new Map<string, Airport[]>();
for (const airport of DOMESTIC_AIRPORTS.values()) {
  for (const key of new Set(exactKeys(airport))) EXACT_INDEX.set(key, [...(EXACT_INDEX.get(key) ?? []), airport]);
}

/** 空港コード・都市コード・日本語名・英語名から空港を探す */
export function matchAirports(query: string): AirportMatch {
  const upper = query.normalize("NFKC").trim().toUpperCase();
  const q = normalize(query);
  const byCode = (codes: string[]) => codes.map((c) => DOMESTIC_AIRPORTS.get(c)!);

  const airport = DOMESTIC_AIRPORTS.get(upper);
  if (airport) return { airports: [airport], exact: true };

  const cityGroup = CITY_GROUPS.find(
    (g) => g.code === upper || normalize(g.name) === q || normalize(g.nameEn) === q,
  );
  if (cityGroup) return { airports: byCode(cityGroup.airports), cityGroup, exact: true };

  const exact = EXACT_INDEX.get(q);
  if (exact) return { airports: exact, exact: true };

  if (q === "") return { airports: [], exact: false };
  const partial = [...DOMESTIC_AIRPORTS.values()].filter((a) => exactKeys(a).some((k) => k.includes(q)));
  return { airports: partial, exact: false };
}

export class AirportResolutionError extends Error {}

/**
 * ツール入力の空港指定を空港コードの配列にする。
 * 都市 ("東京", "TYO") は複数空港に展開し、部分一致が 1 件に絞れない場合は候補付きでエラーにする。
 */
export function resolveAirports(query: string): string[] {
  const match = matchAirports(query);
  if (match.exact || match.airports.length === 1) return match.airports.map((a) => a.code);
  if (match.airports.length === 0) {
    throw new AirportResolutionError(`Unknown airport "${query}". Use search_airports to find the IATA code.`);
  }
  const candidates = match.airports
    .slice(0, 10)
    .map((a) => `${a.code} (${a.name})`)
    .join(", ");
  throw new AirportResolutionError(`Airport "${query}" is ambiguous. Candidates: ${candidates}`);
}
