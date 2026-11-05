// 通常の API (odpt:FlightSchedule?odpt:operator=...) は 1 リクエスト 1000 件で黙って打ち切られるため、
// 全件が入ったダンプ API を使う。ダンプは Azure Blob の署名付き URL へリダイレクトされる。
const DUMP_URL = "https://api.odpt.org/api/v4/odpt:FlightSchedule.json";

export interface FetchDumpOptions {
  consumerKey: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

/** ダンプを取得する。各レコードの検証は normalizeFlightSchedules で行う */
export async function fetchFlightScheduleDump({
  consumerKey,
  fetch: fetchFn = fetch,
  signal,
}: FetchDumpOptions): Promise<unknown[]> {
  // URLSearchParams はキーの ":" をエスケープしてしまうので組み立てる
  const url = `${DUMP_URL}?acl:consumerKey=${encodeURIComponent(consumerKey)}`;
  const res = await fetchFn(url, { redirect: "follow", ...(signal && { signal }) });
  if (!res.ok) {
    // URL にはアクセストークンが含まれるのでエラーメッセージに載せない
    throw new Error(`ODPT FlightSchedule dump request failed: ${res.status} ${res.statusText}`);
  }
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error("ODPT FlightSchedule dump is not an array");
  return body;
}
