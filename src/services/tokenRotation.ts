// Webhookトークン自動ローテーション（ADR-0004）
//
// 月次の時間主導トリガーから呼ばれ、送信元トークン（services/webhookToken.ts）を
// 無停止で入れ替える。手順の順序そのものが安全性を担っているため、ADR-0004
// 「ローテーションの手順」の並びを組み替えないこと。
//
// 手順ロジック（performRotationSteps/runTokenRotation）はdepsを受け取る関数として
// 切り出し、GASグローバル（PropertiesService/UrlFetchApp/LockService/Utilities）を
// 直接触らない（messageHandler.tsのMessageHandlerDepsと同じ流儀）。GASから呼ばれる
// 実体はrotateWebhookToken()（引数無し）で、本物のdepsを組み立てて手順ロジックに渡す
// 薄いadapter。globalThis/globalへの公開はindex.tsに集約するため、このファイルでは
// globalに代入しない。

import { CONFIG, setWebhookToken } from '../config';
import { callLineApi, LineApiResult } from './lineApi';
import { generateWebhookToken } from './webhookToken';

const WEBHOOK_ENDPOINT_PATH = '/v2/bot/channel/webhook/endpoint';

/** ローテーション入口のscript lock取得のタイムアウト（ミリ秒） */
const LOCK_TIMEOUT_MS = 10000;

/** ADR-0004手順7: キャッシュ遅延に対する防御としてのsleep時間（ミリ秒） */
const CACHE_PROPAGATION_WAIT_MS = 120000;

/** クエリパラメータ`t`を検出する正規表現。先頭の`?`または区切りの`&`を区別して捕捉する */
const TOKEN_PARAM_PATTERN = /([?&])t=([^&]*)/;

/**
 * URLからクエリパラメータ`t`の値を取り出します
 *
 * GASのV8ランタイムにはURL/URLSearchParamsが存在しない（使うと実行時に落ちる。
 * vitestはNode上で動くため通ってしまい、テストでは検出できない）。そのため
 * 文字列/正規表現で処理する。
 * @param url 解析対象のURL
 * @returns `t`の値（デコード済み）。`t`が無ければundefined
 */
export function extractTokenFromUrl(url: string): string | undefined {
  const match = url.match(TOKEN_PARAM_PATTERN);
  if (!match) {
    return undefined;
  }
  return decodeURIComponent(match[2]);
}

/**
 * URLのクエリパラメータ`t`の値だけを新しい値に差し替えます
 *
 * `t`以外のクエリパラメータとその順序は保持する。呼び出し前に`extractTokenFromUrl`で
 * `t`の存在を確認しておくこと（`t`が無いURLに対しては何も変わらず元のURLを返す）。
 * @param url 差し替え対象のURL
 * @param newToken 新しいトークン値（URLエンコードして埋め込む）
 * @returns `t`を差し替えたURL
 */
export function replaceTokenInUrl(url: string, newToken: string): string {
  return url.replace(
    TOKEN_PARAM_PATTERN,
    (_match, separator: string) => `${separator}t=${encodeURIComponent(newToken)}`,
  );
}

/**
 * ローテーションの手順ロジックがGASへ到達する経路。テストでは全項目をvi.fn()等で差し替える
 *
 * messageHandler.tsのMessageHandlerDepsと同じ流儀で、手順ロジック本体
 * （performRotationSteps）をdeps注入の関数として切り出す。
 */
export type TokenRotationDeps = {
  /** script lockの取得。取得できなければfalseを返す（throwしない: tryLock） */
  tryLock: () => boolean;
  /** tryLockが取得できた場合のみ呼ばれる */
  releaseLock: () => void;
  /** LINEのWebhook endpoint API（GET/PUT）。認証はcallLineApiの実装側が付ける */
  callLineApi: (
    method: 'get' | 'put',
    path: string,
    payload: unknown,
    context: string,
  ) => LineApiResult;
  /**
   * スクリプトプロパティWEBHOOK_TOKENの現在値。監査ログにのみ使い、旧トークンCの算出には
   * 使わない（Cは必ず1で取得した登録URLから抽出する。理由はperformRotationSteps内のコメント）
   */
  readWebhookToken: () => string;
  /** スクリプトプロパティWEBHOOK_TOKENへの書き込み */
  writeWebhookToken: (value: string) => void;
  /** 新トークンNの生成 */
  generateToken: () => string;
  /** キャッシュ伝播待ち。テストでは実時間を待たないfakeに差し替える */
  sleep: (ms: number) => void;
};

/** GET /v2/bot/channel/webhook/endpoint のレスポンス */
type WebhookEndpointResponse = {
  endpoint?: string;
  active?: boolean;
};

/**
 * ローテーションの7手順を実行します（ADR-0004「ローテーションの手順」）
 *
 * 呼び出し前提としてscript lockは取得済みであること（呼び出し元のrunTokenRotationが担う）。
 * @param deps GASへの到達点
 * @throws 中止条件（active:false / endpoint未設定 / URLにtが無い）、
 *   GET/PUTの失敗、レスポンスのJSON解析失敗のいずれかで例外を投げる
 */
