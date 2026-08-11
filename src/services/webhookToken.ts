// 送信元トークン（ADR-0004）の照合と生成
//
// 照合はPropertiesServiceもCONFIGもこの関数の中で読まない純粋関数として切り出す。
// GASの外（vitest）から直接テストできるようにするためで、CONFIGから読んだ値は
// 呼び出し側（index.ts）が引数として渡す。

/**
 * 受信した送信元トークンが、スクリプトプロパティに登録された受付集合に含まれるか判定します
 * @param received リクエストのクエリパラメータ`t`から読んだ値。未指定/空文字なら常にfalse
 * @param configured スクリプトプロパティ`WEBHOOK_TOKEN`の値。カンマ区切りで
 *   通常時は1つ（`"N"`）、ローテーション入れ替え中は2つ（`"C,N"`）
 * @returns 受付集合に含まれればtrue
 */
export function isValidWebhookToken(received: string | undefined, configured: string): boolean {
  // received=""は下のfilterでも結果的に弾かれるが、ここでも明示的に弾いている。
  // 「未指定/空文字は常にfalse」という要件そのものを表す分岐であり、
  // filter側の実装都合（trim後に空文字を除外する）とは独立した防御として両方残す
  if (!received) {
    return false;
  }

  // プロパティは手入力される値なので、末尾スペースなどが混入しやすい。
  // trimせずに比較すると、値そのものは合っているのに空白の有無だけで
  // 照合が全滅する（原因が分かりにくい全停止を招く）ため、必ずtrimしてから比較する
  const acceptedTokens = configured
    .split(',')
    .map((token) => token.trim())
    // 例えば"a,"のような値はtrim後に["a", ""]になる。空文字を受付集合に残すと、
    // 上のガードが無くなった場合に空の受信値が通ってしまうため、ここでも除外しておく
    .filter((token) => token !== '');

  return acceptedTokens.includes(received);
}

/**
 * 新しい送信元トークンを生成します
 *
 * ローテーション（後続タスク）が、月次で新トークンNを作るために使う。
 * @returns UUID形式のトークン
 */
export function generateWebhookToken(): string {
  return Utilities.getUuid();
}
