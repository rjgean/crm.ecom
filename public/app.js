const root = document.getElementById('app');
const state = { sidebarCollapsed: (()=>{try{return localStorage.getItem('crm-sidebar-collapsed')==='1'}catch{return false}})(), user: null, authConfig: null, view: 'painel', lead: null, leads: [], filters: {}, toastTimer: null, drawerOpen: false, batchId: null, importPoll: null };
const stages = [['novo','Novo'],['pesquisado','Pesquisado'],['qualificado','Qualificado'],['contato','Contato iniciado'],['respondeu','Respondeu'],['reuniao','Reunião'],['proposta','Proposta'],['negociacao','Negociação'],['ganho','Ganho'],['perdido','Perdido']];
const importStatus = {queued:'Na fila',running:'Pesquisando',paused:'Pausado',done:'Concluído',pending:'Aguardando',processing:'Pesquisando',error:'Falhou',skipped:'Ignorado'};
const statuses = [['incerto','Incerto'],['sem_site_identificado','Sem site identificado'],['apenas_redes','Apenas redes sociais'],['site_sem_loja','Site sem loja'],['marketplace','Marketplace'],['loja_virtual','Loja virtual']];
const nav = [
  ['painel','◫','Painel'],['buscar','⌕','Procurar Clientes'],['importar','⇧','Importar JSON'],['leads','▤','Meus Leads'],['listas','▦','Listas'],
  ['crm','◇','CRM'],['nichos','◎','Explorar Nichos'],['mensagens','✧','Mensagens'],['historico','◷','Histórico'],
  ['exportacoes','⇩','Exportações'],['analytics','▥','Analytics'],['integracoes','⬡','Integrações'],['configuracoes','⚙','Configurações'],['acessos','⌘','Acessos']
];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = (items, value) => items.find(x => x[0] === value)?.[1] || value || 'Não informado';
const money = value => value == null || value === '' ? '—' : Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const safeLink = value => { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const link = (value, name) => safeLink(value) ? `<a href="${esc(safeLink(value))}" target="_blank" rel="noopener noreferrer" class="link">${esc(name || value)} ↗</a>` : '—';
const options = (items, selected) => items.map(([value,text]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(text)}</option>`).join('');
const statusBadge = value => `<span class="badge ${value === 'incerto' || value === 'sem_site_identificado' ? 'warning' : value === 'loja_virtual' ? 'dim' : ''}">${esc(label(statuses,value))}</span>`;

async function api(path, opts={}) {
  const headers = { ...(opts.body ? {'Content-Type':'application/json'} : {}), ...(state.user?.csrf ? {'X-CSRF-Token':state.user.csrf} : {}) };
  let response;
  try { response = await fetch('/api' + path, { credentials:'same-origin', headers, ...opts, body:opts.body ? JSON.stringify(opts.body) : undefined }); }
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
  const message = new URLSearchParams(location.search).get('auth_error');
  const google=state.authConfig?.google;
  root.innerHTML=`<main class="auth"><section class="auth-card"><div class="brand">CRM<span>•</span>ECOM</div><h1>Verificação de acesso</h1>${google?`<p class="muted">Entre com a conta Google autorizada pelo administrador.</p><a class="btn primary full" href="/api/auth/google/start">Entrar com Google →</a>${message?`<p class="notice" role="alert">${message==='2'?'Este e-mail não está cadastrado ou o acesso expirou.':'Não foi possível confirmar o login. Tente novamente.'}</p>`:''}`:`<p class="muted">Digite o token enviado pelo administrador no seu WhatsApp.</p><form id="access-verify-form"><label class="field">Token de acesso<input name="code" inputmode="text" autocomplete="one-time-code" spellcheck="false" maxlength="14" required placeholder="XXXX-XXXX-XXXX"></label><button class="btn primary full">Acessar ferramenta →</button><div id="login-error" class="muted" role="alert"></div></form>`}</section></main>`;
}

function renderPasswordLogin(){
  root.innerHTML=`<main class="auth"><section class="auth-card"><div class="brand">CRM<span>•</span>ECOM</div><h1>Acesso local</h1><form id="login-form"><label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="field">Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="btn primary full">Entrar</button><div id="login-error" class="muted" role="alert"></div></form><button class="btn ghost full" type="button" data-action="back-access">Usar token do WhatsApp</button></section></main>`;
}

function shell() {
  const n = nav.filter(([id])=>state.user.role==='admin'||id!=='acessos').map(([id,icon,text],idx)=>`${idx===0||idx===6||idx===11?`<div class="nav-group">${idx===0?'Operação':idx===6?'Inteligência':'Ferramentas'}</div>`:''}<button title="${esc(text)}" aria-label="${esc(text)}" class="nav-link ${state.view===id?'active':''}" data-view="${id}"><span class="icon">${icon}</span><span class="nav-label">${text}</span></button>`).join('');
  root.innerHTML=`<div class="scrim" id="scrim"></div><div class="shell"><aside class="sidebar ${state.sidebarCollapsed?'collapsed':''}" id="sidebar"><div class="sidebar-head"><div class="logo">C</div><div class="brand">CRM<span>•</span>ECOM</div><button class="sidebar-collapse" data-action="toggle-sidebar" type="button" aria-label="${state.sidebarCollapsed?'Expandir menu lateral':'Minimizar menu lateral'}" aria-expanded="${!state.sidebarCollapsed}" title="${state.sidebarCollapsed?'Expandir menu lateral':'Minimizar menu lateral'}">${state.sidebarCollapsed?'›':'‹'}</button></div><nav class="nav">${n}</nav><div class="sidebar-foot"><div class="sidebar-user">Operador<br><strong>${esc(state.user.email)}</strong></div>${state.user.sso?'':'<button class="btn ghost full" data-action="logout">Sair da conta</button>'}</div></aside><div class="main ${state.sidebarCollapsed?'sidebar-is-collapsed':''}"><header class="topbar"><button class="mobile-toggle" data-action="menu" aria-label="Abrir menu">☰</button><div class="topbar-title"><h1 id="top-title">Painel</h1><small id="top-subtitle">Resumo da sua prospecção</small></div><span class="topbar-badge ${state.user.apify&&state.user.firecrawl?'':'offline'}">${state.user.apify&&state.user.firecrawl?'● Integrações prontas':'● Configuração parcial'}</span></header><main class="page" id="content"></main></div></div><div id="drawer-mount"></div>`;
}
function title(name, sub) { document.getElementById('top-title').textContent=name;document.getElementById('top-subtitle').textContent=sub; }
async function renderView() {
  if (!state.user) return;
  clearTimeout(state.importPoll);
  state.view=getView();
  if (!nav.some(x=>x[0]===state.view) || (state.user.role!=='admin' && state.view==='acessos')) state.view='painel';
  shell();loading();
  const selected=document.querySelector(`.nav-link[data-view="${state.view}"]`);selected?.classList.add('active');
  try {
    ({painel:dashboard,buscar:searchPage,importar:importPage,leads:leadsPage,listas:listsPage,crm:crmPage,nichos:nichesPage,mensagens:messagesPage,historico:historyPage,exportacoes:exportPage,analytics:analyticsPage,integracoes:integrationsPage,configuracoes:settingsPage,acessos:accessPage})[state.view]();
  } catch(err) { failure(err); }
}
function metric(name,value){return `<div class="metric"><div class="metric-label">${esc(name)}</div><div class="metric-value">${esc(value)}</div></div>`}
async function dashboard(){
  title('Painel','Resumo da sua prospecção.');
  try {
    const x=await api('/dashboard');const m=x.metrics;
    document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Visão geral</h1><p>O que está acontecendo na sua operação comercial.</p></div><button class="btn primary" data-view="buscar">+ Procurar clientes</button></div><div class="metrics">${metric('Empresas encontradas',m.found)}${metric('Leads salvos',m.saved)}${metric('Sem site identificado',m.no_site)}${metric('Contatados',m.contacted)}${metric('Propostas',m.proposals)}${metric('Clientes',m.customers)}${metric('Score médio',m.avg_score)}</div><div class="two-col"><section class="panel"><div class="panel-head"><h2>Leads recentes</h2><button class="link" data-view="leads">Ver todos →</button></div>${x.recent.length?x.recent.map(l=>`<div class="row-item"><button data-lead="${l.id}"><strong>${esc(l.name)}</strong><small>${esc(l.city||'Cidade não informada')} · ${esc(label(statuses,l.digital_status))}</small></button><span class="score">${l.score}</span></div>`).join(''):`<div class="empty"><strong>Nenhum lead salvo</strong>Busque empresas por nicho e localização.<br><button class="link" data-view="buscar">Procurar clientes →</button></div>`}</section><section class="panel"><div class="panel-head"><h2>Atividade recente</h2><button class="link" data-view="historico">Ver histórico →</button></div>${x.activity.length?x.activity.map(a=>`<div class="activity"><div><strong>${esc(a.kind)} · ${esc(a.name||'Lead')}</strong><div>${esc(a.detail)}</div><small>${date(a.created_at)}</small></div></div>`).join(''):`<div class="empty"><strong>Nenhuma atividade ainda</strong>As ações realizadas nos leads aparecerão aqui.</div>`}</section></div>`;
  }catch(e){failure(e)}
}
async function searchPage(){
  title('Procurar Clientes','Encontre empresas por nicho e localização.');
  const el=document.getElementById('content');
  el.innerHTML=`<div class="section-title"><div><h1>Encontre sua próxima oportunidade</h1><p>Apify encontra negócios; Firecrawl investiga sua presença digital.</p></div></div>${!state.user.apify?'<div class="notice">Configure a chave da Apify em Configurações para iniciar buscas. Você pode importar o JSON extraído por você na Apify e usar o CRM.</div>':''}${!state.user.firecrawl?'<div class="notice">Configure a chave do Firecrawl em Configurações. A importação JSON funcionará, mas a pesquisa de presença digital aguardará a chave.</div>':''}<section class="panel"><h2>Nova busca</h2><form id="campaign-form" class="form-grid"><label class="field span2">O que você está procurando?<input name="niche" placeholder="Ex.: estética automotiva, moda feminina" required maxlength="100"></label><label class="field">Cidade<input name="city" placeholder="São Gonçalo" required maxlength="100"></label><label class="field">UF<input name="state" placeholder="RJ" required maxlength="2"></label><label class="field">Limite de empresas<input name="limit" type="number" min="1" max="100" value="20" required></label><button class="btn primary" type="submit" ${state.user.apify?'':'disabled'}>⌕ Iniciar busca</button></form><p class="help" style="margin:15px 0 0">A pesquisa gera custos nos serviços conectados. Comece com um limite pequeno. “Sem site identificado” exige conferência antes de abordar o negócio.</p></section><section class="panel" style="margin-top:16px"><div class="panel-head"><h2>Campanhas recentes</h2><button class="link" data-action="refresh-campaigns">Atualizar ↻</button></div><div id="campaigns" class="campaign-list">Carregando…</div></section>`;
  loadCampaigns();
}
async function loadCampaigns(){
  const el=document.getElementById('campaigns');if(!el)return;
  try{const rows=await api('/campaigns');if(!document.getElementById('campaigns'))return;
    el.innerHTML=rows.length?rows.map(c=>`<div class="campaign-card"><div><strong>${esc(c.niche)} · ${esc(c.city)}, ${esc(c.state)}</strong><small>${date(c.created_at)} · limite ${c.limit_count} · encontrados ${c.found} · novos ${c.saved} · enriquecidos ${c.enriched}</small>${c.error?`<small style="color:var(--gold)">${esc(c.error)}</small>`:''}</div><span class="badge ${c.status==='failed'?'red':c.status==='done'?'':'warning'}">${esc(c.status)}</span></div>`).join(''):'<div class="empty">Nenhuma campanha ainda. Use os filtros acima para iniciar.</div>';
    const active=rows.find(c=>['queued','running','enriching'].includes(c.status));
    if(active) setTimeout(async()=>{if(state.view!=='buscar')return;try{if(state.user.serverless)await post(`/campaigns/${active.id}/advance`,{});await loadCampaigns()}catch(e){toast(e.message,true)}},5000);
  }catch(e){el.textContent=e.message}
}
function importPage(){
  title('Importar JSON','Apify manual e pesquisa Firecrawl passo a passo.');
  document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Importar empresas da Apify</h1><p>Faça a coleta na sua conta Apify, copie o JSON exportado e cole abaixo. Cada empresa será salva no CRM.</p></div></div>${!state.user.firecrawl?'<div class="notice">Configure a chave do Firecrawl em Configurações para iniciar a pesquisa dos sites. Você já pode importar os leads.</div>':''}<section class="panel"><form id="apify-json-form" class="form-grid"><label class="field span2">Nome da lista<input name="name" value="Empresas importadas da Apify" maxlength="100" required></label><label class="field">Cidade padrão (se faltar no JSON)<input name="city" placeholder="Rio de Janeiro" maxlength="100"></label><label class="field">UF padrão<input name="state" placeholder="RJ" maxlength="2"></label><label class="field span2">JSON exportado da Apify<textarea name="json" rows="12" spellcheck="false" required placeholder='[{"title":"Loja Exemplo","phone":"21999999999","website":"","url":"https://maps.google.com/..."}]'></textarea></label><button class="btn primary" type="submit">Importar empresas e pesquisar com Firecrawl →</button></form><p class="help" style="margin:12px 0 0">Aceita array de empresas ou objeto com items/data; até 500 empresas por importação. Chaves e dados sensíveis não devem estar no JSON colado. A pesquisa avança uma empresa por vez enquanto esta tela estiver aberta; você pode voltar para continuar.</p></section><section class="panel" style="margin-top:16px"><div class="panel-head"><h2>Importações</h2><button class="link" data-action="refresh-imports">Atualizar ↻</button></div><div id="import-list">Carregando…</div></section><section class="panel" id="import-details" style="margin-top:16px"></section>`;
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
  el.innerHTML=`<div class="section-title"><div><h1>Banco de leads</h1><p>Encontre, revise e aborde cada oportunidade.</p></div><div class="button-row"><button class="btn" data-action="import-csv">⇧ Importar CSV</button><button class="btn primary" data-action="new-lead">+ Novo lead</button></div></div><input id="csv-file" type="file" accept=".csv,text/csv" hidden><p class="help">Importação: CSV UTF-8 com coluna name; opcionais city, state, phone, category, website, instagram. Até 500 linhas por arquivo.</p>${state.filters.list_id?'<div class="notice good">Exibindo somente os leads desta lista. Clique em Limpar para ver todos.</div>':''}${filtersHtml()}<div id="lead-count" class="help"></div><div id="lead-grid" class="lead-grid"></div>`;
  await loadLeads();
}
async function loadLeads(){
  const q=new URLSearchParams();for(const [k,v] of Object.entries(state.filters))if(v)q.set(k,v);
  try{const data=await api('/leads?'+q);state.leads=data.items;const count=document.getElementById('lead-count'),grid=document.getElementById('lead-grid');if(!grid)return;
    count.textContent=`${data.total} empresa${data.total===1?'':'s'} encontrada${data.total===1?'':'s'}${data.total>300?' · exibindo as primeiras 300':''}`;
    grid.innerHTML=data.items.length?data.items.map(leadCard).join(''):'<div class="empty" style="grid-column:1/-1"><strong>Nenhum lead para estes filtros</strong>Altere os filtros, cadastre um contato ou inicie uma busca.</div>';
  }catch(e){failure(e)}
}
function leadCard(l){return `<article class="lead-card"><div class="lead-title"><div><h3>${esc(l.name)}</h3><small>${esc(l.category||'Segmento não informado')} · ${esc([l.city,l.state].filter(Boolean).join(', ')||'Local não informado')}</small></div><span class="score">${l.score}</span></div><div class="lead-meta"><span>☎ ${esc(l.phone||'Sem telefone')}</span><span>★ ${esc(l.rating??'—')} · ${esc(l.reviews_count??'—')} avaliações</span></div><div class="pill-row">${statusBadge(l.digital_status)}<span class="badge dim">${esc(label(stages,l.stage))}</span></div><div class="lead-actions"><button class="btn" data-lead="${l.id}">Ver detalhes</button><button class="btn" data-find-instagram="${l.id}">⌕ Instagram</button>${l.whatsapp?`<button class="btn" data-compose="${l.id}">◉ WhatsApp</button>`:''}<button class="btn" data-call="${l.id}" ${l.phone?'':'disabled'}>☎ Ligar</button></div></article>`}

async function crmPage(){
  title('CRM','Arraste os cards para mudar a etapa do lead.');
  const el=document.getElementById('content');
  el.innerHTML=`<div class="section-title"><div><h1>Pipeline comercial</h1><p>Da descoberta ao contrato fechado. Arraste os cards ou altere a etapa no detalhe.</p></div></div><div class="kanban" id="kanban"></div>`;
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
  document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Exportar leads</h1><p>Arquivo CSV compatível com planilhas. Inclui a origem e a data de atualização.</p></div></div><section class="panel"><h2>Seu banco de empresas</h2><p class="help">Leads bloqueados ficam fora da exportação. Abra o arquivo apenas em local seguro: ele contém contatos comerciais e anotações de negócio.</p><button class="btn primary" data-action="export">⇩ Baixar CSV</button></section>`;
}
async function analyticsPage(){
  title('Analytics','Acompanhe a conversão do seu funil.');
  const el=document.getElementById('content');el.innerHTML=`<div class="section-title"><div><h1>Resultados comerciais</h1><p>Dados calculados a partir dos registros reais do CRM.</p></div></div><div id="analytics"></div>`;
  try{const x=await api('/dashboard'),m=x.metrics,max=Math.max(...x.stages.map(y=>y.count),1);document.getElementById('analytics').innerHTML=`<div class="metrics">${metric('Leads',m.saved)}${metric('Contatados',m.contacted)}${metric('Propostas',m.proposals)}${metric('Clientes',m.customers)}</div><div class="two-col"><section class="panel"><h2>Pipeline por etapa</h2>${stages.map(([id,name])=>{const count=x.stages.find(y=>y.stage===id)?.count||0;return `<div class="stat-line"><span>${name}</span><strong>${count}</strong></div><div class="bar"><span style="width:${count/max*100}%"></span></div>`}).join('')}</section><section class="panel"><h2>Segmentos mais presentes</h2>${x.niches.length?x.niches.map(y=>`<div class="row-item"><strong>${esc(y.category)}</strong><span>${y.count}</span></div>`).join(''):'<div class="empty">Sem dados por segmento.</div>'}<p class="help" style="margin-top:20px">Custos por lead dependem dos relatórios de consumo dos provedores; o CRM não estima valores que ainda não foram registrados.</p></section></div>`;}catch(e){failure(e)}
}
function integrationsPage(){
  title('Integrações','Conectores e fontes de dados da sua operação.');
  const cards=[
    {icon:'◎',category:'Descoberta',name:'Apify · Google Maps',description:'Encontra negócios por segmento e cidade, com telefone, endereço, avaliações e site informado.',active:state.user.apify,action:'buscar',cta:'Iniciar busca'},
    {icon:'⌕',category:'Enriquecimento',name:'Firecrawl · Pesquisa web',description:'Pesquisa a presença digital de cada lead e registra URLs como evidência para revisão.',active:state.user.firecrawl,action:'leads',cta:'Ver leads'},
    {icon:'✧',category:'Mensagens personalizadas',name:'Groq · IA para WhatsApp',description:'Gera um rascunho curto para cada lead com dados conferidos e prévia real, quando disponível.',active:state.user.groq,action:'configuracoes',cta:'Configurar IA'},
    {icon:'⇧',category:'Importação',name:'CSV · Sua base de empresas',description:'Importe contatos comerciais que você já tem e organize tudo no mesmo pipeline.',active:true,action:'leads',cta:'Ver leads'}
  ];
  document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Conectores e ferramentas</h1><p>Cada fonte tem sua função, estado e ação apresentados em um card.</p></div></div><div class="lead-grid">${cards.map(c=>`<article class="lead-card integration-card"><div class="integration-icon">${c.icon}</div><div class="muted" style="font-size:11px;margin-top:17px">${esc(c.category)}</div><h2 style="margin:5px 0 10px">${esc(c.name)}</h2><p class="help">${esc(c.description)}</p><div class="lead-actions"><span class="badge ${c.active?'':'warning'}">${c.active?'Disponível':'Pendente de chave'}</span><button class="btn" data-view="${c.action}">${esc(c.cta)} →</button></div></article>`).join('')}<article class="lead-card integration-card"><div class="integration-icon">▣</div><div class="muted" style="font-size:11px;margin-top:17px">Criação de sites institucionais</div><h2 style="margin:5px 0 10px">Tooplate · prompts para sites</h2><p class="help">Prepare a ideia de um site ou portfólio para negócios locais. O Tooplate gera um prompt editável; a construção e publicação do site acontecem em outra ferramenta.</p><div class="lead-actions"><span class="badge">Ferramenta externa</span><a class="btn" href="https://www.tooplate.com/tools/ai-portfolio-page-prompt-generator" target="_blank" rel="noopener noreferrer">Portfólio ↗</a><a class="btn" href="https://www.tooplate.com/tools/ai-landing-page-prompt-generator" target="_blank" rel="noopener noreferrer">Site comercial ↗</a></div></article></div><section class="panel" style="margin-top:16px"><h2>Ator complementar sob demanda</h2><p class="help">O FlowExtract AI Lead Extractor pode extrair contatos e redes sociais de uma URL de empresa quando uma fonte adicional for necessária. É um ator de terceiros com cobrança própria na Apify; ele não é executado por este CRM no fluxo atual.</p><a class="btn" href="https://flowextractapi.com/docs/ai-lead-extractor.html" target="_blank" rel="noopener noreferrer">Conhecer ator ↗</a></section><section class="panel" style="margin-top:16px"><h2>Como ativar</h2><p class="help">Insira as chaves da Apify e Firecrawl em Configurações. Elas são cifradas no banco e nunca exibidas novamente na interface.</p></section>`;
}
function settingsPage(){
  title('Configurações','Conexões e operação da ferramenta.');
  if(state.user.role!=='admin'){
    document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Configurações</h1><p>Informações da sua conta e ferramentas disponíveis.</p></div></div><section class="panel"><h2>Sua conta</h2><p class="help">Conta autorizada: ${esc(state.user.email)}</p><p class="help">O administrador gerencia o prazo do acesso e as credenciais dos serviços.</p></section><section class="panel" style="margin-top:16px"><h2>Serviços disponíveis</h2><div class="button-row"><span class="badge">Apify: ${state.user.apify?'disponível':'não configurado'}</span><span class="badge">Firecrawl: ${state.user.firecrawl?'disponível':'não configurado'}</span><span class="badge">IA: ${state.user.groq?'disponível':'não configurada'}</span></div></section>`;
    return;
  }
  const keyForm=(service,name,configured)=>`<section class="panel"><h2>${name}</h2><span class="badge ${configured?'':'warning'}">${configured?'Configurada':'Pendente'}</span><form class="token-form" data-service="${service}" style="display:grid;gap:12px;margin-top:14px"><label class="field">Chave de API<input type="password" name="token" autocomplete="off" spellcheck="false" minlength="10" maxlength="4096" placeholder="Cole a chave aqui" required></label><button class="btn primary" type="submit">Salvar chave</button></form><p class="help" style="margin-top:12px">A chave salva não será exibida novamente. Cole uma nova para substituir a atual.</p><button class="btn ghost" data-remove-token="${service}" type="button">Remover chave salva</button></section>`;
  document.getElementById('content').innerHTML=`<div class="section-title"><div><h1>Configuração</h1><p>Conecte suas ferramentas de prospecção.</p></div></div><div class="two-col">${keyForm('apify','Apify · Google Maps',state.user.apify)}${keyForm('firecrawl','Firecrawl · pesquisa web',state.user.firecrawl)}${keyForm('groq','Groq · mensagens com IA',state.user.groq)}${state.user.resend?'<section class="panel"><h2>Resend · integração anterior</h2><p class="help">A chave de e-mail não é usada no acesso por WhatsApp. Se não precisar mais dela, você pode removê-la.</p><button class="btn ghost" data-remove-token="resend">Remover chave Resend</button></section>':''}<section class="panel"><h2>Contato e vendas</h2><p class="help">WhatsApp abre uma mensagem editada por lead. A ligação usa o número exibido para copiar ou abrir o discador; o serviço API4com continua externo. Sites e lojas são entregues por você na Nuvemshop ou Yampi.</p><div class="hr"></div><p class="help">Operador atual: ${esc(state.user.email)}.</p></section>${state.user.sso?'<section class="panel"><h2>Acesso</h2><p class="help">Seu acesso é controlado pela conta da Vercel. Gerencie membros e sessões no painel da Vercel.</p></section>':'<section class="panel"><h2>Alterar senha</h2><form id="password-form" style="display:grid;gap:12px"><label class="field">Senha atual<input type="password" name="current" autocomplete="current-password" required></label><label class="field">Nova senha (mínimo 12 caracteres)<input type="password" name="new" autocomplete="new-password" minlength="12" required></label><button class="btn primary">Salvar nova senha</button></form><p class="help" style="margin-top:12px">Após a alteração, todas as sessões são encerradas.</p></section>'}</div>`;
}