function performRotationSteps(deps: TokenRotationDeps): void {
  // 監査用に開始前のプロパティ値を保持しておく。値そのものは絶対にログへ書かない
  // （ADR-0004「その他の設計判断」: ログには受信値のみを残し、期待値側のトークンは書かない）。
  // 使いみちは後段のドリフト検知（oldTokenがこの受付集合に含まれるかの確認）のみで、
  // oldTokenの算出には使わない（Cは必ず登録URL由来: 手順3のコメント参照）。
  const configuredBefore = deps.readWebhookToken();

  // 手順1: GET /v2/bot/channel/webhook/endpoint で登録中のURLとactiveを取得
  const getResult = deps.callLineApi('get', WEBHOOK_ENDPOINT_PATH, undefined, 'Get webhook endpoint');
  if (getResult.type === 'error') {
    // bodyも含めておく。404ボディに"endpoint未設定"の旨が書かれているような場合でも、
    // 失敗通知メール（唯一の検知経路）だけで原因を診断できるようにするため。
    throw new Error(
      `Webhook endpointの取得に失敗しました。status=${getResult.statusCode}, body=${getResult.body}`,
    );
  }

  let parsed: WebhookEndpointResponse;
  try {
    parsed = JSON.parse(getResult.body) as WebhookEndpointResponse;
  } catch {
    throw new Error('Webhook endpointの取得結果をJSONとして解釈できませんでした。');
  }

  // 手順2: 3つの中止条件。事由を区別できるメッセージでthrowする（ADR-0004）。
  // 順序はADR-0004の記述（active:false / endpoint未設定 / URLにtが無い）に合わせる。
  // endpointが無ければtの有無を判定できないため、endpoint未設定の判定をt判定より先に置く。
  if (parsed.active === false) {
    throw new Error('Webhookが無効化されているため中止しました（active:false）。');
  }
  if (!parsed.endpoint) {
    throw new Error('Webhook endpointが未設定のため中止しました。');
  }

  // 手順3: 旧トークンCは必ず「1で取得した登録URL」から抽出する。スクリプトプロパティ由来には
  // しない。プロパティ末尾を現行とみなす実装だと、手順6のPUTが失敗した翌月に
  // 「プロパティ末尾（N）を現行とみなして次の"N,M"を書く」ことになり、LINEが実際に
  // 使っているトークンC（＝まだ登録URLに残っているはず）が受付集合から消えて全停止する。
  // 登録URL由来にすることで「LINEが使っているトークンは常に受付集合にある」が
  // 手順の構造そのものから保証される（ADR-0004「ローテーションの手順」）。
  const oldToken = extractTokenFromUrl(parsed.endpoint);
  if (oldToken === undefined) {
    throw new Error('登録されているWebhook URLにトークン(t)が含まれていないため中止しました。');
  }

  // ドリフト監査: 登録URL由来のCがプロパティの受付集合に無ければ、前回のPUT失敗や
  // URLの手動変更の痕跡である可能性が高い。ここは中止条件に加えない
  // （ADR-0004が定める中止条件は3つのみで、これを4つ目にしてはならない）。
  // ログ出力するのは「一致したかどうか」のみで、値そのものは書かない（上のコメント参照）。
  const acceptedBefore = configuredBefore.split(',').map((token) => token.trim());
  if (!acceptedBefore.includes(oldToken)) {
    Logger.log(
      'Webhook token rotation: 警告 - 登録URLのトークンがプロパティの受付集合に含まれていません（前回のPUT失敗、またはURLの手動変更の痕跡の可能性）。',
    );
  }

  // 手順4: 新トークンNを生成
  const newToken = deps.generateToken();

  // 手順5: スクリプトプロパティを"C,N"に更新（2つとも受け付ける状態にする）。
  // 必ず手順6（PUT）より先に行う。6が失敗してもLINEは旧URL（C）を向いたままで
  // GASはCもNも受け付けるため、Botは動き続ける（ADR-0004）。
  deps.writeWebhookToken(`${oldToken},${newToken}`);

  // 手順6: PUT /v2/bot/channel/webhook/endpoint でN入りURLを登録
  const newUrl = replaceTokenInUrl(parsed.endpoint, newToken);
  const putResult = deps.callLineApi(
    'put',
    WEBHOOK_ENDPOINT_PATH,
    { endpoint: newUrl },
    'Set webhook endpoint',
  );
  if (putResult.type === 'error') {
    // 刈り取り（手順7）をしない。プロパティは"C,N"のまま残し、次回の実行に委ねるのが
    // 安全側（ADR-0004）。ロールバックもしない。旧URLも新URLも同じデプロイを指すため
    // 到達性は1ビットも変わらず、効かない手当てになる。
    throw new Error(`Webhook endpointの更新に失敗しました。status=${putResult.statusCode}`);
  }

  // 手順7: このsleepはキャッシュ遅延に対する防御であり、疎通確認（webhook/test）の
  // 付属物ではない。ADR-0004により疎通確認は削除済みだが、それを理由に
  // 「確認が無いからsleepも不要」として将来ここを消さないこと。LINEのドキュメントは
  // 反映まで最大1分としているが保証ではないため、倍の120秒を取っている。
  //
  // なお、このsleepの間もscript lockは握られたままである。GASのscript lockは
  // プロジェクトに1つしかなく、記録ストア（trainingLogStore.ts）も同じ
  // LockService.getScriptLock()を使うため、この約2分の間に届いたメッセージは
  // 記録の追記でロック待ちになり、30秒（trainingLogStoreのLOCK_TIMEOUT_MS）で
  // StoreBusyErrorになる。ユーザーには「処理が混み合っています」と返って再送できるため
  // 喪失にはならない。月1回・深夜帯（JST 3時）であることと併せて許容している。
  // ロックを一旦解放して取り直す形にはしないこと。ローテーションが同時に2つ走らない
  // という、このロックの存在理由そのものを弱めるため。
  deps.sleep(CACHE_PROPAGATION_WAIT_MS);

  // 刈り取り。ここでようやくCを受付集合から外す
  deps.writeWebhookToken(newToken);
}

