(() => {
  'use strict';
  let profile = null, records = [], dashboard = null;
  let currentPage = 1, pageSize = 40, totalPages = 1, totalItems = 0;
  let activeQuickRecord = null;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const todayISO = () => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  };
  const dateDisplay = v => {
    if (!v) return 'Data não informada';
    const s = String(v).slice(0, 10);
    const p = s.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
  };
  const cleanUnidade = u => {
    if (!u) return '';
    const s = String(u).trim();
    const parts = s.split(/\s*-\s*/);
    if (parts.length > 1 && /^\d+$/.test(parts[0])) {
      return parts.slice(1).join(' - ');
    }
    return s;
  };
  const payload = r => (r?.payload && typeof r.payload === 'object') ? r.payload : (r || {});
  const aux = r => payload(r).aux || {};
  const atdDate = r => String(aux(r).dataAtd || payload(r).data_atendimento || '').slice(0, 10);
  const atdTime = r => String(aux(r).horaAtd || payload(r).hora_atendimento || '').slice(0, 5);
  const statusLabel = s => ({
    RASCUNHO: 'Rascunho',
    EM_REVISÃO: 'Em revisão',
    FINALIZADO: 'Finalizado',
    ARQUIVADO: 'Arquivado',
    REABERTO: 'Reaberto',
    PENDENTE: 'Pendente'
  }[s] || 'Em andamento');
  const statusClass = s => s === 'FINALIZADO' ? 'green' : (s === 'EM_REVISÃO' || s === 'REABERTO') ? 'blue' : s === 'ARQUIVADO' ? 'red' : (s === 'RASCUNHO' || s === 'PENDENTE') ? 'amber' : '';
  const isPending = r => r.status !== 'FINALIZADO' && r.status !== 'ARQUIVADO' && (r.status === 'PENDENTE' || Number(r.alertas || 0) > 0 || Number(r.inconsistencias || 0) > 0 || Number(r.completude || 0) < 100 || r.status === 'RASCUNHO');
  const showToast = (m) => window.AmbientalUtils?.toast ? window.AmbientalUtils.toast(m, 3200) : alert(m);
  const initials = n => {
    const a = String(n || 'Usuário').split(/\s+/).filter(Boolean);
    return (a[0]?.[0] || 'A') + (a.length > 1 ? (a[a.length - 1]?.[0] || 'M') : 'M');
  };
  const openRecord = r => {
    const id = r?.atendimento || r?.id;
    if (!id) { showToast('Atendimento não identificado.'); return; }
    const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
    const q = impId ? `&medico_id=${encodeURIComponent(impId)}` : '';
    location.href = '/app?atendimento=' + encodeURIComponent(id) + q;
  };
  
  function updateSyncLoader(title, sub, msg, pct) {
    const elTitle = $('syncTitle');
    const elDesc = $('syncDesc');
    const elMsg = $('syncStatusMsg');
    const elBar = $('syncProgressFill');
    if (elTitle && title) elTitle.textContent = title;
    if (elDesc && sub) elDesc.textContent = sub;
    if (elMsg && msg) elMsg.textContent = msg;
    if (elBar && pct !== undefined) elBar.style.width = Math.min(100, Math.max(5, pct)) + '%';
  }

  function setView(view) {
    document.querySelectorAll('[id^="view-"]').forEach(x => x.hidden = x.id !== `view-${view}`);
    document.querySelectorAll('.nav button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleSidebar(forceState) {
    const shell = $('appShell');
    if (!shell) return;
    const willExpand = typeof forceState === 'boolean' ? forceState : !shell.classList.contains('sidebar-expanded');
    shell.classList.toggle('sidebar-expanded', willExpand);
    const edgeBtn = $('sidebarEdgeToggleBtn');
    if (edgeBtn) {
      edgeBtn.title = willExpand ? 'Recolher menu lateral' : 'Expandir menu lateral';
      edgeBtn.setAttribute('aria-label', edgeBtn.title);
      const expSvg = edgeBtn.querySelector('.toggle-icon-expand');
      const colSvg = edgeBtn.querySelector('.toggle-icon-collapse');
      if (expSvg && colSvg) {
        expSvg.style.display = willExpand ? 'none' : 'block';
        colSvg.style.display = willExpand ? 'block' : 'none';
      }
    }
  }
  window.toggleSidebar = toggleSidebar;
  
  function setIdentity() {
    const isImpersonating = !!sessionStorage.getItem('ambiental.impersonate_medico_id') && 
      (['Administrador', 'Gestor', 'Coordenador'].includes(profile?.perfilOriginal) || ['Administrador', 'Gestor', 'Coordenador'].includes(profile?.perfil));
    const cachedNome = sessionStorage.getItem('ambiental.impersonate_medico_nome');
    const cachedCrm = sessionStorage.getItem('ambiental.impersonate_medico_crm');
    const n = (isImpersonating && cachedNome) ? cachedNome : (profile?.nome || profile?.email || 'Usuário');
    const crm = (isImpersonating && cachedCrm) ? cachedCrm : (profile?.crm || '');
    $('userName').textContent = n;
    $('userRole').textContent = isImpersonating ? `Médico (Acesso Adm${crm ? ' · CRM ' + crm : ''})` : (profile?.perfil || 'Médico');
    $('avatar').textContent = initials(n);
    const h = new Date().getHours();
    $('greeting').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ', ' + n.split(' ')[0] + '.';
    if (['Administrador', 'Gestor', 'Coordenador', 'Revisor', 'Consulta'].includes(profile?.perfil) || profile?.perfilOriginal === 'Administrador' || isImpersonating) {
      $('goAdmin').hidden = false;
    }
  }
  
  function renderKpis() {
    const s = dashboard?.stats || {};
    const today = todayISO();
    const todayCount = records.filter(r => atdDate(r) === today).length;
    const progress = records.filter(r => ['RASCUNHO', 'REABERTO', 'PENDENTE'].includes(r.status) || r.status === 'EM_REVISÃO').length;
    const pending = records.filter(isPending).length;
    $('kToday').textContent = todayCount;
    $('kTodayMeta').textContent = todayCount === 1 ? '1 atendimento para hoje' : 'Atendimentos para hoje';
    $('kProgress').textContent = progress;
    $('kPending').textContent = pending;
    $('kDone').textContent = s.finalizados ?? records.filter(r => r.status === 'FINALIZADO').length;
    $('kAlerts').textContent = s.alertas ?? records.reduce((a, r) => a + Number(r.alertas || 0), 0);
    $('productivityLabel').textContent = (records.length || 0) + ' registros';
  }
  
  function renderBars() {
    const rows = Array.isArray(dashboard?.ultimos_7_dias) ? dashboard.ultimos_7_dias : [];
    const byDay = new Map(rows.map(x => [String(x.dia).slice(0, 10), Number(x.total || 0)]));
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      labels.push({ iso, label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase() });
    }
    const counts = labels.map(x => byDay.get(x.iso) || 0);
    const max = Math.max(...counts, 1);
    $('bars').innerHTML = labels.map((d, i) => {
      const count = counts[i];
      const hasValue = count > 0;
      const pct = hasValue ? Math.max(12, Math.round((count / max) * 100)) : 0;
      const isToday = i === 6;
      return `
        <div class="bar-col${isToday ? ' today' : ''}${hasValue ? ' has-val' : ' is-zero'}">
          <div class="bar-wrap">
            ${hasValue ? `
              <div class="bar" style="height:${pct}%" data-count="${count}" title="${count} atendimento(s) em ${d.label}"></div>
            ` : `
              <div class="bar bar-empty" style="height:2px" title="Nenhum atendimento em ${d.label}"></div>
            `}
          </div>
          <strong class="${hasValue ? 'active-count' : 'zero-count'}">${count}</strong>
          <span class="day-lbl">${d.label}</span>
        </div>
      `;
    }).join('');
  }
  
  function renderDonut() {
    const rows = Array.isArray(dashboard?.por_status) ? dashboard.por_status : [];
    const get = s => Number(rows.find(x => x.status === s)?.total || 0);
    const counts = { FINALIZADO: get('FINALIZADO'), ARQUIVADO: get('ARQUIVADO'), PENDENTE: get('PENDENTE') };
    const total = Number(dashboard?.stats?.total || 0);
    counts.ATIVO = Math.max(0, total - counts.FINALIZADO - counts.ARQUIVADO);
    $('donutTotal').textContent = total;
    const vals = [counts.FINALIZADO, counts.ATIVO, counts.PENDENTE, counts.ARQUIVADO];
    const sum = Math.max(vals.reduce((a, b) => a + b, 0), 1);
    let a = 0;
    const c = ['#059669', 'var(--brand-blue)', '#d97706', '#cbd5e1'];
    const stops = vals.map((v, i) => {
      const start = a / sum * 100;
      a += v;
      return `${c[i]} ${start}% ${a / sum * 100}%`;
    }).join(',');
    $('donut').style.background = `conic-gradient(${stops})`;
    const pct = v => total > 0 ? `${Math.round((v / total) * 100)}%` : '0%';
    $('legend').innerHTML = `
      <div class="legend-row"><span><i class="dot g"></i>Finalizados</span><div class="legend-vals"><b>${counts.FINALIZADO}</b><small>${pct(counts.FINALIZADO)}</small></div></div>
      <div class="legend-row"><span><i class="dot"></i>Em andamento</span><div class="legend-vals"><b>${counts.ATIVO}</b><small>${pct(counts.ATIVO)}</small></div></div>
      <div class="legend-row"><span><i class="dot a"></i>Pendentes</span><div class="legend-vals"><b>${counts.PENDENTE}</b><small>${pct(counts.PENDENTE)}</small></div></div>
      <div class="legend-row"><span><i class="dot n"></i>Arquivados</span><div class="legend-vals"><b>${counts.ARQUIVADO}</b><small>${pct(counts.ARQUIVADO)}</small></div></div>
    `;
  }
  
  function rowHtml(r) {
    const id = esc(r.atendimento || r.id);
    const p = payload(r);
    const a = aux(r);
    const name = r.nomePaciente || r.paciente_nome || p.nomePaciente || a.nomePaciente || '';
    const displayTitle = name ? esc(name) : `Atendimento #${esc(a.protocolo || p.protocolo || id.slice(0, 8))}`;
    const proto = a.protocolo || p.protocolo || '';
    const unid = cleanUnidade(r.unidade || a.unidade || p.unidade || '');
    const cidVal = r.cid || a.cid || p.cid || '';
    const dataVal = dateDisplay(atdDate(r));
    const horaVal = atdTime(r);
    const hasFicha = Boolean(String(r.ficha_esisla || p.ficha_esisla || a.fichaEsisla || a.ficha_esisla || '').trim().length > 40);
    return `<div class="row">
      <div class="row-main">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b>${displayTitle}</b>
          ${proto ? `<span class="badge" style="font-size:9.5px;padding:2px 7px;font-weight:700">#${esc(proto)}</span>` : ''}
          ${hasFicha ? `<span class="badge green" style="font-size:9px;padding:2px 7px;font-weight:800" title="Ficha e-Sisla já gerada e salva">✓ e-Sisla Salva</span>` : ''}
        </div>
        <span>${esc(dataVal)}${horaVal ? ' · ' + esc(horaVal) : ''}${unid ? ' · ' + esc(unid) : ''}${cidVal ? ' · CID: ' + esc(cidVal) : ''}</span>
      </div>
      <span class="badge ${statusClass(r.status)}"><i class="dot"></i>${esc(statusLabel(r.status))}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-esisla-doc ${hasFicha ? 'saved' : ''}" type="button" data-esisla="${id}" title="${hasFicha ? 'Abrir Ficha e-Sisla já gerada (sem recriação)' : 'Gerar Ficha e-Sisla oficial deste atendimento'}">${hasFicha ? '✓ Ficha e-Sisla' : '📋 Ficha e-Sisla'}</button>
        <button class="btn-sm" type="button" data-preview="${id}">Visualizar</button>
        <button class="open-link" type="button" data-open="${id}">Abrir</button>
      </div>
    </div>`;
  }
  
  function wireButtons(scope = document) {
    scope.querySelectorAll('[data-open]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const openId = b.dataset.open;
      const r = records.find(x => String(x.atendimento || x.id) === String(openId)) || { atendimento: openId, id: openId };
      openRecord(r);
    });
    scope.querySelectorAll('[data-preview]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      openQuickView(b.dataset.preview);
    });
    scope.querySelectorAll('[data-esisla]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      openDoctorEsisla(b.dataset.esisla, false);
    });
  }

  window.currentDoctorEsislaId = null;
  window.currentDoctorEsislaRecord = null;
  window.currentDoctorEsislaMode = 'blocos';

  function normalizeDoctorRecordForEsisla(r) {
    const p = (r?.payload && typeof r.payload === 'object') ? r.payload : (r || {});
    const a = p?.aux || r?.aux || {};
    const atdKey = String(r?.atendimento || r?.id || p?.atendimento || a?.atendimento || '');
    const agendaItem = (typeof currentDoctorAgenda !== 'undefined' && Array.isArray(currentDoctorAgenda))
      ? currentDoctorAgenda.find(x => String(x.atd_existente_numero || x.atd_existente_id || x.protocolo || '') === atdKey)
      : null;
    const resolvedNome = p?.nomePaciente || a?.nomePaciente || r?.nomePaciente || r?.paciente_nome || p?.paciente || a?.paciente || r?.paciente || agendaItem?.nome_periciado || '';
    const resolvedCpf = p?.cpfPaciente || a?.cpfPaciente || r?.cpfPaciente || r?.paciente_cpf || p?.cpf || a?.cpf || '';
    const resolvedProto = a?.protocolo || p?.protocolo || r?.protocolo || a?.agenda_protocolo || agendaItem?.protocolo || '';
    const resolvedNi = a?.ni || p?.ni || r?.ni || agendaItem?.ni || '';
    return {
      ...r,
      ...p,
      ...a,
      aux: {
        ...a,
        ...(p.aux || {}),
        nomePaciente: resolvedNome,
        cpfPaciente: resolvedCpf,
        protocolo: resolvedProto,
        ni: resolvedNi
      },
      atendimento: r?.atendimento || p?.atendimento || a?.atendimento || r?.id,
      protocolo: resolvedProto,
      ni: resolvedNi,
      nomePaciente: resolvedNome,
      paciente_nome: resolvedNome,
      cpfPaciente: resolvedCpf,
      exameFisicoTipo: p?.exameFisicoTipo || a?.exameFisicoTipo || p?.agilExameFisicoTipo || r?.exameFisicoTipo || '',
      outrosSubtipo: p?.outrosSubtipo || a?.outrosSubtipo || p?.areaExameClinico || a?.areaExameClinico || r?.outrosSubtipo || '',
      areaExameClinico: p?.areaExameClinico || a?.areaExameClinico || p?.outrosSubtipo || a?.outrosSubtipo || r?.areaExameClinico || '',
      outrosResultado: p?.outrosResultado || a?.outrosResultado || p?.resultadoAvaliacao || a?.resultadoAvaliacao || r?.outrosResultado || '',
      resultadoAvaliacao: p?.resultadoAvaliacao || a?.resultadoAvaliacao || p?.outrosResultado || a?.outrosResultado || r?.resultadoAvaliacao || '',
      exameFisicoDescricao: p?.exameFisicoDescricao || a?.exameFisicoDescricao || p?.agilExameFisicoDescricao || a?.agilExameFisicoDescricao || r?.exameFisicoDescricao || '',
      historicoPregresso: p?.historicoPregresso || a?.historicoPregresso || p?.agilHistoricoPregresso || a?.agilHistoricoPregresso || r?.historicoPregresso || '',
      antecedentes: p?.antecedentes || a?.antecedentes || p?.historicoPregresso || a?.historicoPregresso || r?.antecedentes || '',
      altura: p?.altura || a?.altura || p?.agilAltura || a?.agilAltura || p?.biotipoAltura || r?.altura || '',
      peso: p?.peso || a?.peso || p?.agilPeso || a?.agilPeso || p?.biotipoPeso || r?.peso || '',
      pressaoSistolica: p?.pressaoSistolica || a?.pressaoSistolica || r?.pressaoSistolica || '',
      pressaoDiastolica: p?.pressaoDiastolica || a?.pressaoDiastolica || r?.pressaoDiastolica || '',
      pulso: p?.pulso || a?.pulso || r?.pulso || '',
      descLimitacao: p?.descLimitacao || a?.descLimitacao || r?.descLimitacao || '',
      justificativa: p?.justificativa || a?.justificativa || p?.agilJustificativa || a?.agilJustificativa || r?.justificativa || '',
      parecer: p?.parecer || a?.parecer || r?.parecer || '',
      cid: p?.cid || a?.cid || r?.cid || '',
      diasSolicitados: p?.diasSolicitados || a?.diasSolicitados || r?.diasSolicitados || '',
      dataExpedicao: p?.dataExpedicao || a?.dataExpedicao || p?.data_expedicao || a?.data_expedicao || r?.dataExpedicao || '',
      ficha_esisla: p?.ficha_esisla || a?.fichaEsisla || a?.ficha_esisla || r?.ficha_esisla || ''
    };
  }

  function normalizarTextoFichaEsisla(text) {
    if (!text) return '';
    let str = String(text);
    if (str.includes('\\n') && !str.includes('\n')) {
      str = str.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
    }
    // Recompõe frase caso tenha sofrido quebra acidental antes de "antecedentes mórbidos" no meio do parágrafo
    str = str.replace(/\b(Nega(?:\s+demais|\s+outros)?|Sem)\s*[\r\n]+\s*(antecedentes\s+m[óo]rbidos)\b/gi, '$1 $2');
    str = str.replace(/\b([Cc])irosse\b/g, (_, c) => c === 'C' ? 'Cirrose' : 'cirrose');

    const secoes = [
      'Identificação do Servidor e Vínculo:',
      '\\(\\*\\)\\s*Queixa e Duração:?',
      'Atestado/Relatório/Exames Complementares:?',
      'Atestado/Relatório e Exames Complementares:?',
      'Atestado/Relatório:',
      'Pressão Arterial(?=\\s*(?:\\r?\\n|\\s)*Sist[óo]lica)',
      'Sistólica\\s*\\(mmHg\\):',
      'Diastólica\\s*\\(mmHg\\):',
      'Pulso\\s*\\(bpm\\):',
      'Altura:',
      'Peso:',
      '\\(\\*\\)\\s*Exame Físico Geral:?',
      'Descrição das Alterações Clínicas e Exames Complementares:',
      'Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares:',
      'Descrição das Alterações Clínicas:',
      'Descrição das Alterações Médicas:',
      '\\(\\*\\)\\s*Descrição da\\(s\\)\\s*Limitação\\(ções\\)\\s*Física\\(s\\)\\s*e/ou\\s*Mental\\(is\\)\\s*encontrada\\(s\\):?',
      '\\(\\*\\)\\s*Descrição da\\(s\\)\\s*Limitação:?',
      '\\(\\*\\)\\s*Parecer Médico:?',
      'Parecer:\\s*(?:FAVORÁVEL|CONTRÁRIO|FAVORAVEL|CONTRARIO)',
      'Dias concedidos:',
      'Nº Dias:',
      'Data Início:',
      'Data de início:',
      'CID-?10 principal:',
      'CID\\s*10:',
      'Descrição:',
      'CID-?10 secundário:',
      'Descrição Secundária:',
      'Médico Perito:',
      'CRM:',
      'Dt/Hr Perícia:',
      'Data e hora da perícia:',
      '\\(\\*\\)\\s*Resposta aos quesitos:?',
      '\\(\\*\\)\\s*Justificativa Parecer Médico:?',
      '\\(\\*\\)\\s*Parecer Final:?'
    ];
    for (const h of secoes) {
      const rx = new RegExp('([^\n\r])[ \\t]+(' + h + ')', 'gi');
      str = str.replace(rx, '$1\n\n$2');
    }
    // Cabeçalho Antecedentes Mórbidos: só separa quando possui dois-pontos e não faz parte de "Nega demais antecedentes mórbidos"
    str = str.replace(/([^\n\r])[ \t]+(Antecedentes\s+M[óo]rbidos\s*:)/gi, (full, prev, hdr, offset, s) => {
      const before = s.slice(Math.max(0, offset - 20), offset + 1).toLowerCase();
      if (/(?:demais|outros|nega|sem)\s*$/.test(before)) return full;
      return prev + '\n\n' + hdr;
    });
    // Garante ponto final no encerramento de Antecedentes Mórbidos antes de Atestado/Relatório
    str = str.replace(/(\nAntecedentes\s+M[óo]rbidos:?\s*\n)([\s\S]*?)(\n\s*Atestado\/Relat[óo]rio)/i, (_, h1, body, h2) => {
      let b = String(body || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (b && !/[.!?]$/.test(b)) b += '.';
      return h1 + b + '\n\n' + h2.trimStart();
    });
    str = str.replace(/^(M[ée]dico\s*Perito:[ \t]*[^\r\n]*?)\s*-\s*$/gmi, '$1');
    str = str.replace(/^(CRM:[ \t]*[^\r\n]+)\r?\n(?:CRM:[ \t]*[^\r\n]+\r?\n?)+/gmi, '$1\n');
    str = str.replace(/(membro\s+inferior\s+(?:direito|esquerdo))\s+sinais\s+de\s+radiculopatia/gi, '$1, com sinais de radiculopatia');
    str = str.replace(/,?\s*atividades\s+inerentes\s+ao\s+cargo\s+de\s+[^,.]+?,?\s*atividades\s+estas\s+constantes\s+no\s+Rol\s+de\s+Atividades\s+do\s+cargo\s+de\s+([^,.]+)\.?/gi, ', atividades estas constantes no Rol de Atividades do cargo de $1.');
    return str.replace(/\n{3,}/g, '\n\n').trim();
  }

  function extractSectionDoctorEsisla(text, startHeaders, endHeaders) {
    const raw = String(text || '');
    if (!raw) return '';
    const str = normalizarTextoFichaEsisla(raw);
    const starts = Array.isArray(startHeaders) ? startHeaders : [startHeaders];
    const ends = Array.isArray(endHeaders) ? endHeaders : (endHeaders ? [endHeaders] : []);
    const escRx = s => String(s).replace(/:+$/, '').trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\\(\\\*\\\)\s*/g, '\\(\\s*\\*\\s*\\)\\s*');
    const startPat = '(?:[\\r\\n]|^)\\s*(?:' + starts.map(escRx).join('|') + ')[^\\r\\n:]*:?';
    const endPat = ends.length ? '(?=(?:[\\r\\n]|^)\\s*(?:' + ends.map(escRx).join('|') + ')[^\\r\\n:]*:?)' : '(?=$)';
    const rx = new RegExp(startPat + '\\s*([\\s\\S]*?)\\s*' + endPat, 'i');
    const m = str.match(rx);
    return m ? m[1].trim() : '';
  }

  window.copyDoctorEsislaBlock = async function(btn, customText) {
    let textToCopy = customText;
    if (typeof textToCopy !== 'string' || !textToCopy.trim()) {
      const card = btn?.closest('.doc-esisla-card');
      const bodyEl = card?.querySelector('.doc-esisla-card-body');
      textToCopy = bodyEl ? (bodyEl.innerText || bodyEl.textContent || '') : '';
    }
    textToCopy = String(textToCopy || '').trim();
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = textToCopy;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
    if (btn) {
      const old = btn.innerHTML;
      btn.innerHTML = '✓ Copiado';
      btn.style.background = '#ecfdf5';
      btn.style.color = '#047857';
      btn.style.borderColor = '#a7f3d0';
      setTimeout(() => {
        btn.innerHTML = old;
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 1800);
    }
    try {
      const full = $('doctorEsislaText')?.value || textToCopy;
      if (typeof sincronizarFichaComExtensaoDoctor === 'function') {
        sincronizarFichaComExtensaoDoctor(full, window.currentDoctorEsislaRecord, window.currentDoctorEsislaId, false);
      }
    } catch (_) {}
    showToast('Bloco copiado para a área de transferência.');
  };

  window.updateDoctorEsislaStats = function(text) {
    const str = String(text || '');
    const chip = $('doctorEsislaStatsChip');
    if (chip) {
      const norm = normalizarTextoFichaEsisla(str);
      const lines = norm ? norm.split('\n').filter(l => l.trim().length > 0).length : 0;
      chip.textContent = `${str.length.toLocaleString('pt-BR')} caracteres · ${lines} linhas`;
    }
  };

  window.renderDoctorEsislaBlocos = function(textoFicha) {
    const container = $('doctorEsislaBlocosContainer');
    if (!container) return;
    const raw = String(textoFicha || '').trim();
    if (!raw) {
      container.innerHTML = '<div class="empty">Nenhum conteúdo disponível para exibir em blocos.</div>';
      return;
    }
    const str = normalizarTextoFichaEsisla(raw);
    const r = window.currentDoctorEsislaRecord || {};
    const p = payload(r);
    const a = aux(r);

    let ident = extractSectionDoctorEsisla(str, ['Identificação do Servidor e Vínculo', 'Identificação do Servidor'], ['(*) Queixa e Duração', 'Queixa e Duração']);
    if (!ident) {
      const nomeServ = p.nomePaciente || a.nomePaciente || r.nomePaciente || r.paciente_nome || '';
      const cargoServ = p.cargo || a.cargo || r.cargo || '';
      const idadeServ = p.idade || a.idade || r.idade || '';
      const protoServ = a.protocolo || p.protocolo || r.protocolo || '';
      if (nomeServ) {
        ident = `Servidor(a): ${nomeServ}` + (cargoServ ? `\nCargo: ${cargoServ}` : '') + (idadeServ ? ` | Idade: ${idadeServ} anos` : '') + (protoServ ? `\nProtocolo: ${protoServ}` : '');
      }
    }

    const queixa = extractSectionDoctorEsisla(str, ['(*) Queixa e Duração', 'Queixa e Duração'], ['Antecedentes Mórbidos']) || p.queixaDuracao || a.queixaDuracao || '';
    const antecedentes = extractSectionDoctorEsisla(str, ['Antecedentes Mórbidos'], ['Atestado/Relatório e Exames Complementares', 'Atestado/Relatório/Exames Complementares', 'Atestado/Relatório', 'Pressão Arterial']) || p.historicoPregresso || a.historicoPregresso || 'Nega antecedentes mórbidos relevantes, cirurgias prévias, neoplasias ou hábitos tabágicos e etilistas.';
    const atestado = extractSectionDoctorEsisla(str, ['Atestado/Relatório e Exames Complementares', 'Atestado/Relatório/Exames Complementares', 'Atestado/Relatório'], ['Pressão Arterial', 'Sistólica', 'Altura', '(*) Exame Físico Geral', '(*)Exame Físico Geral']) || 'Em anexo.';

    // Sinais Vitais e Biometria
    const paSis = (str.match(/Sist[óo]lica(?:\s*\(mmHg\))?[:\s]*(\d+)/i) || [])[1] || p.pressaoSistolica || a.pressaoSistolica || '';
    const paDia = (str.match(/Diast[óo]lica(?:\s*\(mmHg\))?[:\s]*(\d+)/i) || [])[1] || p.pressaoDiastolica || a.pressaoDiastolica || '';
    const pulso = (str.match(/Pulso(?:\s*\(bpm\))?[:\s]*(\d+)/i) || [])[1] || p.pulso || a.pulso || '';
    const altRaw = (str.match(/Altura[:\s]*([\d,\.]+)/i) || [])[1] || p.altura || a.altura || '';
    const pesoRaw = (str.match(/Peso[:\s]*(\d+)/i) || [])[1] || p.peso || a.peso || '';
    let biometria = '';
    if (paSis || paDia || pulso || altRaw || pesoRaw) {
      const parts = [];
      if (paSis || paDia) parts.push(`Pressão Arterial: ${paSis || '—'}/${paDia || '—'} mmHg`);
      if (pulso) parts.push(`Pulso: ${pulso} bpm`);
      if (altRaw) parts.push(`Altura: ${altRaw} m`);
      if (pesoRaw) parts.push(`Peso: ${pesoRaw} kg`);
      biometria = parts.join('  ·  ');
    }

    const exameFisico = extractSectionDoctorEsisla(str, ['(*) Exame Físico Geral', '(*)Exame Físico Geral', 'Exame Físico Geral'], [
      'Descrição das Alterações Clínicas e Exames Complementares',
      'Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares',
      'Descrição das Alterações Clínicas',
      'Descrição das Alterações Médicas',
      '(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
      '(*) Descrição da(s) Limitação',
      '(*)Descrição da(s) Limitação',
      '(*) Parecer Médico'
    ]) || p.exameFisicoDescricao || a.exameFisicoDescricao || '';

    const altClinicas = extractSectionDoctorEsisla(str, [
      'Descrição das Alterações Clínicas e Exames Complementares',
      'Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares',
      'Descrição das Alterações Clínicas',
      'Descrição das Alterações Médicas'
    ], [
      '(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
      '(*) Descrição da(s) Limitação',
      '(*)Descrição da(s) Limitação',
      '(*) Parecer Médico'
    ]) || p.alteracoesClinicasExames || a.alteracoesClinicasExames || 'Não foram apresentados exames complementares (imagem ou laboratoriais) no ato pericial.';

    const limitacoes = extractSectionDoctorEsisla(str, [
      '(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
      '(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
      '(*) Descrição da(s) Limitação',
      '(*)Descrição da(s) Limitação',
      'Descrição da(s) Limitação'
    ], ['(*) Parecer Médico', '(*)Parecer Médico', 'Parecer Médico']) || p.descLimitacao || a.descLimitacao || '';

    let parecerBloco = extractSectionDoctorEsisla(str, ['(*) Parecer Médico', '(*)Parecer Médico', 'Parecer Médico'], ['(*) Resposta aos quesitos', '(*)Resposta aos quesitos', 'Resposta aos quesitos']) || (p.parecer ? `Parecer: ${p.parecer}\nNº Dias: ${p.diasSolicitados || 0}\nCID 10: ${p.cid || ''}` : '');
    if (parecerBloco) {
      parecerBloco = parecerBloco.replace(/^(M[ée]dico\s*Perito:[ \t]*[^\r\n]*?)\s*-\s*$/gmi, '$1');
      parecerBloco = parecerBloco.replace(/^(CRM:[ \t]*[^\r\n]+)\r?\n(?:CRM:[ \t]*[^\r\n]+\r?\n?)+/gmi, '$1\n');
    }

    const quesitosBloco = extractSectionDoctorEsisla(str, ['(*) Resposta aos quesitos', '(*)Resposta aos quesitos', 'Resposta aos quesitos'], ['(*) Justificativa Parecer Médico', '(*)Justificativa Parecer Médico', 'Justificativa Parecer Médico']);

    const justificativa = extractSectionDoctorEsisla(str, ['(*) Justificativa Parecer Médico', '(*)Justificativa Parecer Médico', 'Justificativa Parecer Médico'], ['(*) Parecer Final', '(*)Parecer Final', 'Parecer Final']) || p.justificativa || a.justificativa || '';

    let blocks = [
      { icon: '👤', title: 'Identificação do Servidor e Vínculo', content: ident },
      { icon: '🗣️', title: '(*) Queixa e Duração', content: queixa },
      { icon: '📜', title: 'Antecedentes Mórbidos', content: antecedentes },
      { icon: '📑', title: 'Atestado / Relatório / Exames Complementares', content: atestado },
      { icon: '💓', title: 'Sinais Vitais e Biometria', content: biometria },
      { icon: '🩺', title: '(*) Exame Físico Geral', content: exameFisico },
      { icon: '🔬', title: 'Descrição das Alterações Clínicas e Exames Complementares', content: altClinicas },
      { icon: '⚠️', title: '(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is)', content: limitacoes },
      { icon: '⚖️', title: '(*) Parecer Médico', content: parecerBloco },
      { icon: '❓', title: '(*) Resposta aos Quesitos', content: quesitosBloco },
      { icon: '📝', title: '(*) Justificativa Parecer Médico', content: justificativa }
    ].filter(b => b.content && b.content.trim().length > 0);

    if (blocks.length === 0) {
      blocks = [{ icon: '📄', title: 'Ficha e-Sisla Oficial', content: str }];
    }

    container.innerHTML = blocks.map(b => `
      <div class="doc-esisla-card">
        <div class="doc-esisla-card-head">
          <div class="doc-esisla-card-title"><span>${b.icon}</span><span>${esc(b.title)}</span></div>
          <button type="button" class="btn-sm" onclick="copyDoctorEsislaBlock(this)">📋 Copiar Bloco</button>
        </div>
        <div class="doc-esisla-card-body" style="white-space:pre-wrap;line-height:1.6">${esc(b.content)}</div>
      </div>
    `).join('');
  };

  window.setDoctorEsislaMode = function(mode) {
    window.currentDoctorEsislaMode = mode;
    const isBlocos = mode === 'blocos';
    const blocosEl = $('doctorEsislaBlocosContainer');
    const txtEl = $('doctorEsislaText');
    const btnBlocos = $('btnDocEsislaBlocos');
    const btnTxt = $('btnDocEsislaTxt');
    if (blocosEl) blocosEl.style.display = isBlocos ? 'grid' : 'none';
    if (txtEl) txtEl.style.display = isBlocos ? 'none' : 'block';
    if (btnBlocos) {
      btnBlocos.style.background = isBlocos ? '#fff' : 'transparent';
      btnBlocos.style.color = isBlocos ? 'var(--brand-blue)' : 'var(--text-muted)';
      btnBlocos.style.fontWeight = isBlocos ? '800' : '600';
      btnBlocos.style.boxShadow = isBlocos ? '0 1px 2px rgba(0,0,0,0.06)' : 'none';
    }
    if (btnTxt) {
      btnTxt.style.background = !isBlocos ? '#fff' : 'transparent';
      btnTxt.style.color = !isBlocos ? 'var(--brand-blue)' : 'var(--text-muted)';
      btnTxt.style.fontWeight = !isBlocos ? '800' : '600';
      btnTxt.style.boxShadow = !isBlocos ? '0 1px 2px rgba(0,0,0,0.06)' : 'none';
    }
    if (isBlocos && txtEl) {
      renderDoctorEsislaBlocos(txtEl.value);
    }
  };

  function setDoctorEsislaStage(n, title, text, percent) {
    const stages = [1, 2, 3, 4].map(i => $('docStage' + i));
    stages.forEach((el, idx) => {
      if (el) {
        el.classList.toggle('active', idx === n - 1);
        el.classList.toggle('done', idx < n - 1);
      }
    });
    const tEl = $('doctorEsislaGeneratingTitle');
    const txEl = $('doctorEsislaGeneratingText');
    const barEl = $('doctorEsislaProgressBar');
    if (tEl) tEl.textContent = title;
    if (txEl) txEl.textContent = text;
    if (barEl) barEl.style.width = (percent || 15) + '%';
  }

  const docGenOverlay = $('doctorEsislaGenerating');
  if (docGenOverlay) {
    docGenOverlay.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    docGenOverlay.addEventListener('touchmove', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
  }

  window.openDoctorEsisla = async function(id, forceRefresh = false) {
    if (!id) {
      showToast('Atendimento não identificado.');
      return;
    }
    window.currentDoctorEsislaId = id;
    const modal = $('esislaDoctorModal');
    if (modal) modal.style.display = 'grid';

    const subEl = $('doctorEsislaSub');
    const badgeEl = $('doctorEsislaReuseBadge');
    const txtEl = $('doctorEsislaText');
    const blocosEl = $('doctorEsislaBlocosContainer');
    const regenBtn = $('btnDoctorRegenerateEsisla');
    const overlay = $('doctorEsislaGenerating');
    const modalBody = modal?.querySelector('.modal-body');

    // Trava a rolagem e limpa visualizações residuais durante a geração para manter a tela limpa e fixa
    if (modalBody) {
      modalBody.scrollTop = 0;
      modalBody.style.overflowY = 'hidden';
    }
    const banner = $('doctorEsislaComplianceBanner');
    const tools = $('doctorEsislaToolsBar');
    if (banner) banner.style.display = 'none';
    if (tools) tools.style.display = 'none';
    if (blocosEl) { blocosEl.style.display = 'none'; blocosEl.innerHTML = ''; }
    if (txtEl) { txtEl.style.display = 'none'; txtEl.value = ''; }

    if (regenBtn) regenBtn.disabled = true;
    if (overlay) {
      overlay.classList.add('show');
      overlay.setAttribute('aria-busy', 'true');
    }
    if (subEl) subEl.textContent = forceRefresh ? `Refazendo Ficha e-Sisla do atendimento ${id}…` : `Carregando Ficha e-Sisla do atendimento ${id}…`;

    setDoctorEsislaStage(
      1,
      forceRefresh ? 'Refazendo Ficha e-Sisla' : 'Iniciando Ficha e-Sisla',
      forceRefresh ? 'Recriando a ficha técnica com os dados mais recentes...' : 'Consultando dados do prontuário e histórico salvo...',
      20
    );

    let r = records.find(x => String(x.atendimento || x.id) === String(id)) || { atendimento: id, id };
    const agendaMatch = (typeof currentDoctorAgenda !== 'undefined' && Array.isArray(currentDoctorAgenda))
      ? currentDoctorAgenda.find(x => String(x.atd_existente_numero || x.atd_existente_id || x.protocolo || '') === String(id))
      : null;
    if (agendaMatch) {
      r = {
        ...r,
        nomePaciente: r.nomePaciente || agendaMatch.nome_periciado || '',
        paciente_nome: r.paciente_nome || agendaMatch.nome_periciado || '',
        protocolo: r.protocolo || agendaMatch.protocolo || '',
        ni: r.ni || agendaMatch.ni || '',
        aux: {
          ...(r.aux || {}),
          nomePaciente: r.aux?.nomePaciente || agendaMatch.nome_periciado || '',
          protocolo: r.aux?.protocolo || agendaMatch.protocolo || '',
          ni: r.aux?.ni || agendaMatch.ni || ''
        }
      };
    }
    try {
      const detailRes = await AmbientalAuth.authFetch('/api/atendimentos/' + encodeURIComponent(id), { cache: 'no-store' });
      const detailBody = await detailRes.json().catch(() => null);
      if (detailRes.ok && detailBody?.data?.payload) {
        const dp = detailBody.data.payload;
        const da = dp.aux || {};
        const prevName = r?.nomePaciente || r?.paciente_nome || r?.aux?.nomePaciente || '';
        const prevProto = r?.protocolo || r?.aux?.protocolo || r?.aux?.agenda_protocolo || '';
        const prevCpf = r?.cpfPaciente || r?.paciente_cpf || r?.aux?.cpfPaciente || '';
        const prevNi = r?.ni || r?.aux?.ni || '';
        r = {
          ...r,
          ...dp,
          nomePaciente: dp.nomePaciente || da.nomePaciente || prevName,
          paciente_nome: dp.nomePaciente || da.nomePaciente || prevName,
          cpfPaciente: dp.cpfPaciente || da.cpfPaciente || prevCpf,
          protocolo: dp.protocolo || da.protocolo || da.agenda_protocolo || prevProto,
          ni: dp.ni || da.ni || prevNi,
          aux: {
            ...(r.aux || {}),
            ...da,
            nomePaciente: da.nomePaciente || dp.nomePaciente || prevName,
            cpfPaciente: da.cpfPaciente || dp.cpfPaciente || prevCpf,
            protocolo: da.protocolo || da.agenda_protocolo || dp.protocolo || prevProto,
            ni: da.ni || dp.ni || prevNi
          },
          payload: dp,
          status: detailBody.data.workflow_status || detailBody.data.status || r?.status
        };
        const idx = records.findIndex(x => String(x.atendimento || x.id) === String(id));
        if (idx >= 0) records[idx] = { ...records[idx], ...r };
      }
    } catch (_) {}

    window.currentDoctorEsislaRecord = r;
    const normPayload = normalizeDoctorRecordForEsisla(r);
    normPayload.data_hora_atual = new Date().toISOString();
    normPayload.force_refresh = Boolean(forceRefresh);

    const hasExistingFicha = !forceRefresh && Boolean(normPayload.ficha_esisla && String(normPayload.ficha_esisla).trim().length > 40);
    if (forceRefresh) {
      setDoctorEsislaStage(2, 'Otimização Clínica e Rol', 'Aplicando regras de ouro DPME e compatibilização do cargo...', 52);
    } else if (hasExistingFicha) {
      setDoctorEsislaStage(2, 'Ficha Salva Localizada', 'Reutilizando laudo já aprovado sem duplicação...', 68);
    } else {
      setDoctorEsislaStage(2, 'Estruturação Oficial', 'Adequando queixa, antecedentes e rol ao padrão DPME...', 52);
    }
    await new Promise(r => setTimeout(r, 180));

    try {
      const response = await AmbientalAuth.authFetch('/api/ai/esisla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(normPayload),
        cache: 'no-store'
      });
      setDoctorEsislaStage(3, 'Revisão e Proteção Anti-Glosa', 'Conferindo quesitos, concordância nominal e cabeçalhos...', 88);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ficha_esisla) {
        throw new Error(data?.detail || data?.error?.detail || data?.error?.message || 'Não foi possível gerar a Ficha e-Sisla.');
      }

      const ficha = data.ficha_esisla;
      const wasReused = Boolean(data?.reused_from_atendimento || data?.meta?.reused);

      setDoctorEsislaStage(4, 'Ficha e-Sisla Pronta!', wasReused ? 'Ficha oficial reutilizada com sucesso.' : 'Ficha gerada e salva com sucesso.', 100);
      await new Promise(r => setTimeout(r, 320));

      if (txtEl) txtEl.value = ficha;
      updateDoctorEsislaStats(ficha);
      renderDoctorEsislaBlocos(ficha);
      setDoctorEsislaMode(window.currentDoctorEsislaMode || 'blocos');

      const pName = normPayload.nomePaciente || normPayload.paciente_nome || 'Servidor(a)';
      if (subEl) {
        subEl.textContent = `Atendimento ${id} · ${pName} · ${wasReused ? '✓ Ficha já criada reutilizada (sem recriação)' : (forceRefresh ? '↻ Ficha refeita agora' : '✨ Ficha gerada e salva')}`;
      }
      if (badgeEl) {
        badgeEl.textContent = wasReused ? '✓ Reutilizada (Sem Duplicação)' : (forceRefresh ? '↻ Refeita Agora' : '✨ Gerada e Salva');
        badgeEl.className = 'badge ' + (wasReused ? 'green' : 'blue');
      }

      // Atualiza registro em memória para exibir o selo "✓ Ficha e-Sisla" na lista
      r.ficha_esisla = ficha;
      if (r.aux) r.aux.fichaEsisla = ficha;
      if (r.payload) r.payload.ficha_esisla = ficha;
      const idx = records.findIndex(x => String(x.atendimento || x.id) === String(id));
      if (idx >= 0) {
        records[idx].ficha_esisla = ficha;
        if (records[idx].aux) records[idx].aux.fichaEsisla = ficha;
        if (records[idx].payload) records[idx].payload.ficha_esisla = ficha;
      }
      renderLists();

      // Sincroniza imediatamente com a Extensão e-SISLA AutoFill (Buffer e Fila)
      sincronizarFichaComExtensaoDoctor(ficha, r, id, false);
    } catch (err) {
      console.error('[Doctor e-Sisla] Erro ao carregar/gerar:', err);
      const fallbackFicha = r.ficha_esisla || r.aux?.fichaEsisla || r.aux?.ficha_esisla || r.payload?.ficha_esisla;
      if (fallbackFicha && String(fallbackFicha).trim().length > 40) {
        if (txtEl) txtEl.value = fallbackFicha;
        updateDoctorEsislaStats(fallbackFicha);
        renderDoctorEsislaBlocos(fallbackFicha);
        setDoctorEsislaMode(window.currentDoctorEsislaMode || 'blocos');
        showToast('Ficha salva recuperada do atendimento.');
      } else {
        if (blocosEl) {
          blocosEl.style.display = 'grid';
          blocosEl.innerHTML = `
            <div style="background:#fff;border:1.5px solid #fecaca;border-radius:12px;padding:24px;text-align:center;margin:16px;">
              <div style="font-size:32px;margin-bottom:8px">⚠️</div>
              <h4 style="margin:0 0 8px 0;color:#991b1b;font-size:15px">Não foi possível gerar a Ficha e-Sisla</h4>
              <p style="margin:0 0 16px 0;color:#7f1d1d;font-size:13px">${esc(err.message || err)}</p>
              <div style="display:flex;gap:10px;justify-content:center">
                <button type="button" class="btn primary" onclick="openDoctorEsisla('${esc(id)}', true)" style="padding:7px 16px;font-size:12px">
                  🔄 Tentar Novamente
                </button>
                <button type="button" class="btn-sm" onclick="closeDoctorEsislaModal()">Fechar</button>
              </div>
            </div>`;
        }
        showToast(err.message || 'Erro ao gerar Ficha e-Sisla.');
      }
    } finally {
      if (overlay) {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-busy', 'false');
      }
      if (modalBody) {
        modalBody.style.overflowY = 'auto';
      }
      if (banner) banner.style.display = 'flex';
      if (tools) tools.style.display = 'flex';
      if (txtEl && txtEl.value && txtEl.value.trim().length > 0) {
        setDoctorEsislaMode(window.currentDoctorEsislaMode || 'blocos');
      }
      if (regenBtn) regenBtn.disabled = false;
    }
  };

  window.closeDoctorEsislaModal = function() {
    const modal = $('esislaDoctorModal');
    if (modal) modal.style.display = 'none';
  };

  function sanitizarNomeServidorEsisla(rawName) {
    const s = String(rawName || '').trim();
    if (!s) return '';
    if (s.length > 90) return '';
    if (/^(?:de\s+\d+\s+anos|relatou\b|n[ãa]o\s+readaptad|com\s+queixa\b|servidor(?:\(a\))?\s+de\s+\d+)/i.test(s)) return '';
    if (/\b(?:relatou\s+n[ãa]o\s+ser\s+readaptad|com\s+queixa\s+de|em\s+acompanhamento)\b/i.test(s)) return '';
    return s;
  }

  window.extrairPayloadEsislaDoTexto = function(rawText, record, fallbackId) {
    if (!rawText || typeof rawText !== 'string') return null;
    const str = normalizarTextoFichaEsisla(rawText.replace(/\r/g, ''));
    if (str.length < 30) return null;

    function extrair(texto, inis, fims) {
      const arrIni = Array.isArray(inis) ? inis : [inis];
      let posIni = -1;
      let matchedIni = '';
      for (const i of arrIni) {
        const idx = texto.indexOf(i);
        if (idx !== -1 && (posIni === -1 || idx < posIni)) {
          posIni = idx;
          matchedIni = i;
        }
      }
      if (posIni === -1) return '';
      const start = posIni + matchedIni.length;
      if (!fims) return texto.slice(start).trim();
      const arrFim = Array.isArray(fims) ? fims : [fims];
      let posFim = -1;
      for (const f of arrFim) {
        const idx = texto.indexOf(f, start);
        if (idx !== -1 && (posFim === -1 || idx < posFim)) {
          posFim = idx;
        }
      }
      if (posFim === -1) return texto.slice(start).trim();
      return texto.slice(start, posFim).trim();
    }

    const r = record || window.currentDoctorEsislaRecord || {};
    const p = payload(r);
    const a = aux(r);

    const recordProto = String(a.protocolo || p.protocolo || r.protocolo || a.agenda_protocolo || '').trim();
    const protoMatch = str.match(/^(?:Atendimento|Protocolo)\s*[:#]\s*([A-Za-z0-9_\-\.]+)/im);
    const subMatch = (document.getElementById('doctorEsislaSub')?.textContent || '').match(/Atendimento\s+([^·\s]+)/i);
    const protocolo = String(
      recordProto ||
      (protoMatch ? protoMatch[1].trim() : '') ||
      (subMatch ? subMatch[1].trim() : '') ||
      fallbackId ||
      r.atendimento ||
      r.id ||
      ('ATD_' + Date.now())
    ).trim();

    const agendaMatch = (typeof currentDoctorAgenda !== 'undefined' && Array.isArray(currentDoctorAgenda))
      ? currentDoctorAgenda.find(x => String(x.atd_existente_numero || x.atd_existente_id || x.protocolo || '') === String(protocolo || fallbackId || r.atendimento || r.id || ''))
      : null;
    const recordNome = sanitizarNomeServidorEsisla(
      p.nomePaciente || a.nomePaciente || r.nomePaciente || r.paciente_nome || p.paciente || a.paciente || r.paciente || agendaMatch?.nome_periciado || ''
    );
    const subPacMatch = (document.getElementById('doctorEsislaSub')?.textContent || '').match(/·\s*([^·]+)\s*·/i);
    const domNome = sanitizarNomeServidorEsisla(subPacMatch ? subPacMatch[1].trim() : '');
    const pacMatch = str.match(/^(?:Nome(?:\s+do\s+(?:Servidor|Periciado))?|Periciado|Paciente)\s*:\s*([^\n\r]+)/im);
    const textNome = sanitizarNomeServidorEsisla(pacMatch ? pacMatch[1].trim() : '');
    const servidor = String(
      recordNome ||
      (domNome && domNome !== 'Servidor(a)' ? domNome : '') ||
      textNome ||
      agendaMatch?.nome_periciado ||
      domNome ||
      'Servidor'
    ).trim();
    const cpf = String(p.cpfPaciente || a.cpfPaciente || r.cpfPaciente || r.paciente_cpf || '').trim();
    const ni = String(a.ni || p.ni || r.ni || '').trim();

    const queixa = extractSectionDoctorEsisla(str, ['(*) Queixa e Duração', 'Queixa e Duração'], ['Antecedentes Mórbidos']) || p.queixaDuracao || a.queixaDuracao || p.queixa || a.queixa || '';
    const antecedentes = extractSectionDoctorEsisla(str, ['Antecedentes Mórbidos'], ['Atestado/Relatório/Exames Complementares', 'Atestado/Relatório e Exames Complementares', 'Atestado/Relatório', 'Pressão Arterial']) || p.historicoPregresso || a.historicoPregresso || 'Nega';
    const atestado = extractSectionDoctorEsisla(str, ['Atestado/Relatório/Exames Complementares', 'Atestado/Relatório e Exames Complementares', 'Atestado/Relatório'], ['Pressão Arterial', 'Sistólica', 'Altura', '(*) Exame Físico Geral', '(*)Exame Físico Geral']) || 'Em anexo.';
    const exameFisico = extractSectionDoctorEsisla(str, ['(*) Exame Físico Geral', '(*)Exame Físico Geral', 'Exame Físico Geral'], [
      'Descrição das Alterações Clínicas e Exames Complementares',
      'Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares',
      'Descrição das Alterações Clínicas',
      'Descrição das Alterações Médicas',
      '(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
      '(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
      '(*) Descrição da(s) Limitação'
    ]) || p.exameFisicoDescricao || a.exameFisicoDescricao || '';
    const limitacoes = extractSectionDoctorEsisla(str, [
      '(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
      '(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)',
      '(*) Descrição da(s) Limitação',
      '(*)Descrição da(s) Limitação',
      'Descrição da(s) Limitação'
    ], ['(*) Parecer Médico', '(*)Parecer Médico', 'Parecer Médico']) || p.descLimitacao || a.descLimitacao || '';

    const parecerStr = extractSectionDoctorEsisla(str, ['(*) Parecer Médico', '(*)Parecer Médico', 'Parecer Médico'], ['(*) Resposta aos quesitos', '(*)Resposta aos quesitos', '(*) Justificativa Parecer Médico']) || p.parecer || a.parecer || '';
    const isContrario = /CONTR[ÁA]RIO/i.test(parecerStr) || /PARECER:\s*CONTR[ÁA]RIO/i.test(str);
    const flPfinal = isContrario ? 'C' : 'F';

    let dias = extrair(str, ['Nº Dias:', 'Nº Dias', 'Dias concedidos:', 'Dias Concedidos:', 'Dias:'], ['Data Início:', 'Data Início', 'Data de início:', 'CID 10:', 'CID-10 principal:']) || p.diasSolicitados || a.diasSolicitados || '';
    dias = String(dias).replace(/\D/g, '');
    if (flPfinal === 'C') dias = '0';
    else if (!dias || dias === '0') dias = '1';

    let dtIni = extrair(str, ['Data Início:', 'Data de início:', 'Data Início'], ['CID-10 principal:', 'CID 10:', 'CID 10', 'CID:', 'Descrição:']) || p.dataDocumento || a.dataDocumento || p.dataExpedicao || a.dataExpedicao || '';
    dtIni = dtIni.split('\n')[0].trim();

    let cid1 = extrair(str, ['CID-10 principal:', 'CID 10 Principal:', 'CID 10:', 'CID 10', 'CID:'], ['Descrição:', 'Descrição', 'CID 10 Secundário:', 'CID-10 secundário:']) || p.cid || a.cid || '';
    const mCid1 = cid1.match(/[A-Za-z]\d{2}(?:\.\d{1,2})?/);
    cid1 = mCid1 ? mCid1[0].toUpperCase() : (p.cid || a.cid || '').toUpperCase();

    let descrCid1 = extrair(str, ['Descrição:', 'Descrição'], ['CID-10 secundário:', 'CID 10 Secundário:', 'CID 10 Secundário', 'Médico Perito:', '(*) Resposta aos quesitos', '(*) Justificativa']) || p.doencaMotivo || a.doencaMotivo || '';
    descrCid1 = descrCid1.split('\n')[0].trim();

    let cid2 = extrair(str, ['CID-10 secundário:', 'CID 10 Secundário:', 'CID Secundário:'], ['Descrição Secundária:', 'Médico Perito:', '(*) Resposta aos quesitos', '(*) Justificativa']);
    const mCid2 = cid2.match(/[A-Za-z]\d{2}(?:\.\d{1,2})?/);
    cid2 = mCid2 ? mCid2[0].toUpperCase() : '';

    let descrCid2 = extrair(str, ['Descrição Secundária:'], ['Médico Perito:', 'CRM:', '(*) Resposta aos quesitos', '(*) Justificativa']);
    descrCid2 = descrCid2.split('\n')[0].trim();

    const q1Sim = /1\)\s*H[áa]\s*doen[çc]a[^\n]*\bSIM\b/i.test(str);
    const q2Sim = /2\)\s*A\(s\)\s*doen[çc]a[^\n]*\bSIM\b/i.test(str);
    const q3Sim = /3\)\s*A\(s\)\s*limita[çc][^\n]*\bSIM\b/i.test(str);

    const fl_d_prev = q1Sim ? 'S' : (flPfinal === 'C' ? 'S' : 'S');
    const fl_limit = q2Sim ? 'S' : (flPfinal === 'C' ? 'N' : 'S');
    const fl_imped = q3Sim ? 'S' : (flPfinal === 'C' ? 'N' : 'S');

    const justif = extractSectionDoctorEsisla(str, ['(*) Justificativa Parecer Médico', '(*)Justificativa Parecer Médico', '(*) Justificativa Parecer Final', 'Justificativa'], ['(*) Parecer Final', '(*)Parecer Final', 'Parecer Final']) || p.justificativa || a.justificativa || '';

    const paSis = (str.match(/Sist[óo]lica(?:\s*\(mmHg\))?[:\s]*(\d+)/i) || [])[1] || p.pressaoSistolica || a.pressaoSistolica || '';
    const paDia = (str.match(/Diast[óo]lica(?:\s*\(mmHg\))?[:\s]*(\d+)/i) || [])[1] || p.pressaoDiastolica || a.pressaoDiastolica || '';
    const pulso = (str.match(/Pulso(?:\s*\(bpm\))?[:\s]*(\d+)/i) || [])[1] || p.pulso || a.pulso || '';
    const altRaw = (str.match(/Altura[:\s]*([\d,\.]+)/i) || [])[1] || p.altura || a.altura || '';
    let altFormat = String(altRaw || '').trim().replace(/[^\d,\.]/g, '');
    if (altFormat) {
      if (altFormat.includes('.')) altFormat = altFormat.replace('.', ',');
      else if (!altFormat.includes(',') && altFormat.length >= 3) altFormat = altFormat.slice(0, 1) + ',' + altFormat.slice(1, 3);
      altFormat = altFormat.slice(0, 4);
    }
    const pesoRaw = String((str.match(/Peso[:\s]*(\d+)/i) || [])[1] || p.peso || a.peso || '').replace(/\D/g, '').slice(0, 3);

    const exTipoLower = String(p.outrosSubtipo || a.outrosSubtipo || p.exameFisicoTipo || a.exameFisicoTipo || '').toLowerCase();
    const efLower = String(exameFisico || '').toLowerCase();
    const cb = {
      'voMedico.parEdtcspf': /tcspf|tecido celular subcut[âa]neo|pele e f[âa]neros/i.test(exTipoLower) || /tcspf|tecido celular subcut[âa]neo/i.test(efLower),
      'voMedico.parEdAc': /circulat[óo]rio|cardio/i.test(exTipoLower) || (/aparelho circulat[óo]rio/i.test(efLower) && !/bom do estado geral/i.test(efLower)),
      'voMedico.parEdAr': /respirat[óo]rio|pulmon/i.test(exTipoLower) || (/aparelho respirat[óo]rio/i.test(efLower) && !/bom do estado geral/i.test(efLower)),
      'voMedico.parEdAHp': /hemolinfopo[ée]tico|hemat/i.test(exTipoLower) || /hemolinfopo[ée]tico/i.test(efLower),
      'voMedico.parEdAd': /digestivo|gastr/i.test(exTipoLower) || /aparelho digestivo/i.test(efLower),
      'voMedico.parEdAgu': /geniturin[áa]rio|urin|renal/i.test(exTipoLower) || /aparelho geniturin[áa]rio/i.test(efLower),
      'voMedico.parEdAoal': /osteomuscular|conjuntivo|conjutivo/i.test(exTipoLower) || /osteomuscular|conjuntivo|conjutivo/i.test(efLower) || (!exTipoLower && cid1.startsWith('M')),
      'voMedico.parEdAe': /end[óo]crino|metab[óo]l/i.test(exTipoLower) || /aparelho end[óo]crino/i.test(efLower),
      'voMedico.parEdSn': /sistema nervoso|neurol/i.test(exTipoLower) || /sistema nervoso/i.test(efLower),
      'voMedico.parEdOs': /[óo]rg[ãa]os dos sentidos|oftalm|otol/i.test(exTipoLower) || /[óo]rg[ãa]os dos sentidos/i.test(efLower),
      'voMedico.parEdEm': /exame mental|estado mental|mental/i.test(exTipoLower) || /^exame mental|estado mental/i.test(efLower) || (!exTipoLower && cid1.startsWith('F')),
      'voMedico.parEdOutro': /outro|geral/i.test(exTipoLower) || /bom do estado geral/i.test(efLower)
    };
    if (!Object.values(cb).some(Boolean) && exameFisico) {
      cb['voMedico.parEdOutro'] = true;
    }

    const cleanExameApres = String(exameFisico || '')
      .replace(/\n\s*Em anexo\.?\s*$/gi, '')
      .replace(/^\s*(?:Aparelho\s+)?(?:E\s+)?Outros\s*:\s*/i, '')
      .trim();

    const camposEsisla = {
      'voMedico.parRlCat': queixa,
      'voMedico.parRlAp': antecedentes || 'Nega',
      'voMedico.parRlHda': atestado || 'Em anexo.',
      'voMedico.parRlExApres': cleanExameApres,
      'voMedico.parRlReqExComp': limitacoes,
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
      'voMedico.parRlComp': justif,
      'voMedico.lgPressArterialMax': paSis,
      'voMedico.lgPressArterialMin': paDia,
      'voMedico.lgPulsacao': pulso,
      'voMedico.lgAltura': altFormat,
      'voMedico.lgPeso': pesoRaw,
      ...cb
    };

    return {
      protocolo,
      servidor,
      paciente: servidor,
      cpf,
      ni,
      ...camposEsisla,
      campos_esisla: camposEsisla,
      ficha_esisla_texto: str,
      timestamp: new Date().toISOString()
    };
  };

  window.sincronizarFichaComExtensaoDoctor = function(ficha, record, id, forceQueue = false) {
    try {
      const payload = extrairPayloadEsislaDoTexto(ficha, record, id);
      if (!payload) return null;
      window.currentDoctorEsislaPayload = payload;
      try {
        localStorage.setItem('ambiental_esisla_current_payload', JSON.stringify(payload));
      } catch (_) {}
      try {
        window.postMessage({
          type: 'AMBIENTAL_ESISLA_PAYLOAD',
          payload: payload,
          forceQueue: Boolean(forceQueue),
          autoAdd: Boolean(forceQueue)
        }, '*');
      } catch (_) {}
      return payload;
    } catch (e) {
      console.warn('[Ambiental] Erro ao sincronizar ficha com a extensão:', e);
      return null;
    }
  };

  window.enviarDoctorEsislaParaExtensao = function() {
    const txt = $('doctorEsislaText')?.value || '';
    if (!txt.trim()) {
      showToast('Gere a Ficha e-Sisla antes de enviar para a extensão.');
      return;
    }
    sincronizarFichaComExtensaoDoctor(txt, window.currentDoctorEsislaRecord, window.currentDoctorEsislaId, true);
    const btn = $('btnDoctorSendToExtension');
    if (btn) {
      const old = btn.innerHTML;
      btn.innerHTML = '⚡ Adicionado à Fila!';
      setTimeout(() => { btn.innerHTML = old; }, 2200);
    }
    showToast('⚡ Ficha adicionada à Fila da Extensão e-SISLA! Abra o e-SISLA para preencher automaticamente.');
  };

  window.abrirModalExtensaoEsisla = function() {
    const isInstalled = document.documentElement.getAttribute('data-ambiental-extension') === 'active' || !!window.__AMBIENTAL_ESISLA_EXTENSION_ACTIVE__;
    const statusEl = $('extensaoStatusBannerDoctor');
    if (statusEl) {
      if (isInstalled) {
        statusEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;color:#15803D">
            <span style="font-size:22px">🟢</span>
            <div>
              <strong style="display:block;font-size:13.5px">Extensão Ativa e Conectada ao Navegador!</strong>
              <span style="font-size:11.5px">Os dados da ficha deste paciente já estão sincronizados e prontos para o e-SISLA.</span>
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
              <span style="font-size:11.5px">Insere o botão flutuante inteligente diretamente na tela do e-SISLA para preencher automaticamente.</span>
            </div>
          </div>
        `;
        statusEl.style.background = '#F0F9FF';
        statusEl.style.borderColor = '#BAE6FD';
      }
    }
    const modal = $('modalExtensaoEsislaDoctor');
    if (modal) modal.style.display = 'grid';
  };

  window.fecharModalExtensaoEsislaDoctor = function() {
    const modal = $('modalExtensaoEsislaDoctor');
    if (modal) modal.style.display = 'none';
  };

  window.copyDoctorEsislaFull = async function() {
    const txt = $('doctorEsislaText')?.value || '';
    if (!txt.trim()) return;
    try {
      await navigator.clipboard.writeText(txt);
    } catch (_) {
      const el = $('doctorEsislaText');
      if (el) {
        el.style.display = 'block';
        el.select();
        document.execCommand('copy');
        if (window.currentDoctorEsislaMode === 'blocos') el.style.display = 'none';
      }
    }

    // Sincroniza com a Extensão e-SISLA e insere na fila de preenchimento
    sincronizarFichaComExtensaoDoctor(txt, window.currentDoctorEsislaRecord, window.currentDoctorEsislaId, true);

    const btn = $('btnDoctorCopyEsislaFull');
    if (btn) {
      const old = btn.innerHTML;
      btn.innerHTML = '✓ Ficha Copiada!';
      setTimeout(() => { btn.innerHTML = old; }, 2000);
    }
    showToast('⚡ Ficha copiada e sincronizada com a Extensão e-SISLA!');
  };

  window.refinarDoctorEsislaComIA = async function() {
    const el = $('doctorEsislaText');
    const texto = el?.value || '';
    if (!texto.trim() || texto.trim().length < 30) {
      showToast('Gere a Ficha e-Sisla antes de otimizar com IA.');
      return;
    }
    const btn = $('btnDoctorRefinarEsislaIA');
    const oldHtml = btn?.innerHTML;
    const overlay = $('doctorEsislaGenerating');
    const modal = $('esislaDoctorModal');
    const modalBody = modal?.querySelector('.modal-body');
    const banner = $('doctorEsislaComplianceBanner');
    const tools = $('doctorEsislaToolsBar');
    const blocosEl = $('doctorEsislaBlocosContainer');

    if (modalBody) {
      modalBody.scrollTop = 0;
      modalBody.style.overflowY = 'hidden';
    }
    if (banner) banner.style.display = 'none';
    if (tools) tools.style.display = 'none';
    if (blocosEl) blocosEl.style.display = 'none';
    if (el) el.style.display = 'none';

    if (btn) { btn.disabled = true; btn.innerHTML = '✨ Otimizando...'; }
    if (overlay) {
      overlay.classList.add('show');
      overlay.setAttribute('aria-busy', 'true');
    }
    setDoctorEsislaStage(1, 'Otimizando com IA Sênior', 'Analisando linguagem pericial, concordância e rol de atividades...', 25);

    try {
      const atdId = window.currentDoctorEsislaId;
      setDoctorEsislaStage(2, 'Harmonização Técnica DPME', 'Removendo capslock, ajustando posologia e termos clínicos...', 60);
      const resp = await AmbientalAuth.authFetch('/api/ai/refinar-ficha-esisla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ficha_esisla: texto,
          texto_ficha: texto,
          texto: texto,
          atendimento_id: atdId,
          atendimento: atdId,
          id: atdId
        })
      });
      setDoctorEsislaStage(3, 'Polimento e Validação', 'Finalizando aplicação de melhorias estruturais na ficha...', 88);
      const resData = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(resData?.error?.message || resData?.detail || 'Erro ao otimizar ficha.');
      const otimizado = resData?.data?.ficha_esisla_otimizada || resData?.data?.texto_otimizado || resData?.ficha_esisla_otimizada || resData?.texto_otimizado;
      if (!otimizado) throw new Error('Não foi possível obter a ficha otimizada.');

      setDoctorEsislaStage(4, 'Otimização Concluída!', 'Ficha revisada e salva com excelência pericial.', 100);
      await new Promise(r => setTimeout(r, 300));

      if (el) el.value = otimizado;
      updateDoctorEsislaStats(otimizado);
      renderDoctorEsislaBlocos(otimizado);
      if (window.currentDoctorEsislaRecord) {
        window.currentDoctorEsislaRecord.ficha_esisla = otimizado;
      }
      const idx = records.findIndex(x => String(x.atendimento || x.id) === String(atdId));
      if (idx >= 0) {
        records[idx].ficha_esisla = otimizado;
        if (records[idx].aux) records[idx].aux.fichaEsisla = otimizado;
        if (records[idx].payload) records[idx].payload.ficha_esisla = otimizado;
      }
      // Sincroniza imediatamente com a Extensão e-SISLA AutoFill
      sincronizarFichaComExtensaoDoctor(otimizado, window.currentDoctorEsislaRecord, atdId, false);
      showToast('✨ Ficha e-Sisla otimizada e reestruturada com sucesso!');
    } catch (err) {
      showToast(err.message || 'Erro ao otimizar ficha com IA.');
    } finally {
      if (overlay) {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-busy', 'false');
      }
      if (modalBody) {
        modalBody.style.overflowY = 'auto';
      }
      if (banner) banner.style.display = 'flex';
      if (tools) tools.style.display = 'flex';
      setDoctorEsislaMode(window.currentDoctorEsislaMode || 'blocos');
      if (btn) { btn.disabled = false; btn.innerHTML = oldHtml || '✨ Otimizar com IA'; }
    }
  };

  window.printDoctorEsisla = function() {
    const text = $('doctorEsislaText')?.value || '';
    if (!text.trim()) {
      showToast('Aguarde o carregamento da ficha para imprimir.');
      return;
    }
    const r = window.currentDoctorEsislaRecord || {};
    const p = payload(r);
    const a = aux(r);
    const patient = p.nomePaciente || a.nomePaciente || r.nomePaciente || 'Servidor(a)';
    const atdId = window.currentDoctorEsislaId || r.atendimento || '';
    const win = window.open('', '_blank', 'width=900,height=800');
    if (!win) {
      showToast('Permita pop-ups para gerar o PDF.');
      return;
    }
    win.document.open();
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha e-Sisla - ${esc(patient)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a;line-height:1.55}h1{font-size:15pt;color:#0f2744;margin:0 0 4px}h2{font-size:11pt;color:#334155;margin:0 0 16px}pre{font-family:"Courier New",monospace;font-size:10pt;white-space:pre-wrap;word-break:break-word;border:1px solid #cbd5e1;padding:16px;border-radius:8px}</style></head><body><h1>Diretoria de Perícias Médicas do Estado — DPME / SP</h1><h2>Ficha e-Sisla · Atendimento ${esc(atdId)} · ${esc(patient)}</h2><pre>${esc(text)}</pre><script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script></body></html>`);
    win.document.close();
  };

  window.openQuickView = async function(id) {
    const modal = $('quickViewModal');
    modal.style.display = 'grid';
    $('quickViewSub').textContent = `Carregando atendimento ${id}…`;
    $('quickViewBody').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Buscando dados detalhados do atendimento…</div>';
    
    let r = records.find(x => String(x.atendimento || x.id) === String(id));
    try {
      const res = await AmbientalAuth.authFetch('/api/atendimentos/' + encodeURIComponent(id));
      const body = await res.json().catch(() => null);
      if (res.ok && body?.data?.payload) {
        r = { ...r, ...body.data.payload, payload: body.data.payload, status: body.data.workflow_status || r?.status };
      }
    } catch(err) {
      console.warn("Falha ao carregar detalhes completos:", err);
    }
    
    activeQuickRecord = r;
    $('quickViewTitle').textContent = `Laudo Pericial — ${r?.atendimento || id}`;
    $('quickViewSub').textContent = `Status: ${statusLabel(r?.status)} · Atualizado: ${dateDisplay(r?.atualizado_em)}`;
    $('quickViewOpenFullBtn').onclick = () => openRecord(r);
    
    const p = payload(r);
    const a = aux(r);
    const quesitos = Array.isArray(p.quesitos) ? p.quesitos : [];
    
    $('quickViewBody').innerHTML = `
      <div class="preview-section">
        <h4>1. Identificação do Atendimento</h4>
        <div class="preview-grid">
          <div class="preview-item"><small>Paciente</small><strong>${esc(p.nomePaciente || a.nomePaciente || '—')}</strong></div>
          <div class="preview-item"><small>CPF</small><strong>${esc(p.cpfPaciente || a.cpfPaciente || '—')}</strong></div>
          <div class="preview-item"><small>Cargo</small><strong>${esc(p.cargo || a.cargo || '—')}</strong></div>
          <div class="preview-item"><small>Médico Responsável</small><strong>${esc(p.medico || r?.medico || '—')}</strong></div>
          <div class="preview-item"><small>CRM/CRO</small><strong>${esc(a.crmResponsavel || p.crmCro || '—')}</strong></div>
          <div class="preview-item"><small>Data / Hora</small><strong>${esc(dateDisplay(atdDate(r)))} ${esc(atdTime(r))}</strong></div>
        </div>
      </div>
      <div class="preview-section">
        <h4>2. Diagnóstico e Queixa</h4>
        <div class="preview-grid">
          <div class="preview-item"><small>CID-10 Principal</small><strong>${esc(p.cid || a.cid || '—')}</strong></div>
          <div class="preview-item"><small>Doença / Motivo</small><strong>${esc(p.doencaMotivo || a.doencaMotivo || '—')}</strong></div>
        </div>
        <div class="preview-item" style="margin-top:6px"><small>Queixa e Duração</small><div class="preview-text">${esc(p.queixaDuracao || a.queixaDuracao || 'Nenhum registro.')}</div></div>
      </div>
      ${(p.historicoPregresso || a.historicoPregresso) ? `
      <div class="preview-section">
        <h4>3. Antecedentes Mórbidos</h4>
        <div class="preview-text">${esc(p.historicoPregresso || a.historicoPregresso)}</div>
      </div>` : ''}
      <div class="preview-section">
        <h4>4. Achados Clínicos e Exame</h4>
        <div class="preview-text">${esc(p.alteracoesClinicasExames || p.exameFisicoDescricao || a.alteracoesClinicasExames || 'Sem alterações clínicas registradas.')}</div>
      </div>
      <div class="preview-section">
        <h4>5. Limitações Funcionais</h4>
        <div class="preview-text">${esc(p.descLimitacao || a.descLimitacao || 'Nenhuma limitação funcional relatada.')}</div>
      </div>
      ${quesitos.length ? `
      <div class="preview-section">
        <h4>6. Resposta aos Quesitos</h4>
        ${quesitos.map((q, i) => `
          <div style="margin-bottom:8px">
            <div><b>Q${i + 1}:</b> ${esc(q.pergunta || '')}</div>
            <div style="color:var(--brand-blue);font-weight:700">Resposta: ${esc(q.resposta || '—')}</div>
            ${q.justificativa ? `<div style="color:var(--text-muted);font-size:11px">${esc(q.justificativa)}</div>` : ''}
          </div>
        `).join('')}
      </div>` : ''}
      <div class="preview-section" style="border-bottom:0">
        <h4>7. Justificativa e Parecer Final</h4>
        <div class="preview-grid" style="margin-bottom:10px">
          <div class="preview-item"><small>Capacidade Laborativa</small><strong style="color:var(--brand-blue)">${esc(p.capacidade || '—')}</strong></div>
          <div class="preview-item"><small>Parecer</small><strong style="color:${p.parecer === 'FAVORÁVEL' ? 'var(--brand-green)' : 'var(--accent-amber)'}">${esc(p.parecer || '—')}</strong></div>
        </div>
        <div class="preview-text" style="font-weight:500">${esc(p.justificativa || a.justificativa || 'Sem justificativa registrada.')}</div>
      </div>
    `;
  };

  window.closeQuickView = function() {
    $('quickViewModal').style.display = 'none';
    activeQuickRecord = null;
  };

  window.printQuickView = function() {
    if (!activeQuickRecord) return;
    const printContent = $('quickViewBody').innerHTML;
    const title = `Laudo Pericial — ${activeQuickRecord.atendimento || activeQuickRecord.id}`;
    const win = window.open('', '_blank');
    if (!win) { showToast('Permita pop-ups para imprimir o laudo.'); return; }
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:25px;margin:0;font-size:12px;line-height:1.5}.preview-section{margin-bottom:16px;border-bottom:1px solid #ccc;padding-bottom:12px}h4{color:#073f87;margin:0 0 6px 0;font-size:13px}.preview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:8px}.preview-item small{display:block;font-size:9px;color:#666;text-transform:uppercase}.preview-text{background:#f9f9f9;padding:8px;border:1px solid #eee;white-space:pre-wrap}@media print{body{padding:0}.preview-section{break-inside:avoid}}</style></head><body><div style="border-bottom:2px solid #073f87;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center"><img src="/logo.png" style="width:48px;height:48px" alt="Ambiental"><div><h2 style="margin:0;color:#073f87">Ambiental — Avaliação Médica Pericial</h2><small>${title}</small></div></div>${printContent}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  function renderUpcoming() {
    const list = (Array.isArray(dashboard?.proximos) ? dashboard.proximos : []).slice(0, 6).map(r => ({
      ...r,
      atendimento: r.numero || r.atendimento,
      atualizado_em: r.atualizado_em
    }));
    $('upcoming').innerHTML = list.length ? list.map(r => {
      const id = esc(r.atendimento || r.id);
      const matchedRecord = records.find(x => String(x.atendimento || x.id) === String(id)) || {};
      const name = r.paciente_nome || matchedRecord.nomePaciente || matchedRecord.paciente_nome || '';
      const displayTitle = name ? esc(name) : `Atendimento #${esc(r.protocolo || id.slice(0, 8))}`;
      const ini = initials(name || 'Paciente');
      const proto = r.protocolo || matchedRecord.aux?.protocolo || '';
      const cargo = r.cargo || matchedRecord.aux?.cargo || '';
      const cid = r.cid || matchedRecord.cid || matchedRecord.aux?.cid || '';
      const unid = cleanUnidade(r.unidade || matchedRecord.unidade || '');
      const dataStr = dateDisplay(r.data_atd || atdDate(matchedRecord) || '');
      const horaStr = r.hora_atd ? String(r.hora_atd).slice(0, 5) : (atdTime(matchedRecord) || '');
      
      return `
        <div class="upcoming-card">
          <div class="upcoming-avatar">${ini}</div>
          <div class="upcoming-body">
            <div class="upcoming-title-row">
              <b class="upcoming-patient-name" title="${name ? esc(name) : ''}">${displayTitle}</b>
              ${proto ? `<span class="upcoming-proto-badge">#${esc(proto)}</span>` : ''}
              <span class="badge ${statusClass(r.status)}"><i class="dot"></i>${esc(statusLabel(r.status))}</span>
            </div>
            <div class="upcoming-meta-row">
              ${dataStr ? `<span class="meta-chip">📅 ${esc(dataStr)}${horaStr ? ' às ' + esc(horaStr) : ''}</span>` : ''}
              ${unid ? `<span class="meta-chip" title="${esc(r.unidade || '')}">🏫 ${esc(unid)}</span>` : ''}
              ${cargo ? `<span class="meta-chip">💼 ${esc(cargo)}</span>` : ''}
              ${cid ? `<span class="meta-chip cid-chip">🩺 CID: ${esc(cid)}</span>` : ''}
            </div>
          </div>
          <div class="upcoming-actions">
            <button class="btn-sm upcoming-preview-btn" data-preview="${id}" title="Visualizar laudo rápido">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              <span>Visualizar</span>
            </button>
            <button class="btn-primary-card" data-open="${id}" title="Abrir prontuário completo">
              <span>Abrir</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty">Nenhum próximo atendimento agendado.</div>';
    wireButtons($('upcoming'));
  }
  
  function renderAlerts() {
    const p = Array.isArray(dashboard?.pendencias) ? dashboard.pendencias : [];
    $('alertsList').innerHTML = p.length ? p.slice(0, 4).map(r => {
      const id = esc(r.numero || r.id);
      const matchedRecord = records.find(x => String(x.atendimento || x.id) === String(id)) || {};
      const name = r.paciente_nome || matchedRecord.nomePaciente || matchedRecord.paciente_nome || '';
      const displayTitle = name ? esc(name) : `Atendimento #${esc(r.protocolo || id.slice(0, 8))}`;
      const proto = r.protocolo || matchedRecord.aux?.protocolo || '';
      const pct = Math.round(Number(r.completude || matchedRecord.completude || 0));
      const alertsCount = Number(r.alertas || 0);
      const inconCount = Number(r.inconsistencias || 0);
      
      let msg = '';
      if (r.status === 'RASCUNHO') msg = 'Atendimento em rascunho';
      else if (r.status === 'PENDENTE') msg = 'Aguardando validação clínica';
      else msg = 'Atenção necessária';
      
      if (alertsCount > 0) msg += ` · ${alertsCount} alerta(s)`;
      if (inconCount > 0) msg += ` · ${inconCount} inconsistência(s)`;

      return `
        <div class="alert-item-card" data-open="${id}" title="Clique para continuar este atendimento">
          <div class="alert-item-icon">⚠️</div>
          <div class="alert-item-body">
            <div class="alert-item-header">
              <b class="alert-item-title">${displayTitle}</b>
              ${proto ? `<span class="alert-item-proto">#${esc(proto)}</span>` : ''}
            </div>
            <div class="alert-item-sub">${esc(msg)}</div>
            ${pct < 100 ? `
              <div class="alert-progress-wrap">
                <div class="alert-progress-track">
                  <div class="alert-progress-fill" style="width:${Math.max(5, pct)}%"></div>
                </div>
                <span class="alert-progress-text">${pct}% preenchido</span>
              </div>
            ` : ''}
          </div>
          <div class="alert-item-action">
            <button class="btn-alert-action" type="button" data-open="${id}">
              <span>Continuar</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty">Tudo em dia. Nenhuma pendência identificada.</div>';
    wireButtons($('alertsList'));
  }
  
  function renderLists() {
    const q = String($('search')?.value || '').trim().toLowerCase();
    const hq = String($('historySearch')?.value || '').trim().toLowerCase();
    const matchesSearch = (r, queryStr) => {
      if (!queryStr) return true;
      const p = payload(r);
      const a = aux(r);
      const name = r.nomePaciente || r.paciente_nome || p.nomePaciente || a.nomePaciente || '';
      const proto = a.protocolo || p.protocolo || '';
      return `${r.atendimento || ''} ${name} ${proto} ${r.medico || ''} ${r.cid || ''} ${r.unidade || ''}`.toLowerCase().includes(queryStr);
    };

    let list = records.filter(r => matchesSearch(r, q))
      .sort((a, b) => String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')));
    $('allList').innerHTML = list.length ? list.map(rowHtml).join('') : '<div class="empty">Nenhum atendimento encontrado.</div>';
    wireButtons($('allList'));
    
    const pend = records.filter(isPending).sort((a, b) => Number(a.completude || 0) - Number(b.completude || 0));
    $('pendingList').innerHTML = pend.length ? pend.map(rowHtml).join('') : '<div class="empty">Nenhuma pendência encontrada.</div>';
    wireButtons($('pendingList'));
    
    let histPool = records.filter(r => r.status === 'FINALIZADO' || r.status === 'ARQUIVADO' || Boolean(r.ficha_esisla || payload(r).ficha_esisla || aux(r).fichaEsisla));
    if (!histPool.length && records.length) {
      histPool = records;
    }
    const hist = histPool.filter(r => matchesSearch(r, hq))
      .sort((a, b) => String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')))
      .slice(0, 60);
    $('historyList').innerHTML = hist.length ? hist.map(rowHtml).join('') : '<div class="empty">Nenhum registro concluído encontrado no histórico.</div>';
    wireButtons($('historyList'));
  }
  
  function renderCalendar() {
    const d = new Date();
    const month = d.getMonth();
    const year = d.getFullYear();
    $('agendaMonth').textContent = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const start = (first.getDay() + 6) % 7;
    let html = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map(x => `<div class="day-name">${x}</div>`).join('');
    for (let i = 0; i < start; i++) html += '<div></div>';
    for (let n = 1; n <= last.getDate(); n++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      const ev = records.filter(r => atdDate(r) === iso).slice(0, 2);
      html += `<div class="day ${iso === todayISO() ? 'today' : ''}">
        <div class="n">${n}</div>
        ${ev.map(r => `<div class="event" data-open="${esc(r.atendimento || r.id)}">${esc(atdTime(r) || '')}${atdTime(r) ? ' · ' : ''}${esc(r.atendimento || 'Atendimento')}</div>`).join('')}
      </div>`;
    }
    $('calendar').innerHTML = html;
    wireButtons($('calendar'));
  }

  let currentDoctorAgenda = [];
  let currentAgendaSelectedDate = todayISO();

  function renderDoctorAgendaCards(items) {
    if (!items.length) return '';
    return items.map(it => {
      const horaStr = esc(String(it.hora || '--:--').slice(0, 5));
      const nomeStr = esc(it.nome_periciado || 'Não informado');
      const protStr = esc(it.protocolo || '');
      const niStr = esc(it.ni || '');
      let tipoLabel = esc(it.tipo || 'LTS');
      if (it.tipo === 'LICENC') tipoLabel = 'Licença';
      else if (it.tipo === 'RECONS') tipoLabel = 'Recons.';
      else if (it.tipo === 'APOSENT') tipoLabel = 'Aposent.';
      const compareceu = it.compareceu && it.compareceu !== 'NÃO';
      const hasAtd = Boolean(it.atd_existente_numero || it.atd_existente_id);
      const atdNum = it.atd_existente_numero || it.atd_existente_id;
      const isFinalizado = it.atd_status === 'FINALIZADO' || it.status === 'FINALIZADO';
      const isAcomp = it.pessoa === 'Acompanhante' || it.is_acompanhante;
      const isRead = it.readaptado === 'Sim';

      return `
        <div class="agenda-item-card ${isFinalizado ? 'agenda-card-finalizado' : ''}">
          <div class="agenda-time-box">
            <span class="agenda-time-hour">${horaStr}</span>
            <span class="agenda-time-type">${tipoLabel}</span>
          </div>
          <div class="agenda-patient-info">
            <b class="agenda-patient-name" title="${nomeStr}">${nomeStr}</b>
            ${isRead ? `<span class="badge-tag amber">🔄 Readaptado</span>` : ''}
            ${isAcomp ? `<span class="badge-tag purple">👥 Acompanhante</span>` : ''}
            ${hasAtd && !isFinalizado ? `<span class="badge-tag linked">📄 Ficha Vinculada</span>` : ''}
            ${isFinalizado ? `<span class="badge-tag green-solid">✓ Laudo Concluído</span>` : ''}
          </div>
          <div class="agenda-patient-actions">
            ${isFinalizado ? `
              ${hasAtd ? `
                <button class="btn-esisla-doc" type="button" onclick="openDoctorEsisla('${esc(atdNum)}', false)" title="Abrir ou gerar Ficha e-Sisla deste atendimento">
                  📋 Ficha e-Sisla
                </button>
              ` : ''}
              <button class="btn-agenda-finalizado" type="button" disabled title="Atendimento finalizado - laudo concluído">
                🔒 Atendimento Concluído
              </button>
            ` : `
              ${compareceu ? `
                <span class="presence-confirmed-badge" title="Presença confirmada do periciado">
                  <span class="presence-dot"></span>
                  <span>Presente</span>
                </span>
              ` : `
                <button class="btn-agenda-presence" type="button" onclick="confirmarPresencaAgenda(${it.id})" title="Registrar chegada do periciado">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  <span>Confirmar Presença</span>
                </button>
              `}
              ${hasAtd ? `
                <button class="btn-agenda-open" type="button" onclick="iniciarAtendimentoAgenda('${esc(it.nome_periciado)}', '${esc(it.protocolo || '')}', '${esc(it.ni || '')}', '${esc(it.hora || '')}', '${esc(atdNum)}', ${Boolean(isAcomp)}, '${esc(it.readaptado || '')}', '${esc(it.atd_status || '')}')">
                  <span>Abrir Atendimento</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              ` : `
                <button class="btn-agenda-start" type="button" onclick="iniciarAtendimentoAgenda('${esc(it.nome_periciado)}', '${esc(it.protocolo || '')}', '${esc(it.ni || '')}', '${esc(it.hora || '')}', '', ${Boolean(isAcomp)}, '${esc(it.readaptado || '')}', '${esc(it.atd_status || '')}')">
                  <span>Iniciar</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              `}
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadDoctorDayAgenda(date) {
    currentAgendaSelectedDate = date || todayISO();
    if ($('doctorAgendaDateInput')) $('doctorAgendaDateInput').value = currentAgendaSelectedDate;
    const listEl = $('doctorAgendaList');
    const emptyEl = $('doctorAgendaEmpty');
    const badgeEl = $('doctorAgendaDayBadge');
    const dashListEl = $('dashboardAgendaList');
    const dashEmptyEl = $('dashboardAgendaEmpty');
    const dashBadgeEl = $('dashboardAgendaBadge');
    const dashSubEl = $('dashboardAgendaSub');

    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted)">Carregando agendamentos do dia…</div>';
    if (dashListEl) dashListEl.innerHTML = '<div style="text-align:center;padding:18px;color:var(--text-muted)">Carregando agenda de hoje…</div>';
    if (emptyEl) emptyEl.hidden = true;
    if (dashEmptyEl) dashEmptyEl.hidden = true;

    try {
      const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
      const params = { data: currentAgendaSelectedDate };
      if (impId) params.medico_id = impId;
      const res = await AmbientalAPI.medico.agenda(params);
      currentDoctorAgenda = Array.isArray(res?.itens) ? res.itens : [];
      const totalCount = currentDoctorAgenda.length;
      const presCount = currentDoctorAgenda.filter(it => it.compareceu && it.compareceu !== 'NÃO').length;
      const badgeText = `${totalCount} agendado(s)${presCount > 0 ? ` · ${presCount} presente(s)` : ''}`;
      if (badgeEl) badgeEl.textContent = badgeText;
      if (dashBadgeEl) dashBadgeEl.textContent = badgeText;
      if (dashSubEl) dashSubEl.textContent = `${totalCount} periciado(s) agendado(s) para ${dateDisplay(currentAgendaSelectedDate)} em ordem de horários.`;

      const cardsHtml = renderDoctorAgendaCards(currentDoctorAgenda);

      if (!currentDoctorAgenda.length) {
        if (listEl) listEl.innerHTML = '';
        if (dashListEl) dashListEl.innerHTML = '';
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.innerHTML = `Nenhum agendamento cadastrado para ${dateDisplay(currentAgendaSelectedDate)}.<br><small style="color:var(--text-muted);margin-top:4px;display:block">Os agendamentos são disponibilizados pela gestão administrativa.</small>`;
        }
        if (dashEmptyEl) {
          dashEmptyEl.hidden = false;
          dashEmptyEl.innerHTML = `Nenhum periciado agendado para ${dateDisplay(currentAgendaSelectedDate)}.`;
        }
        return;
      }

      if (emptyEl) emptyEl.hidden = true;
      if (dashEmptyEl) dashEmptyEl.hidden = true;
      if (listEl) listEl.innerHTML = cardsHtml;
      if (dashListEl) dashListEl.innerHTML = cardsHtml;
    } catch(err) {
      const errHtml = `<div style="text-align:center;padding:20px;color:var(--accent-red)">Erro ao carregar agenda: ${esc(err.message)}</div>`;
      if (listEl) listEl.innerHTML = errHtml;
      if (dashListEl) dashListEl.innerHTML = errHtml;
      showToast(err.message || 'Erro ao carregar agenda do dia.');
    }
  }

  function switchAgendaMode(mode) {
    const isDay = mode === 'day';
    $('btnAgendaToggleDay').style.background = isDay ? '#fff' : 'transparent';
    $('btnAgendaToggleDay').style.color = isDay ? 'var(--brand-blue)' : 'var(--text-muted)';
    $('btnAgendaToggleDay').style.fontWeight = isDay ? '800' : '600';
    $('btnAgendaToggleDay').style.boxShadow = isDay ? '0 1px 3px rgba(0,0,0,.08)' : 'none';

    $('btnAgendaToggleMonth').style.background = !isDay ? '#fff' : 'transparent';
    $('btnAgendaToggleMonth').style.color = !isDay ? 'var(--brand-blue)' : 'var(--text-muted)';
    $('btnAgendaToggleMonth').style.fontWeight = !isDay ? '800' : '600';
    $('btnAgendaToggleMonth').style.boxShadow = !isDay ? '0 1px 3px rgba(0,0,0,.08)' : 'none';

    $('agendaDaySection').hidden = !isDay;
    $('agendaMonthSection').hidden = isDay;

    if (isDay) {
      loadDoctorDayAgenda(currentAgendaSelectedDate);
    } else {
      renderCalendar();
    }
  }

  window.iniciarAtendimentoAgenda = function(nome, protocolo, ni, hora, atdNum) {
    const isAcomp = arguments[5];
    const readaptado = arguments[6];
    const statusAtd = arguments[7];
    if (statusAtd === 'FINALIZADO') {
      showToast('Este atendimento já foi concluído e finalizado. O acesso está bloqueado.');
      return;
    }
    const p = new URLSearchParams();
    if (atdNum) {
      p.set('atendimento', atdNum);
    } else {
      p.set('novo', '1');
    }
    if (nome && nome !== 'Não informado') p.set('paciente', nome);
    if (protocolo) p.set('protocolo', protocolo);
    if (ni) p.set('ni', ni);
    if (hora && hora !== '—') p.set('hora', hora);
    if (isAcomp) p.set('acompanhante', '1');
    if (readaptado) p.set('readaptado', readaptado);
    const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
    if (impId) p.set('medico_id', impId);
    location.href = '/app?' + p.toString();
  };

  window.confirmarPresencaAgenda = async function(id) {
    try {
      const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
      const payload = { compareceu: 'SIM' };
      if (impId) payload.medico_id = impId;
      await AmbientalAPI.medico.updateAgendaStatus(id, payload);
      showToast('Presença confirmada.');
      await loadDoctorDayAgenda(currentAgendaSelectedDate);
    } catch(e) {
      showToast(e.message || 'Erro ao registrar presença.');
    }
  };
  window.toggleComparecimentoAgenda = window.confirmarPresencaAgenda;

  window.openAgendaDoDiaModal = async function() {
    const modal = $('modalAgendaDoDia');
    if (!modal) return;
    modal.style.display = 'grid';
    const today = todayISO();
    $('modalAgendaDoDiaTitle').textContent = `Agenda do Dia — ${dateDisplay(today)}`;
    $('modalAgendaDoDiaSub').textContent = 'Carregando agendamentos em ordem de horários…';
    $('modalAgendaDoDiaList').innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">Consultando agenda de hoje…</div>';
    $('modalAgendaDoDiaEmpty').hidden = true;

    try {
      const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
      const params = { data: today };
      if (impId) params.medico_id = impId;
      const res = await AmbientalAPI.medico.agenda(params);
      const items = Array.isArray(res?.itens) ? res.itens : [];
      $('modalAgendaDoDiaSub').textContent = `${items.length} periciado(s) agendado(s) para hoje em ordem cronológica.`;
      if (!items.length) {
        $('modalAgendaDoDiaList').innerHTML = '';
        $('modalAgendaDoDiaEmpty').hidden = false;
        return;
      }
      $('modalAgendaDoDiaEmpty').hidden = true;
      $('modalAgendaDoDiaList').innerHTML = renderDoctorAgendaCards(items);
    } catch(err) {
      $('modalAgendaDoDiaList').innerHTML = `<div style="text-align:center;color:var(--accent-red)">Erro ao carregar agenda: ${esc(err.message)}</div>`;
    }
  };

  window.closeAgendaDoDiaModal = function() {
    if ($('modalAgendaDoDia')) $('modalAgendaDoDia').style.display = 'none';
  };

  /* --- IMPORTAR E VINCULAR E-SISLA (PDF) EM LOTE À AGENDA DO DIA --- */
  let selectedEsislaBatchFiles = [];

  window.abrirModalImportarEsislaAgenda = function() {
    const modal = $('modalImportarEsislaAgenda');
    if (!modal) return;
    
    // Configurar dados na modal
    const dateFormatted = dateDisplay(currentAgendaSelectedDate || todayISO());
    if ($('esislaAgendaDataLabel')) $('esislaAgendaDataLabel').textContent = dateFormatted;
    
    const impNome = sessionStorage.getItem('ambiental.impersonate_medico_nome');
    const docNome = impNome || $('doctorName')?.textContent || 'Médico Perito';
    if ($('esislaAgendaDoctorLabel')) $('esislaAgendaDoctorLabel').textContent = docNome;

    // Resetar estado
    limparFilaEsisla();
    if ($('esislaProgressArea')) $('esislaProgressArea').style.display = 'none';
    if ($('esislaResultsReport')) $('esislaResultsReport').style.display = 'none';

    modal.style.display = 'grid';
  };

  window.fecharModalImportarEsislaAgenda = function() {
    const modal = $('modalImportarEsislaAgenda');
    if (modal) modal.style.display = 'none';
    // Atualizar agenda para refletir novos atendimentos vinculados
    loadDoctorDayAgenda(currentAgendaSelectedDate);
  };

  window.limparFilaEsisla = function() {
    selectedEsislaBatchFiles = [];
    if ($('esislaBatchFileInput')) $('esislaBatchFileInput').value = '';
    if ($('esislaFilesCount')) $('esislaFilesCount').textContent = '0';
    if ($('esislaFilesList')) $('esislaFilesList').innerHTML = '';
    if ($('esislaFilesQueueArea')) $('esislaFilesQueueArea').style.display = 'none';
    if ($('btnExecutarVinculacaoEsisla')) {
      $('btnExecutarVinculacaoEsisla').disabled = true;
      $('btnExecutarVinculacaoEsisla').innerHTML = '<span>⚡ Processar e Vincular à Agenda</span>';
    }
  };

  window.onEsislaBatchFilesSelected = function(files) {
    if (!files || !files.length) return;
    const newFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (!newFiles.length) {
      showToast('Por favor, selecione arquivos em formato PDF (.pdf).');
      return;
    }
    
    // Adicionar evitando duplicados por nome e tamanho
    newFiles.forEach(nf => {
      if (!selectedEsislaBatchFiles.some(ef => ef.name === nf.name && ef.size === nf.size)) {
        selectedEsislaBatchFiles.push(nf);
      }
    });

    renderEsislaFilesQueue();
  };

  function renderEsislaFilesQueue() {
    const queueArea = $('esislaFilesQueueArea');
    const countEl = $('esislaFilesCount');
    const listEl = $('esislaFilesList');
    const btn = $('btnExecutarVinculacaoEsisla');
    if (!queueArea || !countEl || !listEl || !btn) return;

    countEl.textContent = selectedEsislaBatchFiles.length;
    if (!selectedEsislaBatchFiles.length) {
      queueArea.style.display = 'none';
      btn.disabled = true;
      return;
    }

    queueArea.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = `<span>⚡ Processar e Vincular ${selectedEsislaBatchFiles.length} PDF(s) à Agenda</span>`;

    listEl.innerHTML = selectedEsislaBatchFiles.map((f, idx) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-radius:6px;background:#f8fafc;border:1px solid #e2e8f0;font-size:11px">
        <div style="display:flex;align-items:center;gap:6px;overflow:hidden">
          <span>📄</span>
          <b style="color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px">${esc(f.name)}</b>
          <span style="color:var(--text-muted);font-size:10px">(${(f.size/1024).toFixed(0)} KB)</span>
        </div>
        <button type="button" class="btn-sm" style="padding:2px 6px;color:var(--accent-red);border:none;background:transparent;cursor:pointer" onclick="removerArquivoEsislaFila(${idx})" title="Remover">✕</button>
      </div>
    `).join('');
  }

  window.removerArquivoEsislaFila = function(idx) {
    selectedEsislaBatchFiles.splice(idx, 1);
    renderEsislaFilesQueue();
  };

  // Configurar Drag & Drop no dropzone
  const initEsislaDropzone = () => {
    const dz = $('esislaDropzone');
    if (!dz) return;
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.style.borderColor = 'var(--brand-blue)';
      dz.style.background = '#eff6ff';
    });
    dz.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dz.style.borderColor = '#93c5fd';
      dz.style.background = '#f8fafc';
    });
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.style.borderColor = '#93c5fd';
      dz.style.background = '#f8fafc';
      if (e.dataTransfer?.files) {
        onEsislaBatchFilesSelected(e.dataTransfer.files);
      }
    });
  };

  window.executarVinculacaoBatchEsisla = async function() {
    if (!selectedEsislaBatchFiles.length) {
      showToast('Selecione pelo menos um arquivo PDF do e-SISLA.');
      return;
    }

    const btn = $('btnExecutarVinculacaoEsisla');
    const progArea = $('esislaProgressArea');
    const progBar = $('esislaProgressBar');
    const progText = $('esislaProgressStatus');
    const progPct = $('esislaProgressPercent');

    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Processando arquivos…</span>';
    progArea.style.display = 'block';
    progBar.style.width = '35%';
    progPct.textContent = '35%';
    progText.textContent = `Lendo e interpretando ${selectedEsislaBatchFiles.length} arquivo(s) PDF do e-SISLA…`;

    try {
      const formData = new FormData();
      selectedEsislaBatchFiles.forEach(f => formData.append('files', f));
      formData.append('data', currentAgendaSelectedDate || todayISO());
      
      const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
      if (impId) formData.append('medico_id', impId);

      progBar.style.width = '65%';
      progPct.textContent = '65%';
      progText.textContent = 'Cruzando nomes e protocolos com a agenda pericial do dia…';

      const res = await AmbientalAPI.esisla.vincularAgendaBatch(formData);

      progBar.style.width = '100%';
      progPct.textContent = '100%';
      progText.textContent = 'Concluído com sucesso!';

      const itens = res?.itens || [];
      const vinculados = res?.total_vinculados || 0;
      const naoEncontrados = res?.total_nao_encontrados || 0;

      // Exibir relatório de resultados
      $('esislaResultsReport').style.display = 'block';
      $('esislaVinculadosBadge').textContent = `${vinculados} vinculado(s)`;
      $('esislaNaoEncontradosBadge').textContent = `${naoEncontrados} não encontrado(s)`;
      $('esislaNaoEncontradosBadge').style.display = naoEncontrados > 0 ? 'inline-flex' : 'none';

      $('esislaResultsTbody').innerHTML = itens.map(it => {
        const isOk = it.status === 'vinculado';
        const statusBadge = isOk 
          ? '<span class="badge green" style="font-weight:800">✓ Vinculado</span>' 
          : '<span class="badge" style="background:#fee2e2;color:#991b1b;font-weight:800">⚠️ Não achou</span>';
        
        const camposBadges = (it.campos_adiantados || []).map(c => 
          `<span style="background:#f1f5f9;color:#334155;padding:1px 5px;border-radius:4px;font-size:9.5px;font-weight:700">${esc(c)}</span>`
        ).join(' ');

        return `
          <tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:8px 12px">${statusBadge}</td>
            <td style="padding:8px 12px"><b style="color:var(--text-primary)">${esc(it.arquivo)}</b></td>
            <td style="padding:8px 12px"><b style="color:var(--brand-blue)">${esc(it.periciado)}</b></td>
            <td style="padding:8px 12px">${isOk ? `<span>Horário <b>${esc(it.hora)}</b></span>` : `<span style="color:var(--text-muted)">Sem agendamento hoje</span>`}</td>
            <td style="padding:8px 12px"><div style="display:flex;gap:4px;flex-wrap:wrap">${camposBadges || '<span style="color:var(--text-muted)">—</span>'}</div></td>
          </tr>
        `;
      }).join('');

      showToast(`Sucesso! ${vinculados} periciado(s) vinculados e adiantados na agenda.`);
      btn.innerHTML = '<span>✓ Concluído</span>';
      
      // Atualizar lista em tempo real
      await loadDoctorDayAgenda(currentAgendaSelectedDate);
    } catch(err) {
      progText.textContent = `Erro: ${err.message}`;
      progBar.style.background = 'var(--accent-red)';
      showToast(err.message || 'Erro ao processar lote de arquivos e-SISLA.');
      btn.disabled = false;
      btn.innerHTML = '<span>Tentar novamente</span>';
    }
  };

  function shiftDay(delta) {
    const parts = (currentAgendaSelectedDate || todayISO()).split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + delta);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    currentAgendaSelectedDate = `${d.getFullYear()}-${m}-${day}`;
    loadDoctorDayAgenda(currentAgendaSelectedDate);
  }

  $('btnAgendaToggleDay').onclick = () => switchAgendaMode('day');
  $('btnAgendaToggleMonth').onclick = () => switchAgendaMode('month');
  $('btnAgendaHojeTop').onclick = () => {
    currentAgendaSelectedDate = todayISO();
    switchAgendaMode('day');
  };
  $('btnAgendaPrevDay').onclick = () => shiftDay(-1);
  $('btnAgendaNextDay').onclick = () => shiftDay(1);
  $('btnAgendaToday').onclick = () => {
    currentAgendaSelectedDate = todayISO();
    loadDoctorDayAgenda(currentAgendaSelectedDate);
  };
  $('doctorAgendaDateInput').onchange = (e) => {
    if (e.target.value) {
      currentAgendaSelectedDate = e.target.value;
      loadDoctorDayAgenda(currentAgendaSelectedDate);
    }
  };
  $('btnRefreshDoctorAgenda').onclick = () => loadDoctorDayAgenda(currentAgendaSelectedDate);

  $('heroAgendaDiaBtn').onclick = () => {
    setView('agenda');
    switchAgendaMode('day');
  };
  $('quickAgendaDia').onclick = () => {
    setView('agenda');
    switchAgendaMode('day');
  };

  function updateDoctorPaginationUI() {
    const info = $('pageInfo');
    if (info) {
      if (totalItems === 0) {
        info.innerHTML = 'Nenhum atendimento';
      } else {
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalItems);
        info.innerHTML = `Exibindo <b>${start}–${end}</b> de <b>${totalItems}</b> atendimentos`;
      }
    }
    const prevBtn = $('prevPageBtn');
    const nextBtn = $('nextPageBtn');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    const numWrap = $('doctorPageNumbers');
    if (numWrap) {
      let html = '';
      const pages = [];
      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
          pages.push(i);
        }
      }
      let lastP = 0;
      for (const p of pages) {
        if (lastP && p - lastP > 1) {
          html += `<span class="page-ellipsis">…</span>`;
        }
        const activeCls = p === currentPage ? ' active' : '';
        html += `<button type="button" class="page-num-btn${activeCls}" onclick="window.goToDoctorPage(${p})">${p}</button>`;
        lastP = p;
      }
      numWrap.innerHTML = html;
    }
  }

  window.goToDoctorPage = async function(p) {
    if (p < 1 || p > totalPages || p === currentPage) return;
    currentPage = p;
    await fetchPageRecords();
    const el = $('view-atendimentos');
    if (el) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_) {}
    }
  };

  async function fetchPageRecords() {
    try {
      const bar = $('topSyncBar');
      if (bar) bar.classList.add('active');
      const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
      const atdParams = { page: currentPage, page_size: pageSize };
      if (impId) atdParams.medico_id = impId;
      const list = await AmbientalAPI.medico.atendimentos(atdParams);
      records = Array.isArray(list?.items) ? list.items : [];
      totalItems = Number(list?.total || records.length);
      totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      renderLists();
      updateDoctorPaginationUI();
    } catch(e) {
      showToast(e.message || 'Erro ao carregar atendimentos.');
    } finally {
      const bar = $('topSyncBar');
      if (bar) bar.classList.remove('active');
    }
  }

  async function load() {
    const status = $('syncStatus');
    const bar = $('topSyncBar');
    if (bar) bar.classList.add('active');
    if ($('refreshBtn')) $('refreshBtn').classList.add('spin-btn');
    status.innerHTML = '<i style="background:#d7a848"></i> Sincronizando...';
    try {
      const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
      const atdParams = { page: currentPage, page_size: pageSize };
      if (impId) atdParams.medico_id = impId;
      const dashParams = impId ? { medico_id: impId } : {};
      const [dash, list] = await Promise.all([
        AmbientalAPI.medico.dashboard(dashParams),
        AmbientalAPI.medico.atendimentos(atdParams)
      ]);
      dashboard = dash || {};
      records = Array.isArray(list?.items) ? list.items : [];
      totalItems = Number(list?.total || records.length);
      totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      try {
        const cKey = 'ambiental.medico.dashboard_cache_' + (sessionStorage.getItem('ambiental.impersonate_medico_id') || profile?.id || '');
        localStorage.setItem(cKey, JSON.stringify({ dash: dashboard, list: records, total: totalItems, ts: Date.now() }));
      } catch (_) {}
      
      renderKpis();
      renderBars();
      renderDonut();
      renderUpcoming();
      renderAlerts();
      renderLists();
      renderCalendar();
      loadDoctorDayAgenda(currentAgendaSelectedDate);
      
      updateDoctorPaginationUI();
      
      status.innerHTML = '<i></i> Sincronizado';
    } catch(e) {
      status.innerHTML = '<i style="background:#c53c49"></i> Erro de sincronização';
      showToast(e.message || 'Não foi possível carregar os dados.');
    } finally {
      if (bar) bar.classList.remove('active');
      if ($('refreshBtn')) $('refreshBtn').classList.remove('spin-btn');
    }
  }

  $('prevPageBtn').onclick = async () => {
    if (currentPage > 1) {
      currentPage--;
      await fetchPageRecords();
    }
  };

  $('nextPageBtn').onclick = async () => {
    if (currentPage < totalPages) {
      currentPage++;
      await fetchPageRecords();
    }
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeQuickView();
      closeDoctorEsislaModal();
      closeAgendaDoDiaModal();
      fecharModalImportarEsislaAgenda();
      fecharModalExtensaoEsislaDoctor();
    }
  });
  $('quickViewModal').addEventListener('click', e => {
    if (e.target === $('quickViewModal')) closeQuickView();
  });
  $('esislaDoctorModal')?.addEventListener('click', e => {
    if (e.target === $('esislaDoctorModal')) closeDoctorEsislaModal();
  });
  $('modalExtensaoEsislaDoctor')?.addEventListener('click', e => {
    if (e.target === $('modalExtensaoEsislaDoctor')) fecharModalExtensaoEsislaDoctor();
  });
  $('modalAgendaDoDia').addEventListener('click', e => {
    if (e.target === $('modalAgendaDoDia')) closeAgendaDoDiaModal();
  });
  $('modalImportarEsislaAgenda')?.addEventListener('click', e => {
    if (e.target === $('modalImportarEsislaAgenda')) fecharModalImportarEsislaAgenda();
  });

  initEsislaDropzone();

  window.sairModoImpersonate = function() {
    sessionStorage.removeItem('ambiental.impersonate_medico_id');
    sessionStorage.removeItem('ambiental.impersonate_medico_nome');
    sessionStorage.removeItem('ambiental.impersonate_medico_crm');
    location.href = '/gestao';
  };

  async function start() {
    // 🚀 Hidratação instantânea via cache local (0ms - exibe a tela imediatamente antes de qualquer chamada de rede)
    let hadLocalCache = false;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlImpersonateId = urlParams.get('impersonate_medico_id') || urlParams.get('impersonate');
      if (urlImpersonateId) {
        sessionStorage.setItem('ambiental.impersonate_medico_id', urlImpersonateId);
      }
      const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
      let currentDocId = impId || '';
      if (!currentDocId) {
        const pRaw = sessionStorage.getItem('ambiental.auth.profile') || localStorage.getItem('ambiental.auth.profile');
        if (pRaw) {
          const pObj = JSON.parse(pRaw);
          currentDocId = pObj?.profile?.id || pObj?.id || '';
        }
      }
      const cacheKey = 'ambiental.medico.dashboard_cache_' + currentDocId;
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && cached.dash && Array.isArray(cached.list) && cached.list.length > 0) {
          dashboard = cached.dash;
          records = cached.list;
          totalItems = Number(cached.total || records.length);
          totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
          renderKpis();
          renderBars();
          renderDonut();
          renderUpcoming();
          renderAlerts();
          renderLists();
          renderCalendar();
          updateDoctorPaginationUI();
          $('appShell').hidden = false;
          $('authLoading')?.remove();
          hadLocalCache = true;
        }
      }
    } catch (_) {}

    try {
      if (!hadLocalCache) {
        updateSyncLoader('Validando Sessão Médica', 'Confirmando autenticação pericial segura…', 'Conectando ao serviço de autenticação...', 25);
      }
      profile = await AmbientalAuth.requireAuth({ area: 'portal-medico' });
      if (profile?.perfil !== 'Médico' && !['Administrador', 'Gestor', 'Coordenador'].includes(profile?.perfil)) {
        location.replace('/acesso-negado.html?area=portal-medico');
        return;
      }

      // Tratamento de Impersonate Administrativo
      const urlParams = new URLSearchParams(window.location.search);
      const urlImpersonateId = urlParams.get('impersonate_medico_id') || urlParams.get('impersonate');
      if (urlImpersonateId) {
        sessionStorage.setItem('ambiental.impersonate_medico_id', urlImpersonateId);
      }
      const impersonateId = sessionStorage.getItem('ambiental.impersonate_medico_id');
      const isAdminOrImpersonating = ['Administrador', 'Gestor', 'Coordenador'].includes(profile?.perfil) || 
                                    ['Administrador', 'Gestor', 'Coordenador'].includes(profile?.perfilOriginal);
      const isImpersonating = !!impersonateId && isAdminOrImpersonating;

      if (isImpersonating) {
        // Aplica imediatamente as credenciais do médico selecionado em cache
        const cachedNome = sessionStorage.getItem('ambiental.impersonate_medico_nome');
        const cachedCrm = sessionStorage.getItem('ambiental.impersonate_medico_crm');
        profile = {
          ...profile,
          id: impersonateId,
          nome: cachedNome || profile.nome,
          crm: cachedCrm || profile.crm || '',
          perfilOriginal: profile.perfilOriginal || profile.perfil,
          perfil: 'Médico'
        };

        try {
          const res = await (window.AmbientalAPI?.admin?.medicosListaImpersonate 
            ? window.AmbientalAPI.admin.medicosListaImpersonate() 
            : AmbientalAuth.authFetch('/api/admin/medicos/lista-impersonate').then(r => r.json()));
          const medicos = res?.items || res?.data?.items || [];
          const med = medicos.find(m => String(m.id) === String(impersonateId) || (cachedCrm && String(m.crm) === String(cachedCrm)));
          if (med) {
            sessionStorage.setItem('ambiental.impersonate_medico_id', String(med.id));
            sessionStorage.setItem('ambiental.impersonate_medico_nome', med.nome || '');
            sessionStorage.setItem('ambiental.impersonate_medico_crm', med.crm || '');
            profile = {
              ...profile,
              id: med.id,
              nome: med.nome,
              crm: med.crm || '',
              email: med.email || profile.email,
              modo_atendimento: med.modo_atendimento || profile.modo_atendimento || 'agil',
              perfilOriginal: profile.perfilOriginal || 'Administrador',
              perfil: 'Médico'
            };
          }
        } catch (_) {}

        const warnBanner = $('impersonateWarningBanner');
        const docLabel = $('impersonateDoctorLabel');
        if (warnBanner) warnBanner.style.display = 'block';
        if (docLabel) {
          const nom = profile.nome || sessionStorage.getItem('ambiental.impersonate_medico_nome') || `Dr(a). ID ${impersonateId}`;
          const crm = profile.crm || sessionStorage.getItem('ambiental.impersonate_medico_crm');
          docLabel.textContent = `${nom} ${crm ? '(CRM ' + crm + ')' : ''}`;
        }
      }

      setIdentity();

      if (!hadLocalCache) {
        updateSyncLoader('Sincronizando Atendimentos', 'Carregando agenda, laudos e indicadores periciais…', 'Buscando registros autorizados no prontuário...', 65);
      }
      await load();
      
      if (!hadLocalCache) {
        updateSyncLoader('Portal Sincronizado', 'Tudo pronto! Carregando seu painel pericial…', 'Liberando tela...', 100);
        setTimeout(() => {
          $('appShell').hidden = false;
          const loader = $('authLoading');
          if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => loader.remove(), 420);
          }
        }, 200);
      }
    } catch(e) {
      if (e.message !== 'AUTH_REQUIRED' && e.message !== 'PERMISSION_DENIED') {
        showToast('Não foi possível iniciar o Portal Médico.');
        $('appShell').hidden = false;
        $('authLoading')?.remove();
      }
    }
  }

  document.querySelectorAll('.nav button[data-view]').forEach(b => b.onclick = () => {
    setView(b.dataset.view);
    if (b.dataset.view === 'agenda') {
      loadDoctorDayAgenda(currentAgendaSelectedDate);
    }
  });
  document.querySelectorAll('[data-view-target]').forEach(b => b.onclick = () => {
    setView(b.dataset.viewTarget);
    if (b.dataset.viewTarget === 'agenda') {
      loadDoctorDayAgenda(currentAgendaSelectedDate);
    }
  });
  const edgeBtn = $('sidebarEdgeToggleBtn');
  if (edgeBtn) edgeBtn.onclick = () => toggleSidebar();
  const topbarToggle = $('topbarToggleBtn');
  if (topbarToggle) topbarToggle.onclick = () => toggleSidebar();
  $('refreshBtn').onclick = load;
  $('search').oninput = renderLists;
  if ($('historySearch')) $('historySearch').oninput = renderLists;
  $('logoutBtn').onclick = () => {
    sessionStorage.removeItem('ambiental.impersonate_medico_id');
    sessionStorage.removeItem('ambiental.impersonate_medico_nome');
    sessionStorage.removeItem('ambiental.impersonate_medico_crm');
    AmbientalAuth.logout();
  };
  const getNovoAtendimentoUrl = () => {
    const impId = sessionStorage.getItem('ambiental.impersonate_medico_id');
    return impId ? `/app?novo=1&medico_id=${encodeURIComponent(impId)}` : '/app?novo=1';
  };
  $('newBtn').onclick = () => location.href = getNovoAtendimentoUrl();
  $('quickNew').onclick = () => location.href = getNovoAtendimentoUrl();
  if ($('iaBtn')) {
    $('iaBtn').onclick = () => {
      const r = records.find(x => x.status !== 'FINALIZADO' && x.status !== 'ARQUIVADO');
      if (r) openRecord(r);
      else showToast('Não há atendimento aberto para iniciar a assistência inteligente.');
    };
  }
  $('goAdmin').onclick = () => {
    if (sessionStorage.getItem('ambiental.impersonate_medico_id')) {
      window.sairModoImpersonate();
    } else {
      location.href = '/gestao';
    }
  };
  start();
  setTimeout(() => {
    const loader = $('authLoading');
    if (loader) {
      loader.remove();
      if ($('appShell')) $('appShell').hidden = false;
    }
  }, 4000);
})();
