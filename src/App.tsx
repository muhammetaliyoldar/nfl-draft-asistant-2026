import { FormEvent, useEffect, useMemo, useState } from 'react';

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
type Pick = { playerId: string; playerName: string; position: Position | null; team: string | null; pickNo: number; round: number; draftSlot: number; rosterId: number; isManual?: boolean };
type State = { config: { draftId: string; name: string; teams: number; rounds: number; rosterPositions: string[]; scoringType: string; receptionPoints: number; pickTimer: number | null; myRosterId: number; slotToRosterId: Record<string, number>; rosterNames: Record<string, string>; mode?: 'live' | 'demo' }; picks: Pick[]; refreshedAt: string; live: boolean; error?: string; finished?: boolean };
type Rec = { player: { sleeperId: string; fullName: string; position: Position | null; team: string | null; consensusRank: number; tier: string | null; mockAdp: number | null; evidenceCount: number }; score: number; survivalChance: number; reason: string };
type BoardSuggestion = { rosterId: number; playerId: string; playerName: string; position: Position | null; team: string | null; consensusRank: number; reason: string };
const api = async <T,>(path: string, options?: RequestInit): Promise<T> => { const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options }); const body = await r.json(); if (!r.ok) throw new Error(body.error ?? 'İstek başarısız'); return body; };

function App() {
  const [state, setState] = useState<State | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [boardSuggestions, setBoardSuggestions] = useState<Record<string, BoardSuggestion>>({});
  const [message, setMessage] = useState('Markdown kaynaklarını içe aktar, sonra Sleeper draftına bağlan.');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!state) return;
    try { const next = await api<State>('/api/draft-state'); setState(next); const [r, suggestions] = await Promise.all([api<{ recommendations: Rec[] }>('/api/recommendations'), api<Record<string, BoardSuggestion>>('/api/board-suggestions')]); setRecs(r.recommendations); setBoardSuggestions(suggestions); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Bağlantı güncellenemedi'); }
  };
  useEffect(() => { if (!state) return; const id = window.setInterval(refresh, 2500); return () => window.clearInterval(id); }, [state]);
  useEffect(() => { if (state) refresh(); }, [state?.config.draftId]);

  const myPicks = useMemo(() => state?.picks.filter(p => p.rosterId === state.config.myRosterId) ?? [], [state]);
  const currentPick = (state?.picks.length ?? 0) + 1;
  return <main>
    <header><div><p className="eyebrow">SLEEPER • YEREL DRAFT ASİSTANI</p><h1>Kararı veriye bırak, seçimi sen yap.</h1></div><div className={`status ${state?.live === false ? 'offline' : ''}`}>{state ? (state.live ? '● Canlı takip açık' : '● Son board görüntüleniyor') : '○ Bağlantı bekleniyor'}</div></header>
    <Setup onConnect={async form => { setLoading(true); try { const next = await api<State>('/api/connect', { method: 'POST', body: JSON.stringify(form) }); setState(next); setMessage(`${next.config.name} bağlandı.`); } catch (e) { setMessage(errorMessage(e)); } finally { setLoading(false); } }} onDemo={async () => { setLoading(true); try { const next = await api<State>('/api/demo', { method: 'POST' }); setState(next); setMessage('Demo draftı açıldı. Ranking verisi otomatik yüklendi.'); } catch (e) { setMessage(errorMessage(e)); } finally { setLoading(false); } }} loading={loading} />
      <p className="notice">{message}</p>
      {state && <Dashboard state={state} recs={recs} boardSuggestions={boardSuggestions} myPicks={myPicks} currentPick={currentPick} onRefresh={refresh} />}
    
  </main>;
}