async function accessPage(){
  title('Acessos','Colaboradores e validade de uso da ferramenta.');
  const el=document.getElementById('content');
  el.innerHTML='<section class="panel"><div class="empty">Carregando acessos…</div></section>';
  if(state.user.google){
    try{
      const people=await api('/access/google-users');
      const defaultEnd=new Date(Date.now()+7*86400000);const localEnd=new Date(defaultEnd.getTime()-defaultEnd.getTimezoneOffset()*60000).toISOString().slice(0,16);
      el.innerHTML=`<div class="section-title"><div><h1>Acessos</h1><p>Autorize contas Google e defina o prazo de cada colaborador.</p></div></div><section class="panel"><h2>Adicionar colaborador</h2><form id="google-user-form" class="form-grid"><label class="field span2">E-mail da conta Google<input name="email" type="email" autocomplete="off" required placeholder="colaborador@exemplo.com"></label><label class="field span2">Acesso válido até<input name="expires_at" type="datetime-local" value="${localEnd}" required></label><button class="btn primary">Salvar acesso</button></form><p class="help">A pessoa entra com Google; contas não cadastradas não acessam o CRM.</p></section><section class="panel" style="margin-top:16px"><h2>Contas autorizadas</h2>${people.length?people.map(p=>`<div class="row-item"><div><strong>${esc(p.email)}</strong><small>${p.revoked_at?'Revogado em '+date(p.revoked_at):new Date(p.expires_at)<new Date()?'Expirado':'Válido até '+date(p.expires_at)}</small></div><div class="button-row">${p.revoked_at||new Date(p.expires_at)<new Date()?'':`<button class="btn danger" data-revoke-google="${p.id}">Revogar</button>`}</div></div>`).join(''):'<div class="empty">Nenhuma conta Google cadastrada.</div>'}</section>`;
    }catch(e){failure(e)}
    return;
  }
  try{
    const [settings,people]=await Promise.all([api('/access/settings'),api('/access/collaborators')]);
    const defaultEnd=new Date(Date.now()+7*86400000);const localEnd=new Date(defaultEnd.getTime()-defaultEnd.getTimezoneOffset()*60000).toISOString().slice(0,16);
    el.innerHTML=`<div class="section-title"><div><h1>Acessos</h1><p>Cadastre o WhatsApp e defina até quando a pessoa pode usar o CRM.</p></div></div><div class="two-col"><section class="panel"><h2>Seu WhatsApp de administrador</h2><form id="access-settings-form" class="form-grid"><label class="field span2">Número com DDD<input name="admin_whatsapp" type="tel" value="${esc(settings.admin_whatsapp||'')}" placeholder="(21) 99999-9999"></label><button class="btn primary">Salvar número</button></form><button class="btn ghost" type="button" data-issue-admin="1" style="margin-top:12px" ${settings.admin_whatsapp?'':'disabled'}>Gerar meu token de administrador</button><p class="help" style="margin-top:12px">Cadastre seu número antes de liberar o domínio público. Depois, gere um token próprio para continuar administrando o CRM pelo mesmo endereço.</p></section><section class="panel"><h2>Adicionar colaborador</h2><form id="collaborator-form" class="form-grid"><label class="field span2">WhatsApp do colaborador<input name="phone" type="tel" inputmode="tel" autocomplete="off" required placeholder="(21) 99999-9999"></label><label class="field span2">Acesso válido até<input name="expires_at" type="datetime-local" value="${localEnd}" required></label><button class="btn primary">Salvar acesso</button></form><p class="help" style="margin-top:12px">A validade escolhida encerra o acesso mesmo com uma sessão aberta. O ID enviado é válido por 10 minutos.</p></section></div><section class="panel" style="margin-top:16px"><h2>Colaboradores cadastrados</h2>${people.length?people.map(p=>`<div class="row-item"><div><strong>+${esc(p.phone)}</strong><small>${p.revoked_at?'Revogado em '+date(p.revoked_at):new Date(p.expires_at)<new Date()?'Expirado':'Válido até '+date(p.expires_at)}</small></div><div class="button-row">${p.revoked_at||new Date(p.expires_at)<new Date()?'':`<button class="btn primary" data-issue-access="${p.id}">Gerar ID e enviar pelo WhatsApp</button><button class="btn danger" data-revoke-access="${p.id}">Revogar</button>`}</div></div>`).join(''):'<div class="empty">Nenhum WhatsApp cadastrado.</div>'}</section><section class="panel" style="margin-top:16px"><h2>Como funciona</h2><p class="help">Gere um token para cada colaborador autorizado. O WhatsApp abre com o texto preenchido; confirme o envio. A página de login pede apenas o token.</p><div class="hr"></div><p class="help">Para usar este domínio com colaboradores, cadastre seu número e gere seu token antes de tornar a produção pública na Vercel. Mantenha as prévias protegidas.</p></section>`;
  }catch(e){failure(e)}
}

