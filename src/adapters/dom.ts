import { EFFECTS, ENGINE, SPEC } from '../spec.ts';
import { presentationCue } from './presentation-cues.ts';
import { prizeWindow, rouletteFrames } from './roulette-windows.ts';
import { centralScene, controlIcon, sceneFor } from './central-scene.ts';
import { medalDigits } from './medal-digits.ts';
import type { CenterScene } from './central-scene.ts';
import type { AppStatus, Choice, GameView, Hand } from '../core/game-contracts.ts';

const labels: Record<Hand, string> = { rock: 'グー', scissors: 'チョキ', paper: 'パー' };
/** Presentation consumes only the committed public view; it never draws or settles results. */
export function createDisplay(root: Document): {
  render(view: GameView | null, status: AppStatus, reason: string): void;
  bind(choose: (index: number) => void, retry: () => void): void;
  animate(view: GameView): Promise<void>;
  request(choice: Choice): void;
  finishPresentation(): Promise<void>;
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
  const indicator = find<HTMLElement>('#state-indicator');
  const ring = find<SVGElement>('#ring');
  const hands = Array.from(root.querySelectorAll<HTMLButtonElement>('.controls button'));
  const lamps = Array.from(root.querySelectorAll<SVGElement>('.lamp'));
  const windowValues = lamps.map(lamp => Number(lamp.dataset.value));
  const clock = root.defaultView;
  if (!clock) throw new Error('JanPon display requires a document window');
  let current: GameView | null = null, appStatus: AppStatus = 'new', generation = 0;
  let claimed = false, choose: (index: number) => void = () => {}, retry: () => void = () => {};
  let timer: number | null = null, wake: (() => void) | null = null;
  let finishing: Promise<void> | null = null, drawing: Promise<void> | null = null;
  let drawComplete = false, drawRequested = false, resultComplete = false;
  function cancel(): void {
    generation++;
    if (timer !== null) clock!.clearTimeout(timer);
    timer = null; wake?.(); wake = null; finishing = null; drawing = null;
  }
  function sleep(duration: number): Promise<void> {
    return new Promise(resolve => { wake = resolve; timer = clock!.setTimeout(() => { timer = null; wake = null; resolve(); }, duration); });
  }
  function center(scene: CenterScene): void {
    indicator.dataset.scene = scene; indicator.innerHTML = centralScene(scene, current);
  }
  function light(index: number): void { lamps.forEach((lamp, i) => lamp.classList.toggle('active', i === index)); }
  function disableInputs(): void { coin.disabled = true; restart.disabled = true; hands.forEach(button => { button.disabled = true; }); }
  function revealPrize(view: GameView): void {
    if (!view.result) return;
    const stop = prizeWindow(windowValues, view);
    center('payout'); light(stop); prize.innerHTML = medalDigits(view.result.payout);
    const description = `配当${view.result.payout}枚。精算して次へ進みます。残高${view.balance}枚`;
    statusText.textContent = description; machine.setAttribute('aria-label', `JanPon。${description}`);
    ring.setAttribute('aria-label', `${description}。配当窓${lamps.length}個`);
    prize.style.color = lamps[stop]?.getAttribute('fill') ?? '';
  }
  function enableHands(): void {
    if (machine.isConnected === false) return;
    if (!drawComplete) presentationCue(root, 'draw-restart');
    drawComplete = true; drawRequested = false; claimed = false; center('draw-ready');
    hands.forEach(button => { button.disabled = !current?.choices.some(choice => choice.kind === 'hand' && choice.hand === button.dataset.hand); });
  }

  function activate(expected: Choice): void {
    if (appStatus !== 'ready' || claimed || !current) return;
    const index = current.choices.findIndex(choice => choice.kind === expected.kind && (choice.kind !== 'hand' || expected.kind === 'hand' && choice.hand === expected.hand));
    if (index < 0) return;
    claimed = true; drawComplete = false; drawRequested = expected.kind === 'hand'; disableInputs(); choose(index);
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
  restart.innerHTML = controlIcon('repeat'); retryButton.innerHTML = controlIcon('repeat');

  function render(view: GameView | null, status: AppStatus, reason: string): void {
    // A pending write is not a new scene or a new balance. Keep the last public view.
    if (status === 'busy' && ['ready', 'busy'].includes(appStatus) && view && current && JSON.stringify(view) === JSON.stringify(current)) {
      appStatus = status; claimed = true; disableInputs(); retryButton.disabled = true;
      machine.dataset.waiting = 'false'; coin.setAttribute('aria-label', '現在は追加投入できません'); return;
    }
    cancel(); current = view; appStatus = status; claimed = false; resultComplete = false; disableInputs();
    const blocked = status === 'stopped' || status === 'other-tab' || status === 'closed';
    const ready = status === 'ready' && view !== null;
    const result = view?.result;
    if (view?.phase !== 'choosing' || result?.outcome !== 'draw') drawComplete = false;
    const waitingDraw = ready && view.phase === 'choosing' && result?.outcome === 'draw' && drawRequested && !drawComplete;
    const inResult = result && (view?.phase === 'result' || view?.phase === 'choosing' && result.outcome === 'draw');
    let description = '保存されたゲームを確認中です';
    if (view) {
      if (view.phase === 'idle') { description = 'コインと残高の周辺を押して1枚投入してください'; }
      if (view.phase === 'choosing') { description = 'グー、チョキ、パーから手を選んでください。追加投入はできません'; }
      if (inResult) {
        const outcomes = { draw: 'あいこです。追加投入なしでもう一度手を選びます', win: '勝ちです。ルーレットは自動で止まり、配当を表示して精算します', loss: '負けです。精算して次へ進みます' };
        description = `あなたは${labels[result.player]}、相手は${labels[result.opponent]}。${outcomes[result.outcome]}`;
      }
      if (view.phase === 'game-over') { description = `ゲームオーバーです。はじめからを押すと${SPEC.initialBalance}枚で新しいゲームを始めます`; }
    }
    if (status === 'stopped') { description = '保存または復元を確認できないため停止しました。保存は消しません。再読み込みして再試行できます'; }
    if (status === 'other-tab') { description = '別のタブでプレイ中です。そのタブを閉じてから、再読み込みして再試行してください'; }
    if (status === 'closed') { description = 'ゲームを停止しました。再開するにはページを再読み込みしてください'; }
    if (reason) description += `。詳細: ${reason}`;
    balance.innerHTML = view ? medalDigits(view.balance) : '';
    balance.setAttribute('aria-label', view ? `メダル残高${view.balance}枚` : 'メダル残高。未確認');
    prize.textContent = ''; light(-1);
    center(waitingDraw ? 'draw' : sceneFor(view, status)); display.classList.toggle('problem', blocked);
    machine.dataset.phase = blocked ? status : view?.phase ?? 'loading';
    machine.dataset.outcome = inResult ? result.outcome : '';
    machine.setAttribute('aria-label', `JanPon。${description}`);
    ring.setAttribute('aria-label', `${description}。配当窓${lamps.length}個`);
    statusText.textContent = `${description}。${view ? `残高${view.balance}枚` : '残高は未確認です'}`;
    coin.disabled = !ready || !view.choices.some(choice => choice.kind === 'coin');
    coin.setAttribute('aria-label', !coin.disabled ? `コインと残高の周辺を押して1枚投入。現在${view?.balance}枚` : '現在は追加投入できません');
    machine.dataset.waiting = String(!coin.disabled);
    restart.hidden = blocked || view?.phase !== 'game-over';
    restart.disabled = !ready || !view.choices.some(choice => choice.kind === 'restart');
    restart.setAttribute('aria-label', `はじめから。${SPEC.initialBalance}枚で新しいゲームを始める`);
    retryButton.hidden = !['stopped', 'other-tab'].includes(status); retryButton.disabled = retryButton.hidden;
    hands.forEach(button => {
      button.disabled = !ready || waitingDraw || !view.choices.some(choice => choice.kind === 'hand' && choice.hand === button.dataset.hand);
      button.setAttribute('aria-pressed', String(!!inResult && result.player === button.dataset.hand));
    });
  }
  function holdDraw(): Promise<void> {
    if (drawComplete) return Promise.resolve();
    if (drawing) return drawing;
    cancel(); const run = generation;
    claimed = true; disableInputs(); center('draw');
    drawing = sleep(ENGINE.drawDurationMs).then(() => {
      if (run === generation && appStatus === 'ready' && current?.phase === 'choosing' && current.result?.outcome === 'draw') enableHands();
    });
    return drawing;
  }
  async function animate(view: GameView): Promise<void> {
    if (!view.result || appStatus !== 'ready' || view.phase !== 'result' && !(view.phase === 'choosing' && view.result.outcome === 'draw')) return;
    if (view.result.outcome === 'draw') { drawRequested = true; await holdDraw(); return; }
    cancel(); const run = generation, result = view.result;
    claimed = true; disableInputs(); center(result.outcome === 'win' ? 'roulette' : result.outcome);
    if (result.outcome !== 'win') {
      await sleep(ENGINE.resultDurationMs);
      if (run !== generation) { await finishing; return; }
      resultComplete = true; return;
    }
    for (const frame of rouletteFrames(windowValues, view)) {
      if (run !== generation) { await finishing; return; }
      light(frame.index);
      await sleep(frame.duration);
    }
    if (run !== generation) { await finishing; return; }
    indicator.dataset.payoutMotion = 'release'; revealPrize(view);
    await sleep(EFFECTS.payoutDurationMs[result.payout as keyof typeof EFFECTS.payoutDurationMs] ?? ENGINE.drawDurationMs);
    if (run !== generation) await finishing;
    else { resultComplete = true; indicator.dataset.payoutMotion = 'static'; }
  }
  function finishPresentation(): Promise<void> {
    if (appStatus === 'ready' && current?.phase === 'choosing' && current.result?.outcome === 'draw') return drawing || drawRequested ? holdDraw() : Promise.resolve();
    if (finishing) return finishing;
    if (resultComplete || appStatus !== 'ready') return Promise.resolve();
    cancel();
    if (appStatus !== 'ready' || !current?.result || current.phase !== 'result' && current.result.outcome !== 'draw') return Promise.resolve();
    if (current.result.outcome === 'win' && current.phase === 'result') {
      indicator.dataset.payoutMotion = 'static'; revealPrize(current);
    } else center(current.result.outcome);
    claimed = true; disableInputs();
    const run = generation;
    finishing = sleep(ENGINE.drawDurationMs).then(() => { if (run === generation) resultComplete = true; });
    return finishing;
  }
  return { render, bind(onChoose, onRetry) { choose = onChoose; retry = onRetry; }, animate, request: activate, finishPresentation };
}
