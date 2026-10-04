import { ENGINE, SPEC } from '../spec.ts';
import type { AppStatus, Choice, GameView, Hand } from '../core/game-contracts.ts';

const labels: Record<Hand, string> = { rock: 'グー', scissors: 'チョキ', paper: 'パー' };
const handPaths: Record<Hand, readonly string[]> = {
  rock: ['M22 39V26q0-8 8-8h35q9 0 9 9v26q0 15-14 20H39Q22 66 22 51V39Z', 'M22 39h34q8 0 8 9v5M34 20v17m12-17v17m12-17v17'],
  scissors: ['M37 43 26 15q-3-8 4-11 6-2 9 6l11 27 9-27q3-8 9-5 6 2 4 10L62 46h7q10 0 10 10v7q0 18-20 22H42Q27 80 27 65V52q0-9 10-9Z', 'M37 43 53 52q7 4 3 10-3 5-10 1l-8-5'],
  paper: ['M24 48V22q0-7 6-7t6 7v23-32q0-7 6-7t6 7v30-28q0-7 6-7t6 7v29-22q0-6 6-6t6 6v39q0 21-22 25H40Q26 80 22 68L12 49q-4-7 2-10 6-3 10 9Z', ''],
};
const icons = {
  coin: 'M29 16a13 13 0 1 1-26 0 13 13 0 0 1 26 0ZM14 9h4v14h-4Z',
  hand: 'M9 17V9a2 2 0 0 1 4 0v7-11a2 2 0 0 1 4 0v11-9a2 2 0 0 1 4 0v10-6a2 2 0 0 1 4 0v11q0 8-9 8H13Q8 28 6 24l-3-6q-1-3 2-3l4 5',
  draw: 'M6 11h20M6 21h20',
  win: 'm16 3 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z',
  loss: 'm8 8 16 16M24 8 8 24',
  flag: 'M7 28V4h19l-4 6 4 6H7',
  repeat: 'M25 12A10 10 0 1 0 25 22M25 5v8h-8',
  saveError: 'M6 3h17l4 4v22H5V3ZM10 3v8h12V3m-11 15 10 10m0-10L11 25',
  tabs: 'M4 5h18v19H4ZM10 1h18v19',
  hourglass: 'M7 3h18M7 29h18M9 3v7l14 12v7M23 3v7L9 22v7',
  blocked: 'M28 16a12 12 0 1 1-24 0 12 12 0 0 1 24 0ZM7 7l18 18',
};
type Icon = keyof typeof icons;
function icon(name: Icon): string {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="${icons[name]}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Presentation consumes only the committed public view; it never draws or settles results. */
export function createDisplay(root: Document): {
  render(view: GameView | null, status: AppStatus, reason: string): void;
  bind(choose: (index: number) => void, retry: () => void): void;
  animate(view: GameView): Promise<void>;
} {
  function find<T extends Element>(selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing JanPon display element: ${selector}`);
    return element;
  }
  const machine = find<HTMLElement>('.machine'), display = find<HTMLElement>('.display');
  const coin = find<HTMLButtonElement>('#coin-input'), restart = find<HTMLButtonElement>('#restart');
  const retryButton = find<HTMLButtonElement>('#retry'), balance = find<HTMLOutputElement>('#balance');
  const prize = find<HTMLOutputElement>('#prize'), statusText = find<HTMLElement>('#status');
  const symbol = find<HTMLElement>('#state-symbol'), indicator = find<HTMLElement>('#state-indicator');
  const ring = find<SVGElement>('#ring'), led = find<SVGElement>('#led-hand'), mask = find<SVGElement>('#fist');
  const hands = Array.from(root.querySelectorAll<HTMLButtonElement>('.controls button'));
  const lamps = Array.from(root.querySelectorAll<SVGElement>('.lamp'));
  const clock = root.defaultView;
  if (!clock) throw new Error('JanPon display requires a document window');
  let current: GameView | null = null, appStatus: AppStatus = 'new', generation = 0;
  let claimed = false, choose: (index: number) => void = () => {}, retry: () => void = () => {};
  let timer: number | null = null, wake: (() => void) | null = null;
  function cancel(): void {
    generation++;
    if (timer !== null) clock!.clearTimeout(timer);
    timer = null; wake?.(); wake = null;
  }
  function sleep(duration: number): Promise<void> {
    return new Promise(resolve => { wake = resolve; timer = clock!.setTimeout(() => { timer = null; wake = null; resolve(); }, duration); });
  }
  function light(index: number): void { lamps.forEach((lamp, i) => lamp.classList.toggle('active', i === index)); }
  function disableInputs(): void { coin.disabled = true; restart.disabled = true; hands.forEach(button => { button.disabled = true; }); }
  function activate(expected: Choice): void {
    if (appStatus !== 'ready' || claimed || !current) return;
    const index = current.choices.findIndex(choice => choice.kind === expected.kind && (choice.kind !== 'hand' || expected.kind === 'hand' && choice.hand === expected.hand));
    if (index < 0) return;
    claimed = true; disableInputs(); choose(index);
  }
  function bindInput(button: HTMLButtonElement, expected: Choice): void {
    button.addEventListener('click', event => { event.stopPropagation(); if (!button.disabled) activate(expected); });
  }
  bindInput(coin, { kind: 'coin' });
  bindInput(restart, { kind: 'restart' });
  hands.forEach(button => bindInput(button, { kind: 'hand', hand: button.dataset.hand as Hand }));
  retryButton.addEventListener('click', event => {
    event.stopPropagation();
    if (retryButton.disabled || claimed || !['stopped', 'other-tab'].includes(appStatus)) return;
    claimed = true; retryButton.disabled = true; retry();
  });
  restart.innerHTML = icon('repeat'); retryButton.innerHTML = icon('repeat');

  function render(view: GameView | null, status: AppStatus, reason: string): void {
    cancel(); current = view; appStatus = status; claimed = false; disableInputs();
    const blocked = status === 'stopped' || status === 'other-tab' || status === 'closed';
    const ready = status === 'ready' && view !== null;
    const result = view?.result;
    const inResult = result && (view?.phase === 'result' || view?.phase === 'choosing' && result.outcome === 'draw');
    let graphic: Icon = 'hourglass', description = '保存されたゲームを確認中です';
    if (view) {
      if (view.phase === 'idle') { graphic = 'coin'; description = 'コインと残高の周辺を押して1枚投入してください'; }
      if (view.phase === 'choosing') { graphic = 'hand'; description = 'グー、チョキ、パーから手を選んでください。追加投入はできません'; }
      if (inResult) {
        graphic = result.outcome;
        const outcomes = { draw: 'あいこです。追加投入なしでもう一度手を選びます', win: `勝ちです。配当${result.payout}枚。ルーレットは自動で止まり、精算します`, loss: '負けです。精算して次へ進みます' };
        description = `あなたは${labels[result.player]}、相手は${labels[result.opponent]}。${outcomes[result.outcome]}`;
      }
      if (view.phase === 'game-over') { graphic = 'flag'; description = `ゲームオーバーです。はじめからを押すと${SPEC.initialBalance}枚で新しいゲームを始めます`; }
    }
    if (status === 'stopped') { graphic = 'saveError'; description = '保存または復元を確認できないため停止しました。保存は消しません。再読み込みして再試行できます'; }
    if (status === 'other-tab') { graphic = 'tabs'; description = '別のタブでプレイ中です。そのタブを閉じてから、再読み込みして再試行してください'; }
    if (status === 'closed') { graphic = 'blocked'; description = 'ゲームを停止しました。再開するにはページを再読み込みしてください'; }
    if (status === 'busy' && view) description += '。保存と進行を確定中です';
    if (reason) description += `。詳細: ${reason}`;
    balance.textContent = view ? String(view.balance) : '';
    balance.setAttribute('aria-label', view ? `メダル残高${view.balance}枚` : 'メダル残高。未確認');
    prize.textContent = ''; light(-1);
    indicator.innerHTML = blocked || !view || view.phase === 'game-over' ? icon(graphic) : '';
    led.style.visibility = indicator.innerHTML ? 'hidden' : 'visible';
    const hand = result?.opponent ?? SPEC.hands[0], paths = handPaths[hand];
    mask.innerHTML = `<rect width="300" height="256" fill="black"/><g transform="translate(38 10) scale(2.4)"><path d="${paths[0]}" fill="white"/><path d="${paths[1]}" fill="none" stroke="black" stroke-width="3" stroke-linecap="round"/></g>`;
    symbol.innerHTML = icon(graphic); display.classList.toggle('problem', blocked);
    machine.dataset.phase = blocked ? status : view?.phase ?? 'loading';
    machine.dataset.outcome = inResult ? result.outcome : '';
    machine.setAttribute('aria-label', `JanPon。${description}`);
    ring.setAttribute('aria-label', `${description}。配当ランプ${SPEC.payoutWeightTotal}灯`);
    statusText.textContent = `${description}。${view ? `残高${view.balance}枚` : '残高は未確認です'}`;
    coin.disabled = !ready || !view.choices.some(choice => choice.kind === 'coin');
    coin.setAttribute('aria-label', !coin.disabled ? `コインと残高の周辺を押して1枚投入。現在${view?.balance}枚` : '現在は追加投入できません');
    machine.dataset.waiting = String(!coin.disabled);
    restart.hidden = blocked || view?.phase !== 'game-over';
    restart.disabled = !ready || !view.choices.some(choice => choice.kind === 'restart');
    restart.setAttribute('aria-label', `はじめから。${SPEC.initialBalance}枚で新しいゲームを始める`);
    retryButton.hidden = !['stopped', 'other-tab'].includes(status); retryButton.disabled = retryButton.hidden;
    hands.forEach(button => {
      button.disabled = !ready || !view.choices.some(choice => choice.kind === 'hand' && choice.hand === button.dataset.hand);
      button.setAttribute('aria-pressed', String(!!inResult && result.player === button.dataset.hand));
    });
  }
  async function animate(view: GameView): Promise<void> {
    if (!view.result || appStatus !== 'ready' || view.phase !== 'result' && !(view.phase === 'choosing' && view.result.outcome === 'draw')) return;
    cancel(); const run = generation, result = view.result;
    claimed = true; disableInputs();
    if (result.outcome !== 'win') {
      await sleep(result.outcome === 'draw' ? ENGINE.drawDurationMs : ENGINE.resultDurationMs);
      if (run === generation && result.outcome === 'draw') {
        claimed = false;
        hands.forEach(button => { button.disabled = !current?.choices.some(choice => choice.kind === 'hand' && choice.hand === button.dataset.hand); });
      }
      return;
    }
    let step = 0;
    for (let elapsed = 0; elapsed < ENGINE.resultDurationMs - ENGINE.drawDurationMs; elapsed += ENGINE.lampStepMs) {
      if (run !== generation) return;
      light(step % lamps.length); step++;
      await sleep(ENGINE.lampStepMs);
    }
    if (run !== generation) return;
    const stop = lamps.findIndex(lamp => lamp.dataset.value === String(result.payout));
    light(stop); prize.textContent = String(result.payout);
    prize.style.color = lamps[stop]?.getAttribute('fill') ?? '';
    await sleep(ENGINE.drawDurationMs);
  }
  return { render, bind(onChoose, onRetry) { choose = onChoose; retry = onRetry; }, animate };
}
