import { FormEvent, useEffect, useMemo, useState, useCallback } from 'react';

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
type Pick = { playerId: string; playerName: string; position: Position | null; team: string | null; pickNo: number; round: number; draftSlot: number; rosterId: number; isManual?: boolean };
type State = { config: { draftId: string; name: string; teams: number; rounds: number; rosterPositions: string[]; scoringType: string; receptionPoints: number; pickTimer: number | null; myRosterId: number; slotToRosterId: Record<string, number>; rosterNames: Record<string, string>; mode?: 'live' | 'demo' }; picks: Pick[]; refreshedAt: string; live: boolean; error?: string; finished?: boolean };
type Rec = { player: { sleeperId: string; fullName: string; position: Position | null; team: string | null; consensusRank: number; tier: string | null; mockAdp: number | null; evidenceCount: number }; score: number; survivalChance: number; reason: string };
type BoardSuggestion = { rosterId: number; playerId: string; playerName: string; position: Position | null; team: string | null; consensusRank: number; reason: string };
type UserLeague = { leagueId: string; name: string; season: string; scoringType: string; receptionPoints: number; totalRosters: number; rosterPositions: string[]; draftId?: string; draftStatus?: string };
type StrategyInfo = { name: string; description: string; strength: number; nextPickAdvice: string; selectedId?: string };
type StrategyOption = { id: string; name: string; description: string };
type AdpBargain = { player: { sleeperId: string; fullName: string; position: Position | null; team: string | null; consensusRank: number; mockAdp: number | null; tier: string | null }; adpDiff: number; label: string };
type SearchResult = { sleeperId: string; fullName: string; position: Position | null; team: string | null; consensusRank: number; score: number; tier: string | null; mockAdp: number | null; byeWeek?: number | null };
type ByeWeekData = { byeMap: Record<number, string[]>; conflicts: { week: number; players: string[]; warning: string }[] };

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => { const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options }); const body = await r.json(); if (!r.ok) throw new Error(body.error ?? 'İstek başarısız'); return body; };

const tierColors: Record<string, string> = {
  '1. Tur': '#ff6b6b', '2. Tur': '#ff8e53', '3. Tur': '#feca57', '4. Tur': '#48dbfb',
  '5. Tur': '#0abde3', '6. Tur': '#1dd1a1', '7. Tur': '#10ac84', '8. Tur': '#5f27cd',
  '9. Tur': '#341f97', '10+': '#8395a7',
};
const getTierColor = (tier: string | null) => {
  if (!tier) return '#8395a7';
  for (const [key, color] of Object.entries(tierColors)) { if (tier.includes(key.replace('. Tur', ''))) return color; }
  return '#8395a7';
};

