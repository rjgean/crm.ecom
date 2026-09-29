const root = document.getElementById('app');
const state = { sidebarCollapsed: (()=>{try{return localStorage.getItem('crm-sidebar-collapsed')==='1'}catch{return false}})(), theme: (()=>{try{return localStorage.getItem('crm-theme')==='dark'?'dark':'light'}catch{return 'light'}})(), user: null, authConfig: null, view: 'painel', lead: null, leads: [], filters: {}, toastTimer: null, drawerOpen: false, batchId: null, importPoll: null, campaignPoll: null, campaignAdvancing: false, localPoll: null, localLeadId: null, localTab: 'radar', localData: null, localSearch: '', radarFilters: {city:'',niche:'',state:'',min_rating:'',max_reviews:''} };
document.documentElement.dataset.theme=state.theme;
const iconPaths={
  dashboard:'<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 4.2 4.2"/>', upload:'<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  building:'<path d="M4 21V5l8-2v18M12 9h8v12M2 21h20"/><path d="M7 7h2m-2 4h2m-2 4h2m8-2h1m-1 4h1"/>', list:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  kanban:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v10"/>', compass:'<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.3 5.3-5.3 2.3 2.3-5.3z"/>', pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  message:'<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.2-3.7A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8.5 11h7m-7 3h4"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>', download:'<path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M4 20h16"/>',
  chart:'<path d="M4 20V10m5 10V4m5 16v-7m5 7V7"/><path d="M2 20h20"/>', plug:'<path d="M9 7V3m6 4V3m-9 4h12v3a6 6 0 0 1-6 6v5m0-5a6 6 0 0 1-6-6z"/>', settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4L7.8 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z" transform="translate(-1 -1)"/>',
  radar:'<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4M12 12l6-6"/>', profile:'<circle cx="10" cy="8" r="4"/><path d="M3 20a7 7 0 0 1 12-4.9M17 17l2 2 4-4"/>', map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/>', route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/>', file:'<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7M8 14h8m-8 4h8"/>', fileCheck:'<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7m-12 5 2 2 4-4"/>', qr:'<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zm4 4h3v3h-3zm0-4h3"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', moon:'<path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>', menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', arrow:'<path d="M7 17 17 7M7 7h10v10"/>', phone:'<path d="M5 4h4l2 5-3 2a15 15 0 0 0 5 5l2-3 5 2v4c0 1-1 2-2 2C9 20 4 15 3 6c0-1 1-2 2-2Z"/>', close:'<path d="m18 6-12 12M6 6l12 12"/>', help:'<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1 .9-1.8 1.2-1.8 2.8m0 3h.01"/>'
};
const iconSvg=(name,size=18)=>`<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]||iconPaths.help}</svg>`;
let installPrompt=null;
const isInstalled=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
function updateInstallButton(){const btn=document.getElementById('install-app');if(btn)btn.hidden=isInstalled()}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateInstallButton()});
window.addEventListener('appinstalled',()=>{installPrompt=null;updateInstallButton();toast('CRM instalado na tela inicial.')});
window.addEventListener('online',()=>document.documentElement.classList.remove('is-offline'));
window.addEventListener('offline',()=>document.documentElement.classList.add('is-offline'));
if('serviceWorker' in navigator){
  let hadController=Boolean(navigator.serviceWorker.controller),reloadingForUpdate=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController||reloadingForUpdate)return;
    const changed=[...document.querySelectorAll('input,select,textarea')].some(field=>{
      if(field.type==='file')return false;
      if(field.type==='checkbox'||field.type==='radio')return field.checked!==field.defaultChecked;
      if(field.tagName==='SELECT'){
        const initial=[...field.options].findIndex(option=>option.defaultSelected);
        return field.selectedIndex!==(initial<0?0:initial);
      }
      return field.value!==(field.defaultValue||'');
    });
    if(changed){toast('Atualização pronta. Salve o formulário aberto e atualize o CRM depois.');return}
    reloadingForUpdate=true;
    location.reload();
  });
  if(location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
if(!navigator.onLine)document.documentElement.classList.add('is-offline');
const stages = [['novo','Novo'],['pesquisado','Pesquisado'],['qualificado','Qualificado'],['contato','Contato iniciado'],['respondeu','Respondeu'],['reuniao','Reunião'],['proposta','Proposta'],['negociacao','Negociação'],['ganho','Ganho'],['perdido','Perdido']];
const importStatus = {queued:'Na fila',running:'Pesquisando',paused:'Pausado',done:'Concluído',pending:'Aguardando',processing:'Pesquisando',error:'Falhou',skipped:'Ignorado'};
const statuses = [['incerto','Incerto'],['sem_site_identificado','Sem site identificado'],['apenas_redes','Apenas redes sociais'],['site_sem_loja','Site sem loja'],['marketplace','Marketplace'],['loja_virtual','Loja virtual']];
const nav = [
  ['painel','dashboard','Painel'],['buscar','search','Procurar Clientes'],['importar','upload','Importar JSON'],['leads','building','Meus Leads'],['listas','list','Listas'],
  ['crm','kanban','CRM'],['nichos','compass','Explorar Nichos'],['local','pin','Inteligência Local'],['mensagens','message','Mensagens'],['historico','clock','Histórico'],
  ['exportacoes','download','Exportações'],['analytics','chart','Análises'],['integracoes','plug','Integrações'],['configuracoes','settings','Configurações']
];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = (items, value) => items.find(x => x[0] === value)?.[1] || value || 'Não informado';
const money = value => value == null || value === '' ? '—' : Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const safeLink = value => { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const link = (value, name) => safeLink(value) ? `<a href="${esc(safeLink(value))}" target="_blank" rel="noopener noreferrer" class="link">${esc(name || value)} ${iconSvg('arrow',13)}</a>` : '—';
const options = (items, selected) => items.map(([value,text]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(text)}</option>`).join('');
const statusBadge = value => `<span class="badge ${value === 'incerto' || value === 'sem_site_identificado' ? 'warning' : value === 'loja_virtual' ? 'dim' : ''}">${esc(label(statuses,value))}</span>`;

async function api(path, opts={}) {
  const headers = { ...(opts.body ? {'Content-Type':'application/json'} : {}), ...(state.user?.csrf ? {'X-CSRF-Token':state.user.csrf} : {}) };
  let response;
  try { response = await fetch('/api' + path, { credentials:'same-origin', headers, ...opts, cache:'no-store', body:opts.body ? JSON.stringify(opts.body) : undefined }); }
  catch { throw new Error('Sem conexão com o servidor.'); }
  if (response.status === 401 && !['/login','/access/verify'].includes(path)) { state.user=null; renderLogin(); throw new Error('Sessão expirada. Entre novamente.'); }
  if (response.headers.get('Content-Type')?.includes('text/csv')) return response.blob();
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}
const post = (path, body={}) => api(path,{method:'POST',body});
function toast(message, isError=false) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');t.className='toast'+(isError?' error':'');t.textContent=message;document.body.append(t);
  clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>t.remove(),4600);
}
function loading() { document.getElementById('content').innerHTML='<div class="panel"><div class="empty">Carregando dados…</div></div>'; }
function failure(err) { const el=document.getElementById('content');if(el)el.innerHTML=`<div class="notice">${esc(err.message || err)}</div>`; }
function getView() { return (location.hash.replace('#/','').split('/')[0] || 'painel'); }
function navigate(view) { location.hash='#/'+view; if(state.view === view) renderView(); }
function renderUnavailable(message) {
  root.innerHTML=`<main class="auth"><section class="auth-card"><div class="brand">CRM<span>•</span>ECOM</div><h1>Painel indisponível</h1><p class="muted">${esc(message)}</p><button class="btn primary full" onclick="location.reload()">Tentar novamente</button></section></main>`;
}
function renderLogin() {
  root.innerHTML=`<main class="auth"><section class="auth-card"><div class="brand">CRM<span>•</span>ECOM</div><h1>Entrar no CRM</h1><p class="muted">Digite seu e-mail e sua senha.</p><form id="login-form"><label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="field">Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="btn primary full">Entrar →</button><div id="login-error" class="muted" role="alert"></div></form><button id="install-app" class="btn ghost full install-login" type="button" data-action="install-app">${iconSvg('download',16)} Instalar na tela inicial</button></section></main>`;
  updateInstallButton();
}
async function installApp(){
  if(isInstalled())return toast('O CRM já está instalado neste dispositivo.');
  if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();const choice=await prompt.userChoice;updateInstallButton();if(choice?.outcome==='accepted')toast('Instalação iniciada.');return}
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  const steps=ios?'<ol><li>Abra este CRM no Safari.</li><li>Toque em <strong>Compartilhar</strong> na barra do navegador.</li><li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li></ol>':'<ol><li>Abra o menu do navegador (⋮).</li><li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme para criar o atalho do CRM.</li></ol>';
  const mount=document.getElementById('drawer-mount');if(!mount)return;
  mount.innerHTML=`<div class="install-overlay" id="install-overlay" role="dialog" aria-modal="true" aria-labelledby="install-title"><section class="install-dialog"><button class="icon-button" data-action="close-install-help" aria-label="Fechar">×</button><span class="install-mark">${iconSvg('building',24)}</span><h2 id="install-title">Acesse o CRM pela tela inicial</h2><p>Instale o atalho para abrir o painel em tela cheia. Leads e alterações continuam sincronizados com o Supabase quando houver conexão.</p>${steps}<div class="install-note">O atalho e os arquivos visuais ficam instalados no aparelho. Entrar, pesquisar, ver leads e salvar alterações exige conexão com a Internet.</div><button class="btn primary full" data-action="close-install-help">Entendi</button></section></div>`;
}

function shell() {
  const n = nav.map(([id,icon,text],idx)=>`${idx===0||idx===6||idx===12?`<div class="nav-group">${idx===0?'Operação':idx===6?'Inteligência':'Ferramentas'}</div>`:''}<button title="${esc(text)}" aria-label="${esc(text)}" class="nav-link ${state.view===id?'active':''}" data-view="${id}"><span class="icon">${iconSvg(icon)}</span><span class="nav-label">${text}</span></button>${id==='local'?`<div class="local-sidebar-links" aria-label="Ferramentas de Inteligência Local">${localModules.map(([tab,tabIcon,name])=>`<button type="button" class="local-sidebar-link ${state.view==='local'&&state.localTab===tab?'active':''}" title="${esc(name)}" aria-label="${esc(name)}" data-local-sidebar="${tab}"><span class="icon">${iconSvg(tabIcon,16)}</span><span class="nav-label">${esc(name)}</span></button>`).join('')}</div>`:''}`).join('');
  const dock=[['painel','dashboard','Painel'],['buscar','search','Buscar'],['leads','building','Leads'],['crm','kanban','CRM']].map(([id,ico,label])=>`<button class="dock-link ${state.view===id?'active':''}" data-view="${id}" aria-label="${label}">${iconSvg(ico,19)}<span>${label}</span></button>`).join('');
  root.innerHTML=`<div class="scrim" id="scrim"></div><div class="shell"><aside class="sidebar ${state.sidebarCollapsed?'collapsed':''}" id="sidebar"><div class="sidebar-head"><div class="logo">C</div><div class="brand">CRM<span>•</span>ECOM</div><button class="sidebar-collapse" data-action="toggle-sidebar" type="button" aria-label="${state.sidebarCollapsed?'Expandir menu lateral':'Minimizar menu lateral'}" aria-expanded="${!state.sidebarCollapsed}" title="${state.sidebarCollapsed?'Expandir menu lateral':'Minimizar menu lateral'}">${state.sidebarCollapsed?'›':'‹'}</button></div><nav class="nav">${n}</nav><div class="sidebar-foot"><div class="sidebar-user"><strong>Gean Fernandes</strong></div>${state.user.sso?'':'<button class="btn ghost full" data-action="logout">Sair da conta</button>'}</div></aside><div class="main ${state.sidebarCollapsed?'sidebar-is-collapsed':''}"><header class="topbar"><button class="mobile-toggle" data-action="menu" aria-label="Abrir menu">${iconSvg('menu',21)}</button><div class="topbar-title"><h1 id="top-title">Painel</h1><small id="top-subtitle">Resumo da sua prospecção</small></div><div class="topbar-actions"><form id="global-search-form" role="search"><input type="search" name="q" aria-label="Buscar empresas" placeholder="Buscar empresa ou cidade" maxlength="100"><button type="submit" aria-label="Pesquisar">${iconSvg('search',17)}</button></form><button id="install-app" class="install-app" type="button" data-action="install-app" aria-label="Instalar CRM no celular">${iconSvg('download',16)}<span>Instalar</span></button><button class="theme-toggle" type="button" data-action="toggle-theme" aria-label="${state.theme==='dark'?'Ativar modo claro':'Ativar modo escuro'}" title="${state.theme==='dark'?'Modo claro':'Modo escuro'}">${iconSvg(state.theme==='dark'?'sun':'moon',18)}</button></div></header><main class="page" id="content"></main></div><nav class="mobile-dock" aria-label="Navegação rápida">${dock}<button class="dock-link" data-action="menu" aria-label="Mais opções">${iconSvg('menu',19)}<span>Mais</span></button></nav></div><div id="drawer-mount"></div>`;
  updateInstallButton();
}
function title(name, sub) { document.getElementById('top-title').textContent=name;document.getElementById('top-subtitle').textContent=sub; }
async function renderView() {
  if (!state.user) return;
  clearTimeout(state.importPoll);
  clearTimeout(state.campaignPoll);
  state.campaignPoll=null;
  clearTimeout(state.localPoll);
  state.view=getView();
  if (!nav.some(x=>x[0]===state.view)) state.view='painel';
  if (state.view==='local') {
    const tab=location.hash.replace('#/','').split('/')[1];
    if (localModules.some(module=>module[0]===tab)) state.localTab=tab;
  }
  shell();loading();
  const selected=document.querySelector(`.nav-link[data-view="${state.view}"]`);selected?.classList.add('active');
  try {
    await ({painel:dashboard,buscar:searchPage,importar:importPage,leads:leadsPage,listas:listsPage,crm:crmPage,nichos:nichesPage,local:localPage,mensagens:messagesPage,historico:historyPage,exportacoes:exportPage,analytics:analyticsPage,integracoes:integrationsPage,configuracoes:settingsPage})[state.view]();
  } catch(err) { failure(err); }
}
function metric(name,value){return `<div class="metric"><div class="metric-label">${esc(name)}</div><div class="metric-value">${esc(value)}</div></div>`}
async function dashboard(){
  title('Painel','Sua operação comercial em tempo real.');
  try {
    const x=await api('/dashboard');const m=x.metrics;
    const total=Number(m.saved)||0;
    const noSite=Number(m.no_site)||0;
    const withSite=(x.digital||[]).filter(row=>['site_sem_loja','loja_virtual'].includes(row.digital_status)).reduce((sum,row)=>sum+Number(row.count),0);
    const other=Math.max(0,total-noSite-withSite);
    const noSitePercent=total?Math.round(noSite/total*100):0;
    const first=total?noSite/total*100:0,second=total?(noSite+withSite)/total*100:0;
    const donut=total?`conic-gradient(#72e4bf 0 ${first}%,#7aa6ff ${first}% ${second}%,#b499f0 ${second}% 100%)`:'conic-gradient(#425052 0 100%)';
    const maxCity=Math.max(1,...(x.cities||[]).map(row=>Number(row.count)));
    const maxStage=Math.max(1,...x.stages.map(row=>Number(row.count)));
    const spotlight=(icon,name,value,caption,accent)=>`<section class="dash-stat"><div class="dash-stat-top"><span class="dash-stat-icon ${accent}">${iconSvg(icon,19)}</span><span class="dash-stat-corner">${iconSvg('arrow',14)}</span></div><span class="dash-stat-label">${name}</span><strong>${esc(value)}</strong><small>${caption}</small><div class="dash-stat-line ${accent}"></div></section>`;
    const cityRows=(x.cities||[]).length?x.cities.map(row=>`<div class="dash-bar-row"><div><strong>${esc(row.city)}</strong><span>${row.count} ${Number(row.count)===1?'empresa':'empresas'}</span></div><div class="dash-track"><i style="width:${Math.max(3,Number(row.count)/maxCity*100)}%"></i></div></div>`).join(''):'<div class="dash-empty">As cidades aparecerão quando você importar ou buscar empresas.</div>';
    const stageRows=x.stages.length?x.stages.sort((a,b)=>Number(b.count)-Number(a.count)).slice(0,6).map(row=>`<div class="dash-bar-row"><div><strong>${esc(label(stages,row.stage))}</strong><span>${row.count}</span></div><div class="dash-track violet"><i style="width:${Math.max(3,Number(row.count)/maxStage*100)}%"></i></div></div>`).join(''):'<div class="dash-empty">O funil começa a ganhar forma com seus primeiros leads.</div>';
    document.getElementById('content').innerHTML=`<div class="dash-page"><header class="dash-heading"><div><span class="dash-eyebrow">VISÃO GERAL DA OPERAÇÃO</span><h1>Seu próximo cliente começa aqui.</h1><p>Acompanhe oportunidades, cidades e o andamento das conversas em um só lugar.</p></div><button class="btn primary" data-local-sidebar="radar">${iconSvg('radar',17)} Abrir Radar de Leads</button></header>
      <div class="dash-stats">${spotlight('search','Empresas encontradas',m.found,'Nas buscas realizadas','cyan')}${spotlight('building','Leads no CRM',m.saved,'Salvos no Supabase','blue')}${spotlight('profile','Sem site identificado',m.no_site,`${noSitePercent}% dos leads salvos`,'pink')}${spotlight('fileCheck','Propostas e negociações',m.proposals,'Inclui negociações e ganhos','lime')}</div>
      <div class="dash-grid"><section class="dash-panel dash-opportunities"><div class="dash-panel-heading"><div><span class="dash-kicker">OPORTUNIDADE DIGITAL</span><h2>Presença na internet</h2></div><button class="link" data-view="leads">Ver leads ↗</button></div><div class="dash-donut-layout"><div class="dash-donut" style="background:${donut}"><div><strong>${total}</strong><small>leads salvos</small></div></div><div class="dash-legend"><div><i class="legend-no-site"></i><span>Sem site identificado</span><strong>${noSite}</strong></div><div><i class="legend-site"></i><span>Com site identificado</span><strong>${withSite}</strong></div><div><i class="legend-other"></i><span>Outros / a conferir</span><strong>${other}</strong></div></div></div><p class="dash-note">“Sem site identificado” pede conferência antes da abordagem.</p></section>
      <section class="dash-panel"><div class="dash-panel-heading"><div><span class="dash-kicker">MAPA DA PROSPECÇÃO</span><h2>Onde estão os leads</h2></div><button class="link" data-view="leads">Explorar ↗</button></div><div class="dash-bars">${cityRows}</div></section>
      <section class="dash-panel"><div class="dash-panel-heading"><div><span class="dash-kicker">EVOLUÇÃO COMERCIAL</span><h2>Etapas do funil</h2></div><button class="link" data-view="crm">Abrir CRM ↗</button></div><div class="dash-bars">${stageRows}</div><div class="dash-mini-stats"><span>Contatados <strong>${esc(m.contacted)}</strong></span><span>Clientes ganhos <strong>${esc(m.customers)}</strong></span><span>Pontuação média <strong>${esc(m.avg_score)}</strong></span></div></section>
      <section class="dash-panel"><div class="dash-panel-heading"><div><span class="dash-kicker">ÚLTIMAS AÇÕES</span><h2>Atividade recente</h2></div><button class="link" data-view="historico">Histórico ↗</button></div><div class="dash-activity">${x.activity.length?x.activity.slice(0,5).map(a=>`<div class="dash-activity-row"><span class="dash-activity-dot"></span><div><strong>${esc(a.name||'Lead')} · ${esc(a.kind)}</strong><small>${esc(a.detail||'Atividade registrada')}</small></div><time>${date(a.created_at)}</time></div>`).join(''):'<div class="dash-empty">Suas atividades aparecerão aqui quando você iniciar os contatos.</div>'}</div></section></div>
      <section class="dash-panel dash-recent"><div class="dash-panel-heading"><div><span class="dash-kicker">FILA DE OPORTUNIDADES</span><h2>Empresas recentes</h2></div><button class="link" data-view="leads">Todos os leads ↗</button></div>${x.recent.length?x.recent.map(l=>`<button class="dash-lead-row" data-lead="${l.id}"><span class="dash-lead-avatar">${esc(l.name?.[0]?.toUpperCase()||'E')}</span><span class="dash-lead-info"><strong>${esc(l.name)}</strong><small>${esc(l.city||'Cidade não informada')} · ${esc(label(statuses,l.digital_status))}</small></span><span class="dash-lead-stage">${esc(label(stages,l.stage))}</span><span class="dash-lead-score">${esc(l.score)} pts</span><span aria-hidden="true">${iconSvg('arrow',14)}</span></button>`).join(''):'<div class="dash-empty">Nenhuma empresa salva ainda. Use o Radar ou importe o JSON da Apify para começar.</div>'}</section></div>`;
  }catch(e){failure(e)}
}
async function searchPage(){
  title('Procurar Clientes','Encontre empresas por nicho e localização.');
  const el=document.getElementById('content');
  el.innerHTML=`<div class="section-title"><div><h1>Encontre sua próxima oportunidade</h1><p>Apify encontra negócios; Firecrawl investiga sua presença digital.</p></div></div>${!state.user.apify?'<div class="notice">Configure a chave da Apify em Configurações para iniciar buscas. Você pode importar o JSON extraído por você na Apify e usar o CRM.</div>':''}${!state.user.firecrawl?'<div class="notice">Configure a chave do Firecrawl em Configurações. A importação JSON funcionará, mas a pesquisa de presença digital aguardará a chave.</div>':''}<section class="panel"><h2>Nova busca</h2><form id="campaign-form" class="form-grid"><label class="field span2">O que você está procurando?<input name="niche" placeholder="Ex.: estética automotiva, moda feminina" required maxlength="100"></label><label class="field">Cidade<input name="city" placeholder="São Gonçalo" required maxlength="100"></label><label class="field">UF<input name="state" placeholder="RJ" required maxlength="2"></label><label class="field">Limite de empresas<input name="limit" type="number" min="1" max="100" value="20" required></label><button class="btn primary" type="submit" ${state.user.apify?'':'disabled'}>${iconSvg('search',16)} Iniciar busca</button></form><p class="help" style="margin:15px 0 0">A pesquisa gera custos nos serviços conectados. Comece com um limite pequeno. “Sem site identificado” exige conferência antes de abordar o negócio.</p></section><section class="panel" style="margin-top:16px"><div class="panel-head"><h2>Campanhas recentes</h2><button class="link" data-action="refresh-campaigns">Atualizar</button></div><div id="campaigns" class="campaign-list">Carregando…</div></section>`;
  loadCampaigns();
}
async function loadCampaigns(){
  clearTimeout(state.campaignPoll);state.campaignPoll=null;
  const el=document.getElementById('campaigns');if(!el)return;
  try{const rows=await api('/campaigns');if(!document.getElementById('campaigns'))return;
    el.innerHTML=rows.length?rows.map(c=>`<div class="campaign-card"><div><strong>${esc(c.niche)} · ${esc(c.city)}, ${esc(c.state)}</strong><small>${date(c.created_at)} · limite ${c.limit_count} · encontrados ${c.found} · novos ${c.saved} · enriquecidos ${c.enriched}</small>${c.error?`<small style="color:var(--gold)">${esc(c.error)}</small>`:''}${['failed','partial'].includes(c.status)?`<button class="btn ghost" style="margin-top:8px" data-campaign-resume="${c.id}">Retomar busca</button>`:''}</div><span class="badge ${c.status==='failed'?'red':c.status==='done'?'':'warning'}">${esc(c.status)}</span></div>`).join(''):'<div class="empty">Nenhuma campanha ainda. Use os filtros acima para iniciar.</div>';
    const active=rows.find(c=>['queued','running','enriching'].includes(c.status));
    if(active) state.campaignPoll=setTimeout(async()=>{
      if(state.view!=='buscar'||state.campaignAdvancing)return;
      state.campaignAdvancing=true;
      try{
        if(state.user.serverless)await post(`/campaigns/${active.id}/advance`,{});
      }catch(e){toast(e.message,true)}
      finally{
        state.campaignAdvancing=false;
        if(state.view==='buscar')await loadCampaigns();
      }
    },5000);
  }catch(e){el.textContent=e.message}
}
function importPage(){
  title('Importar JSON','Apify manual e pesquisa Firecrawl passo a passo.');
  document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Importar empresas da Apify</h1><p>Faça a coleta na sua conta Apify, copie o JSON exportado e cole abaixo. Cada empresa será salva no CRM.</p></div></div>${!state.user.firecrawl?'<div class="notice">Configure a chave do Firecrawl em Configurações para iniciar a pesquisa dos sites. Você já pode importar os leads.</div>':''}<section class="panel"><form id="apify-json-form" class="form-grid"><label class="field span2">Nome da lista<input name="name" value="Empresas importadas da Apify" maxlength="100" required></label><label class="field">Cidade padrão (se faltar no JSON)<input name="city" placeholder="Rio de Janeiro" maxlength="100"></label><label class="field">UF padrão<input name="state" placeholder="RJ" maxlength="2"></label><label class="field span2">JSON exportado da Apify<textarea name="json" rows="12" spellcheck="false" required placeholder='[{"title":"Loja Exemplo","phone":"21999999999","website":"","url":"https://maps.google.com/..."}]'></textarea></label><button class="btn primary" type="submit">Importar empresas e pesquisar com Firecrawl →</button></form><p class="help" style="margin:12px 0 0">Aceita array de empresas ou objeto com items/data; até 500 empresas por importação. Chaves e dados sensíveis não devem estar no JSON colado. A pesquisa avança uma empresa por vez enquanto esta tela estiver aberta; você pode voltar para continuar.</p></section><section class="panel" style="margin-top:16px"><div class="panel-head"><h2>Importações</h2><button class="link" data-action="refresh-imports">Atualizar</button></div><div id="import-list">Carregando…</div></section><section class="panel" id="import-details" style="margin-top:16px"></section>`;
  loadImportBatches();
}
async function loadImportBatches(){
  const list=document.getElementById('import-list');if(!list)return;
  try{const rows=await api('/import-apify');if(!document.getElementById('import-list'))return;
    list.innerHTML=rows.length?rows.map(b=>`<div class="row-item"><button data-import-batch="${b.id}"><strong>${esc(b.name)}</strong><small>${date(b.created_at)} · ${b.enriched}/${b.total} pesquisadas · ${b.failed} falhas</small></button><span class="badge ${b.status==='paused'?'warning':''}">${esc(importStatus[b.status]||b.status)}</span></div>`).join(''):'<div class="empty">Ainda não há importações JSON.</div>';
    if(rows.length)showImportBatch(state.batchId&&rows.some(b=>b.id===state.batchId)?state.batchId:rows[0].id);
  }catch(e){list.textContent=e.message}
}
async function showImportBatch(id){
  clearTimeout(state.importPoll);state.batchId=id;
  const el=document.getElementById('import-details');if(!el)return;
  try{const b=await api('/import-apify/'+id);if(state.view!=='importar'||state.batchId!==id||!document.getElementById('import-details'))return;
    el.innerHTML=`<div class="panel-head"><h2>${esc(b.name)}</h2><span class="badge">${esc(importStatus[b.status]||b.status)}</span></div><p class="help">${b.processed} de ${b.total} processadas · ${b.enriched} pesquisadas · ${b.failed} falhas. ${b.error?esc(b.error):''}</p><div class="button-row"><button class="btn" data-list="${b.list_id}">Ver leads desta lista →</button>${b.status==='paused'&&state.user.firecrawl?`<button class="btn primary" data-import-resume="${b.id}">Retomar pesquisa</button>`:''}</div><div style="margin-top:15px">${b.items.map(item=>`<div class="row-item"><button data-lead="${item.lead_id}"><strong>${esc(item.name)}</strong><small>${esc([item.city,item.state].filter(Boolean).join(', '))} · ${esc(label(statuses,item.digital_status))}</small></button><span class="badge ${item.status==='error'?'red':'dim'}">${esc(importStatus[item.status]||item.status)}</span></div>${item.error?`<small class="help">${esc(item.error)}</small>`:''}`).join('')}</div>`;
    if(['queued','running'].includes(b.status)&&state.user.firecrawl)state.importPoll=setTimeout(async()=>{if(state.view!=='importar'||state.batchId!==id)return;try{await post('/import-apify/'+id+'/advance');await loadImportBatches()}catch(e){toast(e.message,true)}},2000);
  }catch(e){el.textContent=e.message}
}
const filtersHtml=()=>`<div class="toolbar"><input class="input" id="lead-q" placeholder="Nome, cidade ou segmento" value="${esc(state.filters.q||'')}"><select class="input" id="lead-status"><option value="">Presença digital: todas</option>${options(statuses,state.filters.digital_status)}</select><select class="input" id="lead-stage"><option value="">Etapa: todas</option>${options(stages,state.filters.stage)}</select><button class="btn" data-action="filter">Filtrar</button><button class="btn ghost" data-action="clear-filter">Limpar</button></div>`;
async function leadsPage(){
  title('Meus Leads','Seu banco de empresas e contatos.');
  const el=document.getElementById('content');
  el.innerHTML=`<div class="section-title"><div><h1>Banco de leads</h1><p>Encontre, revise e aborde cada oportunidade.</p></div><div class="button-row"><button class="btn" data-action="import-csv">${iconSvg('upload',16)} Importar CSV</button><button class="btn primary" data-action="new-lead">+ Novo lead</button></div></div><input id="csv-file" type="file" accept=".csv,text/csv" hidden><p class="help">Importação: CSV UTF-8 com coluna name; opcionais city, state, phone, category, website, instagram. Até 500 linhas por arquivo.</p>${state.filters.list_id?'<div class="notice good">Exibindo somente os leads desta lista. Clique em Limpar para ver todos.</div>':''}${filtersHtml()}<div id="lead-count" class="help"></div><div id="lead-grid" class="lead-grid"></div>`;
  await loadLeads();
}
async function loadLeads(){
  const q=new URLSearchParams();for(const [k,v] of Object.entries(state.filters))if(v)q.set(k,v);
  try{const data=await api('/leads?'+q);state.leads=data.items;const count=document.getElementById('lead-count'),grid=document.getElementById('lead-grid');if(!grid)return;
    count.textContent=`${data.total} empresa${data.total===1?'':'s'} encontrada${data.total===1?'':'s'}${data.total>300?' · exibindo as primeiras 300':''}`;
    grid.innerHTML=data.items.length?data.items.map(leadCard).join(''):'<div class="empty" style="grid-column:1/-1"><strong>Nenhum lead para estes filtros</strong>Altere os filtros, cadastre um contato ou inicie uma busca.</div>';
  }catch(e){failure(e)}
}
function leadCard(l){return `<article class="lead-card"><div class="lead-title"><div><h3>${esc(l.name)}</h3><small>${esc(l.category||'Segmento não informado')} · ${esc([l.city,l.state].filter(Boolean).join(', ')||'Local não informado')}</small></div><span class="score">${l.score}</span></div><div class="lead-meta"><span>${iconSvg('phone',13)} ${esc(l.phone||'Sem telefone')}</span><span>Nota ${esc(l.rating??'—')} · ${esc(l.reviews_count??'—')} avaliações</span></div><div class="pill-row">${statusBadge(l.digital_status)}<span class="badge dim">${esc(label(stages,l.stage))}</span></div><div class="lead-actions"><button class="btn" data-lead="${l.id}">Ver detalhes</button><button class="btn" data-find-instagram="${l.id}">${iconSvg('search',14)} Instagram</button>${l.whatsapp?`<button class="btn" data-compose="${l.id}">${iconSvg('message',14)} WhatsApp</button>`:''}<button class="btn" data-call="${l.id}" ${l.phone?'':'disabled'}>${iconSvg('phone',14)} Ligar</button></div></article>`}

const localModules = [
  ['radar','radar','Radar de Leads','Busque empresas por nicho e cidade na Apify ou importe um JSON.'],
  ['perfil','profile','Raio-X do Perfil','Confira o que os dados salvos mostram sobre cada empresa.'],
  ['regiao','pin','Raio-X Local','Compare reputação com negócios da mesma categoria e cidade no CRM.'],
  ['mapa','map','Mapa de Posição','Registre nove medições reais de presença no Google.'],
  ['proposta','file','Proposta Relâmpago','Monte um texto comercial editável com os dados do lead.'],
  ['contrato','fileCheck','Contrato Express','Prepare os dados de contratação para revisão antes do envio.'],
  ['esteira','kanban','Esteira e CRM','Abra o funil e acompanhe as negociações.'],
  ['qr','qr','QR Codes','Crie um QR de avaliações com destino editável e contagem de acessos.']
];
async function localPage(){
  title('Inteligência Local','Da descoberta ao atendimento de empresas locais.');
  const el=document.getElementById('content');
  el.innerHTML=`<div class="section-title"><div><h1>Operação local</h1><p>Escolha uma ferramenta e trabalhe com os leads salvos no CRM.</p></div></div><div class="local-modules">${localModules.map(([id,ico,name,description])=>`<button type="button" class="local-module ${state.localTab===id?'active':''}" data-local-tab="${id}"><span class="local-icon">${iconSvg(ico,22)}</span><strong>${name}</strong><small>${description}</small></button>`).join('')}</div><section class="panel" id="local-panel"><div class="empty">Carregando...</div></section>`;
  try{
    const x=await api('/local/summary?q='+encodeURIComponent(state.localSearch));if(state.view!=='local')return;
    state.localItems=x.items;
    if(!x.items.some(l=>l.id===state.localLeadId))state.localLeadId=x.items[0]?.id||null;
    await renderLocalModule();
  }catch(e){failure(e)}
}
async function renderLocalModule(){
  document.querySelectorAll('.local-module').forEach(b=>b.classList.toggle('active',b.dataset.localTab===state.localTab));
  const panel=document.getElementById('local-panel');if(!panel)return;
  const tab=state.localTab;
  if(tab==='radar'){
    const f=state.radarFilters;
    panel.innerHTML=`<h2>Radar de Leads</h2><p class="help">Filtre empresas salvas por cidade e nicho. Para descobrir novos negócios no Google Maps, use a busca Apify ou importe seu JSON; o Firecrawl investiga a presença digital após a coleta.</p><form id="local-radar-form" class="form-grid"><label class="field">Cidade<input name="city" value="${esc(f.city)}" placeholder="São Gonçalo" maxlength="100"></label><label class="field">Nicho<input name="niche" value="${esc(f.niche)}" placeholder="Loja de roupas" maxlength="100"></label><label class="field">UF<input name="state" value="${esc(f.state)}" placeholder="RJ" maxlength="2"></label><label class="field">Nota mínima<input name="min_rating" value="${esc(f.min_rating)}" type="number" min="0" max="5" step="0.1" placeholder="Qualquer"></label><label class="field">Até quantas avaliações<input name="max_reviews" value="${esc(f.max_reviews)}" type="number" min="0" max="1000000" placeholder="Qualquer"></label><button class="btn primary" type="submit">Filtrar empresas</button></form><div class="button-row" style="margin:14px 0"><button class="btn" data-local-radar-search="1">Buscar novos leads com Apify ↗</button><button class="btn" data-view="importar">Importar JSON da Apify</button></div><div id="radar-results" class="empty">Carregando empresas…</div>`;
    try{
      const q=new URLSearchParams(Object.entries(f).filter(([,value])=>value));
      const result=await api('/local/radar?'+q);
      if(state.view!=='local'||state.localTab!=='radar')return;
      const el=document.getElementById('radar-results');if(!el)return;
      el.className='';
      el.innerHTML=`<p class="help">${result.total} empresas encontradas · exibindo até 200</p>${result.items.length?`<div class="campaign-list">${result.items.map(l=>`<div class="campaign-card"><div><strong>${esc(l.name)}</strong><small>${esc(l.category||'Nicho não informado')} · ${esc([l.city,l.state].filter(Boolean).join(', ')||'Local não informado')} · Nota ${esc(l.rating??'Sem nota')} · ${esc(l.reviews_count??'—')} avaliações</small><small>${esc(label(statuses,l.digital_status))}${l.website?' · Site informado':''}</small></div><button class="btn" data-lead="${l.id}">Abrir ficha</button></div>`).join('')}</div>`:'<div class="empty">Nenhuma empresa com esses filtros. Busque novos leads ou importe um JSON da Apify.</div>'}`;
    }catch(e){const el=document.getElementById('radar-results');if(el)el.textContent=e.message}
    return;
  }
  if(tab==='esteira'){panel.innerHTML=`<h2>Esteira de Clientes e CRM</h2><p class="help">Mova empresas entre as etapas do pipeline e registre propostas, conversas e próximos passos no detalhe do lead.</p><div class="button-row"><button class="btn primary" data-view="crm">Abrir esteira →</button><button class="btn" data-view="leads">Banco de leads</button></div>`;return}
  const search=`<form id="local-search-form" class="button-row" style="margin:12px 0"><input class="input" name="q" aria-label="Pesquisar empresa" placeholder="Buscar nome, cidade ou nicho" value="${esc(state.localSearch)}"><button class="btn">Pesquisar</button></form><p class="help">Exibindo até 100 empresas por pesquisa. Digite o nome para localizar outras.</p>`;
  if(!state.localItems?.length){panel.innerHTML=search+'<div class="empty"><strong>Nenhuma empresa encontrada.</strong> Tente outro nome ou busque novos leads.</div>';return}
  const chosen=state.localLeadId;
  panel.innerHTML=`<div class="panel-head"><h2>${esc(localModules.find(x=>x[0]===tab)?.[2])}</h2><button class="link" data-lead="${chosen}">Abrir ficha completa →</button></div>${search}<label class="field local-selector">Empresa<select id="local-lead-select">${state.localItems.map(l=>`<option value="${l.id}" ${l.id===chosen?'selected':''}>${esc(l.name)} · ${esc([l.city,l.state].filter(Boolean).join(', '))}</option>`).join('')}</select></label><div id="local-details">Carregando dados...</div>`;
  clearTimeout(state.localPoll);
  try{const data=await api('/leads/'+chosen+'/local');if(state.view!=='local'||state.localLeadId!==chosen||state.localTab!==tab)return;state.localData=data;document.getElementById('local-details').innerHTML=localDetails(data,tab);
    if(tab==='proposta'||tab==='contrato'){
      const kind=tab==='proposta'?'proposal':'contract';
      const saved=await api(`/leads/${chosen}/local-document/${kind}`);
      if(state.view==='local'&&state.localLeadId===chosen&&state.localTab===tab&&saved.body){document.getElementById('local-document').value=saved.body;document.getElementById('local-document-saved').textContent='Salvo no CRM em '+date(saved.created_at);document.getElementById('local-pdf').hidden=false}
    }
    const job=data.jobs?.find(j=>j.kind===(tab==='perfil'?'profile':'grid'));
    if((tab==='perfil'||tab==='mapa')&&job&&['queued','running'].includes(job.status))state.localPoll=setTimeout(async()=>{if(state.view!=='local'||state.localLeadId!==chosen||state.localTab!==tab)return;try{await post(`/leads/${chosen}/local/${job.kind}/advance`);await renderLocalModule()}catch(e){toast(e.message,true)}},3000);
  }catch(e){const el=document.getElementById('local-details');if(el)el.textContent=e.message}
}
const localJobInfo=(data,kind)=>{const job=data.jobs?.find(j=>j.kind===kind);return job?`<p class="help">Coleta Apify: ${esc(({queued:'na fila',running:'em andamento',done:'concluída',failed:'falhou'})[job.status]||job.status)} · ${date(job.updated_at)} ${job.error?`<span style="color:var(--red)">${esc(job.error)}</span>`:''}</p>`:''};
function localDetails(data,tab){
  const l=data.lead;
  if(tab==='perfil'){
    const items=[['Nome',l.name],['Categoria',l.category],['Cidade e UF',[l.city,l.state].filter(Boolean).join(', ')],['Endereço',l.address],['Telefone',l.phone],['Perfil no Maps',l.maps_url],['Site informado',l.website],['Instagram',l.instagram],['Nota pública importada',l.rating==null?'':l.rating],['Avaliações importadas',l.reviews_count==null?'':l.reviews_count]];
    const p=data.profile;
    return `<div class="notice">Raio-X do perfil com dados importados e, quando você aciona a coleta, uma amostra de até 10 avaliações do Maps. A amostra não representa o histórico inteiro da empresa.</div><div class="local-facts">${items.map(([name,value])=>`<div class="local-fact"><small>${esc(name)}</small><strong>${esc(value==null||value===''?'Não informado':value)}</strong></div>`).join('')}${p?[['Fotos na amostra',p.photos_sample],['Atualizações do proprietário na amostra',p.updates_sample],['Avaliações consultadas',p.review_sample],['Respostas observadas',p.answered_sample]].map(([k,v])=>`<div class="local-fact"><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join(''):''}</div><p class="help">Presença digital: ${esc(label(statuses,l.digital_status))} · Pontuação de oportunidade do CRM: ${esc(l.score)}. Essa pontuação não é nota oficial do Google. ${p?'Amostra coletada em '+date(p.collected_at):''}</p><div class="button-row"><button class="btn primary" data-local-run="profile" ${!state.user.apify?'disabled':''}>Atualizar perfil pela Apify</button><button class="btn" data-enrich="${l.id}">Pesquisar presença com Firecrawl</button></div><p class="help">A consulta Apify tem cobrança própria; o valor depende do seu plano.</p>${localJobInfo(data,'profile')}`;
  }
  if(tab==='regiao'){
    const peers=[...(l.rating==null?[]:[l]),...data.peers].sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)||(Number(b.reviews_count)||0)-(Number(a.reviews_count)||0));
    const position=peers.findIndex(p=>p.id===l.id);
    return `<div class="notice">Comparação interna de nota e quantidade de avaliações importadas; não representa o ranking nas buscas do Google. Só inclui negócios já salvos da mesma categoria, cidade e UF.</div><div class="metrics">${metric('Empresas com nota',peers.length)}${metric('Posição por avaliação',position>=0?`${position+1}º de ${peers.length}`:'Sem nota')}${metric('Média dos concorrentes',data.peers.length?(data.peers.reduce((sum,p)=>sum+Number(p.rating||0),0)/data.peers.length).toFixed(1):'—')}</div>${peers.length?`<div class="local-table"><div class="local-table-head"><span>Empresa</span><span>Nota</span><span>Avaliações</span></div>${peers.map((p,i)=>`<div class="local-table-row ${p.id===l.id?'local-current':''}"><span>${i+1}. ${esc(p.name)}${p.id===l.id?' (selecionada)':''}</span><span>${esc(p.rating)}</span><span>${esc(p.reviews_count??'—')}</span></div>`).join('')}</div>`:'<div class="empty">Sem notas importadas nesta localidade. Importe mais empresas para comparar.</div>'}<div class="button-row" style="margin-top:14px"><button class="btn primary" data-local-peers="1" ${l.category&&l.city&&l.state?'':'disabled'}>Buscar mais empresas desta região</button></div>`;
  }
  if(tab==='mapa'){
    const cells=data.grid?.cells||Array(9).fill(null);
    return `<div class="notice">Meça nove pontos reais com a Apify (ator de geogrid de terceiros) ou preencha os resultados observados manualmente. A medição pode ter custos na Apify.</div><form id="local-automatic-grid-form" class="form-grid"><label class="field span2">Termo pesquisado<input name="term" required maxlength="100" placeholder="Ex.: loja de roupas São Gonçalo" value="${esc(data.grid?.query||l.category||'')}"></label><button class="btn primary" ${!state.user.apify?'disabled':''}>Medir 3 × 3 com Apify</button></form>${localJobInfo(data,'grid')}${data.grid?`<h3 style="margin-top:20px">Última medição · ${esc(data.grid.source||'Manual')}</h3><p class="help">${esc(data.grid.query)} · ${date(data.grid.collected_at)}${data.grid.arp!=null?' · posição média '+esc(data.grid.arp):''}${data.grid.solv!=null?' · participação local '+esc(data.grid.solv)+'%':''}</p><div class="local-grid local-grid-result">${cells.map((rank,i)=>`<div class="local-grid-cell ${rank&&rank<=3?'good':rank&&rank<=10?'mid':'low'}"><strong>${rank?'#'+esc(rank):'—'}</strong><small>Ponto ${i+1}${data.grid.coords?.[i]?.every(v=>typeof v==='number')?' · '+data.grid.coords[i].map(v=>Number(v).toFixed(3)).join(', '):''}</small></div>`).join('')}</div>`:''}<details style="margin-top:20px"><summary>Registrar uma medição manual</summary><form id="local-grid-form" class="form-grid" style="margin-top:14px"><label class="field span2">Termo pesquisado<input name="query" required maxlength="100" value="${esc(data.grid?.query||'')}"></label><div class="local-grid span2">${cells.map((rank,i)=>`<label class="field">Ponto ${i+1}<input type="number" name="rank${i}" min="1" max="20" placeholder="Fora do top 20" value="${esc(rank??'')}"></label>`).join('')}</div><button class="btn">Salvar medição manual</button></form></details>`;
  }
  if(tab==='proposta'||tab==='contrato'){
    const place=[l.city,l.state].filter(Boolean).join(', ')||'[localização a confirmar]';
    const service=l.offer?label([['site','Site institucional'],['catalogo','Catálogo digital'],['nuvemshop','Loja Nuvemshop'],['yampi','Loja Yampi']],l.offer):'[definir serviço]';
    const price=l.amount!=null?money(l.amount):'[definir valor]';
    const proposal=`PROPOSTA COMERCIAL — ${l.name}\n\nEmpresa: ${l.name}\nSegmento: ${l.category||'[confirmar]'}\nLocalidade: ${place}\nContato: ${l.phone||'[confirmar]'}\n\nObjetivo: melhorar a presença digital do negócio.\nSituação observada: ${label(statuses,l.digital_status)} (revisar evidências antes de enviar).\n\nServiço: ${service}\nEntregáveis: [descrever entregáveis reais]\nPrazo de execução: [definir]\nInvestimento: ${price}\nValidade da proposta: [definir]\nPróximo passo: [combinar com o cliente]\n\nGean Fernandes · CRM ECOM`;
    const contract=`DADOS PARA CONTRATO — RASCUNHO\n\nContratante: ${l.name}\nEndereço: ${l.address||'[confirmar]'}\nContato: ${l.phone||'[confirmar]'}\nPrestador: [nome ou razão social, documento e endereço]\n\nServiço: ${service}\nEntregáveis: [descrever e revisar]\nValor: ${price}\nForma de pagamento: [definir]\nPrazos e aprovação das entregas: [definir]\nSuporte, alterações e cancelamento: [definir com as partes]\nData e assinatura das partes: [definir]\n\nEste é um roteiro editável para preencher. Revise os dados e o texto jurídico antes de usar como contrato.`;
    return `<div class="notice">${tab==='proposta'?'Rascunho baseado nos dados salvos. Confira o serviço, prazo e valor antes de apresentar.':'Roteiro de contratação. Preencha os termos com as partes e faça revisão jurídica antes de assinar.'}</div><label class="field">${tab==='proposta'?'Proposta editável':'Dados do contrato editáveis'}<textarea id="local-document" rows="17">${esc(tab==='proposta'?proposal:contract)}</textarea></label><p class="help" id="local-document-saved">Rascunho ainda não salvo.</p><div class="button-row" style="margin-top:12px"><button class="btn primary" data-local-save="${tab==='proposta'?'proposal':'contract'}">Salvar no CRM</button><a class="btn" id="local-pdf" href="/api/leads/${l.id}/local-document/${tab==='proposta'?'proposal':'contract'}.pdf" download hidden>Baixar PDF salvo</a><button class="btn" data-local-download="${tab}">Baixar TXT</button><button class="btn" data-local-copy="1">Copiar texto</button><button class="btn" data-lead="${l.id}">Abrir lead</button></div><p class="help" style="margin-top:12px">Salvar uma proposta move o lead para a etapa Proposta se ele estiver numa etapa anterior. O PDF apresenta o texto salvo; alterações feitas depois precisam ser salvas novamente.</p>`;
  }
  if(tab==='qr'){
    const qr=data.qr;
    return `<p class="help">Use o link de avaliações obtido do próprio perfil do Google. O QR leva a um endereço permanente deste CRM; você pode trocar o destino sem reimprimir. Cada abertura do link aumenta o contador, inclusive acessos de teste.</p><form id="local-qr-form" class="form-grid"><label class="field span2">Link HTTPS do perfil ou avaliações no Google<input name="destination" type="url" required maxlength="1000" placeholder="https://g.page/r/.../review" value="${esc(qr?.destination||'')}"></label><button class="btn primary">${qr?'Atualizar destino':'Criar QR Code'}</button></form>${qr?`<div class="local-qr-preview"><img src="/api/leads/${l.id}/review-qr.svg" alt="QR Code de avaliações de ${esc(l.name)}"><div><strong>${esc(qr.scans)} acessos registrados</strong><p class="help">Link permanente: <span class="mono">${esc(location.origin+'/r/'+qr.token)}</span><br>Atualizado em ${date(qr.updated_at)}.</p><a class="btn" href="/api/leads/${l.id}/review-qr.svg" download="avaliacoes-${l.id}.svg">Baixar QR em SVG</a></div></div>`:''}`;
  }
  return '';
}

async function crmPage(){
  title('CRM','Arraste os cards para mudar a etapa do lead.');
  const el=document.getElementById('content');
  el.innerHTML=`<div class="section-title"><div><h1>Funil comercial</h1><p>Da descoberta ao contrato fechado. Arraste os cards ou altere a etapa no detalhe.</p></div></div><div class="kanban" id="kanban"></div>`;
  try{const data=await api('/leads');state.leads=data.items;document.getElementById('kanban').innerHTML=stages.map(([code,name])=>{const items=data.items.filter(l=>l.stage===code);return `<section class="column" data-drop="${code}"><div class="column-head">${esc(name)}<span>${items.length}</span></div>${items.map(l=>`<div class="kanban-card" draggable="true" data-drag="${l.id}"><button class="link" data-lead="${l.id}" style="padding:0;text-align:left"><strong>${esc(l.name)}</strong></button><small>${esc(l.category||'Sem segmento')} · ${esc(l.city||'')}</small><span class="score">${l.score}</span></div>`).join('')}</section>`}).join('');}
  catch(e){failure(e)}
}
async function listsPage(){
  title('Listas','Agrupe leads por campanha, região ou prioridade.');
  const el=document.getElementById('content');el.innerHTML=`<div class="section-title"><div><h1>Minhas listas</h1><p>Organize empresas sem criar duplicatas.</p></div></div><section class="panel"><form id="list-form" class="button-row"><input class="input" style="max-width:320px" name="name" placeholder="Ex.: São Gonçalo · sem site" required><button class="btn primary">+ Criar lista</button></form></section><div id="lists" class="lead-grid" style="margin-top:16px"></div>`;
  try{const rows=await api('/lists');document.getElementById('lists').innerHTML=rows.length?rows.map(l=>`<div class="panel"><h2>${esc(l.name)}</h2><p class="muted">${l.count} lead${l.count===1?'':'s'}</p><button class="btn" data-list="${l.id}">Ver leads →</button></div>`).join(''):'<div class="empty" style="grid-column:1/-1">Nenhuma lista criada. Crie a primeira acima.</div>';}catch(e){failure(e)}
}
async function nichesPage(){
  title('Explorar Nichos','Escolha um segmento para prospectar.');
  const el=document.getElementById('content');el.innerHTML=`<div class="section-title"><div><h1>Oportunidades por nicho</h1><p>Segmentos encontrados nas suas próprias campanhas.</p></div></div><div id="niche-list" class="lead-grid"></div>`;
  try{const data=await api('/dashboard');document.getElementById('niche-list').innerHTML=data.niches.length?data.niches.map(x=>`<button class="panel" data-niche="${esc(x.category)}" style="text-align:left;color:inherit;cursor:pointer"><h2>${esc(x.category)}</h2><span class="muted">${x.count} lead${x.count===1?'':'s'}</span><div class="link">Buscar neste nicho →</div></button>`).join(''):'<div class="empty" style="grid-column:1/-1">As categorias aparecerão após cadastrar ou importar empresas.</div>';}catch(e){failure(e)}
}
async function messagesPage(){
  title('Mensagens','Abordagens individuais e revisadas por você.');
  const el=document.getElementById('content');el.innerHTML=`<div class="section-title"><div><h1>Preparar abordagem</h1><p>Escolha um lead e personalize a mensagem antes de abrir o WhatsApp.</p></div></div><div class="notice good">O CRM prepara o texto e abre a conversa. O envio acontece no WhatsApp por sua ação; abrir a conversa não confirma que a mensagem foi enviada.</div><div id="messages-leads" class="lead-grid"></div>`;
  try{const data=await api('/leads');const withPhone=data.items.filter(x=>x.whatsapp);document.getElementById('messages-leads').innerHTML=withPhone.length?withPhone.map(l=>`<div class="lead-card"><h3>${esc(l.name)}</h3><p class="muted">${esc(l.city||'')} · ${esc(label(statuses,l.digital_status))}</p><button class="btn primary" data-compose="${l.id}">Personalizar mensagem →</button></div>`).join(''):'<div class="empty" style="grid-column:1/-1">Nenhum lead com número celular plausível. A sintaxe do número não comprova cadastro no WhatsApp.</div>';}catch(e){failure(e)}
}
async function historyPage(){
  title('Histórico','O que foi registrado em cada oportunidade.');
  const el=document.getElementById('content');el.innerHTML=`<div class="section-title"><div><h1>Atividades recentes</h1><p>Chamadas, contatos, notas e movimentações do pipeline.</p></div></div><section class="panel" id="history"></section>`;
  try{const x=await api('/dashboard');document.getElementById('history').innerHTML=x.activity.length?x.activity.map(a=>`<div class="activity"><div><strong>${esc(a.kind)} · ${esc(a.name||'Lead')}</strong><div>${esc(a.detail)}</div><small>${date(a.created_at)}</small></div></div>`).join(''):'<div class="empty">Nenhuma atividade registrada ainda.</div>';}catch(e){failure(e)}
}
async function exportPage(){
  title('Exportações','Baixe seu banco de leads em CSV.');
  document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Exportar leads</h1><p>Baixe uma cópia dos contatos em CSV para suas planilhas.</p></div></div><section class="panel"><h2>Seu banco de empresas</h2><p class="help">O CSV traz os principais campos dos leads ativos; notas detalhadas e evidências continuam no Supabase. O download não remove nada do CRM.</p><button class="btn primary" data-action="export">${iconSvg('download',16)} Baixar CSV</button></section>`;
}
async function analyticsPage(){
  title('Análises','Acompanhe a conversão do seu funil.');
  const el=document.getElementById('content');el.innerHTML=`<div class="section-title"><div><h1>Resultados comerciais</h1><p>Dados calculados a partir dos registros reais do CRM.</p></div></div><div id="analytics"></div>`;
  try{const x=await api('/dashboard'),m=x.metrics,max=Math.max(...x.stages.map(y=>y.count),1);document.getElementById('analytics').innerHTML=`<div class="metrics">${metric('Leads',m.saved)}${metric('Contatados',m.contacted)}${metric('Propostas',m.proposals)}${metric('Clientes',m.customers)}</div><div class="two-col"><section class="panel"><h2>Funil por etapa</h2>${stages.map(([id,name])=>{const count=x.stages.find(y=>y.stage===id)?.count||0;return `<div class="stat-line"><span>${name}</span><strong>${count}</strong></div><div class="bar"><span style="width:${count/max*100}%"></span></div>`}).join('')}</section><section class="panel"><h2>Segmentos mais presentes</h2>${x.niches.length?x.niches.map(y=>`<div class="row-item"><strong>${esc(y.category)}</strong><span>${y.count}</span></div>`).join(''):'<div class="empty">Sem dados por segmento.</div>'}<p class="help" style="margin-top:20px">Custos por oportunidade dependem dos relatórios de consumo dos provedores; o CRM não estima valores que ainda não foram registrados.</p></section></div>`;}catch(e){failure(e)}
}
function integrationsPage(){
  title('Integrações','Conectores e fontes de dados da sua operação.');
  const cards=[
    {icon:'compass',category:'Descoberta',name:'Apify · Google Maps',description:'Encontra negócios por segmento e cidade, com telefone, endereço, avaliações e site informado.',active:state.user.apify,action:'buscar',cta:'Iniciar busca'},
    {icon:'search',category:'Enriquecimento',name:'Firecrawl · Pesquisa web',description:'Pesquisa a presença digital de cada lead e registra URLs como evidência para revisão.',active:state.user.firecrawl,action:'leads',cta:'Ver leads'},
    {icon:'message',category:'Mensagens personalizadas',name:'Groq · IA para WhatsApp',description:'Gera um rascunho curto para cada lead com dados conferidos e prévia real, quando disponível.',active:state.user.groq,action:'configuracoes',cta:'Configurar IA'},
    {icon:'upload',category:'Importação',name:'CSV · Sua base de empresas',description:'Importe contatos comerciais que você já tem e organize tudo no mesmo pipeline.',active:true,action:'leads',cta:'Ver leads'}
  ];
  document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Conectores e ferramentas</h1><p>Cada fonte tem sua função, estado e ação apresentados em um card.</p></div></div><div class="lead-grid">${cards.map(c=>`<article class="lead-card integration-card"><div class="integration-icon">${iconSvg(c.icon,21)}</div><div class="muted" style="font-size:11px;margin-top:17px">${esc(c.category)}</div><h2 style="margin:5px 0 10px">${esc(c.name)}</h2><p class="help">${esc(c.description)}</p><div class="lead-actions"><span class="badge ${c.active?'':'warning'}">${c.active?'Disponível':'Pendente de chave'}</span><button class="btn" data-view="${c.action}">${esc(c.cta)} ${iconSvg('arrow',14)}</button></div></article>`).join('')}<article class="lead-card integration-card"><div class="integration-icon">${iconSvg('file',21)}</div><div class="muted" style="font-size:11px;margin-top:17px">Criação de sites institucionais</div><h2 style="margin:5px 0 10px">Tooplate · prompts para sites</h2><p class="help">Prepare a ideia de um site ou portfólio para negócios locais. O Tooplate gera um prompt editável; a construção e publicação do site acontecem em outra ferramenta.</p><div class="lead-actions"><span class="badge">Ferramenta externa</span><a class="btn" href="https://www.tooplate.com/tools/ai-portfolio-page-prompt-generator" target="_blank" rel="noopener noreferrer">Portfólio ↗</a><a class="btn" href="https://www.tooplate.com/tools/ai-landing-page-prompt-generator" target="_blank" rel="noopener noreferrer">Site comercial ↗</a></div></article></div><section class="panel" style="margin-top:16px"><h2>Ator complementar sob demanda</h2><p class="help">O FlowExtract AI Lead Extractor pode extrair contatos e redes sociais de uma URL de empresa quando uma fonte adicional for necessária. É um ator de terceiros com cobrança própria na Apify; ele não é executado por este CRM no fluxo atual.</p><a class="btn" href="https://flowextractapi.com/docs/ai-lead-extractor.html" target="_blank" rel="noopener noreferrer">Conhecer ator ↗</a></section><section class="panel" style="margin-top:16px"><h2>Como ativar</h2><p class="help">Insira as chaves da Apify e Firecrawl em Configurações. Elas são cifradas no banco e nunca exibidas novamente na interface.</p></section>`;
}
function settingsPage(){
  title('Configurações','Conexões e operação da ferramenta.');
  if(state.user.role!=='admin'){
    document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Configurações</h1><p>Informações da sua conta e ferramentas disponíveis.</p></div></div><section class="panel"><h2>Sua conta</h2><p class="help">Conta autorizada: ${esc(state.user.email)}</p><p class="help">O administrador gerencia o prazo do acesso e as credenciais dos serviços.</p></section><section class="panel" style="margin-top:16px"><h2>Serviços disponíveis</h2><div class="button-row"><span class="badge">Apify: ${state.user.apify?'disponível':'não configurado'}</span><span class="badge">Firecrawl: ${state.user.firecrawl?'disponível':'não configurado'}</span><span class="badge">IA: ${state.user.groq?'disponível':'não configurada'}</span></div></section>`;
    return;
  }
  const keyForm=(service,name,configured)=>`<section class="panel"><h2>${name}</h2><span class="badge ${configured?'':'warning'}">${configured?'Configurada':'Pendente'}</span><form class="token-form" data-service="${service}" style="display:grid;gap:12px;margin-top:14px"><label class="field">Chave de API<input type="password" name="token" autocomplete="off" spellcheck="false" minlength="10" maxlength="4096" placeholder="Cole a chave aqui" required></label><button class="btn primary" type="submit">Salvar chave</button></form><p class="help" style="margin-top:12px">A chave salva não será exibida novamente. Cole uma nova para substituir a atual.</p><button class="btn ghost" data-remove-token="${service}" type="button">Remover chave salva</button></section>`;
  const emailForm=`<section class="panel"><h2>Alterar e-mail de acesso</h2><p class="help">E-mail atual: ${esc(state.user.email)}</p><form id="email-form" style="display:grid;gap:12px"><label class="field">Novo e-mail<input type="email" name="email" autocomplete="email" maxlength="254" required></label><label class="field">Senha atual<input type="password" name="current" autocomplete="current-password" required></label><button class="btn primary">Salvar novo e-mail</button></form><p class="help" style="margin-top:12px">Após a alteração, entre novamente com o novo e-mail e a mesma senha.</p></section>`;
  document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Configuração</h1><p>Conecte suas ferramentas de prospecção.</p></div></div><div class="two-col">${keyForm('apify','Apify · Google Maps',state.user.apify)}${keyForm('firecrawl','Firecrawl · pesquisa web',state.user.firecrawl)}${keyForm('groq','Groq · mensagens com IA',state.user.groq)}${state.user.resend?'<section class="panel"><h2>Resend · integração anterior</h2><p class="help">A chave de e-mail não é usada no acesso por WhatsApp. Se não precisar mais dela, você pode removê-la.</p><button class="btn ghost" data-remove-token="resend">Remover chave Resend</button></section>':''}<section class="panel"><h2>Contato e vendas</h2><p class="help">WhatsApp abre uma mensagem editada por lead. A ligação usa o número exibido para copiar ou abrir o discador; o serviço API4com continua externo. Sites e lojas são entregues por você na Nuvemshop ou Yampi.</p><div class="hr"></div><p class="help">Operador atual: ${esc(state.user.email)}.</p></section>${state.user.sso?'<section class="panel"><h2>Acesso</h2><p class="help">Seu acesso é controlado pela conta da Vercel. Gerencie membros e sessões no painel da Vercel.</p></section>':emailForm+'<section class="panel"><h2>Alterar senha</h2><form id="password-form" style="display:grid;gap:12px"><label class="field">Senha atual<input type="password" name="current" autocomplete="current-password" required></label><label class="field">Nova senha (mínimo 12 caracteres)<input type="password" name="new" autocomplete="new-password" minlength="12" required></label><button class="btn primary">Salvar nova senha</button></form><p class="help" style="margin-top:12px">Após a alteração, todas as sessões são encerradas.</p></section>'}</div>`;
}

async function openLead(id, compose=false){
  try{const lead=await api('/leads/'+id);state.lead=lead;state.drawerOpen=true;
    const mount=document.getElementById('drawer-mount');if(!mount)return;
    mount.innerHTML=`<div class="drawer-overlay" id="drawer-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalhes de ${esc(lead.name)}"><div class="drawer-top"><div class="logo">C</div><h2>${esc(lead.name)}</h2><button class="btn ghost" data-action="close-drawer" aria-label="Fechar">${iconSvg('close',16)}</button></div><div class="drawer-body"><div class="pill-row">${statusBadge(lead.digital_status)}<span class="badge dim">${esc(label(stages,lead.stage))}</span><span class="score">${lead.score}</span></div><section class="panel"><div class="panel-head"><h2>Dados da empresa</h2><span class="muted">${esc(lead.source)}</span></div><form id="lead-form" class="form-grid"><label class="field span2">Nome<input name="name" value="${esc(lead.name)}" required></label><label class="field">Segmento<input name="category" value="${esc(lead.category||'')}"></label><label class="field">Telefone<input name="phone" value="${esc(lead.phone||'')}"></label><label class="field">Cidade<input name="city" value="${esc(lead.city||'')}"></label><label class="field">UF<input name="state" value="${esc(lead.state||'')}"></label><label class="field span2">Site<input name="website" value="${esc(lead.website||'')}"></label><label class="field span2">Instagram<input name="instagram" value="${esc(lead.instagram||'')}"></label><label class="field span2">Endereço<input name="address" value="${esc(lead.address||'')}"></label><label class="field">Presença digital<select name="digital_status">${options(statuses,lead.digital_status)}</select></label><label class="field">Etapa<select name="stage">${options(stages,lead.stage)}</select></label><label class="field">Produto a oferecer<select name="offer">${options([['','Selecionar'],['site','Site institucional'],['catalogo','Catálogo digital'],['nuvemshop','Loja Nuvemshop'],['yampi','Loja Yampi']],lead.offer||'')}</select></label><label class="field">Valor da proposta (R$)<input type="number" min="0" step="0.01" name="amount" value="${esc(lead.amount??'')}" placeholder="1500,00"></label><label class="field span2">Próxima ação<input name="next_action_at" type="datetime-local" value="${esc((lead.next_action_at||'').slice(0,16))}"></label><label class="field span2">Notas<textarea name="notes" placeholder="O que você observou sobre a oportunidade?">${esc(lead.notes||'')}</textarea></label><button class="btn primary" type="submit">Salvar alterações</button></form></section><section class="panel"><h2>Criação do site</h2><p class="help">Site institucional: prepare um briefing com dados conferidos, gere um prompt no Tooplate e construa e publique o site na ferramenta escolhida. Para e-commerce, use Nuvemshop ou Yampi.</p><div class="button-row"><button class="btn" data-action="site-brief">Preparar briefing do site</button><button class="btn primary" data-action="lovable-prompt">Gerar prompt Lovable</button><a class="btn" href="https://www.tooplate.com/tools/ai-portfolio-page-prompt-generator" target="_blank" rel="noopener noreferrer">Abrir Tooplate ↗</a></div></section><section class="panel"><h2>Canais de contato</h2><div class="button-row">${lead.whatsapp?`<button class="btn primary" data-compose="${lead.id}">${iconSvg('message',15)} Preparar WhatsApp</button>`:'<span class="badge warning">WhatsApp não confirmado</span>'}<button class="btn" data-call="${lead.id}" ${lead.phone?'':'disabled'}>${iconSvg('phone',15)} Ligar / copiar número</button>${link(lead.website,'Abrir site')}${link(lead.instagram,'Abrir Instagram')}<button class="btn" data-find-instagram="${lead.id}">${iconSvg('search',15)} Encontrar Instagram</button>${link(lead.maps_url,'Abrir Maps')}</div><p class="help" style="margin-top:12px">O formato do celular não comprova que este número pertence à empresa ou está ativo no WhatsApp.</p></section><section class="panel"><div class="panel-head"><h2>Evidências públicas</h2><button class="link" data-enrich="${lead.id}">Pesquisar novamente ↻</button></div>${lead.observations.length?lead.observations.map(o=>`<div class="evidence"><strong>${esc(o.kind)}</strong><div>${esc(o.value)}</div>${o.source_url?link(o.source_url,'Ver fonte'):''}<small>${date(o.collected_at)}</small></div>`).join(''):'<div class="empty">Ainda não há evidências registradas.</div>'}</section><section class="panel"><h2>Registrar atividade</h2><form id="activity-form"><div class="form-grid"><label class="field">Tipo<select name="kind">${options([['nota','Nota'],['ligacao','Ligação realizada'],['resposta','Resposta recebida'],['reuniao','Reunião'],['proposta','Proposta enviada'],['tarefa','Tarefa']], 'nota')}</select></label><label class="field span2">Descrição<input name="detail" placeholder="Ex.: retorno marcado para amanhã" required></label><button class="btn">Registrar</button></div></form><div style="margin-top:14px">${lead.activities.length?lead.activities.map(a=>`<div class="activity"><div><strong>${esc(a.kind)}</strong><div>${esc(a.detail)}</div><small>${date(a.created_at)}</small></div></div>`).join(''):'<div class="empty">Nenhuma atividade registrada.</div>'}</div></section><section class="panel"><h2>Organização</h2><div id="lead-list-assign"></div><div class="hr"></div><button class="btn danger" data-block="${lead.id}">Bloquear novas abordagens</button><p class="help" style="margin:9px 0 0">Um telefone bloqueado não será reimportado pela busca ou por CSV.</p></section></div></aside></div>`;
    loadLeadLists(lead);
    if(compose)setTimeout(()=>composeMessage(),0);
  }catch(e){toast(e.message,true)}
}
async function findInstagram(id, button){
  try{
    if(button)button.disabled=true;
    toast('Pesquisando perfis pelo nome e endereço…');
    const result=await post('/leads/'+id+'/instagram');
    document.getElementById('instagram-modal')?.remove();
    const overlay=document.createElement('div');overlay.className='drawer-overlay';overlay.id='instagram-modal';
    overlay.innerHTML=`<aside class="drawer" style="width:min(620px,100%)" role="dialog" aria-modal="true" aria-label="Perfis candidatos no Instagram"><div class="drawer-top"><h2>Instagram · ${esc(result.name)}</h2><button class="btn ghost" data-action="close-instagram" aria-label="Fechar">${iconSvg('close',16)}</button></div><div class="drawer-body"><p class="help">Pesquisa: nome + ${esc(result.address||'localidade não informada')}. Confira o endereço, fotos e telefone no perfil antes de associá-lo ao lead.</p>${result.candidates.length?result.candidates.map(c=>`<section class="panel" style="margin-top:12px"><h3>${esc(c.title)}</h3><p class="help">${esc(c.description)}</p><p class="help">${esc(c.match)}</p><div class="button-row">${link(c.url,'Abrir perfil')}<button class="btn primary" data-instagram-confirm="${esc(c.url)}" data-instagram-lead="${id}">Confirmar este perfil</button></div></section>`).join(''):'<div class="empty">Nenhum perfil candidato encontrado nesta pesquisa. Revise nome e endereço do lead e tente novamente.</div>'}</div></aside>`;
    document.body.append(overlay);
  }catch(e){toast(e.message,true)}finally{if(button)button.disabled=false}
}
async function loadLeadLists(lead){
  const el=document.getElementById('lead-list-assign');if(!el)return;
  try{const lists=await api('/lists');el.innerHTML=lists.length?`<label class="field">Adicionar à lista<select id="assign-list"><option value="">Selecionar lista</option>${lists.map(l=>`<option value="${l.id}" ${lead.lists.includes(l.id)?'disabled':''}>${esc(l.name)}${lead.lists.includes(l.id)?' (já adicionado)':''}</option>`).join('')}</select></label><button class="btn" data-action="assign-list" style="margin-top:9px">Adicionar</button>`:'<p class="help">Crie uma lista em “Listas” para organizar este lead.</p>';}catch(e){el.textContent=e.message}
}
function composeMessage(){
  const l=state.lead;if(!l?.whatsapp)return toast('Não há celular plausível para WhatsApp.',true);
  const draft=`Olá! Tudo bem? Vi a ${l.name}${l.city?' em '+l.city:''} e gostaria de conhecer melhor o negócio. Trabalho com criação de sites e lojas virtuais. Posso te mostrar uma ideia para apresentar seus produtos online?`;
  const box=document.createElement('div');box.className='drawer-overlay';box.id='composer';
  box.innerHTML=`<div class="drawer" style="width:min(620px,100%)" role="dialog" aria-modal="true" aria-label="Mensagem para ${esc(l.name)}"><div class="drawer-top"><h2>Mensagem para ${esc(l.name)}</h2><button class="btn ghost" data-action="close-composer">${iconSvg('close',16)}</button></div><div class="drawer-body"><div class="notice good">Confira os dados antes de gerar. Abra e envie a mensagem manualmente pelo WhatsApp.</div><div class="form-grid"><label class="field">Nome da pessoa (se confirmado)<input id="ai-contact" maxlength="80" placeholder="Caso contrário, usaremos a empresa"></label><label class="field span2">O que você observou no Instagram? (opcional)<input id="ai-instagram" maxlength="240" placeholder="Um detalhe real do perfil, produto ou serviço"></label><label class="field span2">Link HTTPS de uma prévia já pronta (opcional)<input id="ai-preview" type="url" maxlength="350" placeholder="https://..." inputmode="url"></label><label class="field span2"><span style="display:flex;gap:8px;align-items:start"><input id="ai-preview-confirmed" type="checkbox" style="width:auto;margin-top:4px">Confirmo que esta prévia existe e posso mostrá-la sem custo</span></label><label class="field span2"><span style="display:flex;gap:8px;align-items:start"><input id="ai-images-confirmed" type="checkbox" style="width:auto;margin-top:4px">A prévia usa imagens reais da empresa com permissão de uso</span></label></div><div class="button-row" style="margin:12px 0"><button class="btn" data-action="generate-ai-message" ${state.user.groq?'':'disabled'}>${iconSvg('message',15)} Gerar mensagem com IA</button>${state.user.groq?'':'<span class="help">Adicione a chave Groq em Configurações para ativar.</span>'}</div><label class="field">Mensagem editável<textarea id="message-text" style="min-height:165px">${esc(draft)}</textarea></label><div class="button-row"><button class="btn primary" data-action="open-whatsapp">${iconSvg('message',15)} Abrir conversa no WhatsApp</button><button class="btn" data-action="copy-message">Copiar texto</button></div><p class="help">Número: +${esc(l.whatsapp)}. Confirme a identidade do destinatário; o texto só é enviado se você confirmar no WhatsApp.</p></div></div>`;document.body.append(box);
}

function siteBrief(){
  const l=state.lead;if(!l)return;
  const brief=`Crie a estrutura e o texto inicial de um site institucional responsivo para a empresa ${l.name}.
Segmento: ${l.category||'[confirmar segmento]'}.
Cidade: ${[l.city,l.state].filter(Boolean).join(', ')||'[confirmar cidade]'}.
Serviços ou produtos: [confirmar com a empresa].
Diferenciais reais: [confirmar com a empresa].
Identidade visual e imagens autorizadas: [solicitar à empresa].
Seções sugeridas: início, sobre, serviços ou portfólio, localização e contato.
Contato público confirmado: ${l.phone||'[confirmar telefone]'}.
Instagram divulgado: ${l.instagram||'[confirmar, se houver]'}.
Inclua uma chamada para ação clara e espaço para domínio próprio. Não invente preços, avaliações, depoimentos, endereço ou promessas. O proprietário deve aprovar todo o conteúdo antes da publicação.
Entregue conteúdo editável e instruções para produção do site. O resultado precisa de revisão, implementação e publicação separadas.`;
  const box=document.createElement('div');box.className='drawer-overlay';box.id='site-brief-modal';
  box.innerHTML=`<div class="drawer" style="width:min(620px,100%)"><div class="drawer-top"><h2>Briefing de site · ${esc(l.name)}</h2><button class="btn ghost" data-action="close-site-brief">${iconSvg('close',16)}</button></div><div class="drawer-body"><div class="notice good">Revise os campos entre colchetes com a empresa antes de gerar ou publicar o site.</div><label class="field">Briefing editável<textarea id="site-brief-text" style="min-height:400px">${esc(brief)}</textarea></label><div class="button-row"><button class="btn primary" data-action="copy-site-brief">Copiar briefing</button><a class="btn" href="https://www.tooplate.com/tools/ai-portfolio-page-prompt-generator" target="_blank" rel="noopener noreferrer">Abrir portfólio ↗</a><a class="btn" href="https://www.tooplate.com/tools/ai-landing-page-prompt-generator" target="_blank" rel="noopener noreferrer">Abrir site comercial ↗</a></div><p class="help">O Tooplate gera prompts. Ele não constrói nem hospeda automaticamente o site a partir deste CRM.</p></div></div>`;document.body.append(box);
}
function buildLovablePrompt(l, kind){
  const landing=kind==='landing';
  return `Crie ${landing?'uma landing page de captação de clientes':'um site institucional'} para ${l.name}, negócio local em ${[l.city,l.state].filter(Boolean).join(', ')||'[confirmar localização]'}. O objetivo é apresentar a empresa com clareza e estimular o contato direto.
Dados disponíveis do CRM (confirme com o proprietário antes de publicar):
- Segmento: ${l.category||'[confirmar]'}
- Endereço informado: ${l.address||'[confirmar]'}
- Telefone informado: ${l.phone||'[confirmar]'}
- Instagram informado: ${l.instagram||'[confirmar]'}
- Serviços ou produtos: [solicitar lista e descrição reais]
- Logo, cores, fotos e autorização de uso: [solicitar ao proprietário]
- Diferenciais, horário de atendimento e área atendida: [confirmar]

${landing?'Estruture uma página única com cabeçalho, proposta de valor, benefícios verificáveis, serviços ou produtos, como funciona, localização, perguntas frequentes e CTA de contato.':'Estruture as páginas Início, Sobre, Serviços ou Produtos, Portfólio (somente com material autorizado) e Contato, com navegação simples e CTA visível.'}
Desenvolva um site responsivo para celular e desktop, rápido, acessível e fácil de editar. Crie textos iniciais objetivos e metadados de SEO local para ${[l.city,l.state].filter(Boolean).join(', ')||'[localidade confirmada]'}. Se houver contato por WhatsApp, gere um botão com mensagem inicial editável, condicionado à confirmação do número pelo proprietário. Formulários só devem aparecer se tiverem destino funcional e consentimento adequado.
Não invente depoimentos, avaliações, preços, descontos, fotos, endereço, horário ou promessas. Use marcadores [confirmar] para informações faltantes. Entregue uma prévia para aprovação do proprietário antes da publicação. Não crie loja virtual ou checkout neste projeto.`;
}
function lovablePrompt(){
  const l=state.lead;if(!l)return;
  const box=document.createElement('div');box.className='drawer-overlay';box.id='lovable-prompt-modal';
  box.innerHTML=`<div class="drawer" style="width:min(660px,100%)"><div class="drawer-top"><h2>Prompt Lovable · ${esc(l.name)}</h2><button class="btn ghost" data-action="close-lovable-prompt" aria-label="Fechar">${iconSvg('close',16)}</button></div><div class="drawer-body"><p class="help">Escolha o formato, confira as informações com a empresa, copie o texto e cole em um novo projeto na Lovable.</p><label class="field">Formato do projeto<select id="lovable-kind"><option value="site">Site institucional</option><option value="landing">Landing page</option></select></label><label class="field">Prompt editável<textarea id="lovable-prompt-text" style="min-height:470px">${esc(buildLovablePrompt(l,'site'))}</textarea></label><div class="button-row"><button class="btn primary" data-action="copy-lovable-prompt">Copiar prompt</button><a class="btn" href="https://lovable.dev/" target="_blank" rel="noopener noreferrer">Abrir Lovable ↗</a></div><p class="help">A criação e publicação acontecem na Lovable, após sua revisão. Nada é enviado automaticamente pelo CRM.</p></div></div>`;
  document.body.append(box);
}
async function callLead(id){
  try{const l=state.lead?.id===id?state.lead:await api('/leads/'+id);if(!l.phone)return toast('Este lead não tem telefone.',true);
    await navigator.clipboard.writeText(l.phone).catch(()=>{});
    await post('/leads/'+id+'/activity',{kind:'ligacao',detail:'Número aberto para ligação; resultado ainda não registrado.'});
    toast('Número copiado. Abra seu VoIP ou discador para ligar.');
    if(state.lead?.id===id)openLead(id);else window.location.href='tel:'+l.phone.replace(/[^+\d]/g,'');
  }catch(e){toast(e.message,true)}
}
function newLead(){
  const box=document.createElement('div');box.className='drawer-overlay';box.id='new-lead-modal';box.innerHTML=`<aside class="drawer" style="width:min(530px,100%)"><div class="drawer-top"><h2>Cadastrar empresa</h2><button class="btn ghost" data-action="close-new">${iconSvg('close',16)}</button></div><div class="drawer-body"><form id="new-lead-form" class="form-grid"><label class="field span2">Nome da empresa<input name="name" required></label><label class="field">Segmento<input name="category"></label><label class="field">Telefone<input name="phone"></label><label class="field">Cidade<input name="city"></label><label class="field">UF<input name="state"></label><label class="field span2">Site<input name="website"></label><label class="field span2">Instagram<input name="instagram"></label><button class="btn primary">Salvar lead</button></form></div></aside>`;document.body.append(box);
}
async function submitForm(form){
  const button=form.querySelector('button[type="submit"],button:not([type])');
  if(button?.disabled)return;
  const original=button?.innerHTML;
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Aguarde…'}
  try{return await handleFormSubmit(form)}
  finally{if(button?.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=original}}
}
async function handleFormSubmit(form){
  const obj=Object.fromEntries(new FormData(form).entries());
  if(form.classList.contains('token-form')){
    try{await post('/integrations',{service:form.dataset.service,token:obj.token});form.reset();state.user=await api('/me');settingsPage();toast('Chave salva com segurança.')}catch(e){toast(e.message,true)}return;
  }
  if(form.id==='login-form'){
    try{state.user=await post('/login',obj);state.user=await api('/me');renderView();}
    catch(e){document.getElementById('login-error').textContent=e.message}return;
  }
  if(form.id==='global-search-form'){
    state.filters={...state.filters,q:obj.q.trim()};navigate('leads');return;
  }
  try{
    if(form.id==='local-radar-form'){
      state.radarFilters={city:obj.city.trim(),niche:obj.niche.trim(),state:obj.state.trim().toUpperCase(),min_rating:obj.min_rating,max_reviews:obj.max_reviews};
      await renderLocalModule();return;
    }
    if(form.id==='local-search-form'){state.localSearch=obj.q.trim();localPage();return}
    if(form.id==='local-automatic-grid-form'){await post('/leads/'+state.localLeadId+'/local/grid/run',{term:obj.term});toast('Medição solicitada. Aguarde os resultados da Apify.');renderLocalModule();return}
    if(form.id==='local-grid-form'){
      const cells=Array.from({length:9},(_,i)=>obj['rank'+i]===''?null:Number(obj['rank'+i]));
      await post('/leads/'+state.localLeadId+'/local',{query:obj.query,cells});toast('Medição salva no histórico da empresa.');renderLocalModule();return;
    }
    if(form.id==='local-qr-form'){await post('/leads/'+state.localLeadId+'/review-qr',{destination:obj.destination});toast('QR Code salvo; o endereço do QR continua o mesmo.');renderLocalModule();return}
    if(form.id==='apify-json-form'){const batch=await post('/import-apify',obj);state.batchId=batch.id;form.querySelector('[name=json]').value='';toast(`${batch.total} empresas importadas; ${batch.created} novas.`);loadImportBatches();return}
    if(form.id==='campaign-form'){await post('/campaigns',obj);toast('Busca iniciada. Acompanhe o progresso abaixo.');form.reset();loadCampaigns()}
    if(form.id==='new-lead-form'){const data=await post('/leads',obj);document.getElementById('new-lead-modal')?.remove();toast(data.created?'Lead cadastrado.':'Lead existente encontrado.');await leadsPage();openLead(data.id)}
    if(form.id==='lead-form'){const id=state.lead.id;const data=await api('/leads/'+id,{method:'PATCH',body:obj});toast('Lead atualizado.');openLead(data.id)}
    if(form.id==='activity-form'){await post('/leads/'+state.lead.id+'/activity',obj);toast('Atividade registrada.');openLead(state.lead.id)}
    if(form.id==='list-form'){await post('/lists',obj);toast('Lista criada.');listsPage()}
    if(form.id==='password-form'){await post('/change-password',obj);state.user=null;renderLogin();toast('Senha alterada. Entre novamente.')}
    if(form.id==='email-form'){await post('/change-email',obj);state.user=null;renderLogin();toast('E-mail alterado. Entre novamente com o novo endereço.')}
  }catch(e){toast(e.message,true)}
}

document.addEventListener('submit',event=>{event.preventDefault();submitForm(event.target)});
document.addEventListener('click',async event=>{
  const hit=event.target.closest('[data-view],[data-lead],[data-compose],[data-call],[data-enrich],[data-block],[data-action],[data-niche],[data-list],[data-remove-token],[data-import-batch],[data-import-resume],[data-campaign-resume],[data-find-instagram],[data-instagram-confirm],[data-local-tab],[data-local-sidebar],[data-local-radar-search],[data-local-copy],[data-local-download],[data-local-run],[data-local-save],[data-local-peers]');if(!hit)return;
  if(hit.dataset.localRadarSearch){const f=document.getElementById('local-radar-form');const filters=f?Object.fromEntries(new FormData(f).entries()):state.radarFilters;navigate('buscar');setTimeout(()=>{const campaign=document.getElementById('campaign-form');if(campaign){campaign.elements.niche.value=filters.niche||'';campaign.elements.city.value=filters.city||'';campaign.elements.state.value=filters.state||''}},0);return}
  if(hit.dataset.localSidebar){state.localTab=hit.dataset.localSidebar;navigate('local/'+state.localTab);document.getElementById('sidebar')?.classList.remove('open');document.getElementById('scrim')?.classList.remove('show');return}
  if(hit.dataset.localPeers){const l=state.localData?.lead;if(!l)return;navigate('buscar');setTimeout(()=>{const f=document.getElementById('campaign-form');if(f){f.elements.niche.value=l.category||'';f.elements.city.value=l.city||'';f.elements.state.value=l.state||''}},0);return}
  if(hit.dataset.localSave){try{const result=await post(`/leads/${state.localLeadId}/local-document/${hit.dataset.localSave}`,{body:document.getElementById('local-document').value});document.getElementById('local-document-saved').textContent='Salvo no CRM em '+date(result.created_at);document.getElementById('local-pdf').hidden=false;toast('Documento salvo no CRM.')}catch(e){toast(e.message,true)}return}
  if(hit.dataset.localRun){try{hit.disabled=true;await post('/leads/'+state.localLeadId+'/local/profile/run',{});toast('Coleta solicitada. Aguarde a Apify.');renderLocalModule()}catch(e){toast(e.message,true)}finally{hit.disabled=false}return}
  if(hit.dataset.localTab){state.localTab=hit.dataset.localTab;navigate('local/'+state.localTab);return}
  if(hit.dataset.localCopy){try{await navigator.clipboard.writeText(document.getElementById('local-document').value);toast('Texto copiado.')}catch{toast('Não foi possível copiar.',true)}return}
  if(hit.dataset.localDownload){const content=document.getElementById('local-document')?.value;if(!content)return;const blob=new Blob([content],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=hit.dataset.localDownload+'-'+state.localLeadId+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);return}
  if(hit.dataset.view){navigate(hit.dataset.view);document.getElementById('sidebar')?.classList.remove('open');document.getElementById('scrim')?.classList.remove('show');return}
  if(hit.dataset.lead){openLead(Number(hit.dataset.lead));return}
  if(hit.dataset.compose){openLead(Number(hit.dataset.compose),true);return}
  if(hit.dataset.call){callLead(Number(hit.dataset.call));return}
  if(hit.dataset.niche){navigate('buscar');setTimeout(()=>{const e=document.querySelector('[name="niche"]');if(e)e.value=hit.dataset.niche},0);return}
  if(hit.dataset.list){state.filters={list_id:hit.dataset.list};navigate('leads');return}
  if(hit.dataset.removeToken){try{await api('/integrations/'+hit.dataset.removeToken,{method:'DELETE'});state.user=await api('/me');settingsPage();toast('Chave salva removida.')}catch(e){toast(e.message,true)}return}
  if(hit.dataset.importBatch){showImportBatch(Number(hit.dataset.importBatch));return}
  if(hit.dataset.importResume){try{await post('/import-apify/'+hit.dataset.importResume+'/resume');loadImportBatches()}catch(e){toast(e.message,true)}return}
  if(hit.dataset.campaignResume){try{hit.disabled=true;await post('/campaigns/'+hit.dataset.campaignResume+'/resume');toast('Busca retomada.');loadCampaigns()}catch(e){toast(e.message,true)}finally{hit.disabled=false}return}
  if(hit.dataset.findInstagram){findInstagram(Number(hit.dataset.findInstagram),hit);return}
  if(hit.dataset.instagramConfirm){try{const id=Number(hit.dataset.instagramLead);await post('/leads/'+id+'/instagram/confirm',{url:hit.dataset.instagramConfirm});document.getElementById('instagram-modal')?.remove();toast('Instagram associado ao lead.');if(state.view==='leads')loadLeads();if(state.lead?.id===id)openLead(id)}catch(e){toast(e.message,true)}return}
  if(hit.dataset.enrich){try{hit.disabled=true;await post('/leads/'+hit.dataset.enrich+'/enrich');toast('Pesquisa concluída. Confira as evidências.');openLead(Number(hit.dataset.enrich))}catch(e){toast(e.message,true)}finally{hit.disabled=false}return}
  if(hit.dataset.block){if(!confirm('Bloquear este contato e impedir novas importações pelo telefone?'))return;try{await post('/leads/'+hit.dataset.block+'/block');document.getElementById('drawer-mount').innerHTML='';toast('Contato bloqueado.');renderView()}catch(e){toast(e.message,true)}return}
  switch(hit.dataset.action){
    case 'install-app': await installApp();break;
    case 'close-install-help': document.getElementById('install-overlay')?.remove();break;
    case 'toggle-theme':{
      state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme;
      try{localStorage.setItem('crm-theme',state.theme)}catch{}
      hit.innerHTML=iconSvg(state.theme==='dark'?'sun':'moon',18);hit.title=state.theme==='dark'?'Modo claro':'Modo escuro';hit.setAttribute('aria-label',state.theme==='dark'?'Ativar modo claro':'Ativar modo escuro');break;
    }
    case 'logout': try{await post('/logout');state.user=null;renderLogin()}catch(e){toast(e.message,true)}break;
    case 'toggle-sidebar':{state.sidebarCollapsed=!state.sidebarCollapsed;try{localStorage.setItem('crm-sidebar-collapsed',state.sidebarCollapsed?'1':'0')}catch{}const sidebar=document.getElementById('sidebar');sidebar.classList.toggle('collapsed',state.sidebarCollapsed);document.querySelector('.main')?.classList.toggle('sidebar-is-collapsed',state.sidebarCollapsed);hit.textContent=state.sidebarCollapsed?'›':'‹';hit.setAttribute('aria-label',state.sidebarCollapsed?'Expandir menu lateral':'Minimizar menu lateral');hit.setAttribute('aria-expanded',String(!state.sidebarCollapsed));hit.title=hit.getAttribute('aria-label');break}
    case 'menu': document.getElementById('sidebar')?.classList.add('open');document.getElementById('scrim')?.classList.add('show');break;
    case 'close-instagram':document.getElementById('instagram-modal')?.remove();break;
    case 'close-drawer': document.getElementById('drawer-mount').innerHTML='';state.lead=null;break;
    case 'close-composer':document.getElementById('composer')?.remove();break;
    case 'close-new':document.getElementById('new-lead-modal')?.remove();break;
    case 'new-lead':newLead();break;
    case 'site-brief':siteBrief();break;
    case 'lovable-prompt':lovablePrompt();break;
    case 'close-lovable-prompt':document.getElementById('lovable-prompt-modal')?.remove();break;
    case 'copy-lovable-prompt':try{await navigator.clipboard.writeText(document.getElementById('lovable-prompt-text').value);toast('Prompt Lovable copiado.')}catch{toast('Não foi possível copiar automaticamente.',true)}break;
    case 'close-site-brief':document.getElementById('site-brief-modal')?.remove();break;
    case 'copy-site-brief':try{await navigator.clipboard.writeText(document.getElementById('site-brief-text').value);toast('Briefing copiado.')}catch{toast('Não foi possível copiar automaticamente.',true)}break;
    case 'import-csv':document.getElementById('csv-file')?.click();break;
    case 'filter':state.filters={...state.filters,q:document.getElementById('lead-q').value.trim(),digital_status:document.getElementById('lead-status').value,stage:document.getElementById('lead-stage').value};loadLeads();break;
    case 'clear-filter':state.filters={};leadsPage();break;
    case 'refresh-campaigns':loadCampaigns();break;
    case 'refresh-imports':loadImportBatches();break;
    case 'generate-ai-message':{
      const button=hit;button.disabled=true;button.textContent='Gerando…';
      try{
        const result=await post('/leads/'+state.lead.id+'/message-draft',{
          contact_name:document.getElementById('ai-contact').value.trim(),
          instagram_observation:document.getElementById('ai-instagram').value.trim(),
          preview_url:document.getElementById('ai-preview').value.trim(),
          preview_confirmed:document.getElementById('ai-preview-confirmed').checked,
          images_confirmed:document.getElementById('ai-images-confirmed').checked
        });
        document.getElementById('message-text').value=result.message;
        toast('Rascunho gerado. Revise antes de abrir o WhatsApp.');
      }catch(e){toast(e.message,true)}finally{button.disabled=false;button.innerHTML=iconSvg('message',15)+' Gerar mensagem com IA'}break;
    }
    case 'copy-message':try{await navigator.clipboard.writeText(document.getElementById('message-text').value);toast('Mensagem copiada.')}catch{toast('Não foi possível copiar automaticamente.',true)}break;
    case 'open-whatsapp':{
      const message=document.getElementById('message-text')?.value.trim();if(!message)return toast('Escreva uma mensagem antes de abrir a conversa.',true);
      const url=`https://wa.me/${state.lead.whatsapp}?text=${encodeURIComponent(message)}`;
      window.open(url,'_blank','noopener,noreferrer');
      try{await post('/leads/'+state.lead.id+'/activity',{kind:'whatsapp_aberto',detail:'Conversa aberta com mensagem preparada. Envio não confirmado.'});document.getElementById('composer')?.remove();toast('Conversa aberta. Confira o destinatário e envie no WhatsApp.')}catch(e){toast('Conversa aberta, mas o registro no CRM falhou: '+e.message,true)}break;
    }
    case 'assign-list':{const id=Number(document.getElementById('assign-list')?.value);if(!id)return toast('Selecione uma lista.',true);try{await post('/lists/'+id+'/items',{lead_id:state.lead.id});toast('Lead adicionado à lista.');openLead(state.lead.id)}catch(e){toast(e.message,true)}break;}
    case 'export':try{const blob=await api('/export');const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='crm-leads.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}catch(e){toast(e.message,true)}break;
  }
});
document.addEventListener('change',async event=>{
  if(event.target.id==='local-lead-select'){state.localLeadId=Number(event.target.value);renderLocalModule();return}
  if(event.target.id==='lovable-kind'){const field=document.getElementById('lovable-prompt-text');if(field&&state.lead)field.value=buildLovablePrompt(state.lead,event.target.value);return}
  if(event.target.id!=='csv-file')return;
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>900_000){toast('O CSV deve ter até 900 KB.',true);return}
  try{const result=await post('/import',{csv:await file.text()});toast(`${result.created} leads novos de ${result.processed} linhas processadas.`);loadLeads()}
  catch(e){toast(e.message,true)}
  finally{event.target.value=''}
});
document.addEventListener('click',event=>{if(event.target.id==='scrim'){document.getElementById('sidebar')?.classList.remove('open');event.target.classList.remove('show')}if(event.target.id==='install-overlay'){event.target.remove()}if(event.target.id==='drawer-overlay'){document.getElementById('drawer-mount').innerHTML='';state.lead=null}if(event.target.id==='composer'||event.target.id==='site-brief-modal'||event.target.id==='instagram-modal'||event.target.id==='lovable-prompt-modal')event.target.remove()});
let dragging=null;
document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-drag]');if(card){dragging=Number(card.dataset.drag);event.dataTransfer.effectAllowed='move'}});
document.addEventListener('dragover',event=>{const col=event.target.closest('[data-drop]');if(col){event.preventDefault();col.classList.add('over')}});
document.addEventListener('dragleave',event=>{const col=event.target.closest('[data-drop]');if(col&&!col.contains(event.relatedTarget))col.classList.remove('over')});
document.addEventListener('drop',async event=>{const col=event.target.closest('[data-drop]');if(!col||!dragging)return;event.preventDefault();col.classList.remove('over');try{await api('/leads/'+dragging,{method:'PATCH',body:{stage:col.dataset.drop}});toast('Etapa atualizada.');crmPage()}catch(e){toast(e.message,true)}dragging=null});
window.addEventListener('hashchange',renderView);
(async()=>{try{state.authConfig=await api('/auth/config');state.user=await api('/me');state.view=getView();renderView()}catch(e){if(!state.user && (e.message==='Entre para continuar'||e.message.includes('Sessão expirada')))renderLogin();else renderUnavailable(e.message)}})();