/**
 * ローテーションを実行します（script lock付き）
 *
 * ロック取得の失敗（tryLockがfalse）はthrowしない。月次トリガーと手動実行の衝突は
 * 正常系であり、ここでthrowすると良性の衝突が失敗通知メールになり、失敗検知の
 * 信頼性を自分で削ることになる（ADR-0004）。ログして静かに終了する。
 *
 * ロック取得後の失敗はLogger.logに記録してthrowする。GASの時間主導トリガーは
 * 関数が例外で終わるとオーナー宛に失敗通知メールを送るため、これが唯一の検知経路になる
 * （LINEのpush通知は採らない。通知経路が失敗原因と同じ依存を持つため: ADR-0004）。
 * @param deps GASへの到達点。テストでは全項目をvi.fn()等で差し替える
 * @throws ロック取得後にperformRotationStepsが投げた例外をそのまま再スローする
 */
export function runTokenRotation(deps: TokenRotationDeps): void {
  const acquired = deps.tryLock();
  if (!acquired) {
    Logger.log(
      'Webhook token rotation: ロックを取得できなかったため何もせず終了します（月次トリガーと手動実行の衝突は正常系）。',
    );
    return;
  }

  try {
    performRotationSteps(deps);
    Logger.log('Webhook token rotation: 完了しました。');
  } catch (error) {
    Logger.log(
      `Webhook token rotation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  } finally {
    deps.releaseLock();
  }
}

/**
 * GASの時間主導トリガーから呼ばれる実体
 *
 * 本物のdepsを組み立ててrunTokenRotationに渡す薄いadapter。globalThis/globalへの
 * 公開はここではなくindex.tsに集約する（このファイルではglobalに代入しない）。
 *
 * ScriptApp.getService().getUrl()は使わない。V8ランタイム以降は`/dev`（HEAD）の
 * URLを返すため、バージョン固定デプロイを本番にしている本プロジェクト（ADR-0003）では
 * 使えない。踏むとローテーションが本番の向き先を黙って`/dev`に変える。
 * 手順1のGETでLINEに登録済みのURLを読むことで回避している。
 */
export function rotateWebhookToken(): void {
  const lock = LockService.getScriptLock();

  runTokenRotation({
    tryLock: () => lock.tryLock(LOCK_TIMEOUT_MS),
    releaseLock: () => lock.releaseLock(),
    callLineApi,
    readWebhookToken: () => CONFIG.WEBHOOK_TOKEN,
    writeWebhookToken: setWebhookToken,
    generateToken: generateWebhookToken,
    sleep: (ms) => Utilities.sleep(ms),
  });
}

/** ローテーション用トリガーのハンドラ関数名。setupRotationTriggerの冪等な削除・作成の両方で使う */
const ROTATION_TRIGGER_HANDLER = 'rotateWebhookToken';

/**
 * 月次のトークンローテーション用トリガーを作成します
 *
 * READMEの導入手順で、Apps Scriptエディタからユーザーが1回だけ手動実行する関数。
 * 冪等にするため、既存の同ハンドラのトリガーを先に削除してから作成する
 * （削除しないまま複数回実行すると、トリガーが増殖して月に複数回ローテーションが走る）。
 * 実行時刻は深夜帯に寄せる。ADR-0004は「月1回・深夜帯」を前提に、刈り取り後の
 * キャッシュ遅延でメッセージ1通が失われるリスクを許容している。
 */
export function setupRotationTrigger(): void {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === ROTATION_TRIGGER_HANDLER)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger(ROTATION_TRIGGER_HANDLER).timeBased().onMonthDay(1).atHour(3).create();
}