function App() {
  const [state, setState] = useState<State | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [boardSuggestions, setBoardSuggestions] = useState<Record<string, BoardSuggestion>>({});
  const [strategy, setStrategy] = useState<StrategyInfo | null>(null);
  const [bargains, setBargains] = useState<AdpBargain[]>([]);
  const [byeData, setByeData] = useState<ByeWeekData | null>(null);
  const [message, setMessage] = useState('Kullanıcı adını gir, liglerini getir, sonra draft modu seç.');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!state) return;
    try {
      const next = await api<State>('/api/draft-state'); setState(next);
      const [r, suggestions, strat, barg, bye] = await Promise.all([
        api<{ recommendations: Rec[] }>('/api/recommendations'),
        api<Record<string, BoardSuggestion>>('/api/board-suggestions'),
        api<StrategyInfo>('/api/strategy'),
        api<AdpBargain[]>('/api/adp-bargains'),
        api<ByeWeekData>('/api/bye-weeks'),
      ]);
      setRecs(r.recommendations); setBoardSuggestions(suggestions); setStrategy(strat); setBargains(barg); setByeData(bye);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Bağlantı güncellenemedi'); }
  };
  useEffect(() => { if (!state) return; const id = window.setInterval(refresh, 2500); return () => window.clearInterval(id); }, [state]);
  useEffect(() => { if (state) refresh(); }, [state?.config.draftId]);

  const myPicks = useMemo(() => state?.picks.filter(p => p.rosterId === state.config.myRosterId) ?? [], [state]);
  const currentPick = (state?.picks.length ?? 0) + 1;
  return <main>
    <header>
      <div>
        <p className="eyebrow">SLEEPER • YEREL DRAFT ASİSTANI</p>
        <h1>Kararı veriye bırak, seçimi sen yap.</h1>
      </div>
      <div className={`status ${state?.live === false ? 'offline' : ''}`}>
        {state ? (state.live ? '● Canlı takip açık' : '● Son board görüntüleniyor (Sleeper bağlantısı kesik)') : '○ Henüz bir drafta bağlanmadın'}
      </div>
    </header>
    <Setup onConnect={async form => { setLoading(true); try { const next = await api<State>('/api/connect', { method: 'POST', body: JSON.stringify(form) }); setState(next); setMessage(`${next.config.name} bağlandı (${next.config.scoringType.toUpperCase()}).`); } catch (e) { setMessage(errorMessage(e)); } finally { setLoading(false); } }} onDemo={async (config) => { setLoading(true); try { const next = await api<State>('/api/demo', { method: 'POST', body: JSON.stringify(config) }); setState(next); setMessage(`Demo draftı açıldı (${next.config.scoringType.toUpperCase()}, ${next.config.teams} takım).`); } catch (e) { setMessage(errorMessage(e)); } finally { setLoading(false); } }} />
      <p className="notice">{message}</p>
      {state && <Dashboard state={state} recs={recs} boardSuggestions={boardSuggestions} myPicks={myPicks} currentPick={currentPick} onRefresh={refresh} onError={setMessage} strategy={strategy} bargains={bargains} byeData={byeData} />}
   
  </main>;
}

