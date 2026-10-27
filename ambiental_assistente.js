let accessToken = null;
let currentProfile = null;
function applyProfessionalDefaults(profile){
  if(!profile) return;
  const medico=String(profile.nome||'').trim();
  const crm=String(profile.crm||'').trim();
  state.medico=medico || state.medico || '';
  if(!state.aux || typeof state.aux!=='object') state.aux={};
  state.aux.medicoResponsavel=medico;
  state.aux.crmResponsavel=crm;
  const inputMedico=$("medico");
  if(inputMedico && medico){ inputMedico.value=medico; inputMedico.readOnly=true; inputMedico.style.backgroundColor='#F8FAFC'; }
  const inputCrm=$("crmResponsavel")||$("crm");
  if(inputCrm && crm){ inputCrm.value=crm; inputCrm.readOnly=true; inputCrm.style.backgroundColor='#F8FAFC'; }
}

const authReady = AmbientalAuth.requireAuth({area:'atendimento'}).then(async profile=>{
  currentProfile = profile;
  accessToken = await AmbientalAuth.getAccessToken().catch(()=>null);
  
  // Tratamento de Impersonação Médica pelo Administrador
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const impId = sessionStorage.getItem('ambiental.impersonate_medico_id') || urlParams.get('medico_id') || urlParams.get('impersonate_medico_id');
    if (impId) {
      sessionStorage.setItem('ambiental.impersonate_medico_id', impId);
      if (profile.perfil === 'Administrador' || profile.perfilOriginal === 'Administrador') {
        let docNome = sessionStorage.getItem('ambiental.impersonate_medico_nome');
        let docCrm = sessionStorage.getItem('ambiental.impersonate_medico_crm');
        if (!docNome) {
          try {
            const listRes = await fetch('/api/admin/medicos/lista-impersonate', {
              headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
            }).then(r => r.json()).catch(() => null);
            const items = listRes?.data?.items || listRes?.items || [];
            const found = items.find(m => String(m.id) === String(impId));
            if (found) {
              docNome = found.nome;
              docCrm = found.crm || '';
              sessionStorage.setItem('ambiental.impersonate_medico_nome', docNome);
              sessionStorage.setItem('ambiental.impersonate_medico_crm', docCrm);
            }
          } catch(_) {}
        }
        currentProfile = {
          ...profile,
          id: impId,
          nome: docNome || profile.nome,
          crm: docCrm || '',
          perfil: 'Médico',
          perfilOriginal: 'Administrador',
          is_impersonating: true,
          real_user_id: profile.id,
          real_user_name: profile.nome
        };
      }
    }
  } catch(e) {
    console.warn('Erro ao processar impersonate no atendimento:', e);
  }

  applyProfessionalDefaults(currentProfile);
  const title = document.querySelector('.brand-title');
  if(title) title.textContent = 'AVALIAÇÃO MÉDICA PERICIAL — LTS';
  const hdr = document.querySelector('.header-actions');
  if(hdr && !document.getElementById('headerUser')){
    const el=document.createElement('div');el.id='headerUser';el.className='header-user';
    el.innerHTML='<span class="header-session-dot"></span><span><b></b><small></small></span><button type="button">Sair</button>';
    if (currentProfile.is_impersonating) {
      el.querySelector('b').textContent = `Dr(a). ${currentProfile.nome}`;
      el.querySelector('small').textContent = `${currentProfile.crm ? 'CRM: ' + currentProfile.crm : 'Médico'} (Acesso Admin)`;
      el.style.background = '#F0F9FF';
      el.style.borderColor = '#0284C7';
    } else {
      el.querySelector('b').textContent=profile.nome||profile.email||'Usuário';
      el.querySelector('small').textContent=profile.perfil||'Perfil';
    }
    el.querySelector('button').addEventListener('click',()=>AmbientalAuth.logout());
    hdr.prepend(el);
  }

  if (currentProfile?.is_impersonating && !document.getElementById('appImpersonateBanner')) {
    const banner = document.createElement('div');
    banner.id = 'appImpersonateBanner';
    banner.style.cssText = 'background:linear-gradient(90deg, #0369A1, #0284C7);color:#fff;padding:8px 16px;font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;z-index:9999;box-shadow:0 2px 8px rgba(2,132,199,0.25);';
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="background:rgba(255,255,255,0.22);padding:2px 8px;border-radius:6px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px">Modo Administrativo</span>
        <span>Atuando em nome de Dr(a). <strong>${currentProfile.nome}</strong> (${currentProfile.crm ? 'CRM: ' + currentProfile.crm : 'Sem CRM'}). O atendimento e laudo serão finalizados com este médico.</span>
      </div>
      <button type="button" onclick="finalizeGoBack()" style="background:#fff;color:#0369A1;border:none;border-radius:6px;padding:4px 12px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;transition:transform .15s">
        Voltar ao Portal Médico ➔
      </button>
    `;
    document.body.prepend(banner);
  }

  document.getElementById('authLoading')?.remove();
  return currentProfile;
}).catch(e=>{
  document.getElementById('authLoading')?.remove();
  if(e?.message!=='AUTH_REQUIRED'&&e?.message!=='PERMISSION_DENIED') console.error('Falha ao validar sessão.', e);
  return null;
});
setTimeout(() => { document.getElementById('authLoading')?.remove(); }, 1200);
const LOGO_DATA = "/logo.png";
const API_FALLBACK="http://127.0.0.1:8000";
const STORAGE_KEY="ambiental_lts_v2";
const LEGACY_STORAGE_KEY="ambiental_lts_v1";
let cidLoadStatus={status:"not_started",count:0,detail:"Ainda não iniciado"};
const steps = [
  ["01","Identificação","Dados do atendimento"],
  ["02","Queixa e duração","Informações iniciais"],
  ["03","Antecedentes","Histórico mórbido"],
  ["04","Documentação","Atestado / relatório / exames"],
  ["05","Exame","Físico ou mental"],
  ["06","Limitações","Físicas ou mentais"],
  ["07","Quesitos","Perguntas e respostas"],
  ["08","Justificativa","Capacidade e parecer"],
  ["09","Revisão","Conferência final"]
];

const examItems = [
  ["Nível de consciência","Sem comprometimento","Com comprometimento","sem comprometimento"],
  ["Orientação","Global preservada em tempo e espaço","Com comprometimento","global preservada em tempo e espaço"],
  ["Atenção e concentração","Sem desvios, preservadas","Com alterações","sem desvios, preservadas"],
  ["Memória","Não demonstrou dificuldades em responder questões sobre fatos e datas recentes e remotas sobre sua saúde e vida laboral","Com dificuldades","não demonstrou dificuldades aparentes"],
  ["Atitude / comportamento","Sem desvios, demonstra autocontrole","Com desvios","sem desvios, demonstra autocontrole"],
  ["Inteligência","Produz conteúdo compatível com sua formação e profissão","Necessita observação complementar","conteúdo compatível com formação e profissão"],
  ["Pensamento","Curso, forma e conteúdo sem comprometimentos","Com comprometimento","curso, forma e conteúdo sem comprometimentos"],
  ["Linguagem","Apropriada, sem alteração do tom, fala pausadamente, sem se exaltar ou gaguejar","Com alteração","apropriada, sem alterações relevantes"],
  ["Afetividade","Preservada","Alterada","preservada"],
  ["Humor","Eutímico, polarizado ao positivo","Alterado","eutímico, polarizado ao positivo"],
  ["Pragmatismo","Preservado, produz conteúdo satisfatório ao plano futuro","Prejudicado","preservado"],
  ["Volição","Sem prejuízos","Com prejuízos","sem prejuízos"],
  ["Sensopercepção","Sem sinais diretos ou indiretos que possam indicar comprometimento","Com sinais de comprometimento","sem sinais diretos ou indiretos de comprometimento"],
  ["Psicomotricidade","Sem comprometimento","Com comprometimento","sem comprometimento"],
  ["Juízo","Preservado","Comprometido","preservado"]
];

const state = {
  current:1, atendimento:"", medico:"", capacidade:"", parecer:"", outrasDoencas:"Sim",
  medications:[], conditions:[], quesitos:[], exam:{}, documentosComplementares:[], cidsSecundarios:[], exameFisicoTipo:"", alteracoesClinicasExames:"", queixaDuracao:""
};

function $(id){return document.getElementById(id)}
function qsa(sel){return [...document.querySelectorAll(sel)]}
function esc(v){
  return String(v ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}
function getRadio(name){return document.querySelector(`input[name="${name}"]:checked`)?.value || ""}
function setRadio(name,value){
  qsa(`input[name="${name}"]`).forEach(r=>r.checked = r.value===value);
}
function today(){
  const d=new Date(); const off=d.getTimezoneOffset(); const local=new Date(d.getTime()-off*60000);
  return local.toISOString().slice(0,10);
}
function timeNow(){
  const d=new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function generateId(){
  const y=new Date().getFullYear();
  const n = String(Math.floor(Math.random()*999999)).padStart(6,"0");
  return `ATD-${y}-${n}`;
}
function formatDate(v){
  if(!v) return "—";
  const s = String(v).trim();
  if(!s) return "—";
  if(/^\d{4}$/.test(s)) return s; // Ano puro (ex: 2020)
  if(s.includes("/")) return s; // Já formatado (dd/mm/aaaa)
  const parts = s.split("-");
  if(parts.length === 3) {
    const [y,m,d] = parts;
    return `${d}/${m}/${y}`;
  }
  return s;
}
function toIsoDate(dStr) {
  if (!dStr) return "";
  const s = String(dStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return s;
}
window.toIsoDate = toIsoDate;
$("logoHeader").src = LOGO_DATA;


/* =========================================================
   CID ASSISTENTE — CURATED OCCUPATIONAL SUPPORT LIBRARY
   Base: CID-10 / BRCID10 (Ministério da Saúde) + workflow
   de avaliação clínico-ocupacional. Não é mecanismo de decisão.
   ========================================================= */
/* =========================================================
   CID ASSISTENTE — CARREGAMENTO VIA CSV
   ========================================================= */
const CID_CATEGORIES = {
  "A09": { n: "Gastroenterite e colite de origem infecciosa", g: "Doenças infecciosas e parasitárias", k: "A" },
  "A90": { n: "Dengue", g: "Doenças infecciosas e parasitárias", k: "A" },
  "B34": { n: "Infecção viral de localização não especificada", g: "Doenças infecciosas", k: "B" },
  "C50": { n: "Neoplasia maligna da mama", g: "Neoplasias (tumores)", k: "C" },
  "E10": { n: "Diabetes mellitus insulinodependente", g: "Doenças endócrinas e metabólicas", k: "E" },
  "E11": { n: "Diabetes mellitus não-insulinodependente", g: "Doenças endócrinas e metabólicas", k: "E" },
  "E66": { n: "Obesidade", g: "Doenças endócrinas e metabólicas", k: "E" },
  "F10": { n: "Transtornos mentais pelo uso de álcool", g: "Transtornos mentais e comportamentais", k: "F" },
  "F32": { n: "Episódios depressivos", g: "Transtornos mentais e comportamentais", k: "F" },
  "F32.0": { n: "Episódio depressivo leve", g: "Transtornos mentais e comportamentais", k: "F" },
  "F32.1": { n: "Episódio depressivo moderado", g: "Transtornos mentais e comportamentais", k: "F" },
  "F32.2": { n: "Episódio depressivo grave sem sintomas psicóticos", g: "Transtornos mentais e comportamentais", k: "F" },
  "F32.3": { n: "Episódio depressivo grave com sintomas psicóticos", g: "Transtornos mentais e comportamentais", k: "F" },
  "F33": { n: "Transtorno depressivo recorrente", g: "Transtornos mentais e comportamentais", k: "F" },
  "F41": { n: "Outros transtornos ansiosos", g: "Transtornos mentais e comportamentais", k: "F" },
  "F41.0": { n: "Transtorno de pânico (ansiedade paroxística episódica)", g: "Transtornos mentais e comportamentais", k: "F" },
  "F41.1": { n: "Ansiedade generalizada (TAG)", g: "Transtornos mentais e comportamentais", k: "F" },
  "F41.2": { n: "Transtorno misto ansioso e depressivo", g: "Transtornos mentais e comportamentais", k: "F" },
  "F43": { n: "Reações ao estresse grave e transtornos de adaptação", g: "Transtornos mentais e comportamentais", k: "F" },
  "F43.0": { n: "Reação aguda ao estresse", g: "Transtornos mentais e comportamentais", k: "F" },
  "F43.1": { n: "Estado de estresse pós-traumático (TEPT)", g: "Transtornos mentais e comportamentais", k: "F" },
  "F43.2": { n: "Transtornos de adaptação", g: "Transtornos mentais e comportamentais", k: "F" },
  "G43": { n: "Enxaqueca", g: "Doenças do sistema nervoso", k: "G" },
  "G44": { n: "Outras síndromes de algias cefálicas (cefaleia tensional)", g: "Doenças do sistema nervoso", k: "G" },
  "G56": { n: "Mononeuropatias dos membros superiores", g: "Doenças do sistema nervoso", k: "G" },
  "G56.0": { n: "Síndrome do túnel do carpo", g: "Doenças do sistema nervoso", k: "G" },
  "I10": { n: "Hipertensão essencial (primária)", g: "Doenças do aparelho circulatório", k: "I" },
  "I20": { n: "Angina pectoris", g: "Doenças do aparelho circulatório", k: "I" },
  "I21": { n: "Infarto agudo do miocárdio", g: "Doenças do aparelho circulatório", k: "I" },
  "I64": { n: "Acidente vascular cerebral (AVC)", g: "Doenças do aparelho circulatório", k: "I" },
  "J06": { n: "Infecções agudas das vias aéreas superiores", g: "Doenças do aparelho respiratório", k: "J" },
  "J45": { n: "Asma", g: "Doenças do aparelho respiratório", k: "J" },
  "M50": { n: "Transtornos dos discos cervicais", g: "Doenças do sistema osteomuscular", k: "M" },
  "M51": { n: "Transtornos de outros discos intervertebrais (hérnia de disco)", g: "Doenças do sistema osteomuscular", k: "M" },
  "M54": { n: "Dorsalgia", g: "Doenças do sistema osteomuscular", k: "M" },
  "M54.1": { n: "Radiculopatia", g: "Doenças do sistema osteomuscular", k: "M" },
  "M54.2": { n: "Cervicalgia", g: "Doenças do sistema osteomuscular", k: "M" },
  "M54.4": { n: "Lumbago com ciática (lombociatalgia)", g: "Doenças do sistema osteomuscular", k: "M" },
  "M54.5": { n: "Dor lombar baixa (lombalgia)", g: "Doenças do sistema osteomuscular", k: "M" },
  "M65": { n: "Sinovite e tenossinovite", g: "Doenças do sistema osteomuscular", k: "M" },
  "M65.4": { n: "Tenossinovite estilóide radial (De Quervain)", g: "Doenças do sistema osteomuscular", k: "M" },
  "M75": { n: "Lesões do ombro", g: "Doenças do sistema osteomuscular", k: "M" },
  "M75.1": { n: "Síndrome do manguito rotador", g: "Doenças do sistema osteomuscular", k: "M" },
  "M75.2": { n: "Tendinite bicipital", g: "Doenças do sistema osteomuscular", k: "M" },
  "M77": { n: "Outras entesopatias (epicondilite lateral/medial)", g: "Doenças do sistema osteomuscular", k: "M" },
  "M79": { n: "Outros transtornos dos tecidos moles (fibromialgia)", g: "Doenças do sistema osteomuscular", k: "M" },
  "S93": { n: "Luxação, entorse e distensão do tornozelo e do pé", g: "Lesões e traumatismos", k: "S" },
  "Z73": { n: "Problemas relacionados com a organização do modo de vida", g: "Fatores que influenciam o estado de saúde", k: "Z" },
  "Z73.0": { n: "Esgotamento (Burnout)", g: "Fatores que influenciam o estado de saúde", k: "Z" }
};

// Inicializa a biblioteca previamente com a base essencial para resposta imediata offline
let cidLibrary = Object.keys(CID_CATEGORIES).map(code => {
  const cat = CID_CATEGORIES[code];
  return {
    c: code,
    n: cat.n,
    g: cat.g,
    k: cat.k || code[0],
    q: cidFamilyFallback(code).q
  };
});

function normalizeCID(v){return String(v||"").trim().toUpperCase().replace(/\s+/g,"")}

function cidFamilyFallback(code){
  const c = normalizeCID(code);
  const k = c ? c[0] : "";
  const map = {
    F:{g:"F — transtornos mentais e comportamentais",q:["Caracterizar sintomas, evolução e tratamento.","Descrever estado mental atual e funcionalidade.","Registrar impacto concreto nas atividades essenciais do cargo.","Explorar fatores psicossociais/ocupacionais relevantes quando pertinentes.","Não inferir incapacidade ou nexo apenas pelo CID."]},
    M:{g:"M — doenças do sistema osteomuscular",q:["Caracterizar dor, função e evolução.","Documentar achados do exame físico.","Relacionar limitações observadas às exigências reais do cargo.","Registrar tratamento e resposta.","Evitar concluir incapacidade apenas pelo código."]},
    G:{g:"G — doenças do sistema nervoso",q:["Caracterizar sintomas neurológicos e evolução.","Documentar achados funcionais do exame.","Avaliar impacto nas tarefas essenciais.","Registrar tratamento e resposta.","Não concluir incapacidade pelo CID isoladamente."]},
    I:{g:"I — doenças do aparelho circulatório",q:["Registrar controle clínico e tratamento.","Investigar sintomas e complicações relevantes.","Avaliar exigências do cargo em relação aos achados clínicos.","Documentar funcionalidade atual.","Não concluir incapacidade pelo CID isoladamente."]},
    J:{g:"J — doenças do aparelho respiratório",q:["Caracterizar sintomas, crises e evolução.","Investigar tolerância ao esforço e exposições relevantes.","Registrar tratamento e resposta.","Relacionar achados às demandas do cargo.","Não concluir incapacidade pelo CID isoladamente."]},
    E:{g:"E — doenças endócrinas, nutricionais e metabólicas",q:["Registrar controle e tratamento.","Investigar complicações relevantes.","Avaliar necessidades funcionais relacionadas à atividade.","Documentar repercussão atual.","Não concluir incapacidade pelo CID isoladamente."]},
    Z:{g:"Z — fatores que influenciam o estado de saúde",q:["Caracterizar o fator/contexto que motivou o registro.","Documentar história clínica e ocupacional.","Avaliar funcionalidade atual.","Explorar contexto de trabalho quando pertinente.","Não presumir nexo causal."]}
  };
  const res = map[k] || {g:"CID-10",q:["Confirmar o diagnóstico conforme documento médico.","Caracterizar sintomas, evolução e tratamento.","Documentar achados objetivos e limitações funcionais.","Relacionar funcionalidade às exigências reais do cargo.","Não concluir incapacidade, nexo ou parecer apenas pelo CID."]};
  return {
    c: c || "CID",
    k: k,
    n: CID_CATEGORIES[c]?.n || "",
    g: CID_CATEGORIES[c]?.g || res.g,
    q: res.q
  };
}

function findCID(code){
  const raw = String(code || "").trim();
  if (!raw) return null;
  const c = normalizeCID(raw);
  if (!c) return null;
  const cNoDot = c.replace(/\./g, "");
  let exact = cidLibrary.find(x => x.c.toUpperCase() === c || x.c.toUpperCase().replace(/\./g, "") === cNoDot);
  if (exact) return exact;
  if (!c.includes(".") && c.length >= 4) {
    const withDot = c.slice(0, 3) + "." + c.slice(3);
    exact = cidLibrary.find(x => x.c.toUpperCase() === withDot);
    if (exact) return exact;
  }
  if (CID_CATEGORIES[c]) {
    const fb = cidFamilyFallback(c);
    return { c: c, n: CID_CATEGORIES[c].n, g: CID_CATEGORIES[c].g || fb.g, k: CID_CATEGORIES[c].k || c[0], q: fb.q };
  }
  if (CID_CATEGORIES[cNoDot]) {
    const fb = cidFamilyFallback(cNoDot);
    return { c: cNoDot, n: CID_CATEGORIES[cNoDot].n, g: CID_CATEGORIES[cNoDot].g || fb.g, k: CID_CATEGORIES[cNoDot].k || cNoDot[0], q: fb.q };
  }
  const cat3 = c.slice(0, 3);
  const starts = cidLibrary.find(x => x.c.toUpperCase().startsWith(cat3) || x.c.toUpperCase().replace(/\./g, "").startsWith(cat3));
  if (starts) {
    const catName = CID_CATEGORIES[cat3]?.n;
    if (catName) {
      return { c: c, n: catName, g: starts.g, k: starts.k, q: starts.q };
    }
    return starts;
  }
  return null;
}

function searchCIDs(query, limit = 12) {
  const q = String(query || "").trim();
  if (!q) return [];
  const qNorm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const qClean = qNorm.replace(/\s+/g, "");
  const qNoDot = qClean.replace(/\./g, "");
  const exacts = [], prefix = [], matches = [];
  for (let i = 0; i < cidLibrary.length; i++) {
    const item = cidLibrary[i];
    const cUpper = item.c.toUpperCase();
    const cNoDot = cUpper.replace(/\./g, "");
    if (cUpper === qClean || cNoDot === qNoDot) {
      exacts.push(item);
    } else if (cUpper.startsWith(qClean) || cNoDot.startsWith(qNoDot)) {
      prefix.push(item);
    } else if (item._norm && item._norm.includes(qNorm)) {
      matches.push(item);
    }
    if (exacts.length + prefix.length + matches.length >= limit * 2) break;
  }
  return [...exacts, ...prefix, ...matches].slice(0, limit);
}

function discardAIJustificativa() {
    const out = document.getElementById("aiJustificativaOutput");
    if (out) out.style.display = "none";
    document.getElementById("aiOutput").textContent = "";
    
    aiLastResult = null;
    invalidateAICache(); // Limpa o cache para forçar a IA a pensar de novo na próxima chamada
    
    toast("Sugestão descartada. Clique em 'Rascunhar justificativa' para gerar outra.");
}

// Carrega o CSV completo e mescla com a base de categorias
async function loadCIDs(){
  cidLoadStatus={status:"loading",count:cidLibrary.length,detail:"Carregando base oficial de CIDs..."};
  const url = location.protocol === "file:" ? `${API_FALLBACK}/cid10_saude_ocupacional_afastamentos.csv` : "/cid10_saude_ocupacional_afastamentos.csv";
  try{
    const response = await fetch(url, {cache:"default"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = (await response.text()).replace(/^\uFEFF/,"");
    const rows = parseCSV(csvText);
    if(!rows.length) throw new Error("CSV vazio ou sem registros.");
    const headers = rows[0].map(normalizeHeader);
    const idxCode = findHeader(headers,["codigo_cid","codigo","cid","code"]);
    const idxName = findHeader(headers,["nome_doenca","nome","descricao","descrição","disease"]);
    const idxGroup = findHeader(headers,["grupo_doenca","grupo","group"]);
    const ci = idxCode>=0?idxCode:0, ni = idxName>=0?idxName:1;
    
    const existing = new Set();
    const merged = [];
    for(let i=1;i<rows.length;i++){
      const row = rows[i]; if(!row||row.every(v=>!String(v??"").trim())) continue;
      const code = String(row[ci]??"").trim(), name = String(row[ni]??"").trim();
      if(!code&&!name) continue;
      const group = idxGroup>=0?String(row[idxGroup]??"").trim():"", fb = cidFamilyFallback(code);
      const rawNorm = (code.replace(/\./g,"") + " " + code + " " + name).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
      merged.push({c:code,n:name||"Descrição não informada",g:group||fb.g,k:normalizeCID(code).charAt(0),q:fb.q,_norm:rawNorm});
      existing.add(code.toUpperCase());
    }
    
    // Assegura que categorias chave sem ponto também estejam presentes para buscas rápidas
    Object.keys(CID_CATEGORIES).forEach(code => {
      if(!existing.has(code.toUpperCase())){
        const cat = CID_CATEGORIES[code];
        const fb = cidFamilyFallback(code);
        const rawNorm = (code.replace(/\./g,"") + " " + code + " " + cat.n).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
        merged.push({c:code,n:cat.n,g:cat.g||fb.g,k:cat.k||code[0],q:fb.q,_norm:rawNorm});
      }
    });
    
    merged.sort((a,b)=>a.c.localeCompare(b.c,"pt-BR",{numeric:true}));
    cidLibrary = merged;
    cidLoadStatus = {status:"ok",count:cidLibrary.length,detail:"Base oficial carregada"};
    updateCsvDiagnostic?.();
    if($("cid") && $("cid").value) renderCIDAssist(findCID($("cid").value)||null);
  }catch(error){
    console.error("Falha ao carregar CSV CID:",error);
    cidLoadStatus={status:"fallback",count:cidLibrary.length,detail:error?.message||"Modo local"};
    updateCsvDiagnostic?.();
  }
}
// Dispara o carregamento em paralelo imediatamente
loadCIDs().catch(()=>{});

function normalizeHeader(v){return String(v??"").replace(/^\uFEFF/,"").trim().toLowerCase();}
function findHeader(headers,candidates){for(const c of candidates){const i=headers.indexOf(c.toLowerCase());if(i>=0)return i;}return -1;}
function parseCSV(text){
  const rows=[];let row=[],field="",inQuotes=false;const s=String(text??"");
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(inQuotes){
      if(ch==='"'){if(s[i+1]==='"'){field+='"';i++;}else inQuotes=false;}else field+=ch;
    }else{
      if(ch==='"')inQuotes=true;
      else if(ch===','||ch===';'){row.push(field);field="";}
      else if(ch==='\r'||ch==='\n'){
        if(ch==='\r'&&s[i+1]==='\n')i++;
        row.push(field);field="";if(row.some(v=>String(v??"").trim()!==""))rows.push(row);row=[];
      }else field+=ch;
    }
  }
  if(inQuotes)throw new Error("CSV contém aspas não fechadas.");
  if(field.length||row.length){row.push(field);if(row.some(v=>String(v??"").trim()!==""))rows.push(row);}
  return rows;
}

function renderCIDAssist(entry){
  const inputCode = $("cid") ? $("cid").value : "";
  const data = entry || cidFamilyFallback(inputCode);
  if(!data) return;
  const currentCode = data.c || normalizeCID(inputCode) || "CID";
  const currentName = data.n || CID_CATEGORIES[currentCode]?.n || "Apoio de preenchimento por família de CID";
  
  $("cidAssistCode").textContent = currentCode;
  $("cidAssistName").textContent = currentName;
  $("cidAssistGroup").textContent = data.g || "CID-10";
  
  const quick = data.k==="F"
    ?"Sugestão de foco: estado mental atual, evolução temporal, tratamento, funcionalidade e relação entre sintomas e tarefas essenciais do cargo."
    :data.k==="M"
    ?"Sugestão de foco: função, dor, achados objetivos do exame físico, movimentos relevantes e exigências físicas reais do cargo."
    :data.k==="G"
    ?"Sugestão de foco: sintomas neurológicos, achados funcionais objetivos, tolerância e impacto nas tarefas essenciais."
    :data.k==="I"
    ?"Sugestão de foco: controle clínico, tratamento em curso, resposta terapêutica e esforço cardiovascular exigido no cargo."
    :data.k==="J"
    ?"Sugestão de foco: sintomas respiratórios, crises, tolerância ao esforço e eventuais agentes ocupacionais inalatórios."
    :data.k==="Z"
    ?"Sugestão de foco: contexto que motivou o atendimento, funcionalidade real e histórico clínico-ocupacional."
    :"Sugestão de foco: evolução clínica, tratamento, funcionalidade e exigências reais da atividade laboral.";
  $("cidQuick").textContent = quick;
  
  const cards = [
    ["Evolução clínica", data.q.slice(0,2), "sintomas", "Sintomas (Etapa 2)"],
    ["Tratamento e documentação", data.q.slice(2,3).length ? data.q.slice(2,3) : ["Registrar tratamento, exames/relatórios relevantes e resposta clínica."], "observacoes", "Atestado (Etapa 4)"],
    ["Capacidade funcional / trabalho", data.q.slice(3).length ? data.q.slice(3) : ["Descrever limitações funcionais concretas e relacioná-las às tarefas essenciais do cargo."], "limitacoes", "Limitações (Etapa 6)"],
    ["Nexo / contexto ocupacional", ["Considerar história clínica e ocupacional, organização e ambiente de trabalho, exposições e outros fatores pertinentes quando houver suspeita de relação com o trabalho."], "justificativa", "Justificativa (Etapa 8)"]
  ];
  
  $("cidCards").innerHTML = cards.map(([t,items,target,targetLabel]) => `
    <div class="cid-card">
      <h5>${esc(t)}</h5>
      <ul>${items.map(x=>`
        <li>
          <span class="cid-item-text">${esc(x)}</span>
          <button type="button" class="cid-item-btn" onclick="insertCIDText('${target}','${esc(x).replace(/'/g, "\\'")}')" title="Inserir no campo ${targetLabel}">+ Inserir</button>
        </li>
      `).join("")}</ul>
    </div>
  `).join("");
  $("cidAssist").classList.add("show");
}

function renderCIDSuggestions(value){
  const box = $("cidSuggestions");
  if(!box) return;
  const q = String(value || "").trim();
  if(!q){ box.classList.remove("show"); box.innerHTML=""; return; }
  const results = searchCIDs(q, 12);
  if(!results.length){ box.classList.remove("show"); box.innerHTML=""; return; }
  box.innerHTML = results.map(x => `
    <button type="button" class="cid-option" data-cid-code="${esc(x.c)}">
      <span class="cid-code">${esc(x.c)}</span>
      <span>
        <div class="cid-name">${esc(x.n)}</div>
        <div class="cid-group">${esc(x.g)}</div>
      </span>
    </button>
  `).join("");
  box.classList.add("show");
}

function onCidInput(value){
  renderCIDSuggestions(value);
  const exact = findCID(value);
  if(exact) {
    renderCIDAssist(exact);
    const rotulo = `${exact.c} — ${exact.n}`;
    const oldDoenca = String(state.aux?.doencaMotivo || state.doencaMotivo || $("doencaMotivo")?.value || "").trim();
    const isOldCID = /^[A-Z]\d{2}(\.\d+)?\s*[—–-]/i.test(oldDoenca);
    if((!oldDoenca || oldDoenca === "Conforme queixa relatada" || isOldCID || !oldDoenca.toUpperCase().startsWith(exact.c.toUpperCase())) && exact.n && !exact.n.includes("Apoio")){
      $("doencaMotivo").value = rotulo;
      state.doencaMotivo = rotulo;
      if(!state.aux) state.aux = {};
      state.aux.doencaMotivo = rotulo;
    }
  } else if(normalizeCID(value).length >= 1) {
    renderCIDAssist(null);
  } else {
    $("cidAssist")?.classList.remove("show");
  }
  state.cid = value;
  if(!state.aux) state.aux = {};
  state.aux.cid = value;
  autoSave();
}

async function deleteAtendimento() {
    if (isFinalizedReadOnly()) {
        toast("Atendimentos finalizados não podem ser excluídos por aqui. Use a Gestão.");
        return;
    }
    
    if (!(await confirm("Tem certeza que deseja excluir este atendimento? Ele será arquivado e fechado."))) { return; }
    
    const btn = document.querySelector('button[onclick="deleteAtendimento()"]');
    if(btn) { btn.disabled = true; btn.textContent = "Excluindo..."; }
    
    // Aborta salvamentos automáticos pendentes (Evita o erro PUT 409)
    clearTimeout(window.__saveTimer);
    clearTimeout(window.__serverSaveTimer);
    
    try {
        const idToArchive = state.__serverId || state.atendimento;
        if (idToArchive && state.__serverId) {
            const res = await AmbientalAuth.authFetch(`${getApiBase()}/api/atendimentos/${encodeURIComponent(idToArchive)}`, {
                method: 'DELETE',
                headers: { 'Accept': 'application/json' }
            });
            const body = await res.json().catch(()=>null);
            if (!res.ok) {
                throw new Error(body?.error?.message || body?.message || `Não foi possível arquivar o atendimento (${res.status}).`);
            }
        }
        
        // Remove backups locais do atendimento após o arquivamento no servidor.
        await window.AmbientalUtils?.DraftStore?.remove?.(`atendimento:${state.atendimento}`);
        window.AmbientalUtils?.legacyStorage?.remove?.("ambiental_lts_v2");
        window.AmbientalUtils?.legacyStorage?.remove?.("ambiental_lts_v1");
        
        toast("Atendimento excluído com sucesso!");
        
        // Redireciona para a central ou portal médico após o arquivamento
        setTimeout(() => { openManagement(); }, 1500);
        
    } catch (e) {
        toast(e.message || "Erro ao excluir o atendimento.");
        if(btn) { btn.disabled = false; btn.textContent = "Excluir"; }
    }
}

function isGenericCIDLabel(txt) {
  if (!txt || typeof txt !== "string") return false;
  const t = txt.trim();
  if (state?.isAcompanhante || state?.aux?.isAcompanhante || t.toLowerCase().includes("199") || t.toLowerCase().includes("acompanh") || t.includes(".") || t.length > 70) return false;
  return /^[A-Z]\d{2}(\.\d+)?\s*[—–-]\s*[A-Za-zÀ-ÿ\s]+$/i.test(t);
}

function selectCID(code){
  const found = findCID(code);
  const cleanCode = code || "";
  $("cid").value = cleanCode;
  $("cidSuggestions").classList.remove("show");
  renderCIDAssist(found);
  
  state.cid = cleanCode;
  if (!state.aux) state.aux = {};
  state.aux.cid = cleanCode;
  
  if (found && found.n && !found.n.includes("Apoio")) {
    const rotulo = `${found.c} — ${found.n}`;
    const oldDoenca = String(state.aux?.doencaMotivo || state.doencaMotivo || $("doencaMotivo")?.value || "").trim();
    if (!oldDoenca || oldDoenca === "Conforme queixa relatada" || isGenericCIDLabel(oldDoenca)) {
      $("doencaMotivo").value = rotulo;
      state.doencaMotivo = rotulo;
      state.aux.doencaMotivo = rotulo;
    }
  }
  
  autoSave();
  toast(`CID ${cleanCode}${found?.n ? ' (' + found.n + ')' : ''} selecionado.`);
}

function openOfficialCID(){
  window.open("https://terminologia.saude.gov.br/fhir/CodeSystem-BRCID10.html","_blank","noopener,noreferrer");
}

function insertCIDText(target, customText = null){
  const rawCode = $("cid") ? $("cid").value : "";
  const code = normalizeCID(rawCode);
  const entry = findCID(code);
  const data = entry || cidFamilyFallback(code);
  const nomeDoenca = entry?.n || CID_CATEGORIES[code]?.n || "";
  const rotuloDoenca = nomeDoenca && !nomeDoenca.includes("Apoio") ? `${code} — ${nomeDoenca}` : (code || "CID");
  
  if (target === "doenca") {
    if (!code) {
      toast("Informe um código de CID primeiro.");
      return;
    }
    const val = rotuloDoenca;
    $("doencaMotivo").value = val;
    state.doencaMotivo = val;
    if (!state.aux) state.aux = {};
    state.aux.doencaMotivo = val;
    autoSave();
    toast(`Doença motivadora preenchida: ${val}`);
    return;
  }
  
  let text = customText || "";
  if (!text) {
    if (target === "observacoes") {
      const qTrat = data.q && data.q[2] ? data.q[2] : "Registrar tratamento, relatórios médicos apresentados e resposta clínica.";
      text = `[Apoio CID ${rotuloDoenca}]: ${qTrat} Descrever dados objetivos do atestado/relatório médico apresentado.`;
    } else if (target === "sintomas") {
      const qEvol = (data.q || []).slice(0, 2).join(" ");
      text = `Roteiro de sintomas (${rotuloDoenca}): ${qEvol || "Caracterizar sintomas, evolução, intensidade, fatores de piora/melhora e tratamento em curso."}`;
    } else if (target === "limitacoes") {
      const qLim = (data.q || []).slice(3).join(" ");
      text = `Roteiro de limitações (${rotuloDoenca}): ${qLim || "Registrar limitações funcionais concretas e relacioná-las às tarefas essenciais e exigências reais do cargo."}`;
    } else if (target === "justificativa") {
      text = `Fundamentação técnica (${rotuloDoenca}): Analisar nexo, correlação entre sintomas e atividade do cargo, consistência dos documentos médicos e capacidade laborativa observada. Não presumir incapacidade apenas pelo diagnóstico.`;
    }
  }
  
  if (target === "observacoes") {
    const el = $("obsDocumentos");
    if (el) el.value = (el.value ? el.value.trim() + "\n\n" : "") + text;
    toast("Roteiro inserido nas observações do atestado (Etapa 4)!");
  } else if (target === "sintomas") {
    const el = $("sintomasLimitacao");
    if (el) el.value = (el.value ? el.value.trim() + "\n\n" : "") + text;
    toast("Roteiro inserido em Sintomas / Queixa (Etapa 2)!");
  } else if (target === "limitacoes") {
    setRadio("limitacaoFuncional", "Sim");
    toggleLimitacao1();
    const el = $("descLimitacao");
    if (el) el.value = (el.value ? el.value.trim() + "\n\n" : "") + text;
    toast("Roteiro inserido em Limitações Funcionais (Etapa 6)!");
  } else if (target === "justificativa") {
    const el = $("justificativa");
    if (el) el.value = (el.value ? el.value.trim() + "\n\n" : "") + text;
    toast("Lembrete inserido na Justificativa (Etapa 8)!");
  }
  
  autoSave();
}
document.addEventListener("click",(e)=>{
  if(!e.target.closest(".cid-wrap")){
    const box=$("cidSuggestions"); if(box)box.classList.remove("show");
  }
});

/* =========================================================
   IA — SUGESTÃO PONTUAL DE JUSTIFICATIVA
   ========================================================= */
let aiController=null,aiLastResult=null,aiLastAction="",aiInFlight=false,aiClientCache=new Map();
function setAIState(text,kind=""){const el=$("aiState");if(el){el.className=`ai-state ${kind}`;el.textContent=text;}}
function stableHash(value){let str="";try{const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==="object"?Object.keys(v).sort().reduce((o,k)=>(o[k]=stable(v[k]),o),{}):v;str=JSON.stringify(stable(value));}catch{str=String(value)}let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);}return (h>>>0).toString(16);}
function cleanJustificativaText(text) {
  let t = String(text || "").trim();
  if (!t) return "";
  t = t.replace(/\bPaciente\b/g, "Servidor")
       .replace(/\bpaciente\b/g, "servidor")
       .replace(/\bPacientes\b/g, "Servidores")
       .replace(/\bpacientes\b/g, "servidores");
  t = t.replace(/[\s\.\,]*\b(?:Concedo|concedo|Concedido[s]?|concedido[s]?)\s+\d+\s+dias?\s+de\s+afastamento[^\.\n\r]*[\.\,]?/g, ".");
  t = t.replace(/[\s\.\,]*\btempo\s+este\s+considerado\s+suficiente\s+para\s+(?:o\s+)?restabelecimento\s+da\s+capacidade\s+laborativa[^\.\n\r]*[\.\,]?/gi, ".");
  t = t.replace(/[\s\.\,]*\ba\s+contar\s+da\s+data\s+de\s+in[íi]cio\s+dos\s+sintomas[^\.\n\r]*[\.\,]?/gi, ".");
  t = t.replace(/\bCID\s+([A-Z]\d{2}(?:\.\d+)?)\s*\(\s*([A-Z]\d{2}(?:\.\d+)?)\s*[—–-]\s*([^\)]+)\)/gi, (m, c1, c2, d2) => {
    const c1Clean = c1.toUpperCase().replace(/\./g, "");
    const c2Clean = c2.toUpperCase().replace(/\./g, "");
    if (c1Clean === c2Clean) return `CID ${c1} — ${d2.trim()}`;
    const info1 = findCID(c1);
    if (info1 && info1.n && !info1.n.includes("Apoio")) return `CID ${c1} — ${info1.n}`;
    return `CID ${c1}`;
  });
  t = t.replace(/\bCID\s+([A-Z]\d{2}(?:\.\d+)?)\s*[—–-]\s*([A-Z]\d{2}(?:\.\d+)?)\s*[—–-]\s*([^,\.\n]+)/gi, (m, c1, c2, d2) => {
    const c1Clean = c1.toUpperCase().replace(/\./g, "");
    const c2Clean = c2.toUpperCase().replace(/\./g, "");
    if (c1Clean === c2Clean) return `CID ${c1} — ${d2.trim()}`;
    const info1 = findCID(c1);
    if (info1 && info1.n && !info1.n.includes("Apoio")) return `CID ${c1} — ${info1.n}`;
    return `CID ${c1}`;
  });
  t = t.replace(/\s*,\s*\./g, ".").replace(/\.{2,}/g, ".").replace(/[ \t]{2,}/g, " ").trim();
  t = t.replace(/^[\s\.\,]+/, "").trim();
  if (t && !/[.!?]$/.test(t)) t += ".";
  return t;
}

function renderAIResult(result,target="aiOutput"){
  const box=$(target),out=$("aiJustificativaOutput");
  if(!box)return;
  const rawText=String(result?.justificativa||"").trim();
  const text=cleanJustificativaText(rawText);
  box.textContent=text||"A IA não retornou uma sugestão válida.";
  if(out)out.style.display=text?"block":"none";
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function apiAI(path, payload, action, label, target = "aiOutput") {
  if (aiInFlight) {
    toast("Já existe uma sugestão de IA em andamento.");
    return null;
  }

  const contextHash = stableHash(payload);
  const cacheKey = `${path}:${contextHash}`;
  
  if (aiClientCache.has(cacheKey)) {
    const cached = aiClientCache.get(cacheKey);
    aiLastResult = cached;
    aiLastAction = action || "";
    renderAIResult(cached, target);
    setAIState("Sugestão reutilizada", "success");
    return cached;
  }

  aiController = new AbortController();
  aiInFlight = true;
  const timer = setTimeout(() => aiController.abort(), 45000);
  setAIState(label || "Processando contexto...", "loading");

  // --- UP VISUAL: Ativar Shimmer e Spinner ---
  const box = document.getElementById(target);
  const outBox = document.getElementById("aiJustificativaOutput");
  const aiButtons = document.querySelectorAll('.btn-ai');

  // Trava os botões e mostra o spinner
  aiButtons.forEach(btn => {
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-ai"></span> Gerando...';
    btn.classList.add('loading');
  });

  // Mostra a caixa e injeta o Shimmer (esqueleto animado)
  if (outBox) outBox.style.display = "block";
  if (box) {
    box.innerHTML = `
      <div class="skeleton-loader skeleton-title"></div>
      <div class="skeleton-loader skeleton-line-1"></div>
      <div class="skeleton-loader skeleton-line-2"></div>
      <div class="skeleton-loader skeleton-line-3"></div>
      <div class="skeleton-loader skeleton-line-4"></div>
    `;
  }
  // ------------------------------------------

  // --- Suporte a Streaming em Tempo Real (SSE) para Justificativas Periciais ---
  if (path === "/api/ai/justificativa" && window.AmbientalAPI?.ai?.justificativaStream) {
    try {
      if (box) {
        box.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span class="spinner-ai" style="width:13px;height:13px;border-width:2px;border-top-color:#0284c7"></span>
            <span style="font-size:11.5px;font-weight:700;color:#0284c7;letter-spacing:0.3px">TRANSMISSÃO EM TEMPO REAL (GEMINI AI)</span>
          </div>
          <div class="streaming-text cursor-blink" id="aiStreamingOutput" style="white-space:pre-wrap;font-size:13.5px;line-height:1.6;color:#1e293b;min-height:50px"></div>
        `;
      }
      const streamContainer = document.getElementById("aiStreamingOutput");
      const fullText = await AmbientalAPI.ai.justificativaStream(payload, {
        onChunk: (chunk, acc) => {
          if (streamContainer) {
            streamContainer.textContent = acc;
          }
        }
      });
      clearTimeout(timer);
      const cleaned = typeof cleanJustificativaText === "function" ? cleanJustificativaText(fullText) : fullText;
      const d = { justificativa: cleaned, cached: false };
      aiLastResult = d;
      aiLastAction = action || "";
      aiClientCache.set(cacheKey, d);
      renderAIResult(d, target);
      setAIState("Justificativa gerada em tempo real!", "success");
      return d;
    } catch (streamErr) {
      console.warn("Falha no streaming SSE da justificativa, alternando para fallback HTTP padrão:", streamErr);
    }
  }

  try {
    const r = await AmbientalAuth.authFetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}` 
      },
      body: JSON.stringify(payload),
      signal: aiController.signal
    });
    
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      throw new Error(formatApiError(d, r.status));
    }
    
    aiLastResult = d;
    aiLastAction = action || "";
    aiClientCache.set(cacheKey, d);
    renderAIResult(d, target);
    setAIState("Sugestão pronta — revise antes de usar", "success");
    return d;

  } catch (e) {
    if (e?.name === "AbortError") toast("A geração da sugestão excedeu o tempo limite.");
    else toast(e.message || "Não foi possível gerar a sugestão.");
    
    setAIState("Falha ao gerar sugestão", "error");
    if (box) box.innerHTML = '<span style="color: #A12626;">Erro: A inteligência artificial não conseguiu processar este pedido. Tente novamente.</span>';
    return null;

  } finally {
    clearTimeout(timer);
    aiController = null;
    aiInFlight = false;
    
    // --- UP VISUAL: Restaurar Botões ---
    aiButtons.forEach(btn => {
      if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
      btn.classList.remove('loading');
    });
  }
}
function getJustificativaContext(){
  const v=values();
  const limitacoes=[v.descLimitacao,v.atividadesComprometidas,v.sintomasLimitacao,v.alteracoesClinicasExames].filter(x=>String(x||"").trim()).join(" | ");
  const subtipo = state.outrosSubtipo || state.aux?.outrosSubtipo || state.aux?.areaExameClinico || "";
  const resultado = state.outrosResultado || state.aux?.outrosResultado || state.aux?.resultadoAvaliacao || "";
  
  const cidVal = String(v.cid || state.cid || "").trim();
  let doencaVal = String(v.doencaMotivo || state.doencaMotivo || "").trim();
  const foundCid = findCID(cidVal);
  if (foundCid && foundCid.n && !foundCid.n.includes("Apoio")) {
    const isOldCID = /^[A-Z]\d{2}(\.\d+)?\s*[—–-]/i.test(doencaVal);
    if (!doencaVal || doencaVal === "Conforme queixa relatada" || (isOldCID && !doencaVal.toUpperCase().startsWith(cidVal.toUpperCase()))) {
      doencaVal = `${foundCid.c} — ${foundCid.n}`;
      if ($("doencaMotivo")) $("doencaMotivo").value = doencaVal;
      if ($("agilDoencaMotivo")) $("agilDoencaMotivo").value = doencaVal;
      state.doencaMotivo = doencaVal;
      if (!state.aux) state.aux = {};
      state.aux.doencaMotivo = doencaVal;
    }
  }

  return {
    atendimento:v.atendimento,
    cargo:v.cargo,
    idade:v.idade,
    cid:cidVal,
    cids_secundarios:v.cidsSecundarios || state.cidsSecundarios || [],
    cidsSecundarios:v.cidsSecundarios || state.cidsSecundarios || [],
    doenca_motivo:doencaVal,
    queixa_duracao:v.queixaDuracao,
    tempo_funcao:v.tempoCargo,
    unidade_tempo:v.unidadeTempo,
    sintomas_limitacoes:v.sintomasLimitacao,
    medicamentos:v.medicamentos,
    condicoes:v.condicoes,
    antecedentes:v.historicoPregresso,
    historico_pregresso:v.historicoPregresso,
    documentos_complementares:v.documentosComplementares,
    exame_fisico_tipo:v.exameFisicoTipo,
    outros_subtipo:subtipo,
    outros_resultado:resultado,
    area_exame_clinico:subtipo,
    resultado_avaliacao:resultado,
    alteracoes_clinicas_exames:v.alteracoesClinicasExames,
    exame:v.exame,
    limitacoes,
    desc_limitacao:v.descLimitacao,
    atividades_comprometidas:v.atividadesComprometidas,
    capacidade:v.capacidade,
    parecer:v.parecer,
    quesitos:v.quesitos
  };
}
function invalidateAICache(){aiClientCache.clear();}
async function applyAIText(mode) {
  if(isFinalizedReadOnly()){toast("Atendimento finalizado: a sugestão pode ser analisada, mas não aplicada.");return;}
  const rawText = String(aiLastResult?.justificativa || "").trim();
  const text = cleanJustificativaText(rawText);
  if(!text)return toast("Não há sugestão de IA disponível.");
  const f=$("justificativa"),cur=f.value.trim();
  if(mode==="replace"){
    if (cur && !(await confirm("Substituir o texto atual pela sugestão da IA?"))) return;
    state._justificativa_anterior = cur;
    f.value=text;
  }else{
    state._justificativa_anterior = cur;
    f.value=cur?cur+"\n\n"+text:text;
  }
  if ($("agilJustificativa")) $("agilJustificativa").value = f.value;
  if (!state.aux) state.aux = {};
  state.aux.justificativa = f.value;
  state.justificativa = f.value;
  const btnUndo = $("btnUndoJustificativa");
  if(btnUndo) btnUndo.style.display = "inline-flex";
  invalidateAICache();autoSave();
  toast(mode==="replace"?"Justificativa substituída após confirmação.":"Sugestão adicionada abaixo do texto existente.");
}

function undoJustificativa() {
  if (state._justificativa_anterior !== undefined && state._justificativa_anterior !== null) {
    const f = $("justificativa");
    const current = f.value;
    f.value = state._justificativa_anterior;
    if ($("agilJustificativa")) $("agilJustificativa").value = f.value;
    if (!state.aux) state.aux = {};
    state.aux.justificativa = f.value;
    state.justificativa = f.value;
    state._justificativa_anterior = current;
    autoSave();
    toast("Texto anterior da justificativa restaurado.");
  }
}
async function gerarJustificativaIA(){return apiAI("/api/ai/justificativa",getJustificativaContext(),"justificativa","Gerando justificativa...");}
async function verSugestaoJustificativaIA(){go(8);return gerarJustificativaIA();}
async function gerarJustificativaAgilIA(){
  if (aiInFlight) {
    toast("Já existe uma geração de IA em andamento para este cadastro. Aguarde a conclusão.");
    return;
  }
  if (state.exameFisicoTipo === "Outros" && state.outrosResultado === "Alterado") {
    const cidVal = state.cid || state.aux?.cid || $("cid")?.value || $("agilCid")?.value || "";
    const cidInfo = typeof findCID === "function" ? findCID(cidVal) : null;
    const cidNome = cidInfo?.n || "patologia em tratamento";
    const cargoNome = state.aux?.cargo || state.cargo || $("cargo")?.value || $("agilCargo")?.value || "servidor";
    const curDesc = String(state.descLimitacao || state.aux?.descLimitacao || "").trim();
    const isOldLimitacao = curDesc.startsWith("Limitações funcionais decorrentes do quadro clínico");
    if (!curDesc || isOldLimitacao) {
      const limitacaoCid = `Limitações funcionais decorrentes do quadro clínico (${cidVal ? cidVal + ' - ' : ''}${cidNome}), com redução temporária do rendimento e necessidade de repouso/adaptação funcional para as atividades do cargo de ${cargoNome}.`;
      state.descLimitacao = limitacaoCid;
      if (!state.aux) state.aux = {};
      state.aux.descLimitacao = limitacaoCid;
      if ($("descLimitacao")) $("descLimitacao").value = limitacaoCid;
      if (!state.aux.sintomasLimitacao || state.aux.sintomasLimitacao.startsWith("Limitações funcionais decorrentes")) {
        state.aux.sintomasLimitacao = limitacaoCid;
        state.sintomasLimitacao = limitacaoCid;
      }
    }
  }
  syncAgilToExtended();
  const btn = $("btnAgilJustificativaIA");
  const oldText = btn ? btn.innerHTML : "✨ Gerar Justificativa com IA";
  if (btn) { btn.disabled = true; btn.innerHTML = "<span>⏳</span> Gerando..."; }
  try {
    const res = await apiAI("/api/ai/justificativa", getJustificativaContext(), "justificativa", "Gerando justificativa...");
    if (res && res.justificativa) {
      const text = cleanJustificativaText(res.justificativa);
      if ($("agilJustificativa")) $("agilJustificativa").value = text;
      if ($("justificativa")) $("justificativa").value = text;
      if (!state.aux) state.aux = {};
      state.aux.justificativa = text;
      state.justificativa = text;
      autoSave();
      toast("Justificativa sugerida pela IA aplicada com sucesso!");
    }
  } catch (err) {
    toast(err?.message || "Erro ao gerar justificativa com IA.");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
}
const EXAME_FISICO_OPTIONS=["Exame Físico Geral","Tecido celular subcutâneo","Pele e Fâneros","Aparelho Circulatório","Aparelho Respiratório","Aparelho Hemolinfopoiético","Aparelho Digestivo","Aparelho Genitourinário","Aparelho Osteomuscular e Tecido Conjutivo","Aparelho Endócrino","Sistema Nervoso","Órgãos dos Sentidos","Exame Mental","Outros"];
function renderFillSuggestion(result){
  const box=$("reviewFillOutput");if(!box)return;
  const s=result?.sugestoes_preenchimento||{}; const q=Array.isArray(result?.quesitos_sugeridos)?result.quesitos_sugeridos:[];
  const rows=[
    ["Queixa e duração",s.queixa_e_duracao],
    ["Antecedentes mórbidos",s.antecedentes_morbidos],
    ["Exame físico/mental",s.exame_fisico_mental],
    ["Alterações clínicas / exames",s.alteracoes_clinicas_exames],
    ["Limitações físicas/mentais",s.limitacoes_fisicas_mentais],
    ["Justificativa Parecer Final",s.justificativa_parecer_final]
  ].filter(r=>String(r[1]||"").trim());
  const docs=Array.isArray(s.atestado_relatorio_exames)?s.atestado_relatorio_exames:[];
  const qs=Array.isArray(result?.quesitos_sugeridos)?result.quesitos_sugeridos:[];
  box.innerHTML=`<div class="fill-suggestion review-ai-fill"><h4>Preenchimento assistido — revisão humana obrigatória</h4>${rows.map(r=>`<div class="suggestion-row"><div class="suggestion-label">${esc(r[0])}</div><div class="suggestion-value">${esc(r[1])}</div></div>`).join("")}${docs.length?`<div class="suggestion-row"><div class="suggestion-label">Documentos / exames</div><div class="suggestion-value">${docs.map(d=>esc([d.tipo,d.data,d.resultado].filter(Boolean).join(" — "))).join("<br>")}</div></div>`:""}${qs.length?`<div class="suggestion-row"><div class="suggestion-label">Quesitos sugeridos</div><div class="suggestion-value">${qs.map(q=>`Q${esc(q.numero||"")}: ${esc(q.resposta||"—")}${q.justificativa?` — ${esc(q.justificativa)}`:""}`).join("<br>")}</div></div>`:""}<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline" type="button" onclick="applyFillSuggestions()">Aplicar sugestões aos campos vazios</button><button class="btn btn-outline" type="button" onclick='$("reviewFillOutput").innerHTML=""'>Descartar</button></div></div>`;
  window.__aiFillResult=result;
}
async function applyFillSuggestions(){
  if(isFinalizedReadOnly()){toast("Atendimento finalizado: sugestões não podem ser aplicadas sem reabertura.");return;}
  const r=window.__aiFillResult||{}; const s=r.sugestoes_preenchimento||{};
  if(!confirm("Aplicar somente sugestões da IA aos campos vazios? Os dados já preenchidos não serão substituídos."))return;
  if($("queixaDuracao")&&!$("queixaDuracao").value.trim()&&s.queixa_e_duracao)$("queixaDuracao").value=s.queixa_e_duracao;
  if(!$("historicoPregresso").value.trim()&&s.antecedentes_morbidos)$("historicoPregresso").value=s.antecedentes_morbidos;
  if(!$("exameFisicoTipo").value.trim()&&s.exame_fisico_mental)$("exameFisicoTipo").value=s.exame_fisico_mental;
  if(!$("alteracoesClinicasExames").value.trim()&&s.alteracoes_clinicas_exames)$("alteracoesClinicasExames").value=s.alteracoes_clinicas_exames;
  if(!$("descLimitacao").value.trim()&&s.limitacoes_fisicas_mentais)$("descLimitacao").value=s.limitacoes_fisicas_mentais;
  if(!$("justificativa").value.trim()&&s.justificativa_parecer_final)$("justificativa").value=s.justificativa_parecer_final;
  if (!(await confirm("Aplicar somente sugestões da IA aos campos vazios?"))) return;
}
async function sugerirPreenchimentoIA(){
  const c=getFormContext(); const r=await apiAI("/api/ai/preenchimento",c,"preenchimento","Revisando e sugerindo preenchimento..."); if(r){renderFillSuggestion(r);setAIState("Revisão assistida concluída",r?.nivel_atencao==="baixo"?"success":"attention");} return r;
}
function renderFinalReportAI(result){
  const box=$("reviewFillOutput"); if(!box)return;
  const docs=Array.isArray(result?.atestado_relatorio_exames)?result.atestado_relatorio_exames:[];
  const qs=Array.isArray(result?.quesitos_sugeridos)?result.quesitos_sugeridos.slice(0,3):[];
  const rows=[
    ["Queixa e duração",result?.queixa_e_duracao],
    ["Antecedentes mórbidos",result?.antecedentes_morbidos],
    ["Exame físico / mental",result?.exame_fisico_mental],
    ["Alterações clínicas / exames",result?.alteracoes_clinicas_exames],
    ["Limitações físicas / mentais",result?.limitacoes_fisicas_mentais],
    ["Justificativa Parecer Final",result?.justificativa_parecer_final]
  ].filter(x=>String(x[1]||"").trim());
  const sameThree=qs.length===3 && new Set(qs.map(q=>String(q.resposta||"").trim())).size===1;
  box.innerHTML=`<div class="fill-suggestion review-ai-fill final-ai-draft">
    <h4>Minuta final com IA — conferência humana obrigatória</h4>
    <p class="help">Texto objetivo para os campos finais. Nada será aplicado automaticamente.</p>
    ${rows.map(r=>`<div class="suggestion-row"><div class="suggestion-label">${esc(r[0])}</div><div class="suggestion-value">${esc(r[1])}</div></div>`).join("")}
    ${docs.length?`<div class="suggestion-row"><div class="suggestion-label">Atestado / relatório / exames</div><div class="suggestion-value">${docs.map(d=>esc([d.tipo,d.data,d.resultado].filter(Boolean).join(" — "))).join("<br>")}</div></div>`:""}
    ${qs.length?`<div class="suggestion-row"><div class="suggestion-label">Quesitos padronizados</div><div class="suggestion-value">${qs.map(q=>`Q${esc(q.numero||"")}: <b>${esc(q.resposta||"—")}</b>${q.justificativa?` — ${esc(q.justificativa)}`:""}`).join("<br>")}</div></div>`:""}
    ${result?.inconsistencias?.length?`<div class="suggestion-alert"><b>Pontos para revisão:</b><ul>${result.inconsistencias.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}
    ${sameThree?`<div class="suggestion-alert"><b>Atenção:</b> as três respostas sugeridas ficaram iguais. O sistema não aplicará essas respostas automaticamente; revise cada quesito.</div>`:""}
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" type="button" onclick="applyFinalReportAI()">Aplicar aos campos vazios</button><button class="btn btn-outline" type="button" onclick='$("reviewFillOutput").innerHTML=""'>Descartar minuta</button></div>
  </div>`;
  window.__aiFinalReport=result;
}
// Mantém apenas uma implementação da ação de conteúdo final.
// A rota dedicada /api/ai/documento usa prompt específico e cache por contexto.

async function applyFinalReportAI(){
  if(isFinalizedReadOnly()){toast("Atendimento finalizado: a minuta pode ser revisada, mas não aplicada.");return;}
  const r=window.__aiFinalReport||{};
  if(!confirm("Aplicar a minuta da IA somente aos campos vazios? Os dados já preenchidos não serão substituídos."))return;
  const setIfEmpty=(id,value)=>{const el=$(id);if(el&&!el.value.trim()&&String(value||"").trim()){el.value=value;return true;}return false;};
  setIfEmpty("queixaDuracao",r.queixa_e_duracao);
  setIfEmpty("historicoPregresso",r.antecedentes_morbidos);
  setIfEmpty("exameFisicoTipo",r.exame_fisico_mental);
  setIfEmpty("alteracoesClinicasExames",r.alteracoes_clinicas_exames);
  setIfEmpty("descLimitacao",r.limitacoes_fisicas_mentais);
  setIfEmpty("justificativa",r.justificativa_parecer_final);
  if(Array.isArray(r.atestado_relatorio_exames)&&r.atestado_relatorio_exames.length&&!state.documentosComplementares.length){
    state.documentosComplementares=r.atestado_relatorio_exames.map(d=>({tipo:d.tipo||"",data:d.data||"",resultado:d.resultado||""})).filter(d=>d.tipo||d.data||d.resultado);
    renderDocumentRecords();
  }
  if(!state.quesitos.length && Array.isArray(r.quesitos_sugeridos) && r.quesitos_sugeridos.length===3){
    const p=["Há doença(s) ou sequela(s) de doença(s) prévia(s)?","A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)?","A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol?"];
    state.quesitos=r.quesitos_sugeridos.slice(0,3).map((q,i)=>({pergunta:p[i],resposta:["Sim","Não"].includes(q.resposta)?q.resposta:"",justificativa:q.justificativa||""}));
    renderQuesitos();
  }
  if (!(await confirm("Aplicar a minuta da IA somente aos campos vazios?"))) return;
}

function getApiBase(){return location.protocol==="file:"?API_FALLBACK:location.origin;}
function refreshAIStatus(){AmbientalAuth.authFetch(`${getApiBase()}/status-ia`,{headers:{"Accept":"application/json"},cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{aiBackendOnline=!!d?.backend_online;aiGeminiAvailable=!!d?.gemini_disponivel;setAIStatus(aiGeminiAvailable?"online":"offline",aiGeminiAvailable?"IA Online":"IA Indisponível");}).catch(()=>{aiBackendOnline=false;aiGeminiAvailable=false;setAIStatus("offline","IA Indisponível");});}
function formatApiError(data,status){const err=data?.error||{};const d=String(err?.message||data?.detail||data?.error?.detail||"").trim();const details=err?.details||{};const g=details?.status_gemini??data?.status_gemini;const ra=Number(details?.retry_after_seconds||data?.retry_after_seconds||0);if(g===404)return `Modelo Gemini indisponível (HTTP ${g}). ${d}`;if(g===401||g===403)return `Chave Gemini inválida ou sem permissão (HTTP ${g}). ${d}`;if(g===429||status===429)return `IA temporariamente ocupada. ${d||"Aguarde alguns segundos e tente novamente."}${ra?` Aguarde ${ra}s.`:""}`;if(g>=500&&g<=599)return `Indisponibilidade temporária da IA. ${d||"Tente novamente em instantes."}`;return d||`Erro HTTP ${status||"desconhecido"}.`;}

function openDiagnostic(){$("diagnosticModal").classList.add("show");renderDiagnosticBase();runDiagnostics();}
function setDiag(id,status,text){const el=$(id);if(el){el.className=`diag-status ${status}`;el.textContent=text;}}
function setDiagDetail(id,text){const el=$(id);if(el)el.textContent=text;}
function renderDiagnosticBase(){
 $("diagTimestamp").textContent=new Date().toLocaleString("pt-BR");$("diagApiBase").textContent=getApiBase();setDiag("diagJs","ok","✓ JavaScript funcionando");
 const file=location.protocol==="file:";setDiag("diagMode",file?"warn":"ok",file?"⚠ O HTML está sendo aberto diretamente pelo file://.":"✓ HTML executando via servidor HTTP");setDiagDetail("diagModeDetail",file?"Recomenda-se utilizar um servidor HTTP local.":`Protocolo detectado: ${location.protocol}`);
 $("diagModeTech").textContent=file?"file:":"HTTP";updateCsvDiagnostic();
}
function updateCsvDiagnostic(){if(!$( "diagCsv"))return;if(cidLoadStatus.status==="ok"){setDiag("diagCsv","ok","✓ CSV carregado");setDiagDetail("diagCsvDetail",`Registros: ${cidLoadStatus.count}`);$("diagCsvTech").textContent=`OK — ${cidLoadStatus.count}`;}else if(cidLoadStatus.status==="error"){setDiag("diagCsv","error","✕ CSV não carregado");setDiagDetail("diagCsvDetail",cidLoadStatus.detail);$("diagCsvTech").textContent="ERRO";}else{setDiag("diagCsv","loading","⏳ CSV carregando...");setDiagDetail("diagCsvDetail",cidLoadStatus.detail);$("diagCsvTech").textContent="carregando";}}
async function runDiagnostics(){
 $("diagRun").disabled=true;setDiag("diagFlask","loading","⏳ Testando Flask...");setDiag("diagRoute","loading","⏳ Testando rota IA...");
 try{const r=await AmbientalAuth.authFetch(`${getApiBase()}/`,{headers:{"Accept":"application/json"},cache:"no-store"}),d=await r.json().catch(()=>null);if(!r.ok||d?.status!=="online")throw new Error(formatApiError(d,r.status));setDiag("diagFlask","ok","✓ Flask online");setDiagDetail("diagFlaskDetail",`Modelo: ${d.modelo||"—"} | Chave configurada: ${d.chave_configurada?"SIM":"NÃO"}`);$("diagModel").textContent=d.modelo||"—";$("diagKey").textContent=d.chave_configurada?"SIM":"NÃO";$("diagFlaskTech").textContent="online";}catch(e){setDiag("diagFlask","error","✕ Flask indisponível");setDiagDetail("diagFlaskDetail",e?.message||"Servidor Flask não está rodando.");$("diagModel").textContent="—";$("diagKey").textContent="—";$("diagFlaskTech").textContent="indisponível";}
 try{const r=await AmbientalAuth.authFetch(`${getApiBase()}/status-ia`,{headers:{"Accept":"application/json"},cache:"no-store"});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(`HTTP ${r.status}`);if(d?.gemini_disponivel){setDiag("diagStatusIA","ok","✓ Gemini disponível");setDiagDetail("diagStatusIADetail",`Modelo: ${d.modelo||"—"} | Chave configurada: ${d.chave_configurada?"SIM":"NÃO"}`);}else{setDiag("diagStatusIA","warn","⚠ Gemini indisponível");setDiagDetail("diagStatusIADetail",d?.detalhe||"Não configurado");}}catch(e){setDiag("diagStatusIA","error","✕ /status-ia indisponível");setDiagDetail("diagStatusIADetail",e?.message||"Falha de conexão.");}
 try{const r=await AmbientalAuth.authFetch(`${getApiBase()}/gerar-justificativa`,{method:"OPTIONS",headers:{"Accept":"application/json"}});if(r.ok||r.status===204){setDiag("diagRoute","ok","✓ Rota /gerar-justificativa disponível");setDiagDetail("diagRouteDetail",`HTTP ${r.status}`);$("diagRouteTech").textContent="disponível";}else throw new Error(`HTTP ${r.status}`);}catch(e){setDiag("diagRoute","error","✕ Rota da IA indisponível");setDiagDetail("diagRouteDetail",e?.message||"Servidor Flask não está acessível.");$("diagRouteTech").textContent="indisponível";}
 updateCsvDiagnostic();$("diagTimestamp").textContent=new Date().toLocaleString("pt-BR");$("diagRun").disabled=false;
}
async function testDiagnosticAI(){
 const btn=$("diagAiTest"),prev=btn.textContent;btn.disabled=true;btn.textContent="Testando IA...";setDiag("diagAi","loading","⏳ Testando geração da IA...");setDiagDetail("diagAiDetail","Enviando apenas dados fictícios de teste.");
 try{const r=await AmbientalAuth.authFetch(`${getApiBase()}/gerar-justificativa`,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({cargo:"Teste",idade:"40",cid:"Z00",limitacoes:"Nenhuma limitação objetiva registrada para este teste.",capacidade:"Capacidade laborativa preservada"})});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(formatApiError(d,r.status));const t=String(d?.justificativa||d?.resumo||"").trim();if(!t)throw new Error("Resposta estruturada vazia da API.");setDiag("diagAi","ok","✓ Gemini respondeu corretamente");setDiagDetail("diagAiDetail",`Resposta recebida (${t.length} caracteres). Nenhum dado do formulário foi usado.`);}catch(e){setDiag("diagAi","error","✕ Falha no teste do Gemini");setDiagDetail("diagAiDetail",e?.message||"Falha desconhecida.");}finally{btn.disabled=false;btn.textContent=prev;}
}
function buildSteps(){
  $("steps").innerHTML=steps.map((s,i)=>`
    <button class="step ${i===0?"active":""}" id="step-${i+1}" onclick="go(${i+1})" aria-label="Etapa ${s[0]} — ${s[1]}">
      <div class="step-num">${s[0]}</div>
      <div class="step-copy"><b>${s[1]}</b><small>${s[2]}</small></div>
      <span class="step-status" aria-hidden="true"></span>
    </button>`).join("");
}

function updateProgress(){
  const pct=Math.round((state.current/9)*100);$("sideProgress").textContent=`Etapa ${state.current} de 9`;$("progressLabel").textContent=`${state.current}. ${steps[state.current-1][1]}`;$("progressPercent").textContent=`${pct}%`;$("progressFill").style.width=pct+"%";qsa(".step").forEach((el,i)=>{el.classList.toggle("active",i===state.current-1);el.classList.toggle("done",i<state.current-1);});updateStepValidation();
}
function isYesNoAnswer(value){
  if(!value) return false;
  const s = String(value).trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return s === "sim" || s === "s" || s === "não" || s === "nao" || s.startsWith("s") || s.startsWith("n") || s.includes("\ufffd");
}
function updateStepValidation(){
  const result=ValidationEngine.get(); const qv=result.quesitos || QuesitoService.validate();
  qsa(".step").forEach((el,i)=>{const step=i+1;const data=result.steps[step]||{count:0,pending:[]};const st=el.querySelector(".step-status");el.classList.toggle("needs-review",data.count>0);el.classList.toggle("complete-valid",data.count===0&&step<=state.current);if(!st)return;if(step===7){const needs=qv.answered<3;st.textContent=needs?`! ${3-qv.answered}`:(qv.allSame?"⚠":"✓");el.classList.toggle("needs-review",needs);el.classList.toggle("complete-valid",qv.answered===3&&step<=state.current);}else st.textContent=data.count?`! ${data.count}`:(data.count===0&&step<=state.current?"✓":"");});
}
function go(n){
  if(n<1||n>9)return;
  state.current=n;
  qsa(".section").forEach(s=>s.classList.remove("active"));
  $("section-"+n).classList.add("active");
  updateProgress();
  if(n===5) renderExam();
  if(n===9){ try{ renderReview(); }catch(error){ console.error("Falha ao renderizar revisão:",error); const rs=$("reviewStatus"); if(rs){rs.className="review-status error";rs.innerHTML='<span class="review-symbol">🔴</span><span>Não foi possível montar a revisão. Recarregue o atendimento e tente novamente.</span>'; } } }
  window.scrollTo({top:0,behavior:"smooth"});
  if(state.atendimento) autoSave(); else setPersistStatus("","Não salvo — clique em Salvar rascunho");
}

function bind(id, prop=null){
  const el=$(id); if(!el)return;
  el.addEventListener("input",()=>{
    if(prop) state[prop]=el.value;
    autoSave();
  });
}
[
  "dataAtd","horaAtd","medico","crmResponsavel","nomePaciente","cpfPaciente","cargo","tempoCargo","tempoUnidade","idade",
  "atividadesReadaptado","queixaDuracao","doencaMotivo","inicioTratamento","freqConsultas","sintomasLimitacao",
  "dataAlteracaoMed","obsAlteracaoMed","obsTerapias","historicoPregresso","crmCro","cid",
  "dataDocumento","diasSolicitados","obsDocumentos","descLimitacao","atividadesComprometidas",
  "obsLimitacoes","justificativa","alteracoesClinicasExames"
].forEach(id=>bind(id));
$("exameFisicoTipo")?.addEventListener("change",e=>setExamType(e.target.value)); $("exameFisicoDescricao")?.addEventListener("input",e=>{state.exameFisicoDescricao=e.target.value;state.exam={...(state.exam||{}),descricao:e.target.value};autoSave();});
$("alteracoesClinicasExames")?.addEventListener("input",e=>setExamDescription(e.target.value));
$("dataAtd").value=today(); $("horaAtd").value=timeNow();

function isArtifactAttendanceDate(val, atdDate) {
  if (!val) return false;
  const s = String(val).trim();
  if (!s) return false;
  const atd = String(atdDate || $("dataAtd")?.value || today()).trim();
  const atdBr = typeof formatDate === "function" ? formatDate(atd) : "";
  const todayStr = typeof today === "function" ? today() : "";
  const todayBr = typeof formatDate === "function" ? formatDate(todayStr) : "";
  return s === atd || (atdBr && s === atdBr) || (todayStr && s === todayStr) || (todayBr && s === todayBr);
}

let __isSyncingState = false;
function syncState(){
  if (__isSyncingState) return;
  __isSyncingState = true;
  try {
    if (typeof currentAttendanceMode !== "undefined" && currentAttendanceMode === "agil") {
      syncAgilToExtended();
    }
    const prevAux = state.aux || {};
    const getVal = (id, fallback) => {
      const el = $(id);
      if (el) return el.value;
      return fallback !== undefined ? fallback : "";
    };

    state.atendimento=$("atd")?.value || state.atendimento || ""; state.medico=$("medico")?.value || state.medico || "";
    state.readaptado=getRadio("readaptado")||state.readaptado||prevAux.readaptado||"";
    state.outrasDoencas=getRadio("outrasDoencas")||getRadio("agilOutrasDoencas")||state.outrasDoencas||"Sim";
    state.alteracaoMed=getRadio("alteracaoMed")||state.alteracaoMed||"Não";
    state.limitacaoFuncional=getRadio("limitacaoFuncional")||state.limitacaoFuncional||"Não";
    const isAgilSync = (typeof currentAttendanceMode !== "undefined" && currentAttendanceMode === "agil") || (typeof document !== "undefined" && document.body && document.body.classList.contains("mode-agil-active"));
    if (isAgilSync) {
      state.psicoterapia = $("agilPsicoterapia") ? $("agilPsicoterapia").checked : ($("psicoterapia") ? $("psicoterapia").checked : !!state.psicoterapia);
      state.fisioterapia = $("agilFisioterapia") ? $("agilFisioterapia").checked : ($("fisioterapia") ? $("fisioterapia").checked : !!state.fisioterapia);
    } else {
      state.psicoterapia = $("psicoterapia") ? $("psicoterapia").checked : ($("agilPsicoterapia") ? $("agilPsicoterapia").checked : !!state.psicoterapia);
      state.fisioterapia = $("fisioterapia") ? $("fisioterapia").checked : ($("agilFisioterapia") ? $("agilFisioterapia").checked : !!state.fisioterapia);
    }
    if (!state.aux) state.aux = {};
    state.aux.psicoterapia = state.psicoterapia;
    state.aux.fisioterapia = state.fisioterapia;
    state.capacidade=getRadio("capacidade")||state.capacidade||"";
    state.parecer=getRadio("parecer")||state.parecer||"";
    state.exameFisicoTipo=$("agilExameFisicoTipo")?.value||$("exameFisicoTipo")?.value||state.exameFisicoTipo||prevAux.exameFisicoTipo||"";
    state.exameFisicoDescricao=$("agilExameFisicoDescricao")?.value||$("exameFisicoDescricao")?.value||state.exameFisicoDescricao||"";
    state.alteracoesClinicasExames=$("alteracoesClinicasExames")?.value||state.alteracoesClinicasExames||"";
    state.altura=$("agilAltura")?.value||$("altura")?.value||state.altura||prevAux.altura||"";
    state.peso=$("agilPeso")?.value||$("peso")?.value||state.peso||prevAux.peso||"";
    state.pressaoSistolica=$("agilPressaoSistolica")?.value||$("pressaoSistolica")?.value||state.pressaoSistolica||prevAux.pressaoSistolica||"";
    state.pressaoDiastolica=$("agilPressaoDiastolica")?.value||$("pressaoDiastolica")?.value||state.pressaoDiastolica||prevAux.pressaoDiastolica||"";
    state.pulso=$("agilPulso")?.value||$("pulso")?.value||state.pulso||prevAux.pulso||"";
    state.outrosSubtipo=state.outrosSubtipo||prevAux.outrosSubtipo||prevAux.areaExameClinico||"";
    if(state.outrosSubtipo) state.areaExameClinico=state.outrosSubtipo;
    state.outrosResultado=state.outrosResultado||prevAux.outrosResultado||prevAux.resultadoAvaliacao||"";
    if(state.outrosResultado) state.resultadoAvaliacao=state.outrosResultado;
    state.exam={selected:state.exameFisicoTipo,descricao:state.exameFisicoDescricao};
    if (typeof QuesitoService !== "undefined") {
      state.quesitos = QuesitoService.get();
    }

    state.aux={
      ...prevAux,
      dataAtd:getVal("dataAtd", prevAux.dataAtd || today()),
      horaAtd:getVal("horaAtd", prevAux.horaAtd || timeNow()),
      crmResponsavel:getVal("crmResponsavel", prevAux.crmResponsavel),
      nomePaciente:getVal("nomePaciente", prevAux.nomePaciente),
      cpfPaciente:getVal("cpfPaciente", prevAux.cpfPaciente),
      cargo:getVal("cargo", prevAux.cargo),
      tempoCargo:getVal("tempoCargo", prevAux.tempoCargo),
      tempoUnidade:getVal("tempoUnidade", prevAux.tempoUnidade),
      idade:getVal("idade", prevAux.idade),
      atividadesReadaptado:getVal("atividadesReadaptado", prevAux.atividadesReadaptado),
      queixaDuracao:$("queixaDuracao")?$("queixaDuracao").value:(state.queixaDuracao||prevAux.queixaDuracao||""),
      doencaMotivo:getVal("doencaMotivo", prevAux.doencaMotivo),
      inicioTratamento:(() => {
        let val = (typeof currentAttendanceMode !== "undefined" && currentAttendanceMode === "agil" && $("agilInicioTratamento"))
          ? $("agilInicioTratamento").value
          : getVal("inicioTratamento", prevAux.inicioTratamento);
        if (isArtifactAttendanceDate(val, prevAux.dataAtd || $("dataAtd")?.value)) {
          val = "";
          if ($("agilInicioTratamento")) $("agilInicioTratamento").value = "";
          if ($("inicioTratamento")) $("inicioTratamento").value = "";
        }
        return val;
      })(),
      freqConsultas:getVal("freqConsultas", prevAux.freqConsultas),
      sintomasLimitacao:getVal("sintomasLimitacao", prevAux.sintomasLimitacao),
      dataAlteracaoMed:getVal("dataAlteracaoMed", prevAux.dataAlteracaoMed),
      obsAlteracaoMed:getVal("obsAlteracaoMed", prevAux.obsAlteracaoMed),
      obsTerapias:getVal("obsTerapias", prevAux.obsTerapias),
      historicoPregresso:getVal("historicoPregresso", prevAux.historicoPregresso || $("agilHistoricoPregresso")?.value || ""),
      crmCro:getVal("crmCro", prevAux.crmCro),
      cid:getVal("cid", prevAux.cid || state.cid),
      dataDocumento:getVal("dataDocumento", prevAux.dataDocumento),
      diasSolicitados:getVal("diasSolicitados", prevAux.diasSolicitados),
      obsDocumentos:getVal("obsDocumentos", prevAux.obsDocumentos),
      descLimitacao:getVal("descLimitacao", prevAux.descLimitacao || $("agilDescLimitacao")?.value || ""),
      atividadesComprometidas:getVal("atividadesComprometidas", prevAux.atividadesComprometidas),
      obsLimitacoes:getVal("obsLimitacoes", prevAux.obsLimitacoes),
      exameFisicoTipo:state.exameFisicoTipo,
      exameFisicoDescricao:getVal("exameFisicoDescricao", prevAux.exameFisicoDescricao || state.exameFisicoDescricao),
      pressaoSistolica:getVal("pressaoSistolica", prevAux.pressaoSistolica || $("agilPressaoSistolica")?.value || state.pressaoSistolica),
      pressaoDiastolica:getVal("pressaoDiastolica", prevAux.pressaoDiastolica || $("agilPressaoDiastolica")?.value || state.pressaoDiastolica),
      pulso:getVal("pulso", prevAux.pulso || $("agilPulso")?.value || state.pulso),
      altura:getVal("altura", prevAux.altura || $("agilAltura")?.value || state.altura),
      peso:getVal("peso", prevAux.peso || $("agilPeso")?.value || state.peso),
      outrosSubtipo:state.outrosSubtipo,
      areaExameClinico:state.areaExameClinico || state.outrosSubtipo,
      outrosResultado:state.outrosResultado,
      resultadoAvaliacao:state.resultadoAvaliacao || state.outrosResultado,
      exameMentalResultado:state.exameMentalResultado || prevAux.exameMentalResultado || "",
      osteomuscularResultado:state.osteomuscularResultado || prevAux.osteomuscularResultado || "",
      osteomuscularRegioes:state.osteomuscularRegioes || prevAux.osteomuscularRegioes || {},
      justificativa:getVal("justificativa", prevAux.justificativa || state.justificativa || $("agilJustificativa")?.value || "")
    };
  } finally {
    __isSyncingState = false;
  }
}
function normalizeLegacyYesNo(value){ const v=String(value??"").trim().toLowerCase(); if(v==="sim")return "Sim"; if(v==="não"||v==="nao")return "Não"; return ""; }
function applyState(){
  state.medications=Array.isArray(state.medications)?state.medications:[]; state.conditions=Array.isArray(state.conditions)?state.conditions:[]; state.quesitos=Array.isArray(state.quesitos)?state.quesitos:[]; state.exam=state.exam&&typeof state.exam==="object"?state.exam:{}; state.documentosComplementares=Array.isArray(state.documentosComplementares)?state.documentosComplementares:[]; state.aux=state.aux&&typeof state.aux==="object"?state.aux:{};
  state.cidsSecundarios=Array.isArray(state.cidsSecundarios)?state.cidsSecundarios:(Array.isArray(state.aux?.cidsSecundarios)?state.aux.cidsSecundarios:[]);
  state.limitacaoFuncional=normalizeLegacyYesNo(state.limitacaoFuncional||state.aux.limitacaoFuncional);
  state.limitacaoRol=normalizeLegacyYesNo(state.limitacaoRol||state.aux.limitacaoRol);
  state.readaptado=normalizeLegacyYesNo(state.readaptado||state.aux.readaptado);
  state.outrasDoencas=normalizeLegacyYesNo(state.outrasDoencas||state.aux.outrasDoencas)||"Sim";
  state.alteracaoMed=normalizeLegacyYesNo(state.alteracaoMed||state.aux.alteracaoMed);
  state.queixaDuracao=state.queixaDuracao||state.aux.queixaDuracao||""; state.exameFisicoTipo=state.exameFisicoTipo||state.exam.selected||""; state.exameFisicoDescricao=state.exameFisicoDescricao||state.exam.descricao||""; state.alteracoesClinicasExames=state.alteracoesClinicasExames||state.examDescription||"";
  state.aux.nomePaciente=state.aux.nomePaciente||state.nomePaciente||""; state.aux.cpfPaciente=state.aux.cpfPaciente||state.cpfPaciente||"";
  $("atd").value=state.atendimento||""; $("atdDisplay").textContent=state.atendimento?"Identificação registrada":["Será gerada ao salvar"][0]; $("atdNumber").textContent=state.atendimento?"Atendimento salvo":"Novo atendimento"; $("atdDate").textContent=formatDate(state.aux.dataAtd||today()); $("dataAtd").value=state.aux.dataAtd||today(); $("horaAtd").value=state.aux.horaAtd||timeNow(); $("medico").value=state.medico||""; $("crmResponsavel").value=state.aux.crmResponsavel||"";
  Object.keys(state.aux).forEach(k=>{const el=$(k);if(el&&k!=="dataAtd"&&k!=="horaAtd")el.value=state.aux[k]??"";});
  $("queixaDuracao") && ($("queixaDuracao").value=state.queixaDuracao||state.aux.queixaDuracao||"");
  $("exameFisicoTipo") && ($("exameFisicoTipo").value=state.exameFisicoTipo||"");
  $("exameFisicoDescricao") && ($("exameFisicoDescricao").value=state.exameFisicoDescricao||"");
  togglePanelsOnly(); updateLimitacaoStatus(); renderMedications();renderConditions();renderDocumentRecords();if(typeof ensureDefaultQuesitos==="function")ensureDefaultQuesitos();renderQuesitos();renderExam();renderSecondaryCIDs();renderParecerHint();applyFinalizedLock(); if($("cid").value)renderCIDAssist(findCID($("cid").value)||null);
  if ($("fisioterapia")) $("fisioterapia").checked = !!(state.fisioterapia || state.aux?.fisioterapia);
  if ($("agilFisioterapia")) $("agilFisioterapia").checked = !!(state.fisioterapia || state.aux?.fisioterapia);
  if ($("psicoterapia")) $("psicoterapia").checked = !!(state.psicoterapia || state.aux?.psicoterapia);
  if ($("agilPsicoterapia")) $("agilPsicoterapia").checked = !!(state.psicoterapia || state.aux?.psicoterapia);
  syncExtendedToAgil(); if(typeof atualizarBannerAcompanhante==="function")atualizarBannerAcompanhante();
  if (currentAttendanceMode === "agil") {
    document.body.classList.add("mode-agil-active");
  } else {
    go(Math.min(9,Math.max(1,Number(state.current)||1)));
  }
}
function togglePanelsOnly(){
  const readapVal = getRadio("readaptado") || getRadio("agilReadaptado");
  $("readaptadoPanel")?.classList.toggle("hidden", readapVal !== "Sim");
  $("agilReadaptadoPanel")?.classList.toggle("hidden", readapVal !== "Sim");

  const altVal = getRadio("alteracaoMed") || getRadio("agilAlteracaoMed");
  $("alteracaoPanel")?.classList.toggle("hidden", altVal !== "Sim");
  $("agilAlteracaoPanel")?.classList.toggle("hidden", altVal !== "Sim");

  const outrasVal = getRadio("outrasDoencas") || getRadio("agilOutrasDoencas");
  $("doencasPanel")?.classList.toggle("hidden", outrasVal !== "Sim");
  $("agilDoencasPanel")?.classList.toggle("hidden", outrasVal !== "Sim");

  $("limitacao1Panel")?.classList.toggle("hidden", getRadio("limitacaoFuncional") !== "Sim");
  $("limitacao2Panel")?.classList.toggle("hidden", getRadio("limitacaoRol") !== "Sim");
}
async function syncToRegistry(){
  try{
    const id=state.atendimento;
    if(!id || !window.AmbientalUtils?.DraftStore) return false;
    const snapshot=JSON.parse(JSON.stringify(state));
    snapshot.__registryAt=new Date().toISOString();
    snapshot.__status=snapshot.finalizado?"FINALIZADO":(snapshot.workflowStatus||"RASCUNHO");
    await AmbientalUtils.DraftStore.put(`atendimento:${id}`, snapshot);
    return true;
  }catch(error){
    console.warn("Falha ao atualizar o backup local:", error?.name || "StorageError");
    return false;
  }
}

/* =========================================================
   MODO IA 2.0 — ATENDIMENTO INTELIGENTE (GRAVAÇÃO & ESCRITA)
   ========================================================= */

const COLINHA_IA2_CONFIG = [
  {
    id: 1,
    numero: "01",
    pergunta: "Qual é a sua idade ?",
    subtexto: "Idade ou ano de nascimento do servidor",
    validar: (text) => {
      const m = text.match(/\b(?:idade(?:\s*[:=]|\s+(?:é|de))?|tenho|tem|estou\s+com)\s*(\d{1,2})\b/i) ||
                text.match(/\b(\d{1,2})\s*anos(?:\s+de\s+idade)?\b/i) ||
                text.match(/\bnascid[oa]\s+em\s+(\d{4})\b/i) ||
                text.match(/\bano\s+de\s+nascimento\s*[:=]?\s*(\d{4})\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 2,
    numero: "02",
    pergunta: "Qual é o seu cargo.",
    subtexto: "Função ou ocupação exercida no Estado",
    validar: (text) => {
      const m = text.match(/\b(?:cargo|fun[çc][ãa]o|profiss[ãa]o|trabalho\s+como|exer[çc]o|ocupo\s+o\s+cargo)\s*[:=]?\s*([a-zà-ú\s]{3,35})\b/i) ||
                text.match(/\b(?:sou|é)\s+(professora?|docente|agente|policial|investigador[a]?|diretor[a]?|secret[áa]ri[oa]|escriv[ãa][oa]|auxiliar|t[ée]cnic[oa]|m[ée]dic[oa]|enfermeir[oa]|motorista|oficial|servidor[a]?|analista|operador[a]?|inspetor[a]?|atendente|coordenador[a]?|merendeir[ao]|cuidador[ao]|gestor[ao]|especialista|peb\s*(?:i|ii|1|2)?)\b/i) ||
                text.match(/\b(?:peb\s*(?:i|ii|1|2)?|professor[a]?\s+de\s+educa[çc][ãa]o\s+b[áa]sica|policial\s+militar|policial\s+civil|agente\s+de\s+seguran[çc]a|agente\s+penitenci[áa]ri[oa]|oficial\s+administrativ[oa]|auxiliar\s+de\s+servi[çc]os?|merendeir[ao])\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 3,
    numero: "03",
    pergunta: "Quanto tempo está no cargo ?",
    subtexto: "Tempo de serviço na função ou no Estado",
    validar: (text) => {
      const m = text.match(/\b(?:tempo\s+(?:no|de|do)\s+cargo|tempo\s+de\s+servi[çc]o|trabalho\s+h[áa]|estou\s+h[áa]|no\s+cargo\s+h[áa]|admiss[ãa]o\s+em)\s*[:=]?\s*([^\.\,\;\n]+)/i) ||
                text.match(/\bh[áa]\s+(\d+|um|dois|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta)\s+(?:anos|meses)\b/i) ||
                text.match(/\bdesde\s+(?:o\s+ano\s+de\s+)?(19\d{2}|20\d{2})\b/i) ||
                text.match(/\b(\d+)\s+anos\s+(?:de\s+casa|de\s+servi[çc]o|no\s+estado|no\s+cargo|de\s+prefeitura|de\s+concurso)\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 4,
    numero: "04",
    pergunta: "É readaptado? Se sim, quais atividades exerce atualmente?",
    subtexto: "Readaptação funcional e atribuições vigentes",
    validar: (text) => {
      const m = text.match(/\b(?:(?:re)?adaptad[oa]|(?:re)?adapta[çc][ãa]o)\b/i) ||
                text.match(/\bn[ãa]o\s+sou\s+(?:re)?adaptad[oa]\b/i) ||
                text.match(/\bnunca\s+fui\s+(?:re)?adaptad[oa]\b/i) ||
                text.match(/\bsem\s+(?:re)?adapta[çc][ãa]o\b/i) ||
                text.match(/\b(?:é|sou|fui)\s+(?:re)?adaptad[oa]\b/i) ||
                text.match(/\batividades\s+(?:que\s+)?exerce\s*[:=]?\s*([^\.\,\;\n]+)/i) ||
                text.match(/\btrabalhando\s+no\s+(?:setor|desvio|administrativo|secretaria|biblioteca)\b/i) ||
                text.match(/\batribui[çc][õo]es\s+atuais\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 5,
    numero: "05",
    pergunta: "Qual foi a data do diagnóstico da doença ?",
    subtexto: "Data ou período de diagnóstico / início dos sintomas",
    validar: (text) => {
      const m = text.match(/\b(?:data\s+(?:do\s+)?diagn[óo]stico|in[íi]cio\s+do\s+quadro|in[íi]cio\s+dos\s+sintomas|diagnosticad[oa]\s+em|descobri\s+em|come[çc]ou\s+em|iniciou\s+em)\s*[:=]?\s*([^\.\;\n]+)/i) ||
                text.match(/\bdesde\s+(?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|\d{1,2}\/\d{1,2}|\d{4})\b/i) ||
                text.match(/\bdesde\s+(\d{4})\b/i) ||
                text.match(/\b(?:ano|m[êe]s|semana)\s+passad[oa]\b/i) ||
                text.match(/\b(?:in[íi]cio|come[çc]ou|iniciou)\s+h[áa]\s+(\d+|poucos?|muitos?)\s+(?:dias|semanas|meses|anos)\b/i) ||
                text.match(/\blaudo\s+de\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 6,
    numero: "06",
    pergunta: "Qual doença está tratando que motivou o afastamento?",
    subtexto: "Diagnóstico, queixa principal, CID ou patologia",
    validar: (text) => {
      const m = text.match(/\b(?:doen[çc]a|patologia|motivo\s+do\s+afastamento|afastament[oa]|afastad[oa]\s+por|tratando\s+de|quadro\s+de)\s*[:=]?\s*([^\.\;\n]+)/i) ||
                text.match(/\b(?:cid\b|diagn[óo]stico\s+de|hip[óo]tese\s+diagn[óo]stica)\b/i) ||
                text.match(/\b(?:depress[ãa]o|ansiedade|burnout|bipolar|p[âa]nico|estresse|transtorno|lombalgia|lombociatalgia|discopatia|h[ée]rnia|t[úu]nel\s+do\s+carpo|tendinite|tendinose|bursite|manguito|fibromialgia|artrose|artrite|sinovite|espondilo|cefaleia|enxaqueca|fratura|les[ãa]o|cirurgia|dor\s+lombar|coluna)\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 7,
    numero: "07",
    pergunta: "Com que frequência comparece às consultas?",
    subtexto: "Periodicidade de acompanhamento médico",
    validar: (text) => {
      const m = text.match(/\b(?:frequ[êe]ncia|periodicidade|consultas?|retornos?|comparece|acompanhamento)\s*[:=]?\s*([^\.\;\n]+)/i) ||
                text.match(/\b(?:mensal(?:mente)?|quinzenal(?:mente)?|semanal(?:mente)?|bimestral|trimestral|semestral)\b/i) ||
                text.match(/\ba\s+cada\s+(\d+|um|dois|tr[êe]s|quinze)\s+(?:dias|semanas|meses)\b/i) ||
                text.match(/\bde\s+(\d+|um|dois|tr[êe]s|dez|quinze|vinte|trinta)\s+em\s+\d+\s+dias\b/i) ||
                text.match(/\b(?:todo\s+m[êe]s|toda\s+semana|uma\s+vez\s+por\s+m[êe]s|duas\s+vezes\s+por\s+m[êe]s|1x\s+ao\s+m[êe]s|1x\/m[êe]s)\b/i) ||
                text.match(/\b(?:passo|vou)\s+no\s+m[ée]dico\b/i) ||
                text.match(/\bconsultas?\s+regulares\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 8,
    numero: "08",
    pergunta: "Quais sintomas causam limitações para o trabalho?",
    subtexto: "Sintomatologia e impactos no trabalho",
    validar: (text) => {
      const m = text.match(/\b(?:sintomas?|limita[çc][ãa]o|limita[çc][õo]es|dificuldade\s+(?:para|de)|n[ãa]o\s+consig[ou]|impossibilitad[oa]|impede)\s*[:=]?\s*([^\.\;\n]+)/i) ||
                text.match(/\b(?:dor|dores|dor\s+lombar|parestesia|formigamento|fraqueza|perda\s+de\s+for[çc]a|irradia[çc][ãa]o|irradiada|limita[çc][ãa]o\s+de\s+movimento|rigidez|edema|incha[çc]o|fadiga|cansa[çc]o|ins[ôo]nia|choro|tristeza|ang[úu]stia|desespero|falta\s+de\s+concentra[çc][ãa]o|crise|p[âa]nico|ortost[áa]tic[ao]|sentad[ao]|carregamento|deambula[çc][ãa]o|andar|ficar\s+em\s+p[ée])\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 9,
    numero: "09",
    pergunta: "Faz o uso de quais medicações?",
    subtexto: "Medicações em uso contínuo ou temporário",
    validar: (text) => {
      const m = text.match(/\b(?:medica[çc][ãa]o|medica[çc][õo]es|rem[ée]dios?|medicamentos?|prescri[çc][ãa]o|uso\s+de|tomo|toma)\s*[:=]?\s*([^\.\;\n]+)/i) ||
                text.match(/\b(?:fluoxetina|sertralina|escitalopram|citalopram|venlafaxina|desvenlafaxina|duloxetina|paroxetina|clonazepam|rivotril|alprazolam|diazepam|quetiapina|risperidona|olanzapina|aripiprazol|pregabalina|gabapentina|amitriptilina|nortriptilina|ibuprofeno|cetoprofeno|dipirona|paracetamol|tramadol|code[íi]na|toragesic|torsilax|mioflex|anti-inflamat[óo]rio|cortic[óo]ide|prednisona|dexametasona|losartana|atenolol|metformina)\b/i) ||
                text.match(/\bn[ãa]o\s+tomo\s+(?:nenhum|rem[ée]dio|medica[çc][ãa]o)\b/i) ||
                text.match(/\bsem\s+medica[çc][ãa]o\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 10,
    numero: "10",
    pergunta: "Qual a dosagem (anotar mg/dia)? No caso de CID F, perguntar quando houve troca ou alteração das dosagens da medicação.",
    subtexto: "Posologia (mg/dia) e histórico de troca ou alteração de dose",
    validar: (text) => {
      const m = text.match(/\b(?:dosagem|dose|posologia|mg\/dia|miligramas)\s*[:=]?\s*([^\.\;\n]+)/i) ||
                text.match(/\b\d+\s*mg\b/i) ||
                text.match(/\b(\d+)\s+(?:comprimidos?|gotas?|c[áa]psulas?)\b/i) ||
                text.match(/\b(?:troca|trocou|altera[çc][ãa]o|alterou|mudou|aumentou|diminuiu|ajuste\s+de\s+dose|substitui[çc][ãa]o)\b/i) ||
                text.match(/\b(?:pela\s+manh[ãa]|de\s+manh[ãa]|[àa]\s+noite|ao\s+deitar|12\/12|8\/8|de\s+resgate|se\s+dor)\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  },
  {
    id: 11,
    numero: "11",
    pergunta: "Faz psicoterapia ou fisioterapia?",
    subtexto: "Psicoterapia, fisioterapia ou reabilitação",
    validar: (text) => {
      const m = text.match(/\b(?:psicoterapia|fisioterapia|terapia|psic[óo]log[ao]|fisio\b|psico\b|pilates|hidroterapia|reabilita[çc][ãa]o)\b/i) ||
                text.match(/\bfa[çc]o\s+(?:fisio|psico|terapia)\b/i) ||
                text.match(/\bn[ãa]o\s+fa[çc]o\s+(?:fisio|psico|terapia|fisioterapia|psicoterapia)\b/i) ||
                text.match(/\bsem\s+(?:fisioterapia|psicoterapia)\b/i) ||
                text.match(/\b\d+\s*x(?:\s+por\s+semana|\/semana)\b/i);
      return m ? { matched: true, snippet: m[0] } : { matched: false };
    }
  }
];

let ia2ColinhaStatus = {};
COLINHA_IA2_CONFIG.forEach(q => {
  ia2ColinhaStatus[q.id] = { matched: false, snippet: "", manualState: null };
});

let ia2Gravando = false;
let ia2TimerInterval = null;
let ia2SegundosDecorridos = 0;
let ia2SpeechRecognition = null;
let ia2AudioStream = null;
let ia2AudioContext = null;
let ia2Analyser = null;
let ia2AnimFrame = null;
let ia2MediaRecorder = null;
let ia2AudioChunks = [];
let ia2RestartTimeout = null;

let ia2SubViewAtual = "selecao";
let ia2DitadoEscritaAtivo = false;
let ia2DitadoEscritaRecognition = null;
let ia2DitadoEscritaStream = null;
let ia2DitadoEscritaRestartTimeout = null;
window.__ia2UltimoTextoProcessado = "";
window._ia2BaseTextGravacao = "";
window._ia2BaseTextEscrita = "";
window._ia2AbaTranscricaoAtual = "visual";
window._ia2DuvidasLowConfidence = [];
window.__ia2AudioBlobPendente = null;

function destacarDuvidasHtml(texto, duvidasPersonalizadas = []) {
  if (!texto) return { html: "", totalDuvidas: 0 };
  let html = esc(texto);
  let totalDuvidas = 0;

  // 1. Padrões clínicos, correções e hesitações
  const padroesDuvida = [
    {
      re: /\b(?:ano\s+é\s+\d+\s+não\s+é\s+\d+|\d+\s+não\s+é\s+\d+|não\s+é\s+\d+|ano\s+é\s+\d+)\b/gi,
      motivo: "Inconsistência ou autocorreção de data/ano detectada"
    },
    {
      re: /\bas\s+(?:psicoterapia|fisioterapia)\b/gi,
      motivo: "Possível falha fonética (esperado: 'faz psicoterapia/fisioterapia')"
    },
    {
      re: /\b10\s*mg\b/gi,
      motivo: "Dose de 10 mg atípica (conferir medicamento/dosagem)"
    },
    {
      re: /\b\d+\s+vezes\s+no\s+mês\b/gi,
      motivo: "Frequência mensal atípica para tratamento continuado"
    },
    {
      re: /\b(?:ou\s+melhor|acho\s+que|se\s+não\s+me\s+engano|talvez|não\s+tenho\s+certeza|não\s+lembro|mais\s+ou\s+menos|por\s+aí|esqueci)\b/gi,
      motivo: "Hesitação, dúvida ou incerteza relatada pelo interlocutor"
    },
    {
      re: /\b(?:inaud[íi]vel|indeterminado|inconclusivo|\?{2,})\b/gi,
      motivo: "Termo inaudível ou não identificado com clareza pelo áudio"
    }
  ];

  padroesDuvida.forEach(p => {
    html = html.replace(p.re, (m) => {
      totalDuvidas++;
      return `<mark class="ia2-doubt-word" title="${p.motivo} — clique para editar">${m}</mark>`;
    });
  });

  // 2. Termos com baixa confiança acústica do SpeechRecognition (< 0.82)
  if (Array.isArray(duvidasPersonalizadas)) {
    duvidasPersonalizadas.forEach(trecho => {
      if (!trecho || trecho.length < 2) return;
      const safe = esc(trecho);
      const reTrecho = new RegExp(`(?<!<mark[^>]*>)\\b${safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?![^<]*<\/mark>)`, "gi");
      html = html.replace(reTrecho, (m) => {
        totalDuvidas++;
        return `<mark class="ia2-doubt-word" title="Baixa confiança acústica do microfone — confira se a palavra está correta">${m}</mark>`;
      });
    });
  }

  return { html, totalDuvidas };
}

function atualizarGuiaPassosIA2(etapa) {
  const s1 = $("ia2GuideStep1");
  const s2 = $("ia2GuideStep2");
  const s3 = $("ia2GuideStep3");
  const btnFim = $("ia2BtnFinalizarGravacao");

  if (s1 && s2 && s3) {
    if (etapa === 1) {
      s1.className = "ia2-guide-step active";
      s2.className = "ia2-guide-step";
      s3.className = "ia2-guide-step";
    } else if (etapa === 2) {
      s1.className = "ia2-guide-step done";
      s2.className = "ia2-guide-step active";
      s3.className = "ia2-guide-step";
    } else if (etapa === 3) {
      s1.className = "ia2-guide-step done";
      s2.className = "ia2-guide-step done";
      s3.className = "ia2-guide-step active";
    }
  }

  if (btnFim) {
    if (etapa === 3) {
      btnFim.classList.add("ia2-btn-ready-pulse");
    } else {
      btnFim.classList.remove("ia2-btn-ready-pulse");
    }
  }
}

function estruturarTranscricaoEmDialogo(textoBruto) {
  if (!textoBruto || !textoBruto.trim()) {
    return { itens: [], plainText: "", totalDuvidas: 0, html: "" };
  }

  const raw = textoBruto.trim();

  // 1. Se o texto já estiver estruturado pela IA ("Médico Perito: ... / Periciado: ...") ou em tópicos ("• ..."),
  // preserva TODAS as perguntas (incluindo Perguntas Adicionais além das 11 da Colinha)
  if (/(?:^|\n)\s*(?:Médico(?:\s+Perito)?|Perito|Pergunta)\s*:/i.test(raw)) {
    const blocos = raw.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
    const itensEstruturados = [];
    blocos.forEach(bloco => {
      const linhas = bloco.split(/\n/).map(l => l.trim()).filter(Boolean);
      let perguntaTxt = "";
      let respostaTxt = "";
      let notaTxt = "";
      linhas.forEach(linha => {
        const mQ = linha.match(/^(?:Médico(?:\s+Perito)?|Perito|Pergunta)\s*:\s*(.*)$/i);
        const mA = linha.match(/^(?:Periciad[oa]|Paciente|Servidor(?:a)?|Resposta)\s*:\s*(.*)$/i);
        const mN = linha.match(/^(?:\[?Observação\]?|Nota)\s*:\s*(.*)$/i);
        if (mQ) {
          perguntaTxt = (perguntaTxt ? perguntaTxt + " " : "") + mQ[1].trim();
        } else if (mA) {
          respostaTxt = (respostaTxt ? respostaTxt + " " : "") + mA[1].trim();
        } else if (mN) {
          notaTxt = (notaTxt ? notaTxt + " " : "") + mN[1].trim();
        } else if (respostaTxt) {
          respostaTxt += " " + linha;
        } else if (perguntaTxt) {
          perguntaTxt += " " + linha;
        } else {
          notaTxt = (notaTxt ? notaTxt + " " : "") + linha;
        }
      });

      if (perguntaTxt || respostaTxt) {
        itensEstruturados.push({
          tipo: "qa",
          pergunta: perguntaTxt || "Pergunta realizada na consulta",
          perguntaOriginal: perguntaTxt || "Pergunta realizada na consulta",
          resposta: respostaTxt || "Não informado"
        });
      } else if (notaTxt) {
        itensEstruturados.push({ tipo: "nota", texto: notaTxt });
      }
    });

    if (itensEstruturados.length > 0) {
      let totalDuvidas = 0;
      let plainTextLines = [];
      let htmlCards = "";

      itensEstruturados.forEach((it, idx) => {
        if (it.tipo === "nota") {
          const d = destacarDuvidasHtml(it.texto, window._ia2DuvidasLowConfidence || []);
          totalDuvidas += d.totalDuvidas;
          plainTextLines.push(`Nota: ${it.texto}`);
          htmlCards += `
            <div class="ia2-qa-note">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">
                <span class="ia2-qa-badge-note">📝 Anotação / Fala Complementar</span>
                <span style="font-size:10.5px;color:#64748B">✏️ Clique no texto para editar</span>
              </div>
              <div class="ia2-qa-note-text" contenteditable="true" data-idx="${idx}" onblur="salvarEdicaoVisualIA2()">${d.html}</div>
            </div>
          `;
        } else {
          const dQ = destacarDuvidasHtml(it.perguntaOriginal || it.pergunta, []);
          const dA = destacarDuvidasHtml(it.resposta, window._ia2DuvidasLowConfidence || []);
          totalDuvidas += dQ.totalDuvidas + dA.totalDuvidas;

          // Identificar se corresponde a algum item da colinha para exibir a badge
          let colId = null;
          for (const qCol of COLINHA_IA2_CONFIG) {
            const vRes = qCol.validar(`${it.pergunta} ${it.resposta}`);
            if (vRes && vRes.matched) {
              colId = qCol.id;
              break;
            }
          }
          const badgeColinha = colId
            ? `<span class="badge" style="background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:auto;white-space:nowrap">Item ${String(colId).padStart(2, "0")}</span>`
            : `<span class="badge" style="background:#F1F5F9;color:#475569;border:1px solid #CBD5E1;font-size:10px;font-weight:600;padding:1px 6px;border-radius:6px;margin-left:auto;white-space:nowrap">Pergunta da Consulta</span>`;

          plainTextLines.push(`Médico Perito: ${it.pergunta}\nPericiado: ${it.resposta}`);
          htmlCards += `
            <div class="ia2-qa-card">
              <div class="ia2-qa-q-row">
                <span class="ia2-qa-badge-q">👨‍⚕️ Médico Perito</span>
                <span class="ia2-qa-q-text">${dQ.html}</span>
                ${badgeColinha}
              </div>
              <div class="ia2-qa-a-row">
                <span class="ia2-qa-badge-a">👤 Paciente</span>
                <div class="ia2-qa-a-text" contenteditable="true" data-idx="${idx}" title="Clique para corrigir ou complementar esta resposta" onblur="salvarEdicaoVisualIA2()">${dA.html}</div>
              </div>
            </div>
          `;
        }
      });

      htmlCards += `
        <div style="text-align:center;margin-top:10px">
          <button type="button" class="btn btn-outline btn-sm" onclick="adicionarNotaManualVisualIA2()" style="font-size:12px;font-weight:700;color:#2563EB;border-color:#BFDBFE;background:#EFF6FF;padding:6px 14px;border-radius:8px">
            ➕ Adicionar Observação ou Resposta Manual
          </button>
        </div>
      `;

      return {
        itens: itensEstruturados,
        plainText: plainTextLines.join("\n\n").trim(),
        totalDuvidas,
        html: htmlCards
      };
    }
  }

  // Lista de padrões de perguntas clínicas com títulos padronizados (para texto corrido sem prefixo)
  const listaPerguntas = [
    { re: /\b(?:qual\s+(?:é\s+)?a\s+sua\s+idade|qual\s+(?:é\s+)?a\s+idade|qual\s+sua\s+idade|quantos\s+anos(?:\s+tem)?)\b/i, label: "Qual a sua idade?" },
    { re: /\b(?:(?:qual\s+(?:é\s+)?|e\s+)?(?:o\s+)?(?:seu\s+)?cargo|qual\s+(?:é\s+)?o\s+cargo|qual\s+a\s+(?:sua\s+)?fun[çc][ãa]o|qual\s+sua\s+profiss[ãa]o|sua\s+fun[çc][ãa]o|sua\s+profiss[ãa]o)\b/i, label: "Qual o seu cargo?" },
    { re: /\b(?:quanto\s+tempo\s+est[áa]\s+no\s+cargo|quanto\s+tempo\s+de\s+servi[çc]o|quanto\s+tempo\s+no\s+cargo|quanto\s+tempo)\b/i, label: "Quanto tempo está no cargo?" },
    { re: /\b(?:(?:voc[êe]\s+)?[ée]\s+(?:re)?adaptad[oa]|tem\s+(?:re)?adapta[çc][ãa]o|est[áa]\s+(?:re)?adaptad[oa])\b/i, label: "É readaptado(a)? Quais atividades exerce?" },
    { re: /\b(?:(?:qual\s+(?:foi\s+)?a\s+)?data\s+(?:do\s+)?diagn[óo]stico(?:\s+da\s+doen[çc]a)?|quando\s+come[çc]ou(?:\s+o\s+quadro|\s+a\s+doen[çc]a)?|quando\s+iniciou|in[íi]cio\s+dos\s+sintomas)\b/i, label: "Qual a data do diagnóstico / início da doença?" },
    { re: /\b(?:qual\s+(?:a\s+)?doen[çc]a(?:\s+est[áa]\s+tratando)?|qual\s+o\s+motivo\s+do\s+afastamento|o\s+que\s+motivou\s+o\s+afastamento|qual\s+o\s+diagn[óo]stico)\b/i, label: "Qual doença motivou o afastamento?" },
    { re: /\b(?:com\s+que\s+frequ[êe]ncia\s+comparece(?:\s+[àa]s\s+consultas)?|com\s+que\s+frequ[êe]ncia\s+vai(?:\s+ao\s+m[ée]dico)?|de\s+quanto\s+em\s+quanto\s+tempo|frequ[êe]ncia\s+das\s+consultas|(?:e\s+|quanto\s+[àa]s\s+|sobre\s+as\s+|[àa]s\s+)?consultas(?:\s+m[ée]dicas)?)\b/i, label: "Com que frequência comparece às consultas?" },
    { re: /\b(?:quais\s+sintomas\s+causam\s+limita[çc][õo]es(?:\s+para\s+o\s+trabalho)?|quais\s+(?:os\s+)?sintomas|o\s+que\s+sente|quais\s+as\s+limita[çc][õo]es|sintomas\s+que\s+impedem)\b/i, label: "Quais sintomas causam limitações para o trabalho?" },
    { re: /\b(?:faz\s+uso\s+de\s+qual\s+medica[çc][ãa]o|faz\s+uso\s+de\s+quais\s+medica[çc][õo]es|quais\s+rem[ée]dios(?:\s+toma|\s+est[áa]\s+tomando)?|toma\s+algum\s+rem[ée]dio|quais\s+medicamentos)\b/i, label: "Faz uso de quais medicações?" },
    { re: /\b(?:qual\s+a\s+dosagem|qual\s+a\s+dose|quantos\s+miligramas|qual\s+a\s+posologia|houve\s+troca\s+de\s+dosagem)\b/i, label: "Qual a dosagem e posologia?" },
    { re: /\b(?:(?:faz|as)\s+psicoterapia\s+ou\s+fisioterapia|(?:faz|as)\s+fisioterapia\s+ou\s+psicoterapia|faz\s+fisio\s+ou\s+psico|faz\s+fisioterapia|faz\s+psicoterapia)\b/i, label: "Faz psicoterapia ou fisioterapia?" }
  ];

  // Encontrar todas as ocorrências de perguntas no texto
  const matches = [];
  listaPerguntas.forEach(qDef => {
    let m;
    const regexGlobal = new RegExp(qDef.re.source, "gi");
    while ((m = regexGlobal.exec(raw)) !== null) {
      matches.push({
        index: m.index,
        length: m[0].length,
        rawQuestion: m[0],
        label: qDef.label
      });
    }
  });

  // Ordenar matches pela posição no texto
  matches.sort((a, b) => a.index - b.index);

  // Se não encontrar nenhuma pergunta formatada, trata como bloco clínico / observação
  if (matches.length === 0) {
    const resDuvida = destacarDuvidasHtml(raw, window._ia2DuvidasLowConfidence || []);
    const plain = raw;
    const html = `
      <div class="ia2-qa-note">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">
          <span class="ia2-qa-badge-note">Observação / Fala Livre</span>
          <span style="font-size:10.5px;color:#64748B">✏️ Clique no texto para editar</span>
        </div>
        <div class="ia2-qa-note-text" contenteditable="true" onblur="salvarEdicaoVisualIA2()">${resDuvida.html}</div>
      </div>
      <div style="text-align:center;margin-top:10px">
        <button type="button" class="btn btn-outline btn-sm" onclick="adicionarNotaManualVisualIA2()" style="font-size:12px;font-weight:700;color:#2563EB;border-color:#BFDBFE;background:#EFF6FF;padding:6px 14px;border-radius:8px">
          ➕ Adicionar Observação ou Resposta Manual
        </button>
      </div>
    `;
    return {
      itens: [{ tipo: "nota", texto: raw }],
      plainText: plain,
      totalDuvidas: resDuvida.totalDuvidas,
      html
    };
  }

  const itens = [];
  let totalDuvidas = 0;

  // Se houver texto ANTES da primeira pergunta (ex: introdução do atendimento)
  if (matches[0].index > 0) {
    const preTexto = raw.substring(0, matches[0].index).trim();
    if (preTexto) {
      itens.push({ tipo: "nota", texto: preTexto });
    }
  }

  // Fatiar cada par Pergunta -> Resposta
  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];
    const nextStart = (i + 1 < matches.length) ? matches[i + 1].index : raw.length;
    const respRaw = raw.substring(curr.index + curr.length, nextStart).trim();

    itens.push({
      tipo: "qa",
      pergunta: curr.label || curr.rawQuestion,
      perguntaOriginal: curr.rawQuestion,
      resposta: respRaw || "Não informado"
    });
  }

  // Gerar plainText formatado (para o textarea e backend) e HTML rico (para o visual)
  let plainTextLines = [];
  let htmlCards = "";

  itens.forEach((it, idx) => {
    if (it.tipo === "nota") {
      const d = destacarDuvidasHtml(it.texto, window._ia2DuvidasLowConfidence || []);
      totalDuvidas += d.totalDuvidas;
      plainTextLines.push(`[Observação]: ${it.texto}\n`);
      htmlCards += `
        <div class="ia2-qa-note">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">
            <span class="ia2-qa-badge-note">Observação / Fala</span>
            <span style="font-size:10.5px;color:#64748B">✏️ Clique para editar</span>
          </div>
          <div class="ia2-qa-note-text" contenteditable="true" data-idx="${idx}" onblur="salvarEdicaoVisualIA2()">${d.html}</div>
        </div>
      `;
    } else {
      const dQ = destacarDuvidasHtml(it.perguntaOriginal || it.pergunta, window._ia2DuvidasLowConfidence || []);
      const dA = destacarDuvidasHtml(it.resposta, window._ia2DuvidasLowConfidence || []);
      totalDuvidas += dQ.totalDuvidas + dA.totalDuvidas;

      plainTextLines.push(`• ${it.pergunta}\n  ${it.resposta}\n`);
      htmlCards += `
        <div class="ia2-qa-card">
          <div class="ia2-qa-q-row">
            <span class="ia2-qa-badge-q">Pergunta</span>
            <span class="ia2-qa-q-text">${dQ.html}</span>
          </div>
          <div class="ia2-qa-a-row">
            <span class="ia2-qa-badge-a">Resposta</span>
            <div class="ia2-qa-a-text" contenteditable="true" data-idx="${idx}" title="Clique para corrigir ou complementar esta resposta" onblur="salvarEdicaoVisualIA2()">${dA.html}</div>
          </div>
        </div>
      `;
    }
  });

  htmlCards += `
    <div style="text-align:center;margin-top:10px">
      <button type="button" class="btn btn-outline btn-sm" onclick="adicionarNotaManualVisualIA2()" style="font-size:12px;font-weight:700;color:#2563EB;border-color:#BFDBFE;background:#EFF6FF;padding:6px 14px;border-radius:8px">
        ➕ Adicionar Observação ou Resposta Manual
      </button>
    </div>
  `;

  return {
    itens,
    plainText: plainTextLines.join("\n").trim(),
    totalDuvidas,
    html: htmlCards
  };
}

function adicionarNotaManualVisualIA2() {
  const container = $("ia2GravacaoVisual");
  if (!container) return;
  const noteDiv = document.createElement("div");
  noteDiv.className = "ia2-qa-note";
  noteDiv.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">
      <span class="ia2-qa-badge-note">📝 Anotação Manual do Médico</span>
      <span style="font-size:10.5px;color:#64748B">Digite abaixo e clique fora para salvar</span>
    </div>
    <div class="ia2-qa-note-text" contenteditable="true" onblur="salvarEdicaoVisualIA2()" style="min-height:24px;background:#fff;padding:6px 8px;border-radius:6px;border:1px solid #93C5FD"></div>
  `;
  container.appendChild(noteDiv);
  const editable = noteDiv.querySelector(".ia2-qa-note-text");
  if (editable) {
    setTimeout(() => {
      try {
        editable.focus();
        noteDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (_) {}
    }, 50);
  }
}

function trocarAbaTranscricaoIA2(aba) {
  window._ia2AbaTranscricaoAtual = aba;
  const visual = $("ia2GravacaoVisual");
  const textarea = $("ia2GravacaoTranscricao");
  const btnVisual = $("ia2BtnAbaVisual");
  const btnTexto = $("ia2BtnAbaTexto");

  if (aba === "visual") {
    if (visual) visual.style.display = "block";
    if (textarea) textarea.style.display = "none";
    if (btnVisual) {
      btnVisual.style.background = "#2563EB";
      btnVisual.style.color = "#fff";
    }
    if (btnTexto) {
      btnTexto.style.background = "transparent";
      btnTexto.style.color = "#64748B";
    }
    atualizarVisualTranscricaoIA2(false);
  } else {
    if (visual) visual.style.display = "none";
    if (textarea) textarea.style.display = "block";
    if (btnVisual) {
      btnVisual.style.background = "transparent";
      btnVisual.style.color = "#64748B";
    }
    if (btnTexto) {
      btnTexto.style.background = "#2563EB";
      btnTexto.style.color = "#fff";
    }
    if (textarea) setTimeout(() => { try { textarea.focus(); } catch (_) {} }, 50);
  }
}

function atualizarVisualTranscricaoIA2(forcarSincronizacaoTexto = false) {
  const container = $("ia2GravacaoVisual");
  const tArea = $("ia2GravacaoTranscricao");
  if (!container || !tArea) return;

  const raw = tArea.value || "";
  if (!raw.trim()) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94A3B8;text-align:center;padding:24px">
        <div style="width:64px;height:64px;border-radius:50%;background:#F1F5F9;display:flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:12px">🎙️</div>
        <p style="font-size:15px;max-width:420px;margin:0 0 8px;color:#334155;font-weight:800">Passo 1: Clique no botão verde "1. Iniciar Gravação" acima</p>
        <span style="font-size:12.5px;color:#64748B;max-width:440px;line-height:1.5">Converse normalmente com o paciente. Quando você clicar em <strong>Pausar</strong>, a IA escreverá todo o diálogo aqui e mostrará se faltou alguma pergunta da Colinha.</span>
      </div>
    `;
    const bDuvidas = $("ia2BadgeDuvidas");
    if (bDuvidas) bDuvidas.style.display = "none";
    const lDuvidas = $("ia2DuvidasLegenda");
    if (lDuvidas) lDuvidas.style.display = "none";
    return;
  }

  const res = estruturarTranscricaoEmDialogo(raw);
  container.innerHTML = res.html;

  const bDuvidas = $("ia2BadgeDuvidas");
  const qDuvidas = $("ia2QtdDuvidas");
  const lDuvidas = $("ia2DuvidasLegenda");

  if (res.totalDuvidas > 0) {
    if (bDuvidas) bDuvidas.style.display = "inline-flex";
    if (qDuvidas) qDuvidas.textContent = res.totalDuvidas;
    if (lDuvidas) lDuvidas.style.display = "inline";
  } else {
    if (bDuvidas) bDuvidas.style.display = "none";
    if (lDuvidas) lDuvidas.style.display = "none";
  }

  if (forcarSincronizacaoTexto && res.plainText) {
    tArea.value = res.plainText;
    window._ia2BaseTextGravacao = res.plainText;
    analisarColinhaEmTempoReal(res.plainText);
    atualizarContadorGravacaoIA2();
  }
}

function salvarEdicaoVisualIA2() {
  const container = $("ia2GravacaoVisual");
  const tArea = $("ia2GravacaoTranscricao");
  if (!container || !tArea) return;

  const cards = container.querySelectorAll(".ia2-qa-card, .ia2-qa-note");
  if (!cards || cards.length === 0) return;

  const lines = [];
  cards.forEach(card => {
    if (card.classList.contains("ia2-qa-note")) {
      const txt = (card.querySelector(".ia2-qa-note-text")?.innerText || "").trim();
      if (txt) lines.push(`Nota: ${txt}`);
    } else {
      const q = (card.querySelector(".ia2-qa-q-text")?.innerText || "").trim();
      const a = (card.querySelector(".ia2-qa-a-text")?.innerText || "").trim();
      if (q || a) {
        lines.push(`Médico Perito: ${q}\nPericiado: ${a}`);
      }
    }
  });

  const fullText = lines.join("\n\n").trim();
  if (fullText) {
    tArea.value = fullText;
    window._ia2BaseTextGravacao = fullText;
    analisarColinhaEmTempoReal(fullText);
    atualizarContadorGravacaoIA2();
  }
}

let _ia2RefinandoAtivo = false;
let _ia2RefinandoPromise = null;

async function refinarDialogoComIA2(automatico = false) {
  if (_ia2RefinandoAtivo && _ia2RefinandoPromise) {
    return _ia2RefinandoPromise;
  }
  const tArea = $("ia2GravacaoTranscricao");
  const rawText = (tArea?.value || "").trim();
  const audioBlob = window.__ia2AudioBlobPendente || (
    Array.isArray(ia2AudioChunks) && ia2AudioChunks.length > 0
      ? new Blob(ia2AudioChunks, { type: (ia2MediaRecorder && ia2MediaRecorder.mimeType) || "audio/webm" })
      : null
  );
  const hasAudio = Boolean(audioBlob && audioBlob.size > 200);

  if (!hasAudio && rawText.length < 5) {
    if (!automatico) toast("Nenhuma gravação ou texto para refinar.");
    return null;
  }

  _ia2RefinandoAtivo = true;
  const bar = $("ia2RefinandoBar");
  const barTxt = $("ia2RefinandoText");
  if (bar) {
    bar.style.display = "flex";
    if (barTxt) {
      barTxt.textContent = hasAudio 
        ? "✨ IA Gemini transcrevendo áudio, identificando vozes e separando falas..." 
        : "✨ IA Médica estruturando diálogo e reconhecendo perguntas...";
    }
  }

  _ia2RefinandoPromise = (async () => {
    try {
      const formData = new FormData();
      if (hasAudio) {
        const mimeType = audioBlob.type || (ia2MediaRecorder && ia2MediaRecorder.mimeType) || "audio/webm";
        const fileName = audioBlob.name || "consulta_pericial.webm";
        formData.append("audio", audioBlob, fileName);
      }
      if (rawText) {
        formData.append("texto_rascunho", rawText);
      }

      const apiUrl = `${getApiBase()}/api/ai/refinar-dialogo-ia2`;
      const resp = await (window.AmbientalAuth ? window.AmbientalAuth.authFetch : fetch)(apiUrl, {
        method: "POST",
        body: formData
      });

      if (!resp.ok) {
        let errDetail = `Status ${resp.status}`;
        try {
          const errJson = await resp.json();
          errDetail = errJson?.error?.message || errJson?.detail || errJson?.message || errDetail;
        } catch (_) {}
        throw new Error(`Falha no servidor (${errDetail})`);
      }

      const resJson = await resp.json();
      const resData = (resJson && (resJson.data || (resJson.success && resJson))) || null;
      if (resData) {
        const { dialogo, colinha_status, total_duvidas } = resData;
        let texto_formatado = (resData.texto_formatado || "").trim();
        window._ia2DuvidasLowConfidence = [];
        window.__ia2JaTranscreveuOuRefinou = true;
        window.__ia2UltimoAudioSizeTranscrito = hasAudio ? audioBlob.size : 0;

        // Reconstrução de segurança caso o backend não tenha devolvido texto_formatado mas tenha devolvido diálogo
        if (!texto_formatado && Array.isArray(dialogo) && dialogo.length > 0) {
          const lines = [];
          dialogo.forEach(it => {
            if (it.tipo === "qa") {
              if (it.pergunta) lines.push(`Médico Perito: ${it.pergunta}`);
              if (it.resposta) lines.push(`Periciado: ${it.resposta}`);
            } else if (it.texto || it.resposta) {
              lines.push(`Nota: ${it.texto || it.resposta}`);
            }
          });
          texto_formatado = lines.join("\n\n");
        }

        // 1. Atualizar colinha pericial semanticamente e banner de campos não perguntados
        if (Array.isArray(colinha_status)) {
          colinha_status.forEach(it => {
            if (it && it.id && ia2ColinhaStatus[it.id]) {
              ia2ColinhaStatus[it.id].matched = !!it.matched;
              ia2ColinhaStatus[it.id].aiMatched = !!it.matched;
              if (it.snippet) {
                ia2ColinhaStatus[it.id].snippet = it.snippet;
                ia2ColinhaStatus[it.id].aiSnippet = it.snippet;
              } else if (!it.matched) {
                ia2ColinhaStatus[it.id].snippet = "";
                ia2ColinhaStatus[it.id].aiSnippet = "";
              }
            }
          });
          renderizarColinhaIA2();
          atualizarBannerCamposNaoPerguntadosIA2();
        }

        // 2. Atualizar textarea e base de texto
        if (texto_formatado) {
          tArea.value = texto_formatado;
          window._ia2BaseTextGravacao = texto_formatado;
          atualizarContadorGravacaoIA2();
        }

        // 3. Renderizar cartões do diálogo com badges da colinha e dúvidas
        const containerVisual = $("ia2GravacaoVisual");
        if (containerVisual && Array.isArray(dialogo) && dialogo.length > 0) {
          let htmlCards = "";
          let countDuvidas = 0;

          dialogo.forEach((item, idx) => {
            if (item.tipo === "nota") {
              const d = destacarDuvidasHtml(item.texto || item.resposta || "", item.duvidas || []);
              countDuvidas += d.totalDuvidas;
              htmlCards += `
                <div class="ia2-qa-note">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">
                    <span class="ia2-qa-badge-note">📝 Observação / Fala Livre</span>
                    <span style="font-size:10.5px;color:#64748B">✏️ Clique no texto para editar</span>
                  </div>
                  <div class="ia2-qa-note-text" contenteditable="true" data-idx="${idx}" onblur="salvarEdicaoVisualIA2()">${d.html}</div>
                </div>
              `;
            } else {
              const dQ = destacarDuvidasHtml(item.pergunta || "", []);
              const dA = destacarDuvidasHtml(item.resposta || "", item.duvidas || []);
              countDuvidas += dQ.totalDuvidas + dA.totalDuvidas;
              const badgeColinha = item.colinha_id 
                ? `<span class="badge" style="background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:auto;white-space:nowrap">Item ${String(item.colinha_id).padStart(2, "0")}</span>` 
                : `<span class="badge" style="background:#F1F5F9;color:#475569;border:1px solid #CBD5E1;font-size:10px;font-weight:600;padding:1px 6px;border-radius:6px;margin-left:auto;white-space:nowrap">Pergunta Adicional</span>`;

              htmlCards += `
                <div class="ia2-qa-card" data-colinha-id="${item.colinha_id || ''}">
                  <div class="ia2-qa-q-row">
                    <span class="ia2-qa-badge-q">👨‍⚕️ Médico Perito</span>
                    <span class="ia2-qa-q-text">${dQ.html}</span>
                    ${badgeColinha}
                  </div>
                  <div class="ia2-qa-a-row">
                    <span class="ia2-qa-badge-a">👤 Paciente / Servidor</span>
                    <div class="ia2-qa-a-text" contenteditable="true" data-idx="${idx}" title="Clique para corrigir ou complementar esta resposta" onblur="salvarEdicaoVisualIA2()">${dA.html}</div>
                  </div>
                </div>
              `;
            }
          });

          htmlCards += `
            <div style="text-align:center;margin-top:10px">
              <button type="button" class="btn btn-outline btn-sm" onclick="adicionarNotaManualVisualIA2()" style="font-size:12px;font-weight:700;color:#2563EB;border-color:#BFDBFE;background:#EFF6FF;padding:6px 14px;border-radius:8px">
                ➕ Adicionar Observação ou Resposta Manual
              </button>
            </div>
          `;

          containerVisual.innerHTML = htmlCards;

          // Atualizar badges de dúvidas
          const totalD = total_duvidas !== undefined ? total_duvidas : countDuvidas;
          const bDuvidas = $("ia2BadgeDuvidas");
          const qDuvidas = $("ia2QtdDuvidas");
          const lDuvidas = $("ia2DuvidasLegenda");
          if (totalD > 0) {
            if (bDuvidas) bDuvidas.style.display = "inline-flex";
            if (qDuvidas) qDuvidas.textContent = totalD;
            if (lDuvidas) lDuvidas.style.display = "inline";
          } else {
            if (bDuvidas) bDuvidas.style.display = "none";
            if (lDuvidas) lDuvidas.style.display = "none";
          }
        }

        const badgeStatus = $("ia2GravacaoStatusBadge");
        if (badgeStatus && !ia2Gravando) {
          badgeStatus.style.background = "#ECFDF5";
          badgeStatus.style.color = "#047857";
          badgeStatus.style.borderColor = "#A7F3D0";
          badgeStatus.innerHTML = "✅ Transcrição pronta! Confira abaixo ou clique em '3. Finalizar Atendimento'";
        }

        atualizarGuiaPassosIA2(3);

        if (!automatico) {
          toast("✨ Diálogo refinado e colinha pericial atualizada com IA!");
        }
        return { ...resData, texto_formatado };
      }
      return null;
    } catch (err) {
      console.error("Falha no refinamento automático por IA:", err);
      atualizarVisualTranscricaoIA2(false);
      if (!automatico) {
        toast("Não foi possível conectar à IA: " + (err.message || "Erro de conexão"));
      }
      throw err;
    } finally {
      _ia2RefinandoAtivo = false;
      _ia2RefinandoPromise = null;
      if (bar) bar.style.display = "none";
    }
  })();

  return _ia2RefinandoPromise;
}

function organizarTranscricaoManualmenteIA2() {
  const tArea = $("ia2GravacaoTranscricao");
  if (!tArea || !tArea.value.trim()) {
    toast("Nenhuma transcrição para organizar.");
    return;
  }
  trocarAbaTranscricaoIA2("visual");
  refinarDialogoComIA2(false);
}

function formatarDataIsoParaBr(str) {
  if (!str) return "";
  const s = String(str).trim();
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return `${mIso[3]}/${mIso[2]}/${mIso[1]}`;
  const mBr = s.match(/^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})/);
  if (mBr) return `${mBr[1].padStart(2, "0")}/${mBr[2].padStart(2, "0")}/${mBr[3]}`;
  return s;
}

function abrirModoIA2(view = "selecao") {
  syncState();
  const v = values();

  // Atualizar barra de identificação
  const nome = state.aux?.nomePaciente || state.nomePaciente || v.nomePaciente || $("agilNomePaciente")?.value || $("nomePaciente")?.value || "Não informado";
  const cpf = formatCPF(state.aux?.cpfPaciente || state.cpfPaciente || v.cpfPaciente || $("agilCpfPaciente")?.value || $("cpfPaciente")?.value || "");
  const cargo = state.aux?.cargo || state.cargo || v.cargo || $("agilCargo")?.value || $("cargo")?.value || "Não informado";
  const atd = state.atendimento || v.atendimento || $("atd")?.value || "—";
  const diasSol = state.diasSolicitados || state.aux?.diasSolicitados || v.diasSolicitados || $("agilDiasSolicitados")?.value || $("diasSolicitados")?.value || "";
  const dtDoc = state.dataDocumento || state.aux?.dataDocumento || v.dataDocumento || $("agilDataDocumento")?.value || $("dataDocumento")?.value || "";
  const dtExp = state.aux?.dataExpedicao || state.dataExpedicao || v.dataExpedicao || $("agilDataExpedicao")?.value || $("dataExpedicao")?.value || "";

  if ($("ia2PatientNome")) $("ia2PatientNome").textContent = nome;
  if ($("ia2PatientCpf")) $("ia2PatientCpf").textContent = cpf || "Não informado";
  if ($("ia2PatientCargo")) $("ia2PatientCargo").textContent = cargo;
  if ($("ia2PatientAtd")) $("ia2PatientAtd").textContent = atd;
  if ($("ia2PatientDataAtestado")) $("ia2PatientDataAtestado").textContent = formatarDataIsoParaBr(dtDoc) || "—";
  if ($("ia2PatientDias")) $("ia2PatientDias").textContent = diasSol ? `${diasSol} dia${diasSol > 1 ? "s" : ""}` : "—";
  if ($("ia2PatientExpedicao")) $("ia2PatientExpedicao").textContent = formatarDataIsoParaBr(dtExp) || "—";

  if (typeof recalcularRetroacaoAgil === "function") {
    try { recalcularRetroacaoAgil(); } catch (e) { /* ignore */ }
  }

  const isRetroInvalida = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  const badgeRetroBarra = $("ia2BadgeRetroacaoBarra");
  if (badgeRetroBarra) {
    badgeRetroBarra.style.display = isRetroInvalida ? "inline-flex" : "none";
  }

  document.body.classList.add("modo-ia2-active");
  const container = $("containerModoIA2");
  if (container) container.style.display = "block";

  trocarSubViewIA2(view);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function sairModoIA2() {
  if (ia2Gravando) {
    pausarGravacaoIA2();
  }
  if (ia2DitadoEscritaAtivo) {
    alternarDitadoVozEscritaIA2();
  }
  document.body.classList.remove("modo-ia2-active");
  const container = $("containerModoIA2");
  if (container) container.style.display = "none";
  toast("Visualizando prontuário médico.");
}

function trocarSubViewIA2(view) {
  ia2SubViewAtual = view;
  const vSelecao = $("ia2ViewSelecao");
  const vGravacao = $("ia2ViewGravacao");
  const vEscrita = $("ia2ViewEscrita");

  if (vSelecao) vSelecao.style.display = (view === "selecao" ? "block" : "none");
  if (vGravacao) vGravacao.style.display = (view === "gravacao" ? "block" : "none");
  if (vEscrita) vEscrita.style.display = (view === "escrita" ? "block" : "none");

  if (view === "gravacao") {
    renderizarColinhaIA2();
    const tArea = $("ia2GravacaoTranscricao");
    if (tArea) {
      window._ia2BaseTextGravacao = (tArea.value || "").trim();
      analisarColinhaEmTempoReal(tArea.value || "");
      atualizarContadorGravacaoIA2();
      atualizarVisualTranscricaoIA2(false);
    }
    if (window.__ia2JaTranscreveuOuRefinou) {
      atualizarGuiaPassosIA2(3);
    } else if (ia2Gravando) {
      atualizarGuiaPassosIA2(2);
    } else {
      atualizarGuiaPassosIA2(1);
    }
  } else if (view === "escrita") {
    const tEsc = $("ia2EscritaText");
    if (tEsc) {
      const utilAtual = extrairTextoUtilEscritaIA2(tEsc.value || "");
      if ((!tEsc.value.trim() || !utilAtual) && !window._ia2EscritaLimpouManualmente) {
        inserirRoteiroPerguntasEscritaIA2(true);
      } else {
        window._ia2BaseTextEscrita = (tEsc.value || "").trim();
        atualizarContadorEscritaIA2();
      }
      setTimeout(() => { try { tEsc.focus(); } catch (_) {} }, 100);
    }
  }
}

function atualizarBannerCamposNaoPerguntadosIA2() {
  const container = $("ia2CamposNaoPerguntadosContainer");
  if (!container) return;

  const jaTranscreveu = Boolean(window.__ia2JaTranscreveuOuRefinou);
  if (!jaTranscreveu) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  const pendentes = COLINHA_IA2_CONFIG.filter(q => {
    const st = ia2ColinhaStatus[q.id];
    const isChecked = (st?.manualState !== undefined && st?.manualState !== null) ? st.manualState : st?.matched;
    return !isChecked;
  });

  const total = COLINHA_IA2_CONFIG.length;
  const respondidas = total - pendentes.length;

  if (pendentes.length > 0) {
    container.style.display = "block";
    container.innerHTML = `
      <div style="background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:12px;padding:12px 16px;box-shadow:0 1px 4px rgba(245,158,11,0.08);margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">⚠️</span>
            <strong style="color:#92400E;font-size:13.5px">
              Campos / Perguntas que NÃO foram perguntadas no áudio (${pendentes.length} de ${total} pendentes)
            </strong>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:11px;color:#B45309;font-weight:800;background:#FEF3C7;padding:4px 10px;border-radius:12px;border:1px solid #FCD34D">
              ${respondidas} respondida(s) • ${pendentes.length} pendente(s)
            </span>
            <button type="button" class="btn btn-sm" onclick="iniciarGravacaoIA2()" style="background:#2563EB;color:#fff;border:none;font-size:11.5px;font-weight:800;padding:5px 12px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 6px rgba(37,99,235,0.25)" title="Retomar microfone para fazer as perguntas faltantes">
              🎙️ Gravar Perguntas Faltantes
            </button>
          </div>
        </div>
        <div style="font-size:12px;color:#78350F;margin-bottom:10px;line-height:1.4">
          A IA transcreveu o áudio da consulta e organizou o diálogo. Os tópicos abaixo <strong>não foram relatados</strong> no áudio (se você já conferiu no atestado, clique em <em>"✓ Já conferi"</em>):
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${pendentes.map(p => `
            <div style="background:#FFFFFF;border:1px solid #FCD34D;border-radius:8px;padding:7px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 1px 2px rgba(0,0,0,0.03)">
              <div style="display:flex;align-items:center;gap:10px;min-width:0">
                <span style="background:#F59E0B;color:#FFFFFF;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:900;flex-shrink:0">Item ${p.numero}</span>
                <span style="color:#1E293B;font-size:12.5px;font-weight:600">${esc(p.pergunta)}</span>
              </div>
              <button type="button" onclick="toggleColinhaItemManual(${p.id})" style="background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:800;cursor:pointer;flex-shrink:0;white-space:nowrap" title="Marcar este item como já verificado pelo médico">
                ✓ Já conferi
              </button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  } else {
    container.style.display = "block";
    container.innerHTML = `
      <div style="background:#F0FDF4;border:1.5px solid #86EFAC;border-radius:12px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;color:#166534;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">✅</span>
          <div>
            <strong style="font-size:13.5px;display:block">Excelente! Todas as 11 perguntas do Roteiro Pericial foram identificadas e respondidas.</strong>
            <span style="font-size:11.5px;color:#15803D">Clique no botão verde <strong>"3. Finalizar Atendimento"</strong> acima para escolher seu parecer e gerar a ficha.</span>
          </div>
        </div>
      </div>
    `;
  }
}

function renderizarColinhaIA2() {
  const container = $("ia2ColinhaItemsList");
  if (!container) return;

  let validadas = 0;
  let html = "";
  const jaTranscreveu = Boolean(window.__ia2JaTranscreveuOuRefinou);

  COLINHA_IA2_CONFIG.forEach(q => {
    const st = ia2ColinhaStatus[q.id] || { matched: false, snippet: "", manualState: null };
    const isChecked = (st.manualState !== undefined && st.manualState !== null) ? st.manualState : st.matched;
    if (isChecked) validadas++;

    let statusPill = "";
    if (isChecked) {
      statusPill = `<span style="background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px">✓ Respondido</span>`;
    } else if (jaTranscreveu) {
      statusPill = `<span style="background:#FEF3C7;color:#92400E;border:1px solid #FDE68A;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px">⚠️ Não perguntado</span>`;
    }

    html += `
      <div class="ia2-colinha-item ${isChecked ? 'checked' : (jaTranscreveu ? 'unanswered' : '')}" onclick="toggleColinhaItemManual(${q.id})" id="ia2ColItem_${q.id}" title="Clique para alternar validação manual deste item">
        <div class="ia2-colinha-badge">${isChecked ? '✓' : q.numero}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px">
            <span class="ia2-colinha-text">${esc(q.pergunta)}</span>
            ${statusPill}
          </div>
          ${st.snippet ? `<div class="ia2-colinha-snippet">Detectado: "${esc(st.snippet)}"</div>` : ''}
        </div>
        <div style="margin-left:6px">
          ${isChecked ? '<span style="color:#10B981;font-size:16px;font-weight:900">✅</span>' : '<span style="color:#CBD5E1;font-size:16px">○</span>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  if ($("ia2ColinhaValidadasCount")) $("ia2ColinhaValidadasCount").textContent = validadas;
  const pct = Math.round((validadas / COLINHA_IA2_CONFIG.length) * 100);
  const bar = $("ia2ColinhaProgressBar");
  if (bar) bar.style.width = `${pct}%`;

  const badge = $("ia2ColinhaCountBadge");
  if (badge) {
    if (validadas === 11) {
      badge.style.background = "#DCFCE7";
      badge.style.color = "#15803D";
    } else {
      badge.style.background = "#EFF6FF";
      badge.style.color = "#1D4ED8";
    }
  }
}

function analisarColinhaEmTempoReal(texto) {
  let mudou = false;
  const t = (texto || "").trim();

  COLINHA_IA2_CONFIG.forEach(q => {
    const st = ia2ColinhaStatus[q.id];
    if (!st) return;
    const res = t ? q.validar(t) : { matched: false };
    // Preserva validação semântica da IA caso já tenha sido validada por áudio/IA
    const novoMatched = Boolean((res && res.matched) || st.aiMatched);
    const novoSnippet = (res && res.snippet) ? res.snippet : (st.aiSnippet || "");

    if (st.matched !== novoMatched || st.snippet !== novoSnippet) {
      st.matched = novoMatched;
      st.snippet = novoSnippet;
      mudou = true;
    }
  });

  if (mudou) {
    renderizarColinhaIA2();
    atualizarBannerCamposNaoPerguntadosIA2();
  }
}

function toggleColinhaItemManual(id) {
  const st = ia2ColinhaStatus[id];
  if (!st) return;
  const currentChecked = (st.manualState !== undefined && st.manualState !== null) ? st.manualState : st.matched;
  st.manualState = !currentChecked;
  renderizarColinhaIA2();
  atualizarBannerCamposNaoPerguntadosIA2();
}

function alternarGravacaoIA2() {
  if (ia2Gravando) {
    pausarGravacaoIA2();
  } else {
    iniciarGravacaoIA2();
  }
}

async function iniciarGravacaoIA2() {
  if (location.protocol === "file:") {
    alert("O microfone é bloqueado pelo navegador ao abrir arquivos locais diretamente (file:///). Por favor, acesse o sistema pelo servidor local: http://localhost:8000");
    return;
  }

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    console.warn("Reconhecimento de voz do navegador indisponível. O áudio será gravado diretamente via MediaRecorder para transcrição completa com IA Gemini.");
  }

  ia2Gravando = true;
  atualizarGuiaPassosIA2(2);

  // Snapshot inicial do texto existente na textarea
  const tArea = $("ia2GravacaoTranscricao");
  window._ia2BaseTextGravacao = (tArea?.value || "").trim();

  // Iniciar timer visual
  clearInterval(ia2TimerInterval);
  ia2TimerInterval = setInterval(atualizarTimerDisplayIA2, 1000);

  // Atualizar botões e UI imediatamente
  const btnText = $("ia2BtnGravacaoText");
  const btnIcon = $("ia2BtnGravacaoIcon");
  const btn = $("ia2BtnGravacaoToggle");
  const badge = $("ia2GravacaoStatusBadge");
  const wave = $("ia2WaveContainer");

  if (btn) {
    btn.className = "btn btn-danger ia2-btn-main-record";
    btn.style.background = "#DC2626";
    btn.style.borderColor = "#B91C1C";
    btn.style.boxShadow = "0 4px 14px rgba(220,38,38,0.35)";
  }
  if (btnText) btnText.textContent = "2. Pausar e Ver Transcrição";
  if (btnIcon) btnIcon.textContent = "⏸️";
  if (badge) {
    badge.style.background = "#DCFCE7";
    badge.style.color = "#15803D";
    badge.style.borderColor = "#86EFAC";
    badge.innerHTML = "🎙️ Gravando consulta... Clique em '2. Pausar' quando terminar de perguntar";
  }
  if (wave) wave.classList.add("ia2-recording-active");

  // Ocultar banner de pendências enquanto grava
  const pendBanner = $("ia2CamposNaoPerguntadosContainer");
  if (pendBanner) pendBanner.style.display = "none";

  // Mostrar estado visual focado e limpo de gravação (sem texto ao vivo pulando na tela)
  const containerVisual = $("ia2GravacaoVisual");
  if (containerVisual) {
    containerVisual.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:280px;color:#1E293B;text-align:center;padding:28px">
        <div style="width:76px;height:76px;border-radius:50%;background:#FEE2E2;border:3px solid #EF4444;display:flex;align-items:center;justify-content:center;font-size:34px;margin-bottom:16px;box-shadow:0 0 0 10px rgba(239,68,68,0.12)">🎙️</div>
        <h4 style="margin:0 0 8px;font-size:18px;font-weight:900;color:#0F172A">Gravando Áudio da Consulta...</h4>
        <p style="font-size:14px;color:#475569;max-width:480px;margin:0 0 18px;line-height:1.5">
          Conduza a conversa com o paciente normalmente. Use o <strong>Roteiro de Perguntas (Colinha)</strong> à esquerda como guia.
        </p>
        <div style="background:#EFF6FF;border:1.5px solid #93C5FD;color:#1E40AF;font-size:13px;font-weight:700;padding:10px 20px;border-radius:14px;display:inline-flex;align-items:center;gap:10px;max-width:520px;text-align:left">
          <span style="font-size:20px">⏸️</span>
          <span><strong>Próximo Passo:</strong> Quando terminar as perguntas, clique no botão vermelho <strong>"2. Pausar e Ver Transcrição"</strong> acima para ler o que foi dito e ver se faltou alguma pergunta.</span>
        </div>
      </div>
    `;
  }

  // DISPARAR GETUSERMEDIA EM SEGUNDO PLANO PARA O VU METER E GRAVAÇÃO EM ALTA DEFINIÇÃO
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }).then(stream => {
      if (!ia2Gravando) {
        try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
        return;
      }
      ia2AudioStream = stream;
      window._ia2AudioStream = stream;

      // VU Meter via AudioContext
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          if (!ia2AudioContext || ia2AudioContext.state === "closed") {
            ia2AudioContext = new AudioCtx();
          }
          if (ia2AudioContext.state === "suspended") {
            ia2AudioContext.resume();
          }
          const source = ia2AudioContext.createMediaStreamSource(stream);
          ia2Analyser = ia2AudioContext.createAnalyser();
          ia2Analyser.fftSize = 64;
          source.connect(ia2Analyser);

          const dataArray = new Uint8Array(ia2Analyser.frequencyBinCount);
          const waveBars = document.querySelectorAll("#ia2WaveContainer .ia2-wave-bar");

          const animVU = () => {
            if (!ia2Gravando) return;
            ia2Analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;

            if (waveBars && waveBars.length) {
              waveBars.forEach((bar, idx) => {
                const val = dataArray[idx % dataArray.length] || avg;
                const h = Math.min(26, Math.max(5, Math.round((val / 255) * 26)));
                bar.style.height = `${h}px`;
                bar.style.background = avg > 6 ? "#10B981" : "#94A3B8";
              });
            }

            const b = $("ia2GravacaoStatusBadge");
            if (b && ia2Gravando) {
              if (avg > 7) {
                b.style.background = "#DCFCE7";
                b.style.color = "#15803D";
                b.innerHTML = "🎙️ Captando voz da consulta...";
              } else {
                b.style.background = "#EFF6FF";
                b.style.color = "#1D4ED8";
                b.innerHTML = "🔴 Microfone ligado (aguardando fala...)";
              }
            }

            ia2AnimFrame = requestAnimationFrame(animVU);
          };
          ia2AnimFrame = requestAnimationFrame(animVU);
        }
      } catch (vuErr) {
        console.warn("AudioContext VU meter error:", vuErr);
      }

      // Gravação direta de áudio via MediaRecorder (Preserva chunks entre pausas)
      try {
        if (window.MediaRecorder) {
          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");
          if (!Array.isArray(ia2AudioChunks)) {
            ia2AudioChunks = [];
          }
          ia2MediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          ia2MediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              ia2AudioChunks.push(e.data);
              window.__ia2JaTranscreveuOuRefinou = false;
              const mType = (ia2MediaRecorder && ia2MediaRecorder.mimeType) || "audio/webm";
              window.__ia2AudioBlobPendente = new Blob(ia2AudioChunks, { type: mType });
              const btnDl = $("ia2BtnDownloadAudio");
              if (btnDl) btnDl.style.display = "inline-flex";
            }
          };
          ia2MediaRecorder.start(250);
        }
      } catch (mrErr) {
        console.warn("MediaRecorder backup error:", mrErr);
      }
    }).catch(permErr => {
      console.warn("Permissão de áudio getUserMedia:", permErr);
      if (permErr.name === "NotAllowedError" || permErr.name === "PermissionDeniedError") {
        toast("⚠️ Acesso ao microfone recusado. Libere as permissões no navegador.");
      }
    });
  }

  toast("🎙️ Microfone ativo! Conduza o atendimento com a periciada.");
}

function pausarGravacaoIA2(skipAutoRefine = false) {
  ia2Gravando = false;
  clearInterval(ia2TimerInterval);
  clearTimeout(ia2RestartTimeout);
  if (ia2AnimFrame) {
    cancelAnimationFrame(ia2AnimFrame);
    ia2AnimFrame = null;
  }

  const btnText = $("ia2BtnGravacaoText");
  const btnIcon = $("ia2BtnGravacaoIcon");
  const btn = $("ia2BtnGravacaoToggle");
  const badge = $("ia2GravacaoStatusBadge");
  const wave = $("ia2WaveContainer");

  // Em pausa, usa cor azul para NÃO confundir com o botão verde "3. Finalizar Atendimento"
  if (btn) {
    btn.className = "btn btn-primary ia2-btn-main-record";
    btn.style.background = "#2563EB";
    btn.style.borderColor = "#1D4ED8";
    btn.style.boxShadow = "0 3px 10px rgba(37,99,235,0.25)";
  }
  if (btnText) btnText.textContent = "Continuar Gravação (Mais Perguntas)";
  if (btnIcon) btnIcon.textContent = "🎙️";
  if (badge) {
    badge.style.background = "#FEF3C7";
    badge.style.color = "#92400E";
    badge.style.borderColor = "#FDE68A";
    badge.innerHTML = "⏳ Gravação pausada — IA transcrevendo a conversa...";
  }
  if (wave) wave.classList.remove("ia2-recording-active");
  const waveBars = document.querySelectorAll("#ia2WaveContainer .ia2-wave-bar");
  if (waveBars) {
    waveBars.forEach(b => { b.style.height = "8px"; b.style.background = "#10B981"; });
  }

  const bubble = $("ia2InterimBubble");
  if (bubble) bubble.style.display = "none";

  if (ia2SpeechRecognition) {
    try { ia2SpeechRecognition.stop(); } catch (_) {}
    ia2SpeechRecognition = null;
  }
  if (ia2MediaRecorder && ia2MediaRecorder.state !== "inactive") {
    try {
      if (typeof ia2MediaRecorder.requestData === "function") {
        ia2MediaRecorder.requestData();
      }
      ia2MediaRecorder.stop();
    } catch (_) {}
  }
  if (Array.isArray(ia2AudioChunks) && ia2AudioChunks.length > 0) {
    const mType = (ia2MediaRecorder && ia2MediaRecorder.mimeType) || "audio/webm";
    window.__ia2AudioBlobPendente = new Blob(ia2AudioChunks, { type: mType });
    const btnDl = $("ia2BtnDownloadAudio");
    if (btnDl) btnDl.style.display = "inline-flex";

    // Transcreve automaticamente o áudio gravado no momento ao pausar (exceto quando chamado pela finalização direta)
    if (!skipAutoRefine) {
      setTimeout(() => {
        if (!ia2Gravando && (window.__ia2AudioBlobPendente || (Array.isArray(ia2AudioChunks) && ia2AudioChunks.length > 0))) {
          refinarDialogoComIA2(true);
        }
      }, 280);
    }
  }
}

function atualizarTimerDisplayIA2() {
  ia2SegundosDecorridos++;
  const h = String(Math.floor(ia2SegundosDecorridos / 3600)).padStart(2, "0");
  const m = String(Math.floor((ia2SegundosDecorridos % 3600) / 60)).padStart(2, "0");
  const s = String(ia2SegundosDecorridos % 60).padStart(2, "0");
  const display = $("ia2TimerDisplay");
  if (display) display.textContent = `${h}:${m}:${s}`;
}

function atualizarContadorGravacaoIA2() {
  const txt = ($("ia2GravacaoTranscricao")?.value || "").trim();
  const palavras = txt ? txt.split(/\s+/).length : 0;
  const chars = txt.length;
  const cont = $("ia2GravacaoContador");
  if (cont) cont.textContent = `${palavras} palavra(s) • ${chars} caractere(s)`;
}

function copiarTranscricaoIA2() {
  const txt = $("ia2GravacaoTranscricao")?.value || "";
  if (!txt.trim()) {
    toast("Nenhuma transcrição para copiar.");
    return;
  }
  navigator.clipboard.writeText(txt).then(() => {
    toast("Transcrição copiada para a área de transferência!");
  });
}

function limparTranscricaoIA2() {
  if (confirm("Deseja realmente limpar toda a transcrição e áudio gravados?")) {
    if ($("ia2GravacaoTranscricao")) $("ia2GravacaoTranscricao").value = "";
    window._ia2BaseTextGravacao = "";
    window._ia2DuvidasLowConfidence = [];
    ia2AudioChunks = [];
    window.__ia2AudioBlobPendente = null;
    const btnDl = $("ia2BtnDownloadAudio");
    if (btnDl) btnDl.style.display = "none";
    if (typeof removerAudioImportadoIA2 === "function") {
      removerAudioImportadoIA2();
    }
    window.__ia2JaTranscreveuOuRefinou = false;
    atualizarGuiaPassosIA2(1);
    const btn = $("ia2BtnGravacaoToggle");
    const btnText = $("ia2BtnGravacaoText");
    const btnIcon = $("ia2BtnGravacaoIcon");
    if (btn && !ia2Gravando) {
      btn.className = "btn btn-green ia2-btn-main-record";
      btn.style.background = "linear-gradient(135deg, #059669 0%, #10B981 100%)";
      btn.style.borderColor = "#059669";
    }
    if (btnText && !ia2Gravando) btnText.textContent = "1. Iniciar Gravação";
    if (btnIcon && !ia2Gravando) btnIcon.textContent = "🎙️";
    const pend = $("ia2CamposNaoPerguntadosContainer");
    if (pend) { pend.style.display = "none"; pend.innerHTML = ""; }
    COLINHA_IA2_CONFIG.forEach(q => {
      ia2ColinhaStatus[q.id].matched = false;
      ia2ColinhaStatus[q.id].aiMatched = false;
      ia2ColinhaStatus[q.id].snippet = "";
      ia2ColinhaStatus[q.id].aiSnippet = "";
      ia2ColinhaStatus[q.id].manualState = null;
    });
    renderizarColinhaIA2();
    atualizarContadorGravacaoIA2();
    atualizarVisualTranscricaoIA2(false);
    if (ia2Gravando && ia2SpeechRecognition) {
      try { ia2SpeechRecognition.abort(); } catch (_) {}
    }
  }
}

// Funções do Modo de Escrita / Ditado Guiado
let ia2EscritaColinhaStatus = {};
COLINHA_IA2_CONFIG.forEach(q => {
  ia2EscritaColinhaStatus[q.id] = { matched: false, snippet: "", manualState: null };
});

function extrairTextoUtilEscritaIA2(rawText) {
  if (!rawText) return "";
  const linhas = String(rawText).split(/\r?\n/);
  const linhasUteis = [];
  for (const linha of linhas) {
    const trimL = linha.trim();
    if (!trimL) continue;
    // Ignorar linhas de perguntas do roteiro que ficaram em branco após os dois-pontos ":"
    if (/^\d{2}\.\s+.*:\s*$/.test(trimL)) continue;
    if (/^Observa[çc][õo]es\s*(?:\/\s*Exame\s*F[íi]sico)?\s*:\s*$/i.test(trimL)) continue;
    linhasUteis.push(trimL);
  }
  return linhasUteis.join("\n").trim();
}

function atualizarGuiaPassosEscritaIA2(etapa) {
  const s1 = $("ia2EscritaGuideStep1");
  const s2 = $("ia2EscritaGuideStep2");
  const s3 = $("ia2EscritaGuideStep3");
  const btnFim = $("ia2BtnFinalizarEscrita");

  if (s1 && s2 && s3) {
    if (etapa === 1) {
      s1.className = "ia2-guide-step active";
      s2.className = "ia2-guide-step";
      s3.className = "ia2-guide-step";
    } else if (etapa === 2) {
      s1.className = "ia2-guide-step done";
      s2.className = "ia2-guide-step active";
      s3.className = "ia2-guide-step";
    } else if (etapa === 3) {
      s1.className = "ia2-guide-step done";
      s2.className = "ia2-guide-step done";
      s3.className = "ia2-guide-step active";
    }
  }

  if (btnFim) {
    if (etapa === 3) {
      btnFim.classList.add("ia2-btn-ready-pulse");
    } else {
      btnFim.classList.remove("ia2-btn-ready-pulse");
    }
  }
}

function analisarColinhaEscritaIA2(rawText) {
  const txt = String(rawText || "");
  const textoUtil = extrairTextoUtilEscritaIA2(txt);
  const linhas = txt.split(/\r?\n/);

  let respondidas = 0;

  COLINHA_IA2_CONFIG.forEach(q => {
    const st = ia2EscritaColinhaStatus[q.id] || (ia2EscritaColinhaStatus[q.id] = { matched: false, snippet: "", manualState: null });

    // 1. Verificar se existe a linha numerada "XX. Pergunta: Resposta" com resposta preenchida pelo médico
    const reLinhaNumerada = new RegExp(`^0?${q.id}\\.\\s+.*?:\\s*(.+)$`, "i");
    let respLinha = "";
    for (const l of linhas) {
      const m = l.trim().match(reLinhaNumerada);
      if (m && m[1] && m[1].trim().length > 0) {
        respLinha = m[1].trim();
        break;
      }
    }

    if (respLinha) {
      st.matched = true;
      st.snippet = respLinha.length > 48 ? respLinha.slice(0, 48) + "..." : respLinha;
    } else {
      // 2. Caso o médico esteja escrevendo livremente ou ditando, valida pelo texto útil
      const res = textoUtil ? q.validar(textoUtil) : { matched: false };
      st.matched = Boolean(res && res.matched);
      st.snippet = (res && res.snippet) ? res.snippet : "";
    }

    const isChecked = (st.manualState !== undefined && st.manualState !== null) ? st.manualState : st.matched;
    if (isChecked) respondidas++;
  });

  renderizarColinhaEscritaIA2(respondidas, textoUtil);
}

function renderizarColinhaEscritaIA2(respondidasCount, textoUtil = "") {
  const container = $("ia2EscritaColinhaItemsList");
  if (!container) return;

  let validadas = 0;
  let html = "";

  COLINHA_IA2_CONFIG.forEach(q => {
    const st = ia2EscritaColinhaStatus[q.id] || { matched: false, snippet: "", manualState: null };
    const isChecked = (st.manualState !== undefined && st.manualState !== null) ? st.manualState : st.matched;
    if (isChecked) validadas++;

    const statusPill = isChecked
      ? `<span style="background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;white-space:nowrap">✓ Preenchido</span>`
      : `<span style="background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;white-space:nowrap">➕ Responder</span>`;

    html += `
      <div class="ia2-colinha-item ${isChecked ? 'checked' : ''}" onclick="focarOuInserirPerguntaEscritaIA2(${q.id})" id="ia2EscColItem_${q.id}" title="Clique para ir direto a esta pergunta no texto e responder">
        <div class="ia2-colinha-badge">${isChecked ? '✓' : q.numero}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px">
            <span class="ia2-colinha-text">${esc(q.pergunta)}</span>
            ${statusPill}
          </div>
          ${st.snippet ? `<div class="ia2-colinha-snippet"> Informado: "${esc(st.snippet)}"</div>` : ''}
        </div>
        <div style="margin-left:6px" onclick="toggleColinhaEscritaManual(${q.id}, event)" title="Clique aqui para marcar ou desmarcar manualmente">
          ${isChecked ? '<span style="color:#10B981;font-size:16px;font-weight:900">✅</span>' : '<span style="color:#CBD5E1;font-size:16px">○</span>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  if ($("ia2EscritaColinhaCount")) $("ia2EscritaColinhaCount").textContent = validadas;
  const pct = Math.round((validadas / COLINHA_IA2_CONFIG.length) * 100);
  const bar = $("ia2EscritaColinhaProgressBar");
  if (bar) bar.style.width = `${pct}%`;

  const badge = $("ia2EscritaColinhaBadge");
  if (badge) {
    if (validadas === 11) {
      badge.style.background = "#DCFCE7";
      badge.style.color = "#15803D";
    } else {
      badge.style.background = "#EFF6FF";
      badge.style.color = "#1D4ED8";
    }
  }

  // Atualizar passo ativo na Barra Guia do Modo Escrita
  const palavrasUteis = textoUtil ? textoUtil.split(/\s+/).filter(Boolean).length : 0;
  if (validadas >= 4 || palavrasUteis >= 15) {
    atualizarGuiaPassosEscritaIA2(3);
  } else if (validadas >= 1 || palavrasUteis >= 3 || ia2DitadoEscritaAtivo) {
    atualizarGuiaPassosEscritaIA2(2);
  } else {
    atualizarGuiaPassosEscritaIA2(1);
  }
}

function toggleColinhaEscritaManual(id, ev) {
  if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
  const st = ia2EscritaColinhaStatus[id];
  if (!st) return;
  const currentChecked = (st.manualState !== undefined && st.manualState !== null) ? st.manualState : st.matched;
  st.manualState = !currentChecked;
  analisarColinhaEscritaIA2($("ia2EscritaText")?.value || "");
}

function focarOuInserirPerguntaEscritaIA2(id) {
  const ta = $("ia2EscritaText");
  if (!ta) return;
  const q = COLINHA_IA2_CONFIG.find(item => item.id === id);
  if (!q) return;

  const val = ta.value || "";
  const reLinha = new RegExp(`(^|\\n)(0?${q.id}\\.\\s+[^\\n]*?:[^\\n]*)`, "i");
  const m = val.match(reLinha);

  if (m) {
    // A pergunta já está no texto: posiciona o cursor exatamente no final dessa linha para o médico digitar!
    const startIdx = m.index + (m[1] ? m[1].length : 0);
    const endOfLineIdx = startIdx + m[2].length;
    ta.focus();
    try {
      ta.setSelectionRange(endOfLineIdx, endOfLineIdx);
    } catch (_) {}
    toast(`✏️ Cursor posicionado no Item ${q.numero}. Digite a resposta!`);
  } else {
    // A pergunta não está no texto: adiciona no final e posiciona o cursor!
    const perguntaCurta = q.id === 10 ? "Qual a dosagem (anotar mg/dia)?" : q.pergunta;
    const novaLinha = `${q.numero}. ${perguntaCurta}: `;
    const prefix = val.trim().length > 0 ? (val.endsWith("\n") ? "" : "\n") : "";
    ta.value = val + prefix + novaLinha;
    window._ia2BaseTextEscrita = ta.value.trim();
    atualizarContadorEscritaIA2();
    ta.focus();
    try {
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
      ta.scrollTop = ta.scrollHeight;
    } catch (_) {}
    toast(`➕ Pergunta ${q.numero} adicionada! Digite a resposta.`);
  }
}

function inserirRoteiroPerguntasEscritaIA2(silencioso = false) {
  const ta = $("ia2EscritaText");
  if (!ta) return;

  const utilAtual = extrairTextoUtilEscritaIA2(ta.value || "");
  if (!silencioso && utilAtual.length > 30 && !window._ia2EscritaApenasCadastroInicial) {
    if (!confirm("Deseja inserir o Roteiro de 11 Perguntas? (Clique em 'OK' para substituir o texto atual ou 'Cancelar' para manter como está)")) {
      return;
    }
  }

  // Puxar idade e cargo já conhecidos do cadastro do servidor, se existirem
  const idadeCad = String(state.idade || state.aux?.idade || $("agilIdade")?.value || $("idade")?.value || "").trim();
  const cargoCad = String(state.cargo || state.aux?.cargo || $("agilCargo")?.value || $("cargo")?.value || "").trim();
  const tempoCad = String(state.tempoCargo || state.aux?.tempoCargo || $("agilTempoCargo")?.value || $("tempoCargo")?.value || "").trim();

  const resp01 = (idadeCad && idadeCad !== "—" && idadeCad !== "0") ? (/anos/i.test(idadeCad) ? idadeCad : `${idadeCad} anos`) : "";
  const resp02 = (cargoCad && cargoCad !== "—" && cargoCad.toLowerCase() !== "não informado") ? cargoCad : "";
  const resp03 = (tempoCad && tempoCad !== "—" && tempoCad !== "0") ? (/ano|m[êe]s/i.test(tempoCad) ? tempoCad : `${tempoCad} anos`) : "";

  const linhasRoteiro = [
    `01. Qual é a sua idade ?: ${resp01}`,
    `02. Qual é o seu cargo.: ${resp02}`,
    `03. Quanto tempo está no cargo ?: ${resp03}`,
    `04. É readaptado? Se sim, quais atividades exerce atualmente?: `,
    `05. Qual foi a data do diagnóstico da doença ?: `,
    `06. Qual doença está tratando que motivou o afastamento?: `,
    `07. Com que frequência comparece às consultas?: `,
    `08. Quais sintomas causam limitações para o trabalho?: `,
    `09. Faz o uso de quais medicações?: `,
    `10. Qual a dosagem (anotar mg/dia)?: `,
    `11. Faz psicoterapia ou fisioterapia?: `,
    ``,
    `Observações / Exame Físico: `
  ];

  ta.value = linhasRoteiro.join("\n");
  window._ia2BaseTextEscrita = ta.value.trim();
  window._ia2EscritaApenasCadastroInicial = true;
  window._ia2EscritaLimpouManualmente = false;
  atualizarContadorEscritaIA2();

  if (!silencioso) {
    toast("📝 Roteiro de 11 perguntas inserido! Basta completar as respostas na frente de cada item.");
    // Posicionar cursor na primeira pergunta em branco
    const firstEmptyMatch = ta.value.match(/^\d{2}\.\s+.*?:\s*$/m);
    if (firstEmptyMatch) {
      const pos = firstEmptyMatch.index + firstEmptyMatch[0].length;
      ta.focus();
      try { ta.setSelectionRange(pos, pos); } catch (_) {}
    }
  }
}

function inserirFraseRapidaEscritaIA2(frase) {
  const ta = $("ia2EscritaText");
  if (!ta || !frase) return;

  let val = ta.value || "";
  window._ia2EscritaApenasCadastroInicial = false;

  // Identificar se a frase rápida pertence a um item específico do roteiro (04, 07 ou 11)
  let targetNum = null;
  if (/readaptad/i.test(frase)) targetNum = "04";
  else if (/consulta/i.test(frase)) targetNum = "07";
  else if (/fisioterapia|psicoterapia|fisio\/psico/i.test(frase)) targetNum = "11";

  if (targetNum) {
    const reLinhaVazia = new RegExp(`(^|\\n)(${targetNum}\\.\\s+[^\\n]*?:\\s*)($|\\n)`, "i");
    if (reLinhaVazia.test(val)) {
      val = val.replace(reLinhaVazia, `$1$2${frase}$3`);
      ta.value = val;
      window._ia2BaseTextEscrita = ta.value.trim();
      atualizarContadorEscritaIA2();
      toast(`✅ Resposta preenchida automaticamente no Item ${targetNum}!`);
      return;
    }
  }

  // Caso contrário, adiciona de forma limpa ao final do texto
  const sep = val.trim().length > 0 ? (val.endsWith("\n") || val.endsWith(" ") ? "" : "\n") : "";
  ta.value = val + sep + frase;
  window._ia2BaseTextEscrita = ta.value.trim();
  atualizarContadorEscritaIA2();
  toast("➕ Frase adicionada às anotações!");
}

function limparTextoEscritaIA2() {
  const ta = $("ia2EscritaText");
  if (!ta) return;
  ta.value = "";
  window._ia2BaseTextEscrita = "";
  window._ia2EscritaApenasCadastroInicial = false;
  window._ia2EscritaLimpouManualmente = true;
  COLINHA_IA2_CONFIG.forEach(q => {
    if (ia2EscritaColinhaStatus[q.id]) {
      ia2EscritaColinhaStatus[q.id].matched = false;
      ia2EscritaColinhaStatus[q.id].snippet = "";
      ia2EscritaColinhaStatus[q.id].manualState = null;
    }
  });
  atualizarContadorEscritaIA2();
  ta.focus();
  toast("🗑️ Campo limpo! Você pode digitar livremente ou clicar em 'Inserir Perguntas Guia'.");
}

function atualizarContadorEscritaIA2() {
  const raw = ($("ia2EscritaText")?.value || "").trim();
  const util = extrairTextoUtilEscritaIA2(raw);
  const palavras = util ? util.split(/\s+/).length : 0;
  const chars = util.length;
  const cont = $("ia2EscritaContador");
  if (cont) cont.textContent = `${palavras} palavra(s) preenchida(s) • ${chars} caractere(s)`;
  analisarColinhaEscritaIA2(raw);
}

$("ia2GravacaoTranscricao")?.addEventListener("input", function() {
  window._ia2BaseTextGravacao = this.value.trim();
  analisarColinhaEmTempoReal(this.value);
  atualizarContadorGravacaoIA2();
  atualizarVisualTranscricaoIA2(false);
  if (ia2Gravando && ia2SpeechRecognition) {
    try { ia2SpeechRecognition.abort(); } catch (_) {}
  }
});

$("ia2EscritaText")?.addEventListener("input", function() {
  window._ia2BaseTextEscrita = this.value.trim();
  window._ia2EscritaApenasCadastroInicial = false;
  atualizarContadorEscritaIA2();
  if (ia2DitadoEscritaAtivo && ia2DitadoEscritaRecognition) {
    try { ia2DitadoEscritaRecognition.abort(); } catch (_) {}
  }
});

async function colarTextoClipboardIA2() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      const t = $("ia2EscritaText");
      if (t) {
        if (window._ia2EscritaApenasCadastroInicial) {
          t.value = text.trim();
        } else {
          t.value = (t.value ? t.value.trim() + "\n\n" : "") + text.trim();
        }
        window._ia2EscritaApenasCadastroInicial = false;
        window._ia2BaseTextEscrita = t.value.trim();
        atualizarContadorEscritaIA2();
        toast("📋 Texto colado com sucesso!");
      }
    }
  } catch (e) {
    alert("Não foi possível acessar a área de transferência automaticamente. Por favor, clique dentro do campo e aperte Ctrl + V no teclado.");
  }
}

async function alternarDitadoVozEscritaIA2() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert("Reconhecimento de voz não suportado neste navegador. Utilize o Google Chrome, Edge ou Brave.");
    return;
  }

  const btn = $("ia2BtnDitadoEscrita");
  const btnTxt = $("ia2DitadoEscritaText");
  const bubble = $("ia2EscritaInterimBubble");
  const bubbleTxt = $("ia2EscritaInterimText");

  if (ia2DitadoEscritaAtivo) {
    ia2DitadoEscritaAtivo = false;
    clearTimeout(ia2DitadoEscritaRestartTimeout);
    const tArea = $("ia2EscritaText");
    if (tArea) {
      window._ia2BaseTextEscrita = tArea.value.trim();
    }
    if (ia2DitadoEscritaRecognition) {
      try { ia2DitadoEscritaRecognition.stop(); } catch (_) {}
      ia2DitadoEscritaRecognition = null;
    }
    if (ia2DitadoEscritaStream) {
      try { ia2DitadoEscritaStream.getTracks().forEach(t => t.stop()); } catch(_) {}
      ia2DitadoEscritaStream = null;
    }
    if (btnTxt) btnTxt.textContent = "Ditar por Voz";
    if (btn) {
      btn.style.background = "#ECFDF5";
      btn.style.color = "#047857";
      btn.style.borderColor = "#10B981";
    }
    if (bubble) bubble.style.display = "none";
    atualizarContadorEscritaIA2();
    toast("✅ Ditado por voz pausado.");
  } else {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        ia2DitadoEscritaStream = stream;
      }).catch(err => {
        console.warn("Permissão microfone ditado escrita:", err);
      });
    }

    ia2DitadoEscritaAtivo = true;
    const tArea = $("ia2EscritaText");
    window._ia2EscritaApenasCadastroInicial = false;
    window._ia2BaseTextEscrita = (tArea?.value || "").trim();

    if (btnTxt) btnTxt.textContent = "🔴 Ouvindo sua Voz... (Clique p/ Parar)";
    if (btn) {
      btn.style.background = "#FEE2E2";
      btn.style.color = "#B91C1C";
      btn.style.borderColor = "#EF4444";
    }
    atualizarGuiaPassosEscritaIA2(2);

    function iniciarMotorDitadoEscrita() {
      if (!ia2DitadoEscritaAtivo) return;
      try {
        if (ia2DitadoEscritaRecognition) {
          try { ia2DitadoEscritaRecognition.abort(); } catch(_) {}
          ia2DitadoEscritaRecognition = null;
        }
        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "pt-BR";
        rec.maxAlternatives = 1;

        rec.onresult = (ev) => {
          let sessionFinal = "";
          let sessionInterim = "";
          for (let i = 0; i < ev.results.length; ++i) {
            const item = ev.results[i];
            const transcript = item[0]?.transcript || "";
            if (item.isFinal) {
              sessionFinal += transcript + " ";
            } else {
              sessionInterim += transcript;
            }
          }

          const t = $("ia2EscritaText");
          if (t) {
            const base = (window._ia2BaseTextEscrita || "").trim();
            let fullComposed = base;
            if (sessionFinal.trim()) {
              fullComposed = fullComposed ? (fullComposed + " " + sessionFinal.trim()) : sessionFinal.trim();
            }
            if (sessionInterim.trim()) {
              fullComposed = fullComposed ? (fullComposed + " " + sessionInterim.trim()) : sessionInterim.trim();
            }
            t.value = fullComposed;
            atualizarContadorEscritaIA2();
          }

          if (bubble && bubbleTxt) {
            if (sessionInterim.trim()) {
              bubble.style.display = "flex";
              bubbleTxt.textContent = sessionInterim.trim();
            } else {
              bubble.style.display = "none";
            }
          }
        };

        rec.onend = () => {
          if (ia2DitadoEscritaAtivo) {
            const t = $("ia2EscritaText");
            if (t) {
              window._ia2BaseTextEscrita = t.value.trim();
            }
            clearTimeout(ia2DitadoEscritaRestartTimeout);
            ia2DitadoEscritaRestartTimeout = setTimeout(() => {
              if (ia2DitadoEscritaAtivo) {
                iniciarMotorDitadoEscrita();
              }
            }, 120);
          }
        };

        rec.onerror = (err) => {
          console.warn("Ditado escrita warning:", err.error, err);
          if (err.error === "no-speech") return;
          if (err.error === "not-allowed" || err.error === "service-not-allowed") {
            toast("⚠️ Permissão do microfone negada pelo navegador.");
            alternarDitadoVozEscritaIA2();
          }
        };

        rec.start();
        ia2DitadoEscritaRecognition = rec;
      } catch (err) {
        console.warn("Falha ao iniciar ditado escrita:", err);
      }
    }

    iniciarMotorDitadoEscrita();
    toast("🎙️ Microfone ativo! Fale normalmente para preencher as anotações.");
  }
}

function inserirExemploEscritaIA2() {
  const exemplo = `Servidora de 45 anos, professora de educação básica há 14 anos. Não é readaptada. Refere dor intensa em punho direito há 8 meses com piora ao escrever na lousa e corrigir provas. Diagnosticada com Síndrome do Túnel do Carpo (CID G56.0), realizando consultas mensalmente. Em uso de Ibuprofeno 600mg/dia e Paracetamol. Realiza fisioterapia 2 vezes por semana. Ao exame físico: Manobra de Phalen e sinal de Tinel positivos no punho direito, com dor à palpação do trajeto do nervo mediano. PA 120x80 mmHg. Sugiro afastamento de 30 dias para repouso articular e reabilitação funcional.`;
  const t = $("ia2EscritaText");
  if (t) {
    t.value = exemplo;
    window._ia2EscritaApenasCadastroInicial = false;
    window._ia2BaseTextEscrita = exemplo;
    atualizarContadorEscritaIA2();
    toast("📄 Exemplo pericial completo inserido!");
  }
}

// Variáveis de Controle da Decisão Pericial do Médico (Modo IA 2.0)
let ia2DecisaoParecerEscolhido = "FAVORÁVEL";
let ia2DecisaoExameEscolhido = "Alterado";
let ia2DecisaoDiasModo = "original";
let ia2DecisaoDiasValorOriginal = 0;
let ia2DecisaoOrigemPendente = null;
let ia2DecisaoTextoPendente = "";

// Modelos Clínicos Rápidos de Apoio para Modo Escrita
function inserirTemplateClinicoEscritaIA2(tipo) {
  const ta = $("ia2EscritaText");
  if (!ta) return;

  const templates = {
    lombar: `QUEIXA PRINCIPAL: Dor lombar intensa com irradiação para membro inferior e limitação funcional para flexão da coluna e esforço físico.
INÍCIO DOS SINTOMAS: Iniciou há 3 dias após movimentação atípica no trabalho.
TRATAMENTO: Em uso de anti-inflamatório (cetoprofeno 150mg) e analgésico potente, consultas regulares. Realiza fisioterapia.
EXAME FÍSICO: Marcha claudicante antiálgica, dor à palpação de musculatura paravertebral lombo-sacra com contratura muscular reflexa. Amplitude de movimento reduzida para flexão e rotação lombar. Teste de Lasègue negativo.
DOCUMENTOS: Apresentou atestado médico assistente recomendando repouso.`,

    respiratorio: `QUEIXA PRINCIPAL: Síndrome gripal com febre aferida, tosse produtiva, coriza hialina, cefaleia e mialgia generalizada.
INÍCIO DOS SINTOMAS: Iniciou há 2 dias com evolução aguda.
TRATAMENTO: Em uso de sintomáticos (dipirona 500mg, hidratação oral vigorosa e repouso domiciliar). Nega fisioterapia ou psicoterapia.
EXAME FÍSICO: Bom estado geral, corado, hidratado, afebril no momento da perícia. Ausculta pulmonar com murmúrio vesicular universalmente audível, sem ruídos adventícios. Orofaringe sem placas exsudativas.
DOCUMENTOS: Atestado emitido com indicação de afastamento temporário para recuperação.`,

    mental: `QUEIXA PRINCIPAL: Sintomas ansiosos e depressivos reativos, com insônia intermediária, fadiga mental e labilidade emocional no contexto ocupacional.
INÍCIO DOS SINTOMAS: Quadro insidioso com intensificação significativa nas últimas semanas.
TRATAMENTO: Acompanhamento psiquiátrico mensal com uso de antidepressivo (escitalopram 15mg/dia) e psicoterapia semanal.
EXAME DO ESTADO MENTAL: Vigil, orientado no tempo e no espaço, contato e afeto preservados, congruente com o humor hipotímico, sem delírios ou ideação suicida ativa.
DOCUMENTOS: Relatório médico detalhado emitido por médico psiquiatra assistente.`,

    retrospectivo: `QUEIXA PRINCIPAL: Perícia retrospectiva. Servidor comparece para homologação de atestado de período anterior já cumprido.
HISTÓRICO: Relata quadro incapacitante durante os dias do atestado, com melhora gradual após cumprimento do repouso domiciliar e uso das medicações prescritas.
EXAME FÍSICO PERICIAL: No presente ato pericial, apresenta exame físico sem alterações agudas em razão do tempo decorrido e da convalescença clínica.
DOCUMENTOS: Atestado médico tempestivo apresentado dentro do prazo regulamentar comprobatório da incapacidade à época.`
  };

  const texto = templates[tipo] || "";
  if (!texto) return;

  if (ta.value && ta.value.trim().length > 0 && !window._ia2EscritaApenasCadastroInicial) {
    if (!confirm("Deseja adicionar este modelo ao final do que você já escreveu? (Clique 'OK' para adicionar ao final, ou 'Cancelar' para substituir tudo)")) {
      ta.value = texto;
      window._ia2EscritaApenasCadastroInicial = false;
      atualizarContadorEscritaIA2();
      toast("Modelo clínico inserido com sucesso!");
      return;
    }
    ta.value = ta.value.trim() + "\n\n" + texto;
    window._ia2EscritaApenasCadastroInicial = false;
    atualizarContadorEscritaIA2();
    toast("📋 Modelo clínico adicionado ao final das suas anotações!");
    return;
  }

  // Se estava apenas com o roteiro inicial, preserva idade/cargo preenchidos e adiciona o modelo abaixo
  const utilInicial = extrairTextoUtilEscritaIA2(ta.value || "");
  ta.value = utilInicial ? (utilInicial + "\n\n" + texto) : texto;
  window._ia2EscritaApenasCadastroInicial = false;
  atualizarContadorEscritaIA2();
  toast("📋 Modelo clínico inserido com sucesso!");
}

// Funções de Gerenciamento de Áudio Externo e Download
function abrirSeletorAudioIA2() {
  const inp = $("ia2InputAudioFile");
  if (inp) {
    inp.value = "";
    inp.click();
  }
}

function processarArquivoAudioImportadoIA2(input) {
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  const maxBytes = 32 * 1024 * 1024; // 32MB
  if (file.size > maxBytes) {
    alert("O arquivo de áudio selecionado excede o limite máximo permitido de 32 MB.");
    input.value = "";
    return;
  }

  // Detectar MIME type correto e padronizado para navegadores e IA
  let detectedMime = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!detectedMime || detectedMime === "application/octet-stream" || detectedMime === "audio/octet-stream") {
    if (ext === "mp3") detectedMime = "audio/mpeg";
    else if (ext === "wav") detectedMime = "audio/wav";
    else if (ext === "m4a" || ext === "mp4" || ext === "aac") detectedMime = "audio/mp4";
    else if (ext === "ogg" || ext === "opus") detectedMime = "audio/ogg";
    else if (ext === "webm") detectedMime = "audio/webm";
    else detectedMime = "audio/mpeg";
  } else if (detectedMime === "audio/mp3") {
    detectedMime = "audio/mpeg"; // audio/mpeg é o MIME padrão para decodificação em navegadores HTML5
  }

  // Cria Blob tipado garantindo que o player HTML5 e a API conheçam o container
  const audioBlob = (file.type === detectedMime) ? file : new Blob([file], { type: detectedMime });
  audioBlob.name = file.name;
  window.__ia2AudioBlobPendente = audioBlob;
  ia2AudioChunks = []; // substitui gravação anterior pelo arquivo importado

  // Atualizar Banner e Player
  const banner = $("ia2AudioBannerContainer");
  const titulo = $("ia2AudioBannerTitulo");
  const info = $("ia2AudioBannerInfo");
  const player = $("ia2AudioPlayerPreview");
  const badge = $("ia2GravacaoStatusBadge");

  if (banner) banner.style.display = "flex";
  if (titulo) titulo.textContent = `📁 ${file.name}`;
  const mb = (file.size / (1024 * 1024)).toFixed(2);
  if (info) info.textContent = `${ext.toUpperCase()} • ${mb} MB • Carregando áudio...`;

  if (player) {
    try {
      if (player._objectUrl) {
        URL.revokeObjectURL(player._objectUrl);
      }
      const url = URL.createObjectURL(audioBlob);
      player._objectUrl = url;
      player.src = url;
      player.preload = "auto";
      player.style.display = "inline-flex";
      player.load(); // ESSENCIAL: força o navegador a decodificar metadados e preparar o áudio

      player.onloadedmetadata = () => {
        const dur = Math.round(player.duration);
        if (dur && !isNaN(dur) && isFinite(dur)) {
          const min = Math.floor(dur / 60);
          const sec = String(dur % 60).padStart(2, "0");
          if (info) info.textContent = `${ext.toUpperCase()} • ${mb} MB (${min}:${sec}) • Pronto para transcrição com IA`;
        } else {
          if (info) info.textContent = `${ext.toUpperCase()} • ${mb} MB • Pronto para transcrição com IA`;
        }
      };

      player.onerror = () => {
        console.warn("Aviso na reprodução do áudio pelo navegador:", player.error);
        if (info) info.textContent = `${ext.toUpperCase()} • ${mb} MB • Pronto para envio à IA`;
      };
    } catch (e) {
      console.warn("Erro ao configurar player do áudio:", e);
    }
  }

  if (badge) {
    badge.style.background = "#DCFCE7";
    badge.style.color = "#15803D";
    badge.innerHTML = "✅ Áudio carregado (pronto para IA)";
  }

  const btnDl = $("ia2BtnDownloadAudio");
  if (btnDl) btnDl.style.display = "none";

  toast(`🎵 Arquivo de áudio "${file.name}" carregado com sucesso!`);

  // Dispara automaticamente a transcrição multimodal com IA
  setTimeout(() => {
    if (window.__ia2AudioBlobPendente) {
      refinarDialogoComIA2(true);
    }
  }, 350);
}

function removerAudioImportadoIA2() {
  window.__ia2AudioBlobPendente = null;
  window.__ia2JaTranscreveuOuRefinou = false;
  const pend = $("ia2CamposNaoPerguntadosContainer");
  if (pend) { pend.style.display = "none"; pend.innerHTML = ""; }
  const banner = $("ia2AudioBannerContainer");
  if (banner) banner.style.display = "none";
  const player = $("ia2AudioPlayerPreview");
  if (player) {
    try {
      player.pause();
      if (player._objectUrl) {
        URL.revokeObjectURL(player._objectUrl);
        player._objectUrl = null;
      }
      player.removeAttribute("src");
      player.load();
    } catch (_) {}
  }
  const badge = $("ia2GravacaoStatusBadge");
  if (badge && !ia2Gravando) {
    badge.style.background = "#F1F5F9";
    badge.style.color = "#64748B";
    badge.innerHTML = "⏹️ Pronto para iniciar";
  }
  const inp = $("ia2InputAudioFile");
  if (inp) inp.value = "";
  toast("Arquivo de áudio removido.");
}

function baixarGravacaoAudioIA2() {
  const blob = window.__ia2AudioBlobPendente || (
    Array.isArray(ia2AudioChunks) && ia2AudioChunks.length > 0
      ? new Blob(ia2AudioChunks, { type: (ia2MediaRecorder && ia2MediaRecorder.mimeType) || "audio/webm" })
      : null
  );
  if (!blob) {
    toast("Nenhuma gravação de áudio disponível para download.");
    return;
  }
  const atdId = state.atendimento || $("atd")?.value || "consulta";
  const d = new Date().toISOString().slice(0, 10);
  const ext = (blob.type && blob.type.includes("mp3")) ? "mp3" : "webm";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `atendimento_${atdId}_gravacao_${d}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast("Gravação baixada com sucesso!");
}

// Finalização do Modo IA 2.0
async function finalizarAtendimentoIA2(origem) {
  if (origem === "gravacao") {
    if (ia2Gravando) {
      pausarGravacaoIA2(true);
      await new Promise(r => setTimeout(r, 250));
    }
    salvarEdicaoVisualIA2();

    if (Array.isArray(ia2AudioChunks) && ia2AudioChunks.length > 0 && !window.__ia2AudioBlobPendente) {
      const mime = (ia2MediaRecorder && ia2MediaRecorder.mimeType) || "audio/webm";
      window.__ia2AudioBlobPendente = new Blob(ia2AudioChunks, { type: mime });
    }

    const hasAudio = Boolean(window.__ia2AudioBlobPendente || (Array.isArray(ia2AudioChunks) && ia2AudioChunks.length > 0));
    let txt = ($("ia2GravacaoTranscricao")?.value || "").trim();
    if (!txt && !hasAudio) {
      alert("A gravação está vazia. Inicie a conversa com a periciada, grave o áudio ou importe um arquivo de áudio antes de finalizar.");
      return;
    }

    // Se já existe uma transcrição em andamento iniciada ao pausar, apenas aguarda ela concluir
    if (_ia2RefinandoAtivo && _ia2RefinandoPromise) {
      try {
        const refData = await _ia2RefinandoPromise;
        txt = ($("ia2GravacaoTranscricao")?.value || "").trim() || (refData && refData.texto_formatado) || txt;
      } catch (err) {
        console.warn("Aviso ao aguardar transcrição em andamento:", err);
      }
    } else if (hasAudio && (!window.__ia2JaTranscreveuOuRefinou || !txt)) {
      // Só transcreve se ainda não tiver sido transcrito ao pausar/importar
      try {
        const refData = await refinarDialogoComIA2(true);
        if (refData && refData.texto_formatado) {
          txt = refData.texto_formatado;
        }
      } catch (err) {
        console.warn("Aviso ao transcrever áudio na finalização:", err);
      }
    }

    abrirModalDecisaoMedicoIA2("gravacao", txt);
  } else if (origem === "escrita") {
    const rawTxt = ($("ia2EscritaText")?.value || "").trim();
    const txtUtil = extrairTextoUtilEscritaIA2(rawTxt);
    if (!txtUtil || (window._ia2EscritaApenasCadastroInicial && txtUtil.split(/\r?\n/).length <= 3)) {
      alert("Por favor, responda às perguntas no campo de texto, escolha um modelo rápido ou dite suas anotações antes de finalizar.");
      return;
    }
    abrirModalDecisaoMedicoIA2("escrita", txtUtil);
  }
}

function fecharModalAvisoColinhaIA2() {
  const modalAviso = $("ia2ModalAvisoColinha");
  if (modalAviso) modalAviso.style.display = "none";
}

function confirmarFinalizacaoIA2MesmoComPendencias() {
  fecharModalAvisoColinhaIA2();
  salvarEdicaoVisualIA2();
  if (Array.isArray(ia2AudioChunks) && ia2AudioChunks.length > 0 && !window.__ia2AudioBlobPendente) {
    const mime = (ia2MediaRecorder && ia2MediaRecorder.mimeType) || "audio/webm";
    window.__ia2AudioBlobPendente = new Blob(ia2AudioChunks, { type: mime });
  }
  const txt = ($("ia2GravacaoTranscricao")?.value || "").trim();
  abrirModalDecisaoMedicoIA2("gravacao", txt);
}

// Modal de Decisão Discreta do Médico Perito
function abrirModalDecisaoMedicoIA2(origem, texto) {
  ia2DecisaoOrigemPendente = origem;
  ia2DecisaoTextoPendente = texto || "";

  syncState();
  const v = values();
  const diasSolStr = state.diasSolicitados || state.aux?.diasSolicitados || v.diasSolicitados || $("agilDiasSolicitados")?.value || $("diasSolicitados")?.value || "0";
  const diasNum = parseInt(diasSolStr, 10) || 0;
  ia2DecisaoDiasValorOriginal = diasNum;

  const txtDiasOrig = $("ia2DecisaoDiasOriginalTexto");
  if (txtDiasOrig) {
    txtDiasOrig.textContent = diasNum > 0 ? String(diasNum) : "0";
  }

  const inputCustom = $("ia2DecisaoDiasInput");
  if (inputCustom) {
    inputCustom.value = diasNum > 0 ? String(diasNum) : "";
  }

  if (typeof recalcularRetroacaoAgil === "function") {
    try { recalcularRetroacaoAgil(); } catch (e) { /* ignore */ }
  }

  const isRetroInvalida = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  const retroDias = state.aux?.retroacaoDias || state.retroacaoDias || 0;

  const alertRetro = $("ia2DecisaoRetroAlerta");
  const alertInfo = $("ia2DecisaoRetroInformativo");

  if (isRetroInvalida) {
    if (alertRetro) {
      alertRetro.style.display = "block";
      alertRetro.innerHTML = `
        <strong style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:4px">
          <span>⛔</span> Guia Expedida Fora do Prazo Regulamentar (${retroDias} dias de retroação > 3 dias)
        </strong>
        <span>Parecer <strong>CONTRÁRIO</strong> aplicado automaticamente por retroação inválida, mantendo todo o atendimento clínico, limitações e exame físico como favoráveis e aplicando o motivo na justificativa.</span>
      `;
    }
    if (alertInfo) alertInfo.style.display = "none";
    selecionarDecisaoParecerIA2("CONTRÁRIO");
    selecionarDecisaoExameIA2("Alterado");
    atualizarDecisaoDiasIA2("original");
  } else {
    if (alertRetro) alertRetro.style.display = "none";
    if (alertInfo) alertInfo.style.display = "block";
    selecionarDecisaoParecerIA2("FAVORÁVEL");
    selecionarDecisaoExameIA2("Alterado");
    atualizarDecisaoDiasIA2("original");
  }

  const obsEl = $("ia2DecisaoObsMedico");
  if (obsEl) obsEl.value = "";

  const modal = $("ia2ModalDecisaoMedico");
  if (modal) modal.style.display = "flex";
}

function fecharModalDecisaoMedicoIA2() {
  const modal = $("ia2ModalDecisaoMedico");
  if (modal) modal.style.display = "none";
}

function selecionarDecisaoParecerIA2(parecer) {
  ia2DecisaoParecerEscolhido = parecer;
  const cFav = $("ia2DecisaoCardFav");
  const cContr = $("ia2DecisaoCardContr");
  const isRetroInv = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);

  if (parecer === "FAVORÁVEL") {
    if (cFav) cFav.className = "ia2-decision-card selected-fav";
    if (cContr) cContr.className = "ia2-decision-card";
    if (ia2DecisaoDiasModo === "zero") {
      atualizarDecisaoDiasIA2("original");
    }
  } else {
    if (cFav) cFav.className = "ia2-decision-card";
    if (cContr) cContr.className = "ia2-decision-card selected-contr";
    if (!isRetroInv) {
      atualizarDecisaoDiasIA2("zero");
    } else {
      atualizarDecisaoDiasIA2("original");
    }
  }
}

function selecionarDecisaoExameIA2(tipo) {
  ia2DecisaoExameEscolhido = tipo;
  const cAlt = $("ia2DecisaoExameAlterado");
  const cNorm = $("ia2DecisaoExameNormal");
  const cDoc = $("ia2DecisaoExameDoc");

  if (cAlt) cAlt.className = (tipo === "Alterado" ? "ia2-decision-card selected-opt" : "ia2-decision-card");
  if (cNorm) cNorm.className = (tipo === "Normal" ? "ia2-decision-card selected-opt" : "ia2-decision-card");
  if (cDoc) cDoc.className = (tipo === "Documental" ? "ia2-decision-card selected-opt" : "ia2-decision-card");
}

function atualizarDecisaoDiasIA2(modo) {
  ia2DecisaoDiasModo = modo;
  const rOrig = $("ia2RadioDiasOriginal");
  const rCust = $("ia2RadioDiasCustom");
  const rZero = $("ia2RadioDiasZero");

  if (rOrig) rOrig.checked = (modo === "original");
  if (rCust) rCust.checked = (modo === "custom");
  if (rZero) rZero.checked = (modo === "zero");
}

function confirmarDecisaoEEstruturarIA2() {
  const isRetroInv = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  let diasFinal = ia2DecisaoDiasValorOriginal;
  if (ia2DecisaoDiasModo === "zero" && !isRetroInv) {
    diasFinal = 0;
  } else if (ia2DecisaoDiasModo === "custom") {
    const val = parseInt($("ia2DecisaoDiasInput")?.value, 10);
    diasFinal = !isNaN(val) && val >= 0 ? val : ia2DecisaoDiasValorOriginal;
  }

  const decisaoMedico = {
    parecer: isRetroInv ? "CONTRÁRIO" : ia2DecisaoParecerEscolhido,
    exameFisicoResultado: ia2DecisaoExameEscolhido,
    diasConcedidos: diasFinal,
    observacoesMedico: ($("ia2DecisaoObsMedico")?.value || "").trim(),
    retroacaoInvalida: isRetroInv,
    retroacaoDias: state.aux?.retroacaoDias || state.retroacaoDias || null,
    parecerManualOverride: (!isRetroInv && ia2DecisaoParecerEscolhido) ? ia2DecisaoParecerEscolhido : (ia2DecisaoParecerEscolhido === "FAVORÁVEL" && isRetroInv ? "FAVORÁVEL" : "")
  };

  fecharModalDecisaoMedicoIA2();
  executarPreenchimentoIA2(ia2DecisaoTextoPendente, ia2DecisaoOrigemPendente, decisaoMedico);
}

function atualizarOverlayIA2Passo(passo, mensagem, porcentagem) {
  const overlay = $("ia2LoadingOverlay");
  if (overlay && overlay.style.display !== "flex") {
    overlay.style.display = "flex";
  }
  const pBar = $("ia2ProgressBar");
  if (pBar && typeof porcentagem === "number") {
    pBar.style.width = `${Math.min(100, Math.max(0, porcentagem))}%`;
  }
  const pText = $("ia2LoadingPillText");
  if (pText && mensagem) {
    pText.textContent = mensagem;
  }
  for (let i = 1; i <= 4; i++) {
    const stepEl = $(`ia2Step${i}`);
    if (!stepEl) continue;
    const iconEl = stepEl.querySelector(".ia2-step-icon");
    if (i < passo) {
      stepEl.className = "ia2-step-item done";
      if (iconEl) iconEl.innerHTML = `<span style="color:#10B981;font-weight:900">✓</span>`;
    } else if (i === passo) {
      if (porcentagem === 100) {
        stepEl.className = "ia2-step-item done";
        if (iconEl) iconEl.innerHTML = `<span style="color:#10B981;font-weight:900">✓</span>`;
      } else {
        stepEl.className = "ia2-step-item active";
        if (iconEl) iconEl.innerHTML = `<span class="ia2-step-spinner"></span>`;
      }
    } else {
      stepEl.className = "ia2-step-item pending";
      if (iconEl) iconEl.innerHTML = `<span style="color:#94A3B8">•</span>`;
    }
  }
}

async function executarPreenchimentoIA2(texto, origem, decisaoMedico = {}) {
  if (ia2Gravando) {
    pausarGravacaoIA2(true);
  }
  if (ia2DitadoEscritaAtivo) {
    alternarDitadoVozEscritaIA2();
  }

  atualizarOverlayIA2Passo(1, "🎙️ Captando áudio e decisões clínicas do médico perito...", 20);

  try {
    if (origem === "gravacao") {
      salvarEdicaoVisualIA2();
      let textoAtual = ($("ia2GravacaoTranscricao")?.value || "").trim();

      // Se a transcrição ainda estiver rodando em background (iniciada no Pausar), aguarda concluir
      if (_ia2RefinandoAtivo && _ia2RefinandoPromise) {
        atualizarOverlayIA2Passo(2, "🧠 Concluindo transcrição do áudio em andamento...", 45);
        const refData = await _ia2RefinandoPromise;
        textoAtual = ($("ia2GravacaoTranscricao")?.value || "").trim() || (refData && refData.texto_formatado) || textoAtual;
      } else if (!window.__ia2JaTranscreveuOuRefinou || !textoAtual) {
        // Só transcreve agora caso ainda não tenha sido transcrito ao pausar/importar
        await new Promise(r => setTimeout(r, 200));

        const audioBlob = window.__ia2AudioBlobPendente || (
          Array.isArray(ia2AudioChunks) && ia2AudioChunks.length > 0
            ? new Blob(ia2AudioChunks, { type: (ia2MediaRecorder && ia2MediaRecorder.mimeType) || "audio/webm" })
            : null
        );
        const hasAudio = Boolean(audioBlob && audioBlob.size > 200);

        if (hasAudio) {
          atualizarOverlayIA2Passo(2, "🧠 IA Gemini analisando áudio, identificando vozes (Médica x Paciente) e limpando ruídos...", 45);
        } else {
          atualizarOverlayIA2Passo(2, "🧠 IA Médica estruturando diálogo (Médico x Paciente) e limpando ruídos...", 45);
        }

        const refData = await refinarDialogoComIA2(true);
        textoAtual = ($("ia2GravacaoTranscricao")?.value || "").trim() || (refData && refData.texto_formatado) || textoAtual;
      } else {
        // Já foi transcrito ao pausar ou importar! Reaproveita instantaneamente sem transcrever de novo
        atualizarOverlayIA2Passo(2, "✓ Transcrição já pronta! Reaproveitando diálogo estruturado...", 55);
      }

      atualizarOverlayIA2Passo(3, "📋 Integrando parecer pericial, diretrizes e exame clínico...", 70);

      if (textoAtual) {
        texto = textoAtual;
      }
    } else {
      atualizarOverlayIA2Passo(1, "📝 Analisando anotações clínicas periciais...", 25);
      await new Promise(r => setTimeout(r, 200));
      atualizarOverlayIA2Passo(2, "🧠 IA Médica estruturando termos periciais e dosagens...", 50);
      atualizarOverlayIA2Passo(3, "📋 Mapeando parâmetros clínicos e CIDs...", 70);
    }

    if (!texto) {
      throw new Error("A IA não identificou falas ou conteúdo clínico suficiente no áudio/anotação enviada. Verifique se o arquivo possui áudio gravado e tente novamente.");
    }

    atualizarOverlayIA2Passo(4, "⚡ Preenchendo ficha e-SISLA com parecer e regras oficiais...", 88);
    window.__ia2UltimoTextoProcessado = texto;

    const reqBody = {
      texto_bruto: texto,
      atendimento: state.atendimento || $("atd")?.value || "",
      modo_ia2: true,
      origem_modo_ia2: origem,
      decisao_medico: decisaoMedico,
      impersonate_medico_id: (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ambiental.impersonate_medico_id') : null),
      contexto_atual: {
        nomePaciente: state.nomePaciente || state.aux?.nomePaciente || "",
        cpfPaciente: state.cpfPaciente || state.aux?.cpfPaciente || "",
        rg: state.aux?.rgPaciente || state.aux?.rg || "",
        dataNascimento: state.aux?.dataNascimento || "",
        idade: state.idade || state.aux?.idade || "",
        sexo: state.sexo || state.aux?.sexo || "",
        cargo: state.cargo || state.aux?.cargo || "",
        tempoCargo: state.tempoCargo || state.aux?.tempoCargo || "",
        tempoUnidade: state.tempoUnidade || state.aux?.tempoUnidade || "Anos",
        readaptado: state.readaptado || state.aux?.readaptado || "Não",
        cid: state.cid || state.aux?.cid || "",
        crmCro: state.crmCro || state.aux?.crmCro || "",
        medicoAssistenteNome: state.aux?.nomeMedicoAssistente || state.aux?.medicoAssistenteNome || "",
        dataDocumento: state.dataDocumento || state.aux?.dataDocumento || "",
        dataExpedicao: state.aux?.dataExpedicao || state.dataExpedicao || "",
        dataExpedicaoIso: state.aux?.dataExpedicaoIso || state.dataExpedicao || "",
        diasSolicitados: state.diasSolicitados || state.aux?.diasSolicitados || "",
        retroacaoInvalida: Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida),
        retroacaoDias: state.aux?.retroacaoDias || state.retroacaoDias || null,
        parecerManualOverride: state.parecerManualOverride || ""
      }
    };

    let res;
    if (window.AmbientalAPI?.ai?.preencherFicha) {
      res = await AmbientalAPI.ai.preencherFicha(reqBody);
    } else {
      const r = await (window.AmbientalAuth ? window.AmbientalAuth.authFetch : fetch)("/api/ai/preencher-ficha", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(reqBody)
      });
      res = await r.json();
      if (!r.ok) throw new Error(res?.detail || res?.error?.message || "Falha ao processar texto com IA.");
    }

    const dados = res?.dados || res;
    if (!dados || typeof dados !== "object") {
      throw new Error("A IA não retornou a estrutura esperada.");
    }

    // Preenchimento de forma oculta no prontuário
    aplicarPreenchimentoIAResultado(dados);

    // Assegurar aplicação soberana das escolhas do médico perito
    if (decisaoMedico) {
      if (decisaoMedico.parecer) {
        state.parecer = decisaoMedico.parecer;
        if ($("parecer")) $("parecer").value = decisaoMedico.parecer;
        if ($("agilParecer")) $("agilParecer").value = decisaoMedico.parecer;
        if (typeof setRadio === "function") {
          setRadio("parecer", decisaoMedico.parecer);
          setRadio("agilParecer", decisaoMedico.parecer);
        }
      }
      if (typeof decisaoMedico.diasConcedidos !== "undefined" && decisaoMedico.diasConcedidos !== null) {
        const dStr = String(decisaoMedico.diasConcedidos);
        state.diasSolicitados = dStr;
        if ($("diasSolicitados")) $("diasSolicitados").value = dStr;
        if ($("agilDiasSolicitados")) $("agilDiasSolicitados").value = dStr;
      }
    }

    if (typeof autoSave === "function") {
      autoSave();
    }

    // Sucesso final animado
    atualizarOverlayIA2Passo(4, "✅ Atendimento pericial finalizado com sucesso!", 100);
    await new Promise(r => setTimeout(r, 450));

    // Exibir tela de sucesso
    abrirModalSucessoIA2(dados);
  } catch (err) {
    console.error("Erro no preenchimento Modo IA 2.0:", err);
    alert("Falha no processamento com Inteligência Artificial: " + (err.message || "Erro de conexão."));
  } finally {
    const overlay = $("ia2LoadingOverlay");
    if (overlay) overlay.style.display = "none";
  }
}

function abrirModalSucessoIA2(dados) {
  const m = $("ia2ModalSucesso");
  if (!m) return;

  const cid = state.cid || dados.cid || "—";
  const fCid = typeof findCID === "function" ? findCID(cid) : null;
  const cidDesc = fCid?.n || state.aux?.doencaMotivo || dados.doenca_motivo || "—";

  const parecer = state.parecer || dados.parecer || "Favorável";
  const dias = state.diasSolicitados || state.aux?.diasSolicitados || dados.dias_solicitados || "0";
  const exame = state.exameFisicoTipo || dados.exame_fisico_tipo || "Outros";

  const sis = state.aux?.pressaoSistolica || "—";
  const dia = state.aux?.pressaoDiastolica || "—";

  if ($("ia2SucessoCid")) $("ia2SucessoCid").textContent = cid;
  if ($("ia2SucessoCidDesc")) $("ia2SucessoCidDesc").textContent = cidDesc;
  if ($("ia2SucessoParecer")) {
    $("ia2SucessoParecer").textContent = parecer;
    $("ia2SucessoParecer").style.color = (String(parecer).toUpperCase().includes("CONT") ? "#DC2626" : "#059669");
  }
  if ($("ia2SucessoDias")) $("ia2SucessoDias").textContent = `${dias} dia(s) concedido(s)`;
  if ($("ia2SucessoExameTipo")) $("ia2SucessoExameTipo").textContent = exame;
  if ($("ia2SucessoSinaisVitais")) $("ia2SucessoSinaisVitais").textContent = `PA: ${sis}/${dia} mmHg`;

  m.style.display = "flex";
}

function fecharModalSucessoIA2() {
  const m = $("ia2ModalSucesso");
  if (m) m.style.display = "none";
}

function sincronizarEsislaSucessoIA2() {
  copiarLaudoEsislaAtendimento();
}

function revisarProntuarioAbertoIA2() {
  fecharModalSucessoIA2();
  sairModoIA2();
}

async function finalizarAtendimentoDefinitivoIA2() {
  fecharModalSucessoIA2();
  sairModoIA2();

  // 1. Sincroniza o prontuário ao fundo com todos os dados gerados pela IA
  syncAgilToExtended();
  ensureAgileBackgroundDefaults();
  syncState();

  // 2. Executa a finalização oficial do atendimento seguindo rigorosamente o fluxo do prontuário
  if (currentAttendanceMode === "agil" && typeof finalizarAtendimentoAgil === "function") {
    finalizarAtendimentoAgil();
  } else if (typeof finalizeFromHeader === "function") {
    finalizeFromHeader();
  } else if (typeof openFinalizeDialog === "function") {
    openFinalizeDialog();
  } else {
    await confirmFinalize();
  }
}

function salvarComoRascunhoIA2() {
  fecharModalSucessoIA2();
  sairModoIA2();
  syncAgilToExtended();
  ensureAgileBackgroundDefaults();
  syncState();
  if (typeof saveNow === "function") saveNow();
  setTimeout(() => {
    openManagement();
  }, 400);
}

function salvarEVoltarGestaoIA2() {
  salvarComoRascunhoIA2();
}

function abrirVisualizadorFichaEsislaIA2() {
  const viewer = $("ia2ModalFichaEsislaViewer");
  const content = $("ia2FichaEsislaConteudo");
  if (!viewer || !content) return;

  syncState();
  const v = values();

  const texto = `FICHA DE AVALIAÇÃO MÉDICA PERICIAL — e-SISLA (DPME)
======================================================================
Servidor(a): ${state.aux?.nomePaciente || state.nomePaciente || v.nomePaciente || "Não informado"}
CPF: ${formatCPF(state.aux?.cpfPaciente || state.cpfPaciente || v.cpfPaciente || "")}
Cargo: ${state.aux?.cargo || state.cargo || v.cargo || "—"}
Atendimento Nº: ${state.atendimento || v.atendimento || "—"}
Data: ${state.aux?.dataAtd || v.dataAtendimento || today()}

(*) QUEIXA E DURAÇÃO:
----------------------------------------------------------------------
${state.aux?.queixaDuracao || v.queixaDuracao || state.aux?.doencaMotivo || "Em acompanhamento médico regular."}

(*) ANTECEDENTES MÓRBIDOS:
----------------------------------------------------------------------
${state.aux?.historicoPregresso || v.historicoPregresso || "Nega antecedentes mórbidos relevantes, cirurgias prévias e neoplasias."}

(*) ATESTADO / RELATÓRIO DO ASSISTENTE:
----------------------------------------------------------------------
${state.aux?.relatorioAssistente || "Em anexo."}

(*) EXAME FÍSICO GERAL / MENTAL:
----------------------------------------------------------------------
[${state.exameFisicoTipo || "Outros"}]
${state.exameFisicoDescricao || v.exameFisicoDescricao || "Bom estado geral, eupneico(a), orientado(a)."}
Sinais Vitais: PA ${state.aux?.pressaoSistolica || "—"}/${state.aux?.pressaoDiastolica || "—"} mmHg | Pulso: ${state.aux?.pulso || "—"} bpm

(*) DESCRIÇÃO DA(S) LIMITAÇÃO(ÕES) FUNCIONAL(IS):
----------------------------------------------------------------------
${state.descLimitacao || state.aux?.sintomasLimitacao || v.sintomasLimitacao || "Limitações funcionais compatíveis com a sintomatologia referida."}

(*) QUESITOS OFICIAIS:
----------------------------------------------------------------------
1. Há incapacidade laborativa temporária? Sim
2. A incapacidade é total para a função? ${state.parecer === 'Favorável' ? 'Sim' : 'Não'}
3. Há nexo causal ou incapacidade permanente? Não

(*) PARECER FINAL E JUSTIFICATIVA:
----------------------------------------------------------------------
Parecer: ${state.parecer || "Favorável"}
CID Principal: ${state.cid || "—"}
Dias Sugeridos/Concedidos: ${state.diasSolicitados || state.aux?.diasSolicitados || "0"} dia(s)
Justificativa: ${state.justificativa || state.aux?.justificativa || "Quadro clínico documentado em relatório com sintomatologia incapacitante temporária."}
======================================================================`;

  content.textContent = texto;
  viewer.style.display = "flex";
}

function fecharVisualizadorFichaEsislaIA2() {
  const viewer = $("ia2ModalFichaEsislaViewer");
  if (viewer) viewer.style.display = "none";
}

function copiarTextoFichaEsislaIA2() {
  const content = $("ia2FichaEsislaConteudo")?.textContent || "";
  if (!content) return;
  navigator.clipboard.writeText(content).then(() => {
    toast("Texto completo da Ficha e-SISLA copiado!");
  });
}

function imprimirFichaEsislaIA2() {
  const content = $("ia2FichaEsislaConteudo")?.textContent || "";
  const w = window.open("", "_blank");
  if (!w) {
    toast("Pop-up bloqueado pelo navegador.");
    return;
  }
  w.document.open();
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Ficha e-SISLA — Atendimento ${state.atendimento || ""}</title>
      <style>
        body { font-family: monospace; font-size: 13px; line-height: 1.6; padding: 30px; color: #111; }
        pre { white-space: pre-wrap; word-break: break-word; }
      </style>
    </head>
    <body onload="window.print()">
      <pre>${esc(content)}</pre>
    </body>
    </html>
  `);
  w.document.close();
}

window.abrirModoIA2 = abrirModoIA2;
window.sairModoIA2 = sairModoIA2;
window.trocarSubViewIA2 = trocarSubViewIA2;
window.alternarGravacaoIA2 = alternarGravacaoIA2;
window.toggleColinhaItemManual = toggleColinhaItemManual;
window.copiarTranscricaoIA2 = copiarTranscricaoIA2;
window.limparTranscricaoIA2 = limparTranscricaoIA2;
window.finalizarAtendimentoIA2 = finalizarAtendimentoIA2;
window.fecharModalAvisoColinhaIA2 = fecharModalAvisoColinhaIA2;
window.confirmarFinalizacaoIA2MesmoComPendencias = confirmarFinalizacaoIA2MesmoComPendencias;
window.abrirModalDecisaoMedicoIA2 = abrirModalDecisaoMedicoIA2;
window.fecharModalDecisaoMedicoIA2 = fecharModalDecisaoMedicoIA2;
window.selecionarDecisaoParecerIA2 = selecionarDecisaoParecerIA2;
window.selecionarDecisaoExameIA2 = selecionarDecisaoExameIA2;
window.atualizarDecisaoDiasIA2 = atualizarDecisaoDiasIA2;
window.confirmarDecisaoEEstruturarIA2 = confirmarDecisaoEEstruturarIA2;
window.inserirTemplateClinicoEscritaIA2 = inserirTemplateClinicoEscritaIA2;
window.sincronizarEsislaSucessoIA2 = sincronizarEsislaSucessoIA2;
window.fecharModalSucessoIA2 = fecharModalSucessoIA2;
window.revisarProntuarioAbertoIA2 = revisarProntuarioAbertoIA2;
window.salvarEVoltarGestaoIA2 = salvarEVoltarGestaoIA2;
window.abrirVisualizadorFichaEsislaIA2 = abrirVisualizadorFichaEsislaIA2;
window.fecharVisualizadorFichaEsislaIA2 = fecharVisualizadorFichaEsislaIA2;
window.copiarTextoFichaEsislaIA2 = copiarTextoFichaEsislaIA2;
window.imprimirFichaEsislaIA2 = imprimirFichaEsislaIA2;
window.colarTextoClipboardIA2 = colarTextoClipboardIA2;
window.alternarDitadoVozEscritaIA2 = alternarDitadoVozEscritaIA2;
window.inserirExemploEscritaIA2 = inserirExemploEscritaIA2;
window.atualizarContadorEscritaIA2 = atualizarContadorEscritaIA2;
window.refinarDialogoComIA2 = refinarDialogoComIA2;
window.organizarTranscricaoManualmenteIA2 = organizarTranscricaoManualmenteIA2;
window.trocarAbaTranscricaoIA2 = trocarAbaTranscricaoIA2;
window.atualizarOverlayIA2Passo = atualizarOverlayIA2Passo;

/* =========================================================
   PREENCHIMENTO INTELIGENTE COM IA (ANOTAÇÕES / SISTEMA)
   ========================================================= */
function isAdmInDoctorLogin() {
  const isImp = Boolean(
    (currentProfile && currentProfile.is_impersonating) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ambiental.impersonate_medico_id')) ||
    new URLSearchParams(window.location.search).get('impersonate_medico_id') ||
    new URLSearchParams(window.location.search).get('medico_id')
  );
  const isAdm = (currentProfile?.perfilOriginal === 'Administrador') || (currentProfile?.perfil === 'Administrador');
  return isAdm || isImp;
}

function abrirModalPreenchimentoIA() {
  const modal = $("modalPreenchimentoIA");
  if (!modal) {
    console.error("Modal modalPreenchimentoIA não encontrado no DOM!");
    return;
  }
  modal.classList.add("show");
  modal.style.display = "flex";
  const loading = $("aiPreencherLoading");
  if (loading) loading.style.display = "none";
  const btn = $("btnProcessarPreenchimentoIA");
  if (btn) btn.disabled = false;

  const isAdm = isAdmInDoctorLogin();
  const badge = $("badgeStatusAdmDoctorLogin");
  const tagAdm = $("badgeIaAdmPermissaoTag");

  if (badge) {
    badge.style.display = "block";
    if (isAdm) {
      badge.innerHTML = `
        <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:9px 13px;color:#166534;font-size:12px;display:flex;align-items:center;gap:8px">
          <span style="font-size:16px">🛡️</span>
          <div>
            <strong>Modo Administrador em Login Médico Ativo:</strong>
            <span>O conteúdo digitado no Texto Bruto é tratado como afirmação do médico perito. A IA preencherá os demais campos clínicos com redação formal e robusta, sem acrescentar dados além do afirmado.</span>
          </div>
        </div>`;
      if (tagAdm) {
        tagAdm.textContent = "🛡️ ADM em Login Médico: IA Habilitada";
        tagAdm.style.background = "#DCFCE7";
        tagAdm.style.color = "#15803D";
        tagAdm.style.borderColor = "#86EFAC";
      }
      if (btn) {
        btn.innerHTML = "<span>✨</span> Processar Anotações do Médico e Preencher Ficha";
        btn.style.opacity = "1";
        btn.title = "Processar anotações do médico e preencher todos os demais campos clínicos";
      }
    } else {
      badge.innerHTML = `
        <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:9px 13px;color:#92400E;font-size:12px;display:flex;align-items:center;gap:8px">
          <span style="font-size:16px">ℹ️</span>
          <div>
            <strong>Recurso de Uso Exclusivo:</strong>
            <span>O preenchimento automático de campos clínicos via IA a partir do Texto Bruto é habilitado apenas para Administradores ao entrar em login médico. Você pode importar o PDF do e-SISLA acima normalmente.</span>
          </div>
        </div>`;
      if (tagAdm) {
        tagAdm.textContent = "🔒 Restrito a ADM em Login Médico";
        tagAdm.style.background = "#FEF3C7";
        tagAdm.style.color = "#92400E";
        tagAdm.style.borderColor = "#FCD34D";
      }
      if (btn) {
        btn.innerHTML = "<span>🔒</span> Preenchimento de Anotações Restrito a ADM";
        btn.title = "Habilitado apenas para Administrador ao entrar em login médico";
      }
    }
  }

  setTimeout(() => { $("txtPreenchimentoIABruto")?.focus(); }, 150);
}

function fecharModalPreenchimentoIA() {
  const modal = $("modalPreenchimentoIA");
  if (modal) {
    modal.classList.remove("show");
    modal.style.display = "none";
  }
  const loading = $("aiPreencherLoading");
  if (loading) loading.style.display = "none";
  const btn = $("btnProcessarPreenchimentoIA");
  if (btn) btn.disabled = false;
}

window.abrirModalPreenchimentoIA = abrirModalPreenchimentoIA;
window.fecharModalPreenchimentoIA = fecharModalPreenchimentoIA;
window.isAdmInDoctorLogin = isAdmInDoctorLogin;

async function executarPreenchimentoIA() {
  const txt = ($("txtPreenchimentoIABruto")?.value || "").trim();
  if (!txt) {
    alert("Por favor, cole as anotações do médico ou os dados do atendimento no campo de texto.");
    return;
  }

  if (!isAdmInDoctorLogin()) {
    alert("O preenchimento automático de campos clínicos via IA a partir do Texto Bruto é habilitado apenas para Administradores ao entrar em login médico.");
    return;
  }

  const loading = $("aiPreencherLoading");
  const btn = $("btnProcessarPreenchimentoIA");
  if (loading) loading.style.display = "flex";
  if (btn) btn.disabled = true;

  try {
    let res;
    const reqBody = {
      texto_bruto: txt,
      atendimento: state.atendimento || $("atd")?.value || "",
      impersonate_medico_id: (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ambiental.impersonate_medico_id') : null),
      contexto_atual: {
        nomePaciente: state.nomePaciente || state.aux?.nomePaciente || "",
        cpfPaciente: state.cpfPaciente || state.aux?.cpfPaciente || "",
        rg: state.aux?.rgPaciente || state.aux?.rg || "",
        dataNascimento: state.aux?.dataNascimento || "",
        idade: state.idade || state.aux?.idade || "",
        sexo: state.sexo || state.aux?.sexo || "",
        cargo: state.cargo || state.aux?.cargo || "",
        tempoCargo: state.tempoCargo || state.aux?.tempoCargo || "",
        tempoUnidade: state.tempoUnidade || state.aux?.tempoUnidade || "Anos",
        readaptado: state.readaptado || state.aux?.readaptado || "Não",
        cid: state.cid || state.aux?.cid || "",
        crmCro: state.crmCro || state.aux?.crmCro || "",
        medicoAssistenteNome: state.aux?.nomeMedicoAssistente || state.aux?.medicoAssistenteNome || "",
        dataDocumento: state.dataDocumento || state.aux?.dataDocumento || "",
        dataExpedicao: state.aux?.dataExpedicao || state.dataExpedicao || "",
        dataExpedicaoIso: state.aux?.dataExpedicaoIso || state.dataExpedicao || "",
        diasSolicitados: state.diasSolicitados || state.aux?.diasSolicitados || ""
      }
    };
    if (window.AmbientalAPI?.ai?.preencherFicha) {
      res = await AmbientalAPI.ai.preencherFicha(reqBody);
    } else {
      const r = await (window.AmbientalAuth ? window.AmbientalAuth.authFetch : fetch)("/api/ai/preencher-ficha", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(reqBody)
      });
      res = await r.json();
      if (!r.ok) throw new Error(res?.detail || res?.error?.message || "Falha ao processar texto com IA.");
    }
    const dados = res?.dados || res;
    if (!dados || typeof dados !== "object") {
      throw new Error("A IA não retornou os dados estruturados esperados.");
    }
    aplicarPreenchimentoIAResultado(dados);
    fecharModalPreenchimentoIA();
    if ($("fisioterapia")) $("fisioterapia").checked = !!state.fisioterapia;
    if ($("agilFisioterapia")) $("agilFisioterapia").checked = !!state.fisioterapia;
    if ($("psicoterapia")) $("psicoterapia").checked = !!state.psicoterapia;
    if ($("agilPsicoterapia")) $("agilPsicoterapia").checked = !!state.psicoterapia;
    setTimeout(() => {
      if ($("fisioterapia")) $("fisioterapia").checked = !!state.fisioterapia;
      if ($("agilFisioterapia")) $("agilFisioterapia").checked = !!state.fisioterapia;
      if ($("psicoterapia")) $("psicoterapia").checked = !!state.psicoterapia;
      if ($("agilPsicoterapia")) $("agilPsicoterapia").checked = !!state.psicoterapia;
    }, 60);
    toast("✨ Campos clínicos preenchidos com IA a partir das anotações do médico! Redação formal e robusta em Rascunho.");
  } catch (err) {
    console.error("Erro no preenchimento com IA:", err);
    alert("Não foi possível preencher com IA: " + (err.message || "Erro de conexão com o servidor."));
  } finally {
    if (loading) loading.style.display = "none";
    if (btn) btn.disabled = false;
  }
}

/* =========================================================
   DITADO CLÍNICO POR VOZ E TRANSCRIÇÃO IA (GEMINI 3.8 FLASH)
   ========================================================= */
let mediaRecorderVoz = null;
let speechRecognitionVoz = null;
let gravacaoAudioChunks = [];
let gravacaoTimerInterval = null;
let gravacaoSegundos = 0;
let arquivoAudioSelecionado = null;
let ultimoBenchmarkCidCarregado = null;
let gravacaoVozAtiva = false;

function abrirModalGravadorVozIA() {
  const modal = $("modalGravadorVozIA");
  if (!modal) return;
  modal.classList.add("show");
  modal.style.display = "flex";
  descartarGravacaoVozIA();
  
  // Exibir a caixa de transcrição imediatamente
  const resBox = $("gravadorVozResultadoBox");
  if (resBox) resBox.style.display = "block";
  const txtBox = $("gravadorVozTranscricaoTexto");
  if (txtBox) txtBox.textContent = "🎙️ Microfone sendo ativado... Permita o microfone se solicitado pelo navegador e comece a falar.";

  // Dispara a gravação imediatamente para abrir a solicitação de permissão nativa do navegador
  setTimeout(() => {
    alternarGravacaoVozIA(true);
  }, 120);
}

function fecharModalGravadorVozIA() {
  pararGravacaoVozIA();
  const modal = $("modalGravadorVozIA");
  if (modal) {
    modal.classList.remove("show");
    modal.style.display = "none";
  }
}

function atualizarTimerGravacao() {
  gravacaoSegundos++;
  const m = String(Math.floor(gravacaoSegundos / 60)).padStart(2, "0");
  const s = String(gravacaoSegundos % 60).padStart(2, "0");
  const timerEl = $("gravadorVozTimer");
  if (timerEl) timerEl.textContent = `${m}:${s}`;
}

function pararGravacaoVozIA() {
  gravacaoVozAtiva = false;
  if (speechRecognitionVoz) {
    try { speechRecognitionVoz.stop(); } catch(_) {}
    speechRecognitionVoz = null;
  }
  if (mediaRecorderVoz && mediaRecorderVoz.state === "recording") {
    try { mediaRecorderVoz.stop(); } catch(_) {}
  }
  clearInterval(gravacaoTimerInterval);
  gravacaoTimerInterval = null;

  if ($("btnToggleGravacaoIcone")) $("btnToggleGravacaoIcone").textContent = "🎙️";
  if ($("btnToggleGravacaoTexto")) $("btnToggleGravacaoTexto").textContent = "Gravar Novamente";
  if ($("btnToggleGravacaoVoz")) $("btnToggleGravacaoVoz").style.background = "#2563EB";
  if ($("gravadorVozDot")) $("gravadorVozDot").style.background = "#10B981";
  if ($("gravadorVozStatusTexto")) $("gravadorVozStatusTexto").textContent = "Ditado finalizado! Pronto para estruturar com IA.";
  if ($("btnDescartarGravacao")) $("btnDescartarGravacao").style.display = "inline-flex";
  if ($("btnProcessarGravacaoVoz")) $("btnProcessarGravacaoVoz").disabled = false;
}

async function alternarGravacaoVozIA(forceStart = false) {
  if (gravacaoVozAtiva && !forceStart) {
    pararGravacaoVozIA();
    return;
  }

  // Verificação de protocolo file:///
  if (location.protocol === "file:") {
    toast("O navegador bloqueia o microfone em arquivos abertos diretamente (file:///). Inicie o sistema via servidor local (http://localhost:8000).");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  gravacaoVozAtiva = true;
  gravacaoAudioChunks = [];
  arquivoAudioSelecionado = null;
  if ($("gravadorVozArquivoNome")) $("gravadorVozArquivoNome").style.display = "none";
  if ($("gravadorVozResultadoBox")) $("gravadorVozResultadoBox").style.display = "block";

  gravacaoSegundos = 0;
  if ($("gravadorVozTimer")) $("gravadorVozTimer").textContent = "00:00";
  clearInterval(gravacaoTimerInterval);
  gravacaoTimerInterval = setInterval(atualizarTimerGravacao, 1000);

  if ($("btnToggleGravacaoIcone")) $("btnToggleGravacaoIcone").textContent = "⏹️";
  if ($("btnToggleGravacaoTexto")) $("btnToggleGravacaoTexto").textContent = "Concluir Ditado";
  if ($("btnToggleGravacaoVoz")) $("btnToggleGravacaoVoz").style.background = "#EF4444";
  if ($("gravadorVozDot")) $("gravadorVozDot").style.background = "#EF4444";
  if ($("gravadorVozStatusTexto")) $("gravadorVozStatusTexto").textContent = "🔴 Gravando... Fale os achados da consulta";
  if ($("btnDescartarGravacao")) $("btnDescartarGravacao").style.display = "none";
  if ($("btnProcessarGravacaoVoz")) $("btnProcessarGravacaoVoz").disabled = false;

  // 1. INICIAR SPEECH RECOGNITION (Web Speech API) - dispara imediatamente a permissão nativa de microfone no Chrome/Edge
  if (SpeechRecognition) {
    try {
      if (speechRecognitionVoz) {
        try { speechRecognitionVoz.abort(); } catch(_) {}
        speechRecognitionVoz = null;
      }
      speechRecognitionVoz = new SpeechRecognition();
      speechRecognitionVoz.lang = "pt-BR";
      speechRecognitionVoz.continuous = true;
      speechRecognitionVoz.interimResults = true;
      speechRecognitionVoz.maxAlternatives = 1;

      speechRecognitionVoz.onresult = (event) => {
        let finalSegment = "";
        let interimSegment = "";
        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) finalSegment += item[0].transcript + " ";
          else interimSegment += item[0].transcript;
        }

        const liveWords = (finalSegment + interimSegment).trim();
        if (liveWords) {
          const txtBox = $("gravadorVozTranscricaoTexto");
          if (txtBox) {
            txtBox.textContent = liveWords;
            txtBox.scrollTop = txtBox.scrollHeight;
          }
          const txtBruto = $("txtPreenchimentoIABruto");
          if (txtBruto) txtBruto.value = liveWords;
          if ($("btnProcessarGravacaoVoz")) $("btnProcessarGravacaoVoz").disabled = false;
        }
      };

      speechRecognitionVoz.onerror = (event) => {
        console.warn("SpeechRecognition erro:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          gravacaoVozAtiva = false;
          pararGravacaoVozIA();
          toast("Permissão do microfone negada. Clique no ícone de cadeado/microfone na barra de endereços para permitir.");
        }
      };

      speechRecognitionVoz.onend = () => {
        if (gravacaoVozAtiva) {
          try { speechRecognitionVoz.start(); } catch(_) {}
        }
      };

      speechRecognitionVoz.start();
      toast("Microfone ativo! Fale seus achados periciais com clareza.");
    } catch (srErr) {
      console.warn("Falha ao iniciar SpeechRecognition:", srErr);
    }
  }

  // 2. EM PARALELO: CAPTURA DO FLUXO DE ÁUDIO VIA GETUSERMEDIA E MEDIARECORDER (Permite envio para Gemini Multimodal)
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
        console.warn("getUserMedia não concedido ou erro:", err);
        return null;
      });

      if (stream) {
        window._voiceAudioStreamGlobal = stream;
        try {
          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");
          mediaRecorderVoz = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          mediaRecorderVoz.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) gravacaoAudioChunks.push(e.data);
          };
          mediaRecorderVoz.onstop = () => {
            try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
          };
          mediaRecorderVoz.start(250);
        } catch (mrErr) {
          console.warn("MediaRecorder falhou:", mrErr);
        }
      }
    } catch (e) {
      console.warn("Erro ao iniciar getUserMedia:", e);
    }
  }
}

function descartarGravacaoVozIA() {
  pararGravacaoVozIA();
  gravacaoSegundos = 0;
  gravacaoAudioChunks = [];
  arquivoAudioSelecionado = null;

  if ($("gravadorVozTimer")) $("gravadorVozTimer").textContent = "00:00";
  if ($("gravadorVozDot")) $("gravadorVozDot").style.background = "#94A3B8";
  if ($("gravadorVozStatusTexto")) $("gravadorVozStatusTexto").textContent = "Microfone pronto para gravação";
  if ($("btnToggleGravacaoIcone")) $("btnToggleGravacaoIcone").textContent = "🎙️";
  if ($("btnToggleGravacaoTexto")) $("btnToggleGravacaoTexto").textContent = "Iniciar Gravação";
  if ($("btnToggleGravacaoVoz")) $("btnToggleGravacaoVoz").style.background = "#10B981";
  if ($("btnDescartarGravacao")) $("btnDescartarGravacao").style.display = "none";
  if ($("btnProcessarGravacaoVoz")) $("btnProcessarGravacaoVoz").disabled = true;
  if ($("gravadorVozArquivoNome")) $("gravadorVozArquivoNome").style.display = "none";
  const txtBox = $("gravadorVozTranscricaoTexto");
  if (txtBox) txtBox.textContent = "";
}

function aoSelecionarArquivoAudio(file) {
  if (!file) return;
  pararGravacaoVozIA();
  arquivoAudioSelecionado = file;
  gravacaoAudioChunks = [];
  
  if ($("gravadorVozArquivoNome")) {
    $("gravadorVozArquivoNome").textContent = `📁 Arquivo selecionado: ${file.name} (${Math.round(file.size / 1024)} KB)`;
    $("gravadorVozArquivoNome").style.display = "block";
  }
  if ($("gravadorVozStatusTexto")) $("gravadorVozStatusTexto").textContent = "Arquivo de áudio pronto para envio!";
  if ($("gravadorVozDot")) $("gravadorVozDot").style.background = "#10B981";
  if ($("btnDescartarGravacao")) $("btnDescartarGravacao").style.display = "inline-flex";
  if ($("btnProcessarGravacaoVoz")) $("btnProcessarGravacaoVoz").disabled = false;
}

async function processarAudioGravadoIA() {
  pararGravacaoVozIA();

  let blobParaEnvio = null;
  if (arquivoAudioSelecionado) {
    blobParaEnvio = arquivoAudioSelecionado;
  } else if (gravacaoAudioChunks.length > 0) {
    const mime = (mediaRecorderVoz && mediaRecorderVoz.mimeType) || "audio/webm";
    blobParaEnvio = new Blob(gravacaoAudioChunks, { type: mime });
  }

  const transcricaoLocal = ($("gravadorVozTranscricaoTexto")?.textContent || $("txtPreenchimentoIABruto")?.value || "").replace(/^🎙️ Microfone sendo ativado.*$/, "").trim();

  if (!blobParaEnvio && !transcricaoLocal) {
    alert("Nenhum áudio gravado ou fala detectada para processamento.");
    return;
  }

  const loading = $("gravadorVozLoading");
  const btnProcessar = $("btnProcessarGravacaoVoz");
  if (loading) loading.style.display = "flex";
  if (btnProcessar) btnProcessar.disabled = true;

  try {
    let dados = null;
    let transcricao = transcricaoLocal;

    const atdId = state.atendimento || $("atd")?.value || "";
    const impId = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ambiental.impersonate_medico_id') : null);

    // Se temos o áudio binário, enviamos para o endpoint multimodal Gemini 3.8 Flash
    if (blobParaEnvio) {
      const formData = new FormData();
      formData.append("audio", blobParaEnvio, arquivoAudioSelecionado ? arquivoAudioSelecionado.name : "ditado_clinico.webm");
      if (atdId) formData.append("atendimento", atdId);
      if (impId) formData.append("impersonate_medico_id", impId);

      let res;
      if (window.AmbientalAPI?.ai?.transcreverAtendimento) {
        res = await AmbientalAPI.ai.transcreverAtendimento(formData, atdId, impId);
      } else {
        const token = (typeof AmbientalAuth !== 'undefined') ? await AmbientalAuth.getAccessToken().catch(()=>null) : null;
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const r = await fetch("/api/ai/transcrever-atendimento", {
          method: "POST",
          headers,
          body: formData
        });
        res = await r.json();
        if (!r.ok) throw new Error(res?.detail || res?.error?.message || "Falha ao processar áudio.");
      }

      transcricao = res?.transcricao || transcricao;
      dados = res?.dados_extraidos || {};
    }

    // Se não gerou dados estruturados via áudio mas temos transcrição via SpeechRecognition:
    if ((!dados || Object.keys(dados).length === 0) && transcricao) {
      const reqBody = {
        texto_bruto: transcricao,
        atendimento: atdId,
        impersonate_medico_id: impId
      };
      let resIa;
      if (window.AmbientalAPI?.ai?.preencherFicha) {
        resIa = await AmbientalAPI.ai.preencherFicha(reqBody);
      } else {
        const token = (typeof AmbientalAuth !== 'undefined') ? await AmbientalAuth.getAccessToken().catch(()=>null) : null;
        const r = await fetch("/api/ai/preencher-ficha", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
          body: JSON.stringify(reqBody)
        });
        resIa = await r.json();
      }
      dados = resIa?.dados || resIa;
    }

    if (transcricao) {
      const box = $("gravadorVozResultadoBox");
      const txtBox = $("gravadorVozTranscricaoTexto");
      if (box && txtBox) {
        txtBox.textContent = transcricao;
        box.style.display = "block";
      }
      const txtBruto = $("txtPreenchimentoIABruto");
      if (txtBruto) txtBruto.value = transcricao;
    }

    if (dados && Object.keys(dados).length > 0) {
      aplicarPreenchimentoIAResultado(dados);
      toast("✨ Ditado médico transcrito e ficha preenchida via Gemini 3.8 Flash!");
    } else if (transcricao) {
      toast("📝 Áudio transcrito com sucesso! Revise o texto.");
    }

    setTimeout(() => {
      fecharModalGravadorVozIA();
    }, 1200);

  } catch (err) {
    console.error("Erro na transcrição e estruturação do áudio:", err);
    alert("Não foi possível processar o áudio com IA: " + (err.message || "Erro de conexão."));
  } finally {
    if (loading) loading.style.display = "none";
    if (btnProcessar) btnProcessar.disabled = false;
  }
}

/* =========================================================
   BENCHMARK CLÍNICO E LIMITES DPME / JUNTA MÉDICA
   ========================================================= */
async function consultarBenchmarkCID(cidParam) {
  const cidCode = String(cidParam || $("cid")?.value || "").trim().toUpperCase();
  if (!cidCode) {
    alert("Informe um código CID no campo antes de consultar os parâmetros.");
    return;
  }

  const box = $("cidBenchmarkBox");
  const btn = $("btnBenchmarkCID");
  if (btn) btn.disabled = true;

  try {
    let res;
    if (window.AmbientalAPI?.ai?.benchmarkCid) {
      res = await AmbientalAPI.ai.benchmarkCid(cidCode);
    } else {
      const r = await fetch(`/api/ai/benchmark-cid/${encodeURIComponent(cidCode)}`);
      res = await r.json();
      if (!r.ok) throw new Error(res?.detail || "Falha ao consultar parâmetros.");
    }

    ultimoBenchmarkCidCarregado = res?.data || res;
    const b = ultimoBenchmarkCidCarregado;

    if (box) {
      box.style.display = "block";
      if ($("cidBenchmarkPill")) $("cidBenchmarkPill").textContent = b.cid || cidCode;
      if ($("cidBenchmarkNome")) $("cidBenchmarkNome").textContent = b.descricao || "Descrição não cadastrada";
      if ($("cidBenchmarkGrupo")) $("cidBenchmarkGrupo").textContent = b.grupo || "Capítulo clínico padrão";
      if ($("cidBenchmarkMedia")) $("cidBenchmarkMedia").textContent = b.dias_medio ? `${b.dias_medio} dias` : "—";
      if ($("cidBenchmarkFaixa")) $("cidBenchmarkFaixa").textContent = b.faixa_usual || "—";
      if ($("cidBenchmarkJunta")) $("cidBenchmarkJunta").textContent = b.limite_junta_medica ? `${b.limite_junta_medica} dias` : "Critério pericial";
      if ($("cidBenchmarkEsp")) $("cidBenchmarkEsp").textContent = b.especialidade || "Medicina Pericial";
      
      const infoEl = $("cidBenchmarkInfo");
      if (infoEl) {
        let txtInfo = `<strong>Diretrizes Clínico-Periciais DPME/SP:</strong> `;
        if (b.diretrizes) txtInfo += `${b.diretrizes} `;
        if (b.regras_dpme && b.regras_dpme.length) {
          txtInfo += `<br>• ${b.regras_dpme.join('<br>• ')}`;
        }
        infoEl.innerHTML = txtInfo;
      }
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    console.error("Erro ao consultar benchmark:", err);
    alert("Não foi possível consultar os parâmetros do CID: " + (err.message || "Erro de conexão."));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function aplicarBenchmarkJustificativa() {
  if (!ultimoBenchmarkCidCarregado) return;
  const b = ultimoBenchmarkCidCarregado;
  const justEl = $("justificativa") || $("parecerJustificativa");
  if (!justEl) return;

  const textoBenchmark = `[Parâmetros de Referência DPME/SP - CID ${b.cid}]: Faixa usual de afastamento: ${b.faixa_usual || 'critério pericial'} (média de ${b.dias_medio || '—'} dias). Limite para convocação em Junta Médica: ${b.limite_junta_medica ? b.limite_junta_medica + ' dias' : 'avaliação singular'}. Especialidade de referência: ${b.especialidade || 'Clínica Médica'}.`;

  const anterior = (justEl.value || "").trim();
  if (anterior.includes(`CID ${b.cid}`)) {
    toast("Os parâmetros deste CID já estão presentes na Justificativa.");
    return;
  }

  justEl.value = anterior ? `${anterior}\n\n${textoBenchmark}` : textoBenchmark;
  justEl.dispatchEvent(new Event("input", { bubbles: true }));
  toast("⚖️ Parâmetros de referência e diretrizes DPME inseridos na Justificativa (Etapa 8)!");
}

window.abrirModalGravadorVozIA = abrirModalGravadorVozIA;
window.fecharModalGravadorVozIA = fecharModalGravadorVozIA;
window.alternarGravacaoVozIA = alternarGravacaoVozIA;
window.descartarGravacaoVozIA = descartarGravacaoVozIA;
window.aoSelecionarArquivoAudio = aoSelecionarArquivoAudio;
window.processarAudioGravadoIA = processarAudioGravadoIA;
window.consultarBenchmarkCID = consultarBenchmarkCID;
window.aplicarBenchmarkJustificativa = aplicarBenchmarkJustificativa;

/* =========================================================
   IMPORTAÇÃO DIRETA DE CONSULTA E-SISLA (PDF / DADOS)
   ========================================================= */
function aplicarDadosEsisla(dados) {
  if (!dados) return;
  if (!state.aux) state.aux = {};

  const prevAutoSaving = typeof __isAutoSaving !== "undefined" ? __isAutoSaving : false;
  window.__isAutoSaving = true;
  window.__isBulkApplyingIA = true;

  try {
    state.workflowStatus = "RASCUNHO";
    state.finalizado = false;

    const toIsoDate = (dStr) => {
      if (!dStr) return "";
      const s = String(dStr).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return s;
    };

    const toFormattedCpf = (cStr) => {
      const clean = String(cStr || "").replace(/\D/g, "");
      if (clean.length === 11 && typeof formatCPF === "function") return formatCPF(clean);
      return cStr || "";
    };

    // 1. Identificação
    if (dados.nome_paciente) {
      state.nomePaciente = dados.nome_paciente;
      state.aux.nomePaciente = dados.nome_paciente;
      if ($("nomePaciente")) $("nomePaciente").value = dados.nome_paciente;
      if ($("agilNomePaciente")) $("agilNomePaciente").value = dados.nome_paciente;
    }

    if (dados.cpf_paciente) {
      const formattedCpf = toFormattedCpf(dados.cpf_paciente);
      state.cpfPaciente = formattedCpf;
      state.aux.cpfPaciente = formattedCpf;
      if ($("cpfPaciente")) $("cpfPaciente").value = formattedCpf;
      if ($("agilCpfPaciente")) $("agilCpfPaciente").value = formattedCpf;
    }

    if (dados.rg_paciente) state.aux.rg = dados.rg_paciente;
    if (dados.data_nascimento) state.aux.dataNascimento = dados.data_nascimento;
    if (dados.sexo) state.aux.sexo = dados.sexo;
    if (dados.ni) state.aux.ni = dados.ni;

    if (dados.cargo) {
      state.cargo = dados.cargo;
      state.aux.cargo = dados.cargo;
      if ($("cargo")) $("cargo").value = dados.cargo;
      if ($("agilCargo")) $("agilCargo").value = dados.cargo;
    }

    if (dados.idade) {
      state.idade = String(dados.idade);
      state.aux.idade = String(dados.idade);
      if ($("idade")) $("idade").value = dados.idade;
      if ($("agilIdade")) $("agilIdade").value = dados.idade;
    }

    if (dados.readaptado) {
      const rVal = dados.readaptado.toLowerCase().includes("sim") ? "Sim" : "Não";
      state.readaptado = rVal;
      state.aux.readaptado = rVal;
      setRadio("readaptado", rVal);
      setRadio("agilReadaptado", rVal);
      if ($("readaptadoPanel")) $("readaptadoPanel").classList.toggle("hidden", rVal !== "Sim");
      if ($("agilReadaptadoPanel")) $("agilReadaptadoPanel").classList.toggle("hidden", rVal !== "Sim");
    }

    // 2. Funcional & Órgão
    if (dados.orgao) state.aux.orgao = dados.orgao;
    if (dados.unidade) { state.aux.unidade = dados.unidade; state.aux.ua = dados.unidade; }
    if (dados.municipio) state.aux.municipio = dados.municipio;
    if (dados.regime_juridico) state.aux.regimeJuridico = dados.regime_juridico;
    if (dados.situacao) state.aux.situacao = dados.situacao;
    if (dados.protocolo) { state.aux.protocolo = dados.protocolo; state.aux.agenda_protocolo = dados.protocolo; }

    // 3. CID e Acompanhante / Familiar (Art. 199 Lei Estadual 10.261/68)
    const isAcomp = !!(dados.is_acompanhante || (dados.pessoa && !dados.pessoa.toUpperCase().includes("PRÓPRIO") && !dados.pessoa.toUpperCase().includes("PROPRIO")));
    if (isAcomp) {
      state.isAcompanhante = true;
      state.aux.isAcompanhante = true;
      state.pessoa = dados.pessoa || "";
      state.aux.pessoa = dados.pessoa || "";
      state.nomeDependente = dados.nome_dependente || "";
      state.aux.nomeDependente = dados.nome_dependente || "";

      // O primeiro CID de perícia de acompanhante no e-SISLA é SEMPRE Z763
      const cidAcomp = "Z763";
      state.cid = cidAcomp;
      state.aux.cid = cidAcomp;
      if ($("cid")) $("cid").value = cidAcomp;
      if ($("agilCid")) $("agilCid").value = cidAcomp;
      if (typeof selectAgilCID === "function") selectAgilCID(cidAcomp);
      else if (typeof selectCID === "function") selectCID(cidAcomp);

      // Preserva a enfermidade do familiar nos CIDs secundários
      if (Array.isArray(dados.cids_secundarios) && dados.cids_secundarios.length > 0) {
        state.cidsSecundarios = [...dados.cids_secundarios];
      } else if (dados.cid && dados.cid !== "Z763") {
        state.cidsSecundarios = [{ cid: dados.cid, descricao: dados.cid_descricao || '' }];
      }

      state.doencaMotivo = `Perícia de acompanhante de familiar enfermo (Art. 199 da Lei Estadual nº 10.261/68) — Dependente: ${dados.nome_dependente || "Familiar"}`;
      state.aux.doencaMotivo = state.doencaMotivo;
      if ($("doencaMotivo")) $("doencaMotivo").value = state.doencaMotivo;
      if ($("agilDoencaMotivo")) $("agilDoencaMotivo").value = state.doencaMotivo;

      if (typeof atualizarBannerAcompanhante === "function") atualizarBannerAcompanhante();
    } else {
      state.isAcompanhante = false;
      state.aux.isAcompanhante = false;
      if (typeof atualizarBannerAcompanhante === "function") atualizarBannerAcompanhante();

      if (dados.cid) {
        state.cid = dados.cid;
        state.aux.cid = dados.cid;
        if ($("cid")) $("cid").value = dados.cid;
        if ($("agilCid")) $("agilCid").value = dados.cid;
        if (typeof selectAgilCID === "function") selectAgilCID(dados.cid);
        else if (typeof selectCID === "function") selectCID(dados.cid);
      }
    }

    if (dados.crm_cro) {
      state.aux.crmCro = dados.crm_cro;
      if ($("crmCro")) $("crmCro").value = dados.crm_cro;
      if ($("agilCrmCro")) $("agilCrmCro").value = dados.crm_cro;
    }

    if (dados.nome_medico_assistente) state.aux.medicoAssistenteNome = dados.nome_medico_assistente;

    const isoExp = toIsoDate(dados.data_expedicao_iso || dados.data_expedicao);
    if (isoExp) {
      state.aux.dataExpedicao = dados.data_expedicao || isoExp;
      state.aux.dataExpedicaoIso = isoExp;
      state.dataExpedicao = dados.data_expedicao || isoExp;
      if ($("dataExpedicao")) $("dataExpedicao").value = isoExp;
      if ($("agilDataExpedicao")) $("agilDataExpedicao").value = isoExp;
    } else if (dados.data_expedicao) {
      state.aux.dataExpedicao = dados.data_expedicao;
      state.dataExpedicao = dados.data_expedicao;
    }

    const isoDoc = toIsoDate(dados.data_documento || dados.data_documento_br);
    if (isoDoc) {
      state.aux.dataDocumento = isoDoc;
      if ($("dataDocumento")) $("dataDocumento").value = isoDoc;
      if ($("agilDataDocumento")) $("agilDataDocumento").value = isoDoc;
    }

    if (dados.dias_solicitados) {
      const diasVal = String(dados.dias_solicitados);
      state.aux.diasSolicitados = diasVal;
      state.aux.diasConcedidos = diasVal;
      if ($("diasSolicitados")) $("diasSolicitados").value = diasVal;
      if ($("agilDiasSolicitados")) $("agilDiasSolicitados").value = diasVal;
    }

    // Abrir o subpainel de atestado do assistente e calcular as datas
    const chk = $("agilCheckAtestadoAssistente");
    if (chk) {
      chk.checked = true;
      if (typeof toggleAtestadoAssistente === "function") toggleAtestadoAssistente(true);
      if (typeof calcularDatasAtestado === "function") calcularDatasAtestado();
    }

    // 4. Histórico de licença e motivo
    if (dados.motivo_pericia) state.aux.motivoPericia = dados.motivo_pericia;
    if (dados.tipo_pericia) state.aux.tipoPericia = dados.tipo_pericia;
    if (dados.finalidade) state.aux.finalidade = dados.finalidade;
    if (dados.ultima_licenca_dias) state.aux.ultimaLicencaDias = dados.ultima_licenca_dias;
    if (dados.ultima_licenca_inicio) state.aux.ultimaLicencaInicio = dados.ultima_licenca_inicio;
    if (dados.ultima_licenca_fim) state.aux.ultimaLicencaFim = dados.ultima_licenca_fim;

    // Doença motivo (apenas para acompanhante art. 199; para periciado titular, mantém limpo para o relato clínico)
    if (isAcomp && dados.doenca_motivo) {
      state.doencaMotivo = dados.doenca_motivo;
      state.aux.doencaMotivo = dados.doenca_motivo;
      if ($("doencaMotivo")) $("doencaMotivo").value = dados.doenca_motivo;
      if ($("agilDoencaMotivo")) $("agilDoencaMotivo").value = dados.doenca_motivo;
    }

    // 5. Configurar parecer ou limpar campos clínicos conforme regra de retroação DPME
    state.exameFisicoTipo = "";
    state.exameFisicoDescricao = "";
    state.exameMentalResultado = "";
    state.alteracoesClinicasExames = "";
    state.limitacoes = "";
    state.descLimitacao = "";
    state.outrosSubtipo = "";
    state.outrosResultado = "";
    state.areaExameClinico = "";
    if (state.aux) {
      state.aux.exameFisicoTipo = "";
      state.aux.exameFisicoDescricao = "";
      state.aux.exameMentalResultado = "";
      state.aux.alteracoesClinicasExames = "";
      state.aux.descLimitacao = "";
      state.aux.outrosSubtipo = "";
      state.aux.outrosResultado = "";
    }
    if ($("exameFisicoTipo")) $("exameFisicoTipo").value = "";
    if ($("agilExameFisicoTipo")) $("agilExameFisicoTipo").value = "";
    if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = "";
    if ($("agilExameFisicoDescricao")) $("agilExameFisicoDescricao").value = "";
    if ($("exameMentalResultado")) $("exameMentalResultado").value = "";
    if ($("agilExameMentalResultado")) $("agilExameMentalResultado").value = "";
    if ($("outrosSubtipo")) $("outrosSubtipo").value = "";
    if ($("agilOutrosSubtipo")) $("agilOutrosSubtipo").value = "";
    if ($("agilOutrosSelector")) $("agilOutrosSelector").style.display = "none";
    if ($("agilMentalWrap")) $("agilMentalWrap").style.display = "none";
    if ($("agilOsteoWrap")) $("agilOsteoWrap").style.display = "none";
    if ($("agilOutrosWrap")) $("agilOutrosWrap").style.display = "none";
    if ($("btnIaJustificativa")) $("btnIaJustificativa").style.display = "none";

    // Regra DPME: Se a retroação entre Local e Data da Expedição e Data de Emissão for > 3 dias, definir Parecer CONTRÁRIO mantendo limitações favoráveis
    const isRetroInvalida = Boolean(dados.retroacao_invalida || (dados.retroacao_dias && dados.retroacao_dias > 3));
    if (isRetroInvalida) {
      const retroJust = dados.justificativa || "Guia com mais de 3 dias de retroação, não havendo comprovação de internamento hospitalar ou impedimento absoluto do servidor para emissão da guia, ensejando parecer CONTRÁRIO.";
      state.parecer = "CONTRÁRIO";
      state.justificativa = retroJust;
      state.retroacaoInvalida = true;
      state.retroacaoDias = dados.retroacao_dias;
      if (!state.aux) state.aux = {};
      state.aux.parecer = "CONTRÁRIO";
      state.aux.justificativa = retroJust;
      state.aux.retroacaoInvalida = true;
      state.aux.retroacaoDias = dados.retroacao_dias;
      if ($("parecer")) $("parecer").value = "CONTRÁRIO";
      if ($("agilParecer")) $("agilParecer").value = "CONTRÁRIO";
      setRadio("parecer", "CONTRÁRIO");
      setRadio("agilParecer", "CONTRÁRIO");
      if ($("justificativa")) $("justificativa").value = retroJust;
      if ($("agilJustificativa")) $("agilJustificativa").value = retroJust;
      state.limitacaoFuncional = "Sim";
      state.limitacaoRol = "Sim";
      setRadio("limitacaoFuncional", "Sim");
      setRadio("limitacaoRol", "Sim");
      if (typeof QuesitoService !== "undefined") {
        QuesitoService.set(0, "Sim");
        QuesitoService.set(1, "Sim");
        QuesitoService.set(2, "Sim");
        if (typeof renderQuesitos === "function") renderQuesitos();
      }
    } else {
      state.parecer = "";
      state.justificativa = "";
      if (state.aux) {
        state.aux.parecer = "";
        state.aux.justificativa = "";
      }
      if ($("justificativa")) $("justificativa").value = "";
      if ($("agilJustificativa")) $("agilJustificativa").value = "";
      if ($("parecer")) $("parecer").value = "";
      if ($("agilParecer")) $("agilParecer").value = "";
    }

    syncExtendedToAgil();
    applyState();
    autoSave();
  } finally {
    window.__isAutoSaving = prevAutoSaving;
    window.__isBulkApplyingIA = false;
  }
}

function atualizarBannerAcompanhante() {
  const b = $("bannerAcompanhantePericia");
  const isAcomp = !!(state.isAcompanhante || state.aux?.isAcompanhante || state.cid === "Z763" || state.aux?.cid === "Z763");
  if (!b) return;
  if (isAcomp) {
    b.style.display = "block";
    const txt = $("bannerAcompanhanteDependenteTexto");
    const depNome = state.nomeDependente || state.aux?.nomeDependente || state.pessoa || "Familiar";
    if (txt) {
      txt.innerHTML = `Dependente em tratamento: <strong>${esc(depNome)}</strong>`;
    }
  } else {
    b.style.display = "none";
  }
}

function aplicarModeloTextoAcompanhante() {
  const depNome = state.nomeDependente || state.aux?.nomeDependente || state.pessoa || "familiar dependente";
  
  // 1. Exame físico geral padrão para servidor hígido acompanhante
  const efTexto = "Servidor(a) em bom estado geral, lúcido(a), orientado(a) no tempo e espaço, eupneico(a), corado(a), hidratado(a), acianótico(a), sem sinais de descompensação clínica ou alterações psicomotoras. Exame físico geral sem anormalidades incapacitantes, encontrando-se apto(a) física e psiquicamente para exercer os cuidados e assistência necessária ao familiar.";
  
  state.exameFisicoTipo = "Outros";
  state.outrosSubtipo = "Exame Físico Geral";
  state.outrosResultado = "Normal";
  state.exameFisicoDescricao = efTexto;
  if (!state.aux) state.aux = {};
  state.aux.exameFisicoTipo = "Outros";
  state.aux.outrosSubtipo = "Exame Físico Geral";
  state.aux.outrosResultado = "Normal";
  state.aux.exameFisicoDescricao = efTexto;

  if ($("agilExameFisicoTipo")) $("agilExameFisicoTipo").value = "Outros";
  if ($("exameFisicoTipo")) $("exameFisicoTipo").value = "Outros";
  if ($("agilExameFisicoDescricao")) $("agilExameFisicoDescricao").value = efTexto;
  if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = efTexto;
  
  if (typeof renderOutrosUI === "function") renderOutrosUI();

  // 2. Parecer e Justificativa DPME
  const justTexto = `Perícia médica oficial para acompanhamento de familiar/dependente enfermo, com fundamento jurídico no Artigo 199 da Lei Estadual nº 10.261/1968. Comprovada a necessidade de assistência direta e indispensável ao(à) dependente ${depNome}, que se encontra sob cuidados médicos documentados em relatório assistencial anexado aos autos. O(A) servidor(a) encontra-se em plenas condições de saúde (CID Z76.3). Parecer favorável à concessão de licença por motivo de doença em pessoa da família pelo período solicitado.`;
  
  state.parecer = "FAVORÁVEL";
  state.justificativa = justTexto;
  state.aux.parecer = "FAVORÁVEL";
  state.aux.justificativa = justTexto;

  if ($("parecer")) $("parecer").value = "FAVORÁVEL";
  if ($("agilParecer")) $("agilParecer").value = "FAVORÁVEL";
  setRadio("parecer", "FAVORÁVEL");
  if ($("justificativa")) $("justificativa").value = justTexto;
  if ($("agilJustificativa")) $("agilJustificativa").value = justTexto;

  // 3. Respostas aos quesitos e limitações (Lei 10.261/68 - Acompanhante)
  state.quesitos = [
    { numero: 1, pergunta: "1) Há doença(s) ou seqüela(s) decorrente(s) de acidente de trabalho?", resposta: "Sim" },
    { numero: 2, pergunta: "2) A(s) doença(s) ou seqüela(s) determina(m) limitação funcional?", resposta: "Não" },
    { numero: 3, pergunta: "3) A(s) limitação(ões) impede(m) o exercício das funções habituais do cargo?", resposta: "Sim" }
  ];
  state.limitacaoFuncional = "Não";
  state.limitacaoRol = "Não";
  setRadio("limitacaoFuncional", "Não");
  setRadio("limitacaoRol", "Não");
  const limTexto = `Servidor(a) hígido(a), sem limitação funcional própria. Necessidade de afastamento temporário decorrente da assistência imprescindível ao(à) dependente ${depNome} sob tratamento (art. 199 da Lei Estadual nº 10.261/68).`;
  state.descLimitacao = limTexto;
  state.aux.descLimitacao = limTexto;
  if ($("descLimitacao")) $("descLimitacao").value = limTexto;
  if (typeof renderQuesitos === "function") renderQuesitos();

  autoSave();
  toast("✅ Modelos de laudo pericial para acompanhante aplicados com sucesso!");
}

window.aplicarDadosEsisla = aplicarDadosEsisla;

window.processarArquivoEsislaNaTela = async function(file) {
  if (!file) return;
  const loading = $("aiPreencherLoading");
  if (loading) {
    loading.style.display = "flex";
    const strong = loading.querySelector("strong");
    if (strong) strong.textContent = "Lendo e processando arquivo PDF do e-SISLA...";
  }

  try {
    const formData = new FormData();
    formData.append("file", file);

    let res;
    if (window.AmbientalAPI?.esisla?.parsePdf) {
      res = await AmbientalAPI.esisla.parsePdf(formData);
    } else {
      const r = await (window.AmbientalAuth ? window.AmbientalAuth.authFetch : fetch)("/api/esisla/parse-pdf", {
        method: "POST", body: formData
      });
      res = await r.json();
      if (!r.ok) throw new Error(res?.error?.message || res?.detail || "Erro ao processar arquivo do e-SISLA.");
    }

    const dados = res.data?.dados || res.dados;
    if (!dados) throw new Error("Nenhum dado retornado do documento.");

    aplicarDadosEsisla(dados);
    fecharModalPreenchimentoIA();
    toast(`📄 e-SISLA importado: ${dados.nome_paciente || 'Colaborador'} (CID ${dados.cid || '—'})`);
  } catch (err) {
    alert(err.message || "Não foi possível importar o arquivo do e-SISLA.");
  } finally {
    if (loading) loading.style.display = "none";
  }
};

// Setup global window drag-and-drop para arquivos PDF do e-SISLA
(function setupEsislaWindowDrop() {
  let dragCounter = 0;
  const getOverlay = () => document.getElementById("esislaGlobalDragOverlay");

  window.addEventListener("dragenter", (e) => {
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      dragCounter++;
      const ov = getOverlay();
      if (ov) ov.style.display = "flex";
    }
  });

  window.addEventListener("dragleave", (e) => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      const ov = getOverlay();
      if (ov) ov.style.display = "none";
    }
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    const ov = getOverlay();
    if (ov) ov.style.display = "none";
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        if (typeof window.processarArquivoEsislaNaTela === "function") {
          window.processarArquivoEsislaNaTela(file);
        }
      }
    }
  });

  const wireDropzone = () => {
    const dz = document.getElementById("dropzoneEsislaModal");
    if (dz && !dz.__wired) {
      dz.__wired = true;
      dz.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.style.background = "#E0F2FE";
        dz.style.borderColor = "#0284C7";
      });
      dz.addEventListener("dragleave", () => {
        dz.style.background = "#F0F9FF";
        dz.style.borderColor = "#3B82F6";
      });
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.style.background = "#F0F9FF";
        dz.style.borderColor = "#3B82F6";
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          if (typeof window.processarArquivoEsislaNaTela === "function") {
            window.processarArquivoEsislaNaTela(files[0]);
          }
        }
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDropzone);
  } else {
    wireDropzone();
  }
})();

function detectarTodasRegioesOsteomusculares(cid, textoBruto, doencaMotivo, exameDesc, cidsSecundarios) {
  const secStr = Array.isArray(cidsSecundarios)
    ? cidsSecundarios.map(x => typeof x === "object" ? (x.cid || x.codigo || "") : String(x || "")).join(" ")
    : "";
  const combined = `${cid || ""} ${secStr} ${textoBruto || ""} ${doencaMotivo || ""} ${exameDesc || ""}`.toLowerCase();
  const cidsAll = [String(cid || "").toUpperCase().trim()]
    .concat(Array.isArray(cidsSecundarios) ? cidsSecundarios.map(x => (typeof x === "object" ? (x.cid || x.codigo || "") : String(x || "")).toUpperCase().trim()) : []);

  const isEsqGlobal = /\b(?:esquerdo|esquerda|esq|membro\s+inferior\s+esquerdo|membro\s+superior\s+esquerdo|mie|mse)\b/i.test(combined);
  const isDirGlobal = /\b(?:direito|direita|dir|membro\s+inferior\s+direito|membro\s+superior\s+direito|mid|msd)\b/i.test(combined);

  function checkSides(patternStr) {
    const rx = new RegExp(`(?:${patternStr})[^\\.\\n\\r]{0,60}\\b(esquerd[oa]|esq|mse|mie|direit[oa]|dir|msd|mid|bilateral)\\b|\\b(esquerd[oa]|esq|mse|mie|direit[oa]|dir|msd|mid|bilateral)\\b[^\\.\\n\\r]{0,60}(?:${patternStr})`, "i");
    const m = combined.match(rx);
    if (m) {
      const s = (m[1] || m[2] || "").toLowerCase();
      if (s.includes("bilateral") || (s.includes("esq") && s.includes("dir"))) return ["esquerdo", "direito"];
      if (s.includes("esq") || s.includes("mse") || s.includes("mie")) return ["esquerdo"];
      if (s.includes("dir") || s.includes("msd") || s.includes("mid")) return ["direito"];
    }
    if (isEsqGlobal && !isDirGlobal) return ["esquerdo"];
    if (isDirGlobal && !isEsqGlobal) return ["direito"];
    if (isEsqGlobal && isDirGlobal) return ["esquerdo", "direito"];
    return ["direito"];
  }

  const regioes = [];

  // 1. Mão / Dedos / Síndrome do Túnel do Carpo / Quirodáctilos
  const hasMaoCid = cidsAll.some(c => c.startsWith("G56.0") || c.startsWith("M65.3") || c.startsWith("M18"));
  const hasMaoTxt = /\b(?:m[ãa]o|m[ãa]os|dedo|dedos|quirod[áa]ctilo|quirod[áa]ctilos|palmar|polegar|t[úu]nel\s+do\s+carpo|canal\s+c[áa]rpico|carpo|tinel|phalen|digita[çc][ãa]o|digitar|teclado|preens[ãa]o|gatilho)\b/i.test(combined);
  if (hasMaoCid || hasMaoTxt) {
    checkSides('m[ãa]o|m[ãa]os|dedo|dedos|punho|punhos|carpo|tinel|phalen|quirod[áa]ctilo|digita[çc][ãa]o|digitar').forEach(s => {
      const rName = s === "esquerdo" ? "mao_esquerda" : "mao_direita";
      if (!regioes.includes(rName)) regioes.push(rName);
    });
  }

  // 2. Cotovelo / Epicondilite
  const hasCotCid = cidsAll.some(c => c.startsWith("M77.0") || c.startsWith("M77.1") || c.startsWith("M77.2"));
  const hasCotTxt = /\b(?:cotovelo|epicondilite|epic[ôo]ndilo|cozen|mill)\b/i.test(combined);
  if (hasCotCid || hasCotTxt) {
    checkSides('cotovelo|epicondilite|epic[ôo]ndilo|cozen').forEach(s => {
      const rName = s === "esquerdo" ? "cotovelo_esquerdo" : "cotovelo_direito";
      if (!regioes.includes(rName)) regioes.push(rName);
    });
  }

  // 3. Ombro / Manguito rotador
  const hasOmbCid = cidsAll.some(c => c.startsWith("M75"));
  const hasOmbTxt = /\b(?:ombro|ombros|manguito|supraespinhal|supraespinhoso|bicipital|escapul[ao]r|neer|jobe|hawkins)\b/i.test(combined);
  if (hasOmbCid || hasOmbTxt) {
    checkSides('ombro|ombros|manguito|supraespinhal|supraespinhoso|bicipital|escapul[ao]r').forEach(s => {
      const rName = s === "esquerdo" ? "ombro_esquerdo" : "ombro_direito";
      if (!regioes.includes(rName)) regioes.push(rName);
    });
  }

  // 4. Antebraço / Punho (não-carpo / De Quervain)
  const hasAntCid = cidsAll.some(c => c.startsWith("M65.4"));
  const hasAntTxt = /\b(?:antebraco|antebra[çc]o|de\s+quervain|estil[oó]ide|estiloide)\b/i.test(combined);
  if (hasAntCid || hasAntTxt) {
    checkSides('antebraco|antebra[çc]o|de\s+quervain').forEach(s => {
      const rName = s === "esquerdo" ? "antebraco_esquerdo" : "antebraco_direito";
      if (!regioes.includes(rName)) regioes.push(rName);
    });
  }

  // 5. Coluna Lombar / Lombociatalgia
  const hasLomCid = cidsAll.some(c => c.startsWith("M54.4") || c.startsWith("M54.5") || c.startsWith("M51") || c.startsWith("M48") || c.startsWith("M43") || c.startsWith("M47"));
  const hasLomTxt = /\b(?:lombar|lombociatalgia|lumbago|dorsolombalgia|ci[áa]tico|ci[áa]tica|l4|l5|s1|paravertebral\s+lombar|las[èe]gue)\b/i.test(combined);
  if (hasLomCid || hasLomTxt) {
    if (!regioes.includes("lombar")) regioes.push("lombar");
  }

  // 6. Cervical
  const hasCerCid = cidsAll.some(c => c.startsWith("M54.2") || c.startsWith("M50") || c.startsWith("M53.0") || c.startsWith("M53.1"));
  const hasCerTxt = /\b(?:cervical|cervicobraquialgia|pesco[çc]o|trap[ée]zio|c5|c6|c7)\b/i.test(combined);
  if (hasCerCid || hasCerTxt) {
    if (!regioes.includes("cervical")) regioes.push("cervical");
  }

  // 7. Quadril
  const hasQuaCid = cidsAll.some(c => c.startsWith("M16") || c.startsWith("M70.6") || c.startsWith("M76.0"));
  const hasQuaTxt = /\b(?:quadril|coxartrose|coxofemoral|troc[âa]nter|bursite\s+trocant[ée]rica)\b/i.test(combined);
  if (hasQuaCid || hasQuaTxt) {
    if (!regioes.includes("quadril")) regioes.push("quadril");
  }

  // 8. Joelho
  const hasJoeCid = cidsAll.some(c => c.startsWith("M17") || c.startsWith("M22") || c.startsWith("M23"));
  const hasJoeTxt = /\b(?:joelho|gonartrose|menisco|patelar|ligamento\s+cruzado|lca)\b/i.test(combined);
  if (hasJoeCid || hasJoeTxt) {
    checkSides('joelho|menisco|patelar|gonartrose').forEach(s => {
      const rName = s === "esquerdo" ? "joelho_esquerdo" : "joelho_direito";
      if (!regioes.includes(rName)) regioes.push(rName);
    });
  }

  // 9. Tornozelo / Pé
  const hasTorCid = cidsAll.some(c => c.startsWith("M72.2") || c.startsWith("M76.6") || c.startsWith("M77.3"));
  const hasTorTxt = /\b(?:tornozelo|p[ée]|fascite\s+plantar|calc[âa]neo|aquileu)\b/i.test(combined);
  if (hasTorCid || hasTorTxt) {
    checkSides('tornozelo|p[ée]|fascite|calc[âa]neo').forEach(s => {
      const rName = s === "esquerdo" ? "tornozelo_esquerdo" : "tornozelo_direito";
      if (!regioes.includes(rName)) regioes.push(rName);
    });
  }

  if (regioes.length === 0) regioes.push("lombar");
  return regioes;
}

function detectarRegiaoOsteomuscular(cid, textoBruto, doencaMotivo, exameDesc, cidsSecundarios) {
  const all = detectarTodasRegioesOsteomusculares(cid, textoBruto, doencaMotivo, exameDesc, cidsSecundarios);
  return all[0] || "lombar";
}

function aplicarPreenchimentoIAResultado(dados) {
  if (!dados) return;
  if (!state.aux) state.aux = {};

  // Travar autoSave temporariamente durante o preenchimento em lote para evitar race conditions / wipes
  const prevAutoSaving = typeof __isAutoSaving !== "undefined" ? __isAutoSaving : false;
  window.__isAutoSaving = true;
  window.__isBulkApplyingIA = true;

  try {
    // 1. Status do atendimento
    state.workflowStatus = "RASCUNHO";
    state.finalizado = false;

    // Helper para converter data para YYYY-MM-DD (compatível com input[type="date"])
    const toIsoDate = (dStr) => {
      if (!dStr) return "";
      const s = String(dStr).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
      if (m) {
        return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      }
      return s;
    };

    // Helper para formatar CPF
    const toFormattedCpf = (cStr) => {
      const clean = String(cStr || "").replace(/\D/g, "");
      if (clean.length === 11 && typeof formatCPF === "function") {
        return formatCPF(clean);
      }
      return cStr || "";
    };

    // Helper para normalizar unidade de tempo
    const toTempoUnidade = (uStr) => {
      const s = String(uStr || "").trim().toLowerCase();
      if (/^m/i.test(s)) return "Meses";
      if (/^d/i.test(s)) return "Dias";
      return "Anos";
    };

    // 2. Normalização de Dados Principais (preserva dados cadastrais oficiais do e-SISLA se já preenchidos)
    const esislaNome = (state.nomePaciente || state.aux?.nomePaciente || $("nomePaciente")?.value || "").trim();
    state.nomePaciente = esislaNome || dados.nome_paciente || state.nomePaciente || "";

    const esislaCpf = (state.cpfPaciente || state.aux?.cpfPaciente || $("cpfPaciente")?.value || "").trim();
    state.cpfPaciente = esislaCpf ? toFormattedCpf(esislaCpf) : (toFormattedCpf(dados.cpf_paciente) || state.cpfPaciente || "");

    const esislaCargo = (state.cargo || state.aux?.cargo || $("cargo")?.value || "").trim();
    state.cargo = esislaCargo || dados.cargo || state.cargo || "";

    const esislaTempoCargo = (state.tempoCargo || state.aux?.tempoCargo || $("tempoCargo")?.value || "").trim();
    state.tempoCargo = esislaTempoCargo || ((dados.tempo_cargo !== undefined && dados.tempo_cargo !== null && String(dados.tempo_cargo).trim()) ? String(dados.tempo_cargo) : (state.tempoCargo || ""));

    const esislaTempoUnidade = (state.tempoUnidade || state.aux?.tempoUnidade || $("tempoUnidade")?.value || "").trim();
    state.tempoUnidade = esislaTempoUnidade ? toTempoUnidade(esislaTempoUnidade) : toTempoUnidade(dados.tempo_unidade || state.tempoUnidade);

    const esislaIdade = (state.idade || state.aux?.idade || $("idade")?.value || "").trim();
    state.idade = esislaIdade || ((dados.idade !== undefined && dados.idade !== null && String(dados.idade).trim()) ? String(dados.idade) : (state.idade || ""));

    const esislaSexo = state.sexo || state.aux?.sexo;
    state.sexo = esislaSexo || dados.sexo || state.sexo || "Feminino";

    const esislaReadaptado = (state.readaptado || state.aux?.readaptado || "").trim();
    state.readaptado = esislaReadaptado || dados.readaptado || state.readaptado || "Não";

    state.alteracaoMed = dados.alteracao_med || state.alteracaoMed || "Não";
    state.outrasDoencas = dados.outras_doencas || state.outrasDoencas || "Não";
    const parseBool = (v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "true" || s === "sim" || s === "1") return true;
        if (s === "false" || s === "não" || s === "nao" || s === "0") return false;
      }
      return !!v;
    };

    const obsTerStr = String(dados.obs_terapias || dados.obsTerapias || "").toLowerCase();
    const rawTxtStr = String(dados.texto_bruto || dados.texto || $("txtPreenchimentoIABruto")?.value || $("ia2EscritaText")?.value || $("ia2GravacaoTranscricao")?.value || window.__ia2UltimoTextoProcessado || "").toLowerCase();

    // 1. Avaliar rawTxtStr (texto original do médico) de forma primária e soberana
    let afirmFisioRaw = /\b(?:iniciou|inicia|iniciando|realiza|realizando|faz|fazendo|t[áa]\s+fazendo|est[áa]\s+fazendo|em|sess[õo]es\s+de|frequenta|frequentando|encaminhad[oa]\s+para|prescrit[oa]|indica[çc][ãa]o\s+de)\s+(?:de\s+)?(?:tratamento\s+de\s+)?(?:fisioterapia|fisio|cinesioterapia)\b|\b(?:fisioterapia|fisio)\s+(?:motora|respirat[óo]ria|analg[ée]sica|[0-9]x|duas|tr[êe]s|semanal|ambulatorial|di[áa]ria)\b/i.test(rawTxtStr) || /\bfaz\s+fisio\b|\bem\s+fisio\b|\brealiza\s+fisio\b/i.test(rawTxtStr);
    let negFisioRaw = /\b(?:nega|n[ãa]o\s+faz|n[ãa]o\s+realiza|n[ãa]o\s+alegou|sem|nunca\s+fez|recusa|n[ãa]o\s+iniciou|parou|suspendeu)\s+(?:de\s+)?(?:fazer\s+|realizar\s+)?(?:tratamento\s+de\s+|acompanhamento\s+de\s+)?(?:fisioterapia|fisio|cinesioterapia|reabilita[çc][ãa]o\s+motora)\b/i.test(rawTxtStr);

    let afirmPsicoRaw = /\b(?:iniciou|inicia|iniciando|realiza|realizando|faz|fazendo|t[áa]\s+fazendo|est[áa]\s+fazendo|em|sess[õo]es\s+de|frequenta|frequentando|encaminhad[oa]\s+para|prescrit[oa]|indica[çc][ãa]o\s+de)\s+(?:de\s+)?(?:tratamento\s+de\s+)?(?:psicoterapia|psico|terapia\s+psicol[óo]gica|psic[oó]log[ao]|acompanhamento\s+psicol[óo]gico)\b|\b(?:psicoterapia|psico)\s+(?:semanal|quinzenal|mensal|[0-9]x|ambulatorial)\b/i.test(rawTxtStr) || /\bfaz\s+psico\b|\bem\s+psico\b|\brealiza\s+psico\b/i.test(rawTxtStr);
    let negPsicoRaw = /\b(?:nega|n[ãa]o\s+faz|n[ãa]o\s+realiza|n[ãa]o\s+alegou|sem|nunca\s+fez|recusa|n[ãa]o\s+iniciou|parou|suspendeu)\s+(?:de\s+)?(?:fazer\s+|realizar\s+)?(?:psicoterapia|psico|psic[oó]log[ao]|terapia\s+psicol[óo]gica|acompanhamento\s+psicol[óo]gico)\b/i.test(rawTxtStr);

    if (/\b(?:nega|n[ãa]o\s+faz|sem)\s+(?:fazer\s+|realizar\s+)?(?:fisioterapia|fisio)\s+(?:e|ou)\s+(?:psicoterapia|psico)\b|\b(?:nega|n[ãa]o\s+faz|sem)\s+(?:fazer\s+|realizar\s+)?(?:psicoterapia|psico)\s+(?:e|ou)\s+(?:fisioterapia|fisio)\b/i.test(rawTxtStr)) {
      negFisioRaw = true;
      negPsicoRaw = true;
    }

    let fisio;
    if (afirmFisioRaw && !negFisioRaw) {
      fisio = true;
    } else if (negFisioRaw) {
      fisio = false;
    } else if (/\bfisio\b|\bfisioterapia\b/i.test(rawTxtStr)) {
      fisio = true;
    } else if (dados.fisioterapia !== undefined && dados.fisioterapia !== null) {
      fisio = parseBool(dados.fisioterapia);
    } else {
      fisio = /\b(?:realiza|faz|em)\s+fisioterapia\b/i.test(obsTerStr) && !/\b(?:nega|n[ãa]o\s+faz|n[ãa]o\s+alegou)\b/i.test(obsTerStr);
    }

    let psico;
    if (afirmPsicoRaw && !negPsicoRaw) {
      psico = true;
    } else if (negPsicoRaw) {
      psico = false;
    } else if (/\bpsico\b|\bpsicoterapia\b|\bpsicólog/i.test(rawTxtStr)) {
      psico = true;
    } else if (dados.psicoterapia !== undefined && dados.psicoterapia !== null) {
      psico = parseBool(dados.psicoterapia);
    } else {
      psico = /\b(?:realiza|faz|em)\s+psicoterapia\b/i.test(obsTerStr) && !/\b(?:nega|n[ãa]o\s+faz|n[ãa]o\s+alegou)\b/i.test(obsTerStr);
    }

    state.psicoterapia = !!psico;
    state.fisioterapia = !!fisio;
    if (!state.aux) state.aux = {};
    state.aux.psicoterapia = !!psico;
    state.aux.fisioterapia = !!fisio;

    const doencaParaPreencher = (dados.doenca_motivo || dados.doencaMotivo || state.doencaMotivo || state.aux?.doencaMotivo || "").trim();
    if (doencaParaPreencher) {
      state.doencaMotivo = doencaParaPreencher;
      if (!state.aux) state.aux = {};
      state.aux.doencaMotivo = doencaParaPreencher;
    }

    const inicioTratParaPreencher = (dados.inicio_tratamento || dados.inicioTratamento || state.inicioTratamento || state.aux?.inicioTratamento || "2026").trim();
    state.inicioTratamento = inicioTratParaPreencher;
    if (!state.aux) state.aux = {};
    state.aux.inicioTratamento = inicioTratParaPreencher;

    const freqConsParaPreencher = (dados.freq_consultas || dados.freqConsultas || state.freqConsultas || state.aux?.freqConsultas || "Mensal").trim();
    state.freqConsultas = freqConsParaPreencher;
    if (!state.aux) state.aux = {};
    state.aux.freqConsultas = freqConsParaPreencher;

    const sintomasParaPreencher = (dados.sintomas_limitacao || dados.sintomasLimitacao || state.sintomasLimitacao || state.aux?.sintomasLimitacao || dados.desc_limitacao || "").trim();
    state.sintomasLimitacao = sintomasParaPreencher;
    if (!state.aux) state.aux = {};
    state.aux.sintomasLimitacao = sintomasParaPreencher;

    const PADRAO_NEGA_ANTECEDENTES = "Nega antecedentes mórbidos relevantes, cirurgias prévias, neoplasias ou hábitos tabágicos e etilistas.";
    let antParaPreencher = (
      dados.historico_pregresso ||
      dados.historicoPregresso ||
      dados.antecedentes ||
      dados.antecedentes_morbidos ||
      state.historicoPregresso ||
      state.aux?.historicoPregresso ||
      ""
    ).trim();

    // Se houver condições/comorbidades em tratamento mas o antecedente veio vazio ou com a negativa genérica
    const hasConds = Array.isArray(dados.conditions) && dados.conditions.length > 0;
    if (hasConds && (!antParaPreencher || antParaPreencher === PADRAO_NEGA_ANTECEDENTES || antParaPreencher.startsWith("Nega antecedentes") || antParaPreencher.length < 25)) {
      if (typeof gerarNarrativaAntecedentesMelhoriaContinua === "function") {
        antParaPreencher = gerarNarrativaAntecedentesMelhoriaContinua(state, dados);
      } else {
        const condsStr = dados.conditions.map(c => `${c.nome || c.doenca}${c.tratamento ? ` em uso de ${c.tratamento}` : ""}`).join("; ");
        antParaPreencher = `Refere histórico de comorbidades: ${condsStr}. Nega demais antecedentes mórbidos relevantes, cirurgias prévias e neoplasias.`;
      }
    } else if (!antParaPreencher || /^(?:nega\.?|n[ãa]o\s+refere\.?|nada\s+consta\.?|sem\s+antecedentes.*|nenhum.*|-)$/i.test(antParaPreencher) || antParaPreencher.length < 10) {
      if (dados.is_acompanhante || String(dados.cid || state.cid).toUpperCase().startsWith("Z76")) {
        antParaPreencher = "Nega comorbidades próprias, cirurgias prévias e neoplasias.";
      } else {
        antParaPreencher = PADRAO_NEGA_ANTECEDENTES;
      }
    }

    state.historicoPregresso = antParaPreencher;
    if (!state.aux) state.aux = {};
    state.aux.historicoPregresso = antParaPreencher;
    state.descLimitacao = dados.desc_limitacao || state.descLimitacao || "";
    state.atividadesComprometidas = dados.atividades_comprometidas || state.atividadesComprometidas || "";

    state.cid = dados.cid || state.cid || "";

    // CIDs secundários estruturados e integrados
    let rawSecList = [];
    if (Array.isArray(dados.cidsSecundarios) && dados.cidsSecundarios.length > 0) {
      rawSecList = dados.cidsSecundarios.map(item => ({
        cid: typeof item === "object" ? (item.cid || item.codigo || "") : String(item || ""),
        descricao: typeof item === "object" ? (item.descricao || item.nome || "") : ""
      }));
    } else if (Array.isArray(dados.cids_secundarios) && dados.cids_secundarios.length > 0) {
      rawSecList = dados.cids_secundarios.map(code => {
        const c = String(code || "").trim().toUpperCase();
        const f = typeof findCID === "function" ? findCID(c) : null;
        return { cid: c, descricao: f ? f.n : "" };
      });
    }

    // Fallback por regex no texto bruto para garantir que NENHUM CID informado fique de fora
    const rawTxtInput = dados.texto_bruto || dados.texto || $("txtPreenchimentoIABruto")?.value || $("ia2EscritaText")?.value || $("ia2GravacaoTranscricao")?.value || window.__ia2UltimoTextoProcessado || "";
    if (rawTxtInput) {
      const allFoundCids = rawTxtInput.match(/\b([A-Z]\d{2}(?:\.\d{1,2})?)\b/gi) || [];
      const primaryCidNorm = (state.cid || "").toUpperCase().replace(".", "");
      allFoundCids.forEach(found => {
        let fCode = found.toUpperCase();
        if (fCode.length === 4 && !fCode.includes(".")) {
          fCode = `${fCode.slice(0, 3)}.${fCode.slice(3)}`;
        }
        const fNorm = fCode.replace(".", "");
        if (fNorm !== primaryCidNorm && !rawSecList.some(item => (item.cid || "").toUpperCase().replace(".", "") === fNorm)) {
          const fInfo = typeof findCID === "function" ? findCID(fCode) : null;
          rawSecList.push({ cid: fCode, descricao: fInfo ? fInfo.n : "" });
        }
      });
    }

    state.cidsSecundarios = rawSecList;
    if (!state.aux) state.aux = {};
    state.aux.cidsSecundarios = rawSecList;

    state.exameFisicoTipo = dados.exame_fisico_tipo || state.exameFisicoTipo || "Outros";
    state.exameMentalResultado = dados.exame_mental_resultado || state.exameMentalResultado || "";
    state.exameFisicoDescricao = dados.exame_fisico_descricao || state.exameFisicoDescricao || "";

    // Higienização e sanitização dos Sinais Vitais (evitar que inputs type="number" rejeitem strings com unidades ou texto)
    let sist = "";
    let diast = "";
    let pulsoVal = "";
    let altVal = "";
    let pesoVal = "";

    const rawSistStr = String(dados.pressao_sistolica || "").trim();
    const rawDiastStr = String(dados.pressao_diastolica || "").trim();

    // 1. Prefixo explícito de PA (ex: PA: 135/85, P.A. 120x80, Pressão Arterial: 140/90, Pressão: 130 por 80)
    const mPref = rawTxtInput.match(/\b(?:PA|P\.A\.|Press[ãa]o\s+Arterial|Press[ãa]o)[:\s=de]*([89]\d|1\d{2}|2[0-5]\d)\s*(?:[/xX\*\-]|por)\s*([4-9]\d|1[0-4]\d)\b/i);
    if (mPref) {
      sist = mPref[1];
      diast = mPref[2];
    } else {
      // 2. Notação em cmHg (ex: PA 12x8, PA 13/8, PA 14x9)
      const mCm = rawTxtInput.match(/\b(?:PA|P\.A\.|Press[ãa]o\s+Arterial|Press[ãa]o)[:\s=de]*([89]|1\d|2[0-5])\s*(?:[/xX\*\-]|por)\s*([4-9]|1[0-4])\b/i);
      if (mCm) {
        sist = String(parseInt(mCm[1], 10) * 10);
        diast = String(parseInt(mCm[2], 10) * 10);
      } else {
        // 3. Sufixo mmHg no texto bruto (ex: 135/85 mmHg)
        const mMmhg = rawTxtInput.match(/\b([89]\d|1\d{2}|2[0-5]\d)\s*(?:[/xX\*\-]|por)\s*([4-9]\d|1[0-4]\d)\s*mmHg\b/i);
        if (mMmhg) {
          sist = mMmhg[1];
          diast = mMmhg[2];
        } else {
          // 4. Validar valores vindos do backend
          const mBoth = (rawSistStr + " " + rawDiastStr).match(/([89]\d|1\d{2}|2[0-5]\d)\s*[/xX\*\-por\s]+\s*([4-9]\d|1[0-4]\d)/i);
          if (mBoth) {
            sist = mBoth[1];
            diast = mBoth[2];
          } else {
            const mS = rawSistStr.match(/\b([89]\d|1\d{2}|2[0-5]\d)\b/);
            const mD = rawDiastStr.match(/\b([4-9]\d|1[0-4]\d)\b/);
            if (mS && mD) {
              sist = mS[1];
              diast = mD[1];
            } else {
              sist = state.pressaoSistolica || "120";
              diast = state.pressaoDiastolica || "80";
            }
          }
        }
      }
    }

    const rawPulsoStr = String(dados.pulso || "").trim();
    const mPulso = rawTxtInput.match(/\b(?:Pulso|FC|Freq[uü][êe]ncia\s+Card[íi]aca)[:\s=de]*([4-9]\d|1\d{2})\b/i)
      || rawTxtInput.match(/\b([4-9]\d|1\d{2})\s*bpm\b/i)
      || rawPulsoStr.match(/\b([4-9]\d|1\d{2})\b/);
    pulsoVal = mPulso ? mPulso[1] : (state.pulso || "80");

    const rawAltStr = String(dados.altura || "").trim();
    const mAlt = rawAltStr.match(/\d[,\.]\d{1,2}/)
      || rawTxtInput.match(/\b(?:altura|alt)[:\s]*(\d[,\.]\d{1,2})\s*m?\b/i)
      || rawTxtInput.match(/\b(\d[,\.]\d{2})\s*m\b/i);
    if (mAlt) altVal = mAlt[0].replace(",", ".");

    const rawPesoStr = String(dados.peso || "").trim();
    const mPeso = rawPesoStr.match(/\d{2,3}(?:[,\.]\d{1,2})?/)
      || rawTxtInput.match(/\b(?:peso)[:\s]*(\d{2,3}(?:[,\.]\d{1,2})?)\s*(?:kg)?\b/i)
      || rawTxtInput.match(/\b(\d{2,3}(?:[,\.]\d{1,2})?)\s*kg\b/i);
    if (mPeso) pesoVal = mPeso[0].replace(",", ".");

    state.pressaoSistolica = sist || "120";
    state.pressaoDiastolica = diast || "80";
    state.pulso = pulsoVal || "80";
    if (altVal) state.altura = altVal;
    if (pesoVal) state.peso = pesoVal;

    state.aux.pressaoSistolica = state.pressaoSistolica;
    state.aux.pressaoDiastolica = state.pressaoDiastolica;
    state.aux.pulso = state.pulso;
    if (altVal) state.aux.altura = altVal;
    if (pesoVal) state.aux.peso = pesoVal;

    const isRetroInv = Boolean(dados.retroacao_invalida || state.aux?.retroacaoInvalida || state.retroacaoInvalida);
    if (dados.retroacao_invalida !== undefined) {
      state.retroacaoInvalida = Boolean(dados.retroacao_invalida);
      if (state.aux) state.aux.retroacaoInvalida = Boolean(dados.retroacao_invalida);
    }
    if (dados.retroacao_dias !== undefined && dados.retroacao_dias !== null) {
      state.retroacaoDias = dados.retroacao_dias;
      if (state.aux) state.aux.retroacaoDias = dados.retroacao_dias;
    }

    state.limitacaoFuncional = (isRetroInv && state.parecerManualOverride !== "CONTRÁRIO") ? "Sim" : (dados.limitacao_funcional || state.limitacaoFuncional || "Sim");
    state.limitacaoRol = (isRetroInv && state.parecerManualOverride !== "CONTRÁRIO") ? "Sim" : (dados.limitacao_rol || state.limitacaoRol || "Sim");
    state.capacidade = dados.capacidade || state.capacidade || "Capacidade parcial e temporariamente prejudicada";
    state.parecer = (isRetroInv && state.parecerManualOverride !== "FAVORÁVEL") ? "CONTRÁRIO" : (dados.parecer || state.parecer || "FAVORÁVEL");
    state.justificativa = dados.justificativa || state.justificativa || "";

    // Subtipo e Resultado do Exame Físico "Outros"
    const parecerFavoravel = String(state.parecer).toUpperCase().includes("FAVOR") || isRetroInv;
    let subtipoOutros = dados.outros_subtipo || state.outrosSubtipo || "Exame Físico Geral";
    if (subtipoOutros.toLowerCase() === "outros" || subtipoOutros.toLowerCase() === "none") {
      subtipoOutros = "Exame Físico Geral";
    }
    const resultadoOutros = dados.outros_resultado || state.outrosResultado || (parecerFavoravel ? "Alterado" : "Normal");
    state.outrosSubtipo = subtipoOutros;
    state.outrosResultado = resultadoOutros;

    // Medicações e Condições
    if (Array.isArray(dados.medications)) {
      state.medications = dados.medications.map(m => ({
        medicamento: m.medicamento || "",
        dosagem: m.dosagem || "",
        frequencia: m.frequencia || "",
        observacao: m.observacao || ""
      }));
    }
    if (Array.isArray(dados.conditions)) {
      state.conditions = dados.conditions.map(c => ({
        nome: c.nome || "",
        tratamento: c.tratamento || ""
      }));
    }

    const isoDoc = toIsoDate(dados.data_documento || state.dataDocumento || state.aux?.dataDocumento || $("dataDocumento")?.value || $("agilDataDocumento")?.value || "");
    const rawExpVal = dados.data_expedicao_iso || dados.data_expedicao || dados.dataExpedicaoIso || dados.dataExpedicao || state.dataExpedicao || state.aux?.dataExpedicaoIso || state.aux?.dataExpedicao || $("dataExpedicao")?.value || $("agilDataExpedicao")?.value || "";
    const isoExp = toIsoDate(rawExpVal);
    const brExp = dados.data_expedicao_br || (isoExp && /^\d{4}-\d{2}-\d{2}$/.test(isoExp) ? isoExp.split("-").reverse().join("/") : rawExpVal);
    const isoNasc = toIsoDate(dados.data_nascimento) || state.aux?.dataNascimento || "";
    const isoAltMed = toIsoDate(dados.data_alteracao_med) || state.aux?.dataAlteracaoMed || "";

    const crmCroVal = (dados.crm_cro || state.crmCro || state.aux?.crmCro || $("crmCro")?.value || $("agilCrmCro")?.value || "").trim();
    const nomeMedAssistVal = (dados.nome_medico_assistente || state.aux?.nomeMedicoAssistente || state.aux?.medicoAssistenteNome || "").trim();
    const diasSolVal = String(dados.dias_solicitados || state.diasSolicitados || state.aux?.diasSolicitados || $("diasSolicitados")?.value || $("agilDiasSolicitados")?.value || "").trim();
    const obsDocsVal = (dados.obs_documentos || state.aux?.obsDocumentos || $("obsDocumentos")?.value || "").trim();
    const altClinExamesVal = (dados.alteracoes_clinicas_exames || state.alteracoesClinicasExames || state.aux?.alteracoesClinicasExames || "").trim();

    state.crmCro = crmCroVal;
    state.dataDocumento = isoDoc;
    state.dataExpedicao = isoExp;
    state.diasSolicitados = diasSolVal;
    state.alteracoesClinicasExames = altClinExamesVal;

    // 3. Atualizar state.aux completo
    Object.assign(state.aux, {
      nomePaciente: state.nomePaciente,
      cpfPaciente: state.cpfPaciente,
      rgPaciente: dados.rg_paciente || state.aux?.rgPaciente || state.aux?.rg || "",
      dataNascimento: isoNasc,
      cargo: state.cargo,
      tempoCargo: state.tempoCargo,
      tempoUnidade: state.tempoUnidade,
      idade: state.idade,
      sexo: state.sexo,
      readaptado: state.readaptado,
      atividadesReadaptado: dados.atividades_readaptado || state.aux?.atividadesReadaptado || "",
      doencaMotivo: doencaParaPreencher || dados.doenca_motivo || "",
      inicioTratamento: state.inicioTratamento,
      freqConsultas: state.freqConsultas,
      sintomasLimitacao: state.sintomasLimitacao,
      alteracaoMed: state.alteracaoMed,
      dataAlteracaoMed: isoAltMed,
      obsAlteracaoMed: dados.obs_alteracao_med || state.aux?.obsAlteracaoMed || "",
      psicoterapia: state.psicoterapia,
      fisioterapia: state.fisioterapia,
      obsTerapias: dados.obs_terapias || state.aux?.obsTerapias || "",
      outrasDoencas: state.outrasDoencas,
      historicoPregresso: state.historicoPregresso,
      cid: state.cid,
      crmCro: crmCroVal,
      nomeMedicoAssistente: nomeMedAssistVal,
      medicoAssistenteNome: nomeMedAssistVal,
      dataDocumento: isoDoc,
      dataExpedicao: brExp || isoExp,
      dataExpedicaoIso: isoExp,
      diasSolicitados: diasSolVal,
      obsDocumentos: obsDocsVal,
      alteracoesClinicasExames: altClinExamesVal,
      exameFisicoTipo: state.exameFisicoTipo,
      exameMentalResultado: state.exameMentalResultado,
      exameFisicoDescricao: state.exameFisicoDescricao,
      outrosSubtipo: state.outrosSubtipo,
      areaExameClinico: state.outrosSubtipo,
      outrosResultado: state.outrosResultado,
      resultadoAvaliacao: state.outrosResultado,
      pressaoSistolica: state.pressaoSistolica,
      pressaoDiastolica: state.pressaoDiastolica,
      pulso: state.pulso,
      altura: state.altura || "",
      peso: state.peso || "",
      limitacaoFuncional: state.limitacaoFuncional,
      limitacaoRol: state.limitacaoRol,
      descLimitacao: dados.desc_limitacao || state.descLimitacao || "",
      atividadesComprometidas: dados.atividades_comprometidas || state.atividadesComprometidas || "",
      capacidade: state.capacidade,
      parecer: state.parecer,
      justificativa: state.justificativa
    });
    if (dados.retroacao_dias !== undefined && dados.retroacao_dias !== null) {
      state.aux.retroacaoDias = dados.retroacao_dias;
      state.aux.retroacaoInvalida = !!dados.retroacao_invalida;
      if (dados.retroacao_motivo) state.aux.retroacaoMotivo = dados.retroacao_motivo;
    }

    // 4. Atualizar Quesitos
    if (typeof QuesitoService !== "undefined" && Array.isArray(dados.quesitos)) {
      dados.quesitos.forEach((q, idx) => {
        QuesitoService.set(idx, q.resposta || "Sim");
      });
      state.quesitos = QuesitoService.get();
    }

    // 5. Preencher DOM diretamente (sem disparar eventos reativos intermediários)
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) {
        el.value = val;
      }
    };
    const setCheck = (id, checked) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!checked;
    };
    const setRadioDirect = (name, val) => {
      document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
        r.checked = (r.value === val);
      });
    };

    // Bloco 1 - Identificação
    setVal("nomePaciente", state.nomePaciente);
    setVal("agilNomePaciente", state.nomePaciente);
    setVal("cpfPaciente", state.cpfPaciente);
    setVal("agilCpfPaciente", state.cpfPaciente);
    setVal("cargo", state.cargo);
    setVal("agilCargo", state.cargo);
    setVal("tempoCargo", state.tempoCargo);
    setVal("agilTempoCargo", state.tempoCargo);
    setVal("tempoUnidade", state.tempoUnidade);
    setVal("agilTempoUnidade", state.tempoUnidade);
    setVal("idade", state.idade);
    setVal("agilIdade", state.idade);
    setRadioDirect("readaptado", state.readaptado);
    setRadioDirect("agilReadaptado", state.readaptado);
    if (typeof syncAgilReadaptado === "function") syncAgilReadaptado(state.readaptado);
    if (dados.atividades_readaptado) {
      setVal("atividadesReadaptado", dados.atividades_readaptado);
      setVal("agilAtividadesReadaptado", dados.atividades_readaptado);
    }

    // Bloco 2 - Queixa e Antecedentes: Qual a doença está tratando que motivou o afastamento?
    if (doencaParaPreencher) {
      setVal("doencaMotivo", doencaParaPreencher);
      setVal("agilDoencaMotivo", doencaParaPreencher);
    }
    if (inicioTratParaPreencher) {
      setVal("inicioTratamento", inicioTratParaPreencher);
      setVal("agilInicioTratamento", inicioTratParaPreencher);
    }
    if (freqConsParaPreencher) {
      setVal("freqConsultas", freqConsParaPreencher);
      setVal("agilFreqConsultas", freqConsParaPreencher);
    }
    if (sintomasParaPreencher) {
      setVal("sintomasLimitacao", sintomasParaPreencher);
      setVal("agilSintomasLimitacao", sintomasParaPreencher);
    }
    setRadioDirect("alteracaoMed", state.alteracaoMed);
    setRadioDirect("agilAlteracaoMed", state.alteracaoMed);
    if ($("alteracaoPanel")) $("alteracaoPanel").classList.toggle("hidden", state.alteracaoMed !== "Sim");
    if ($("agilAlteracaoPanel")) $("agilAlteracaoPanel").classList.toggle("hidden", state.alteracaoMed !== "Sim");
    setVal("dataAlteracaoMed", isoAltMed);
    setVal("agilDataAlteracaoMed", isoAltMed);
    setVal("obsAlteracaoMed", dados.obs_alteracao_med);
    setVal("agilObsAlteracaoMed", dados.obs_alteracao_med);
    setCheck("psicoterapia", state.psicoterapia);
    setCheck("agilPsicoterapia", state.psicoterapia);
    setCheck("fisioterapia", state.fisioterapia);
    setCheck("agilFisioterapia", state.fisioterapia);
    if ($("psicoterapia")) $("psicoterapia").checked = !!state.psicoterapia;
    if ($("agilPsicoterapia")) $("agilPsicoterapia").checked = !!state.psicoterapia;
    if ($("fisioterapia")) $("fisioterapia").checked = !!state.fisioterapia;
    if ($("agilFisioterapia")) $("agilFisioterapia").checked = !!state.fisioterapia;
    setVal("obsTerapias", dados.obs_terapias);
    setVal("agilObsTerapias", dados.obs_terapias);
    setRadioDirect("outrasDoencas", state.outrasDoencas);
    setRadioDirect("agilOutrasDoencas", state.outrasDoencas);
    if ($("doencasPanel")) $("doencasPanel").classList.toggle("hidden", state.outrasDoencas !== "Sim");
    if ($("agilDoencasPanel")) $("agilDoencasPanel").classList.toggle("hidden", state.outrasDoencas !== "Sim");
    setVal("historicoPregresso", state.historicoPregresso);
    setVal("agilHistoricoPregresso", state.historicoPregresso);

    // Bloco 3 - Atestado, Data de Expedição e Exame
    setVal("cid", state.cid);
    setVal("agilCid", state.cid);
    if (state.cid) {
      const f = typeof findCID === "function" ? findCID(state.cid) : null;
      const badge = $("agilCidBadge");
      if (badge && f) {
        badge.style.display = "inline-flex";
        badge.innerHTML = `<strong>${esc(f.c)}</strong> — ${esc(f.n)}`;
      }
    }
    setVal("crmCro", crmCroVal);
    setVal("agilCrmCro", crmCroVal);
    setVal("dataExpedicao", isoExp);
    setVal("agilDataExpedicao", isoExp);
    setVal("dataDocumento", isoDoc);
    setVal("agilDataDocumento", isoDoc);
    setVal("diasSolicitados", diasSolVal);
    setVal("agilDiasSolicitados", diasSolVal);
    setVal("obsDocumentos", obsDocsVal);
    if (altClinExamesVal) {
      setVal("alteracoesClinicasExames", altClinExamesVal);
    }

    // Abrir painel do atestado se houver dados
    if (typeof toggleAtestadoAssistente === "function") {
      toggleAtestadoAssistente(true);
    }
    if (typeof calcularDatasAtestado === "function") {
      calcularDatasAtestado();
    }

    // Sinais vitais
    setVal("pressaoSistolica", state.pressaoSistolica);
    setVal("agilPressaoSistolica", state.pressaoSistolica);
    setVal("pressaoDiastolica", state.pressaoDiastolica);
    setVal("agilPressaoDiastolica", state.pressaoDiastolica);
    setVal("pulso", state.pulso);
    setVal("agilPulso", state.pulso);
    if (state.altura) {
      setVal("altura", state.altura);
      setVal("agilAltura", state.altura);
    }
    if (state.peso) {
      setVal("peso", state.peso);
      setVal("agilPeso", state.peso);
    }
    const isPadraoVitals = (state.pressaoSistolica === "120" && state.pressaoDiastolica === "80" && state.pulso === "80");
    setCheck("agilVitalsPadraoCheck", isPadraoVitals);

    // Exame Físico / Mental
    setVal("exameFisicoTipo", state.exameFisicoTipo);
    setVal("agilExameFisicoTipo", state.exameFisicoTipo);
    setVal("exameFisicoDescricao", state.exameFisicoDescricao);
    setVal("agilExameFisicoDescricao", state.exameFisicoDescricao);

    // Configurar Tipo de Exame e subseletores
    try {
      if (typeof onAgilExameTipoChange === "function") {
        onAgilExameTipoChange(state.exameFisicoTipo);
      }
    } catch (e) {
      console.warn("onAgilExameTipoChange:", e);
    }
    if (state.exameFisicoTipo === "Outros") {
      if (typeof renderOutrosUI === "function") renderOutrosUI();
    } else if (state.exameFisicoTipo === "Exame Mental") {
      if (isRetroInv && !state.exameMentalResultado) {
        state.exameMentalResultado = "Alterado";
      }
      const btnNormal = $("btnAgilMentalNormal");
      const btnAlterado = $("btnAgilMentalAlterado");
      if (btnNormal) btnNormal.classList.toggle("selected-normal", state.exameMentalResultado === "Normal");
      if (btnAlterado) btnAlterado.classList.toggle("selected-alterado", state.exameMentalResultado === "Alterado");
    } else if (state.exameFisicoTipo === "Aparelho Osteomuscular e Tecido Conjutivo") {
      const parecerFav = String(state.parecer || dados.parecer || "").toUpperCase().includes("FAVOR") || isRetroInv;
      if (!parecerFav) {
        // Se parecer CONTRÁRIO (com expedição em dia): Mantém os critérios analisados pelo médico
        const prevExameDesc = state.exameFisicoDescricao;
        const prevJust = state.justificativa;
        const prevDescLim = dados.desc_limitacao || state.descLimitacao;
        if (typeof aplicarOsteomuscularNormal === "function") {
          aplicarOsteomuscularNormal();
        }
        if (prevExameDesc) {
          state.exameFisicoDescricao = prevExameDesc;
          setVal("exameFisicoDescricao", prevExameDesc);
          setVal("agilExameFisicoDescricao", prevExameDesc);
        }
        if (prevJust) {
          state.justificativa = prevJust;
          setVal("justificativa", prevJust);
          setVal("agilJustificativa", prevJust);
        }
        if (prevDescLim) {
          state.descLimitacao = prevDescLim;
        }
      } else {
        // Se parecer FAVORÁVEL ou Retroação Inválida: Seleciona todas as partes do corpo condizentes como ALTERADO (vermelho)
        const rawTxt = dados.texto_bruto || dados.texto || $("txtPreenchimentoIABruto")?.value || $("ia2EscritaText")?.value || $("ia2GravacaoTranscricao")?.value || window.__ia2UltimoTextoProcessado || "";
        let regioesAfetadas = Array.isArray(dados.regioes_osteomusculares) && dados.regioes_osteomusculares.length > 0
          ? dados.regioes_osteomusculares
          : (typeof detectarTodasRegioesOsteomusculares === "function"
              ? detectarTodasRegioesOsteomusculares(state.cid, rawTxt, state.doencaMotivo, state.exameFisicoDescricao, state.cidsSecundarios)
              : [dados.regiao_osteomuscular || (typeof detectarRegiaoOsteomuscular === "function" ? detectarRegiaoOsteomuscular(state.cid, rawTxt, state.doencaMotivo, state.exameFisicoDescricao) : "lombar")]);

        if (!Array.isArray(regioesAfetadas) || regioesAfetadas.length === 0) {
          regioesAfetadas = ["lombar"];
        }

        if (!state.osteomuscularRegioes) state.osteomuscularRegioes = {};
        state.osteomuscularRegioes = {};
        regioesAfetadas.forEach(r => {
          if (r) state.osteomuscularRegioes[r] = "Alterado";
        });
        state.osteomuscularResultado = "Alterado";
        if (typeof updateOsteoUI === "function") {
          updateOsteoUI();
        }
      }
    }

    // Bloco 4 - Conclusão e Parecer
    setRadioDirect("limitacaoFuncional", state.limitacaoFuncional);
    setRadioDirect("agilLimitacaoFuncional", state.limitacaoFuncional);
    setRadioDirect("limitacaoRol", state.limitacaoRol);
    setRadioDirect("agilLimitacaoRol", state.limitacaoRol);
    setVal("descLimitacao", dados.desc_limitacao);
    setVal("agilDescLimitacao", dados.desc_limitacao);
    setVal("atividadesComprometidas", dados.atividades_comprometidas);
    setRadioDirect("capacidade", state.capacidade);
    setRadioDirect("parecer", state.parecer);
    setVal("justificativa", state.justificativa);
    setVal("agilJustificativa", state.justificativa);

    // 6. Re-renderizar componentes dinâmicos
    if (typeof renderMedications === "function") renderMedications();
    if (typeof renderConditions === "function") renderConditions();
    if (typeof renderQuesitos === "function") renderQuesitos();
    if (typeof renderSecondaryCIDs === "function") renderSecondaryCIDs();
    if (typeof togglePanelsOnly === "function") togglePanelsOnly();
    if (typeof syncExtendedToAgil === "function") syncExtendedToAgil();

    // 7. Salvaguarda final para doencaMotivo, inicioTratamento, freqConsultas, sintomasLimitacao e exameFisicoDescricao
    if (doencaParaPreencher) {
      state.doencaMotivo = doencaParaPreencher;
      if (!state.aux) state.aux = {};
      state.aux.doencaMotivo = doencaParaPreencher;
      if ($("doencaMotivo")) $("doencaMotivo").value = doencaParaPreencher;
      if ($("agilDoencaMotivo")) $("agilDoencaMotivo").value = doencaParaPreencher;
    }
    if (inicioTratParaPreencher) {
      state.inicioTratamento = inicioTratParaPreencher;
      if (!state.aux) state.aux = {};
      state.aux.inicioTratamento = inicioTratParaPreencher;
      if ($("inicioTratamento")) $("inicioTratamento").value = inicioTratParaPreencher;
      if ($("agilInicioTratamento")) $("agilInicioTratamento").value = inicioTratParaPreencher;
    }
    if (freqConsParaPreencher) {
      state.freqConsultas = freqConsParaPreencher;
      if (!state.aux) state.aux = {};
      state.aux.freqConsultas = freqConsParaPreencher;
      if ($("freqConsultas")) $("freqConsultas").value = freqConsParaPreencher;
      if ($("agilFreqConsultas")) $("agilFreqConsultas").value = freqConsParaPreencher;
    }
    if (sintomasParaPreencher) {
      state.sintomasLimitacao = sintomasParaPreencher;
      if (!state.aux) state.aux = {};
      state.aux.sintomasLimitacao = sintomasParaPreencher;
      if ($("sintomasLimitacao")) $("sintomasLimitacao").value = sintomasParaPreencher;
      if ($("agilSintomasLimitacao")) $("agilSintomasLimitacao").value = sintomasParaPreencher;
    }
    if (state.exameFisicoDescricao) {
      if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = state.exameFisicoDescricao;
      if ($("agilExameFisicoDescricao")) $("agilExameFisicoDescricao").value = state.exameFisicoDescricao;
    }
    if (antParaPreencher) {
      state.historicoPregresso = antParaPreencher;
      if (!state.aux) state.aux = {};
      state.aux.historicoPregresso = antParaPreencher;
      if ($("historicoPregresso")) $("historicoPregresso").value = antParaPreencher;
      if ($("agilHistoricoPregresso")) $("agilHistoricoPregresso").value = antParaPreencher;
    }

    // 8. Se for Outros, reforçar o destaque do chip e resultado selecionado
    if (state.exameFisicoTipo === "Outros" && typeof renderOutrosUI === "function") {
      renderOutrosUI();
    }

    // 9. Atualizar contadores do e-SISLA e progresso ágil
    if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
    if (typeof atualizarContadorEsisla === "function") {
      ["nomePaciente", "cpfPaciente", "cargo", "doencaMotivo", "inicioTratamento", "freqConsultas", "sintomasLimitacao", "historicoPregresso", "crmCro", "diasSolicitados", "exameFisicoDescricao", "justificativa"].forEach(k => {
        atualizarContadorEsisla(k);
        atualizarContadorEsisla("agil" + k.charAt(0).toUpperCase() + k.slice(1));
      });
    }
    ["doencaMotivo", "agilDoencaMotivo", "inicioTratamento", "agilInicioTratamento", "freqConsultas", "agilFreqConsultas", "sintomasLimitacao", "agilSintomasLimitacao", "historicoPregresso", "agilHistoricoPregresso"].forEach(id => {
      $(id)?.dispatchEvent(new Event("input", { bubbles: true }));
    });

  } finally {
    window.__isAutoSaving = prevAutoSaving;
    window.__isBulkApplyingIA = false;
  }

  if ($("fisioterapia")) $("fisioterapia").checked = !!state.fisioterapia;
  if ($("agilFisioterapia")) $("agilFisioterapia").checked = !!state.fisioterapia;
  if ($("psicoterapia")) $("psicoterapia").checked = !!state.psicoterapia;
  if ($("agilPsicoterapia")) $("agilPsicoterapia").checked = !!state.psicoterapia;
  if (typeof autoSave === "function") autoSave();
  if ($("fisioterapia")) $("fisioterapia").checked = !!state.fisioterapia;
  if ($("agilFisioterapia")) $("agilFisioterapia").checked = !!state.fisioterapia;
  if ($("psicoterapia")) $("psicoterapia").checked = !!state.psicoterapia;
  if ($("agilPsicoterapia")) $("agilPsicoterapia").checked = !!state.psicoterapia;
  toast("✨ Ficha preenchida com sucesso pela IA no Modo Rascunho!");
}
window.executarPreenchimentoIA = executarPreenchimentoIA;
window.aplicarPreenchimentoIAResultado = aplicarPreenchimentoIAResultado;

function openManagement() {
    const impId = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ambiental.impersonate_medico_id') : null) || new URLSearchParams(location.search).get('medico_id') || new URLSearchParams(location.search).get('impersonate_medico_id');
    if (impId) {
        window.location.href = `/gestao_medicos.html?impersonate_medico_id=${encodeURIComponent(impId)}`;
        return;
    }
    if (currentProfile && currentProfile.perfil === "Médico") window.location.href = "/gestao_medicos.html";
    else window.location.href = "/gestao";
}
function workflowStatus(){return String(state.workflowStatus||(state.finalizado?"FINALIZADO":"RASCUNHO")).toUpperCase();}
function setPersistStatus(kind,text){if($("saveDot"))$("saveDot").className=`save-dot ${kind||""}`;if($("saveText"))$("saveText").textContent=text;}
async function tryServerLoad(id){
  if(!id) return false;
  try{
    const d=await AmbientalAPI.atendimento.get(id);
    if(d?.payload){
      Object.keys(state).forEach(k=>delete state[k]);
      Object.assign(state,JSON.parse(JSON.stringify(d.payload)));
      state.__serverId=d.id;
      state.__serverVersion=Number(d.versao||1);
      state.workflowStatus=d.status||state.workflowStatus||"RASCUNHO";
      state.finalizado=state.workflowStatus==="FINALIZADO";
      if (!state.aux || typeof state.aux !== "object") state.aux = {};
      state.atendimento = state.atendimento || d.atendimento || id;
      const pacienteNome = state.nomePaciente || state.aux.nomePaciente || d.paciente_nome || d.paciente || "";
      if (pacienteNome) { state.nomePaciente = pacienteNome; state.aux.nomePaciente = pacienteNome; }
      const pacienteCpf = state.cpfPaciente || state.aux.cpfPaciente || d.paciente_cpf || d.cpf || "";
      if (pacienteCpf) { state.cpfPaciente = pacienteCpf; state.aux.cpfPaciente = pacienteCpf; }
      const cargo = state.cargo || state.aux.cargo || d.cargo || "";
      if (cargo) { state.cargo = cargo; state.aux.cargo = cargo; }
      const idade = state.idade || state.aux.idade || d.idade || "";
      if (idade) { state.idade = idade; state.aux.idade = idade; }
      applyState();
      syncExtendedToAgil();
      setPersistStatus("ok","Atendimento sincronizado com o servidor");
      return true;
    }
  }catch(e){
    console.warn("Falha ao carregar atendimento",e);
  }
  return false;
}
async function syncToServer(manual=false){
  if(isFinalizedReadOnly()){
    console.log("Atendimento em modo leitura. Sincronização de background ignorada.");
    return {ok: true, readonly: true};
  }
  
  try{
    const payload=JSON.parse(JSON.stringify(state));
    payload.quesitos=QuesitoService.get();
    payload.validation=ValidationEngine.get();
    delete payload.__serverSyncedAt;
    delete payload.__serverId;
    if(state.__serverVersion!=null && state.__serverId){ payload.__serverVersion=Number(state.__serverVersion); }
    
    const hasServerId=!!state.__serverId;
    let url=hasServerId?`${getApiBase()}/api/atendimentos/${encodeURIComponent(state.__serverId)}`:`${getApiBase()}/api/atendimentos`;
    let method=hasServerId?"PUT":"POST";
    
    let r=await AmbientalAuth.authFetch(url,{
    method,
    headers:{
        "Content-Type":"application/json",
        "Accept":"application/json"
    },
    body:JSON.stringify(payload)
});
    let d=await r.json().catch(()=>null);
    
    if(!r.ok&&r.status===404&&hasServerId){
      r=await AmbientalAuth.authFetch(`${getApiBase()}/api/atendimentos`,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
      d=await r.json().catch(()=>null);
    }
    
    if(!r.ok&&!hasServerId&&r.status===409&&d?.error?.code==="DUPLICATE_ATENDIMENTO"){
      r=await AmbientalAuth.authFetch(`${getApiBase()}/api/atendimentos/${encodeURIComponent(state.atendimento)}`,{method:"PUT",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
      d=await r.json().catch(()=>null);
    }
    
    // --- NOVO BLOCO: AUTO-CORREÇÃO DE CONFLITO ---
    if(!r.ok || !d?.success){
      if(r.status === 409 && d?.error?.code === "VERSION_CONFLICT") {
         await syncToRegistry();
         // Autosave/background sync must never open a blocking confirmation dialog.
         // The local snapshot is preserved and the conflict is handled only on an
         // explicit/manual save action.
         if(manual){
           const confirmed = await confirm("Este atendimento foi atualizado em outro dispositivo. Seus dados locais permanecem salvos no backup do navegador. Deseja carregar agora a versão mais recente do servidor?");
           if(confirmed){
             const loaded = await tryServerLoad(state.atendimento);
             if(loaded) toast("Versão mais recente carregada com sucesso.");
           } else {
             toast("Alterações locais preservadas. Resolva o conflito antes de sincronizar novamente.");
           }
         }
         return {ok:false,conflict:true,error:new Error("VERSION_CONFLICT")};
      }
      // Se o banco retornar 409 avisando que o estado oficial é outro (ex: já está finalizado)
      if(r.status === 409 && d?.error?.details?.estado_oficial) {
         const estadoReal = d.error.details.estado_oficial;
         
         // Atualiza o estado local persistido em IndexedDB para refletir a nuvem
         state.workflowStatus = estadoReal;
         state.finalizado = (estadoReal === "FINALIZADO");
         
         applyFinalizedLock(); // Trava a interface do usuário
         renderReview(); // Remove os avisos de pendência
         toast(`Sincronizado: o atendimento já consta como ${estadoReal} no banco de dados.`);
         
         return {ok: true, readonly: true};
      }
      
      const msg=d?.error?.message||d?.detail||"Falha na persistência no servidor";
      throw new Error(msg);
    }
    // ----------------------------------------------
    
    state.__serverSyncedAt=new Date().toISOString();
    state.__serverId=d?.data?.id||state.__serverId;
    state.__serverVersion=Number(d?.data?.versao||state.__serverVersion||1);
    state.workflowStatus=d?.data?.status||workflowStatus();
    state.finalizado=state.workflowStatus==="FINALIZADO";
    setPersistStatus("ok",manual?"Sincronizado com o servidor":`Salvo às ${timeNow()}`);
    
    return {ok:true,data:d.data};
    
  } catch(e) {
    console.warn("Persistência API indisponível",e);
    setPersistStatus("","Offline — salvo localmente");
    if(manual)toast(e.message||"Falha ao salvar no servidor.");
    return {ok:false,error:e,offline:true};
  }
}
async function flushOfflineQueue(){
  const queue=window.AmbientalUtils?.SyncQueue;
  if(!queue) return false;
  const items=await queue.list();
  if(!items.length) return true;
  let changed=false;
  for(const item of items){
    try{
      const payload=item?.payload;
      if(!payload || !payload.atendimento) { await queue.remove(item.key); continue; }
      const serverId=payload.__serverId||null;
      const url=serverId?`${getApiBase()}/api/atendimentos/${encodeURIComponent(serverId)}`:`${getApiBase()}/api/atendimentos`;
      const method=serverId?"PUT":"POST";
      const r=await AmbientalAuth.authFetch(url,{method,headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
      const d=await r.json().catch(()=>null);
      if(r.ok && d?.success){
        await queue.remove(item.key);
        changed=true;
        if(String(state.atendimento)===String(payload.atendimento)){
          state.__serverId=d?.data?.id||state.__serverId;
          state.__serverVersion=Number(d?.data?.versao||state.__serverVersion||1);
          state.__serverSyncedAt=new Date().toISOString();
          setPersistStatus("ok","Sincronizado com o servidor");
        }
      }else if(r.status===409 && d?.error?.code==="VERSION_CONFLICT") {
        // Keep the queue item for an explicit/manual conflict resolution.
        continue;
      }
    }catch(error){
      console.warn("Falha ao esvaziar fila offline:", error?.message||error);
    }
  }
  return changed || (await queue.count())===0;
}
let __isAutoSaving = false;
function autoSave(){
  if(__isAutoSaving) return;
  __isAutoSaving = true;
  try {
    if (typeof ensureDefaultQuesitos === "function") ensureDefaultQuesitos();
    syncState();
    state.quesitos = QuesitoService.get();
    updateProgress();
    invalidateAICache();
    if(!state.atendimento){
      setPersistStatus("","Não salvo — clique em Salvar rascunho");
      clearTimeout(window.__saveTimer);
      return;
    }
    setPersistStatus("saving","Salvando...");
    clearTimeout(window.__saveTimer);
    window.__saveTimer=setTimeout(()=>persistNow(true),650);
  } finally {
    __isAutoSaving = false;
  }
}
async function persistNow(updateStatus=false){
  try{
    const localOk=await syncToRegistry();
    if(!localOk) throw new Error("Não foi possível salvar o rascunho local.");
    window.AmbientalUtils?.legacyStorage?.remove?.(STORAGE_KEY);
    const queue = window.AmbientalUtils?.SyncQueue;
    const snapshot = JSON.parse(JSON.stringify(state));
    if(updateStatus){
      setPersistStatus("saving","Sincronizando...");
      const result = await syncToServer(false);
      if(!result.ok && !result.readonly && queue){
        await queue.put(`atendimento:${state.atendimento}`, snapshot, {endpoint:"/api/atendimentos", lastError:result.error?.message||"Falha de sincronização"});
        setPersistStatus("","Offline — salvo localmente");
      }
      return result;
    }
    clearTimeout(window.__serverSaveTimer);
    window.__serverSaveTimer=setTimeout(async()=>{
      const result=await syncToServer(false);
      if(!result.ok && !result.readonly && queue){
        await queue.put(`atendimento:${state.atendimento}`, JSON.parse(JSON.stringify(state)), {endpoint:"/api/atendimentos", lastError:result.error?.message||"Falha de sincronização"});
        setPersistStatus("","Offline — salvo localmente");
      }
    },50);
    return {ok:true,local:true};
  }catch(error){
    console.warn("Falha no armazenamento local:", error?.name || "StorageError");
    setPersistStatus("","Erro ao salvar");
    return {ok:false,error};
  }
}
async function saveNow(){
  if(isFinalizedReadOnly()){toast("Atendimento finalizado: edição bloqueada. Use a Gestão para reabrir.");return false;}
  if(typeof currentAttendanceMode !== "undefined" && currentAttendanceMode === "agil"){
    syncAgilToExtended();
  }
  syncState();
  if(!state.atendimento){
    state.atendimento=generateId();
    if($("atd")) $("atd").value=state.atendimento;
    if($("atdDisplay")) $("atdDisplay").textContent="Identificação registrada";
    if($("atdNumber")) $("atdNumber").textContent=state.atendimento;
  }
  setPersistStatus("saving","Salvando rascunho...");
  const result=await persistNow(true);
  if(result?.ok){
    toast("Rascunho salvo com sucesso.");
    return true;
  } else {
    toast(result?.error?.message || "Erro ao salvar rascunho no servidor.");
    return false;
  }
}

function toggleReadaptado(){
  const val = getRadio("readaptado") || getRadio("agilReadaptado");
  state.readaptado = val;
  if (!state.aux) state.aux = {};
  state.aux.readaptado = val;
  $("readaptadoPanel")?.classList.toggle("hidden", val !== "Sim");
  $("agilReadaptadoPanel")?.classList.toggle("hidden", val !== "Sim");
  if (typeof ajustarQuesitosPorParecerEReadaptacao === "function") ajustarQuesitosPorParecerEReadaptacao();
}
function toggleAlteracaoMed(){
  const val = getRadio("alteracaoMed") || getRadio("agilAlteracaoMed");
  $("alteracaoPanel")?.classList.toggle("hidden", val !== "Sim");
  $("agilAlteracaoPanel")?.classList.toggle("hidden", val !== "Sim");
}
function toggleDoencas(){
  const val = getRadio("outrasDoencas") || getRadio("agilOutrasDoencas");
  $("doencasPanel")?.classList.toggle("hidden", val !== "Sim");
  $("agilDoencasPanel")?.classList.toggle("hidden", val !== "Sim");
}
function updateLimitacaoStatus(){
  const checks=[
    ["limitacaoFuncional","limitacaoFunctionalStatus","Limitação funcional"],
    ["limitacaoRol","limitacaoRolStatus","Limitação das atividades do Rol"]
  ];
  checks.forEach(([name,id,label])=>{ const el=$(id); if(!el)return; const stateValue=name==="limitacaoFuncional"?state.limitacaoFuncional:state.limitacaoRol; const v=isYesNoAnswer(getRadio(name))?getRadio(name):normalizeLegacyYesNo(stateValue); if(v){setRadio(name,v);el.className="field-status ok";el.textContent=`✓ ${label}: ${v} registrado`;} else {el.className="field-status pending";el.textContent=`! ${label}: selecione Sim ou Não`;} });
}
function toggleLimitacao1(){ $("limitacao1Panel").classList.toggle("hidden",getRadio("limitacaoFuncional")!=="Sim"); updateLimitacaoStatus(); autoSave(); }
function toggleLimitacao2(){ $("limitacao2Panel").classList.toggle("hidden",getRadio("limitacaoRol")!=="Sim"); updateLimitacaoStatus(); autoSave(); }
function addMedication(data={}){
  state.medications.push({medicamento:data.medicamento||"",dosagem:data.dosagem||"",frequencia:data.frequencia||"",observacao:data.observacao||""});
  renderMedications(); autoSave();
}
function addDocumentRecord(data={}){
  state.documentosComplementares=Array.isArray(state.documentosComplementares)?state.documentosComplementares:[];
  state.documentosComplementares.push({tipo:data.tipo||"",data:data.data||"",resultado:data.resultado||""});
  renderDocumentRecords();autoSave();
}
function renderDocumentRecords(){
  const box=$("documentRows"); if(!box)return;
  const docs=Array.isArray(state.documentosComplementares)?state.documentosComplementares:[];
  if(!docs.length){box.innerHTML='<div class="empty">Nenhum documento ou exame complementar adicionado.</div>';return;}
  box.innerHTML=docs.map((d,i)=>`<div class="med-row" style="grid-template-columns:1.1fr .7fr 2fr auto;margin-bottom:8px"><select class="select small-input" onchange="editDocumentRecord(${i},'tipo',this.value)"><option value="">Tipo</option>${["Atestado","Relatório médico","Exame complementar","Outro"].map(x=>`<option ${d.tipo===x?"selected":""}>${x}</option>`).join("")}</select><input class="input small-input" type="date" value="${esc(d.data)}" onchange="editDocumentRecord(${i},'data',this.value)"><input class="input small-input" placeholder="Resultado / conclusão informada" value="${esc(d.resultado)}" oninput="editDocumentRecord(${i},'resultado',this.value)"><button class="remove" onclick="removeDocumentRecord(${i})" title="Remover">×</button></div>`).join("");
}
function editDocumentRecord(i,k,v){state.documentosComplementares[i][k]=v;autoSave()}
function removeDocumentRecord(i){state.documentosComplementares.splice(i,1);renderDocumentRecords();autoSave()}

function renderMedications(){
  const boxes=[$("medRows"),$("agilMedRows")].filter(Boolean);
  boxes.forEach(box=>{
    if(!state.medications.length){box.innerHTML='<div class="empty">Nenhuma medicação adicionada.</div>';return;}
    box.innerHTML=state.medications.map((m,i)=>`
      <div class="med-row">
        <input class="input small-input field-span" list="medSuggestionsList" placeholder="Medicamento" value="${esc(m.medicamento)}" oninput="editMedication(${i},'medicamento',this.value)">
        <input class="input small-input" placeholder="Dosagem" value="${esc(m.dosagem)}" oninput="editMedication(${i},'dosagem',this.value)">
        <input class="input small-input" placeholder="Frequência" value="${esc(m.frequencia)}" oninput="editMedication(${i},'frequencia',this.value)">
        <input class="input small-input field-span" placeholder="Observação" value="${esc(m.observacao)}" oninput="editMedication(${i},'observacao',this.value)">
        <button class="remove" onclick="removeMedication(${i})" title="Remover">×</button>
      </div>`).join("");
  });
}
function editMedication(i,k,v){state.medications[i][k]=v;autoSave()}
function removeMedication(i){state.medications.splice(i,1);renderMedications();autoSave()}

function addCondition(data={}){
  state.conditions.push({nome:data.nome||"",tratamento:data.tratamento||""});
  renderConditions(); autoSave();
}
function renderConditions(){
  const boxes=[$("condRows"),$("agilCondRows")].filter(Boolean);
  boxes.forEach(box=>{
    if(!state.conditions.length){box.innerHTML='<div class="empty">Nenhuma condição adicionada.</div>';return;}
    box.innerHTML=state.conditions.map((c,i)=>`
      <div class="med-row" style="grid-template-columns:1fr 1.5fr auto">
        <input class="input small-input" placeholder="Doença / condição" value="${esc(c.nome)}" oninput="editCondition(${i},'nome',this.value)">
        <input class="input small-input" placeholder="Tratamento" value="${esc(c.tratamento)}" oninput="editCondition(${i},'tratamento',this.value)">
        <button class="remove" onclick="removeCondition(${i})">×</button>
      </div>`).join("");
  });
}
function editCondition(i,k,v){state.conditions[i][k]=v;autoSave()}
function removeCondition(i){state.conditions.splice(i,1);renderConditions();autoSave()}

function renderExam(){
  const sel=$("exameFisicoTipo");
  let chosen=state.exameFisicoTipo||"";
  // migrate legacy exam object by taking the first answered criterion
  if(!chosen&&state.exam&&typeof state.exam==="object"){
    const legacyIndex=Object.keys(state.exam).map(Number).find(i=>Number.isFinite(i)&&state.exam[i]?.value);
    if(Number.isFinite(legacyIndex)) chosen=examItems[legacyIndex]?.[0]||"";
  }
  state.exameFisicoTipo=chosen;
  if(sel)sel.value=chosen;
  const desc=$("alteracoesClinicasExames");if(desc)desc.value=state.alteracoesClinicasExames||state.examDescription||"";
  const answered=chosen?1:0;
  const prog=$("examProgress");if(prog)prog.textContent=`${answered}/1 categoria selecionada`;
}
function setExamType(v){state.exameFisicoTipo=v;state.exam={selected:v};autoSave();renderExam()}
function setExamDescription(v){state.alteracoesClinicasExames=v;state.examDescription=v;autoSave()}

const FIXED_QUESITOS=[
  {id:1,pergunta:"Há doença(s) ou sequela(s) de doença(s) prévia(s)?"},
  {id:2,pergunta:"A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)?"},
  {id:3,pergunta:"A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol?"}
];
const QuesitoService={
  normalize(value){ const v=String(value??"").trim().toLowerCase(); if(v==="sim") return "Sim"; if(v==="não"||v==="nao") return "Não"; return ""; },
  ensure(){ const old=Array.isArray(state.quesitos)?state.quesitos:[]; return FIXED_QUESITOS.map((q,i)=>{const byId=old.find(x=>Number(x?.id)===q.id); const resposta=this.normalize(old[i]?.resposta ?? byId?.resposta); return {id:q.id,pergunta:q.pergunta,resposta};}); },
  get(){ state.quesitos=this.ensure(); return JSON.parse(JSON.stringify(state.quesitos)); },
  getAnswer(i){ return this.normalize(this.get()[i]?.resposta); },
  set(i,value){ state.quesitos=this.ensure(); if(i<0||i>2)return false; const normalized=this.normalize(value); state.quesitos[i].resposta=normalized; return !!normalized; },
  validate(){ const qs=this.get(); const answers=qs.map(q=>this.normalize(q.resposta)); const invalid=answers.filter(v=>v!==""&&v!=="Sim"&&v!=="Não").length; const answered=answers.filter(Boolean).length; const allSame=answered===3&&new Set(answers).size===1; const blocking=answered<3?[`Quesitos: ${3-answered} resposta(s) ausente(s).`]:[]; const warnings=allSame?["As três respostas estão iguais; revisar consistência com os achados registrados."]:[]; return {valid:blocking.length===0&&invalid===0,answers,answered,invalid,allSame,mixed:answered===3&&!allSame,blocking,warnings,status:answered===3?"CONCLUIDA":"PENDENTE"}; },
  persist(){ return this.get(); },
  restore(){ state.quesitos=this.ensure(); return this.get(); },
  status(){ const v=this.validate(); return {respondidos:`${v.answered}/3`,status:v.status,concluida:v.valid,blocking:v.blocking,warnings:v.warnings}; }
};
function ensureFixedQuesitos(){QuesitoService.restore();}
function syncQuesitoStateFromDOM(){
  QuesitoService.restore();
  FIXED_QUESITOS.forEach((q,i)=>{const checked=document.querySelector(`input[name="quesito-${i}"]:checked`); if(checked) QuesitoService.set(i,checked.value);});
  state.quesitos=QuesitoService.get();
  return state.quesitos.map(q=>q.resposta);
}
function getQuesitoAnswers(){ return QuesitoService.validate().answers; }
function getQuesitoValidation(){ return QuesitoService.validate(); }
function renderAgilQuesitos() {
  const box = $("agilQuesitosList");
  if (!box) return;
  const qs = QuesitoService.get();
  box.innerHTML = qs.map((q, i) => {
    const isSim = q.resposta === "Sim";
    const isNao = q.resposta === "Não";
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;gap:8px">
        <span style="font-size:12px;color:#334155;font-weight:600;flex:1">${i+1}) ${esc(q.pergunta)}</span>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn" style="padding:3px 12px;font-size:11.5px;font-weight:700;border-radius:5px;cursor:pointer;border:1.5px solid ${isSim ? '#059669' : '#CBD5E1'};background:${isSim ? '#DEF7EC' : '#fff'};color:${isSim ? '#03543F' : '#64748B'}" onclick="setQuesitoAnswer(${i},'Sim')">Sim</button>
          <button type="button" class="btn" style="padding:3px 12px;font-size:11.5px;font-weight:700;border-radius:5px;cursor:pointer;border:1.5px solid ${isNao ? '#DC2626' : '#CBD5E1'};background:${isNao ? '#FDE8E8' : '#fff'};color:${isNao ? '#9B1C1C' : '#64748B'}" onclick="setQuesitoAnswer(${i},'Não')">Não</button>
        </div>
      </div>
    `;
  }).join("");

  const badge = $("agilQuesitosStatusBadge");
  if (badge) {
    const ans = QuesitoService.validate().answered;
    if (ans === 3) {
      badge.textContent = "3/3 Respondidos";
      badge.style.background = "#DCFCE7";
      badge.style.color = "#15803D";
    } else {
      badge.textContent = `${ans}/3 Respondidos`;
      badge.style.background = "#FEF3C7";
      badge.style.color = "#92400E";
    }
  }
}

function ajustarQuesitosPorParecerEReadaptacao() {
  const p = String(state.parecer || getRadio("parecer") || "FAVORÁVEL").toUpperCase();
  const isFav = p.includes("FAV");
  const isReadap = String(state.readaptado || state.aux?.readaptado || (typeof getRadio === 'function' ? (getRadio("readaptado") || getRadio("agilReadaptado")) : "") || "").trim().toLowerCase() === "sim";

  QuesitoService.set(0, "Sim");
  if (isFav) {
    QuesitoService.set(1, "Sim");
    QuesitoService.set(2, "Sim");
  } else {
    // Parecer CONTRÁRIO:
    // Se colaborador for readaptado: 1) Sim, 2) Sim, 3) Não
    // Se NÃO for readaptado: 1) Sim, 2) Não, 3) Não
    QuesitoService.set(1, isReadap ? "Sim" : "Não");
    QuesitoService.set(2, "Não");
  }
  state.quesitos = QuesitoService.get();
  renderQuesitos();
}

function ensureDefaultQuesitos(force) {
  const p = String(state.parecer || getRadio("parecer") || "FAVORÁVEL").toUpperCase();
  const isFav = p.includes("FAV");
  const isReadap = String(state.readaptado || state.aux?.readaptado || (typeof getRadio === 'function' ? (getRadio("readaptado") || getRadio("agilReadaptado")) : "") || "").trim().toLowerCase() === "sim";
  const isAgil = !document.body.classList.contains("extended-mode");
  if (isAgil || force || QuesitoService.validate().answered < 3) {
    QuesitoService.set(0, "Sim");
    if (isFav) {
      QuesitoService.set(1, "Sim");
      QuesitoService.set(2, "Sim");
    } else {
      QuesitoService.set(1, isReadap ? "Sim" : "Não");
      QuesitoService.set(2, "Não");
    }
  }
  state.quesitos = QuesitoService.get();
}

function renderQuesitos(){
  ensureFixedQuesitos(); const box=$("quesitos");
  if(box) {
    box.innerHTML=QuesitoService.get().map((q,i)=>`<div class="quesito-fixed ${q.resposta?"answered":"unanswered"}"><div class="q-title"><span>${i+1}) ${esc(q.pergunta)}</span><span class="q-state">${q.resposta?`✓ ${esc(q.resposta)}`:"Pendente"}</span></div><div class="q-answer"><label class="choice"><input type="radio" name="quesito-${i}" value="Sim" ${q.resposta==="Sim"?"checked":""} onchange="setQuesitoAnswer(${i},'Sim')"><span>Sim</span></label><label class="choice"><input type="radio" name="quesito-${i}" value="Não" ${q.resposta==="Não"?"checked":""} onchange="setQuesitoAnswer(${i},'Não')"><span>Não</span></label></div></div>`).join("");
  }
  renderAgilQuesitos();
  updateQuesitoWarning();
}
function setQuesitoAnswer(i,v){
  QuesitoService.set(i,v); const card=document.querySelectorAll(".quesito-fixed")[i]; if(card){card.classList.toggle("answered",!!QuesitoService.getAnswer(i));card.classList.toggle("unanswered",!QuesitoService.getAnswer(i));const st=card.querySelector(".q-state");if(st)st.textContent=QuesitoService.getAnswer(i)?`✓ ${QuesitoService.getAnswer(i)}`:"Pendente";}
  renderAgilQuesitos(); updateQuesitoWarning(); updateStepValidation(); if (typeof verificarCoerenciaPericial === "function") verificarCoerenciaPericial(); if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil(); autoSave();
}
function updateQuesitoWarning(){
  const box=$("quesitosWarning");if(!box)return; const qv=QuesitoService.validate();
  if(qv.answered<3) box.innerHTML=`<div class="q-warning"><strong>Quesitos incompletos</strong><br>${qv.answered}/3 respondidos. Responda os três quesitos para concluir esta etapa.</div>`;
  else if(qv.allSame) box.innerHTML='<div class="q-warning"><strong>Revisão recomendada</strong><br>As três respostas estão iguais. Isso não significa pendência: as três respostas estão registradas.</div>';
  else box.innerHTML='<div class="notice" style="margin-top:10px;background:var(--green-soft);border-color:#B8E7C8;color:#176B3B"><strong>✓ Etapa concluída</strong><br>3/3 quesitos respondidos (Sim/Não).</div>';
}

const ValidationEngine={
  get(){
    syncState();
    const q=QuesitoService.validate();
    // Índice de etapas é 1-based em todo o produto. Isso evita o bug em que
    // um bloqueio da etapa 2 aparecia como etapa 3 e assim por diante.
    const by={};
    for(let i=1;i<=9;i++) by[i]=[];
    const required=[
      [2,"Cargo",state.aux.cargo],
      [2,"Idade",state.aux.idade],
      [2,"Readaptado",state.readaptado],
      [2,"Doença que motivou o afastamento",state.aux.doencaMotivo],
      [2,"Sintomas / limitações referidos",state.aux.sintomasLimitacao],
      [4,"CID",state.aux.cid],
      [5,"Tipo de exame físico/mental",state.exameFisicoTipo],
      [6,"Limitação funcional",state.limitacaoFuncional],
      [6,"Limitação das atividades do Rol",state.limitacaoRol],
      [7,"Quesitos",q.answered===3?"respondido":""],
      [8,"Capacidade laborativa",state.capacidade],
      [8,"Justificativa Parecer Final",state.aux.justificativa],
      [8,"Parecer",state.parecer]
    ];
    required.forEach(([step,label,v])=>{
      const ok=(step===6 ? isYesNoAnswer(v) : String(v??"").trim()!=="");
      if(!ok)by[step].push(label);
    });
    if (String(state.exameFisicoTipo || "").trim().toLowerCase() === "outros") {
      const descExame = state.exameFisicoDescricao || $("exameFisicoDescricao")?.value || "";
      if (!String(descExame).trim()) {
        by[5].push("Exame Físico Geral — achados observados");
      }
    }
    const blocking=[...Object.values(by).flat(), ...q.blocking.filter(x=>!String(x).startsWith("Quesitos:"))];
    const warnings=[...q.warnings];
    const recommendations=[];
    if(q.answered===3&&q.allSame) recommendations.push("Revisar as três respostas dos quesitos com base nos achados registrados.");

    // 🛡️ Regras de Ouro e-SISLA / DPME — Coerência Pericial
    const pFinal = String(state.parecer || getRadio("parecer") || "").toUpperCase();
    const q1Ans = QuesitoService.getAnswer(0);
    const q2Ans = QuesitoService.getAnswer(1);
    const q3Ans = QuesitoService.getAnswer(2);
    
    if (pFinal === "FAVORÁVEL") {
      if (q3Ans === "Não") {
        warnings.push("🛡️ Incoerência Grave e-SISLA: Parecer FAVORÁVEL com Quesito 3 respondido como 'Não' (limitação não impede atividades). Isso gera nulidade técnica do laudo.");
      }
      if (q1Ans === "Não") {
        warnings.push("🛡️ Incoerência e-SISLA: Parecer FAVORÁVEL com Quesito 1 respondido como 'Não' (sem comprovação de doença/sequela prévia).");
      }
      if (q2Ans === "Não") {
        warnings.push("🛡️ Incoerência e-SISLA: Parecer FAVORÁVEL com Quesito 2 respondido como 'Não' (a doença não gera limitações).");
      }
    } else if (pFinal === "CONTRÁRIO") {
      if (q3Ans === "Sim") {
        warnings.push("🛡️ Incoerência Grave e-SISLA: Parecer CONTRÁRIO com Quesito 3 respondido como 'Sim' (afirma impedimento para o cargo). Contradição manifesta passível de recurso pericial.");
      }
    }

    // 📏 Limite de Caracteres e-SISLA (2.000 caracteres no Oracle do Estado)
    const checagensTexto = [
      { nome: "Queixa e Duração", texto: state.aux?.doencaMotivo || state.doencaMotivo },
      { nome: "Antecedentes Mórbidos", texto: state.aux?.historicoPregresso || state.historicoPregresso },
      { nome: "Atestado / Relatórios", texto: state.aux?.obsDocumentos || $("obsDocumentos")?.value },
      { nome: "Exame Físico Geral", texto: state.exameFisicoDescricao || $("exameFisicoDescricao")?.value },
      { nome: "Alterações Clínicas / Exames Complementares", texto: state.alteracoesClinicasExames || $("alteracoesClinicasExames")?.value },
      { nome: "Limitações / Atividades", texto: state.aux?.sintomasLimitacao || state.aux?.atividadesComprometidas || state.aux?.descLimitacao },
      { nome: "Justificativa Parecer Final", texto: state.aux?.justificativa || state.justificativa }
    ];
    checagensTexto.forEach(ct => {
      const len = String(ct.texto || "").length;
      if (len > 2000) {
        warnings.push(`📏 Limite e-SISLA Excedido: O campo '${ct.nome}' possui ${len.toLocaleString('pt-BR')} caracteres (máximo permitido: 2.000). O texto será cortado no e-SISLA.`);
      }
    });

    // 🏛️ Regra dos 90 / 180 dias de afastamento (Junta Médica / Readaptação)
    const diasAtuaisVal = parseInt(state.aux?.diasConcedidos || state.aux?.diasSolicitados || $("agilDiasSolicitados")?.value || $("diasSolicitados")?.value || 0, 10) || 0;
    const diasHistVal = window._diasHistoricoAcumulado || 0;
    const totalAfastamento = diasAtuaisVal + diasHistVal;
    if (totalAfastamento >= 180) {
      warnings.push(`🚨 Alerta DPME / Lei 10.261/68: Afastamento acumulado de ${totalAfastamento} dias (≥ 180 dias). Avaliação obrigatória por Junta Médica para Readaptação Funcional.`);
    } else if (totalAfastamento >= 90) {
      recommendations.push(`🏛️ Diretriz DPME (Afastamento ≥ 90 dias): Servidor acumula ${totalAfastamento} dias de afastamento. Recomenda-se registrar sugestão de Junta Médica para Readaptação.`);
    }
    const stepData=Object.fromEntries(Object.entries(by).map(([step,items])=>[step,{status:items.length?"PENDENTE":"CONCLUIDA",pending:items,count:items.length}]));
    return {valid:blocking.length===0,blocking,warnings,recommendations,steps:stepData,quesitos:q,score:Math.max(0,Math.round((13-blocking.length)/13*100))};
  },
  summary(){ return this.get(); }
};
function getMissingByStep(){
  const result=ValidationEngine.get();
  const out=Array.from({length:10},()=>[]);
  Object.entries(result.steps||{}).forEach(([step,data])=>{ out[Number(step)]=data.pending||[]; });
  return out;
}
function focusValidationItem(step,label){
  go(Number(step));
  const labels={
    "CRM/CRO do médico assistente":"crmCro",
    "CID":"cid",
    "Data do atestado/relatório":"dataDocumento",
    "Dias solicitados":"diasSolicitados",
    "Cargo":"cargo",
    "Idade":"idade",
    "Doença que motivou o afastamento":"doencaMotivo",
    "Início do tratamento":"inicioTratamento",
    "Sintomas / limitações referidos":"sintomasLimitacao",
    "Tipo de exame físico/mental":"exameFisicoTipo",
    "Exame Físico Geral — achados observados":"exameFisicoDescricao",
    "Alterações clínicas / exames complementares":"alteracoesClinicasExames",
    "Limitação funcional":"limitacaoFuncional",
    "Limitação das atividades do Rol":"limitacaoRol",
    "Capacidade laborativa":"capacidade",
    "Justificativa Parecer Final":"justificativa",
    "Parecer":"parecer"
  };
  const id=labels[label];
  if(id){ setTimeout(()=>{ const el=$(id); if(el){el.scrollIntoView({block:"center",behavior:"smooth"}); try{el.focus({preventScroll:true});}catch(_){} } },80); return; }
  if(label==="Readaptado"){setTimeout(()=>$("readaptado")?.scrollIntoView({block:"center",behavior:"smooth"}),80);}
  if(label==="Quesitos"){setTimeout(()=>$("quesitos")?.scrollIntoView({block:"center",behavior:"smooth"}),80);}
}

function renderParecerHint(){
  const p = getRadio("parecer");
  if (p === "FAVORÁVEL" || p === "CONTRÁRIO") {
    state.parecer = p;
    state.parecerManualOverride = p;
    if (!state.aux) state.aux = {};
    state.aux.parecer = p;
    setRadio("agilParecer", p);
    if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") {
      atualizarEstiloBotoesParecerDataAntiga();
    }
  }

  $("parecerHint").textContent = p === "CONTRÁRIO"
    ? "Parecer CONTRÁRIO selecionado. Garanta que a justificativa esteja preenchida e coerente com os achados."
    : p === "FAVORÁVEL"
      ? (state.outrosResultado === "Normal" ? "Parecer FAVORÁVEL selecionado (Homologação Retrospectiva com Exame Físico Normal)." : "Parecer FAVORÁVEL selecionado. Garanta que a justificativa esteja preenchida e coerente com os achados.")
      : "Selecione o parecer definido pelo médico.";

  if (p === "FAVORÁVEL") {
    state.limitacaoFuncional = "Sim";
    state.limitacaoRol = "Sim";
    setRadio("limitacaoFuncional", "Sim");
    setRadio("limitacaoRol", "Sim");
    state.capacidade = "Capacidade parcial e temporariamente prejudicada";
    setRadio("capacidade", "Capacidade parcial e temporariamente prejudicada");
    if (typeof QuesitoService !== "undefined") {
      QuesitoService.set(0, "Sim");
      QuesitoService.set(1, "Sim");
      QuesitoService.set(2, "Sim");
      if (typeof renderQuesitos === "function") renderQuesitos();
    }
    const curLim = state.descLimitacao || state.aux?.descLimitacao || "";
    if (!curLim || isContraryLimitationText(curLim)) {
      const novaLim = (typeof gerarNarrativaLimitacoesMelhoriaContinua === "function") ? gerarNarrativaLimitacoesMelhoriaContinua(state, values()) : "";
      if (novaLim) {
        state.descLimitacao = novaLim;
        if (!state.aux) state.aux = {};
        state.aux.descLimitacao = novaLim;
        if ($("descLimitacao")) $("descLimitacao").value = novaLim;
        if ($("agilSintomasLimitacao")) $("agilSintomasLimitacao").value = novaLim;
      }
    }
    if (state.outrosResultado === "Normal") {
      if (typeof concederMesmosDiasAtestado === "function") concederMesmosDiasAtestado();
    }
  }
}

function values(){
  syncState();
  const a = state.aux || {};
  return {
    atendimento: state.atendimento,
    dataAtendimento: a.dataAtd,
    horaInicio: a.horaAtd,
    medicoResponsavel: state.medico,
    crmResponsavel: a.crmResponsavel,
    nomePaciente: a.nomePaciente || state.nomePaciente || "",
    cpfPaciente: a.cpfPaciente || state.cpfPaciente || "",
    cargo: a.cargo,
    tempoCargo: a.tempoCargo,
    unidadeTempo: a.tempoUnidade,
    idade: a.idade,
    readaptado: state.readaptado,
    atividadesReadaptado: a.atividadesReadaptado,
    queixaDuracao: a.queixaDuracao || state.queixaDuracao || "",
    doencaMotivo: a.doencaMotivo,
    inicioTratamento: a.inicioTratamento,
    frequenciaConsultas: a.freqConsultas,
    sintomasLimitacao: a.sintomasLimitacao,
    medicamentos: state.medications,
    alteracaoDosagem: state.alteracaoMed,
    dataAlteracaoMed: a.dataAlteracaoMed,
    obsAlteracaoMed: a.obsAlteracaoMed,
    psicoterapia: state.psicoterapia,
    fisioterapia: state.fisioterapia,
    obsTerapias: a.obsTerapias,
    outrasDoencas: state.outrasDoencas,
    condicoes: state.conditions,
    historicoPregresso: a.historicoPregresso || state.historicoPregresso || "",
    crmCro: a.crmCro,
    cid: a.cid || state.cid || "",
    cidsSecundarios: state.cidsSecundarios || [],
    dataDocumento: a.dataDocumento,
    diasSolicitados: a.diasSolicitados,
    obsDocumentos: a.obsDocumentos,
    documentosComplementares: state.documentosComplementares,
    exame: state.exam,
    exameFisicoTipo: state.exameFisicoTipo || a.exameFisicoTipo || "",
    outrosSubtipo: state.outrosSubtipo || a.outrosSubtipo || state.areaExameClinico || a.areaExameClinico || "",
    outrosResultado: state.outrosResultado || a.outrosResultado || state.resultadoAvaliacao || a.resultadoAvaliacao || "",
    areaExameClinico: state.areaExameClinico || a.areaExameClinico || state.outrosSubtipo || a.outrosSubtipo || "",
    resultadoAvaliacao: state.resultadoAvaliacao || a.resultadoAvaliacao || state.outrosResultado || a.outrosResultado || "",
    exameMentalResultado: state.exameMentalResultado || a.exameMentalResultado || "",
    osteomuscularResultado: state.osteomuscularResultado || a.osteomuscularResultado || "",
    osteomuscularRegioes: state.osteomuscularRegioes || a.osteomuscularRegioes || {},
    altura: state.altura || a.altura || state.agilAltura || a.agilAltura || state.biotipoAltura || "",
    peso: state.peso || a.peso || state.agilPeso || a.agilPeso || state.biotipoPeso || "",
    exameFisicoDescricao: state.exameFisicoDescricao || a.exameFisicoDescricao || "",
    pressaoSistolica: a.pressaoSistolica || state.pressaoSistolica || "",
    pressaoDiastolica: a.pressaoDiastolica || state.pressaoDiastolica || "",
    pulso: a.pulso || state.pulso || "",
    alteracoesClinicasExames: state.alteracoesClinicasExames || a.alteracoesClinicasExames || "",
    limitacaoFuncional: state.limitacaoFuncional,
    descLimitacao: a.descLimitacao || state.descLimitacao || "",
    limitacaoRol: state.limitacaoRol,
    atividadesComprometidas: a.atividadesComprometidas || state.atividadesComprometidas || "",
    obsLimitacoes: a.obsLimitacoes || state.obsLimitacoes || "",
    quesitos: state.quesitos,
    capacidade: state.capacidade,
    justificativa: a.justificativa || state.justificativa || "",
    parecer: state.parecer,
    finalizado: !!state.finalizado,
    finalizadoEm: state.finalizadoEm || "",
    aux: a
  };
}

function missingFields(){return ValidationEngine.get().blocking;}
function renderReview(){
  syncState();
  syncQuesitoStateFromDOM();
  const validation=ValidationEngine.get();
  const byStep=validation.steps;
  if($("reviewWarnings") && isFinalizedReadOnly()){
    const lockedNotice='<div class="notice" style="margin-bottom:8px;background:#F4F7FB;border-color:#C9D7E8;color:#33526E"><strong>Modo leitura.</strong><br>Este atendimento está finalizado. A prévia, exportação e análises de apoio permanecem disponíveis; alterações exigem reabertura pela Gestão.</div>';
    $("reviewWarnings").innerHTML=lockedNotice+($("reviewWarnings").innerHTML||"");
  }
  const miss=validation.blocking;const rs=$("reviewStatus");if(rs){rs.className=`review-status ${miss.length?"error":"ok"}`;rs.innerHTML=`<span class="review-symbol">${miss.length?"🔴":"🟢"}</span><span>${miss.length?`Existem ${miss.length} pendência(s) que impedem a finalização.`:"Sem pendências críticas nos campos obrigatórios."}</span>`;}
  $("reviewWarnings").innerHTML=(miss.length?`<div class="notice warning"><strong>Bloqueios de finalização: ${miss.length}</strong><div style="margin-top:7px">${Object.entries(byStep).slice(0).flatMap(([step,item])=>(item.pending||[]).map(x=>`<button type="button" class="btn btn-outline" style="margin:3px 6px 3px 0;padding:5px 8px;font-size:10px" onclick="focusValidationItem(${step},${JSON.stringify(x)})">Etapa ${step}: ${esc(x)}</button>`)).join("")}</div></div>`:`<div class="notice" style="background:var(--green-soft);border-color:#B8E7C8;color:#176B3B"><strong>✓ Nenhum bloqueio estrutural.</strong></div>`)+((validation.warnings||[]).length?`<div class="notice warning" style="margin-top:8px"><strong>Alertas:</strong><ul style="margin:6px 0 0 18px">${validation.warnings.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:"")+((validation.recommendations||[]).length?`<div class="notice" style="margin-top:8px"><strong>Revisões recomendadas:</strong><ul style="margin:6px 0 0 18px">${validation.recommendations.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:"");

  const qv=getQuesitoValidation();
  const qSummary=qv.answered===3 ? (qv.allSame ? "Revisão necessária: as três respostas estão iguais." : "Quesitos respondidos: respostas Sim/Não registradas.") : `Quesitos respondidos: ${qv.answered}/3.`;
  const qSummaryBox=$("quesitosReviewSummary"); if(qSummaryBox) qSummaryBox.textContent=qSummary;
  const v=values();
  const ex = Object.values(v.exame||{}).filter(x=>x?.value).map(x=>x.value).join(" | ");
  const cards = [
    ["Identificação",[
      ["Atendimento",v.atendimento],["Data",formatDate(v.dataAtendimento)],["Médico",v.medico],["CRM/CRO responsável",v.crmResponsavel]
    ]],
    ["Queixa e duração",[
      ["Cargo",v.cargo],["Tempo no cargo",v.tempoCargo?`${v.tempoCargo} ${v.unidadeTempo}`:""],["Idade",v.idade],["Readaptado",v.readaptado],
      ["Atividades atuais",v.atividadesReadaptado],["Queixa e duração",v.queixaDuracao],["Doença",v.doencaMotivo],["Início do tratamento",formatDate(v.inicioTratamento)],
      ["Frequência das consultas",v.frequenciaConsultas],["Sintomas",v.sintomasLimitacao]
    ]],
    ["Antecedentes / documentação",[
      ["Outras doenças",v.outrasDoencas],["Condições",v.condicoes.map(c=>`${c.nome} — ${c.tratamento}`).join("; ")], ["Antecedentes mórbidos",v.historicoPregresso],
      ["CRM/CRO assistente",v.crmCro],["CID",v.cid + (v.cidsSecundarios && v.cidsSecundarios.length ? " (Outros CIDs: " + v.cidsSecundarios.map(s => typeof s === "object" ? `${s.cid}${s.descricao ? " - " + s.descricao : ""}` : s).join(", ") + ")" : "")],["Data documento",formatDate(v.dataDocumento)],["Dias",v.diasSolicitados]
    ]],
    ["Limitações",[
      ["Limitação funcional",v.limitacaoFuncional],["Descrição da limitação",v.descLimitacao],["Alterações clínicas / exames",v.alteracoesClinicasExames],["Limitação no Rol",v.limitacaoRol],["Atividades comprometidas",v.atividadesComprometidas],["Observações",v.obsLimitacoes]
    ]],
    ["Justificativa / parecer",[
      ["Capacidade",v.capacidade],["Justificativa",v.justificativa],["Parecer",v.parecer]
    ]],
    ["Exame físico/mental",[
      ["Categoria selecionada",v.exameFisicoTipo||"—"],
      ["Descrição",v.exameFisicoDescricao||v.alteracoesClinicasExames||"—"]
    ]],
    ["Resposta aos quesitos",(v.quesitos||[]).slice(0,3).map((q,i)=>[`Q${i+1}`,q.resposta||"Pendente"])],
    ["Documentação",(v.documentosComplementares||[]).map((d,i)=>[`Documento ${i+1}`,[d.tipo,d.data, d.resultado].filter(Boolean).join(" — ")]).slice(0,5)]
  ];
  $("reviewGrid").innerHTML=cards.map(c=>`<div class="review-card"><h3>${c[0]}</h3>${c[1].map(r=>`<div class="review-row"><b>${esc(r[0])}</b><span>${esc(r[1]||"—")}</span></div>`).join("")}</div>`).join("");
}

function openHistory(){
  $("historyDraft").value=$("historicoPregresso").value||"";
  $("historyModal").classList.add("show");
}
function closeModal(id){$(id).classList.remove("show")}
function applyHistory(){
  $("historicoPregresso").value=$("historyDraft").value;
  closeModal("historyModal");autoSave();toast("Histórico aplicado ao formulário.");
}

function exportJSON(){
  const data=values();
  data.exportadoEm=new Date().toISOString();
  data.finalizado=state.finalizado||false;
  download(`ATD-${data.atendimento||"sem-numero"}.json`,JSON.stringify(data,null,2),"application/json;charset=utf-8");
}
function download(name,content,type){
  const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

function printText(v){
  const t=String(v??"").trim();
  return t ? esc(t).replace(/\n/g,"<br>") : "—";
}
function printField(label,value,opts={}){
  const t=String(value??"").trim();
  if(!t && !opts.showEmpty) return "";
  const cls=opts.emphasis?" print-field emphasis":" print-field";
  return `<div class="${cls}"><span class="print-label">${esc(label)}</span><span class="print-value">${t?printText(t):"—"}</span></div>`;
}
function printBullet(text){
  const t=String(text??"").trim();
  return t?`<li>${printText(t)}</li>`:"";
}
function printSection(title,body,opts={}){
  if(!body || !String(body).replace(/<[^>]*>/g,"").trim()) return "";
  return `<section class="print-section${opts.highlight?" highlight":""}"><h2>${esc(title)}</h2>${body}</section>`;
}
function buildPrint(){
  const v=values();
  const compact=(value)=>String(value??"").trim();
  const meds=(v.medicamentos||[]).filter(m=>compact(m.medicamento)).map(m=>{
    const base=[compact(m.medicamento),compact(m.dosagem),compact(m.frequencia)].filter(Boolean).join(" • ");
    return base + (compact(m.observacao)?` — ${esc(m.observacao)}`:"");
  });
  const cond=(v.condicoes||[]).filter(c=>compact(c.nome)).map(c=>`${esc(c.nome)}${compact(c.tratamento)?` — ${esc(c.tratamento)}`:""}`);
  const examType=v.exameFisicoTipo||v.exame?.selected||"";
  const examHtml=examType?`<div class="print-exam-single"><b>${esc(examType)}</b>${(v.exameFisicoDescricao||v.alteracoesClinicasExames)?`<div style="margin-top:3px">${printText(v.exameFisicoDescricao||v.alteracoesClinicasExames)}</div>`:""}</div>`:'<p class="print-muted">Nenhum tipo de exame selecionado.</p>';
  const ques=(v.quesitos||[]).filter(q=>compact(q.pergunta)||compact(q.resposta));
  const quesHtml=ques.length?`<div class="print-quesitos">${ques.map((q,i)=>`<div class="print-quesito"><strong>${i+1}.</strong><div><b>Quesito</b><div>${printText(q.pergunta||"—")}</div>${compact(q.resposta)?`<b class="answer-label">Resposta</b><div>${printText(q.resposta)}</div>`:""}</div></div>`).join("")}</div>`:'<p class="print-muted">Nenhum quesito registrado.</p>';

  const synthesis=[
    printField("Idade",v.idade),
    printField("Cargo",v.cargo),
    printField("CID",v.cid + (v.cidsSecundarios && v.cidsSecundarios.length ? " (Outros CIDs: " + v.cidsSecundarios.map(s => typeof s === "object" ? `${s.cid}${s.descricao ? " - " + s.descricao : ""}` : s).join(", ") + ")" : "")),
    printField("Dias solicitados",v.diasSolicitados),
    printField("Capacidade laborativa",v.capacidade,{emphasis:true}),
    printField("Parecer",v.parecer,{emphasis:true})
  ].join("");

  const context=[
    printField("Doença / motivo",v.doencaMotivo),
    printField("Sintomas e limitações",v.sintomasLimitacao),
    printField("Início do tratamento",formatDate(v.inicioTratamento)),
    printField("Frequência das consultas",v.frequenciaConsultas),
    printField("Medicações",meds.join("\n")),
    printField("Terapias",[
      v.psicoterapia?"Psicoterapia":"",
      v.fisioterapia?"Fisioterapia":""
    ].filter(Boolean).join(" • ")),
    printField("Outras condições",cond.join("\n")),
    printField("Histórico pregresso",v.historicoPregresso)
  ].join("");

  const limitation=[
    printField("Limitação funcional",v.limitacaoFuncional),
    printField("Descrição",v.descLimitacao),
    printField("Limitação no rol",v.limitacaoRol),
    printField("Atividades comprometidas",v.atividadesComprometidas),
    printField("Observações",v.obsLimitacoes)
  ].join("");

  const docsHtml=(v.documentosComplementares||[]).filter(d=>compact(d.tipo)||compact(d.data)||compact(d.resultado)).map(d=>`<div class="print-field"><span class="print-label">${esc([compact(d.tipo),formatDate(d.data)].filter(Boolean).join(" — "))}</span><span class="print-value">${printText(d.resultado||"—")}</span></div>`).join("");
  const doc=[
    printField("Médico assistente",v.crmCro),
    printField("Data do documento",formatDate(v.dataDocumento)),
    docsHtml,
    printField("Observações",v.obsDocumentos)
  ].join("");

  const justification=printField("Justificativa pericial",v.justificativa,{emphasis:true});
  const administrative=[
    printField("Atendimento",v.atendimento),
    printField("Data",formatDate(v.dataAtendimento)),
    printField("Horário",v.horaInicio),
    printField("Médico responsável",v.medicoResponsavel),
    printField("Tempo no cargo",[v.tempoCargo,v.unidadeTempo].filter(Boolean).join(" ")),
    printField("Readaptado",v.readaptado),
    printField("Atividades atuais",v.atividadesReadaptado)
  ].join("");

  const aiNote=`<div class="print-disclaimer"><b>Nota:</b> O documento reproduz as informações registradas no atendimento. O CID é elemento de contextualização clínica e não determina, isoladamente, incapacidade laborativa ou nexo causal.</div>`;

  $("printArea").innerHTML=`
    <div class="print-document">
      <header class="print-header">
        <div class="print-brand">
          <img src="${LOGO_DATA}" alt="Ambiental">
          <div><div class="print-kicker">AMBIENTAL</div><h1>Avaliação Médica Pericial — LTS</h1><p>Documento de síntese pericial</p></div>
        </div>
        <div class="print-doc-id"><b>${esc(v.atendimento||"—")}</b><span>${esc(formatDate(v.dataAtendimento)||"—")}</span></div>
      </header>

      <div class="print-summary">${synthesis}</div>

      ${printSection("1 — Identificação e contexto do atendimento",administrative)}
      ${printSection("2 — Antecedentes mórbidos",`${printField("Paciente",v.nomePaciente)}${printField("CPF",v.cpfPaciente)}<div class="print-field"><span class="print-label">Queixa e duração</span><span class="print-value">${printText(v.queixaDuracao)}</span></div>${context}`)}
      ${printSection("3 — Atestado / Relatório / Exames Complementares",doc)}
      ${printSection("4 — Exame Físico Geral / Mental",examHtml)}
      ${printSection("5 — Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares",printField("Descrição",v.alteracoesClinicasExames))}
      ${printSection("6 — Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)",limitation)}
      ${printSection("7 — Resposta aos quesitos",quesHtml)}
      ${printSection("8 — Justificativa Parecer Final",`${justification}<div class="print-verdict"><span>Capacidade</span><strong>${esc(v.capacidade||"—")}</strong><span>Parecer</span><strong>${esc(v.parecer||"—")}</strong></div><div class="print-legal">Parecer emitido pelo Coordenador de Ingresso, Licenças, Readaptação e Aposentadoria, à vista do que prevê o artigo 32, do Decreto nº 69.234, de 23/12/2024 c/c o artigo 95, da Resolução SGGD 25, de 16/05/2025.</div>`,{highlight:true})}
      ${aiNote}
      <footer class="print-footer"><span>Ambiental — Avaliação Médica Pericial LTS</span><span>Documento gerado para conferência e impressão.</span></footer>
    </div>`;
}
function reportPrintCSS(){return `body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#172033} .print-document{max-width:210mm;margin:0 auto;padding:10mm;font-size:10.5pt;line-height:1.42}.print-header{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:2px solid #0A4A8A;padding-bottom:12px;margin-bottom:14px}.print-brand{display:flex;align-items:center;gap:12px}.print-header img{width:56px;height:56px;object-fit:contain}.print-kicker{font-size:9px;font-weight:800;letter-spacing:.16em;color:#0A4A8A}.print-title h1{font-size:16px;margin:2px 0;color:#0A4A8A}.print-title p{margin:2px 0;color:#64748B}.print-doc-id{text-align:right;display:flex;flex-direction:column;gap:3px}.print-summary{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:12px}.print-field{display:grid;grid-template-columns:140px 1fr;gap:8px;padding:5px 0;border-bottom:1px solid #edf0f4}.print-summary .print-field{display:block;border:1px solid #dde5ee;border-radius:7px;padding:7px;min-height:44px}.print-summary .print-label{display:block;font-size:8px;color:#64748B;text-transform:uppercase;letter-spacing:.04em}.print-summary .print-value{font-weight:800}.print-section{border:1px solid #dfe5eb;border-radius:8px;padding:9px 10px;margin:0 0 9px;break-inside:avoid}.print-section h2{margin:0 0 7px;color:#0A4A8A;font-size:11px;border-bottom:1px solid #e8edf2;padding-bottom:5px}.print-label{font-weight:700;color:#334155}.print-value{white-space:pre-wrap}.print-exam-single{padding:7px;background:#f7fafc;border:1px solid #e6edf3;border-radius:6px}.print-quesito{display:grid;grid-template-columns:26px 1fr;gap:6px;padding:7px 0;border-bottom:1px solid #eef2f5}.print-quesito:last-child{border-bottom:0}.answer-label{display:block;margin-top:4px;color:#475569}.print-verdict{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:8px 12px;align-items:center;margin-top:9px;padding:9px;border-radius:7px;background:#f5f8fb}.print-verdict span{font-size:8px;text-transform:uppercase;color:#64748B;font-weight:800}.print-verdict strong{font-size:11px}.print-legal{margin-top:9px;padding-top:8px;border-top:1px dashed #cbd5e1;font-size:8.5pt;color:#475569}.print-disclaimer{margin-top:10px;padding:7px 9px;border:1px solid #dbe5ee;background:#f8fafc;border-radius:7px;font-size:8.5pt;color:#475569}.print-footer{display:flex;justify-content:space-between;gap:10px;border-top:1px solid #dfe5eb;margin-top:12px;padding-top:7px;color:#64748B;font-size:8pt}@media print{.print-document{padding:0;max-width:none}.print-summary{grid-template-columns:repeat(6,1fr)}}`;}
function printDocument(){openFinalReport();}
function buildReportHTML(){buildPrint();const v=values();return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Final — ${esc(v.atendimento||"Ambiental")}</title><style>${reportPrintCSS()}</style></head><body>${$("printArea")?.innerHTML||""}</body></html>`;}
function sanitizeAIReport(html){
  const allowed=new Set(["H2","H3","P","STRONG","TABLE","THEAD","TBODY","TR","TH","TD","UL","LI","DIV"]);
  const tpl=document.createElement("template");
  tpl.innerHTML=String(html||"").replace(/<\/??(?:html|head|body|script|style)[^>]*>/gi,"");
  const walk=(node)=>{
    [...node.children].forEach(el=>{
      if(!allowed.has(el.tagName)){
        const frag=document.createDocumentFragment(); while(el.firstChild)frag.appendChild(el.firstChild); el.replaceWith(frag); walk(node); return;
      }
      [...el.attributes].forEach(a=>el.removeAttribute(a.name));
      walk(el);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML.trim();
}
async function openFinalReport(){
  syncState(); syncQuesitoStateFromDOM();
  const miss=missingFields();
  if(miss.length){go(9);renderReview();toast("Há campos pendentes. Revise antes de visualizar o relatório.");return;}
  const w=window.open("","_blank");
  if(!w){toast("O navegador bloqueou a pré-visualização. Permita pop-ups para o Ambiental.");return;}
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Gerando relatório — ${esc(state.atendimento||"Ambiental")}</title><style>${reportPrintCSS()} .ai-report-status{max-width:210mm;margin:25mm auto;padding:18px;border:1px solid #dfe5eb;border-radius:8px;font:12px Arial;color:#475569;background:#f8fafc}</style></head><body><div class="ai-report-status">Gerando relatório pericial com os dados registrados no atendimento…</div></body></html>`);
  w.document.close();
  try{
    const payload=JSON.parse(JSON.stringify(state));
    payload.quesitos=QuesitoService.get();
    const r=await AmbientalAuth.authFetch(`${getApiBase()}/api/gerar-relatorio-final`,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
    const d=await r.json().catch(()=>null);
    if(!r.ok || !d?.relatorio) throw new Error(d?.error?.detail||d?.error?.message||"Não foi possível gerar o relatório com IA.");
    const report=sanitizeAIReport(d.relatorio);
    if(!report) throw new Error("A IA retornou um relatório vazio.");
    const title=`Relatório Final — ${esc(state.atendimento||"Ambiental")}`;
    w.document.open();
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>${reportPrintCSS()} .ai-generated-report{max-width:210mm;margin:0 auto;padding:10mm;font-size:10.5pt;line-height:1.5}.ai-generated-report h2{font-size:13pt;color:#0A4A8A;border-bottom:2px solid #0A4A8A;padding-bottom:6px;margin:0 0 12px}.ai-generated-report h3{font-size:11pt;color:#0A4A8A;margin:18px 0 7px;padding-bottom:4px;border-bottom:1px solid #e5eaf0}.ai-generated-report p{margin:7px 0}.ai-generated-report table{width:100%;border-collapse:collapse;margin:8px 0 14px}.ai-generated-report th,.ai-generated-report td{border:1px solid #dfe5eb;padding:7px;text-align:left;vertical-align:top}.ai-generated-report th{background:#f5f8fb;font-size:9pt}.ai-generated-report strong{font-weight:800}.ai-generated-report ul{margin:6px 0 10px 20px}</style></head><body><main class="ai-generated-report">${report}</main></body></html>`);
    w.document.close(); w.focus();
  }catch(e){
    w.close();
    toast(e.message||"Não foi possível gerar o relatório.");
    // Fallback local: o relatório estrutural já registrado continua disponível.
    const fallback=buildReportHTML(); const fw=window.open("","_blank"); if(fw){fw.document.open();fw.document.write(fallback);fw.document.close();fw.focus();}
  }
}
async function downloadFinalPDF(){ const miss=missingFields();if(miss.length){go(9);renderReview();toast("Há bloqueios críticos; corrija-os antes do PDF.");return;} const html=buildReportHTML(); try{setAIStatus("loading","Gerando PDF...");const r=await AmbientalAuth.authFetch(`${getApiBase()}/api/relatorios/pdf`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({atendimento:state.atendimento,html})});if(!r.ok)throw new Error("Falha ao gerar PDF");const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`ATD-${state.atendimento||"Ambiental"}.pdf`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast("PDF gerado com sucesso.");}catch(e){toast("Não foi possível gerar o PDF pelo servidor. Abra a prévia e use Imprimir → Salvar como PDF.");openFinalReport();}finally{setAIStatus("online","Sistema Online");}}
function previewFinalReport(){const miss=missingFields();if(miss.length){go(9);renderReview();toast("Há campos pendentes. Revise antes de visualizar o relatório.");return;}openFinalReport();}
function finalizeFromHeader(){if(isFinalizedReadOnly()){toast("Atendimento já finalizado. Reabra pela Gestão para editar.");return;}if(currentAttendanceMode === "agil"){finalizarAtendimentoAgil();return;}go(9);setTimeout(openFinalizeDialog,100);}
function openFinalizeDialog(){
  const validation=ValidationEngine.get();
  if(!validation.valid){
    renderReview();
    toast("Há bloqueios críticos. Revise o checklist antes de finalizar.");
    return;
  }
  syncState();
  const q=getQuesitoValidation();
  const el=$("finalizeSummary");
  if(!el)return;
  const items=[
    ["Atendimento",state.atendimento],
    ["Situação","Todos os campos obrigatórios preenchidos"],
    ["Quesitos",`${q.answered}/3 respondidos`],
    ["Capacidade laborativa",state.capacidade||"Não definida"],
    ["Parecer",state.parecer||"Não definido"],
    ["Inconsistências críticas",String(validation.blocking.length)],
    ["Documento final",missingFields().length?"Pendente":"Disponível para visualização"]
  ];
  el.innerHTML=items.map(([l,v])=>`<div class="finalize-item"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("");
  const fo = $("finalizeOverlay");
  if(fo){
    fo.classList.add("open");
    fo.setAttribute("aria-hidden", "false");
    const confirmBtn = $("confirmFinalizeBtn");
    if(confirmBtn){
      setTimeout(() => { try { confirmBtn.focus(); } catch(_) {} }, 50);
    }
  }
}
function closeFinalizeDialog(){
  const fo = $("finalizeOverlay");
  if(fo){
    if(document.activeElement && fo.contains(document.activeElement)){
      document.activeElement.blur();
    }
    fo.classList.remove("open");
    fo.setAttribute("aria-hidden", "true");
  }
}
function openFinalizeProgress(){const o=$("finalizeProgressOverlay");if(!o)return;o.classList.remove("success");o.classList.add("open");o.setAttribute("aria-hidden","false");$("finalizeProgressTitle").textContent="Finalizando atendimento";$("finalizeProgressSubtitle").textContent="Salvando os dados e registrando a finalização com segurança.";$("fpStepSave").className="finalize-progress-step active";$("fpStepFinalize").className="finalize-progress-step";$("fpStepDone").className="finalize-progress-step";}
function setFinalizeProgress(stage,title,subtitle){const t=$("finalizeProgressTitle"),sub=$("finalizeProgressSubtitle");if(t)t.textContent=title;if(sub)sub.textContent=subtitle;const map={save:"fpStepSave",finalize:"fpStepFinalize",done:"fpStepDone"};Object.entries(map).forEach(([key,id])=>{const el=$(id);if(!el)return;el.className="finalize-progress-step "+(key===stage?"active":(["save","finalize","done"].indexOf(key)<["save","finalize","done"].indexOf(stage)?"done":""));});}
function closeFinalizeProgress(){const o=$("finalizeProgressOverlay");if(!o)return;o.classList.remove("open","success");o.setAttribute("aria-hidden","true");}
function finalizeGoBack(){
    const impId = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ambiental.impersonate_medico_id') : null) || new URLSearchParams(location.search).get('medico_id') || new URLSearchParams(location.search).get('impersonate_medico_id');
    if (impId) {
        window.location.href = `/gestao_medicos.html?impersonate_medico_id=${encodeURIComponent(impId)}`;
        return;
    }
    if (currentProfile && currentProfile.perfil === "Médico") {
        window.location.href = "/gestao_medicos.html";
    } else {
        window.location.href = "/gestao";
    }
}
async function confirmFinalize(){const btn=$("confirmFinalizeBtn");if(btn)btn.disabled=true;let progressOpened=false;try{if(isFinalizedReadOnly()){closeFinalizeDialog();return;}const validation=ValidationEngine.get();if(!validation.valid){closeFinalizeDialog();renderReview();toast("Há bloqueios críticos.");return;}closeFinalizeDialog();openFinalizeProgress();progressOpened=true;syncState();
if(!state.atendimento){
  state.atendimento=generateId();
  $("atd").value=state.atendimento;
  $("atdNumber").textContent=state.atendimento;
}
setFinalizeProgress("save","Salvando atendimento","Sincronizando a última versão com o servidor…");
await syncToRegistry();
const saved=await syncToServer(true);if(!saved.ok){const errDetail=saved.error?.message||saved.error?.code||"";throw new Error(errDetail ? `Não foi possível confirmar o atendimento no servidor: ${errDetail}` : "Não foi possível confirmar o atendimento no servidor.");}let current=workflowStatus();if(current==="RASCUNHO"||current==="REABERTO"){setFinalizeProgress("finalize","Preparando finalização","Registrando a revisão final do atendimento…");const rr=await AmbientalAuth.authFetch(`${getApiBase()}/api/atendimentos/${encodeURIComponent(state.atendimento)}/state`,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({estado:"EM_REVISÃO",motivo:"Entrada na revisão final",versao:state.__serverVersion ?? undefined})});const rd=await rr.json().catch(()=>null);if(!rr.ok||!rd?.success)throw new Error(rd?.error?.message||"Não foi possível colocar o atendimento em revisão.");state.__serverVersion=Number(rd?.data?.versao||state.__serverVersion||1);state.workflowStatus="EM_REVISÃO";}setFinalizeProgress("finalize","Finalizando atendimento","Confirmando o atendimento definitivamente no servidor…");const r=await AmbientalAuth.authFetch(`${getApiBase()}/api/atendimentos/${encodeURIComponent(state.atendimento)}/state`,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({estado:"FINALIZADO",motivo:"Finalização do atendimento",versao:state.__serverVersion ?? undefined})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.success){const bs=d?.error?.details?.bloqueios||[];if(bs.length){closeFinalizeProgress();renderReview();toast(`Finalização bloqueada: ${bs.map(x=>`${x.campo} (etapa ${x.etapa})`).join("; ")}`);return;}throw new Error(d?.error?.message||"O servidor recusou a finalização.");}if(d?.data?.status!=="FINALIZADO")throw new Error("O servidor não confirmou o estado FINALIZADO.");state.__serverVersion=Number(d?.data?.versao||state.__serverVersion||1);state.workflowStatus="FINALIZADO";state.finalizado=true;state.finalizadoEm=d?.data?.atualizado_em||new Date().toISOString();state.__serverSyncedAt=new Date().toISOString();await syncToRegistry();applyState();setPersistStatus("ok","Atendimento finalizado");setFinalizeProgress("done","Atendimento finalizado!","Tudo foi salvo com sucesso. Preparando a Gestão Médica…");const o=$("finalizeProgressOverlay");o?.classList.add("success");toast("Atendimento finalizado pelo servidor.");await new Promise(resolve=>setTimeout(resolve,1300));finalizeGoBack();}catch(e){if(progressOpened)closeFinalizeProgress();toast(e.message||"Falha ao finalizar atendimento.");}finally{if(btn)btn.disabled=false;}}

function formatCPF(value){ const digits=String(value||"").replace(/\D/g,"").slice(0,11); if(digits.length<=3)return digits; if(digits.length<=6)return digits.slice(0,3)+"."+digits.slice(3); if(digits.length<=9)return digits.slice(0,3)+"."+digits.slice(3,6)+"."+digits.slice(6); return digits.slice(0,3)+"."+digits.slice(3,6)+"."+digits.slice(6,9)+"-"+digits.slice(9); }
$("cpfPaciente")?.addEventListener("input",e=>{ e.target.value=formatCPF(e.target.value); autoSave(); });
function newEmptyState(){
  state.current = 1;
  state.atendimento = generateId();
  delete state.__serverId;
  delete state.__serverVersion;
  delete state.__serverSyncedAt;
  state.medico = "";
  state.capacidade = "";
  state.parecer = "";
  state.finalizado = false;
  state.finalizadoEm = "";
  state.workflowStatus = "RASCUNHO";
  state.statusHistory = [];
  state.medications = [];
  state.conditions = [];
  state.quesitos = [];
  state.exam = {};
  state.documentosComplementares = [];
  state.exameFisicoTipo = "";
  state.exameFisicoDescricao = "";
  state.alteracoesClinicasExames = "";
  state.queixaDuracao = "";
  state.aux = {};
  state.exameMentalResultado = "";
  state.osteomuscularRegioes = {};
  state.osteomuscularResultado = "";

  const resetDomIds = [
    "agilInicioTratamento", "inicioTratamento",
    "agilFreqConsultas", "freqConsultas",
    "agilDoencaMotivo", "doencaMotivo",
    "agilSintomasLimitacao", "sintomasLimitacao",
    "agilHistoricoPregresso", "historicoPregresso",
    "agilAtividadesReadaptado", "atividadesReadaptado",
    "agilDataAlteracaoMed", "dataAlteracaoMed",
    "agilObsAlteracaoMed", "obsAlteracaoMed",
    "agilObsTerapias", "obsTerapias",
    "agilCrmCro", "crmCro",
    "agilDataDocumento", "dataDocumento",
    "agilDiasSolicitados", "diasSolicitados",
    "agilDescLimitacao", "descLimitacao",
    "agilJustificativa", "justificativa",
    "agilExameFisicoDescricao", "exameFisicoDescricao",
    "alteracoesClinicasExames"
  ];
  resetDomIds.forEach(id => { const el = $(id); if (el) el.value = ""; });
  
  applyFinalizedLock();
  
  const btnN = $("btnAgilMentalNormal");
  const btnA = $("btnAgilMentalAlterado");
  if(btnN) btnN.classList.remove("selected-normal");
  if(btnA) btnA.classList.remove("selected-alterado");
  
  if(typeof updateOsteoUI === "function") updateOsteoUI();
  
  if($("atd")) $("atd").value = state.atendimento;
  if($("atdNumber")) $("atdNumber").textContent = state.atendimento;
  if($("atdDisplay")) $("atdDisplay").textContent = "Identificação registrada";
  
  applyProfessionalDefaults(currentProfile);
}
function isFinalizedReadOnly(){return workflowStatus()==="FINALIZADO" && new URLSearchParams(location.search).get("reabrir")!=="1";}
function isReadOnlySafeButton(el){
  if(!el || el.tagName!=="BUTTON") return false;
  if(el.closest(".topbar") || el.classList.contains("step")) return true;
  const oc=String(el.getAttribute("onclick")||"");
  if(/go\(/.test(oc) || /openManagement\(/.test(oc) || /saveNow\(/.test(oc)) return true;
  if(/gerarJustificativaIA|verSugestaoJustificativaIA/.test(oc)) return true;
  if(/previewFinalReport|downloadFinalPDF|exportJSON/.test(oc)) return true;
  if(/closeModal|runDiagnostics|testDiagnosticAI/.test(oc)) return true;
  return false;
}
function applyFinalizedLock(){
  const locked=isFinalizedReadOnly();
  document.documentElement.classList.toggle("atendimento-finalizado",locked);
  document.querySelectorAll("input,textarea,select").forEach(el=>{
    if(!["historyModal","diagnosticModal"].some(id=>el.closest(`#${id}`))) el.disabled=locked;
  });
  document.querySelectorAll("button").forEach(el=>{
    if(["historyModal","diagnosticModal"].some(id=>el.closest(`#${id}`))) return;
    if(!locked){ el.disabled=false; return; }
    el.disabled=!isReadOnlySafeButton(el);
  });
  if($("saveText")) $("saveText").textContent=locked?"Atendimento finalizado — leitura":"Pronto para salvar";
  if($("readonlyNotice")) $("readonlyNotice").style.display=locked?"block":"none";
  const finalBtn=[...document.querySelectorAll("button")].find(b=>/Finalizar e gerar documento|^Finalizar$|Finalizar atendimento/.test(b.textContent.trim()) && !b.closest(".ai-actions"));
  if(finalBtn && locked){ finalBtn.disabled=true; finalBtn.title="Atendimento finalizado. Reabra-o pela Gestão para editar ou finalizar novamente."; }
  const reviewHint=$("reviewStatus");
  if(locked && reviewHint && !reviewHint.dataset.lockNotice){
    reviewHint.dataset.lockNotice="1";
  }
}

async function loadRegistryRecord(id){
  try{
    const rec=await window.AmbientalUtils?.DraftStore?.get?.(`atendimento:${id}`);
    if(!rec)return false;
    Object.keys(state).forEach(k=>delete state[k]); Object.assign(state,JSON.parse(JSON.stringify(rec)));
    if(!state.atendimento)state.atendimento=id; applyState(); return true;
  }catch(error){
    console.warn("Falha ao recuperar backup local:", error?.name || "StorageError");
    return false;
  }
}
async function init(){
 buildSteps();$("dataAtd").value=today();$("horaAtd").value=timeNow();let recovered=false;
 try { await authReady; } catch(e) { console.warn("authReady:", e); }
 if (!currentProfile && window.AmbientalAuth?.profile) currentProfile = window.AmbientalAuth.profile;
 if (!currentProfile) {
   try {
     const _c = JSON.parse(sessionStorage.getItem("ambiental.auth.profile") || localStorage.getItem("ambiental.auth.profile") || "null");
     if (_c?.profile) currentProfile = _c.profile;
     else if (_c && (_c.id || _c.nome || _c.email)) currentProfile = _c;
   } catch(_) {}
 }
 if (currentProfile) applyProfessionalDefaults(currentProfile);
 await loadCIDs().catch(err => console.warn("Erro ao carregar base de CIDs:", err));
 const params=new URLSearchParams(location.search); const recordId=params.get("atendimento"); const isNew=params.get("novo")==="1"; const openDocumentOnLoad=params.get("documento")==="1";
 const doctorDefaultMode = (currentProfile?.modo_atendimento === "extenso" || currentProfile?.modo_atendimento === "estendido") ? "estendido" : "agil";
  if(isNew || !recordId){
   newEmptyState();
   applyProfessionalDefaults(currentProfile);
   applyState();
   if (doctorDefaultMode === "estendido") {
     setAttendanceMode("estendido");
   } else {
     setAttendanceMode("agil");
   }
 } else {
   recovered=await tryServerLoad(recordId);
   if(!recovered) recovered=await loadRegistryRecord(recordId);
   if(!recovered){
     newEmptyState();
     state.atendimento=recordId;
     applyProfessionalDefaults(currentProfile);
     applyState();
   }
   const savedMode = (currentProfile && currentProfile.modo_atendimento) ? doctorDefaultMode : (localStorage.getItem("ambiental_attendance_mode") || doctorDefaultMode);
   setAttendanceMode(savedMode);
 }
 const pacienteParam = params.get("paciente");
 const protocoloParam = params.get("protocolo") || params.get("agenda_protocolo");
 const horaParam = params.get("hora");
 const niParam = params.get("ni");
 const nomeAltParam = params.get("nome");
 const cpfParam = params.get("cpf") || params.get("cpfPaciente");
 const cargoParam = params.get("cargo");
 const idadeParam = params.get("idade");
 const tempoCargoParam = params.get("tempo_cargo") || params.get("tempoCargo");
 const tempoUnidadeParam = params.get("tempo_unidade") || params.get("tempoUnidade");
 const readaptadoParam = params.get("readaptado");
 const unidadeParam = params.get("unidade");

 if (pacienteParam || protocoloParam || cpfParam || cargoParam || idadeParam || nomeAltParam) {
   if (!state.aux) state.aux = {};
   if (pacienteParam) {
     state.aux.nomePaciente = pacienteParam;
     state.nomePaciente = pacienteParam;
     if ($("nomePaciente")) $("nomePaciente").value = pacienteParam;
     if ($("agilNomePaciente")) $("agilNomePaciente").value = pacienteParam;
   } else if (nomeAltParam) {
     state.aux.nomePaciente = nomeAltParam;
     state.nomePaciente = nomeAltParam;
     if ($("nomePaciente")) $("nomePaciente").value = nomeAltParam;
     if ($("agilNomePaciente")) $("agilNomePaciente").value = nomeAltParam;
   }
   if (protocoloParam) {
     state.atendimento = protocoloParam;
     if ($("atd")) $("atd").value = protocoloParam;
     if ($("atdNumber")) $("atdNumber").textContent = protocoloParam;
     if ($("atendimento")) $("atendimento").value = protocoloParam;
   }
   if (horaParam) {
     state.aux.horaAtd = horaParam;
     if ($("horaAtd")) $("horaAtd").value = horaParam;
   }
   if (niParam) {
     state.aux.ni = niParam;
   }
   if (cpfParam) {
     const formattedCpf = formatCPF(cpfParam);
     state.aux.cpfPaciente = formattedCpf;
     state.cpfPaciente = formattedCpf;
     if ($("cpfPaciente")) $("cpfPaciente").value = formattedCpf;
     if ($("agilCpfPaciente")) $("agilCpfPaciente").value = formattedCpf;
   }
   if (cargoParam) {
     state.aux.cargo = cargoParam;
     state.cargo = cargoParam;
     if ($("cargo")) $("cargo").value = cargoParam;
     if ($("agilCargo")) $("agilCargo").value = cargoParam;
   }
   if (idadeParam) {
     state.aux.idade = idadeParam;
     state.idade = idadeParam;
     if ($("idade")) $("idade").value = idadeParam;
     if ($("agilIdade")) $("agilIdade").value = idadeParam;
   }
   if (tempoCargoParam) {
     state.aux.tempoCargo = tempoCargoParam;
     state.tempoCargo = tempoCargoParam;
     if ($("tempoCargo")) $("tempoCargo").value = tempoCargoParam;
     if ($("agilTempoCargo")) $("agilTempoCargo").value = tempoCargoParam;
   }
   if (tempoUnidadeParam) {
     state.aux.tempoUnidade = tempoUnidadeParam;
     state.tempoUnidade = tempoUnidadeParam;
     if ($("tempoUnidade")) $("tempoUnidade").value = tempoUnidadeParam;
     if ($("agilTempoUnidade")) $("agilTempoUnidade").value = tempoUnidadeParam;
   }
   if (readaptadoParam) {
     const rVal = (readaptadoParam.toLowerCase() === "sim" || readaptadoParam === "1") ? "Sim" : "Não";
     state.readaptado = rVal;
     state.aux.readaptado = rVal;
     setRadio("readaptado", rVal);
     setRadio("agilReadaptado", rVal);
   }
   if (unidadeParam) {
     state.aux.unidade = unidadeParam;
   }
   const acompParam = params.get("acompanhante") || params.get("is_acompanhante");
   if (acompParam === "1" || acompParam === "true") {
     state.isAcompanhante = true;
     if (!state.aux) state.aux = {};
     state.aux.isAcompanhante = true;
     state.pessoa = "Acompanhante";
     state.aux.pessoa = "Acompanhante";
     if (!state.cid) {
       state.cid = "Z763";
       if ($("cid")) $("cid").value = "Z763";
       if ($("agilCid")) $("agilCid").value = "Z763";
     }
     if (typeof atualizarBannerAcompanhante === "function") atualizarBannerAcompanhante();
   }
   applyProfessionalDefaults(currentProfile);
   applyState();
   syncExtendedToAgil();
   autoSave();
 }
 if(openDocumentOnLoad) setTimeout(()=>openFinalReport(),250);
 window.addEventListener("online",()=>{flushOfflineQueue().catch(()=>{});});
 flushOfflineQueue().catch(()=>{});
 function syncServer(){return syncToServer();}
 document.addEventListener("change",()=>autoSave());
 let _inputDebounceTimer = null;
 document.addEventListener("input", e => {
   if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
     clearTimeout(_inputDebounceTimer);
     _inputDebounceTimer = setTimeout(() => {
       autoSave();
     }, 1500);
   }
 });
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal("historyModal");closeModal("diagnosticModal");closeModal("modalAjudaMicrofone");}});
 window.addEventListener("beforeunload",()=>{void syncToRegistry();});

 if(typeof setupOsteoHoverEffects === "function") setupOsteoHoverEffects();
 if(typeof initEsislaCharCounters === "function") initEsislaCharCounters();
 if(typeof verificarCoerenciaPericial === "function") verificarCoerenciaPericial();
 if(typeof verificarRegraJuntaMedica === "function") verificarRegraJuntaMedica();

 // Se o médico estiver configurado para o Modo IA e estiver iniciando um atendimento
 const modoIa2Param = params.get("modo_ia2") === "1" || params.get("ia2") === "1" || params.get("modo") === "ia2";
 if (!openDocumentOnLoad && !state.finalizado) {
   if (modoIa2Param || currentProfile?.modo_atendimento === "ia2") {
     setTimeout(() => {
       if (typeof abrirModoIA2 === "function") {
         abrirModoIA2("selecao");
       }
     }, 350);
   } else if (currentProfile?.modo_atendimento === "ia") {
     if (isNew || !recordId || (!state.cid && !state.parecer)) {
       setTimeout(() => {
         if (typeof abrirModoIA2 === "function") {
           abrirModoIA2("selecao");
         } else if (typeof abrirModalPreenchimentoIA === "function") {
           abrirModalPreenchimentoIA();
         }
       }, 350);
     }
   }
 }
}
init().catch(e=>{console.error("Falha na inicialização:",e);toast("Erro ao iniciar o sistema.");});

document.addEventListener("click",e=>{const o=e.target.closest(".cid-option");if(o?.dataset?.cidCode)selectCID(o.dataset.cidCode);if(!e.target.closest(".cid-wrap")){$("cidSuggestions")?.classList.remove("show");}});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    $("cidSuggestions")?.classList.remove("show");
  }
});
$("cid")?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    const first = $("cidSuggestions")?.querySelector(".cid-option");
    if (first && $("cidSuggestions")?.classList.contains("show")) {
      selectCID(first.dataset.cidCode);
    }
  }
});


$("agilCid")?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    const first = $("agilCidSuggestions")?.querySelector(".cid-option");
    if (first && $("agilCidSuggestions")?.classList.contains("show")) {
      const code = first.querySelector(".cid-code")?.textContent?.trim() || "";
      if (code) selectAgilCID(code);
    }
  }
});
document.addEventListener("click", e => {
  if (!e.target.closest("#agilCid") && !e.target.closest("#agilCidSuggestions")) {
    $("agilCidSuggestions")?.classList.remove("show");
  }
});

/* =========================================================
   MODO ÁGIL & AUTOMAÇÃO CLÍNICA
   ========================================================= */

const TEXTO_EXAME_FISICO_GERAL_PADRAO = `Bom do estado geral, nutrição adequada, sem alterações na coloração e hidratação de mucosas.  
EXAME FÍSICO DO AP.RESPIRATÓRIO: Eupnêico, sem esforço respiratório (tiragens ou uso de musculatura acessória). Expansibilidade preservada bilateralmente. FTV uniformemente palpável bilateralmente. Som claro pulmonar, atimpânico à percussão. Murmúrio Vesicular universalmente audível s/ ruídos adventícios 
EXAME FÍSICO DO AP. CARDIOVASCULAR: Precórdio normodinâmico. Ictus de VE invisível, palpável em 5º EIC na LHCE medindo cerca de 2 polpas digitais, não propulsivo. Ausência de atritos. RCR 2T c/ BNF. Ausência de sopros ou extrassístoles. Ausência de turgência de jugular. Patológica (TJP) Pulsos arteriais periféricos simétricos, sincrônicos e com boa amplitude.`;

function extrairOuPreservarExameGeral(novoConteudo) {
  const currentAgil = $("agilExameFisicoDescricao") ? $("agilExameFisicoDescricao").value : "";
  const currentExt = $("exameFisicoDescricao") ? $("exameFisicoDescricao").value : "";
  const current = (currentAgil || currentExt || state.exameFisicoDescricao || "").trim();

  const temGeral = current.includes("EXAME FÍSICO DO AP.RESPIRATÓRIO:") || current.includes("Bom do estado geral");
  if (!temGeral) {
    return novoConteudo;
  }
  if (novoConteudo && (novoConteudo.includes("EXAME FÍSICO DO AP.RESPIRATÓRIO:") || novoConteudo.includes("Bom do estado geral"))) {
    return novoConteudo;
  }
  return novoConteudo ? (TEXTO_EXAME_FISICO_GERAL_PADRAO + "\n\n" + novoConteudo) : TEXTO_EXAME_FISICO_GERAL_PADRAO;
}

function inserirExameFisicoGeralPadrao() {
  const agilEl = $("agilExameFisicoDescricao");
  const extEl = $("exameFisicoDescricao");

  let current = "";
  if (agilEl && agilEl.value) {
    current = agilEl.value;
  } else if (extEl && extEl.value) {
    current = extEl.value;
  } else if (state.exameFisicoDescricao) {
    current = state.exameFisicoDescricao;
  }

  current = (current || "").trim();

  if (current.includes("EXAME FÍSICO DO AP.RESPIRATÓRIO:") || current.includes("Bom do estado geral")) {
    toast("O texto do Exame Físico Geral já está presente neste campo.");
    return;
  }

  let novoTexto = TEXTO_EXAME_FISICO_GERAL_PADRAO;
  if (current.length > 0) {
    novoTexto = TEXTO_EXAME_FISICO_GERAL_PADRAO + "\n\n" + current;
  }

  state.exameFisicoDescricao = novoTexto;
  if (!state.aux) state.aux = {};
  state.aux.exameFisicoDescricao = novoTexto;

  if (agilEl) agilEl.value = novoTexto;
  if (extEl) extEl.value = novoTexto;

  autoSave();
  toast("Exame Físico Geral inserido no início do campo!");
}

const TEXTO_EXAME_MENTAL_NORMAL = `Nível de consciência: Preservado
Orientação: Global preservada em tempo e espaço
Atenção e concentração:  Sem desvios, preservados.
Memória:  Não demostrou dificuldades em responder questões sobre fatos e datas recente e remotas sobre sua saúde e vida laboral
Atitude/comportamento: Sem desvios, demostra autocontrole.
Inteligência: Produz conteúdo compatível com sua formação e profissão. 
Pensamento: Curso, forma e conteúdo sem comprometimentos. 
Linguagem: Apropriada, sem alteração do tom, fala pausadamente, sem se exaltar ou gaguejar. 
Afetividade: Preservada.
Humor: Eutímico, polarizado ao positivo.
Pragmatismo: Preservado, produz conteúdo satisfatório ao plano futuro.
Volição: Sem prejuízos 
Sensopercepção: Sem sinais diretos ou indiretos que possam indicar comprometimento
Psicomotricidade: Sem comprometimento.
Juízo: Preservado.`;

const TEXTO_LIMITACAO_NORMAL = `Não se identificam limitações funcionais em níveis que possam ser considerados incapacitantes neste momento.`;

const TEXTO_JUSTIFICATIVA_NORMAL = `Capacidade laborativa preservada, não se identificam limitações funcionais em níveis que possam ser considerados incapacitantes neste momento.`;

const TEXTO_EXAME_MENTAL_ALTERADO = `Apresenta-se consciente, boa orientação, apresentação e cuidado pessoal sem vaidades, boa higiene, se veste de forma adequada ao clima. Facie entristecida, hipotimica, manifestação de labilidade emocional, seu diálogo é claro, produtivo, com tom de voz baixa, com afetividade prejudicada, nota-se insight negativo sobre seu quadro clinico, com prejuízos de memorização, dificuldade para relatar datas e fatos recentes, apresenta perfil intelecto natural, compatível com sua formação acadêmica, demostra Juízo crítico da realidade preservado, pensamentos ruminantes com conteúdo de ressentimentos, desesperança, desestruturado. Hipopragamatica, com volição prejudicada, sem traços sugestivos de ideação suicida ou conteúdo persecutório.`;

const TEXTO_LIMITACAO_ALTERADO = `Apresenta limitações psicossociais e psicoemocionais que repercutem nas habilidades necessárias para interatividade social, planejamentos, manter concentração e ter autodomínio.`;

const TEXTO_JUSTIFICATIVA_ALTERADO = `Capacidade laborativa parcial e temporariamente prejudicada, limitações psicossociais e psicoemocionais que repercutem nas habilidades necessárias para interatividade social, planejamentos, manter concentração e ter autodomínio, referente ao período pleiteado.`;

/* =========================================================
   DADOS E AUTOMAÇÃO — APARELHO OSTEOMUSCULAR E TECIDO CONJUNTIVO
   ========================================================= */

const REGIOES_PAREADAS = {
  ombros: ["ombro_direito", "ombro_esquerdo"],
  cotovelos: ["cotovelo_direito", "cotovelo_esquerdo"],
  antebracos: ["antebraco_direito", "antebraco_esquerdo"],
  maos: ["mao_direita", "mao_esquerda"],
  joelhos: ["joelho_direito", "joelho_esquerdo"],
  tornozelos: ["tornozelo_direito", "tornozelo_esquerdo"]
};

const LABELS_BILATERAIS = {
  ombros: "Ombro esquerdo e direito",
  cotovelos: "Cotovelo esquerdo e direito",
  antebracos: "Antebraço esquerdo e direito",
  maos: "Mão esquerda e direita",
  joelhos: "Joelho esquerdo e direito",
  tornozelos: "Tornozelo esquerdo e direito"
};

function normalizarRegioesOsteo(regMap) {
  if (!regMap) return;
  Object.keys(REGIOES_PAREADAS).forEach(group => {
    if (regMap[group]) {
      const val = regMap[group];
      REGIOES_PAREADAS[group].forEach(sideKey => {
        if (!regMap[sideKey]) regMap[sideKey] = val;
      });
      delete regMap[group];
    }
  });
}

const DADOS_OSTEOMUSCULAR = {
  cervical: {
    label: "Cervical",
    exame: "Apresenta mobilidade ativa e passiva normais, sem alterações de pele, ausência de cicatrizes, ausência de deformidades, coluna cervical com MM. Trapézios sem contraturas, com mobilidade ativa e passiva de flexão 65º, extensão 50º, lateralizações 40º e rotações 55º, sem alterações de sensibilidade em dermátomos nos MMSS, reflexos preservados tricipital e bicipital bilateralmente.",
    limitacao: "Limitações para mudança do campo visual de forma brusca ou habitual, elevação ou movimentação de membros superiores acimada linha escapular de modo habitual",
    justificativa: "Capacidade parcial e temporariamente prejudicada, limitações para mudança do campo visual de forma brusca ou habitual, elevação ou movimentação de membros superiores acimada linha escapular de modo habitual."
  },
  lombar: {
    label: "Coluna lombar",
    exame: "Com mobilidade ativa e passiva normais, sem alterações de pele, sem cicatrizes, ausência de deformidades, coluna sem contraturas paravertebrais, com mobilidade em flexão de 95º, extensão 35º, lateralização 40º Rotação 35º, sem prejuízos de sensibilidade em dermátomos dos MMII, com reflexos aquileanos e patelares normais, apresenta Lasegue + a 45º, Giordano, Kernig, Hoover e Milgran inalterados.",
    limitacao: "Limitações para realizar dosiflexão e extensão, de forma abrupta ou de modo habitual, deambulação de modo frequente e longos trajetos, permanência em ostostatismo prolongado, posição sentado de modo permanente e ou habitual sem opção de alternância postural",
    justificativa: "Capacidade parcial e temporariamente prejudicada, limitações para realizar dosiflexão e extensão, de forma abrupta ou de modo habitual, deambulação de modo frequente e longos trajetos, permanência em ostostatismo prolongado, posição sentado de modo permanente e ou habitual sem opção de alternância postural."
  },
  ombro_direito: {
    label: "Ombro direito",
    exame: "Ausência de deformidades ou hipotrofias musculares, sem alterações de pele, sem cicatrizes, com mobilidade ativa e passiva normais e capacidade de movimentos ativos com amplitude de Flexão (90°) - extensão (180°) Abudção (180°) - adução (30°) Rotação interna (90°) - rotação externa (90°) tendo os testes Neer, Jobe, Patte, Gerber, Howkins e Queda negativos.",
    limitacao: "Limitações para ação braçal, com execução de elevação ou movimentação de membros superiores acimada linha escapular de modo habitual",
    justificativa: "Capacidade parcial e temporariamente prejudicada, Limitações para ação braçal, com execução de elevação ou movimentação de membros superiores acimada linha escapular de modo habitual."
  },
  ombro_esquerdo: {
    label: "Ombro esquerdo",
    exame: "Ausência de deformidades ou hipotrofias musculares, sem alterações de pele, sem cicatrizes, com mobilidade ativa e passiva normais e capacidade de movimentos ativos com amplitude de Flexão (90°) - extensão (180°) Abudção (180°) - adução (30°) Rotação interna (90°) - rotação externa (90°) tendo os testes Neer, Jobe, Patte, Gerber, Howkins e Queda negativos.",
    limitacao: "Limitações para ação braçal, com execução de elevação ou movimentação de membros superiores acimada linha escapular de modo habitual",
    justificativa: "Capacidade parcial e temporariamente prejudicada, Limitações para ação braçal, com execução de elevação ou movimentação de membros superiores acimada linha escapular de modo habitual."
  },
  cotovelo_direito: {
    label: "Cotovelo direito",
    exame: "Sem atrofias, sem deformidades, ausência de edemas ou hematomas, palpação dos epicôndilos e olecrano sem alterações, amplitudes de prono-supinação 90 º e flexão 145 º, extensão -145 º, força muscular preservada.",
    limitacao: "Observo através de exame físico que possui limitações da ADM que comprometem a ação braçal, limitam a aplicação de força motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática",
    justificativa: "Capacidade parcial e temporariamente prejudicada, limitações da ADM que comprometem a ação braçal, limitam a aplicação de força motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática."
  },
  cotovelo_esquerdo: {
    label: "Cotovelo esquerdo",
    exame: "Sem atrofias, sem deformidades, ausência de edemas ou hematomas, palpação dos epicôndilos e olecrano sem alterações, amplitudes de prono-supinação 90 º e flexão 145 º, extensão -145 º, força muscular preservada.",
    limitacao: "Observo através de exame físico que possui limitações da ADM que comprometem a ação braçal, limitam a aplicação de force motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática",
    justificativa: "Capacidade parcial e temporariamente prejudicada, limitações da ADM que comprometem a ação braçal, limitam a aplicação de force motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática."
  },
  antebraco_direito: {
    label: "Antebraço direito",
    exame: "Sem atrofias, sem deformidades, ausência de cicatrizes, edemas ou hematomas. Punho: ausência de deformidades, cicatrizes, cistos, atrofias, edemas ou hematomas; mobilidade em flexão 90 º, extensão 70 º, desvios ulnar 45 º, radial 20 º, palpação de túneis dorsais sem alterações, apresenta testes Filkeinstein, Tinel do Mediano e Phalen negativos.",
    limitacao: "Identifico através de exame físico, limitações da ADM que comprometem a ação braçal, limitam a aplicação de força motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática",
    justificativa: "Capacidade parcial e temporariamente prejudicada, Identifico através de exame físico, limitações da ADM que comprometem a ação braçal, limitam a aplicação de force motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática."
  },
  antebraco_esquerdo: {
    label: "Antebraço esquerdo",
    exame: "Sem atrofias, sem deformidades, ausência de cicatrizes, edemas ou hematomas. Punho: ausência de deformidades, cicatrizes, cistos, atrofias, edemas ou hematomas; mobilidade em flexão 90 º, extensão 70 º, desvios ulnar 45 º, radial 20 º, palpação de túneis dorsais sem alterações, apresenta testes Filkeinstein, Tinel do Mediano e Phalen negativos.",
    limitacao: "Identifico através de exame físico, limitações da ADM que comprometem a ação braçal, limitam a aplicação de força motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática",
    justificativa: "Capacidade parcial e temporariamente prejudicada, Identifico através de exame físico, limitações da ADM que comprometem a ação braçal, limitam a aplicação de force motriz, diminuem a destreza manual, comprometem execução de manuscritos de forma habitual e sistemática."
  },
  mao_direita: {
    label: "Mão direita",
    exame: "Ausência de edemas, hematomas, cicatrizes, atrofias de regiões tenar e hipotenar, presença de calosidades de pressão, movimentos de flexão e extensão dos dedos sem alterações, pinças fina e grossa preservadas, enchimento capilar sem alterações.",
    limitacao: "Apresenta limitações da ADM que comprometem o desempenho esperado para atividades manipulativas, limitam a ação manual, limitam movimentos finos, limitam a destreza manual, comprometem execução de manuscritos e digitação de forma habitual",
    justificativa: "Capacidade parcial e temporariamente prejudicada, Apresenta limitações da ADM que comprometem o desempenho esperado para atividades manipulativas, limitam a ação manual, limitam movimentos finos, limitam a destreza manual, comprometem execução de manuscritos e digitação de forma habitual."
  },
  mao_esquerda: {
    label: "Mão esquerda",
    exame: "Ausência de edemas, hematomas, cicatrizes, atrofias de regiões tenar e hipotenar, presença de calosidades de pressão, movimentos de flexão e extensão dos dedos sem alterações, pinças fina e grossa preservadas, enchimento capilar sem alterações.",
    limitacao: "Apresenta limitações da ADM que comprometem o desempenho esperado para atividades manipulativas, limitam a ação manual, limitam movimentos finos, limitam a destreza manual, comprometem execução de manuscritos e digitação de forma habitual",
    justificativa: "Capacidade parcial e temporariamente prejudicada, Apresenta limitações da ADM que comprometem o desempenho esperado para atividades manipulativas, limitam a ação manual, limitam movimentos finos, limitam a destreza manual, comprometem execução de manuscritos e digitação de forma habitual."
  },
  quadril: {
    label: "Quadril",
    exame: "Deambula sem alterações na báscula da bacia, ausência de edemas, ausência de cicatrizes, capacidade de rotações externa 45 º e interna 45 º, e de flexão 125 º, extensão 10 º, palpação da Bursa trocanteriana indolor; palpação do trajeto do N. Ciático indolor.",
    limitacao: "Apresenta limitações para realizar rotação do tronco de forma abrupta ou de modo habitual, deambulação de modo frequente e longos trajetos, permanência em ostostatismo prolongado, posição sentado de modo permanente e ou habitual sem opção de alternância postural",
    justificativa: "Capacidade laborativa parcial e temporariamente prejudicada, apresenta limitações para realizar rotação do tronco de forma abrupta ou de modo habitual, deambulação de modo frequente e longos trajetos, permanência em ostostatismo prolongado, posição sentado de modo permanente e ou habitual sem opção de alternância postural."
  },
  joelho_direito: {
    label: "Joelho direito",
    exame: "Ausência de deformidades, edemas ou derrame articular; mobilidade de flexão 140 º e extensão - 140 º, sem deformidades (valgo ou varo), com ligamentos estáveis (testes estresse valgo e varo para os ligamentos colaterais; testes gaveta anterior e Lackman para o LCA; teste gaveta posterior para o LCP); palpação das interlinhas sem alterações (teste McMurray para os meniscos).",
    limitacao: "Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, realizar agachamentos, subir e descer escadarias de modo habitual e sem apoio",
    justificativa: "Capacidade laborativa parcial e temporariamente prejudicada, devido limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, realizar agachamentos, subir e descer escadarias de modo habitual e sem apoio."
  },
  joelho_esquerdo: {
    label: "Joelho esquerdo",
    exame: "Ausência de deformidades, edemas ou derrame articular; mobilidade de flexão 140 º e extensão - 140 º, sem deformidades (valgo ou varo), com ligamentos estáveis (testes estresse valgo e varo para os ligamentos colaterais; testes gaveta anterior e Lackman para o LCA; teste gaveta posterior para o LCP); palpação das interlinhas sem alterações (teste McMurray para os meniscos).",
    limitacao: "Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, realizar agachamentos, subir e descer escadarias de modo habitual e sem apoio",
    justificativa: "Capacidade laborativa parcial e temporariamente prejudicada, devido limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, realizar agachamentos, subir e descer escadarias de modo habitual e sem apoio."
  },
  tornozelo_direito: {
    label: "Tornozelo direito",
    exame: "Ausência de deformidades, edemas ou hematomas, e de instabilidade tíbio-talar; palpação dos maléolos sem alterações, com palpação dos ligamentos Deltóide (medial), e talo-fibular anterior e posterior indolores, apresenta pulso tibial posterior preservado. Flexão dorsal a 20 º flexão plantar a 45 º.\nPé: ausência de deformidades, edemas ou hematomas; palpação do pulso pedioso sem alterações; palpação do tarso, metatarsos e dedos sem alterações.",
    limitacao: "Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, subir e descer escadarias de modo habitual",
    justificativa: "Capacidade parcial e temporariamente prejudicada, Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, subir e descer escadarias de modo habitual."
  },
  tornozelo_esquerdo: {
    label: "Tornozelo esquerdo",
    exame: "Ausência de deformidades, edemas ou hematomas, e de instabilidade tíbio-talar; palpação dos maléolos sem alterações, com palpação dos ligamentos Deltóide (medial), e talo-fibular anterior e posterior indolores, apresenta pulso tibial posterior preservado. Flexão dorsal a 20 º flexão plantar a 45 º.\nPé: ausência de deformidades, edemas ou hematomas; palpação do pulso pedioso sem alterações; palpação do tarso, metatarsos e dedos sem alterações.",
    limitacao: "Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, subir e descer escadarias de modo habitual",
    justificativa: "Capacidade parcial e temporariamente prejudicada, Limitação para executar tarefas que requerem posturas viciosas, deambulação frequente, ostostatismo prolongado, subir e descer escadarias de modo habitual."
  }
};

// Aliases para retrocompatibilidade
DADOS_OSTEOMUSCULAR.ombros = DADOS_OSTEOMUSCULAR.ombro_direito;
DADOS_OSTEOMUSCULAR.cotovelos = DADOS_OSTEOMUSCULAR.cotovelo_direito;
DADOS_OSTEOMUSCULAR.antebracos = DADOS_OSTEOMUSCULAR.antebraco_direito;
DADOS_OSTEOMUSCULAR.maos = DADOS_OSTEOMUSCULAR.mao_direita;
DADOS_OSTEOMUSCULAR.joelhos = DADOS_OSTEOMUSCULAR.joelho_direito;
DADOS_OSTEOMUSCULAR.tornozelos = DADOS_OSTEOMUSCULAR.tornozelo_direito;

const TEXTO_OSTEO_NORMAL_EXAME = "Aparelho Osteomuscular e Tecido Conjuntivo com trofismo e tônus musculares preservados globalmente, ausência de edemas, deformidades articulares ou cicatrizes patológicas. Mobilidade ativa e passiva preservadas em coluna vertebral (cervical e lombar) e articulações periféricas (ombros, cotovelos, punhos, mãos, quadris, joelhos e tornozelos). Testes ortopédicos especiais negativos bilateralmente. Marcha típica sem claudicação.";
const TEXTO_OSTEO_NORMAL = TEXTO_OSTEO_NORMAL_EXAME;
const TEXTO_OSTEO_NORMAL_LIMITACAO = "Do ponto de vista médico não se observa limitações físicas funcionais incapacitantes relacionadas ao aparelho osteomuscular.";
const TEXTO_OSTEO_NORMAL_JUSTIFICATIVA = "Capacidade laborativa preservada, considerando que neste ato pericial não se observam alterações ou limitações de ordem osteomuscular incapacitantes para as atribuições rotineiras do cargo atual.";

function isContraryLimitationText(text) {
  if (!text) return false;
  const s = String(text).toLowerCase();
  return s.includes("não se observa") || s.includes("nao se observa")
      || s.includes("não se identificam") || s.includes("nao se identificam")
      || s.includes("sem limitações") || s.includes("sem limitacoes")
      || s.includes("capacidade laborativa preservada")
      || s.includes("não há limitações") || s.includes("nao ha limitacoes");
}

function capitalizeFirstLetter(str) {
  if (!str) return "";
  const s = String(str).trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatarLimitacoesOsteo(lista) {
  const itensUnicos = Array.from(new Set(
    (lista || [])
      .map(s => String(s || "").trim().replace(/[.;,]+$/, ""))
      .filter(Boolean)
  ));
  if (itensUnicos.length === 0) return "";
  if (itensUnicos.length === 1) return itensUnicos[0];
  if (itensUnicos.length === 2) return `${itensUnicos[0]} e ${itensUnicos[1]}`;
  return `${itensUnicos.slice(0, -1).join(", ")} e ${itensUnicos[itensUnicos.length - 1]}`;
}

function setGrupoStatus(grupo, status) {
  if (REGIOES_PAREADAS[grupo]) {
    if (!state.osteomuscularRegioes) state.osteomuscularRegioes = {};
    REGIOES_PAREADAS[grupo].forEach(sideKey => {
      if (status) {
        state.osteomuscularRegioes[sideKey] = status;
      } else {
        delete state.osteomuscularRegioes[sideKey];
      }
    });
    const vals = Object.values(state.osteomuscularRegioes);
    const hasAlterado = vals.some(v => v === "Alterado");
    const hasNormal = vals.some(v => v === "Normal");
    if (hasAlterado) {
      state.osteomuscularResultado = "Alterado";
      aplicarRegioesOsteomusculares();
    } else if (hasNormal) {
      state.osteomuscularResultado = "Normal";
      aplicarRegioesOsteomusculares();
    } else {
      state.osteomuscularResultado = "";
      limparOsteomuscular(true);
    }
    updateOsteoUI();
  } else {
    setRegiaoStatus(grupo, status);
  }
}

function setRegiaoStatus(regiao, status) {
  if (REGIOES_PAREADAS[regiao]) {
    setGrupoStatus(regiao, status);
    return;
  }
  if (!state.osteomuscularRegioes) state.osteomuscularRegioes = {};
  if (status) {
    state.osteomuscularRegioes[regiao] = status;
  } else {
    delete state.osteomuscularRegioes[regiao];
  }
  
  const vals = Object.values(state.osteomuscularRegioes);
  const hasAlterado = vals.some(v => v === "Alterado");
  const hasNormal = vals.some(v => v === "Normal");
  
  if (hasAlterado) {
    state.osteomuscularResultado = "Alterado";
    aplicarRegioesOsteomusculares();
  } else if (hasNormal) {
    state.osteomuscularResultado = "Normal";
    aplicarRegioesOsteomusculares();
  } else {
    state.osteomuscularResultado = "";
    limparOsteomuscular(true);
  }
  
  updateOsteoUI();
}

function toggleRegiaoOsteomuscular(regiao) {
  if (!state.osteomuscularRegioes) state.osteomuscularRegioes = {};
  const current = state.osteomuscularRegioes[regiao];
  // Ciclo intuitivo de 3 estados ao tocar no corpo:
  // Não avaliado -> Alterado (ticado vermelho) -> Normal (ticado verde) -> Não avaliado (limpo)
  let next = "Alterado";
  if (current === "Alterado") {
    next = "Normal";
  } else if (current === "Normal") {
    next = "";
  } else {
    next = "Alterado";
  }
  setRegiaoStatus(regiao, next);
}

function agruparRegioesAlteradas(alteradas) {
  const alteradasSet = new Set(alteradas);
  const processadas = new Set();
  const gruposResultado = [];

  const gruposOrdenados = [
    { key: "cervical", isGroup: false },
    { key: "lombar", isGroup: false },
    { key: "quadril", isGroup: false },
    { key: "ombros", isGroup: true, sides: ["ombro_esquerdo", "ombro_direito"] },
    { key: "cotovelos", isGroup: true, sides: ["cotovelo_esquerdo", "cotovelo_direito"] },
    { key: "antebracos", isGroup: true, sides: ["antebraco_esquerdo", "antebraco_direito"] },
    { key: "maos", isGroup: true, sides: ["mao_esquerda", "mao_direita"] },
    { key: "joelhos", isGroup: true, sides: ["joelho_esquerdo", "joelho_direito"] },
    { key: "tornozelos", isGroup: true, sides: ["tornozelo_esquerdo", "tornozelo_direito"] }
  ];

  gruposOrdenados.forEach(item => {
    if (!item.isGroup) {
      if (alteradasSet.has(item.key) && DADOS_OSTEOMUSCULAR[item.key]) {
        processadas.add(item.key);
        gruposResultado.push({
          label: DADOS_OSTEOMUSCULAR[item.key].label,
          exame: DADOS_OSTEOMUSCULAR[item.key].exame,
          keys: [item.key]
        });
      }
    } else {
      const [leftKey, rightKey] = item.sides;
      const hasLeft = alteradasSet.has(leftKey);
      const hasRight = alteradasSet.has(rightKey);

      if (hasLeft && hasRight && DADOS_OSTEOMUSCULAR[leftKey]) {
        processadas.add(leftKey);
        processadas.add(rightKey);
        gruposResultado.push({
          label: LABELS_BILATERAIS[item.key] || `${DADOS_OSTEOMUSCULAR[leftKey].label} e direito`,
          exame: DADOS_OSTEOMUSCULAR[leftKey].exame,
          keys: [leftKey, rightKey]
        });
      } else if (hasLeft && DADOS_OSTEOMUSCULAR[leftKey]) {
        processadas.add(leftKey);
        gruposResultado.push({
          label: DADOS_OSTEOMUSCULAR[leftKey].label,
          exame: DADOS_OSTEOMUSCULAR[leftKey].exame,
          keys: [leftKey]
        });
      } else if (hasRight && DADOS_OSTEOMUSCULAR[rightKey]) {
        processadas.add(rightKey);
        gruposResultado.push({
          label: DADOS_OSTEOMUSCULAR[rightKey].label,
          exame: DADOS_OSTEOMUSCULAR[rightKey].exame,
          keys: [rightKey]
        });
      }
    }
  });

  alteradas.forEach(k => {
    if (!processadas.has(k) && DADOS_OSTEOMUSCULAR[k]) {
      gruposResultado.push({
        label: DADOS_OSTEOMUSCULAR[k].label,
        exame: DADOS_OSTEOMUSCULAR[k].exame,
        keys: [k]
      });
    }
  });

  return gruposResultado;
}

function aplicarRegioesOsteomusculares() {
  const regMap = state.osteomuscularRegioes || {};
  normalizarRegioesOsteo(regMap);
  const alteradas = Object.keys(regMap).filter(k => regMap[k] === "Alterado" && DADOS_OSTEOMUSCULAR[k]);
  
  if (alteradas.length > 0) {
    state.osteomuscularResultado = "Alterado";
    state.exameFisicoTipo = "Aparelho Osteomuscular e Tecido Conjutivo";
    if ($("exameFisicoTipo")) $("exameFisicoTipo").value = "Aparelho Osteomuscular e Tecido Conjutivo";
    if ($("agilExameFisicoTipo")) $("agilExameFisicoTipo").value = "Aparelho Osteomuscular e Tecido Conjutivo";
    
    // Agrupar lateralidades bilaterais para não repetir textos idênticos (ex: Antebraço esquerdo e direito: ...)
    const grupos = agruparRegioesAlteradas(alteradas);
    const examesTexto = grupos.map(d => {
      return `${d.label}: ${capitalizeFirstLetter(d.exame)}`;
    }).join("\n\n");
    
    // Limitações conectadas com "e" sem ".;", primeira letra maiúscula e deduplicadas entre lados
    const limitacoesUnidas = formatarLimitacoesOsteo(alteradas.map(k => DADOS_OSTEOMUSCULAR[k].limitacao));
    const limitacoesTexto = capitalizeFirstLetter(limitacoesUnidas) + (limitacoesUnidas ? "." : "");
    
    // Justificativa com primeira letra maiúscula, conectando com "e" e sem ".;"
    let justificativaTexto = "";
    if (grupos.length === 1) {
      const refKey = grupos[0].keys[0];
      justificativaTexto = capitalizeFirstLetter(DADOS_OSTEOMUSCULAR[refKey].justificativa);
    } else {
      const limJustif = formatarLimitacoesOsteo(alteradas.map(k => DADOS_OSTEOMUSCULAR[k].limitacao));
      justificativaTexto = `Capacidade parcial e temporariamente prejudicada, ${limJustif}.`;
    }
    justificativaTexto = justificativaTexto.replace(/\.;/g, ";").replace(/;\./g, ".").replace(/\.\./g, ".");
      
    const descFinalOsteo = extrairOuPreservarExameGeral(examesTexto);
    state.exameFisicoDescricao = descFinalOsteo;
    if (!state.aux) state.aux = {};
    state.aux.exameFisicoDescricao = descFinalOsteo;
    if ($("agilExameFisicoDescricao")) $("agilExameFisicoDescricao").value = descFinalOsteo;
    if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = descFinalOsteo;
    
    state.limitacaoFuncional = "Sim";
    state.limitacaoRol = "Sim";
    setRadio("limitacaoFuncional", "Sim");
    setRadio("limitacaoRol", "Sim");
    $("limitacao1Panel")?.classList.remove("hidden");
    $("limitacao2Panel")?.classList.remove("hidden");
    
    const existingDescLimOsteo = (state.descLimitacao || state.aux?.descLimitacao || $("descLimitacao")?.value || "").trim();
    if (!existingDescLimOsteo || isContraryLimitationText(existingDescLimOsteo)) {
      state.descLimitacao = limitacoesTexto;
      if (!state.aux) state.aux = {};
      state.aux.descLimitacao = limitacoesTexto;
      if ($("descLimitacao")) $("descLimitacao").value = limitacoesTexto;
    }
    
    // Auto-preencher atividades comprometidas do Rol com as limitações já aplicadas
    const existingAtivRolOsteo = (state.atividadesComprometidas || state.aux?.atividadesComprometidas || $("atividadesComprometidas")?.value || "").trim();
    if (!existingAtivRolOsteo || isContraryLimitationText(existingAtivRolOsteo)) {
      state.atividadesComprometidas = limitacoesTexto;
      if (!state.aux) state.aux = {};
      state.aux.atividadesComprometidas = limitacoesTexto;
      if ($("atividadesComprometidas")) $("atividadesComprometidas").value = limitacoesTexto;
    }

    const existingSintOsteo = (state.aux?.sintomasLimitacao || state.sintomasLimitacao || $("agilSintomasLimitacao")?.value || "").trim();
    if (!existingSintOsteo || isContraryLimitationText(existingSintOsteo) || existingSintOsteo === "Conforme exame físico/mental") {
      state.aux.sintomasLimitacao = limitacoesTexto;
      state.sintomasLimitacao = limitacoesTexto;
      if ($("agilSintomasLimitacao")) $("agilSintomasLimitacao").value = limitacoesTexto;
      if ($("sintomasLimitacao")) $("sintomasLimitacao").value = limitacoesTexto;
    }
    
    QuesitoService.set(0, "Sim");
    QuesitoService.set(1, "Sim");
    QuesitoService.set(2, "Sim");
    renderQuesitos();
    
    state.capacidade = "Capacidade parcial e temporariamente prejudicada";
    setRadio("capacidade", "Capacidade parcial e temporariamente prejudicada");
    
    const isRetroInv = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
    if (isRetroInv && state.parecerManualOverride !== "FAVORÁVEL") {
      aplicarParecerContrarioRetroacao(true);
      autoSave();
      const nomes = grupos.map(g => g.label).join(", ");
      toast(`Região (${nomes}) marcada como ALTERADA: exame e limitações mantidos favoráveis, parecer CONTRÁRIO mantido por retroação inválida.`);
    } else if (state.parecerManualOverride === "CONTRÁRIO") {
      state.parecer = "CONTRÁRIO";
      setRadio("parecer", "CONTRÁRIO");
      setRadio("agilParecer", "CONTRÁRIO");
      autoSave();
      const nomes = grupos.map(g => g.label).join(", ");
      toast(`Região (${nomes}) marcada como ALTERADA (Parecer CONTRÁRIO mantido conforme sua escolha).`);
    } else {
      state.parecer = "FAVORÁVEL";
      setRadio("parecer", "FAVORÁVEL");
      setRadio("agilParecer", "FAVORÁVEL");
      state.aux.justificativa = justificativaTexto;
      state.justificativa = justificativaTexto;
      if ($("agilJustificativa")) $("agilJustificativa").value = justificativaTexto;
      if ($("justificativa")) $("justificativa").value = justificativaTexto;
      autoSave();
      const nomes = grupos.map(g => g.label).join(", ");
      toast(`Região (${nomes}) marcada como ALTERADA: achados, limitações e parecer FAVORÁVEL preenchidos.`);
    }
    if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") atualizarEstiloBotoesParecerDataAntiga();
  } else if (Object.keys(regMap).length > 0 && Object.values(regMap).every(v => v === "Normal")) {
    aplicarOsteomuscularNormal();
  }
}

function aplicarOsteomuscularNormal() {
  if (!state.osteomuscularRegioes) state.osteomuscularRegioes = {};
  const canonicas = [
    "cervical", "lombar", "quadril",
    "ombro_direito", "ombro_esquerdo",
    "cotovelo_direito", "cotovelo_esquerdo",
    "antebraco_direito", "antebraco_esquerdo",
    "mao_direita", "mao_esquerda",
    "joelho_direito", "joelho_esquerdo",
    "tornozelo_direito", "tornozelo_esquerdo"
  ];
  canonicas.forEach(k => {
    state.osteomuscularRegioes[k] = "Normal";
  });
  state.osteomuscularResultado = "Normal";
  state.exameFisicoTipo = "Aparelho Osteomuscular e Tecido Conjutivo";
  if ($("exameFisicoTipo")) $("exameFisicoTipo").value = "Aparelho Osteomuscular e Tecido Conjutivo";
  if ($("agilExameFisicoTipo")) $("agilExameFisicoTipo").value = "Aparelho Osteomuscular e Tecido Conjutivo";
  
  const descOsteoNormal = extrairOuPreservarExameGeral(TEXTO_OSTEO_NORMAL_EXAME);
  state.exameFisicoDescricao = descOsteoNormal;
  if (!state.aux) state.aux = {};
  state.aux.exameFisicoDescricao = descOsteoNormal;
  if ($("agilExameFisicoDescricao")) $("agilExameFisicoDescricao").value = descOsteoNormal;
  if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = descOsteoNormal;
  
  const isRetroInv = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  if (isRetroInv && state.parecerManualOverride !== "FAVORÁVEL") {
    aplicarParecerContrarioRetroacao(true);
    updateOsteoUI();
    autoSave();
    if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") atualizarEstiloBotoesParecerDataAntiga();
    return;
  }
  if (state.parecerManualOverride === "FAVORÁVEL") {
    state.parecer = "FAVORÁVEL";
    setRadio("parecer", "FAVORÁVEL");
    setRadio("agilParecer", "FAVORÁVEL");
    state.limitacaoFuncional = "Sim";
    state.limitacaoRol = "Sim";
    setRadio("limitacaoFuncional", "Sim");
    setRadio("limitacaoRol", "Sim");
    updateOsteoUI();
    autoSave();
    if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") atualizarEstiloBotoesParecerDataAntiga();
    toast("Exame osteomuscular NORMAL (Parecer FAVORÁVEL mantido conforme sua escolha).");
    return;
  }

  state.limitacaoFuncional = "Não";
  state.limitacaoRol = "Não";
  setRadio("limitacaoFuncional", "Não");
  setRadio("limitacaoRol", "Não");
  
  const existingDescLimOsteoNorm = (state.descLimitacao || state.aux?.descLimitacao || $("descLimitacao")?.value || "").trim();
  if (!existingDescLimOsteoNorm) {
    state.descLimitacao = TEXTO_OSTEO_NORMAL_LIMITACAO;
    if (!state.aux) state.aux = {};
    state.aux.descLimitacao = TEXTO_OSTEO_NORMAL_LIMITACAO;
    if ($("descLimitacao")) $("descLimitacao").value = TEXTO_OSTEO_NORMAL_LIMITACAO;
  }
  
  // Limpar atividades comprometidas do Rol (Normal = sem limitações)
  state.atividadesComprometidas = "";
  if (!state.aux) state.aux = {};
  state.aux.atividadesComprometidas = "";
  if ($("atividadesComprometidas")) $("atividadesComprometidas").value = "";
  
  state.parecer = "CONTRÁRIO";
  setRadio("parecer", "CONTRÁRIO");
  setRadio("agilParecer", "CONTRÁRIO");
  ajustarQuesitosPorParecerEReadaptacao();
  
  state.aux.justificativa = TEXTO_OSTEO_NORMAL_JUSTIFICATIVA;
  state.justificativa = TEXTO_OSTEO_NORMAL_JUSTIFICATIVA;
  if ($("agilJustificativa")) $("agilJustificativa").value = TEXTO_OSTEO_NORMAL_JUSTIFICATIVA;
  if ($("justificativa")) $("justificativa").value = TEXTO_OSTEO_NORMAL_JUSTIFICATIVA;
  
  updateOsteoUI();
  autoSave();
  if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") atualizarEstiloBotoesParecerDataAntiga();
  toast("Exame osteomuscular NORMAL: capacidade preservada e parecer CONTRÁRIO preenchidos.");
}

function limparOsteomuscular() {
  const silent = arguments[0] === true;
  state.osteomuscularRegioes = {};
  state.osteomuscularResultado = "";
  
  // Limpar texto de exame físico (preservando Exame Físico Geral se presente)
  const curEx = state.exameFisicoDescricao || "";
  const temGeralEx = curEx.includes("EXAME FÍSICO DO AP.RESPIRATÓRIO:") || curEx.includes("Bom do estado geral");
  const clearedDesc = temGeralEx ? TEXTO_EXAME_FISICO_GERAL_PADRAO : "";
  state.exameFisicoDescricao = clearedDesc;
  if (!state.aux) state.aux = {};
  state.aux.exameFisicoDescricao = clearedDesc;
  if ($("agilExameFisicoDescricao")) $("agilExameFisicoDescricao").value = clearedDesc;
  if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = clearedDesc;
  
  // Limpar limitações
  state.limitacaoFuncional = "";
  state.limitacaoRol = "";
  setRadio("limitacaoFuncional", "");
  setRadio("limitacaoRol", "");
  
  state.descLimitacao = "";
  state.aux.descLimitacao = "";
  if ($("descLimitacao")) $("descLimitacao").value = "";
  
  // Limpar atividades comprometidas do Rol
  state.atividadesComprometidas = "";
  state.aux.atividadesComprometidas = "";
  if ($("atividadesComprometidas")) $("atividadesComprometidas").value = "";
  
  // Limpar justificativa
  state.justificativa = "";
  state.aux.justificativa = "";
  if ($("agilJustificativa")) $("agilJustificativa").value = "";
  if ($("justificativa")) $("justificativa").value = "";
  
  // Limpar capacidade e parecer
  state.capacidade = "";
  state.parecer = "";
  setRadio("capacidade", "");
  setRadio("parecer", "");
  
  // Limpar quesitos
  QuesitoService.set(0, "");
  QuesitoService.set(1, "");
  QuesitoService.set(2, "");
  renderQuesitos();
  
  updateOsteoUI();
  autoSave();
  if (!silent) {
    toast("Seleções e dados do exame osteomuscular foram limpos com sucesso.");
  }
}

function toggleOsteoDetalhes() {
  const container = $("osteoRegionsContainer");
  if (!container) return;
  const isHidden = container.style.display === "none" || !container.style.display;
  container.style.display = isHidden ? "block" : "none";
  
  const lbl = $("lblToggleOsteoDetalhes");
  if (lbl) lbl.textContent = isHidden ? "Ocultar Detalhes" : "Detalhes";
  
  const link = $("linkToggleOsteoDetalhes");
  if (link) link.textContent = isHidden ? "Ocultar Detalhes em Tabela ▲" : "Ver Detalhes em Tabela (9 regiões) ▼";
  
  if (isHidden) {
    container.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function updateOsteoUI() {
  if (!state.osteomuscularRegioes) state.osteomuscularRegioes = {};
  normalizarRegioesOsteo(state.osteomuscularRegioes);
  const regMap = state.osteomuscularRegioes;
  let altCount = 0;
  let normCount = 0;
  
  const canonicas = [
    "cervical", "lombar", "quadril",
    "ombro_direito", "ombro_esquerdo",
    "cotovelo_direito", "cotovelo_esquerdo",
    "antebraco_direito", "antebraco_esquerdo",
    "mao_direita", "mao_esquerda",
    "joelho_direito", "joelho_esquerdo",
    "tornozelo_direito", "tornozelo_esquerdo"
  ];
  
  canonicas.forEach(k => {
    const status = regMap[k] || "";
    if (status === "Alterado") altCount++;
    if (status === "Normal") normCount++;
    
    // Atualizar botões individuais
    const btnAlt = $(`btnOsteoAlt_${k}`);
    const btnNorm = $(`btnOsteoNorm_${k}`);
    if (btnAlt) btnAlt.classList.toggle("selected", status === "Alterado");
    if (btnNorm) btnNorm.classList.toggle("selected", status === "Normal");
    
    // Atualizar hotspot individual no mapa corporal
    const hotspots = document.querySelectorAll(`.osteo-hotspot[data-regiao="${k}"]`);
    hotspots.forEach(hs => {
      hs.classList.toggle("is-alterado", status === "Alterado");
      hs.classList.toggle("is-normal", status === "Normal");
      
      const tip = hs.querySelector(".osteo-tooltip");
      if (tip) {
        const titleBase = hs.getAttribute("title") || DADOS_OSTEOMUSCULAR[k]?.label || k;
        if (status === "Alterado") {
          tip.innerHTML = `${titleBase}: <span style="color:#FCA5A5;font-weight:800">ALTERADO ✓</span>`;
        } else if (status === "Normal") {
          tip.innerHTML = `${titleBase}: <span style="color:#86EFAC;font-weight:800">NORMAL ✓</span>`;
        } else {
          tip.innerHTML = `${titleBase} <span style="font-weight:400;opacity:0.85">(Clique para marcar)</span>`;
        }
      }
    });
  });
  
  // Atualizar cards e botões de grupo na tabela
  ["cervical", "lombar", "quadril"].forEach(k => {
    const card = $(`cardOsteo_${k}`);
    const status = regMap[k] || "";
    if (card) {
      card.classList.toggle("active-alterado", status === "Alterado");
      card.classList.toggle("active-normal", status === "Normal");
    }
  });
  
  Object.entries(REGIOES_PAREADAS).forEach(([group, sides]) => {
    const card = $(`cardOsteo_${group}`);
    const hasAlt = sides.some(s => regMap[s] === "Alterado");
    const allNorm = sides.every(s => regMap[s] === "Normal");
    const hasNorm = sides.some(s => regMap[s] === "Normal");
    const allAlt = sides.every(s => regMap[s] === "Alterado");
    
    if (card) {
      card.classList.toggle("active-alterado", hasAlt);
      card.classList.toggle("active-normal", !hasAlt && hasNorm);
    }
    
    // Botões "Ambos" do grupo
    const btnBothAlt = $(`btnOsteoAlt_${group}`);
    const btnBothNorm = $(`btnOsteoNorm_${group}`);
    if (btnBothAlt) btnBothAlt.classList.toggle("selected", allAlt);
    if (btnBothNorm) btnBothNorm.classList.toggle("selected", allNorm);
  });
  
  const badge = $("osteoBadgeCount");
  if (badge) {
    const totalSelected = altCount + normCount;
    if (totalSelected > 0) {
      badge.style.display = "inline-flex";
      badge.textContent = altCount > 0 ? `${altCount} alt` : `${normCount} norm`;
      badge.style.background = altCount > 0 ? "#DC2626" : "#16A34A";
    } else {
      badge.style.display = "none";
    }
  }
}

/* Sinais Vitais — Padrão Habitual (120x80 mmHg e Pulso 80 bpm) */
function toggleVitalsPadrao(checked) {
  const s = checked ? "120" : "";
  const d = checked ? "80" : "";
  const p = checked ? "80" : "";

  if ($("agilPressaoSistolica")) $("agilPressaoSistolica").value = s;
  if ($("agilPressaoDiastolica")) $("agilPressaoDiastolica").value = d;
  if ($("agilPulso")) $("agilPulso").value = p;
  if ($("pressaoSistolica")) $("pressaoSistolica").value = s;
  if ($("pressaoDiastolica")) $("pressaoDiastolica").value = d;
  if ($("pulso")) $("pulso").value = p;

  if (!state.aux) state.aux = {};
  state.aux.pressaoSistolica = s;
  state.aux.pressaoDiastolica = d;
  state.aux.pulso = p;
  state.pressaoSistolica = s;
  state.pressaoDiastolica = d;
  state.pulso = p;

  autoSave();
  if (checked) {
    toast("Sinais vitais padrão definidos: 120 por 80 mmHg e pulso 80 bpm.");
  }
}

function checkVitalsPadraoState() {
  const s = $("agilPressaoSistolica")?.value;
  const d = $("agilPressaoDiastolica")?.value;
  const p = $("agilPulso")?.value;
  const isPadrao = (String(s) === "120" && String(d) === "80" && String(p) === "80");
  if ($("agilVitalsPadraoCheck")) $("agilVitalsPadraoCheck").checked = isPadrao;
}

function setupOsteoHoverEffects() {
  document.querySelectorAll(".osteo-hotspot").forEach(hs => {
    const regiao = hs.getAttribute("data-regiao");
    const groupKey = hs.getAttribute("data-group") || regiao;
    if (!regiao) return;
    
    hs.addEventListener("mouseenter", () => {
      // Destaque visual EXCLUSIVO no ponto onde o mouse está posicionado (evita iluminar ambos os lados)
      hs.classList.add("is-hovered");
      const card = $(`cardOsteo_${groupKey}`) || $(`cardOsteo_${regiao}`);
      if (card) {
        card.classList.add("is-hovered");
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
    
    hs.addEventListener("mouseleave", () => {
      hs.classList.remove("is-hovered");
      const card = $(`cardOsteo_${groupKey}`) || $(`cardOsteo_${regiao}`);
      if (card) card.classList.remove("is-hovered");
    });
  });
  
  document.querySelectorAll(".osteo-region-card").forEach(card => {
    const regiao = card.getAttribute("data-card-regiao");
    if (!regiao) return;
    
    card.addEventListener("mouseenter", () => {
      // Ao passar o mouse no card da tabela, apenas contorna suavemente os pontos correspondentes sem abrir tooltips
      const hotspots = document.querySelectorAll(`.osteo-hotspot[data-regiao="${regiao}"], .osteo-hotspot[data-group="${regiao}"]`);
      hotspots.forEach(h => h.classList.add("is-card-hovered"));
      card.classList.add("is-hovered");
    });
    
    card.addEventListener("mouseleave", () => {
      const hotspots = document.querySelectorAll(`.osteo-hotspot[data-regiao="${regiao}"], .osteo-hotspot[data-group="${regiao}"]`);
      hotspots.forEach(h => h.classList.remove("is-card-hovered"));
      card.classList.remove("is-hovered");
    });
  });
}

let currentAttendanceMode = "agil";

function setAttendanceMode(mode) {
  const normMode = (mode === "extenso" || mode === "estendido") ? "estendido" : "agil";
  currentAttendanceMode = normMode;
  const isAgil = normMode === "agil";
  document.body.classList.toggle("mode-agil-active", isAgil);
  
  const btnAgil = $("btnModoAgil");
  const btnEstendido = $("btnModoEstendido");
  if (btnAgil) btnAgil.classList.toggle("active", isAgil);
  if (btnEstendido) btnEstendido.classList.toggle("active", !isAgil);
  
  try { localStorage.setItem("ambiental_attendance_mode", normMode); } catch (e) {}
  
  if (isAgil) {
    syncExtendedToAgil();
  } else {
    syncAgilToExtended();
    go(Math.min(9, Math.max(1, Number(state.current) || 1)));
  }
}

function syncExtendedToAgil() {
  if (!state.aux) state.aux = {};
  
  const setVal = (id, val) => { const el = $(id); if (el && val !== undefined && val !== null) el.value = val; };
  setVal("agilNomePaciente", state.aux.nomePaciente || state.nomePaciente || $("nomePaciente")?.value || "");
  setVal("agilCpfPaciente", formatCPF(state.aux.cpfPaciente || state.cpfPaciente || $("cpfPaciente")?.value || ""));
  setVal("agilCargo", state.aux.cargo || state.cargo || $("cargo")?.value || "");
  setVal("agilTempoCargo", state.aux.tempoCargo || state.tempoCargo || $("tempoCargo")?.value || "");
  setVal("agilTempoUnidade", state.aux.tempoUnidade || state.tempoUnidade || $("tempoUnidade")?.value || "");
  setVal("agilIdade", state.aux.idade || state.idade || $("idade")?.value || "");
  
  const readap = state.readaptado || state.aux.readaptado || getRadio("readaptado") || "";
  setRadio("agilReadaptado", readap);
  $("readaptadoPanel")?.classList.toggle("hidden", readap !== "Sim");
  $("agilReadaptadoPanel")?.classList.toggle("hidden", readap !== "Sim");
  setVal("agilAtividadesReadaptado", state.aux.atividadesReadaptado || state.atividadesReadaptado || $("atividadesReadaptado")?.value || "");

  // Bloco 02 — Queixa e Duração & Antecedentes
  const doenca = state.aux.doencaMotivo || state.doencaMotivo || $("doencaMotivo")?.value || "";
  setVal("agilDoencaMotivo", doenca);
  let rawInicio = state.aux.inicioTratamento || state.inicioTratamento || $("inicioTratamento")?.value || "";
  if (isArtifactAttendanceDate(rawInicio, state.aux.dataAtd || $("dataAtd")?.value)) {
    rawInicio = "";
    state.aux.inicioTratamento = "";
    state.inicioTratamento = "";
    if ($("inicioTratamento")) $("inicioTratamento").value = "";
  }
  setVal("agilInicioTratamento", rawInicio);
  setVal("agilFreqConsultas", state.aux.freqConsultas || state.freqConsultas || $("freqConsultas")?.value || "");
  setVal("agilSintomasLimitacao", state.aux.sintomasLimitacao || state.sintomasLimitacao || $("sintomasLimitacao")?.value || "");

  renderMedications();

  const altMed = state.alteracaoMed || state.aux.alteracaoMed || getRadio("alteracaoMed") || "";
  setRadio("agilAlteracaoMed", altMed);
  $("alteracaoPanel")?.classList.toggle("hidden", altMed !== "Sim");
  $("agilAlteracaoPanel")?.classList.toggle("hidden", altMed !== "Sim");
  setVal("agilDataAlteracaoMed", state.aux.dataAlteracaoMed || state.dataAlteracaoMed || $("dataAlteracaoMed")?.value || "");
  setVal("agilObsAlteracaoMed", state.aux.obsAlteracaoMed || state.obsAlteracaoMed || $("obsAlteracaoMed")?.value || "");

  if ($("fisioterapia")) $("fisioterapia").checked = !!(state.fisioterapia || state.aux.fisioterapia || $("agilFisioterapia")?.checked);
  if ($("agilFisioterapia")) $("agilFisioterapia").checked = !!(state.fisioterapia || state.aux.fisioterapia || $("fisioterapia")?.checked);
  if ($("psicoterapia")) $("psicoterapia").checked = !!(state.psicoterapia || state.aux.psicoterapia || $("agilPsicoterapia")?.checked);
  if ($("agilPsicoterapia")) $("agilPsicoterapia").checked = !!(state.psicoterapia || state.aux.psicoterapia || $("psicoterapia")?.checked);
  setVal("agilObsTerapias", state.aux.obsTerapias || state.obsTerapias || $("obsTerapias")?.value || "");

  const outras = state.outrasDoencas || state.aux.outrasDoencas || getRadio("outrasDoencas") || "";
  setRadio("agilOutrasDoencas", outras);
  $("doencasPanel")?.classList.toggle("hidden", outras !== "Sim");
  $("agilDoencasPanel")?.classList.toggle("hidden", outras !== "Sim");
  renderConditions();

  setVal("agilHistoricoPregresso", state.aux.historicoPregresso || state.historicoPregresso || $("historicoPregresso")?.value || "");

  // Bloco 03 — Exame Físico / Mental
  const cidVal = state.cid || state.aux.cid || $("cid")?.value || "";
  setVal("agilCid", cidVal);
  if (cidVal) {
    const f = findCID(cidVal);
    const badge = $("agilCidBadge");
    if (badge) {
      badge.style.display = "inline-flex";
      badge.innerHTML = `<strong>${esc(f?.c || cidVal)}</strong>${f?.n ? " — " + esc(f.n) : ""}`;
    }
  }

  setVal("agilCrmCro", state.aux.crmCro || state.crmCro || $("crmCro")?.value || "");
  const isoExp = toIsoDate(state.aux.dataExpedicaoIso || state.aux.dataExpedicao || state.dataExpedicao || $("dataExpedicao")?.value || $("agilDataExpedicao")?.value || "");
  setVal("dataExpedicao", isoExp);
  setVal("agilDataExpedicao", isoExp);
  setVal("agilDataDocumento", state.aux.dataDocumento || state.dataDocumento || $("dataDocumento")?.value || "");
  setVal("agilDiasSolicitados", state.aux.diasSolicitados || state.diasSolicitados || $("diasSolicitados")?.value || "");
  
  const temDadosAtestado = !!(state.aux?.crmCro || state.crmCro || $("crmCro")?.value || state.aux?.dataDocumento || state.dataDocumento || $("dataDocumento")?.value || state.aux?.diasSolicitados || state.diasSolicitados || $("diasSolicitados")?.value || state.aux?.dataExpedicao || state.dataExpedicao || isoExp);
  if (typeof toggleAtestadoAssistente === "function") {
    toggleAtestadoAssistente(temDadosAtestado);
  }
  
  const exTipo = state.exameFisicoTipo || $("exameFisicoTipo")?.value || "";
  const isOsteo = (exTipo === "Aparelho Osteomuscular e Tecido Conjutivo");
  const isMental = (exTipo === "Exame Mental");
  const isOutros = (exTipo === "Outros" || (!isOsteo && !isMental && exTipo !== ""));

  if ($("agilExameFisicoTipo")) {
    if (isOsteo || isMental) {
      $("agilExameFisicoTipo").value = exTipo;
    } else if (isOutros) {
      $("agilExameFisicoTipo").value = "Outros";
      if (!state.outrosSubtipo && exTipo !== "Outros") {
        state.outrosSubtipo = exTipo;
      }
    } else {
      $("agilExameFisicoTipo").value = "";
    }
  }
  
  const mentalWrap = $("agilMentalSelector");
  if (mentalWrap) {
    mentalWrap.style.display = isMental ? "block" : "none";
  }
  const osteoWrap = $("agilOsteomuscularSelector");
  if (osteoWrap) {
    osteoWrap.style.display = isOsteo ? "block" : "none";
    if (isOsteo && typeof updateOsteoUI === "function") {
      updateOsteoUI();
    }
  }
  const outrosWrap = $("agilOutrosSelector");
  if (outrosWrap) {
    outrosWrap.style.display = isOutros ? "block" : "none";
    if (isOutros && typeof renderOutrosUI === "function") {
      state.outrosSubtipo = state.aux?.outrosSubtipo || state.aux?.areaExameClinico || state.outrosSubtipo || "";
      state.outrosResultado = state.aux?.outrosResultado || state.aux?.resultadoAvaliacao || state.outrosResultado || "";
      renderOutrosUI();
    }
  }
  const btnIaJust = $("btnAgilJustificativaIA");
  if (btnIaJust) {
    btnIaJust.style.display = isOutros ? "inline-flex" : "none";
  }
  
  const mentalRes = state.exameMentalResultado;
  const btnNormal = $("btnAgilMentalNormal");
  const btnAlterado = $("btnAgilMentalAlterado");
  if (btnNormal) btnNormal.classList.toggle("selected-normal", mentalRes === "Normal");
  if (btnAlterado) btnAlterado.classList.toggle("selected-alterado", mentalRes === "Alterado");
  
  setVal("agilPressaoSistolica", state.aux.pressaoSistolica || state.pressaoSistolica || $("pressaoSistolica")?.value || "");
  setVal("agilPressaoDiastolica", state.aux.pressaoDiastolica || state.pressaoDiastolica || $("pressaoDiastolica")?.value || "");
  setVal("agilPulso", state.aux.pulso || state.pulso || $("pulso")?.value || "");
  setVal("agilAltura", state.aux.altura || state.altura || "");
  setVal("agilPeso", state.aux.peso || state.peso || "");
  if (typeof checkVitalsPadraoState === "function") checkVitalsPadraoState();
  setVal("agilExameFisicoDescricao", state.exameFisicoDescricao || $("exameFisicoDescricao")?.value || "");
  
  // Bloco 04 — Justificativa
  setVal("agilJustificativa", state.aux.justificativa || state.justificativa || $("justificativa")?.value || "");
  if (Array.isArray(state.aux.cidsSecundarios) && (!state.cidsSecundarios || state.cidsSecundarios.length === 0)) {
    state.cidsSecundarios = state.aux.cidsSecundarios;
  }
  renderSecondaryCIDs();

  if (typeof calcularDatasAtestado === "function") calcularDatasAtestado();
  if (typeof calcularIMC === "function") calcularIMC();
  if (typeof verificarHistoricoPericiado === "function") {
    verificarHistoricoPericiado(state.aux.cpfPaciente || state.cpfPaciente || $("agilCpfPaciente")?.value || "");
  }
  if (typeof verificarCoerenciaPericial === "function") verificarCoerenciaPericial();
  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
}

function syncAgilToExtended() {
  if (!state.aux) state.aux = {};
  
  const getV = (id) => $(id)?.value ?? "";
  
  const nome = getV("agilNomePaciente");
  state.aux.nomePaciente = nome; state.nomePaciente = nome;
  if ($("nomePaciente")) $("nomePaciente").value = nome;
  
  const cpf = getV("agilCpfPaciente");
  state.aux.cpfPaciente = cpf; state.cpfPaciente = cpf;
  if ($("cpfPaciente")) $("cpfPaciente").value = cpf;
  
  const cargo = getV("agilCargo");
  state.aux.cargo = cargo; state.cargo = cargo;
  if ($("cargo")) $("cargo").value = cargo;
  
  const tCargo = getV("agilTempoCargo");
  state.aux.tempoCargo = tCargo; state.tempoCargo = tCargo;
  if ($("tempoCargo")) $("tempoCargo").value = tCargo;
  
  const tUnidade = getV("agilTempoUnidade");
  state.aux.tempoUnidade = tUnidade; state.tempoUnidade = tUnidade;
  if ($("tempoUnidade")) $("tempoUnidade").value = tUnidade;
  
  const idade = getV("agilIdade");
  state.aux.idade = idade; state.idade = idade;
  if ($("idade")) $("idade").value = idade;
  
  const readap = getRadio("agilReadaptado");
  if (readap) {
    state.readaptado = readap; state.aux.readaptado = readap;
    setRadio("readaptado", readap);
    $("readaptadoPanel")?.classList.toggle("hidden", readap !== "Sim");
    $("agilReadaptadoPanel")?.classList.toggle("hidden", readap !== "Sim");
  }
  const ativReadap = getV("agilAtividadesReadaptado");
  state.aux.atividadesReadaptado = ativReadap; state.atividadesReadaptado = ativReadap;
  if ($("atividadesReadaptado")) $("atividadesReadaptado").value = ativReadap;
  
  // Bloco 02
  const doenca = getV("agilDoencaMotivo");
  state.aux.doencaMotivo = doenca; state.doencaMotivo = doenca;
  if ($("doencaMotivo")) $("doencaMotivo").value = doenca;

  const inicioTrat = getV("agilInicioTratamento");
  state.aux.inicioTratamento = inicioTrat; state.inicioTratamento = inicioTrat;
  if ($("inicioTratamento")) $("inicioTratamento").value = inicioTrat;

  const freqCons = getV("agilFreqConsultas");
  state.aux.freqConsultas = freqCons; state.freqConsultas = freqCons;
  if ($("freqConsultas")) $("freqConsultas").value = freqCons;

  const sintLimit = getV("agilSintomasLimitacao");
  state.aux.sintomasLimitacao = sintLimit; state.sintomasLimitacao = sintLimit;
  if ($("sintomasLimitacao")) $("sintomasLimitacao").value = sintLimit;

  const altMed = getRadio("agilAlteracaoMed");
  if (altMed) {
    state.alteracaoMed = altMed; state.aux.alteracaoMed = altMed;
    setRadio("alteracaoMed", altMed);
    $("alteracaoPanel")?.classList.toggle("hidden", altMed !== "Sim");
    $("agilAlteracaoPanel")?.classList.toggle("hidden", altMed !== "Sim");
  }
  const dtAlt = getV("agilDataAlteracaoMed");
  state.aux.dataAlteracaoMed = dtAlt; state.dataAlteracaoMed = dtAlt;
  if ($("dataAlteracaoMed")) $("dataAlteracaoMed").value = dtAlt;

  const obsAlt = getV("agilObsAlteracaoMed");
  state.aux.obsAlteracaoMed = obsAlt; state.obsAlteracaoMed = obsAlt;
  if ($("obsAlteracaoMed")) $("obsAlteracaoMed").value = obsAlt;

  if ($("agilPsicoterapia")) {
    state.psicoterapia = $("agilPsicoterapia").checked;
    state.aux.psicoterapia = state.psicoterapia;
    if ($("psicoterapia")) $("psicoterapia").checked = state.psicoterapia;
  }
  if ($("agilFisioterapia")) {
    state.fisioterapia = $("agilFisioterapia").checked;
    state.aux.fisioterapia = state.fisioterapia;
    if ($("fisioterapia")) $("fisioterapia").checked = state.fisioterapia;
  }
  const obsTer = getV("agilObsTerapias");
  state.aux.obsTerapias = obsTer; state.obsTerapias = obsTer;
  if ($("obsTerapias")) $("obsTerapias").value = obsTer;

  const outras = getRadio("agilOutrasDoencas");
  if (outras) {
    state.outrasDoencas = outras; state.aux.outrasDoencas = outras;
    setRadio("outrasDoencas", outras);
    $("doencasPanel")?.classList.toggle("hidden", outras !== "Sim");
    $("agilDoencasPanel")?.classList.toggle("hidden", outras !== "Sim");
  }

  const histPreg = getV("agilHistoricoPregresso");
  state.aux.historicoPregresso = histPreg; state.historicoPregresso = histPreg;
  if ($("historicoPregresso")) $("historicoPregresso").value = histPreg;

  // Bloco 03
  const agilCid = getV("agilCid");
  if (agilCid) {
    state.cid = agilCid; state.aux.cid = agilCid;
    if ($("cid")) $("cid").value = agilCid;
  }

  const crmCro = getV("agilCrmCro");
  if (crmCro) {
    state.aux.crmCro = crmCro; state.crmCro = crmCro;
    if ($("crmCro")) $("crmCro").value = crmCro;
  }

  const dtExp = getV("agilDataExpedicao") || getV("dataExpedicao");
  if (dtExp) {
    const isoExpSync = toIsoDate(dtExp);
    const brExpSync = /^\d{4}-\d{2}-\d{2}$/.test(isoExpSync) ? isoExpSync.split("-").reverse().join("/") : dtExp;
    state.dataExpedicao = isoExpSync;
    state.aux.dataExpedicaoIso = isoExpSync;
    state.aux.dataExpedicao = brExpSync;
    if ($("dataExpedicao")) $("dataExpedicao").value = isoExpSync;
    if ($("agilDataExpedicao")) $("agilDataExpedicao").value = isoExpSync;
  }

  const dtDoc = getV("agilDataDocumento");
  if (dtDoc) {
    state.aux.dataDocumento = dtDoc; state.dataDocumento = dtDoc;
    if ($("dataDocumento")) $("dataDocumento").value = dtDoc;
  }

  const diasSol = getV("agilDiasSolicitados");
  if (diasSol) {
    state.aux.diasSolicitados = diasSol; state.diasSolicitados = diasSol;
    if ($("diasSolicitados")) $("diasSolicitados").value = diasSol;
  }
  if (typeof atualizarDiasConcedidosAutomatico === "function") {
    atualizarDiasConcedidosAutomatico();
  }
  
  const exTipo = getV("agilExameFisicoTipo");
  if (exTipo) {
    state.exameFisicoTipo = exTipo;
    if ($("exameFisicoTipo")) $("exameFisicoTipo").value = exTipo;
  }
  
  const pSist = getV("agilPressaoSistolica");
  if (pSist) {
    state.aux.pressaoSistolica = pSist; state.pressaoSistolica = pSist;
    if ($("pressaoSistolica")) $("pressaoSistolica").value = pSist;
  }

  const pDiast = getV("agilPressaoDiastolica");
  if (pDiast) {
    state.aux.pressaoDiastolica = pDiast; state.pressaoDiastolica = pDiast;
    if ($("pressaoDiastolica")) $("pressaoDiastolica").value = pDiast;
  }

  const pulso = getV("agilPulso");
  if (pulso) {
    state.aux.pulso = pulso; state.pulso = pulso;
    if ($("pulso")) $("pulso").value = pulso;
  }

  const altura = getV("agilAltura");
  if (altura) {
    state.aux.altura = altura; state.altura = altura;
    if ($("altura")) $("altura").value = altura;
  }

  const peso = getV("agilPeso");
  if (peso) {
    state.aux.peso = peso; state.peso = peso;
    if ($("peso")) $("peso").value = peso;
  }
  
  const exDesc = getV("agilExameFisicoDescricao");
  if (exDesc) {
    state.exameFisicoDescricao = exDesc;
    if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = exDesc;
  }
  if (state.outrosSubtipo) {
    state.aux.outrosSubtipo = state.outrosSubtipo;
    state.aux.areaExameClinico = state.outrosSubtipo;
  }
  if (state.outrosResultado) {
    state.aux.outrosResultado = state.outrosResultado;
    state.aux.resultadoAvaliacao = state.outrosResultado;
  }
  
  // Bloco 04
  const just = getV("agilJustificativa");
  if (just) {
    state.aux.justificativa = just; state.justificativa = just;
    if ($("justificativa")) $("justificativa").value = just;
  }
  if (Array.isArray(state.cidsSecundarios)) {
    state.aux.cidsSecundarios = state.cidsSecundarios;
  }
  if (typeof ensureDefaultQuesitos === "function") ensureDefaultQuesitos();
  if (typeof QuesitoService !== "undefined") state.quesitos = QuesitoService.get();
}

function syncAgilField(field, value) {
  if (!state.aux) state.aux = {};
  state.aux[field] = value;
  state[field] = value;
  const el = $(field);
  if (el && el !== document.activeElement) el.value = value;
  const agilKey = "agil" + field.charAt(0).toUpperCase() + field.slice(1);
  const agilEl = $(agilKey);
  if (agilEl && agilEl !== document.activeElement) agilEl.value = value;
  if (field === "pressaoSistolica" || field === "pressaoDiastolica" || field === "pulso") {
    if (typeof checkVitalsPadraoState === "function") checkVitalsPadraoState();
  }
  if (field === "altura" || field === "peso") {
    if (typeof calcularIMC === "function") calcularIMC();
  }
  if (field === "dataDocumento" || field === "diasSolicitados" || field === "dataExpedicao") {
    if (typeof calcularDatasAtestado === "function") calcularDatasAtestado();
    if (typeof verificarRegraJuntaMedica === "function") verificarRegraJuntaMedica();
  }
  if (field === "justificativa") {
    if (typeof verificarCoerenciaPericial === "function") verificarCoerenciaPericial();
  }
  if (typeof atualizarContadorEsisla === "function") {
    atualizarContadorEsisla(field);
    atualizarContadorEsisla(agilKey);
  }
  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
  autoSave();
}

function syncAgilCpf(value) {
  const formatted = formatCPF(value);
  if ($("agilCpfPaciente")) $("agilCpfPaciente").value = formatted;
  if ($("cpfPaciente")) $("cpfPaciente").value = formatted;
  state.cpfPaciente = formatted;
  if (!state.aux) state.aux = {};
  state.aux.cpfPaciente = formatted;
  if (typeof verificarHistoricoPericiado === "function") verificarHistoricoPericiado(formatted);
  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
  autoSave();
}

function syncAgilRadio(field, value) {
  if (!state.aux) state.aux = {};
  state[field] = value;
  state.aux[field] = value;
  setRadio(field, value);
  if (typeof verificarCoerenciaPericial === "function") verificarCoerenciaPericial();
  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
  autoSave();
}

function syncAgilCheckbox(field, checked) {
  state[field] = !!checked;
  if (!state.aux) state.aux = {};
  state.aux[field] = !!checked;
  const el = $(field);
  if (el) el.checked = !!checked;
  const agilEl = $("agil" + field.charAt(0).toUpperCase() + field.slice(1));
  if (agilEl) agilEl.checked = !!checked;
  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
  autoSave();
}

function syncAgilReadaptado(val) {
  state.readaptado = val;
  if (!state.aux) state.aux = {};
  state.aux.readaptado = val;
  setRadio("readaptado", val);
  setRadio("agilReadaptado", val);
  $("readaptadoPanel")?.classList.toggle("hidden", val !== "Sim");
  $("agilReadaptadoPanel")?.classList.toggle("hidden", val !== "Sim");
  if (typeof ajustarQuesitosPorParecerEReadaptacao === "function") ajustarQuesitosPorParecerEReadaptacao();
  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
  autoSave();
}

function syncAgilAlteracaoMed(val) {
  state.alteracaoMed = val;
  if (!state.aux) state.aux = {};
  state.aux.alteracaoMed = val;
  setRadio("alteracaoMed", val);
  setRadio("agilAlteracaoMed", val);
  $("alteracaoPanel")?.classList.toggle("hidden", val !== "Sim");
  $("agilAlteracaoPanel")?.classList.toggle("hidden", val !== "Sim");
  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
  autoSave();
}

function syncAgilOutrasDoencas(val) {
  state.outrasDoencas = val;
  if (!state.aux) state.aux = {};
  state.aux.outrasDoencas = val;
  setRadio("outrasDoencas", val);
  setRadio("agilOutrasDoencas", val);
  $("doencasPanel")?.classList.toggle("hidden", val !== "Sim");
  $("agilDoencasPanel")?.classList.toggle("hidden", val !== "Sim");
  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
  autoSave();
}

function onAgilDoencaMotivoInput(val) {
  if (!state.aux) state.aux = {};
  state.aux.doencaMotivo = val;
  state.doencaMotivo = val;
  if ($("doencaMotivo")) $("doencaMotivo").value = val;

  // Autopreencher antecedentes mórbidos logo abaixo se não houver texto manual personalizado
  if (!window.__isBulkApplyingIA) {
    const curHist = (state.aux.historicoPregresso || state.historicoPregresso || $("agilHistoricoPregresso")?.value || "").trim();
    if (!curHist || curHist === "Nega" || curHist === "Nega." || curHist.startsWith("Refere histórico relacionado a")) {
      const v = (val || "").trim();
      const isRawNarrative = v.length > 90 || /\b(?:periciand[oa]|periciad[oa]|servidor[a]?|paciente|apresenta|relata|refere|submetid[oa]|recebeu|prescrit[oa]|atestado|afastou|afastamento|oncol[óo]gic[oa]|c[âa]ncer|neoplasia|infus[ãa]o|infus[õo]es|imuno\s*biol[óo]gico)\b/i.test(v);
      if (v && !isRawNarrative) {
        const autoText = `Refere histórico de ${v}.`;
        state.aux.historicoPregresso = autoText;
        state.historicoPregresso = autoText;
        if ($("agilHistoricoPregresso")) $("agilHistoricoPregresso").value = autoText;
        if ($("historicoPregresso")) $("historicoPregresso").value = autoText;
      }
    }
  }

  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
  autoSave();
}

function onAgilExameTipoChange(val) {
  state.exameFisicoTipo = val;
  if ($("exameFisicoTipo")) $("exameFisicoTipo").value = (val === "Outros" && state.outrosSubtipo) ? state.outrosSubtipo : val;
  const mentalWrap = $("agilMentalSelector");
  const osteoWrap = $("agilOsteomuscularSelector");
  const outrosWrap = $("agilOutrosSelector");
  const btnIaJust = $("btnAgilJustificativaIA");

  if (val === "Exame Mental") {
    if (mentalWrap) mentalWrap.style.display = "block";
    if (osteoWrap) osteoWrap.style.display = "none";
    if (outrosWrap) outrosWrap.style.display = "none";
    if (btnIaJust) btnIaJust.style.display = "none";
  } else if (val === "Aparelho Osteomuscular e Tecido Conjutivo") {
    if (mentalWrap) mentalWrap.style.display = "none";
    if (osteoWrap) osteoWrap.style.display = "block";
    if (outrosWrap) outrosWrap.style.display = "none";
    if (btnIaJust) btnIaJust.style.display = "none";
    if (typeof updateOsteoUI === "function") updateOsteoUI();
  } else if (val === "Outros") {
    if (mentalWrap) mentalWrap.style.display = "none";
    if (osteoWrap) osteoWrap.style.display = "none";
    if (outrosWrap) outrosWrap.style.display = "block";
    if (btnIaJust) btnIaJust.style.display = "inline-flex";

    state.exameMentalResultado = "";
    state.osteomuscularResultado = "";
    state.osteomuscularRegioes = {};
    if (typeof updateOsteoUI === "function") updateOsteoUI();
    const cur = state.exameFisicoDescricao || "";
    const isMentalNorm = typeof TEXTO_EXAME_MENTAL_NORMAL !== "undefined" && cur === TEXTO_EXAME_MENTAL_NORMAL;
    const isMentalAlt = typeof TEXTO_EXAME_MENTAL_ALTERADO !== "undefined" && cur === TEXTO_EXAME_MENTAL_ALTERADO;
    const isOsteoNorm = (typeof TEXTO_OSTEO_NORMAL !== "undefined" && cur === TEXTO_OSTEO_NORMAL) || (typeof TEXTO_OSTEO_NORMAL_EXAME !== "undefined" && cur === TEXTO_OSTEO_NORMAL_EXAME);
    if (!window.__isBulkApplyingIA && (isMentalNorm || isMentalAlt || isOsteoNorm || cur.includes("Trapézios sem contraturas") || cur.includes("mobilidade ativa e passiva normais") || (temGeralCur && (cur.includes("Nível de consciência:") || cur.includes("Apresenta-se consciente") || cur.includes("Apresentas-e consciente") || cur.includes("mobilidade ativa"))))) {
      const resetVal = temGeralCur ? TEXTO_EXAME_FISICO_GERAL_PADRAO : "";
      state.exameFisicoDescricao = resetVal;
      if (!state.aux) state.aux = {};
      state.aux.exameFisicoDescricao = resetVal;
      if ($("agilExameFisicoDescricao")) $("agilExameFisicoDescricao").value = resetVal;
      if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = resetVal;
    }
    renderOutrosUI();
  } else {
    if (mentalWrap) mentalWrap.style.display = "none";
    if (osteoWrap) osteoWrap.style.display = "none";
    if (outrosWrap) outrosWrap.style.display = "none";
    if (btnIaJust) btnIaJust.style.display = "none";
  }
  autoSave();
}

function renderOutrosUI() {
  const outrosWrap = $("agilOutrosSelector");
  if (outrosWrap && (state.exameFisicoTipo === "Outros" || state.aux?.exameFisicoTipo === "Outros" || $("agilExameFisicoTipo")?.value === "Outros")) {
    outrosWrap.style.display = "block";
    const btnIaJust = $("btnAgilJustificativaIA");
    if (btnIaJust) btnIaJust.style.display = "inline-flex";
  }

  const normTarget = String(state.outrosSubtipo || state.aux?.outrosSubtipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const chips = document.querySelectorAll("#agilOutrosChips .outros-chip-btn");
  chips.forEach(btn => {
    const subtipo = btn.dataset.subtipo || "";
    const normSub = subtipo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const match = subtipo === state.outrosSubtipo || (normTarget && (normSub === normTarget || normSub.includes(normTarget) || normTarget.includes(normSub)));
    if (match) {
      btn.classList.add("selected-chip");
    } else {
      btn.classList.remove("selected-chip");
    }
  });

  const resWrap = $("agilOutrosResultadoWrap");
  if (state.outrosSubtipo) {
    if (resWrap) resWrap.style.display = "block";
    const tit = $("agilOutrosResultadoTitulo");
    if (tit) tit.textContent = `Resultado da avaliação (${state.outrosSubtipo}):`;
  } else {
    if (resWrap) resWrap.style.display = "none";
  }

  if (!state.outrosResultado && !state.aux?.outrosResultado) {
    const p = String(state.parecer || state.aux?.parecer || $("agilParecer")?.value || $("parecer")?.value || "").toUpperCase();
    if (p === "FAVORÁVEL" || p === "FAVORAVEL") {
      state.outrosResultado = "Alterado";
      if (!state.aux) state.aux = {};
      state.aux.outrosResultado = "Alterado";
    } else if (p === "CONTRÁRIO" || p === "CONTRARIO") {
      state.outrosResultado = "Normal";
      if (!state.aux) state.aux = {};
      state.aux.outrosResultado = "Normal";
    }
  }

  const btnNorm = $("btnAgilOutrosNormal");
  const btnAlt = $("btnAgilOutrosAlterado");
  if (btnNorm && btnAlt) {
    if (state.outrosResultado === "Normal") {
      btnNorm.classList.add("selected-normal");
      btnAlt.classList.remove("selected-alterado");
    } else if (state.outrosResultado === "Alterado") {
      btnAlt.classList.add("selected-alterado");
      btnNorm.classList.remove("selected-normal");
    } else {
      btnNorm.classList.remove("selected-normal");
      btnAlt.classList.remove("selected-alterado");
    }
  }
}

function escolherOutrosSubtipo(nome) {
  state.outrosSubtipo = nome;
  if (!state.aux) state.aux = {};
  state.aux.outrosSubtipo = nome;
  state.aux.areaExameClinico = nome;
  if ($("exameFisicoTipo")) $("exameFisicoTipo").value = nome;
  renderOutrosUI();
  autoSave();
  toast(`Segmento ${nome} selecionado.`);
}

function escolherOutrosResultado(resultado) {
  state.outrosResultado = resultado;
  if (!state.aux) state.aux = {};
  state.aux.outrosResultado = resultado;
  state.aux.resultadoAvaliacao = resultado;
  renderOutrosUI();

  const isRetroInvalida = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  const parecerAtual = String(state.parecerManualOverride || state.parecer || state.aux?.parecer || $("agilParecer")?.value || $("parecer")?.value || "").toUpperCase();
  const isParecerFav = (parecerAtual === "FAVORÁVEL" || parecerAtual === "FAVORAVEL");

  if (resultado === "Normal") {
    if (isRetroInvalida && state.parecerManualOverride !== "FAVORÁVEL") {
      aplicarParecerContrarioRetroacao(true);
      toast(`Avaliação: NORMAL • Parecer CONTRÁRIO mantido por retroação inválida (> 3 dias).`);
    } else if (isParecerFav) {
      // Perícia Retrospectiva / Homologação Pretérita: Exame físico atual normal por recuperação, mantendo parecer favorável para os dias do atestado
      state.limitacaoFuncional = "Sim";
      state.limitacaoRol = "Sim";
      setRadio("limitacaoFuncional", "Sim");
      setRadio("limitacaoRol", "Sim");
      state.capacidade = "Capacidade parcial e temporariamente prejudicada";
      setRadio("capacidade", "Capacidade parcial e temporariamente prejudicada");
      state.parecer = "FAVORÁVEL";
      setRadio("parecer", "FAVORÁVEL");
      setRadio("agilParecer", "FAVORÁVEL");
      if (typeof QuesitoService !== "undefined") {
        QuesitoService.set(0, "Sim");
        QuesitoService.set(1, "Sim");
        QuesitoService.set(2, "Sim");
        renderQuesitos();
      }
      if (typeof concederMesmosDiasAtestado === "function") concederMesmosDiasAtestado();
      toast(`Avaliação: NORMAL • Homologação Retrospectiva: Parecer FAVORÁVEL mantido para o período do atestado.`);
    } else {
      state.limitacaoFuncional = "Não";
      state.limitacaoRol = "Não";
      setRadio("limitacaoFuncional", "Não");
      setRadio("limitacaoRol", "Não");
      state.capacidade = "Capacidade laborativa preservada";
      setRadio("capacidade", "Capacidade laborativa preservada");
      state.parecer = "CONTRÁRIO";
      setRadio("parecer", "CONTRÁRIO");
      setRadio("agilParecer", "CONTRÁRIO");
      ajustarQuesitosPorParecerEReadaptacao();
      if (typeof atualizarDiasConcedidosAutomatico === "function") atualizarDiasConcedidosAutomatico();
      toast(`Avaliação (${state.outrosSubtipo || "Outros"}): NORMAL.`);
    }
  } else if (resultado === "Alterado") {
    if (isRetroInvalida && state.parecerManualOverride !== "FAVORÁVEL") {
      aplicarParecerContrarioRetroacao(true);
      toast(`Avaliação: ALTERADO • Parecer CONTRÁRIO mantido por retroação da guia (> 3 dias).`);
    } else if (state.parecerManualOverride === "CONTRÁRIO") {
      state.parecer = "CONTRÁRIO";
      setRadio("parecer", "CONTRÁRIO");
      setRadio("agilParecer", "CONTRÁRIO");
      toast(`Avaliação: ALTERADO • Parecer CONTRÁRIO mantido conforme sua escolha.`);
    } else {
      state.limitacaoFuncional = "Sim";
      state.limitacaoRol = "Sim";
      setRadio("limitacaoFuncional", "Sim");
      setRadio("limitacaoRol", "Sim");
      state.capacidade = "Capacidade parcial e temporariamente prejudicada";
      setRadio("capacidade", "Capacidade parcial e temporariamente prejudicada");
      state.parecer = "FAVORÁVEL";
      setRadio("parecer", "FAVORÁVEL");
      setRadio("agilParecer", "FAVORÁVEL");
      if (typeof QuesitoService !== "undefined") {
        QuesitoService.set(0, "Sim");
        QuesitoService.set(1, "Sim");
        QuesitoService.set(2, "Sim");
        renderQuesitos();
      }
    }

    // Limitações funcionais baseadas no CID aplicado e nas atividades do cargo (sem descrever exame físico)
    const cidVal = state.cid || state.aux?.cid || $("cid")?.value || $("agilCid")?.value || "";
    const cidInfo = typeof findCID === "function" ? findCID(cidVal) : null;
    const cidNome = cidInfo?.n || state.aux?.doencaMotivo || "patologia em tratamento";
    const cargoNome = state.aux?.cargo || state.cargo || $("cargo")?.value || $("agilCargo")?.value || "servidor";

    if (!state.descLimitacao && !state.aux?.descLimitacao) {
      const limitacaoCid = `Limitações funcionais decorrentes do quadro clínico (${cidVal ? cidVal + ' - ' : ''}${cidNome}), com redução temporária do rendimento e necessidade de repouso/adaptação funcional para as atividades do cargo de ${cargoNome}.`;
      state.descLimitacao = limitacaoCid;
      if (!state.aux) state.aux = {};
      state.aux.descLimitacao = limitacaoCid;
      if ($("descLimitacao")) $("descLimitacao").value = limitacaoCid;
      if (!state.aux.sintomasLimitacao) {
        state.aux.sintomasLimitacao = limitacaoCid;
        state.sintomasLimitacao = limitacaoCid;
      }
    }

    if (typeof atualizarDiasConcedidosAutomatico === "function") atualizarDiasConcedidosAutomatico();
    toast(`Avaliação (${state.outrosSubtipo || "Outros"}): ALTERADO. Limitações funcionais vinculadas ao CID.`);
  }
  if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") atualizarEstiloBotoesParecerDataAntiga();
  autoSave();
}

function onAgilCidInput(val) {
  const v = normalizeCID(val);
  const box = $("agilCidSuggestions");
  const badge = $("agilCidBadge");
  
  state.cid = val;
  if (!state.aux) state.aux = {};
  state.aux.cid = val;
  if ($("cid")) $("cid").value = val;
  
  if (!v) {
    if (box) { box.classList.remove("show"); box.innerHTML = ""; }
    if (badge) { badge.style.display = "none"; badge.innerHTML = ""; }
    autoSave();
    return;
  }
  
  const results = searchCIDs(val, 10);
  if (box) {
    if (!results.length) {
      box.classList.remove("show");
      box.innerHTML = "";
    } else {
      box.innerHTML = results.map(x => `
        <div class="cid-option" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;gap:10px" onclick="selectAgilCID('${esc(x.c)}')">
          <span class="cid-code" style="font-weight:800;color:#0F3254;background:#E2E8F0;padding:2px 8px;border-radius:6px;font-size:12px">${esc(x.c)}</span>
          <span style="flex:1">
            <div style="font-weight:600;font-size:13px;color:#1E293B">${esc(x.n)}</div>
            <div style="font-size:11px;color:#64748B">${esc(x.g)}</div>
          </span>
        </div>
      `).join("");
      box.classList.add("show");
    }
  }
  
  const exact = findCID(v);
  if (exact && badge) {
    badge.style.display = "inline-flex";
    badge.innerHTML = `<strong>${esc(exact.c)}</strong> — ${esc(exact.n)}`;
    const rotulo = `${exact.c} — ${exact.n}`;
    const oldDoenca = String(state.aux?.doencaMotivo || state.doencaMotivo || $("doencaMotivo")?.value || $("agilDoencaMotivo")?.value || "").trim();
    if (!oldDoenca || oldDoenca === "Conforme queixa relatada" || isGenericCIDLabel(oldDoenca)) {
      state.aux.doencaMotivo = rotulo;
      state.doencaMotivo = rotulo;
      if ($("doencaMotivo")) $("doencaMotivo").value = rotulo;
      if ($("agilDoencaMotivo")) $("agilDoencaMotivo").value = rotulo;
    }
  } else if (badge) {
    badge.style.display = "none";
  }
  
  autoSave();
}

function selectAgilCID(code) {
  const found = findCID(code);
  const cleanCode = code || "";
  if ($("agilCid")) $("agilCid").value = cleanCode;
  if ($("cid")) $("cid").value = cleanCode;
  if ($("agilCidSuggestions")) $("agilCidSuggestions").classList.remove("show");
  
  state.cid = cleanCode;
  if (!state.aux) state.aux = {};
  state.aux.cid = cleanCode;
  
  const badge = $("agilCidBadge");
  if (found && badge) {
    badge.style.display = "inline-flex";
    badge.innerHTML = `<strong>${esc(found.c)}</strong> — ${esc(found.n)}`;
  }
  
  // Não preencher agilDoencaMotivo com o CID; o perito relata os sintomas reais
  autoSave();
  toast(`CID ${cleanCode}${found?.n ? ' (' + found.n + ')' : ''} selecionado.`);
}

/* =========================================================
   CIDs SECUNDÁRIOS / ATESTADOS ADICIONAIS
   ========================================================= */
function renderSecondaryCIDs() {
  if (!Array.isArray(state.cidsSecundarios)) state.cidsSecundarios = [];
  const renderContainer = (containerId, prefix) => {
    const container = $(containerId);
    if (!container) return;
    if (state.cidsSecundarios.length === 0) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = state.cidsSecundarios.map((item, idx) => {
      const cidVal = typeof item === "object" ? (item.cid || "") : String(item || "");
      const descVal = typeof item === "object" ? (item.descricao || "") : "";
      const exact = findCID(cidVal);
      const displayDesc = descVal || (exact ? exact.n : "");
      return `
        <div class="secondary-cid-item" style="border:1px solid #CBD5E1;background:#F8FAFC;border-radius:8px;padding:8px 12px;position:relative;margin-bottom:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:#0F3254;display:flex;align-items:center;gap:6px">
              <span>📄</span> Outro CID / Atestado adicional #${idx + 1}
            </span>
            <button type="button" onclick="removeSecondaryCID(${idx})" style="background:none;border:none;color:#DC2626;cursor:pointer;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border-radius:4px" title="Remover este CID">
              ✕ Remover
            </button>
          </div>
          <div style="position:relative">
            <input class="input" style="font-size:13px;padding:7px 10px;background:#FFFFFF" placeholder="Digite o código ou nome da patologia (ex: M54.5, I10...)" value="${esc(cidVal)}" oninput="onSecondaryCIDInput(${idx}, this.value, '${prefix}')" onfocus="onSecondaryCIDInput(${idx}, this.value, '${prefix}')" autocomplete="off" id="${prefix}_cid_input_${idx}">
            <div id="${prefix}_suggestions_${idx}" class="cid-autocomplete-box" style="position:absolute;top:100%;left:0;right:0;z-index:99;background:#fff;border:1px solid #CBD5E1;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.12);max-height:180px;overflow-y:auto;display:none"></div>
          </div>
          ${(cidVal && (exact || displayDesc)) ? `
            <div class="cid-badge-pill" style="display:inline-flex;margin-top:6px;font-size:12px;padding:3px 8px;background:#EBF5FF;color:#1E40AF;border:1px solid #BFDBFE;border-radius:6px;font-weight:600">
              <strong>${esc(cidVal.toUpperCase())}</strong>${displayDesc ? ` — ${esc(displayDesc)}` : ""}
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  };

  renderContainer("agilSecondaryCidContainer", "agilSec");
  renderContainer("extSecondaryCidContainer", "extSec");
}

function onSecondaryCIDInput(idx, val, prefix) {
  if (!Array.isArray(state.cidsSecundarios)) state.cidsSecundarios = [];
  if (!state.cidsSecundarios[idx]) state.cidsSecundarios[idx] = { cid: "", descricao: "" };
  state.cidsSecundarios[idx].cid = val;
  if (!state.aux) state.aux = {};
  state.aux.cidsSecundarios = state.cidsSecundarios;

  const v = normalizeCID(val);
  const exact = findCID(v);
  if (exact) {
    state.cidsSecundarios[idx].cid = exact.c;
    state.cidsSecundarios[idx].descricao = exact.n;
  }

  // Mirror text to the other container if rendered
  const otherPrefix = prefix === "agilSec" ? "extSec" : "agilSec";
  const otherInput = $(`${otherPrefix}_cid_input_${idx}`);
  if (otherInput && otherInput !== document.activeElement) {
    otherInput.value = val;
  }

  const box = $(`${prefix}_suggestions_${idx}`);
  if (!box) {
    autoSave();
    return;
  }

  if (!v || v.length < 1) {
    box.style.display = "none";
    box.innerHTML = "";
    autoSave();
    return;
  }

  const results = cidLibrary.filter(x => x.c.toUpperCase().startsWith(v) || x.n.toUpperCase().includes(v)).slice(0, 8);
  if (!results.length) {
    box.style.display = "none";
    box.innerHTML = "";
  } else {
    box.innerHTML = results.map(x => `
      <div class="cid-option" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;gap:8px" onmousedown="selectSecondaryCID(${idx}, '${esc(x.c)}', '${esc(x.n)}')">
        <span class="cid-code" style="font-weight:800;color:#0F3254;background:#E2E8F0;padding:2px 6px;border-radius:4px;font-size:11px">${esc(x.c)}</span>
        <span style="flex:1">
          <div style="font-weight:600;font-size:12px;color:#1E293B">${esc(x.n)}</div>
          <div style="font-size:10px;color:#64748B">${esc(x.g)}</div>
        </span>
      </div>
    `).join("");
    box.style.display = "block";
  }
  autoSave();
}

function selectSecondaryCID(idx, code, name) {
  if (!Array.isArray(state.cidsSecundarios)) state.cidsSecundarios = [];
  if (!state.cidsSecundarios[idx]) state.cidsSecundarios[idx] = { cid: "", descricao: "" };
  state.cidsSecundarios[idx].cid = code;
  state.cidsSecundarios[idx].descricao = name;
  if (!state.aux) state.aux = {};
  state.aux.cidsSecundarios = state.cidsSecundarios;
  renderSecondaryCIDs();
  autoSave();
  toast(`CID adicional ${code} adicionado.`);
}

function removeSecondaryCID(idx) {
  if (Array.isArray(state.cidsSecundarios)) {
    state.cidsSecundarios.splice(idx, 1);
    if (!state.aux) state.aux = {};
    state.aux.cidsSecundarios = state.cidsSecundarios;
    renderSecondaryCIDs();
    autoSave();
    toast("CID adicional removido.");
  }
}

function addSecondaryCID(code = "", desc = "") {
  if (!Array.isArray(state.cidsSecundarios)) state.cidsSecundarios = [];
  state.cidsSecundarios.push({ cid: code, descricao: desc });
  if (!state.aux) state.aux = {};
  state.aux.cidsSecundarios = state.cidsSecundarios;
  renderSecondaryCIDs();
  setTimeout(() => {
    const newIdx = state.cidsSecundarios.length - 1;
    const el = $(`agilSec_cid_input_${newIdx}`) || $(`extSec_cid_input_${newIdx}`);
    if (el) el.focus();
  }, 50);
  autoSave();
}

function escolherExameMental(resultado) {
  state.exameMentalResultado = resultado;
  const btnNormal = $("btnAgilMentalNormal");
  const btnAlterado = $("btnAgilMentalAlterado");
  if (resultado === "Normal") {
    btnNormal?.classList.add("selected-normal");
    btnAlterado?.classList.remove("selected-alterado");
    aplicarExameMentalNormal();
  } else if (resultado === "Alterado") {
    btnAlterado?.classList.add("selected-alterado");
    btnNormal?.classList.remove("selected-normal");
    aplicarExameMentalAlterado();
  }
}

function aplicarExameMentalNormal() {
  state.exameMentalResultado = "Normal";
  state.exameFisicoTipo = "Exame Mental";
  if ($("exameFisicoTipo")) $("exameFisicoTipo").value = "Exame Mental";
  if ($("agilExameFisicoTipo")) $("agilExameFisicoTipo").value = "Exame Mental";
  
  const descMentalNormal = extrairOuPreservarExameGeral(TEXTO_EXAME_MENTAL_NORMAL);
  state.exameFisicoDescricao = descMentalNormal;
  if (!state.aux) state.aux = {};
  state.aux.exameFisicoDescricao = descMentalNormal;
  if ($("agilExameFisicoDescricao")) $("agilExameFisicoDescricao").value = descMentalNormal;
  if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = descMentalNormal;
  
  const isRetroInv = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  if (isRetroInv && state.parecerManualOverride !== "FAVORÁVEL") {
    aplicarParecerContrarioRetroacao(true);
    autoSave();
    if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") atualizarEstiloBotoesParecerDataAntiga();
    return;
  }
  if (state.parecerManualOverride === "FAVORÁVEL") {
    state.parecer = "FAVORÁVEL";
    setRadio("parecer", "FAVORÁVEL");
    setRadio("agilParecer", "FAVORÁVEL");
    state.limitacaoFuncional = "Sim";
    state.limitacaoRol = "Sim";
    setRadio("limitacaoFuncional", "Sim");
    setRadio("limitacaoRol", "Sim");
    autoSave();
    if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") atualizarEstiloBotoesParecerDataAntiga();
    toast("Exame mental NORMAL (Parecer FAVORÁVEL mantido conforme sua escolha).");
    return;
  }

  state.limitacaoFuncional = "Não";
  state.limitacaoRol = "Não";
  setRadio("limitacaoFuncional", "Não");
  setRadio("limitacaoRol", "Não");
  const existingDescLimMentalNorm = (state.descLimitacao || state.aux?.descLimitacao || $("descLimitacao")?.value || "").trim();
  if (!existingDescLimMentalNorm) {
    state.descLimitacao = TEXTO_LIMITACAO_NORMAL;
    if (!state.aux) state.aux = {};
    state.aux.descLimitacao = TEXTO_LIMITACAO_NORMAL;
    if ($("descLimitacao")) $("descLimitacao").value = TEXTO_LIMITACAO_NORMAL;
  }
  
  // Limpar atividades comprometidas do Rol (Normal = sem limitações mentais)
  state.atividadesComprometidas = "";
  if (!state.aux) state.aux = {};
  state.aux.atividadesComprometidas = "";
  if ($("atividadesComprometidas")) $("atividadesComprometidas").value = "";
  
  state.parecer = "CONTRÁRIO";
  setRadio("parecer", "CONTRÁRIO");
  setRadio("agilParecer", "CONTRÁRIO");
  ajustarQuesitosPorParecerEReadaptacao();
  
  state.aux.justificativa = TEXTO_JUSTIFICATIVA_NORMAL;
  state.justificativa = TEXTO_JUSTIFICATIVA_NORMAL;
  if ($("agilJustificativa")) $("agilJustificativa").value = TEXTO_JUSTIFICATIVA_NORMAL;
  if ($("justificativa")) $("justificativa").value = TEXTO_JUSTIFICATIVA_NORMAL;
  
  autoSave();
  if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") atualizarEstiloBotoesParecerDataAntiga();
  toast("Exame mental NORMAL: achados, limitações, quesitos e parecer CONTRÁRIO preenchidos.");
}

function aplicarExameMentalAlterado() {
  state.exameMentalResultado = "Alterado";
  state.exameFisicoTipo = "Exame Mental";
  if ($("exameFisicoTipo")) $("exameFisicoTipo").value = "Exame Mental";
  if ($("agilExameFisicoTipo")) $("agilExameFisicoTipo").value = "Exame Mental";
  
  const descMentalAlterado = extrairOuPreservarExameGeral(TEXTO_EXAME_MENTAL_ALTERADO);
  state.exameFisicoDescricao = descMentalAlterado;
  if (!state.aux) state.aux = {};
  state.aux.exameFisicoDescricao = descMentalAlterado;
  if ($("agilExameFisicoDescricao")) $("agilExameFisicoDescricao").value = descMentalAlterado;
  if ($("exameFisicoDescricao")) $("exameFisicoDescricao").value = descMentalAlterado;
  
  state.limitacaoFuncional = "Sim";
  state.limitacaoRol = "Sim";
  setRadio("limitacaoFuncional", "Sim");
  setRadio("limitacaoRol", "Sim");
  $("limitacao1Panel")?.classList.remove("hidden");
  $("limitacao2Panel")?.classList.remove("hidden");
  const existingDescLimMentalAlt = (state.descLimitacao || state.aux?.descLimitacao || $("descLimitacao")?.value || "").trim();
  if (!existingDescLimMentalAlt || isContraryLimitationText(existingDescLimMentalAlt)) {
    state.descLimitacao = TEXTO_LIMITACAO_ALTERADO;
    if (!state.aux) state.aux = {};
    state.aux.descLimitacao = TEXTO_LIMITACAO_ALTERADO;
    if ($("descLimitacao")) $("descLimitacao").value = TEXTO_LIMITACAO_ALTERADO;
  }
  
  // Auto-preencher atividades comprometidas do Rol com as limitações mentais já aplicadas
  const existingAtivRolMental = (state.atividadesComprometidas || state.aux?.atividadesComprometidas || $("atividadesComprometidas")?.value || "").trim();
  if (!existingAtivRolMental || isContraryLimitationText(existingAtivRolMental)) {
    state.atividadesComprometidas = TEXTO_LIMITACAO_ALTERADO;
    if (!state.aux) state.aux = {};
    state.aux.atividadesComprometidas = TEXTO_LIMITACAO_ALTERADO;
    if ($("atividadesComprometidas")) $("atividadesComprometidas").value = TEXTO_LIMITACAO_ALTERADO;
  }

  const existingSintMental = (state.aux?.sintomasLimitacao || state.sintomasLimitacao || $("agilSintomasLimitacao")?.value || "").trim();
  if (!existingSintMental || isContraryLimitationText(existingSintMental) || existingSintMental === "Conforme exame físico/mental") {
    state.aux.sintomasLimitacao = TEXTO_LIMITACAO_ALTERADO;
    state.sintomasLimitacao = TEXTO_LIMITACAO_ALTERADO;
    if ($("agilSintomasLimitacao")) $("agilSintomasLimitacao").value = TEXTO_LIMITACAO_ALTERADO;
    if ($("sintomasLimitacao")) $("sintomasLimitacao").value = TEXTO_LIMITACAO_ALTERADO;
  }
  
  QuesitoService.set(0, "Sim");
  QuesitoService.set(1, "Sim");
  QuesitoService.set(2, "Sim");
  renderQuesitos();
  
  state.capacidade = "Capacidade parcial e temporariamente prejudicada";
  setRadio("capacidade", "Capacidade parcial e temporariamente prejudicada");
  
  const isRetroInv = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  if (isRetroInv && state.parecerManualOverride !== "FAVORÁVEL") {
    aplicarParecerContrarioRetroacao(true);
    autoSave();
    toast("Exame mental ALTERADO: exame e limitações mantidos favoráveis, parecer CONTRÁRIO mantido por retroação inválida.");
  } else if (state.parecerManualOverride === "CONTRÁRIO") {
    state.parecer = "CONTRÁRIO";
    setRadio("parecer", "CONTRÁRIO");
    setRadio("agilParecer", "CONTRÁRIO");
    autoSave();
    toast("Exame mental ALTERADO (Parecer CONTRÁRIO mantido conforme sua escolha).");
  } else {
    state.parecer = "FAVORÁVEL";
    setRadio("parecer", "FAVORÁVEL");
    setRadio("agilParecer", "FAVORÁVEL");
    state.aux.justificativa = TEXTO_JUSTIFICATIVA_ALTERADO;
    state.justificativa = TEXTO_JUSTIFICATIVA_ALTERADO;
    if ($("agilJustificativa")) $("agilJustificativa").value = TEXTO_JUSTIFICATIVA_ALTERADO;
    if ($("justificativa")) $("justificativa").value = TEXTO_JUSTIFICATIVA_ALTERADO;
    autoSave();
    toast("Exame mental ALTERADO: achados, limitações, quesitos e parecer FAVORÁVEL preenchidos.");
  }
  if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") atualizarEstiloBotoesParecerDataAntiga();
}

/* =========================================================
   PROGRAMA DE MELHORIA CONTÍNUA (AMBIENTAL) — MOTOR DE SÍNTESE PERICIAL EM SEGUNDO PLANO
   Garante atendimento integral às diretrizes e-SISLA / DPME sem burocracia para o médico no Modo Ágil.
   ========================================================= */

function gerarNarrativaQueixaMelhoriaContinua(st, v) {
  v = v || {};
  st = st || state;
  const aux = st.aux || {};
  
  const idade = aux.idade || v.idade || $("agilIdade")?.value || "";
  const cargo = aux.cargo || v.cargo || $("agilCargo")?.value || "";
  const tempoCargo = aux.tempoCargo || v.tempoCargo || $("agilTempoCargo")?.value || "";
  const unidadeTempo = aux.unidadeTempo || v.unidadeTempo || $("agilTempoUnidade")?.value || "anos";
  const readap = String(st.readaptado || aux.readaptado || v.readaptado || getRadio("agilReadaptado") || "").toLowerCase() === "sim";
  const ativReadap = aux.atividadesReadaptado || v.atividadesReadaptado || $("agilAtividadesReadaptado")?.value || "";
  
  const cidVal = st.cid || aux.cid || v.cid || $("agilCid")?.value || "";
  const cidNome = typeof findCID === "function" ? (findCID(cidVal)?.n || "") : "";
  const doenca = aux.doencaMotivo || v.doencaMotivo || $("agilDoencaMotivo")?.value || (cidVal ? `${cidVal}${cidNome ? ' — ' + cidNome : ''}` : "");
  const inicioTrat = aux.inicioTratamento || v.inicioTratamento || $("agilInicioTratamento")?.value || "";
  const freqCons = aux.freqConsultas || v.freqConsultas || $("agilFreqConsultas")?.value || "";
  const sintomas = aux.sintomasLimitacao || v.sintomasLimitacao || $("agilSintomasLimitacao")?.value || "";
  
  // Medicações com e sem dosagem informada
  const meds = (st.medications || v.medicamentos || []).filter(m => m && (m.medicamento || m.nome));
  let medsStr = "";
  if (meds.length > 0) {
    const medsWithoutDose = meds.filter(m => {
      const dose = (m.dosagem || "").trim();
      const nome = (m.medicamento || m.nome || "").trim();
      return !dose && !/\b\d+\s*(?:g|mg|mcg|ml|gotas?|comprimidos?)\b/i.test(nome);
    });

    if (meds.length >= 2 && medsWithoutDose.length === meds.length && meds.every(m => !m.frequencia && !m.observacao)) {
      const nomes = meds.map(m => {
        let n = (m.medicamento || m.nome || "").trim().replace(/\/\s*$/, "");
        return n.length > 1 ? n.charAt(0).toUpperCase() + n.slice(1) : n.toUpperCase();
      });
      medsStr = nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1] + ", e não foram informadas suas dosagens";
    } else {
      medsStr = meds.map(m => {
        let nome = (m.medicamento || m.nome || "").trim();
        let dose = (m.dosagem || "").trim();
        let freq = (m.frequencia || "").trim();
        let obs = (m.observacao || "").trim();
        
        nome = nome.replace(/\/\s*$/, "").trim();
        dose = dose.replace(/\/\s*$/, "").trim();

        let item = nome;
        if (dose) {
          if (!item.endsWith(" ") && !dose.startsWith("/")) {
            item += ` ${dose}`;
          } else {
            item += dose;
          }
        } else {
          const hasDoseInNome = /\b\d+\s*(?:g|mg|mcg|ml|gotas?|comprimidos?)\b/i.test(nome);
          if (!hasDoseInNome) {
            item += `, não informado sua dosagem`;
          }
        }
        if (freq) {
          if (/^analgesia$/i.test(freq.trim())) {
            item += `, para analgesia`;
          } else if (/^se\s+dor$/i.test(freq.trim())) {
            item += ` se dor`;
          } else {
            item += ` ${freq}`;
          }
        }
        if (obs && !obs.includes(dose) && !obs.includes(freq)) {
          if (/^analgesia$/i.test(obs.trim())) {
            if (!item.toLowerCase().includes("analgesia")) {
              item += `, para analgesia`;
            }
          } else {
            item += ` (${obs})`;
          }
        }
        return item.trim();
      }).join(" e ");
    }
  }
  
  // Terapias
  const psico = !!(st.psicoterapia || aux.psicoterapia || v.psicoterapia || $("agilPsicoterapia")?.checked);
  const fisio = !!(st.fisioterapia || aux.fisioterapia || v.fisioterapia || $("agilFisioterapia")?.checked);
  const obsTerapias = aux.obsTerapias || v.obsTerapias || $("agilObsTerapias")?.value || "";
  
  // Se o médico já digitou um texto completo e longo (narrativa própria), preservamos sua digitação limpando inconsistências
  const rawQ = (aux.queixaDuracao || v.queixaDuracao || $("agilDoencaMotivo")?.value || "").trim();
  if (rawQ.length > 180 && (rawQ.toLowerCase().includes("servidor") || rawQ.toLowerCase().includes("ocupante") || rawQ.toLowerCase().includes("relata"))) {
    return cleanQueixaDuracao(rawQ, aux.dataAtd || st.aux?.dataAtd || $("dataAtd")?.value);
  }

  const isAcomp = !!(
    st.isAcompanhante ||
    aux.isAcompanhante ||
    cidVal === "Z763" ||
    cidVal === "Z76.3" ||
    /acompanha/i.test(doenca || "") ||
    /artigo\s*199/i.test(doenca || "") ||
    /pessoa\s+doente/i.test(doenca || "") ||
    /familiar\s+enfermo/i.test(doenca || "")
  );

  function flexibilizarCargoFem(cargoStr, isFeminino) {
    if (!cargoStr) return cargoStr;
    if (isFeminino) {
      return cargoStr
        .replace(/\b(?:PEB|Peb)\s+([IVXLCDM]+)\b/gi, "Professora de Educação Básica $1")
        .replace(/\b(?:PEB|Peb)\b/gi, "Professora de Educação Básica")
        .replace(/\bSupervisor\s+Educacional\b/gi, "Supervisora Educacional")
        .replace(/\bSupervisor\b/gi, "Supervisora")
        .replace(/\bCoordenador\s+Pedagógico\b/gi, "Coordenadora Pedagógica")
        .replace(/\bOrientador\s+Educacional\b/gi, "Orientadora Educacional")
        .replace(/\bTécnico\s+de\s+Enfermagem\b/gi, "Técnica de Enfermagem")
        .replace(/\bTécnico\s+em\b/gi, "Técnica em")
        .replace(/\bTécnico\s+de\b/gi, "Técnica de")
        .replace(/\bProfessor\s+de\s+Educação\s+Básica\b/gi, "Professora de Educação Básica")
        .replace(/\bProfessor\b/gi, "Professora")
        .replace(/\bDiretor\b/gi, "Diretora")
        .replace(/\bCoordenador\b/gi, "Coordenadora")
        .replace(/\bInspetor\b/gi, "Inspetora")
        .replace(/\bEnfermeiro\b/gi, "Enfermeira")
        .replace(/\bMédico\b/gi, "Médica")
        .replace(/\bPsicólogo\b/gi, "Psicóloga")
        .replace(/\bInvestigador\b/gi, "Investigadora")
        .replace(/\bEscrivão\b/gi, "Escrivã")
        .replace(/\bAssistente\s+Técnico\b/gi, "Assistente Técnica")
        .replace(/\bAuxiliar\s+Técnico\b/gi, "Auxiliar Técnica")
        .replace(/\bOficial\s+Administrativo\b/gi, "Oficial Administrativa");
    }
    return cargoStr
      .replace(/\b(?:PEB|Peb)\s+([IVXLCDM]+)\b/gi, "Professor de Educação Básica $1")
      .replace(/\b(?:PEB|Peb)\b/gi, "Professor de Educação Básica");
  }

  if (isAcomp) {
    const depNome = aux.nomeDependente || st.nomeDependente || st.pessoa || "familiar dependente";
    const sexo = (st.sexo || v.sexo || "").toLowerCase();
    const isFem = sexo === "f" || sexo === "feminino";
    let ident = isFem ? "Servidora" : "Servidor";
    if (idade) ident += ` de ${idade} anos`;
    if (readap) {
      ident += `, relatou ser ${isFem ? 'readaptada' : 'readaptado'}${ativReadap ? `, exercendo atualmente as atividades de ${ativReadap}` : ""}`;
    } else {
      ident += `, relatou não ser ${isFem ? 'readaptada' : 'readaptado'}`;
    }
    if (cargo) {
      let cargoFormatado = cargo.trim().replace(/^é\s+/i, '');
      cargoFormatado = flexibilizarCargoFem(cargoFormatado, isFem);
      if (tempoCargo) {
        ident += `, é ${cargoFormatado} há ${tempoCargo} ${unidadeTempo.toLowerCase()}`;
      } else {
        ident += `, é ${cargoFormatado}`;
      }
    }
    ident += `, comparece a perícia médica oficial para fins de acompanhamento de familiar/dependente enfermo (${depNome}), com fundamento jurídico no Artigo 199 da Lei Estadual nº 10.261/1968 (CID Z76.3 — Pessoa em boa saúde acompanhando pessoa doente).`;
    
    let acompPartes = [ident];
    acompPartes.push(`Informa prestar assistência direta, contínua e indispensável aos cuidados e acompanhamento em saúde de ${depNome}, impossibilitando a conciliação com as atribuições funcionais habituais durante o período.`);
    acompPartes.push("O(A) servidor(a) encontra-se em plenas condições de higidez física e mental, sem incapacidade laborativa própria.");
    if (medsStr) {
      acompPartes.push(`Em uso de medicação de rotina: ${medsStr}.`);
    } else {
      acompPartes.push(isFem ? "A servidora negou uso de medicações próprias de uso contínuo." : "O servidor negou uso de medicações próprias de uso contínuo.");
    }
    return acompPartes.join(" ");
  }
  
  let partes = [];
  
  // 1. Identificação funcional
  const sexo = (st.sexo || v.sexo || "").toLowerCase();
  const isFem = sexo === "f" || sexo === "feminino";
  let ident = isFem ? "Servidora" : "Servidor";
  if (idade) ident += ` de ${idade} anos`;
  
  // 2. Readaptação: logo após a idade: "relatou não ser readaptado" / "relatou ser readaptado"
  if (readap) {
    ident += `, relatou ser ${isFem ? 'readaptada' : 'readaptado'}${ativReadap ? `, exercendo atualmente as atividades de ${ativReadap}` : ""}`;
  } else {
    ident += `, relatou não ser ${isFem ? 'readaptada' : 'readaptado'}`;
  }

  // 3. Cargo: "é {cargo} há {tempoCargo} {unidadeTempo}"
  if (cargo) {
    let cargoFormatado = cargo.trim().replace(/^é\s+/i, '');
    cargoFormatado = flexibilizarCargoFem(cargoFormatado, isFem);
    if (tempoCargo) {
      ident += `, é ${cargoFormatado} há ${tempoCargo} ${unidadeTempo.toLowerCase()}`;
    } else {
      ident += `, é ${cargoFormatado}`;
    }
  }

  // 3. Doença, início do tratamento e consultas
  if (doenca) {
    let cleanDoenca = doenca.replace(/^[Vv]em\s+com\s+atestado\s+de\s+\d+\s+dias\s*(?:por|de|devido\s+a)?\s*/i, "")
                            .replace(/^[Aa]testado\s+de\s+\d+\s+dias\s*(?:por|de|devido\s+a)?\s*/i, "")
                            .replace(/[\.\,\;\:]+$/, "")
                            .trim();
    if (/acompanhamento\s+de\s+pessoa\s+doente|familiar\s+enfermo/i.test(cleanDoenca)) {
      ident += `, para acompanhamento de familiar enfermo, ${cleanDoenca.replace(/^acompanhamento\s+de\s+(?:pessoa\s+doente|familiar\s+enfermo)[\s,:]*/i, "")}`;
    } else {
      ident += `, com queixa de ${cleanDoenca}`;
    }
    
    if (inicioTrat && !isArtifactAttendanceDate(inicioTrat, aux.dataAtd || st.aux?.dataAtd || $("dataAtd")?.value)) {
      const s = String(inicioTrat).trim().replace(/^desde\s+/i, "");
      if (/^\d{4}$/.test(s)) {
        ident += `, desde ${s}`; // iniciou-se seu tratamento em
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const p = s.split("-");
        ident += `, desde ${p[2]}/${p[1]}/${p[0]}`; // iniciou-se seu tratamento em
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
        ident += `, desde ${s}`; // iniciou-se seu tratamento em
      } else if (s.toLowerCase().startsWith("há") || s.toLowerCase().startsWith("ha")) {
        ident += `, ${s}`;
      } else {
        ident += `, desde ${s}`; // iniciou-se seu tratamento em
      }
    }
    
    if (freqCons) {
      const f = String(freqCons).trim();
      const fLow = f.toLowerCase();
      if (fLow === "quinzenal") {
        ident += `, realizando consultas quinzenalmente`; // realiza consultas quinzenalmente
      } else if (fLow === "mensal") {
        ident += `, realizando consultas mensalmente`;
      } else if (fLow === "semanal") {
        ident += `, realizando consultas semanalmente`;
      } else if (fLow === "bimestral") {
        ident += `, realizando consultas bimestralmente`;
      } else if (fLow === "trimestral") {
        ident += `, realizando consultas trimestralmente`;
      } else if (fLow === "semestral") {
        ident += `, realizando consultas semestralmente`;
      } else if (fLow === "anual") {
        ident += `, realizando consultas anualmente`;
      } else if (/^\d+\s*dias?$/i.test(fLow)) {
        ident += `, com consultas a cada ${fLow}`;
      } else if (fLow.startsWith("a cada")) {
        ident += `, com consultas ${fLow}`;
      } else {
        ident += `, comparecendo a consultas de periodicidade ${f}`;
      }
    }
  }
  ident += ".";
  partes.push(ident);
  
  // 4. Sintomas e limitações
  if (sintomas) {
    let sClean = sintomas.trim();
    sClean = sClean.replace(/^[Qq]ueixa-se\s+de\s+((?:[Aa]\s+periciada|[Oo]\s+periciado|[Aa]\s+servidora|[Oo]\s+servidor)\s+(?:refere|relata|informa|apresenta|menciona|descreve|acompanha)\b)/i, "$1");
    sClean = sClean.replace(/^[Qq]ueixa-se\s+de\s+([Aa]\s+periciada|[Oo]\s+periciado|[Aa]\s+servidora|[Oo]\s+servidor)\b/i, "$1");
    sClean = sClean.replace(/^[Qq]ueixa-se\s+de\s+[Rr]elata\s+que\s+/i, "Relata que ");
    sClean = sClean.replace(/^[Qq]ueixa-se\s+de\s+[Rr]efere(?:\s+que)?\s+/i, "Refere que ");
    sClean = sClean.replace(/^[Qq]ueixa-se\s+de\s+[Ii]nforma(?:\s+que)?\s+/i, "Informa que ");
    sClean = sClean.replace(/^[Qq]ueixa-se\s+de\s+[Qq]ueixa-se\s+de\s+/i, "Queixa-se de ");

    const startsWithVerb = /^(?:(?:a\s+periciada|o\s+periciado|a\s+servidora|o\s+servidor)\s+)?(?:relata\b|refere\b|informa\b|apresenta\b|descreve\b|menciona\b|acompanha\b)/i.test(sClean);
    const startsWithQueixa = /^queixa-se\s+de\b/i.test(sClean);

    if (startsWithVerb) {
      const formatted = sClean.charAt(0).toUpperCase() + sClean.slice(1);
      partes.push(formatted.endsWith(".") ? formatted : formatted + ".");
    } else if (startsWithQueixa) {
      let formatted = sClean;
      if (doenca && ident.includes("com queixa de")) {
        formatted = formatted.replace(/^queixa-se\s+de\s+/i, "Refere ");
      }
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
      partes.push(formatted.endsWith(".") ? formatted : formatted + ".");
    } else {
      const verboIntro = (doenca && ident.includes("com queixa de")) ? "Refere" : "Queixa-se de";
      const sBody = sClean.endsWith(".") ? sClean.slice(0, -1) : sClean;
      partes.push(`${verboIntro} ${sBody}.`);
    }
  }
  
  // 5. Medicações
  const hasAntineoplasicoOuInfusao = /\b(?:infus[ãa]o|infus[õo]es|imunobiol[óo]gic[oa]|imunoterapia|quimioterapia|quimioter[áa]pic[oa]|antineopl[áa]sic[oa]|bevacizumab[e]?|pembrolizumab[e]?|trastuzumab[e]?|rituximab[e]?)\b/i.test((doenca || "") + " " + (sintomas || "") + " " + (rawQ || ""));
  if (medsStr) {
    partes.push(`Em uso de ${medsStr}.`);
  } else if (!hasAntineoplasicoOuInfusao) {
    if (isAcomp || /acompanha/i.test(sintomas || "") || /familiar/i.test(doenca || "")) {
      partes.push(isFem ? "A servidora negou uso de medicações próprias de uso contínuo." : "O servidor negou uso de medicações próprias de uso contínuo.");
    } else {
      partes.push("Negou uso de medicações.");
    }
  }
  
  // 6. Alteração de medicação (CID F e geral)
  const temRelatoAlt = /\b(?:aumentad[oa]|aumento|ajustad[oa]|ajuste|reduzid[oa]|redução|reducao|trocad[oa]|troca)\s+(?:a\s+medica[çc][ãa]o|de\s+medica[çc][ãa]o|d[ae]\s+dosagem|d[ae]\s+dose)\b|\b(?:foi\s+aumentada\s+a\s+medica[çc][ãa]o|aumentou\s+a\s+dose|trocou\s+a\s+medica[çc][ãa]o|ajustou\s+a\s+dose)\b|\b(?:recentemente\s+foi\s+aumentada\s+a\s+medica[çc][ãa]o)\b/i.test(sintomas || "");
  const altMed = String(st.alteracaoMed || aux.alteracaoMed || getRadio("agilAlteracaoMed") || "").toLowerCase() === "sim" || temRelatoAlt;
  if (altMed) {
    const dtAlt = aux.dataAlteracaoMed || $("agilDataAlteracaoMed")?.value || "";
    const obsAlt = aux.obsAlteracaoMed || $("agilObsAlteracaoMed")?.value || "";
    if (temRelatoAlt) {
      // Já relatado nos sintomas
    } else {
      partes.push(`Informa alteração recente na prescrição medicamentosa${dtAlt ? ` em ${formatDate(dtAlt)}` : ""}${obsAlt ? ` (${obsAlt})` : ""}.`);
    }
  } else {
    partes.push("Não relatou troca de alteração de dosagem da medicação.");
  }
  
  // 7. Terapias
  if (fisio && !psico) {
    const fTxt = obsTerapias ? `Realiza fisioterapia ${obsTerapias}` : "Realiza fisioterapia";
    partes.push(`${fTxt} (e não realiza psicoterapia).`);
  } else if (psico && !fisio) {
    const pTxt = obsTerapias ? `Realiza psicoterapia ${obsTerapias}` : "Realiza psicoterapia";
    partes.push(`${pTxt} (e não realiza fisioterapia).`);
  } else if (fisio && psico) {
    partes.push(`Realiza acompanhamento em fisioterapia e psicoterapia${obsTerapias ? ` (${obsTerapias})` : ""}.`);
  } else {
    partes.push("Não alegou fazer fisioterapia e psicoterapia.");
  }
  
  let resNarrativa = partes.join(" ");

  // Deduplicação de sintomas repetidos ou sinônimos no mesmo parágrafo
  if (/dor\s+na\s+regi[ãa]o\s+cervical|cervicalgia/i.test(resNarrativa) && /dor\s+(?:em|no)\s+ouvido/i.test(resNarrativa)) {
    resNarrativa = resNarrativa.replace(/,\s*cervicalgia,\s*dor\s+em\s+ouvido\b/gi, "");
  }
  if (/taquicardia/i.test(resNarrativa)) {
    resNarrativa = resNarrativa.replace(/(\btaquicardia\b[^.]+?),\s*taquicardia\b/gi, "$1");
  }
  if (/dorm[êe]ncia\s+nas\s+m[ãa]os\s+e\s+bra[çc]os/i.test(resNarrativa)) {
    resNarrativa = resNarrativa.replace(/,\s*parestesia\s+em\s+m[ãa]os\s+e\s+bra[çc]os\b/gi, "");
  }
  if (/dor\s+difusa\s+pelo\s+corpo/i.test(resNarrativa)) {
    resNarrativa = resNarrativa.replace(/,\s*dor\s+generalizada\b/gi, "");
  }

  // Consolidação de múltiplas medicações sem dosagem
  resNarrativa = resNarrativa.replace(/([Ee]m uso de\s+)([^.]+?)\./g, function(match, prefix, content) {
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

  resNarrativa = resNarrativa.replace(/\bh[áa]\s+1\s+anos\b/gi, "há 1 ano");
  resNarrativa = resNarrativa.replace(/\bh[áa]\s+1\s+meses\b/gi, "há 1 mês");
  resNarrativa = resNarrativa.replace(/\bh[áa]\s+1\s+dias\b/gi, "há 1 dia");
  resNarrativa = resNarrativa.replace(/\b(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|ml|gotas?|comp(?:rimidos?)?|c[áa]ps(?:ulas?)?)dia\b/gi, "$1 $2/dia");
  resNarrativa = resNarrativa.replace(/\b(mg|g|mcg|ml)dia\b/gi, "$1/dia");
  resNarrativa = resNarrativa.replace(/(\b\d+(?:[.,]\d+)?\s*(?:g|mg|mcg|ml|gotas?|comp(?:rimidos?)?|c[áa]ps(?:ulas?)?)(?:\/dia)?)\s*,?\s*n[ãa]o\s+informad[oa]\s+sua\s+dosagem,?\s*/gi, "$1, ");
  resNarrativa = resNarrativa.replace(/\bn[ãa]o\s+informad[oa]\s+sua\s+dosagem\s+[Nn][ãa]o\s+informad[oa]\.?/gi, "não informada sua dosagem.");
  resNarrativa = resNarrativa.replace(/\bn[ãa]o\s+informad[oa]\s+sua\s+dosagem\s+[Nn][ãa]o\s+informad[oa]\b/gi, "não informada sua dosagem");
  resNarrativa = resNarrativa.replace(/\bn[ãa]o\s+informado\s+sua\s+dosagem\b/gi, "não informada sua dosagem");
  resNarrativa = resNarrativa.replace(/\bn[ãa]o\s+informada\s+sua\s+dosagem\s+Analgesia\b/gi, "não informada sua dosagem, para analgesia");
  resNarrativa = resNarrativa.replace(/,\s*Analgesia\b/gi, ", para analgesia");
  resNarrativa = resNarrativa.replace(/(não informada sua dosagem)\s+e\s+([A-ZÁ-Ú])/g, "$1, e $2");
  resNarrativa = resNarrativa.replace(/(não informada sua dosagem)\s+(a\s+cada\s+\d+|de\s+\d+\/\d+h|se\s+dor|\d+x\s+ao\s+dia|para\s+analgesia)/gi, "$1, $2");
  resNarrativa = resNarrativa.replace(/\bsensibilidade\s+a\s+luz\b/gi, "sensibilidade à luz");
  resNarrativa = resNarrativa.replace(/\blaser\s+terapia\b/gi, "laserterapia");
  resNarrativa = resNarrativa.replace(/\bceacalm\b/gi, "Seacalm");
  resNarrativa = resNarrativa.replace(/\bultragestan\b/gi, "Utrogestan");
  resNarrativa = resNarrativa.replace(/\bdoxaciclina\b/gi, "Doxiciclina");
  resNarrativa = resNarrativa.replace(/\bclonazepan\b/gi, "Clonazepam");
  resNarrativa = resNarrativa.replace(/\bamoxacilina\b/gi, "Amoxicilina");
  resNarrativa = resNarrativa.replace(/\bbevacizumab[e]?\b/gi, "bevacizumabe");
  resNarrativa = resNarrativa.replace(/\bpembrolizumab[e]?\b|\bpembrulizumab[e]?\b/gi, "pembrolizumabe");
  resNarrativa = resNarrativa.replace(/\bimuno\s+biol[óo]gic([oa]s?)\b/gi, "imunobiológic$1");
  resNarrativa = resNarrativa.replace(/\bmal\s+estar\b/gi, "mal-estar");
  resNarrativa = resNarrativa.replace(/\bbem\s+estar\b/gi, "bem-estar");
  resNarrativa = resNarrativa.replace(/\bdevido\s+c[âa]ncer\b/gi, "devido a câncer");
  resNarrativa = resNarrativa.replace(/\bdevido\s+neoplasia\b/gi, "devido a neoplasia");
  return cleanQueixaDuracao(resNarrativa.replace(/\s{2,}/g, " ").trim(), aux.dataAtd || st.aux?.dataAtd || $("dataAtd")?.value);
}

function gerarNarrativaAntecedentesMelhoriaContinua(st, v) {
  v = v || {};
  st = st || state;
  const aux = st.aux || {};
  const rawHist = (aux.historicoPregresso || v.historicoPregresso || $("agilHistoricoPregresso")?.value || "").trim();
  const conds = (st.conditions || v.condicoes || []).filter(c => c && (c.nome || c.doenca));
  
  const fraseComplemento = "Nega demais antecedentes mórbidos relevantes, cirurgias prévias e neoplasias.";
  const fraseNegaCompleta = "Nega antecedentes mórbidos relevantes, cirurgias prévias, neoplasias ou hábitos tabágicos e etilistas.";

  // Se já tiver uma redação do médico ou histórico, limpa menção a atestados e complementa sem duplicidade
  if (rawHist && rawHist !== "Nega" && rawHist !== "Nega." && !/^nega\.?$/i.test(rawHist.trim()) && rawHist.toLowerCase() !== "não refere" && rawHist.toLowerCase() !== "nao refere" && rawHist.toLowerCase() !== "sem antecedentes") {
    let t = rawHist.replace(/[\s\.\,]*\b(?:recebendo|recebeu|tendo\s+recebido|sendo\s+concedido|[Vv]em\s+com|com)?\s*(?:um\s+|novo\s+)?atestado(?:\s+m[ée]dico)?\s+de\s+(?:mais\s+)?(?:\d+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|noventa)\s+dias?\b[^\.\n\r]*[\.\,]?/gi, "").trim();
    t = t.replace(/[\s,;]*\b(?:e\s+)?(?:o\s+|a\s+)?m[ée]dico(?:\s+assistente)?\s+(?:o|a)\s+afastou\s+por\s+\d+\s+dias?[^\.\n\r]*/gi, "");
    t = t.replace(/[\s,;]*\b(?:e\s+)?(?:com\s+)?afastament[oa]\s+(?:m[ée]dic[oa]\s+)?(?:de|por)\s+\d+\s+dias?[^\.\n\r]*/gi, "");
    t = t.replace(/[\s,;]*\b(?:e\s+)?(?:com\s+)?afastad[oa]\s+por\s+\d+\s+dias?[^\.\n\r]*/gi, "");
    t = t.replace(/\s+([\.\,;:])/g, '$1');
    t = t.replace(/\.{2,}/g, '.').replace(/^[\s\.\,;]+/, '').replace(/[\s\.\,;]+$/, '');

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

    let fraseComplementoFinal = fraseComplemento;
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
  
  if (conds.length > 0) {
    const condsStr = conds.map(c => `${c.nome || c.doenca}${c.tratamento ? ` em uso de ${c.tratamento}` : ""}`).join("; ");
    return `Informa histórico de comorbidades: ${condsStr}. ${fraseComplemento}`;
  }
  
  return fraseNegaCompleta;
}

function gerarNarrativaAtestadoMelhoriaContinua(st, v) {
  v = v || {};
  st = st || state;
  const aux = st.aux || {};
  const crm = (aux.crmCro || v.crmCro || $("agilCrmCro")?.value || "").trim();
  const cid = (st.cid || aux.cid || v.cid || $("agilCid")?.value || "").trim();
  const dataDoc = (aux.dataDocumento || v.dataDocumento || $("agilDataDocumento")?.value || "").trim();
  const dias = (aux.diasSolicitados || v.diasSolicitados || $("agilDiasSolicitados")?.value || "").trim();
  
  if (crm && crm !== "Em anexo" && dias && dias !== "Conforme atestado") {
    return `CRM ${crm}, solicita ${dias} dias de afastamento, a partir do dia ${formatDate(dataDoc) || dataDoc || "da emissão"}, pelo CID ${cid} — Relatório médico em anexo.`;
  }
  
  return "CRM e relatório médico assistente em anexo condizente com o CID apresentado.";
}

function gerarNarrativaLimitacoesMelhoriaContinua(st, v) {
  v = v || {};
  st = st || state;
  const cargo = st.cargo || v.cargo || "servidor";
  const isMental = st.exameFisicoTipo === "Exame Mental";
  const isOsteo = st.exameFisicoTipo === "Aparelho Osteomuscular e Tecido Conjutivo";
  const regMap = st.osteomuscularRegioes || {};
  const alteradas = Object.keys(regMap).filter(k => regMap[k] === "Alterado" && DADOS_OSTEOMUSCULAR[k]);
  const isOsteoAlterado = isOsteo && alteradas.length > 0;
  const isMentalAlterado = isMental && st.exameMentalResultado === "Alterado";
  const isRetroInv = Boolean(st.aux?.retroacaoInvalida || st.retroacaoInvalida);
  const pVal = String(st.parecer || v.parecer || (typeof getRadio === 'function' ? getRadio("parecer") : "") || "").toUpperCase();
  const isFav = pVal === "F" || pVal.startsWith("FAV") || isOsteoAlterado || isMentalAlterado || (isRetroInv && st.parecerManualOverride !== "CONTRÁRIO");
  
  if (isMental) {
    if (isFav) {
      let ativ = st.atividadesComprometidas || v.atividadesComprometidas || st.descLimitacao || "";
      if (!ativ || isContraryLimitationText(ativ)) {
        ativ = TEXTO_LIMITACAO_ALTERADO;
      }
      if (ativ.includes("Rol de Atividades")) return ativ;
      return `${ativ.replace(/[.;,]+$/, "")}, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
    } else {
      return `Do ponto de vista médico não se observa limitações mentais funcionais incapacitantes para as atribuições do cargo de ${cargo}, constantes no rol de atividades.`;
    }
  } else if (isOsteo) {
    if (isFav) {
      let ativ = st.atividadesComprometidas || v.atividadesComprometidas || st.descLimitacao || "";
      if (!ativ || isContraryLimitationText(ativ)) {
        if (alteradas.length > 0) {
          ativ = formatarLimitacoesOsteo(alteradas.map(k => DADOS_OSTEOMUSCULAR[k].limitacao));
        } else {
          const cid = String(st.cid || v.cid || "").toUpperCase();
          if (cid.startsWith("M22") || cid.startsWith("M23") || cid.startsWith("M24") || cid.startsWith("M25")) {
            ativ = DADOS_OSTEOMUSCULAR.joelho_direito.limitacao;
          } else if (cid.startsWith("M54") || cid.startsWith("M51") || cid.startsWith("M50") || cid.startsWith("M53")) {
            ativ = DADOS_OSTEOMUSCULAR.lombar.limitacao;
          } else if (cid.startsWith("M75")) {
            ativ = DADOS_OSTEOMUSCULAR.ombro_direito.limitacao;
          } else if (cid.startsWith("M77") || cid.startsWith("M65") || cid.startsWith("G56")) {
            ativ = DADOS_OSTEOMUSCULAR.cotovelo_direito.limitacao;
          } else {
            ativ = "Limitação para executar tarefas que requerem posturas viciosas, sobrecarga articular, movimentos repetitivos ou permanência em posições estáticas de modo habitual";
          }
        }
      }
      if (ativ.includes("Rol de Atividades")) return ativ;
      return `${ativ.replace(/[.;,]+$/, "")}, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
    } else {
      return `Do ponto de vista médico não se observa limitações físicas funcionais incapacitantes para as atribuições do cargo de ${cargo}, constantes no rol de atividades.`;
    }
  }
  
  if (isFav) {
    let ativ = st.atividadesComprometidas || v.atividadesComprometidas || st.descLimitacao || "";
    if (!ativ || isContraryLimitationText(ativ)) {
      const cid = String(st.cid || v.cid || "").toUpperCase();
      if (cid.startsWith("F")) {
        ativ = TEXTO_LIMITACAO_ALTERADO;
      } else if (cid.startsWith("M22") || cid.startsWith("M23") || cid.startsWith("M24") || cid.startsWith("M25")) {
        ativ = DADOS_OSTEOMUSCULAR.joelho_direito.limitacao;
      } else if (cid.startsWith("M54") || cid.startsWith("M51") || cid.startsWith("M50") || cid.startsWith("M53")) {
        ativ = DADOS_OSTEOMUSCULAR.lombar.limitacao;
      } else if (cid.startsWith("M75")) {
        ativ = DADOS_OSTEOMUSCULAR.ombro_direito.limitacao;
      } else if (cid.startsWith("M77") || cid.startsWith("M65") || cid.startsWith("G56")) {
        ativ = DADOS_OSTEOMUSCULAR.cotovelo_direito.limitacao;
      } else {
        ativ = "Apresenta limitações físicas funcionais temporárias para as atividades habituais com necessidade de repouso e adaptação funcional";
      }
    }
    if (ativ.includes("Rol de Atividades")) return ativ;
    return `${ativ.replace(/[.;,]+$/, "")}, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
  } else {
    return `Do ponto de vista médico não se observa limitações físicas ou mentais funcionais incapacitantes para as atribuições do cargo de ${cargo}, constantes no rol de atividades.`;
  }
}

function gerarNarrativaJustificativaMelhoriaContinua(st, v) {
  v = v || {};
  st = st || state;
  const isMental = st.exameFisicoTipo === "Exame Mental";
  const isOsteo = st.exameFisicoTipo === "Aparelho Osteomuscular e Tecido Conjutivo";
  const isFav = (st.parecer === "FAVORÁVEL" || st.parecer === "Favorável");
  
  const rawJ = (st.aux?.justificativa || st.justificativa || $("agilJustificativa")?.value || "").trim();
  if (rawJ && rawJ.length > 70 && !rawJ.includes("não se identificam limitações funcionais em níveis")) {
    return rawJ;
  }
  
  if (isFav) {
    const ativ = st.atividadesComprometidas || v.atividadesComprometidas || "";
    if (isMental) {
      const descAtiv = ativ || "interatividade com grupos, manutenção da concentração e autocontrole em situações de conflito";
      return `Capacidade laborativa parcial e temporariamente prejudicada considerando as atribuições do rol, em razão de limitações na esfera psicoemocional que compromete para ${descAtiv}.`;
    } else if (isOsteo) {
      const regMap = st.osteomuscularRegioes || {};
      const alteradas = Object.keys(regMap).filter(k => regMap[k] === "Alterado" && DADOS_OSTEOMUSCULAR[k]);
      const lim = (typeof formatarLimitacoesOsteo === "function") ? formatarLimitacoesOsteo(alteradas.map(k => DADOS_OSTEOMUSCULAR[k]?.limitacao).filter(Boolean)) : "";
      const descAtiv = ativ || lim || "atividades com sobrecarga biomecânica ou esforço repetitivo";
      return `Capacidade laborativa parcial e temporariamente prejudicada considerando as atribuições do rol, em razão de limitações na esfera osteomuscular que compromete para ${descAtiv}.`;
    } else {
      const descAtiv = ativ || "as atividades habituais do cargo";
      return `Capacidade laborativa parcial e temporariamente prejudicada considerando as atribuições do rol, em razão de limitações clínicas que compromete para ${descAtiv}.`;
    }
  } else {
    if (isMental) {
      return "Capacidade laborativa preservada, considerando que neste ato pericial não se observam alterações ou limitações de ordem psíquica incapacitantes para as atribuições rotineiras do cargo atual.";
    } else if (isOsteo) {
      return "Capacidade laborativa preservada, considerando que neste ato pericial não se observam alterações ou limitações de ordem osteomuscular incapacitantes para as atribuições rotineiras do cargo atual.";
    } else {
      return "Capacidade laborativa preservada, considerando que neste ato pericial não se observam alterações ou limitações incapacitantes para as atribuições rotineiras do cargo atual.";
    }
  }
}

function aplicarSintesePericialMelhoriaContinua(force = false) {
  if (!state.aux) state.aux = {};
  const v = typeof values === "function" ? values() : {};
  
  // 1. Queixa e Duração
  const narrativaQueixa = gerarNarrativaQueixaMelhoriaContinua(state, v);
  if (narrativaQueixa && (force || !state.aux.queixaDuracao || state.aux.queixaDuracao.length < 100)) {
    state.aux.queixaDuracao = narrativaQueixa;
    state.queixaDuracao = narrativaQueixa;
    if ($("queixaDuracao")) $("queixaDuracao").value = narrativaQueixa;
  }
  
  // 2. Antecedentes Mórbidos
  const histAtual = (state.aux?.historicoPregresso || state.historicoPregresso || $("agilHistoricoPregresso")?.value || "").trim();
  if (histAtual && histAtual !== "Nega" && histAtual !== "Nega.") {
    const narrativaAntecedentes = gerarNarrativaAntecedentesMelhoriaContinua(state, v);
    if (narrativaAntecedentes) {
      state.aux.historicoPregresso = narrativaAntecedentes;
      state.historicoPregresso = narrativaAntecedentes;
      if ($("historicoPregresso")) $("historicoPregresso").value = narrativaAntecedentes;
      if ($("agilHistoricoPregresso")) $("agilHistoricoPregresso").value = narrativaAntecedentes;
    }
  }
  
  // 3. Atestado / Relatório
  const narrativaAtestado = gerarNarrativaAtestadoMelhoriaContinua(state, v);
  if (narrativaAtestado) {
    state.aux.obsDocumentos = narrativaAtestado;
    if ($("obsDocumentos")) $("obsDocumentos").value = narrativaAtestado;
  }

  // 4. Limitações e Rol de Atividades
  const narrativaLim = gerarNarrativaLimitacoesMelhoriaContinua(state, v);
  const curDescLim = (state.descLimitacao || state.aux?.descLimitacao || "").trim();
  const isRetroInv = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  const pStr = String(state.parecer || v.parecer || (typeof getRadio === 'function' ? getRadio("parecer") : "") || "").toUpperCase();
  const isPParFav = pStr === "F" || pStr.startsWith("FAV") || (isRetroInv && state.parecerManualOverride !== "CONTRÁRIO");
  const needLimUpdate = force || !curDescLim || curDescLim.length < 20 || (isPParFav && isContraryLimitationText(curDescLim)) || (!isPParFav && !isContraryLimitationText(curDescLim) && curDescLim.includes("Apresenta limitações"));
  if (narrativaLim && needLimUpdate) {
    state.descLimitacao = narrativaLim;
    state.aux.descLimitacao = narrativaLim;
    state.atividadesComprometidas = narrativaLim;
    state.aux.atividadesComprometidas = narrativaLim;
    if ($("descLimitacao")) $("descLimitacao").value = narrativaLim;
    if ($("atividadesComprometidas")) $("atividadesComprometidas").value = narrativaLim;
  }

  // 5. Justificativa
  const narrativaJustif = gerarNarrativaJustificativaMelhoriaContinua(state, v);
  if (narrativaJustif && (force || !state.justificativa || state.justificativa.length < 40)) {
    state.justificativa = narrativaJustif;
    state.aux.justificativa = narrativaJustif;
    if ($("justificativa")) $("justificativa").value = narrativaJustif;
    if ($("agilJustificativa")) $("agilJustificativa").value = narrativaJustif;
  }
  
  autoSave();
}

function ensureAgileBackgroundDefaults() {
  if (!state.aux) state.aux = {};
  
  // 02 — Doença motivadora / início / sintomas
  const doenca = state.aux.doencaMotivo || state.doencaMotivo || (state.cid ? `${state.cid} — ${findCID(state.cid)?.n || state.cid}` : "Conforme queixa relatada");
  state.aux.doencaMotivo = doenca;
  state.doencaMotivo = doenca;
  if ($("doencaMotivo")) $("doencaMotivo").value = doenca;
  if ($("agilDoencaMotivo")) $("agilDoencaMotivo").value = doenca;

  // 03 — Antecedentes mórbidos: síntese contínua pericial
  const histAgil = (state.aux?.historicoPregresso || state.historicoPregresso || $("agilHistoricoPregresso")?.value || $("historicoPregresso")?.value || "").trim();
  const histDef = histAgil || "Nega";
  const histMelhoria = (histDef !== "Nega" && histDef !== "Nega.") ? gerarNarrativaAntecedentesMelhoriaContinua(state, values()) : histDef;
  state.aux.historicoPregresso = histMelhoria;
  state.historicoPregresso = histMelhoria;
  if ($("historicoPregresso")) $("historicoPregresso").value = histMelhoria;
  if ($("agilHistoricoPregresso")) $("agilHistoricoPregresso").value = histMelhoria;
  
  if (!state.outrasDoencas) {
    state.outrasDoencas = "Sim";
    state.aux.outrasDoencas = "Sim";
    setRadio("outrasDoencas", "Sim");
    setRadio("agilOutrasDoencas", "Sim");
  }
  
  // 04 — Atestado / Relatório / Exames: "Em anexo"
  if (!state.aux.obsDocumentos) state.aux.obsDocumentos = "Em anexo";
  const narratDoc = (typeof gerarNarrativaAtestadoMelhoriaContinua === "function") ? gerarNarrativaAtestadoMelhoriaContinua(state, values()) : '';
  if (narratDoc && !narratDoc.includes("condizente com o CID")) {
    state.aux.obsDocumentos = narratDoc;
  }
  if ($("obsDocumentos")) $("obsDocumentos").value = state.aux.obsDocumentos;
  if (!state.aux.crmCro) {
    state.aux.crmCro = "Em anexo";
    if ($("crmCro")) $("crmCro").value = "Em anexo";
  }
  if (!state.aux.dataDocumento) {
    state.aux.dataDocumento = state.aux.dataAtd || today();
    if ($("dataDocumento")) $("dataDocumento").value = state.aux.dataDocumento;
  }
  if (!state.aux.diasSolicitados) {
    state.aux.diasSolicitados = "Conforme atestado";
    if ($("diasSolicitados")) $("diasSolicitados").value = "Conforme atestado";
  }
  
  // CID sincronizado
  const cidVal = state.cid || state.aux.cid || $("agilCid")?.value || $("cid")?.value || "";
  if (cidVal) {
    state.cid = cidVal;
    state.aux.cid = cidVal;
    if ($("cid")) $("cid").value = cidVal;
    if ($("agilCid")) $("agilCid").value = cidVal;
  }
  
  if (!state.aux.inicioTratamento || isArtifactAttendanceDate(state.aux.inicioTratamento, state.aux.dataAtd || $("dataAtd")?.value)) {
    state.aux.inicioTratamento = "";
    state.inicioTratamento = "";
    if ($("inicioTratamento")) $("inicioTratamento").value = "";
    if ($("agilInicioTratamento")) $("agilInicioTratamento").value = "";
  }
  
  const isRetroInv = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  const manualOverride = state.parecerManualOverride || "";

  const isFavGeneral = String(state.parecer || getRadio("parecer") || "").toUpperCase().startsWith("FAV")
    || (isRetroInv && manualOverride !== "CONTRÁRIO")
    || (state.exameFisicoTipo === "Exame Mental" && state.exameMentalResultado === "Alterado")
    || (state.exameFisicoTipo === "Aparelho Osteomuscular e Tecido Conjutivo" && Object.values(state.osteomuscularRegioes || {}).some(v => v === "Alterado"));

  if (!state.aux.sintomasLimitacao || (isFavGeneral && isContraryLimitationText(state.aux.sintomasLimitacao))) {
    if (isFavGeneral) {
      state.aux.sintomasLimitacao = gerarNarrativaLimitacoesMelhoriaContinua(state, values());
    } else {
      state.aux.sintomasLimitacao = state.aux.descLimitacao || (state.exameMentalResultado === "Alterado" ? TEXTO_LIMITACAO_ALTERADO : (state.exameMentalResultado === "Normal" ? TEXTO_LIMITACAO_NORMAL : "Conforme exame físico/mental"));
    }
    if ($("sintomasLimitacao")) $("sintomasLimitacao").value = state.aux.sintomasLimitacao;
    if ($("agilSintomasLimitacao")) $("agilSintomasLimitacao").value = state.aux.sintomasLimitacao;
  }

  // Síntese de Queixa e Duração
  const narratQueixa = gerarNarrativaQueixaMelhoriaContinua(state, values());
  if (!state.aux.queixaDuracao || state.aux.queixaDuracao === "Conforme queixa informada no atendimento" || state.aux.queixaDuracao === state.aux.doencaMotivo || state.aux.queixaDuracao.length < 80) {
    state.aux.queixaDuracao = narratQueixa || state.queixaDuracao || state.aux.doencaMotivo || "Conforme queixa informada no atendimento";
    state.queixaDuracao = state.aux.queixaDuracao;
    if ($("queixaDuracao")) $("queixaDuracao").value = state.aux.queixaDuracao;
  }

  // 06, 07, 08 — Limitações, Quesitos, Capacidade, Parecer, Justificativa
  if (isRetroInv && manualOverride !== "FAVORÁVEL") {
    // Caso de retroação inválida (> 3 dias): Parecer CONTRÁRIO automático, mantendo limitações e exame como favorável
    state.parecer = "CONTRÁRIO";
    state.aux.parecer = "CONTRÁRIO";
    state.limitacaoFuncional = "Sim";
    state.limitacaoRol = "Sim";
    state.capacidade = "Capacidade parcial e temporariamente prejudicada";
    if (!state.descLimitacao || isContraryLimitationText(state.descLimitacao)) {
      state.descLimitacao = gerarNarrativaLimitacoesMelhoriaContinua(state, values());
      state.aux.descLimitacao = state.descLimitacao;
    }
    const curJ = ($("agilJustificativa")?.value || state.justificativa || state.aux.justificativa || "").trim();
    if (!curJ || !curJ.toLowerCase().includes("retroação")) {
      aplicarParecerContrarioRetroacao(true);
    } else {
      state.aux.justificativa = curJ;
      state.justificativa = curJ;
    }
  } else if (manualOverride === "FAVORÁVEL" || manualOverride === "CONTRÁRIO") {
    state.parecer = manualOverride;
    state.aux.parecer = manualOverride;
    if (manualOverride === "FAVORÁVEL") {
      state.limitacaoFuncional = "Sim";
      state.limitacaoRol = "Sim";
      state.capacidade = "Capacidade parcial e temporariamente prejudicada";
      if (!state.descLimitacao || isContraryLimitationText(state.descLimitacao)) {
        state.descLimitacao = gerarNarrativaLimitacoesMelhoriaContinua(state, values());
        state.aux.descLimitacao = state.descLimitacao;
      }
    } else {
      state.limitacaoFuncional = "Não";
      state.limitacaoRol = "Não";
      state.capacidade = "Capacidade laborativa preservada";
    }
    state.aux.justificativa = $("agilJustificativa")?.value || state.justificativa || state.aux.justificativa || gerarNarrativaJustificativaMelhoriaContinua(state, values());
    state.justificativa = state.aux.justificativa;
  } else if (state.exameFisicoTipo === "Exame Mental") {
    if (state.exameMentalResultado === "Alterado") {
      state.limitacaoFuncional = "Sim";
      state.limitacaoRol = "Sim";
      state.capacidade = "Capacidade parcial e temporariamente prejudicada";
      state.parecer = "FAVORÁVEL";
      if (!state.descLimitacao || isContraryLimitationText(state.descLimitacao)) {
        state.descLimitacao = gerarNarrativaLimitacoesMelhoriaContinua(state, values());
        state.aux.descLimitacao = state.descLimitacao;
      }
      state.aux.justificativa = state.aux.justificativa || $("agilJustificativa")?.value || TEXTO_JUSTIFICATIVA_ALTERADO;
      state.justificativa = state.aux.justificativa;
    } else {
      state.limitacaoFuncional = "Não";
      state.limitacaoRol = "Não";
      state.capacidade = "Capacidade laborativa preservada";
      state.parecer = "CONTRÁRIO";
      state.aux.justificativa = state.aux.justificativa || $("agilJustificativa")?.value || TEXTO_JUSTIFICATIVA_NORMAL;
      state.justificativa = state.aux.justificativa;
    }
  } else if (state.exameFisicoTipo === "Aparelho Osteomuscular e Tecido Conjutivo") {
    const hasAlterado = Object.values(state.osteomuscularRegioes || {}).some(v => v === "Alterado");
    if (hasAlterado) {
      state.limitacaoFuncional = "Sim";
      state.limitacaoRol = "Sim";
      state.capacidade = "Capacidade parcial e temporariamente prejudicada";
      state.parecer = "FAVORÁVEL";
      if (!state.descLimitacao || isContraryLimitationText(state.descLimitacao)) {
        state.descLimitacao = gerarNarrativaLimitacoesMelhoriaContinua(state, values());
        state.aux.descLimitacao = state.descLimitacao;
      }
      state.aux.justificativa = state.aux.justificativa || $("agilJustificativa")?.value || (state.descLimitacao ? `Capacidade parcial e temporariamente prejudicada, ${state.descLimitacao}` : TEXTO_JUSTIFICATIVA_ALTERADO);
      state.justificativa = state.aux.justificativa;
    } else {
      state.limitacaoFuncional = "Não";
      state.limitacaoRol = "Não";
      state.capacidade = "Capacidade laborativa preservada";
      state.parecer = "CONTRÁRIO";
      state.aux.justificativa = state.aux.justificativa || $("agilJustificativa")?.value || TEXTO_OSTEO_NORMAL_JUSTIFICATIVA;
      state.justificativa = state.aux.justificativa;
    }
  } else if (state.exameFisicoTipo === "Outros") {
    if (state.outrosResultado === "Alterado") {
      state.limitacaoFuncional = "Sim";
      state.limitacaoRol = "Sim";
      state.capacidade = "Capacidade parcial e temporariamente prejudicada";
      state.parecer = "FAVORÁVEL";
      state.aux.justificativa = state.aux.justificativa || $("agilJustificativa")?.value || "";
      state.justificativa = state.aux.justificativa;
    } else {
      state.limitacaoFuncional = "Não";
      state.limitacaoRol = "Não";
      state.capacidade = "Capacidade laborativa preservada";
      state.parecer = "CONTRÁRIO";
      state.aux.justificativa = state.aux.justificativa || $("agilJustificativa")?.value || "";
      state.justificativa = state.aux.justificativa;
    }
  } else {
    state.limitacaoFuncional = state.limitacaoFuncional || "Não";
    state.limitacaoRol = state.limitacaoRol || "Não";
    state.capacidade = state.capacidade || "Capacidade laborativa preservada";
    state.parecer = state.parecer || "CONTRÁRIO";
    state.aux.justificativa = state.aux.justificativa || $("agilJustificativa")?.value || "Avaliação pericial clínica sem evidências de incapacidade laborativa no momento do exame pericial.";
    state.justificativa = state.aux.justificativa;
  }
  setRadio("limitacaoFuncional", state.limitacaoFuncional);
  setRadio("limitacaoRol", state.limitacaoRol);
  setRadio("capacidade", state.capacidade);
  setRadio("parecer", state.parecer);
  setRadio("agilParecer", state.parecer);
  if ($("justificativa")) $("justificativa").value = state.aux.justificativa || "";
  if (isRetroInv && manualOverride !== "FAVORÁVEL") {
    if (typeof QuesitoService !== "undefined") {
      QuesitoService.set(0, "Sim");
      QuesitoService.set(1, "Sim");
      QuesitoService.set(2, "Sim");
      if (typeof renderQuesitos === "function") renderQuesitos();
    }
  } else {
    ajustarQuesitosPorParecerEReadaptacao();
  }
}

function finalizarAtendimentoAgil() {
  if (isFinalizedReadOnly()) {
    toast("Atendimento já finalizado. Reabra pela Gestão para editar.");
    return;
  }
  syncAgilToExtended();
  
  const missing = [];
  if (!state.aux.cargo) missing.push("Cargo");
  if (!state.aux.idade) missing.push("Idade");
  if (!state.readaptado) missing.push("É readaptado? (Sim/Não)");
  if (!state.aux.doencaMotivo) missing.push("Qual a doença está tratando que motivou o afastamento?");
  if (!state.aux.sintomasLimitacao) missing.push("Quais sintomas / limitações são referidos?");
  if (!state.cid) missing.push("CID");
  if (!state.exameFisicoTipo) missing.push("Tipo de exame físico / mental");
  if (state.exameFisicoTipo === "Exame Mental" && !state.exameMentalResultado) {
    missing.push("Resultado do Exame Mental (Normal ou Alterado)");
  }
  if (state.exameFisicoTipo === "Aparelho Osteomuscular e Tecido Conjutivo") {
    const hasAny = Object.keys(state.osteomuscularRegioes || {}).length > 0 || state.osteomuscularResultado === "Normal";
    if (!hasAny) {
      missing.push("Avaliação Osteomuscular (Selecione ao menos uma região como Alterada ou Normal, ou clique em Sem Alterações / Normal)");
    }
  }
  if (state.exameFisicoTipo === "Outros") {
    if (!state.outrosSubtipo) {
      missing.push("Área do exame clínico em Outros");
    }
    if (!state.outrosResultado) {
      missing.push("Resultado da avaliação (Normal ou Alterado)");
    }
    const desc = state.exameFisicoDescricao || $("agilExameFisicoDescricao")?.value?.trim();
    if (!desc) {
      missing.push("Exame Físico Geral — achados observados");
    }
    const just = state.aux?.justificativa || $("agilJustificativa")?.value?.trim();
    if (!just) {
      missing.push("Justificativa Parecer Final");
    }
  }
  
  if (missing.length > 0) {
    toast("Campos pendentes no Modo Ágil: " + missing.join(", "));
    const fieldFocusMap = {
      "Cargo": "agilCargo",
      "Idade": "agilIdade",
      "É readaptado? (Sim/Não)": "agilReadaptado_Nao",
      "Qual a doença está tratando que motivou o afastamento?": "agilDoencaMotivo",
      "Quais sintomas / limitações são referidos?": "agilSintomasLimitacao",
      "CID": "agilCid",
      "Tipo de exame físico / mental": "agilExameFisicoTipo",
      "Resultado do Exame Mental (Normal ou Alterado)": "btnAgilMentalNormal",
      "Avaliação Osteomuscular (Selecione ao menos uma região como Alterada ou Normal, ou clique em Sem Alterações / Normal)": "agilOsteomuscularSelector",
      "Área do exame clínico em Outros": "agilOutrosChips",
      "Resultado da avaliação (Normal ou Alterado)": "btnAgilOutrosNormal",
      "Exame Físico Geral — achados observados": "agilExameFisicoDescricao",
      "Justificativa Parecer Final": "agilJustificativa"
    };
    const targetId = fieldFocusMap[missing[0]];
    if (targetId && $(targetId)) {
      $(targetId).scrollIntoView({ behavior: "smooth", block: "center" });
      try { $(targetId).focus(); } catch (_) {}
    }
    return;
  }
  
  ensureAgileBackgroundDefaults();
  openFinalizeDialog();
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: CALCULADORA DE PRAZOS & RETROAÇÃO
   ========================================================= */
function toggleAtestadoAssistente(aberto) {
  const panel = $("agilAtestadoAssistenteSubpanel");
  if (panel) {
    panel.style.display = aberto ? "block" : "none";
  }
  const chk = $("agilCheckAtestadoAssistente");
  if (chk && chk.checked !== !!aberto) {
    chk.checked = !!aberto;
  }
  atualizarDiasConcedidosAutomatico();
}

function atualizarDiasConcedidosAutomatico() {
  const p = String(state.parecer || $("parecer")?.value || "").toUpperCase();
  const isContrario = p.includes("CONTRÁR") || p.includes("CONTRAR");
  const diasInput = $("agilDiasSolicitados");
  const diasNormInput = $("diasSolicitados");

  if (!state.aux) state.aux = {};

  if (isContrario) {
    state.aux.diasConcedidos = "0";
    state.diasConcedidos = "0";
  } else {
    let currentDias = state.aux.diasConcedidos || state.aux.diasSolicitados || diasInput?.value || diasNormInput?.value || "";
    currentDias = String(currentDias).replace(/\D/g, "");
    if (!currentDias || currentDias === "0") {
      currentDias = "1";
    }
    state.aux.diasConcedidos = currentDias;
    state.diasConcedidos = currentDias;
    if (!state.aux.diasSolicitados) state.aux.diasSolicitados = currentDias;
    if (diasInput && !diasInput.value) diasInput.value = currentDias;
    if (diasNormInput && !diasNormInput.value) diasNormInput.value = currentDias;
  }
}

function calcularDatasAtestado() {
  const dtDoc = $("agilDataDocumento")?.value || $("dataDocumento")?.value || state.aux?.dataDocumento || state.dataDocumento || "";
  const diasStr = $("agilDiasSolicitados")?.value || $("diasSolicitados")?.value || state.aux?.diasSolicitados || state.diasSolicitados || "";
  const dias = parseInt(diasStr, 10);
  
  // Data de Expedição da Guia (prioridade absoluta sobre a data atual conforme regra DPME)
  const dtExpRaw = $("agilDataExpedicao")?.value || $("dataExpedicao")?.value || state.aux?.dataExpedicao || state.aux?.dataExpedicaoIso || state.dataExpedicao || "";
  
  const alertBadge = $("retroacaoAlertaBadge");
  const alertExp = $("retroacaoExplicacao");
  const inicioTxt = $("calcDataInicioTxt");
  const expedicaoTxt = $("calcDataExpedicaoTxt");
  const terminoTxt = $("calcDataTerminoTxt");
  const diasTxt = $("calcDiasTxt");
  const retroacaoTxt = $("calcRetroacaoTxt");
  const btnContrario = $("btnAplicarContrarioRetroacao");

  // Helper para converter string de data para Date a meia-noite
  function parseDateToMidnight(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    const mBr = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (mBr) {
      return new Date(parseInt(mBr[3], 10), parseInt(mBr[2], 10) - 1, parseInt(mBr[1], 10));
    }
    const mesMap = { janeiro: 0, fevereiro: 1, marco: 2, março: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11 };
    const mTxt = s.match(/(\d{1,2})\s+(?:de\s+)?([A-Za-zçÇ]+)\s+(?:de\s+)?(\d{4})/i);
    if (mTxt && mesMap[mTxt[2].toLowerCase()] !== undefined) {
      return new Date(parseInt(mTxt[3], 10), mesMap[mTxt[2].toLowerCase()], parseInt(mTxt[1], 10));
    }
    return null;
  }

  const docDate = parseDateToMidnight(dtDoc);
  const expDate = parseDateToMidnight(dtExpRaw);
  const now = new Date();
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // A referência para a retroação é SEMPRE a data de expedição da guia no e-SISLA. Fallback para hoje somente se não informada.
  const refDate = expDate || todayZero;
  const isUsingExpedicao = !!expDate;

  if (expedicaoTxt) {
    if (expDate) {
      const eD = String(expDate.getDate()).padStart(2, "0");
      const eM = String(expDate.getMonth() + 1).padStart(2, "0");
      expedicaoTxt.textContent = `${eD}/${eM}/${expDate.getFullYear()}`;
    } else {
      expedicaoTxt.textContent = "--/--/----";
    }
  }

  if (!docDate) {
    if (alertBadge) alertBadge.style.display = "none";
    if (alertExp) alertExp.style.display = "none";
    if (inicioTxt) inicioTxt.textContent = "--/--/----";
    if (terminoTxt) terminoTxt.textContent = "--/--/----";
    if (diasTxt) diasTxt.textContent = "--";
    if (retroacaoTxt) retroacaoTxt.textContent = "--";
    if (btnContrario) btnContrario.style.display = "none";
    if ($("agilOpcaoParecerDataAntigaBox")) $("agilOpcaoParecerDataAntigaBox").style.display = "none";
    if ($("sec8OpcaoParecerDataAntigaBox")) $("sec8OpcaoParecerDataAntigaBox").style.display = "none";
    return;
  }

  const fmtDoc = `${String(docDate.getDate()).padStart(2, "0")}/${String(docDate.getMonth() + 1).padStart(2, "0")}/${docDate.getFullYear()}`;
  if (inicioTxt) inicioTxt.textContent = fmtDoc;

  // Diferença em dias corridos entre a referência (Expedição da Guia) e a emissão do atestado
  const diffTime = refDate.getTime() - docDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHoje = Math.floor((todayZero.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24));

  if (retroacaoTxt) {
    if (diffDays > 0) {
      retroacaoTxt.textContent = `${diffDays} dia${diffDays > 1 ? "s" : ""}`;
      retroacaoTxt.style.color = diffDays > 3 ? "#DC2626" : "#16A34A";
    } else {
      retroacaoTxt.textContent = "0 dias";
      retroacaoTxt.style.color = "#16A34A";
    }
  }

  if (diffDays > 3) {
    if (!state.aux) state.aux = {};
    state.aux.retroacaoInvalida = true;
    state.aux.retroacaoDias = diffDays;
    state.retroacaoInvalida = true;
    state.retroacaoDias = diffDays;

    if (alertBadge) {
      alertBadge.style.display = "inline-flex";
      alertBadge.innerHTML = `⚠️ Retroação Inválida: ${diffDays} dias (> 3 dias)`;
      alertBadge.style.background = "#FEE2E2";
      alertBadge.style.color = "#991B1B";
      alertBadge.style.borderColor = "#F87171";
    }
    if (alertExp) {
      alertExp.style.display = "block";
      const fmtRef = `${String(refDate.getDate()).padStart(2, "0")}/${String(refDate.getMonth() + 1).padStart(2, "0")}/${refDate.getFullYear()}`;
      const refDesc = isUsingExpedicao ? `Data da Expedição da Guia (${fmtRef})` : `Data atual de hoje (${fmtRef})`;
      alertExp.innerHTML = `
        <div style="background:#FFF7ED;border:1.5px solid #FDBA74;border-radius:8px;padding:10px 14px;margin-top:6px">
          <div style="font-weight:800;color:#9A3412;display:flex;align-items:center;gap:6px">
            <span>⛔</span>
            <span>Atenção DPME — Retroação Inválida (${diffDays} dias):</span>
          </div>
          <div style="font-size:12px;color:#7C2D12;line-height:1.45;margin-top:4px">
            O intervalo entre a <strong>${refDesc}</strong> e a <strong>Data de Emissão do Atestado (${fmtDoc})</strong> é de <strong>${diffDays} dias</strong> (superior ao limite regulamentar de 3 dias).
            O parecer <strong>CONTRÁRIO</strong> foi aplicado automaticamente (mantendo limitações e exame físico como favorável e aplicando o motivo na justificativa).
          </div>
        </div>
      `;
    }
    if (btnContrario) btnContrario.style.display = "inline-flex";

    // Exibir alerta ao lado dos botões de Finalizar Atendimento
    const avisoFin = $("retroacaoFinalizarAviso");
    const avisoFinTxt = $("retroacaoFinalizarAvisoTxt");
    if (avisoFin) {
      avisoFin.style.display = "inline-flex";
      if (avisoFinTxt) avisoFinTxt.textContent = `Guia fora do prazo (${diffDays} dias de retroação > 3 dias) • Parecer CONTRÁRIO`;
    }
    const avisoHead = $("retroacaoHeaderAviso");
    if (avisoHead) {
      avisoHead.style.display = "inline-flex";
      avisoHead.textContent = `⛔ Guia fora do prazo (${diffDays} dias) • CONTRÁRIO`;
    }
    const avisoIA2G = $("ia2RetroacaoAvisoGravacao");
    if (avisoIA2G) avisoIA2G.style.display = "inline-flex";
    const avisoIA2E = $("ia2RetroacaoAvisoEscrita");
    if (avisoIA2E) avisoIA2E.style.display = "inline-flex";

    // Aplicação automática de Parecer Contrário por retroação inválida (mesmo sem o médico clicar em aplicar)
    if (state.parecerManualOverride !== "FAVORÁVEL") {
      aplicarParecerContrarioRetroacao(true);
    }
  } else {
    if (!state.aux) state.aux = {};
    state.aux.retroacaoInvalida = false;
    state.aux.retroacaoDias = diffDays;
    state.retroacaoInvalida = false;
    state.retroacaoDias = diffDays;

    if (alertBadge) {
      alertBadge.style.display = "none";
      alertBadge.style.background = "#FFEDD5";
      alertBadge.style.color = "#9A3412";
      alertBadge.style.borderColor = "#FDBA74";
    }
    if (alertExp) alertExp.style.display = "none";
    if (btnContrario) btnContrario.style.display = "none";

    const avisoFin = $("retroacaoFinalizarAviso");
    if (avisoFin) avisoFin.style.display = "none";
    const avisoHead = $("retroacaoHeaderAviso");
    if (avisoHead) avisoHead.style.display = "none";
    const avisoIA2G = $("ia2RetroacaoAvisoGravacao");
    if (avisoIA2G) avisoIA2G.style.display = "none";
    const avisoIA2E = $("ia2RetroacaoAvisoEscrita");
    if (avisoIA2E) avisoIA2E.style.display = "none";
  }

  // Atualizar opção de Parecer abaixo da Justificativa quando identificar data antiga do atestado
  atualizarOpcaoParecerDataAntigaUI(diffDays, diffHoje, fmtDoc);

  if (!isNaN(dias) && dias > 0) {
    if (diasTxt) diasTxt.textContent = `${dias} dia${dias > 1 ? "s" : ""}`;
    const endDate = new Date(docDate.getTime());
    endDate.setDate(endDate.getDate() + (dias - 1));
    const endDay = String(endDate.getDate()).padStart(2, "0");
    const endMonth = String(endDate.getMonth() + 1).padStart(2, "0");
    const endYear = endDate.getFullYear();
    if (terminoTxt) terminoTxt.textContent = `${endDay}/${endMonth}/${endYear}`;
  } else {
    if (diasTxt) diasTxt.textContent = "--";
    if (terminoTxt) terminoTxt.textContent = "--/--/----";
  }
}

function aplicarParecerContrarioRetroacao(silent = false) {
  const cargo = state.aux?.cargo || state.cargo || $("agilCargo")?.value || $("cargo")?.value || "servidor";
  const cidVal = state.cid || state.aux?.cid || $("agilCid")?.value || $("cid")?.value || "";
  const cidInfo = typeof findCID === "function" ? findCID(cidVal) : null;
  const cidNome = cidInfo?.n || state.aux?.doencaMotivo || "patologia em tratamento";
  const sintomasExistentes = ($("agilSintomasLimitacao")?.value || state.aux?.sintomasLimitacao || state.sintomasLimitacao || state.descLimitacao || "").trim();
  const retroDias = state.aux?.retroacaoDias || state.retroacaoDias || "";
  const diasClause = retroDias ? ` (${retroDias} dias)` : "";

  // Justificativa com o motivo do contrário por retroação inválida (> 3 dias)
  let justTexto = "";
  if (sintomasExistentes && sintomasExistentes.length > 5 && !isContraryLimitationText(sintomasExistentes)) {
    const sintClean = sintomasExistentes.replace(/\s*(?:Todavia|Contudo|Entretanto|Porém),?\s+a\s+guia\s+pericial.*$/i, "").replace(/\.$/, "");
    justTexto = `Embora o(a) periciado(a) tenha apresentado atestado e histórico com relato de ${sintClean}, e limitações para as atividades do cargo de ${cargo}, constata-se que a guia pericial foi expedida com mais de 3 dias de retroação${diasClause} em relação à data de emissão do atestado médico, não havendo comprovação documental de internamento hospitalar ou impedimento absoluto do servidor para emissão tempestiva da guia, ensejando, por estrito critério administrativo-normativo do DPME/SP, o parecer CONTRÁRIO.`;
  } else {
    justTexto = `Embora o(a) servidor(a) tenha apresentado histórico compatível com ${cidVal ? cidVal + " (" + cidNome + ")" : cidNome}, constata-se que a guia pericial foi expedida com mais de 3 dias de retroação${diasClause} em relação à emissão do atestado médico, não havendo comprovação de internamento hospitalar ou impedimento absoluto do servidor para emissão tempestiva da guia, ensejando parecer CONTRÁRIO nos termos da diretriz regulamentar oficial do DPME/SP.`;
  }

  state.parecer = "CONTRÁRIO";
  state.justificativa = justTexto;
  state.retroacaoInvalida = true;
  if (!state.aux) state.aux = {};
  state.aux.parecer = "CONTRÁRIO";
  state.aux.justificativa = justTexto;
  state.aux.retroacaoInvalida = true;
  
  if ($("parecer")) $("parecer").value = "CONTRÁRIO";
  if ($("agilParecer")) $("agilParecer").value = "CONTRÁRIO";
  setRadio("parecer", "CONTRÁRIO");
  setRadio("agilParecer", "CONTRÁRIO");
  
  if ($("justificativa")) $("justificativa").value = justTexto;
  if ($("agilJustificativa")) $("agilJustificativa").value = justTexto;

  // Manter limitações e quesitos como se fosse FAVORÁVEL (e preservar o exame físico do médico)
  state.limitacaoFuncional = "Sim";
  state.limitacaoRol = "Sim";
  setRadio("limitacaoFuncional", "Sim");
  setRadio("agilLimitacaoFuncional", "Sim");
  setRadio("limitacaoRol", "Sim");
  setRadio("agilLimitacaoRol", "Sim");
  state.capacidade = "Capacidade parcial e temporariamente prejudicada";
  setRadio("capacidade", "Capacidade parcial e temporariamente prejudicada");

  let descLim = gerarNarrativaLimitacoesMelhoriaContinua(state, typeof values === "function" ? values() : {});
  descLim = descLim.replace(/\s*(?:Todavia|Contudo|Entretanto|Porém),?\s+a\s+guia\s+pericial.*$/i, "").trim();
  if (descLim && !descLim.toLowerCase().includes("rol de atividades")) {
    descLim = `${descLim.replace(/[.,;]+$/, "")}, atividades estas constantes no Rol de Atividades do cargo de ${cargo}.`;
  }
  if (descLim) {
    state.descLimitacao = descLim;
    state.aux.descLimitacao = descLim;
    if ($("descLimitacao")) $("descLimitacao").value = descLim;
    if ($("agilDescLimitacao")) $("agilDescLimitacao").value = descLim;
    if (!state.atividadesComprometidas || isContraryLimitationText(state.atividadesComprometidas)) {
      state.atividadesComprometidas = descLim;
      state.aux.atividadesComprometidas = descLim;
      if ($("atividadesComprometidas")) $("atividadesComprometidas").value = descLim;
    }
  }

  if (typeof QuesitoService !== "undefined") {
    QuesitoService.set(0, "Sim");
    QuesitoService.set(1, "Sim");
    QuesitoService.set(2, "Sim");
    if (typeof renderQuesitos === "function") renderQuesitos();
  }

  if (typeof atualizarEstiloBotoesParecerDataAntiga === "function") {
    atualizarEstiloBotoesParecerDataAntiga();
  }

  autoSave();
  if (!silent) {
    toast("⛔ Parecer CONTRÁRIO aplicado por retroação inválida (> 3 dias). Exame físico e limitações mantidos como favoráveis.");
  }
}
window.aplicarParecerContrarioRetroacao = aplicarParecerContrarioRetroacao;

function atualizarOpcaoParecerDataAntigaUI(diffDays, diffHoje, fmtDoc) {
  const boxAgil = $("agilOpcaoParecerDataAntigaBox");
  const boxSec8 = $("sec8OpcaoParecerDataAntigaBox");
  const isDataAntiga = (typeof diffDays === "number" && diffDays > 0) || (typeof diffHoje === "number" && diffHoje > 0);

  if (!isDataAntiga) {
    if (boxAgil) boxAgil.style.display = "none";
    if (boxSec8) boxSec8.style.display = "none";
    return;
  }

  const isRetroInv = typeof diffDays === "number" && diffDays > 3;
  const diasRef = (typeof diffDays === "number" && diffDays > 0) ? diffDays : diffHoje;
  const tituloTxt = isRetroInv
    ? `Atestado com Data Antiga (${fmtDoc} • ${diffDays} dias de retroação > 3 dias)`
    : `Atestado com Data Antiga Identificada (${fmtDoc} • ${diasRef} dia${diasRef > 1 ? "s" : ""} atrás)`;
  const subTxt = isRetroInv
    ? `Parecer CONTRÁRIO aplicado automaticamente mantendo exame físico e limitações favoráveis. Caso deseje, escolha abaixo o parecer independente do exame físico:`
    : `Data anterior identificada no atestado. Você pode definir o parecer Contrário ou Favorável abaixo, independente do exame físico:`;

  if (boxAgil) {
    boxAgil.style.display = "block";
    if ($("agilOpcaoParecerDataAntigaTitulo")) $("agilOpcaoParecerDataAntigaTitulo").textContent = tituloTxt;
    if ($("agilOpcaoParecerDataAntigaSub")) $("agilOpcaoParecerDataAntigaSub").textContent = subTxt;
  }
  if (boxSec8) {
    boxSec8.style.display = "block";
    if ($("sec8OpcaoParecerDataAntigaTitulo")) $("sec8OpcaoParecerDataAntigaTitulo").textContent = tituloTxt;
    if ($("sec8OpcaoParecerDataAntigaSub")) $("sec8OpcaoParecerDataAntigaSub").textContent = subTxt;
  }

  atualizarEstiloBotoesParecerDataAntiga();
}

function atualizarEstiloBotoesParecerDataAntiga() {
  const pAtual = String(state.parecer || state.aux?.parecer || getRadio("parecer") || "").toUpperCase();
  const isFav = pAtual.includes("FAV");
  const isContr = pAtual.includes("CONTR");

  const pairs = [
    { btnC: $("btnAgilParecerDataAntigaContrario"), btnF: $("btnAgilParecerDataAntigaFavoravel"), status: $("agilOpcaoParecerDataAntigaStatus") },
    { btnC: $("btnSec8ParecerDataAntigaContrario"), btnF: $("btnSec8ParecerDataAntigaFavoravel"), status: $("sec8OpcaoParecerDataAntigaStatus") }
  ];

  pairs.forEach(({ btnC, btnF, status }) => {
    if (btnC) {
      btnC.style.background = isContr ? "#DC2626" : "#FEF2F2";
      btnC.style.color = isContr ? "#FFFFFF" : "#B91C1C";
      btnC.style.boxShadow = isContr ? "0 3px 10px rgba(220,38,38,0.28)" : "none";
    }
    if (btnF) {
      btnF.style.background = isFav ? "#10B981" : "#ECFDF5";
      btnF.style.color = isFav ? "#FFFFFF" : "#047857";
      btnF.style.boxShadow = isFav ? "0 3px 10px rgba(16,185,129,0.28)" : "none";
    }
    if (status) {
      if (isContr) {
        status.textContent = "ATUAL: CONTRÁRIO";
        status.style.background = "#FEE2E2";
        status.style.color = "#991B1B";
      } else if (isFav) {
        status.textContent = "ATUAL: FAVORÁVEL";
        status.style.background = "#DCFCE7";
        status.style.color = "#15803D";
      } else {
        status.textContent = "SELECIONE O PARECER";
        status.style.background = "#FEF3C7";
        status.style.color = "#92400E";
      }
    }
  });
}

function selecionarParecerDataAntigaManual(parecerEscolhido) {
  const par = String(parecerEscolhido || "").toUpperCase().includes("FAV") ? "FAVORÁVEL" : "CONTRÁRIO";
  state.parecerManualOverride = par;
  state.parecer = par;
  if (!state.aux) state.aux = {};
  state.aux.parecer = par;

  if ($("parecer")) $("parecer").value = par;
  if ($("agilParecer")) $("agilParecer").value = par;
  setRadio("parecer", par);
  setRadio("agilParecer", par);

  const isRetroInv = Boolean(state.aux?.retroacaoInvalida || state.retroacaoInvalida);
  const cargo = state.aux?.cargo || state.cargo || $("agilCargo")?.value || $("cargo")?.value || "servidor";
  const cidVal = state.cid || state.aux?.cid || $("agilCid")?.value || $("cid")?.value || "";
  const cidInfo = typeof findCID === "function" ? findCID(cidVal) : null;
  const cidNome = cidInfo?.n || state.aux?.doencaMotivo || "patologia avaliada";

  if (par === "CONTRÁRIO") {
    if (isRetroInv) {
      aplicarParecerContrarioRetroacao(true);
    } else {
      state.limitacaoFuncional = "Não";
      state.limitacaoRol = "Não";
      setRadio("limitacaoFuncional", "Não");
      setRadio("agilLimitacaoFuncional", "Não");
      setRadio("limitacaoRol", "Não");
      setRadio("agilLimitacaoRol", "Não");
      state.capacidade = "Capacidade laborativa preservada";
      setRadio("capacidade", "Capacidade laborativa preservada");
      const justContr = `Constato a capacidade laborativa preservada no presente ato pericial, não se observando elementos incapacitantes atuais para as atribuições do cargo de ${cargo}, ensejando parecer CONTRÁRIO.`;
      state.justificativa = justContr;
      state.aux.justificativa = justContr;
      if ($("justificativa")) $("justificativa").value = justContr;
      if ($("agilJustificativa")) $("agilJustificativa").value = justContr;
      ajustarQuesitosPorParecerEReadaptacao();
    }
    toast("🔴 Parecer CONTRÁRIO aplicado (mantendo o exame físico registrado pelo médico).");
  } else {
    state.limitacaoFuncional = "Sim";
    state.limitacaoRol = "Sim";
    setRadio("limitacaoFuncional", "Sim");
    setRadio("agilLimitacaoFuncional", "Sim");
    setRadio("limitacaoRol", "Sim");
    setRadio("agilLimitacaoRol", "Sim");
    state.capacidade = "Capacidade parcial e temporariamente prejudicada";
    setRadio("capacidade", "Capacidade parcial e temporariamente prejudicada");
    if (typeof QuesitoService !== "undefined") {
      QuesitoService.set(0, "Sim");
      QuesitoService.set(1, "Sim");
      QuesitoService.set(2, "Sim");
      if (typeof renderQuesitos === "function") renderQuesitos();
    }
    const limFav = gerarNarrativaLimitacoesMelhoriaContinua(state, typeof values === "function" ? values() : {});
    if (limFav) {
      state.descLimitacao = limFav;
      state.aux.descLimitacao = limFav;
      if ($("descLimitacao")) $("descLimitacao").value = limFav;
      if ($("agilDescLimitacao")) $("agilDescLimitacao").value = limFav;
    }
    const justFav = `Considerando o histórico clínico, a documentação médica apresentada e a sintomatologia compatível com ${cidVal ? cidVal + " (" + cidNome + ")" : cidNome}, considero a capacidade laborativa parcial e temporariamente prejudicada para as atribuições do rol do cargo de ${cargo}, referente ao período pleiteado no atestado médico.`;
    state.justificativa = justFav;
    state.aux.justificativa = justFav;
    if ($("justificativa")) $("justificativa").value = justFav;
    if ($("agilJustificativa")) $("agilJustificativa").value = justFav;
    toast("🟢 Parecer FAVORÁVEL aplicado (independente do exame físico atual).");
  }

  atualizarEstiloBotoesParecerDataAntiga();
  if (typeof atualizarDiasConcedidosAutomatico === "function") atualizarDiasConcedidosAutomatico();
  autoSave();
}
window.selecionarParecerDataAntigaManual = selecionarParecerDataAntigaManual;

function concederMesmosDiasAtestado() {
  const dtDoc = $("agilDataDocumento")?.value || state.aux?.dataDocumento || "";
  const diasStr = $("agilDiasSolicitados")?.value || state.aux?.diasSolicitados || "";
  const dias = parseInt(diasStr, 10);
  
  if (!dtDoc) {
    toast("Informe primeiro a data do atestado para calcular o período.");
    return;
  }

  state.parecer = "FAVORÁVEL";
  setRadio("parecer", "FAVORÁVEL");
  state.limitacaoFuncional = "Sim";
  state.limitacaoRol = "Sim";
  setRadio("limitacaoFuncional", "Sim");
  setRadio("limitacaoRol", "Sim");
  state.capacidade = "Capacidade parcial e temporariamente prejudicada";
  setRadio("capacidade", "Capacidade parcial e temporariamente prejudicada");
  QuesitoService.set(0, "Sim");
  QuesitoService.set(1, "Sim");
  QuesitoService.set(2, "Sim");
  renderQuesitos();

  if (!state.aux) state.aux = {};
  state.aux.diasConcedidos = isNaN(dias) ? (diasStr || "1") : dias;
  state.aux.dataInicioAfastamento = dtDoc;
  
  calcularDatasAtestado();
  const termTxt = $("calcDataTerminoTxt")?.textContent || "";
  const iniTxt = $("calcDataInicioTxt")?.textContent || "";
  
  const justEl = $("agilJustificativa");
  if (justEl) {
    const curJust = justEl.value.trim();
    const complemento = ` Período concedido de ${dias || diasStr || 1} dia(s), de ${iniTxt} a ${termTxt}.`;
    if (!curJust || curJust === TEXTO_JUSTIFICATIVA_ALTERADO || curJust.startsWith("Capacidade laborativa parcial")) {
      justEl.value = `Capacidade laborativa parcial e temporariamente prejudicada.${complemento}`;
      syncAgilField("justificativa", justEl.value);
    }
  }
  
  autoSave();
  verificarCoerenciaPericial();
  atualizarProgressoAgil();
  toast(`Parecer FAVORÁVEL ajustado com período concedido de ${dias || diasStr || 1} dia(s).`);
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: CÁLCULO AUTOMÁTICO DE IMC
   ========================================================= */
function calcularIMC() {
  const altRaw = ($("agilAltura")?.value || state.aux?.altura || "").toString().replace(",", ".").trim();
  const pesoRaw = ($("agilPeso")?.value || state.aux?.peso || "").toString().replace(",", ".").trim();
  
  let h = parseFloat(altRaw);
  const w = parseFloat(pesoRaw);

  const imcCard = $("agilImcCard");
  const valEl = $("agilImcValor");
  const classEl = $("agilImcClassificacao");
  const badgeEl = $("agilImcBadge");

  if (isNaN(h) || isNaN(w) || h <= 0 || w <= 0) {
    if (imcCard) imcCard.style.display = "none";
    return;
  }

  // Tratamento para altura digitada em cm (ex: 175 -> 1.75)
  if (h > 3.0) {
    h = h / 100;
  }

  if (h < 0.5 || h > 2.6 || w < 20 || w > 350) {
    if (imcCard) imcCard.style.display = "none";
    return;
  }

  const imc = w / (h * h);
  const rounded = imc.toFixed(1);

  let classificacao = "Eutrófico (Peso normal)";
  let badgeText = "Eutrófico";
  let bg = "#DCFCE7";
  let fg = "#15803D";

  if (imc < 18.5) {
    classificacao = "Abaixo do peso ideal";
    badgeText = "Abaixo do peso";
    bg = "#FEF3C7";
    fg = "#92400E";
  } else if (imc < 25.0) {
    classificacao = "Eutrófico (Peso normal)";
    badgeText = "Eutrófico";
    bg = "#DCFCE7";
    fg = "#15803D";
  } else if (imc < 30.0) {
    classificacao = "Sobrepeso";
    badgeText = "Sobrepeso";
    bg = "#FEF9C3";
    fg = "#854D0E";
  } else if (imc < 35.0) {
    classificacao = "Obesidade Grau I";
    badgeText = "Obesidade I";
    bg = "#FEE2E2";
    fg = "#991B1B";
  } else if (imc < 40.0) {
    classificacao = "Obesidade Grau II (Severa)";
    badgeText = "Obesidade II";
    bg = "#FEE2E2";
    fg = "#991B1B";
  } else {
    classificacao = "Obesidade Grau III (Mórbida)";
    badgeText = "Obesidade III";
    bg = "#7F1D1D";
    fg = "#FFFFFF";
  }

  if (valEl) valEl.textContent = rounded;
  if (classEl) classEl.textContent = classificacao;
  if (badgeEl) {
    badgeEl.textContent = badgeText;
    badgeEl.style.backgroundColor = bg;
    badgeEl.style.color = fg;
  }
  if (imcCard) imcCard.style.display = "flex";

  if (!state.aux) state.aux = {};
  state.aux.imc = rounded;
  state.aux.imcClassificacao = classificacao;
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: CHIPS DE MEDICAÇÃO RÁPIDA
   ========================================================= */
function adicionarMedRapida(med, dose, freq, obs) {
  addMedication({
    medicamento: med,
    dosagem: dose,
    frequencia: freq,
    observacao: obs
  });
  toast(`Medicamento ${med} (${dose}) adicionado.`);
  atualizarProgressoAgil();
}

function negarAntecedentes() {
  const frase = "Nega antecedentes mórbidos relevantes, cirurgias prévias, neoplasias ou hábitos tabágicos e etilistas.";
  const atual = ($("agilHistoricoPregresso")?.value || state.historicoPregresso || state.aux?.historicoPregresso || "").trim();
  let resultado = frase;
  if (atual && atual !== "Nega" && atual !== "Nega.") {
    if (!atual.toLowerCase().includes("nega antecedentes mórbidos") && !atual.toLowerCase().includes("nega cirurgias")) {
      resultado = atual.replace(/[.;,]+$/, "") + ". " + frase;
    } else {
      resultado = atual;
    }
  }
  if (!state.aux) state.aux = {};
  state.aux.historicoPregresso = resultado;
  state.historicoPregresso = resultado;
  if ($("agilHistoricoPregresso")) $("agilHistoricoPregresso").value = resultado;
  if ($("historicoPregresso")) $("historicoPregresso").value = resultado;
  if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
  if (typeof autoSave === "function") autoSave();
  if (typeof toast === "function") {
    toast("Antecedentes preenchidos: Nega antecedentes mórbidos relevantes.");
  }
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: DITADO NATIVO POR VOZ (Web Speech API)
   ========================================================= */
let activeSpeechRecognition = null;
let activeVoiceTargetId = null;
window._voiceIsRecording = false;

function tratarPontuacaoVoz(texto) {
  if (!texto) return "";
  return texto
    .replace(/\s+vírgula/gi, ",")
    .replace(/\s+ponto e vírgula/gi, ";")
    .replace(/\s+dois pontos/gi, ":")
    .replace(/\s+ponto final/gi, ".")
    .replace(/\s+(nova linha|novo parágrafo|parágrafo)/gi, "\n\n")
    .replace(/\s+ponto(?!\w)/gi, ".")
    .replace(/\s{2,}/g, " ");
}

function syncVoiceField(targetId, val, isFinal = false) {
  if (targetId === "agilDoencaMotivo" || targetId === "doencaMotivo") {
    if (!state.aux) state.aux = {};
    state.aux.doencaMotivo = val;
    state.doencaMotivo = val;
    if ($("doencaMotivo") && $("doencaMotivo") !== document.activeElement) $("doencaMotivo").value = val;
    if ($("agilDoencaMotivo") && $("agilDoencaMotivo") !== document.activeElement) $("agilDoencaMotivo").value = val;
    if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
    if (isFinal && typeof autoSave === "function") autoSave();
  } else if (targetId === "agilHistoricoPregresso" || targetId === "historicoPregresso") {
    if (!state.aux) state.aux = {};
    state.aux.historicoPregresso = val;
    state.historicoPregresso = val;
    if ($("historicoPregresso") && $("historicoPregresso") !== document.activeElement) $("historicoPregresso").value = val;
    if ($("agilHistoricoPregresso") && $("agilHistoricoPregresso") !== document.activeElement) $("agilHistoricoPregresso").value = val;
    if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
    if (isFinal && typeof autoSave === "function") autoSave();
  } else if (targetId === "agilSintomasLimitacao" || targetId === "sintomasLimitacao") {
    if (!state.aux) state.aux = {};
    state.aux.sintomasLimitacao = val;
    state.sintomasLimitacao = val;
    if ($("sintomasLimitacao") && $("sintomasLimitacao") !== document.activeElement) $("sintomasLimitacao").value = val;
    if ($("agilSintomasLimitacao") && $("agilSintomasLimitacao") !== document.activeElement) $("agilSintomasLimitacao").value = val;
    if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
    if (isFinal && typeof autoSave === "function") autoSave();
  } else if (targetId === "agilExameFisicoDescricao" || targetId === "exameFisicoDescricao") {
    if (!state.aux) state.aux = {};
    state.aux.exameFisicoDescricao = val;
    state.exameFisicoDescricao = val;
    if ($("exameFisicoDescricao") && $("exameFisicoDescricao") !== document.activeElement) $("exameFisicoDescricao").value = val;
    if ($("agilExameFisicoDescricao") && $("agilExameFisicoDescricao") !== document.activeElement) $("agilExameFisicoDescricao").value = val;
    if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
    if (isFinal && typeof autoSave === "function") autoSave();
  } else if (targetId === "alteracoesClinicasExames") {
    if (!state.aux) state.aux = {};
    state.aux.alteracoesClinicasExames = val;
    state.alteracoesClinicasExames = val;
    if ($("alteracoesClinicasExames") && $("alteracoesClinicasExames") !== document.activeElement) $("alteracoesClinicasExames").value = val;
    if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
    if (isFinal && typeof autoSave === "function") autoSave();
  } else if (targetId === "agilJustificativa" || targetId === "justificativa") {
    if (!state.aux) state.aux = {};
    state.aux.justificativa = val;
    state.justificativa = val;
    if ($("justificativa") && $("justificativa") !== document.activeElement) $("justificativa").value = val;
    if ($("agilJustificativa") && $("agilJustificativa") !== document.activeElement) $("agilJustificativa").value = val;
    if (typeof atualizarProgressoAgil === "function") atualizarProgressoAgil();
    if (isFinal && typeof autoSave === "function") autoSave();
  } else {
    if (!state.aux) state.aux = {};
    state.aux[targetId] = val;
    state[targetId] = val;
    const el = $(targetId);
    if (el && el !== document.activeElement) el.value = val;
    if (isFinal && typeof autoSave === "function") autoSave();
  }
  if (typeof atualizarContadorEsisla === "function") atualizarContadorEsisla(targetId);
  if (typeof verificarCoerenciaPericial === "function") verificarCoerenciaPericial();
}

async function toggleVoiceDictation(targetId) {
  // Se já estiver gravando neste campo, interrompe
  if (window._voiceIsRecording && activeVoiceTargetId === targetId) {
    finalizarDitadoVoz(targetId);
    toast("Gravação de voz finalizada.");
    return;
  }

  // Se estiver gravando em outro campo, interrompe o anterior primeiro
  if (window._voiceIsRecording && activeVoiceTargetId) {
    finalizarDitadoVoz(activeVoiceTargetId);
  }

  // Verificação de protocolo file:///
  if (location.protocol === "file:") {
    toast("O navegador bloqueia o microfone em arquivos abertos diretamente (file:///). Inicie o sistema via servidor local (http://localhost:8000).");
    abrirModalAjudaMicrofone("file");
    return;
  }

  // Alerta de contexto seguro no Google Chrome (127.0.0.1 vs localhost)
  if (location.hostname === "127.0.0.1") {
    toast("💡 No Chrome, o envio de voz pode falhar em 127.0.0.1. Se não transcrever, acesse por: http://localhost:8000", 6000);
  }

  // Verificação de suporte do navegador
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast("O reconhecimento de voz nativo não é suportado neste navegador. Utilize o Google Chrome ou Microsoft Edge.");
    abrirModalAjudaMicrofone("unsupported");
    return;
  }

  // Iniciar diretamente o reconhecimento de voz nativo (Web Speech API)
  iniciarDitadoVoz(targetId);
}

function iniciarDitadoVoz(targetId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const targetEl = $(targetId);
  if (!targetEl) return;

  const btnId = `voiceBtn_${targetId}`;
  const btn = $(btnId);

  try {
    if (activeSpeechRecognition) {
      try { activeSpeechRecognition.abort(); } catch (_) {}
      activeSpeechRecognition = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    window._voiceIsRecording = true;
    activeVoiceTargetId = targetId;
    activeSpeechRecognition = recognition;
    window._voiceWordsTranscribed = "";
    window._voiceAudioChunks = [];
    window._voiceBaseText = targetEl.value.trim();

    let voiceBaseText = window._voiceBaseText;
    let accumulatedFinal = "";

    if (btn) {
      btn.classList.add("recording");
      if (!btn.dataset.origText) btn.dataset.origText = btn.innerHTML;
      btn.innerHTML = '<span>🔴</span> <strong>Gravando... (Clique p/ parar)</strong>';
    }

    toast("Microfone ativo! Fale seus achados clínicos com clareza.");

    // Monitoramento do nível de áudio do microfone e gravação de backup via MediaRecorder
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        window._voiceAudioStream = stream;

        // Iniciar gravação de áudio em paralelo para fallback com IA (Gemini) caso necessário
        try {
          const supportedMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");
          const mr = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);
          window._voiceMediaRecorder = mr;
          window._voiceAudioChunks = [];
          mr.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) window._voiceAudioChunks.push(e.data);
          };
          mr.start(200);
        } catch (mrErr) {
          console.warn("MediaRecorder init:", mrErr);
        }

        // VU meter visual de volume
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass) return;
          const audioCtx = new AudioContextClass();
          window._voiceAudioCtx = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 128;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let silenceFrames = 0;

          const monitorAudio = () => {
            if (!window._voiceIsRecording) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;

            if (btn && window._voiceIsRecording) {
              if (avg > 4) {
                silenceFrames = 0;
                btn.innerHTML = '<span>🔴</span> <strong>Gravando 🎙️ ▂▃▅ (Ouvindo...)</strong>';
              } else {
                silenceFrames++;
                if (silenceFrames > 40) { // mais de 4 segundos de silêncio absoluto
                  btn.innerHTML = '<span>🔴</span> <strong>Gravando... (Fale no microfone)</strong>';
                }
              }
            }
            if (window._voiceIsRecording) requestAnimationFrame(monitorAudio);
          };
          requestAnimationFrame(monitorAudio);
        } catch (e) {
          console.warn("Audio level monitor:", e);
        }
      }).catch(e => {
        console.warn("Microphone stream monitor:", e);
      });
    }

    recognition.onresult = (event) => {
      let finalSegment = "";
      let interimSegment = "";

      for (let i = 0; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalSegment += item[0].transcript + " ";
        } else {
          interimSegment += item[0].transcript;
        }
      }

      accumulatedFinal = tratarPontuacaoVoz(finalSegment.trim());
      const interimClean = tratarPontuacaoVoz(interimSegment.trim());

      let liveWords = "";
      if (accumulatedFinal && interimClean) {
        liveWords = `${accumulatedFinal} ${interimClean}`;
      } else {
        liveWords = accumulatedFinal || interimClean;
      }

      if (liveWords) {
        window._voiceWordsTranscribed = liveWords;
      }

      let composed = voiceBaseText;
      if (liveWords) {
        composed = composed ? `${composed} ${liveWords}` : liveWords;
      }

      targetEl.value = composed;
      syncVoiceField(targetId, composed, false);
      targetEl.scrollTop = targetEl.scrollHeight;
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "no-speech") {
        // Pausa normal do médico; reconexão automática no onend manterá a sessão aberta
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        finalizarDitadoVoz(targetId);
        abrirModalAjudaMicrofone("not_allowed");
        return;
      }
      if (event.error === "network") {
        console.warn("Falha de rede no Google Speech. A transcrição por IA (Gemini) assumirá ao finalizar.");
        return;
      }
      if (event.error === "audio-capture") {
        finalizarDitadoVoz(targetId);
        toast("Nenhum microfone detectado. Conecte um microfone para utilizar o ditado.");
        return;
      }
    };

    recognition.onend = () => {
      if (window._voiceIsRecording && activeVoiceTargetId === targetId) {
        try {
          recognition.start();
          return;
        } catch (_) {
          setTimeout(() => {
            if (window._voiceIsRecording && activeVoiceTargetId === targetId) {
              try { recognition.start(); return; } catch (_) {}
            }
          }, 300);
          return;
        }
      }
    };

    try {
      recognition.start();
    } catch (startErr) {
      console.warn("Falha imediata ao executar recognition.start():", startErr);
      if (startErr.name === "NotAllowedError" || (startErr.message && startErr.message.includes("not-allowed"))) {
        finalizarDitadoVoz(targetId);
        abrirModalAjudaMicrofone("not_allowed");
      }
    }
  } catch (err) {
    console.error("Falha ao configurar SpeechRecognition:", err);
    window._voiceIsRecording = false;
    finalizarDitadoVoz(targetId);
    abrirModalAjudaMicrofone("not_allowed");
  }
}

function finalizarDitadoVoz(targetId) {
  window._voiceIsRecording = false;
  if (activeSpeechRecognition) {
    try { activeSpeechRecognition.stop(); } catch (_) {}
    activeSpeechRecognition = null;
  }

  const btn = $(`voiceBtn_${targetId}`);
  const targetEl = $(targetId);
  const hadRealtimeWords = !!(window._voiceWordsTranscribed && window._voiceWordsTranscribed.trim().length > 0);
  const voiceBaseText = window._voiceBaseText || "";

  // Parar mediaRecorder e coletar áudio gravado
  let audioBlob = null;
  if (window._voiceMediaRecorder && window._voiceMediaRecorder.state !== "inactive") {
    try {
      window._voiceMediaRecorder.stop();
      if (window._voiceAudioChunks && window._voiceAudioChunks.length > 0) {
        audioBlob = new Blob(window._voiceAudioChunks, { type: window._voiceMediaRecorder.mimeType || "audio/webm" });
      }
    } catch (_) {}
  }
  window._voiceMediaRecorder = null;

  if (window._voiceAudioStream) {
    try { window._voiceAudioStream.getTracks().forEach(t => t.stop()); } catch (_) {}
    window._voiceAudioStream = null;
  }
  if (window._voiceAudioCtx) {
    try { window._voiceAudioCtx.close(); } catch (_) {}
    window._voiceAudioCtx = null;
  }

  // Se o reconhecimento nativo em tempo real JÁ transcreveu palavras
  if (hadRealtimeWords && targetEl) {
    const cleaned = targetEl.value.replace(/\s{2,}/g, " ").trim();
    targetEl.value = cleaned;
    syncVoiceField(targetId, cleaned, true);
    if (btn) {
      btn.classList.remove("recording");
      btn.innerHTML = btn.dataset.origText || '<span>🎙️</span> Ditado por voz';
    }
    toast("Gravação finalizada. Achados registrados!");
    activeVoiceTargetId = null;
    return;
  }

  // Se o reconhecimento nativo em tempo real NÃO transcreveu nada (ex: trava de rede do Chrome),
  // enviamos o áudio capturado para a Inteligência Artificial (Gemini) transcrever!
  if (audioBlob && audioBlob.size > 2000 && targetEl) {
    if (btn) {
      btn.innerHTML = '<span>⏳</span> <strong>Transcrevendo áudio com IA...</strong>';
    }
    toast("Transcrevendo gravação com Inteligência Artificial...");

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const b64 = reader.result;
        const res = await (window.AmbientalAuth ? window.AmbientalAuth.authFetch : fetch)("/api/ai/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: b64, mime_type: audioBlob.type || "audio/webm" })
        });
        const data = await res.json();
        const texto = (data?.data?.texto || data?.texto || "").trim();
        if (texto) {
          const finalTxt = voiceBaseText ? `${voiceBaseText} ${texto}` : texto;
          targetEl.value = finalTxt;
          syncVoiceField(targetId, finalTxt, true);
          toast("✅ Ditado transcrito com sucesso pela IA!");
        } else {
          toast("Nenhuma fala compreensível identificada no áudio.");
        }
      } catch (err) {
        console.error("Erro na transcrição Gemini:", err);
        toast("Falha na transcrição: " + (err.message || err));
      } finally {
        if (btn) {
          btn.classList.remove("recording");
          btn.innerHTML = btn.dataset.origText || '<span>🎙️</span> Ditado por voz';
        }
        activeVoiceTargetId = null;
      }
    };
    reader.readAsDataURL(audioBlob);
    return;
  }

  // Fallback padrão se não houver áudio suficiente
  if (btn) {
    btn.classList.remove("recording");
    btn.innerHTML = btn.dataset.origText || '<span>🎙️</span> Ditado por voz';
  }
  if (targetEl) {
    const cleaned = targetEl.value.replace(/\s{2,}/g, " ").trim();
    targetEl.value = cleaned;
    syncVoiceField(targetId, cleaned, true);
  }
  activeVoiceTargetId = null;
}

function abrirModalAjudaMicrofone(motivo) {
  const modal = $("modalAjudaMicrofone");
  if (!modal) {
    toast("Permissão do microfone negada. Acesse via http://localhost:8000 ou autorize o microfone no navegador.");
    return;
  }
  const hostCard = $("micHelpLocalhostCard");
  if (hostCard) {
    if (location.hostname === "localhost") {
      hostCard.style.display = "none";
    } else {
      hostCard.style.display = "flex";
    }
  }
  modal.classList.add("show");
}

function migrarParaLocalhost() {
  try {
    if (typeof autoSave === "function") autoSave();
  } catch (_) {}
  const u = new URL(window.location.href);
  u.hostname = "localhost";
  window.location.href = u.toString();
}

function testarMicrofoneAposDesbloqueio() {
  closeModal('modalAjudaMicrofone');
  toast("Testando microfone...");
  const targetId = activeVoiceTargetId || "agilExameFisicoDescricao" || "exameFisicoDescricao";
  iniciarDitadoVoz(targetId);
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: CHIPS DE ACHADOS DO EXAME FÍSICO
   ========================================================= */
function inserirAchadoExame(texto) {
  const el = $("agilExameFisicoDescricao");
  if (!el) return;
  const cur = el.value.trim();
  if (cur.includes(texto)) {
    toast("Este achado já está inserido no exame.");
    return;
  }
  const updated = cur ? `${cur}\n${texto}` : texto;
  el.value = updated;
  syncAgilField("exameFisicoDescricao", updated);
  toast(`Achado inserido: "${texto.slice(0, 32)}..."`);
  atualizarProgressoAgil();
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: HISTÓRICO PERICIAL PREGRESSO DO SERVIDOR
   ========================================================= */
window._ultimoAtendimentoHistorico = null;

async function verificarHistoricoPericiado(cpf) {
  if (!cpf) {
    $("historicoPacienteCard") && ($("historicoPacienteCard").style.display = "none");
    return;
  }
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) {
    $("historicoPacienteCard") && ($("historicoPacienteCard").style.display = "none");
    return;
  }

  try {
    const res = await fetch(`/api/atendimentos?q=${encodeURIComponent(clean)}`, {
      headers: typeof AmbientalAuth !== "undefined" ? AmbientalAuth.headers() : {}
    });
    if (!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    
    // Filtra para remover o atendimento atual
    const anteriores = items.filter(atd => {
      const atdId = atd.id || atd.atendimento || atd._id;
      return String(atdId) !== String(state.atendimento);
    });

    if (anteriores.length > 0) {
      anteriores.sort((a, b) => new Date(b.created_at || b.data_atendimento || 0) - new Date(a.created_at || a.data_atendimento || 0));
      const ultimo = anteriores[0];
      window._ultimoAtendimentoHistorico = ultimo;

      let diasAcumulados = 0;
      const umAnoAtras = new Date();
      umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
      anteriores.forEach(atd => {
        const payload = atd.payload || atd;
        const dtStr = atd.data_atendimento || atd.created_at || payload.dataAtendimento || payload.data_atendimento;
        const dt = dtStr ? new Date(dtStr) : null;
        if (!dt || dt >= umAnoAtras) {
          const d = parseInt(payload.diasConcedidos || payload.aux?.diasConcedidos || payload.diasSolicitados || payload.aux?.diasSolicitados || atd.dias || 0, 10);
          if (!isNaN(d) && d > 0) diasAcumulados += d;
        }
      });
      window._diasHistoricoAcumulado = diasAcumulados;

      const card = $("historicoPacienteCard");
      const dtUltimo = ultimo.data_atendimento || ultimo.created_at || "Data anterior";
      const cidUltimo = ultimo.cid || ultimo.payload?.cid || "Não informado";
      const cargoUltimo = ultimo.cargo || ultimo.payload?.cargo || "";

      if ($("histCardTitulo")) {
        $("histCardTitulo").textContent = `Histórico pericial localizado: Atendimento anterior com CID ${cidUltimo}`;
      }
      if ($("histCardDetalhes")) {
        $("histCardDetalhes").textContent = `Data: ${dtUltimo.slice(0, 10)} ${cargoUltimo ? `• Cargo: ${cargoUltimo}` : ""}${diasAcumulados > 0 ? ` • ${diasAcumulados} dias concedidos no último ano` : ""} • Clique para reaproveitar comorbidades/antecedentes crônicos.`;
      }
      if (card) card.style.display = "block";
    } else {
      window._diasHistoricoAcumulado = 0;
      if ($("historicoPacienteCard")) $("historicoPacienteCard").style.display = "none";
    }
    if (typeof verificarRegraJuntaMedica === "function") verificarRegraJuntaMedica();
  } catch (err) {
    console.warn("Falha ao buscar histórico de atendimentos:", err);
  }
}

function importarAntecedentesHistorico() {
  const atd = window._ultimoAtendimentoHistorico;
  if (!atd) {
    toast("Nenhum atendimento anterior selecionado.");
    return;
  }
  const payload = atd.payload || atd;
  let importados = 0;

  // Importar comorbidades / outras doenças
  const conds = payload.conditions || payload.condicoes || [];
  if (Array.isArray(conds) && conds.length > 0) {
    state.conditions = JSON.parse(JSON.stringify(conds));
    renderConditions();
    state.outrasDoencas = "Sim";
    setRadio("outrasDoencas", "Sim");
    setRadio("agilOutrasDoencas", "Sim");
    $("doencasPanel")?.classList.remove("hidden");
    $("agilDoencasPanel")?.classList.remove("hidden");
    importados += conds.length;
  }

  // Importar medicações contínuas se a lista atual estiver vazia
  const meds = payload.medications || payload.medicamentos || [];
  if (Array.isArray(meds) && meds.length > 0 && state.medications.length === 0) {
    state.medications = JSON.parse(JSON.stringify(meds));
    renderMedications();
    importados += meds.length;
  }

  // Importar histórico pregresso prévio
  const hist = payload.historicoPregresso || payload.aux?.historicoPregresso;
  if (hist && (!state.aux.historicoPregresso || state.aux.historicoPregresso === "Nega")) {
    state.aux.historicoPregresso = hist;
    state.historicoPregresso = hist;
    if ($("agilHistoricoPregresso")) $("agilHistoricoPregresso").value = hist;
    if ($("historicoPregresso")) $("historicoPregresso").value = hist;
    importados++;
  }

  autoSave();
  toast(`Histórico importado: ${importados} item(ns) crônico(s) reaproveitado(s).`);
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: DETECTOR DE COERÊNCIA PERICIAL (Quesitos x Parecer)
   ========================================================= */
function verificarCoerenciaPericial() {
  const agilBox = $("coerenciaParecerAlerta");
  const sec7Box = $("coerenciaParecerAlertaSec7");
  const sec8Box = $("coerenciaParecerAlertaSec8");

  const parecer = state.parecer || getRadio("parecer");
  const q1 = QuesitoService.getAnswer(0);
  const q2 = QuesitoService.getAnswer(1);
  const q3 = QuesitoService.getAnswer(2);
  const limitacao = state.limitacaoFuncional || getRadio("limitacaoFuncional") || getRadio("agilLimitacaoFuncional");

  const inconsistencias = [];

  if (parecer === "CONTRÁRIO") {
    if (q3 === "Sim") {
      inconsistencias.push("🚫 <strong>Contradição Grave:</strong> O <strong>Quesito 3</strong> afirma que a limitação IMPEDE as atividades do rol (<strong>Sim</strong>), mas o parecer pericial está como <strong>CONTRÁRIO</strong>. Atestar impedimento funcional e negar a licença gera vício de nulidade.");
    }
  } else if (parecer === "FAVORÁVEL") {
    if (q3 === "Não") {
      inconsistencias.push("🚫 <strong>Nulidade Técnica:</strong> O <strong>Quesito 3</strong> afirma que a limitação NÃO impede atividades (<strong>Não</strong>), mas o parecer é <strong>FAVORÁVEL</strong>. Sem impedimento funcional, a concessão é tecnicamente nula perante o DPME e e-SISLA.");
    }
    if (q1 === "Não") {
      inconsistencias.push("⚠️ <strong>Divergência:</strong> O <strong>Quesito 1</strong> afirma que NÃO há doença/sequela prévia (<strong>Não</strong>), incompatível com parecer <strong>FAVORÁVEL</strong>.");
    }
    if (q2 === "Não") {
      inconsistencias.push("⚠️ <strong>Divergência:</strong> O <strong>Quesito 2</strong> afirma que a patologia NÃO gera limitações (<strong>Não</strong>), incompatível com parecer <strong>FAVORÁVEL</strong>.");
    }
    if (limitacao === "Não") {
      inconsistencias.push("⚠️ <strong>Incoerência:</strong> Campo 'Limitação Funcional' está marcado como <strong>Não</strong>, divergindo do parecer <strong>FAVORÁVEL</strong>.");
    }
  }

  const allAnswered = (q1 === "Sim" || q1 === "Não") && (q2 === "Sim" || q2 === "Não") && (q3 === "Sim" || q3 === "Não");
  const isError = inconsistencias.length > 0;
  const isHarmonized = allAnswered && !isError && !!parecer;

  let renderHtml = "";
  if (isError) {
    let botoesAcao = "";
    if (parecer === "FAVORÁVEL") {
      botoesAcao = `
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-outline" style="background:#fff;border-color:#F59E0B;color:#B45309;font-weight:700;font-size:11px;padding:4px 10px;cursor:pointer" onclick="aplicarAlinhamentoQuesitos('FAVORAVEL')">⚡ Alinhar Quesitos com Favorável (Sim, Sim, Sim)</button>
          <button type="button" class="btn btn-outline" style="background:#fff;border-color:#CBD5E1;color:#475569;font-weight:600;font-size:11px;padding:4px 10px;cursor:pointer" onclick="aplicarAlinhamentoParecer('CONTRÁRIO')">⚡ Mudar Parecer para CONTRÁRIO</button>
        </div>
      `;
    } else if (parecer === "CONTRÁRIO") {
      botoesAcao = `
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-outline" style="background:#fff;border-color:#F59E0B;color:#B45309;font-weight:700;font-size:11px;padding:4px 10px;cursor:pointer" onclick="aplicarAlinhamentoQuesitos('CONTRARIO')">⚡ Alinhar Quesitos com Contrário (Sim, Sim, Não)</button>
          <button type="button" class="btn btn-outline" style="background:#fff;border-color:#CBD5E1;color:#475569;font-weight:600;font-size:11px;padding:4px 10px;cursor:pointer" onclick="aplicarAlinhamentoParecer('FAVORÁVEL')">⚡ Mudar Parecer para FAVORÁVEL</button>
        </div>
      `;
    }
    renderHtml = `
      <div style="display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:18px">🛡️</span>
        <div style="flex:1">
          <strong style="color:#B45309;font-size:12.5px;display:block;margin-bottom:3px">Aviso de Coerência Pericial DPME (Regras de Ouro e-SISLA):</strong>
          <div style="font-size:12px;color:#92400E;line-height:1.55">${inconsistencias.join("<br>")}</div>
          ${botoesAcao}
        </div>
      </div>
    `;
  } else if (isHarmonized) {
    renderHtml = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:18px">🛡️</span>
        <div>
          <strong style="color:#15803D;font-size:12px">Conformidade e-SISLA Garantida:</strong>
          <span style="font-size:12px;color:#166534">Quesitos (Q1:${q1}, Q2:${q2}, Q3:${q3}) e Parecer (${parecer}) em perfeita coerência jurídica pericial.</span>
        </div>
      </div>
    `;
  }

  [agilBox, sec7Box, sec8Box].forEach(box => {
    if (!box) return;
    if (box === agilBox) {
      box.style.display = "none";
      return;
    }
    if (isError) {
      box.innerHTML = renderHtml;
      box.style.display = "block";
      box.style.background = "#FFFBEB";
      box.style.border = "1.5px solid #FCD34D";
      box.style.color = "#92400E";
    } else if (isHarmonized) {
      box.innerHTML = renderHtml;
      box.style.display = "block";
      box.style.background = "#F0FDF4";
      box.style.border = "1.5px solid #BBF7D0";
      box.style.color = "#166534";
    } else {
      box.style.display = "none";
    }
  });
}

function aplicarAlinhamentoQuesitos(tipo) {
  if (tipo === "FAVORAVEL") {
    QuesitoService.set(0, "Sim");
    QuesitoService.set(1, "Sim");
    QuesitoService.set(2, "Sim");
    state.limitacaoFuncional = "Sim";
    state.limitacaoRol = "Sim";
    setRadio("limitacaoFuncional", "Sim");
    setRadio("limitacaoRol", "Sim");
    setRadio("agilLimitacaoFuncional", "Sim");
    setRadio("agilLimitacaoRol", "Sim");
    toast("Quesitos alinhados para Parecer FAVORÁVEL (Q1: Sim, Q2: Sim, Q3: Sim).");
  } else {
    const isReadap = String(state.readaptado || state.aux?.readaptado || (typeof getRadio === 'function' ? (getRadio("readaptado") || getRadio("agilReadaptado")) : "") || "").trim().toLowerCase() === "sim";
    QuesitoService.set(0, "Sim");
    QuesitoService.set(1, isReadap ? "Sim" : "Não");
    QuesitoService.set(2, "Não");
    state.limitacaoFuncional = isReadap ? "Sim" : "Não";
    state.limitacaoRol = "Não";
    setRadio("limitacaoFuncional", isReadap ? "Sim" : "Não");
    setRadio("limitacaoRol", "Não");
    setRadio("agilLimitacaoFuncional", isReadap ? "Sim" : "Não");
    setRadio("agilLimitacaoRol", "Não");
    toast(`Quesitos alinhados para Parecer CONTRÁRIO (Q1: Sim, Q2: ${isReadap ? "Sim" : "Não"}, Q3: Não).`);
  }
  renderQuesitos();
  verificarCoerenciaPericial();
  atualizarProgressoAgil();
  autoSave();
}

function aplicarAlinhamentoParecer(novoParecer) {
  state.parecer = novoParecer;
  setRadio("parecer", novoParecer);
  if (state.aux) state.aux.parecer = novoParecer;
  if (novoParecer === "FAVORÁVEL") {
    const curLim = state.descLimitacao || state.aux?.descLimitacao || "";
    if (!curLim || isContraryLimitationText(curLim)) {
      const novaLim = (typeof gerarNarrativaLimitacoesMelhoriaContinua === "function") ? gerarNarrativaLimitacoesMelhoriaContinua(state, values()) : "";
      if (novaLim) {
        state.descLimitacao = novaLim;
        if (!state.aux) state.aux = {};
        state.aux.descLimitacao = novaLim;
        if ($("descLimitacao")) $("descLimitacao").value = novaLim;
        if ($("agilSintomasLimitacao")) $("agilSintomasLimitacao").value = novaLim;
      }
    }
  }
  verificarCoerenciaPericial();
  atualizarProgressoAgil();
  autoSave();
  toast(`Parecer alterado para ${novoParecer} para harmonizar com os quesitos.`);
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: MONITOR DE LIMITE DE CARACTERES E-SISLA (2.000 CARACTERES)
   ========================================================= */
const ESISLA_TEXT_FIELDS = [
  { id: "agilDoencaMotivo", max: 2000, label: "Queixa e Duração" },
  { id: "doencaMotivo", max: 2000, label: "Queixa e Duração" },
  { id: "agilHistoricoPregresso", max: 2000, label: "Antecedentes Mórbidos" },
  { id: "historicoPregresso", max: 2000, label: "Antecedentes Mórbidos" },
  { id: "obsDocumentos", max: 2000, label: "Atestado / Relatórios / Exames" },
  { id: "agilExameFisicoDescricao", max: 2000, label: "Exame Físico / Achados" },
  { id: "exameFisicoDescricao", max: 2000, label: "Exame Físico Geral" },
  { id: "alteracoesClinicasExames", max: 2000, label: "Alterações Clínicas / Exames" },
  { id: "agilSintomasLimitacao", max: 2000, label: "Sintomas e Limitações" },
  { id: "sintomasLimitacao", max: 2000, label: "Sintomas / Limitações" },
  { id: "descLimitacao", max: 2000, label: "Descrição da Limitação" },
  { id: "atividadesComprometidas", max: 2000, label: "Atividades Comprometidas" },
  { id: "agilJustificativa", max: 2000, label: "Justificativa Parecer Final" },
  { id: "justificativa", max: 2000, label: "Justificativa Parecer Final" }
];

function atualizarContadorEsisla(id) {
  const el = $(id);
  if (!el) return;
  const cfg = ESISLA_TEXT_FIELDS.find(f => f.id === id) || { max: 2000, label: "Campo" };
  const max = cfg.max || 2000;

  let counter = $(`counter_${id}`);
  if (!counter) {
    counter = document.createElement("div");
    counter.id = `counter_${id}`;
    counter.className = "esisla-char-counter";
    if (el.nextSibling) {
      el.parentNode.insertBefore(counter, el.nextSibling);
    } else {
      el.parentNode.appendChild(counter);
    }
  }

  const val = String(el.value || "");
  const chars = val.length;

  if (chars === 0) {
    counter.innerHTML = `<span style="color:#94A3B8;font-size:11px">0 / ${max.toLocaleString('pt-BR')} caracteres (limite e-SISLA)</span>`;
    counter.style.cssText = "display:flex;align-items:center;margin-top:4px;font-size:11px";
  } else if (chars <= 1700) {
    counter.innerHTML = `<span style="color:#059669;font-size:11px;font-weight:600">✓ ${chars.toLocaleString('pt-BR')} / ${max.toLocaleString('pt-BR')} carac. (e-SISLA)</span>`;
    counter.style.cssText = "display:flex;align-items:center;margin-top:4px;font-size:11px";
  } else if (chars <= max) {
    const restantes = max - chars;
    counter.innerHTML = `<span style="background:#FEF3C7;color:#D97706;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">⚠️ ${chars.toLocaleString('pt-BR')} / ${max.toLocaleString('pt-BR')} carac. (restam ${restantes} carac. para o limite do e-SISLA)</span>`;
    counter.style.cssText = "display:flex;align-items:center;margin-top:4px;font-size:11px";
  } else {
    const excesso = chars - max;
    counter.innerHTML = `
      <span style="background:#FEE2E2;color:#DC2626;border:1px solid #FCA5A5;padding:3px 8px;border-radius:6px;font-size:11.5px;font-weight:800;display:inline-flex;align-items:center;gap:6px">
        🚫 ${chars.toLocaleString('pt-BR')} / ${max.toLocaleString('pt-BR')} carac. (EXCEDE EM +${excesso}! O e-SISLA rejeitará ou truncará no salvamento)
        <button type="button" class="btn btn-outline" style="font-size:10.5px;padding:2px 8px;background:#fff;color:#DC2626;border-color:#F87171;font-weight:700;border-radius:4px;cursor:pointer" onclick="ajustarLimiteEsisla('${id}', ${max})">✂️ Ajustar para ${max.toLocaleString('pt-BR')}</button>
      </span>
    `;
    counter.style.cssText = "display:flex;align-items:center;margin-top:4px;font-size:11px";
  }
}

function ajustarLimiteEsisla(id, max = 2000) {
  const el = $(id);
  if (!el || !el.value) return;
  const original = el.value;
  if (original.length <= max) return;

  let trimmed = original.slice(0, max);
  const lastPeriod = trimmed.lastIndexOf(".");
  if (lastPeriod > max - 150) {
    trimmed = trimmed.slice(0, lastPeriod + 1);
  } else {
    const lastSpace = trimmed.lastIndexOf(" ");
    if (lastSpace > max - 60) {
      trimmed = trimmed.slice(0, lastSpace);
    }
  }

  el.value = trimmed;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  if (typeof autoSave === "function") autoSave();
  atualizarContadorEsisla(id);
  toast(`Texto ajustado para caber no limite de ${max.toLocaleString('pt-BR')} caracteres do e-SISLA.`);
}

function atualizarTodosContadoresEsisla() {
  ESISLA_TEXT_FIELDS.forEach(f => {
    if ($(f.id)) atualizarContadorEsisla(f.id);
  });
}

function initEsislaCharCounters() {
  ESISLA_TEXT_FIELDS.forEach(f => {
    const el = $(f.id);
    if (el) {
      el.removeEventListener("input", el._esislaCharHandler);
      el._esislaCharHandler = () => atualizarContadorEsisla(f.id);
      el.addEventListener("input", el._esislaCharHandler);
      atualizarContadorEsisla(f.id);
    }
  });
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: ALERTA DE JUNTA MÉDICA (REGRA DOS 90 / 180 DIAS)
   ========================================================= */
function verificarRegraJuntaMedica() {
  const agilBox = $("juntaMedicaAlertaAgil");
  const sec8Box = $("juntaMedicaAlertaSec8");

  const diasAtuais = parseInt(state.aux?.diasConcedidos || state.aux?.diasSolicitados || $("agilDiasSolicitados")?.value || $("diasSolicitados")?.value || 0, 10) || 0;
  const diasAcumulados = window._diasHistoricoAcumulado || 0;
  const totalDias = diasAtuais + diasAcumulados;

  if (totalDias < 90) {
    if (agilBox) agilBox.style.display = "none";
    if (sec8Box) sec8Box.style.display = "none";
    return;
  }

  const is180 = totalDias >= 180;
  const headerIcon = is180 ? "🚨" : "🏛️";
  const title = is180 
    ? `ALERTA LEGAL DPME — Afastamento Acumulado Crítico (≥ 180 dias): ${totalDias} dias`
    : `DIRETRIZ DPME / LEI 10.261/68 — Afastamento Prolongado (≥ 90 dias): ${totalDias} dias`;
  const desc = is180
    ? `O servidor acumula <strong>${totalDias} dias</strong> de afastamento (${diasAtuais} dias neste atendimento + ${diasAcumulados} dias anteriores no último ano). O Estatuto dos Funcionários Públicos Civis de SP (Lei nº 10.261/68) e as normas do DPME prescrevem <u>avaliação por Junta Médica</u> para verificação de capacidade laborativa residual ou <strong>Readaptação Funcional</strong>.`
    : `O servidor acumula <strong>${totalDias} dias</strong> de afastamento (${diasAtuais} dias atuais + ${diasAcumulados} dias anteriores). Conforme normas periciais do DPME e Lei 10.261/68, afastamentos a partir de 90 dias recomendam avaliação por <strong>Junta Médica Pericial</strong> para fins de Readaptação Funcional.`;

  const htmlContent = `
    <div style="display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:20px;line-height:1.2">${headerIcon}</span>
      <div style="flex:1">
        <strong style="color:${is180 ? '#991B1B' : '#1E3A8A'};font-size:13px;display:block;margin-bottom:3px">${title}</strong>
        <div style="font-size:12px;color:${is180 ? '#7F1D1D' : '#1E3A8A'};line-height:1.55">${desc}</div>
        <div style="margin-top:8px">
          <button type="button" class="btn btn-outline" style="background:#fff;color:${is180 ? '#991B1B' : '#1E3A8A'};border:1.5px solid ${is180 ? '#F87171' : '#93C5FD'};font-weight:700;font-size:11.5px;padding:5px 12px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px" onclick="aplicarEncaminhamentoJuntaMedica(${totalDias})">
            📋 Aplicar Sugestão de Junta Médica na Justificativa e Capacidade
          </button>
        </div>
      </div>
    </div>
  `;

  const boxStyle = is180 
    ? "display:block;padding:12px 16px;background:#FEF2F2;border:1.5px solid #F87171;border-radius:12px;margin:12px 0;box-shadow:0 2px 8px rgba(220,38,38,0.06)"
    : "display:block;padding:12px 16px;background:#EFF6FF;border:1.5px solid #93C5FD;border-radius:12px;margin:12px 0;box-shadow:0 2px 8px rgba(37,99,235,0.06)";

  if (agilBox) {
    agilBox.innerHTML = htmlContent;
    agilBox.style.cssText = boxStyle;
  }
  if (sec8Box) {
    sec8Box.innerHTML = htmlContent;
    sec8Box.style.cssText = boxStyle;
  }
}

function aplicarEncaminhamentoJuntaMedica(totalDias) {
  state.capacidade = "Cabendo avaliação por Junta Médica para fins de readaptação funcional";
  setRadio("capacidade", state.capacidade);

  const textoJunta = `Em virtude do afastamento prolongado acumulado (${totalDias} dias) e da persistência de limitações funcionais para as atribuições do cargo, sugere-se convocação de Junta Médica Pericial para fins de verificação de capacidade laborativa residual e Readaptação Funcional, nos termos da Lei Estadual nº 10.261/68 e Resolução SGGD 25/2025.`;

  const justEl = $("agilJustificativa");
  const curJust = (justEl ? justEl.value : (state.aux?.justificativa || $("justificativa")?.value || "")).trim();

  let novaJust = "";
  if (!curJust) {
    novaJust = textoJunta;
  } else if (!curJust.includes("Junta Médica") && !curJust.includes("Readaptação Funcional")) {
    novaJust = `${curJust}\n\n[ENCAMINHAMENTO]: ${textoJunta}`;
  } else {
    novaJust = curJust;
  }

  if (justEl) {
    justEl.value = novaJust;
    syncAgilField("justificativa", novaJust);
  }
  if ($("justificativa")) {
    $("justificativa").value = novaJust;
  }
  if (!state.aux) state.aux = {};
  state.aux.justificativa = novaJust;
  state.justificativa = novaJust;

  atualizarTodosContadoresEsisla();
  verificarCoerenciaPericial();
  atualizarProgressoAgil();
  autoSave();

  toast(`Sugestão de Junta Médica / Readaptação (${totalDias} dias) aplicada com sucesso!`);
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: CHECKLIST INTERATIVO DE PENDÊNCIAS
   ========================================================= */
function atualizarProgressoAgil() {
  const badge = $("agilProgressoBadge");
  const icon = $("agilProgressoIcon");
  const txt = $("agilProgressoTexto");
  if (!badge || !txt) return;

  const checks = [
    { label: "Cargo", ok: !!state.aux?.cargo, id: "agilCargo" },
    { label: "Idade", ok: !!state.aux?.idade, id: "agilIdade" },
    { label: "Readaptado", ok: !!state.readaptado, id: "agilReadaptado_Nao" },
    { label: "Doença que motivou o afastamento", ok: !!state.aux?.doencaMotivo, id: "agilDoencaMotivo" },
    { label: "Sintomas e limitações referidos", ok: !!state.aux?.sintomasLimitacao, id: "agilSintomasLimitacao" },
    { label: "CID Principal", ok: !!state.cid, id: "agilCid" },
    { label: "Tipo de exame físico / mental", ok: !!state.exameFisicoTipo, id: "agilExameFisicoTipo" },
    {
      label: "Achados do Exame",
      ok: state.exameFisicoTipo === "Exame Mental" ? !!state.exameMentalResultado :
          state.exameFisicoTipo === "Aparelho Osteomuscular e Tecido Conjutivo" ? (Object.keys(state.osteomuscularRegioes || {}).length > 0 || state.osteomuscularResultado === "Normal") :
          state.exameFisicoTipo === "Outros" ? (!!state.outrosSubtipo && !!state.outrosResultado && !!(state.exameFisicoDescricao || $("agilExameFisicoDescricao")?.value?.trim())) :
          !!(state.exameFisicoDescricao || $("agilExameFisicoDescricao")?.value?.trim()),
      id: "agilExameFisicoDescricao"
    },
    { label: "Justificativa Parecer Final", ok: !!(state.aux?.justificativa || $("agilJustificativa")?.value?.trim()), id: "agilJustificativa" }
  ];

  const total = checks.length;
  const completed = checks.filter(c => c.ok).length;
  const pendentes = checks.filter(c => !c.ok);

  window._itensPendentesAgil = pendentes;

  if (completed === total) {
    badge.style.background = "#DCFCE7";
    badge.style.color = "#15803D";
    badge.style.borderColor = "#86EFAC";
    if (icon) icon.textContent = "✓";
    txt.textContent = "Pronto para finalizar (100%)";
  } else {
    badge.style.background = "#FEF3C7";
    badge.style.color = "#92400E";
    badge.style.borderColor = "#FCD34D";
    if (icon) icon.textContent = "⏳";
    txt.textContent = `${completed}/${total} itens preenchidos (${pendentes.length} pendente${pendentes.length > 1 ? "s" : ""})`;
  }

  atualizarMiniHUD();
}

function toggleProgressoDropdown() {
  const pendentes = window._itensPendentesAgil || [];
  if (pendentes.length === 0) {
    toast("Todos os campos obrigatórios estão preenchidos! Atendimento pronto para finalização.");
    return;
  }
  const lista = pendentes.map(p => `• ${p.label}`).join("\n");
  toast(`Itens pendentes no Modo Ágil:\n${lista}\n\nFocando no primeiro campo...`);
  const primeiro = pendentes[0];
  if (primeiro && $(primeiro.id)) {
    $(primeiro.id).scrollIntoView({ behavior: "smooth", block: "center" });
    try { $(primeiro.id).focus(); } catch (_) {}
  }
}

/* =========================================================
   PRODUTIVIDADE MÉDICA: MINI-HUD FLUTUANTE & ATALHOS DE TECLADO
   ========================================================= */
function atualizarMiniHUD() {
  const hud = $("stickyDoctorHUD");
  if (!hud) return;

  const pacName = state.aux?.nomePaciente || state.nomePaciente || "Servidor não informado";
  const cargoVal = state.aux?.cargo || state.cargo || "--";
  const cidVal = state.cid || state.aux?.cid || "--";
  const parecerVal = state.parecer || "Não definido";

  if ($("hudPaciente")) $("hudPaciente").innerHTML = `Servidor: <strong>${esc(pacName.slice(0, 26))}</strong>`;
  if ($("hudCargo")) $("hudCargo").textContent = `Cargo: ${cargoVal.slice(0, 18)}`;
  if ($("hudCid")) $("hudCid").textContent = `CID: ${cidVal}`;
  
  const hudPar = $("hudParecer");
  if (hudPar) {
    hudPar.textContent = `Parecer: ${parecerVal}`;
    hudPar.className = "hud-parecer " + (parecerVal === "FAVORÁVEL" ? "parecer-fav" : parecerVal === "CONTRÁRIO" ? "parecer-cont" : "");
  }
}

function finalizarAtendimentoHeader() {
  finalizeFromHeader();
}

window.addEventListener("scroll", () => {
  const hud = $("stickyDoctorHUD");
  if (!hud) return;
  if (window.scrollY > 220) {
    hud.style.display = "block";
    atualizarMiniHUD();
  } else {
    hud.style.display = "none";
  }
});
/* =========================================================
   3. DOCUMENTAÇÃO E ATENDIMENTO AO SERVIDOR:
   - COMPROVANTE DE COMPARECIMENTO À PERÍCIA MÉDICA
   - BOOKMARKLET INTELIGENTE DO E-SISLA (ADEUS F12)
   ========================================================= */

function formatarDataPorExtenso(dataStr) {
  if (!dataStr) dataStr = today();
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

function obterDadosComprovanteAtual() {
  syncState();
  const v = values();
  const cidPrincipal = state.aux?.cid || state.cid || $("cid")?.value || $("agilCid")?.value || "";
  const cidDescr = $("cidDescricao")?.textContent || $("descrCidx")?.value || "";
  const horaInicioVal = $("comprovanteHoraEntrada")?.value || state.aux?.horaAtd || v.horaInicio || timeNow();
  let horaSaidaVal = $("comprovanteHoraSaida")?.value;
  if (!horaSaidaVal && horaInicioVal) {
    const partes = horaInicioVal.split(":");
    if (partes.length === 2) {
      let minTotal = parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10) + 40;
      const h = Math.floor(minTotal / 60) % 24;
      const m = minTotal % 60;
      horaSaidaVal = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  if (!horaSaidaVal) horaSaidaVal = timeNow();

  const dataPericiaVal = $("comprovanteDataPericia")?.value || state.aux?.dataAtd || v.dataAtendimento || today();
  const incluirCid = $("comprovanteIncluirCid")?.checked || false;
  const observacoes = $("comprovanteObs")?.value?.trim() || "";

  return {
    protocolo: state.atendimento || v.atendimento || "SEM-PROTOCOLO",
    nomeServidor: state.aux?.nomePaciente || state.nomePaciente || v.nomePaciente || "Servidor(a) não informado",
    cpfServidor: formatCPF(state.aux?.cpfPaciente || state.cpfPaciente || v.cpfPaciente || ""),
    cargo: state.aux?.cargo || state.cargo || v.cargo || "Servidor Público Estadual",
    dataPericia: dataPericiaVal,
    horaEntrada: horaInicioVal,
    horaSaida: horaSaidaVal,
    medicoPerito: state.medico || state.aux?.medicoResponsavel || v.medicoResponsavel || "Médico Perito Oficial",
    crmPerito: state.aux?.crmResponsavel || v.crmResponsavel || "",
    cid: cidPrincipal,
    cidDescricao: cidDescr,
    incluirCid: incluirCid,
    observacoes: observacoes
  };
}

function gerarHTMLComprovanteComparecimento(d) {
  const dataExtenso = formatarDataPorExtenso(d.dataPericia);
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
        <span class="d-val">${esc(formatDate(d.dataPericia) || today())}</span>
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

function atualizarPreviewComprovante() {
  const d = obterDadosComprovanteAtual();
  const box = $("comprovanteLivePreview");
  if (!box) return;

  const dataExtenso = formatarDataPorExtenso(d.dataPericia);
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
      Declaramos que o(a) servidor(a) público(a) <strong>${esc(d.nomeServidor)}</strong>, CPF <strong>${esc(d.cpfServidor || 'não informado')}</strong>, cargo <strong>${esc(d.cargo)}</strong>, compareceu a esta Unidade Pericial Médica Oficial no dia <strong>${esc(formatDate(d.dataPericia))}</strong>, com permanência das <strong>${esc(d.horaEntrada)}</strong> às <strong>${esc(d.horaSaida)}</strong>, para fins de Perícia Médica Oficial (LTS - Art. 191/193 Lei 10.261/68).
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

  const cidBox = $("comprovanteCidBox");
  const cidTexto = $("comprovanteCidTexto");
  if (cidBox && cidTexto) {
    if (d.incluirCid) {
      cidBox.style.display = "block";
      cidTexto.textContent = d.cid ? `${d.cid} ${d.cidDescricao ? '— ' + d.cidDescricao : ''}` : '(Nenhum CID preenchido no atendimento)';
    } else {
      cidBox.style.display = "none";
    }
  }
}

function abrirModalComprovanteComparecimento() {
  syncState();
  const v = values();
  const horaInicio = state.aux?.horaAtd || v.horaInicio || timeNow();
  if ($("comprovanteHoraEntrada")) $("comprovanteHoraEntrada").value = horaInicio;

  // Calcular saída (+45min)
  let horaTermino = "";
  if (horaInicio) {
    const p = horaInicio.split(":");
    if (p.length === 2) {
      const minTot = parseInt(p[0], 10) * 60 + parseInt(p[1], 10) + 45;
      horaTermino = `${String(Math.floor(minTot / 60) % 24).padStart(2, "0")}:${String(minTot % 60).padStart(2, "0")}`;
    }
  }
  if (!horaTermino) horaTermino = timeNow();
  if ($("comprovanteHoraSaida")) $("comprovanteHoraSaida").value = horaTermino;

  if ($("comprovanteDataPericia")) $("comprovanteDataPericia").value = state.aux?.dataAtd || v.dataAtendimento || today();
  if ($("comprovanteIncluirCid")) $("comprovanteIncluirCid").checked = false;
  if ($("comprovanteObs")) $("comprovanteObs").value = "";

  atualizarPreviewComprovante();
  const m = $("modalComprovanteComparecimento");
  if (m) m.classList.add("show");
}

function imprimirComprovante() {
  const d = obterDadosComprovanteAtual();
  const html = gerarHTMLComprovanteComparecimento(d);
  const w = window.open("", "_blank");
  if (!w) {
    toast("O navegador bloqueou a janela de impressão. Permita pop-ups.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

function copiarTextoComprovante() {
  const d = obterDadosComprovanteAtual();
  const dataExtenso = formatarDataPorExtenso(d.dataPericia);
  const cidTexto = d.incluirCid && d.cid
    ? `Diagnóstico informado a pedido expresso do(a) servidor(a): CID ${d.cid}${d.cidDescricao ? ' — ' + d.cidDescricao : ''}\n`
    : `Cláusula de Sigilo Médico Pericial (Resoluções CFM nº 1.658/2002 e 1.851/2008): O diagnóstico é preservado sob sigilo profissional.\n`;

  const texto = `DECLARAÇÃO DE COMPARECIMENTO À PERÍCIA MÉDICA
Governo do Estado de São Paulo — DPME / Ambiental Saúde
Atendimento Nº: ${d.protocolo}

Declaramos, para os devidos fins de comprovação e justificativa funcional junto à repartição de trabalho, que o(a) servidor(a) público(a) ${d.nomeServidor}, portador(a) do CPF ${d.cpfServidor || 'não informado'}, ocupante do cargo de ${d.cargo}, compareceu a esta Unidade Pericial Médica Oficial no dia ${formatDate(d.dataPericia)}, com horário de permanência das ${d.horaEntrada} às ${d.horaSaida}, a fim de submeter-se a Exame Médico-Pericial Oficial para fins de Licença para Tratamento de Saúde (LTS - Art. 191/193 da Lei nº 10.261/1968).

${cidTexto}${d.observacoes ? 'Observações: ' + d.observacoes + '\n' : ''}
São Paulo, ${dataExtenso}.

_____________________________________________
Dr(a). ${d.medicoPerito}
Médico(a) Perito(a) Oficial ${d.crmPerito ? '— CRM: ' + d.crmPerito : ''}
`;

  navigator.clipboard.writeText(texto).then(() => {
    toast("Declaração copiada para a área de transferência com sucesso!");
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Declaração copiada com sucesso!");
  });
}

function gerarCodigoBookmarkletUniversal() {
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
    if(typeof win.calcularIMC==='function'){try{win.calcularIMC();}catch(_){}}
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

function abrirModalBookmarkletAtendimento() {
  const link = $("linkBookmarkletAtendimento");
  if (link) {
    link.href = gerarCodigoBookmarkletUniversal();
  }
  const m = $("modalBookmarkletAtendimento");
  if (m) m.classList.add("show");
}

function copiarCodigoBookmarklet() {
  const url = gerarCodigoBookmarkletUniversal();
  navigator.clipboard.writeText(url).then(() => {
    toast("Código do Favorito copiado! No navegador, crie um novo favorito e cole na URL.");
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Código do Favorito copiado com sucesso!");
  });
}

function detectarSistemaExameFisico(st, aux, texto, cidCode) {
  const exTipo = String(
    st?.exameFisicoTipo || aux?.exameFisicoTipo ||
    st?.agilExameFisicoTipo || aux?.agilExameFisicoTipo ||
    st?.exame_fisico_tipo || aux?.exame_fisico_tipo ||
    ''
  ).trim().toLowerCase();

  const outrosSub = String(
    st?.outrosSubtipo || aux?.outrosSubtipo ||
    st?.areaExameClinico || aux?.areaExameClinico ||
    st?.outros_subtipo || aux?.outros_subtipo ||
    st?.area_exame_clinico || aux?.area_exame_clinico ||
    ''
  ).trim().toLowerCase();

  const exDesc = String(
    st?.exameFisicoDescricao || aux?.exameFisicoDescricao ||
    st?.agilExameFisicoDescricao || aux?.agilExameFisicoDescricao ||
    ''
  ).trim().toLowerCase();

  // 1. Subtipos selecionados quando a opção "Outros" foi detalhada pelo médico (chips das 12 áreas clínicas)
  if (outrosSub.includes('geral') || outrosSub === 'e outros' || outrosSub === 'outros') return 'outro';
  if (outrosSub.includes('osteomuscular') || outrosSub.includes('ortop')) return 'aoal';
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

  // 2. Precedência da seleção principal do médico em "Tipo de exame físico / mental"
  if (exTipo === 'exame mental' || (exTipo.includes('mental') && !exTipo.includes('físic'))) {
    return 'em';
  }
  if (exTipo.includes('osteomuscular') || exTipo.includes('conjutivo') || exTipo.includes('conjuntivo')) {
    return 'aoal';
  }
  if (exTipo.includes('geral') || exTipo === 'outros' || exTipo === 'e outros' || outrosSub === 'e outros' || outrosSub === 'outros' || exTipo.startsWith('outro')) {
    return 'outro';
  }
  // Caso exTipo seja diretamente um dos sistemas específicos (ex: formulário estendido)
  if (exTipo.includes('circulat') || exTipo.includes('cardio')) return 'ac';
  if (exTipo.includes('respirat') || exTipo.includes('pulmon')) return 'ar';
  if (exTipo.includes('pele') || exTipo.includes('fânero') || exTipo.includes('fanero') || exTipo.includes('subcut') || exTipo.includes('dermat')) return 'tcspf';
  if (exTipo.includes('digest') || exTipo.includes('gastr')) return 'ad';
  if (exTipo.includes('genit') || exTipo.includes('urin') || exTipo.includes('renal')) return 'agu';
  if (exTipo.includes('hemolin') || exTipo.includes('hemat')) return 'ahp';
  if (exTipo.includes('endocrin') || exTipo.includes('metabol') || exTipo.includes('diabet')) return 'ae';
  if (exTipo.includes('nervoso') || exTipo.includes('neurol')) return 'sn';
  if (exTipo.includes('sentidos') || exTipo.includes('oftalm') || exTipo.includes('otol')) return 'os';

  // 3. Verificação pelo conteúdo do texto clínico registrado (exame físico padrão / achados)
  const exameFisicoTexto = (String(texto || '').match(/\(\*\)\s*Exame Físico Geral:?\s*\n\s*([\s\S]*?)(?=\n\s*(?:Descrição das Alterações|Descri[çc][ãa]o das Altera[çc][õo]es|\(\*\)Descrição da\(s\) Limitação|\(\*\)Parecer Médico|Limitação|$))/i) || [])[1] || exDesc || '';
  const efLower = exameFisicoTexto.toLowerCase();
  const exameFisicoLinha1 = (String(texto || '').match(/\(\*\)\s*Exame Físico Geral:?\s*\n\s*([^\n\r]+)/i) || [])[1]?.toLowerCase() || '';
  if (exameFisicoLinha1.startsWith('aparelho e outro') || exameFisicoLinha1.startsWith('aparelho outro') || exameFisicoLinha1.startsWith('e outros') || exameFisicoLinha1.includes('outros:') || efLower.includes('bom do estado geral') || efLower.includes('exame físico geral')) {
    return 'outro';
  }
  if (exameFisicoLinha1.includes('osteomuscular') || exameFisicoLinha1.includes('conjutivo') || exameFisicoLinha1.includes('conjuntivo') || efLower.includes('osteomuscular')) return 'aoal';
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
  if (exameFisicoLinha1.includes('outro') || exameFisicoLinha1.includes('geral')) return 'outro';

  // 4. Precedência pelo código CID do atendimento (SOMENTE se não houve escolha médica nem texto específico)
  if (!exTipo && !outrosSub) {
    const c = String(cidCode || '').toUpperCase().trim();
    if (c.startsWith('M')) return 'aoal';
    if (c.startsWith('F')) return 'em';
    if (c.startsWith('I')) return 'ac';
    if (c.startsWith('J')) return 'ar';
    if (c.startsWith('L')) return 'tcspf';
    if (c.startsWith('K')) return 'ad';
    if (c.startsWith('N')) return 'agu';
    if (c.startsWith('D')) return 'ahp';
    if (c.startsWith('E')) return 'ae';
    if (c.startsWith('G')) return 'sn';
    if (c.startsWith('H')) return 'os';
  }

  return 'outro';
}

function cleanQueixaDuracao(text, atdDate) {
  if (!text) return '';
  let t = String(text);

  // Remover vazamento de strings de dicionários Python (ex: [{'dosagem': ...}])
  t = t.replace(/\[\s*\{[\s\S]*?\}\s*\]|\{\s*'(?:dosagem|frequência|frequencia|medicamento|nome|observação|observacao)'[\s\S]*?\}/gi, "");

  // Remove fragmentos órfãos de posologia sem nome de fármaco (ex.: "1 comprimido à noite (dor neuropática) e forte (analgesia de resgate).")
  t = t.replace(/(?:^|[.!?]\s*)(?:1|[2-9]|\d+)\s+comprimidos?\s+[^.!?]*\./gi, ".");
  t = t.replace(/(?:^|[.!?]\s*)(?:em caso de dor\s+)?forte\s*\([^)]*\)\.?/gi, ".");

  const atd = String(atdDate || state?.aux?.dataAtd || $("dataAtd")?.value || today()).trim();
  const atdBr = typeof formatDate === "function" ? formatDate(atd) : "";
  const todayStr = typeof today === "function" ? today() : "";
  const todayBr = typeof formatDate === "function" ? formatDate(todayStr) : "";

  // If there's an artifact start date matching attendance date or today, remove it
  [atdBr, atd, todayBr, todayStr].filter(Boolean).forEach(dt => {
    const escaped = dt.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const rxArtifact = new RegExp(`,?\\s*sendo\\s+que\\s+iniciou-se\\s+seu\\s+tratamento\\s+em\\s+` + escaped, 'gi');
    t = t.replace(rxArtifact, '');
    const rxArtifact2 = new RegExp(`,?\\s*iniciou-se\\s+seu\\s+tratamento\\s+em\\s+` + escaped, 'gi');
    t = t.replace(rxArtifact2, '');
  });

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

  // Deduplicação de frases repetidas de medicação e terapias
  t = t.replace(/(\bEm uso de [^.]+?\.)(?:\s*Em uso de [^.]+?\.)+/gi, "$1");
  t = t.replace(/(Não relatou troca de medicação ou alteração de dosagem\.?)(?:\s*\1)+/gi, "$1");
  t = t.replace(/(Não alegou fazer fisioterapia e psicoterapia\.?)(?:\s*\1)+/gi, "$1");

  // Deduplicação sistemática de frases repetidas ou quase idênticas no parágrafo
  const rawFrases = t.split(/(?<=[.!?])\s+/).map(f => f.trim()).filter(Boolean);
  if (rawFrases.length > 1) {
    const frasesUnicas = [];
    const chavesVistas = [];
    for (const frase of rawFrases) {
      const fNorm = frase.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
      if (fNorm.length < 15) {
        frasesUnicas.push(frase);
        continue;
      }
      let isDup = false;
      for (const cv of chavesVistas) {
        if (fNorm === cv || (cv.length > 40 && (fNorm.includes(cv) || cv.includes(fNorm)))) {
          isDup = true;
          break;
        }
      }
      if (!isDup) {
        chavesVistas.push(fNorm);
        frasesUnicas.push(frase);
      }
    }
    t = frasesUnicas.join(" ");
  }

  t = t.replace(/\s{2,}/g, ' ');
  t = t.replace(/\.\s*\./g, '.');
  t = t.replace(/,\s*,+/g, ',');
  t = t.replace(/\s*,\s*\./g, '.');
  t = t.replace(/\.\s*,/g, '.');
  t = t.replace(/\.\s*([a-zà-ú])/gi, (m, c) => '. ' + c.toUpperCase());
  return t.trim();
}

function copiarLaudoEsislaAtendimento() {
  syncState();
  const v = values();

  // Mapear quesitos e parecer
  const parecerCode = (state.parecer === 'FAVORÁVEL' || state.parecer === 'Favorável') ? 'F' : 'C';
  const isReadap = String(state.readaptado || state.aux?.readaptado || v.readaptado || '').trim().toLowerCase() === 'sim';
  let q1 = 'S';
  let q2 = parecerCode === 'C' ? (isReadap ? 'S' : 'N') : 'S';
  let q3 = parecerCode === 'C' ? 'N' : 'S';

  // 1. Queixa e Duração (max 2000)
  let queixaTexto = state.aux?.queixaDuracao || v.queixaDuracao || '';
  if (!queixaTexto || queixaTexto.length < 80 || queixaTexto === state.aux?.doencaMotivo) {
    queixaTexto = (typeof gerarNarrativaQueixaMelhoriaContinua === "function") ? gerarNarrativaQueixaMelhoriaContinua(state, v) : queixaTexto;
  }
  let cat = sanitizeText(cleanQueixaDuracao(queixaTexto, state.aux?.dataAtd || v.dataAtendimento), 2000);

  // Se houver relatos reais de exames complementares (não boilerplates nem "Em anexo"), integra em queixas conforme solicitado
  const altRaw = String(state.alteracoesClinicasExames || v.alteracoesClinicasExames || '').trim();
  const cleanAltRaw = altRaw.replace(/^(?:em\s+anexo\.?|não\s+foram\s+apresentados[^\n\r]*|nao\s+foram\s+apresentados[^\n\r]*|aus[êeē]ncia\s+de\s+exames[^\n\r]*|nada\s+consta[^\n\r]*|sem\s+exames[^\n\r]*)\s*$/i, '').trim();
  const isSemExamesRaw = /^(?:em\s+anexo\.?|não\s+foram\s+apresentados|nao\s+foram\s+apresentados|aus[êeē]ncia\s+de\s+exames|nada\s+consta|sem\s+exames|n[ãa]o\s+h[áa]\s+exames|n[ãa]o\s+apresentou)/i.test(cleanAltRaw) || /aus[êeē]ncia\s+de\s+exames/i.test(cleanAltRaw);
  if (cleanAltRaw && !cleanAltRaw.toLowerCase().includes('em anexo') && !isSemExamesRaw && cleanAltRaw.length > 5) {
    if (!cat.includes(cleanAltRaw)) {
      cat = sanitizeText((cat ? cat + '\n\n' : '') + 'Exames apresentados: ' + cleanAltRaw, 2000);
    }
  }
  cat = cat.replace(/Exames apresentados:\s*Aus[êeē]ncia[^\n\r]*[\.\,]?/gi, '').trim();
  cat = cat.replace(/Exames apresentados:\s*N[ãa]o foram[^\n\r]*[\.\,]?/gi, '').trim();

  // 2. Antecedentes Mórbidos (max 2000)
  const apVal = (state.aux?.historicoPregresso || v.historicoPregresso || $("agilHistoricoPregresso")?.value || '').trim();
  const fraseNegaCompleta = "Nega antecedentes mórbidos relevantes, cirurgias prévias, neoplasias ou hábitos tabágicos e etilistas.";
  const apFinal = (apVal && !/^nega\.?$/i.test(apVal) && apVal.length > 30)
    ? ((typeof gerarNarrativaAntecedentesMelhoriaContinua === "function") ? gerarNarrativaAntecedentesMelhoriaContinua(state, v) : apVal)
    : ((typeof gerarNarrativaAntecedentesMelhoriaContinua === "function") ? gerarNarrativaAntecedentesMelhoriaContinua(state, v) : fraseNegaCompleta);
  const ap = sanitizeText(apFinal, 2000);

  // 3. Atestado / Relatório / Exames Complementares (Tipo-Data-Resultado) (max 2500)
  // Diretriz oficial e-SISLA: sempre "Em anexo."
  let hda = 'Em anexo.';
  const narratAtd = (typeof gerarNarrativaAtestadoMelhoriaContinua === "function") ? gerarNarrativaAtestadoMelhoriaContinua(state, v) : '';
  if (narratAtd && !narratAtd.includes('condizente com o CID')) {
    hda = narratAtd;
  }

  // 4. Exame Físico Geral / Descrição das Alterações Clínicas e Exames (max 2500)
  // No e-SISLA o campo voMedico.parRlExApres (idExameApres) deve conter exclusivamente os achados do Exame Físico Geral direto
  let exApres = '';
  if (state.fichaEsisla) {
    const m = state.fichaEsisla.match(/\(\*\)\s*Exame Físico Geral:?\s*([\s\S]*?)(?=\n\s*(?:Descrição das Alterações|Descri[çc][ãa]o das Altera[çc][õo]es|\(\*\)Descrição da\(s\) Limitação|\(\*\)Parecer Médico|Limitação|$))/i);
    if (m && m[1].trim()) exApres = m[1].trim();
    if (!exApres) {
      const m2 = state.fichaEsisla.match(/Descrição das Alterações (?:Clínicas|Médicas)?[^:]*:\s*([\s\S]*?)(?=\n\s*(?:\(\*\)Descrição da\(s\) Limitação|\(\*\)Parecer Médico|Limitação|$))/i);
      if (m2 && m2[1].trim()) exApres = m2[1].trim();
    }
  }
  if (!exApres) {
    exApres = (state.exameFisicoDescricao || v.exameFisicoDescricao || '').trim();
  }
  // Remove "Em anexo" boilerplate e prefixos indesejados como "Aparelho E outros:"
  exApres = exApres.replace(/^(?:[\s\r\n]*em\s+anexo\.?[\s\r\n]*)+$/gi, '').trim();
  exApres = exApres.replace(/^\s*(?:Aparelho\s+)?(?:E\s+)?Outros\s*:\s*/i, '').trim();
  exApres = sanitizeText(exApres, 2500);

  // 5. Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) (max 2500)
  let reqExComp = '';
  if (state.fichaEsisla) {
    const m = state.fichaEsisla.match(/\(\*\)Descrição da\(s\) Limitação\(ções\) Física\(s\) e\/ou Mental\(is\) encontrada\(s\):\s*([\s\S]*?)(?=\n\s*(?:\(\*\)Parecer Médico|Nº Dias|$))/i);
    if (m && m[1].trim()) reqExComp = m[1].trim();
  }
  if (!reqExComp) {
    const limList = [v.descLimitacao, v.atividadesComprometidas, v.sintomasLimitacao, v.obsLimitacoes].filter(x => String(x || '').trim());
    reqExComp = limList.join(' | ') || state.aux?.descLimitacao || v.descLimitacao || state.aux?.sintomasLimitacao || v.sintomasLimitacao || '';
  }
  const parecerVal = String(state.parecer || v.parecer || (typeof getRadio === 'function' ? getRadio('parecer') : '') || '').toUpperCase();
  const isFav = parecerVal === 'F' || parecerVal.startsWith('FAV');
  if (isFav && isContraryLimitationText(reqExComp)) {
    reqExComp = (typeof gerarNarrativaLimitacoesMelhoriaContinua === "function") ? gerarNarrativaLimitacoesMelhoriaContinua(state, v) : '';
  } else if (!reqExComp || reqExComp.length < 15) {
    reqExComp = (typeof gerarNarrativaLimitacoesMelhoriaContinua === "function") ? gerarNarrativaLimitacoesMelhoriaContinua(state, v) : reqExComp;
  }
  reqExComp = sanitizeText(reqExComp, 2500);

  // 6. Justificativa Parecer Médico (max 2000)
  let justif = '';
  if (state.fichaEsisla) {
    const m = state.fichaEsisla.match(/\(\*\)Justificativa Parecer Médico\s*:\s*([\s\S]*?)(?=\n\s*(?:\(\*\) Parecer Final|$))/i);
    if (m && m[1].trim()) justif = m[1].trim();
  }
  if (!justif) justif = state.aux?.justificativa || v.justificativa || '';
  if (!justif || justif.length < 25) {
    justif = (typeof gerarNarrativaJustificativaMelhoriaContinua === "function") ? gerarNarrativaJustificativaMelhoriaContinua(state, v) : justif;
  }
  justif = sanitizeText(justif, 2000);

  // 7. CRM e Nome Médico Assistente
  const crmDigits = String(state.aux?.crmCro || v.crmCro || '').replace(/\D/g, '').slice(0, 9);
  const nomeMed = sanitizeText(state.aux?.nomeMedicoAssistente || v.nomeMedicoAssistente || (crmDigits ? `Dr(a). CRM ${crmDigits}` : ''), 60);

  // 8. Pressão Arterial e Pulso
  const paSis = String(state.aux?.pressaoSistolica || v.pressaoSistolica || '').replace(/\D/g, '').slice(0, 3);
  const paDia = String(state.aux?.pressaoDiastolica || v.pressaoDiastolica || '').replace(/\D/g, '').slice(0, 3);
  const pulso = String(state.aux?.pulso || v.pulso || '').replace(/\D/g, '').slice(0, 3);

  // 9. Biotipo
  let altura = state.aux?.altura || $("agilAltura")?.value || '';
  if (altura) {
    let s = String(altura).trim().replace(/[^\d,\.]/g, '');
    if (s.includes('.')) s = s.replace('.', ',');
    else if (!s.includes(',') && s.length >= 3) s = s.slice(0, 1) + ',' + s.slice(1, 3);
    altura = s.slice(0, 4);
  }
  const peso = String(state.aux?.peso || $("agilPeso")?.value || '').replace(/\D/g, '').slice(0, 3);

  // 10. Checkboxes Sistemas (estritamente o sistema escolhido no atendimento, sem marcação inadvertida de Exame Mental)
  const cidCode = (state.aux?.cid || v.cid || '').toUpperCase();
  const sistemaEscolhido = detectarSistemaExameFisico(state, state.aux || v, state.fichaEsisla, cidCode);
  const cb = {
    'voMedico.parEdtcspf': sistemaEscolhido === 'tcspf' ? 'X' : '',
    'voMedico.parEdAc': sistemaEscolhido === 'ac' ? 'X' : '',
    'voMedico.parEdAr': sistemaEscolhido === 'ar' ? 'X' : '',
    'voMedico.parEdAHp': sistemaEscolhido === 'ahp' ? 'X' : '',
    'voMedico.parEdAd': sistemaEscolhido === 'ad' ? 'X' : '',
    'voMedico.parEdAgu': sistemaEscolhido === 'agu' ? 'X' : '',
    'voMedico.parEdAoal': sistemaEscolhido === 'aoal' ? 'X' : '',
    'voMedico.parEdAe': sistemaEscolhido === 'ae' ? 'X' : '',
    'voMedico.parEdSn': sistemaEscolhido === 'sn' ? 'X' : '',
    'voMedico.parEdOs': sistemaEscolhido === 'os' ? 'X' : '',
    'voMedico.parEdEm': sistemaEscolhido === 'em' ? 'X' : '',
    'voMedico.parEdOutro': sistemaEscolhido === 'outro' ? 'X' : ''
  };
  if (!Object.values(cb).some(Boolean) && exApres.trim()) {
    cb['voMedico.parEdOutro'] = 'X';
  }

  // 11. Concessão CIDs
  const cid1 = sanitizeText(state.aux?.cid || v.cid || '', 5);
  const descrCid1 = sanitizeText($("cidDescricao")?.textContent || state.aux?.doencaMotivo || v.doencaMotivo || '', 65);
  const cidsSec = state.cidsSecundarios || v.cidsSecundarios || [];
  let cid2 = '', descrCid2 = '';
  if (Array.isArray(cidsSec) && cidsSec.length > 0) {
    cid2 = sanitizeText(cidsSec[0].codigo || cidsSec[0].cid || '', 5);
    descrCid2 = sanitizeText(cidsSec[0].descricao || cidsSec[0].nome || '', 65);
  }
  let diasSol = String(state.aux?.diasConcedidos || state.aux?.diasSolicitados || v.diasSolicitados || '').replace(/\D/g, '').slice(0, 3);
  if (parecerVal === 'C') {
    diasSol = '0';
  } else if (parecerVal === 'F' && (!diasSol || diasSol === '0')) {
    diasSol = '1';
  }
  const dtIniSol = formatDate(state.aux?.dataDocumento || v.dataDocumento || today());

  const camposEsisla = {
    'voMedico.parRlCat': cat,
    'voMedico.parRlAp': ap,
    'voMedico.parRlHda': hda,
    'voMedico.parRlExApres': exApres,
    'voMedico.parRlReqExComp': reqExComp,
    'voMedico.parRlComp': justif,
    'voResult.numCrm': '',
    'voResult.strNomeMedico': nomeMed,
    'voMedico.lgPressArterialMax': paSis,
    'voMedico.lgPressArterialMin': paDia,
    'voMedico.lgPulsacao': pulso,
    'voMedico.lgAltura': altura,
    'voMedico.lgPeso': peso,
    'lgPressArterialMax': paSis,
    'lgPressArterialMin': paDia,
    'lgPulsacao': pulso,
    'lgAltura': altura,
    'lgPeso': peso,
    'fl_d_prev': q1,
    'fl_limit': q2,
    'fl_imped': q3,
    'voResult.voParecerFinal.flPfinal': parecerVal,
    'voResult.voParecerFinal.qtDiasPm': diasSol,
    'voResult.voParecerFinal.dtIniPm': dtIniSol,
    'cdCidPm': cid1,
    'nmCidPm': descrCid1,
    'cdCid2Pm': cid2,
    'voResult.voParecerFinal.nmCidPm2': descrCid2,
    'voResult.voParecerFinal.cdCidPm': cid1,
    'voResult.voParecerFinal.nmCidPm': descrCid1,
    'voResult.voParecerFinal.cdCid2Pm': cid2,
    'voResult.voParecerFinal.nmCid2Pm': descrCid2,
    ...cb
  };

  const payload = {
    protocolo: state.atendimento || v.atendimento || "SEM-PROTOCOLO",
    servidor: state.aux?.nomePaciente || state.nomePaciente || v.nomePaciente || "",
    cpf: state.aux?.cpfPaciente || state.cpfPaciente || v.cpfPaciente || "",
    ...camposEsisla,
    campos_esisla: camposEsisla,
    timestamp: new Date().toISOString()
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  try {
    localStorage.setItem('ambiental_esisla_current_payload', jsonStr);
    window.postMessage({ type: 'AMBIENTAL_ESISLA_PAYLOAD', payload: payload }, '*');
  } catch(_) {}

  navigator.clipboard.writeText(jsonStr).then(() => {
    toast("⚡ Dados do Laudo sincronizados com a Extensão e-SISLA! Na aba do e-SISLA, basta clicar em '⚡ Preencher'.");
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = jsonStr;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("⚡ Dados do Laudo sincronizados com a Extensão e-SISLA! Na aba do e-SISLA, basta clicar em '⚡ Preencher'.");
  });
}

window.addEventListener("keydown", (e) => {
  // Ctrl + S (ou Cmd + S): Salvar rascunho
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveNow();
    return;
  }

  // Ctrl + Enter: Finalizar atendimento
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    if (typeof currentAttendanceMode !== "undefined" && currentAttendanceMode === "agil") {
      finalizarAtendimentoAgil();
    } else {
      finalizeFromHeader();
    }
    return;
  }

  // Alt + G: Inserir texto padrão de Exame Físico Geral
  if (e.altKey && e.key.toLowerCase() === "g") {
    e.preventDefault();
    inserirExameFisicoGeralPadrao();
    return;
  }

  // Alt + J: Gerar Justificativa com IA
  if (e.altKey && e.key.toLowerCase() === "j") {
    e.preventDefault();
    if ($("btnAgilJustificativaIA") && $("btnAgilJustificativaIA").style.display !== "none") {
      gerarJustificativaAgilIA();
    } else if (typeof gerarJustificativaIA === "function") {
      gerarJustificativaIA();
    }
    return;
  }
});