function Setup({ onConnect, onDemo, loading }: { onConnect: (form: Record<string, unknown>) => void; onDemo: () => void; loading: boolean }) {
  const [mode, setMode] = useState<'league' | 'draft'>('league');
  const [leagueId, setLeagueId] = useState(''); const [username, setUsername] = useState(''); const [draftId, setDraftId] = useState(''); const [rosterId, setRosterId] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); onConnect(mode === 'league' ? { leagueId, username } : { draftId, username: username || undefined, myRosterId: rosterId ? Number(rosterId) : undefined }); };
  return <section className="setup"><div><h2>Draft asistanı hazır</h2><p>Ranking verisi uygulama başlarken otomatik yüklenir. Markdown veya veri inceleme adımı yok.</p><button className="demo" onClick={onDemo} disabled={loading}>Demo draftı aç</button><small>Sleeper bağlantısı olmadan board ve öneri motorunu görmek için.</small></div><form onSubmit={submit}><h2>Sleeper’a bağlan</h2><div className="mode"><button type="button" className={mode === 'league' ? 'active' : ''} onClick={() => setMode('league')}>League ID</button><button type="button" className={mode === 'draft' ? 'active' : ''} onClick={() => setMode('draft')}>Draft ID</button></div>{mode === 'league' ? <><label>League ID<input value={leagueId} onChange={e => setLeagueId(e.target.value)} required placeholder="Sleeper league ID" /></label><label>Sleeper kullanıcı adı<input value={username} onChange={e => setUsername(e.target.value)} required placeholder="kullaniciadi" /></label></> : <><label>Draft ID<input value={draftId} onChange={e => setDraftId(e.target.value)} required /></label><label>Sleeper kullanıcı adı (önerilir)<input value={username} onChange={e => setUsername(e.target.value)} placeholder="kullaniciadi" /></label><label>Kendi Roster ID’in (kullanıcı adı yoksa)<input type="number" value={rosterId} onChange={e => setRosterId(e.target.value)} /></label></>}<button disabled={loading}>Drafta bağlan</button></form></section>;
}

