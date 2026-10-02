// Thin wrapper around the HTML HUD, panels and modals.

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing element #' + id);
  return el as T;
};

export function fmtMoney(n: number): string {
  const v = Math.floor(n);
  return '$' + v.toLocaleString('en-US');
}

export const ui = {
  showHud(show: boolean): void {
    $('hud-top').classList.toggle('hidden', !show);
    $('hud-bottom').classList.toggle('hidden', !show);
  },
  setMoney(n: number): void {
    $('hud-money').textContent = fmtMoney(n);
  },
  setRating(r: number): void {
    const stars = Math.round((r / 100) * 5);
    $('hud-stars').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    $('hud-rating').textContent = 'Rating ' + Math.round(r);
    $('hud-stars').style.color = r < 30 ? '#ff6b6b' : '#ffd166';
  },
  setFloor(name: string, progress: string): void {
    $('hud-floor').textContent = name;
    $('hud-progress').textContent = progress;
  },
  setHint(text: string | null): void {
    const el = $('hud-hint');
    if (!text) {
      el.classList.add('hidden');
      return;
    }
    if (el.textContent !== text) el.textContent = text;
    el.classList.remove('hidden');
  },
  setButtonAttention(id: 'order' | 'build' | 'elevator' | 'player', on: boolean): void {
    $('btn-' + id).classList.toggle('attention', on);
  },
  onButton(id: 'order' | 'build' | 'elevator' | 'player' | 'pause', fn: () => void): void {
    $('btn-' + id).onclick = fn;
  },
  setStamina(frac: number, tired: boolean): void {
    const el = $('hud-stamina');
    el.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
    el.classList.toggle('tired', tired);
  },
  showSprintButton(show: boolean): void {
    $('btn-sprint').classList.toggle('hidden', !show);
  },
  sprintButton(): HTMLButtonElement {
    return $('btn-sprint') as HTMLButtonElement;
  },
  toast(text: string): void {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout((el as unknown as { _t?: number })._t);
    (el as unknown as { _t?: number })._t = window.setTimeout(() => el.classList.add('hidden'), 1400);
  },

  panelOpen(): boolean {
    return !$('panel').classList.contains('hidden');
  },
  openPanel(title: string, render: (body: HTMLElement) => void): void {
    $('panel-title').textContent = title;
    const body = $('panel-body');
    body.innerHTML = '';
    render(body);
    $('panel').classList.remove('hidden');
    $('panel-close').onclick = () => ui.closePanel();
  },
  refreshPanel(render: (body: HTMLElement) => void): void {
    if (!ui.panelOpen()) return;
    const body = $('panel-body');
    const scroll = body.scrollTop;
    body.innerHTML = '';
    render(body);
    body.scrollTop = scroll;
  },
  closePanel(): void {
    $('panel').classList.add('hidden');
  },

  modalOpen(): boolean {
    return !$('modal').classList.contains('hidden');
  },
  showModal(title: string, body: string, buttons: { label: string; style?: 'primary' | 'secondary' | 'danger'; onClick: () => void }[]): void {
    $('modal-title').textContent = title;
    $('modal-body').textContent = body;
    const wrap = $('modal-buttons');
    wrap.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      if (b.style && b.style !== 'primary') btn.classList.add(b.style);
      btn.onclick = () => {
        ui.closeModal();
        b.onClick();
      };
      wrap.appendChild(btn);
    }
    $('modal').classList.remove('hidden');
  },
  closeModal(): void {
    $('modal').classList.add('hidden');
  },

  row(opts: {
    color?: string;
    name: string;
    meta: string;
    button?: { label: string; disabled?: boolean; done?: boolean; onClick?: () => void };
    locked?: boolean;
  }): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row' + (opts.locked ? ' locked' : '');
    if (opts.color) {
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.style.background = opts.color;
      row.appendChild(sw);
    }
    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = opts.name;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = opts.meta;
    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(info);
    if (opts.button) {
      const b = document.createElement('button');
      b.className = 'buy' + (opts.button.done ? ' done' : '');
      b.textContent = opts.button.label;
      b.disabled = !!opts.button.disabled;
      if (opts.button.onClick) b.onclick = opts.button.onClick;
      row.appendChild(b);
    }
    return row;
  },
  sectionTitle(text: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'section-title';
    el.textContent = text;
    return el;
  },
  tip(text: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tip';
    el.textContent = text;
    return el;
  },

  showTitle(opts: { hasSave: boolean; onContinue: () => void; onNew: () => void }): void {
    let t = document.getElementById('title');
    if (t) t.remove();
    t = document.createElement('div');
    t.id = 'title';
    t.innerHTML = `
      <div style="font-size:64px">🏬</div>
      <h1>Mall Tycoon</h1>
      <p>Stock the shelves. Ring up customers. Buy every upgrade to unlock the next floor of the mall.</p>
    `;
    const play = document.createElement('button');
    play.textContent = opts.hasSave ? 'Continue' : 'Play';
    play.onclick = () => {
      t!.remove();
      opts.onContinue();
    };
    t.appendChild(play);
    if (opts.hasSave) {
      const fresh = document.createElement('button');
      fresh.className = 'secondary';
      fresh.textContent = 'Start a new mall';
      fresh.onclick = () => {
        ui.showModal('Start over?', 'This erases your current mall and money.', [
          { label: 'Yes, start over', style: 'danger', onClick: () => { t!.remove(); opts.onNew(); } },
          { label: 'Keep my mall', style: 'secondary', onClick: () => {} },
        ]);
      };
      t.appendChild(fresh);
    }
    const hint = document.createElement('p');
    hint.style.fontSize = '12px';
    hint.textContent = 'Phone: drag anywhere to walk.  Computer: WASD or arrow keys.';
    t.appendChild(hint);
    document.getElementById('app')!.appendChild(t);
  },
};
