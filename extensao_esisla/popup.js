// Script de controle do Popup da Extensão (Buffer e Fila Inteligente)

document.addEventListener('DOMContentLoaded', () => {
  const cardComFicha = document.getElementById('cardComFicha');
  const cardSemFicha = document.getElementById('cardSemFicha');
  const badgeProtocol = document.getElementById('badgeProtocol');
  const badgeParecer = document.getElementById('badgeParecer');
  const cardPatient = document.getElementById('cardPatient');
  const detailCid1 = document.getElementById('detailCid1');
  const detailDias = document.getElementById('detailDias');
  const detailCid2 = document.getElementById('detailCid2');
  const btnPreencherAbaAtiva = document.getElementById('btnPreencherAbaAtiva');
  const btnColarClipboard = document.getElementById('btnColarClipboard');
  const statusQueueBadge = document.getElementById('statusQueueBadge');
  const headerStatusChip = document.getElementById('headerStatusChip');
  const sectionQueue = document.getElementById('sectionQueue');
  const queueCount = document.getElementById('queueCount');
  const queueList = document.getElementById('queueList');
  const btnLimparFila = document.getElementById('btnLimparFila');
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  const popupToast = document.getElementById('popupToast');
  const popupToastIcon = document.getElementById('popupToastIcon');
  const popupToastMsg = document.getElementById('popupToastMsg');
  const queueSearchInput = document.getElementById('queueSearchInput');
  const cntAll = document.getElementById('cntAll');
  const cntPend = document.getElementById('cntPend');
  const cntDone = document.getElementById('cntDone');
  const queueTabs = document.querySelectorAll('.q-tab');

  let currentPayload = null;
  let currentQueue = [];
  let activeFilter = 'all';
  let searchQuery = '';
  let toastTimer = null;
  let clearConfirmTimer = null;

  function applyTheme(dark) {
    document.documentElement.classList.toggle('theme-dark', Boolean(dark));
    try { localStorage.setItem('ambiental_ext_theme', dark ? 'dark' : 'light'); } catch (_) {}
  }

  try {
    applyTheme(localStorage.getItem('ambiental_ext_theme') === 'dark');
  } catch (_) {}

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const nextDark = !document.documentElement.classList.contains('theme-dark');
      applyTheme(nextDark);
    });
  }

  const btnDisplayMode = document.getElementById('btnDisplayMode');
  let currentDisplayMode = 'sidepanel';

  function applyDisplayModeUI(mode) {
    currentDisplayMode = mode === 'popup' ? 'popup' : 'sidepanel';
    document.documentElement.classList.toggle('mode-popup', currentDisplayMode === 'popup');
    if (btnDisplayMode) {
      btnDisplayMode.title = currentDisplayMode === 'popup'
        ? 'Modo atual: Popup normal (clique para mudar para Side Panel)'
        : 'Modo atual: Side Panel (clique para mudar para Popup normal)';
    }
  }

  chrome.storage.local.get(['ambiental_ext_display_mode'], (res) => {
    applyDisplayModeUI(res.ambiental_ext_display_mode || 'sidepanel');
  });

  if (btnDisplayMode) {
    btnDisplayMode.addEventListener('click', () => {
      const nextMode = currentDisplayMode === 'popup' ? 'sidepanel' : 'popup';
      chrome.runtime.sendMessage({ action: 'SET_DISPLAY_MODE', mode: nextMode }, () => {
        applyDisplayModeUI(nextMode);
        showToast('info', nextMode === 'popup'
          ? 'Alterado para Popup normal. Reabra pelo ícone da extensão.'
          : 'Alterado para Side Panel. Reabra pelo ícone da extensão.');
      });
    });
  }

  function showToast(type, msg) {
    if (!popupToast || !popupToastMsg || !popupToastIcon) return;
    popupToast.className = `popup-toast ${type || 'info'}`;
    popupToastIcon.textContent = type === 'success' ? '✓' : (type === 'error' ? '!' : 'i');
    popupToastMsg.textContent = msg;
    popupToast.style.display = 'flex';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      popupToast.style.display = 'none';
    }, 3600);
  }

  function sanitizarNomeServidor(rawName) {
    const s = String(rawName || '').trim();
    if (!s || s.length > 90) return '';
    if (/^(?:de\s+\d+\s+anos|relatou\b|n[ãa]o\s+readaptad|com\s+queixa\b|servidor(?:\(a\))?\s+de\s+\d+)/i.test(s)) return '';
    if (/\b(?:relatou\s+n[ãa]o\s+ser\s+readaptad|com\s+queixa\s+de|em\s+acompanhamento)\b/i.test(s)) return '';
    return s;
  }

  const detailDataIni = document.getElementById('detailDataIni');
  const btnTogglePreview = document.getElementById('btnTogglePreview');
  const laudoPreviewBox = document.getElementById('laudoPreviewBox');
  const queueProgressText = document.getElementById('queueProgressText');
  const queueProgressPct = document.getElementById('queueProgressPct');
  const queueProgressFill = document.getElementById('queueProgressFill');
  const btnHeroLabel = document.getElementById('btnHeroLabel');

  function renderLaudoPreview(payload) {
    if (!laudoPreviewBox) return;
    if (!payload) {
      laudoPreviewBox.innerHTML = '';
      return;
    }
    const c = payload.campos_esisla || payload;
    const blocos = [
      { label: 'Queixa e Duração', text: c['voMedico.parRlCat'] || payload.queixa || '' },
      { label: 'Antecedentes Mórbidos', text: c['voMedico.parRlAp'] || payload.antecedentes || '' },
      { label: 'Exame Físico Geral', text: c['voMedico.parRlExApres'] || payload.exame_fisico || '' },
      { label: 'Limitações', text: c['voMedico.parRlReqExComp'] || payload.limitacoes || '' },
      { label: 'Justificativa', text: c['voMedico.parRlComp'] || payload.justificativa || '' }
    ].filter(b => String(b.text || '').trim().length > 0);

    if (blocos.length === 0) {
      laudoPreviewBox.innerHTML = '<div class="activity-empty">Sem texto detalhado disponível nesta ficha.</div>';
      return;
    }

    laudoPreviewBox.innerHTML = blocos.map((b, i) => `
      <div class="preview-block">
        <div class="preview-block-head">
          <strong>${b.label}</strong>
          <button type="button" class="btn-copy-mini" data-copy-idx="${i}">Copiar</button>
        </div>
        <div class="preview-block-text">${String(b.text).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]))}</div>
      </div>
    `).join('');

    laudoPreviewBox.querySelectorAll('.btn-copy-mini').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.copyIdx);
        const txt = blocos[idx] ? String(blocos[idx].text) : '';
        try {
          await navigator.clipboard.writeText(txt);
          showToast('success', `${blocos[idx].label} copiado!`);
        } catch (_) {
          showToast('error', 'Não foi possível copiar.');
        }
      });
    });
  }

  if (btnTogglePreview && laudoPreviewBox) {
    btnTogglePreview.addEventListener('click', () => {
      const isOpen = btnTogglePreview.getAttribute('aria-expanded') === 'true';
      btnTogglePreview.setAttribute('aria-expanded', String(!isOpen));
      laudoPreviewBox.style.display = isOpen ? 'none' : 'flex';
    });
  }

  if (badgeProtocol) {
    badgeProtocol.addEventListener('click', async () => {
      const proto = String(badgeProtocol.textContent || '').trim();
      if (!proto || proto === '#00000') return;
      try {
        await navigator.clipboard.writeText(proto);
        showToast('success', `Protocolo ${proto} copiado!`);
      } catch (_) {}
    });
  }

  function renderCard(payload) {
    currentPayload = payload;
    if (payload && payload.protocolo) {
      cardComFicha.style.display = 'block';
      cardSemFicha.style.display = 'none';

      badgeProtocol.textContent = payload.protocolo;

      const isFav = (payload['voResult.voParecerFinal.flPfinal'] === 'F' || payload.parecer === 'FAVORÁVEL');
      badgeParecer.textContent = isFav ? 'Favorável' : 'Contrário';
      badgeParecer.className = 'badge-parecer ' + (isFav ? 'favoravel' : 'contrario');

      const pac = sanitizarNomeServidor(payload.servidor || payload.paciente) || 'Servidor';
      cardPatient.textContent = pac;
      cardPatient.title = pac;

      const c1 = payload.cdCidPm || payload['voResult.voParecerFinal.cdCidPm'] || '—';
      const c2 = payload.cdCid2Pm || payload['voResult.voParecerFinal.cdCid2Pm'] || 'Não informado';
      const d = payload['voResult.voParecerFinal.qtDiasPm'] || payload.dias || '0';
      const dtIni = payload['voResult.voParecerFinal.dtIniPm'] || payload.data_inicio || '—';

      detailCid1.textContent = c1;
      detailCid2.textContent = c2;
      detailDias.textContent = d + ' dias';
      if (detailDataIni) detailDataIni.textContent = dtIni;
      renderLaudoPreview(payload);
    } else {
      cardComFicha.style.display = 'none';
      cardSemFicha.style.display = currentQueue.length === 0 ? 'block' : 'none';
    }
  }

  function renderFila(fila) {
    currentQueue = Array.isArray(fila) ? fila : [];

    if (currentQueue.length > 0) {
      sectionQueue.style.display = 'block';
      queueCount.textContent = currentQueue.length;
      statusQueueBadge.textContent = `${currentQueue.length} na fila`;
      if (headerStatusChip) headerStatusChip.classList.add('has-items');

      const pendCount = currentQueue.filter(it => it.status !== 'preenchido').length;
      const doneCount = currentQueue.filter(it => it.status === 'preenchido').length;
      const pct = Math.round((doneCount / currentQueue.length) * 100);
      if (queueProgressText) queueProgressText.textContent = `${doneCount} de ${currentQueue.length} preenchido(s)`;
      if (queueProgressPct) queueProgressPct.textContent = `${pct}%`;
      if (queueProgressFill) queueProgressFill.style.width = `${pct}%`;

      if (cntAll) cntAll.textContent = currentQueue.length;
      if (cntPend) cntPend.textContent = pendCount;
      if (cntDone) cntDone.textContent = doneCount;
      if (queueSearchInput) {
        queueSearchInput.style.display = currentQueue.length >= 3 ? 'block' : 'none';
      }

      const qNorm = searchQuery.trim().toLowerCase();
      const filtered = currentQueue
        .map((it, idx) => ({ it, idx }))
        .filter(({ it }) => {
          if (activeFilter === 'pendente' && it.status === 'preenchido') return false;
          if (activeFilter === 'preenchido' && it.status !== 'preenchido') return false;
          if (qNorm) {
            const pac = (sanitizarNomeServidor(it.servidor || it.paciente) || '').toLowerCase();
            const proto = String(it.protocolo || '').toLowerCase();
            return pac.includes(qNorm) || proto.includes(qNorm);
          }
          return true;
        });

      if (filtered.length === 0) {
        queueList.innerHTML = '<div class="queue-empty-filtered">Nenhum laudo corresponde ao filtro atual.</div>';
      } else {
        queueList.innerHTML = filtered.map(({ it, idx }) => {
          const isSelected = currentPayload && String(currentPayload.protocolo || '') === String(it.protocolo || '');
          const isDone = it.status === 'preenchido';
          const pac = sanitizarNomeServidor(it.servidor || it.paciente) || 'Servidor';
          return `
            <div class="popup-queue-item ${isSelected ? 'selected' : ''}" data-idx="${idx}" title="Clique para selecionar este laudo">
              <div class="popup-queue-info">
                <div class="popup-queue-proto-row">
                  <span class="popup-queue-proto">#${it.protocolo || 'Sem prot.'}</span>
                  <span class="popup-queue-status ${isDone ? 'preenchido' : 'pendente'}">${isDone ? '✓ Preenchido' : 'Pendente'}</span>
                </div>
                <div class="popup-queue-name">${pac}</div>
              </div>
              <button type="button" class="btn-remove-queue-item" data-remove="${idx}" title="Remover da fila">✕</button>
            </div>
          `;
        }).join('');
      }

      queueList.querySelectorAll('.popup-queue-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.btn-remove-queue-item')) return;
          const idx = Number(el.dataset.idx);
          if (currentQueue[idx]) {
            renderCard(currentQueue[idx]);
            renderFila(currentQueue);
          }
        });
      });

      queueList.querySelectorAll('.btn-remove-queue-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number(btn.dataset.remove);
          const item = currentQueue[idx];
          if (item) {
            chrome.runtime.sendMessage({
              action: 'REMOVER_FICHA_FILA',
              protocolo: item.protocolo,
              servidor: item.servidor || item.paciente
            }, () => {
              carregarDoStorage();
              showToast('info', 'Laudo removido da fila.');
            });
          }
        });
      });
    } else {
      sectionQueue.style.display = 'none';
      statusQueueBadge.textContent = '0 na fila';
      if (headerStatusChip) headerStatusChip.classList.remove('has-items');
      if (!currentPayload) {
        cardSemFicha.style.display = 'block';
      }
    }
  }

  queueTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      queueTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.qfilter || 'all';
      renderFila(currentQueue);
    });
  });

  if (queueSearchInput) {
    queueSearchInput.addEventListener('input', () => {
      searchQuery = queueSearchInput.value || '';
      renderFila(currentQueue);
    });
  }

  function carregarDoStorage() {
    chrome.storage.local.get(['ambiental_latest_esisla', 'ambiental_esisla_queue'], (result) => {
      const fila = Array.isArray(result.ambiental_esisla_queue) ? result.ambiental_esisla_queue : [];
      let ativo = result.ambiental_latest_esisla || (fila.length > 0 ? fila[0] : null);
      renderCard(ativo);
      renderFila(fila);
    });
  }

  // Preencher aba ativa
  const defaultHeroHTML = btnPreencherAbaAtiva.innerHTML;
  btnPreencherAbaAtiva.addEventListener('click', () => {
    if (!currentPayload) return;
    btnPreencherAbaAtiva.disabled = true;
    btnPreencherAbaAtiva.textContent = '⏳ Preenchendo...';

    chrome.runtime.sendMessage({
      action: 'PREENCHER_TAB_ATIVA',
      payload: currentPayload
    }, (resp) => {
      if (resp && resp.success) {
        btnPreencherAbaAtiva.textContent = '✅ Preenchido!';
        showToast('success', 'Campos preenchidos na aba do e-SISLA.');
        chrome.runtime.sendMessage({
          action: 'MARCAR_FICHA_PREENCHIDA',
          protocolo: currentPayload.protocolo,
          servidor: currentPayload.servidor || currentPayload.paciente
        }, () => {
          setTimeout(() => {
            carregarDoStorage();
            btnPreencherAbaAtiva.disabled = false;
            btnPreencherAbaAtiva.innerHTML = defaultHeroHTML;
          }, 800);
        });
      } else {
        btnPreencherAbaAtiva.disabled = false;
        btnPreencherAbaAtiva.innerHTML = defaultHeroHTML;
        showToast('error', (resp && resp.error) ? resp.error : 'Abra a aba do laudo no e-SISLA e tente novamente.');
      }
    });
  });

  // Limpar toda a fila com confirmação inline em 2 cliques
  if (btnLimparFila) {
    btnLimparFila.addEventListener('click', () => {
      if (!btnLimparFila.classList.contains('confirming')) {
        btnLimparFila.classList.add('confirming');
        btnLimparFila.textContent = 'Confirmar?';
        if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
        clearConfirmTimer = setTimeout(() => {
          btnLimparFila.classList.remove('confirming');
          btnLimparFila.textContent = 'Limpar fila';
        }, 3000);
        return;
      }
      btnLimparFila.classList.remove('confirming');
      btnLimparFila.textContent = 'Limpar fila';
      chrome.runtime.sendMessage({ action: 'LIMPAR_FILA' }, () => {
        carregarDoStorage();
        showToast('info', 'Fila do dia limpa.');
      });
    });
  }

  // Extrai campos estruturados a partir do texto formatado da Ficha e-Sisla (Portal Médico / Adm)
  function extrairPayloadDeTextoEsisla(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const str = rawText.replace(/\r/g, '');
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

    const protoMatch = str.match(/^(?:Atendimento|Protocolo)\s*[:#]\s*([A-Za-z0-9_\-\.]+)/im);
    const protocolo = protoMatch ? protoMatch[1].trim() : 'ATD_' + Date.now();
    const pacMatch = str.match(/^(?:Nome(?:\s+do\s+(?:Servidor|Periciado))?|Periciado|Paciente)\s*:\s*([^\n\r]+)/im);
    const servidor = sanitizarNomeServidor(pacMatch ? pacMatch[1].trim() : '') || 'Servidor';

    const queixa = extrair(str, ['(*) Queixa e Duração:', '(*)Queixa e Duração:', '(*) Queixa e Duração', 'Queixa e Duração:'], ['Antecedentes Mórbidos:', 'Antecedentes Mórbidos', '(*) Antecedentes']);
    const antecedentes = extrair(str, ['Antecedentes Mórbidos:', 'Antecedentes Mórbidos', '(*) Antecedentes'], ['Atestado/Relatório/Exames Complementares:', 'Atestado/Relatório:', 'Atestado / Relatório', 'Atestado', '(*) Exame Físico', '(*)Exame Físico']);
    const atestado = extrair(str, ['Atestado/Relatório/Exames Complementares:', 'Atestado/Relatório:', 'Atestado / Relatório / Exames Complementares:', 'Atestado / Relatório', 'Atestados:'], ['Pressão Arterial', 'Sistólica', 'Altura:', '(*) Exame Físico Geral', '(*)Exame Físico Geral', 'Exame Físico Geral', '(*) Exame Físico']) || 'Em anexo.';
    const exameFisico = extrair(str, ['(*) Exame Físico Geral:', '(*)Exame Físico Geral:', '(*) Exame Físico Geral', 'Exame Físico Geral:'], ['Descrição das Alterações Clínicas', 'Descrição das Alterações', '(*) Descrição da(s) Limitação', '(*)Descrição da(s) Limitação']);
    const limitacoes = extrair(str, ['(*)Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s):', '(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s):', '(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is):', '(*)Descrição da(s) Limitação', '(*) Descrição da(s) Limitação', 'Descrição da(s) Limitação:'], ['(*) Parecer Médico:', '(*)Parecer Médico:', '(*) Parecer Médico', 'Parecer Médico:']);

    const parecerStr = extrair(str, ['(*) Parecer Médico:', '(*)Parecer Médico:', 'Parecer Médico:'], ['Nº Dias:', 'Nº Dias', 'Dias:', 'Data Início:']);
    const isContrario = /CONTR[ÁA]RIO/i.test(parecerStr) || /PARECER:\s*CONTR[ÁA]RIO/i.test(str);
    const flPfinal = isContrario ? 'C' : 'F';

    let dias = extrair(str, ['Nº Dias:', 'Nº Dias', 'Dias Concedidos:', 'Dias:'], ['Data Início:', 'Data Início', 'CID 10:']);
    dias = dias.replace(/\D/g, '');
    if (flPfinal === 'C') dias = '0';
    else if (!dias || dias === '0') dias = '1';

    let dtIni = extrair(str, ['Data Início:', 'Data Início'], ['CID 10:', 'CID 10', 'CID:', 'Descrição:']);
    dtIni = dtIni.split('\n')[0].trim();

    let cid1 = extrair(str, ['CID 10 Principal:', 'CID 10:', 'CID 10', 'CID:'], ['Descrição:', 'Descrição', 'CID 10 Secundário:']);
    const mCid1 = cid1.match(/[A-Za-z]\d{2}(?:\.\d{1,2})?/);
    cid1 = mCid1 ? mCid1[0].toUpperCase() : '';

    let descrCid1 = extrair(str, ['Descrição:', 'Descrição'], ['CID 10 Secundário:', 'CID 10 Secundário', '(*) Resposta aos Quesitos', '(*) Justificativa']);
    descrCid1 = descrCid1.split('\n')[0].trim();

    let cid2 = extrair(str, ['CID 10 Secundário:', 'CID Secundário:'], ['Descrição Secundária:', '(*) Resposta aos Quesitos', '(*) Justificativa']);
    const mCid2 = cid2.match(/[A-Za-z]\d{2}(?:\.\d{1,2})?/);
    cid2 = mCid2 ? mCid2[0].toUpperCase() : '';

    let descrCid2 = extrair(str, ['Descrição Secundária:'], ['(*) Resposta aos Quesitos', '(*) Justificativa']);
    descrCid2 = descrCid2.split('\n')[0].trim();

    const q1Sim = /1\)\s*H[áa]\s*doen[çc]a[^\n]*\bSIM\b/i.test(str);
    const q2Sim = /2\)\s*A\(s\)\s*doen[çc]a[^\n]*\bSIM\b/i.test(str);
    const q3Sim = /3\)\s*A\(s\)\s*limita[çc][^\n]*\bSIM\b/i.test(str);

    const fl_d_prev = q1Sim ? 'S' : (flPfinal === 'C' ? 'S' : 'S');
    const fl_limit = q2Sim ? 'S' : (flPfinal === 'C' ? 'N' : 'S');
    const fl_imped = q3Sim ? 'S' : (flPfinal === 'C' ? 'N' : 'S');

    const justif = extrair(str, ['(*) Justificativa Parecer Médico:', '(*) Justificativa Parecer Final:', 'Justificativa:']);

    const paSis = (str.match(/Sist[óo]lica(?:\s*\(mmHg\))?[:\s]*(\d+)/i) || [])[1] || '';
    const paDia = (str.match(/Diast[óo]lica(?:\s*\(mmHg\))?[:\s]*(\d+)/i) || [])[1] || '';
    const pulso = (str.match(/Pulso(?:\s*\(bpm\))?[:\s]*(\d+)/i) || [])[1] || '';
    const altRaw = (str.match(/Altura[:\s]*([\d,\.]+)/i) || [])[1] || '';
    const pesoRaw = (str.match(/Peso[:\s]*(\d+)/i) || [])[1] || '';

    const cb = {
      'voMedico.parEdtcspf': /TCSPF|Tecido Celular Subcutâneo/i.test(str),
      'voMedico.parEdAc': /Aparelho Circulatório/i.test(str),
      'voMedico.parEdAr': /Aparelho Respiratório/i.test(str),
      'voMedico.parEdAHp': /Aparelho Hemolinfopoético/i.test(str),
      'voMedico.parEdAd': /Aparelho Digestivo/i.test(str),
      'voMedico.parEdAgu': /Aparelho Geniturinário/i.test(str),
      'voMedico.parEdAoal': /Órgãos dos Sentidos/i.test(str),
      'voMedico.parEdAe': /Aparelho Endócrino/i.test(str),
      'voMedico.parEdSn': /Sistema Nervoso/i.test(str),
      'voMedico.parEdOs': /Osteoarticular/i.test(str),
      'voMedico.parEdEm': /Estado Mental/i.test(str),
      'voMedico.parEdOutro': /Outros/i.test(str)
    };
    if (!Object.values(cb).some(Boolean) && exameFisico) {
      cb['voMedico.parEdOutro'] = true;
    }

    const camposEsisla = {
      'voMedico.parRlCat': queixa,
      'voMedico.parRlAp': antecedentes || 'Nega',
      'voMedico.parRlHda': atestado || 'Em anexo.',
      'voMedico.parRlExApres': exameFisico,
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
      'voMedico.lgAltura': altRaw,
      'voMedico.lgPeso': pesoRaw,
      ...cb
    };

    return {
      protocolo,
      servidor,
      paciente: servidor,
      ...camposEsisla,
      campos_esisla: camposEsisla,
      timestamp: new Date().toISOString()
    };
  }

  // Colar do clipboard (suporta JSON estruturado ou Texto puro da Ficha do Médico/Admin)
  btnColarClipboard.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) { showToast('error', 'A área de transferência está vazia.'); return; }

      let obj = null;
      try {
        obj = JSON.parse(text);
      } catch(_) {
        obj = extrairPayloadDeTextoEsisla(text);
      }

      if (obj && (obj.protocolo || obj.campos_esisla || obj['voMedico.parRlCat'] || obj['voResult.voParecerFinal.flPfinal'])) {
        chrome.runtime.sendMessage({ action: 'ADICIONAR_FICHA_FILA', payload: obj }, () => {
          carregarDoStorage();
          showToast('success', 'Ficha adicionada à fila com sucesso.');
        });
      } else {
        showToast('error', 'O texto copiado não possui o formato de laudo do e-SISLA.');
      }
    } catch(err) {
      showToast('error', 'Não foi possível ler a área de transferência: ' + err.message);
    }
  });

  const liveTabCard = document.getElementById('liveTabCard');
  const liveTabState = document.getElementById('liveTabState');
  const liveTabTitle = document.getElementById('liveTabTitle');
  const btnRefreshTabStatus = document.getElementById('btnRefreshTabStatus');
  const activityLogList = document.getElementById('activityLogList');
  const btnLimparLog = document.getElementById('btnLimparLog');

  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  function formatHora(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  function renderActivityLog(list) {
    if (!activityLogList) return;
    const arr = Array.isArray(list) ? list : [];
    if (arr.length === 0) {
      activityLogList.innerHTML = '<div class="activity-empty">Nenhuma ação registrada ainda nesta sessão.</div>';
      return;
    }
    activityLogList.innerHTML = arr.slice(0, 20).map(ev => {
      const tp = ev.type === 'success' ? 'success' : (ev.type === 'queue' ? 'queue' : 'info');
      const icon = tp === 'success' ? '✓' : (tp === 'queue' ? '+' : '•');
      return `
        <div class="activity-item">
          <span class="activity-badge ${tp}">${icon}</span>
          <div class="activity-content">
            <div class="activity-title">${escHtml(ev.title)}</div>
            ${ev.detail ? `<div class="activity-detail">${escHtml(ev.detail)}</div>` : ''}
          </div>
          <span class="activity-time">${escHtml(formatHora(ev.ts))}</span>
        </div>
      `;
    }).join('');
  }

  function carregarLogAtividades() {
    chrome.storage.local.get(['ambiental_esisla_activity_log'], (res) => {
      renderActivityLog(res.ambiental_esisla_activity_log || []);
    });
  }

  function atualizarStatusAbaAtiva() {
    if (!liveTabCard || !liveTabState || !liveTabTitle) return;
    chrome.runtime.sendMessage({ action: 'OBTER_STATUS_ABA_ESISLA' }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        liveTabCard.className = 'live-tab-card';
        liveTabState.textContent = 'Aba não identificada';
        liveTabTitle.textContent = 'Abra o e-SISLA ou o Portal Ambiental';
        return;
      }
      liveTabCard.className = 'live-tab-card' + (resp.kind === 'esisla' ? ' is-esisla' : (resp.kind === 'ambiental' ? ' is-ambiental' : ''));
      if (resp.kind === 'esisla') {
        if (resp.screen === 'pericia') {
          liveTabState.textContent = 'e-SISLA · Formulário do Laudo pronto';
          if (btnHeroLabel) btnHeroLabel.textContent = 'Preencher Laudo no e-SISLA';
        } else if (resp.screen === 'consulta') {
          liveTabState.textContent = 'e-SISLA · Tela de Consulta';
          if (btnHeroLabel) btnHeroLabel.textContent = 'Buscar e Entrar no e-SISLA';
        } else {
          liveTabState.textContent = 'e-SISLA pronto na aba ativa';
          if (btnHeroLabel) btnHeroLabel.textContent = 'Preencher Aba do e-SISLA';
        }
      } else if (resp.kind === 'ambiental') {
        liveTabState.textContent = 'Portal Ambiental ativo';
        if (btnHeroLabel) btnHeroLabel.textContent = 'Preencher Aba do e-SISLA';
      } else {
        liveTabState.textContent = 'Outra página ativa';
        if (btnHeroLabel) btnHeroLabel.textContent = 'Preencher Aba do e-SISLA';
      }
      liveTabTitle.textContent = resp.title || resp.url || '';
      liveTabTitle.title = resp.url || resp.title || '';
    });
  }

  if (btnRefreshTabStatus) {
    btnRefreshTabStatus.addEventListener('click', () => {
      atualizarStatusAbaAtiva();
      carregarDoStorage();
      carregarLogAtividades();
      showToast('info', 'Status sincronizado com a aba atual.');
    });
  }

  if (btnLimparLog) {
    btnLimparLog.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'LIMPAR_HISTORICO_LOG' }, () => {
        renderActivityLog([]);
      });
    });
  }

  // Atualização em tempo real no Side Panel quando fila, ficha ou log mudarem
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.ambiental_esisla_queue || changes.ambiental_latest_esisla) {
        carregarDoStorage();
      }
      if (changes.ambiental_esisla_activity_log) {
        renderActivityLog(changes.ambiental_esisla_activity_log.newValue || []);
      }
    });
  }

  // Atualiza automaticamente ao trocar de aba ou navegar no navegador
  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(() => atualizarStatusAbaAtiva());
  }
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((_, changeInfo) => {
      if (changeInfo.status === 'complete' || changeInfo.title) {
        atualizarStatusAbaAtiva();
      }
    });
  }

  carregarDoStorage();
  carregarLogAtividades();
  atualizarStatusAbaAtiva();
});

