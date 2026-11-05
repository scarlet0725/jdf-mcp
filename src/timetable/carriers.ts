export const AIRLINE_GROUPS = ["JAL", "ANA"] as const;
export type AirlineGroup = (typeof AIRLINE_GROUPS)[number];

export interface Carrier {
  name: string;
  nameEn: string;
}

// ODPT の odpt:airline と JAL の備考 (「JTA運航」「JAR・E90J運航」など) に現れる運航会社コード
export const CARRIERS: Readonly<Record<string, Carrier>> = {
  JAL: { name: "日本航空", nameEn: "Japan Airlines" },
  JTA: { name: "日本トランスオーシャン航空", nameEn: "Japan Transocean Air" },
  RAC: { name: "琉球エアーコミューター", nameEn: "Ryukyu Air Commuter" },
  JAR: { name: "ジェイエア", nameEn: "J-AIR" },
  HAC: { name: "北海道エアシステム", nameEn: "Hokkaido Air System" },
  JAC: { name: "日本エアコミューター", nameEn: "Japan Air Commuter" },
  FDA: { name: "フジドリームエアラインズ", nameEn: "Fuji Dream Airlines" },
  ORC: { name: "オリエンタルエアブリッジ", nameEn: "Oriental Air Bridge" },
  AMX: { name: "天草エアライン", nameEn: "Amakusa Airlines" },
  ANA: { name: "全日本空輸", nameEn: "All Nippon Airways" },
  AKX: { name: "ANAウイングス", nameEn: "ANA Wings" },
  AJX: { name: "エアージャパン", nameEn: "Air Japan" },
  ADO: { name: "AIRDO", nameEn: "AIRDO" },
  SNJ: { name: "ソラシドエア", nameEn: "Solaseed Air" },
  SFJ: { name: "スターフライヤー", nameEn: "StarFlyer" },
  IBX: { name: "IBEXエアラインズ", nameEn: "IBEX Airlines" },
};

export function isCarrierCode(code: string): boolean {
  return Object.hasOwn(CARRIERS, code);
}

export function carrierName(code: string): string {
  return CARRIERS[code]?.name ?? code;
}

// 国内航空会社の便名プレフィックス。ANA のデータには外国社のコードシェア便名
// (UA, LH など) も並ぶが、出力するのはこれらだけにする（検索には全便名を使う）。
const DOMESTIC_FLIGHT_PREFIXES = new Set(["JL", "NU", "NH", "EH", "NQ", "HD", "6J", "7G", "FW", "OC", "JH", "MZ"]);

export function isDomesticFlightNumber(flightNumber: string): boolean {
  return DOMESTIC_FLIGHT_PREFIXES.has(flightNumber.slice(0, 2));
}

const FLIGHT_NUMBER = /^([A-Z][A-Z0-9]|[0-9][A-Z])(\d{1,4})$/;
const GROUP_PREFIX_ALIASES: Readonly<Record<string, string>> = { JAL: "JL", ANA: "NH" };

/**
 * 便名を照合用のキーにする。データ側は "HD081" のようにゼロ埋めされることがあるため数値部分を正規化する。
 * "JL 501" / "jal501" / "HD81" などの入力も受け付ける。解釈できなければ undefined。
 */
export function flightNumberKey(input: string): string | undefined {
  let s = input.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
  for (const [alias, prefix] of Object.entries(GROUP_PREFIX_ALIASES)) {
    if (s.startsWith(alias) && /^\d+$/.test(s.slice(alias.length))) s = prefix + s.slice(alias.length);
  }
  const m = FLIGHT_NUMBER.exec(s);
  if (!m) return undefined;
  return `${m[1]}${Number(m[2])}`;
}
