let accessToken = null;
let currentUserProfile = null;
const isAdmin = () => ["Administrador", "Coordenador", "Gestor"].includes(currentUserProfile?.perfil || "") || (window.AmbientalAuth && AmbientalAuth.can && AmbientalAuth.can('delete'));
const authReady = AmbientalAuth.requireAuth({area:'gestao'}).then(async profile=>{
    currentUserProfile = profile;
    accessToken = await AmbientalAuth.getAccessToken();
    const name = document.getElementById('userName');
    const role = document.getElementById('userRole');
    if(name) name.textContent = profile?.nome || profile?.email || 'Usuário';
    if(role) role.textContent = profile?.perfil || 'Sessão segura';
    document.getElementById('authLoading')?.remove();
    return profile;
}).catch(error=>{
    document.getElementById('authLoading')?.remove();
    throw error;
});
setTimeout(() => { document.getElementById('authLoading')?.remove(); }, 300);

const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); 
const arr=v=>Array.isArray(v)?v:[]; 
const REGISTRY_KEY='ambiental_atendimentos_v1'; 
let tab='all',serverItems=[],localItems=[];
const stateLabel={RASCUNHO:'RASCUNHO',EM_REVISÃO:'EM REVISÃO',REABERTO:'REABERTO',FINALIZADO:'FINALIZADO',ARQUIVADO:'ARQUIVADO'};
function date(v){if(!v)return'—';const p=String(v).slice(0,10).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:'—'}
function dt(v){try{return new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}catch{return'—'}}
function values(r){const a=r.aux||{};return{atd:r.atendimento||'—',date:a.dataAtd||'',time:a.horaAtd||'',doctor:r.medico||'—',crm:a.crmResponsavel||'',patient:a.nomePaciente||r.nomePaciente||r.paciente_nome||'',cpf:a.cpfPaciente||r.cpfPaciente||r.paciente_cpf||'',cargo:a.cargo||'—',idade:a.idade||'',cid:a.cid||'',unidade:a.unidade||'',dias:a.diasSolicitados||'',q:r.queixaDuracao||a.queixaDuracao||'',doenca:a.doencaMotivo||'',hist:a.historicoPregresso||'',sint:a.sintomasLimitacao||'',examType:r.exameFisicoTipo||'',exam:r.alteracoesClinicasExames||'',lim:r.descLimitacao||a.descLimitacao||'',ativ:r.atividadesComprometidas||'',cap:r.capacidade||'—',parecer:r.parecer||'—',just:a.justificativa||'',docs:arr(r.documentosComplementares),meds:arr(r.medications),conds:arr(r.conditions),ques:arr(r.quesitos),updated:r.__registryAt||r.atualizado_em||''}}
function statusOf(r){return String(r?.status||r?.workflowStatus||'RASCUNHO').toUpperCase().replace('REVISÃO','EM_REVISÃO').replace('EM_PREENCHIMENTO','RASCUNHO')}
function hay(r,q){if(!q)return true;const v=values(r);const blob=JSON.stringify(v).toLowerCase();const qn=q.toLowerCase();const qcpf=qn.replace(/\D/g,'');return blob.includes(qn)|| (qcpf.length>=3 && String(v.cpf||'').replace(/\D/g,'').includes(qcpf))}
function lerLocalStorage(){try{const raw=localStorage.getItem(REGISTRY_KEY);const reg=raw?JSON.parse(raw):{};if(!reg||typeof reg!=="object")return [];return Object.values(reg).filter(r=>r&&typeof r==="object"&&r.atendimento).map(r=>({...r,__source:"local"}));}catch(e){console.warn("Falha ao ler LocalStorage",e);return [];}}
function mergeAtendimentos(server,local){
    const map=new Map();
    server.forEach(r=>map.set(String(r.atendimento),{...r,__source:"server"}));
    local.forEach(r=>{
        const key=String(r.atendimento);
        if(!map.has(key)) map.set(key,{...r,__source:"local"});
    });
    return [...map.values()];
}
function localStats(items){
    const count=s=>items.filter(r=>statusOf(r)===s).length;
    const docMap={};
    items.forEach(r=>{
        const v=values(r);
        const rawDoc=String(v.doctor||'Médico não informado').trim();
        const cleanDoc=rawDoc.replace(/\s*-\s*CRM.*$/i,'').replace(/\s*CRM[:\s]*\d+.*$/i,'').trim()||'Médico não informado';
        const crmMatch=rawDoc.match(/CRM[:\s]*([0-9A-Z\/\-]+)/i);
        const crmVal=v.crm||(crmMatch?crmMatch[1]:'');
        const key=cleanDoc.toUpperCase();
        if(!docMap[key]){
            docMap[key]={
                medico:rawDoc,
                nome:cleanDoc,
                crm:crmVal,
                total:0,
                finalizados:0,
                favoraveis:0,
                contrarios:0
            };
        }
        const entry=docMap[key];
        if(crmVal&&!entry.crm)entry.crm=crmVal;
        entry.total++;
        const st=statusOf(r);
        if(st==='FINALIZADO')entry.finalizados++;
        const parecer=String(v.parecer||'').toUpperCase();
        if(parecer.includes('FAVORÁVEL')||parecer.includes('FAVORAVEL'))entry.favoraveis++;
        if(parecer.includes('CONTRÁRIO')||parecer.includes('CONTRARIO'))entry.contrarios++;
    });
    const por_medico=Object.values(docMap).sort((a,b)=>b.total-a.total);
    return {
        total:items.length,
        rascunhos:count('RASCUNHO'),
        revisao:count('EM_REVISÃO'),
        finalizados:count('FINALIZADO'),
        arquivados:count('ARQUIVADO'),
        pendentes:items.filter(r=>['RASCUNHO','EM_REVISÃO','REABERTO'].includes(statusOf(r))).length,
        atualizados_recentes:items.filter(r=>{const t=Date.parse(r.__registryAt||r.atualizado_em||'');return t&&!Number.isNaN(t)&&(Date.now()-t)<=7*864e5;}).length,
        medicos_ativos_na_gestao:por_medico.filter(d=>d.nome!=='Não identificado'&&d.nome!=='Médico não informado').length,
        por_medico
    };
}
function carregarLocalStorage(){localItems=lerLocalStorage();serverItems=mergeAtendimentos(serverItems.filter(r=>r.__source!=="local"),localItems);renderStats(localStats(serverItems));refresh();document.getElementById('empty').textContent=serverItems.length?'':'Nenhum atendimento salvo neste navegador.';toastLocalStorage();}
function toastLocalStorage(){const el=document.getElementById('localCount');if(el)el.textContent=`${localItems.length} atendimento(s) local(is)`;}
function setDataLoading(stage,title,text,progress){const overlay=document.getElementById('dataLoading');if(!overlay)return;const t=document.getElementById('dataLoadingTitle');const tx=document.getElementById('dataLoadingText');const bar=document.getElementById('loadingProgressBar');if(t)t.textContent=title;if(tx)tx.textContent=text;if(bar)bar.style.width=(progress||15)+'%';const map={session:'loadStep1',data:'loadStep2',stats:'loadStep3',ready:'loadStep4'};Object.entries(map).forEach(([k,id])=>{const el=document.getElementById(id);if(!el)return;el.classList.toggle('active',k===stage);el.classList.toggle('done',['session','data','stats','ready'].indexOf(k)<=['session','data','stats','ready'].indexOf(stage));});}
function finishDataLoading(){setDataLoading('ready','Sala pronta','Dados carregados. A gestão está pronta para uso.',100);document.getElementById('authLoading')?.remove();const dl=document.getElementById('dataLoading');if(dl){dl.classList.add('hide');document.documentElement.classList.remove('app-loading');document.body.classList.remove('app-loading');setTimeout(()=>dl.remove(),80);}}

let searchCurrentPage = 1;
const searchPageSize = 40;
let lastFilteredList = [];

function changeSearchPage(newPage) {
    const totalPages = Math.max(1, Math.ceil(lastFilteredList.length / searchPageSize));
    if (newPage < 1 || newPage > totalPages || newPage === searchCurrentPage) return;
    searchCurrentPage = newPage;
    renderTablePage();
    const el = document.getElementById('atendimentos');
    if (el) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_) {}
    }
}

function renderPaginationUI(total, totalPages, startIdx, endIdx) {
    const bar = document.getElementById('tablePaginationFooter');
    if (!bar) return;
    if (total === 0) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';

    const info = document.getElementById('paginationInfo');
    if (info) {
        info.innerHTML = `Exibindo <b>${startIdx + 1}–${endIdx}</b> de <b>${total}</b> atendimento${total === 1 ? '' : 's'}`;
    }

    const prevBtn = document.getElementById('btnPagePrev');
    const nextBtn = document.getElementById('btnPageNext');
    if (prevBtn) prevBtn.disabled = searchCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = searchCurrentPage >= totalPages;

    const numWrap = document.getElementById('paginationNumbersWrap');
    if (numWrap) {
        let html = '';
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= searchCurrentPage - 1 && i <= searchCurrentPage + 1)) {
                pages.push(i);
            }
        }
        let lastP = 0;
        for (const p of pages) {
            if (lastP && p - lastP > 1) {
                html += `<span class="page-ellipsis">…</span>`;
            }
            const activeCls = p === searchCurrentPage ? ' active' : '';
            html += `<button type="button" class="page-num-btn${activeCls}" onclick="changeSearchPage(${p})" title="Ir para a página ${p}">${p}</button>`;
            lastP = p;
        }
        numWrap.innerHTML = html;
    }
}

function renderTablePage() {
    const total = lastFilteredList.length;
    const totalPages = Math.max(1, Math.ceil(total / searchPageSize));
    if (searchCurrentPage > totalPages) searchCurrentPage = totalPages;
    if (searchCurrentPage < 1) searchCurrentPage = 1;

    const startIdx = (searchCurrentPage - 1) * searchPageSize;
    const endIdx = Math.min(startIdx + searchPageSize, total);
    const pagedItems = lastFilteredList.slice(startIdx, endIdx);

    const empty = document.getElementById('empty');
    if (empty) empty.style.display = total ? 'none' : 'block';

    const tbody = document.getElementById('tbody');
    if (tbody) tbody.innerHTML = pagedItems.map(row).join('');

    updateBulkToolbar();
    renderRecentHistory();

    const rc = document.getElementById('resultCount');
    if (rc) rc.textContent = `${total} resultado${total === 1 ? '' : 's'}`;
    const sc = document.getElementById('searchViewCount');
    if (sc) sc.textContent = `${total} resultado${total === 1 ? '' : 's'}`;

    renderPaginationUI(total, totalPages, startIdx, endIdx);
}

let lastServerDatasetVersion = (function() {
    try { return sessionStorage.getItem('ambiental.gestao.dataset_version') || null; } catch(_) { return null; }
})();
let lastServerDatasetParams = '';

async function fetchServer(opts = {}) {
    localItems = lerLocalStorage();
    let remote = [];
    const isForce = (opts === true || (typeof opts === 'object' && opts.force));
    try {
        const params = new URLSearchParams();
        const status = document.getElementById('filter').value;
        if (status !== 'all') params.set('status', status);
        const medico = document.getElementById('medico').value.trim();
        const cid = document.getElementById('cid').value.trim();
        const unidade = document.getElementById('unidade').value.trim();
        const ini = document.getElementById('periodoInicio').value;
        const fim = document.getElementById('periodoFim').value;
        if (medico) params.set('medico', medico);
        if (cid) params.set('cid', cid);
        if (unidade) params.set('unidade', unidade);
        if (ini) params.set('data_inicio', ini);
        if (fim) params.set('data_fim', fim);
        const q = document.getElementById('search').value.trim();
        if (q) params.set('q', q);

        const currentParamsStr = params.toString();
        const filterChanged = (currentParamsStr !== lastServerDatasetParams);
        lastServerDatasetParams = currentParamsStr;

        const token = accessToken || (window.AmbientalAuth ? await AmbientalAuth.getAccessToken() : null);
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        // 🚀 Otimização de Egress Supabase: Checagem ultraleve de versão (apenas ~40 bytes)
        // Se a base não mudou e já temos os dados em memória, evita baixar megabytes repetidamente!
        if (!isForce && !filterChanged && lastServerDatasetVersion && serverItems && serverItems.length > 0) {
            try {
                const chkRes = await AmbientalAuth.authFetch('/api/atendimentos/check-version?' + currentParamsStr, {
                    cache: 'no-store',
                    headers
                });
                const chkData = await chkRes.json().catch(() => null);
                if (chkRes.ok && chkData?.success && chkData?.data?.version) {
                    if (chkData.data.version === lastServerDatasetVersion) {
                        // Nenhuma modificação no banco de dados! Consumo de Egress ZERO!
                        window.lastFetchBackendSuccess = true;
                        return { changed: false, count: serverItems.length };
                    }
                }
            } catch (_) {}
        }

        params.set('page', '1');
        params.set('page_size', '100');
        if (lastServerDatasetVersion && !isForce && !filterChanged) {
            headers['If-None-Match'] = `"${lastServerDatasetVersion}"`;
        }

        const r = await AmbientalAuth.authFetch('/api/atendimentos?' + params.toString(), {
            cache: 'no-store',
            headers
        });

        if (r.status === 304) {
            window.lastFetchBackendSuccess = true;
            return { changed: false, count: serverItems.length };
        }

        const d = await r.json();
        if (r.ok && d.success) {
            remote = d.data.items || [];
            if (d.data.stats) renderStats(d.data.stats);
            if (d.data.version) {
                lastServerDatasetVersion = d.data.version;
                try { sessionStorage.setItem('ambiental.gestao.dataset_version', d.data.version); } catch(_) {}
            }

            // Renderiza imediatamente a página 1 e fecha o loading para o usuário navegar sem espera
            serverItems = mergeAtendimentos(remote, localItems);
            refresh(true);
            finishDataLoading();

            const totalBackendPages = d.data?.pagination?.pages || 1;
            if (totalBackendPages > 1 && totalBackendPages <= 10) {
                (async () => {
                    const extraPromises = [];
                    for (let p = 2; p <= totalBackendPages; p++) {
                        const nextParams = new URLSearchParams(params);
                        nextParams.set('page', String(p));
                        extraPromises.push(
                            AmbientalAuth.authFetch('/api/atendimentos?' + nextParams.toString(), { cache: 'no-store', headers })
                                .then(res => res.json())
                                .then(dataObj => (dataObj?.success && dataObj.data?.items) ? dataObj.data.items : [])
                                .catch(() => [])
                        );
                    }
                    const extraResults = await Promise.all(extraPromises);
                    extraResults.forEach(itemsList => { remote = remote.concat(itemsList); });
                    serverItems = mergeAtendimentos(remote, localItems);
                    try {
                        const cachePayload = JSON.stringify({ items: remote, stats: d.data.stats, ts: Date.now() });
                        sessionStorage.setItem('ambiental.gestao.atendimentos_cache', cachePayload);
                        localStorage.setItem('ambiental.gestao.atendimentos_cache', cachePayload);
                    } catch (_) {}
                    refresh(true);
                })().catch(() => {});
            }
            window.lastFetchBackendSuccess = true;
            try {
                const cachePayload = JSON.stringify({ items: remote, stats: d.data.stats, ts: Date.now() });
                sessionStorage.setItem('ambiental.gestao.atendimentos_cache', cachePayload);
                localStorage.setItem('ambiental.gestao.atendimentos_cache', cachePayload);
            } catch (_) {}
        } else {
            window.lastFetchBackendSuccess = false;
        }
    } catch (e) {
        console.warn('Gestão: backend indisponível, usando LocalStorage.');
        window.lastFetchBackendSuccess = false;
    }
    serverItems = mergeAtendimentos(remote, localItems);
    if (!remote.length) renderStats(localStats(serverItems));
    const empty = document.getElementById('empty');
    if (!serverItems.length) empty.textContent = 'Nenhum atendimento encontrado no LocalStorage ou no backend.';
    else empty.textContent = '';
    return { changed: true, count: serverItems.length };
}

function setTab(v) {
    tab = v;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === v));
    const f = document.getElementById('filter');
    f.value = v === 'all' ? 'all' : ({ draft: 'RASCUNHO', review: 'EM_REVISÃO', done: 'FINALIZADO', archived: 'ARQUIVADO' }[v] || 'all');
    searchCurrentPage = 1;
    fetchServer().then(() => refresh(false));
}

function refresh(keepPage = false) {
    if (!keepPage) searchCurrentPage = 1;
    const q = document.getElementById('search').value.trim().toLowerCase();
    const medico = document.getElementById('medico').value.trim().toLowerCase();
    const cid = document.getElementById('cid').value.trim().toLowerCase();
    const unidade = document.getElementById('unidade').value.trim().toLowerCase();
    const ini = document.getElementById('periodoInicio').value;
    const fim = document.getElementById('periodoFim').value;
    const sort = document.getElementById('sort').value;

    let list = serverItems.filter(r => {
        const v = values(r), st = statusOf(r), d = String(v.date || '');
        if (tab === 'draft' && st !== 'RASCUNHO') return false;
        if (tab === 'review' && st !== 'EM_REVISÃO') return false;
        if (tab === 'done' && st !== 'FINALIZADO') return false;
        if (tab === 'archived' && st !== 'ARQUIVADO') return false;
        if (document.getElementById('filter').value !== 'all' && st !== document.getElementById('filter').value) return false;
        if (medico) {
            const cleanMed = medico.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const cleanDoc = String(v.doctor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const cleanCrm = String(v.crm || '').toLowerCase();
            if (!cleanDoc.includes(cleanMed) && !cleanCrm.includes(cleanMed)) return false;
        }
        if (cid && !String(v.cid).toLowerCase().includes(cid)) return false;
        if (unidade && !String(v.unidade).toLowerCase().includes(unidade)) return false;
        if (ini && d < ini) return false;
        if (fim && d > fim) return false;
        return !q || hay(r, q);
    });

    list.sort((a, b) => sort === 'patient'
        ? String(values(a).patient || '').localeCompare(String(values(b).patient || ''), 'pt-BR', { sensitivity: 'base' })
        : sort === 'date'
            ? String(b.aux?.dataAtd || '').localeCompare(String(a.aux?.dataAtd || ''))
            : String(b.__registryAt || b.atualizado_em || '').localeCompare(String(a.__registryAt || a.atualizado_em || ''))
    );

    lastFilteredList = list;
    renderTablePage();
}

function clearFilters(navigateToSearch = false){
    ['search','medico','cid','unidade','periodoInicio','periodoFim'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
    const f=document.getElementById('filter');if(f)f.value='all';
    const so=document.getElementById('sort');if(so)so.value='updated';
    tab='all';
    searchCurrentPage = 1;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='all'));
    const isDashboard=document.getElementById('view-dashboard')?.classList.contains('active');
    const shouldNavigate=navigateToSearch||isDashboard;
    if(shouldNavigate&&typeof window.goToSection==='function'){window.goToSection('atendimentos')}
    fetchServer().then(()=>{refresh(false);if(window.AmbientalUtils?.toast){AmbientalUtils.toast('Filtros redefinidos com sucesso!')}});
}
function focusSearch(){if(typeof window.goToSection==='function'){window.goToSection('atendimentos')}else{const v=document.getElementById('view-busca');if(v)document.querySelectorAll('.admin-view').forEach(x=>x.classList.toggle('active',x===v))}setTimeout(()=>{const el=document.getElementById('search');if(el){el.focus();try{el.scrollIntoView({behavior:'smooth',block:'center'})}catch(_){}}},120)}
document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement?.tagName!=='INPUT'&&document.activeElement?.tagName!=='TEXTAREA'){e.preventDefault();focusSearch()}if(e.key==='Escape'&&document.activeElement===document.getElementById('search'))document.getElementById('search').blur()});
let latestStats=null;
function pct(n,d){return d?Math.round((Number(n||0)/Number(d||0))*100):0}
function setBar(id,value,total,valId){
    const width=total?Math.max(0,Math.min(100,(Number(value||0)/Number(total))*100)):0;
    const el=document.getElementById(id);
    if(el)el.style.width=width+'%';
    const v=document.getElementById(valId);
    if(v)v.textContent=Number(value||0);
}

let docViewMode = 'cards';
function setDocViewMode(mode) {
    docViewMode = mode;
    const cards = document.getElementById('doctorCardsGrid');
    const table = document.getElementById('doctorTableWrap');
    const btnCards = document.getElementById('btnToggleCards');
    const btnTable = document.getElementById('btnToggleTable');
    if (btnCards) btnCards.classList.toggle('active', mode === 'cards');
    if (btnTable) btnTable.classList.toggle('active', mode === 'table');
    if (cards) cards.style.display = (mode === 'cards') ? 'grid' : 'none';
    if (table) table.style.display = (mode === 'table') ? 'block' : 'none';
}
window.setDocViewMode = setDocViewMode;

let currentSelectedDoctor = null;
window._doctorProductionList = [];
let currentDoctorWorkspace = null;

function voltarParaListaMedicos() {
    const list = document.getElementById('doctorListContainer');
    const detail = document.getElementById('doctorDetailContainer');
    if (list) list.style.display = 'block';
    if (detail) detail.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.voltarParaListaMedicos = voltarParaListaMedicos;

function abrirPainelDossieMedico(nome, crm, total, rawMedico, options = {}) {
    const cleanName = String(nome || rawMedico || 'Médico').replace(/\s*-\s*CRM.*$/i, '').replace(/\s*CRM[:\s]*\d+.*$/i, '').trim() || 'Médico';
    const crmVal = crm || (String(rawMedico || '').match(/CRM[:\s]*([0-9A-Z\/\-]+)/i)?.[1] || '');

    currentSelectedDoctor = { nome: cleanName, crm: crmVal, total: Number(total || 0), rawMedico };

    // Filtrar atendimentos deste médico em serverItems
    const cleanTarget = cleanName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const crmTarget = String(crmVal).trim().toLowerCase();

    const doctorItems = (serverItems || []).filter(r => {
        const v = values(r);
        const doc = String(v.doctor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const rawCrm = String(v.crm || '').toLowerCase();
        if (crmTarget && (rawCrm.includes(crmTarget) || doc.includes(crmTarget))) return true;
        if (cleanTarget && doc.includes(cleanTarget)) return true;
        return false;
    });

    // Ordenar do mais recente para o mais antigo
    doctorItems.sort((a, b) => {
        const da = String(values(a).date || '');
        const db = String(values(b).date || '');
        return db.localeCompare(da);
    });

    currentDoctorWorkspace = {
        doctor: { nome: cleanName, crm: crmVal, total: doctorItems.length, rawMedico },
        allItems: doctorItems,
        filteredItems: [...doctorItems],
        filterPeriod: options.period || 'todos',
        filterCustomDate: options.customDate || '',
        filterParecer: 'todos',
        searchQuery: ''
    };

    // Calcular Métricas Clínicas
    const totalAtd = doctorItems.length;
    let finCount = 0;
    let favCount = 0;
    let contraCount = 0;
    let somaDias = 0;
    let countDias = 0;
    const cidCounts = {};

    doctorItems.forEach(r => {
        const v = values(r);
        const st = statusOf(r);
        if (st === 'FINALIZADO') finCount++;

        const parecer = String(v.parecer || '').toUpperCase();
        if (parecer.includes('FAVORÁVEL') || parecer.includes('FAVORAVEL')) favCount++;
        if (parecer.includes('CONTRÁRIO') || parecer.includes('CONTRARIO')) contraCount++;

        const dNum = parseInt(v.dias, 10);
        if (!isNaN(dNum) && dNum > 0) {
            somaDias += dNum;
            countDias++;
        }

        const cidStr = String(v.cid || '').trim().toUpperCase();
        if (cidStr && cidStr !== '—' && cidStr !== '-' && cidStr !== 'SEM CID') {
            const baseCid = cidStr.split(/[\s,;-]+/)[0];
            if (baseCid) {
                cidCounts[baseCid] = (cidCounts[baseCid] || 0) + 1;
            }
        }
    });

    const taxaConclusao = pct(finCount, totalAtd);
    const mediaDiasVal = countDias > 0 ? (somaDias / countDias).toFixed(1).replace('.', ',') : '—';
    const totalPareceres = favCount + contraCount;
    const taxaFav = pct(favCount, totalPareceres || totalAtd);
    const taxaContra = pct(contraCount, totalPareceres || totalAtd);

    // Atualizar UI do Topbar e Hero
    const initials = cleanName.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'MD';
    const av = document.getElementById('docDetailAvatar');
    if (av) av.textContent = initials;

    const bName = document.getElementById('docDetailBreadcrumbName');
    if (bName) bName.textContent = cleanName;

    const dName = document.getElementById('docDetailName');
    if (dName) dName.textContent = cleanName;

    const dCrm = document.getElementById('docDetailCrm');
    if (dCrm) dCrm.textContent = crmVal ? `CRM: ${crmVal}` : 'CRM pendente';

    const dTot = document.getElementById('docDetailTotalAtd');
    if (dTot) dTot.textContent = `${totalAtd} atendimento${totalAtd === 1 ? '' : 's'} registrado${totalAtd === 1 ? '' : 's'}`;

    const dRate = document.getElementById('docDetailRate');
    if (dRate) dRate.textContent = `${taxaConclusao}% concluídos`;

    const qRate = document.getElementById('docDetailQuickRate');
    if (qRate) qRate.textContent = `${taxaConclusao}%`;

    const qBar = document.getElementById('docDetailQuickRateBar');
    if (qBar) qBar.style.width = `${taxaConclusao}%`;

    const qPar = document.getElementById('docDetailQuickPareceres');
    if (qPar) qPar.textContent = `${totalPareceres} pareceres`;

    const qDef = document.getElementById('docDetailQuickDefRate');
    if (qDef) qDef.textContent = `${taxaFav}% favorabilidade`;

    // Atualizar Cards de Métricas
    const fVal = document.getElementById('docDetailFavVal');
    if (fVal) fVal.textContent = favCount;
    const fSub = document.getElementById('docDetailFavSub');
    if (fSub) fSub.textContent = `${taxaFav}% dos pareceres`;
    const fBar = document.getElementById('docDetailFavBar');
    if (fBar) fBar.style.width = `${taxaFav}%`;

    const cVal = document.getElementById('docDetailContraVal');
    if (cVal) cVal.textContent = contraCount;
    const cSub = document.getElementById('docDetailContraSub');
    if (cSub) cSub.textContent = `${taxaContra}% dos pareceres`;
    const cBar = document.getElementById('docDetailContraBar');
    if (cBar) cBar.style.width = `${taxaContra}%`;

    const mDias = document.getElementById('docDetailMediaDias');
    if (mDias) mDias.textContent = mediaDiasVal !== '—' ? `${mediaDiasVal} dias` : '—';
    const mSub = document.getElementById('docDetailTotalDiasSub');
    if (mSub) mSub.textContent = countDias > 0 ? `baseado em ${countDias} laudos com dias` : 'sem dias registrados';

    // Top CIDs
    const topCidsContainer = document.getElementById('docDetailTopCids');
    if (topCidsContainer) {
        const sorted = Object.entries(cidCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
        if (sorted.length > 0) {
            topCidsContainer.innerHTML = sorted.map(([cid, count]) => {
                return `<button type="button" class="doc-cid-chip" onclick="filtrarPorCidDoMedico('${esc(cid)}')" title="Filtrar laudos com CID ${esc(cid)}"><span>${esc(cid)}</span> <small>(${count})</small></button>`;
            }).join('');
        } else {
            topCidsContainer.innerHTML = '<span style="font-size:11px;color:#94A3B8">Nenhum CID informado nos atendimentos</span>';
        }
    }

    // Resetar Filtros na UI
    const searchInput = document.getElementById('docLocalSearch');
    if (searchInput) searchInput.value = '';

    const dateInput = document.getElementById('docFilterDataInput');
    if (dateInput) dateInput.value = options.customDate || '';

    // Alternar visibilidade
    const list = document.getElementById('doctorListContainer');
    const detail = document.getElementById('doctorDetailContainer');
    if (list) list.style.display = 'none';
    if (detail) detail.style.display = 'block';

    // Aplicar filtro de período inicial
    if (options.period) {
        setDocFilterPeriod(options.period);
    } else if (options.customDate) {
        setDocFilterCustomDate(options.customDate);
    } else {
        setDocFilterPeriod('todos');
    }

    // Rolagem suave até o topo da seção
    const viewEl = document.getElementById('view-medicos');
    if (viewEl) viewEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.abrirPainelDossieMedico = abrirPainelDossieMedico;

function abrirPainelDossieMedicoByIndex(idx, options = {}) {
    const list = window._doctorProductionList || [];
    const d = list[idx];
    if (!d) return;
    const rawMed = String(d.medico || '');
    const cleanName = d.nome || rawMed.replace(/\s*-\s*CRM.*$/i, '').replace(/\s*CRM[:\s]*\d+.*$/i, '').trim() || 'Médico não informado';
    const crmMatch = rawMed.match(/CRM[:\s]*([0-9A-Z\/\-]+)/i);
    const crmVal = d.crm || (crmMatch ? crmMatch[1] : '');
    abrirPainelDossieMedico(cleanName, crmVal, d.total || 0, rawMed, options);
}
window.abrirPainelDossieMedicoByIndex = abrirPainelDossieMedicoByIndex;

// Compatibilidade e integração do Modal legado
function abrirModalAtendimentosMedico(nome, crm, total, rawMedico) {
    abrirPainelDossieMedico(nome, crm, total, rawMedico);
}
window.abrirModalAtendimentosMedico = abrirModalAtendimentosMedico;

function abrirModalAtendimentosMedicoByIndex(idx) {
    abrirPainelDossieMedicoByIndex(idx);
}
window.abrirModalAtendimentosMedicoByIndex = abrirModalAtendimentosMedicoByIndex;

function executarFiltroAtendimentosMedico(tipo) {
    closeModal('modalAtendimentosMedico');
    if (!currentSelectedDoctor) return;
    const { nome, crm, total, rawMedico } = currentSelectedDoctor;
    abrirPainelDossieMedico(nome, crm, total, rawMedico, { period: tipo });
}
window.executarFiltroAtendimentosMedico = executarFiltroAtendimentosMedico;

function setDocFilterPeriod(period) {
    if (!currentDoctorWorkspace) return;
    currentDoctorWorkspace.filterPeriod = period;
    currentDoctorWorkspace.filterCustomDate = '';

    const dateInput = document.getElementById('docFilterDataInput');
    if (dateInput) dateInput.value = '';

    document.querySelectorAll('#docPeriodChips .doc-chip-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.period === period);
    });

    filtrarAtendimentosMedicoLocalmente();
}
window.setDocFilterPeriod = setDocFilterPeriod;

function setDocFilterCustomDate(dateVal) {
    if (!currentDoctorWorkspace) return;
    if (!dateVal) {
        setDocFilterPeriod('todos');
        return;
    }
    currentDoctorWorkspace.filterPeriod = 'custom';
    currentDoctorWorkspace.filterCustomDate = dateVal;

    document.querySelectorAll('#docPeriodChips .doc-chip-btn').forEach(b => {
        b.classList.remove('active');
    });

    filtrarAtendimentosMedicoLocalmente();
}
window.setDocFilterCustomDate = setDocFilterCustomDate;

function limparDocDataInput() {
    const dateInput = document.getElementById('docFilterDataInput');
    if (dateInput) dateInput.value = '';
    setDocFilterPeriod('todos');
}
window.limparDocDataInput = limparDocDataInput;

function setDocFilterParecer(parecer) {
    if (!currentDoctorWorkspace) return;
    currentDoctorWorkspace.filterParecer = parecer;

    document.querySelectorAll('#docParecerChips .doc-chip-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.parecer === parecer);
    });

    filtrarAtendimentosMedicoLocalmente();
}
window.setDocFilterParecer = setDocFilterParecer;

function filtrarPorCidDoMedico(cidCode) {
    const search = document.getElementById('docLocalSearch');
    if (search) search.value = cidCode;
    filtrarAtendimentosMedicoLocalmente();
}
window.filtrarPorCidDoMedico = filtrarPorCidDoMedico;

function limparTodosFiltrosMedico() {
    if (!currentDoctorWorkspace) return;
    const search = document.getElementById('docLocalSearch');
    if (search) search.value = '';
    const dateInput = document.getElementById('docFilterDataInput');
    if (dateInput) dateInput.value = '';

    currentDoctorWorkspace.filterPeriod = 'todos';
    currentDoctorWorkspace.filterCustomDate = '';
    currentDoctorWorkspace.filterParecer = 'todos';
    currentDoctorWorkspace.searchQuery = '';

    document.querySelectorAll('#docPeriodChips .doc-chip-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.period === 'todos');
    });
    document.querySelectorAll('#docParecerChips .doc-chip-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.parecer === 'todos');
    });

    filtrarAtendimentosMedicoLocalmente();
}
window.limparTodosFiltrosMedico = limparTodosFiltrosMedico;

function filtrarAtendimentosMedicoLocalmente() {
    if (!currentDoctorWorkspace) return;

    const searchInput = document.getElementById('docLocalSearch');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    currentDoctorWorkspace.searchQuery = query;

    const { allItems, filterPeriod, filterCustomDate, filterParecer, doctor } = currentDoctorWorkspace;
    const now = new Date();
    const formatYMD = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    let ini = '';
    let fim = '';
    let periodText = 'todos os registros';

    if (filterPeriod === 'hoje') {
        ini = formatYMD(now);
        fim = formatYMD(now);
        periodText = 'de hoje';
    } else if (filterPeriod === 'ontem') {
        const ontem = new Date(now);
        ontem.setDate(ontem.getDate() - 1);
        ini = formatYMD(ontem);
        fim = formatYMD(ontem);
        periodText = 'de ontem';
    } else if (filterPeriod === '7dias') {
        const d7 = new Date(now);
        d7.setDate(d7.getDate() - 7);
        ini = formatYMD(d7);
        fim = formatYMD(now);
        periodText = 'dos últimos 7 dias';
    } else if (filterPeriod === 'mes') {
        const d1 = new Date(now.getFullYear(), now.getMonth(), 1);
        ini = formatYMD(d1);
        fim = formatYMD(now);
        periodText = 'deste mês';
    } else if (filterPeriod === 'custom' && filterCustomDate) {
        ini = filterCustomDate;
        fim = filterCustomDate;
        const parts = filterCustomDate.split('-');
        periodText = parts.length === 3 ? `de ${parts[2]}/${parts[1]}/${parts[0]}` : `de ${filterCustomDate}`;
    }

    const filtered = allItems.filter(r => {
        const v = values(r);
        const st = statusOf(r);
        const d = String(v.date || '');

        if (ini && d < ini) return false;
        if (fim && d > fim) return false;

        if (filterParecer === 'favoravel') {
            const p = String(v.parecer || '').toUpperCase();
            if (!p.includes('FAVORÁVEL') && !p.includes('FAVORAVEL')) return false;
        } else if (filterParecer === 'contrario') {
            const p = String(v.parecer || '').toUpperCase();
            if (!p.includes('CONTRÁRIO') && !p.includes('CONTRARIO')) return false;
        } else if (filterParecer === 'finalizado') {
            if (st !== 'FINALIZADO') return false;
        } else if (filterParecer === 'aberto') {
            if (st === 'FINALIZADO' || st === 'ARQUIVADO') return false;
        }

        if (query) {
            const blob = `${v.patient} ${v.cpf} ${v.cid} ${v.cargo} ${v.unidade} ${v.doenca} ${v.parecer} ${v.atd}`.toLowerCase();
            const cleanCpf = query.replace(/\D/g, '');
            const matchQuery = blob.includes(query) || (cleanCpf.length >= 3 && String(v.cpf || '').replace(/\D/g, '').includes(cleanCpf));
            if (!matchQuery) return false;
        }

        return true;
    });

    currentDoctorWorkspace.filteredItems = filtered;

    // Atualizar Barra de Status
    const summaryEl = document.getElementById('docFilterSummaryText');
    if (summaryEl) {
        let txt = `Exibindo ${filtered.length} atendimento${filtered.length === 1 ? '' : 's'} (${periodText})`;
        if (filterParecer !== 'todos') {
            const pLabel = { favoravel: 'Favoráveis', contrario: 'Contrários', finalizado: 'Finalizados', aberto: 'Em Aberto' }[filterParecer] || filterParecer;
            txt += ` • ${pLabel}`;
        }
        if (query) {
            txt += ` • busca: "${query}"`;
        }
        summaryEl.textContent = txt;
    }

    const countEl = document.getElementById('docFilterCountBadge');
    if (countEl) {
        countEl.textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;
    }

    // Renderizar Tabela
    renderTabelaAtendimentosMedico(filtered);
}
window.filtrarAtendimentosMedicoLocalmente = filtrarAtendimentosMedicoLocalmente;

function renderTabelaAtendimentosMedico(items) {
    const tbody = document.getElementById('docAtendimentosTbody');
    const emptyBox = document.getElementById('docAtendimentosEmpty');
    if (!tbody) return;

    if (!items || !items.length) {
        tbody.innerHTML = '';
        if (emptyBox) emptyBox.style.display = 'flex';
        return;
    }

    if (emptyBox) emptyBox.style.display = 'none';

    tbody.innerHTML = items.map(r => {
        const v = values(r);
        const st = statusOf(r);
        const id = v.atd || r.atendimento || r.id || '';
        const encId = encodeURIComponent(String(id));

        const nameParts = String(v.patient || 'P').trim().split(/\s+/).filter(Boolean);
        const ini = ((nameParts[0] ? nameParts[0][0] : '') + (nameParts[1] ? nameParts[1][0] : '')).toUpperCase() || 'P';

        // Parecer Tag
        let parecerBadge = '<span class="badge" style="background:#F1F5F9;color:#64748B;font-size:11px">Em avaliação</span>';
        const parUpper = String(v.parecer || '').toUpperCase();
        if (parUpper.includes('FAVORÁVEL') || parUpper.includes('FAVORAVEL')) {
            parecerBadge = '<span class="badge" style="background:#DCFCE7;color:#15803D;font-size:11px;font-weight:800">👍 Favorável</span>';
        } else if (parUpper.includes('CONTRÁRIO') || parUpper.includes('CONTRARIO')) {
            parecerBadge = '<span class="badge" style="background:#FEE2E2;color:#B91C1C;font-size:11px;font-weight:800">⚖️ Contrário</span>';
        }

        // Status Tag
        const stCls = st === 'FINALIZADO' ? 'done' : st === 'EM_REVISÃO' ? 'review' : st === 'REABERTO' ? 'reopened' : 'archived';

        return `
            <tr>
                <td>
                    <strong style="color:#0F172A;font-size:12.5px">${esc(date(v.date))}</strong>
                    <div style="margin-top:3px">${v.time ? `<span class="time-badge">⏰ ${esc(v.time)}</span>` : '<small style="color:#94A3B8">Início pendente</small>'}</div>
                </td>
                <td>
                    <div class="patient-cell-wrap">
                        <div class="patient-avatar">${esc(ini)}</div>
                        <div class="patient-info">
                            <span class="main-id">${esc(v.patient || 'Paciente não informado')}</span>
                            ${v.cpf ? `<span class="patient-cpf-pill">CPF ${esc(v.cpf)}</span>` : ''}
                            <span class="sub sub-clamp" title="${esc(v.doenca || 'Avaliação médico-pericial')}">${esc(v.doenca || 'Avaliação médico-pericial')}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <b class="cargo-title">${esc(v.cargo && v.cargo !== '—' && v.cargo !== '-' ? v.cargo : 'Cargo não informado')}</b>
                    ${v.unidade ? `<div class="unit-row" title="${esc(v.unidade)}">🏢 ${esc(String(v.unidade).replace(/^0+\d*\s*-\s*/, ''))}</div>` : ''}
                </td>
                <td>
                    <div>
                        <span class="sub-tag-cid" style="font-weight:800">CID ${esc(v.cid || '—')}</span>
                    </div>
                </td>
                <td style="text-align:center">
                    ${v.dias ? `<span class="sub-tag-days" style="font-weight:800">⏱️ ${esc(v.dias)} dias</span>` : '<span style="color:#94A3B8">—</span>'}
                </td>
                <td style="text-align:center">
                    ${parecerBadge}
                </td>
                <td style="text-align:center">
                    <span class="badge ${stCls}"><span class="dot"></span>${esc(stateLabel[st] || st)}</span>
                </td>
                <td style="text-align:right">
                    <div class="doc-actions-cell">
                        <button type="button" class="doc-act-btn esisla" onclick="generateEsisla('${encId}')" title="Gerar e abrir Ficha e-SISLA oficial via IA">
                            <span>📋 Ficha</span>
                        </button>
                        <button type="button" class="doc-act-btn detail" onclick="view('${encId}')" title="Abrir prontuário completo deste atendimento">
                            <span>👁️ Prontuário</span>
                        </button>
                        <button type="button" class="doc-act-btn eval" onclick="openEval('${encId}')" title="Continuar atendimento">
                            <span>✏️ Abrir</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}
window.renderTabelaAtendimentosMedico = renderTabelaAtendimentosMedico;

function imprimirPautaMedico() {
    if (!currentDoctorWorkspace || !currentDoctorWorkspace.doctor) return;
    const d = currentDoctorWorkspace.doctor;
    const items = currentDoctorWorkspace.filteredItems || [];
    const periodLabel = document.getElementById('docFilterSummaryText')?.textContent || 'Período Geral';

    const printWin = window.open('', '_blank', 'width=950,height=750');
    if (!printWin) {
        alert('Por favor, permita popups para imprimir a pauta médica.');
        return;
    }

    const rowsHtml = items.map((r, idx) => {
        const v = values(r);
        const st = statusOf(r);
        return `
            <tr>
                <td style="text-align:center">${idx + 1}</td>
                <td><strong>${esc(date(v.date))}</strong><br><small>${v.time ? `⏰ ${esc(v.time)}` : 'Horário pendente'}</small></td>
                <td><strong>${esc(v.patient || 'Não informado')}</strong><br><small>${v.cpf ? `CPF: ${esc(v.cpf)}` : ''}</small></td>
                <td>${esc(v.cargo || '—')}<br><small>${esc(v.unidade || '')}</small></td>
                <td><strong>${esc(v.cid || '—')}</strong><br><small>${esc(v.dias ? `${v.dias} dias` : '—')}</small></td>
                <td style="text-align:center">${esc(v.parecer || '—')}</td>
                <td style="text-align:center">${esc(stateLabel[st] || st)}</td>
                <td style="border-bottom:1px solid #999;min-width:120px">&nbsp;</td>
            </tr>
        `;
    }).join('');

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Pauta de Atendimentos - ${esc(d.nome)}</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #1e293b; font-size: 11px; }
                .pauta-head { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
                .pauta-title h1 { margin: 0 0 4px; font-size: 18px; color: #0f172a; text-transform: uppercase; }
                .pauta-title p { margin: 0; color: #64748b; font-size: 12px; }
                .pauta-meta { text-align: right; font-size: 11px; color: #475569; }
                .pauta-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                .pauta-table th { background: #f1f5f9; padding: 8px 6px; font-size: 9.5px; text-transform: uppercase; border: 1px solid #cbd5e1; text-align: left; }
                .pauta-table td { padding: 6px; border: 1px solid #cbd5e1; font-size: 10.5px; vertical-align: top; }
                .pauta-table tr:nth-child(even) td { background: #f8fafc; }
                .pauta-foot { margin-top: 36px; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid; }
                .sig-box { text-align: center; width: 280px; }
                .sig-line { border-top: 1.5px solid #0f172a; margin-top: 40px; padding-top: 4px; font-weight: bold; }
                @media print {
                    @page { margin: 12mm; size: landscape; }
                }
            </style>
        </head>
        <body>
            <div class="pauta-head">
                <div class="pauta-title">
                    <h1>Ambiental • Saúde Ocupacional & Perícias Médicas</h1>
                    <p>Pauta Oficial de Atendimentos Periciais DPME / SP</p>
                </div>
                <div class="pauta-meta">
                    <strong>${esc(d.nome)}</strong><br>
                    <span>${d.crm ? `CRM: ${esc(d.crm)}` : 'Perito Oficial'}</span><br>
                    <span>${esc(periodLabel)} • Total: ${items.length} atendimentos</span>
                </div>
            </div>
            <table class="pauta-table">
                <thead>
                    <tr>
                        <th style="width:24px;text-align:center">#</th>
                        <th style="width:90px">Data / Hora</th>
                        <th>Periciado / Paciente</th>
                        <th>Cargo / Lotação</th>
                        <th style="width:100px">CID / Dias</th>
                        <th style="width:90px;text-align:center">Parecer</th>
                        <th style="width:90px;text-align:center">Status</th>
                        <th style="width:130px;text-align:center">Assinatura Periciado</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml || '<tr><td colspan="8" style="text-align:center;padding:16px">Nenhum atendimento listado.</td></tr>'}
                </tbody>
            </table>
            <div class="pauta-foot">
                <div>
                    <small>Documento emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</small><br>
                    <small>Sistema Ambiental Atendimentos • Gestão Integrada</small>
                </div>
                <div class="sig-box">
                    <div class="sig-line">${esc(d.nome)}<br><span style="font-weight:normal;font-size:10px">${d.crm ? `CRM ${esc(d.crm)}` : 'Médico Perito Oficial'}</span></div>
                </div>
            </div>
        </body>
        </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 250);
}
window.imprimirPautaMedico = imprimirPautaMedico;

function exportarPautaMedicoCSV() {
    if (!currentDoctorWorkspace || !currentDoctorWorkspace.doctor) return;
    const d = currentDoctorWorkspace.doctor;
    const items = currentDoctorWorkspace.filteredItems || [];
    if (!items.length) {
        if (window.AmbientalUtils?.toast) AmbientalUtils.toast('Nenhum atendimento para exportar no filtro atual.', 'warning');
        return;
    }

    const headers = ["Atendimento", "Data", "Horário", "Médico", "CRM", "Paciente", "CPF", "Cargo", "Unidade", "CID", "Dias Afastamento", "Parecer", "Status", "Última Atualização"];
    const csvRows = [headers.join(';')];

    items.forEach(r => {
        const v = values(r);
        const st = statusOf(r);
        const cleanCol = s => `"${String(s || '').replace(/"/g, '""').trim()}"`;
        csvRows.push([
            cleanCol(v.atd),
            cleanCol(v.date),
            cleanCol(v.time),
            cleanCol(d.nome),
            cleanCol(d.crm),
            cleanCol(v.patient),
            cleanCol(v.cpf),
            cleanCol(v.cargo),
            cleanCol(v.unidade),
            cleanCol(v.cid),
            cleanCol(v.dias),
            cleanCol(v.parecer),
            cleanCol(stateLabel[st] || st),
            cleanCol(v.updated)
        ].join(';'));
    });

    const csvContent = "\uFEFF" + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const safeName = d.nome.replace(/[^a-zA-Z0-9]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `pauta_${safeName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (window.AmbientalUtils?.toast) {
        AmbientalUtils.toast('Pauta médica exportada em CSV com sucesso!', 'success');
    }
}
window.exportarPautaMedicoCSV = exportarPautaMedicoCSV;

function renderDoctorProduction(rows) {
    const cardsContainer = document.getElementById('doctorCardsGrid');
    const tableBody = document.getElementById('doctorDashboardBody');
    
    const validRows = Array.isArray(rows) ? rows : [];
    window._doctorProductionList = validRows;
    
    if (!validRows.length) {
        if (cardsContainer) cardsContainer.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:32px;text-align:center;color:#8A99AC">Nenhum atendimento disponível no escopo atual.</div>';
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#8A99AC;padding:20px">Nenhum atendimento disponível no escopo atual.</td></tr>';
        return;
    }
    
    let totalMedicos = 0;
    let totalAtd = 0;
    let totalFin = 0;
    let totalFav = 0;
    let totalContra = 0;

    validRows.forEach(d => {
        if (d.nome !== 'Não identificado' && d.medico !== 'Não identificado') {
            totalMedicos++;
        }
        totalAtd += Number(d.total || 0);
        totalFin += Number(d.finalizados || 0);
        totalFav += Number(d.favoraveis || 0);
        totalContra += Number(d.contrarios || 0);
    });

    const kpiMedicos = document.getElementById('docKpiTotalMedicos');
    if (kpiMedicos) kpiMedicos.textContent = totalMedicos;
    
    const kpiAtd = document.getElementById('docKpiTotalAtd');
    if (kpiAtd) kpiAtd.textContent = totalAtd;
    
    const kpiFin = document.getElementById('docKpiTotalFin');
    if (kpiFin) kpiFin.textContent = totalFin;
    const kpiTaxaFin = document.getElementById('docKpiTaxaFin');
    if (kpiTaxaFin) kpiTaxaFin.textContent = `${pct(totalFin, totalAtd)}% concluídos`;

    const kpiFav = document.getElementById('docKpiTotalFav');
    if (kpiFav) kpiFav.textContent = totalFav;
    const kpiTaxaFav = document.getElementById('docKpiTaxaFav');
    if (kpiTaxaFav) kpiTaxaFav.textContent = `${pct(totalFav, totalAtd)}% do total`;

    const kpiContra = document.getElementById('docKpiTotalContra');
    if (kpiContra) kpiContra.textContent = totalContra;
    const kpiTaxaContra = document.getElementById('docKpiTaxaContra');
    if (kpiTaxaContra) kpiTaxaContra.textContent = `${pct(totalContra, totalAtd)}% do total`;

    const viewCount = document.getElementById('medicosViewCount');
    if (viewCount) viewCount.textContent = `${totalMedicos} médico${totalMedicos === 1 ? '' : 's'} ativo${totalMedicos === 1 ? '' : 's'}`;

    if (cardsContainer) {
        cardsContainer.innerHTML = validRows.map((d, idx) => {
            const rawMed = String(d.medico || '');
            const cleanName = d.nome || rawMed.replace(/\s*-\s*CRM.*$/i, '').replace(/\s*CRM[:\s]*\d+.*$/i, '').trim() || 'Médico não informado';
            const crmMatch = rawMed.match(/CRM[:\s]*([0-9A-Z\/\-]+)/i);
            const crmVal = d.crm || (crmMatch ? crmMatch[1] : '');
            const initials = cleanName.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'MD';
            const taxa = pct(d.finalizados, d.total);
            const emAberto = Math.max(0, (d.total || 0) - (d.finalizados || 0));

            return `
                <article class="doctor-card">
                    <div class="doc-card-top">
                        <div class="doc-avatar-wrap">
                            <div class="doc-avatar">${esc(initials)}</div>
                            <span class="doc-online-dot" title="Profissional Ativo"></span>
                        </div>
                        <div class="doc-meta">
                            <h3 class="doc-name" title="${esc(cleanName)}">${esc(cleanName)}</h3>
                            <div class="doc-badges">
                                <span class="doc-crm-badge">${crmVal ? `CRM: ${esc(crmVal)}` : 'CRM pendente'}</span>
                                <span class="doc-role-badge">Perito Oficial</span>
                            </div>
                        </div>
                        <div class="doc-total-badge" title="Total de atendimentos deste médico">
                            <strong>${d.total || 0}</strong>
                            <span>atendimentos</span>
                        </div>
                    </div>

                    <div class="doc-progress-section">
                        <div class="doc-progress-info">
                            <span class="doc-progress-label">Taxa de Conclusão</span>
                            <strong class="doc-progress-pct">${taxa}%</strong>
                        </div>
                        <div class="doc-progress-bar">
                            <div class="doc-progress-fill" style="width: ${taxa}%"></div>
                        </div>
                    </div>

                    <div class="doc-stats-grid">
                        <div class="doc-stat-pill green" title="Pareceres Favoráveis">
                            <span class="doc-stat-pill-label">Favoráveis</span>
                            <b class="doc-stat-pill-val">${d.favoraveis || 0}</b>
                        </div>
                        <div class="doc-stat-pill amber" title="Pareceres Contrários">
                            <span class="doc-stat-pill-label">Contrários</span>
                            <b class="doc-stat-pill-val">${d.contrarios || 0}</b>
                        </div>
                        <div class="doc-stat-pill blue" title="Atendimentos Finalizados">
                            <span class="doc-stat-pill-label">Finalizados</span>
                            <b class="doc-stat-pill-val">${d.finalizados || 0}</b>
                        </div>
                        <div class="doc-stat-pill slate" title="Atendimentos em Aberto">
                            <span class="doc-stat-pill-label">Em Aberto</span>
                            <b class="doc-stat-pill-val">${emAberto}</b>
                        </div>
                    </div>

                    <div class="doc-card-foot">
                        <button type="button" class="btn-ver-atendimentos" onclick="window.abrirModalAtendimentosMedicoByIndex(${idx})">
                            <svg class="btn-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <span>Ver atendimentos</span>
                            <span class="btn-arrow">→</span>
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    if (tableBody) {
        tableBody.innerHTML = validRows.map((d, idx) => {
            const rawMed = String(d.medico || '');
            const cleanName = d.nome || rawMed.replace(/\s*-\s*CRM.*$/i, '').replace(/\s*CRM[:\s]*\d+.*$/i, '').trim() || 'Médico não informado';
            const crmMatch = rawMed.match(/CRM[:\s]*([0-9A-Z\/\-]+)/i);
            const crmVal = d.crm || (crmMatch ? crmMatch[1] : '');
            const initials = cleanName.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'MD';
            const taxa = pct(d.finalizados, d.total);
            const emAberto = Math.max(0, (d.total || 0) - (d.finalizados || 0));

            return `
                <tr>
                    <td>
                        <div class="doc-table-cell">
                            <div class="doc-avatar sm">${esc(initials)}</div>
                            <div>
                                <strong class="doc-name-table">${esc(cleanName)}</strong>
                                <span class="doc-crm-tag">${crmVal ? `CRM: ${esc(crmVal)}` : 'CRM pendente'}</span>
                            </div>
                        </div>
                    </td>
                    <td style="text-align:center"><strong class="num-bold">${d.total || 0}</strong></td>
                    <td style="text-align:center"><span class="badge-num green">${d.finalizados || 0}</span></td>
                    <td style="text-align:center">
                        <div class="table-progress-wrap">
                            <span class="table-progress-text">${taxa}%</span>
                            <div class="table-progress-bar"><div class="table-progress-fill" style="width:${taxa}%"></div></div>
                        </div>
                    </td>
                    <td style="text-align:center"><span class="badge-num green">${d.favoraveis || 0}</span></td>
                    <td style="text-align:center"><span class="badge-num red">${d.contrarios || 0}</span></td>
                    <td style="text-align:center"><span class="badge-num gray">${emAberto}</span></td>
                    <td style="text-align:right">
                        <button type="button" class="btn-ver-atendimentos-sm" onclick="window.abrirModalAtendimentosMedicoByIndex(${idx})">
                            <span>Ver atendimentos</span>
                            <span class="btn-arrow">→</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

function renderStats(s) {
    latestStats = s || {};
    document.getElementById('statTotal').textContent = s.total ?? 0;
    document.getElementById('statDraft').textContent = s.rascunhos ?? 0;
    document.getElementById('statReview').textContent = s.revisao ?? 0;
    document.getElementById('statDone').textContent = s.finalizados ?? 0;
    document.getElementById('statArchived').textContent = s.arquivados ?? 0;
    document.getElementById('statPending').textContent = s.pendentes ?? 0;
    document.getElementById('statRecent').textContent = s.atualizados_recentes ?? 0;
    document.getElementById('dashTotal').textContent = s.total ?? 0;
    document.getElementById('dashRecent').textContent = (s.atualizados_recentes ?? 0) + ' atualizados recentemente';
    document.getElementById('dashDone').textContent = s.finalizados ?? 0;
    document.getElementById('dashDoneRate').textContent = pct(s.finalizados, s.total) + '% do total';
    document.getElementById('dashFav').textContent = s.favoraveis ?? 0;
    document.getElementById('dashFavRate').textContent = pct(s.favoraveis, s.total) + '% dos registros';
    document.getElementById('dashContra').textContent = s.contrarios ?? 0;
    document.getElementById('dashContraRate').textContent = pct(s.contrarios, s.total) + '% dos registros';
    document.getElementById('dashPending').textContent = s.pendentes ?? 0;
    document.getElementById('dashComplete').textContent = (s.completude_media ?? 0) + '%';
    document.getElementById('dashAlerts').textContent = s.alertas ?? 0;
    document.getElementById('dashDoctors').textContent = s.medicos_ativos_na_gestao ?? 0;
    setBar('barFav', s.favoraveis, s.total, 'barFavVal');
    setBar('barContra', s.contrarios, s.total, 'barContraVal');
    setBar('barUndefined', s.pareceres_nao_definidos, s.total, 'barUndefinedVal');
    setBar('barDone', s.finalizados, s.total, 'barDoneVal');
    setBar('barReview', s.revisao, s.total, 'barReviewVal');
    setBar('barDraft', s.rascunhos, s.total, 'barDraftVal');

    renderDoctorProduction(Array.isArray(s.por_medico) ? s.por_medico : []);
}
function row(r){const v=values(r),st=statusOf(r),cls=st==='FINALIZADO'?'done':st==='EM_REVISÃO'?'review':st==='REABERTO'?'reopened':st==='ARQUIVADO'?'archived':'';const id=v.atd||r.atendimento||r.id||'';const isSelected=selectedAtdIds.has(String(id));const adminMode=isAdmin();let more='';if(st==='RASCUNHO')more+=`<button onclick="openModoIA2('${encodeURIComponent(v.atd)}')">🚀 Modo IA 2.0</button><button onclick="openEval('${encodeURIComponent(v.atd)}')">Continuar</button><button onclick="openReason('archive','${encodeURIComponent(v.atd)}')">Arquivar</button>`;if(st==='EM_REVISÃO'||st==='REABERTO')more+=`<button onclick="openModoIA2('${encodeURIComponent(v.atd)}')">🚀 Modo IA 2.0</button><button onclick="openEval('${encodeURIComponent(v.atd)}')">Continuar</button><button onclick="openReason('archive','${encodeURIComponent(v.atd)}')">Arquivar</button>`;if(st==='FINALIZADO')more+=`<button onclick="openReason('reopen','${encodeURIComponent(v.atd)}')">Reabrir</button><button onclick="openDocument('${encodeURIComponent(v.atd)}')">Visualizar documento</button><button onclick="openReason('archive','${encodeURIComponent(v.atd)}')">Arquivar</button>`;if(st==='ARQUIVADO')more+=`<button onclick="openReason('restore','${encodeURIComponent(v.atd)}')">Restaurar</button>`;if(adminMode)more+=`<button onclick="confirmSingleDeleteAdmin('${encodeURIComponent(id)}')" style="color:#DC2626;font-weight:700">🗑️ Excluir do Banco</button>`;const selectTd=`<td class="admin-td-select"><input type="checkbox" class="row-select-checkbox" data-id="${esc(id)}" onchange="toggleRowSelect('${esc(id)}', this.checked)" ${isSelected?'checked':''} style="cursor:pointer;width:16px;height:16px" title="Selecionar para exclusão"></td>`;const nameParts=String(v.patient||'P').trim().split(/\s+/).filter(Boolean);const ini=((nameParts[0]?nameParts[0][0]:'')+(nameParts[1]?nameParts[1][0]:'')).toUpperCase()||'P';let rawDoc=String(v.doctor||'Médico não informado').trim();let cleanDoc=rawDoc.replace(/\s*-\s*CRM.*$/i,'').replace(/\s*CRM[:\s]*\d+.*$/i,'').trim();let crmMatch=rawDoc.match(/CRM[:\s]*([0-9A-Z\/\-]+)/i);let crmVal=v.crm||(crmMatch?crmMatch[1]:'');let cleanUnit=String(v.unidade||'').replace(/^0+\d*\s*-\s*/,'').trim();return`<tr>${selectTd}<td class="col-patient"><div class="patient-cell-wrap"><div class="patient-avatar">${esc(ini)}</div><div class="patient-info"><span class="main-id">${esc(v.patient||'Paciente não informado')}</span>${v.cpf?`<span class="patient-cpf-pill">CPF ${esc(v.cpf)}</span>`:''}<span class="sub sub-clamp" title="${esc(v.doenca||'Avaliação médico-pericial')}">${esc(v.doenca||'Avaliação médico-pericial')}</span></div></div></td><td><div class="date-cell-wrap"><strong class="date-val">${esc(date(v.date))}</strong>${v.time?`<span class="time-badge">⏰ ${esc(v.time)}</span>`:'<span class="sub" style="color:#94A3B8">Início pendente</span>'}</div></td><td><div class="doctor-cell-wrap"><span class="main-name doctor-name-title">${esc(cleanDoc||'Médico não informado')}</span>${crmVal?`<span class="doctor-crm-tag">CRM ${esc(crmVal)}</span>`:''}</div></td><td><div class="data-cell-wrap"><b class="cargo-title">${esc(v.cargo&&v.cargo!=='—'?v.cargo:'Cargo não informado')}</b>${cleanUnit?`<span class="unit-row" title="${esc(cleanUnit)}">🏢 ${esc(cleanUnit)}</span>`:''}<div class="pills-row"><span class="sub-tag-cid">CID ${esc(v.cid||'—')}</span><span class="sub-tag-age">${esc(v.idade||'—')}a</span>${v.dias?`<span class="sub-tag-days">⏱️ ${esc(v.dias)} dias</span>`:''}</div></div></td><td><span class="badge ${cls}"><span class="dot"></span>${esc(stateLabel[st]||st)}</span></td><td><strong class="updated-date">${esc(dt(v.updated))}</strong></td><td><div class="row-actions"><button class="row-btn-open" type="button" onclick="generateEsisla('${encodeURIComponent(v.atd)}')" title="Gerar e abrir diretamente a Ficha e-SISLA pela IA"><span>Abrir ficha</span><span class="row-btn-arrow">→</span></button><button class="row-btn-viewmore" type="button" onclick="view('${encodeURIComponent(v.atd)}')" title="Visualizar prontuário e detalhes completos deste atendimento"><span>Ver mais</span></button><details class="more"><summary class="row-btn-more" title="Mais opções para este atendimento"><span>Mais</span><span class="more-caret">▾</span></summary><div class="more-menu">${more}<button onclick="view('${encodeURIComponent(v.atd)}')">Ver prontuário completo</button><button onclick="openHistory('${encodeURIComponent(v.atd)}')">Ver histórico</button></div></details></div></td></tr>`}
function find(id){return serverItems.find(x=>String(x.atendimento)===id)}
async function view(enc){
    const id=decodeURIComponent(enc),r=find(id);
    if(!r)return;
    const modal=document.getElementById('detailModal');
    const title=document.getElementById('detailTitle');
    const sub=document.getElementById('detailSub');
    const body=document.getElementById('detailBody');
    if(title)title.textContent=values(r).patient||'Paciente não informado';
    if(sub)sub.textContent='Preparando ficha…';
    if(body)body.innerHTML=`<div class="detail-open-skeleton"><div class="detail-open-skeleton-card"><div class="detail-open-loader"></div><strong>Carregando ficha</strong><span>Consultando os dados completos deste atendimento…</span></div></div>`;
    setModal('detailModal',true);
    await new Promise(resolve=>setTimeout(resolve,360));
    let full=r;
    try{
        if(r.__source==='server'&&!r.payload){
            const response=await AmbientalAuth.authFetch('/api/atendimentos/'+encodeURIComponent(id),{cache:'no-store'});
            const result=await response.json().catch(()=>null);
            if(!response.ok||!result?.success)throw new Error(result?.error?.message||'Não foi possível carregar o atendimento.');
            full={...r,...result.data.payload,payload:result.data.payload};
        }
        const v=values(full);
        if(title)title.textContent=v.patient||'Paciente não informado';
        if(sub)sub.textContent=`${stateLabel[statusOf(full)]||statusOf(full)} · ${v.atd||'identificação interna'} · atualizado em ${dt(full.atualizado_em||v.updated)}`;
        if(body)body.innerHTML=detail(full);
        window.currentDetailFull=full;
        window.currentDetailEnc=enc;
        document.getElementById('openEvalBtn').onclick=()=>openEval(enc);
        document.getElementById('historyBtn').onclick=()=>openHistory(enc);
        document.getElementById('generateEsislaBtn').onclick=()=>generateEsisla(enc);
        const compBtn=document.getElementById('comprovanteDetailBtn');
        if(compBtn)compBtn.onclick=()=>abrirModalComprovanteGestao(full);
        const benchBtn=document.getElementById('btnBenchmarkDetail');
        if(benchBtn)benchBtn.onclick=()=>consultarBenchmarkDetail(v.cid);
        const ditadoBtn=document.getElementById('btnDitadoGestao');
        if(ditadoBtn)ditadoBtn.onclick=()=>iniciarDitadoParaAtendimento(enc);
    }catch(e){
        if(body)body.innerHTML=`<div class="history-empty"><strong>Não foi possível carregar a ficha.</strong><div style="margin-top:6px">${esc(e.message||'Tente novamente.')}</div></div>`;
    }
}

async function consultarBenchmarkDetail(cidParam) {
    let cid = cidParam;
    if (!cid && window.currentDetailFull) {
        const v = values(window.currentDetailFull);
        cid = v.cid;
    }
    cid = String(cid || '').trim();
    if (!cid || cid === '—' || cid === '-') {
        alert('Este atendimento não possui um código CID cadastrado para consulta de parâmetros.');
        return;
    }
    try {
        let res;
        if (window.AmbientalAPI?.ai?.benchmarkCid) {
            res = await AmbientalAPI.ai.benchmarkCid(cid);
        } else {
            const r = await fetch(`/api/ai/benchmark-cid/${encodeURIComponent(cid)}`);
            res = await r.json();
        }
        const b = res?.data || res;
        if (!b || !b.cid) throw new Error('Dados de benchmark não encontrados para este CID.');
        
        document.getElementById('benchGestaoPill').textContent = b.cid;
        document.getElementById('benchGestaoNome').textContent = b.descricao || 'Descrição não cadastrada';
        document.getElementById('benchGestaoGrupo').textContent = b.grupo || 'Capítulo clínico padrão';
        document.getElementById('benchGestaoMedia').textContent = b.dias_medio ? `${b.dias_medio} dias` : '—';
        document.getElementById('benchGestaoFaixa').textContent = b.faixa_usual || '—';
        document.getElementById('benchGestaoJunta').textContent = b.limite_junta_medica ? `${b.limite_junta_medica} dias` : 'Critério pericial';
        document.getElementById('benchGestaoEsp').textContent = b.especialidade || 'Medicina Pericial';
        
        let info = `<strong>Diretrizes Clínico-Periciais DPME/SP:</strong> `;
        if (b.diretrizes) info += `${b.diretrizes} `;
        if (b.regras_dpme && b.regras_dpme.length) {
            info += `<br><br>• ${b.regras_dpme.join('<br>• ')}`;
        }
        document.getElementById('benchGestaoInfo').innerHTML = info;
        setModal('modalBenchmarkGestao', true);
    } catch(err) {
        alert('Não foi possível obter parâmetros do CID: ' + (err.message || 'Erro de conexão.'));
    }
}

function iniciarDitadoParaAtendimento(enc) {
    const rawId = decodeURIComponent(enc || window.currentDetailEnc || '');
    if (!rawId) return;
    openEval(encodeURIComponent(rawId));
}

function detail(r){
    const v=values(r);
    const docs=v.docs.filter(x=>x?.tipo||x?.data||x?.resultado).map(x=>`<div class="field full"><label>${esc(x.tipo||'Documento')} ${x.data?'· '+date(x.data):''}</label><div>${esc(x.resultado||'Registro sem descrição')}</div></div>`).join('');
    const qs=(v.ques.length?v.ques:[]).slice(0,3).map((q,i)=>`<div class="qrow"><div><b>${i+1}. </b>${esc(q.pergunta||'Quesito não informado')}</div><span class="ans ${q.resposta==='Sim'?'sim':q.resposta==='Não'?'nao':''}">${esc(q.resposta||'Não respondido')}</span></div>`).join('');
    const patient=v.patient||'Paciente não informado';
    let cleanDoc=String(v.doctor||'Médico não informado').replace(/\s*-\s*CRM.*$/i,'').replace(/\s*CRM[:\s]*\d+.*$/i,'').trim();
    let cleanUnit=String(v.unidade||'').replace(/^0+\d*\s*-\s*/,'').trim();
    return `<div class="detail-context">
      <div class="context-card"><span class="label">Paciente</span><span class="value">${esc(patient)}</span><span class="muted">CPF: ${esc(v.cpf||'Não informado')}</span></div>
      <div class="context-card"><span class="label">Data do atendimento</span><span class="value">${esc(date(v.date))}</span><span class="muted">Identificação interna preservada pelo sistema</span></div>
      <div class="context-card"><span class="label">Situação</span><span class="value">${esc(stateLabel[statusOf(r)]||statusOf(r))}</span><span class="muted">Atualizado ${esc(dt(r.atualizado_em||v.updated))}</span></div>
    </div>
    <section class="section"><h3>Identificação profissional</h3><span class="section-sub">Dados de quem realizou o atendimento e contexto ocupacional</span><div class="grid">${field('Médico responsável',cleanDoc)}${field('CRM/CRO',v.crm)}${field('Cargo',v.cargo)}${field('Idade',v.idade?String(v.idade)+' anos':'Não informado')}${field('Unidade',cleanUnit)}${field('Dias solicitados',v.dias)}</div></section>
    <section class="section"><h3>Queixa e contexto clínico</h3><span class="section-sub">Informações registradas durante a avaliação</span><div class="grid">${field('Doença / motivo',v.doenca)}${field('Queixa e duração',v.q,true)}${field('Antecedentes mórbidos',v.hist,true)}${field('Sintomas / limitações',v.sint,true)}</div></section>
    <section class="section"><h3>Documentos, atestados e exames</h3><span class="section-sub">Registros complementares vinculados ao atendimento</span><div class="grid">${docs||field('Registro','Nenhum documento complementar registrado.',true)}</div></section>
    <section class="section"><h3>Exame e capacidade funcional</h3><span class="section-sub">Achados objetivos e impacto funcional informado</span><div class="grid">${field('Tipo de exame',v.examType)}${field('Achados clínicos / exames',v.exam,true)}${field('Limitação funcional',v.lim,true)}${field('Atividades comprometidas',v.ativ,true)}${field('Capacidade',v.cap)}</div></section>
    <section class="section"><h3>Quesitos da avaliação</h3><span class="section-sub">Respostas registradas pelo profissional</span>${qs||'<div class="history-empty">Nenhum quesito registrado neste atendimento.</div>'}</section>
    <section class="section"><h3>Parecer e fundamentação</h3><span class="section-sub">Conclusão registrada no atendimento</span><div class="grid">${field('Parecer',v.parecer,true)}${field('Justificativa',v.just,true)}</div></section>`;
}
function field(label,value,full=false){
    const empty=value===undefined||value===null||String(value).trim()==='';
    return `<div class="field ${full?'full':''}"><label>${esc(label)}</label><div class="${empty?'field-value-empty':''}">${empty?'Não informado':esc(String(value))}</div></div>`;
}
function setModal(id,open=true){const el=document.getElementById(id);if(!el)return;el.classList.toggle('open',open);const anyOpen=[...document.querySelectorAll('.modal.open')].length>0;document.documentElement.classList.toggle('modal-lock',anyOpen);document.body.classList.toggle('modal-lock',anyOpen);if(open){requestAnimationFrame(()=>el.querySelector('button,textarea,[tabindex]:not([tabindex="-1"])')?.focus?.());}}
function closeModal(id){setModal(id,false)}
function openEval(enc, modoIa2 = true){
  try {
    const rawId = decodeURIComponent(enc);
    const r = find(rawId);
    if (r) {
      const v = values(r);
      const p = new URLSearchParams();
      p.set('atendimento', rawId);
      if (v.patient && v.patient !== 'Paciente não informado') p.set('paciente', v.patient);
      if (v.cpf) p.set('cpf', v.cpf);
      if (v.cargo && v.cargo !== '-' && v.cargo !== 'Cargo não informado') p.set('cargo', v.cargo);
      if (v.idade && v.idade !== '-') p.set('idade', v.idade);
      if (v.unidade) p.set('unidade', v.unidade);
      if (modoIa2) p.set('modo_ia2', '1');
      location.href = '/app?' + p.toString();
      return;
    }
  } catch(_) {}
  location.href='/app?atendimento='+enc + (modoIa2 ? '&modo_ia2=1' : '');
}
function openModoIA2(enc){
  openEval(enc, true);
}
window.openModoIA2 = openModoIA2;
function openDocument(enc){location.href='/app?atendimento='+enc+'&documento=1'}
function normalizeRecordPayload(r){
    const p = (r?.payload && typeof r.payload === 'object') ? r.payload : (r || {});
    const a = p?.aux || r?.aux || {};
    return {
        ...r,
        ...p,
        ...a,
        aux: { ...a, ...(p.aux || {}) },
        atendimento: r?.atendimento || p?.atendimento || a?.atendimento || r?.id,
        exameFisicoTipo: p?.exameFisicoTipo || a?.exameFisicoTipo || p?.agilExameFisicoTipo || r?.exameFisicoTipo || "",
        outrosSubtipo: p?.outrosSubtipo || a?.outrosSubtipo || p?.areaExameClinico || a?.areaExameClinico || r?.outrosSubtipo || "",
        areaExameClinico: p?.areaExameClinico || a?.areaExameClinico || p?.outrosSubtipo || a?.outrosSubtipo || r?.areaExameClinico || "",
        outrosResultado: p?.outrosResultado || a?.outrosResultado || p?.resultadoAvaliacao || a?.resultadoAvaliacao || r?.outrosResultado || "",
        resultadoAvaliacao: p?.resultadoAvaliacao || a?.resultadoAvaliacao || p?.outrosResultado || a?.outrosResultado || r?.resultadoAvaliacao || "",
        exameFisicoDescricao: p?.exameFisicoDescricao || a?.exameFisicoDescricao || p?.agilExameFisicoDescricao || a?.agilExameFisicoDescricao || r?.exameFisicoDescricao || "",
        historicoPregresso: p?.historicoPregresso || a?.historicoPregresso || p?.agilHistoricoPregresso || a?.agilHistoricoPregresso || r?.historicoPregresso || "",
        antecedentes: p?.antecedentes || a?.antecedentes || p?.historicoPregresso || a?.historicoPregresso || r?.antecedentes || "",
        altura: p?.altura || a?.altura || p?.agilAltura || a?.agilAltura || p?.biotipoAltura || r?.altura || "",
        peso: p?.peso || a?.peso || p?.agilPeso || a?.agilPeso || p?.biotipoPeso || r?.peso || "",
        pressaoSistolica: p?.pressaoSistolica || a?.pressaoSistolica || r?.pressaoSistolica || "",
        pressaoDiastolica: p?.pressaoDiastolica || a?.pressaoDiastolica || r?.pressaoDiastolica || "",
        pulso: p?.pulso || a?.pulso || r?.pulso || "",
        descLimitacao: p?.descLimitacao || a?.descLimitacao || r?.descLimitacao || "",
        justificativa: p?.justificativa || a?.justificativa || p?.agilJustificativa || a?.agilJustificativa || r?.justificativa || "",
        parecer: p?.parecer || a?.parecer || r?.parecer || "",
        cid: p?.cid || a?.cid || r?.cid || "",
        diasSolicitados: p?.diasSolicitados || a?.diasSolicitados || r?.diasSolicitados || "",
        dataExpedicao: p?.dataExpedicao || a?.dataExpedicao || p?.data_expedicao || a?.data_expedicao || r?.dataExpedicao || "",
        ficha_esisla: p?.ficha_esisla || a?.fichaEsisla || a?.ficha_esisla || r?.ficha_esisla || ""
    };
}
function currentRecord(enc){return find(decodeURIComponent(enc));}

async function generateEsisla(enc, forceRefresh = false){
    window.currentEsislaEnc = enc;
    const id = decodeURIComponent(enc);
    const r = currentRecord(enc);
    if(!r){alert('Atendimento não encontrado.');return;}
    const btn = document.getElementById('generateEsislaBtn'), regen = document.getElementById('regenerateEsislaBtn'), target = document.getElementById('esislaText'), sub = document.getElementById('esislaSub');
    const overlay=document.getElementById('esislaGenerating'), gTitle=document.getElementById('esislaGeneratingTitle'), gText=document.getElementById('esislaGeneratingText'), bar=document.getElementById('esislaProgressBar');
    const stages=[1,2,3,4].map(i=>document.getElementById('esislaStage'+i)); const setStage=(n,title,text,p)=>{stages.forEach((el,i)=>{if(el){el.classList.toggle('active',i===n-1);el.classList.toggle('done',i<n-1)}});if(gTitle)gTitle.textContent=title;if(gText)gText.textContent=text;if(bar)bar.style.width=(p||10)+'%';};
    const old = btn?.textContent;
    try {
        if(btn){btn.disabled=true;btn.textContent=forceRefresh?'Refazendo ficha...':'Abrindo ficha...';} if(regen)regen.disabled=true;
        // Abre a ficha imediatamente para que o usuário veja o progresso da geração.
        setModal('esislaModal',true);
        if(overlay){overlay.classList.add('show');overlay.setAttribute('aria-busy','true');}
        setStage(1, forceRefresh ? 'Refazendo ficha e-Sisla' : 'Verificando ficha e-Sisla', forceRefresh ? 'Recriando a ficha com os dados mais recentes...' : 'Verificando se já existe ficha gerada para este atendimento...', 18);
        let full = r;
        try {
            const detailResponse = await AmbientalAuth.authFetch('/api/atendimentos/' + encodeURIComponent(id), {cache:'no-store'});
            const detailBody = await detailResponse.json().catch(()=>null);
            if (detailResponse.ok && detailBody?.success && detailBody?.data?.payload) {
                full = {...r, ...detailBody.data.payload, payload: detailBody.data.payload};
                Object.assign(r, full);
            }
        } catch(_) {}
        window.currentDetailFull = full;
        const payload = normalizeRecordPayload(full);
        payload.data_hora_atual = new Date().toISOString();
        payload.force_refresh = Boolean(forceRefresh);
        const hasExistingFicha = !forceRefresh && Boolean(payload.ficha_esisla && String(payload.ficha_esisla).trim().length > 40);
        if(forceRefresh){
            if(sub)sub.textContent='Refazendo a ficha com os dados mais recentes do servidor...';
            setStage(2,'Recriando ficha','Reprocessando os campos no formato oficial...',48);
        } else if (hasExistingFicha) {
            setStage(2,'Carregando ficha salva','Reutilizando ficha já criada neste atendimento...',65);
        } else {
            setStage(2,'Estruturando ficha','Organizando os campos no formato oficial...',48);
        }
        await new Promise(requestAnimationFrame);
        const response = await AmbientalAuth.authFetch('/api/ai/esisla',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${accessToken}`},body:JSON.stringify(payload),cache:'no-store'});
        setStage(3,'Revisando resultado','Conferindo a resposta antes de exibir...',82);
        let data={}; try{data=await response.json()}catch{}
        if(!response.ok||!data?.ficha_esisla) throw new Error(data?.detail||data?.error?.detail||data?.error?.message||'Não foi possível gerar a ficha eSisla.');
        target.value = data.ficha_esisla;
        renderEsislaBlocos(data.ficha_esisla);
        setEsislaViewMode('blocos');
        const wasReused = Boolean(data?.reused_from_atendimento || data?.meta?.reused);
        sub.textContent = 'Atendimento ' + id + ' · ' + (wasReused ? '✓ Ficha salva reutilizada (sem recriação)' : (forceRefresh ? '↻ Ficha refeita agora' : (data?.meta?.cached ? 'resultado em cache' : 'gerado agora')));
        updateEsislaStats(data.ficha_esisla);
        if (window.currentDetailFull) {
            window.currentDetailFull.ficha_esisla = data.ficha_esisla;
            if (window.currentDetailFull.aux) window.currentDetailFull.aux.fichaEsisla = data.ficha_esisla;
        }
        if (r) {
            r.ficha_esisla = data.ficha_esisla;
            if (r.aux) r.aux.fichaEsisla = data.ficha_esisla;
            if (r.payload) r.payload.ficha_esisla = data.ficha_esisla;
        }
        setStage(4,'Ficha pronta','Resultado carregado. Revise antes de transferir para o e-Sisla.',100);
        await new Promise(r=>setTimeout(r, wasReused ? 80 : 220));
        if(overlay){overlay.classList.remove('show');overlay.setAttribute('aria-busy','false');}
        setModal('esislaModal',true);
    }catch(e){if(overlay){overlay.classList.remove('show');overlay.setAttribute('aria-busy','false');}alert(e.message||'Falha ao gerar a ficha eSisla.');}
    finally{if(btn){btn.disabled=false;btn.textContent=old||'Gerar ficha eSisla';}if(regen)regen.disabled=false;}
}

const MAPA_NOMES_ESISLA = {
    'aoal': 'Aparelho Osteomuscular e Tecido Conjuntivo',
    'em': 'Exame Mental',
    'ac': 'Aparelho Circulatório',
    'ar': 'Aparelho Respiratório',
    'tcspf': 'Tecido celular subcutâneo Pele e Fâneros',
    'ad': 'Aparelho Digestivo',
    'agu': 'Aparelho Geniturinário',
    'ahp': 'Aparelho Hemolinfopoiético',
    'ae': 'Aparelho Endócrino',
    'sn': 'Sistema Nervoso',
    'os': 'Órgãos dos Sentidos',
    'outro': 'Outros'
};

function detectarSistemaExameFisico(st, aux, texto, cidCode) {
    const fullObj = window.currentDetailFull || {};
    const fullPayload = fullObj.payload || {};
    const fullAux = fullPayload.aux || fullObj.aux || {};

    const exTipo = String(
        st?.exameFisicoTipo || aux?.exameFisicoTipo ||
        st?.agilExameFisicoTipo || aux?.agilExameFisicoTipo ||
        st?.exame_fisico_tipo || aux?.exame_fisico_tipo ||
        fullPayload?.exameFisicoTipo || fullPayload?.agilExameFisicoTipo ||
        fullAux?.exameFisicoTipo || fullAux?.agilExameFisicoTipo ||
        fullObj?.exameFisicoTipo || fullObj?.exame_fisico_tipo ||
        ''
    ).trim().toLowerCase();

    const outrosSub = String(
        st?.outrosSubtipo || aux?.outrosSubtipo ||
        st?.areaExameClinico || aux?.areaExameClinico ||
        st?.outros_subtipo || aux?.outros_subtipo ||
        st?.area_exame_clinico || aux?.area_exame_clinico ||
        fullPayload?.outrosSubtipo || fullPayload?.areaExameClinico ||
        fullAux?.outrosSubtipo || fullAux?.areaExameClinico ||
        fullObj?.outrosSubtipo || fullObj?.outros_subtipo ||
        fullObj?.areaExameClinico || fullObj?.area_exame_clinico ||
        ''
    ).trim().toLowerCase();

    // 1. Acompanhante sempre usa 'Outros'
    const cUpper = String(cidCode || st?.cid || aux?.cid || fullPayload?.cid || fullObj?.cid || '').trim().toUpperCase();
    const isAcomp = cUpper.startsWith('Z76') || Boolean(st?.isAcompanhante || aux?.isAcompanhante || fullPayload?.isAcompanhante);
    if (isAcomp) return 'outro';

    // 2. Precedência Máxima: Seleção principal do médico em "Tipo de exame físico / mental" (exTipo)
    if (exTipo === 'exame mental' || (exTipo.includes('mental') && !exTipo.includes('físic') && !exTipo.includes('fisic'))) {
        return 'em';
    }
    if (exTipo.includes('osteomuscular') || exTipo.includes('conjutivo') || exTipo.includes('conjuntivo') || exTipo.includes('ortop')) {
        return 'aoal';
    }
    if (exTipo.includes('circulat') || exTipo.includes('cardio')) return 'ac';
    if (exTipo.includes('respirat') || exTipo.includes('pulmon')) return 'ar';
    if (exTipo.includes('pele') || exTipo.includes('fânero') || exTipo.includes('fanero') || exTipo.includes('subcut') || exTipo.includes('dermat')) return 'tcspf';
    if (exTipo.includes('digest') || exTipo.includes('gastr')) return 'ad';
    if (exTipo.includes('genit') || exTipo.includes('urin') || exTipo.includes('renal')) return 'agu';
    if (exTipo.includes('hemolin') || exTipo.includes('hemat')) return 'ahp';
    if (exTipo.includes('endocrin') || exTipo.includes('metabol') || exTipo.includes('diabet')) return 'ae';
    if (exTipo.includes('nervoso') || exTipo.includes('neurol')) return 'sn';
    if (exTipo.includes('sentidos') || exTipo.includes('oftalm') || exTipo.includes('otol')) return 'os';

    // 3. Subtipos selecionados quando a opção "Outros" foi detalhada pelo médico (chips das 12 áreas clínicas)
    if (outrosSub.includes('osteomuscular') || outrosSub.includes('ortop') || outrosSub.includes('conjutivo') || outrosSub.includes('conjuntivo')) return 'aoal';
    if (outrosSub.includes('mental') || outrosSub.includes('psiqui')) return 'em';
    if (outrosSub.includes('circulat') || outrosSub.includes('cardio')) return 'ac';
    if (outrosSub.includes('respirat') || outrosSub.includes('pulmon')) return 'ar';
    if (outrosSub.includes('pele') || outrosSub.includes('fânero') || outrosSub.includes('fanero') || outrosSub.includes('subcut') || outrosSub.includes('dermat')) return 'tcspf';
    if (outrosSub.includes('digest') || outrosSub.includes('gastr')) return 'ad';
    if (outrosSub.includes('genit') || outrosSub.includes('urin') || outrosSub.includes('renal')) return 'agu';
    if (outrosSub.includes('hemolin') || outrosSub.includes('hemat')) return 'ahp';
    if (outrosSub.includes('endocrin') || outrosSub.includes('metabol') || outrosSub.includes('diabet')) return 'ae';
    if (outrosSub.includes('nervoso') || outrosSub.includes('neurol')) return 'sn';
    if (outrosSub.includes('sentidos') || outrosSub.includes('oftalm') || outrosSub.includes('otol')) return 'os';

    // 4. Verificação pelo conteúdo do texto clínico registrado (exame físico padrão / achados)
    const exameFisicoTexto = (String(texto || '').match(/\(\*\)\s*Exame Físico Geral:?\s*\n\s*([\s\S]*?)(?=\n\s*(?:Descrição das Alterações|Descri[çc][ãa]o das Altera[çc][õo]es|\(\*\)Descrição da\(s\) Limitação|\(\*\)Parecer Médico|Limitação|$))/i) || [])[1]
        || String(st?.exameFisicoDescricao || aux?.exameFisicoDescricao || fullPayload?.exameFisicoDescricao || fullObj?.exameFisicoDescricao || '')
        || '';
    const efLower = exameFisicoTexto.toLowerCase();
    const exameFisicoLinha1 = (exameFisicoTexto.match(/^[^\n\r]+/i) || [])[0]?.toLowerCase() || '';

    if (exameFisicoLinha1.includes('osteomuscular') || exameFisicoLinha1.includes('conjutivo') || exameFisicoLinha1.includes('conjuntivo')) return 'aoal';
    if (exameFisicoLinha1.startsWith('exame mental') || efLower.startsWith('exame mental')) return 'em';
    if ((exameFisicoLinha1.includes('circulat') || efLower.includes('circulat')) && !efLower.includes('bom do estado geral') && !efLower.includes('ap.respirat')) return 'ac';
    if ((exameFisicoLinha1.includes('respirat') || efLower.includes('respirat')) && !efLower.includes('bom do estado geral') && !efLower.includes('cardio')) return 'ar';
    if (exameFisicoLinha1.includes('pele') || exameFisicoLinha1.includes('subcut') || efLower.includes('pele') || efLower.includes('subcut')) return 'tcspf';
    if (exameFisicoLinha1.includes('digest') || efLower.includes('digest')) return 'ad';
    if (exameFisicoLinha1.includes('genit') || efLower.includes('genit')) return 'agu';
    if (exameFisicoLinha1.includes('hemolin') || efLower.includes('hemolin')) return 'ahp';
    if (exameFisicoLinha1.includes('endocrin') || efLower.includes('endocrin')) return 'ae';
    if (exameFisicoLinha1.includes('nervoso') || efLower.includes('nervoso')) return 'sn';
    if (exameFisicoLinha1.includes('sentidos') || efLower.includes('sentidos')) return 'os';

    // Achados semiológicos específicos
    if (/(?:las[eèé]gue|paravertebral|flexo[-\s]?extens|mobilidade ativa|amplitude articular|dor [aà] palpa[çc]|tendinite|bursite|epicondil|coluna lombar|coluna cervical|joelho|ombro|cotovelo|punho|quadril|tornozelo|mmii|mmss|for[çc]a motriz|grau v)/i.test(efLower)) {
        return 'aoal';
    }
    if (/(?:humor|afeto|ansiedade|pensamento ruminante|depressiv|psicomotor|labilidade|insight|suicida|delir|alucin|f[aá]cies entristecida|hipot[íi]mic)/i.test(efLower)) {
        return 'em';
    }
    if (/(?:murm[uú]rio vesicular|mv\+|ru[íi]dos advent[íi]cios|estertores|sibilos|roncos|dispneia)/i.test(efLower)) {
        return 'ar';
    }
    if (/(?:bulhas r[íi]tmicas|rcr em 2t|bnf|sopros)/i.test(efLower)) {
        return 'ac';
    }
    if (/(?:les[ãa]o cut[âa]nea|eritema|prurido|m[aá]cula|p[aá]pula|cicatriz cir[úu]rgica|ferida operat[óo]ria)/i.test(efLower)) {
        return 'tcspf';
    }

    // 5. Fallback inteligente baseado no código CID-10
    if (cUpper) {
        if (cUpper.startsWith('F')) return 'em';
        if (cUpper.startsWith('M') || cUpper.startsWith('S') || cUpper.startsWith('T')) return 'aoal';
        if (cUpper.startsWith('I')) return 'ac';
        if (cUpper.startsWith('J')) return 'ar';
        if (cUpper.startsWith('L')) return 'tcspf';
        if (cUpper.startsWith('K')) return 'ad';
        if (cUpper.startsWith('N')) return 'agu';
        if (cUpper.startsWith('D5') || cUpper.startsWith('D6') || cUpper.startsWith('D7')) return 'ahp';
        if (cUpper.startsWith('E')) return 'ae';
        if (cUpper.startsWith('G')) return 'sn';
        if (cUpper.startsWith('H')) return 'os';
    }

    return 'outro';
}

function cleanQueixaDuracao(text) {
    if (!text) return '';
    let t = String(text);
    const intro = /(?:[Rr]efere\s+in[íi]cio\s+d[eo]\s+tratamento\s+(?:em|no\s+dia|desde|a\s+partir\s+de|h[áa])\s+[^,.;\n]+)/;
    const introDirect = /(?:[Ii]n[íi]cio\s+d[eo]\s+tratamento\s+(?:em|no\s+dia|desde|a\s+partir\s+de)\s+[^,.;\n]+)/;
    [intro, introDirect].forEach(rx => {
        t = t.replace(new RegExp('[\\.\\;]\\s*' + rx.source + '[\\.\\;]', 'gi'), '.');
        t = t.replace(new RegExp('[\\.\\;]\\s*' + rx.source + ',\\s*', 'gi'), '. ');
        t = t.replace(new RegExp(',\\s*' + rx.source + '(?=,)', 'gi'), '');
        t = t.replace(new RegExp(',\\s*' + rx.source + '[\\.\\;]', 'gi'), '.');
        t = t.replace(new RegExp('^\\s*' + rx.source + '[\\.,]?\\s*', 'gi'), '');
        t = t.replace(new RegExp('\\b' + rx.source, 'gi'), '');
    });
    // 1. Elimina repetições de "Servidor(a), não readaptado(a), de X anos, relatou não ser readaptado(a)"
    t = t.replace(/\b(Servidor|Servidora),\s*não\s+readaptad([oa]),\s*de\s+(\d+\s+anos),?\s*(?:relatou\s+não\s+ser\s+readaptad[oa],?|\(?\s*não\s+readaptad[oa]\s*\)?,?)?\s*/gi, "$1 de $3, relatou não ser readaptad$2, ");
    t = t.replace(/\b(Servidor|Servidora),\s*relatou\s+não\s+ser\s+readaptad([oa]),\s*de\s+(\d+\s+anos),?\s*/gi, "$1 de $3, relatou não ser readaptad$2, ");

    // 2. Se houver "Servidor(a) de X anos" seguido de repetições de [não readaptado / relatou não ser readaptado]
    t = t.replace(/\b(Servidor|Servidora)\s+de\s+(\d+\s+anos)(?:,?\s*(?:\(?\s*não\s+readaptad([oa])\s*\)?|relatou\s+não\s+ser\s+readaptad([oa])))+/gi, function(m, serv, anos) {
        const suff = serv.toLowerCase() === 'servidora' ? 'a' : 'o';
        return `${serv} de ${anos}, relatou não ser readaptad${suff}`;
    });

    // 2b. Concordância de gênero de readaptação com Servidor/Servidora
    t = t.replace(/(\bServidor\b[^\.\n\r]*?\brelatou\s+(?:não\s+)?ser\s+)readaptada\b/gi, "$1readaptado");
    t = t.replace(/(\bServidora\b[^\.\n\r]*?\brelatou\s+(?:não\s+)?ser\s+)readaptado\b/gi, "$1readaptada");

    // 3. Normaliza cargo e tempo: "relatou não ser readaptado(a), é [cargo] há [tempo]"
    t = t.replace(/(\b(?:Servidor|Servidora)\s+de\s+\d+\s+anos,\s*relatou\s+não\s+ser\s+readaptad[oa]),?\s*(?:,\s*)?([A-ZÁ-Úa-zà-ú\s\d/]+?\s+há\s+\d+\s+(?:anos|meses|dias))/gi, function(m, servBlock, cargoTempo) {
        let ct = String(cargoTempo || '').trim();
        if (ct.toLowerCase().startsWith('é ') || ct.toLowerCase().startsWith('e ')) {
            ct = ct.slice(2).trim();
        }
        return `${servBlock}, é ${ct}`;
    });

    // 4. Limpa qualquer duplicação de 'é é' ou 'é, é'
    t = t.replace(/\bé\s+é\b/gi, "é");
    t = t.replace(/,?\s*é\s*,\s*é\b/gi, ", é");

    // 5. Remove parênteses artificiais em "(Não relatou...)", "(Não readaptado)" e "(e não realiza...)"
    t = t.replace(/\(\s*n[ãa]o\s+readaptad([oa])\s*\)/gi, "não readaptad$1");
    t = t.replace(/\(\s*(Não relatou troca de alteração de dosagem da medicação\.?)\s*\)/gi, "$1");
    t = t.replace(/\(\s*e\s+não\s+realiza\s+(psicoterapia|fisioterapia)\.?\s*\)/gi, "e não realiza $1.");
    t = t.replace(/,\s*[Il],\s*\(?n[ãa]o\s+readaptad([oa])\)?\s*nvestigador\b/gi, ", relatou não ser readaptad$1, é Investigador");
    t = t.replace(/,\s*[Il],\s*nvestigador\b/gi, ", é Investigador");
    t = t.replace(/\b[Il],\s*\(?n[ãa]o\s+readaptad([oa])\)?\s*nvestigador\b/gi, "relatou não ser readaptad$1, é Investigador");
    t = t.replace(/,\s*[Il],\s*(?=(?:não\s+readaptad[oa]|investigador|[a-zà-ú]))/gi, ", ");

    // 6. Elimina prefixos anômalos e redundâncias: "Queixa-se de A periciada refere que", "Queixa-se de Relata que", etc.
    t = t.replace(/\b(?:Queixa-se\s+de|Refere|Relata\s+que)\s+((?:[Aa]\s+periciada|[Oo]\s+periciado|[Aa]\s+servidora|[Oo]\s+servidor)\s+(?:refere|relata|informa|apresenta|menciona|descreve|acompanha)\b)/gi, "$1");
    t = t.replace(/\bQueixa-se\s+de\s+([Aa]\s+periciada|[Oo]\s+periciado|[Aa]\s+servidora|[Oo]\s+servidor)\b/gi, "$1");
    t = t.replace(/\bQueixa-se de\s+[Rr]elata(?:r|ndo)?\s+que\b/gi, "Relata que");
    t = t.replace(/\bQueixa-se de\s+[Rr]efere(?:\s+que)?\b/gi, "Refere que");
    t = t.replace(/\bQueixa-se de\s+[Ii]nforma(?:\s+que)?\b/gi, "Informa que");
    t = t.replace(/\bQueixa-se de\s+[Qq]ueixa-se de\b/gi, "Queixa-se de");
    t = t.replace(/\bQueixa-se de\s+[Aa]presenta\b/gi, "Apresenta");

    // 6b. Corrige estrutura colada em "com queixa de periciando submetido a [procedimento] apresenta [achados]"
    t = t.replace(/\bcom\s+queixa\s+de\s+(?:o\s+|a\s+)?(?:periciand[oa]|periciad[oa]|servidor[a]?|paciente)\s+submetid[oa]\s+a\s+([^,.]+?)\s+(?:que\s+)?apresenta(?:ndo)?\s+([^.,;]+)/gi, "com queixa de $2 no pós-operatório de $1");
    t = t.replace(/\bcom\s+queixa\s+de\s+(?:o\s+|a\s+)?(?:periciand[oa]|periciad[oa]|servidor[a]?|paciente)\s+(?:apresenta(?:ndo)?|relata(?:ndo)?|refere|com)\s+/gi, "com queixa de ");

    // 7. Unifica início de tratamento/acompanhamento quebrado por ponto final indevido
    t = t.replace(/([\w\)])\.\s*[Dd]esde\s+(\d{4})\b/gi, "$1 desde $2");
    t = t.replace(/([\w\)])\.\s*[Dd]esde\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi, "$1, desde $2");
    t = t.replace(/([\w\)])\s+desde\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi, "$1, desde $2");
    t = t.replace(/(com\s+queixa\s+de\s+[^.]*?\b(?:in[íi]cio\s+da\s+gesta[çc][ãa]o|gesta[çc][ãa]o|sangramento\s+uterino|acidente\s+de\s+tr[âa]nsito|contus[ãa]o|entorse|fratura|p[óo]s-operat[óo]rio\s+de\s+(?:vasectomia|blefaroplastia))[^.]*?),\s*desde\s+\d{4}(?=\s*\.)/gi, "$1");
    t = t.replace(/,\s*,+/g, ",");

    // 8. Normalização de perícia de Acompanhante (CID Z76.3 / dependente enfermo)
    t = t.replace(/,\s*com\s+queixa\s+de\s+[Aa]companhamento\s+de\s+pessoa\s+doente,?\s*/gi, ", para acompanhamento de familiar enfermo, ");
    t = t.replace(/,\s*com\s+queixa\s+de\s+[Aa]companhante\b,?\s*/gi, ", para acompanhamento de familiar enfermo, ");
    if (/\b(?:acompanha\s+a\s+filha|familiar\s+enfermo|pessoa\s+doente|dependente)\b/i.test(t)) {
        t = t.replace(/\bNegou\s+uso\s+de\s+medica[çc][õo]es\./gi, /servidora/i.test(t) ? "A servidora negou uso de medicações próprias de uso contínuo." : "O servidor negou uso de medicações próprias de uso contínuo.");
    }

    // 8b. Eliminação de barras de gênero, O(A) servidor(a) e redundância (familiar dependente)
    const isFemQueixa = /\b(?:Servidora|Professora|mulher|feminino)\b/i.test(t);
    t = t.replace(/\bfamiliar\/dependente(?:\s+enfermo)?\s*\((?:familiar\s+dependente|dependente)\)/gi, "familiar dependente");
    t = t.replace(/\bfamiliar\/dependente\b/gi, "familiar dependente");
    t = t.replace(/\bO\(A\)\s+servidor\(a\)(?!\w)/gi, isFemQueixa ? "A servidora" : "O servidor");
    t = t.replace(/\bo\(a\)\s+servidor\(a\)(?!\w)/gi, isFemQueixa ? "a servidora" : "o servidor");
    t = t.replace(/\bpericiad[oa]\(a\)(?!\w)/gi, isFemQueixa ? "periciada" : "periciado");
    t = t.replace(/\bpericiado\(a\)(?!\w)/gi, isFemQueixa ? "periciada" : "periciado");
    t = t.replace(/\bpericiando\(a\)(?!\w)/gi, isFemQueixa ? "periciada" : "periciado");
    t = t.replace(/\bservidor\(a\)(?!\w)/gi, isFemQueixa ? "servidora" : "servidor");
    t = t.replace(/\bao\(à\)(?!\w)/gi, isFemQueixa ? "à" : "ao");

    // 9. Concordância de gênero do cargo quando a periciada for mulher ("Servidora")
    if (/\bServidora\b/i.test(t)) {
        t = t.replace(/\bé\s+(?:PEB|Peb)\s+([IVXLCDM]+)\b/gi, "é Professora de Educação Básica $1");
        t = t.replace(/\bé\s+(?:PEB|Peb)\b/gi, "é Professora de Educação Básica");
        t = t.replace(/\bé\s+Supervisor\s+Educacional\b/gi, "é Supervisora Educacional");
        t = t.replace(/\bé\s+Supervisor\b/gi, "é Supervisora");
        t = t.replace(/\bé\s+Coordenador\s+Pedag[óo]gico\b/gi, "é Coordenadora Pedagógica");
        t = t.replace(/\bé\s+Orientador\s+Educacional\b/gi, "é Orientadora Educacional");
        t = t.replace(/\bé\s+T[ée]cnico\s+(?:de|em)\s+Enfermagem\b/gi, "é Técnica de Enfermagem");
        t = t.replace(/\bé\s+T[ée]cnico\s+em\s+Administra[çc][ãa]o\b/gi, "é Técnica em Administração");
        t = t.replace(/\bé\s+T[ée]cnico\s+de\b/gi, "é Técnica de");
        t = t.replace(/\bé\s+T[ée]cnico\s+em\b/gi, "é Técnica em");
        t = t.replace(/\bé\s+T[ée]cnico\b/gi, "é Técnica");
        t = t.replace(/\bé\s+Professor\s+(?:de\s+)?Educa[çc][ãa]o\s+B[áa]sica(?:\s+([IVXLCDM]+))?\b/gi, "é Professora de Educação Básica $1");
        t = t.replace(/\bé\s+Professor\s+de\s+Ensino\s+Fundamental\s+e\s+M[ée]dio\b/gi, "é Professora de Ensino Fundamental e Médio");
        t = t.replace(/\bé\s+Professor\b/gi, "é Professora");
        t = t.replace(/\bé\s+Enfermeiro\b/gi, "é Enfermeira");
        t = t.replace(/\bé\s+M[ée]dico\b/gi, "é Médica");
        t = t.replace(/\bé\s+Psic[óo]logo\b/gi, "é Psicóloga");
        t = t.replace(/\bé\s+Diretor\b/gi, "é Diretora");
        t = t.replace(/\bé\s+Coordenador\b/gi, "é Coordenadora");
        t = t.replace(/\bé\s+Inspetor\b/gi, "é Inspetora");
        t = t.replace(/\bé\s+Investigador\b/gi, "é Investigadora");
        t = t.replace(/\bé\s+Escriv[ãa]o\b/gi, "é Escrivã");
        t = t.replace(/\bé\s+Assistente\s+T[ée]cnico\b/gi, "é Assistente Técnica");
        t = t.replace(/\bé\s+Auxiliar\s+T[ée]cnico\b/gi, "é Auxiliar Técnica");
        t = t.replace(/\bé\s+Oficial\s+Administrativo\b/gi, "é Oficial Administrativa");
    } else {
        t = t.replace(/\bé\s+(?:PEB|Peb)\s+([IVXLCDM]+)\b/gi, "é Professor de Educação Básica $1");
        t = t.replace(/\bé\s+(?:PEB|Peb)\b/gi, "é Professor de Educação Básica");
    }

    // Preposição em "Professor(a) Educação Básica" -> "Professor(a) de Educação Básica"
    t = t.replace(/\bé\s+(Professora?)\s+Educa[çc][ãa]o\s+B[áa]sica(?:\s+([IVXLCDM]+))?\b/gi, "é $1 de Educação Básica $2");

    // Concordância nominal e ortografia clínica em Queixa e Duração
    t = t.replace(/\baltera[çc][ãa]o\s+([a-zà-ú]+ais)\b/gi, "alterações $1");
    t = t.replace(/\baltera[çc][ãa]o\s+press[óo]rico\b/gi, "alteração pressórica");
    t = t.replace(/\bmenos\s+valia\b/gi, "menos-valia");
    t = t.replace(/\bdor\s+de\s+edema\b/gi, "dor e edema");
    t = t.replace(/\bp[áa]lpebrais\b/gi, "palpebrais");
    t = t.replace(/\bp[áa]lpebral\b/gi, "palpebral");
    t = t.replace(/\bdor\s+em\s+lombar\b/gi, "dor em região lombar");
    t = t.replace(/\bdevido\s+c[âa]ncer\b/gi, "devido a câncer");
    t = t.replace(/\bdevido\s+neoplasia\b/gi, "devido a neoplasia");
    t = t.replace(/\bimuno\s+biol[óo]gic([oa]s?)\b/gi, "imunobiológic$1");
    t = t.replace(/\bpembrulizumab([e]?)\b/gi, "pembrolizumab$1");
    t = t.replace(/\bmal\s+estar\b/gi, "mal-estar");
    t = t.replace(/\bbem\s+estar\b/gi, "bem-estar");

    // Normalização de "Periciando(a) apresenta" e frases formais de limitação vazadas na Queixa e Duração
    t = t.replace(/([\.\;]\s*)(?:[Oo]\s+|[Aa]\s+)?Periciand[oa]\s+apresenta\b/gi, "$1Refere");
    t = t.replace(/Refere\s+([^.]+)\.\s*Apresenta\s+limita[çc][ãa]o\s+funcional\s+tempor[áa]ria\s+para\s+([^,]+),\s*em\s+decorr[êe]ncia\s+de\s+([^,.]+?)(?:\s+ap[óo]s\s+[^,.]+)?(?:,\s*comprometendo\s+[^.]+)?\./gi, "Refere $1, $3, com limitação para $2.");
    t = t.replace(/([\.\;]\s*)Apresenta\s+limita[çc][ãa]o\s+funcional\s+tempor[áa]ria\s+para\s+([^,]+),\s*em\s+decorr[êe]ncia\s+de\s+([^,.]+?)(?:\s+ap[óo]s\s+[^,.]+)?(?:,\s*comprometendo\s+[^.]+)?\./gi, "$1Refere $3, com limitação para $2.");

    t = t.replace(/([\.\;]\s*)Apresenta\s+(dor\s+e\s+edema|dor|edema)\s+em\s+([^.]+)\./gi, function(m, punct, achado, local, offset) {
        const prefixText = t.slice(0, offset).toLowerCase();
        if (prefixText.includes(String(local || "").trim().toLowerCase())) {
            return `${punct}Refere ${achado} no local afetado.`;
        }
        return `${punct}Refere ${achado} em ${String(local || "").trim()}.`;
    });

    // Deduplicação de sintomas repetidos entre "com queixa de [X]." e "Refere [Y]."
    t = t.replace(/(com\s+queixa\s+de\s+[^.]+\.)(\s*Refere\s+)([^.]+)\./gi, function(m, queixaPart, referePrefix, sintomasPart) {
        const rawItems = sintomasPart.split(/,\s*|\s+e\s+/).map(x => x.trim()).filter(Boolean);
        if (rawItems.length >= 4) {
            const qLow = queixaPart.toLowerCase();
            const filtered = rawItems.filter(it => !(it.length >= 4 && qLow.includes(it.toLowerCase())));
            if (filtered.length >= 3 && filtered.length < rawItems.length) {
                const joined = filtered.slice(0, -1).join(", ") + " e " + filtered[filtered.length - 1];
                return `${queixaPart}${referePrefix}${joined}.`;
            }
        }
        return m;
    });

    // Deduplicação de sintomas repetidos ou sinônimos no mesmo parágrafo
    if (/dor\s+na\s+regi[ãa]o\s+cervical|cervicalgia/i.test(t) && /dor\s+(?:em|no)\s+ouvido/i.test(t)) {
        t = t.replace(/,\s*cervicalgia,\s*dor\s+em\s+ouvido\b/gi, "");
    }
    if (/taquicardia/i.test(t)) {
        t = t.replace(/(\btaquicardia\b[^.]+?),\s*taquicardia\b/gi, "$1");
    }
    if (/dorm[êe]ncia\s+nas\s+m[ãa]os\s+e\s+bra[çc]os/i.test(t)) {
        t = t.replace(/,\s*parestesia\s+em\s+m[ãa]os\s+e\s+bra[çc]os\b/gi, "");
    }
    if (/dor\s+difusa\s+pelo\s+corpo/i.test(t)) {
        t = t.replace(/,\s*dor\s+generalizada\b/gi, "");
    }

    // 10. Concordância de tempo de serviço singular ("há 1 anos" -> "há 1 ano")
    t = t.replace(/\bh[áa]\s+1\s+anos\b/gi, "há 1 ano");
    t = t.replace(/\bh[áa]\s+1\s+meses\b/gi, "há 1 mês");
    t = t.replace(/\bh[áa]\s+1\s+dias\b/gi, "há 1 dia");

    // 11. Normaliza posologias aglutinadas (ex.: "10 mgdia" -> "10 mg/dia")
    t = t.replace(/\b(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|ml|gotas?|comp(?:rimidos?)?|c[áa]ps(?:ulas?)?)dia\b/gi, "$1 $2/dia");
    t = t.replace(/\b(mg|g|mcg|ml)dia\b/gi, "$1/dia");
    t = t.replace(/\b(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|ml)(?:\/)?(noite|m[eê]s|semana)\b/gi, "$1 $2/$3");

    // 12. Limpa barras soltas em dosagens (ex.: "1 g/", "50 mg/") sem tocar em posologia diária como /dia
    t = t.replace(/\b(\d+(?:[.,]\d+)?\s*(?:g|mg|mcg|ml))\s*\/(?=\s*(?:,|[.]|\(|\bse\s+dor\b|\bpara\b|\bsob\b|$))/gi, "$1");
    t = t.replace(/\b(\d+(?:[.,]\d+)?\s*(?:g|mg|mcg|ml))\s*\/(?=\s*$)/gi, "$1");

    // 13. Ajustes de dosagem:
    // Consolidação de múltiplas medicações sem dosagem ("Em uso de A, não informado sua dosagem, B, não informado sua dosagem..." -> "Em uso de A, B, e não foram informadas suas dosagens.")
    t = t.replace(/([Ee]m uso de\s+)([^.]+?)\./g, function(match, prefix, content) {
        const uninformedPat = /,?\s*n[ãa]o\s+informad[oa]\s+sua\s+dosagem\b/gi;
        const matches = content.match(uninformedPat);
        if (matches && matches.length >= 2) {
            const hasOtherDose = /\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|ml)\b/i.test(content);
            if (!hasOtherDose) {
                const cleaned = content.replace(uninformedPat, "");
                const rawItems = cleaned.split(/[,e]\s+/).map(x => x.trim()).filter(Boolean);
                const items = rawItems.map(x => x.length > 1 ? x.charAt(0).toUpperCase() + x.slice(1) : x.toUpperCase());
                let medsList = "";
                if (items.length >= 2) {
                    medsList = items.slice(0, -1).join(", ") + " e " + items[items.length - 1];
                } else if (items.length === 1) {
                    medsList = items[0];
                } else {
                    medsList = cleaned.trim();
                }
                return `${prefix}${medsList}, e não foram informadas suas dosagens.`;
            } else {
                let cleaned = content.replace(uninformedPat, "");
                cleaned = cleaned.replace(/\s*,\s*/g, ", ").replace(/,\s*e\b/g, " e").replace(/\b(e\s+)+/g, "e ").replace(/\s{2,}/g, " ").replace(/^[, ]+|[, ]+$/g, "");
                return `${prefix}${cleaned}, e não foram informadas suas dosagens.`;
            }
        }
        return match;
    });

    // Duplicação "não informado sua dosagem Não informada"
    t = t.replace(/\bn[ãa]o\s+informad[oa]\s+sua\s+dosagem\s+[Nn][ãa]o\s+informad[oa]\.?/gi, "não informada sua dosagem.");
    t = t.replace(/\bn[ãa]o\s+informad[oa]\s+sua\s+dosagem\s+[Nn][ãa]o\s+informad[oa]\b/gi, "não informada sua dosagem");

    // Normaliza "não informado sua dosagem Analgesia" -> "não informado sua dosagem, para analgesia"
    t = t.replace(/\bn[ãa]o\s+informad[oa]\s+sua\s+dosagem\s+Analgesia\b/gi, "não informado sua dosagem, para analgesia");
    t = t.replace(/,\s*Analgesia\b/gi, ", para analgesia");

    // Pontuação adequada antes de nova medicação e antes de posologia
    t = t.replace(/(não informad[oa]\s+sua\s+dosagem)\s+e\s+([A-ZÁ-Ú])/g, "$1, e $2");
    t = t.replace(/(não informad[oa]\s+sua\s+dosagem)\s+(a\s+cada\s+\d+|de\s+\d+\/\d+h|se\s+dor|\d+x\s+ao\s+dia|para\s+analgesia)/gi, "$1, $2");

    // 14. Remoção de contradição de troca/alteração de dosagem quando o servidor relatou aumento/alteração
    const temRelatoAltDose = /\b(?:aumentad[oa]|aumento|ajustad[oa]|ajuste|reduzid[oa]|redução|reducao|trocad[oa]|troca)\s+(?:a\s+medica[çc][ãa]o|de\s+medica[çc][ãa]o|d[ae]\s+dosagem|d[ae]\s+dose)\b|\b(?:foi\s+aumentada\s+a\s+medica[çc][ãa]o|aumentou\s+a\s+dose|trocou\s+a\s+medica[çc][ãa]o|ajustou\s+a\s+dose)\b|\b(?:recentemente\s+foi\s+aumentada\s+a\s+medica[çc][ãa]o)\b/i.test(t);
    if (temRelatoAltDose) {
        t = t.replace(/\s*\(?\s*Não relatou troca de alteração de dosagem da medicação\.?\s*\)?\s*/gi, " ");
    }

    // 14b. Quando não há menção a uso ou negação de medicações mas consta "Não relatou troca de alteração de dosagem da medicação.", insere "Negou uso de medicações."
    const hasAntineoplasicoDuracao = /\b(?:infus[ãa]o|infus[õo]es|imunobiol[óo]gic[oa]|imunoterapia|quimioterapia|quimioter[áa]pic[oa]|antineopl[áa]sic[oa]|bevacizumab[e]?|pembrolizumab[e]?|trastuzumab[e]?|rituximab[e]?)\b/i.test(t);
    if (hasAntineoplasicoDuracao) {
        t = t.replace(/\b(?:[Aa]\s+servidora|[Oo]\s+servidor)?\s*Negou\s+uso\s+de\s+medica[çc][õo]es(?:\s+pr[óo]prias\s+de\s+uso\s+cont[íi]nuo)?\.?\s*/gi, "");
    } else if (/\bcom\s+queixa\s+de\b/i.test(t) && /Não relatou troca de alteração de dosagem da medicação/i.test(t)) {
        if (!/\b(?:Em\s+uso\s+de|fez\s+uso\s+de|faz\s+uso\s+de|uso\s+de\s+medica[çc][õo]es|Negou\s+uso\s+de\s+medica[çc][õo]es|negou\s+uso\s+de\s+medica[çc][õo]es)\b/i.test(t)) {
            t = t.replace(/(Não relatou troca de alteração de dosagem da medicação\.?)/i, "Negou uso de medicações. $1");
        }
    }

    t = t.replace(/(?:\bNegou\s+uso\s+de\s+medica[çc][õo]es\.?\s*){2,}/gi, "Negou uso de medicações. ");
    t = t.replace(/(\b(?:A\s+servidora|O\s+servidor)\s+negou\s+uso\s+de\s+medica[çc][õo]es\s+pr[óo]prias\s+de\s+uso\s+cont[íi]nuo\.?\s*){2,}/gi, "$1");

    // 15. Elimina repetição de "com queixa de ... Queixa-se de"
    if (/\bcom\s+queixa\b/i.test(t)) {
        t = t.replace(/([\.\;]\s*)[Qq]ueixa-se\s+de\s+(?!des[âa]nimo\b)/g, "$1Refere ");
    }

    // Artigo definido antes de menções a periciado(a) ou servidor(a)
    t = t.replace(/([\.\;]\s*)Periciado\s+refere\b/g, "$1O periciado refere");
    t = t.replace(/([\.\;]\s*)Periciada\s+refere\b/g, "$1A periciada refere");
    t = t.replace(/([\.\;]\s*)Servidor\s+refere\b/g, "$1O servidor refere");
    t = t.replace(/([\.\;]\s*)Servidora\s+refere\b/g, "$1A servidora refere");

    // 16. Jargões, grafia de medicamentos, parênteses e crase
    t = t.replace(/\bsensibilidade\s+a\s+luz\b/gi, "sensibilidade à luz");
    t = t.replace(/\(\s*Uso\s+sintom[áa]tico\s+s\/n\s*\)/gi, "(uso sintomático se necessário)");
    t = t.replace(/\(\s*Sintom[áa]tico\s*\)/gi, "(para alívio sintomático)");
    t = t.replace(/\bs\/n\b/gi, "se necessário");
    t = t.replace(/\(\s*e\s+cessou\s+terapia[^\)]*\.?\s*\)/gi, (m) => m.replace(/[\(\)]/g, '').trim() + '.');
    t = t.replace(/\blaser\s+terapia\b/gi, "laserterapia");
    t = t.replace(/\bceacalm\b/gi, "Seacalm");
    t = t.replace(/\bultragestan\b/gi, "Utrogestan");
    t = t.replace(/\bdoxaciclina\b/gi, "Doxiciclina");
    t = t.replace(/\bclonazepan\b/gi, "Clonazepam");
    t = t.replace(/\bamoxacilina\b/gi, "Amoxicilina");
    t = t.replace(/\bbevacizumab[e]?\b/gi, "bevacizumabe");
    t = t.replace(/\bpembrolizumab[e]?\b|\bpembrulizumab[e]?\b/gi, "pembrolizumabe");
    t = t.replace(/\btrastuzumab[e]?\b/gi, "trastuzumabe");
    t = t.replace(/\bConforme\s+prescri[çc][ãa]o\s+m[ée]dica\s+Mensal\b/gi, "conforme prescrição médica mensal");

    // Deduplicação de terapia antineoplásica ou indicação repetida com prescrição mensal
    t = t.replace(/(\bEm\s+uso\s+de\s+[A-Za-zÀ-ÿ]+)\s+conforme\s+prescri[çc][ãa]o\s+m[ée]dica\s+mensal,\s*para\s+terapia\s+antineopl[áa]sica,?\s*e\s+([A-Za-zÀ-ÿ]+)\s+conforme\s+prescri[çc][ãa]o\s+m[ée]dica\s+mensal,\s*para\s+terapia\s+antineopl[áa]sica\b/gi, "$1 e $2 conforme prescrição médica mensal, para terapia antineoplásica");
    t = t.replace(/(\bpara\s+terapia\s+antineopl[áa]sica)\s+e\s+([^,.]+?)\s+para\s+terapia\s+antineopl[áa]sica\b/gi, "e $2 $1");

    // Deduplicação de indicação medicamentosa repetida (ex: "A para tratamento psiquiátrico e B para tratamento psiquiátrico" -> "A e B para tratamento psiquiátrico")
    t = t.replace(/(\bpara\s+tratamento\s+([a-zà-ú]+))\s+e\s+([^,.]+?)\s+para\s+tratamento\s+\2\b/gi, "e $3 $1");
    // Deduplicação de especificação redundante na alteração de dose quando já informada na medicação
    t = t.replace(/,\s*com\s+(aumento|redução|reducao|ajuste|troca)\s+de\s+dose\s+recente\s+no\s+tratamento\s+([a-zà-ú]+)/gi, ", com $1 de dose recente");
    t = t.replace(/,\s*para\s+analgesia\s+e\s+/gi, ", para analgesia, e ");

    t = t.replace(/\s{2,}/g, ' ');
    t = t.replace(/\.\s*\./g, '.');
    t = t.replace(/,\s*,+/g, ',');
    t = t.replace(/\s*,\s*\./g, '.');
    t = t.replace(/\.\s*,/g, '.');
    t = t.replace(/\.\s*([a-zà-ú])/gi, (m, c) => '. ' + c.toUpperCase());
    return t.trim();
}

function cleanAntecedentesMorbidos(text) {
    if (!text) return '';
    let t = String(text);
    // Remove qualquer vazamento acidental de cabeçalhos de atestado ou 'Em anexo'
    t = t.replace(/(?:^|\r?\n)\s*Atestado\/Relat[óo]rio[^\n\r]*[\s\S]*$/gi, '');
    t = t.replace(/(?:^|\r?\n)\s*Atestados?[^\n\r]*[\s\S]*$/gi, '');
    t = t.replace(/\bEm anexo\.?\b/gi, '');
    t = t.replace(/[\s\.\,]*\b(?:recebendo|recebeu|tendo\s+recebido|sendo\s+concedido|[Vv]em\s+com|com)?\s*(?:um\s+|novo\s+)?atestado(?:\s+m[ée]dico)?\s+de\s+(?:mais\s+)?(?:\d+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|noventa)\s+dias?\b[^\.\n\r]*[\.\,]?/gi, '.');
    t = t.replace(/[\s,;]*\b(?:e\s+)?(?:o\s+|a\s+)?m[ée]dico(?:\s+assistente)?\s+(?:o|a)\s+afastou\s+por\s+\d+\s+dias?[^\.\n\r]*/gi, "");
    t = t.replace(/[\s,;]*\b(?:e\s+)?(?:com\s+)?afastament[oa]\s+(?:m[ée]dic[oa]\s+)?(?:de|por)\s+\d+\s+dias?[^\.\n\r]*/gi, "");
    t = t.replace(/[\s,;]*\b(?:e\s+)?(?:com\s+)?afastad[oa]\s+por\s+\d+\s+dias?[^\.\n\r]*/gi, "");
    t = t.replace(/\s+([\.\,;:])/g, '$1');
    t = t.replace(/\.{2,}/g, '.');
    t = t.replace(/^[\s\.\,;]+/, '');
    t = t.replace(/[\s\.\,;]+$/, '.');
    t = t.replace(/\s{2,}/g, ' ');
    t = t.trim();

    // Prefixos anômalos em antecedentes mórbidos
    t = t.replace(/\bRefere\s+hist[óo]rico\s+relacionado\s+(?:a|de|ao|à)\s+(?:Alega\s+ter\s+apresentado|Relata\s+ter\s+apresentado|Refere\s+ter\s+apresentado)\b/gi, "Refere histórico de");
    t = t.replace(/\bRefere\s+hist[óo]rico\s+relacionado\s+(?:a|de|ao|à)\s+(?:Alega\s+que|Relata\s+que|Refere\s+que)\b/gi, "Relata que");
    t = t.replace(/\bRefere\s+hist[óo]rico\s+relacionado\s+(?:a|de|ao|à)\s+Alega\s+ter\b/gi, "Refere histórico de");
    t = t.replace(/\bRefere\s+hist[óo]rico\s+relacionado\s+(?:a|de|ao|à)\s+(?:[Aa]\s+|[Oo]\s+)?(?:[Pp]ericiand[oa]|[Pp]ericiad[oa]|[Ss]ervidor[a]?|[Pp]aciente)\s+submetid[oa]\s+a\s+([a-zà-úç\s]+?)\s+apresenta(?:ndo)?\b/gi, "Refere histórico de pós-operatório de $1, apresentando");
    t = t.replace(/\bRefere\s+hist[óo]rico\s+relacionado\s+(?:a|de|ao|à)\s+(?:[Aa]\s+|[Oo]\s+)?(?:[Pp]ericiand[oa]|[Pp]ericiad[oa]|[Ss]ervidor[a]?|[Pp]aciente)\s+(?:est[áa]\s+em|se\s+encontra\s+em|em\s+tratamento|diagnosticad[oa]|apresenta|relata|refere|queixa-se\s+de|informa)\b/gi, "Refere histórico de");
    t = t.replace(/\bRefere\s+hist[óo]rico\s+relacionado\s+(?:a|de|ao|à)\s+(?:est[áa]\s+em|se\s+encontra\s+em)\b/gi, "Refere histórico de");
    t = t.replace(/\bRefere\s+hist[óo]rico\s+relacionado\s+(?:a|de|ao|à)\s+(?:p[óo]s-operat[óo]rio\s+de\s+)?(blefaroplastia|vasectomia|mastopexia|histerectomia|colecistectomia|artroplastia|herniorrafia|apendicectomia|cirurgia[^\s,]*)\s+apresenta(?:ndo)?\b/gi, "Refere histórico de pós-operatório de $1, apresentando");
    t = t.replace(/\bRefere\s+hist[óo]rico\s+relacionado\s+de\s+([a-zà-úç]+)\s+apresenta(?:ndo)?\b/gi, "Refere histórico de $1, apresentando");
    t = t.replace(/\bdor\s+e\s+rangendo\s+os\s+dentes\b/gi, "dor e bruxismo (ranger de dentes)");

    // Correções gramaticais, clínicas e de pontuação de anotações brutas nos antecedentes
    t = t.replace(/\bdevido\s+c[âa]ncer\b/gi, "devido a câncer");
    t = t.replace(/\bdevido\s+neoplasia\b/gi, "devido a neoplasia");
    t = t.replace(/\bimuno\s+biol[óo]gic([oa]s?)\b/gi, "imunobiológic$1");
    t = t.replace(/\bpembrulizumab([e]?)\b/gi, "pembrolizumab$1");
    t = t.replace(/\bmal\s+estar\b/gi, "mal-estar");
    t = t.replace(/\bbem\s+estar\b/gi, "bem-estar");
    t = t.replace(/\btem\s+astenia\s*,\s*tontura\s*,\s*mal-estar\s*,\s*inapet[êe]ncia\b/gi, "apresenta astenia, tontura, mal-estar e inapetência");
    t = t.replace(/\baltera[çc][ãa]o\s+([a-zà-ú]+ais)\b/gi, "alterações $1");
    t = t.replace(/\baltera[çc][ãa]o\s+press[óo]rico\b/gi, "alteração pressórica");
    t = t.replace(/\bp[áa]lpebrais\b/gi, "palpebrais");
    t = t.replace(/\bp[áa]lpebral\b/gi, "palpebral");
    t = t.replace(/\bsintomas\s+depressivos,\s*amn[ée]sia\s+sendo\b/gi, "sintomas depressivos e amnésia, sendo");
    t = t.replace(/([^\s,;])\s+\bsendo\s+(avaliad[oa]|acompanhad[oa]|atendid[oa]|encaminhad[oa])\b/gi, "$1, sendo $2");
    t = t.replace(/(psiquiatra|m[ée]dico|especialista|ortopedista|neurologista)\s+em\s+uso\s+de\b/gi, "$1, em uso de");
    t = t.replace(/,\s*recebeu\s+prescri[çc][ãa]o\s+de\b/gi, ", tendo recebido prescrição de");
    t = t.replace(/\b(Servidora\s+gestante\s+de\s+\d+\s+semanas)\s+apresentou\b/gi, "$1, apresentou");
    t = t.replace(/\bpassou\s+em\s+atendimento\s+m[ée]dico\b/gi, "passou por atendimento médico");
    t = t.replace(/\bpassou\s+por\s+atendimento\s+m[ée]dico\s+e\s+foi\s+prescrit([oa])\b/gi, "passou por atendimento médico, sendo prescrit$1");
    t = t.replace(/([^\s,;])\s+\bpassou\s+por\s+atendimento\s+m[ée]dico\b/gi, "$1, passou por atendimento médico");
    t = t.replace(/(\bpassou\s+por\s+atendimento\s+m[ée]dico)\s+fez\s+uso\s+de\b/gi, "$1, fez uso de");
    t = t.replace(/\s*\bprescrit[oa]s?\s+por\s+m[ée]dico\b/gi, "");
    t = t.replace(/\b(sendo\s+prescrit[oa]|foi\s+prescrit[oa])\s+([^,.;]+?)\s+por\s+m[ée]dico\b/gi, "$1 $2");
    t = t.replace(/^\s*Servidor\s+relata\s+que\b/i, "O servidor relata que");
    t = t.replace(/^\s*Servidora\s+relata\s+que\b/i, "A servidora relata que");
    t = t.replace(/\bn[ãa]o\s+se\s+lembra\s+do\s+ocorrido\s+em\s+relat[óo]rio\s+m[ée]dico\s+consta\b/gi, "não se lembra do ocorrido; em relatório médico consta");
    t = t.replace(/,\s*foi\s+atendid([oa])\s+em\s+urg[êe]ncia\s+e\s+emerg[êe]ncia\s+e\s+ficou\s+(um\s+dia|\d+\s+dias?)\s+internad([oa])\b/gi, ", tendo sido atendid$1 em serviço de urgência e emergência, onde permaneceu $2 internad$3");
    t = t.replace(/\bRefere\s+que\s+ap[óo]s\s+([a-zà-úç]+)\s+permanece\b/gi, "Refere que, após $1, permanece");
    t = t.replace(/\bpor[ée]m\s+n[ãa]o\s+apresenta\s+receitas?\b/gi, "porém sem apresentação de receituário médico no ato pericial");
    t = t.replace(/\bfechando\s+port[ãa]o\b/gi, "fechando o portão");
    t = t.replace(/,\s*nesta\s+hora\s+/gi, ", momento em que ");
    t = t.replace(/\s+e\s+est[áa]\s+com\s+(o\s+quirod[áa]ctilo\s+imobilizado)\b/gi, ", permanecendo com $1");

    // Padronização ortográfica e capitalização de fármacos em Antecedentes Mórbidos
    t = t.replace(/\bultragestan\b|\butrogestan\b/gi, "Utrogestan");
    t = t.replace(/\bdoxaciclina\b|\bdoxiciclina\b/gi, "Doxiciclina");
    t = t.replace(/\bclonazepan\b|\bclonazepam\b/gi, "Clonazepam");
    t = t.replace(/\bamoxacilina\b|\bamoxicilina\b/gi, "Amoxicilina");
    t = t.replace(/\bduloxetina\b/gi, "Duloxetina");
    t = t.replace(/\bl[íi]tio\b/gi, "Lítio");
    t = t.replace(/\bbupropiona\b/gi, "Bupropiona");
    t = t.replace(/\balivium\b/gi, "Alivium");
    t = t.replace(/\bdiprospan\b/gi, "Diprospan");
    t = t.replace(/\bdipirona\b/gi, "Dipirona");
    t = t.replace(/\btramal\b|\btramadol\b/gi, "Tramadol");
    t = t.replace(/\bbevacizumab[e]?\b/gi, "bevacizumabe");
    t = t.replace(/\bpembrolizumab[e]?\b|\bpembrulizumab[e]?\b/gi, "pembrolizumabe");

    t = t.replace(/(\b(?:em\s+uso\s+de|fez\s+uso\s+de|prescri[çc][ãa]o\s+de|sendo\s+prescrit[oa])\s+)([A-ZÁ-Ú][a-zà-ú]+(?:,\s*[A-ZÁ-Ú][a-zà-ú]+)+)(?=\s*[\.\,;]|$)/g, function(m, prefix, medsStr) {
        if (!medsStr.includes(" e ") && medsStr.includes(",")) {
            const parts = medsStr.split(",").map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                return prefix + parts.slice(0, -1).join(", ") + " e " + parts[parts.length - 1];
            }
        }
        return m;
    });

    if (t === '.' || !t) return '';
    const fraseNegaCompleta = "Nega antecedentes mórbidos relevantes, cirurgias prévias, neoplasias ou hábitos tabágicos e etilistas.";
    if (t === "Nega" || t === "Nega." || /^nega\.?$/i.test(t) || t.toLowerCase() === "não refere" || t.toLowerCase() === "nao refere" || t.toLowerCase() === "sem antecedentes") {
        return fraseNegaCompleta;
    }

    // Normalização de posologias aglutinadas
    t = t.replace(/\b(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|ml|gotas?|comp(?:rimidos?)?|c[áa]ps(?:ulas?)?)dia\b/gi, "$1 $2/dia");
    t = t.replace(/\b(mg|g|mcg|ml)dia\b/gi, "$1/dia");
    t = t.replace(/\b(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|ml)(?:\/)?(noite|m[eê]s|semana)\b/gi, "$1 $2/$3");

    const low = t.toLowerCase();
    const lowAfirmativo = low.replace(/\b(?:nega|sem|n[ãa]o\s+refere|n[ãa]o\s+apresenta)\b[^\.\n\r]*/gi, "");
    const temCancer = /\b(?:c[âa]ncer|carcinoma|tumor|tumores|oncol[óo]gic[oa]|linfoma|leucemia|melanoma|met[áa]stase|met[áa]stases|metast[áa]tic[oa]|sarcoma|antineopl[áa]sic[oa]|bevacizumab[e]?|pembrolizumab[e]?|trastuzumab[e]?|rituximab[e]?)\b/i.test(lowAfirmativo) || /\bneopl[áa]s(?:ia|ias|ic[oa])\b/i.test(lowAfirmativo);
    const temCirurgias = /\b(?:cirurgias|cirurgia|cir[úu]rgic[oa]|p[óo]s-operat[óo]rio|operad[oa]|mastectomia|histerectomia|artroplastia|colecistectomia|apendicectomia|herniorrafia|vasectomia|blefaroplastia|tenorrafia)\b/i.test(lowAfirmativo);
    const temNeoplasias = temCancer || /\bneopl[áa]s(?:ia|ias)\b/i.test(low);
    const temCirurgiasMencao = temCirurgias || /\bcirurg(?:ia|ias)\b/i.test(low);
    const temNegaDemais = low.includes("nega demais");

    // Se o paciente tem câncer/neoplasia, remove menção contraditória de negar neoplasias
    if (temCancer) {
        t = t.replace(/,\s*cirurgias\s+pr[ée]vias\s+e\s+neoplasias\.?/gi, " e cirurgias prévias.");
        t = t.replace(/,\s*neoplasias\s+e\s+cirurgias\s+pr[ée]vias\.?/gi, " e cirurgias prévias.");
        t = t.replace(/\s+e\s+neoplasias\.?/gi, ".");
        t = t.replace(/,\s*neoplasias\b/gi, "");
        t = t.replace(/\bNega\s+demais\s+antecedentes\s+m[óo]rbidos\s+relevantes,\s*cirurgias\s+pr[ée]vias\s+e\s+neoplasias\.?/gi, "Nega demais antecedentes mórbidos relevantes e cirurgias prévias.");
    }

    // Se o paciente tem histórico de cirurgia, remove menção contraditória de negar cirurgias prévias
    if (temCirurgias) {
        t = t.replace(/,\s*cirurgias\s+pr[ée]vias\s+e\s+neoplasias\.?/gi, " e neoplasias.");
        t = t.replace(/,\s*neoplasias\s+e\s+cirurgias\s+pr[ée]vias\.?/gi, " e neoplasias.");
        t = t.replace(/\s+e\s+cirurgias\s+pr[ée]vias\.?/gi, ".");
        t = t.replace(/,\s*cirurgias\s+pr[ée]vias\b/gi, "");
        t = t.replace(/\bNega\s+demais\s+antecedentes\s+m[óo]rbidos\s+relevantes,\s*cirurgias\s+pr[ée]vias\s+e\s+neoplasias\.?/gi, "Nega demais antecedentes mórbidos relevantes e neoplasias.");
        t = t.replace(/\bNega\s+demais\s+antecedentes\s+m[óo]rbidos\s+relevantes\s+e\s+cirurgias\s+pr[ée]vias\.?/gi, "Nega demais antecedentes mórbidos relevantes.");
    }

    let fraseComplementoFinal = "Nega demais antecedentes mórbidos relevantes, cirurgias prévias e neoplasias.";
    if (temCancer) {
        fraseComplementoFinal = temCirurgias ? "Nega demais antecedentes mórbidos relevantes." : "Nega demais antecedentes mórbidos relevantes e cirurgias prévias.";
    } else {
        fraseComplementoFinal = temCirurgias ? "Nega demais antecedentes mórbidos relevantes e neoplasias." : "Nega demais antecedentes mórbidos relevantes, cirurgias prévias e neoplasias.";
    }

    // Desduplica caso venha "Nega [algo]. Nega demais antecedentes..."
    const duplicidadeRepl = temCancer ? (temCirurgias ? '$1$2.' : '$1$2 e cirurgias prévias.') : (temCirurgias ? '$1$2 e neoplasias.' : '$1$2, cirurgias prévias e neoplasias.');
    t = t.replace(/(^|[\.\;]\s*)(Nega\s+[^.\n\r]+?)\.\s*Nega\s+demais\s+antecedentes\s+mórbidos\s+relevantes,?\s*(?:cirurgias\s+prévias\s+e\s+neoplasias\.?|e\s+cirurgias\s+prévias\.?|cirurgias\s+prévias\.?|e\s+neoplasias\.?)?/gi, duplicidadeRepl);
    t = t.replace(/(^|[\.\;]\s*)(N[ãa]o\s+refere\s+[^.\n\r]+?)\.\s*Nega\s+demais\s+antecedentes\s+mórbidos\s+relevantes,?\s*(?:cirurgias\s+prévias\s+e\s+neoplasias\.?|e\s+cirurgias\s+prévias\.?|cirurgias\s+prévias\.?|e\s+neoplasias\.?)?/gi, duplicidadeRepl);
    t = t.replace(/(^|[\.\;]\s*)(Sem\s+[^.\n\r]+?)\.\s*Nega\s+demais\s+antecedentes\s+mórbidos\s+relevantes,?\s*(?:cirurgias\s+prévias\s+e\s+neoplasias\.?|e\s+cirurgias\s+prévias\.?|cirurgias\s+prévias\.?|e\s+neoplasias\.?)?/gi, duplicidadeRepl);

    if (temNegaDemais || (temCancer && t.toLowerCase().includes("nega demais antecedentes")) || (!temCancer && temCirurgiasMencao && temNeoplasias)) {
        return t.replace(/[\s\.\,;]+$/, '') + '.';
    }

    const isNegacao = /^\s*(?:Nega\b|N[ãa]o\s+refere\b|N[ãa]o\s+apresenta\b|Sem\b)/i.test(t);
    t = t.replace(/[\s\.\,;]+$/, '');
    if (isNegacao) {
        if (temCancer) {
            if (!temCirurgias) t += " e cirurgias prévias.";
            else t += ".";
        } else {
            if (!temCirurgiasMencao && !temNeoplasias) {
                t += ", cirurgias prévias e neoplasias.";
            } else if (!temCirurgiasMencao) {
                t += " e cirurgias prévias.";
            } else if (!temNeoplasias) {
                t += " e neoplasias.";
            } else {
                t += ".";
            }
        }
    } else {
        if (!t.toLowerCase().includes("nega demais") && !t.toLowerCase().includes("nega outras")) {
            t += ". " + fraseComplementoFinal;
        }
    }

    t = t.replace(/\s{2,}/g, ' ').replace(/,\s*,+/g, ',').replace(/\.\s*\./g, '.').replace(/,\s*\./g, '.');
    if (t && !t.endsWith(".")) t += ".";
    return t.trim();
}

function isContraryLimitationTextGestao(text) {
    if (!text) return false;
    const s = String(text).toLowerCase();
    return s.includes("não se observa") || s.includes("nao se observa")
        || s.includes("não se identificam") || s.includes("nao se identificam")
        || s.includes("sem limitações") || s.includes("sem limitacoes")
        || s.includes("capacidade laborativa preservada")
        || s.includes("não há limitações") || s.includes("nao ha limitacoes");
}

function resolverLimitacaoFavoravelGestao(st, aux, cargo, cid) {
    const rawLim = st.descLimitacao || aux.descLimitacao || st.atividadesComprometidas || aux.atividadesComprometidas || st.sintomasLimitacao || aux.sintomasLimitacao || '';
    if (rawLim && !isContraryLimitationTextGestao(rawLim)) {
        if (rawLim.toLowerCase().includes("rol de atividades")) return rawLim;
        return `${rawLim.replace(/[.;,]+$/, '')}, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
    }
    const regMap = st.osteomuscularRegioes || aux.osteomuscularRegioes || {};
    const alteradas = Object.keys(regMap).filter(k => regMap[k] === "Alterado");
    if (alteradas.length > 0) {
        const limsMap = {
            joelho_direito: "Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, realizar agachamentos, subir e descer escadarias de modo habitual e sem apoio",
            joelho_esquerdo: "Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, realizar agachamentos, subir e descer escadarias de modo habitual e sem apoio",
            lombar: "Limitações para realizar dosiflexão e extensão, de forma abrupta ou de modo habitual, deambulação de modo frequente e longos trajetos, permanência em ostostatismo prolongado, posição sentado de modo permanente e ou habitual sem opção de alternância postural",
            cervical: "Limitações para mudança do campo visual de forma brusca ou habitual, elevação ou movimentação de membros superiores acimada linha escapular de modo habitual",
            ombro_direito: "Limitações para ação braçal, com execução de elevação ou movimentação de membros superiores acimada linha escapular de modo habitual",
            ombro_esquerdo: "Limitações para ação braçal, com execução de elevação ou movimentação de membros superiores acimada linha escapular de modo habitual",
            cotovelo_direito: "Limitações da ADM que comprometem a ação braçal, limitam a aplicação de força motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática",
            cotovelo_esquerdo: "Limitações da ADM que comprometem a ação braçal, limitam a aplicação de força motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática",
            antebraco_direito: "Limitações da ADM que comprometem a ação braçal, limitam a aplicação de força motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática",
            antebraco_esquerdo: "Limitações da ADM que comprometem a ação braçal, limitam a aplicação de força motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática",
            mao_direita: "Limitações da ADM que comprometem o desempenho esperado para atividades manipulativas, limitam a ação manual, limitam movimentos finos, limitam a destreza manual, comprometem execução de manuscritos e digitação de forma habitual",
            mao_esquerda: "Limitações da ADM que comprometem o desempenho esperado para atividades manipulativas, limitam a ação manual, limitam movimentos finos, limitam a destreza manual, comprometem execução de manuscritos e digitação de forma habitual",
            quadril: "Limitações para realizar rotação do tronco de forma abrupta ou de modo habitual, deambulação de modo frequente e longos trajetos, permanência em ostostatismo prolongado, posição sentado de modo permanente e ou habitual sem opção de alternância postural",
            tornozelo_direito: "Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, subir e descer escadarias de modo habitual",
            tornozelo_esquerdo: "Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, subir e descer escadarias de modo habitual"
        };
        const lims = Array.from(new Set(alteradas.map(k => limsMap[k]).filter(Boolean)));
        if (lims.length > 0) {
            return `${lims.join(" e ")}, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
        }
    }
    const cUpper = String(cid || '').toUpperCase();
    const isAcomp = cUpper.startsWith("Z76") || Boolean(st.isAcompanhante || aux.isAcompanhante) || /acompanha/i.test(st.doencaMotivo || aux.doencaMotivo || '');
    if (isAcomp) {
        const isFem = (st.sexo && (st.sexo.toLowerCase() === 'f' || st.sexo.toLowerCase() === 'feminino'))
            || (aux.sexo && (aux.sexo.toLowerCase() === 'f' || aux.sexo.toLowerCase() === 'feminino'))
            || /professora|servidora|diretora/i.test(cargo);
        const termoServ = isFem ? "Servidora hígida" : "Servidor hígido";
        return `${termoServ}, sem limitação funcional própria. Necessidade de afastamento temporário decorrente da assistência imprescindível ao familiar dependente sob tratamento, impossibilitando a conciliação com as atribuições constantes no Rol de Atividades do cargo de ${cargo} (artigo 199 da Lei Estadual nº 10.261/1968).`;
    }
    if (cUpper.startsWith("F") || (st.exameFisicoTipo || aux.exameFisicoTipo) === "Exame Mental") {
        return `Apresenta limitações psicossociais e psicoemocionais que repercutem nas habilidades necessárias para interatividade social, planejamentos, manter concentração e ter autodomínio, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
    }
    if (cUpper.startsWith("M22") || cUpper.startsWith("M23") || cUpper.startsWith("M24") || cUpper.startsWith("M25")) {
        return `Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, realizar agachamentos, subir e descer escadarias de modo habitual e sem apoio, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
    }
    if (cUpper.startsWith("M54") || cUpper.startsWith("M51") || cUpper.startsWith("M50") || cUpper.startsWith("M53")) {
        return `Limitações para realizar dosiflexão e extensão, de forma abrupta ou de modo habitual, deambulação de modo frequente e longos trajetos, permanência em ostostatismo prolongado, posição sentado de modo permanente e ou habitual sem opção de alternância postural, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
    }
    if (cUpper.startsWith("M75")) {
        return `Limitações para ação braçal, com execução de elevação ou movimentação de membros superiores acimada linha escapular de modo habitual, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
    }
    return `Apresenta limitações físicas funcionais temporárias para as atividades habituais com necessidade de repouso e adaptação funcional, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
}

function renderEsislaBlocos(textoFicha) {
    const container = document.getElementById('esislaBlocosContainer');
    if (!container) return;
    const str = String(textoFicha || '');
    if (!str.trim()) {
        container.innerHTML = '<div style="padding:28px;text-align:center;color:#64748B;font-size:13px">Nenhum dado gerado para exibição em blocos.</div>';
        return;
    }

    const enc = window.currentEsislaEnc;
    const currentId = enc ? decodeURIComponent(enc) : '';
    let recordObj = null;
    if (window.currentDetailFull && currentId && (String(window.currentDetailFull.atendimento) === currentId || String(window.currentDetailFull.id) === currentId)) {
        recordObj = window.currentDetailFull;
    } else if (enc && typeof enc === 'object') {
        recordObj = enc;
    } else if (typeof enc === 'string' && enc) {
        recordObj = typeof currentRecord === 'function' ? currentRecord(enc) : null;
    }
    if (!recordObj && window.currentDetailFull) {
        recordObj = window.currentDetailFull;
    }
    const fullData = (recordObj?.payload && typeof recordObj.payload === 'object')
        ? { ...recordObj, ...recordObj.payload }
        : (recordObj || {});
    const st = fullData;
    const aux = fullData.aux || recordObj?.aux || {};

    function ext(t, i, f) {
        if (!t) return '';
        function toRegex(s) {
            const isEnd = arguments[1];
            if (!s || s === 'FIM_INEXISTENTE') return '';
            if (s === '\n') return '(?:\\r?\\n|$)';
            if (Array.isArray(s)) {
                const parts = s.map(x => toRegex(x, isEnd)).filter(Boolean);
                return parts.length ? '(?:' + parts.join('|') + ')' : '';
            }
            let p = s.replace(/:+$/, '').trim();
            p = p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            p = p.replace(/\\\(\\\*\\\)\s*/g, '\\(\\s*\\*\\s*\\)\\s*');
            p = p.replace(/\\\/|\//g, '\\s*\\/\\s*');
            if (isEnd) {
                if (p.toLowerCase() === 'atestado' || p.toLowerCase() === 'atestados') {
                    return '(?:\\r?\\n|^)\\s*' + p + '(?:\\s*[:\\/]|$|\\s+[0-9]+)';
                }
                return '(?:\\r?\\n|^)\\s*' + p + '[^\\r\\n:]*:?';
            }
            return '(?:(?:\\r?\\n|^)\\s*)?' + p + '[^\\r\\n:]*:?';
        }
        const si = toRegex(i);
        const sf = toRegex(f, true);
        const lookahead = sf ? '(?=' + sf + ')' : '(?=$)';
        const rx = new RegExp(si + '\\s*' + (f === '\n' ? '([^\\r\\n]*?)' : '([\\s\\S]*?)') + '\\s*' + lookahead, 'i');
        const m = t.match(rx);
        return m ? m[1].trim() : '';
    }

    const headersFimAntecedentes = [
        'Atestado/Relatório/Exames Complementares',
        'Atestado/Relatório',
        'Atestados/Relatórios',
        'Atestado:',
        'Atestados:',
        'Atestado',
        'Pressão Arterial',
        'Sistólica',
        'Altura',
        '(*)Exame Físico Geral'
    ];

    const headersFimExameFisico = [
        'Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares',
        'Descrição das Alterações Médicas e Relato dos Exames Complementares',
        'Descrição das Alterações Clínicas',
        'Descrição das Alterações Médicas',
        'Descrição das Alterações',
        '(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
        '(*)Descrição da(s) Limitação',
        '(*)Descrição da Limitação',
        'Descrição da(s) Limitação',
        '(*)Parecer Médico',
        'Parecer Médico',
        '(*)Parecer Final',
        'Parecer Final'
    ];

    const headersFimAlteracoes = [
        '(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
        '(*)Descrição da(s) Limitação',
        '(*)Descrição da Limitação',
        'Descrição da(s) Limitação',
        '(*)Parecer Médico',
        'Parecer Médico',
        '(*)Parecer Final',
        'Parecer Final'
    ];

    const headersFimLimitacoes = [
        '(*)Parecer Médico',
        'Parecer Médico',
        '(*)Parecer Final',
        'Parecer Final'
    ];

    let queixa = cleanQueixaDuracao(ext(str, '(*) Queixa e Duração', 'Antecedentes Mórbidos') || st.queixaDuracao || aux.queixaDuracao || '');
    const antecedentes = cleanAntecedentesMorbidos(ext(str, 'Antecedentes Mórbidos', headersFimAntecedentes) || st.historicoPregresso || aux.historicoPregresso || st.antecedentes || aux.antecedentes || '') || 'Nega';
    let atestado = ext(str, 'Atestado/Relatório/Exames Complementares', 'Pressão Arterial') || ext(str, 'Atestado', 'Pressão Arterial') || st.documentosApresentados || aux.documentosApresentados || '';
    if (atestado) {
        atestado = atestado.replace(/^\s*\(?\s*Tipo-Data-Resultado\s*\)?\s*:?\s*/i, '').trim();
    }
    // Diretriz e-SISLA: Atestados e Exames Complementares sempre sucinto como "Em anexo."
    atestado = 'Em anexo.';
    
    // Sinais Vitais e Biometria
    const paSis = ext(str, 'Sistólica (mmHg)', 'Diastólica') || ext(str, 'Sistólica', 'Diastólica') || st.pressaoSistolica || aux.pressaoSistolica || '';
    const paDia = ext(str, 'Diastólica (mmHg)', 'Pulso') || ext(str, 'Diastólica', 'Pulso') || st.pressaoDiastolica || aux.pressaoDiastolica || '';
    const pulso = ext(str, 'Pulso (bpm)', 'Altura') || ext(str, 'Pulso', 'Altura') || st.pulso || aux.pulso || '';
    let altura = ext(str, 'Altura', 'Peso') || st.altura || aux.altura || st.agilAltura || aux.agilAltura || st.biotipoAltura || aux.biotipoAltura || '';
    let peso = ext(str, 'Peso', '(*)Exame') || ext(str, 'Peso', 'Descrição') || st.peso || aux.peso || st.agilPeso || aux.agilPeso || st.biotipoPeso || aux.biotipoPeso || '';

    let altFormat = altura;
    if (altFormat) {
        let s = String(altFormat).trim().replace(/[^\d,\.]/g, '');
        if (s.includes('.')) s = s.replace('.', ',');
        else if (!s.includes(',') && s.length >= 3) s = s.slice(0, 1) + ',' + s.slice(1, 3);
        altFormat = s;
    }
    const pesoDigits = String(peso || '').replace(/\D/g, '').slice(0, 3);

    // Exame Físico Geral e Tipo/Checkbox — No e-SISLA corresponde exatamente ao exame clínico pericial
    const docExameFisico = (st.exameFisicoDescricao || aux.exameFisicoDescricao || st.agilExameFisicoDescricao || aux.agilExameFisicoDescricao || '').trim();
    const exameFisico = docExameFisico 
        || ext(str, '(*)Exame Físico Geral', headersFimExameFisico) 
        || ext(str, 'Exame Físico Geral', headersFimExameFisico) 
        || '';
    
    const alteracoes = ext(str, [
            'Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares',
            'Descrição das Alterações Médicas e Relato dos Exames Complementares',
            'Descrição das Alterações Clínicas',
            'Descrição das Alterações Médicas',
            'Descrição das Alterações'
        ], headersFimAlteracoes) 
        || st.alteracoesClinicasExames || aux.alteracoesClinicasExames || '';

    // Se houver relatos reais de exames complementares (não boilerplates nem "Em anexo"), integra em queixas e não duplica em bloco isolado
    const cleanAlt = String(alteracoes || '').replace(/^(?:em\s+anexo\.?|não\s+foram\s+apresentados[^\n\r]*|nao\s+foram\s+apresentados[^\n\r]*|aus[êeē]ncia\s+de\s+exames[^\n\r]*|nada\s+consta[^\n\r]*|sem\s+exames[^\n\r]*)\s*$/i, '').trim();
    const isSemExames = /^(?:em\s+anexo\.?|não\s+foram\s+apresentados|nao\s+foram\s+apresentados|aus[êeē]ncia\s+de\s+exames|nada\s+consta|sem\s+exames|n[ãa]o\s+h[áa]\s+exames|n[ãa]o\s+apresentou)/i.test(cleanAlt) || /aus[êeē]ncia\s+de\s+exames/i.test(cleanAlt);
    if (cleanAlt && !cleanAlt.toLowerCase().includes('em anexo') && !isSemExames && cleanAlt.length > 5) {
        if (!queixa.includes(cleanAlt)) {
            queixa = (queixa ? queixa + '\n\n' : '') + 'Exames apresentados: ' + cleanAlt;
        }
    }
    queixa = queixa.replace(/Exames apresentados:\s*Aus[êeē]ncia[^\n\r]*[\.\,]?/gi, '').trim();
    queixa = queixa.replace(/Exames apresentados:\s*N[ãa]o foram[^\n\r]*[\.\,]?/gi, '').trim();

    const sistemaEscolhido = detectarSistemaExameFisico(st, aux, str, st.cid || aux.cid);
    const sistemaNome = MAPA_NOMES_ESISLA[sistemaEscolhido] || (sistemaEscolhido === 'outro' ? 'Outros' : 'Aparelho Osteomuscular e Tecido Conjuntivo');

    // Limpar repetição do título/sistema no início do texto do exame físico (evita aparecer o nome do sistema duas vezes)
    let exameFisicoLimpo = exameFisico;
    exameFisicoLimpo = exameFisicoLimpo.replace(/^\s*(?:Aparelho\s+)?(?:E\s+)?Outros\s*:\s*/i, '').trim();
    const prefixosSistema = [
        sistemaNome,
        'Aparelho Osteomuscular e Tecido Conjuntivo',
        'Aparelho Osteomuscular e Tecido Conjutivo',
        'Exame Mental',
        'Tecido celular subcutâneo Pele e Fâneros',
        'Tecido celular subcutâneo',
        'Pele e Fâneros',
        'Aparelho Circulatório',
        'Aparelho Respiratório',
        'Aparelho Digestivo',
        'Aparelho Geniturinário',
        'Aparelho Hemolinfopoético',
        'Aparelho Hemolinfopoiético',
        'Aparelho Endócrino',
        'Sistema Nervoso',
        'Órgãos dos Sentidos',
        'Exame Físico Geral',
        'Aparelho E outros',
        'Aparelho outros',
        'E outros',
        'Outros'
    ].filter(Boolean);
    for (const p of prefixosSistema) {
        const rx = new RegExp('^\\s*' + p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\s*:\\s*', 'i');
        if (rx.test(exameFisicoLimpo)) {
            exameFisicoLimpo = exameFisicoLimpo.replace(rx, '').trim();
            break;
        }
    }

    let limitacoes = ext(str, [
            '(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
            '(*)Descrição da(s) Limitação',
            '(*)Descrição da Limitação',
            'Descrição da(s) Limitação'
        ], headersFimLimitacoes) 
        || st.descLimitacao || aux.descLimitacao || st.limitacaoFuncional || '';
    
    // Parecer
    const parecerBloco = ext(str, '(*)Parecer Médico', '(*)Resposta aos quesitos');
    const parecerFinalBloco = ext(str, '(*) Parecer Final', 'FIM_INEXISTENTE') || ext(str, '(*)Parecer Final', 'FIM_INEXISTENTE');

    let parecerTipo = (parecerBloco.match(/Parecer:\s*([^\n\r]+)/i) || [])[1]?.trim() || '';
    const stFavOverride = st.parecerManualOverride === 'FAVORÁVEL' || aux.parecerManualOverride === 'FAVORÁVEL' || st.parecer === 'FAVORÁVEL' || aux.parecer === 'FAVORÁVEL';
    const stContraOverride = st.parecerManualOverride === 'CONTRÁRIO' || aux.parecerManualOverride === 'CONTRÁRIO' || st.parecer === 'CONTRÁRIO' || aux.parecer === 'CONTRÁRIO';
    if (stFavOverride) {
        parecerTipo = 'FAVORÁVEL';
    } else if (stContraOverride) {
        parecerTipo = 'CONTRÁRIO';
    } else if (!parecerTipo) {
        if (parecerBloco.toUpperCase().includes('CONTRÁRIO') || str.toUpperCase().includes('PARECER: CONTRÁRIO')) parecerTipo = 'CONTRÁRIO';
        else if (parecerBloco.toUpperCase().includes('FAVORÁVEL') || str.toUpperCase().includes('PARECER: FAVORÁVEL')) parecerTipo = 'FAVORÁVEL';
        else if (st.parecer || aux.parecer) parecerTipo = String(st.parecer || aux.parecer).toUpperCase();
    }

    const isFavLim = parecerTipo.toUpperCase().includes('FAVOR') || parecerTipo.toUpperCase() === 'F';
    if (isFavLim && (!limitacoes || isContraryLimitationTextGestao(limitacoes))) {
        const cargoNome = st.cargo || aux.cargo || 'servidor';
        const cidCod = st.cid || aux.cid || (parecerBloco.match(/CID\s*(?:10)?:\s*([^\n\r]+)/i) || [])[1]?.trim() || '';
        limitacoes = resolverLimitacaoFavoravelGestao(st, aux, cargoNome, cidCod);
    }

    let dias = (parecerBloco.match(/N[ºo°\.]*\s*Dias:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || (parecerFinalBloco.match(/N[ºo°\.]*\s*Dias:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || st.diasSolicitados || aux.diasSolicitados || st.diasConcedidos || aux.diasConcedidos || '';
    dias = dias ? String(dias).replace(/[^0-9]/g, '') : '';
    if (parecerTipo.toUpperCase().includes('CONTR')) {
        dias = '0';
    } else if (parecerTipo.toUpperCase().includes('FAVOR') && (!dias || dias === '0')) {
        dias = st.diasSolicitados || aux.diasSolicitados || st.diasConcedidos || aux.diasConcedidos || '1';
        dias = String(dias).replace(/[^0-9]/g, '') || '1';
    }
    dias = dias ? String(dias).replace(/[^0-9]/g, '') : '';

    let dtIni = (parecerBloco.match(/Data\s*In[íi]cio:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || (parecerFinalBloco.match(/Data\s*In[íi]cio:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || st.dataInicio || aux.dataInicio || st.dataDocumento || aux.dataDocumento || '';
    dtIni = dtIni.split('\n')[0].trim();

    let cid = (parecerBloco.match(/CID\s*(?:10)?:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || (parecerFinalBloco.match(/CID\s*(?:10)?:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || st.cid || aux.cid || '';

    let cidDesc = (parecerBloco.match(/Descri[çc][ãa]o:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || (parecerFinalBloco.match(/Descri[çc][ãa]o:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || st.doencaMotivo || aux.doencaMotivo || '';
    let cleanCidDesc = String(cidDesc || '')
        .replace(/^[Vv]em\s+com\s+atestado\s+de\s+\d+\s+dias\s*(?:por|de|devido\s+a)?\s*/i, '')
        .replace(/^[Aa]testado\s+de\s+\d+\s+dias\s*(?:por|de|devido\s+a)?\s*/i, '')
        .replace(/[\.\s]+$/, '').trim();
    if (cleanCidDesc) {
        cidDesc = cleanCidDesc.charAt(0).toUpperCase() + cleanCidDesc.slice(1);
    }

    let cidSec = '';
    const mSecMatch = parecerBloco.match(/CID\s*(?:10)?\s*Secund[áa]rio:\s*([A-Za-z]\d{2}(?:\.\d{1,2})?)/i)
        || parecerFinalBloco.match(/CID\s*(?:10)?\s*Secund[áa]rio:\s*([A-Za-z]\d{2}(?:\.\d{1,2})?)/i);
    if (mSecMatch) {
        cidSec = mSecMatch[1].trim().toUpperCase();
    }

    let cidSecDesc = '';
    const mSecDescMatch = parecerBloco.match(/Descri[çc][ãa]o\s*Secund[áa]ria:\s*([^\n\r]+)/i)
        || parecerFinalBloco.match(/Descri[çc][ãa]o\s*Secund[áa]ria:\s*([^\n\r]+)/i);
    if (mSecDescMatch) {
        let rawD = mSecDescMatch[1].trim();
        if (!/m[ée]dico\s*perito|crm|diretor/i.test(rawD)) {
            cidSecDesc = rawD;
        }
    }

    const cidsSecArr = st.cidsSecundarios || aux.cidsSecundarios || [];
    if (!cidSec && Array.isArray(cidsSecArr) && cidsSecArr.length > 0) {
        const cs0 = cidsSecArr[0];
        const rawCode = (typeof cs0 === 'object' ? (cs0.codigo || cs0.cid) : cs0) || '';
        const mCode = String(rawCode).match(/[A-Za-z]\d{2}(?:\.\d{1,2})?/i);
        if (mCode) {
            cidSec = mCode[0].toUpperCase();
            cidSecDesc = (typeof cs0 === 'object' ? (cs0.descricao || cs0.nome) : '') || '';
        }
    }
    if (!cidSec && cid && cid.includes(',')) {
        const parts = cid.split(',');
        cid = parts[0].trim();
        const mPart = parts[1].trim().match(/[A-Za-z]\d{2}(?:\.\d{1,2})?/i);
        if (mPart) cidSec = mPart[0].toUpperCase();
    }
    if (!/^[A-Za-z]\d{2}(?:\.\d{1,2})?$/.test(cidSec)) {
        cidSec = '';
        cidSecDesc = '';
    }

    let medPerito = (parecerBloco.match(/M[ée]dico\s*Perito:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || st.medico || aux.medico || st.medicoResponsavel || '';

    let crmPerito = (parecerBloco.match(/CRM:\s*([^\n\r]+)/i) || [])[1]?.trim()
        || st.crmResponsavel || aux.crmResponsavel || '';

    // Quesitos
    const isContra = (parecerTipo || '').toUpperCase().includes('CONTR');
    const isReadap = String(st.readaptado || aux.readaptado || '').trim().toLowerCase() === 'sim'
        || (str.match(/readaptad[oa]/i) && !str.match(/n[ãa]o\s+readaptad[oa]/i));

    function getQuesitoVal(num, busca) {
        if (isContra) {
            if (num === 1) return 'SIM';
            if (num === 2) return isReadap ? 'SIM' : 'NÃO';
            if (num === 3) return 'NÃO';
        }
        const qStr = (ext(str, busca, '\n') || ext(str, num + ')', '\n')).toLowerCase();
        if (qStr.includes('sim')) return 'SIM';
        if (qStr.includes('não') || qStr.includes('nao')) return 'NÃO';
        const qArr = st.quesitos || aux.quesitos;
        if (Array.isArray(qArr) && qArr[num - 1]) {
            const r = String(qArr[num - 1].resposta || qArr[num - 1] || '').trim().toLowerCase();
            if (r === 'sim' || r === 's') return 'SIM';
            if (r === 'não' || r === 'nao' || r === 'n') return 'NÃO';
        }
        return 'SIM';
    }
    const q1 = getQuesitoVal(1, '1) Há doença(s)');
    const q2 = getQuesitoVal(2, '2) A(s) doença(s)');
    const q3 = getQuesitoVal(3, '3) A(s) limitação(ões)');

    let justif = ext(str, '(*)Justificativa Parecer Médico', '(*) Parecer Final');
    if (!justif) justif = ext(str, '(*)Justificativa Parecer Médico', 'FIM_INEXISTENTE');
    if (!justif) justif = ext(str, '(*) Justificativa Parecer Final', 'FIM_INEXISTENTE');
    if (!justif) {
        justif = st.justificativa || aux.justificativa || st.agilJustificativa || aux.agilJustificativa || '';
    }

    const isFavCard = parecerTipo.toUpperCase().includes('FAVOR') || parecerTipo.toUpperCase() === 'F';
    const isAcompCard = (cid && cid.toUpperCase().startsWith('Z76')) || Boolean(st.isAcompanhante || aux.isAcompanhante) || /acompanha/i.test(st.doencaMotivo || aux.doencaMotivo || str);
    if (isFavCard && isAcompCard) {
        if (!justif || justif.includes('Artigos 191 e 193') || justif.includes('não preenche os requisitos') || justif.includes('Capacidade laborativa própria preservada. O pleito')) {
            justif = 'Capacidade laborativa própria preservada, sendo o parecer FAVORÁVEL à concessão de licença por motivo de doença em pessoa da família nos termos do Artigo 199 da Lei Estadual nº 10.261/1968, comprovada a necessidade de assistência direta e contínua ao familiar dependente pelo período concedido.';
        }
    }

    function removerCapslockExcessivoJs(texto) {
        if (!texto) return '';
        const siglasManter = new Set([
            'CID', 'CRM', 'DPME', 'LTS', 'SUS', 'SP', 'RG', 'CPF', 'PA', 'BPM', 'MMHG',
            'SIM', 'NÃO', 'NAO', 'FAVORÁVEL', 'FAVORAVEL', 'CONTRÁRIO', 'CONTRARIO', 'FIM'
        ]);
        const minusculas = new Set([
            'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
            'e', 'ou', 'para', 'por', 'com', 'sem', 'sob', 'sobre'
        ]);
        const mapaAcentos = {
            'EDUCACAO': 'Educação',
            'ORGANIZACAO': 'Organização',
            'BASICA': 'Básica',
            'TECNICO': 'Técnico',
            'TECNICA': 'Técnica',
            'PUBLICO': 'Público',
            'PUBLICA': 'Pública',
            'MEDICO': 'Médico',
            'MEDICA': 'Médica',
            'AGENTE': 'Agente',
            'PROFESSOR': 'Professor',
            'PROFESSORA': 'Professora',
            'DIRETOR': 'Diretor',
            'DIRETORA': 'Diretora',
            'COORDENADOR': 'Coordenador',
            'COORDENADORA': 'Coordenadora',
            'SECRETARIO': 'Secretário',
            'SECRETARIA': 'Secretária',
            'OFICIAL': 'Oficial',
            'ADMINISTRATIVO': 'Administrativo',
            'ADMINISTRATIVA': 'Administrativa',
            'AUXILIAR': 'Auxiliar',
            'ESCOLAR': 'Escolar',
            'SERVICOS': 'Serviços',
            'GERAIS': 'Gerais',
            'ESTADUAL': 'Estadual',
            'MUNICIPAL': 'Municipal'
        };

        return String(texto).replace(/\b[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]{4,}\b(?:\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]{2,}\b)*/g, function(fraseCaps) {
            const palavras = fraseCaps.trim().split(/\s+/);
            if (palavras.length === 1 && siglasManter.has(palavras[0])) {
                return palavras[0];
            }
            return palavras.map((p, idx) => {
                const pUpper = p.toUpperCase();
                if (siglasManter.has(pUpper)) return pUpper;
                if (mapaAcentos[pUpper]) {
                    const acentuada = mapaAcentos[pUpper];
                    return idx > 0 && minusculas.has(acentuada.toLowerCase()) ? acentuada.toLowerCase() : acentuada;
                }
                const low = p.toLowerCase();
                if (idx > 0 && minusculas.has(low)) return low;
                return low.charAt(0).toUpperCase() + low.slice(1);
            }).join(' ');
        });
    }

    window.copiarBlocoEsislaCard = function(btn, textoExtra) {
        let raw = '';
        if (typeof textoExtra === 'string' && textoExtra.trim()) {
            raw = textoExtra;
        } else if (btn) {
            const card = btn.closest('.esisla-card-block');
            const bodyEl = card ? card.querySelector('.esisla-card-body') : null;
            if (bodyEl) {
                raw = bodyEl.innerText || bodyEl.textContent || '';
            }
        }
        const clean = String(raw).replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
        if (!clean) return;
        const feedback = () => {
            if (!btn) return;
            const orig = btn.innerHTML;
            btn.innerHTML = '✓ Copiado';
            btn.style.color = '#059669';
            btn.style.borderColor = '#A7F3D0';
            btn.style.background = '#ECFDF5';
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.style.color = '';
                btn.style.borderColor = '';
                btn.style.background = '';
            }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(clean).then(feedback).catch(() => {
                fallbackCopy(clean, feedback);
            });
        } else {
            fallbackCopy(clean, feedback);
        }
        function fallbackCopy(val, cb) {
            const ta = document.createElement('textarea');
            ta.value = val;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); if (cb) cb(); } catch(_) {}
            document.body.removeChild(ta);
        }
    };

    function sanitizePtBrEsisla(strVal) {
        if (!strVal) return '';
        let s = removerCapslockExcessivoJs(String(strVal));
        const mapMacron = {
            'ē': 'ê', 'ō': 'ô', 'ā': 'á', 'ī': 'í', 'ū': 'ú',
            'Ē': 'Ê', 'Ō': 'Ô', 'Ā': 'Á', 'Ī': 'Í', 'Ū': 'Ú'
        };
        s = s.replace(/[ēōāīūĒŌĀĪŪ]/g, ch => mapMacron[ch] || ch);
        s = s.replace(/\bsist[êe]mico\b/gi, m => m[0] === 'S' ? 'Sistêmico' : 'sistêmico');
        s = s.replace(/\bsist[êe]mica\b/gi, m => m[0] === 'S' ? 'Sistêmica' : 'sistêmica');
        s = s.replace(/\bsist[êe]micos\b/gi, m => m[0] === 'S' ? 'Sistêmicos' : 'sistêmicos');
        s = s.replace(/\bsist[êe]micas\b/gi, m => m[0] === 'S' ? 'Sistêmicas' : 'sistêmicas');
        s = s.replace(/\bcr[ôo]nico\b/gi, m => m[0] === 'C' ? 'Crônico' : 'crônico');
        s = s.replace(/\bcr[ôo]nica\b/gi, m => m[0] === 'C' ? 'Crônica' : 'crônica');
        s = s.replace(/\bcr[ôo]nicos\b/gi, m => m[0] === 'C' ? 'Crônicos' : 'crônicos');
        s = s.replace(/\bcr[ôo]nicas\b/gi, m => m[0] === 'C' ? 'Crônicas' : 'crônicas');
        s = s.replace(/\baus[êe]ncia\b/gi, m => m[0] === 'A' ? 'Ausência' : 'ausência');
        s = s.replace(/\baus[êe]ncias\b/gi, m => m[0] === 'A' ? 'Ausências' : 'ausências');
        s = s.replace(/\bpr[ée]vio\b/gi, m => m[0] === 'P' ? 'Prévio' : 'prévio');
        s = s.replace(/\bpr[ée]via\b/gi, m => m[0] === 'P' ? 'Prévia' : 'prévia');
        s = s.replace(/\bpr[ée]vios\b/gi, m => m[0] === 'P' ? 'Prévios' : 'prévios');
        s = s.replace(/\bpr[ée]vias\b/gi, m => m[0] === 'P' ? 'Prévias' : 'prévias');
        s = s.replace(/\bclinico\b/gi, m => m[0] === 'C' ? 'Clínico' : 'clínico');
        s = s.replace(/\bclinica\b/gi, m => m[0] === 'C' ? 'Clínica' : 'clínica');
        s = s.replace(/\bclinicos\b/gi, m => m[0] === 'C' ? 'Clínicos' : 'clínicos');
        s = s.replace(/\bclinicas\b/gi, m => m[0] === 'C' ? 'Clínicas' : 'clínicas');
        s = s.replace(/\bcompativel\b/gi, m => m[0] === 'C' ? 'Compatível' : 'compatível');
        s = s.replace(/\bcompativeis\b/gi, m => m[0] === 'C' ? 'Compatíveis' : 'compatíveis');
        s = s.replace(/\bsindrome\b/gi, m => m[0] === 'S' ? 'Síndrome' : 'síndrome');
        s = s.replace(/\bsindromes\b/gi, m => m[0] === 'S' ? 'Síndromes' : 'síndromes');
        s = s.replace(/\bperiodo\b/gi, m => m[0] === 'P' ? 'Período' : 'período');
        s = s.replace(/\bperiodos\b/gi, m => m[0] === 'P' ? 'Períodos' : 'períodos');
        s = s.replace(/\bimprescindivel\b/gi, m => m[0] === 'I' ? 'Imprescindível' : 'imprescindível');
        s = s.replace(/\bfisica\b/gi, m => m[0] === 'F' ? 'Física' : 'física');
        s = s.replace(/\bfisico\b/gi, m => m[0] === 'F' ? 'Físico' : 'físico');
        s = s.replace(/\bfisicas\b/gi, m => m[0] === 'F' ? 'Físicas' : 'físicas');
        s = s.replace(/\bfisicos\b/gi, m => m[0] === 'F' ? 'Físicos' : 'físicos');
        s = s.replace(/\bpericia\b/gi, m => m[0] === 'P' ? 'Perícia' : 'perícia');
        s = s.replace(/\bpericias\b/gi, m => m[0] === 'P' ? 'Perícias' : 'perícias');
        s = s.replace(/\binicio\b/gi, m => m[0] === 'I' ? 'Início' : 'início');
        s = s.replace(/\bhistorico\b/gi, m => m[0] === 'H' ? 'Histórico' : 'histórico');

        // Flexão de gênero e eliminação de barras/parênteses (a)/(o)
        const isFemContext = /\b(?:servidora|periciada|professora|diretora|mulher|feminino|ela|m[ãa]e|filha)\b/i.test(s)
            || (st.sexo && (st.sexo.toLowerCase() === 'f' || st.sexo.toLowerCase() === 'feminino'))
            || (aux.sexo && (aux.sexo.toLowerCase() === 'f' || aux.sexo.toLowerCase() === 'feminino'));

        s = s.replace(/\bO\(A\)\s+servidor\(a\)(?!\w)/gi, isFemContext ? 'A servidora' : 'O servidor');
        s = s.replace(/\bo\(a\)\s+servidor\(a\)(?!\w)/gi, isFemContext ? 'a servidora' : 'o servidor');
        s = s.replace(/\bO\(A\)\s+periciado\(a\)(?!\w)/gi, isFemContext ? 'A periciada' : 'O periciado');
        s = s.replace(/\bo\(a\)\s+periciado\(a\)(?!\w)/gi, isFemContext ? 'a periciada' : 'o periciado');
        s = s.replace(/\bServidor\(a\)(?!\w)/g, isFemContext ? 'Servidora' : 'Servidor');
        s = s.replace(/\bservidor\(a\)(?!\w)/g, isFemContext ? 'servidora' : 'servidor');
        s = s.replace(/\bPericiado\(a\)(?!\w)/g, isFemContext ? 'Periciada' : 'Periciado');
        s = s.replace(/\bpericiado\(a\)(?!\w)/g, isFemContext ? 'periciada' : 'periciado');
        s = s.replace(/\bPericiando\(a\)(?!\w)/g, isFemContext ? 'Pericianda' : 'Periciando');
        s = s.replace(/\bpericiando\(a\)(?!\w)/g, isFemContext ? 'pericianda' : 'periciado');
        s = s.replace(/\breadaptado\(a\)(?!\w)/gi, isFemContext ? 'readaptada' : 'readaptado');
        s = s.replace(/\bh[íi]gido\(a\)(?!\w)/gi, isFemContext ? 'hígida' : 'hígido');
        s = s.replace(/\bl[úu]cido\(a\)(?!\w)/gi, isFemContext ? 'lúcida' : 'lúcido');
        s = s.replace(/\borientado\(a\)(?!\w)/gi, isFemContext ? 'orientada' : 'orientado');
        s = s.replace(/\beupneico\(a\)(?!\w)/gi, isFemContext ? 'eupneica' : 'eupneico');
        s = s.replace(/\bcorado\(a\)(?!\w)/gi, isFemContext ? 'corada' : 'corado');
        s = s.replace(/\bhidratado\(a\)(?!\w)/gi, isFemContext ? 'hidratada' : 'hidratado');
        s = s.replace(/\bacian[óo]tico\(a\)(?!\w)/gi, isFemContext ? 'acianótica' : 'acianótico');
        s = s.replace(/\banict[ée]rico\(a\)(?!\w)/gi, isFemContext ? 'anictérica' : 'anictérico');
        s = s.replace(/\bapto\(a\)(?!\w)/gi, isFemContext ? 'apta' : 'apto');
        s = s.replace(/\bao\(à\)(?!\w)/gi, isFemContext ? 'à' : 'ao');
        s = s.replace(/\bdo\(a\)(?!\w)/gi, isFemContext ? 'da' : 'do');
        s = s.replace(/\bno\(a\)(?!\w)/gi, isFemContext ? 'na' : 'no');

        // Limpeza de redundância de acompanhante (familiar dependente)
        s = s.replace(/acompanhamento\s+de\s+familiar(?:\/dependente)?\s+enfermo\s*\(\s*familiar(?:\s+dependente)?\s*\)/gi, 'acompanhamento de familiar dependente');
        s = s.replace(/familiar(?:\/dependente)?\s+enfermo\s*\(\s*familiar(?:\s+dependente)?\s*\)/gi, 'familiar dependente');
        s = s.replace(/familiar\/dependente\s+enfermo/gi, 'familiar dependente');

        return s;
    }

    function escTxt(v) {
        if (!v) return '<span style="color:#94A3B8;font-style:italic">Não informado</span>';
        return esc(sanitizePtBrEsisla(v)).replace(/\n/g, '<br>');
    }

    function formatQuesito(label, txt) {
        const t = (txt || '').toLowerCase();
        const isSim = t.includes('sim');
        const isNao = t.includes('não') || t.includes('nao');
        const badge = isSim ? '<span class="ans sim" style="font-size:11px;padding:3px 10px;border-radius:6px;background:#DEF7EC;color:#03543F;font-weight:800;border:1px solid #BCF0DA">SIM</span>' :
                      isNao ? '<span class="ans nao" style="font-size:11px;padding:3px 10px;border-radius:6px;background:#FDE8E8;color:#9B1C1C;font-weight:800;border:1px solid #FBD5D5">NÃO</span>' :
                      '<span style="font-size:11px;color:#64748B">—</span>';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:8px">
            <span style="font-size:12.5px;color:#334155;font-weight:600">${label}</span>
            <div>${badge}</div>
        </div>`;
    }

    const isFav = parecerTipo.toUpperCase().includes('FAVORÁVEL');
    const parecerBadge = isFav 
        ? '<span style="display:inline-block;padding:4px 12px;border-radius:6px;background:#DEF7EC;color:#03543F;font-weight:800;font-size:12px;border:1px solid #BCF0DA">FAVORÁVEL</span>' 
        : (isContra ? '<span style="display:inline-block;padding:4px 12px;border-radius:6px;background:#FDE8E8;color:#9B1C1C;font-weight:800;font-size:12px;border:1px solid #FBD5D5">CONTRÁRIO</span>' 
                    : escTxt(parecerTipo));

    const resumoVitais = `Pressão: ${paSis || '—'}/${paDia || '—'} mmHg | Pulso: ${pulso || '—'} bpm | Altura: ${altFormat || '—'} m | Peso: ${pesoDigits || '—'} kg`;
    const resumoParecer = `Parecer: ${parecerTipo || '—'} | Dias: ${dias || '0'} | Início: ${dtIni || '—'} | CID 10: ${cid || '—'}${cidDesc ? ' (' + cidDesc + ')' : ''}${medPerito ? ' | Perito: ' + medPerito : ''}`;
    const resumoQuesitos = `1) Doença: ${q1} | 2) Limitação: ${q2} | 3) Impede função: ${q3}`;

    container.innerHTML = `
        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">🗣️</span>
                    <div>
                        <span class="esisla-card-label">Queixa e Duração</span>
                        <span class="esisla-card-sublabel">Histórico da moléstia atual</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this)" title="Copiar este bloco">📋 Copiar</button>
            </div>
            <div class="esisla-card-body">${escTxt(queixa)}</div>
        </div>

        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">📜</span>
                    <div>
                        <span class="esisla-card-label">Antecedentes Mórbidos</span>
                        <span class="esisla-card-sublabel">Histórico patológico pregresso</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this)" title="Copiar este bloco">📋 Copiar</button>
            </div>
            <div class="esisla-card-body">${escTxt(antecedentes)}</div>
        </div>

        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">📑</span>
                    <div>
                        <span class="esisla-card-label">Atestados e Exames Complementares</span>
                        <span class="esisla-card-sublabel">Documentos anexados</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this)" title="Copiar este bloco">📋 Copiar</button>
            </div>
            <div class="esisla-card-body">${escTxt(atestado)}</div>
        </div>

        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">💓</span>
                    <div>
                        <span class="esisla-card-label">Sinais Vitais e Biometria</span>
                        <span class="esisla-card-sublabel">Medições físicas periciais</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this, '${esc(resumoVitais)}')" title="Copiar medições vitais">📋 Copiar</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px">
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">Pressão Sistólica</span>
                    <strong style="font-size:13.5px;color:#0F172A">${paSis ? paSis + ' mmHg' : '<span style="color:#94A3B8;font-weight:normal">Não inf.</span>'}</strong>
                </div>
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">Pressão Diastólica</span>
                    <strong style="font-size:13.5px;color:#0F172A">${paDia ? paDia + ' mmHg' : '<span style="color:#94A3B8;font-weight:normal">Não inf.</span>'}</strong>
                </div>
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">Pulso</span>
                    <strong style="font-size:13.5px;color:#0F172A">${pulso ? pulso + ' bpm' : '<span style="color:#94A3B8;font-weight:normal">Não inf.</span>'}</strong>
                </div>
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">Altura</span>
                    <strong style="font-size:13.5px;color:#0F172A">${altFormat ? altFormat + ' m' : '<span style="color:#94A3B8;font-weight:normal">Não inf.</span>'}</strong>
                </div>
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">Peso</span>
                    <strong style="font-size:13.5px;color:#0F172A">${pesoDigits ? pesoDigits + ' kg' : '<span style="color:#94A3B8;font-weight:normal">Não inf.</span>'}</strong>
                </div>
            </div>
        </div>

        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">🩺</span>
                    <div>
                        <span class="esisla-card-label">Exame Físico Geral</span>
                        <span class="esisla-card-sublabel">Avaliação pericial segmentar</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this)" title="Copiar este bloco">📋 Copiar</button>
            </div>
            ${sistemaNome ? `
            <div style="margin-bottom:10px;display:flex;align-items:center;gap:6px">
                <span style="font-size:11px;padding:3px 9px;border-radius:6px;background:#EFF6FF;color:#1D4ED8;font-weight:700;border:1px solid #BFDBFE">
                    ☑️ Checkbox e-SISLA: ${esc(sistemaNome)}
                </span>
            </div>` : ''}
            <div class="esisla-card-body">${escTxt(exameFisicoLimpo)}</div>
        </div>

        ${alteracoes ? `
        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">🔬</span>
                    <div>
                        <span class="esisla-card-label">Alterações Clínicas e Exames Complementares</span>
                        <span class="esisla-card-sublabel">Achados clínicos complementares</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this)" title="Copiar este bloco">📋 Copiar</button>
            </div>
            <div class="esisla-card-body">${escTxt(alteracoes)}</div>
        </div>` : ''}

        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">⚠️</span>
                    <div>
                        <span class="esisla-card-label">Limitações Físicas e Mentais</span>
                        <span class="esisla-card-sublabel">Impacto laboral</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this)" title="Copiar este bloco">📋 Copiar</button>
            </div>
            <div class="esisla-card-body">${escTxt(limitacoes)}</div>
        </div>

        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">⚖️</span>
                    <div>
                        <span class="esisla-card-label">Parecer Médico Pericial</span>
                        <span class="esisla-card-sublabel">Decisão oficial conclusiva</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this, '${esc(resumoParecer)}')" title="Copiar parecer pericial">📋 Copiar</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px">
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">Parecer Final</span>
                    <div style="margin-top:4px">${parecerBadge}</div>
                </div>
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">Dias Concedidos</span>
                    <strong style="font-size:13.5px;color:#0F172A">${dias ? dias + ' dia(s)' : '<span style="color:#94A3B8;font-weight:normal">0</span>'}</strong>
                </div>
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">Data de Início</span>
                    <strong style="font-size:13.5px;color:#0F172A">${escTxt(dtIni)}</strong>
                </div>
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">CID 10 Principal</span>
                    <strong style="font-size:13.5px;color:#0F172A">${escTxt(cid)} ${cidDesc ? '<small style="font-size:11px;font-weight:normal;color:#475569">(' + esc(cidDesc.length > 80 ? cidDesc.slice(0, 80) + '...' : cidDesc) + ')</small>' : ''}</strong>
                </div>
                ${cidSec ? `
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">CID 10 Secundário</span>
                    <strong style="font-size:13.5px;color:#0F172A">${escTxt(cidSec)} ${cidSecDesc ? '<small style="font-size:11px;font-weight:normal;color:#475569">(' + esc(cidSecDesc.length > 80 ? cidSecDesc.slice(0, 80) + '...' : cidSecDesc) + ')</small>' : ''}</strong>
                </div>` : ''}
                ${medPerito ? `
                <div class="esisla-vital-card">
                    <span class="esisla-vital-label">Médico Perito / CRM</span>
                    <strong style="font-size:12.5px;color:#0F172A">${esc(medPerito)} ${crmPerito ? '· CRM: ' + esc(crmPerito) : ''}</strong>
                </div>` : ''}
            </div>
        </div>

        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">❓</span>
                    <div>
                        <span class="esisla-card-label">Resposta aos Quesitos Oficiais</span>
                        <span class="esisla-card-sublabel">Tríade pericial DPME</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this, '${esc(resumoQuesitos)}')" title="Copiar quesitos">📋 Copiar</button>
            </div>
            ${formatQuesito('1) Há doença(s) ou sequela(s)?', q1)}
            ${formatQuesito('2) A(s) doença(s) ou sequela(s) determina(m) limitação?', q2)}
            ${formatQuesito('3) A(s) limitação(ões) impede(m) o exercício das funções?', q3)}
        </div>

        <div class="esisla-card-block">
            <div class="esisla-card-header">
                <div class="esisla-card-title">
                    <span class="esisla-card-icon">📝</span>
                    <div>
                        <span class="esisla-card-label">Justificativa do Parecer Médico</span>
                        <span class="esisla-card-sublabel">Fundamentação técnico-pericial</span>
                    </div>
                </div>
                <button type="button" class="btn-copy-card-block" onclick="copiarBlocoEsislaCard(this)" title="Copiar este bloco">📋 Copiar</button>
            </div>
            <div class="esisla-card-body">${escTxt(justif)}</div>
        </div>
    `;
}

function setEsislaViewMode(mode, unlockEdit = false) {
    window.currentEsislaViewMode = mode;
    const blocosContainer = document.getElementById('esislaBlocosContainer');
    const textEl = document.getElementById('esislaText');
    const btnBlocos = document.getElementById('btnEsislaBlocos');
    const btnTxt = document.getElementById('btnEsislaTxt');
    const chip = document.getElementById('esislaLockChip');
    const btnEdit = document.getElementById('esislaToggleEditBtn');

    if (mode === 'blocos') {
        if (blocosContainer) blocosContainer.style.display = 'flex';
        if (textEl) textEl.style.display = 'none';
        if (btnBlocos) btnBlocos.classList.add('active');
        if (btnTxt) btnTxt.classList.remove('active');
        if (textEl) renderEsislaBlocos(textEl.value);
        setEsislaEditable(false);
        if (chip) {
            chip.innerHTML = '🗂️ Visualização em Blocos';
            chip.style.background = '#F1F5F9';
            chip.style.color = '#475569';
            chip.style.borderColor = '#CBD5E1';
        }
        if (btnEdit) {
            btnEdit.innerHTML = '✏️ Editar';
            btnEdit.style.background = '#FFFFFF';
            btnEdit.style.borderColor = '#CFDBE7';
            btnEdit.style.color = 'var(--blue)';
        }
    } else { // 'txt'
        if (blocosContainer) blocosContainer.style.display = 'none';
        if (textEl) textEl.style.display = 'block';
        if (btnBlocos) btnBlocos.classList.remove('active');
        if (btnTxt) btnTxt.classList.add('active');
        setEsislaEditable(unlockEdit);
    }
}

function setEsislaEditable(editable) {
    const el = document.getElementById('esislaText');
    const btn = document.getElementById('esislaToggleEditBtn');
    const chip = document.getElementById('esislaLockChip');
    if (!el) return;
    if (editable) {
        el.removeAttribute('readonly');
        el.classList.remove('locked');
        el.focus();
        if (btn) {
            btn.innerHTML = '🗂️ Ver em Blocos';
            btn.style.background = '#FEF3C7';
            btn.style.borderColor = '#F59E0B';
            btn.style.color = '#92400E';
        }
        if (chip) {
            chip.innerHTML = '✏️ Edição TXT liberada';
            chip.style.background = '#FEF3C7';
            chip.style.color = '#92400E';
            chip.style.borderColor = '#F59E0B';
        }
    } else {
        el.setAttribute('readonly', 'true');
        el.classList.add('locked');
        if (btn) {
            btn.innerHTML = '✏️ Editar';
            btn.style.background = '#FFFFFF';
            btn.style.borderColor = '#CFDBE7';
            btn.style.color = 'var(--blue)';
        }
        if (chip) {
            if (window.currentEsislaViewMode === 'blocos') {
                chip.innerHTML = '🗂️ Visualização em Blocos';
            } else {
                chip.innerHTML = '🔒 TXT protegido';
            }
            chip.style.background = '#F1F5F9';
            chip.style.color = '#475569';
            chip.style.borderColor = '#CBD5E1';
        }
    }
}

function toggleEditEsisla() {
    const el = document.getElementById('esislaText');
    const isBlocos = window.currentEsislaViewMode === 'blocos' || (el && el.style.display === 'none');
    if (isBlocos) {
        // Liberar a versão TXT para edição direta
        setEsislaViewMode('txt', true);
    } else {
        const isReadOnly = el.hasAttribute('readonly');
        if (isReadOnly) {
            setEsislaEditable(true);
        } else {
            // Salva / atualiza e volta para a visualização em blocos
            renderEsislaBlocos(el.value);
            setEsislaViewMode('blocos');
        }
    }
}

function onEsislaTextInput() {
    const el = document.getElementById('esislaText');
    if (!el) return;
    updateEsislaStats(el.value);
}

function updateEsislaStats(text){
    const chip=document.getElementById('esislaStatsChip');
    const str=String(text||'');
    const chars=str.length;
    const lines=str?str.split('\n').length:0;
    if(chip) chip.textContent=`${chars.toLocaleString('pt-BR')} caracteres · ${lines} linhas`;

    // Validação de Segurança Jurídica e Conformidade e-SISLA (Regras de Ouro)
    const banner = document.getElementById('esislaRegrasDeOuroBanner');
    if (!banner) return;

    if (!str.trim()) {
        banner.style.display = 'none';
        return;
    }

    const dataObj = typeof gerarJsonEsisla === 'function' ? gerarJsonEsisla(str, window.currentEsislaEnc) : null;
    if (!dataObj) return;

    const msgs = [];
    let hasCritical = false;

    // 1. Incoerências jurídicas dos quesitos x parecer
    if (dataObj.inconsistencias_juridicas && dataObj.inconsistencias_juridicas.length > 0) {
        hasCritical = true;
        msgs.push(`🚫 <strong>Incoerência Jurídica DPME:</strong> ${dataObj.inconsistencias_juridicas.join(' ')}`);
    }

    // 2. Limite de caracteres dos campos
    if (dataObj.campos_excedidos && dataObj.campos_excedidos.length > 0) {
        hasCritical = true;
        const listaExcesso = dataObj.campos_excedidos.map(c => `<strong>${c.nome}</strong>: ${c.tamanho.toLocaleString('pt-BR')} carac. (+${c.excesso})`).join(', ');
        msgs.push(`📏 <strong>Campos excedem o limite de 2.000 carac. do e-SISLA:</strong> ${listaExcesso}. O banco de dados do Estado pode truncar ou recusar a gravação. <button type="button" class="btn btn-outline" style="font-size:11px;padding:2px 8px;margin-left:6px;background:#fff;color:#B91C1C;border-color:#FCA5A5;font-weight:700;border-radius:4px;cursor:pointer" onclick="truncarCamposModalEsisla()">✂️ Truncar para ≤ 2.000</button>`);
    }

    // 3. Regra dos 90 / 180 dias de Junta Médica
    if (dataObj.alerta_junta) {
        msgs.push(`🏛️ <strong>Regra de Afastamento:</strong> ${dataObj.alerta_junta}`);
    }

    if (msgs.length > 0) {
        banner.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:11px">
                <span style="font-size:15px">${hasCritical ? '🛡️' : 'ℹ️'}</span>
                <div style="flex:1;line-height:1.45">
                    ${msgs.join('<br><div style="margin-top:2px"></div>')}
                </div>
            </div>
        `;
        banner.style.display = 'block';
        banner.style.flex = '1 1 100%';
        banner.style.padding = '8px 12px';
        banner.style.borderRadius = '8px';
        banner.style.margin = '0 0 6px 0';
        if (hasCritical) {
            banner.style.background = '#FEF2F2';
            banner.style.border = '1.5px solid #F87171';
            banner.style.color = '#991B1B';
        } else {
            banner.style.background = '#EFF6FF';
            banner.style.border = '1.5px solid #93C5FD';
            banner.style.color = '#1E3A8A';
        }
    } else {
        banner.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;font-size:11px">
                <span style="font-size:13px">🛡️</span>
                <span style="font-weight:750;color:#15803D">Conformidade e-SISLA / DPME verificada:</span>
                <span style="color:#166534">Campos dentro do limite de 2.000 caracteres e coerência entre Quesitos e Parecer respeitada.</span>
            </div>
        `;
        banner.style.display = 'inline-flex';
        banner.style.flex = '0 1 auto';
        banner.style.background = '#F0FDF4';
        banner.style.border = '1px solid #BBF7D0';
        banner.style.color = '#166534';
        banner.style.padding = '5px 12px';
        banner.style.borderRadius = '8px';
        banner.style.margin = '0';
    }
}

function truncarCamposModalEsisla() {
    const el = document.getElementById('esislaText');
    if (!el || !el.value) return;
    const dataObj = gerarJsonEsisla(el.value, window.currentEsislaEnc);
    if (!dataObj.campos_excedidos || dataObj.campos_excedidos.length === 0) {
        if (window.AmbientalUtils?.toast) AmbientalUtils.toast("Nenhum campo excede o limite de 2.000 caracteres.");
        return;
    }
    
    let text = el.value;
    dataObj.campos_excedidos.forEach(c => {
        const valExcedido = (dataObj.campos_esisla || {})[c.campo];
        if (valExcedido && valExcedido.length > 2000) {
            let safeVal = valExcedido.slice(0, 2000);
            const lp = safeVal.lastIndexOf('.');
            if (lp > 1850) safeVal = safeVal.slice(0, lp + 1);
            text = text.replace(valExcedido, safeVal);
        }
    });

    el.value = text;
    updateEsislaStats(text);
    if (window.AmbientalUtils?.toast) {
        AmbientalUtils.toast("Campos longos truncados para o limite de 2.000 caracteres com segurança!");
    } else {
        alert("Campos longos truncados para o limite de 2.000 caracteres com segurança!");
    }
}

async function copyEsisla(){
    const el=document.getElementById('esislaText');
    if(!el?.value)return;
    const btn=document.getElementById('copyEsislaBtn');
    const mini=document.getElementById('esislaCopyHeaderBtn')||document.querySelector('.btn-copy-mini');
    try{
        await navigator.clipboard.writeText(el.value);
    }catch{
        el.select();
        document.execCommand('copy');
    }
    if(btn){
        const oldHtml=btn.innerHTML;
        btn.innerHTML='✓ Ficha Copiada!';
        btn.style.background='linear-gradient(135deg, #059669, #047857)';
        btn.style.boxShadow='0 8px 24px rgba(5,150,105,.35)';
        setTimeout(()=>{
            btn.innerHTML=oldHtml;
            btn.style.background='';
            btn.style.boxShadow='';
        }, 2200);
    }
    if(mini){
        const oldMini=mini.innerHTML;
        mini.innerHTML='✓ Copiado!';
        setTimeout(()=>{ mini.innerHTML=oldMini; }, 2200);
    }
    if(window.AmbientalUtils?.toast){
        AmbientalUtils.toast('Ficha eSisla copiada para a área de transferência.');
    }else{
        alert('Ficha eSisla copiada para a área de transferência.');
    }
}

function downloadEsisla(){
    const text=document.getElementById('esislaText')?.value||'';
    if(!text)return;
    const sub=document.getElementById('esislaSub')?.textContent||'';
    const id=(sub.match(/Atendimento\s+([^·]+)/i)||[])[1]?.trim()||'atendimento';
    const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`Ficha-eSisla-${id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if(window.AmbientalUtils?.toast){
        AmbientalUtils.toast('Download da ficha e-Sisla (.txt) iniciado com sucesso!');
    }
}

function gerarJsonEsisla(textoFicha, enc) {
    const texto = String(textoFicha || document.getElementById('esislaText')?.value || '');
    let recordObj = null;
    if (enc && typeof enc === 'object') {
        recordObj = enc;
    } else if (typeof enc === 'string' && enc) {
        recordObj = typeof currentRecord === 'function' ? currentRecord(enc) : null;
    }
    if (!recordObj && window.currentDetailFull) {
        recordObj = window.currentDetailFull;
    }
    const st = recordObj?.payload || recordObj || {};
    const aux = st.aux || recordObj?.aux || {};

    function ext(t, i, f) {
        if (!t) return '';
        function toRegex(s) {
            const isEnd = arguments[1];
            if (!s || s === 'FIM_INEXISTENTE') return '';
            if (s === '\n') return '(?:\\r?\\n|$)';
            if (Array.isArray(s)) {
                const parts = s.map(x => toRegex(x, isEnd)).filter(Boolean);
                return parts.length ? '(?:' + parts.join('|') + ')' : '';
            }
            let p = s.replace(/:+$/, '').trim();
            p = p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            p = p.replace(/\\\(\\\*\\\)\s*/g, '\\(\\s*\\*\\s*\\)\\s*');
            p = p.replace(/\\\/|\//g, '\\s*\\/\\s*');
            if (isEnd) {
                if (p.toLowerCase() === 'atestado' || p.toLowerCase() === 'atestados') {
                    return '(?:\\r?\\n|^)\\s*' + p + '(?:\\s*[:\\/]|$|\\s+[0-9]+)';
                }
                return '(?:\\r?\\n|^)\\s*' + p + '[^\\r\\n:]*:?';
            }
            return '(?:(?:\\r?\\n|^)\\s*)?' + p + '[^\\r\\n:]*:?';
        }
        const si = toRegex(i);
        const sf = toRegex(f, true);
        const lookahead = sf ? '(?=' + sf + ')' : '(?=$)';
        const rx = new RegExp(si + '\\s*' + (f === '\n' ? '([^\\r\\n]*?)' : '([\\s\\S]*?)') + '\\s*' + lookahead, 'i');
        const m = t.match(rx);
        return m ? m[1].trim() : '';
    }

    const headersFimAntecedentes = [
        'Atestado/Relatório/Exames Complementares',
        'Atestado/Relatório',
        'Atestados/Relatórios',
        'Atestado:',
        'Atestados:',
        'Atestado',
        'Pressão Arterial',
        'Sistólica',
        'Altura',
        '(*)Exame Físico Geral'
    ];

    const headersFimExameFisico = [
        'Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares',
        'Descrição das Alterações Médicas e Relato dos Exames Complementares',
        'Descrição das Alterações Clínicas',
        'Descrição das Alterações Médicas',
        'Descrição das Alterações',
        '(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
        '(*)Descrição da(s) Limitação',
        '(*)Descrição da Limitação',
        'Descrição da(s) Limitação',
        '(*)Parecer Médico',
        'Parecer Médico',
        '(*)Parecer Final',
        'Parecer Final'
    ];

    const headersFimAlteracoes = [
        '(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
        '(*)Descrição da(s) Limitação',
        '(*)Descrição da Limitação',
        'Descrição da(s) Limitação',
        '(*)Parecer Médico',
        'Parecer Médico',
        '(*)Parecer Final',
        'Parecer Final'
    ];

    const headersFimLimitacoes = [
        '(*)Parecer Médico',
        'Parecer Médico',
        '(*)Parecer Final',
        'Parecer Final'
    ];

    let cat = cleanQueixaDuracao(ext(texto, '(*) Queixa e Duração', 'Antecedentes Mórbidos') || aux.queixaDuracao || st.queixaDuracao || aux.queixa || st.queixa || '');
    const ap = cleanAntecedentesMorbidos(ext(texto, 'Antecedentes Mórbidos', headersFimAntecedentes) || aux.historicoPregresso || st.historicoPregresso || aux.antecedentes || st.antecedentes || '') || 'Nega';
    // Diretriz e-SISLA: Atestados e Exames Complementares sempre sucinto como "Em anexo."
    let hda = 'Em anexo.';
    
    const exameFisicoTexto = ext(texto, '(*)Exame Físico Geral', headersFimExameFisico)
        || ext(texto, 'Exame Físico Geral', headersFimExameFisico)
        || st.exameFisicoDescricao || aux.exameFisicoDescricao || st.agilExameFisicoDescricao || aux.agilExameFisicoDescricao || '';
    
    const alteracoesTexto = ext(texto, [
            'Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares',
            'Descrição das Alterações Médicas e Relato dos Exames Complementares',
            'Descrição das Alterações Clínicas',
            'Descrição das Alterações Médicas',
            'Descrição das Alterações'
        ], headersFimAlteracoes)
        || aux.alteracoesClinicas || st.alteracoesClinicas || aux.alteracoesClinicasExames || st.alteracoesClinicasExames || '';

    // No e-SISLA o campo voMedico.parRlExApres (idExameApres) deve conter exclusivamente os achados do Exame Físico Geral direto
    const docExame = (st.exameFisicoDescricao || aux.exameFisicoDescricao || st.agilExameFisicoDescricao || aux.agilExameFisicoDescricao || '').trim();
    let exApres = (docExame || exameFisicoTexto).trim();
    if (!exApres) {
        exApres = aux.exameFisico || st.exameFisico || '';
    }
    exApres = exApres.replace(/\n\s*Em anexo\.?\s*$/gi, '').trim();
    exApres = exApres.replace(/^\s*(?:Aparelho\s+)?(?:E\s+)?Outros\s*:\s*/i, '').trim();

    // Se houver relatos reais de exames complementares (não boilerplates nem "Em anexo"), integra em queixas conforme solicitado
    const cleanAltJson = String(alteracoesTexto || '').replace(/^(?:em\s+anexo\.?|não\s+foram\s+apresentados[^\n\r]*|nada\s+consta[^\n\r]*|sem\s+exames[^\n\r]*)\s*$/i, '').trim();
    if (cleanAltJson && !cleanAltJson.toLowerCase().includes('em anexo') && !cleanAltJson.toLowerCase().includes('não foram apresentados') && cleanAltJson.length > 5) {
        if (!cat.includes(cleanAltJson)) {
            cat = (cat ? cat + '\n\n' : '') + 'Exames apresentados: ' + cleanAltJson;
        }
    }

    const reqExComp = ext(texto, [
            '(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
            '(*)Descrição da(s) Limitação',
            '(*)Descrição da Limitação',
            'Descrição da(s) Limitação'
        ], headersFimLimitacoes)
        || aux.limitacoes || st.limitacoes || aux.limitacaoFuncional || st.limitacaoFuncional || '';
    
    let justif = ext(texto, '(*)Justificativa Parecer Médico', '(*) Parecer Final');
    if (!justif) justif = ext(texto, '(*)Justificativa Parecer Médico', 'FIM_INEXISTENTE');
    if (!justif) justif = ext(texto, '(*) Justificativa Parecer Final', 'FIM_INEXISTENTE');
    if (!justif) justif = aux.justificativa || st.justificativa || aux.agilJustificativa || st.agilJustificativa || '';

    let crm = aux.crm || st.crm || aux.crmAssistente || st.crmAssistente || '';
    if (!crm) {
        const mCrm = hda.match(/CRM[:\s]*([0-9A-Z\-\/]+)/i) || texto.match(/CRM\s*(?:do\s*médico\s*assistente)?[:\s]*([0-9A-Z\-\/]+)/i);
        if (mCrm) crm = mCrm[1].trim();
    }
    let nomeMed = aux.nomeMedico || st.nomeMedico || aux.medicoAssistente || st.medicoAssistente || '';

    let paSis = ext(texto, 'Sistólica (mmHg)', 'Diastólica') || ext(texto, 'Sistólica', 'Diastólica') || aux.pressaoSistolica || st.pressaoSistolica || aux.paSistolica || '';
    let paDia = ext(texto, 'Diastólica (mmHg)', 'Pulso') || ext(texto, 'Diastólica', 'Pulso') || aux.pressaoDiastolica || st.pressaoDiastolica || aux.paDiastolica || '';
    let pulso = ext(texto, 'Pulso (bpm)', 'Altura') || ext(texto, 'Pulso', 'Altura') || aux.pulso || st.pulso || '';

    if (paSis) paSis = paSis.replace(/[^0-9]/g, '');
    if (paDia) paDia = paDia.replace(/[^0-9]/g, '');
    if (pulso) pulso = pulso.replace(/[^0-9]/g, '');

    let altura = ext(texto, 'Altura', 'Peso') || aux.altura || st.altura || aux.biotipoAltura || st.agilAltura || aux.agilAltura || '';
    let peso = ext(texto, 'Peso', '(*)Exame') || ext(texto, 'Peso', 'Descrição') || aux.peso || st.peso || aux.biotipoPeso || st.agilPeso || aux.agilPeso || '';

    // Extração estrita de no máximo 2 CIDs para os campos oficiais do e-SISLA
    let cidsExtraidos = [];
    const cidTextoRaw = ext(texto, 'CID 10', 'Descrição') || st.cid || aux.cid || '';
    const reCidMatch = cidTextoRaw.match(/[A-Z]\d{2}(?:\.\d{1,2})?/gi);
    if (reCidMatch) {
        reCidMatch.forEach(c => {
            const up = c.toUpperCase();
            if (!cidsExtraidos.includes(up)) cidsExtraidos.push(up);
        });
    }
    const cidsSec = st.cidsSecundarios || aux.cidsSecundarios || [];
    if (Array.isArray(cidsSec)) {
        cidsSec.forEach(cs => {
            const c = (cs.codigo || cs.cid || cs || '').toString().trim().toUpperCase();
            if (c && !cidsExtraidos.includes(c)) {
                cidsExtraidos.push(c);
            }
        });
    }

    let cid1 = cidsExtraidos[0] || (st.cid || aux.cid || '').split(/[,;\/\s]+/)[0].trim();
    let descrCid1 = ext(texto, 'Descrição', 'Médico Perito').split('\n')[0].trim() || ext(texto, 'Descrição', 'Diretor DPME').split('\n')[0].trim() || aux.doencaMotivo || st.doencaMotivo || '';
    let cleanDescr1 = String(descrCid1 || '')
        .replace(/^[Vv]em\s+com\s+atestado\s+de\s+\d+\s+dias\s*(?:por|de|devido\s+a)?\s*/i, '')
        .replace(/^[Aa]testado\s+de\s+\d+\s+dias\s*(?:por|de|devido\s+a)?\s*/i, '')
        .replace(/[\.\s]+$/, '').trim();
    if (cleanDescr1) {
        descrCid1 = cleanDescr1.charAt(0).toUpperCase() + cleanDescr1.slice(1);
    }
    
    let cid2 = cidsExtraidos[1] || '';
    let descrCid2 = '';
    if (!cid2) {
        const mSec = texto.match(/CID\s*(?:10)?\s*Secund[áa]rio:\s*([A-Za-z]\d{2}(?:\.\d{1,2})?)/i);
        if (mSec) cid2 = mSec[1].trim().toUpperCase();
        const mSecDesc = texto.match(/Descri[çc][ãa]o\s*Secund[áa]ria:\s*([^\n\r]+)/i);
        if (mSecDesc) {
            let d = mSecDesc[1].trim();
            if (!/m[ée]dico\s*perito|crm/i.test(d)) descrCid2 = d;
        }
    }
    if (cid2 && Array.isArray(cidsSec)) {
        const found = cidsSec.find(cs => (cs.codigo || cs.cid || '').toString().toUpperCase() === cid2.toUpperCase());
        if (found && !descrCid2) descrCid2 = found.descricao || found.nome || '';
    }
    if (!/^[A-Za-z]\d{2}(?:\.\d{1,2})?$/.test(cid2)) {
        cid2 = '';
        descrCid2 = '';
    }

    const pText = ext(texto, '(*)Parecer Médico', 'Nº Dias') || ext(texto, '(*)Parecer Médico', '(*)Resposta aos quesitos') || st.parecer || aux.parecer || '';
    const flPfinal = (pText.toUpperCase().includes('CONTRÁRIO') || texto.toUpperCase().includes('PARECER: CONTRÁRIO')) ? 'C' : 'F';

    let dias = ext(texto, 'Nº Dias', 'Data Início') || aux.diasConcedidos || st.diasConcedidos || aux.diasSolicitados || st.diasSolicitados || aux.diasAfastamento || st.diasAfastamento || '';
    dias = dias ? String(dias).replace(/[^0-9]/g, '') : '';
    if (!dias) {
        const m = String(st.diasSolicitados || aux.diasSolicitados || '').match(/\d+/);
        if (m) dias = m[0];
    }
    if (flPfinal === 'C') {
        dias = '0';
    } else if (flPfinal === 'F' && (!dias || dias === '0')) {
        dias = '1';
    }
    dias = dias ? String(dias).replace(/[^0-9]/g, '') : '';
    let dtIni = ext(texto, 'Data Início', 'CID 10') || aux.dataInicio || st.dataInicio || aux.dataDocumento || st.dataDocumento || '';
    dtIni = dtIni.split('\n')[0].trim();

    const fl_isReadap = String(st.readaptado || aux.readaptado || '').trim().toLowerCase() === 'sim'
        || (texto.match(/readaptad[oa]/i) && !texto.match(/n[ãa]o\s+readaptad[oa]/i));

    function getQuesitoVal(num, busca) {
        if (flPfinal === 'C') {
            if (num === 1) return 'S';
            if (num === 2) return fl_isReadap ? 'S' : 'N';
            if (num === 3) return 'N';
        }
        const qStr = (ext(texto, busca, '\n') || ext(texto, num + ')', '\n')).toLowerCase();
        if (qStr.includes('sim')) return 'S';
        if (qStr.includes('não') || qStr.includes('nao')) return 'N';
        const qArr = st.quesitos || aux.quesitos;
        if (Array.isArray(qArr) && qArr[num - 1]) {
            const r = String(qArr[num - 1].resposta || qArr[num - 1] || '').trim().toLowerCase();
            if (r === 'sim' || r === 's') return 'S';
            if (r === 'não' || r === 'nao' || r === 'n') return 'N';
        }
        return 'S';
    }
    const fl_d_prev = getQuesitoVal(1, '1) Há doença(s)');
    const fl_limit = getQuesitoVal(2, '2) A(s) doença(s)');
    const fl_imped = getQuesitoVal(3, '3) A(s) limitação(ões)');

    const cidCode = (cid1 || st.cid || aux.cid || '').toUpperCase();
    const sistemaEscolhido = detectarSistemaExameFisico(st, aux, texto, cidCode);

    const cb = {
        'voMedico.parEdtcspf': sistemaEscolhido === 'tcspf',
        'voMedico.parEdAc': sistemaEscolhido === 'ac',
        'voMedico.parEdAr': sistemaEscolhido === 'ar',
        'voMedico.parEdAHp': sistemaEscolhido === 'ahp',
        'voMedico.parEdAd': sistemaEscolhido === 'ad',
        'voMedico.parEdAgu': sistemaEscolhido === 'agu',
        'voMedico.parEdAoal': sistemaEscolhido === 'aoal',
        'voMedico.parEdAe': sistemaEscolhido === 'ae',
        'voMedico.parEdSn': sistemaEscolhido === 'sn',
        'voMedico.parEdOs': sistemaEscolhido === 'os',
        'voMedico.parEdEm': sistemaEscolhido === 'em',
        'voMedico.parEdOutro': sistemaEscolhido === 'outro'
    };
    if (!Object.values(cb).some(Boolean) && exApres.trim()) {
        cb['voMedico.parEdOutro'] = true;
    }

    const camposTextoAudit = [
        { key: 'voMedico.parRlCat', label: 'Queixa e Duração', valor: cat, max: 2000 },
        { key: 'voMedico.parRlAp', label: 'Antecedentes Mórbidos', valor: ap, max: 2000 },
        { key: 'voMedico.parRlHda', label: 'Atestado / Relatórios / Exames', valor: hda, max: 2500 },
        { key: 'voMedico.parRlExApres', label: 'Exame Físico / Achados', valor: exApres, max: 2500 },
        { key: 'voMedico.parRlReqExComp', label: 'Limitações Físicas / Mentais', valor: reqExComp, max: 2500 },
        { key: 'voMedico.parRlComp', label: 'Justificativa Parecer Final', valor: justif, max: 2000 }
    ];

    const camposExcedidos = camposTextoAudit
        .filter(c => String(c.valor || '').length > c.max)
        .map(c => ({
            campo: c.key,
            nome: c.label,
            tamanho: String(c.valor || '').length,
            excesso: String(c.valor || '').length - c.max,
            limite: c.max
        }));

    const inconsistenciasJuridicas = [];
    if (flPfinal === 'F' && fl_imped === 'N') {
        inconsistenciasJuridicas.push("Parecer FAVORÁVEL com Quesito 3 marcado como NÃO (sem impedimento das funções). A legislação do DPME prevê nulidade da licença.");
    }
    if (flPfinal === 'C' && fl_imped === 'S') {
        inconsistenciasJuridicas.push("Parecer CONTRÁRIO com Quesito 3 marcado como SIM (afirma impedimento para o cargo). Contradição pericial manifesta.");
    }

    const numDiasInt = parseInt(dias || 0, 10);
    const alertaJunta = numDiasInt >= 180 
        ? `Afastamento de ${numDiasInt} dias (≥ 180 dias): Pela Lei Estadual 10.261/68, é obrigatório encaminhamento para Junta Médica (Readaptação ou Aposentadoria).`
        : numDiasInt >= 90
        ? `Afastamento de ${numDiasInt} dias (≥ 90 dias): Diretriz DPME orienta avaliar encaminhamento para Junta Médica Pericial para Readaptação Funcional.`
        : null;

    const crmDigits = String(crm || '').replace(/\D/g, '').slice(0, 9);
    let altFormat = altura;
    if (altFormat) {
        let s = String(altFormat).trim().replace(/[^\d,\.]/g, '');
        if (s.includes('.')) s = s.replace('.', ',');
        else if (!s.includes(',') && s.length >= 3) s = s.slice(0, 1) + ',' + s.slice(1, 3);
        altFormat = s.slice(0, 4);
    }
    const pesoDigits = String(peso || '').replace(/\D/g, '').slice(0, 3);

    const camposEsisla = {
        'voMedico.parRlCat': cat,
        'voMedico.parRlAp': ap,
        'voMedico.parRlHda': hda,
        'voResult.numCrm': '',
        'voResult.strNomeMedico': nomeMed,
        'voMedico.lgPressArterialMax': paSis,
        'voMedico.lgPressArterialMin': paDia,
        'voMedico.lgPulsacao': pulso,
        'voMedico.lgAltura': altFormat,
        'voMedico.lgPeso': pesoDigits,
        'lgPressArterialMax': paSis,
        'lgPressArterialMin': paDia,
        'lgPulsacao': pulso,
        'lgAltura': altFormat,
        'lgPeso': pesoDigits,
        'voMedico.parEdtcspf': cb['voMedico.parEdtcspf'] ? 'X' : '',
        'voMedico.parEdAc': cb['voMedico.parEdAc'] ? 'X' : '',
        'voMedico.parEdAr': cb['voMedico.parEdAr'] ? 'X' : '',
        'voMedico.parEdAHp': cb['voMedico.parEdAHp'] ? 'X' : '',
        'voMedico.parEdAd': cb['voMedico.parEdAd'] ? 'X' : '',
        'voMedico.parEdAgu': cb['voMedico.parEdAgu'] ? 'X' : '',
        'voMedico.parEdAoal': cb['voMedico.parEdAoal'] ? 'X' : '',
        'voMedico.parEdAe': cb['voMedico.parEdAe'] ? 'X' : '',
        'voMedico.parEdSn': cb['voMedico.parEdSn'] ? 'X' : '',
        'voMedico.parEdOs': cb['voMedico.parEdOs'] ? 'X' : '',
        'voMedico.parEdEm': cb['voMedico.parEdEm'] ? 'X' : '',
        'voMedico.parEdOutro': cb['voMedico.parEdOutro'] ? 'X' : '',
        'voMedico.parRlExApres': exApres,
        'voMedico.parRlReqExComp': reqExComp,
        'fl_d_prev': fl_d_prev,
        'fl_limit': fl_limit,
        'fl_imped': fl_imped,
        'voResult.voParecerFinal.flPfinal': flPfinal,
        'voResult.voParecerFinal.qtDiasPm': dias,
        'voResult.voParecerFinal.dtIniPm': dtIni,
        'cdCidPm': cid1,
        'nmCidPm': descrCid1,
        'cdCid2Pm': cid2,
        'voResult.voParecerFinal.nmCidPm2': descrCid2,
        'voResult.voParecerFinal.cdCidPm': cid1,
        'voResult.voParecerFinal.nmCidPm': descrCid1,
        'voResult.voParecerFinal.cdCid2Pm': cid2,
        'voResult.voParecerFinal.nmCid2Pm': descrCid2,
        'voMedico.parRlComp': justif
    };

    const sub = document.getElementById('esislaSub')?.textContent || '';
    const id = (sub.match(/Atendimento\s+([^·]+)/i) || [])[1]?.trim() || enc?.id || st.atendimento || 'SEM_PROTOCOLO';
    const nomeServidor = enc?.paciente || st.paciente || aux.nomePaciente || '';

    const payloadResult = {
        protocolo: id,
        servidor: nomeServidor,
        paciente: nomeServidor,
        ...camposEsisla,
        campos_esisla: camposEsisla,
        campos_excedidos: camposExcedidos,
        inconsistencias_juridicas: inconsistenciasJuridicas,
        alerta_junta: alertaJunta,
        ficha_esisla_texto: texto,
        justificativa: justif,
        timestamp: new Date().toISOString()
    };

    try {
        localStorage.setItem('ambiental_esisla_current_payload', JSON.stringify(payloadResult));
        window.postMessage({ type: 'AMBIENTAL_ESISLA_PAYLOAD', payload: payloadResult }, '*');
    } catch(_) {}

    return payloadResult;
}

function gerarScriptAutoPreenchimentoEsisla(payloadObj) {
    const jsonStr = JSON.stringify(payloadObj, null, 2);
    return `(function() {
  try {
    var data = ${jsonStr};
    var campos = data.campos_esisla || data || {};
    
    function findDoc() {
      if (document.querySelector('textarea[name="voMedico.parRlCat"]') || document.getElementById('blocoGeral') || document.querySelector('input[name="fl_d_prev"]')) return document;
      for (var i = 0; i < window.frames.length; i++) {
        try {
          var d = window.frames[i].document;
          if (d && (d.querySelector('textarea[name="voMedico.parRlCat"]') || d.getElementById('blocoGeral') || d.querySelector('input[name="fl_d_prev"]'))) return d;
        } catch(_) {}
      }
      var iframes = document.querySelectorAll('iframe, frame');
      for (var j = 0; j < iframes.length; j++) {
        try {
          var idoc = iframes[j].contentDocument || iframes[j].contentWindow.document;
          if (idoc && (idoc.querySelector('textarea[name="voMedico.parRlCat"]') || idoc.getElementById('blocoGeral') || idoc.querySelector('input[name="fl_d_prev"]'))) return idoc;
        } catch(_) {}
      }
      return document;
    }
    
    var doc = findDoc();
    var win = doc.defaultView || window;
    
    function trigger(el) {
      if (!el) return;
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      } catch(_) {}
    }
    
    function setInput(sel, val) {
      if (val === undefined || val === null || val === '') return;
      var el = (typeof sel === 'string' && sel.startsWith('#')) ? doc.getElementById(sel.slice(1)) : doc.querySelector(sel);
      if (!el && typeof sel === 'string' && !sel.startsWith('#') && !sel.includes('[')) {
        el = doc.getElementById(sel) || doc.querySelector('[name="' + sel + '"]');
      }
      if (el) {
        if (el.hasAttribute('disabled')) el.removeAttribute('disabled');
        el.disabled = false;
        el.value = val;
        trigger(el);
      }
    }
    
    function setRadio(name, val, id) {
      if (!val) return;
      var el = id ? doc.getElementById(id) : null;
      if (!el) el = doc.querySelector('input[type="radio"][name="' + name + '"][value="' + val + '"]');
      if (el) {
        el.checked = true;
        try { el.click(); } catch(_) {}
        el.checked = true;
        trigger(el);
      }
    }
    
    function setCheckbox(name, id, checked) {
      var el = id ? doc.getElementById(id) : null;
      if (!el) el = doc.querySelector('input[type="checkbox"][name="' + name + '"]');
      if (el) {
        var shouldCheck = !!checked && checked !== '0' && checked !== 0;
        if (el.checked !== shouldCheck) {
          try { el.click(); } catch(_) { el.checked = shouldCheck; }
        }
        el.checked = shouldCheck;
        trigger(el);
      }
    }

    function sanitizeText(v, max) {
      if (!v) return '';
      var s = String(v);
      if (max && s.length > max) {
        console.warn('[e-SISLA F12 Auto] Campo truncado para caber no limite do Oracle (' + max + ' carac.):', s.slice(0, 30) + '...');
        return s.slice(0, max);
      }
      return s;
    }

    // 1. Textareas Principais (limites de 2.000 / 2.500 caracteres do e-SISLA)
    setInput('textarea[name="voMedico.parRlCat"]', sanitizeText(campos['voMedico.parRlCat'], 2000));
    setInput('textarea[name="voMedico.parRlAp"]', sanitizeText(campos['voMedico.parRlAp'], 2000));
    setInput('textarea[name="voMedico.parRlHda"]', sanitizeText(campos['voMedico.parRlHda'], 2500));
    
    // 2. Exame Físico Geral (Textarea e Checkboxes)
    var cbs = [
      { n: 'voMedico.parEdtcspf', id: 'idParEdtcspf' },
      { n: 'voMedico.parEdAc', id: 'idParEdAc' },
      { n: 'voMedico.parEdAr', id: 'idParEdAr' },
      { n: 'voMedico.parEdAHp', id: 'idParEdAHp' },
      { n: 'voMedico.parEdAd', id: 'idParEdAd' },
      { n: 'voMedico.parEdAgu', id: 'idParEdAgu' },
      { n: 'voMedico.parEdAoal', id: 'idParEdAoal' },
      { n: 'voMedico.parEdAe', id: 'idParEdAe' },
      { n: 'voMedico.parEdSn', id: 'idParEdSn' },
      { n: 'voMedico.parEdOs', id: 'idParEdOs' },
      { n: 'voMedico.parEdEm', id: 'idParEdEm' },
      { n: 'voMedico.parEdOutro', id: 'idParEdOutro' }
    ];
    var temAlgumMarcado = false;
    cbs.forEach(function(item) {
      var isChecked = !!(campos[item.n] || campos[item.id]);
      setCheckbox(item.n, item.id, isChecked);
      if (isChecked) {
        temAlgumMarcado = true;
      }
    });
    if (temAlgumMarcado && typeof win.exameApresentado === 'function') {
      try { win.exameApresentado(); } catch(_) {}
    }
    
    var exApres = doc.getElementById('idExameApres') || doc.querySelector('textarea[name="voMedico.parRlExApres"]');
    if (exApres) {
      exApres.removeAttribute('disabled');
      exApres.disabled = false;
    }
    setInput('textarea[name="voMedico.parRlExApres"]', sanitizeText(campos['voMedico.parRlExApres'], 2500));
    setInput('#idExameApres', sanitizeText(campos['voMedico.parRlExApres'], 2500));
    
    // 3. Descrição das Limitações
    setInput('textarea[name="voMedico.parRlReqExComp"]', sanitizeText(campos['voMedico.parRlReqExComp'], 2500));
    
    // 4. Médico Assistente - Não preencher CRM para evitar colar o CRM da perita
    setInput('input[name="voResult.strNomeMedico"]', sanitizeText(campos['voResult.strNomeMedico'], 60));
    
    // 5. Pressão Arterial e Pulso
    var sis = (campos['voMedico.lgPressArterialMax'] || campos['lgPressArterialMax'] || '').toString().replace(/\\D/g, '').slice(0, 3);
    var dia = (campos['voMedico.lgPressArterialMin'] || campos['lgPressArterialMin'] || '').toString().replace(/\\D/g, '').slice(0, 3);
    var pul = (campos['voMedico.lgPulsacao'] || campos['lgPulsacao'] || '').toString().replace(/\\D/g, '').slice(0, 3);
    setInput('input[name="voMedico.lgPressArterialMax"]', sis);
    setInput('input[name="lgPressArterialMax"]', sis);
    setInput('#sistolicaPressao', sis);
    setInput('input[name="voMedico.lgPressArterialMin"]', dia);
    setInput('input[name="lgPressArterialMin"]', dia);
    setInput('#diastolicaPressao', dia);
    setInput('input[name="voMedico.lgPulsacao"]', pul);
    setInput('input[name="lgPulsacao"]', pul);
    setInput('#pulsoPressao', pul);
    
    // 6. Biotipo (Altura formatada com vírgula, peso, IMC)
    var alt = campos['voMedico.lgAltura'] || campos['lgAltura'] || '';
    if (alt) {
      alt = String(alt).trim().replace(/[^\\d,\\.]/g, '');
      if (alt.includes('.')) alt = alt.replace('.', ',');
      else if (!alt.includes(',') && alt.length >= 3) alt = alt.slice(0, 1) + ',' + alt.slice(1, 3);
      alt = alt.slice(0, 4);
    }
    var peso = (campos['voMedico.lgPeso'] || campos['lgPeso'] || '').toString().replace(/\\D/g, '').slice(0, 3);
    setInput('input[name="voMedico.lgAltura"]', alt);
    setInput('input[name="lgAltura"]', alt);
    setInput('#alturaBiotipo', alt);
    setInput('input[name="voMedico.lgPeso"]', peso);
    setInput('input[name="lgPeso"]', peso);
    setInput('#pesoBiotipo', peso);
    if (typeof win.TextoIMC === 'function') {
      try { win.TextoIMC(); } catch(_) {}
    }
    if (typeof win.calcularIMC === 'function') {
      try { win.calcularIMC(); } catch(_) {}
    }
    
    // 7. Quesitos
    var q1 = campos['fl_d_prev'] || 'N';
    var q2 = campos['fl_limit'] || 'N';
    var q3 = campos['fl_imped'] || 'N';
    var parecerVal = campos['voResult.voParecerFinal.flPfinal'] || 'F';

    if (parecerVal === 'F' && q3 === 'N') {
      console.warn('[e-SISLA Alerta DPME] Incoerência: Parecer FAVORÁVEL com Quesito 3 NÃO detectado!');
    } else if (parecerVal === 'C' && q3 === 'S') {
      console.warn('[e-SISLA Alerta DPME] Incoerência: Parecer CONTRÁRIO com Quesito 3 SIM detectado!');
    }

    setRadio('fl_d_prev', q1, q1 === 'S' ? 'idFl_d_prevS' : 'idFl_d_prevN');
    if (typeof win.limpaCamposQuesitos === 'function') { try { win.limpaCamposQuesitos(q1); } catch(_) {} }
    setRadio('fl_limit', q2, q2 === 'S' ? 'idFl_limitS' : 'idFl_limitN');
    if (typeof win.limpaCamposQuesitos === 'function') { try { win.limpaCamposQuesitos(q2); } catch(_) {} }
    setRadio('fl_imped', q3, q3 === 'S' ? 'idFl_impedS' : 'idFl_impedN');
    if (typeof win.limpaCamposQuesitos === 'function') { try { win.limpaCamposQuesitos(q3); } catch(_) {} }

    // 8. Parecer Médico-Pericial (Suporta Radio e Checkbox do e-SISLA)
    function setParecerFinal(val) {
      var isFav = (val === 'F' || val === 'FAVORÁVEL' || val === 'Favorável');
      var targetVal = isFav ? 'F' : 'C';
      var targetId = isFav ? 'decPericialF' : 'decPericialC';
      var otherId = isFav ? 'decPericialC' : 'decPericialF';
      var targetName = 'voResult.voParecerFinal.flPfinal';

      function findInput(idPref, vPref, isFavFlag) {
        var el = doc.getElementById(idPref);
        if (!el) el = doc.getElementById(isFavFlag ? 'flPfinalF' : 'flPfinalC');
        if (!el) el = doc.getElementById(isFavFlag ? 'idFlPfinalF' : 'idFlPfinalC');
        if (!el) el = doc.querySelector('input[name="' + targetName + '"][value="' + vPref + '"]');
        if (!el) el = doc.querySelector('input[name*="flPfinal"][value="' + vPref + '"]');
        if (!el) el = doc.querySelector('input[name*="decPericial"][value="' + vPref + '"]');
        if (!el) {
          var labels = doc.querySelectorAll('label, span, td, b, font');
          var searchWord = isFavFlag ? 'Favor' : 'Contr';
          for (var k = 0; k < labels.length; k++) {
            var txt = (labels[k].textContent || '').trim();
            if (txt.indexOf(searchWord) !== -1) {
              var inp = labels[k].querySelector('input') || 
                        (labels[k].htmlFor ? doc.getElementById(labels[k].htmlFor) : null) ||
                        labels[k].previousElementSibling ||
                        labels[k].nextElementSibling;
              if (inp && (inp.tagName === 'INPUT' || (inp = inp.querySelector('input')))) {
                el = inp;
                break;
              }
            }
          }
        }
        return el;
      }

      var targetEl = findInput(targetId, targetVal, isFav);
      var otherEl = findInput(otherId, isFav ? 'C' : 'F', !isFav);

      if (otherEl) {
        otherEl.checked = false;
        trigger(otherEl);
      }

      if (targetEl) {
        if (targetEl.hasAttribute('disabled')) targetEl.removeAttribute('disabled');
        targetEl.disabled = false;
        if (!targetEl.checked) {
          try { targetEl.click(); } catch(_) {}
        }
        targetEl.checked = true;
        trigger(targetEl);
      }

      if (typeof win.mudaSituacao === 'function') { try { win.mudaSituacao(); } catch(_) {} }
      if (typeof win.escondeCampos === 'function') { try { win.escondeCampos(targetVal); } catch(_) {} }

      if (targetEl) {
        targetEl.checked = true;
        trigger(targetEl);
      }
      if (otherEl) {
        otherEl.checked = false;
      }

      var bFav = doc.getElementById('blocoFavoravel');
      var bJust = doc.getElementById('blocoJustificativa');
      if (isFav) {
        if (bFav) bFav.style.display = 'block';
        if (bJust && campos['voMedico.parRlComp']) bJust.style.display = 'block';
      } else {
        if (bFav) bFav.style.display = 'none';
        if (bJust) bJust.style.display = 'block';
      }
    }
    setParecerFinal(parecerVal);

    // 9. Concessão (Dias, Início, CIDs)
    var diasSol = (campos['voResult.voParecerFinal.qtDiasPm'] || '').toString().replace(/\D/g, '').slice(0, 3);
    var dtIniSol = sanitizeText(campos['voResult.voParecerFinal.dtIniPm'], 10);
    setInput('input[name="voResult.voParecerFinal.qtDiasPm"]', diasSol);
    setInput('#qtDiasPm', diasSol);
    setInput('input[name="voResult.voParecerFinal.dtIniPm"]', dtIniSol);
    if (typeof win.preenchePeriodo2 === 'function') {
      try { win.preenchePeriodo2(); } catch(_) {}
    }

    var cid1 = sanitizeText(campos['cdCidPm'] || campos['voResult.voParecerFinal.cdCidPm'], 5);
    var descrCid1 = sanitizeText(campos['nmCidPm'] || campos['voResult.voParecerFinal.nmCidPm'], 65);
    setInput('input[name="cdCidPm"]', cid1);
    setInput('input[name="voResult.voParecerFinal.cdCidPm"]', cid1);
    setInput('#cdCidPm', cid1);
    var elNmCid1 = doc.getElementById('nmCidPm') || doc.querySelector('input[name="nmCidPm"]') || doc.querySelector('input[name="voResult.voParecerFinal.nmCidPm"]');
    if (elNmCid1) {
      elNmCid1.removeAttribute('disabled');
      elNmCid1.disabled = false;
      elNmCid1.value = descrCid1;
      trigger(elNmCid1);
    }
    setInput('#descrCidx', descrCid1);
    if (cid1 && typeof win.carregaAjaxCid === 'function') {
      try { win.carregaAjaxCid('cdCidPm', 'nmCidPm'); } catch(_) {}
    }

    var cid2 = sanitizeText(campos['cdCid2Pm'] || campos['voResult.voParecerFinal.cdCid2Pm'], 5);
    var descrCid2 = sanitizeText(campos['voResult.voParecerFinal.nmCidPm2'] || campos['voResult.voParecerFinal.nmCid2Pm'] || campos['nmCidPm2'], 65);
    setInput('input[name="cdCid2Pm"]', cid2);
    setInput('input[name="voResult.voParecerFinal.cdCid2Pm"]', cid2);
    setInput('#cdCid2Pm', cid2);
    var elNmCid2 = doc.getElementById('nmCid2Pm') || doc.querySelector('input[name="voResult.voParecerFinal.nmCidPm2"]') || doc.querySelector('input[name="voResult.voParecerFinal.nmCid2Pm"]');
    if (elNmCid2) {
      elNmCid2.removeAttribute('disabled');
      elNmCid2.disabled = false;
      elNmCid2.value = descrCid2;
      trigger(elNmCid2);
    }
    setInput('#descrCid2x', descrCid2);
    if (cid2 && typeof win.carregaAjaxCid === 'function') {
      try { win.carregaAjaxCid('cdCid2Pm', 'nmCid2Pm'); } catch(_) {}
    }

    // 10. Justificativa Parecer Médico
    var elJust = doc.getElementById('justificaPericia') || doc.querySelector('textarea[name="voMedico.parRlComp"]');
    if (elJust) {
      elJust.removeAttribute('disabled');
      elJust.disabled = false;
    }
    setInput('textarea[name="voMedico.parRlComp"]', sanitizeText(campos['voMedico.parRlComp'], 2000));
    setInput('#justificaPericia', sanitizeText(campos['voMedico.parRlComp'], 2000));
    
    // 11. Rolar até o bloco geral para conferência do perito
    var bg = doc.getElementById('blocoGeral') || doc.querySelector('fieldset');
    if (bg) {
      bg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // 12. Alerta amigável
    alert("✅ e-Sisla: Todos os campos do laudo foram preenchidos com sucesso!\\n\\n📋 A perícia NÃO foi finalizada automaticamente para que você possa analisar e conferir todos os campos antes de concluir.");
  } catch(err) {
    alert("❌ Erro ao preencher campos do e-Sisla: " + err.message);
  }
})();`;
}

async function copyEsislaJson(){
    const text = document.getElementById('esislaText')?.value || '';
    if (!text) return;
    const jsonObj = gerarJsonEsisla(text, window.currentEsislaEnc);
    const prettyJson = JSON.stringify(jsonObj, null, 2);
    try {
        localStorage.setItem('ambiental_esisla_current_payload', prettyJson);
        window.postMessage({ type: 'AMBIENTAL_ESISLA_PAYLOAD', payload: jsonObj }, '*');
    } catch(_) {}
    try {
        await navigator.clipboard.writeText(prettyJson);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = prettyJson;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
    if (window.AmbientalUtils?.toast) {
        AmbientalUtils.toast('⚡ Ficha sincronizada com a Extensão e-SISLA! Na aba do e-SISLA, clique no botão flutuante para preencher.');
    } else {
        alert('⚡ Ficha sincronizada com a Extensão e-SISLA! Na aba do e-SISLA, clique no botão flutuante para preencher.');
    }
}

async function copyEsislaScript(){
    const text = document.getElementById('esislaText')?.value || '';
    if (!text) return;
    const jsonObj = gerarJsonEsisla(text, window.currentEsislaEnc);
    const scriptCode = gerarScriptAutoPreenchimentoEsisla(jsonObj);
    try {
        await navigator.clipboard.writeText(scriptCode);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = scriptCode;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
    if (window.AmbientalUtils?.toast) {
        AmbientalUtils.toast('Script copiado! Abra o e-Sisla, tecle F12, vá na aba Console e aperte Ctrl+V.');
    } else {
        alert('Script copiado! Abra o e-Sisla, tecle F12, vá na aba Console e aperte Ctrl+V.');
    }
}

function downloadEsislaJson(){
    const text = document.getElementById('esislaText')?.value || '';
    if (!text) return;
    const jsonObj = gerarJsonEsisla(text, window.currentEsislaEnc);
    const prettyJson = JSON.stringify(jsonObj, null, 2);
    const blob = new Blob([prettyJson], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const proto = (jsonObj.protocolo || 'atendimento').replace(/[^a-zA-Z0-9_\-]/g, '_');
    a.download = `Ficha-eSisla-${proto}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (window.AmbientalUtils?.toast) {
        AmbientalUtils.toast('Download da ficha e-Sisla (.json) iniciado com sucesso!');
    }
}

/* =========================================================
   GERAÇÃO DE PDF E-SISLA E GESTÃO / EXCLUSÃO DE BANCO
   ========================================================= */
const selectedAtdIds = new Set();

function toggleRowSelect(id, checked) {
  if (checked) {
    selectedAtdIds.add(String(id));
  } else {
    selectedAtdIds.delete(String(id));
  }
  updateBulkToolbar();
}

function toggleSelectAllRows(checked) {
  const cbs = document.querySelectorAll(".row-select-checkbox");
  cbs.forEach(cb => {
    cb.checked = checked;
    const id = cb.getAttribute("data-id");
    if (id) {
      if (checked) selectedAtdIds.add(String(id));
      else selectedAtdIds.delete(String(id));
    }
  });
  updateBulkToolbar();
}

function clearSelectedRows() {
  selectedAtdIds.clear();
  const selectAll = document.getElementById("selectAllCheckbox");
  if (selectAll) selectAll.checked = false;
  document.querySelectorAll(".row-select-checkbox").forEach(cb => { cb.checked = false; });
  updateBulkToolbar();
}

function updateBulkToolbar() {
  const bar = document.getElementById("bulkActionsToolbar");
  const badge = document.getElementById("selectedCountBadge");
  const count = selectedAtdIds.size;
  if (badge) badge.textContent = count;
  if (bar) {
    bar.style.display = count > 0 ? "flex" : "none";
  }
  const selectAll = document.getElementById("selectAllCheckbox");
  const cbs = document.querySelectorAll(".row-select-checkbox");
  if (selectAll && cbs.length > 0) {
    selectAll.checked = count > 0 && Array.from(cbs).every(cb => cb.checked);
  }
}

async function confirmBatchDeleteAdmin() {
  const ids = Array.from(selectedAtdIds);
  if (!ids.length) {
    alert("Selecione pelo menos um atendimento para excluir.");
    return;
  }
  const confirmMsg = `ATENÇÃO: Deseja realmente EXCLUIR PERMANENTEMENTE ${ids.length} atendimento(s) do banco de dados?\n\nEsta ação apagará definitivamente os atendimentos de teste e não poderá ser desfeita.`;
  if (!confirm(confirmMsg)) return;

  const btn = document.getElementById("btnBatchDeleteAdmin");
  if (btn) { btn.disabled = true; btn.textContent = "Excluindo..."; }

  try {
    const token = accessToken || await AmbientalAuth.getAccessToken();
    const res = await fetch("/api/admin/atendimentos/batch-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ ids: ids })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.error?.message || data?.detail || "Falha ao excluir atendimentos do banco.");
    }

    try {
      let locals = JSON.parse(localStorage.getItem(REGISTRY_KEY) || "[]");
      locals = locals.filter(item => !ids.includes(String(item.atendimento || item.id || "")));
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(locals));
      localItems = locals;
    } catch(e) {}

    selectedAtdIds.clear();
    updateBulkToolbar();
    if (window.AmbientalUtils?.toast) {
      AmbientalUtils.toast(data.data?.mensagem || `${ids.length} atendimento(s) excluído(s) com sucesso!`);
    } else {
      alert(data.data?.mensagem || `${ids.length} atendimento(s) excluído(s) com sucesso!`);
    }
    await fetchServer();
    refresh();
  } catch(err) {
    alert("Erro ao excluir: " + (err.message || err));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🗑️ Excluir Selecionados do Banco"; }
  }
}

async function confirmSingleDeleteAdmin(encId) {
  const id = decodeURIComponent(encId);
  const r = find(id);
  const patient = r ? (values(r).patient || id) : id;
  const confirmMsg = `ATENÇÃO: Deseja realmente EXCLUIR PERMANENTEMENTE o atendimento de "${patient}" (ID: ${id}) do banco de dados?\n\nEsta ação não poderá ser desfeita.`;
  if (!confirm(confirmMsg)) return;

  try {
    const token = accessToken || await AmbientalAuth.getAccessToken();
    const res = await fetch(`/api/admin/atendimentos/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.error?.message || data?.detail || "Falha ao excluir atendimento do banco.");
    }

    try {
      let locals = JSON.parse(localStorage.getItem(REGISTRY_KEY) || "[]");
      locals = locals.filter(item => String(item.atendimento || item.id || "") !== id);
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(locals));
      localItems = locals;
    } catch(e) {}

    selectedAtdIds.delete(id);
    updateBulkToolbar();
    if (window.AmbientalUtils?.toast) {
      AmbientalUtils.toast("Atendimento excluído permanentemente do banco de dados!");
    } else {
      alert("Atendimento excluído permanentemente do banco de dados!");
    }
    await fetchServer();
    refresh();
  } catch(err) {
    alert("Erro ao excluir: " + (err.message || err));
  }
}

function generateEsislaPDF() {
  const text = document.getElementById('esislaText')?.value || '';
  if (!text.trim()) {
    alert("Gere o conteúdo da ficha e-Sisla antes de imprimir ou salvar em PDF.");
    return;
  }
  const enc = window.currentEsislaEnc;
  const r = enc ? find(decodeURIComponent(enc)) : null;
  const v = r ? values(r) : {};
  const patient = v.patient || 'Servidor/Periciado';
  const cpf = v.cpf || '';
  const cargo = v.cargo || '';
  const dateStr = v.date ? date(v.date) : new Date().toLocaleDateString('pt-BR');
  const medico = v.doctor || '';
  const crm = v.crm || '';
  const atdId = v.atd || (r ? r.atendimento : '') || '';

  const win = window.open('', '_blank', 'width=900,height=800');
  if (!win) {
    alert("Pop-up bloqueado pelo navegador. Permita pop-ups para gerar o PDF.");
    return;
  }

  const escapeHtml = str => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const formattedText = escapeHtml(text);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Ficha Médico-Pericial e-Sisla - ${escapeHtml(patient)}</title>
  <style>
    @page { size: A4; margin: 18mm 15mm 18mm 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1e293b;
      margin: 0;
      padding: 24px;
      background: #fff;
    }
    .header {
      border-bottom: 2px solid #0F3254;
      padding-bottom: 12px;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header-titles h1 {
      font-size: 15pt;
      font-weight: 800;
      color: #0F3254;
      margin: 0 0 4px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-titles h2 {
      font-size: 11pt;
      font-weight: 600;
      color: #334155;
      margin: 0;
    }
    .meta-box {
      background: #F8FAFC;
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 20px;
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 8px 16px;
      font-size: 10pt;
    }
    .meta-item { display: flex; gap: 6px; }
    .meta-item strong { color: #0F3254; min-width: 80px; }
    .content-box {
      font-family: "Courier New", Courier, monospace;
      font-size: 10pt;
      line-height: 1.55;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 16px;
      white-space: pre-wrap;
      word-break: break-word;
      color: #0f172a;
    }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #CBD5E1;
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      color: #64748B;
    }
    .no-print {
      margin-bottom: 16px;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .btn-print {
      background: #0F3254;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11pt;
      cursor: pointer;
    }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
      .content-box { border: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Salvar como PDF / Imprimir</button>
  </div>
  <div class="header">
    <div class="header-titles">
      <h1>Diretoria de Perícias Médicas do Estado — DPME / SP</h1>
      <h2>Ficha Pericial e-Sisla — Avaliação Médico-Pericial</h2>
    </div>
    <div style="text-align:right;font-size:9pt;color:#64748B">
      <div>Data de Emissão: ${escapeHtml(dateStr)}</div>
      ${atdId ? `<div>Atendimento: <strong>${escapeHtml(atdId)}</strong></div>` : ''}
    </div>
  </div>

  <div class="meta-box">
    <div class="meta-item"><strong>Paciente:</strong> <span>${escapeHtml(patient)}</span></div>
    <div class="meta-item"><strong>CPF:</strong> <span>${escapeHtml(cpf || '—')}</span></div>
    <div class="meta-item"><strong>Cargo:</strong> <span>${escapeHtml(cargo || '—')}</span></div>
    <div class="meta-item"><strong>Médico:</strong> <span>${escapeHtml(medico || '—')} ${crm ? `(CRM: ${escapeHtml(crm)})` : ''}</span></div>
  </div>

  <div class="content-box">${formattedText}</div>

  <div class="footer">
    <span>Documento gerado automaticamente pelo Sistema Ambiental Perícias Médicas</span>
    <span>Padrão e-Sisla DPME/SP</span>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 400);
    });
  <\/script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

let lastSyncTimestamp = Date.now();
let isSyncing = false;
let autoSyncIntervalTimer = null;
let autoSyncUiTimer = null;
let previousFingerprint = '';
let previousTotalCount = 0;
let pendingRefreshTimer = null;

function computeDatasetFingerprint(items){
  if(!items || !items.length) return '0:empty';
  return items.length + ':' + items.slice(0, 50).map(r => (r.atendimento || r.id || '') + '@' + (r.atualizado_em || r.__registryAt || '') + '@' + (r.status || '')).join(',');
}

function updateSyncChipUi(){
  const sub = document.getElementById('syncSub');
  const title = document.getElementById('syncTitle');
  const chip = document.getElementById('syncChip');
  if(!sub || !title) return;
  if(isSyncing) return;
  if(window.lastFetchBackendSuccess === false){
    chip?.classList.add('offline');
    title.textContent = 'Offline / Local';
    sub.textContent = 'Reconectando em instantes...';
    return;
  }
  chip?.classList.remove('offline');
  title.textContent = 'Ao vivo';
  const elapsedSec = Math.max(0, Math.floor((Date.now() - lastSyncTimestamp) / 1000));
  if(elapsedSec < 15){
    sub.textContent = 'Atualizado agora';
  } else if(elapsedSec < 60){
    sub.textContent = `Atualizado há ${elapsedSec}s`;
  } else {
    try {
      const d = new Date(lastSyncTimestamp);
      sub.textContent = `Atualizado às ${d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}`;
    } catch(_) {
      sub.textContent = 'Sincronizado';
    }
  }
}

async function triggerRefresh(opts = true){
  const isManual = (opts === true || (typeof opts === 'object' && !(opts?.silent)));
  if(isSyncing) return;
  isSyncing = true;

  const refBtn = document.getElementById('refreshBtn');
  const admBtn = document.getElementById('adminRefreshBtn');
  const searchBtn = document.getElementById('searchRefreshBtn');
  const ico = admBtn?.querySelector('.refresh-ico');
  const searchIco = searchBtn?.querySelector('.refresh-ico');
  const bar = document.getElementById('topSyncBar');
  const chip = document.getElementById('syncChip');
  const title = document.getElementById('syncTitle');
  const sub = document.getElementById('syncSub');

  if(chip) chip.classList.add('syncing');
  if(refBtn) refBtn.classList.add('spinning');
  if(ico) ico.classList.add('spinning');
  if(searchIco) searchIco.classList.add('spinning');
  if(bar) bar.classList.add('active');
  if(title && isManual) title.textContent = 'Atualizando...';

  try {
    const prevFingerprint = previousFingerprint || computeDatasetFingerprint(serverItems);
    const prevCount = previousTotalCount || serverItems.length;

    const fetchResult = await fetchServer({ force: isManual });
    const hasDataChanged = fetchResult?.changed !== false;

    const newFingerprint = computeDatasetFingerprint(serverItems);
    const newCount = serverItems.length;
    const hasChanged = hasDataChanged && prevFingerprint && (prevFingerprint !== newFingerprint);

    previousFingerprint = newFingerprint;
    previousTotalCount = newCount;
    lastSyncTimestamp = Date.now();

    const isTyping = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

    if(hasChanged || isManual){
      if(isTyping && !isManual){
        if(pendingRefreshTimer) clearTimeout(pendingRefreshTimer);
        pendingRefreshTimer = setTimeout(() => {
          refresh();
          renderRecentHistory();
        }, 1200);
      } else {
        refresh();
        renderRecentHistory();
      }

      if(isManual){
        if(window.AmbientalUtils?.toast){
          AmbientalUtils.toast('Dados da gestão administrativa atualizados!');
        }
      } else if(hasChanged){
        if(prevCount > 0 && newCount > prevCount){
          const diff = newCount - prevCount;
          if(window.AmbientalUtils?.toast){
            AmbientalUtils.toast(`🔄 ${diff} novo(s) atendimento(s) sincronizado(s)!`, 'info');
          }
        } else if(prevCount > 0){
          if(window.AmbientalUtils?.toast){
            AmbientalUtils.toast('🔄 Atendimentos atualizados com novas alterações.', 'info');
          }
        }
      }
    } else {
      if(isManual && window.AmbientalUtils?.toast){
        AmbientalUtils.toast('Tudo em dia! Nenhum novo atendimento no momento.', 'info');
      }
    }

    if(window.lastFetchBackendSuccess !== false && chip){
      chip.classList.remove('offline');
    }
  } catch(e) {
    console.error('Erro na sincronização:', e);
    if(chip) chip.classList.add('offline');
    if(title) title.textContent = 'Offline';
    if(sub) sub.textContent = 'Tentando reconectar...';
    if(isManual && window.AmbientalUtils?.toast){
      AmbientalUtils.toast('Não foi possível sincronizar agora. O sistema tentará novamente.', 'error');
    }
  } finally {
    isSyncing = false;
    if(chip) chip.classList.remove('syncing');
    if(refBtn) refBtn.classList.remove('spinning');
    if(ico) ico.classList.remove('spinning');
    if(searchIco) searchIco.classList.remove('spinning');
    if(bar) bar.classList.remove('active');
    updateSyncChipUi();
  }
}

function initAutoSync(){
  if(autoSyncIntervalTimer) clearInterval(autoSyncIntervalTimer);
  if(autoSyncUiTimer) clearInterval(autoSyncUiTimer);

  previousFingerprint = computeDatasetFingerprint(serverItems);
  previousTotalCount = serverItems.length;
  lastSyncTimestamp = Date.now();
  updateSyncChipUi();

  autoSyncIntervalTimer = setInterval(async () => {
    if(document.visibilityState === 'hidden') return;
    await triggerRefresh({ silent: true, force: false });
  }, 60000);

  autoSyncUiTimer = setInterval(updateSyncChipUi, 5000);

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible'){
      if(Date.now() - lastSyncTimestamp > 30000){
        triggerRefresh({ silent: true, force: false });
      } else {
        updateSyncChipUi();
      }
    }
  });

  window.addEventListener('focus', () => {
    if(Date.now() - lastSyncTimestamp > 30000){
      triggerRefresh({ silent: true, force: false });
    } else {
      updateSyncChipUi();
    }
  });
}

const HISTORY_LABELS={
  '__ATENDIMENTO__':'Atendimento criado',
  'workflowStatus':'Status do atendimento',
  'motivo_transicao':'Motivo da alteração de status',
  'validation':'Validação do atendimento',
  'queixaDuracao':'Queixa e duração',
  'nomePaciente':'Nome do paciente',
  'cpfPaciente':'CPF do paciente',
  'crmResponsavel':'CRM/CRO do médico',
  'doencaMotivo':'Doença / motivo',
  'historicoPregresso':'Antecedentes mórbidos',
  'sintomasLimitacao':'Sintomas / limitações',
  'alteracoesClinicasExames':'Achados clínicos / exames',
  'descLimitacao':'Limitação funcional',
  'atividadesComprometidas':'Atividades comprometidas',
  'capacidade':'Capacidade funcional',
  'parecer':'Parecer',
  'justificativa':'Justificativa',
  'quesitos':'Quesitos',
  'documentosComplementares':'Documentos complementares',
  'workflow_status':'Status do atendimento'
};
const HISTORY_STATUS={RASCUNHO:'Rascunho',EM_REVISÃO:'Em revisão',REABERTO:'Reaberto',FINALIZADO:'Finalizado',ARQUIVADO:'Arquivado'};
function parseAuditValue(raw){
  if(raw===undefined||raw===null||raw==='') return '';
  if(typeof raw!=='string') return raw;
  try{return JSON.parse(raw)}catch{return raw}
}
function prettyAuditValue(raw, field=''){
  const v=parseAuditValue(raw);
  if(field==='workflowStatus'||field==='workflow_status') return HISTORY_STATUS[String(v)]||String(v||'Não informado');
  if(field==='validation'){
    if(v&&typeof v==='object'){
      const status=v.status||v.validation_status;
      const parts=[];
      if(status) parts.push(status==='CONCLUÍDA'?'Validação concluída':status);
      if(v.quesitos?.answered!==undefined) parts.push(`${v.quesitos.answered} quesitos respondidos`);
      if(v.score!==undefined) parts.push(`completude ${v.score}%`);
      if(v.blocking?.length) parts.push(`${v.blocking.length} pendência(s) bloqueante(s)`);
      return parts.join(' · ')||'Validação registrada';
    }
  }
  if(Array.isArray(v)) return `${v.length} registro(s) atualizado(s)`;
  if(v&&typeof v==='object'){
    if(v.nome) return String(v.nome);
    const keys=Object.keys(v);
    if(keys.length<=4) return keys.map(k=>`${HISTORY_LABELS[k]||k}: ${prettyAuditValue(v[k],k)}`).join(' · ');
    return 'Dados do atendimento atualizados';
  }
  const text=String(v);
  return text.length>700?text.slice(0,700)+'…':text;
}
function auditFieldLabel(field){return HISTORY_LABELS[field]||String(field||'Registro').replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,m=>m.toUpperCase())}
function renderAuditRows(rows, sourceLabel='Servidor', accessLogs=[]){
  if(!rows.length && !accessLogs.length) return `<div class="history-empty"><strong>Nenhuma alteração ou visualização registrada.</strong><div style="margin-top:6px">Este atendimento ainda não possui eventos de auditoria disponíveis.</div></div>`;
  const total=rows.length;
  const accessTotal=accessLogs.length;
  const people=[...new Set([...rows.map(x=>x.usuario_nome||'Sistema'), ...accessLogs.map(x=>x.usuario_nome||'Sistema')].filter(Boolean))];
  const last=rows[0]?.criado_em?dt(rows[0].criado_em):'—';
  const summary=`<div class="history-summary"><div class="history-kpi"><span>Alterações</span><b>${total}</b></div><div class="history-kpi"><span>Acessos LGPD</span><b>${accessTotal}</b></div><div class="history-kpi"><span>Última alteração</span><b>${esc(last)}</b></div><div class="history-kpi"><span>Usuários</span><b>${people.length}</b></div></div>`;
  
  let content = summary;
  if(rows.length){
    const events=rows.map((x,idx)=>{
      const field=x.campo||'Registro';
      const label=auditFieldLabel(field);
      const old=prettyAuditValue(x.valor_anterior,field);
      const next=prettyAuditValue(x.novo_valor,field);
      const actor=x.usuario_nome||'Sistema';
      let title=label, note='';
      if(field==='__ATENDIMENTO__'){title='Atendimento criado'; note='Registro inicial do atendimento no sistema.';}
      else if(field==='workflowStatus'||field==='workflow_status'){title='Status alterado'; note=`O atendimento passou de “${esc(old||'Não informado')}” para “${esc(next||'Não informado')}”.`;}
      else if(field==='motivo_transicao'){title='Motivo registrado'; note=next||old;}
      else if(field==='validation'){title='Validação realizada'; note=next||'A validação do atendimento foi registrada.';}
      return `<article class="event"><div class="event-head"><div><div class="event-title">${esc(title)}</div><div class="event-user">${esc(actor)}</div></div><div class="event-time">${esc(dt(x.criado_em))}</div></div>${note?`<div class="event-note">${esc(note)}</div>`:''}${!['__ATENDIMENTO__','motivo_transicao','validation'].includes(field)?`<div class="event-change"><strong>Alteração:</strong> ${esc(old||'não informado')} <span style="color:#8a98a7">→</span> <strong>${esc(next||'não informado')}</strong></div>`:''}<details style="margin-top:8px"><summary class="event-toggle">Ver detalhes técnicos</summary><div class="event-change" style="margin-top:7px"><div><strong>Campo:</strong> ${esc(field)}</div><div style="margin-top:5px"><strong>Antes:</strong> ${esc(old||'—')}</div><div style="margin-top:5px"><strong>Depois:</strong> ${esc(next||'—')}</div></div></details></article>`;
    }).join('');
    content += `<div class="history"><div style="font-weight:700;font-size:12px;color:#0F172A;margin-bottom:12px;display:flex;align-items:center;gap:6px"><span>📝 Histórico de Modificações</span></div><div class="timeline">${events}</div></div>`;
  }
  if(accessLogs.length){
    const accessEvents=accessLogs.map(a=>{
      const actor=a.usuario_nome||'Usuário';
      const role=a.usuario_perfil||'Não informado';
      const action=a.acao||'Visualização';
      const ip=a.ip||'—';
      const imp=a.is_impersonating?' <span style="display:inline-block;padding:1px 6px;border-radius:4px;background:#FEF3C7;color:#92400E;font-size:9px;font-weight:700">Impersonado</span>':'';
      return `<article class="event" style="border-left:3px solid #0284C7"><div class="event-head"><div><div class="event-title" style="color:#0284C7">🛡️ ${esc(action)}${imp}</div><div class="event-user">${esc(actor)} (${esc(role)})</div></div><div class="event-time">${esc(dt(a.criado_em))}</div></div><div class="event-change" style="margin-top:6px;background:#F0F9FF;border-color:#BAE6FD;font-size:10px">IP de Origem: <strong>${esc(ip)}</strong> · Rastreabilidade em conformidade com LGPD Art. 11 e CFM</div></article>`;
    }).join('');
    content += `<div class="history" style="border-top:1px solid #E2E8F0"><div style="font-weight:700;font-size:12px;color:#0F172A;margin-bottom:12px;display:flex;align-items:center;gap:6px"><span>🛡️ Acessos e Visualizações (LGPD / CFM)</span></div><div class="timeline">${accessEvents}</div></div>`;
  }
  return content;
}
async function openHistory(enc){
    const id=decodeURIComponent(enc);
    document.getElementById('historySub').textContent='Atendimento '+id+' · preparando histórico';
    document.getElementById('historyBody').innerHTML=`<div class="detail-open-skeleton"><div class="detail-open-skeleton-card"><div class="detail-open-loader"></div><strong>Carregando histórico</strong><span>Consultando as alterações e eventos registrados…</span></div></div>`;
    setModal('historyModal',true);
    await new Promise(r=>setTimeout(r,360));
    const localRecord=localItems.find(x=>String(x.atendimento)===id);
    if(localRecord){
        const rows=Array.isArray(localRecord.statusHistory)?localRecord.statusHistory.map(x=>({campo:x.campo||x.estado||'Evento',criado_em:x.criadoEm||x.criado_em,usuario_nome:x.usuario_nome||'Sistema local',valor_anterior:x.valor_anterior||'',novo_valor:x.motivo||x.novo_valor||x.estado||''})) :[];
        document.getElementById('historySub').textContent='Atendimento '+id+' · histórico local';
        document.getElementById('historyBody').innerHTML=renderAuditRows(rows,'Navegador');
        return;
    }
    try{
        const [histRes, auditRes]=await Promise.allSettled([
            AmbientalAuth.authFetch('/api/atendimentos/'+encodeURIComponent(id)+'/historico',{cache:'no-store',headers:{'Authorization':`Bearer ${accessToken}`}}),
            AmbientalAuth.authFetch('/api/atendimentos/'+encodeURIComponent(id)+'/auditoria',{cache:'no-store',headers:{'Authorization':`Bearer ${accessToken}`}})
        ]);
        let rows=[];
        let accessLogs=[];
        if(histRes.status==='fulfilled'&&histRes.value.ok){
            const d=await histRes.value.json();
            if(d.success) rows=Array.isArray(d?.data)?d.data:(d?.data?.items||[]);
        }
        if(auditRes.status==='fulfilled'&&auditRes.value.ok){
            const ad=await auditRes.value.json();
            if(ad.success) accessLogs=Array.isArray(ad?.data)?ad.data:(ad?.data?.items||[]);
        }
        document.getElementById('historySub').textContent='Atendimento '+id+' · auditoria e rastreabilidade (LGPD)';
        document.getElementById('historyBody').innerHTML=renderAuditRows(rows,'Servidor',accessLogs);
    }catch(e){
        document.getElementById('historyBody').innerHTML=`<div class="history-empty"><strong>Não foi possível carregar o histórico.</strong><div style="margin-top:6px">${esc(e.message||'Tente novamente.')}</div></div>`;
    }
}

let pendingAction=null;function openReason(action,enc){pendingAction={action,id:decodeURIComponent(enc)};document.getElementById('reasonInput').value='';document.getElementById('reasonTitle').textContent=action==='reopen'?'Reabrir atendimento':action==='restore'?'Restaurar atendimento':'Arquivar atendimento';document.getElementById('reasonInput').placeholder=action==='archive'?'Informe o motivo do arquivamento...':'Informe o motivo da ação...';setModal('reasonModal',true)}
function updateLocalState(id,target,motivo){const raw=localStorage.getItem(REGISTRY_KEY);const reg=raw?JSON.parse(raw):{};const rec=reg[id];if(!rec)return false;rec.workflowStatus=target;rec.finalizado=target==='FINALIZADO';rec.__status=target;rec.__registryAt=new Date().toISOString();rec.statusHistory=Array.isArray(rec.statusHistory)?rec.statusHistory:[];rec.statusHistory.push({estado:target,motivo,criadoEm:new Date().toISOString()});reg[id]=rec;localStorage.setItem(REGISTRY_KEY,JSON.stringify(reg));return true;}

document.getElementById('reasonConfirm').onclick=async()=>{ await authReady;
    if(!pendingAction)return;
    const motivo=document.getElementById('reasonInput').value.trim();
    if(!motivo){alert('Informe uma justificativa.');return;}
    const a=pendingAction;
    let target=a.action==='reopen'||a.action==='restore'?'REABERTO':'ARQUIVADO';
    const localRecord=localItems.find(x=>String(x.atendimento)===a.id);
    try{
        const remoteRecord = serverItems.find(x=>String(x.atendimento)===a.id && x.__source!=="local");
        if(localRecord && !remoteRecord){
            updateLocalState(a.id,target,motivo);
            closeModal('reasonModal');
            await fetchServer();
            refresh();
            return;
        }
        const r=await AmbientalAuth.authFetch('/api/atendimentos/'+encodeURIComponent(a.id)+'/state',{
            method:'POST',
            headers:{
                'Content-Type':'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body:JSON.stringify({estado:target,motivo})
        });
        const d=await r.json();
        if(!r.ok||!d.success)throw new Error(d?.error?.message||'A operação foi recusada pelo backend.');
        closeModal('reasonModal');
        await fetchServer();
        refresh();
    }catch(e){
        alert(e.message||'Falha ao atualizar estado.');
    }
};

/* =========================================================
   3. DOCUMENTAÇÃO E ATENDIMENTO AO SERVIDOR (GESTÃO):
   - COMPROVANTE DE COMPARECIMENTO À PERÍCIA MÉDICA
   - BOOKMARKLET INTELIGENTE DO E-SISLA (ADEUS F12)
   ========================================================= */

function formatarDataPorExtensoGestao(dataStr) {
  if (!dataStr) return '—';
  const partes = String(dataStr).slice(0, 10).split('-');
  if (partes.length === 3) {
    const dia = parseInt(partes[2], 10);
    const mesIdx = parseInt(partes[1], 10) - 1;
    const ano = partes[0];
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    return `${dia} de ${meses[mesIdx] || 'janeiro'} de ${ano}`;
  }
  return dataStr;
}

window.currentComprovanteAtd = null;

function abrirComprovanteDoDetail() {
  if (window.currentDetailFull) {
    abrirModalComprovanteGestao(window.currentDetailFull);
  } else if (window.currentDetailEnc) {
    const id = decodeURIComponent(window.currentDetailEnc);
    const r = find(id);
    if (r) abrirModalComprovanteGestao(r);
  }
}

function abrirModalComprovanteGestao(encOrObj) {
  let item = encOrObj;
  if (typeof encOrObj === 'string') {
    const id = decodeURIComponent(encOrObj);
    item = find(id) || window.currentDetailFull;
  }
  if (!item) {
    alert('Atendimento não localizado para gerar declaração.');
    return;
  }
  window.currentComprovanteAtd = item;
  const v = values(item);

  const horaInicioVal = v.time || (item.aux && item.aux.horaAtd) || '08:00';
  let horaSaidaVal = '';
  if (horaInicioVal) {
    const partes = horaInicioVal.split(':');
    if (partes.length === 2) {
      let minTot = parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10) + 45;
      horaSaidaVal = `${String(Math.floor(minTot / 60) % 24).padStart(2, '0')}:${String(minTot % 60).padStart(2, '0')}`;
    }
  }
  if (!horaSaidaVal) horaSaidaVal = '08:45';

  const dataAtdVal = v.date || (item.aux && item.aux.dataAtd) || '';

  const inHoraEntrada = document.getElementById('comprovanteHoraEntradaGestao');
  const inHoraSaida = document.getElementById('comprovanteHoraSaidaGestao');
  const inDataPericia = document.getElementById('comprovanteDataPericiaGestao');
  const inIncluirCid = document.getElementById('comprovanteIncluirCidGestao');
  const inObs = document.getElementById('comprovanteObsGestao');

  if (inHoraEntrada) inHoraEntrada.value = horaInicioVal;
  if (inHoraSaida) inHoraSaida.value = horaSaidaVal;
  if (inDataPericia) inDataPericia.value = dataAtdVal ? String(dataAtdVal).slice(0, 10) : '';
  if (inIncluirCid) inIncluirCid.checked = false;
  if (inObs) inObs.value = '';

  atualizarPreviewComprovanteGestao();
  setModal('comprovanteModal', true);
}

function obterDadosComprovanteGestao() {
  const item = window.currentComprovanteAtd || window.currentDetailFull || {};
  const v = values(item);
  const a = item.aux || {};

  const horaEntrada = document.getElementById('comprovanteHoraEntradaGestao')?.value || v.time || a.horaAtd || '08:00';
  const horaSaida = document.getElementById('comprovanteHoraSaidaGestao')?.value || '08:45';
  const dataPericia = document.getElementById('comprovanteDataPericiaGestao')?.value || v.date || a.dataAtd || '';
  const incluirCid = document.getElementById('comprovanteIncluirCidGestao')?.checked || false;
  const observacoes = document.getElementById('comprovanteObsGestao')?.value?.trim() || '';

  return {
    protocolo: v.atd || item.atendimento || 'SEM-PROTOCOLO',
    nomeServidor: v.patient || a.nomePaciente || item.nomePaciente || 'Servidor(a) não informado',
    cpfServidor: v.cpf || a.cpfPaciente || item.cpfPaciente || '',
    cargo: (v.cargo && v.cargo !== '—') ? v.cargo : (a.cargo || 'Servidor Público Estadual'),
    dataPericia: dataPericia,
    horaEntrada: horaEntrada,
    horaSaida: horaSaida,
    medicoPerito: (v.doctor && v.doctor !== '—') ? v.doctor : (item.medico || a.medicoResponsavel || 'Médico Perito Oficial'),
    crmPerito: v.crm || a.crmResponsavel || '',
    cid: v.cid || a.cid || '',
    cidDescricao: (item.payload && item.payload.cidDescricao) || '',
    incluirCid: incluirCid,
    observacoes: observacoes
  };
}

function gerarHTMLComprovanteComparecimentoGestao(d) {
  const dataExtenso = formatarDataPorExtensoGestao(d.dataPericia || new Date().toISOString().slice(0, 10));
  const cidBloco = d.incluirCid && d.cid
    ? `<div style="margin-top:14px;padding:10px 14px;background:#EFF6FF;border:1px solid #93C5FD;border-radius:6px;font-size:10.5pt;color:#1E40AF">
         <strong>Diagnóstico informado a pedido expresso do(a) servidor(a) (Resoluções CFM nº 1.658/2002 e 1.851/2008):</strong><br>
         CID: <strong>${esc(d.cid)}</strong> ${d.cidDescricao ? `— ${esc(d.cidDescricao)}` : ''}
       </div>`
    : `<div style="margin-top:14px;padding:9px 12px;background:#F8FAFC;border-left:3px solid #0F3254;font-size:9.5pt;color:#475569;line-height:1.4">
         <strong>Cláusula de Sigilo Médico Pericial:</strong> Em cumprimento às Resoluções CFM nº 1.658/2002 e 1.851/2008 e ao Código de Ética Médica, o diagnóstico (CID) e dados clínicos detalhados são preservados sob sigilo profissional, sendo este documento suficiente e hábil para fins de justificativa funcional de comparecimento.
       </div>`;

  const obsBloco = d.observacoes
    ? `<div style="margin-top:12px;padding:8px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;font-size:10pt"><strong>Observações:</strong> ${esc(d.observacoes)}</div>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Declaração de Comparecimento Pericial - ${esc(d.nomeServidor)}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 20mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1E293B; background: #fff; margin: 0; padding: 12px; font-size: 11pt; line-height: 1.6; }
    .comprovante-wrapper { max-width: 190mm; margin: 0 auto; padding: 26px 30px; border: 2px solid #0F3254; border-radius: 8px; position: relative; }
    .header-box { text-align: center; border-bottom: 2px solid #0F3254; padding-bottom: 14px; margin-bottom: 20px; }
    .header-inst { font-size: 10pt; font-weight: 800; color: #0F3254; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
    .header-sub { font-size: 8.5pt; color: #475569; margin: 2px 0 0; text-transform: uppercase; font-weight: 600; }
    .header-title { font-size: 14.5pt; font-weight: 900; color: #073F87; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: 0.02em; }
    .header-meta { font-size: 9pt; color: #64748B; }
    .declaracao-texto { text-align: justify; font-size: 11pt; line-height: 1.7; margin: 18px 0; color: #0F172A; }
    .dados-card { background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; padding: 14px 18px; margin: 18px 0; }
    .d-row { display: flex; margin-bottom: 8px; font-size: 10.5pt; }
    .d-row:last-child { margin-bottom: 0; }
    .d-label { width: 180px; font-weight: 700; color: #334155; flex-shrink: 0; }
    .d-val { color: #0F172A; font-weight: 600; flex: 1; }
    .data-local { text-align: right; margin: 30px 0 40px; font-size: 11pt; color: #334155; }
    .assinatura-box { text-align: center; margin-top: 35px; break-inside: avoid; }
    .assinatura-linha { width: 340px; margin: 0 auto 6px; border-top: 1.5px solid #0F172A; }
    .assinatura-nome { font-weight: 800; font-size: 11pt; color: #0F172A; }
    .assinatura-sub { font-size: 9.5pt; color: #475569; }
    .doc-footer { margin-top: 30px; padding-top: 10px; border-top: 1px dashed #CBD5E1; font-size: 8pt; color: #64748B; text-align: center; line-height: 1.4; }
    .no-print { margin-bottom: 16px; display: flex; justify-content: flex-end; gap: 10px; }
    .btn-print { background: #073F87; color: #fff; border: none; padding: 9px 20px; font-weight: 700; border-radius: 6px; cursor: pointer; font-size: 13px; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
      .comprovante-wrapper { border: 1.5px solid #0F3254; padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir Agora</button>
    <button class="btn-print" style="background:#64748B" onclick="window.close()">✖ Fechar</button>
  </div>
  <div class="comprovante-wrapper">
    <div class="header-box">
      <div class="header-inst">GOVERNO DO ESTADO DE SÃO PAULO</div>
      <div class="header-sub">SECRETARIA DE GESTÃO E GOVERNO DIGITAL • DEPARTAMENTO DE PERÍCIAS MÉDICAS DO ESTADO (DPME)</div>
      <div class="header-title">DECLARAÇÃO DE COMPARECIMENTO À PERÍCIA MÉDICA</div>
      <div class="header-meta">Atendimento Pericial Nº: <strong>${esc(d.protocolo || "—")}</strong></div>
    </div>

    <div class="declaracao-texto">
      Declaramos, para os devidos fins de comprovação e justificativa funcional junto à unidade administrativa e/ou repartição de lotação de exercício, que o(a) servidor(a) público(a) abaixo qualificado(a) compareceu a esta Unidade Pericial Médica Oficial no dia e horários abaixo discriminados, a fim de submeter-se a avaliação médico-pericial oficial:
    </div>

    <div class="dados-card">
      <div class="d-row">
        <span class="d-label">Nome do(a) Servidor(a):</span>
        <span class="d-val">${esc(d.nomeServidor || "—")}</span>
      </div>
      <div class="d-row">
        <span class="d-label">CPF:</span>
        <span class="d-val">${esc(d.cpfServidor || "—")}</span>
      </div>
      <div class="d-row">
        <span class="d-label">Cargo / Função:</span>
        <span class="d-val">${esc(d.cargo || "—")}</span>
      </div>
      <div class="d-row">
        <span class="d-label">Data do Comparecimento:</span>
        <span class="d-val">${esc(date(d.dataPericia) || '—')}</span>
      </div>
      <div class="d-row">
        <span class="d-label">Horário de Permanência:</span>
        <span class="d-val">Entrada: <strong>${esc(d.horaEntrada || "—")}</strong> &nbsp;|&nbsp; Saída: <strong>${esc(d.horaSaida || "—")}</strong></span>
      </div>
      <div class="d-row">
        <span class="d-label">Finalidade:</span>
        <span class="d-val">Perícia Médica Oficial para fins de Licença para Tratamento de Saúde (LTS - Art. 191/193 da Lei Estadual nº 10.261/1968).</span>
      </div>
    </div>

    ${cidBloco}
    ${obsBloco}

    <div class="data-local">
      São Paulo, ${dataExtenso}.
    </div>

    <div class="assinatura-box">
      <div class="assinatura-linha"></div>
      <div class="assinatura-nome">Dr(a). ${esc(d.medicoPerito || "Médico(a) Perito(a)")}</div>
      <div class="assinatura-sub">Médico(a) Perito(a) Oficial ${d.crmPerito ? `— CRM: ${esc(d.crmPerito)}` : ''}</div>
    </div>

    <div class="doc-footer">
      <strong>Aviso Legal:</strong> Esta declaração atesta estritamente o comparecimento do(a) servidor(a) no período acima discriminado para realização do ato pericial. Não constitui decisão ou concessão de licença, cuja publicação é de competência do DPME em Diário Oficial do Estado (DOE).
    </div>
  </div>
</body>
</html>`;
}

function atualizarPreviewComprovanteGestao() {
  const d = obterDadosComprovanteGestao();
  const box = document.getElementById('comprovanteLivePreviewGestao');
  if (!box) return;

  const dataExtenso = formatarDataPorExtensoGestao(d.dataPericia || new Date().toISOString().slice(0, 10));
  const cidAlert = d.incluirCid && d.cid
    ? `<div style="margin-top:12px;padding:8px 12px;background:#EFF6FF;border:1px solid #93C5FD;border-radius:6px;font-size:11px;color:#1E40AF">
         <strong>Diagnóstico informado a pedido expresso do(a) servidor(a):</strong> CID ${esc(d.cid)} ${d.cidDescricao ? `— ${esc(d.cidDescricao)}` : ''}
       </div>`
    : `<div style="margin-top:12px;padding:8px 10px;background:#F8FAFC;border-left:3px solid #0F3254;font-size:10.5px;color:#475569">
         <em>Sigilo Médico Pericial (Resoluções CFM nº 1.658/2002 e 1.851/2008): Diagnóstico preservado sob sigilo profissional.</em>
       </div>`;

  const obsAlert = d.observacoes ? `<div style="margin-top:8px;font-size:11px;color:#334155"><strong>Obs:</strong> ${esc(d.observacoes)}</div>` : '';

  box.innerHTML = `
    <div style="text-align:center;border-bottom:2px solid #0F3254;padding-bottom:10px;margin-bottom:14px">
      <div style="font-size:10px;font-weight:800;color:#0F3254;letter-spacing:0.04em">GOVERNO DO ESTADO DE SÃO PAULO • DPME</div>
      <div style="font-size:13px;font-weight:900;color:#073F87;margin:4px 0">DECLARAÇÃO DE COMPARECIMENTO À PERÍCIA MÉDICA</div>
      <div style="font-size:10px;color:#64748B">Atendimento Pericial Nº: <strong>${esc(d.protocolo)}</strong></div>
    </div>
    <p style="font-size:12px;line-height:1.5;margin:0 0 10px;text-align:justify">
      Declaramos que o(a) servidor(a) público(a) <strong>${esc(d.nomeServidor)}</strong>, CPF <strong>${esc(d.cpfServidor || 'não informado')}</strong>, cargo <strong>${esc(d.cargo)}</strong>, compareceu a esta Unidade Pericial Médica Oficial no dia <strong>${esc(date(d.dataPericia) || '—')}</strong>, com permanência das <strong>${esc(d.horaEntrada)}</strong> às <strong>${esc(d.horaSaida)}</strong>, para fins de Perícia Médica Oficial (LTS - Art. 191/193 Lei 10.261/68).
    </p>
    ${cidAlert}
    ${obsAlert}
    <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:flex-end">
      <span style="font-size:11px;color:#475569">São Paulo, ${dataExtenso}.</span>
      <div style="text-align:center">
        <div style="width:200px;border-top:1px solid #1E293B;margin-bottom:4px"></div>
        <strong style="font-size:11px;display:block">${esc(d.medicoPerito)}</strong>
        <span style="font-size:9.5px;color:#64748B">Médico(a) Perito(a) ${d.crmPerito ? `CRM ${esc(d.crmPerito)}` : ''}</span>
      </div>
    </div>
  `;

  const cidBox = document.getElementById('comprovanteCidBoxGestao');
  const cidTexto = document.getElementById('comprovanteCidTextoGestao');
  if (cidBox && cidTexto) {
    if (d.incluirCid) {
      cidBox.style.display = 'block';
      cidTexto.textContent = d.cid ? `${d.cid} ${d.cidDescricao ? '— ' + d.cidDescricao : ''}` : '(Sem CID informado)';
    } else {
      cidBox.style.display = 'none';
    }
  }
}

function imprimirComprovanteGestao() {
  const d = obterDadosComprovanteGestao();
  const html = gerarHTMLComprovanteComparecimentoGestao(d);
  const w = window.open('', '_blank');
  if (!w) {
    alert('O navegador bloqueou a janela de impressão. Permita pop-ups.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

function copiarTextoComprovanteGestao() {
  const d = obterDadosComprovanteGestao();
  const dataExtenso = formatarDataPorExtensoGestao(d.dataPericia || new Date().toISOString().slice(0, 10));
  const cidTexto = d.incluirCid && d.cid
    ? `Diagnóstico informado a pedido expresso do(a) servidor(a): CID ${d.cid}${d.cidDescricao ? ' — ' + d.cidDescricao : ''}\n`
    : `Cláusula de Sigilo Médico Pericial (Resoluções CFM nº 1.658/2002 e 1.851/2008): O diagnóstico é preservado sob sigilo profissional.\n`;

  const texto = `DECLARAÇÃO DE COMPARECIMENTO À PERÍCIA MÉDICA
Governo do Estado de São Paulo — DPME / Ambiental Saúde
Atendimento Nº: ${d.protocolo}

Declaramos, para os devidos fins de comprovação e justificativa funcional junto à repartição de trabalho, que o(a) servidor(a) público(a) ${d.nomeServidor}, portador(a) do CPF ${d.cpfServidor || 'não informado'}, ocupante do cargo de ${d.cargo}, compareceu a esta Unidade Pericial Médica Oficial no dia ${date(d.dataPericia)}, com horário de permanência das ${d.horaEntrada} às ${d.horaSaida}, a fim de submeter-se a Exame Médico-Pericial Oficial para fins de Licença para Tratamento de Saúde (LTS - Art. 191/193 da Lei nº 10.261/1968).

${cidTexto}${d.observacoes ? 'Observações: ' + d.observacoes + '\n' : ''}
São Paulo, ${dataExtenso}.

_____________________________________________
Dr(a). ${d.medicoPerito}
Médico(a) Perito(a) Oficial ${d.crmPerito ? '— CRM: ' + d.crmPerito : ''}
`;

  navigator.clipboard.writeText(texto).then(() => {
    if (window.AmbientalUtils?.toast) {
      AmbientalUtils.toast('Declaração copiada com sucesso!');
    } else {
      alert('Declaração copiada com sucesso!');
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    alert('Declaração copiada com sucesso!');
  });
}

function gerarCodigoBookmarkletEsislaUniversal() {
  const scriptBody = `(function(){
  function findDoc(){
    if(document.querySelector('textarea[name="voMedico.parRlCat"]')||document.getElementById('blocoGeral')||document.querySelector('input[name="fl_d_prev"]'))return document;
    for(var i=0;i<window.frames.length;i++){
      try{var d=window.frames[i].document;if(d&&(d.querySelector('textarea[name="voMedico.parRlCat"]')||d.getElementById('blocoGeral')||d.querySelector('input[name="fl_d_prev"]')))return d;}catch(_){}
    }
    var ifrs=document.querySelectorAll('iframe,frame');
    for(var j=0;j<ifrs.length;j++){
      try{var idoc=ifrs[j].contentDocument||ifrs[j].contentWindow.document;if(idoc&&(idoc.querySelector('textarea[name="voMedico.parRlCat"]')||idoc.getElementById('blocoGeral')||idoc.querySelector('input[name="fl_d_prev"]')))return idoc;}catch(_){}
    }
    return document;
  }
  function sanitizeText(v,max){if(!v)return '';var s=String(v);if(max&&s.length>max)return s.slice(0,max);return s;}
  function preencherEsislaComDados(data){
    var doc=findDoc();var win=doc.defaultView||window;
    var campos=data.campos_esisla||data||{};
    function trigger(el){if(!el)return;try{el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));}catch(_){}}
    function setInput(sel,val){if(val===undefined||val===null||val==='')return;var el=(typeof sel==='string'&&sel.startsWith('#'))?doc.getElementById(sel.slice(1)):doc.querySelector(sel);if(!el&&typeof sel==='string'&&!sel.startsWith('#')&&!sel.includes('[')){el=doc.getElementById(sel)||doc.querySelector('[name="'+sel+'"]');}if(el){if(el.hasAttribute('disabled'))el.removeAttribute('disabled');el.disabled=false;el.value=val;trigger(el);}}
    function setRadio(name,val,id){if(!val)return;var el=id?doc.getElementById(id):null;if(!el)el=doc.querySelector('input[type="radio"][name="'+name+'"][value="'+val+'"]');if(el){el.checked=true;try{el.click();}catch(_){}el.checked=true;trigger(el);}}
    function setCheckbox(name,id,checked){var el=id?doc.getElementById(id):null;if(!el)el=doc.querySelector('input[type="checkbox"][name="'+name+'"]');if(el){var sc=!!checked&&checked!=='0'&&checked!==0;if(el.checked!==sc){try{el.click();}catch(_){el.checked=sc;}}el.checked=sc;trigger(el);}}
    setInput('textarea[name="voMedico.parRlCat"]',sanitizeText(campos['voMedico.parRlCat'],2000));
    setInput('textarea[name="voMedico.parRlAp"]',sanitizeText(campos['voMedico.parRlAp'],2000));
    setInput('textarea[name="voMedico.parRlHda"]',sanitizeText(campos['voMedico.parRlHda'],2500));
    // CRM do assistente não é preenchido para evitar colar o CRM da perita
    setInput('input[name="voResult.strNomeMedico"]',sanitizeText(campos['voResult.strNomeMedico'],60));
    var sis=(campos['voMedico.lgPressArterialMax']||campos['lgPressArterialMax']||'').toString().replace(/\\D/g,'').slice(0,3);
    var dia=(campos['voMedico.lgPressArterialMin']||campos['lgPressArterialMin']||'').toString().replace(/\\D/g,'').slice(0,3);
    var pul=(campos['voMedico.lgPulsacao']||campos['lgPulsacao']||'').toString().replace(/\\D/g,'').slice(0,3);
    setInput('input[name="voMedico.lgPressArterialMax"]',sis);setInput('input[name="lgPressArterialMax"]',sis);setInput('#sistolicaPressao',sis);
    setInput('input[name="voMedico.lgPressArterialMin"]',dia);setInput('input[name="lgPressArterialMin"]',dia);setInput('#diastolicaPressao',dia);
    setInput('input[name="voMedico.lgPulsacao"]',pul);setInput('input[name="lgPulsacao"]',pul);setInput('#pulsoPressao',pul);
    var alt=campos['voMedico.lgAltura']||campos['lgAltura']||'';
    if(alt){alt=String(alt).trim().replace(/[^\\d,\\.]/g,'');if(alt.includes('.'))alt=alt.replace('.',',');else if(!alt.includes(',')&&alt.length>=3)alt=alt.slice(0,1)+','+alt.slice(1,3);alt=alt.slice(0,4);}
    var peso=(campos['voMedico.lgPeso']||campos['lgPeso']||'').toString().replace(/\\D/g,'').slice(0,3);
    setInput('input[name="voMedico.lgAltura"]',alt);setInput('input[name="lgAltura"]',alt);setInput('#alturaBiotipo',alt);
    setInput('input[name="voMedico.lgPeso"]',peso);setInput('input[name="lgPeso"]',peso);setInput('#pesoBiotipo',peso);
    if(typeof win.TextoIMC==='function'){try{win.TextoIMC();}catch(_){}}
    var cbs=[{n:'voMedico.parEdtcspf',id:'idParEdtcspf'},{n:'voMedico.parEdAc',id:'idParEdAc'},{n:'voMedico.parEdAr',id:'idParEdAr'},{n:'voMedico.parEdAHp',id:'idParEdAHp'},{n:'voMedico.parEdAd',id:'idParEdAd'},{n:'voMedico.parEdAgu',id:'idParEdAgu'},{n:'voMedico.parEdAoal',id:'idParEdAoal'},{n:'voMedico.parEdAe',id:'idParEdAe'},{n:'voMedico.parEdSn',id:'idParEdSn'},{n:'voMedico.parEdOs',id:'idParEdOs'},{n:'voMedico.parEdEm',id:'idParEdEm'},{n:'voMedico.parEdOutro',id:'idParEdOutro'}];
    var temAlgum=false;cbs.forEach(function(item){var chk=!!(campos[item.n]||campos[item.id]);setCheckbox(item.n,item.id,chk);if(chk){temAlgum=true;}});
    if(temAlgum&&typeof win.exameApresentado==='function'){try{win.exameApresentado();}catch(_){}}
    var exApres=doc.getElementById('idExameApres')||doc.querySelector('textarea[name="voMedico.parRlExApres"]');
    if(exApres){exApres.removeAttribute('disabled');exApres.disabled=false;}
    setInput('textarea[name="voMedico.parRlExApres"]',sanitizeText(campos['voMedico.parRlExApres'],2500));setInput('#idExameApres',sanitizeText(campos['voMedico.parRlExApres'],2500));
    setInput('textarea[name="voMedico.parRlReqExComp"]',sanitizeText(campos['voMedico.parRlReqExComp'],2500));
    var q1=campos['fl_d_prev']||'N';var q2=campos['fl_limit']||'N';var q3=campos['fl_imped']||'N';
    setRadio('fl_d_prev',q1,q1==='S'?'idFl_d_prevS':'idFl_d_prevN');if(typeof win.limpaCamposQuesitos==='function'){try{win.limpaCamposQuesitos(q1);}catch(_){}}
    setRadio('fl_limit',q2,q2==='S'?'idFl_limitS':'idFl_limitN');if(typeof win.limpaCamposQuesitos==='function'){try{win.limpaCamposQuesitos(q2);}catch(_){}}
    setRadio('fl_imped',q3,q3==='S'?'idFl_impedS':'idFl_impedN');if(typeof win.limpaCamposQuesitos==='function'){try{win.limpaCamposQuesitos(q3);}catch(_){}}
    var parecerVal=campos['voResult.voParecerFinal.flPfinal']||'F';
    function setParecerFinal(val) {
      var isFav = (val === 'F' || val === 'FAVORÁVEL' || val === 'Favorável');
      var targetVal = isFav ? 'F' : 'C';
      var targetId = isFav ? 'decPericialF' : 'decPericialC';
      var otherId = isFav ? 'decPericialC' : 'decPericialF';
      var targetName = 'voResult.voParecerFinal.flPfinal';
      function findInput(idPref, vPref, isFavFlag) {
        var el = doc.getElementById(idPref);
        if (!el) el = doc.getElementById(isFavFlag ? 'flPfinalF' : 'flPfinalC');
        if (!el) el = doc.getElementById(isFavFlag ? 'idFlPfinalF' : 'idFlPfinalC');
        if (!el) el = doc.querySelector('input[name="' + targetName + '"][value="' + vPref + '"]');
        if (!el) el = doc.querySelector('input[name*="flPfinal"][value="' + vPref + '"]');
        if (!el) el = doc.querySelector('input[name*="decPericial"][value="' + vPref + '"]');
        if (!el) {
          var labels = doc.querySelectorAll('label, span, td, b, font');
          var searchWord = isFavFlag ? 'Favor' : 'Contr';
          for (var k = 0; k < labels.length; k++) {
            var txt = (labels[k].textContent || '').trim();
            if (txt.indexOf(searchWord) !== -1) {
              var inp = labels[k].querySelector('input') || 
                        (labels[k].htmlFor ? doc.getElementById(labels[k].htmlFor) : null) ||
                        labels[k].previousElementSibling ||
                        labels[k].nextElementSibling;
              if (inp && (inp.tagName === 'INPUT' || (inp = inp.querySelector('input')))) {
                el = inp;
                break;
              }
            }
          }
        }
        return el;
      }
      var targetEl = findInput(targetId, targetVal, isFav);
      var otherEl = findInput(otherId, isFav ? 'C' : 'F', !isFav);
      if (otherEl) { otherEl.checked = false; trigger(otherEl); }
      if (targetEl) {
        if (targetEl.hasAttribute('disabled')) targetEl.removeAttribute('disabled');
        targetEl.disabled = false;
        if (!targetEl.checked) { try { targetEl.click(); } catch(_) {} }
        targetEl.checked = true;
        trigger(targetEl);
      }
      if (typeof win.mudaSituacao === 'function') { try { win.mudaSituacao(); } catch(_) {} }
      if (typeof win.escondeCampos === 'function') { try { win.escondeCampos(targetVal); } catch(_) {} }
      if (targetEl) { targetEl.checked = true; trigger(targetEl); }
      if (otherEl) { otherEl.checked = false; }
      var bFav = doc.getElementById('blocoFavoravel');
      var bJust = doc.getElementById('blocoJustificativa');
      if (isFav) {
        if (bFav) bFav.style.display = 'block';
        if (bJust && campos['voMedico.parRlComp']) bJust.style.display = 'block';
      } else {
        if (bFav) bFav.style.display = 'none';
        if (bJust) bJust.style.display = 'block';
      }
    }
    setParecerFinal(parecerVal);
    var diasSol=(campos['voResult.voParecerFinal.qtDiasPm']||'').toString().replace(/\\D/g,'').slice(0,3);
    var dtIniSol=sanitizeText(campos['voResult.voParecerFinal.dtIniPm'],10);
    setInput('input[name="voResult.voParecerFinal.qtDiasPm"]',diasSol);setInput('#qtDiasPm',diasSol);
    setInput('input[name="voResult.voParecerFinal.dtIniPm"]',dtIniSol);
    if(typeof win.preenchePeriodo2==='function'){try{win.preenchePeriodo2();}catch(_){}}
    var cid1=sanitizeText(campos['cdCidPm']||campos['voResult.voParecerFinal.cdCidPm'],5);
    var descrCid1=sanitizeText(campos['nmCidPm']||campos['voResult.voParecerFinal.nmCidPm'],65);
    setInput('input[name="cdCidPm"]',cid1);setInput('input[name="voResult.voParecerFinal.cdCidPm"]',cid1);setInput('#cdCidPm',cid1);
    var elNmCid1=doc.getElementById('nmCidPm')||doc.querySelector('input[name="nmCidPm"]')||doc.querySelector('input[name="voResult.voParecerFinal.nmCidPm"]');
    if(elNmCid1){elNmCid1.removeAttribute('disabled');elNmCid1.disabled=false;elNmCid1.value=descrCid1;trigger(elNmCid1);}
    setInput('#descrCidx',descrCid1);
    if(cid1&&typeof win.carregaAjaxCid==='function'){try{win.carregaAjaxCid('cdCidPm','nmCidPm');}catch(_){}}
    var cid2=sanitizeText(campos['cdCid2Pm']||campos['voResult.voParecerFinal.cdCid2Pm'],5);
    var descrCid2=sanitizeText(campos['voResult.voParecerFinal.nmCidPm2']||campos['voResult.voParecerFinal.nmCid2Pm']||campos['nmCidPm2'],65);
    setInput('input[name="cdCid2Pm"]',cid2);setInput('input[name="voResult.voParecerFinal.cdCid2Pm"]',cid2);setInput('#cdCid2Pm',cid2);
    var elNmCid2=doc.getElementById('nmCid2Pm')||doc.querySelector('input[name="voResult.voParecerFinal.nmCidPm2"]')||doc.querySelector('input[name="voResult.voParecerFinal.nmCid2Pm"]');
    if(elNmCid2){elNmCid2.removeAttribute('disabled');elNmCid2.disabled=false;elNmCid2.value=descrCid2;trigger(elNmCid2);}
    setInput('#descrCid2x',descrCid2);
    if(cid2&&typeof win.carregaAjaxCid==='function'){try{win.carregaAjaxCid('cdCid2Pm','nmCid2Pm');}catch(_){}}
    setInput('textarea[name="voMedico.parRlComp"]',sanitizeText(campos['voMedico.parRlComp'],2000));
    var bg=doc.getElementById('blocoGeral')||doc.querySelector('fieldset');if(bg)bg.scrollIntoView({behavior:'smooth',block:'start'});
    mostrarToastEsisla("✅ e-SISLA: Laudo preenchido com sucesso! Confira todos os campos antes de concluir.");
  }
  function mostrarToastEsisla(msg){
    var old=document.getElementById('esislaFloatingToast');if(old)old.remove();
    var t=document.createElement('div');t.id='esislaFloatingToast';
    t.style.cssText='position:fixed;top:20px;right:20px;z-index:999999;background:#065F46;color:#fff;padding:16px 22px;border-radius:12px;font-family:sans-serif;font-size:14px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,0.3);max-width:420px;line-height:1.4;border:2px solid #34D399;transition:opacity 0.4s;';
    t.textContent=msg;document.body.appendChild(t);
    setTimeout(function(){t.style.opacity='0';setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},400);},6000);
  }
  function abrirModalColagemEsisla(callback){
    var old=document.getElementById('esislaPasteOverlay');if(old)old.remove();
    var overlay=document.createElement('div');overlay.id='esislaPasteOverlay';
    overlay.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.7);z-index:999998;display:flex;align-items:center;justify-content:center;padding:16px;font-family:sans-serif;backdrop-filter:blur(3px);';
    overlay.innerHTML='<div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:520px;box-shadow:0 20px 40px rgba(0,0,0,0.25);border:1px solid #CBD5E1;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><strong style="font-size:16px;color:#0F172A;display:flex;align-items:center;gap:8px;">⚡ Preencher e-SISLA</strong><button id="btnFecharEsislaOverlay" style="border:none;background:#F1F5F9;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:bold;color:#475569;">✕</button></div><p style="font-size:13px;color:#475569;margin-bottom:14px;line-height:1.4;">Cole abaixo o laudo copiado no sistema <strong>Ambiental</strong> (Ctrl + V) e clique em Preencher:</p><textarea id="txtEsislaPaste" placeholder="Aperte Ctrl + V aqui..." style="width:100%;height:130px;padding:10px;border:1.5px solid #CBD5E1;border-radius:8px;font-family:monospace;font-size:11px;box-sizing:border-box;resize:vertical;outline:none;"></textarea><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;"><button id="btnCancelarEsislaPaste" style="padding:9px 16px;border:1px solid #CBD5E1;background:#fff;border-radius:8px;font-size:13px;font-weight:600;color:#475569;cursor:pointer;">Cancelar</button><button id="btnExecutarEsislaPaste" style="padding:9px 20px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(5,150,105,0.3);">⚡ Preencher Campos</button></div></div>';
    document.body.appendChild(overlay);
    var ta=document.getElementById('txtEsislaPaste');ta.focus();
    function fechar(){if(overlay.parentNode)overlay.parentNode.removeChild(overlay);}
    document.getElementById('btnFecharEsislaOverlay').onclick=fechar;
    document.getElementById('btnCancelarEsislaPaste').onclick=fechar;
    function processar(){
      var val=ta.value.trim();if(!val){alert('Por favor, cole os dados do laudo antes de continuar.');return;}
      try{var obj=JSON.parse(val);fechar();callback(obj);}
      catch(e){
        var match=val.match(/var\\s+data\\s*=\\s*(\\{[\\s\\S]*?\\});/);
        if(match){try{var objFromScript=JSON.parse(match[1]);fechar();callback(objFromScript);return;}catch(_){}}
        alert('Formato não reconhecido. Certifique-se de copiar o laudo no sistema Ambiental.');
      }
    }
    document.getElementById('btnExecutarEsislaPaste').onclick=processar;
    ta.onkeydown=function(e){if(e.key==='Enter'&&e.ctrlKey)processar();};
  }
  if(navigator.clipboard&&navigator.clipboard.readText){
    navigator.clipboard.readText().then(function(clipText){
      if(clipText&&(clipText.indexOf('campos_esisla')!==-1||clipText.indexOf('voMedico')!==-1||clipText.indexOf('fl_d_prev')!==-1)){
        try{var parsed=JSON.parse(clipText);preencherEsislaComDados(parsed);return;}catch(_){}
      }
      abrirModalColagemEsisla(preencherEsislaComDados);
    }).catch(function(){abrirModalColagemEsisla(preencherEsislaComDados);});
  }else{
    abrirModalColagemEsisla(preencherEsislaComDados);
  }
})();`;
  return 'javascript:' + encodeURIComponent(scriptBody.replace(/\s+/g, ' '));
}

function abrirModalExtensaoEsisla() {
  const isInstalled = document.documentElement.getAttribute('data-ambiental-extension') === 'active' || !!window.__AMBIENTAL_ESISLA_EXTENSION_ACTIVE__;
  const statusEl = document.getElementById('extensaoStatusBanner');
  if (statusEl) {
    if (isInstalled) {
      statusEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;color:#15803D">
          <span style="font-size:22px">🟢</span>
          <div>
            <strong style="display:block;font-size:13.5px">Extensão Ativa e Conectada ao Navegador!</strong>
            <span style="font-size:11.5px">Os dados do laudo deste paciente já estão sincronizados e prontos para o e-SISLA.</span>
          </div>
        </div>
      `;
      statusEl.style.background = '#F0FDF4';
      statusEl.style.borderColor = '#86EFAC';
    } else {
      statusEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;color:#0369A1">
          <span style="font-size:22px">⚡</span>
          <div>
            <strong style="display:block;font-size:13.5px">Instalação Simples em 1 Minuto</strong>
            <span style="font-size:11.5px">Insere o botão flutuante inteligente diretamente na tela do e-SISLA sem precisar do Console F12.</span>
          </div>
        </div>
      `;
      statusEl.style.background = '#F0F9FF';
      statusEl.style.borderColor = '#BAE6FD';
    }
  }
  setModal('extensaoModal', true);
}

function abrirModalBookmarkletEsisla() {
  const link = document.getElementById('linkBookmarkletGestao');
  if (link) {
    link.href = gerarCodigoBookmarkletEsislaUniversal();
  }
  setModal('bookmarkletModal', true);
}

function copiarCodigoBookmarkletEsisla() {
  const url = gerarCodigoBookmarkletEsislaUniversal();
  navigator.clipboard.writeText(url).then(() => {
    if (window.AmbientalUtils?.toast) {
      AmbientalUtils.toast('Código do Favorito copiado! No navegador, crie um novo favorito e cole na URL.');
    } else {
      alert('Código do Favorito copiado! No navegador, crie um novo favorito e cole na URL.');
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    alert('Código do Favorito copiado com sucesso!');
  });
}

document.getElementById('filter').addEventListener('change',()=>fetchServer().then(refresh));
['periodoInicio','periodoFim'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{if(document.getElementById('periodoInicio').value&&document.getElementById('periodoFim').value&&document.getElementById('periodoInicio').value>document.getElementById('periodoFim').value){alert('O período inicial não pode ser posterior ao período final.');return;} fetchServer().then(refresh)}));
['medico','cid','unidade'].forEach(id=>document.getElementById(id).addEventListener('change',()=>fetchServer().then(refresh)));
function goToSection(id){if(typeof window.goToSection==='function'&&window.goToSection!==goToSection){return window.goToSection(id)}const route={dashboard:'view-dashboard',atendimentos:'view-busca',historico:'view-historico',medicos:'view-medicos',indicadores:'view-indicadores'};if(route[id]){document.querySelectorAll('.admin-view').forEach(v=>v.classList.toggle('active',v.id===route[id]));document.querySelectorAll('.sidebar-link[data-target]').forEach(x=>x.classList.toggle('active',x.dataset.target===id));if(id==='atendimentos')setTimeout(focusSearch,120);window.scrollTo({top:0,behavior:'smooth'});}}
function renderRecentHistory(){const el=document.getElementById('recentHistoryList');if(!el)return;const items=[...serverItems].filter(r=>r&&r.atendimento).sort((a,b)=>String(b.__registryAt||b.atualizado_em||'').localeCompare(String(a.__registryAt||a.atualizado_em||''))).slice(0,8);if(!items.length){el.innerHTML='<div class="empty" style="grid-column:1/-1;padding:24px">Nenhum atendimento disponível para exibir.</div>';return;}el.innerHTML=items.map(r=>{const v=values(r), st=statusOf(r), cls=st==='FINALIZADO'?'done':st==='EM_REVISÃO'?'review':'';return `<article class="history-item"><div><strong>${esc(v.patient||'Paciente não informado')}</strong><small>${esc(v.doctor||'Médico não informado')} · ${esc(v.cid||'Sem CID')} · ${dt(v.updated)}</small></div><div class="hi-actions"><span class="hi-status ${cls}">${esc(stateLabel[st]||st)}</span><button class="hi-btn" type="button" onclick="openHistory('${encodeURIComponent(String(v.atd))}')">Histórico</button></div></article>`}).join('')}
document.querySelectorAll('.modal').forEach(modal=>modal.addEventListener('mousedown',e=>{if(e.target===modal)closeModal(modal.id)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=[...document.querySelectorAll('.modal.open')];if(open.length)closeModal(open[open.length-1].id);}});
document.getElementById('esislaText')?.addEventListener('input', e => updateEsislaStats(e.target.value));
document.getElementById('logoutBtn')?.addEventListener('click',()=>AmbientalAuth.logout());

(async()=>{
  let hadCache = false;
  try {
    const cachedRaw = sessionStorage.getItem('ambiental.gestao.atendimentos_cache') || localStorage.getItem('ambiental.gestao.atendimentos_cache');
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
        localItems = lerLocalStorage();
        serverItems = mergeAtendimentos(parsed.items, localItems);
        if (parsed.stats) renderStats(parsed.stats);
        refresh();
        renderRecentHistory();
        finishDataLoading();
        hadCache = true;
      }
    }
  } catch(_) {}

  if (!hadCache) {
    document.documentElement.classList.add('app-loading');
    document.body.classList.add('app-loading');
    setDataLoading('session','Validando acesso','Sessão segura confirmada. Carregando a central...',28);
  }
  await authReady;
  if (!hadCache) {
    setDataLoading('data','Carregando atendimentos','Buscando registros e atualizando sua visão operacional...',62);
  }
  await fetchServer();
  if (!hadCache) {
    setDataLoading('stats','Preparando indicadores','Calculando status, produção e indicadores...',86);
  }
  toastLocalStorage();
  refresh();
  renderRecentHistory();
  finishDataLoading();
  initAutoSync();
})().catch(e=>{console.error(e);const tx=document.getElementById('dataLoadingText');if(tx)tx.textContent='Não foi possível carregar os dados. Atualize a página e tente novamente.';try{initAutoSync();}catch(_){}});

/* --- COMBINED SCRIPT SECTION --- */

(function(){
  const sidebar=document.getElementById('adminSidebar'), overlay=document.getElementById('sidebarOverlay'), toggle=document.getElementById('sidebarToggle');
  const links=[...document.querySelectorAll('.sidebar-link[data-target]')];
  const route={dashboard:'view-dashboard',atendimentos:'view-busca',historico:'view-historico',medicos:'view-medicos',indicadores:'view-indicadores'};
  const targetFromHash=()=>String(location.hash||'#dashboard').replace(/^#/,'')||'dashboard';
  function setOpen(v){sidebar?.classList.toggle('open',v);overlay?.classList.toggle('open',v)}
  function syncIdentity(){
    const name=document.getElementById('userName'), role=document.getElementById('userRole'), sname=document.getElementById('sidebarName'), srole=document.getElementById('sidebarRole'), avatar=document.getElementById('sidebarAvatar');
    if(sname)sname.textContent=name?.textContent||'Administrador';
    if(srole)srole.textContent=role?.textContent||'Acesso administrativo';
    if(avatar){const n=(name?.textContent||'A').trim();avatar.textContent=n.charAt(0).toUpperCase()}
  }
  function syncCount(){const total=document.getElementById('statTotal'), badge=document.getElementById('sideCount');if(badge&&total)badge.textContent=total.textContent||'—'}
  function activate(id,{updateHash=true,focus=false}={}){
    if(!route[id])id='dashboard';
    document.querySelectorAll('.admin-view').forEach(v=>v.classList.toggle('active',v.id===route[id]));
    links.forEach(x=>x.classList.toggle('active',x.dataset.target===id));
    if(updateHash && location.hash!==('#'+id)) history.replaceState(null,'','#'+id);
    setOpen(false);
    if(id==='atendimentos'&&focus){setTimeout(()=>document.getElementById('search')?.focus(),220)}
    window.scrollTo({top:0,behavior:'smooth'});
  }
  window.goToSection=function(id){activate(id,{focus:id==='atendimentos'})};
  toggle?.addEventListener('click',()=>setOpen(true));
  overlay?.addEventListener('click',()=>setOpen(false));
  links.forEach(link=>link.addEventListener('click',e=>{const id=link.dataset.target;if(route[id]){e.preventDefault();activate(id,{updateHash:true,focus:id==='atendimentos'})}}));
  window.addEventListener('hashchange',()=>activate(targetFromHash(),{updateHash:false,focus:targetFromHash()==='atendimentos'}));
  const name=document.getElementById('userName');
  if(name){new MutationObserver(syncIdentity).observe(name,{childList:true,subtree:true,characterData:true})}
  syncIdentity();syncCount();
  const total=document.getElementById('statTotal');
  if(total)new MutationObserver(syncCount).observe(total,{childList:true,characterData:true,subtree:true});
  document.getElementById('sidebarLogout')?.addEventListener('click',()=>document.getElementById('logoutBtn')?.click());
  activate(targetFromHash(),{updateHash:false});
})();

/* =========================================================
   IMPORTAÇÃO DE CONSULTA E-SISLA (PDF) - ÁREA ADMINISTRATIVA
   ========================================================= */
let currentEsislaParsedData = null;
let cachedMedicosList = [];

async function carregarMedicosParaSelectEsisla() {
  const sel = document.getElementById('esislaMedicoPeritoSelect');
  if (!sel) return;
  try {
    if (!cachedMedicosList.length) {
      const res = await (window.AmbientalAuth ? window.AmbientalAuth.authFetch('/api/admin/medicos') : fetch('/api/admin/medicos'));
      const data = await res.json();
      if (res.ok && data?.data?.items) {
        cachedMedicosList = data.data.items.filter(m => Number(m.ativo) === 1);
      }
    }
    if (cachedMedicosList.length) {
      sel.innerHTML = cachedMedicosList.map(m => `<option value="${m.id}" data-nome="${m.nome}" data-crm="${m.crm || ''}">${m.nome} (${m.crm || 'Sem CRM'})</option>`).join('');
      if (currentUserProfile && currentUserProfile.id) {
        const found = cachedMedicosList.find(m => String(m.id) === String(currentUserProfile.id));
        if (found) sel.value = found.id;
      }
    } else {
      sel.innerHTML = '<option value="">Nenhum médico ativo cadastrado</option>';
    }
  } catch (err) {
    console.warn("Erro ao carregar lista de médicos:", err);
    sel.innerHTML = '<option value="">Médico padrão da clínica</option>';
  }
}

window.abrirModalImportarEsisla = function() {
  currentEsislaParsedData = null;
  document.getElementById('dropzoneEsislaGestao').style.display = 'block';
  document.getElementById('esislaGestaoLoading').style.display = 'none';
  document.getElementById('esislaGestaoPreview').style.display = 'none';
  document.getElementById('btnEsislaSalvarFila').style.display = 'none';
  document.getElementById('btnEsislaAbrirAgora').style.display = 'none';
  const inp = document.getElementById('fileEsislaGestaoInput');
  if (inp) inp.value = '';
  carregarMedicosParaSelectEsisla();
  setModal('importarEsislaModal', true);
};

window.processarArquivoEsislaGestao = async function(file) {
  if (!file) return;
  const dropzone = document.getElementById('dropzoneEsislaGestao');
  const loading = document.getElementById('esislaGestaoLoading');
  const preview = document.getElementById('esislaGestaoPreview');
  const btnSalvar = document.getElementById('btnEsislaSalvarFila');
  const btnAbrir = document.getElementById('btnEsislaAbrirAgora');

  if (dropzone) dropzone.style.display = 'none';
  if (loading) loading.style.display = 'flex';
  if (preview) preview.style.display = 'none';
  if (btnSalvar) btnSalvar.style.display = 'none';
  if (btnAbrir) btnAbrir.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('file', file);
    
    let res;
    if (window.AmbientalAPI?.esisla?.parsePdf) {
      res = await AmbientalAPI.esisla.parsePdf(formData);
    } else {
      const r = await (window.AmbientalAuth ? window.AmbientalAuth.authFetch('/api/esisla/parse-pdf', {
        method: 'POST', body: formData
      }) : fetch('/api/esisla/parse-pdf', { method: 'POST', body: formData }));
      res = await r.json();
      if (!r.ok) throw new Error(res?.error?.message || res?.detail || 'Erro ao processar arquivo.');
    }

    const dados = res.data?.dados || res.dados;
    if (!dados || (!dados.nome_paciente && !dados.cpf_paciente)) {
      throw new Error('Não foi possível identificar os dados da Consulta Perícia Licença.');
    }
    currentEsislaParsedData = dados;

    document.getElementById('esislaPreviewProtocolo').textContent = `Protocolo: ${dados.protocolo || 'Não informado'}`;
    document.getElementById('prevNome').textContent = dados.nome_paciente || 'Não informado';
    document.getElementById('prevCpfRg').textContent = `CPF: ${dados.cpf_paciente || '—'} · RG: ${dados.rg_paciente || '—'}`;
    document.getElementById('prevIdadeNasc').textContent = `${dados.idade ? dados.idade + ' anos' : 'Idade —'} (Nasc: ${dados.data_nascimento || '—'}) · Sexo: ${dados.sexo || '—'}`;
    
    document.getElementById('prevCargo').textContent = dados.cargo || 'Não informado';
    document.getElementById('prevOrgao').textContent = `Órgão: ${dados.orgao || '—'}`;
    document.getElementById('prevUnidade').textContent = `UA: ${dados.unidade || '—'} · Reg: ${dados.regime_juridico || '—'}`;

    document.getElementById('prevCidPill').textContent = `CID: ${dados.cid || '—'}`;
    document.getElementById('prevCidDesc').textContent = dados.cid_descricao || '—';
    document.getElementById('prevDiasData').textContent = `Prazo: ${dados.dias_solicitados || '—'} dia(s) · Emitido em: ${dados.data_documento_br || dados.data_documento || '—'}`;
    document.getElementById('prevMedicoAssistente').textContent = `Médico Assistente: ${dados.nome_medico_assistente || '—'} (CRM: ${dados.crm_cro || '—'})`;

    const expBadge = document.getElementById('prevDataExpedicaoBadge');
    if (expBadge) expBadge.textContent = `Expedição Guia: ${dados.data_expedicao || 'Não informada'}`;

    const retroAlert = document.getElementById('prevRetroacaoAlert');
    const retroTxt = document.getElementById('prevRetroacaoTexto');
    if (dados.retroacao_invalida || (dados.retroacao_dias && dados.retroacao_dias > 3)) {
      if (retroAlert && retroTxt) {
        retroAlert.style.display = 'block';
        retroTxt.innerHTML = `O intervalo entre a expedição da guia (<strong>${dados.data_expedicao || '—'}</strong>) e a emissão do atestado (<strong>${dados.data_documento_br || dados.data_documento || '—'}</strong>) é de <strong>${dados.retroacao_dias} dias</strong>. Por exceder o limite de 3 dias do DPME, o atendimento receberá sugestão de <strong>PARECER CONTRÁRIO</strong> por retroação inválida.`;
      }
    } else if (retroAlert) {
      retroAlert.style.display = 'none';
    }

    if (loading) loading.style.display = 'none';
    if (preview) preview.style.display = 'block';
    if (btnSalvar) btnSalvar.style.display = 'inline-flex';
    if (btnAbrir) btnAbrir.style.display = 'inline-flex';
  } catch (err) {
    if (loading) loading.style.display = 'none';
    if (dropzone) dropzone.style.display = 'block';
    alert(err.message || 'Falha ao processar arquivo PDF.');
  }
};

window.salvarAtendimentoEsislaFila = async function() {
  if (!currentEsislaParsedData) return;
  const sel = document.getElementById('esislaMedicoPeritoSelect');
  const opt = sel?.options[sel.selectedIndex];
  const payload = {
    dados: currentEsislaParsedData,
    medico_id: sel?.value || '',
    medico_nome: opt?.dataset?.nome || opt?.text || '',
    medico_crm: opt?.dataset?.crm || ''
  };

  const btn = document.getElementById('btnEsislaSalvarFila');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando na fila...'; }

  try {
    let res;
    if (window.AmbientalAPI?.esisla?.criarAtendimento) {
      res = await AmbientalAPI.esisla.criarAtendimento(payload);
    } else {
      const r = await (window.AmbientalAuth ? window.AmbientalAuth.authFetch('/api/esisla/criar-atendimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }) : fetch('/api/esisla/criar-atendimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }));
      res = await r.json();
      if (!r.ok) throw new Error(res?.error?.message || res?.detail || 'Erro ao criar atendimento.');
    }

    closeModal('importarEsislaModal');
    triggerRefresh(true);
    alert(`Atendimento de ${currentEsislaParsedData.nome_paciente} salvo com sucesso na fila de rascunhos!`);
  } catch (err) {
    alert(err.message || 'Erro ao salvar atendimento na fila.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar Rascunho na Fila'; }
  }
};

window.abrirAtendimentoEsislaAgora = async function() {
  if (!currentEsislaParsedData) return;
  const sel = document.getElementById('esislaMedicoPeritoSelect');
  const opt = sel?.options[sel.selectedIndex];
  const payload = {
    dados: currentEsislaParsedData,
    medico_id: sel?.value || '',
    medico_nome: opt?.dataset?.nome || opt?.text || '',
    medico_crm: opt?.dataset?.crm || ''
  };

  const btn = document.getElementById('btnEsislaAbrirAgora');
  if (btn) { btn.disabled = true; btn.textContent = 'Abrindo atendimento...'; }

  try {
    let res;
    if (window.AmbientalAPI?.esisla?.criarAtendimento) {
      res = await AmbientalAPI.esisla.criarAtendimento(payload);
    } else {
      const r = await (window.AmbientalAuth ? window.AmbientalAuth.authFetch('/api/esisla/criar-atendimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }) : fetch('/api/esisla/criar-atendimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }));
      res = await r.json();
      if (!r.ok) throw new Error(res?.error?.message || res?.detail || 'Erro ao criar atendimento.');
    }

    const atdId = res.data?.id || res.id;
    if (atdId) {
      location.href = `/app?atendimento=${encodeURIComponent(atdId)}`;
    }
  } catch (err) {
    alert(err.message || 'Erro ao iniciar atendimento.');
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Iniciar Atendimento Agora →'; }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzoneEsislaGestao');
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.background = '#DCFCE7'; dropzone.style.borderColor = '#059669'; });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dropzone.style.background = '#F0FDF4'; dropzone.style.borderColor = '#10B981'; });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.background = '#F0FDF4';
      dropzone.style.borderColor = '#10B981';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        processarArquivoEsislaGestao(e.dataTransfer.files[0]);
      }
    });
  }
});

/* =========================================================
   ENTRAR LOGIN MÉDICO (IMPERSONATE) & REFINAMENTO IA E-SISLA
   ========================================================= */
let cachedImpersonateMedicos = [];

async function carregarMedicosParaImpersonate() {
  const selTop = document.getElementById('selectImpersonateMedicoTop');
  const selSide = document.getElementById('selectImpersonateMedicoSidebar');
  if (!selTop && !selSide) return;

  try {
    let medicos = [];
    if (window.AmbientalAPI?.admin?.medicosListaImpersonate) {
      const res = await AmbientalAPI.admin.medicosListaImpersonate();
      medicos = res?.data?.items || [];
    } else {
      const token = accessToken || (await AmbientalAuth?.getAccessToken?.());
      const res = await fetch('/api/admin/medicos/lista-impersonate', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data?.data?.items) {
        medicos = data.data.items;
      }
    }

    cachedImpersonateMedicos = medicos;

    const buildOptions = (placeholder) => {
      if (!medicos.length) {
        return `<option value="">Nenhum médico ativo disponível</option>`;
      }
      return `<option value="">${placeholder}</option>` + medicos.map(m => {
        const crmLabel = m.crm ? `CRM: ${m.crm}` : 'Sem CRM';
        const atdCount = m.total_atendimentos ? ` · ${m.total_atendimentos} laudos` : '';
        return `<option value="${m.id}" data-nome="${esc(m.nome)}" data-crm="${esc(m.crm || '')}">${esc(m.nome)} (${crmLabel}${atdCount})</option>`;
      }).join('');
    };

    if (selTop) selTop.innerHTML = buildOptions('Selecione o médico para entrar...');
    if (selSide) selSide.innerHTML = buildOptions('Selecione o médico...');

    // Restore selected value if currently impersonating
    const currentImpersonateId = sessionStorage.getItem('ambiental.impersonate_medico_id');
    if (currentImpersonateId) {
      if (selTop) selTop.value = currentImpersonateId;
      if (selSide) selSide.value = currentImpersonateId;
    }
  } catch (err) {
    console.warn("Falha ao carregar lista de médicos para impersonate:", err);
    if (selTop) selTop.innerHTML = '<option value="">Médicos indisponíveis</option>';
    if (selSide) selSide.innerHTML = '<option value="">Médicos indisponíveis</option>';
  }
}

function onSelectImpersonateChange(val) {
  const selTop = document.getElementById('selectImpersonateMedicoTop');
  const selSide = document.getElementById('selectImpersonateMedicoSidebar');
  if (selTop && selTop.value !== val) selTop.value = val;
  if (selSide && selSide.value !== val) selSide.value = val;
}

function entrarComoMedico(medicoId) {
  if (!medicoId) {
    alert("Selecione um médico na lista para acessar o portal com seu login.");
    return;
  }
  const medico = cachedImpersonateMedicos.find(m => String(m.id) === String(medicoId));
  const nomeMed = medico ? medico.nome : `Médico ID ${medicoId}`;
  
  // Salvar no sessionStorage para todas as requisições API injetarem o header
  sessionStorage.setItem('ambiental.impersonate_medico_id', String(medicoId));
  if (medico) {
    sessionStorage.setItem('ambiental.impersonate_medico_nome', medico.nome || '');
    sessionStorage.setItem('ambiental.impersonate_medico_crm', medico.crm || '');
  }

  // Redirecionar diretamente para o Portal Médico
  location.href = `/gestao_medicos.html?impersonate_medico_id=${encodeURIComponent(medicoId)}`;
}

function entrarComoMedicoSelecionado() {
  const selTop = document.getElementById('selectImpersonateMedicoTop');
  const selSide = document.getElementById('selectImpersonateMedicoSidebar');
  const val = selTop?.value || selSide?.value;
  if (!val) {
    alert("Por favor, selecione um médico na lista para entrar no painel como médico.");
    return;
  }
  entrarComoMedico(val);
}

// Inicializar carregamento de médicos para impersonate
setTimeout(() => {
  carregarMedicosParaImpersonate();
}, 600);

/* --- SENIOR AI REFINEMENT: REESTRUTURAR E OTIMIZAR FICHA E-SISLA --- */
window._esislaTextoOriginalAntesIA = null;

async function refinarFichaEsislaIA() {
  const el = document.getElementById('esislaText');
  let texto = el?.value || '';
  if (!texto.trim()) {
    if (window.currentDetailFull?.ficha_esisla) {
      texto = window.currentDetailFull.ficha_esisla;
      if (el) el.value = texto;
    }
  }
  if (!texto.trim() || texto.trim().length < 30) {
    alert("Gere o conteúdo da ficha e-Sisla antes de acionar a otimização com IA.");
    return;
  }

  const btnHead = document.getElementById('btnRefinarFichaIA');
  const btnFoot = document.getElementById('btnRefinarFichaIAFoot');
  const btnDesfazer = document.getElementById('btnDesfazerRefinarIA');

  const oldHeadText = btnHead?.innerHTML;
  const oldFootText = btnFoot?.innerHTML;

  if (btnHead) { btnHead.disabled = true; btnHead.innerHTML = '✨ Otimizando...'; }
  if (btnFoot) { btnFoot.disabled = true; btnFoot.innerHTML = '✨ Otimizando com IA...'; }

  try {
    window._esislaTextoOriginalAntesIA = texto;

    let atdId = null;
    let rObj = null;
    if (window.currentEsislaEnc) {
      try {
        const dec = decodeURIComponent(window.currentEsislaEnc);
        rObj = typeof find === 'function' ? find(dec) : null;
        atdId = (rObj && (rObj.atendimento || rObj.id)) || dec;
      } catch(_) {}
    }

    const payload = {
      ficha_esisla: texto,
      texto_ficha: texto,
      texto: texto,
      atendimento_id: atdId,
      atendimento: atdId
    };

    let resData;
    if (window.AmbientalAPI?.ai?.refinarFichaEsisla) {
      resData = await AmbientalAPI.ai.refinarFichaEsisla(payload);
    } else {
      const token = accessToken || await AmbientalAuth.getAccessToken();
      const resp = await fetch('/api/ai/refinar-ficha-esisla', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      resData = await resp.json();
      if (!resp.ok) throw new Error(resData?.error?.message || resData?.detail || 'Erro ao otimizar ficha.');
    }

    const textoOtimizado = resData?.data?.ficha_esisla_otimizada || resData?.data?.texto_otimizado || resData?.ficha_esisla_otimizada || resData?.texto_otimizado;
    if (!textoOtimizado) {
      throw new Error(resData?.error?.message || "Não foi possível gerar a ficha otimizada.");
    }

    el.value = textoOtimizado;
    updateEsislaStats(textoOtimizado);
    renderEsislaBlocos(textoOtimizado);
    if (window.currentDetailFull) {
      window.currentDetailFull.ficha_esisla = textoOtimizado;
      if (window.currentDetailFull.aux) window.currentDetailFull.aux.fichaEsisla = textoOtimizado;
    }
    if (rObj) {
      rObj.ficha_esisla = textoOtimizado;
      if (rObj.aux) rObj.aux.fichaEsisla = textoOtimizado;
      if (rObj.payload) rObj.payload.ficha_esisla = textoOtimizado;
    }

    if (btnDesfazer) btnDesfazer.style.display = 'inline-flex';

    const melhorias = resData?.data?.melhorias_aplicadas || [];
    const msg = melhorias.length 
      ? `✨ Ficha reestruturada e enriquecida com sucesso!\n• ${melhorias.join('\n• ')}`
      : '✨ Ficha reestruturada e otimizada com padrão sênior e-SISLA!';
    
    if (window.AmbientalUtils?.toast) {
      AmbientalUtils.toast(msg, 6000);
    } else {
      alert(msg);
    }
  } catch (err) {
    alert("Erro na otimização com IA: " + (err.message || err));
  } finally {
    if (btnHead) { btnHead.disabled = false; btnHead.innerHTML = oldHeadText || '✨ Otimizar Ficha com IA'; }
    if (btnFoot) { btnFoot.disabled = false; btnFoot.innerHTML = oldFootText || '✨ Otimizar e Reestruturar com IA'; }
  }
}

function desfazerRefinamentoIA() {
  if (!window._esislaTextoOriginalAntesIA) return;
  const el = document.getElementById('esislaText');
  if (el) {
    el.value = window._esislaTextoOriginalAntesIA;
    updateEsislaStats(el.value);
    renderEsislaBlocos(el.value);
  }
  const btnDesfazer = document.getElementById('btnDesfazerRefinarIA');
  if (btnDesfazer) btnDesfazer.style.display = 'none';
  window._esislaTextoOriginalAntesIA = null;
  if (window.AmbientalUtils?.toast) {
    AmbientalUtils.toast('Versão anterior restaurada com sucesso!');
  }
}