async function openLead(id, compose=false){
  try{const lead=await api('/leads/'+id);state.lead=lead;state.drawerOpen=true;
    const mount=document.getElementById('drawer-mount');if(!mount)return;
    mount.innerHTML=`<div class="drawer-overlay" id="drawer-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalhes de ${esc(lead.name)}"><div class="drawer-top"><div class="logo">C</div><h2>${esc(lead.name)}</h2><button class="btn ghost" data-action="close-drawer" aria-label="Fechar">✕</button></div><div class="drawer-body"><div class="pill-row">${statusBadge(lead.digital_status)}<span class="badge dim">${esc(label(stages,lead.stage))}</span><span class="score">${lead.score}</span></div><section class="panel"><div class="panel-head"><h2>Dados da empresa</h2><span class="muted">${esc(lead.source)}</span></div><form id="lead-form" class="form-grid"><label class="field span2">Nome<input name="name" value="${esc(lead.name)}" required></label><label class="field">Segmento<input name="category" value="${esc(lead.category||'')}"></label><label class="field">Telefone<input name="phone" value="${esc(lead.phone||'')}"></label><label class="field">Cidade<input name="city" value="${esc(lead.city||'')}"></label><label class="field">UF<input name="state" value="${esc(lead.state||'')}"></label><label class="field span2">Site<input name="website" value="${esc(lead.website||'')}"></label><label class="field span2">Instagram<input name="instagram" value="${esc(lead.instagram||'')}"></label><label class="field span2">Endereço<input name="address" value="${esc(lead.address||'')}"></label><label class="field">Presença digital<select name="digital_status">${options(statuses,lead.digital_status)}</select></label><label class="field">Etapa<select name="stage">${options(stages,lead.stage)}</select></label><label class="field">Produto a oferecer<select name="offer">${options([['','Selecionar'],['site','Site institucional'],['catalogo','Catálogo digital'],['nuvemshop','Loja Nuvemshop'],['yampi','Loja Yampi']],lead.offer||'')}</select></label><label class="field">Valor da proposta (R$)<input type="number" min="0" step="0.01" name="amount" value="${esc(lead.amount??'')}" placeholder="1500,00"></label><label class="field span2">Próxima ação<input name="next_action_at" type="datetime-local" value="${esc((lead.next_action_at||'').slice(0,16))}"></label><label class="field span2">Notas<textarea name="notes" placeholder="O que você observou sobre a oportunidade?">${esc(lead.notes||'')}</textarea></label><button class="btn primary" type="submit">Salvar alterações</button></form></section><section class="panel"><h2>Criação do site</h2><p class="help">Site institucional: prepare um briefing com dados conferidos, gere um prompt no Tooplate e construa e publique o site na ferramenta escolhida. Para e-commerce, use Nuvemshop ou Yampi.</p><div class="button-row"><button class="btn" data-action="site-brief">Preparar briefing do site</button><button class="btn primary" data-action="lovable-prompt">Gerar prompt Lovable</button><a class="btn" href="https://www.tooplate.com/tools/ai-portfolio-page-prompt-generator" target="_blank" rel="noopener noreferrer">Abrir Tooplate ↗</a></div></section><section class="panel"><h2>Canais de contato</h2><div class="button-row">${lead.whatsapp?`<button class="btn primary" data-compose="${lead.id}">◉ Preparar WhatsApp</button>`:'<span class="badge warning">WhatsApp não confirmado</span>'}<button class="btn" data-call="${lead.id}" ${lead.phone?'':'disabled'}>☎ Ligar / copiar número</button>${link(lead.website,'Abrir site')}${link(lead.instagram,'Abrir Instagram')}<button class="btn" data-find-instagram="${lead.id}">⌕ Encontrar Instagram</button>${link(lead.maps_url,'Abrir Maps')}</div><p class="help" style="margin-top:12px">O formato do celular não comprova que este número pertence à empresa ou está ativo no WhatsApp.</p></section><section class="panel"><div class="panel-head"><h2>Evidências públicas</h2><button class="link" data-enrich="${lead.id}">Pesquisar novamente ↻</button></div>${lead.observations.length?lead.observations.map(o=>`<div class="evidence"><strong>${esc(o.kind)}</strong><div>${esc(o.value)}</div>${o.source_url?link(o.source_url,'Ver fonte'):''}<small>${date(o.collected_at)}</small></div>`).join(''):'<div class="empty">Ainda não há evidências registradas.</div>'}</section><section class="panel"><h2>Registrar atividade</h2><form id="activity-form"><div class="form-grid"><label class="field">Tipo<select name="kind">${options([['nota','Nota'],['ligacao','Ligação realizada'],['resposta','Resposta recebida'],['reuniao','Reunião'],['proposta','Proposta enviada'],['tarefa','Tarefa']], 'nota')}</select></label><label class="field span2">Descrição<input name="detail" placeholder="Ex.: retorno marcado para amanhã" required></label><button class="btn">Registrar</button></div></form><div style="margin-top:14px">${lead.activities.length?lead.activities.map(a=>`<div class="activity"><div><strong>${esc(a.kind)}</strong><div>${esc(a.detail)}</div><small>${date(a.created_at)}</small></div></div>`).join(''):'<div class="empty">Nenhuma atividade registrada.</div>'}</div></section><section class="panel"><h2>Organização</h2><div id="lead-list-assign"></div><div class="hr"></div><button class="btn danger" data-block="${lead.id}">Bloquear novas abordagens</button><p class="help" style="margin:9px 0 0">Um telefone bloqueado não será reimportado pela busca ou por CSV.</p></section></div></aside></div>`;
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
    overlay.innerHTML=`<aside class="drawer" style="width:min(620px,100%)" role="dialog" aria-modal="true" aria-label="Perfis candidatos no Instagram"><div class="drawer-top"><h2>Instagram · ${esc(result.name)}</h2><button class="btn ghost" data-action="close-instagram" aria-label="Fechar">✕</button></div><div class="drawer-body"><p class="help">Pesquisa: nome + ${esc(result.address||'localidade não informada')}. Confira o endereço, fotos e telefone no perfil antes de associá-lo ao lead.</p>${result.candidates.length?result.candidates.map(c=>`<section class="panel" style="margin-top:12px"><h3>${esc(c.title)}</h3><p class="help">${esc(c.description)}</p><p class="help">${esc(c.match)}</p><div class="button-row">${link(c.url,'Abrir perfil')}<button class="btn primary" data-instagram-confirm="${esc(c.url)}" data-instagram-lead="${id}">Confirmar este perfil</button></div></section>`).join(''):'<div class="empty">Nenhum perfil candidato encontrado nesta pesquisa. Revise nome e endereço do lead e tente novamente.</div>'}</div></aside>`;
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
  box.innerHTML=`<div class="drawer" style="width:min(620px,100%)" role="dialog" aria-modal="true" aria-label="Mensagem para ${esc(l.name)}"><div class="drawer-top"><h2>Mensagem para ${esc(l.name)}</h2><button class="btn ghost" data-action="close-composer">✕</button></div><div class="drawer-body"><div class="notice good">Confira os dados antes de gerar. Abra e envie a mensagem manualmente pelo WhatsApp.</div><div class="form-grid"><label class="field">Nome da pessoa (se confirmado)<input id="ai-contact" maxlength="80" placeholder="Caso contrário, usaremos a empresa"></label><label class="field span2">O que você observou no Instagram? (opcional)<input id="ai-instagram" maxlength="240" placeholder="Um detalhe real do perfil, produto ou serviço"></label><label class="field span2">Link HTTPS de uma prévia já pronta (opcional)<input id="ai-preview" type="url" maxlength="350" placeholder="https://..." inputmode="url"></label><label class="field span2"><span style="display:flex;gap:8px;align-items:start"><input id="ai-preview-confirmed" type="checkbox" style="width:auto;margin-top:4px">Confirmo que esta prévia existe e posso mostrá-la sem custo</span></label><label class="field span2"><span style="display:flex;gap:8px;align-items:start"><input id="ai-images-confirmed" type="checkbox" style="width:auto;margin-top:4px">A prévia usa imagens reais da empresa com permissão de uso</span></label></div><div class="button-row" style="margin:12px 0"><button class="btn" data-action="generate-ai-message" ${state.user.groq?'':'disabled'}>✧ Gerar mensagem com IA</button>${state.user.groq?'':'<span class="help">Adicione a chave Groq em Configurações para ativar.</span>'}</div><label class="field">Mensagem editável<textarea id="message-text" style="min-height:165px">${esc(draft)}</textarea></label><div class="button-row"><button class="btn primary" data-action="open-whatsapp">Abrir conversa no WhatsApp ↗</button><button class="btn" data-action="copy-message">Copiar texto</button></div><p class="help">Número: +${esc(l.whatsapp)}. Confirme a identidade do destinatário; o texto só é enviado se você confirmar no WhatsApp.</p></div></div>`;document.body.append(box);
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
  box.innerHTML=`<div class="drawer" style="width:min(620px,100%)"><div class="drawer-top"><h2>Briefing de site · ${esc(l.name)}</h2><button class="btn ghost" data-action="close-site-brief">✕</button></div><div class="drawer-body"><div class="notice good">Revise os campos entre colchetes com a empresa antes de gerar ou publicar o site.</div><label class="field">Briefing editável<textarea id="site-brief-text" style="min-height:400px">${esc(brief)}</textarea></label><div class="button-row"><button class="btn primary" data-action="copy-site-brief">Copiar briefing</button><a class="btn" href="https://www.tooplate.com/tools/ai-portfolio-page-prompt-generator" target="_blank" rel="noopener noreferrer">Abrir portfólio ↗</a><a class="btn" href="https://www.tooplate.com/tools/ai-landing-page-prompt-generator" target="_blank" rel="noopener noreferrer">Abrir site comercial ↗</a></div><p class="help">O Tooplate gera prompts. Ele não constrói nem hospeda automaticamente o site a partir deste CRM.</p></div></div>`;document.body.append(box);
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
  box.innerHTML=`<div class="drawer" style="width:min(660px,100%)"><div class="drawer-top"><h2>Prompt Lovable · ${esc(l.name)}</h2><button class="btn ghost" data-action="close-lovable-prompt" aria-label="Fechar">✕</button></div><div class="drawer-body"><p class="help">Escolha o formato, confira as informações com a empresa, copie o texto e cole em um novo projeto na Lovable.</p><label class="field">Formato do projeto<select id="lovable-kind"><option value="site">Site institucional</option><option value="landing">Landing page</option></select></label><label class="field">Prompt editável<textarea id="lovable-prompt-text" style="min-height:470px">${esc(buildLovablePrompt(l,'site'))}</textarea></label><div class="button-row"><button class="btn primary" data-action="copy-lovable-prompt">Copiar prompt</button><a class="btn" href="https://lovable.dev/" target="_blank" rel="noopener noreferrer">Abrir Lovable ↗</a></div><p class="help">A criação e publicação acontecem na Lovable, após sua revisão. Nada é enviado automaticamente pelo CRM.</p></div></div>`;
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
  const box=document.createElement('div');box.className='drawer-overlay';box.id='new-lead-modal';box.innerHTML=`<aside class="drawer" style="width:min(530px,100%)"><div class="drawer-top"><h2>Cadastrar empresa</h2><button class="btn ghost" data-action="close-new">✕</button></div><div class="drawer-body"><form id="new-lead-form" class="form-grid"><label class="field span2">Nome da empresa<input name="name" required></label><label class="field">Segmento<input name="category"></label><label class="field">Telefone<input name="phone"></label><label class="field">Cidade<input name="city"></label><label class="field">UF<input name="state"></label><label class="field span2">Site<input name="website"></label><label class="field span2">Instagram<input name="instagram"></label><button class="btn primary">Salvar lead</button></form></div></aside>`;document.body.append(box);
}
async function submitForm(form){
  const obj=Object.fromEntries(new FormData(form).entries());
  if(form.classList.contains('token-form')){
    try{await post('/integrations',{service:form.dataset.service,token:obj.token});form.reset();state.user=await api('/me');settingsPage();toast('Chave salva com segurança.')}catch(e){toast(e.message,true)}return;
  }
  if(form.id==='access-verify-form'){
    try{await post('/access/verify',obj);state.user=await api('/me');renderView()}catch(e){document.getElementById('login-error').textContent=e.message}return;
  }
  if(form.id==='login-form'){
    try{state.user=await post('/login',obj);state.user=await api('/me');renderView();}
    catch(e){document.getElementById('login-error').textContent=e.message}return;
  }
  try{
    if(form.id==='access-settings-form'){await post('/access/settings',obj);toast('Configuração de acesso salva.');accessPage();return}
    if(form.id==='google-user-form'){await post('/access/google-users',{email:obj.email,expires_at:new Date(obj.expires_at).toISOString()});toast('Conta Google autorizada.');accessPage();return}
    if(form.id==='collaborator-form'){await post('/access/collaborators',{phone:obj.phone,expires_at:new Date(obj.expires_at).toISOString()});toast('WhatsApp cadastrado.');accessPage();return}
    if(form.id==='apify-json-form'){const batch=await post('/import-apify',obj);state.batchId=batch.id;form.querySelector('[name=json]').value='';toast(`${batch.total} empresas importadas; ${batch.created} novas.`);loadImportBatches();return}
    if(form.id==='campaign-form'){await post('/campaigns',obj);toast('Busca iniciada. Acompanhe o progresso abaixo.');form.reset();loadCampaigns()}
    if(form.id==='new-lead-form'){const data=await post('/leads',obj);document.getElementById('new-lead-modal')?.remove();toast(data.created?'Lead cadastrado.':'Lead existente encontrado.');await leadsPage();openLead(data.id)}
    if(form.id==='lead-form'){const id=state.lead.id;const data=await api('/leads/'+id,{method:'PATCH',body:obj});toast('Lead atualizado.');openLead(data.id)}
    if(form.id==='activity-form'){await post('/leads/'+state.lead.id+'/activity',obj);toast('Atividade registrada.');openLead(state.lead.id)}
    if(form.id==='list-form'){await post('/lists',obj);toast('Lista criada.');listsPage()}
    if(form.id==='password-form'){await post('/change-password',obj);state.user=null;renderLogin();toast('Senha alterada. Entre novamente.')}
  }catch(e){toast(e.message,true)}
}

document.addEventListener('submit',event=>{event.preventDefault();submitForm(event.target)});
document.addEventListener('click',async event=>{
  const hit=event.target.closest('[data-issue-access],[data-issue-admin],[data-revoke-google],[data-view],[data-lead],[data-compose],[data-call],[data-enrich],[data-block],[data-action],[data-niche],[data-list],[data-remove-token],[data-import-batch],[data-import-resume],[data-find-instagram],[data-instagram-confirm],[data-revoke-access]');if(!hit)return;
  if(hit.dataset.revokeGoogle){if(!confirm('Revogar este acesso agora?'))return;try{await api('/access/google-users/'+hit.dataset.revokeGoogle,{method:'DELETE'});toast('Acesso revogado.');accessPage()}catch(e){toast(e.message,true)}return}
  if(hit.dataset.issueAccess || hit.dataset.issueAdmin){
    try{
      const result=await post(hit.dataset.issueAdmin?'/access/admin/issue':'/access/collaborators/'+hit.dataset.issueAccess+'/issue');
      const overlay=document.createElement('div');overlay.className='drawer-overlay';overlay.id='access-code-modal';
      overlay.innerHTML=`<aside class="drawer" style="width:min(520px,100%)" role="dialog" aria-modal="true"><div class="drawer-top"><h2>Token criado</h2><button class="btn ghost" data-action="close-access-code">✕</button></div><div class="drawer-body"><div class="notice good">O token vale ${result.expires_in_seconds/60} minutos e só funciona uma vez. Clique abaixo e confirme o envio no WhatsApp.</div><a class="btn primary full" href="${esc(safeLink(result.whatsapp_url))}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp e enviar token ↗</a></div></aside>`;
      document.getElementById('access-code-modal')?.remove();document.body.append(overlay);accessPage();
    }catch(e){toast(e.message,true)}return;
  }
  if(hit.dataset.revokeAccess){if(!confirm('Revogar este acesso agora?'))return;try{await api('/access/collaborators/'+hit.dataset.revokeAccess,{method:'DELETE'});toast('Acesso revogado.');accessPage()}catch(e){toast(e.message,true)}return}
  if(hit.dataset.view){navigate(hit.dataset.view);document.getElementById('sidebar')?.classList.remove('open');document.getElementById('scrim')?.classList.remove('show');return}
  if(hit.dataset.lead){openLead(Number(hit.dataset.lead));return}
  if(hit.dataset.compose){openLead(Number(hit.dataset.compose),true);return}
  if(hit.dataset.call){callLead(Number(hit.dataset.call));return}
  if(hit.dataset.niche){navigate('buscar');setTimeout(()=>{const e=document.querySelector('[name="niche"]');if(e)e.value=hit.dataset.niche},0);return}
  if(hit.dataset.list){state.filters={list_id:hit.dataset.list};navigate('leads');return}
  if(hit.dataset.removeToken){try{await api('/integrations/'+hit.dataset.removeToken,{method:'DELETE'});state.user=await api('/me');settingsPage();toast('Chave salva removida.')}catch(e){toast(e.message,true)}return}
  if(hit.dataset.importBatch){showImportBatch(Number(hit.dataset.importBatch));return}
  if(hit.dataset.importResume){try{await post('/import-apify/'+hit.dataset.importResume+'/resume');loadImportBatches()}catch(e){toast(e.message,true)}return}
  if(hit.dataset.findInstagram){findInstagram(Number(hit.dataset.findInstagram),hit);return}
  if(hit.dataset.instagramConfirm){try{const id=Number(hit.dataset.instagramLead);await post('/leads/'+id+'/instagram/confirm',{url:hit.dataset.instagramConfirm});document.getElementById('instagram-modal')?.remove();toast('Instagram associado ao lead.');if(state.view==='leads')loadLeads();if(state.lead?.id===id)openLead(id)}catch(e){toast(e.message,true)}return}
  if(hit.dataset.enrich){try{hit.disabled=true;await post('/leads/'+hit.dataset.enrich+'/enrich');toast('Pesquisa concluída. Confira as evidências.');openLead(Number(hit.dataset.enrich))}catch(e){toast(e.message,true)}finally{hit.disabled=false}return}
  if(hit.dataset.block){if(!confirm('Bloquear este contato e impedir novas importações pelo telefone?'))return;try{await post('/leads/'+hit.dataset.block+'/block');document.getElementById('drawer-mount').innerHTML='';toast('Contato bloqueado.');renderView()}catch(e){toast(e.message,true)}return}
  switch(hit.dataset.action){
    case 'close-access-code':document.getElementById('access-code-modal')?.remove();break;
    case 'back-access':renderLogin();break;
    case 'legacy-login':renderPasswordLogin();break;
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
      }catch(e){toast(e.message,true)}finally{button.disabled=false;button.textContent='✧ Gerar mensagem com IA'}break;
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
  if(event.target.id==='lovable-kind'){const field=document.getElementById('lovable-prompt-text');if(field&&state.lead)field.value=buildLovablePrompt(state.lead,event.target.value);return}
  if(event.target.id!=='csv-file')return;
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>900_000){toast('O CSV deve ter até 900 KB.',true);return}
  try{const result=await post('/import',{csv:await file.text()});toast(`${result.created} leads novos de ${result.processed} linhas processadas.`);loadLeads()}
  catch(e){toast(e.message,true)}
  finally{event.target.value=''}
});
document.addEventListener('click',event=>{if(event.target.id==='scrim'){document.getElementById('sidebar')?.classList.remove('open');event.target.classList.remove('show')}if(event.target.id==='drawer-overlay'){document.getElementById('drawer-mount').innerHTML='';state.lead=null}if(event.target.id==='composer'||event.target.id==='site-brief-modal'||event.target.id==='instagram-modal'||event.target.id==='lovable-prompt-modal')event.target.remove()});
let dragging=null;
document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-drag]');if(card){dragging=Number(card.dataset.drag);event.dataTransfer.effectAllowed='move'}});
document.addEventListener('dragover',event=>{const col=event.target.closest('[data-drop]');if(col){event.preventDefault();col.classList.add('over')}});
document.addEventListener('dragleave',event=>{const col=event.target.closest('[data-drop]');if(col&&!col.contains(event.relatedTarget))col.classList.remove('over')});
document.addEventListener('drop',async event=>{const col=event.target.closest('[data-drop]');if(!col||!dragging)return;event.preventDefault();col.classList.remove('over');try{await api('/leads/'+dragging,{method:'PATCH',body:{stage:col.dataset.drop}});toast('Etapa atualizada.');crmPage()}catch(e){toast(e.message,true)}dragging=null});
window.addEventListener('hashchange',renderView);
(async()=>{try{state.authConfig=await api('/auth/config');state.user=await api('/me');state.view=getView();renderView()}catch(e){if(!state.user && (e.message==='Entre para continuar'||e.message.includes('Sessão expirada')))renderLogin();else renderUnavailable(e.message)}})();