function Setup({ onConnect, onDemo }: { onConnect: (form: Record<string, unknown>) => void; onDemo: (config: any) => void }) {
  const [step, setStep] = useState<'username' | 'leagues' | 'connect'>('username');
  const [username, setUsername] = useState('zeOtheBest');
  const [leagues, setLeagues] = useState<UserLeague[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<UserLeague | null>(null);
  const [mode, setMode] = useState<'live' | 'mock'>('live');
  const [draftId, setDraftId] = useState('');
  const [rosterId, setRosterId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stepMessage, setStepMessage] = useState('');
  const [directDraftId, setDirectDraftId] = useState('');
  const [directRosterId, setDirectRosterId] = useState('');

  const connectByDraftId = () => {
    const raw = directDraftId.trim();
    const id = raw.includes('/') ? (raw.split('?')[0].split('/').filter(Boolean).pop() ?? raw) : raw.split('?')[0];
    if (!id) { setStepMessage('Draft ID veya draft linki gir.'); return; }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { draftId: id, username: username.trim() || undefined };
      if (directRosterId.trim()) payload.myRosterId = Number(directRosterId.trim());
      onConnect(payload);
    } finally { setSubmitting(false); }
  };

  const fetchLeagues = async () => {
    setFetching(true); setStepMessage('Ligler getiriliyor...');
    try {
      const data = await api<UserLeague[]>(`/api/user-leagues?username=${encodeURIComponent(username)}`);
      setLeagues(data);
      if (data.length === 0) { setStepMessage(`Bu kullanıcı için aktif lig bulunamadı (${new Date().getFullYear()} sezonu).`); }
      else { setStep('leagues'); setStepMessage(`${data.length} lig bulundu. Birini seç.`); }
    } catch (e) { setStepMessage(errorMessage(e)); }
    finally { setFetching(false); }
  };

  const handleLeagueSelect = (league: UserLeague) => {
    setSelectedLeague(league);
    setStep('connect');
    setStepMessage(`Seçilen: ${league.name} — ${league.scoringType.toUpperCase()} (${league.receptionPoints} pt/rec), ${league.totalRosters} takım`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLeague) return;
    setSubmitting(true);
    try {
      if (mode === 'live') {
        onConnect({ leagueId: selectedLeague.leagueId, username });
      } else {
        onDemo({ leagueId: selectedLeague.leagueId, username, scoringType: selectedLeague.scoringType, receptionPoints: selectedLeague.receptionPoints, rosterPositions: selectedLeague.rosterPositions, totalRosters: selectedLeague.totalRosters });
      }
    } finally { setSubmitting(false); }
  };

  return (
    <section className="setup">
      <div className="setup-left">
        {step === 'username' && (
          <div className="step-card">
            <div className="step-header">
              <span className="step-number">1</span>
              <h2>Sleeper Kullanıcı Adı</h2>
            </div>
            <p className="step-desc">Liglerini görmek için kullanıcı adını gir.</p>
            <div className="input-group">
              <label>
                <span>Kullanıcı adı</span>
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="zeOtheBest" disabled={fetching} />
              </label>
            </div>
            <button className="btn-primary" onClick={fetchLeagues} disabled={fetching || !username.trim()} aria-busy={fetching}>
              {fetching ? <><span className="spinner" aria-hidden="true"></span>Yükleniyor...</> : 'Ligleri Getir'}
            </button>
            {stepMessage && <p className="step-hint">{stepMessage}</p>}

            <div className="info-divider"></div>
            <p className="step-desc">Mock draft mı yapıyorsun? Lig listesinde çıkmaz — <strong>draft linkini/ID'sini</strong> buraya yapıştır.</p>
            <div className="input-group">
              <label>
                <span>Draft ID veya link</span>
                <input value={directDraftId} onChange={e => setDirectDraftId(e.target.value)} placeholder="https://sleeper.com/draft/nfl/1400565179367817216" disabled={submitting} />
              </label>
            </div>
            <div className="input-group">
              <label>
                <span>Kendi Roster ID (kullanıcı adıyla bulunamazsa)</span>
                <input type="number" value={directRosterId} onChange={e => setDirectRosterId(e.target.value)} placeholder="Örn: 6" disabled={submitting} />
              </label>
            </div>
            <button className="btn-primary" onClick={connectByDraftId} disabled={submitting || !directDraftId.trim()} aria-busy={submitting}>
              {submitting ? <><span className="spinner" aria-hidden="true"></span>Bağlanıyor...</> : 'Draft ID ile Canlı Bağlan'}
            </button>
          </div>
        )}

        {step === 'leagues' && (
          <div className="step-card">
            <div className="step-header">
              <span className="step-number">2</span>
              <h2>Liglerini Seç</h2>
            </div>
            <p className="step-desc">Kullanıcı: <strong>{username}</strong> — {leagues.length} lig bulundu.</p>
            <div className="league-grid">
              {leagues.map(l => (
                <button key={l.leagueId} className="league-card" onClick={() => handleLeagueSelect(l)}>
                  <div className="league-main">
                    <h3>{l.name}</h3>
                    <div className="league-meta">
                      <span className="badge">{l.season}</span>
                      <span className={`badge badge-${l.scoringType}`}>{l.scoringType.toUpperCase()}</span>
                      <span className="badge">{l.totalRosters} takım</span>
                    </div>
                  </div>
                  <div className="league-roster">
                    {l.rosterPositions.slice(0, 8).map((pos, i) => <span key={i} className="pos-tag">{pos}</span>)}
                    {l.rosterPositions.length > 8 && <span className="pos-tag more">+{l.rosterPositions.length - 8}</span>}
                  </div>
                  {l.draftStatus && <span className="draft-status">{l.draftStatus}</span>}
                </button>
              ))}
            </div>
            <button className="btn-secondary" onClick={() => setStep('username')}>← Kullanıcı değiştir</button>
            {stepMessage && <p className="step-hint success">{stepMessage}</p>}
          </div>
        )}

        {step === 'connect' && selectedLeague && (
          <div className="step-card">
            <div className="step-header">
              <span className="step-number">3</span>
              <h2>Draft Modu</h2>
            </div>
            <div className="selected-league-summary">
              <strong>{selectedLeague.name}</strong>
              <div className="league-meta">
                <span className={`badge badge-${selectedLeague.scoringType}`}>{selectedLeague.scoringType.toUpperCase()}</span>
                <span className="badge">{selectedLeague.receptionPoints} pt/rec</span>
                <span className="badge">{selectedLeague.totalRosters} takım</span>
              </div>
            </div>
            <div className="mode-toggle" role="radiogroup" aria-label="Draft modu">
              <button role="radio" aria-checked={mode === 'live'} className={mode === 'live' ? 'active' : ''} onClick={() => setMode('live')}>
                <span className="mode-icon">🟢</span>
                <div><strong>Canlı Draft</strong><small>Gerçek Sleeper draftına bağlan</small></div>
              </button>
              <button role="radio" aria-checked={mode === 'mock'} className={mode === 'mock' ? 'active' : ''} onClick={() => setMode('mock')}>
                <span className="mode-icon">🧪</span>
                <div><strong>Mock Draft Testi</strong><small>Bu ligin ayarlarıyla simülasyon</small></div>
              </button>
            </div>

            {mode === 'live' && (
              <div className="input-group">
                <label>
                  <span>Sleeper kullanıcı adı</span>
                  <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Otomatik roster bulunur" />
                </label>
              </div>
            )}

            {mode === 'mock' && (
              <>
                <div className="input-group">
                  <label>
                    <span>Draft ID (opsiyonel)</span>
                    <input value={draftId} onChange={e => setDraftId(e.target.value)} placeholder="Boş bırakılırsa ligden alınır" />
                  </label>
                </div>
                <div className="input-group">
                  <label>
                    <span>Kendi Roster ID (kullanıcı adıyla bulunamazsa)</span>
                    <input type="number" value={rosterId} onChange={e => setRosterId(e.target.value)} placeholder="Örn: 1" />
                  </label>
                </div>
              </>
            )}

            <form onSubmit={submit}>
              <button className="btn-primary full-width" disabled={submitting} aria-busy={submitting}>
                {submitting ? <><span className="spinner" aria-hidden="true"></span>Bağlanıyor...</> : (mode === 'mock' ? 'Mock Draft Başlat' : 'Canlı Drafta Bağlan')}
              </button>
            </form>
            <button className="btn-secondary full-width" onClick={() => setStep('leagues')}>← Lig değiştir</button>
            {stepMessage && <p className="step-hint">{stepMessage}</p>}
          </div>
        )}
      </div>

      <aside className="setup-right">
        <div className="info-panel">
          <h3>Nasıl Çalışır?</h3>
          <ol>
            <li><strong>Kullanıcı adını gir</strong> — Sleeper API'den liglerini çekeriz</li>
            <li><strong>Lig seç</strong> — PPR/half-PPR/standard, roster, takım sayısı otomatik dolu</li>
            <li><strong>Mod seç</strong> — Canlı (gerçek) veya Mock (simülasyon)</li>
            <li><strong>Başla</strong> — Öneriler, board, kadro hepsi lig ayarlarına göre</li>
          </ol>
          <div className="info-divider"></div>
          <h3>Özellikler</h3>
          <ul>
            <li>2.5 sn'de bir canlı pick takibi</li>
            <li>"SIRA SENDE" anlık uyarısı</li>
            <li>5 en iyi öneri (değer + ihtiyaç + nadirlik + hayatta kalma)</li>
            <li>Tüm takımların tahmini pick'leri</li>
            <li>Strateji tespiti (Zero RB, Hero RB vs.)</li>
            <li>ADP fırsatları ve kelepir oyuncular</li>
            <li>Bye week çakışma uyarısı</li>
            <li>Tier bazlı renkli gruplandırma</li>
            <li>Oyuncu arama ve filtreleme</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}

function Dashboard({ state, recs, boardSuggestions, myPicks, currentPick, onRefresh, onError, strategy, bargains, byeData }: { state: State; recs: Rec[]; boardSuggestions: Record<string, BoardSuggestion>; myPicks: Pick[]; currentPick: number; onRefresh: () => void; onError: (msg: string) => void; strategy: StrategyInfo | null; bargains: AdpBargain[]; byeData: ByeWeekData | null }) {
  const isMyTurn = !state.finished && currentPick <= state.config.teams * state.config.rounds && pickSlot(currentPick, state.config.teams) === mySlot(state);
  const onClockSlot = currentPick <= state.config.teams * state.config.rounds ? pickSlot(currentPick, state.config.teams) : null;
  const onClockRoster = onClockSlot ? state.config.slotToRosterId[String(onClockSlot)] : null;
  const onClockName = onClockRoster ? state.config.rosterNames[String(onClockRoster)] ?? `Takım ${onClockSlot}` : 'Draft bitti';
  const counts = Object.fromEntries(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(position => [position, myPicks.filter(p => p.position === position).length]));
  const [stratOpts, setStratOpts] = useState<StrategyOption[]>([]);
  const [askStrategy, setAskStrategy] = useState(true);
  const [savingStrat, setSavingStrat] = useState(false);
  useEffect(() => { api<StrategyOption[]>('/api/strategies').then(setStratOpts).catch(() => {}); }, []);
  const chooseStrategy = async (id: string) => {
    setSavingStrat(true);
    try { await api('/api/strategy', { method: 'POST', body: JSON.stringify({ id }) }); setAskStrategy(false); onRefresh(); }
    catch (e) { onError(errorMessage(e)); }
    finally { setSavingStrat(false); }
  };
  const currentStratName = stratOpts.find(o => o.id === (strategy?.selectedId ?? 'bpa'))?.name ?? 'Taktik Yok (BPA)';
  return <>
    {askStrategy && stratOpts.length > 0 && (
      <div className="strat-modal-backdrop" onClick={() => setAskStrategy(false)}>
        <div className="strat-modal" onClick={e => e.stopPropagation()}>
          <h2>Bu draft için taktiğini seç</h2>
          <p className="strat-modal-sub">İstersen taktiksiz başla; draft sırasında bu pencereyi tekrar açıp değiştirebilirsin. Öneriler seçtiğin plana göre ağırlıklandırılır.</p>
          <div className="strat-list">
            {stratOpts.map(o => (
              <button key={o.id} className={`strat-card ${(strategy?.selectedId ?? 'bpa') === o.id ? 'active' : ''}`} disabled={savingStrat} onClick={() => chooseStrategy(o.id)}>
                <strong>{o.name}</strong>
                <span>{o.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
    <section className="metrics">
      <Metric label="Şu anki pick" value={state.finished ? 'Bitti' : `${Math.ceil(currentPick / state.config.teams)}.${String((currentPick - 1) % state.config.teams + 1).padStart(2, '0')}`} />
      <Metric label="Sıra kimde" value={state.finished ? 'Draft bitti' : onClockName} />
      <Metric label="Senin slotun" value={`#${mySlot(state) ?? '—'}`} />
      <Metric label="Skor formatı" value={state.config.scoringType.toUpperCase()} />
    </section>

    <div className="strat-chip">
      <span>Taktik: <strong>{currentStratName}</strong></span>
      <button onClick={() => setAskStrategy(true)}>Değiştir</button>
    </div>

    {strategy && strategy.name !== 'Early Rounds' && (
      <div className="strategy-banner">
        <div className="strategy-info">
          <span className="strategy-label">Stratejin:</span>
          <span className="strategy-name" style={{ color: strategy.strength > 70 ? '#6de2af' : strategy.strength > 40 ? '#feca57' : '#ff6b6b' }}>{strategy.name}</span>
          <span className="strategy-desc">{strategy.description}</span>
        </div>
        <div className="strategy-advice">
          <small>Öneri:</small> {strategy.nextPickAdvice}
        </div>
        <div className="strategy-bar"><div className="strategy-fill" style={{ width: `${Math.min(100, strategy.strength)}%`, background: strategy.strength > 70 ? '#6de2af' : strategy.strength > 40 ? '#feca57' : '#ff6b6b' }}></div></div>
      </div>
    )}

    {isMyTurn && <div className="your-turn">SIRA SENDE — en üstteki öneriyi kontrol et ve Sleeper'dan manuel seç.</div>}

    {byeData && byeData.conflicts.length > 0 && (
      <div className="bye-warning">
        <strong>⚠️ Bye Week Çakışması!</strong>
        {byeData.conflicts.map(c => (
          <div key={c.week} className="bye-conflict">
            <span className="bye-week-badge">Hafta {c.week}</span>
            {c.players.join(', ')} — {c.warning}
          </div>
        ))}
      </div>
    )}

    {bargains.length > 0 && (
      <section className="bargains-section">
        <h2>ADP Fırsatları</h2>
        <div className="bargains-grid">
          {bargains.map(b => (
            <div className={`bargain-card ${b.adpDiff >= 20 ? 'mega' : b.adpDiff >= 12 ? 'big' : ''}`} key={b.player.sleeperId}>
              <div className="bargain-rank">#{b.player.consensusRank}</div>
              <div className="bargain-info">
                <strong>{b.player.fullName}</strong>
                <small>{b.player.position} · {b.player.team ?? 'FA'} · ADP #{b.player.mockAdp}</small>
              </div>
              <div className="bargain-diff">
                <span className="diff-badge">-{b.adpDiff}</span>
                <span className="diff-label">{b.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    )}

    <section className="grid">
      <article className="panel recommendations">
        <h2>Şimdi Al</h2>
        {recs.map((rec, i) => (
          <div className={`recommendation ${i === 0 ? 'best' : ''}`} key={rec.player.sleeperId}>
            <span className="rank">{i + 1}</span>
            <div>
              <div className="rec-header">
                <strong>{rec.player.fullName}</strong>
                {rec.player.tier && <span className="tier-badge" style={{ background: getTierColor(rec.player.tier) + '22', color: getTierColor(rec.player.tier), borderColor: getTierColor(rec.player.tier) + '44' }}>{rec.player.tier}</span>}
              </div>
              <small>{rec.player.position} · {rec.player.team ?? 'FA'} · Consensus #{rec.player.consensusRank} {rec.player.mockAdp ? `· ADP #${rec.player.mockAdp}` : ''}</small>
              <p>{rec.reason}</p>
            </div>
            <div className="score"><b>{Math.round(rec.score)}</b><small>Skor<br />{Math.round(rec.survivalChance * 100)}% kalır</small></div>
          </div>
        ))}
      </article>
      <article className="panel">
        <h2>Senin Kadro</h2>
        <div className="position-counts">
          {Object.entries(counts).map(([position, count]) => <span key={position}><b>{position}</b><strong>{count}</strong></span>)}
        </div>
        <h3>Lig Ayarı</h3>
        <p>{state.config.teams} takım · {state.config.rounds} tur · {state.config.rosterPositions.join(', ') || 'Sleeper roster slotu bekleniyor'}</p>
        {state.config.mode === 'demo' ? <DemoControls onReset={onRefresh} onFinish={onRefresh} finished={state.finished} onSimulate={async () => { try { await api('/api/mock-simulate', { method: 'POST' }); onRefresh(); } catch (e) { onError(errorMessage(e)); } }} /> : <p className="live-note">Canlı draft verisiyle güncelleniyor (2.5 sn).</p>}
        <ManualPick state={state} currentPick={currentPick} onSaved={onRefresh} />
      </article>
    </section>

    <PlayerSearchPanel state={state} />
    <DraftBoard state={state} currentPick={currentPick} suggestions={boardSuggestions} />
  </>;
}

function PlayerSearchPanel({ state }: { state: State }) {
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const taken = useMemo(() => new Set(state.picks.map(p => p.playerId)), [state.picks]);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (posFilter) params.set('position', posFilter);
      const data = await api<{ players: SearchResult[] }>(`/api/player-search?${params}`);
      setResults(data.players.filter(p => !taken.has(p.sleeperId)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [query, posFilter, taken]);

  useEffect(() => { const id = setTimeout(search, 300); return () => clearTimeout(id); }, [query, posFilter]);

  return (
    <section className="player-search">
      <h2>Oyuncu Ara</h2>
      <div className="search-controls">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="İsim veya takım ara..." className="search-input" />
        <div className="pos-filters">
          {['', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(pos => (
            <button key={pos} className={`pos-btn ${posFilter === pos ? 'active' : ''}`} onClick={() => setPosFilter(pos)}>{pos || 'Tümü'}</button>
          ))}
        </div>
      </div>
      {loading && <p className="search-loading">Aranıyor...</p>}
      <div className="search-results">
        {results.slice(0, 20).map(p => (
          <div className={`search-card ${taken.has(p.sleeperId) ? 'taken' : ''}`} key={p.sleeperId}>
            <div className="search-rank">#{p.consensusRank}</div>
            <div className="search-info">
              <strong>{p.fullName}</strong>
              <small>{p.position} · {p.team ?? 'FA'}</small>
            </div>
            <div className="search-meta">
              {p.tier && <span className="tier-tag" style={{ color: getTierColor(p.tier) }}>{p.tier}</span>}
              {p.mockAdp && <span className="adp-tag">ADP #{p.mockAdp}</span>}
              {p.byeWeek && p.position !== 'K' && p.position !== 'DEF' && <span className="bye-tag">Bye {p.byeWeek}</span>}
            </div>
          </div>
        ))}
        {results.length === 0 && !loading && <p className="search-empty">Sonuç bulunamadı.</p>}
      </div>
    </section>
  );
}

const Metric = ({ label, value }: { label: string; value: string }) => <div><small>{label}</small><b>{value}</b></div>;
function DraftBoard({ state, currentPick, suggestions }: { state: State; currentPick: number; suggestions: Record<string, BoardSuggestion> }) {
  const picks = new Map(state.picks.map(p => [`${p.round}-${p.draftSlot}`, p]));
  const slots = Array.from({ length: state.config.teams }, (_, i) => i + 1);
  const rounds = Array.from({ length: state.config.rounds }, (_, i) => i + 1);
  return <article className="panel board"><div className="board-title"><div><h2>Canlı Draft Board</h2><p>Yeşil sütun senin takımın. Parlayan hücre sıradaki seçim.</p></div><small>Son güncelleme: {new Date(state.refreshedAt).toLocaleTimeString('tr-TR')}</small></div><div className="draft-grid" style={{ gridTemplateColumns: `58px repeat(${state.config.teams}, minmax(128px, 1fr))` }}><div className="corner">Tur</div>{slots.map(slot => { const rosterId = state.config.slotToRosterId[String(slot)]; const mine = rosterId === state.config.myRosterId; return <div className={`team-head ${mine ? 'mine' : ''}`} key={slot}><small>Slot {slot}</small><b>{state.config.rosterNames[String(rosterId)] ?? `Takım ${slot}`}</b></div>; })}{rounds.flatMap(round => [<div className="round" key={`round-${round}`}>{round}</div>, ...slots.map(slot => { const pick = picks.get(`${round}-${slot}`); const pickNo = (round - 1) * state.config.teams + (round % 2 ? slot : state.config.teams - slot + 1); const rosterId = state.config.slotToRosterId[String(slot)]; const mine = rosterId === state.config.myRosterId; const onClock = pickNo === currentPick; const suggestion = suggestions[String(rosterId)]; return <div className={`draft-cell ${mine ? 'mine' : ''} ${onClock ? 'on-clock' : ''}`} key={`${round}-${slot}`}>{pick ? <><b>{pick.playerName}</b><small>{pick.position} · {pick.team ?? 'FA'} · #{pickNo}{pick.isManual ? ' · manuel' : ''}</small></> : <>{onClock ? <b>SIRADA</b> : suggestion ? <b className="forecast">{suggestion.playerName}</b> : <b>—</b>}<small>{onClock ? `${suggestion?.position ?? ''} · öneri: ${suggestion?.playerName ?? 'bekleniyor'}` : `öngörü · #${pickNo}`}</small></>}</div>; })])}</div>{state.error && <p className="error">Sleeper: {state.error}. Son board korunuyor; gerekirse manuel seçim ekle.</p>}</article>;
}
const mySlot = (state: State) => { const found = Object.entries(state.config.slotToRosterId).find(([, roster]) => Number(roster) === state.config.myRosterId)?.[0]; return found ? Number(found) : null; };
const pickSlot = (pickNo: number, teams: number) => { const r = Math.ceil(pickNo / teams); const within = (pickNo - 1) % teams + 1; return r % 2 ? within : teams - within + 1; };
const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Beklenmeyen hata';
function ManualPick({ state, currentPick, onSaved }: { state: State; currentPick: number; onSaved: () => void }) {
  const [sleeperId, setSleeperId] = useState('');
  const [rosterId, setRosterId] = useState(String(state.config.myRosterId));
  const [note, setNote] = useState('');
  const [pickRecs, setPickRecs] = useState<Rec[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const round = Math.ceil(currentPick / state.config.teams);
  const slot = pickSlot(currentPick, state.config.teams);

  useEffect(() => {
    const fetchRecs = async () => {
      setLoadingRecs(true);
      try {
        const data = await api<{ recommendations: Rec[] }>(`/api/recommendations-for-pick?pickNo=${currentPick}`);
        setPickRecs(data.recommendations);
      } catch (e) {
        console.error('Pick önerileri alınamadı:', e);
      } finally {
        setLoadingRecs(false);
      }
    };
    fetchRecs();
  }, [currentPick, state?.config.draftId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/manual-picks', { method: 'POST', body: JSON.stringify({ pickNo: currentPick, sleeperId, rosterId: Number(rosterId), round, draftSlot: slot }) });
      setNote('Manuel seçim kaydedildi.');
      onSaved();
    } catch (err) {
      setNote(errorMessage(err));
    }
  };

  return (
    <form className="manual" onSubmit={handleSubmit}>
      <h3>Manuel Yedek Seçim</h3>
      <p>Sleeper gecikirse, mevcut pick'i burada işaretle.</p>
      <div className="manual-fields">
        <select value={sleeperId} onChange={e => setSleeperId(e.target.value)} required disabled={loadingRecs}>
          <option value="">{loadingRecs ? 'Yükleniyor...' : 'Önerilen oyuncu seç'}</option>
          {pickRecs.map(r => <option key={r.player.sleeperId} value={r.player.sleeperId}>{r.player.fullName} ({r.player.position}) #{r.player.consensusRank}</option>)}
        </select>
        <input aria-label="Roster ID" type="number" value={rosterId} onChange={e => setRosterId(e.target.value)} required />
      </div>
      <button type="submit" disabled={!sleeperId || loadingRecs}>Pick {currentPick} Kaydet</button>
      {note && <small className={note.includes('kaydedildi') ? 'success' : 'error'}>{note}</small>}
    </form>
  );
}
function DemoControls({ onReset, onFinish, finished, onSimulate }: { onReset: () => void; onFinish: () => void; finished?: boolean; onSimulate: () => void }) {
  const [busy, setBusy] = useState(false); const action = async (path: string) => { setBusy(true); try { await api(path, { method: 'POST' }); } finally { setBusy(false); } };
  return <div className="demo-controls"><button className="btn-secondary" disabled={busy} onClick={async () => { await action('/api/demo/reset'); onReset(); }}>Sıfırla</button><button className="btn-primary" disabled={busy || finished} onClick={async () => { await action('/api/demo/finish'); onFinish(); }}>{finished ? 'Draft Bitti' : 'Draftı Bitir'}</button><button className="btn-secondary" disabled={busy || finished} onClick={onSimulate}>Tümünü Simüle Et</button></div>;
}

export default App;