function Dashboard({ state, recs, boardSuggestions, myPicks, currentPick, onRefresh }: { state: State; recs: Rec[]; boardSuggestions: Record<string, BoardSuggestion>; myPicks: Pick[]; currentPick: number; onRefresh: () => void }) {
  const isMyTurn = !state.finished && currentPick <= state.config.teams * state.config.rounds && pickSlot(currentPick, state.config.teams) === mySlot(state);
  const onClockSlot = currentPick <= state.config.teams * state.config.rounds ? pickSlot(currentPick, state.config.teams) : null;
  const onClockRoster = onClockSlot ? state.config.slotToRosterId[String(onClockSlot)] : null;
  const onClockName = onClockRoster ? state.config.rosterNames[String(onClockRoster)] ?? `Takım ${onClockSlot}` : 'Draft bitti';
  const counts = Object.fromEntries(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(position => [position, myPicks.filter(p => p.position === position).length]));
  return <>
    <section className="metrics"><Metric label="Şu anki pick" value={state.finished ? 'Bitti' : `${Math.ceil(currentPick / state.config.teams)}.${String((currentPick - 1) % state.config.teams + 1).padStart(2, '0')}`} /><Metric label="Sıra kimde" value={state.finished ? 'Draft bitti' : onClockName} /><Metric label="Senin slotun" value={`#${mySlot(state) ?? '—'}`} /><Metric label="Skor formatı" value={state.config.scoringType.toUpperCase()} /></section>
    {isMyTurn && <div className="your-turn">SIRA SENDE — en üstteki öneriyi kontrol et ve Sleeper’dan manuel seç.</div>}
    <section className="grid">
      <article className="panel recommendations"><h2>Şimdi al</h2>{recs.map((rec, i) => <div className={`recommendation ${i === 0 ? 'best' : ''}`} key={rec.player.sleeperId}><span className="rank">{i + 1}</span><div><strong>{rec.player.fullName}</strong><small>{rec.player.position} · {rec.player.team ?? 'FA'} · Consensus #{rec.player.consensusRank} {rec.player.tier ? `· ${rec.player.tier}` : ''}</small><p>{rec.reason}</p></div><div className="score"><b>{Math.round(rec.score)}</b><small>Skor<br />{Math.round(rec.survivalChance * 100)}% kalır</small></div></div>)}</article>
      <article className="panel"><h2>Senin kadron</h2><div className="position-counts">{Object.entries(counts).map(([position, count]) => <span key={position}><b>{position}</b><strong>{count}</strong></span>)}</div><h3>Lig ayarı</h3><p>{state.config.teams} takım · {state.config.rounds} tur · {state.config.rosterPositions.join(', ') || 'Sleeper roster slotu bekleniyor'}</p>{state.config.mode === 'demo' ? <DemoControls onReset={onRefresh} onFinish={onRefresh} finished={state.finished} /> : <p className="live-note">Canlı draft verisiyle güncelleniyor.</p>}<ManualPick state={state} currentPick={currentPick} recs={recs} onSaved={onRefresh} /></article>
    </section>
    <DraftBoard state={state} currentPick={currentPick} suggestions={boardSuggestions} />
  </>;
}
const Metric = ({ label, value }: { label: string; value: string }) => <div><small>{label}</small><b>{value}</b></div>;
function DraftBoard({ state, currentPick, suggestions }: { state: State; currentPick: number; suggestions: Record<string, BoardSuggestion> }) {
  const picks = new Map(state.picks.map(p => [`${p.round}-${p.draftSlot}`, p]));
  const slots = Array.from({ length: state.config.teams }, (_, i) => i + 1);
  const rounds = Array.from({ length: state.config.rounds }, (_, i) => i + 1);
  return <article className="panel board"><div className="board-title"><div><h2>Canlı draft board</h2><p>Yeşil sütun senin takımın. Parlayan hücre sıradaki seçim.</p></div><small>Son güncelleme: {new Date(state.refreshedAt).toLocaleTimeString('tr-TR')}</small></div><div className="draft-grid" style={{ gridTemplateColumns: `58px repeat(${state.config.teams}, minmax(128px, 1fr))` }}><div className="corner">Tur</div>{slots.map(slot => { const rosterId = state.config.slotToRosterId[String(slot)]; const mine = rosterId === state.config.myRosterId; return <div className={`team-head ${mine ? 'mine' : ''}`} key={slot}><small>Slot {slot}</small><b>{state.config.rosterNames[String(rosterId)] ?? `Takım ${slot}`}</b></div>; })}{rounds.flatMap(round => [<div className="round" key={`round-${round}`}>{round}</div>, ...slots.map(slot => { const pick = picks.get(`${round}-${slot}`); const pickNo = (round - 1) * state.config.teams + (round % 2 ? slot : state.config.teams - slot + 1); const rosterId = state.config.slotToRosterId[String(slot)]; const mine = rosterId === state.config.myRosterId; const onClock = pickNo === currentPick; const suggestion = suggestions[String(rosterId)]; return <div className={`draft-cell ${mine ? 'mine' : ''} ${onClock ? 'on-clock' : ''}`} key={`${round}-${slot}`}>{pick ? <><b>{pick.playerName}</b><small>{pick.position} · {pick.team ?? 'FA'} · #{pickNo}{pick.isManual ? ' · manuel' : ''}</small></> : <>{onClock ? <b>SIRADA</b> : suggestion ? <b className="forecast">{suggestion.playerName}</b> : <b>—</b>}<small>{onClock ? `${suggestion?.position ?? ''} · öneri: ${suggestion?.playerName ?? 'bekleniyor'}` : `öngörü · #${pickNo}`}</small></>}</div>; })])}</div>{state.error && <p className="error">Sleeper: {state.error}. Son board korunuyor; gerekirse manuel seçim ekle.</p>}</article>;
}
const mySlot = (state: State) => { const found = Object.entries(state.config.slotToRosterId).find(([, roster]) => Number(roster) === state.config.myRosterId)?.[0]; return found ? Number(found) : null; };
const pickSlot = (pickNo: number, teams: number) => { const r = Math.ceil(pickNo / teams); const within = (pickNo - 1) % teams + 1; return r % 2 ? within : teams - within + 1; };
const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Beklenmeyen hata';
function ManualPick({ state, currentPick, recs, onSaved }: { state: State; currentPick: number; recs: Rec[]; onSaved: () => void }) {
  const [sleeperId, setSleeperId] = useState(''); const [rosterId, setRosterId] = useState(String(state.config.myRosterId)); const [note, setNote] = useState('');
  const round = Math.ceil(currentPick / state.config.teams); const slot = pickSlot(currentPick, state.config.teams);
  return <form className="manual" onSubmit={async e => { e.preventDefault(); try { await api('/api/manual-picks', { method: 'POST', body: JSON.stringify({ pickNo: currentPick, sleeperId, rosterId: Number(rosterId), round, draftSlot: slot }) }); setNote('Manuel seçim kaydedildi.'); onSaved(); } catch (err) { setNote(errorMessage(err)); } }}><h3>Manuel yedek seçim</h3><p>Sleeper gecikirse, mevcut pick’i burada işaretle.</p><select value={sleeperId} onChange={e => setSleeperId(e.target.value)} required><option value="">Önerilen oyuncu seç</option>{recs.map(r => <option key={r.player.sleeperId} value={r.player.sleeperId}>{r.player.fullName} ({r.player.position})</option>)}</select><input aria-label="Roster ID" type="number" value={rosterId} onChange={e => setRosterId(e.target.value)} required /><button>Pick {currentPick} kaydet</button>{note && <small>{note}</small>}</form>;
}
function DemoControls({ onReset, onFinish, finished }: { onReset: () => void; onFinish: () => void; finished?: boolean }) {
  const [busy, setBusy] = useState(false); const action = async (path: string) => { setBusy(true); try { await api(path, { method: 'POST' }); } finally { setBusy(false); } };
  return <div className="demo-controls"><button className="secondary" disabled={busy} onClick={async () => { await action('/api/demo/reset'); onReset(); }}>Sıfırla</button><button disabled={busy || finished} onClick={async () => { await action('/api/demo/finish'); onFinish(); }}>{finished ? 'Draft bitti' : 'Draftı bitir'}</button></div>;
}
async function loadReview(setReview: (x: any[]) => void, setMessage: (x: string) => void) { try { setReview(await api<any[]>('/api/review')); } catch (e) { setMessage(errorMessage(e)); } }
function Review({ items, onSaved }: { items: any[]; onSaved: () => void }) { const [selected, setSelected] = useState<Record<number, string>>({}); return <section className="panel review"><h2>Belirsiz oyuncu eşleşmeleri</h2><p>Yalnız düşük güvenli veya çözülemeyen kayıtlar burada görünür. Doğru oyuncuyu seçtiğinde alias kalıcı kaydedilir; ardından Markdown içe aktarmayı yeniden çalıştır.</p>{!items.length && <p>İnceleme bekleyen kayıt yok. Önce Markdown’ları içe aktar.</p>}{items.map(item => <div className="review-row" key={item.id}><div><b>{item.playerText}</b><small>{item.fileName} · {item.positionHint ?? 'pozisyon yok'}</small></div><select value={selected[item.id] ?? ''} onChange={e => setSelected({ ...selected, [item.id]: e.target.value })}><option value="">Aday seç</option>{item.candidates.map((p: any) => <option key={p.sleeperId} value={p.sleeperId}>{p.fullName} ({p.position} · {p.team})</option>)}</select><button disabled={!selected[item.id]} onClick={async () => { await api('/api/review', { method: 'POST', body: JSON.stringify({ alias: item.playerText, sleeperId: selected[item.id] }) }); onSaved(); }}>Onayla</button></div>)}</section>;
}

export default App;
